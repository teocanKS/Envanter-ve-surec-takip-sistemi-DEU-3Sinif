(() => {
  const { $, renderStats, renderReorder, renderHistory, renderPlanned, renderJobs, applyHistorySort, getJSON, postJSON, exportTableToCSV, wireDialogCancel, Calendar } = window.PanelShared;
  const notifyBtn = document.getElementById('btn-pending-notify');
  const notifyBadge = document.getElementById('pending-notify-count');
  const toastRegion = document.getElementById('toastRegion');
  let lastPendingToastTs = 0;
  function enforceAccess(){
    const user = window.MockAuth?.enforceAccess({ allow: ['manager', 'admin'] });
    if (user) window.MockAuth.applyRoleUI(user);
  }
  function wireLogoutButton(){
    const btn = document.getElementById('btn-logout');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      window.MockAuth?.clearSession();
      location.href = '../index.html';
    });
  }
  function renderAlertsTable(rows, pendingRows){
    const tb = document.getElementById('alertsTable');
    if (!tb) return;
    const data = [];
    if (Array.isArray(pendingRows) && pendingRows.length) data.push(...pendingRows);
    if (rows && rows.length) data.push(...rows);
    if (!data.length){
      tb.innerHTML = `<tr><td colspan="5" class="muted">Uyarı bulunmuyor.</td></tr>`;
      return;
    }
    const fmt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
    tb.innerHTML = data.map(r => {
      if (r.pending) {
        const latestLabel = r.createdAt ? fmt.format(new Date(r.createdAt)) : '-';
        const who = r.fullname || r.email || 'Yeni kullanıcı';
        return `\n        <tr class="alerts-row--pending" data-goto-users="1">\n          <td>Kullanıcı Başvurusu</td>\n          <td>${who}</td>\n          <td>−</td>\n          <td>${latestLabel}</td>\n          <td class="level level-pending">Yeni Başvuru</td>\n        </tr>`;
      }
      const lvlMatch = String(r.level || '').match(/^(\d+)/);
      const lvlKey = lvlMatch ? lvlMatch[1] : '';
      const lvlClass = lvlKey ? `level level-${lvlKey}` : 'level';
      return `
      <tr>
        <td>${r.company || '-'}</td>
        <td>${r.product || '-'}</td>
        <td>${r.days}</td>
        <td>${r.last || '-'}</td>
        <td class="${lvlClass}">${r.level}</td>
      </tr>`;
    }).join('');
  }
  function daysBetween(value){
    const ms = Date.now() - new Date(String(value).replace(' ', 'T')).getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  }
  function parseCompanyProduct(text){
    if (!text) return { company: '', product: '' };
    const t = String(text).trim();
    const mC = t.match(/(?:Şirket|Firma|Company)\s*:\s*([^\-|•|\|]+)/i);
    const mP = t.match(/(?:Ürün|Product)\s*:\s*([^\-|•|\|]+)/i);
    if (mC || mP) return { company: (mC?.[1] || '').trim(), product: (mP?.[1] || '').trim() };
    const parts = t.split(/\s*[•\-|—]\s*/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) return { company: parts[0], product: parts[1] };
    return { company: parts[0] || t, product: '' };
  }
  function levelFromDays(d){
    if (d >= 150) return '150+ gün';
    if (d >= 120) return '120+ gün';
    if (d >= 90)  return '90+ gün';
    if (d >= 60)  return '60+ gün';
    if (d >= 30)  return '30+ gün';
    return '';
  }
  function buildAlertsFromHistory(history){
    if (!Array.isArray(history)) return [];
    const lastMap = new Map();
    for (const item of history){
      const { company, product } = parseCompanyProduct(item.text);
      const key = `${company || '?' }|${product || '?'}`;
      const last = item.t;
      const lastTs = new Date(String(last).replace(' ','T')).getTime();
      const stored = lastMap.get(key);
      const storedTs = stored ? new Date(String(stored.last).replace(' ','T')).getTime() : 0;
      if (!stored || lastTs > storedTs) lastMap.set(key, { company, product, last });
    }
    const rows = [];
    for (const value of lastMap.values()){
      const d = daysBetween(value.last);
      const lvl = levelFromDays(d);
      if (!lvl) continue;
      rows.push({ company: value.company, product: value.product, days: d, last: value.last, level: lvl });
    }
    rows.sort((a,b)=> b.days - a.days);
    return rows;
  }
  function pendingFreshInfo(){
    const pending = getPending();
    const ackTs = getPendingAck();
    let latestAny = 0;
    let latestFresh = 0;
    const fresh = [];
    for (const item of pending){
      const ts = Date.parse(item.createdAt || '') || 0;
      if (ts > latestAny) latestAny = ts;
      if (!ackTs || ts > ackTs){
        fresh.push({ ...item, _ts: ts });
        if (ts > latestFresh) latestFresh = ts;
      }
    }
    fresh.sort((a, b) => (b._ts || 0) - (a._ts || 0));
    return { pending, fresh, latestAny, latestFresh, ackTs };
  }
  function buildPendingAlerts(info){
    const data = info || pendingFreshInfo();
    if (!data.fresh.length) return [];
    return data.fresh.map(item => ({
      pending: true,
      fullname: item.fullname,
      email: item.email,
      createdAt: item.createdAt,
    }));
  }
  function updatePendingNotice(info){
    const data = info || pendingFreshInfo();
    const count = data.fresh.length;
    if (notifyBadge){
      if (count > 0){
        notifyBadge.textContent = String(count);
        notifyBadge.hidden = false;
      } else {
        notifyBadge.textContent = '0';
        notifyBadge.hidden = true;
      }
    }
    if (notifyBtn){
      const label = count > 0 ? `Bekleyen başvurular (${count})` : 'Bekleyen başvuru yok';
      notifyBtn.classList.toggle('icon-btn--attention', count > 0);
      notifyBtn.setAttribute('aria-label', label);
      notifyBtn.title = label;
    }
    return data;
  }
  function showToast({ title, message, actionLabel, onAction, timeout = 6000 }){
    if (!toastRegion) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    if (title){
      const h = document.createElement('p');
      h.className = 'toast__title';
      h.textContent = title;
      toast.appendChild(h);
    }
    if (message){
      const body = document.createElement('p');
      body.className = 'toast__body';
      body.textContent = message;
      toast.appendChild(body);
    }
    if (actionLabel){
      const actions = document.createElement('div');
      actions.className = 'toast__actions';
      const btn = document.createElement('button');
      btn.className = 'toast__btn';
      btn.type = 'button';
      btn.textContent = actionLabel;
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onAction?.();
        removeToast();
      });
      actions.appendChild(btn);
      toast.appendChild(actions);
    }
    let auto;
    function removeToast(){
      if (auto){
        clearTimeout(auto);
        auto = null;
      }
      if (toast.parentElement){
        toast.parentElement.removeChild(toast);
      }
    }
    auto = setTimeout(removeToast, timeout);
    toast.addEventListener('click', (ev) => {
      if (ev.target.closest('.toast__btn')) return;
      clearTimeout(auto);
      removeToast();
    });
    toastRegion.appendChild(toast);
  }
  function maybeShowPendingToast(info){
    if (!toastRegion) return;
    const data = info || pendingFreshInfo();
    if (!data.fresh.length) return;
    const usersTab = document.getElementById('tab-users');
    if (usersTab?.checked) return;
    const latestFresh = data.latestFresh || 0;
    if (latestFresh <= lastPendingToastTs) return;
    const newest = data.fresh[0] || {};
    const who = newest.fullname || newest.email || 'Yeni kullanıcı';
    const count = data.fresh.length;
    const message = count > 1 ? `${count} yeni başvuru var.` : `${who} başvuru gönderdi.`;
    showToast({
      title: 'Yeni Başvuru',
      message,
      actionLabel: 'Görüntüle',
      onAction: () => switchToUsersTab()
    });
    lastPendingToastTs = latestFresh;
  }
  async function refreshAlerts(){
    let rows = [];
    const info = pendingFreshInfo();
    try {
      rows = buildAlertsFromHistory(await getJSON('/api/history'));
    } catch (e) {
      console.warn('alerts', e);
    }
    renderAlertsTable(rows, buildPendingAlerts(info));
    updatePendingNotice(info);
    maybeShowPendingToast(info);
  }
  function markPendingSeen(){
    const info = pendingFreshInfo();
    const latest = info.latestAny || Date.now();
    setPendingAck(latest);
    lastPendingToastTs = latest;
    updatePendingNotice();
    refreshAlerts();
  }
  async function refreshAll(){
    try { renderStats(await getJSON('/api/stats')); } catch (e) { console.warn('stats', e); }
    try { renderReorder(await getJSON('/api/reorder')); } catch (e) { console.warn('reorder', e); }
    try { renderHistory(await getJSON('/api/history')); } catch (e) { console.warn('history', e); }
    try {
      const planned = await getJSON('/api/planned');
      renderPlanned(planned);
      Calendar.setSource('planned', Calendar.eventsFromPlanned(planned));
    } catch (e) {
      Calendar.setSource('planned', []);
      console.warn('planned', e);
    }
    try {
      const jobs = await getJSON('/api/jobs');
      renderJobs(jobs);
      Calendar.setSource('jobs', Calendar.eventsFromJobs(jobs));
    } catch (e) {
      Calendar.setSource('jobs', []);
      console.warn('jobs', e);
    }
  }
  function exportReorderCSV(){
    if (!window.MockAuth?.isAdmin()) {
      alert('Bu işlem yalnızca ADMIN için izinli.');
      return;
    }
    if (!exportTableToCSV({ rowSelector: '#reorderTable tr', header: 'SKU,Ürün,Elde,Asgari,Tedarikçi,Durum', filename: 'reorder.csv', skipEmpty: true })) {
      alert('Dışa aktarılacak satır bulunamadı.');
    }
  }
  const dlgAdd = $('#dlg-add-sku');
  const dlgPlan = $('#dlg-new-plan');
  const formAdd = $('#form-add-sku');
  formAdd?.addEventListener('submit', async (e) => {
    const submitter = e.submitter || document.activeElement;
    if (submitter?.dataset?.cancel) return;
    e.preventDefault();
    const fd = new FormData(formAdd);
    const payload = {
      sku_id: fd.get('sku_id')?.toString().trim(),
      name: fd.get('name')?.toString().trim(),
      min_qty: Number(fd.get('min_qty') || 0),
      supplier: fd.get('supplier')?.toString().trim() || null,
      initial_qty: fd.get('initial_qty') ? Number(fd.get('initial_qty')) : 0
    };
    try {
      await postJSON('/api/skus', payload);
      dlgAdd?.close();
      await refreshAll();
    } catch (err) {
      alert('Hata: ' + err.message);
    }
  });
  const formPlan = $('#form-new-plan');
  formPlan?.addEventListener('submit', async (e) => {
    const submitter = e.submitter || document.activeElement;
    if (submitter?.dataset?.cancel) return;
    e.preventDefault();
    const fd = new FormData(formPlan);
    const payload = {
      title: fd.get('title')?.toString().trim(),
      bucket: fd.get('bucket'),
      date: fd.get('date')?.toString()
    };
    if (!payload.date){
      alert('Lütfen plan için tarih seçin.');
      return;
    }
    try {
      await postJSON('/api/planned', payload);
      dlgPlan?.close();
      await refreshAll();
    } catch (err) {
      alert('Hata: ' + err.message);
    }
  });
  function lsGet(key, def){
    try{ const v = JSON.parse(localStorage.getItem(key)||'null'); return (v==null?def:v); }catch{ return def; }
  }
  function lsSet(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch{} }
  function getPending(){ const v = lsGet('pending_users', []); return Array.isArray(v)? v : []; }
  function setPending(arr){ lsSet('pending_users', Array.isArray(arr)?arr:[]); }
  function getUsersLS(){ const v = lsGet('users', []); return Array.isArray(v)? v : []; }
  function setUsersLS(arr){ lsSet('users', Array.isArray(arr)?arr:[]); }
  function getPendingAck(){ return Number(localStorage.getItem('pending_users_ack') || 0); }
  function setPendingAck(ts){ try{ localStorage.setItem('pending_users_ack', String(ts)); }catch{} }
  lastPendingToastTs = getPendingAck();
  function renderPendingTable(){
    const tb = document.getElementById('pendingTable'); if(!tb) return;
    const rows = getPending();
    tb.innerHTML = rows.length ? rows.map(r=>`
      <tr>
        <td>${r.fullname||'-'}</td>
        <td>${r.email||'-'}</td>
        <td>${r.phone||'-'}</td>
        <td>${(r.createdAt||'').replace('T',' ').replace('Z','')}</td>
        <td class="text-right">
          <button class="btn" data-approve="${r.email}">Onayla</button>
          <button class="btn btn--ghost" data-reject="${r.email}">Reddet</button>
        </td>
      </tr>`).join('') : `<tr><td colspan="5" class="muted">Bekleyen başvuru yok.</td></tr>`;
  }
  function renderUsersTable(){
    const tb = document.getElementById('usersTable'); if(!tb) return;
    const users = getUsersLS();
    tb.innerHTML = users.length ? users.map(u=>`
      <tr>
        <td>${u.email}</td>
        <td>${u.role||'viewer'}</td>
        <td class="text-right">
          <button class="btn btn--ghost" data-remove="${u.email}">Sil/Çıkar</button>
        </td>
      </tr>`).join('') : `<tr><td colspan="3" class="muted">Kayıtlı kullanıcı yok.</td></tr>`;
  }
  function refreshUsersUI(){
    renderPendingTable();
    renderUsersTable();
    const usersTab = document.getElementById('tab-users');
    if (usersTab?.checked) {
      markPendingSeen();
    } else {
      updatePendingNotice();
    }
  }
  function switchToUsersTab(){
    const usersTab = document.getElementById('tab-users');
    if (!usersTab) return;
    const wasChecked = usersTab.checked;
    usersTab.checked = true;
    if (!wasChecked) {
      usersTab.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      refreshUsersUI();
    }
  }
  document.addEventListener('click', (e)=>{
    const t = e.target; if (!(t instanceof HTMLElement)) return;
    const emailApprove = t.getAttribute('data-approve');
    const emailReject  = t.getAttribute('data-reject');
    const emailRemove  = t.getAttribute('data-remove');
    if (emailApprove){
      const pending = getPending();
      const idx = pending.findIndex(x=> (x.email||'').toLowerCase() === emailApprove.toLowerCase());
      if (idx>=0){
        const p = pending[idx]; pending.splice(idx,1); setPending(pending);
        const users = getUsersLS();
        if (!users.some(u=> (u.email||'').toLowerCase() === (p.email||'').toLowerCase())){
          users.push({ email:p.email, password:p.password, role:'viewer' });
          setUsersLS(users);
        }
        refreshUsersUI();
        alert('Kullanıcı onaylandı.');
      }
    }
    if (emailReject){
      const left = getPending().filter(x=> (x.email||'').toLowerCase() !== emailReject.toLowerCase());
      setPending(left); refreshUsersUI(); alert('Başvuru reddedildi.');
    }
    if (emailRemove){
      const left = getUsersLS().filter(x=> (x.email||'').toLowerCase() !== emailRemove.toLowerCase());
      setUsersLS(left); refreshUsersUI(); alert('Kullanıcı silindi.');
    }
  });
  document.getElementById('btn-refresh-users')?.addEventListener('click', refreshUsersUI);
  document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-export') exportReorderCSV();
    if (e.target.id === 'btn-add-sku' && dlgAdd?.showModal) dlgAdd.showModal();
    if (e.target.id === 'btn-new-plan' && dlgPlan?.showModal) dlgPlan.showModal();
  });
  const btnFilter = $('#btn-history-filter');
  const bar = $('#historyFilterBar');
  btnFilter?.addEventListener('click', () => {
    if (!bar) return;
    bar.toggleAttribute('hidden');
  });
  $('#btn-history-clear')?.addEventListener('click', async () => {
    document.getElementById('historyFilterForm').reset();
    const base = await getJSON('/api/history');
    renderHistory(applyHistorySort(base, new FormData(document.getElementById('historyFilterForm'))));
  });
  $('#historyFilterForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const [k, v] of fd.entries()) { if (v) params.append(k, v); }
    try {
      const url = '/api/history/search?' + params.toString();
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        renderHistory(applyHistorySort(data, fd));
      } else {
        const base = await getJSON('/api/history');
        const company = (fd.get('company') || '').toString().toLowerCase();
        const item = (fd.get('item') || '').toString().toLowerCase();
        const from = fd.get('from') ? new Date(fd.get('from') + 'T00:00:00') : null;
        const to = fd.get('to') ? new Date(fd.get('to') + 'T23:59:59') : null;
        const filtered = base.filter(x => {
          const text = (x.text || '').toLowerCase();
          const okCompany = !company || text.includes(company);
          const okItem = !item || text.includes(item);
          const t = new Date(x.t.replace(' ', 'T'));
          const okFrom = !from || t >= from;
          const okTo = !to || t <= to;
          return okCompany && okItem && okFrom && okTo;
        });
        renderHistory(applyHistorySort(filtered, fd));
      }
    } catch (err) { alert('Hata: ' + err.message); }
  });
  document.getElementById('alertsTable')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-goto-users]');
    if (!row) return;
    switchToUsersTab();
  });
  notifyBtn?.addEventListener('click', () => {
    switchToUsersTab();
  });
  document.querySelectorAll('input[name="tab"]').forEach(input => {
    input.addEventListener('change', () => {
      if (input.id === 'tab-users' && input.checked) refreshUsersUI();
    });
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== 'pending_users') return;
    const usersTabChecked = document.getElementById('tab-users')?.checked;
    refreshUsersUI();
    if (!usersTabChecked) {
      refreshAlerts();
    }
  });
  window.addEventListener('load', async () => {
    enforceAccess();
    wireLogoutButton();
    wireDialogCancel();
    Calendar.initAll();
    await refreshAll();
    refreshUsersUI();
    await refreshAlerts();
  });
})();

(() => {
  const { $, renderStats, renderReorder, renderHistory, renderPlanned, renderJobs, applyHistorySort, getJSON, postJSON, exportTableToCSV, wireDialogCancel } = window.PanelShared;
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
  function renderAlertsTable(rows, pendingRow){
    const tb = document.getElementById('alertsTable');
    if (!tb) return;
    const data = [];
    if (pendingRow) data.push(pendingRow);
    if (rows && rows.length) data.push(...rows);
    if (!data.length){
      tb.innerHTML = `<tr><td colspan="5" class="muted">Uyarı bulunmuyor.</td></tr>`;
      return;
    }
    const fmt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
    tb.innerHTML = data.map(r => {
      if (r.pending) {
        const latestLabel = r.latest ? fmt.format(new Date(r.latest)) : '-';
        const countLabel = r.count > 1 ? `${r.count} bekleyen başvuru` : '1 bekleyen başvuru';
        return `\n        <tr class="alerts-row--pending" data-goto-users="1">\n          <td>Yeni Başvuru</td>\n          <td>${countLabel}</td>\n          <td>−</td>\n          <td>${latestLabel}</td>\n          <td class="level level-pending">Onay Bekliyor</td>\n        </tr>`;
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
  function computePendingRow(){
    const pending = getPending();
    if (!pending.length) return null;
    const ackTs = getPendingAck();
    const fresh = pending.filter(p => {
      const ts = Date.parse(p.createdAt || '') || 0;
      return !ackTs || ts > ackTs;
    });
    if (!fresh.length) return null;
    const latest = fresh.reduce((max, item) => {
      const ts = Date.parse(item.createdAt || '') || 0;
      return ts > max ? ts : max;
    }, 0);
    return { pending: true, count: fresh.length, latest };
  }
  async function refreshAlerts(){
    let rows = [];
    try {
      rows = buildAlertsFromHistory(await getJSON('/api/history'));
    } catch (e) {
      console.warn('alerts', e);
    }
    renderAlertsTable(rows, computePendingRow());
  }
  function markPendingSeen(){
    const pending = getPending();
    const latest = pending.reduce((max, item) => {
      const ts = Date.parse(item.createdAt || '') || 0;
      return ts > max ? ts : max;
    }, 0);
    setPendingAck(latest || Date.now());
    refreshAlerts();
  }
  async function refreshAll(){
    try { renderStats(await getJSON('/api/stats')); } catch (e) { console.warn('stats', e); }
    try { renderReorder(await getJSON('/api/reorder')); } catch (e) { console.warn('reorder', e); }
    try { renderHistory(await getJSON('/api/history')); } catch (e) { console.warn('history', e); }
    try { renderPlanned(await getJSON('/api/planned')); } catch (e) { console.warn('planned', e); }
    try { renderJobs(await getJSON('/api/jobs')); } catch (e) { console.warn('jobs', e); }
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
    const payload = { title: fd.get('title')?.toString().trim(), bucket: fd.get('bucket') };
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
    if (document.getElementById('tab-users')?.checked) markPendingSeen();
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
    const usersTab = document.getElementById('tab-users');
    if (!usersTab) return;
    usersTab.checked = true;
    usersTab.dispatchEvent(new Event('change', { bubbles: true }));
  });
  document.querySelectorAll('input[name="tab"]').forEach(input => {
    input.addEventListener('change', () => {
      if (input.id === 'tab-users' && input.checked) refreshUsersUI();
    });
  });
  window.addEventListener('load', async () => {
    enforceAccess();
    wireLogoutButton();
    wireDialogCancel();
    await refreshAll();
    refreshUsersUI();
    await refreshAlerts();
  });
})();

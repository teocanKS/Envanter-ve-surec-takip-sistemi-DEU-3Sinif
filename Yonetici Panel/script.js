// public/script.js
(() => {
  const $ = (s, ctx = document) => ctx.querySelector(s);

  // ---- Render helpers -------------------------------------------------------
  function renderStats(stats) {
    const cards = document.querySelectorAll('#view-stok .cards .card .card__value');
    if (cards[0]) cards[0].textContent = stats.total_skus ?? '-';
    if (cards[1]) cards[1].textContent = stats.in_stock_pct != null ? '%' + stats.in_stock_pct : '-';
    if (cards[2]) cards[2].textContent = stats.critical ?? '-';
    if (cards[3]) cards[3].textContent = stats.open_pos ?? '-';
  }

  function renderReorder(rows) {
    const tbody = $('#reorderTable');
    if (!tbody) return;
    tbody.innerHTML = (rows || []).map(r => `
      <tr>
        <td>${r.sku_id || r.sku}</td>
        <td>${r.item || r.name}</td>
        <td>${r.on_hand ?? ''}</td>
        <td>${r.min_qty ?? ''}</td>
        <td>${r.supplier ?? ''}</td>
        <td>
          <span class="badge ${r.status === 'Kritik' ? 'badge--warn' : (r.status === 'Uygun' ? 'badge--ok' : '')}">${r.status ?? ''}</span>
        </td>
      </tr>`).join('');
  }

  function renderHistory(items) {
    const ul = $('#historyList');
    if (!ul) return;
    ul.innerHTML = (items || []).map(i => `
      <li>
        <span class="dot" aria-hidden="true"></span>
        <div>
          <div>${i.text}</div>
          <div class="meta">${i.t}</div>
        </div>
      </li>`).join('');
  }

  // ---- Alerts (Bildirimler) -------------------------------------------------
  function renderAlerts(rows){
    const tb = document.getElementById('alertsTable');
    if (!tb) return;
    tb.innerHTML = (rows && rows.length) ? rows.map(r => {
      const lvlKey = (r.level && String(r.level).startsWith('150'))
        ? '150'
        : (String(r.level).match(/^(\d+)/)?.[1] || '');
      return `
      <tr>
        <td>${r.company || '-'}</td>
        <td>${r.product || '-'}</td>
        <td>${r.days}</td>
        <td>${r.last || '-'}</td>
        <td class="level ${lvlKey ? 'level-' + lvlKey : ''}">
          <span class="level ${lvlKey ? 'level-' + lvlKey : ''}">${r.level}</span>
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="5" class="muted">Uyarı bulunmuyor.</td></tr>`;
  }

  function daysBetween(d){
    const ms = Date.now() - new Date(String(d).replace(' ', 'T')).getTime();
    return Math.max(0, Math.floor(ms / (1000*60*60*24)));
  }

  function parseCompanyProduct(text){
    if (!text) return { company: '', product: '' };
    const t = String(text).trim();
    // 1) Etiketli desenler ("Şirket: X", "Ürün: Y")
    const mC = t.match(/(?:Şirket|Firma|Company)\s*:\s*([^\-|•|\|]+)/i);
    const mP = t.match(/(?:Ürün|Product)\s*:\s*([^\-|•|\|]+)/i);
    if (mC || mP){
      return { company: (mC?.[1]||'').trim(), product: (mP?.[1]||'').trim() };
    }
    // 2) Ayraçlı kısa format: "Firma • Ürün • ..." veya "Firma - Ürün - ..."
    const parts = t.split(/\s*[•\-|—]\s*/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2){
      return { company: parts[0], product: parts[1] };
    }
    // 3) Fallback: ilk kelime(ler) firmaya yaz, ürün boş kalsın
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
    // Son alışverişe göre şirket/ürün kırılımı
    const lastMap = new Map(); // key: company||'?' + '|' + product||'?', val: {last, company, product}
    for (const item of history){
      const { company, product } = parseCompanyProduct(item.text);
      const key = `${company || '?'}|${product || '?'}`;
      const last = item.t;
      if (!lastMap.has(key) || new Date(String(last).replace(' ','T')) > new Date(String(lastMap.get(key).last).replace(' ','T'))){
        lastMap.set(key, { company, product, last });
      }
    }
    const rows = [];
    for (const v of lastMap.values()){
      const d = daysBetween(v.last);
      const lvl = levelFromDays(d);
      if (!lvl) continue; // 30 gün altını bildirim yapma
      rows.push({ company: v.company, product: v.product, days: d, last: v.last, level: lvl });
    }
    // En kritik üstte görünsün
    rows.sort((a,b)=> b.days - a.days);
    return rows;
  }

  async function refreshAlerts(){
    try{
      const hist = await getJSON('/api/history');
      renderAlerts(buildAlertsFromHistory(hist));
    }catch(e){ console.warn('alerts', e); }
  }

  // Geçmiş listesine sıralama uygula (form değerlerine göre)
  function applyHistorySort(list, fd){
    const by  = (fd.get('sort_by')  || 'date').toString();
    const dir = (fd.get('sort_dir') || 'desc').toString();
    const sign = dir === 'asc' ? 1 : -1;

    const parseDate = (s) => {
      if (!s) return 0;
      const d = new Date(String(s).replace(' ', 'T'));
      return d.getTime() || 0;
    };
    const parsePrice = (txt) => {
      if (!txt) return 0;
      const m = String(txt).match(/([0-9]{1,3}(?:[\.\s][0-9]{3})*(?:,[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/);
      if (!m) return 0;
      let n = m[1].replace(/\s/g,'');
      if (/,/.test(n) && /\./.test(n)) {
        n = n.replace(/\./g, '').replace(',', '.');
      } else if (/,/.test(n) && !/\./.test(n)) {
        n = n.replace(',', '.');
      } else {
        n = n.replace(/\./g, '');
      }
      const v = parseFloat(n);
      return isNaN(v) ? 0 : v;
    };

    const getProductKey = (txt) => String(txt||'').toLocaleLowerCase('tr-TR');

    const arr = Array.isArray(list) ? list.slice() : [];
    arr.sort((a,b)=>{
      if (by === 'date')  return (parseDate(a.t)   - parseDate(b.t))   * sign;
      if (by === 'price') return (parsePrice(a.text) - parsePrice(b.text)) * sign;
      if (by === 'product'){
        const aa = getProductKey(a.text), bb = getProductKey(b.text);
        return (aa < bb ? -1 : aa > bb ? 1 : 0) * sign;
      }
      return 0;
    });
    return arr;
  }

  function renderPlanned(grouped) {
    const map = { soon: '[data-col="soon"]', month: '[data-col="month"]', backlog: '[data-col="backlog"]' };
    Object.keys(map).forEach(k => {
      const ul = document.querySelector('#view-planlanan ' + map[k]);
      if (ul) ul.innerHTML = (grouped?.[k] || []).map(t => `<li class="kanban__item">${t}</li>`).join('');
    });
  }

  function renderJobs(items) {
    const grid = $('#jobsGrid');
    if (!grid) return;
    grid.innerHTML = (items || []).map(j => `
      <article class="job">
        <header class="job__head">
          <strong>${j.id}</strong>
          <span class="badge ${j.status === 'Riskli' ? 'badge--warn' : 'badge--ok'}">${j.status}</span>
        </header>
        <div class="job__title">${j.title}</div>
        <div class="job__meta"><span>Sorumlu: ${j.owner ?? '-'}</span><span>ETA: ${j.eta ?? '-'}</span></div>
      </article>`).join('');
  }

  // ---- Fetch helpers --------------------------------------------------------
  async function getJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
  async function postJSON(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return r.json().catch(() => ({}));
  }

  async function refreshAll() {
    try { renderStats(await getJSON('/api/stats')); } catch (e) { console.warn('stats', e); }
    try { renderReorder(await getJSON('/api/reorder')); } catch (e) { console.warn('reorder', e); }
    try { renderHistory(await getJSON('/api/history')); } catch (e) { console.warn('history', e); }
    try { renderPlanned(await getJSON('/api/planned')); } catch (e) { console.warn('planned', e); }
    try { renderJobs(await getJSON('/api/jobs')); } catch (e) { console.warn('jobs', e); }
  }

  // ---- CSV export -----------------------------------------------------------
  function exportReorderCSV() {
    // Yalnızca ADMIN
    if (!window.MockAuth?.isAdmin()) {
      alert('Bu işlem yalnızca ADMIN için izinli.');
      return;
    }
    const rows = Array.from(document.querySelectorAll('#reorderTable tr')).map(tr =>
      Array.from(tr.children).map(td => '"' + (td.textContent || '').replaceAll('"', '""') + '"').join(',')
    );
    if (!rows.length) {
      alert('Dışa aktarılacak satır bulunamadı.');
      return;
    }
    const csv = ['SKU,Ürün,Elde,Asgari,Tedarikçi,Durum'].concat(rows).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'reorder.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---- Dialogs --------------------------------------------------------------
  const dlgAdd = $('#dlg-add-sku');
  const dlgPlan = $('#dlg-new-plan');

  // Cancel buttons: her zaman kapat (validasyon yok)
  function wireCancelButtons() {
    document.querySelectorAll('dialog [data-cancel]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const d = btn.closest('dialog');
        if (d?.open) d.close();
      });
    });
  }

  // Ürün ekle formu
  const formAdd = $('#form-add-sku');
  formAdd?.addEventListener('submit', async (e) => {
    const submitter = e.submitter || document.activeElement;
    if (submitter?.dataset?.cancel) return; // vazgeç -> doğal kapanış
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

  // Yeni Plan formu
  const formPlan = $('#form-new-plan');
  formPlan?.addEventListener('submit', async (e) => {
    const submitter = e.submitter || document.activeElement;
    if (submitter?.dataset?.cancel) return; // vazgeç -> doğal kapanış
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

  // ================= Kullanıcı Onayları & Arama ============================
  function lsGet(key, def){
    try{ const v = JSON.parse(localStorage.getItem(key)||'null'); return (v==null?def:v); }catch{ return def; }
  }
  function lsSet(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch{}
  }
  function getPending(){ const v = lsGet('pending_users', []); return Array.isArray(v)? v : []; }
  function setPending(arr){ lsSet('pending_users', Array.isArray(arr)?arr:[]); }
  function getUsersLS(){ const v = lsGet('users', []); return Array.isArray(v)? v : []; }
  function setUsersLS(arr){ lsSet('users', Array.isArray(arr)?arr:[]); }

  function renderPendingTable(){
    const tb = document.getElementById('pendingTable'); if(!tb) return;
    const rows = getPending();
    tb.innerHTML = rows.length ? rows.map(r=>`
      <tr>
        <td>${r.fullname||'-'}</td>
        <td>${r.email||'-'}</td>
        <td>${r.phone||'-'}</td>
        <td>${(r.createdAt||'').replace('T',' ').replace('Z','')}</td>
        <td style="text-align:right">
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
        <td style="text-align:right">
          <button class="btn btn--ghost" data-remove="${u.email}">Sil/Çıkar</button>
        </td>
      </tr>`).join('') : `<tr><td colspan="3" class="muted">Kayıtlı kullanıcı yok.</td></tr>`;
  }

  function refreshUsersUI(){
    renderPendingTable();
    renderUsersTable();
  }

  // Delegated actions: approve / reject / remove
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

  // ---- Buttons --------------------------------------------------------------
  document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-export') exportReorderCSV();
    if (e.target.id === 'btn-add-sku' && dlgAdd?.showModal) dlgAdd.showModal();
    if (e.target.id === 'btn-new-plan' && dlgPlan?.showModal) dlgPlan.showModal();
  });

  // Geçmiş filtreleri
  const btnFilter = $('#btn-history-filter');
  const bar = $('#historyFilterBar');
  btnFilter?.addEventListener('click', () => {
    if (!bar) return;
    bar.style.display = (bar.style.display === 'none' || !bar.style.display) ? 'block' : 'none';
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

  // İlk yükleme
  window.addEventListener('load', async () => {
    wireCancelButtons();
    await refreshAll();
    refreshUsersUI();
    refreshAlerts();
  });
})();
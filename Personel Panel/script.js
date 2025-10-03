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

  // Geçmiş listesine sıralama uygula (form değerlerine göre)
  function applyHistorySort(list, fd){
    const by  = (fd.get('sort_by')  || 'date').toString();
    const dir = (fd.get('sort_dir') || 'desc').toString();
    const sign = dir === 'asc' ? 1 : -1;

    const parseDate = (s) => {
      // "YYYY-MM-DD HH:MM" veya benzeri -> Date
      if (!s) return 0;
      const d = new Date(String(s).replace(' ', 'T'));
      return d.getTime() || 0;
    };
    const parsePrice = (txt) => {
      // metin içinden ilk sayıyı yakalamaya çalış (örn: 12.500,00 veya 12500.50)
      if (!txt) return 0;
      const m = String(txt).match(/([0-9]{1,3}(?:[\.\s][0-9]{3})*(?:,[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/);
      if (!m) return 0;
      let n = m[1].replace(/\s/g,'');
      // TR formatını normalize et: binlik . veya boşluk; ondalık ,
      if (/,/.test(n) && /\./.test(n)) {
        // örn 12.500,75 -> 12500.75
        n = n.replace(/\./g, '').replace(',', '.');
      } else if (/,/.test(n) && !/\./.test(n)) {
        // örn 12500,75 -> 12500.75
        n = n.replace(',', '.');
      } else {
        // sadece binlik nokta varsa kaldır: 12.500 -> 12500
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
    const rows = Array.from(document.querySelectorAll('#reorderTable tr')).map(tr =>
      Array.from(tr.children).map(td => '"' + (td.textContent || '').replaceAll('"', '""') + '"').join(',')
    );
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
  });
})();
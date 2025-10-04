(() => {
  const { $, renderStats, renderReorder, renderHistory, applyHistorySort, renderPlanned, renderJobs, getJSON, postJSON, exportTableToCSV, wireDialogCancel, Calendar } = window.PanelShared;
  function enforceAccess() {
    const user = window.MockAuth?.enforceAccess({ allow: ['viewer', 'manager', 'admin'] });
    if (user) window.MockAuth.applyRoleUI(user);
  }
  function wireLogoutButton() {
    const btn = document.getElementById('btn-logout');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      if (window.MockAuth) window.MockAuth.clearSession();
      location.href = '../index.html';
    });
  }
  async function refreshAll() {
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
  function exportReorderCSV() {
    exportTableToCSV({ rowSelector: '#reorderTable tr', header: 'SKU,Ürün,Elde,Asgari,Tedarikçi,Durum', filename: 'reorder.csv' });
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
  window.addEventListener('load', async () => {
    enforceAccess();
    wireLogoutButton();
    wireDialogCancel();
    Calendar.initAll();
    await refreshAll();
  });
})();

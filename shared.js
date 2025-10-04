(() => {
  const $ = (s, ctx = document) => ctx.querySelector(s);
  const MONTH_NAMES = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const DAY_NAMES = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];
  const TODAY_ISO = (() => {
    const d = new Date();
    d.setHours(0,0,0,0);
    return toISODate(d);
  })();
  function toISODate(date){
    if (!(date instanceof Date)) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  function parseISODate(iso){
    if (!iso || typeof iso !== 'string') return null;
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(date.getTime()) ? null : date;
  }
  function startOfMonth(date){
    const d = date instanceof Date ? new Date(date) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  function escapeHtml(str){
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function parseDateGuess(value){
    if (!value) return null;
    if (value instanceof Date) {
      const d = new Date(value.getTime());
      d.setHours(0,0,0,0);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === 'number') {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        d.setHours(0,0,0,0);
        return d;
      }
    }
    const str = String(value).trim();
    if (!str) return null;
    let d = new Date(str);
    if (!isNaN(d.getTime())) {
      d.setHours(0,0,0,0);
      return d;
    }
    const m1 = str.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/);
    if (m1){
      const day = Number(m1[1]);
      const month = Number(m1[2]) - 1;
      const year = Number(m1[3].length === 2 ? ('20' + m1[3]) : m1[3]);
      d = new Date(year, month, day);
      if (!isNaN(d.getTime())) {
        d.setHours(0,0,0,0);
        return d;
      }
    }
    const m2 = str.match(/^(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)/);
    if (m2){
      const TR_MONTHS = {
        ocak:0, şubat:1, subat:1, mart:2, nisan:3, mayıs:4, mayis:4, haziran:5,
        temmuz:6, ağustos:7, agustos:7, eylül:8, eylul:8, ekim:9, kasım:10, kasim:10, aralık:11, aralik:11
      };
      const day = Number(m2[1]);
      const monthName = m2[2].toLowerCase('tr-TR');
      if (!Number.isNaN(day) && TR_MONTHS.hasOwnProperty(monthName)){
        const base = new Date();
        const yearMatch = str.match(/(\d{4})/);
        const year = yearMatch ? Number(yearMatch[1]) : base.getFullYear();
        d = new Date(year, TR_MONTHS[monthName], day);
        if (!isNaN(d.getTime())) {
          d.setHours(0,0,0,0);
          return d;
        }
      }
    }
    return null;
  }
  function normalizeEvents(list){
    const out = [];
    if (!Array.isArray(list)) return out;
    list.forEach(item => {
      if (!item) return;
      if (typeof item === 'string') {
        const d = parseDateGuess(item);
        if (!d) return;
        out.push({ date: toISODate(d), title: item.trim() });
        return;
      }
      if (typeof item === 'object') {
        const dateRaw = item.date || item.due || item.deadline || item.when || item.day || item.eta;
        const d = parseDateGuess(dateRaw);
        if (!d) return;
        const title = item.title || item.name || item.summary || item.text || item.id || 'Planlanan İş';
        const meta = item.meta || item.owner || item.responsible || item.department || item.bucket || '';
        out.push({
          date: toISODate(d),
          title: String(title),
          meta: meta ? String(meta) : ''
        });
      }
    });
    return out;
  }
  function eventsFromPlanned(data){
    const collected = [];
    if (Array.isArray(data)) collected.push(...normalizeEvents(data));
    else if (data && typeof data === 'object') {
      Object.values(data).forEach(value => {
        if (Array.isArray(value)) collected.push(...normalizeEvents(value));
        else if (value && typeof value === 'object') collected.push(...normalizeEvents([value]));
      });
    }
    return collected;
  }
  function eventsFromJobs(list){
    if (!Array.isArray(list)) return [];
    const mapped = list.map(job => ({
      date: job?.eta || job?.due || job?.deadline,
      title: job?.title ? `${job.title}` : (job?.id ? `İş ${job.id}` : 'Aktif İş'),
      meta: job?.owner || job?.id || ''
    }));
    return normalizeEvents(mapped);
  }
  function formatLong(date){
    try {
      return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'full' }).format(date);
    } catch {
      return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
    }
  }
  function createCalendar(root){
    const labelEl = root.querySelector('[data-calendar-label]');
    const gridEl = root.querySelector('[data-calendar-grid]');
    const detailsEl = root.querySelector('[data-calendar-details]');
    const navButtons = root.querySelectorAll('[data-calendar-nav]');
    if (gridEl && !gridEl.hasAttribute('role')) gridEl.setAttribute('role', 'grid');
    const state = {
      month: startOfMonth(new Date()),
      selected: TODAY_ISO,
      events: new Map()
    };
    const ensureSelection = () => {
      const selectedDate = parseISODate(state.selected);
      if (selectedDate && selectedDate.getMonth() === state.month.getMonth() && selectedDate.getFullYear() === state.month.getFullYear()) return;
      let pick = null;
      state.events.forEach((_, iso) => {
        const d = parseISODate(iso);
        if (!d) return;
        if (d.getMonth() === state.month.getMonth() && d.getFullYear() === state.month.getFullYear()){
          if (!pick || iso < pick) pick = iso;
        }
      });
      if (pick) state.selected = pick;
      else {
        const todayDate = parseISODate(TODAY_ISO);
        if (todayDate && todayDate.getMonth() === state.month.getMonth() && todayDate.getFullYear() === state.month.getFullYear()) state.selected = TODAY_ISO;
        else state.selected = toISODate(state.month);
      }
    };
    const updateDetails = () => {
      if (!detailsEl) return;
      const iso = state.selected;
      const dateObj = parseISODate(iso);
      const events = state.events.get(iso) || [];
      if (!dateObj){
        detailsEl.innerHTML = '<p class="calendar__details-empty">Bir gün seçin.</p>';
        return;
      }
      let html = `<div class="calendar__details-date">${escapeHtml(formatLong(dateObj))}</div>`;
      if (events.length){
        html += '<ul class="calendar__details-list">' + events.map(ev => {
          const meta = ev.meta ? ` <span class=\"muted\">· ${escapeHtml(ev.meta)}</span>` : '';
          return `<li>${escapeHtml(ev.title)}${meta}</li>`;
        }).join('') + '</ul>';
        if (events.length > 1) html += `<p class="calendar__details-note">Toplam ${events.length} plan.</p>`;
      } else {
        html += '<p class="calendar__details-empty">Seçilen gün için plan bulunmuyor.</p>';
      }
      detailsEl.innerHTML = html;
    };
    const render = () => {
      if (!gridEl) return;
      ensureSelection();
      gridEl.innerHTML = '';
      if (labelEl) labelEl.textContent = `${MONTH_NAMES[state.month.getMonth()]} ${state.month.getFullYear()}`;
      DAY_NAMES.forEach(name => {
        const head = document.createElement('div');
        head.className = 'calendar__cell calendar__cell--heading';
        head.textContent = name;
        gridEl.appendChild(head);
      });
      const firstDay = startOfMonth(state.month);
      const firstWeekday = (firstDay.getDay() + 6) % 7; // Monday as first column
      const cursor = new Date(firstDay);
      cursor.setDate(cursor.getDate() - firstWeekday);
      for (let i = 0; i < 42; i++){
        const current = new Date(cursor);
        cursor.setDate(cursor.getDate() + 1);
        const iso = toISODate(current);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'calendar__cell';
        btn.dataset.date = iso;
        btn.textContent = current.getDate();
        btn.setAttribute('aria-label', formatLong(current));
        if (iso === TODAY_ISO) btn.setAttribute('aria-current', 'date');
        if (current.getMonth() !== state.month.getMonth()) btn.classList.add('calendar__cell--muted');
        if (iso === TODAY_ISO) btn.classList.add('calendar__cell--today');
        if (state.events.has(iso)) btn.classList.add('calendar__cell--has-event');
        if (iso === state.selected) btn.classList.add('calendar__cell--selected');
        btn.addEventListener('click', () => {
          state.selected = iso;
          render();
        });
        gridEl.appendChild(btn);
      }
      updateDetails();
    };
    navButtons.forEach(btn => {
      if (btn.dataset.navBound) return;
      btn.dataset.navBound = '1';
      btn.addEventListener('click', () => {
        const step = Number(btn.getAttribute('data-calendar-nav')) || 0;
        state.month = startOfMonth(new Date(state.month.getFullYear(), state.month.getMonth() + step, 1));
        render();
      });
    });
    render();
    return {
      setEvents(list){
        const map = new Map();
        (Array.isArray(list) ? list : []).forEach(ev => {
          if (!ev || !ev.date) return;
          if (!map.has(ev.date)) map.set(ev.date, []);
          map.get(ev.date).push(ev);
        });
        map.forEach(arr => arr.sort((a,b)=> (a.title || '').localeCompare(b.title || '', 'tr')));
        state.events = map;
        render();
      }
    };
  }
  const Calendar = (() => {
    const instances = new Set();
    const sources = new Map();
    const updateAll = () => {
      const combined = [];
      sources.forEach(list => combined.push(...list));
      instances.forEach(ctrl => ctrl.setEvents(combined));
    };
    return {
      initAll(scope = document){
        scope.querySelectorAll('[data-calendar]').forEach(root => {
          if (root.dataset.calendarBound) return;
          root.dataset.calendarBound = '1';
          const instance = createCalendar(root);
          instances.add(instance);
          updateAll();
        });
      },
      setSource(key, events){
        sources.set(key, normalizeEvents(events));
        updateAll();
      },
      clearSource(key){
        sources.delete(key);
        updateAll();
      },
      normalizeEvents,
      eventsFromPlanned,
      eventsFromJobs
    };
  })();
  function renderStats(stats){
    const cards = document.querySelectorAll('#view-stok .cards .card .card__value');
    if (cards[0]) cards[0].textContent = stats.total_skus ?? '-';
    if (cards[1]) cards[1].textContent = stats.in_stock_pct != null ? '%' + stats.in_stock_pct : '-';
    if (cards[2]) cards[2].textContent = stats.critical ?? '-';
    if (cards[3]) cards[3].textContent = stats.open_pos ?? '-';
  }
  function renderReorder(rows){
    const tbody = document.getElementById('reorderTable');
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
  function renderHistory(items){
    const ul = document.getElementById('historyList');
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
  function renderPlanned(grouped){
    const map = { soon: '[data-col="soon"]', month: '[data-col="month"]', backlog: '[data-col="backlog"]' };
    Object.keys(map).forEach(k => {
      const ul = document.querySelector('#view-planlanan ' + map[k]);
      if (ul) ul.innerHTML = (grouped?.[k] || []).map(t => `<li class="kanban__item">${t}</li>`).join('');
    });
  }
  function renderJobs(items){
    const grid = document.getElementById('jobsGrid');
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
  async function getJSON(url){
    const r = await fetch(url);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
  async function postJSON(url, body){
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return r.json().catch(() => ({}));
  }
  function exportTableToCSV({ rowSelector, header, filename, skipEmpty }){
    const rows = Array.from(document.querySelectorAll(rowSelector));
    const payload = rows.map(tr =>
      Array.from(tr.children).map(td => '"' + (td.textContent || '').replaceAll('"', '""') + '"').join(',')
    ).filter(Boolean);
    if (skipEmpty && !payload.length) return false;
    const csv = (header ? [header, ...payload] : payload).join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'export.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return payload.length > 0;
  }
  function wireDialogCancel(root = document){
    root.querySelectorAll('dialog [data-cancel]').forEach(btn => {
      if (btn.dataset.cancelBound) return;
      btn.dataset.cancelBound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dialog = btn.closest('dialog');
        if (!dialog) return;
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
      });
    });
  }
  window.PanelShared = { $, renderStats, renderReorder, renderHistory, applyHistorySort, renderPlanned, renderJobs, getJSON, postJSON, exportTableToCSV, wireDialogCancel, Calendar };
})();

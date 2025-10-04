(() => {
  const PERSONEL_URL = './Personel Panel/index.html';
  const YONETICI_URL = './Yonetici Panel/index.html';
  const DEFAULT_USERS = [
    { email: 'admin@local',    password: 'admin123',    role: 'admin'   },
    { email: 'yonetici@local', password: 'yonetici123', role: 'manager' },
    { email: 'personel@local', password: 'personel123', role: 'viewer'  },
  ];
  const $ = (s, d=document) => d.querySelector(s);
  function getUsers(){
    const map = new Map();
    try {
      const raw = JSON.parse(localStorage.getItem('users') || 'null');
      if (Array.isArray(raw)) {
        raw.forEach(entry => {
          const email = (entry?.email || '').toString().trim().toLowerCase();
          if (!email) return;
          if (!map.has(email)) {
            map.set(email, {
              email,
              password: (entry?.password || '').toString(),
              role: entry?.role || 'viewer'
            });
          }
        });
      }
    } catch {}
    DEFAULT_USERS.forEach(seed => {
      map.set(seed.email, { ...seed });
    });
    const list = Array.from(map.values());
    try { localStorage.setItem('users', JSON.stringify(list)); } catch {}
    return list;
  }
  function saveSession(email, role){
    try { localStorage.setItem('session', JSON.stringify({ email, role, ts: Date.now() })); } catch {}
  }
  document.addEventListener('DOMContentLoaded', () => {
    const form    = $('#loginForm');
    const pw      = $('#password');
    const eye     = $('#btn-toggle-pw');
    const link    = $('#lnk-register');
    const dlg     = $('#dlg-register');
    const regForm = $('#form-register');
    document.querySelectorAll('[data-cancel]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dialog = btn.closest('dialog');
        if (!dialog) return;
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
      });
    });
    eye?.addEventListener('click', (e) => {
      e.preventDefault();
      if (!pw) return;
      pw.type = (pw.type === 'password') ? 'text' : 'password';
    });
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const email = String(fd.get('email') || '').trim().toLowerCase();
      const pass  = String(fd.get('password') || '');
      if (!email || !pass) { alert('Lütfen e-posta ve parolayı girin.'); return; }
      const user = getUsers().find(u => (u.email || '').toLowerCase() === email && u.password === pass);
      if (!user) { alert('Hatalı e-posta/parola'); return; }
      saveSession(user.email, user.role);
      location.href = (user.role === 'viewer') ? PERSONEL_URL : YONETICI_URL;
    });
    link?.addEventListener('click', (e) => {
      e.preventDefault();
      if (!dlg) return;
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open','');
    });
    regForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(regForm);
      const payload = {
        fullname: String(fd.get('fullname') || '').trim(),
        email:    String(fd.get('email')    || '').trim().toLowerCase(),
        phone:    String(fd.get('phone')    || '').trim(),
        password: String(fd.get('password') || ''),
        role:     'viewer',
        createdAt: new Date().toISOString(),
      };
      if (!payload.fullname || !payload.email || !payload.password) {
        alert('Lütfen zorunlu alanları doldurun.');
        return;
      }
      const users = getUsers();
      if (users.some(u => (u.email || '').toLowerCase() === payload.email)) {
        alert('Bu e-posta ile zaten bir hesap var.');
        return;
      }
      let pending = [];
      try { pending = JSON.parse(localStorage.getItem('pending_users') || '[]') || []; } catch {}
      if (pending.some(u => (u.email || '').toLowerCase() === payload.email)) {
        alert('Bu e-posta ile bekleyen bir başvuru zaten var.');
        return;
      }
      pending.push(payload);
      try { localStorage.setItem('pending_users', JSON.stringify(pending)); } catch {}
      if (typeof dlg?.close === 'function') dlg.close();
      else dlg?.removeAttribute('open');
      alert('Başvurun alındı. Yönetici onayı sonrası giriş yapabilirsin.');
    });
  });
})();

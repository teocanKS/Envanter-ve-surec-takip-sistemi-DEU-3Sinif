// login.js
(() => {
  const PERSONEL_URL = './Personel Panel/index.html';
  const YONETICI_URL = './Yonetici Panel/index.html';

  // Varsayılan mock kullanıcılar (yönetici onaylı kullanıcı yoksa devreye girer)
  const DEFAULT_USERS = [
    { email: 'admin@local',    password: 'admin123',    role: 'admin'   },
    { email: 'yonetici@local', password: 'yonetici123', role: 'manager' },
    { email: 'personel@local', password: 'personel123', role: 'viewer'  },
  ];

  const $ = (s, d=document) => d.querySelector(s);

  function getUsers(){
    try {
      const u = JSON.parse(localStorage.getItem('users') || '[]');
      return Array.isArray(u) && u.length ? u : DEFAULT_USERS;
    } catch {
      return DEFAULT_USERS;
    }
  }

  function saveSession(email, role){
    try { localStorage.setItem('session', JSON.stringify({ email, role, ts: Date.now() })); } catch {}
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Elemanlar
    const form    = $('#loginForm');
    const emailEl = $('#email');
    const pw      = $('#password');
    const eye     = $('#btn-toggle-pw');

    const link    = $('#lnk-register');
    const dlg     = $('#dlg-register');
    const regForm = $('#form-register');

    // Parola göster/gizle
    eye?.addEventListener('click', (e) => {
      e.preventDefault();
      if (!pw) return;
      pw.type = (pw.type === 'password') ? 'text' : 'password';
    });

    // Giriş
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

    // Kayıt ol → dialog aç
    link?.addEventListener('click', (e) => {
      e.preventDefault();
      if (!dlg) return;
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open',''); // basit fallback
    });

    // Kayıt formu → pending_users'a ekle
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

      // Aktif kullanıcı veya bekleyen başvuru var mı?
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

      // Dialog kapat
      if (typeof dlg?.close === 'function') dlg.close();
      else dlg?.removeAttribute('open');

      alert('Başvurun alındı. Yönetici onayı sonrası giriş yapabilirsin.');
    });
  });
})();
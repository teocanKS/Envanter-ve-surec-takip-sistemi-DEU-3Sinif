(() => {
  const LS_KEY = 'session';
  function readSession() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); }
    catch { return null; }
  }
  function clearSession() { localStorage.removeItem(LS_KEY); }
  function loginUrlFromHere() {
    const p = decodeURIComponent(location.pathname);
    const inSub = p.includes('/Personel Panel/') || p.includes('/Yonetici Panel/');
    return inSub ? '../index.html' : './index.html';
  }
  function requireLogin() {
    const s = readSession();
    if (!s) location.replace(loginUrlFromHere());
    return s;
  }
  function enforceAccess({ allow = [] } = {}) {
    const s = requireLogin();
    if (allow.length && !allow.includes(s.role)) {
      if (s.role === 'viewer') location.replace('../Personel Panel/index.html');
      else location.replace('../Yonetici Panel/index.html');
    }
    return s;
  }
  function applyRoleUI(user) {
    const path = decodeURIComponent(location.pathname);
    const inPersonel = path.includes('/Personel Panel/');
    const canWrite = inPersonel ? true : (user && (user.role === 'admin' || user.role === 'manager'));
    const addSkuBtn  = document.getElementById('btn-add-sku');
    const newPlanBtn = document.getElementById('btn-new-plan');
    if (addSkuBtn)  addSkuBtn.style.display  = canWrite ? '' : 'none';
    if (newPlanBtn) newPlanBtn.style.display = canWrite ? '' : 'none';
    const exportBtn = document.getElementById('btn-export');
    if (exportBtn) exportBtn.style.display = (user && user.role === 'admin') ? '' : 'none';
    const host = document.querySelector('.topbar .topbar__actions') || document.querySelector('.topbar');
    if (host && !document.getElementById('role-badge')) {
      const badge = document.createElement('span');
      badge.id = 'role-badge';
      badge.className = 'badge';
      badge.textContent = user.role.toUpperCase();
      host.appendChild(badge);
    }
    let logoutBtn = document.getElementById('btn-logout');
    if (!logoutBtn && host) {
      logoutBtn = document.createElement('button');
      logoutBtn.id = 'btn-logout';
      logoutBtn.type = 'button';
      logoutBtn.className = 'btn btn--ghost';
      logoutBtn.textContent = 'Çıkış';
      logoutBtn.style.marginLeft = '8px';
      host.appendChild(logoutBtn);
    }
    if (logoutBtn && !logoutBtn.dataset.bound) {
      logoutBtn.dataset.bound = '1';
      logoutBtn.addEventListener('click', () => {
        clearSession();
        location.href = loginUrlFromHere();
      });
    }
  }
  function isAdmin(){
    try{ return readSession()?.role === 'admin'; } catch { return false; }
  }
  window.MockAuth = { readSession, clearSession, requireLogin, enforceAccess, applyRoleUI, isAdmin };
})();

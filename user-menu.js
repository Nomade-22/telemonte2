(() => {
  'use strict';

  const DB_KEY = 'telemonte-db-v3';
  const SESSION_KEY = 'telemonte-session-v2';
  let timer = null;

  const read = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };

  const roleLabel = role => ({
    admin: 'Administrador',
    supervisor: 'Supervisor',
    driver: 'Motorista'
  }[role] || role || 'Usuário');

  function userFromStorage() {
    const db = read(DB_KEY, { users: [] });
    const id = localStorage.getItem(SESSION_KEY);
    return db.users?.find(user => user.id === id && user.active) || null;
  }

  function userFromSidebar() {
    const box = document.querySelector('.sidebar-user');
    if (!box) return null;
    const name = box.querySelector('strong')?.textContent?.trim() || '';
    const username = (box.querySelector('span')?.textContent || '').trim().replace(/^@/, '');
    const rawRole = box.querySelector('small')?.textContent?.trim() || 'Usuário';
    if (!name && !username) return null;
    const normalized = rawRole.toLowerCase();
    const role = normalized.includes('admin') ? 'admin' : normalized.includes('super') ? 'supervisor' : normalized.includes('motor') ? 'driver' : rawRole;
    return { name: name || username || 'Usuário', username, role, active: true };
  }

  function currentUser() {
    return userFromStorage() || userFromSidebar();
  }

  function logout() {
    if (window.TM?.logout) {
      window.TM.logout();
      return;
    }
    localStorage.removeItem(SESSION_KEY);
    location.reload();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function closeMenus(except = null) {
    document.querySelectorAll('.tm-user-menu.is-open').forEach(menu => {
      if (menu === except) return;
      menu.classList.remove('is-open');
      menu.querySelector('.tm-user-trigger')?.setAttribute('aria-expanded', 'false');
    });
  }

  function buildUserMenu(user) {
    const wrap = document.createElement('div');
    wrap.className = 'tm-user-menu';
    wrap.dataset.tmUserMenu = '1';

    const initial = String(user.name || user.username || 'U').trim().charAt(0).toUpperCase();
    const name = user.name || user.username || 'Usuário';
    const role = roleLabel(user.role);

    wrap.innerHTML = `
      <button type="button" class="tm-user-trigger" aria-haspopup="true" aria-expanded="false" title="Conta de ${escapeHtml(name)}">
        <span class="tm-user-avatar" aria-hidden="true">${escapeHtml(initial)}</span>
        <span class="tm-user-trigger-text">
          <strong>${escapeHtml(name)}</strong>
          <small>${escapeHtml(role)}</small>
        </span>
        <span class="tm-user-chevron" aria-hidden="true">⌄</span>
      </button>
      <div class="tm-user-dropdown" role="menu">
        <div class="tm-user-summary">
          <span class="tm-user-avatar tm-user-avatar-large" aria-hidden="true">${escapeHtml(initial)}</span>
          <div>
            <strong>${escapeHtml(name)}</strong>
            <span>${user.username ? '@' + escapeHtml(user.username) : ''}</span>
          </div>
        </div>
        <div class="tm-user-role">${escapeHtml(role)}</div>
        <button type="button" class="tm-user-logout" data-tm-user-logout="1" role="menuitem">
          <span aria-hidden="true">↪</span>
          Sair
        </button>
      </div>`;

    const trigger = wrap.querySelector('.tm-user-trigger');
    trigger.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const open = !wrap.classList.contains('is-open');
      closeMenus(wrap);
      wrap.classList.toggle('is-open', open);
      trigger.setAttribute('aria-expanded', String(open));
    });

    wrap.querySelector('[data-tm-user-logout]')?.addEventListener('click', event => {
      event.preventDefault();
      logout();
    });

    return wrap;
  }

  function enhance() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;

    const user = currentUser();
    if (!user) return;

    const sidebarUser = document.querySelector('.sidebar-user');
    if (sidebarUser) sidebarUser.setAttribute('aria-hidden', 'true');

    let right = topbar.querySelector('.tm-topbar-right');
    if (!right) {
      right = document.createElement('div');
      right.className = 'tm-topbar-right';
      const status = topbar.querySelector('.status-dot');
      if (status) right.appendChild(status);
      topbar.appendChild(right);
    }

    if (!right.querySelector('[data-tm-user-menu]')) {
      right.appendChild(buildUserMenu(user));
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(enhance, 20);
  }

  document.addEventListener('click', event => {
    if (!event.target.closest('.tm-user-menu')) closeMenus();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenus();
  });

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { subtree: true, childList: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule);
  else schedule();

  const retry = setInterval(() => {
    if (!document.body) return;
    enhance();
  }, 350);
  setTimeout(() => clearInterval(retry), 12000);

  window.TMUserMenu = { refresh: enhance };
})();
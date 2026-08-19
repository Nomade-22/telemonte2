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

  function currentUser() {
    const db = read(DB_KEY, { users: [] });
    const id = localStorage.getItem(SESSION_KEY);
    return db.users?.find(user => user.id === id && user.active) || null;
  }

  function closeMobile() {
    document.body.classList.remove('mobile-nav-open');
    document.querySelector('.mobile-nav-overlay')?.classList.remove('show');
  }

  function ensureGroup(nav, key, label, beforeKey = '') {
    let group = nav.querySelector(`.nav-group[data-group="${key}"]`);
    if (group) return group;

    group = document.createElement('div');
    group.className = 'nav-group';
    group.dataset.group = key;

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'nav-group-header';
    header.setAttribute('aria-expanded', 'true');
    header.innerHTML = `<span class="nav-group-title">${label}</span><span class="nav-group-chevron" aria-hidden="true">⌄</span>`;

    const items = document.createElement('div');
    items.className = 'nav-group-items';
    group.append(header, items);

    header.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const collapsed = group.classList.toggle('is-group-collapsed');
      header.setAttribute('aria-expanded', String(!collapsed));
    });

    const before = beforeKey ? nav.querySelector(`.nav-group[data-group="${beforeKey}"]`) : null;
    nav.insertBefore(group, before || null);
    return group;
  }

  function buttonExists(nav, key) {
    return !!nav.querySelector(`[data-nav-fix="${key}"]`);
  }

  function makeButton(key, label, icon, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.navFix = key;
    button.title = label;
    button.innerHTML = `<span class="nav-icon" aria-hidden="true">${icon}</span><span class="nav-label">${label}</span>`;
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      document.querySelectorAll('.sidebar nav button').forEach(x => x.classList.remove('active'));
      button.classList.add('active');
      closeMobile();
      onClick();
    });
    return button;
  }

  function ensureButton(nav, group, key, label, icon, onClick) {
    if (buttonExists(nav, key)) return;
    const existing = Array.from(nav.querySelectorAll('button')).find(button => button.textContent.trim() === label);
    if (existing) {
      existing.dataset.navFix = key;
      return;
    }
    group.querySelector('.nav-group-items')?.appendChild(makeButton(key, label, icon, onClick));
  }

  function openOrders(view) {
    if (window.TMOrdersPoints?.render) {
      window.TMOrdersPoints.render(view);
      return;
    }
    const native = Array.from(document.querySelectorAll('.sidebar nav button')).find(b => b.textContent.trim() === (view === 'orders' ? 'Ordens de Coleta' : 'Pontos de Coleta'));
    if (native && !native.dataset.navFix) native.click();
    else alert('O módulo de Ordens/Pontos ainda está carregando. Atualize a página e tente novamente.');
  }

  function openDestination() {
    if (window.TMDestination?.render) window.TMDestination.render('weighing');
    else alert('O módulo Destinação / Pesagem ainda está carregando. Atualize a página e tente novamente.');
  }

  function openEnvironmental() {
    if (window.TMEnvironmental?.render) window.TMEnvironmental.render('mtr');
    else alert('O módulo Documentação Ambiental ainda está carregando. Atualize a página e tente novamente.');
  }

  function ensureNavigation() {
    const user = currentUser();
    if (!user || user.role === 'driver') return;

    const nav = document.querySelector('.sidebar nav');
    if (!nav) return;

    const operation = ensureGroup(nav, 'operacao', 'OPERAÇÃO');
    const cadastros = ensureGroup(nav, 'cadastros', 'CADASTROS');
    const residuos = ensureGroup(nav, 'residuos', 'RESÍDUOS', 'financeiro');

    ensureButton(nav, operation, 'orders', 'Ordens de Coleta', '☑', () => openOrders('orders'));
    ensureButton(nav, cadastros, 'points', 'Pontos de Coleta', '⌂', () => openOrders('points'));
    ensureButton(nav, residuos, 'destination', 'Destinação / Pesagem', '⚖', openDestination);
    ensureButton(nav, residuos, 'environmental', 'Documentação Ambiental', '▤', openEnvironmental);
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(ensureNavigation, 40);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { subtree: true, childList: true });

  document.addEventListener('click', event => {
    if (event.target.closest('#login-form button, .sidebar-user button, [data-page]')) setTimeout(ensureNavigation, 80);
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule);
  else schedule();

  window.TMNavigationFix = { refresh: ensureNavigation };
})();

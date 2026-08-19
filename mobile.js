(() => {
  'use strict';

  const BREAKPOINT = 760;

  function isMobile() {
    return window.innerWidth <= BREAKPOINT;
  }

  function closeMenu() {
    document.querySelector('.sidebar')?.classList.remove('mobile-open');
    document.querySelector('.mobile-menu-overlay')?.classList.remove('is-visible');
    document.body.classList.remove('mobile-menu-open');
  }

  function openMenu() {
    if (!isMobile()) return;
    document.querySelector('.sidebar')?.classList.add('mobile-open');
    document.querySelector('.mobile-menu-overlay')?.classList.add('is-visible');
    document.body.classList.add('mobile-menu-open');
  }

  function ensureOverlay() {
    let overlay = document.querySelector('.mobile-menu-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'mobile-menu-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.addEventListener('click', closeMenu);
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function enhanceTopbar() {
    const topbar = document.querySelector('.topbar');
    if (!topbar || topbar.dataset.mobileReady === '1') return;
    topbar.dataset.mobileReady = '1';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mobile-menu-button';
    button.setAttribute('aria-label', 'Abrir menu');
    button.title = 'Abrir menu';
    button.innerHTML = '<span aria-hidden="true">☰</span>';
    button.addEventListener('click', openMenu);
    topbar.prepend(button);
  }

  function enhanceSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar || sidebar.dataset.mobileReady === '1') return;
    sidebar.dataset.mobileReady = '1';

    const brand = sidebar.querySelector('.brand');
    if (brand && !brand.querySelector('.mobile-drawer-close')) {
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'mobile-drawer-close';
      close.setAttribute('aria-label', 'Fechar menu');
      close.title = 'Fechar menu';
      close.innerHTML = '<span aria-hidden="true">×</span>';
      close.addEventListener('click', closeMenu);
      brand.appendChild(close);
    }

    sidebar.querySelectorAll('[data-page]').forEach(button => {
      if (button.dataset.mobileCloseReady === '1') return;
      button.dataset.mobileCloseReady = '1';
      button.addEventListener('click', () => {
        if (isMobile()) setTimeout(closeMenu, 0);
      });
    });
  }

  function enhanceTables() {
    document.querySelectorAll('.table-wrap table').forEach(table => {
      if (table.dataset.mobileTableReady === '1') return;
      if (table.classList.contains('dre-table') || table.classList.contains('no-mobile-cards')) return;

      const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
      if (!headers.length) return;

      table.dataset.mobileTableReady = '1';
      table.classList.add('mobile-card-table');
      table.querySelectorAll('tbody tr').forEach(row => {
        Array.from(row.children).forEach((cell, index) => {
          if (cell.tagName === 'TD') cell.dataset.label = headers[index] || '';
        });
      });
    });
  }

  function enhance() {
    ensureOverlay();
    enhanceTopbar();
    enhanceSidebar();
    enhanceTables();
  }

  const observer = new MutationObserver(enhance);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('resize', () => {
    if (!isMobile()) closeMenu();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenu();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhance);
  } else {
    enhance();
  }
})();

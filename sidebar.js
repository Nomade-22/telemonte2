(() => {
  'use strict';

  const STORAGE_KEY = 'telemonte-sidebar-collapsed';
  const ICONS = {
    'Dashboard': '▦',
    'Mapa / Rastreamento': '⌖',
    'Rotas': '⇄',
    'Clientes': '◆',
    'Funcionários': '♟',
    'Caminhões': '▰',
    'Caçambas': '▣',
    'Financeiro': '$',
    'Importar / Exportar': '⇅',
    'Usuários e Permissões': '⚙',
    'Área do Motorista': '◉',
    'Minha Rota': '⌖',
    'Ocorrências': '!',
    'Histórico': '◷'
  };

  function isCollapsed() {
    return localStorage.getItem(STORAGE_KEY) === '1';
  }

  function applyState(sidebar, shell, collapsed) {
    sidebar.classList.toggle('is-collapsed', collapsed);
    shell?.classList.toggle('sidebar-collapsed', collapsed);
    const toggle = sidebar.querySelector('.sidebar-toggle');
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Recolher menu');
      toggle.title = collapsed ? 'Expandir menu' : 'Recolher menu';
      const icon = toggle.querySelector('.toggle-icon');
      if (icon) icon.textContent = collapsed ? '›' : '‹';
    }
  }

  function enhanceSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar || sidebar.dataset.collapsibleReady === '1') return;

    const shell = sidebar.closest('.app-shell');
    sidebar.dataset.collapsibleReady = '1';

    const brand = sidebar.querySelector('.brand');
    if (brand && !brand.querySelector('.sidebar-toggle')) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'sidebar-toggle';
      toggle.innerHTML = '<span class="toggle-icon">‹</span>';
      toggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const collapsed = !sidebar.classList.contains('is-collapsed');
        localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
        applyState(sidebar, shell, collapsed);
      });
      brand.appendChild(toggle);
    }

    sidebar.querySelectorAll('nav button').forEach((button) => {
      if (button.dataset.iconReady === '1') return;
      const label = button.textContent.trim();
      button.dataset.iconReady = '1';
      button.title = label;
      button.innerHTML = `<span class="nav-icon" aria-hidden="true">${ICONS[label] || '•'}</span><span class="nav-label">${label}</span>`;
    });

    const user = sidebar.querySelector('.sidebar-user');
    if (user && !user.querySelector('.sidebar-user-mini')) {
      const mini = document.createElement('div');
      mini.className = 'sidebar-user-mini';
      const name = user.querySelector('strong')?.textContent?.trim() || 'U';
      mini.textContent = name.charAt(0).toUpperCase();
      mini.title = name;
      user.prepend(mini);
    }

    applyState(sidebar, shell, isCollapsed());
  }

  const observer = new MutationObserver(() => enhanceSidebar());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceSidebar);
  } else {
    enhanceSidebar();
  }
})();

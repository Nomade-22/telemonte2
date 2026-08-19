(() => {
  'use strict';

  const STORAGE_KEY = 'telemonte-sidebar-collapsed';
  const GROUP_STORAGE_KEY = 'telemonte-sidebar-groups-v1';

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

  const GROUPS = [
    {
      key: 'operacao',
      label: 'OPERAÇÃO',
      items: ['Dashboard', 'Mapa / Rastreamento', 'Rotas', 'Área do Motorista', 'Minha Rota', 'Ocorrências']
    },
    {
      key: 'cadastros',
      label: 'CADASTROS',
      items: ['Clientes', 'Funcionários', 'Caminhões', 'Caçambas']
    },
    {
      key: 'financeiro',
      label: 'FINANCEIRO',
      items: ['Financeiro']
    },
    {
      key: 'administracao',
      label: 'ADMINISTRAÇÃO',
      items: ['Importar / Exportar', 'Usuários e Permissões']
    },
    {
      key: 'registros',
      label: 'REGISTROS',
      items: ['Histórico']
    }
  ];

  function isCollapsed() {
    return localStorage.getItem(STORAGE_KEY) === '1';
  }

  function readGroupState() {
    try {
      return JSON.parse(localStorage.getItem(GROUP_STORAGE_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  function saveGroupState(state) {
    localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(state));
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

  function decorateButton(button) {
    if (button.dataset.iconReady === '1') return;
    const label = button.textContent.trim();
    button.dataset.iconReady = '1';
    button.dataset.menuLabel = label;
    button.title = label;
    button.innerHTML = `<span class="nav-icon" aria-hidden="true">${ICONS[label] || '•'}</span><span class="nav-label">${label}</span>`;
  }

  function buildGroups(nav) {
    if (!nav || nav.dataset.groupedReady === '1') return;

    const originalButtons = Array.from(nav.querySelectorAll(':scope > button[data-page]'));
    if (!originalButtons.length) return;

    originalButtons.forEach(decorateButton);

    const byLabel = new Map(
      originalButtons.map(button => [button.dataset.menuLabel || button.textContent.trim(), button])
    );

    const fragment = document.createDocumentFragment();
    const used = new Set();
    const savedState = readGroupState();

    GROUPS.forEach(groupDef => {
      const buttons = groupDef.items.map(label => byLabel.get(label)).filter(Boolean);
      if (!buttons.length) return;

      const group = document.createElement('div');
      group.className = 'nav-group';
      group.dataset.group = groupDef.key;

      const hasActive = buttons.some(button => button.classList.contains('active'));
      const groupCollapsed = hasActive ? false : savedState[groupDef.key] === true;
      group.classList.toggle('is-group-collapsed', groupCollapsed);

      if (hasActive && savedState[groupDef.key] === true) {
        savedState[groupDef.key] = false;
        saveGroupState(savedState);
      }

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'nav-group-header';
      header.setAttribute('aria-expanded', String(!groupCollapsed));
      header.innerHTML = `<span class="nav-group-title">${groupDef.label}</span><span class="nav-group-chevron" aria-hidden="true">⌄</span>`;
      header.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();

        const willCollapse = !group.classList.contains('is-group-collapsed');
        group.classList.toggle('is-group-collapsed', willCollapse);
        header.setAttribute('aria-expanded', String(!willCollapse));

        const state = readGroupState();
        state[groupDef.key] = willCollapse;
        saveGroupState(state);
      });

      const items = document.createElement('div');
      items.className = 'nav-group-items';
      buttons.forEach(button => {
        used.add(button);
        items.appendChild(button);
      });

      group.appendChild(header);
      group.appendChild(items);
      fragment.appendChild(group);
    });

    const leftovers = originalButtons.filter(button => !used.has(button));
    if (leftovers.length) {
      const group = document.createElement('div');
      group.className = 'nav-group nav-group-ungrouped';
      const items = document.createElement('div');
      items.className = 'nav-group-items';
      leftovers.forEach(button => items.appendChild(button));
      group.appendChild(items);
      fragment.appendChild(group);
    }

    nav.innerHTML = '';
    nav.appendChild(fragment);
    nav.dataset.groupedReady = '1';
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
      toggle.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const collapsed = !sidebar.classList.contains('is-collapsed');
        localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
        applyState(sidebar, shell, collapsed);
      });
      brand.appendChild(toggle);
    }

    buildGroups(sidebar.querySelector('nav'));

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

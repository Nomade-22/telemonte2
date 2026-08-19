(() => {
  'use strict';

  const LOGO_SRC = './assets/telemonte-logo.svg';
  const MARK_SRC = './assets/telemonte-mark.svg';
  let scheduled = false;

  function makeImg(className, src, alt) {
    const img = document.createElement('img');
    img.className = className;
    img.src = src;
    img.alt = alt;
    img.decoding = 'async';
    img.loading = 'eager';
    img.addEventListener('error', () => {
      console.warn(`Não foi possível carregar ${src}`);
      img.style.display = 'none';
    }, { once: true });
    return img;
  }

  function enhanceLogin() {
    const card = document.querySelector('.login-card');
    if (!card || card.dataset.telemonteBrand === '1') return;

    const oldLogo = card.querySelector('.login-logo');
    const logo = makeImg('telemonte-login-logo', LOGO_SRC, 'Telemonte');
    if (oldLogo) oldLogo.before(logo);
    else card.prepend(logo);

    card.classList.add('branding-ready');
    card.dataset.telemonteBrand = '1';
  }

  function enhanceSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const brand = sidebar?.querySelector('.brand');
    if (!sidebar || !brand || brand.dataset.telemonteBrand === '1') return;

    const wrap = document.createElement('div');
    wrap.className = 'telemonte-sidebar-logo-wrap';
    wrap.appendChild(makeImg('telemonte-sidebar-logo', LOGO_SRC, 'Telemonte'));

    const markWrap = document.createElement('div');
    markWrap.className = 'telemonte-sidebar-mark';
    markWrap.appendChild(makeImg('telemonte-sidebar-mark-img', MARK_SRC, 'Telemonte'));

    brand.prepend(markWrap);
    brand.prepend(wrap);
    sidebar.classList.add('branding-ready');
    brand.dataset.telemonteBrand = '1';
  }

  function applyBranding() {
    scheduled = false;
    enhanceLogin();
    enhanceSidebar();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(applyBranding);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyBranding, { once: true });
  } else {
    applyBranding();
  }
})();

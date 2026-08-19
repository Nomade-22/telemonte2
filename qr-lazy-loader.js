(() => {
  'use strict';

  const loaded = new Map();
  let replaying = false;

  function loadScript(key, src, globalName) {
    if (globalName && window[globalName]) return Promise.resolve();
    if (loaded.has(key)) return loaded.get(key);

    const promise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-lazy-lib="${key}"]`);
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.lazyLib = key;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Falha ao carregar ${key}`));
      document.head.appendChild(script);
    });

    loaded.set(key, promise);
    return promise;
  }

  const ensureQrGenerator = () => loadScript(
    'qrcode',
    'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js',
    'QRCode'
  );

  const ensureQrScanner = () => loadScript(
    'html5-qrcode',
    'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
    'Html5Qrcode'
  );

  document.addEventListener('click', async (event) => {
    if (replaying) return;
    const button = event.target.closest('[data-cc-action]');
    if (!button) return;

    const action = button.dataset.ccAction;
    const needsGenerator = ['qr', 'print-one', 'print-all'].includes(action) && !window.QRCode;
    const needsScanner = action === 'scan' && !window.Html5Qrcode;
    if (!needsGenerator && !needsScanner) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = 'Carregando...';

    try {
      if (needsGenerator) await ensureQrGenerator();
      if (needsScanner) await ensureQrScanner();
      button.disabled = false;
      button.textContent = oldText;
      replaying = true;
      button.click();
      replaying = false;
    } catch (error) {
      button.disabled = false;
      button.textContent = oldText;
      alert('Não foi possível carregar o recurso de QR agora. Verifique a internet e tente novamente.');
    }
  }, true);

  window.TMEnsureQrGenerator = ensureQrGenerator;
  window.TMEnsureQrScanner = ensureQrScanner;
})();

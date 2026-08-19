(() => {
  'use strict';

  const NativeMutationObserver = window.MutationObserver;
  if (!NativeMutationObserver || window.__telemonteDebouncedMutationObserver) return;

  class DebouncedMutationObserver {
    constructor(callback) {
      let queued = false;
      let buffered = [];
      this._observer = new NativeMutationObserver((records) => {
        buffered.push(...records);
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          const batch = buffered;
          buffered = [];
          callback(batch, this);
        });
      });
    }
    observe(target, options) { return this._observer.observe(target, options); }
    disconnect() { return this._observer.disconnect(); }
    takeRecords() { return this._observer.takeRecords(); }
  }

  window.MutationObserver = DebouncedMutationObserver;
  window.__telemonteDebouncedMutationObserver = true;
})();

(() => {
  'use strict';

  const CONFIG_KEY = 'telemonte-cloud-config-v1';
  const DB_KEY = 'telemonte-db-v3';
  const SESSION_KEY = 'telemonte-session-v2';
  const CONTAINERS_KEY = 'telemonte-containers-control-v1';
  const ORG_ID = '11111111-1111-4111-8111-111111111111';
  const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  const EMAIL_DOMAIN = 'telemonte.app';

  let client = null;
  let channel = null;
  let libraryPromise = null;
  let syncTimer = null;
  let pullTimer = null;
  let suppressLocalSync = false;
  let lastCloudError = '';

  const readConfig = () => {
    try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') || {}; }
    catch { return {}; }
  };

  const saveConfig = (config) => localStorage.setItem(CONFIG_KEY, JSON.stringify(config));

  const localUser = () => {
    try {
      const db = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
      const id = localStorage.getItem(SESSION_KEY);
      return db?.users?.find(u => u.id === id && u.active) || null;
    } catch { return null; }
  };

  function loadSupabaseLibrary() {
    if (window.supabase?.createClient) return Promise.resolve();
    if (libraryPromise) return libraryPromise;
    libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SUPABASE_CDN;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Não foi possível carregar a biblioteca do Supabase.'));
      document.head.appendChild(script);
    });
    return libraryPromise;
  }

  async function getClient() {
    const cfg = readConfig();
    if (!cfg.enabled || !cfg.url || !cfg.publishableKey) return null;
    if (client) return client;
    await loadSupabaseLibrary();
    client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return client;
  }

  function usernameToEmail(username) {
    const safe = String(username || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    return safe ? `${safe}@${EMAIL_DOMAIN}` : '';
  }

  async function cloudSession() {
    const sb = await getClient();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data?.session || null;
  }

  async function signInCloud(username, password) {
    const sb = await getClient();
    if (!sb) return false;
    const email = usernameToEmail(username);
    if (!email) return false;
    setBadge('connecting');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      lastCloudError = error.message || 'Falha na autenticação da nuvem.';
      setBadge('auth-error');
      return false;
    }
    if (data?.session) {
      await verifyMembership();
      await initialContainerSync();
      subscribeContainers();
      setBadge('online');
      return true;
    }
    return false;
  }

  async function verifyMembership() {
    const sb = await getClient();
    const session = await cloudSession();
    if (!sb || !session) throw new Error('Sessão online ausente.');
    const { data, error } = await sb
      .from('organization_members')
      .select('role,active')
      .eq('organization_id', ORG_ID)
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data?.active) throw new Error('Usuário não está vinculado à organização Telemonte no banco online.');
    return data;
  }

  function localContainers() {
    try {
      const arr = JSON.parse(localStorage.getItem(CONTAINERS_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  function cloudRowFromItem(item, userId) {
    return {
      organization_id: ORG_ID,
      code: item.code,
      number: Number(item.number),
      capacity: String(item.capacity || ''),
      status: String(item.status || 'Disponível no pátio'),
      location: String(item.location || 'Pátio Telemonte'),
      client_name: String(item.client || ''),
      gps: String(item.gps || ''),
      history: Array.isArray(item.history) ? item.history : [],
      updated_by: userId
    };
  }

  function localItemFromRow(row) {
    return {
      id: row.code,
      number: Number(row.number),
      code: row.code,
      capacity: row.capacity || '',
      status: row.status || 'Disponível no pátio',
      location: row.location || 'Pátio Telemonte',
      client: row.client_name || '',
      gps: row.gps || '',
      updatedAt: row.updated_at ? new Date(row.updated_at).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR'),
      history: Array.isArray(row.history) ? row.history : []
    };
  }

  async function pushContainers(items = localContainers()) {
    const sb = await getClient();
    const session = await cloudSession();
    if (!sb || !session || !Array.isArray(items) || !items.length) return false;
    const rows = items.map(item => cloudRowFromItem(item, session.user.id));
    const { error } = await sb.from('containers').upsert(rows, { onConflict: 'organization_id,code' });
    if (error) {
      lastCloudError = error.message || 'Falha ao sincronizar caçambas.';
      setBadge('error');
      return false;
    }
    setBadge('online');
    return true;
  }

  async function pullContainers({ reload = false } = {}) {
    const sb = await getClient();
    const session = await cloudSession();
    if (!sb || !session) return false;
    const { data, error } = await sb
      .from('containers')
      .select('*')
      .eq('organization_id', ORG_ID)
      .order('number', { ascending: true });
    if (error) {
      lastCloudError = error.message || 'Falha ao receber dados da nuvem.';
      setBadge('error');
      return false;
    }
    if (!data?.length) {
      return pushContainers();
    }
    const incoming = data.map(localItemFromRow);
    const before = JSON.stringify(localContainers());
    const after = JSON.stringify(incoming);
    if (before !== after) {
      suppressLocalSync = true;
      localStorage.setItem(CONTAINERS_KEY, after);
      suppressLocalSync = false;
      window.dispatchEvent(new CustomEvent('telemonte-cloud-containers-updated'));
      if (reload) location.reload();
    }
    setBadge('online');
    return true;
  }

  async function initialContainerSync() {
    try {
      await verifyMembership();
      await pullContainers({ reload: false });
    } catch (error) {
      lastCloudError = error?.message || String(error);
      setBadge('error');
    }
  }

  function schedulePush() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => pushContainers(), 600);
  }

  function schedulePull() {
    clearTimeout(pullTimer);
    pullTimer = setTimeout(() => pullContainers({ reload: false }), 350);
  }

  async function subscribeContainers() {
    const sb = await getClient();
    const session = await cloudSession();
    if (!sb || !session) return;
    if (channel) { try { await sb.removeChannel(channel); } catch {} }
    channel = sb
      .channel(`telemonte-containers-${ORG_ID}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'containers', filter: `organization_id=eq.${ORG_ID}`
      }, payload => {
        if (payload?.new?.updated_by && payload.new.updated_by === session.user.id) return;
        schedulePull();
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') setBadge('online');
      });
  }

  function patchLocalStorage() {
    if (Storage.prototype.__telemonteCloudPatched) return;
    Storage.prototype.__telemonteCloudPatched = true;
    const originalSet = Storage.prototype.setItem;
    const originalRemove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function(key, value) {
      originalSet.call(this, key, value);
      if (this === localStorage && key === CONTAINERS_KEY && !suppressLocalSync) schedulePush();
    };
    Storage.prototype.removeItem = function(key) {
      originalRemove.call(this, key);
      if (this === localStorage && key === SESSION_KEY && client) client.auth.signOut().catch(() => {});
    };
  }

  function badgeText(mode) {
    if (mode === 'online') return '☁ Nuvem conectada';
    if (mode === 'connecting') return '☁ Conectando...';
    if (mode === 'auth-error') return '☁ Login local';
    if (mode === 'error') return '⚠ Nuvem com erro';
    if (mode === 'configured') return '☁ Nuvem aguardando login';
    return '● Modo local';
  }

  function setBadge(mode) {
    const badge = document.querySelector('.status-dot');
    if (!badge) return;
    const cfg = readConfig();
    badge.classList.add('cloud-status');
    badge.dataset.cloudMode = mode;
    badge.textContent = badgeText(mode);
    badge.title = mode === 'error' || mode === 'auth-error'
      ? (lastCloudError || 'Clique para configurar o banco online.')
      : (cfg.enabled ? 'Sincronização do banco online' : 'Clique para configurar o banco online');
    badge.onclick = () => {
      const u = localUser();
      if (u?.role === 'admin') openConfigModal();
    };
  }

  function cloudModalHtml(cfg) {
    return `<div class="cloud-modal-backdrop" id="cloud-modal-backdrop">
      <div class="cloud-modal">
        <div class="cloud-modal-head"><div><small>BANCO ONLINE</small><h3>Conectar Supabase</h3></div><button type="button" id="cloud-close">×</button></div>
        <p>Informe apenas a URL do projeto e a <b>Publishable Key</b>. Nunca use Secret Key ou service_role no navegador.</p>
        <form id="cloud-config-form">
          <label>URL do projeto<input name="url" type="url" placeholder="https://xxxxx.supabase.co" value="${escapeHtml(cfg.url || '')}" required></label>
          <label>Publishable Key<input name="publishableKey" type="password" placeholder="sb_publishable_..." value="${escapeHtml(cfg.publishableKey || '')}" required></label>
          <label class="cloud-switch"><input name="enabled" type="checkbox" ${cfg.enabled ? 'checked' : ''}> Ativar sincronização online</label>
          <div id="cloud-test-result" class="cloud-test-result"></div>
          <div class="cloud-actions"><button type="button" id="cloud-test">Testar conexão</button><button class="primary" type="submit">Salvar e conectar</button></div>
        </form>
        <small class="cloud-help">Organização: Telemonte • Primeira fase: sincronização em tempo real do Controle de Caçambas.</small>
      </div>
    </div>`;
  }

  const escapeHtml = value => String(value || '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

  function openConfigModal() {
    document.getElementById('cloud-modal-backdrop')?.remove();
    document.body.insertAdjacentHTML('beforeend', cloudModalHtml(readConfig()));
    document.getElementById('cloud-close')?.addEventListener('click', () => document.getElementById('cloud-modal-backdrop')?.remove());
    document.getElementById('cloud-modal-backdrop')?.addEventListener('click', e => { if (e.target.id === 'cloud-modal-backdrop') e.currentTarget.remove(); });
    document.getElementById('cloud-test')?.addEventListener('click', testFromForm);
    document.getElementById('cloud-config-form')?.addEventListener('submit', saveFromForm);
  }

  function formConfig() {
    const form = document.getElementById('cloud-config-form');
    const f = new FormData(form);
    return {
      url: String(f.get('url') || '').trim().replace(/\/$/, ''),
      publishableKey: String(f.get('publishableKey') || '').trim(),
      enabled: f.get('enabled') === 'on'
    };
  }

  async function testFromForm() {
    const result = document.getElementById('cloud-test-result');
    const cfg = formConfig();
    result.textContent = 'Testando...';
    try {
      await loadSupabaseLibrary();
      const temp = window.supabase.createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: false } });
      const { error } = await temp.from('organizations').select('id').limit(1);
      if (error && !String(error.message).toLowerCase().includes('jwt')) throw error;
      result.textContent = '✓ Projeto localizado. Agora salve e faça login para validar seu usuário.';
      result.className = 'cloud-test-result ok';
    } catch (error) {
      result.textContent = `✕ ${error?.message || 'Falha ao conectar.'}`;
      result.className = 'cloud-test-result error';
    }
  }

  function saveFromForm(e) {
    e.preventDefault();
    saveConfig(formConfig());
    document.getElementById('cloud-modal-backdrop')?.remove();
    location.reload();
  }

  function watchLoginForm() {
    document.addEventListener('submit', e => {
      if (e.target?.id !== 'login-form') return;
      const cfg = readConfig();
      if (!cfg.enabled) return;
      const username = document.getElementById('login-user')?.value || '';
      const password = document.getElementById('login-pass')?.value || '';
      setTimeout(() => signInCloud(username, password).catch(error => {
        lastCloudError = error?.message || String(error);
        setBadge('error');
      }), 50);
    }, true);
  }

  async function bootCloud() {
    const cfg = readConfig();
    if (!cfg.enabled || !cfg.url || !cfg.publishableKey) { setBadge('local'); return; }
    try {
      const sb = await getClient();
      const { data } = await sb.auth.getSession();
      if (data?.session) {
        await initialContainerSync();
        await subscribeContainers();
        setBadge('online');
      } else {
        setBadge('configured');
      }
    } catch (error) {
      lastCloudError = error?.message || String(error);
      setBadge('error');
    }
  }

  patchLocalStorage();
  watchLoginForm();

  const observer = new MutationObserver(() => {
    if (document.querySelector('.status-dot')) {
      observer.disconnect();
      bootCloud();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== 'loading' && document.querySelector('.status-dot')) bootCloud();

  window.TelemonteCloud = {
    openConfig: openConfigModal,
    pushContainers,
    pullContainers,
    signInCloud,
    readConfig
  };
})();

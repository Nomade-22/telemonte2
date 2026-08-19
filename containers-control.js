(() => {
  'use strict';

  const STORAGE_KEY = 'telemonte-containers-control-v1';
  const DB_KEYS = ['telemonte-db-v3','telemonte-db-v2','telemonte-db-v1'];
  const SESSION_KEY = 'telemonte-session-v2';
  const STATUSES = ['Disponível no pátio','Em cliente','Em transporte','Em coleta','Higienização','Manutenção'];
  let activeScanner = null;
  let deepLinkHandled = false;

  const esc = (value) => String(value ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');

  const nowLabel = () => new Date().toLocaleString('pt-BR');
  const codeFor = (n) => `C-${String(n).padStart(3,'0')}`;

  function seedItem(n){
    const code = codeFor(n);
    return {
      id: code,
      number: n,
      code,
      capacity: '',
      status: 'Disponível no pátio',
      location: 'Pátio Telemonte',
      client: '',
      gps: '',
      updatedAt: nowLabel(),
      history: [{
        at: nowLabel(),
        action: 'Cadastro inicial',
        fromStatus: '',
        toStatus: 'Disponível no pátio',
        fromLocation: '',
        toLocation: 'Pátio Telemonte',
        gps: '',
        notes: 'Caçamba cadastrada no controle patrimonial.',
        user: 'Sistema'
      }]
    };
  }

  function normalizeStore(raw){
    const arr = Array.isArray(raw) ? raw : [];
    const byCode = new Map(arr.map(x => [x.code || x.id, x]));
    const result = [];
    for(let n=1;n<=20;n++){
      const code = codeFor(n);
      const current = byCode.get(code);
      if(current){
        result.push({
          ...seedItem(n),
          ...current,
          id: code,
          code,
          number: n,
          history: Array.isArray(current.history) ? current.history : []
        });
      } else {
        result.push(seedItem(n));
      }
    }
    return result;
  }

  function loadStore(){
    try { return normalizeStore(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
    catch { return normalizeStore([]); }
  }

  function saveStore(items){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function getCurrentUser(){
    const sessionId = localStorage.getItem(SESSION_KEY);
    for(const key of DB_KEYS){
      try{
        const db = JSON.parse(localStorage.getItem(key) || 'null');
        const u = db?.users?.find(x => x.id === sessionId);
        if(u) return u;
      }catch{}
    }
    return null;
  }

  function qrUrl(code){
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('container', code);
    return url.toString();
  }

  function getItem(code){ return loadStore().find(x => x.code === code); }
  function formatCapacity(item){ return item.capacity?.trim() || 'Tamanho não informado'; }
  function countByStatus(items, status){ return items.filter(x => x.status === status).length; }

  function renderControl(selectedCode=''){
    const content = document.querySelector('.content');
    if(!content) return;
    const items = loadStore();
    const available = countByStatus(items,'Disponível no pátio');
    const clients = countByStatus(items,'Em cliente');
    const transit = countByStatus(items,'Em transporte') + countByStatus(items,'Em coleta');
    const maintenance = countByStatus(items,'Manutenção') + countByStatus(items,'Higienização');

    content.dataset.containerControl = '1';
    content.innerHTML = `
      <section class="cc-wrap">
        <div class="cc-head">
          <div>
            <span class="cc-eyebrow">PATRIMÔNIO • MOVIMENTAÇÃO • QR CODE</span>
            <h2>Controle de Caçambas</h2>
            <p>20 caçambas numeradas com QR individual, localização, status e histórico completo.</p>
          </div>
          <div class="cc-head-actions">
            <button class="primary cc-scan" type="button" data-cc-action="scan">▣ Ler QR Code</button>
            <button type="button" data-cc-action="print-all">Imprimir 20 etiquetas QR</button>
          </div>
        </div>

        <div class="cc-kpis">
          <article><span>Total cadastrado</span><strong>20</strong><small>C-001 a C-020</small></article>
          <article><span>Disponíveis</span><strong>${available}</strong><small>no pátio</small></article>
          <article><span>Em clientes</span><strong>${clients}</strong><small>instaladas</small></article>
          <article><span>Em movimento</span><strong>${transit}</strong><small>transporte/coleta</small></article>
          <article><span>Indisponíveis</span><strong>${maintenance}</strong><small>higienização/manutenção</small></article>
        </div>

        <div class="cc-toolbar panel">
          <input id="cc-search" class="search" placeholder="Buscar nº, código, tamanho, cliente ou localização..." autocomplete="off">
          <select id="cc-status-filter">
            <option value="">Todos os status</option>
            ${STATUSES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
          </select>
          <button type="button" data-cc-action="export">Exportar cadastro</button>
        </div>

        <div class="cc-grid" id="cc-grid">
          ${items.map(item => cardHTML(item)).join('')}
        </div>
      </section>
      <div id="cc-modal-root"></div>`;

    const title = document.querySelector('.topbar h1');
    if(title) title.textContent = 'Controle de Caçambas';

    bindControlEvents();
    if(selectedCode){
      const item = getItem(selectedCode);
      if(item) setTimeout(() => openDetails(item.code), 0);
    }
  }

  function cardHTML(item){
    const latest = item.history?.[0];
    return `<article class="cc-card" data-search="${esc([item.number,item.code,item.capacity,item.status,item.location,item.client].join(' ').toLowerCase())}" data-status="${esc(item.status)}">
      <div class="cc-card-top">
        <div><span>CAÇAMBA ${String(item.number).padStart(2,'0')}</span><strong>${esc(item.code)}</strong></div>
        <span class="cc-status ${statusClass(item.status)}">${esc(item.status)}</span>
      </div>
      <div class="cc-card-body">
        <div><small>Tamanho / capacidade</small><b>${esc(formatCapacity(item))}</b></div>
        <div><small>Localização atual</small><b>${esc(item.location || 'Não informada')}</b></div>
        <div><small>Cliente</small><b>${esc(item.client || '—')}</b></div>
        <div><small>Última atualização</small><b>${esc(item.updatedAt || latest?.at || '—')}</b></div>
      </div>
      <div class="cc-card-actions">
        <button type="button" data-cc-action="details" data-code="${item.code}">Detalhes</button>
        <button class="primary" type="button" data-cc-action="move" data-code="${item.code}">Movimentar</button>
        <button type="button" data-cc-action="qr" data-code="${item.code}">QR</button>
        <button type="button" data-cc-action="edit" data-code="${item.code}">Editar tamanho</button>
      </div>
    </article>`;
  }

  function statusClass(status){
    if(status === 'Disponível no pátio') return 'cc-ok';
    if(status === 'Em cliente') return 'cc-client';
    if(status === 'Em transporte' || status === 'Em coleta') return 'cc-move';
    if(status === 'Manutenção') return 'cc-danger';
    return 'cc-warn';
  }

  function bindControlEvents(){
    const search = document.getElementById('cc-search');
    const filter = document.getElementById('cc-status-filter');
    const apply = () => {
      const q = (search?.value || '').trim().toLowerCase();
      const s = filter?.value || '';
      document.querySelectorAll('.cc-card').forEach(card => {
        const matchQ = !q || card.dataset.search.includes(q);
        const matchS = !s || card.dataset.status === s;
        card.hidden = !(matchQ && matchS);
      });
    };
    search?.addEventListener('input', apply);
    filter?.addEventListener('change', apply);
  }

  function modal(inner, wide=false){
    const root = document.getElementById('cc-modal-root') || document.body;
    const wrap = document.createElement('div');
    wrap.className = 'cc-modal-backdrop';
    wrap.innerHTML = `<div class="cc-modal ${wide?'cc-modal-wide':''}">${inner}</div>`;
    root.appendChild(wrap);
    wrap.addEventListener('click', e => { if(e.target === wrap) closeModal(); });
    return wrap;
  }

  function closeModal(){
    if(activeScanner){ try{ activeScanner.stop().catch(()=>{}); activeScanner.clear().catch(()=>{}); }catch{} activeScanner = null; }
    document.querySelectorAll('.cc-modal-backdrop').forEach(x => x.remove());
  }

  function openDetails(code){
    const item = getItem(code); if(!item) return;
    const history = item.history || [];
    modal(`
      <div class="cc-modal-head"><div><span>CAÇAMBA ${String(item.number).padStart(2,'0')}</span><h3>${esc(item.code)} • ${esc(formatCapacity(item))}</h3></div><button class="cc-close" data-cc-action="close">×</button></div>
      <div class="cc-detail-summary">
        <div><small>Status</small><strong class="cc-status ${statusClass(item.status)}">${esc(item.status)}</strong></div>
        <div><small>Localização</small><strong>${esc(item.location||'—')}</strong></div>
        <div><small>Cliente</small><strong>${esc(item.client||'—')}</strong></div>
        <div><small>GPS</small><strong>${esc(item.gps||'—')}</strong></div>
      </div>
      <div class="cc-detail-actions"><button class="primary" data-cc-action="move" data-code="${item.code}">Registrar movimentação</button><button data-cc-action="qr" data-code="${item.code}">Ver QR Code</button><button data-cc-action="edit" data-code="${item.code}">Editar tamanho</button></div>
      <h4 class="cc-history-title">Histórico de movimentações</h4>
      <div class="cc-history">${history.length ? history.map(h => `
        <div class="cc-history-item">
          <div class="cc-history-dot"></div>
          <div><strong>${esc(h.action || 'Movimentação')}</strong><span>${esc(h.at||'')}</span>
          <p>${h.fromStatus ? `${esc(h.fromStatus)} → ` : ''}<b>${esc(h.toStatus||'')}</b><br>${h.fromLocation ? `${esc(h.fromLocation)} → ` : ''}${esc(h.toLocation||'')}</p>
          ${h.gps?`<small>GPS: ${esc(h.gps)}</small>`:''}${h.notes?`<small>${esc(h.notes)}</small>`:''}<small>Registrado por: ${esc(h.user||'Sistema')}</small></div>
        </div>`).join('') : '<p>Nenhuma movimentação registrada.</p>'}</div>
    `, true);
  }

  function openMove(code){
    const item = getItem(code); if(!item) return;
    modal(`
      <div class="cc-modal-head"><div><span>MOVIMENTAÇÃO</span><h3>${esc(item.code)} • Caçamba ${String(item.number).padStart(2,'0')}</h3></div><button class="cc-close" data-cc-action="close">×</button></div>
      <div class="cc-current"><small>Atual</small><b>${esc(item.status)}</b><span>${esc(item.location||'—')}</span></div>
      <form id="cc-move-form" class="cc-form">
        <label>Novo status<select name="status" required>${STATUSES.map(s=>`<option ${s===item.status?'selected':''}>${esc(s)}</option>`).join('')}</select></label>
        <label>Nova localização<input name="location" value="${esc(item.location||'')}" placeholder="Ex.: Hospital X, Pátio, Caminhão 07" required></label>
        <label>Cliente / unidade<input name="client" value="${esc(item.client||'')}" placeholder="Preencha quando estiver em cliente"></label>
        <label>Observação<textarea name="notes" rows="3" placeholder="Motivo, coleta realizada, avaria, troca de caçamba..."></textarea></label>
        <label>GPS atual<div class="cc-gps-row"><input id="cc-gps" name="gps" value="${esc(item.gps||'')}" placeholder="Latitude, longitude" readonly><button type="button" data-cc-action="gps">Capturar GPS</button></div></label>
        <div class="cc-form-actions"><button type="button" data-cc-action="close">Cancelar</button><button class="primary" type="submit">Salvar movimentação</button></div>
      </form>`);
    document.getElementById('cc-move-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      registerMove(code, {
        status: String(f.get('status')||''),
        location: String(f.get('location')||'').trim(),
        client: String(f.get('client')||'').trim(),
        notes: String(f.get('notes')||'').trim(),
        gps: String(f.get('gps')||'').trim()
      });
    });
  }

  function registerMove(code, next){
    const items = loadStore();
    const item = items.find(x => x.code === code); if(!item) return;
    const user = getCurrentUser();
    const previous = {...item};
    item.status = next.status;
    item.location = next.location;
    item.client = next.client;
    item.gps = next.gps;
    item.updatedAt = nowLabel();
    item.history = Array.isArray(item.history) ? item.history : [];
    item.history.unshift({
      at: item.updatedAt,
      action: 'Movimentação registrada',
      fromStatus: previous.status,
      toStatus: item.status,
      fromLocation: previous.location,
      toLocation: item.location,
      gps: item.gps,
      notes: next.notes,
      user: user?.name || user?.username || 'Usuário'
    });
    saveStore(items);
    closeModal();
    renderControl();
    setTimeout(()=>openDetails(code), 0);
  }

  function editCapacity(code){
    const item = getItem(code); if(!item) return;
    modal(`
      <div class="cc-modal-head"><div><span>CADASTRO</span><h3>${esc(item.code)} • Caçamba ${String(item.number).padStart(2,'0')}</h3></div><button class="cc-close" data-cc-action="close">×</button></div>
      <form id="cc-edit-form" class="cc-form">
        <label>Tamanho / capacidade<input name="capacity" value="${esc(item.capacity||'')}" placeholder="Ex.: 5 m³, 7 m³, 10 m³" autofocus required></label>
        <p class="cc-help">O número e o código permanecem fixos para o QR Code não perder a identificação.</p>
        <div class="cc-form-actions"><button type="button" data-cc-action="close">Cancelar</button><button class="primary">Salvar tamanho</button></div>
      </form>`);
    document.getElementById('cc-edit-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const capacity = String(new FormData(e.currentTarget).get('capacity')||'').trim();
      const items = loadStore();
      const x = items.find(v=>v.code===code); if(!x) return;
      x.capacity = capacity;
      x.updatedAt = nowLabel();
      x.history = Array.isArray(x.history) ? x.history : [];
      x.history.unshift({at:x.updatedAt,action:'Cadastro atualizado',fromStatus:x.status,toStatus:x.status,fromLocation:x.location,toLocation:x.location,gps:x.gps,notes:`Tamanho/capacidade definido como ${capacity}.`,user:getCurrentUser()?.name||'Usuário'});
      saveStore(items); closeModal(); renderControl();
    });
  }

  function openQr(code){
    const item = getItem(code); if(!item) return;
    modal(`
      <div class="cc-modal-head"><div><span>ETIQUETA QR</span><h3>${esc(item.code)} • Caçamba ${String(item.number).padStart(2,'0')}</h3></div><button class="cc-close" data-cc-action="close">×</button></div>
      <div class="cc-qr-layout"><div id="cc-qr-box"></div><div><strong>${esc(formatCapacity(item))}</strong><p>Ao ler este QR pelo celular, o sistema abre diretamente o cadastro desta caçamba.</p><code>${esc(qrUrl(code))}</code></div></div>
      <div class="cc-form-actions"><button data-cc-action="close">Fechar</button><button class="primary" data-cc-action="print-one" data-code="${code}">Imprimir etiqueta</button></div>`);
    setTimeout(() => drawQr('cc-qr-box', qrUrl(code), 220), 0);
  }

  function drawQr(elementId, text, size=220){
    const el = document.getElementById(elementId); if(!el) return;
    el.innerHTML='';
    if(window.QRCode){ new window.QRCode(el,{text,width:size,height:size,correctLevel:window.QRCode.CorrectLevel.H}); }
    else el.textContent='Biblioteca de QR não carregada.';
  }

  function qrDataUrl(text){
    if(!window.QRCode) return '';
    const holder = document.createElement('div');
    holder.style.position='fixed';holder.style.left='-10000px';holder.style.top='-10000px';
    document.body.appendChild(holder);
    new window.QRCode(holder,{text,width:240,height:240,correctLevel:window.QRCode.CorrectLevel.H});
    const canvas = holder.querySelector('canvas');
    const img = holder.querySelector('img');
    const data = canvas?.toDataURL('image/png') || img?.src || '';
    holder.remove();
    return data;
  }

  function printLabels(codes){
    const items = loadStore().filter(x => codes.includes(x.code));
    const labels = items.map(item => ({item, img: qrDataUrl(qrUrl(item.code))}));
    const win = window.open('','_blank','width=1000,height=800');
    if(!win){ alert('Permita pop-ups para imprimir as etiquetas.'); return; }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas QR Telemonte</title><style>
      @page{size:A4;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:7mm}.label{border:2px solid #111;border-radius:8px;padding:6mm;display:grid;grid-template-columns:42mm 1fr;gap:5mm;align-items:center;break-inside:avoid;min-height:55mm}.label img{width:40mm;height:40mm}.brand{font-size:11px;font-weight:800;letter-spacing:.12em}.code{font-size:26px;font-weight:900;margin:4px 0}.num{font-size:15px;font-weight:700}.cap{font-size:13px;margin-top:6px}.hint{font-size:8px;margin-top:7px;color:#444}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Imprimir</button><div class="grid">${labels.map(({item,img})=>`<div class="label"><img src="${img}"><div><div class="brand">TELEMONTE</div><div class="num">CAÇAMBA ${String(item.number).padStart(2,'0')}</div><div class="code">${esc(item.code)}</div><div class="cap">${esc(formatCapacity(item))}</div><div class="hint">Leia o QR para identificação e movimentação.</div></div></div>`).join('')}</div><script>setTimeout(()=>window.print(),500)<\/script></body></html>`);
    win.document.close();
  }

  function openScanner(){
    modal(`
      <div class="cc-modal-head"><div><span>LEITOR</span><h3>Ler QR Code da caçamba</h3></div><button class="cc-close" data-cc-action="close">×</button></div>
      <div id="cc-reader" class="cc-reader"></div>
      <p class="cc-help">Aponte a câmera para a etiqueta. Se a câmera não abrir, digite o código abaixo.</p>
      <div class="cc-manual"><input id="cc-manual-code" placeholder="Ex.: C-007" autocapitalize="characters"><button class="primary" data-cc-action="manual-open">Abrir</button></div>`);

    if(!window.Html5Qrcode){
      document.getElementById('cc-reader').innerHTML='<div class="cc-reader-error">Leitor de câmera indisponível. Use o código manual.</div>';
      return;
    }
    try{
      activeScanner = new window.Html5Qrcode('cc-reader');
      activeScanner.start(
        {facingMode:'environment'},
        {fps:10,qrbox:{width:240,height:240},aspectRatio:1},
        decoded => handleScanned(decoded),
        () => {}
      ).catch(() => {
        const reader=document.getElementById('cc-reader');
        if(reader) reader.innerHTML='<div class="cc-reader-error">Não foi possível acessar a câmera. Autorize a câmera ou digite o código manual.</div>';
      });
    }catch{
      const reader=document.getElementById('cc-reader');
      if(reader) reader.innerHTML='<div class="cc-reader-error">Câmera indisponível.</div>';
    }
  }

  function parseCode(value){
    let text = String(value||'').trim().toUpperCase();
    try{
      const u = new URL(text);
      const c = u.searchParams.get('container');
      if(c) text = c.toUpperCase();
    }catch{}
    const match = text.match(/C-?0*(\d{1,3})/i);
    if(!match) return '';
    const n = Number(match[1]);
    if(n < 1 || n > 20) return '';
    return codeFor(n);
  }

  function handleScanned(value){
    const code = parseCode(value);
    if(!code) return;
    const finish = () => { activeScanner=null; closeModal(); renderControl(code); };
    if(activeScanner){ activeScanner.stop().then(finish).catch(finish); }
    else finish();
  }

  function captureGps(){
    const input = document.getElementById('cc-gps');
    if(!input) return;
    if(!navigator.geolocation){ alert('GPS não disponível neste aparelho.'); return; }
    input.value='Obtendo localização...';
    navigator.geolocation.getCurrentPosition(pos => {
      input.value=`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)} (±${Math.round(pos.coords.accuracy)} m)`;
    }, () => {
      input.value=''; alert('Não foi possível acessar o GPS. Verifique a permissão de localização.');
    }, {enableHighAccuracy:true,timeout:12000,maximumAge:15000});
  }

  function exportData(){
    const blob = new Blob([JSON.stringify(loadStore(),null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`telemonte-cacambas-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  function injectDriverButton(){
    const u = getCurrentUser();
    if(u?.role !== 'driver') return;
    const nav = document.querySelector('.sidebar nav'); if(!nav || nav.querySelector('[data-container-control-button]')) return;
    const target = nav.querySelector('.nav-group[data-group="operacao"] .nav-group-items') || nav;
    const btn=document.createElement('button');
    btn.type='button';btn.dataset.containerControlButton='1';btn.title='Movimentar Caçamba';
    btn.innerHTML='<span class="nav-icon" aria-hidden="true">▣</span><span class="nav-label">Movimentar Caçamba</span>';
    btn.addEventListener('click', e=>{e.preventDefault();e.stopPropagation();renderControl();closeMobileMenu();});
    target.appendChild(btn);
  }

  function closeMobileMenu(){
    document.body.classList.remove('mobile-nav-open');
    document.querySelector('.mobile-nav-overlay')?.classList.remove('show');
  }

  function enhanceCurrentPage(){
    injectDriverButton();
    const title = document.querySelector('.topbar h1')?.textContent?.trim();
    const content = document.querySelector('.content');
    if(title === 'Caçambas' && content && content.dataset.containerControl !== '1') renderControl();
    if(title === 'Dashboard') updateDashboardCounts();
    handleDeepLink();
  }

  function updateDashboardCounts(){
    const items=loadStore();
    document.querySelectorAll('.card').forEach(card=>{
      const label=card.querySelector('span')?.textContent?.trim();
      if(label==='Caçambas em clientes'){
        const strong=card.querySelector('strong'), small=card.querySelector('small');
        if(strong) strong.textContent=String(items.filter(x=>x.status==='Em cliente').length);
        if(small) small.textContent=`${items.filter(x=>x.status==='Disponível no pátio').length} disponíveis • 20 cadastradas`;
      }
    });
  }

  function handleDeepLink(){
    if(deepLinkHandled) return;
    const code=parseCode(new URL(window.location.href).searchParams.get('container')||'');
    if(!code) return;
    const user=getCurrentUser(); if(!user) return;
    deepLinkHandled=true;
    const cacambaButton=document.querySelector('[data-page="Caçambas"]');
    if(user.role!=='driver' && cacambaButton){
      cacambaButton.click();
      setTimeout(()=>renderControl(code),150);
    } else {
      renderControl(code);
    }
  }

  document.addEventListener('click', e => {
    const btn=e.target.closest('[data-cc-action]'); if(!btn) return;
    const action=btn.dataset.ccAction, code=btn.dataset.code;
    if(action==='close') closeModal();
    if(action==='details') openDetails(code);
    if(action==='move') { closeModal(); openMove(code); }
    if(action==='edit') { closeModal(); editCapacity(code); }
    if(action==='qr') { closeModal(); openQr(code); }
    if(action==='print-one') printLabels([code]);
    if(action==='print-all') printLabels(loadStore().map(x=>x.code));
    if(action==='scan') openScanner();
    if(action==='gps') captureGps();
    if(action==='export') exportData();
    if(action==='manual-open'){
      const c=parseCode(document.getElementById('cc-manual-code')?.value||'');
      if(!c){alert('Código inválido. Use C-001 até C-020.');return;}
      closeModal();renderControl(c);
    }
  });

  const observer = new MutationObserver(() => enhanceCurrentPage());
  observer.observe(document.documentElement,{subtree:true,childList:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',enhanceCurrentPage);
  else enhanceCurrentPage();

  window.TMC = { renderControl, openScanner, openDetails, openMove, printLabels };
})();
(() => {
  'use strict';

  const DB_KEY='telemonte-db-v3';
  const SESSION_KEY='telemonte-session-v2';
  const ORDERS_KEY='telemonte-collection-orders-v1';
  const POINTS_KEY='telemonte-pickup-points-v1';
  const MEDIA_DB='telemonte-media-v1';
  let activeScanner=null;
  let observerTimer=null;

  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const readJSON=(key,fallback)=>{try{const x=JSON.parse(localStorage.getItem(key)||'null');return x??fallback}catch{return fallback}};
  const writeJSON=(key,v)=>localStorage.setItem(key,JSON.stringify(v));
  const db=()=>readJSON(DB_KEY,{users:[],clients:[]});
  const orders=()=>{const x=readJSON(ORDERS_KEY,[]);return Array.isArray(x)?x:[]};
  const points=()=>{const x=readJSON(POINTS_KEY,[]);return Array.isArray(x)?x:[]};
  const currentUser=()=>{const d=db(),id=localStorage.getItem(SESSION_KEY);return d.users?.find(x=>x.id===id&&x.active)||null};
  const clientName=id=>db().clients?.find(x=>x.id===id)?.name||'Cliente';
  const point=id=>points().find(x=>x.id===id)||null;
  const nowLabel=()=>new Date().toLocaleString('pt-BR');
  const statusClass=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll(' ','-');

  function getOrder(id){return orders().find(o=>o.id===id)}
  function saveOrder(order,action=''){
    const list=orders(),i=list.findIndex(x=>x.id===order.id);if(i<0)return;
    order.updatedAt=nowLabel();order.history=Array.isArray(order.history)?order.history:[];
    if(action)order.history.unshift({at:order.updatedAt,action,user:currentUser()?.name||'Motorista'});
    list[i]=order;writeJSON(ORDERS_KEY,list);refreshPanel();
  }
  function execution(order){order.execution=order.execution||{};return order.execution}

  function assignedOrders(){
    const u=currentUser();if(!u)return[];
    const list=orders().filter(o=>o.status!=='Cancelada');
    const filtered=u.role==='driver'?list.filter(o=>String(o.driver||'').trim().toLowerCase()===String(u.name||'').trim().toLowerCase()):list.filter(o=>o.driver);
    return filtered.sort((a,b)=>`${a.scheduledDate||''} ${a.scheduledTime||''}`.localeCompare(`${b.scheduledDate||''} ${b.scheduledTime||''}`)).slice(0,30);
  }

  function stepState(o){
    const ex=o.execution||{};
    return [
      ['Rota',!!ex.startedAt||['Em rota','No cliente','Coletada','Destinada','Finalizada'].includes(o.status)],
      ['Chegada',!!ex.arrivedAt||['No cliente','Coletada','Destinada','Finalizada'].includes(o.status)],
      ['QR',!!ex.qrVerified],
      ['Coleta',!!ex.collectedAt||['Coletada','Destinada','Finalizada'].includes(o.status)],
      ['Conclusão',!!ex.clientCompletedAt||['Destinada','Finalizada'].includes(o.status)]
    ];
  }

  function actionHTML(o){
    const ex=o.execution||{};
    if(o.status==='Solicitada')return '<button disabled>Aguardando programação</button>';
    if(o.status==='Programada')return `<button class="primary" data-dx-action="start" data-id="${o.id}">▶ Iniciar atendimento</button>`;
    if(o.status==='Em rota')return `<button class="primary" data-dx-action="arrive" data-id="${o.id}">⌖ Cheguei ao cliente</button>`;
    if(['No cliente','Coletada'].includes(o.status)&&!ex.clientCompletedAt)return `<button class="primary" data-dx-action="execute" data-id="${o.id}">Abrir atendimento</button>`;
    if(o.status==='Coletada'&&ex.clientCompletedAt)return `<button data-dx-action="execute" data-id="${o.id}">Ver comprovantes</button>`;
    if(['Destinada','Finalizada'].includes(o.status))return `<button data-dx-action="execute" data-id="${o.id}">Ver atendimento</button>`;
    return '';
  }

  function cardHTML(o){
    const p=point(o.pointId),steps=stepState(o),ex=o.execution||{};
    return `<article class="driver-order-card">
      <div class="driver-order-top"><div><small>ORDEM DE COLETA</small><strong>${esc(o.code)}</strong></div><span class="driver-order-status ${statusClass(o.status)}">${esc(o.status)}</span></div>
      <div class="driver-order-body">
        <div><span>Cliente / ponto</span><b>${esc(clientName(o.clientId))}${p?` • ${esc(p.name)}`:''}</b></div>
        <div><span>Programação</span><b>${esc(o.scheduledDate||'—')} ${esc(o.scheduledTime||'')}</b></div>
        <div><span>Caçamba</span><b>${esc(o.containerCode||'Identificar por QR')}</b></div>
        <div><span>Caminhão</span><b>${o.vehicle?`Caminhão ${esc(o.vehicle)}`:'Não definido'}</b></div>
      </div>
      <div class="driver-progress">${steps.map(([n,done])=>`<div class="${done?'done':''}"><i></i>${n}</div>`).join('')}</div>
      <div class="dx-proof"><span class="${ex.arrivalGps?'ok':''}">GPS ${ex.arrivalGps?'✓':'—'}</span><span class="${ex.photoBeforeKey?'ok':''}">Foto antes ${ex.photoBeforeKey?'✓':'—'}</span><span class="${ex.photoAfterKey?'ok':''}">Foto depois ${ex.photoAfterKey?'✓':'—'}</span><span class="${ex.signature?'ok':''}">Assinatura ${ex.signature?'✓':'—'}</span></div>
      <div class="driver-order-actions"><button data-dx-action="details" data-id="${o.id}">Detalhes</button>${actionHTML(o)}</div>
    </article>`;
  }

  function panelHTML(){
    const u=currentUser(),list=assignedOrders();
    return `<section class="driver-orders" data-driver-orders="1">
      <div class="driver-orders-head"><div><span class="driver-orders-kicker">ORDENS • GPS • QR • FOTOS • ASSINATURA</span><h2>${u?.role==='driver'?'Minhas ordens de coleta':'Execução das ordens'}</h2><p>${u?.role==='driver'?'Atendimentos atribuídos ao motorista logado.':'Visão operacional para simular e acompanhar o fluxo do motorista.'}</p></div><button data-dx-action="refresh">Atualizar</button></div>
      <div class="driver-order-list">${list.length?list.map(cardHTML).join(''):'<div class="driver-empty"><strong>Nenhuma ordem atribuída</strong>Crie/programa uma Ordem de Coleta e selecione este motorista.</div>'}</div>
    </section>`;
  }

  function isDriverPage(){const t=document.querySelector('.topbar h1')?.textContent?.trim();return t==='Minha Rota'||t==='Área do Motorista'}
  function injectPanel(){
    if(!isDriverPage())return;
    const content=document.querySelector('.content');if(!content||content.querySelector('[data-driver-orders]'))return;
    content.insertAdjacentHTML('afterbegin',panelHTML());
  }
  function refreshPanel(){const old=document.querySelector('[data-driver-orders]');if(old)old.remove();injectPanel()}

  function modal(html,wide=false){
    closeModal();const wrap=document.createElement('div');wrap.className='dx-modal-backdrop';wrap.innerHTML=`<div class="dx-modal ${wide?'dx-modal-wide':''}">${html}</div>`;document.body.appendChild(wrap);wrap.addEventListener('click',e=>{if(e.target===wrap)closeModal()});return wrap;
  }
  function closeModal(){
    if(activeScanner){try{activeScanner.stop().catch(()=>{});activeScanner.clear().catch(()=>{})}catch{}activeScanner=null}
    document.querySelectorAll('.dx-modal-backdrop').forEach(x=>x.remove());
  }

  function details(id){
    const o=getOrder(id);if(!o)return;const p=point(o.pointId),ex=o.execution||{};
    modal(`<div class="dx-modal-head"><div><span>ORDEM DE COLETA</span><h3>${esc(o.code)}</h3></div><button class="dx-close" data-dx-action="close">×</button></div>
      <div class="dx-summary"><div><small>Cliente</small><b>${esc(clientName(o.clientId))}</b></div><div><small>Ponto</small><b>${esc(p?.name||'—')}</b></div><div><small>Endereço</small><b>${esc(p?.address||'—')}</b></div><div><small>Resíduo</small><b>${esc(o.wasteType||'—')} ${o.quantity?`• ${esc(o.quantity)} ${esc(o.unit||'')}`:''}</b></div><div><small>Caçamba</small><b>${esc(o.containerCode||'A identificar')}</b></div><div><small>Caminhão</small><b>${esc(o.vehicle||'—')}</b></div></div>
      ${p?.instructions?`<div class="dx-alert"><b>Instruções de acesso:</b> ${esc(p.instructions)}</div>`:''}
      <div class="dx-proof"><span class="${ex.startedAt?'ok':''}">Saída ${ex.startedAt?'✓':'—'}</span><span class="${ex.arrivedAt?'ok':''}">Chegada ${ex.arrivedAt?'✓':'—'}</span><span class="${ex.qrVerified?'ok':''}">QR ${ex.qrVerified?'✓':'—'}</span><span class="${ex.photoBeforeKey?'ok':''}">Antes ${ex.photoBeforeKey?'✓':'—'}</span><span class="${ex.photoAfterKey?'ok':''}">Depois ${ex.photoAfterKey?'✓':'—'}</span><span class="${ex.signature?'ok':''}">Assinatura ${ex.signature?'✓':'—'}</span></div>
      <div class="dx-footer"><button data-dx-action="close">Fechar</button>${['No cliente','Coletada'].includes(o.status)?`<button class="primary" data-dx-action="execute" data-id="${o.id}">Abrir atendimento</button>`:''}</div>`);
  }

  function gps(){
    return new Promise((resolve,reject)=>{
      if(!navigator.geolocation)return reject(new Error('GPS indisponível'));
      navigator.geolocation.getCurrentPosition(pos=>resolve(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)} (±${Math.round(pos.coords.accuracy)} m)`),()=>reject(new Error('Não foi possível obter a localização')), {enableHighAccuracy:true,timeout:15000,maximumAge:10000});
    });
  }

  async function startOrder(id){
    const o=getOrder(id);if(!o||o.status!=='Programada')return;
    const btn=document.querySelector(`[data-dx-action="start"][data-id="${id}"]`);if(btn){btn.disabled=true;btn.textContent='Obtendo GPS...'}
    try{const pos=await gps(),ex=execution(o);ex.startedAt=nowLabel();ex.startGps=pos;o.status='Em rota';saveOrder(o,'Motorista iniciou o atendimento com GPS');}
    catch(e){alert(`${e.message}. Verifique a permissão de localização.`);if(btn){btn.disabled=false;btn.textContent='▶ Iniciar atendimento'}}
  }

  async function arriveOrder(id){
    const o=getOrder(id);if(!o||o.status!=='Em rota')return;
    const btn=document.querySelector(`[data-dx-action="arrive"][data-id="${id}"]`);if(btn){btn.disabled=true;btn.textContent='Confirmando localização...'}
    try{const pos=await gps(),ex=execution(o);ex.arrivedAt=nowLabel();ex.arrivalGps=pos;o.status='No cliente';saveOrder(o,'Chegada ao ponto de coleta registrada com GPS');setTimeout(()=>execute(id),60);}
    catch(e){alert(`${e.message}. Verifique a permissão de localização.`);if(btn){btn.disabled=false;btn.textContent='⌖ Cheguei ao cliente'}}
  }

  function checklistHTML(o){
    const ex=o.execution||{},qrLabel=o.containerCode?`Confirmar ${o.containerCode}`:'Identificar caçamba';
    return `<div class="dx-checklist">
      <div class="dx-check ${ex.arrivalGps?'done':''}"><div class="dx-check-main"><span class="dx-check-icon">${ex.arrivalGps?'✓':'1'}</span><div><b>GPS da chegada</b><small class="dx-gps">${esc(ex.arrivalGps||'Registrado automaticamente ao tocar em Cheguei ao cliente')}</small></div></div></div>
      <div class="dx-check ${ex.qrVerified?'done':''}"><div class="dx-check-main"><span class="dx-check-icon">${ex.qrVerified?'✓':'2'}</span><div><b>QR da caçamba</b><small>${ex.qrVerified?`Confirmada: ${esc(o.containerCode)}`:esc(qrLabel)}</small></div></div><div class="dx-check-actions"><button data-dx-action="scan" data-id="${o.id}">${ex.qrVerified?'Ler novamente':'Ler QR'}</button></div></div>
      <div class="dx-check ${ex.photoBeforeKey?'done':''}"><div class="dx-check-main"><span class="dx-check-icon">${ex.photoBeforeKey?'✓':'3'}</span><div><b>Foto antes da coleta</b><small>Registre a situação antes da movimentação.</small><div id="dx-before-preview" class="dx-photo-preview"></div></div></div><div class="dx-check-actions"><button data-dx-action="photo" data-kind="before" data-id="${o.id}">📷 ${ex.photoBeforeKey?'Trocar foto':'Tirar foto'}</button></div></div>
      <div class="dx-check ${ex.collectedAt?'done':''}"><div class="dx-check-main"><span class="dx-check-icon">${ex.collectedAt?'✓':'4'}</span><div><b>Coleta realizada</b><small>${esc(ex.collectedAt||'Libera após QR + foto antes.')}</small></div></div><div class="dx-check-actions"><button class="primary" data-dx-action="collect" data-id="${o.id}" ${ex.collectedAt?'disabled':''}>${ex.collectedAt?'Coleta registrada':'Registrar coleta'}</button></div></div>
      <div class="dx-check ${ex.photoAfterKey?'done':''}"><div class="dx-check-main"><span class="dx-check-icon">${ex.photoAfterKey?'✓':'5'}</span><div><b>Foto depois da coleta</b><small>Registre a condição final do local/caçamba.</small><div id="dx-after-preview" class="dx-photo-preview"></div></div></div><div class="dx-check-actions"><button data-dx-action="photo" data-kind="after" data-id="${o.id}" ${ex.collectedAt?'':'disabled'}>📷 ${ex.photoAfterKey?'Trocar foto':'Tirar foto'}</button></div></div>
      <div class="dx-check ${ex.signature?'done':''}"><div class="dx-check-main"><span class="dx-check-icon">${ex.signature?'✓':'6'}</span><div><b>Responsável / assinatura</b><small>${ex.signature?`${esc(ex.responsible||'Responsável')} • ${esc(ex.signatureAt||'')}`:'Assinatura do responsável no local.'}</small></div></div><div class="dx-check-actions"><button data-dx-action="signature" data-id="${o.id}" ${ex.collectedAt?'':'disabled'}>${ex.signature?'Refazer assinatura':'Assinar'}</button></div></div>
    </div>`;
  }

  function execute(id){
    const o=getOrder(id);if(!o)return;const p=point(o.pointId),ex=o.execution||{};
    modal(`<div class="dx-modal-head"><div><span>ATENDIMENTO DO MOTORISTA</span><h3>${esc(o.code)} • ${esc(clientName(o.clientId))}</h3></div><button class="dx-close" data-dx-action="close">×</button></div>
      <div class="dx-summary"><div><small>Ponto</small><b>${esc(p?.name||'—')}</b></div><div><small>Endereço</small><b>${esc(p?.address||'—')}</b></div><div><small>Caçamba</small><b>${esc(o.containerCode||'A identificar por QR')}</b></div><div><small>Status</small><b>${esc(o.status)}</b></div></div>
      ${p?.instructions?`<div class="dx-alert">${esc(p.instructions)}</div>`:''}
      ${checklistHTML(o)}
      <div class="dx-footer"><button data-dx-action="close">Fechar</button><button class="primary" data-dx-action="complete" data-id="${o.id}" ${canComplete(o)?'':'disabled'}>${ex.clientCompletedAt?'Atendimento concluído':'Concluir atendimento'}</button></div>`,true);
    loadPreview(ex.photoBeforeKey,'dx-before-preview');loadPreview(ex.photoAfterKey,'dx-after-preview');
  }

  function canComplete(o){const ex=o.execution||{};return !!(ex.arrivalGps&&ex.qrVerified&&ex.photoBeforeKey&&ex.collectedAt&&ex.photoAfterKey&&ex.signature)}
  function registerCollection(id){
    const o=getOrder(id);if(!o)return;const ex=execution(o);
    if(!ex.arrivalGps)return alert('Confirme a chegada com GPS antes da coleta.');
    if(!ex.qrVerified)return alert('Leia e confirme o QR da caçamba.');
    if(!ex.photoBeforeKey)return alert('Tire a foto antes da coleta.');
    ex.collectedAt=nowLabel();o.status='Coletada';saveOrder(o,'Coleta física registrada pelo motorista');execute(id);
  }

  async function completeOrder(id){
    const o=getOrder(id);if(!o)return;const ex=execution(o);if(ex.clientCompletedAt)return;
    if(!canComplete(o))return alert('Conclua QR, fotos, coleta e assinatura antes de finalizar o atendimento.');
    const btn=document.querySelector(`[data-dx-action="complete"][data-id="${id}"]`);if(btn){btn.disabled=true;btn.textContent='Capturando GPS final...'}
    try{ex.finishGps=await gps();ex.clientCompletedAt=nowLabel();saveOrder(o,'Atendimento no cliente concluído com GPS final');execute(id);}
    catch(e){alert(`${e.message}. O GPS final é obrigatório para concluir.`);if(btn){btn.disabled=false;btn.textContent='Concluir atendimento'}}
  }

  function parseCode(value){
    let text=String(value||'').trim().toUpperCase();try{const u=new URL(text);text=(u.searchParams.get('container')||text).toUpperCase()}catch{}
    const m=text.match(/C-?0*(\d{1,3})/i);if(!m)return'';const n=Number(m[1]);if(n<1||n>999)return'';return `C-${String(n).padStart(3,'0')}`;
  }
  function confirmQr(orderId,value){
    const code=parseCode(value);if(!code)return alert('QR/código de caçamba inválido.');
    const o=getOrder(orderId);if(!o)return;
    if(o.containerCode&&String(o.containerCode).toUpperCase()!==code)return alert(`Esta ordem está vinculada à ${o.containerCode}. O QR lido foi ${code}.`);
    if(!o.containerCode)o.containerCode=code;
    const ex=execution(o);ex.qrVerified=true;ex.qrVerifiedAt=nowLabel();ex.qrCode=code;saveOrder(o,`Caçamba ${code} confirmada por QR`);closeModal();execute(orderId);
  }
  async function scanQr(id){
    const o=getOrder(id);if(!o)return;
    modal(`<div class="dx-modal-head"><div><span>IDENTIFICAÇÃO</span><h3>Ler QR da caçamba</h3></div><button class="dx-close" data-dx-action="close">×</button></div><div id="dx-reader" class="dx-reader"></div><p>Esperada: <b>${esc(o.containerCode||'qualquer caçamba cadastrada')}</b></p><div class="dx-manual"><input id="dx-manual-code" placeholder="Ex.: C-007"><button class="primary" data-dx-action="manual-qr" data-id="${id}">Confirmar código</button></div>`);
    try{
      if(window.TMEnsureQrScanner)await window.TMEnsureQrScanner();
      if(!window.Html5Qrcode)throw new Error();
      activeScanner=new window.Html5Qrcode('dx-reader');
      await activeScanner.start({facingMode:'environment'},{fps:10,qrbox:{width:230,height:230},aspectRatio:1},decoded=>{const scanner=activeScanner;activeScanner=null;scanner.stop().then(()=>confirmQr(id,decoded)).catch(()=>confirmQr(id,decoded))},()=>{});
    }catch{const r=document.getElementById('dx-reader');if(r)r.innerHTML='<div class="dx-reader-error">Não foi possível abrir a câmera. Autorize a câmera ou informe o código manualmente.</div>'}
  }

  function openMediaDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(MEDIA_DB,1);req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains('photos'))d.createObjectStore('photos',{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
  async function putPhoto(id,blob){const d=await openMediaDB();return new Promise((resolve,reject)=>{const tx=d.transaction('photos','readwrite');tx.objectStore('photos').put({id,blob,createdAt:Date.now()});tx.oncomplete=()=>{d.close();resolve(id)};tx.onerror=()=>{d.close();reject(tx.error)}})}
  async function getPhoto(id){if(!id)return null;const d=await openMediaDB();return new Promise((resolve,reject)=>{const tx=d.transaction('photos','readonly'),r=tx.objectStore('photos').get(id);r.onsuccess=()=>{d.close();resolve(r.result?.blob||null)};r.onerror=()=>{d.close();reject(r.error)}})}
  async function compressImage(file){
    const bmp=await createImageBitmap(file),max=1280,scale=Math.min(1,max/Math.max(bmp.width,bmp.height)),w=Math.max(1,Math.round(bmp.width*scale)),h=Math.max(1,Math.round(bmp.height*scale));
    const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(bmp,0,0,w,h);bmp.close?.();return await new Promise(res=>c.toBlob(res,'image/jpeg',.76));
  }
  function capturePhoto(id,kind){
    const input=document.createElement('input');input.type='file';input.accept='image/*';input.setAttribute('capture','environment');input.style.display='none';document.body.appendChild(input);
    input.addEventListener('change',async()=>{const file=input.files?.[0];input.remove();if(!file)return;try{const blob=await compressImage(file),key=`${id}-${kind}-${Date.now()}`;await putPhoto(key,blob);const o=getOrder(id);if(!o)return;const ex=execution(o);if(kind==='before')ex.photoBeforeKey=key;else ex.photoAfterKey=key;saveOrder(o,`Foto ${kind==='before'?'antes':'depois'} da coleta registrada`);execute(id)}catch{alert('Não foi possível salvar a foto neste aparelho.')}} ,{once:true});input.click();
  }
  async function loadPreview(key,elementId){
    if(!key)return;try{const blob=await getPhoto(key),el=document.getElementById(elementId);if(!blob||!el)return;const url=URL.createObjectURL(blob);el.innerHTML=`<img src="${url}" alt="Comprovante fotográfico">`;el.classList.add('show');setTimeout(()=>URL.revokeObjectURL(url),60000)}catch{}
  }

  function signatureModal(id){
    const o=getOrder(id);if(!o)return;const ex=o.execution||{};
    modal(`<div class="dx-modal-head"><div><span>COMPROVAÇÃO</span><h3>Assinatura do responsável</h3></div><button class="dx-close" data-dx-action="close">×</button></div><form id="dx-sign-form" class="dx-form"><label>Nome do responsável<input name="responsible" value="${esc(ex.responsible||'')}" required placeholder="Nome de quem acompanhou a coleta"></label><div class="dx-signature-box"><canvas id="dx-sign-canvas"></canvas></div><div class="dx-signature-actions"><small>Assine com o dedo ou mouse.</small><button type="button" data-dx-action="clear-sign">Limpar</button></div><div class="dx-footer"><button type="button" data-dx-action="execute" data-id="${id}">Voltar</button><button class="primary">Salvar assinatura</button></div></form>`);
    const canvas=document.getElementById('dx-sign-canvas'),ctx=canvas.getContext('2d'),ratio=Math.max(1,window.devicePixelRatio||1);canvas.width=Math.round(canvas.clientWidth*ratio);canvas.height=Math.round(180*ratio);ctx.scale(ratio,ratio);ctx.lineWidth=2;ctx.lineCap='round';ctx.strokeStyle='#17372f';let drawing=false,hasInk=false;
    const pos=e=>{const r=canvas.getBoundingClientRect(),p=e.touches?.[0]||e;return{x:p.clientX-r.left,y:p.clientY-r.top}};
    const down=e=>{e.preventDefault();drawing=true;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y)};const move=e=>{if(!drawing)return;e.preventDefault();const p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke();hasInk=true};const up=e=>{if(drawing)e.preventDefault();drawing=false};
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:false});
    document.querySelector('[data-dx-action="clear-sign"]')?.addEventListener('click',()=>{ctx.clearRect(0,0,canvas.width,canvas.height);hasInk=false});
    document.getElementById('dx-sign-form')?.addEventListener('submit',e=>{e.preventDefault();if(!hasInk)return alert('Peça para o responsável assinar no campo.');const responsible=String(new FormData(e.currentTarget).get('responsible')||'').trim();const order=getOrder(id),x=execution(order);x.responsible=responsible;x.signature=canvas.toDataURL('image/png');x.signatureAt=nowLabel();saveOrder(order,`Atendimento assinado por ${responsible}`);execute(id)});
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-dx-action]');if(!b)return;const a=b.dataset.dxAction,id=b.dataset.id;
    if(a==='close')closeModal();
    else if(a==='refresh')refreshPanel();
    else if(a==='details')details(id);
    else if(a==='start')startOrder(id);
    else if(a==='arrive')arriveOrder(id);
    else if(a==='execute')execute(id);
    else if(a==='scan')scanQr(id);
    else if(a==='manual-qr')confirmQr(id,document.getElementById('dx-manual-code')?.value||'');
    else if(a==='photo')capturePhoto(id,b.dataset.kind);
    else if(a==='collect')registerCollection(id);
    else if(a==='signature')signatureModal(id);
    else if(a==='complete')completeOrder(id);
  });

  const observer=new MutationObserver(()=>{clearTimeout(observerTimer);observerTimer=setTimeout(injectPanel,90)});observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',injectPanel);else injectPanel();
  window.TMDriverExecution={refresh:refreshPanel,execute};
})();

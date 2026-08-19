(() => {
  'use strict';

  const DB_KEY='telemonte-db-v3';
  const SESSION_KEY='telemonte-session-v2';
  const POINTS_KEY='telemonte-pickup-points-v1';
  const ORDERS_KEY='telemonte-collection-orders-v1';
  const CONTAINERS_KEY='telemonte-containers-control-v1';
  const STATUS=['Solicitada','Programada','Em rota','No cliente','Coletada','Destinada','Finalizada','Cancelada'];
  const NEXT={'Solicitada':'Programada','Programada':'Em rota','Em rota':'No cliente','No cliente':'Coletada','Coletada':'Destinada','Destinada':'Finalizada'};
  let currentView='orders';

  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const uid=p=>`${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
  const today=()=>new Date().toISOString().slice(0,10);
  const nowLabel=()=>new Date().toLocaleString('pt-BR');
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const statusClass=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll(' ','-');
  const readJSON=(key,fallback)=>{try{const x=JSON.parse(localStorage.getItem(key)||'null');return x??fallback}catch{return fallback}};
  const writeJSON=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const db=()=>readJSON(DB_KEY,{users:[],clients:[],employees:[],vehicles:[],routes:[]});
  const points=()=>{const x=readJSON(POINTS_KEY,[]);return Array.isArray(x)?x:[]};
  const orders=()=>{const x=readJSON(ORDERS_KEY,[]);return Array.isArray(x)?x:[]};
  const containers=()=>{const x=readJSON(CONTAINERS_KEY,[]);return Array.isArray(x)?x:[]};
  const user=()=>{const d=db(),id=localStorage.getItem(SESSION_KEY);return d.users?.find(x=>x.id===id&&x.active)||null};
  const clientName=id=>db().clients?.find(x=>x.id===id)?.name||'Cliente não encontrado';
  const pointName=id=>points().find(x=>x.id===id)?.name||'Ponto não informado';
  const closeMobile=()=>{document.body.classList.remove('mobile-nav-open');document.querySelector('.mobile-nav-overlay')?.classList.remove('show')};

  function nextOrderCode(){
    const year=new Date().getFullYear();
    const re=new RegExp(`^OC-${year}-(\\d{5})$`);
    let max=0;
    orders().forEach(o=>{const m=String(o.code||'').match(re);if(m)max=Math.max(max,Number(m[1]))});
    return `OC-${year}-${String(max+1).padStart(5,'0')}`;
  }

  function navButton(label,icon,view){
    const b=document.createElement('button');
    b.type='button';b.dataset.opsModule=view;b.title=label;
    b.innerHTML=`<span class="nav-icon" aria-hidden="true">${icon}</span><span class="nav-label">${label}</span>`;
    return b;
  }

  function injectNav(){
    const u=user();
    if(!u||u.role==='driver')return;
    const nav=document.querySelector('.sidebar nav');
    if(!nav)return;
    if(!nav.querySelector('[data-ops-module="orders"]')){
      const group=nav.querySelector('.nav-group[data-group="operacao"] .nav-group-items')||nav;
      const b=navButton('Ordens de Coleta','☑','orders');
      group.appendChild(b);
    }
    if(!nav.querySelector('[data-ops-module="points"]')){
      const group=nav.querySelector('.nav-group[data-group="cadastros"] .nav-group-items')||nav;
      const b=navButton('Pontos de Coleta','⌂','points');
      group.appendChild(b);
    }
  }

  function setActive(view){
    document.querySelectorAll('.sidebar nav button').forEach(b=>b.classList.remove('active'));
    document.querySelector(`[data-ops-module="${view}"]`)?.classList.add('active');
  }

  function render(view=currentView){
    currentView=view;
    const content=document.querySelector('.content');
    if(!content)return;
    setActive(view);
    const title=document.querySelector('.topbar h1');
    if(title)title.textContent=view==='orders'?'Ordens de Coleta':'Pontos de Coleta';
    content.dataset.opsModule=view;
    content.innerHTML=view==='orders'?ordersHTML():pointsHTML();
    bindFilters();
  }

  function ordersHTML(){
    const list=orders();
    const active=list.filter(o=>!['Finalizada','Cancelada'].includes(o.status)).length;
    const todayCount=list.filter(o=>o.scheduledDate===today()&&!['Finalizada','Cancelada'].includes(o.status)).length;
    const delayed=list.filter(o=>o.scheduledDate&&o.scheduledDate<today()&&!['Finalizada','Cancelada'].includes(o.status)).length;
    const done=list.filter(o=>o.status==='Finalizada').length;
    const revenue=list.filter(o=>o.status!=='Cancelada').reduce((a,o)=>a+Number(o.value||0),0);
    return `<section class="op-wrap">
      <div class="op-head"><div><span class="op-eyebrow">OPERAÇÃO • PROGRAMAÇÃO • EXECUÇÃO</span><h2>Ordens de Coleta</h2><p>Cada atendimento recebe um código único e acompanha toda a operação até a finalização.</p></div><div class="op-actions"><button data-op-action="points">Pontos de Coleta</button><button class="primary" data-op-action="new-order">+ Nova Ordem</button></div></div>
      <div class="op-kpis">
        <div class="op-kpi"><span>Total de ordens</span><strong>${list.length}</strong><small>cadastradas</small></div>
        <div class="op-kpi"><span>Em aberto</span><strong>${active}</strong><small>aguardando conclusão</small></div>
        <div class="op-kpi"><span>Programadas hoje</span><strong>${todayCount}</strong><small>${today()}</small></div>
        <div class="op-kpi"><span>Atrasadas</span><strong>${delayed}</strong><small>exigem atenção</small></div>
        <div class="op-kpi"><span>Valor das ordens</span><strong>${money(revenue)}</strong><small>${done} finalizadas</small></div>
      </div>
      <div class="op-toolbar panel"><input id="op-search" placeholder="Buscar ordem, cliente, ponto, caçamba, motorista..."><select id="op-status"><option value="">Todos os status</option>${STATUS.map(s=>`<option>${esc(s)}</option>`).join('')}</select><select id="op-date"><option value="">Todas as datas</option><option value="today">Hoje</option><option value="late">Atrasadas</option><option value="future">Próximas</option></select></div>
      ${list.length?`<div class="op-board" id="op-board">${list.slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).map(orderCard).join('')}</div>`:`<div class="op-empty"><strong>Nenhuma ordem cadastrada</strong>Cadastre primeiro os pontos de coleta e depois crie a primeira ordem operacional.<br><br><button data-op-action="new-order" class="primary">Criar primeira ordem</button></div>`}
      <div id="op-modal-root"></div>
    </section>`;
  }

  function orderCard(o){
    const search=[o.code,clientName(o.clientId),pointName(o.pointId),o.wasteType,o.containerCode,o.driver,o.vehicle,o.route,o.status].join(' ').toLowerCase();
    const next=NEXT[o.status];
    return `<article class="op-card" data-search="${esc(search)}" data-status="${esc(o.status)}" data-date="${esc(o.scheduledDate||'')}">
      <div class="op-card-top"><div class="op-code"><small>ORDEM DE COLETA</small><strong>${esc(o.code)}</strong></div><span class="op-status ${statusClass(o.status)}">${esc(o.status)}</span></div>
      <div class="op-main">
        <div class="op-main-row"><span>Cliente</span><b>${esc(clientName(o.clientId))}</b></div>
        <div class="op-main-row"><span>Ponto</span><b>${esc(pointName(o.pointId))}</b></div>
        <div class="op-main-row"><span>Programação</span><b>${esc(o.scheduledDate||'—')} ${esc(o.scheduledTime||'')}</b></div>
        <div class="op-main-row"><span>Resíduo</span><b>${esc(o.wasteType||'—')} ${o.quantity?`• ${esc(o.quantity)} ${esc(o.unit||'')}`:''}</b></div>
        <div class="op-main-row"><span>Caçamba</span><b>${esc(o.containerCode||'Não definida')}</b></div>
        <div class="op-main-row"><span>Equipe</span><b>${esc(o.driver||'Não definido')} ${o.vehicle?`• Caminhão ${esc(o.vehicle)}`:''}</b></div>
      </div>
      <div class="op-card-actions"><button data-op-action="details" data-id="${o.id}">Detalhes</button><button data-op-action="edit-order" data-id="${o.id}">Editar</button>${next?`<button class="primary" data-op-action="advance" data-id="${o.id}">${esc(next)}</button>`:''}</div>
    </article>`;
  }

  function pointsHTML(){
    const list=points(),clients=db().clients||[];
    return `<section class="op-wrap">
      <div class="op-head"><div><span class="op-eyebrow">CLIENTES • ENDEREÇOS • OPERAÇÃO</span><h2>Pontos de Coleta</h2><p>Um mesmo cliente pode possuir várias unidades, acessos e locais de retirada.</p></div><div class="op-actions"><button data-op-action="orders">Ordens de Coleta</button><button class="primary" data-op-action="new-point">+ Novo Ponto</button></div></div>
      <div class="op-kpis"><div class="op-kpi"><span>Pontos cadastrados</span><strong>${list.length}</strong><small>locais operacionais</small></div><div class="op-kpi"><span>Clientes</span><strong>${clients.length}</strong><small>disponíveis para vínculo</small></div><div class="op-kpi"><span>Com coordenadas</span><strong>${list.filter(x=>x.lat&&x.lng).length}</strong><small>prontos para geofence</small></div></div>
      <div class="op-toolbar panel"><input id="op-search" placeholder="Buscar cliente, unidade, endereço, contato..."><select id="op-client-filter"><option value="">Todos os clientes</option>${clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      ${list.length?`<div class="op-points-list" id="op-points">${list.map(pointCard).join('')}</div>`:`<div class="op-empty"><strong>Nenhum ponto de coleta</strong>Cadastre os endereços reais onde os caminhões fazem coleta, troca ou retirada de caçambas.<br><br><button data-op-action="new-point" class="primary">Cadastrar primeiro ponto</button></div>`}
      <div id="op-modal-root"></div>
    </section>`;
  }

  function pointCard(p){
    const search=[clientName(p.clientId),p.name,p.address,p.city,p.contact,p.phone].join(' ').toLowerCase();
    return `<article class="op-point" data-search="${esc(search)}" data-client="${esc(p.clientId)}"><div class="op-point-top"><div><small>${esc(clientName(p.clientId))}</small><h3>${esc(p.name)}</h3></div><span class="op-status ${p.active===false?'cancelada':'finalizada'}">${p.active===false?'Inativo':'Ativo'}</span></div><p><b>${esc(p.address||'Endereço não informado')}</b>${p.city?`<br>${esc(p.city)}`:''}</p><p>${p.contact?`Contato: ${esc(p.contact)}${p.phone?` • ${esc(p.phone)}`:''}`:'Sem contato informado'}</p>${p.instructions?`<small>Instruções: ${esc(p.instructions)}</small>`:''}<div class="op-point-actions"><button data-op-action="edit-point" data-id="${p.id}">Editar</button><button class="primary" data-op-action="order-from-point" data-id="${p.id}">Criar ordem</button></div></article>`;
  }

  function modal(html,wide=false){
    const root=document.getElementById('op-modal-root')||document.body;
    const wrap=document.createElement('div');wrap.className='op-modal-backdrop';wrap.innerHTML=`<div class="op-modal ${wide?'op-modal-wide':''}">${html}</div>`;root.appendChild(wrap);wrap.addEventListener('click',e=>{if(e.target===wrap)closeModal()});return wrap;
  }
  const closeModal=()=>document.querySelectorAll('.op-modal-backdrop').forEach(x=>x.remove());

  function pointForm(existing=null){
    const d=db(),p=existing||{},clients=d.clients||[];
    modal(`<div class="op-modal-head"><div><span>PONTO DE COLETA</span><h3>${existing?'Editar ponto':'Novo ponto'}</h3></div><button class="op-close" data-op-action="close">×</button></div>
      ${clients.length?'':`<div class="op-alert">Cadastre pelo menos um cliente antes de criar um ponto de coleta.</div>`}
      <form id="op-point-form" class="op-form">
        <label>Cliente<select name="clientId" required>${clients.map(c=>`<option value="${c.id}" ${p.clientId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label>Nome do ponto<input name="name" required value="${esc(p.name||'')}" placeholder="Ex.: Unidade Centro, Portaria 2"></label>
        <label class="op-span-2">Endereço<input name="address" required value="${esc(p.address||'')}" placeholder="Rua, número, complemento"></label>
        <label>Cidade / UF<input name="city" value="${esc(p.city||'')}" placeholder="Ex.: Montenegro/RS"></label>
        <label>Contato no local<input name="contact" value="${esc(p.contact||'')}" placeholder="Responsável"></label>
        <label>Telefone<input name="phone" value="${esc(p.phone||'')}" placeholder="Telefone / WhatsApp"></label>
        <label>Latitude<input name="lat" value="${esc(p.lat||'')}" placeholder="-29.000000"></label>
        <label>Longitude<input name="lng" value="${esc(p.lng||'')}" placeholder="-51.000000"></label>
        <label class="op-span-2">Instruções de acesso<textarea name="instructions" placeholder="Portaria, horário, acesso do caminhão, contato obrigatório...">${esc(p.instructions||'')}</textarea></label>
        <div class="op-form-actions"><button type="button" data-op-action="close">Cancelar</button><button class="primary" ${clients.length?'':'disabled'}>Salvar ponto</button></div>
      </form>`);
    document.getElementById('op-point-form')?.addEventListener('submit',e=>{e.preventDefault();savePoint(new FormData(e.currentTarget),existing?.id)});
  }

  function savePoint(f,id=''){
    const list=points();let p=id?list.find(x=>x.id===id):null;
    const data={clientId:String(f.get('clientId')||''),name:String(f.get('name')||'').trim(),address:String(f.get('address')||'').trim(),city:String(f.get('city')||'').trim(),contact:String(f.get('contact')||'').trim(),phone:String(f.get('phone')||'').trim(),lat:String(f.get('lat')||'').trim(),lng:String(f.get('lng')||'').trim(),instructions:String(f.get('instructions')||'').trim(),active:true,updatedAt:nowLabel()};
    if(p)Object.assign(p,data);else list.push({id:uid('pt'),...data,createdAt:nowLabel()});
    writeJSON(POINTS_KEY,list);closeModal();render('points');
  }

  function orderForm(existing=null,presetPointId=''){
    const d=db(),o=existing||{},pts=points(),clients=d.clients||[],employees=(d.employees||[]).filter(x=>x.status==='Ativo'),vehicles=d.vehicles||[],routes=d.routes||[],bins=containers();
    const pointId=o.pointId||presetPointId||'';
    const preset=pts.find(x=>x.id===pointId);
    const clientId=o.clientId||preset?.clientId||'';
    modal(`<div class="op-modal-head"><div><span>ORDEM DE COLETA</span><h3>${existing?`Editar ${esc(o.code)}`:`Nova ${esc(nextOrderCode())}`}</h3></div><button class="op-close" data-op-action="close">×</button></div>
      ${pts.length?'':`<div class="op-alert">Nenhum ponto de coleta cadastrado. Você pode criar a ordem depois de cadastrar o endereço operacional do cliente.</div>`}
      <form id="op-order-form" class="op-form">
        <label>Cliente<select id="op-order-client" name="clientId" required><option value="">Selecione</option>${clients.map(c=>`<option value="${c.id}" ${clientId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label>Ponto de coleta<select id="op-order-point" name="pointId" required><option value="">Selecione</option>${pts.filter(p=>!clientId||p.clientId===clientId).map(p=>`<option value="${p.id}" ${pointId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select><span class="op-point-select-note">A lista muda conforme o cliente selecionado.</span></label>
        <label>Data programada<input name="scheduledDate" type="date" required value="${esc(o.scheduledDate||today())}"></label>
        <label>Horário<input name="scheduledTime" type="time" value="${esc(o.scheduledTime||'')}"></label>
        <label>Tipo de resíduo<input name="wasteType" value="${esc(o.wasteType||'')}" placeholder="Ex.: resíduo industrial, reciclável..."></label>
        <label>Quantidade<div style="display:grid;grid-template-columns:1fr 110px;gap:7px"><input name="quantity" type="number" step="0.01" min="0" value="${esc(o.quantity||'')}" placeholder="0"><select name="unit"><option ${o.unit==='kg'?'selected':''}>kg</option><option ${o.unit==='m³'?'selected':''}>m³</option><option ${o.unit==='un'?'selected':''}>un</option><option ${o.unit==='t'?'selected':''}>t</option></select></div></label>
        <label>Caçamba<select name="containerCode"><option value="">Definir depois</option>${bins.map(b=>`<option value="${esc(b.code)}" ${o.containerCode===b.code?'selected':''}>${esc(b.code)}${b.capacity?` • ${esc(b.capacity)}`:''}</option>`).join('')}</select></label>
        <label>Motorista<select name="driver"><option value="">Definir depois</option>${employees.filter(e=>String(e.job||'').toLowerCase().includes('motor')).map(e=>`<option ${o.driver===e.name?'selected':''}>${esc(e.name)}</option>`).join('')}</select></label>
        <label>Caminhão<select name="vehicle"><option value="">Definir depois</option>${vehicles.map(v=>`<option value="${esc(v.number)}" ${String(o.vehicle)===String(v.number)?'selected':''}>${esc(v.number)} • ${esc(v.plate||'')}</option>`).join('')}</select></label>
        <label>Rota<select name="route"><option value="">Sem rota definida</option>${routes.map(r=>`<option value="${esc(r.code)}" ${o.route===r.code?'selected':''}>${esc(r.code)} • ${esc(r.date||'')}</option>`).join('')}</select></label>
        <label>Valor da coleta (R$)<input name="value" type="number" step="0.01" min="0" value="${esc(o.value||'')}"></label>
        <label>Status<select name="status">${STATUS.map(s=>`<option ${o.status===s||(!existing&&s==='Solicitada')?'selected':''}>${esc(s)}</option>`).join('')}</select></label>
        <label class="op-span-2">Observações<textarea name="notes" placeholder="Orientações, restrições, material, acesso...">${esc(o.notes||'')}</textarea></label>
        <div class="op-form-actions"><button type="button" data-op-action="close">Cancelar</button><button class="primary" ${pts.length?'':'disabled'}>Salvar ordem</button></div>
      </form>`);
    const clientSel=document.getElementById('op-order-client'),pointSel=document.getElementById('op-order-point');
    clientSel?.addEventListener('change',()=>{const val=clientSel.value;pointSel.innerHTML=`<option value="">Selecione</option>${points().filter(p=>p.clientId===val).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}`});
    document.getElementById('op-order-form')?.addEventListener('submit',e=>{e.preventDefault();saveOrder(new FormData(e.currentTarget),existing?.id)});
  }

  function saveOrder(f,id=''){
    const list=orders();let o=id?list.find(x=>x.id===id):null;
    const data={clientId:String(f.get('clientId')||''),pointId:String(f.get('pointId')||''),scheduledDate:String(f.get('scheduledDate')||''),scheduledTime:String(f.get('scheduledTime')||''),wasteType:String(f.get('wasteType')||'').trim(),quantity:String(f.get('quantity')||''),unit:String(f.get('unit')||''),containerCode:String(f.get('containerCode')||''),driver:String(f.get('driver')||''),vehicle:String(f.get('vehicle')||''),route:String(f.get('route')||''),value:Number(f.get('value')||0),status:String(f.get('status')||'Solicitada'),notes:String(f.get('notes')||'').trim(),updatedAt:nowLabel()};
    if(o){const old=o.status;Object.assign(o,data);o.history=Array.isArray(o.history)?o.history:[];if(old!==o.status)o.history.unshift({at:nowLabel(),action:`Status alterado: ${old} → ${o.status}`,user:user()?.name||'Usuário'})}
    else{const code=nextOrderCode();list.push({id:uid('oc'),code,...data,createdAt:new Date().toISOString(),history:[{at:nowLabel(),action:'Ordem criada',user:user()?.name||'Usuário'}]})}
    writeJSON(ORDERS_KEY,list);closeModal();render('orders');
  }

  function advance(id){
    const list=orders(),o=list.find(x=>x.id===id);if(!o||!NEXT[o.status])return;
    const old=o.status;o.status=NEXT[o.status];o.updatedAt=nowLabel();o.history=Array.isArray(o.history)?o.history:[];o.history.unshift({at:nowLabel(),action:`Status alterado: ${old} → ${o.status}`,user:user()?.name||'Usuário'});writeJSON(ORDERS_KEY,list);render('orders');
  }

  function details(id){
    const o=orders().find(x=>x.id===id);if(!o)return;const p=points().find(x=>x.id===o.pointId);const next=NEXT[o.status];
    modal(`<div class="op-modal-head"><div><span>ORDEM DE COLETA</span><h3>${esc(o.code)}</h3></div><button class="op-close" data-op-action="close">×</button></div>
      <div class="op-detail-grid"><div><small>Status</small><strong><span class="op-status ${statusClass(o.status)}">${esc(o.status)}</span></strong></div><div><small>Cliente</small><strong>${esc(clientName(o.clientId))}</strong></div><div><small>Ponto</small><strong>${esc(pointName(o.pointId))}</strong></div><div><small>Programação</small><strong>${esc(o.scheduledDate||'—')} ${esc(o.scheduledTime||'')}</strong></div><div><small>Caçamba</small><strong>${esc(o.containerCode||'—')}</strong></div><div><small>Valor</small><strong>${money(o.value)}</strong></div><div><small>Motorista</small><strong>${esc(o.driver||'—')}</strong></div><div><small>Caminhão</small><strong>${esc(o.vehicle||'—')}</strong></div><div><small>Rota</small><strong>${esc(o.route||'—')}</strong></div></div>
      ${p?`<div class="op-alert"><b>Local:</b> ${esc(p.address)}${p.city?` • ${esc(p.city)}`:''}${p.instructions?`<br><b>Acesso:</b> ${esc(p.instructions)}`:''}</div>`:''}
      ${o.notes?`<p style="font-size:12px;color:#596963"><b>Observações:</b> ${esc(o.notes)}</p>`:''}
      <div class="op-card-actions"><button data-op-action="edit-order" data-id="${o.id}">Editar ordem</button>${next?`<button class="primary" data-op-action="advance" data-id="${o.id}">${esc(next)}</button>`:''}</div>
      <h4 style="margin:20px 0 8px;color:#17372f">Histórico</h4><div class="op-history">${(o.history||[]).map(h=>`<div class="op-history-item"><div class="op-history-dot"></div><div><strong>${esc(h.action)}</strong><span>${esc(h.at)}</span><small>${esc(h.user||'Sistema')}</small></div></div>`).join('')||'<small>Sem histórico.</small>'}</div>`,true);
  }

  function bindFilters(){
    const search=document.getElementById('op-search');
    const status=document.getElementById('op-status');
    const date=document.getElementById('op-date');
    const client=document.getElementById('op-client-filter');
    const apply=()=>{
      const q=(search?.value||'').toLowerCase().trim();
      if(currentView==='orders')document.querySelectorAll('.op-card').forEach(card=>{const matchQ=!q||card.dataset.search.includes(q);const matchS=!status?.value||card.dataset.status===status.value;let matchD=true;if(date?.value==='today')matchD=card.dataset.date===today();if(date?.value==='late')matchD=!!card.dataset.date&&card.dataset.date<today()&&!['Finalizada','Cancelada'].includes(card.dataset.status);if(date?.value==='future')matchD=!!card.dataset.date&&card.dataset.date>today();card.hidden=!(matchQ&&matchS&&matchD)});
      else document.querySelectorAll('.op-point').forEach(card=>{const matchQ=!q||card.dataset.search.includes(q);const matchC=!client?.value||card.dataset.client===client.value;card.hidden=!(matchQ&&matchC)});
    };
    search?.addEventListener('input',apply);status?.addEventListener('change',apply);date?.addEventListener('change',apply);client?.addEventListener('change',apply);
  }

  document.addEventListener('click',e=>{
    const nav=e.target.closest('[data-ops-module]');
    if(nav){e.preventDefault();e.stopImmediatePropagation();render(nav.dataset.opsModule);closeMobile();return}
    const b=e.target.closest('[data-op-action]');if(!b)return;
    const action=b.dataset.opAction,id=b.dataset.id;
    if(action==='close')closeModal();
    if(action==='orders')render('orders');
    if(action==='points')render('points');
    if(action==='new-point')pointForm();
    if(action==='edit-point')pointForm(points().find(x=>x.id===id));
    if(action==='new-order')orderForm();
    if(action==='order-from-point')orderForm(null,id);
    if(action==='edit-order'){closeModal();orderForm(orders().find(x=>x.id===id));}
    if(action==='details')details(id);
    if(action==='advance'){closeModal();advance(id);}
  },true);

  let timer=0;
  const enhance=()=>{clearTimeout(timer);timer=setTimeout(injectNav,60)};
  new MutationObserver(enhance).observe(document.documentElement,{subtree:true,childList:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance);else enhance();
  window.TelemonteOrders={render,orders,points,nextOrderCode};
})();

(() => {
  'use strict';

  const DB_KEY='telemonte-db-v3';
  const SESSION_KEY='telemonte-session-v2';
  const ORDERS_KEY='telemonte-collection-orders-v1';
  const DEST_KEY='telemonte-destinations-v1';
  const MEDIA_DB='telemonte-media-v1';
  const REOPEN_KEY='telemonte-reopen-destination';
  let view='weighing',timer=null;

  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const read=(k,f)=>{try{const x=JSON.parse(localStorage.getItem(k)||'null');return x??f}catch{return f}};
  const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const db=()=>read(DB_KEY,{users:[],clients:[],financialEntries:[]});
  const orders=()=>{const x=read(ORDERS_KEY,[]);return Array.isArray(x)?x:[]};
  const facilities=()=>{const x=read(DEST_KEY,[]);return Array.isArray(x)?x:[]};
  const user=()=>{const d=db(),id=localStorage.getItem(SESSION_KEY);return d.users?.find(x=>x.id===id&&x.active)||null};
  const now=()=>new Date().toLocaleString('pt-BR');
  const today=()=>new Date().toISOString().slice(0,10);
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const kg=v=>`${Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:2})} kg`;
  const uid=p=>`${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
  const clientName=id=>db().clients?.find(c=>c.id===id)?.name||'Cliente';
  const facilityName=id=>facilities().find(f=>f.id===id)?.name||'Não informado';

  function ensureNav(){
    const u=user();if(!u||u.role==='driver')return;
    const nav=document.querySelector('.sidebar nav');if(!nav||nav.querySelector('[data-dw-module]'))return;
    let group=nav.querySelector('.nav-group[data-group="residuos"]');
    if(!group){
      group=document.createElement('div');group.className='nav-group';group.dataset.group='residuos';
      const h=document.createElement('button');h.type='button';h.className='nav-group-header';h.setAttribute('aria-expanded','true');h.innerHTML='<span class="nav-group-title">RESÍDUOS</span><span class="nav-group-chevron">⌄</span>';
      const items=document.createElement('div');items.className='nav-group-items';group.append(h,items);
      h.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const c=group.classList.toggle('is-group-collapsed');h.setAttribute('aria-expanded',String(!c))});
      const finance=nav.querySelector('.nav-group[data-group="financeiro"]');nav.insertBefore(group,finance||nav.querySelector('.nav-group[data-group="administracao"]')||null);
    }
    const b=document.createElement('button');b.type='button';b.dataset.dwModule='1';b.title='Destinação / Pesagem';b.innerHTML='<span class="nav-icon" aria-hidden="true">⚖</span><span class="nav-label">Destinação / Pesagem</span>';
    b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();render();closeMobile()});
    group.querySelector('.nav-group-items')?.appendChild(b);
  }

  function closeMobile(){document.body.classList.remove('mobile-nav-open');document.querySelector('.mobile-nav-overlay')?.classList.remove('show')}
  function setActive(){document.querySelectorAll('.sidebar nav button').forEach(x=>x.classList.remove('active'));document.querySelector('[data-dw-module]')?.classList.add('active')}

  function eligibleOrders(){return orders().filter(o=>['Coletada','Destinada','Finalizada'].includes(o.status)).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))}
  function totals(){const list=eligibleOrders(),done=list.filter(o=>o.destination?.netKg>0),weight=done.reduce((s,o)=>s+Number(o.destination?.netKg||0),0),cost=done.reduce((s,o)=>s+Number(o.destination?.totalCost||0),0);return{list,done,weight,cost}}

  function render(next=view){
    view=next;const content=document.querySelector('.content');if(!content)return;
    setActive();const title=document.querySelector('.topbar h1');if(title)title.textContent='Destinação / Pesagem';
    content.dataset.dwScreen='1';content.innerHTML=`<section class="dw-wrap">
      <div class="dw-head"><div><span class="dw-eyebrow">RESÍDUOS • BALANÇA • DESTINAÇÃO</span><h2>Destinação e Pesagem</h2><p>Feche o ciclo da coleta com peso líquido, ticket de balança, destino e custo operacional.</p></div><div class="dw-tabs"><button class="${view==='weighing'?'active':''}" data-dw-action="tab" data-view="weighing">Pesagens</button><button class="${view==='facilities'?'active':''}" data-dw-action="tab" data-view="facilities">Destinadores</button></div></div>
      ${view==='weighing'?weighingHTML():facilitiesHTML()}
      <div id="dw-modal-root"></div>
    </section>`;
    bindFilters();
  }

  function weighingHTML(){
    const {list,done,weight,cost}=totals(),pending=list.filter(o=>!o.destination?.netKg).length;
    return `<div class="dw-kpis">
      <article><span>Aguardando destinação</span><strong>${pending}</strong><small>ordens coletadas</small></article>
      <article><span>Pesagens registradas</span><strong>${done.length}</strong><small>com peso líquido</small></article>
      <article><span>Peso destinado</span><strong>${kg(weight)}</strong><small>total registrado</small></article>
      <article><span>Custo de destinação</span><strong>${money(cost)}</strong><small>total operacional</small></article>
    </div>
    <div class="dw-toolbar panel"><input id="dw-search" placeholder="Buscar ordem, cliente, caçamba, destino..."><select id="dw-status"><option value="">Todos</option><option value="pending">Aguardando pesagem</option><option value="done">Pesados/destinados</option></select><button class="primary" data-dw-action="new-weighing">+ Registrar pesagem</button></div>
    ${list.length?`<div class="dw-list">${list.map(orderCard).join('')}</div>`:`<div class="dw-empty"><strong>Nenhuma coleta pronta para destinação</strong>As ordens aparecerão aqui depois que o motorista registrar a coleta.</div>`}`;
  }

  function orderCard(o){
    const d=o.destination||{},done=Number(d.netKg||0)>0,search=[o.code,clientName(o.clientId),o.containerCode,o.wasteType,d.facilityName||facilityName(d.facilityId)].join(' ').toLowerCase();
    return `<article class="dw-card" data-search="${esc(search)}" data-done="${done?'done':'pending'}">
      <div class="dw-card-top"><div><small>ORDEM DE COLETA</small><strong>${esc(o.code)}</strong></div><span class="dw-pill ${done?'ok':'wait'}">${done?'Destinação registrada':'Aguardando pesagem'}</span></div>
      <div class="dw-grid">
        <div><span>Cliente</span><b>${esc(clientName(o.clientId))}</b></div><div><span>Resíduo</span><b>${esc(o.wasteType||'—')}</b></div>
        <div><span>Caçamba</span><b>${esc(o.containerCode||'—')}</b></div><div><span>Destino</span><b>${esc(d.facilityName||facilityName(d.facilityId)||'—')}</b></div>
        <div><span>Peso líquido</span><b>${done?kg(d.netKg):'—'}</b></div><div><span>Custo</span><b>${done?money(d.totalCost):'—'}</b></div>
      </div>
      <div class="dw-actions"><button data-dw-action="details" data-id="${o.id}">Detalhes</button><button class="primary" data-dw-action="weigh" data-id="${o.id}">${done?'Editar pesagem':'Registrar pesagem'}</button></div>
    </article>`;
  }

  function facilitiesHTML(){
    const list=facilities();return `<div class="dw-kpis"><article><span>Destinadores ativos</span><strong>${list.filter(x=>x.active!==false).length}</strong><small>unidades disponíveis</small></article><article><span>Total cadastrado</span><strong>${list.length}</strong><small>destinos de resíduos</small></article><article><span>Licenças vencendo</span><strong>${list.filter(x=>x.licenseExpiry&&x.licenseExpiry>=today()&&x.licenseExpiry<=new Date(Date.now()+60*86400000).toISOString().slice(0,10)).length}</strong><small>próximos 60 dias</small></article></div>
      <div class="dw-toolbar panel"><input id="dw-search" placeholder="Buscar nome, cidade, CNPJ, licença..."><button class="primary" data-dw-action="new-facility">+ Novo destinador</button></div>
      ${list.length?`<div class="dw-facilities">${list.map(facilityCard).join('')}</div>`:`<div class="dw-empty"><strong>Nenhum destinador cadastrado</strong>Cadastre as empresas ou unidades que recebem os resíduos da Telemonte.<br><br><button class="primary" data-dw-action="new-facility">Cadastrar destinador</button></div>`}`;
  }

  function facilityCard(f){const search=[f.name,f.cnpj,f.city,f.license,f.contact,f.notes].join(' ').toLowerCase();return `<article class="dw-facility" data-search="${esc(search)}"><div class="dw-card-top"><div><small>DESTINADOR</small><strong>${esc(f.name)}</strong></div><span class="dw-pill ${f.active===false?'off':'ok'}">${f.active===false?'Inativo':'Ativo'}</span></div><div class="dw-grid"><div><span>CNPJ</span><b>${esc(f.cnpj||'—')}</b></div><div><span>Cidade</span><b>${esc(f.city||'—')}</b></div><div><span>Licença</span><b>${esc(f.license||'—')}</b></div><div><span>Validade</span><b>${esc(f.licenseExpiry||'—')}</b></div></div><div class="dw-actions"><button data-dw-action="edit-facility" data-id="${f.id}">Editar</button></div></article>`}

  function modal(html,wide=false){closeModal();const root=document.getElementById('dw-modal-root')||document.body,wrap=document.createElement('div');wrap.className='dw-modal-backdrop';wrap.innerHTML=`<div class="dw-modal ${wide?'dw-modal-wide':''}">${html}</div>`;root.appendChild(wrap);wrap.addEventListener('click',e=>{if(e.target===wrap)closeModal()});return wrap}
  function closeModal(){document.querySelectorAll('.dw-modal-backdrop').forEach(x=>x.remove())}

  function facilityForm(existing=null){const f=existing||{};modal(`<div class="dw-modal-head"><div><span>DESTINADOR</span><h3>${existing?'Editar cadastro':'Novo destinador'}</h3></div><button data-dw-action="close">×</button></div><form id="dw-facility-form" class="dw-form"><label>Razão social / nome<input name="name" required value="${esc(f.name||'')}"></label><label>CNPJ<input name="cnpj" value="${esc(f.cnpj||'')}"></label><label>Cidade / UF<input name="city" value="${esc(f.city||'')}"></label><label>Contato<input name="contact" value="${esc(f.contact||'')}"></label><label>Licença ambiental<input name="license" value="${esc(f.license||'')}"></label><label>Validade da licença<input name="licenseExpiry" type="date" value="${esc(f.licenseExpiry||'')}"></label><label class="dw-span-2">Observações<textarea name="notes">${esc(f.notes||'')}</textarea></label><label class="dw-checkline"><input type="checkbox" name="active" ${f.active===false?'':'checked'}> Ativo</label><div class="dw-form-actions"><button type="button" data-dw-action="close">Cancelar</button><button class="primary">Salvar</button></div></form>`);document.getElementById('dw-facility-form')?.addEventListener('submit',e=>{e.preventDefault();saveFacility(new FormData(e.currentTarget),existing?.id)})}

  function saveFacility(fd,id=''){const list=facilities(),data={name:String(fd.get('name')||'').trim(),cnpj:String(fd.get('cnpj')||'').trim(),city:String(fd.get('city')||'').trim(),contact:String(fd.get('contact')||'').trim(),license:String(fd.get('license')||'').trim(),licenseExpiry:String(fd.get('licenseExpiry')||''),notes:String(fd.get('notes')||'').trim(),active:fd.get('active')==='on',updatedAt:now()};if(id){const f=list.find(x=>x.id===id);if(f)Object.assign(f,data)}else list.push({id:uid('dst'),...data,createdAt:now()});write(DEST_KEY,list);closeModal();render('facilities')}

  function weighingForm(orderId=''){
    const list=eligibleOrders(),o=list.find(x=>x.id===orderId)||list.find(x=>!x.destination?.netKg)||list[0];if(!o)return alert('Não há Ordem de Coleta pronta para pesagem.');
    const d=o.destination||{},fac=facilities().filter(x=>x.active!==false);if(!fac.length){alert('Cadastre primeiro um destinador.');render('facilities');return}
    modal(`<div class="dw-modal-head"><div><span>PESAGEM E DESTINAÇÃO</span><h3>${esc(o.code)} • ${esc(clientName(o.clientId))}</h3></div><button data-dw-action="close">×</button></div>
      <form id="dw-weigh-form" class="dw-form">
        <label>Ordem de Coleta<select name="orderId" id="dw-order-select">${list.map(x=>`<option value="${x.id}" ${x.id===o.id?'selected':''}>${esc(x.code)} • ${esc(clientName(x.clientId))}</option>`).join('')}</select></label>
        <label>Destinador<select name="facilityId" required><option value="">Selecione</option>${fac.map(x=>`<option value="${x.id}" ${d.facilityId===x.id?'selected':''}>${esc(x.name)}${x.city?` • ${esc(x.city)}`:''}</option>`).join('')}</select></label>
        <label>Data da destinação<input name="date" type="date" required value="${esc(d.date||today())}"></label><label>Nº do ticket<input name="ticketNumber" value="${esc(d.ticketNumber||'')}" placeholder="Opcional"></label>
        <label>Peso bruto (kg)<input id="dw-gross" name="grossKg" type="number" min="0" step="0.01" required value="${esc(d.grossKg||'')}"></label><label>Tara (kg)<input id="dw-tare" name="tareKg" type="number" min="0" step="0.01" required value="${esc(d.tareKg||'')}"></label>
        <div class="dw-result"><span>Peso líquido</span><strong id="dw-net">${kg(d.netKg||0)}</strong></div>
        <label>Custo por kg (R$)<input id="dw-costkg" name="costPerKg" type="number" min="0" step="0.0001" value="${esc(d.costPerKg||'')}"></label><label>Custo total (R$)<input id="dw-total" name="totalCost" type="number" min="0" step="0.01" value="${esc(d.totalCost||'')}"></label>
        <label class="dw-span-2">Ticket da balança<input id="dw-ticket" type="file" accept="image/*" capture="environment"><small>${d.ticketPhotoKey?'Já existe um ticket salvo. Nova foto substituirá a anterior.':'Foto opcional nesta fase do protótipo.'}</small></label>
        <label class="dw-span-2">Observações<textarea name="notes" placeholder="Informações da balança, divergências, observações do destinador...">${esc(d.notes||'')}</textarea></label>
        <div class="dw-form-actions"><button type="button" data-dw-action="close">Cancelar</button><button class="primary">Salvar destinação</button></div>
      </form>`,true);
    const gross=document.getElementById('dw-gross'),tare=document.getElementById('dw-tare'),costkg=document.getElementById('dw-costkg'),total=document.getElementById('dw-total'),net=document.getElementById('dw-net');
    const calc=()=>{const n=Math.max(0,Number(gross.value||0)-Number(tare.value||0));net.textContent=kg(n);if(document.activeElement!==total&&Number(costkg.value||0)>0)total.value=(n*Number(costkg.value)).toFixed(2)};[gross,tare,costkg].forEach(x=>x.addEventListener('input',calc));calc();
    document.getElementById('dw-order-select')?.addEventListener('change',e=>{closeModal();weighingForm(e.target.value)});
    document.getElementById('dw-weigh-form')?.addEventListener('submit',async e=>{e.preventDefault();await saveWeighing(new FormData(e.currentTarget),document.getElementById('dw-ticket')?.files?.[0])});
  }

  async function openMediaDB(){return await new Promise((resolve,reject)=>{const r=indexedDB.open(MEDIA_DB,1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('photos'))d.createObjectStore('photos',{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
  async function putPhoto(id,blob){const d=await openMediaDB();return await new Promise((resolve,reject)=>{const tx=d.transaction('photos','readwrite');tx.objectStore('photos').put({id,blob,createdAt:Date.now()});tx.oncomplete=()=>{d.close();resolve(id)};tx.onerror=()=>{d.close();reject(tx.error)}})}
  async function getPhoto(id){if(!id)return null;const d=await openMediaDB();return await new Promise((resolve,reject)=>{const tx=d.transaction('photos','readonly'),r=tx.objectStore('photos').get(id);r.onsuccess=()=>{d.close();resolve(r.result?.blob||null)};r.onerror=()=>{d.close();reject(r.error)}})}
  async function compress(file){if(!file)return null;const bmp=await createImageBitmap(file),max=1400,s=Math.min(1,max/Math.max(bmp.width,bmp.height)),c=document.createElement('canvas');c.width=Math.round(bmp.width*s);c.height=Math.round(bmp.height*s);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);bmp.close?.();return await new Promise(res=>c.toBlob(res,'image/jpeg',.78))}

  async function saveWeighing(fd,ticketFile){
    const list=orders(),id=String(fd.get('orderId')||''),o=list.find(x=>x.id===id);if(!o)return;
    if(o.status==='Coletada'&&!o.execution?.clientCompletedAt&&!confirm('O atendimento do cliente ainda não está marcado como concluído. Deseja registrar a destinação mesmo assim?'))return;
    const gross=Number(fd.get('grossKg')||0),tare=Number(fd.get('tareKg')||0),net=Math.max(0,gross-tare);if(gross<=0||tare<0||net<=0)return alert('Confira peso bruto e tara. O peso líquido deve ser maior que zero.');
    const facilityId=String(fd.get('facilityId')||''),facility=facilities().find(x=>x.id===facilityId);if(!facility)return alert('Selecione um destinador.');
    const old=o.destination||{};let ticketPhotoKey=old.ticketPhotoKey||'';
    if(ticketFile){try{const blob=await compress(ticketFile);ticketPhotoKey=`ticket-${o.id}-${Date.now()}`;await putPhoto(ticketPhotoKey,blob)}catch{alert('Não foi possível salvar a foto do ticket neste dispositivo.')}}
    const costPerKg=Number(fd.get('costPerKg')||0),typedTotal=Number(fd.get('totalCost')||0),totalCost=typedTotal>0?typedTotal:net*costPerKg;
    o.destination={facilityId,facilityName:facility.name,date:String(fd.get('date')||today()),ticketNumber:String(fd.get('ticketNumber')||'').trim(),grossKg:gross,tareKg:tare,netKg:net,costPerKg,totalCost,notes:String(fd.get('notes')||'').trim(),ticketPhotoKey,recordedAt:now(),recordedBy:user()?.name||'Usuário'};
    const previous=o.status;if(o.status==='Coletada')o.status='Destinada';o.updatedAt=now();o.history=Array.isArray(o.history)?o.history:[];o.history.unshift({at:o.updatedAt,action:`Destinação registrada em ${facility.name}: ${kg(net)}${previous!==o.status?` • ${previous} → ${o.status}`:''}`,user:user()?.name||'Usuário'});write(ORDERS_KEY,list);
    syncFinance(o);
    closeModal();
    sessionStorage.setItem(REOPEN_KEY,'1');
    location.reload();
  }

  function syncFinance(o){
    const d=db();d.financialEntries=Array.isArray(d.financialEntries)?d.financialEntries:[];const id=`dest-${o.id}`,existing=d.financialEntries.find(x=>x.id===id),entry={id,date:o.destination.date,type:'Despesa',category:'Destinação',description:`Destinação ${o.code} - ${o.destination.facilityName}`,clientId:o.clientId||'',amount:Number(o.destination.totalCost||0),status:existing?.status||'Pendente',source:'destination',orderId:o.id};
    if(existing)Object.assign(existing,entry);else if(entry.amount>0)d.financialEntries.push(entry);write(DB_KEY,d);
  }

  function details(id){const o=orders().find(x=>x.id===id);if(!o)return;const d=o.destination||{};modal(`<div class="dw-modal-head"><div><span>DESTINAÇÃO</span><h3>${esc(o.code)}</h3></div><button data-dw-action="close">×</button></div><div class="dw-detail"><div><span>Cliente</span><b>${esc(clientName(o.clientId))}</b></div><div><span>Destinador</span><b>${esc(d.facilityName||facilityName(d.facilityId)||'—')}</b></div><div><span>Data</span><b>${esc(d.date||'—')}</b></div><div><span>Ticket</span><b>${esc(d.ticketNumber||'—')}</b></div><div><span>Peso bruto</span><b>${kg(d.grossKg)}</b></div><div><span>Tara</span><b>${kg(d.tareKg)}</b></div><div class="highlight"><span>Peso líquido</span><b>${kg(d.netKg)}</b></div><div><span>Custo total</span><b>${money(d.totalCost)}</b></div><div><span>Registrado por</span><b>${esc(d.recordedBy||'—')}</b></div></div>${d.notes?`<div class="dw-note">${esc(d.notes)}</div>`:''}<div id="dw-ticket-preview" class="dw-ticket-preview">${d.ticketPhotoKey?'Carregando ticket...':'Nenhuma foto de ticket registrada.'}</div><div class="dw-form-actions"><button data-dw-action="close">Fechar</button><button class="primary" data-dw-action="weigh" data-id="${o.id}">Editar</button></div>`,true);if(d.ticketPhotoKey)loadTicket(d.ticketPhotoKey)}
  async function loadTicket(key){const box=document.getElementById('dw-ticket-preview');if(!box)return;try{const blob=await getPhoto(key);if(!blob){box.textContent='Ticket não disponível neste dispositivo.';return}const url=URL.createObjectURL(blob);box.innerHTML=`<img src="${url}" alt="Ticket de balança">`;box.querySelector('img').addEventListener('load',()=>setTimeout(()=>URL.revokeObjectURL(url),1000),{once:true})}catch{box.textContent='Não foi possível carregar o ticket.'}}

  function bindFilters(){const q=document.getElementById('dw-search'),s=document.getElementById('dw-status');const apply=()=>{const text=(q?.value||'').toLowerCase(),st=s?.value||'';document.querySelectorAll('.dw-card,.dw-facility').forEach(x=>x.hidden=!!(text&&!x.dataset.search?.includes(text))||!!(st&&x.dataset.done!==st))};q?.addEventListener('input',apply);s?.addEventListener('change',apply)}

  function enhanceOrders(){document.querySelectorAll('.op-card').forEach(card=>{if(card.querySelector('[data-dw-order-button]'))return;const id=card.querySelector('[data-op-action][data-id]')?.dataset.id,o=orders().find(x=>x.id===id);if(!o||!['Coletada','Destinada'].includes(o.status))return;const actions=card.querySelector('.op-card-actions');if(!actions)return;const b=document.createElement('button');b.type='button';b.dataset.dwOrderButton='1';b.className=o.status==='Coletada'?'primary':'';b.textContent=o.status==='Coletada'?'Destinar / Pesar':'Ver pesagem';b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();render('weighing');setTimeout(()=>o.destination?.netKg?details(id):weighingForm(id),50)});actions.appendChild(b)})}

  document.addEventListener('click',e=>{const b=e.target.closest('[data-dw-action]');if(!b)return;const a=b.dataset.dwAction,id=b.dataset.id;if(a==='close')closeModal();if(a==='tab')render(b.dataset.view);if(a==='new-facility')facilityForm();if(a==='edit-facility')facilityForm(facilities().find(x=>x.id===id));if(a==='new-weighing')weighingForm();if(a==='weigh'){closeModal();weighingForm(id)}if(a==='details')details(id)});

  function enhance(){ensureNav();enhanceOrders();if(sessionStorage.getItem(REOPEN_KEY)==='1'&&user()&&user().role!=='driver'){sessionStorage.removeItem(REOPEN_KEY);setTimeout(()=>render('weighing'),80)}}
  const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(enhance,80)});observer.observe(document.documentElement,{subtree:true,childList:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance);else enhance();
  window.TMDestination={render,weighingForm,details};
})();
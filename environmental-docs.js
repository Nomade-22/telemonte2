(() => {
  'use strict';

  const DB_KEY='telemonte-db-v3';
  const SESSION_KEY='telemonte-session-v2';
  const ORDERS_KEY='telemonte-collection-orders-v1';
  const DEST_KEY='telemonte-destinations-v1';
  const ENV_KEY='telemonte-environmental-docs-v1';
  const FILE_DB='telemonte-env-files-v1';
  let view='mtr',timer=null;

  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const read=(k,f)=>{try{const x=JSON.parse(localStorage.getItem(k)||'null');return x??f}catch{return f}};
  const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const db=()=>read(DB_KEY,{users:[],clients:[]});
  const orders=()=>{const x=read(ORDERS_KEY,[]);return Array.isArray(x)?x:[]};
  const facilities=()=>{const x=read(DEST_KEY,[]);return Array.isArray(x)?x:[]};
  const env=()=>{const x=read(ENV_KEY,{mtrs:[],certificates:[]});return {mtrs:Array.isArray(x.mtrs)?x.mtrs:[],certificates:Array.isArray(x.certificates)?x.certificates:[]}};
  const saveEnv=x=>write(ENV_KEY,x);
  const user=()=>{const d=db(),id=localStorage.getItem(SESSION_KEY);return d.users?.find(x=>x.id===id&&x.active)||null};
  const uid=p=>`${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
  const now=()=>new Date().toLocaleString('pt-BR');
  const today=()=>new Date().toISOString().slice(0,10);
  const clientName=id=>db().clients?.find(c=>c.id===id)?.name||'Cliente';
  const facilityName=id=>facilities().find(f=>f.id===id)?.name||'Não informado';
  const kg=v=>Number(v||0)>0?`${Number(v).toLocaleString('pt-BR',{maximumFractionDigits:2})} kg`:'—';
  const eligibleOrders=()=>orders().filter(o=>['Coletada','Destinada','Finalizada'].includes(o.status)).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')));
  const mtrFor=id=>env().mtrs.find(m=>m.orderId===id)||null;

  function closeMobile(){document.body.classList.remove('mobile-nav-open');document.querySelector('.mobile-nav-overlay')?.classList.remove('show')}
  function ensureNav(){
    const u=user();if(!u||u.role==='driver')return;
    const nav=document.querySelector('.sidebar nav');if(!nav||nav.querySelector('[data-env-module]'))return;
    let group=nav.querySelector('.nav-group[data-group="residuos"]');
    if(!group){
      group=document.createElement('div');group.className='nav-group';group.dataset.group='residuos';
      const h=document.createElement('button');h.type='button';h.className='nav-group-header';h.setAttribute('aria-expanded','true');h.innerHTML='<span class="nav-group-title">RESÍDUOS</span><span class="nav-group-chevron">⌄</span>';
      const items=document.createElement('div');items.className='nav-group-items';group.append(h,items);
      h.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const c=group.classList.toggle('is-group-collapsed');h.setAttribute('aria-expanded',String(!c))});
      const finance=nav.querySelector('.nav-group[data-group="financeiro"]');nav.insertBefore(group,finance||null);
    }
    const b=document.createElement('button');b.type='button';b.dataset.envModule='1';b.title='Documentação Ambiental';b.innerHTML='<span class="nav-icon" aria-hidden="true">▤</span><span class="nav-label">Documentação Ambiental</span>';
    b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();render('mtr');closeMobile()});
    group.querySelector('.nav-group-items')?.appendChild(b);
  }
  function setActive(){document.querySelectorAll('.sidebar nav button').forEach(x=>x.classList.remove('active'));document.querySelector('[data-env-module]')?.classList.add('active')}

  function daysUntil(date){if(!date)return null;const end=new Date(`${date}T12:00:00`),start=new Date(`${today()}T12:00:00`);return Math.ceil((end-start)/86400000)}
  function expiryState(date){
    if(!date)return {key:'muted',label:'Sem validade',days:null};
    const d=daysUntil(date);if(d<0)return {key:'bad',label:`Vencido há ${Math.abs(d)} dia${Math.abs(d)===1?'':'s'}`,days:d};
    if(d<=60)return {key:'warn',label:d===0?'Vence hoje':`Vence em ${d} dia${d===1?'':'s'}`,days:d};
    return {key:'ok',label:'Válido',days:d};
  }
  function mtrState(m){if(!m)return {key:'warn',label:'Sem MTR registrado'};if(m.status==='Cancelado')return {key:'bad',label:'Cancelado'};if(m.status==='Finalizado')return {key:'ok',label:'Finalizado'};if(m.status==='Emitido')return {key:'ok',label:'Emitido'};return {key:'warn',label:'Pendente'} }

  function metrics(){
    const e=env(),list=eligibleOrders(),withMtr=list.filter(o=>e.mtrs.some(m=>m.orderId===o.id&&m.status!=='Cancelado')).length,pending=list.length-withMtr;
    const certActive=e.certificates.filter(c=>{const s=expiryState(c.expiryDate);return s.key==='ok'||s.key==='warn'||!c.expiryDate}).length;
    const warnings=e.certificates.filter(c=>expiryState(c.expiryDate).key==='warn').length+facilities().filter(f=>expiryState(f.licenseExpiry).key==='warn').length;
    return {loads:list.length,withMtr,pending,certActive,warnings};
  }

  function render(next=view){
    view=next;const content=document.querySelector('.content');if(!content)return;setActive();
    const title=document.querySelector('.topbar h1');if(title)title.textContent='Documentação Ambiental';
    const m=metrics();content.dataset.envScreen='1';content.innerHTML=`<section class="env-wrap">
      <div class="env-head"><div><span class="env-eyebrow">MTR • CDF • LICENÇAS • VENCIMENTOS</span><h2>Documentação Ambiental</h2><p>Controle documental vinculado às Ordens de Coleta e às destinações. O sistema registra os documentos oficiais; não substitui a emissão nos órgãos competentes.</p></div><div class="env-tabs"><button class="${view==='mtr'?'active':''}" data-env-action="tab" data-view="mtr">MTR</button><button class="${view==='certificates'?'active':''}" data-env-action="tab" data-view="certificates">Certificados / CDF</button><button class="${view==='licenses'?'active':''}" data-env-action="tab" data-view="licenses">Licenças</button></div></div>
      <div class="env-kpis"><article><span>Cargas controladas</span><strong>${m.loads}</strong><small>coletadas/destinadas</small></article><article><span>Com MTR</span><strong>${m.withMtr}</strong><small>documento registrado</small></article><article><span>Sem MTR</span><strong>${m.pending}</strong><small>exigem conferência</small></article><article><span>Certificados ativos</span><strong>${m.certActive}</strong><small>arquivos cadastrados</small></article><article><span>Vencendo em 60 dias</span><strong>${m.warnings}</strong><small>certificados + licenças</small></article></div>
      ${view==='mtr'?mtrHTML():view==='certificates'?certificatesHTML():licensesHTML()}
      <div id="env-modal-root"></div>
    </section>`;
    bindFilters();
  }

  function mtrHTML(){
    const list=eligibleOrders();return `<div class="env-toolbar panel"><input id="env-search" placeholder="Buscar ordem, cliente, resíduo, destino ou MTR..."><select id="env-filter"><option value="">Todos</option><option value="missing">Sem MTR</option><option value="pending">Pendente</option><option value="issued">Emitido</option><option value="finished">Finalizado</option></select></div>
      ${list.length?`<div class="env-list">${list.map(mtrCard).join('')}</div>`:`<div class="env-empty"><strong>Nenhuma carga disponível</strong>As Ordens de Coleta aparecem aqui após a coleta ser registrada.</div>`}`;
  }
  function mtrCard(o){
    const m=mtrFor(o.id),state=mtrState(m),filter=!m?'missing':m.status==='Finalizado'?'finished':m.status==='Emitido'?'issued':'pending';
    const search=[o.code,clientName(o.clientId),o.wasteType,o.destination?.facilityName,m?.number].join(' ').toLowerCase();
    return `<article class="env-card" data-search="${esc(search)}" data-filter="${filter}"><div class="env-card-top"><div><small>ORDEM DE COLETA</small><strong>${esc(o.code)} • ${esc(clientName(o.clientId))}</strong></div><span class="env-pill ${state.key}">${esc(state.label)}</span></div><div class="env-grid"><div><span>Resíduo</span><b>${esc(o.wasteType||'—')}</b></div><div><span>Peso líquido</span><b>${kg(o.destination?.netKg)}</b></div><div><span>Destinador</span><b>${esc(o.destination?.facilityName||facilityName(o.destination?.facilityId)||'—')}</b></div><div><span>Nº MTR</span><b>${esc(m?.number||'Não informado')}</b></div><div><span>Emissão</span><b>${esc(m?.issueDate||'—')}</b></div><div><span>Status</span><b>${esc(m?.status||'Pendente de registro')}</b></div><div><span>Anexo</span><b>${m?.fileKey?'Disponível neste dispositivo':'—'}</b></div><div><span>Atualização</span><b>${esc(m?.updatedAt||m?.createdAt||'—')}</b></div></div><div class="env-card-actions">${m?.fileKey?`<button data-env-action="file" data-kind="mtr" data-id="${m.id}">Abrir anexo</button>`:''}<button class="primary" data-env-action="mtr" data-order="${o.id}">${m?'Editar MTR':'Registrar MTR'}</button></div></article>`;
  }

  function certificatesHTML(){
    const list=env().certificates.slice().sort((a,b)=>String(b.issueDate||b.createdAt||'').localeCompare(String(a.issueDate||a.createdAt||'')));
    return `<div class="env-toolbar panel"><input id="env-search" placeholder="Buscar certificado, destinador, número ou ordem..."><select id="env-filter"><option value="">Todos</option><option value="active">Ativos</option><option value="warning">Vencendo</option><option value="expired">Vencidos</option></select><button class="primary" data-env-action="certificate">+ Novo certificado</button></div>${list.length?`<div class="env-list">${list.map(certCard).join('')}</div>`:`<div class="env-empty"><strong>Nenhum certificado cadastrado</strong>Cadastre CDFs e outros certificados recebidos dos destinadores.<br><br><button class="primary" data-env-action="certificate">Cadastrar certificado</button></div>`}`;
  }
  function certCard(c){
    const s=expiryState(c.expiryDate),filter=s.key==='bad'?'expired':s.key==='warn'?'warning':'active',o=orders().find(x=>x.id===c.orderId);
    const search=[c.type,c.number,facilityName(c.facilityId),o?.code,c.notes].join(' ').toLowerCase();
    return `<article class="env-card" data-search="${esc(search)}" data-filter="${filter}"><div class="env-card-top"><div><small>${esc(c.type||'CERTIFICADO')}</small><strong>${esc(c.number||'Sem número')}</strong></div><span class="env-pill ${s.key}">${esc(s.label)}</span></div><div class="env-grid"><div><span>Destinador</span><b>${esc(facilityName(c.facilityId))}</b></div><div><span>Ordem vinculada</span><b>${esc(o?.code||'Não vinculada')}</b></div><div><span>Emissão</span><b>${esc(c.issueDate||'—')}</b></div><div><span>Validade</span><b>${esc(c.expiryDate||'Sem validade definida')}</b></div><div><span>Período inicial</span><b>${esc(c.periodStart||'—')}</b></div><div><span>Período final</span><b>${esc(c.periodEnd||'—')}</b></div><div><span>Anexo</span><b>${c.fileKey?'Disponível neste dispositivo':'—'}</b></div><div><span>Atualizado por</span><b>${esc(c.updatedBy||c.createdBy||'—')}</b></div></div><div class="env-card-actions">${c.fileKey?`<button data-env-action="file" data-kind="certificate" data-id="${c.id}">Abrir anexo</button>`:''}<button class="primary" data-env-action="certificate" data-id="${c.id}">Editar</button></div></article>`;
  }

  function licensesHTML(){
    const list=facilities().slice().sort((a,b)=>String(a.licenseExpiry||'9999').localeCompare(String(b.licenseExpiry||'9999')));
    return `<div class="env-alert">As licenças são cadastradas no módulo de Destinadores. Aqui mostramos a situação e os próximos vencimentos.</div><div class="env-toolbar panel"><input id="env-search" placeholder="Buscar destinador, CNPJ ou licença..."><select id="env-filter"><option value="">Todos</option><option value="active">Válidas</option><option value="warning">Vencendo</option><option value="expired">Vencidas / incompletas</option></select><button data-env-action="destinations">Abrir Destinadores</button></div>${list.length?`<div class="env-list">${list.map(licenseCard).join('')}</div>`:`<div class="env-empty"><strong>Nenhum destinador cadastrado</strong>Cadastre os destinadores e suas licenças ambientais primeiro.</div>`}`;
  }
  function licenseCard(f){
    const incomplete=!f.license||!f.licenseExpiry,s=incomplete?{key:'bad',label:'Cadastro incompleto',days:null}:expiryState(f.licenseExpiry),filter=s.key==='bad'?'expired':s.key==='warn'?'warning':'active';
    const search=[f.name,f.cnpj,f.license,f.city].join(' ').toLowerCase(),pct=s.days===null?0:Math.max(0,Math.min(100,(s.days/365)*100));
    return `<article class="env-card" data-search="${esc(search)}" data-filter="${filter}"><div class="env-card-top"><div><small>DESTINADOR</small><strong>${esc(f.name)}</strong></div><span class="env-pill ${s.key}">${esc(s.label)}</span></div><div class="env-grid"><div><span>CNPJ</span><b>${esc(f.cnpj||'—')}</b></div><div><span>Cidade</span><b>${esc(f.city||'—')}</b></div><div><span>Licença ambiental</span><b>${esc(f.license||'Não informada')}</b></div><div><span>Validade</span><b>${esc(f.licenseExpiry||'Não informada')}</b></div></div><div class="env-license-bar ${s.key}"><i style="width:${pct}%"></i></div><div class="env-card-actions"><button data-env-action="destinations">Editar em Destinadores</button></div></article>`;
  }

  function modal(html,wide=false){closeModal();const root=document.getElementById('env-modal-root')||document.body,wrap=document.createElement('div');wrap.className='env-modal-backdrop';wrap.innerHTML=`<div class="env-modal ${wide?'env-modal-wide':''}">${html}</div>`;root.appendChild(wrap);wrap.addEventListener('click',e=>{if(e.target===wrap)closeModal()});return wrap}
  function closeModal(){document.querySelectorAll('.env-modal-backdrop').forEach(x=>x.remove())}

  function mtrForm(orderId){
    const o=orders().find(x=>x.id===orderId);if(!o)return;const e=env(),m=e.mtrs.find(x=>x.orderId===orderId)||{};
    modal(`<div class="env-modal-head"><div><span>MANIFESTO DE TRANSPORTE DE RESÍDUOS</span><h3>${esc(o.code)} • ${esc(clientName(o.clientId))}</h3></div><button data-env-action="close">×</button></div><div class="env-alert">Informe os dados do MTR emitido no sistema oficial aplicável. Este cadastro é apenas o controle interno da Telemonte.</div><br><form id="env-mtr-form" class="env-form"><input type="hidden" name="orderId" value="${o.id}"><label>Nº oficial do MTR<input name="number" value="${esc(m.number||'')}" placeholder="Informe após a emissão"></label><label>Status<select name="status"><option ${m.status==='Pendente'||!m.status?'selected':''}>Pendente</option><option ${m.status==='Emitido'?'selected':''}>Emitido</option><option ${m.status==='Finalizado'?'selected':''}>Finalizado</option><option ${m.status==='Cancelado'?'selected':''}>Cancelado</option></select></label><label>Data de emissão<input type="date" name="issueDate" value="${esc(m.issueDate||'')}"></label><label>Data de finalização<input type="date" name="finalizedDate" value="${esc(m.finalizedDate||'')}"></label><label class="env-span-2">Referência / protocolo / link<input name="externalRef" value="${esc(m.externalRef||'')}" placeholder="Protocolo ou referência externa"></label><label class="env-span-2">Anexo do MTR<input id="env-mtr-file" type="file" accept="application/pdf,image/*"><small>${m.fileKey?`Arquivo atual: ${esc(m.fileName||'anexo salvo')}. Um novo arquivo substituirá o anterior.`:'PDF ou imagem. No protótipo, fica salvo neste dispositivo.'}</small></label><label class="env-span-2">Observações<textarea name="notes">${esc(m.notes||'')}</textarea></label><div class="env-form-actions"><button type="button" data-env-action="close">Cancelar</button><button class="primary">Salvar MTR</button></div></form>`,true);
    document.getElementById('env-mtr-form')?.addEventListener('submit',async ev=>{ev.preventDefault();await saveMtr(new FormData(ev.currentTarget),document.getElementById('env-mtr-file')?.files?.[0])});
  }

  async function saveMtr(fd,file){
    const orderId=String(fd.get('orderId')||''),status=String(fd.get('status')||'Pendente'),number=String(fd.get('number')||'').trim();
    if(status!=='Pendente'&&status!=='Cancelado'&&!number)return alert('Informe o número oficial do MTR para este status.');
    const data=env(),o=orders().find(x=>x.id===orderId);if(!o)return;let m=data.mtrs.find(x=>x.orderId===orderId),fileKey=m?.fileKey||'',fileName=m?.fileName||'',fileType=m?.fileType||'';
    if(file){fileKey=`mtr-${orderId}-${Date.now()}`;await putFile(fileKey,file);fileName=file.name;fileType=file.type}
    const fields={orderId,number,status,issueDate:String(fd.get('issueDate')||''),finalizedDate:String(fd.get('finalizedDate')||''),externalRef:String(fd.get('externalRef')||'').trim(),notes:String(fd.get('notes')||'').trim(),fileKey,fileName,fileType,updatedAt:now(),updatedBy:user()?.name||'Usuário'};
    if(m)Object.assign(m,fields);else{m={id:uid('mtr'),...fields,createdAt:now(),createdBy:user()?.name||'Usuário'};data.mtrs.push(m)}saveEnv(data);
    const list=orders(),row=list.find(x=>x.id===orderId);if(row){row.history=Array.isArray(row.history)?row.history:[];row.history.unshift({at:now(),action:`MTR ${number||'(pendente)'} registrado/atualizado • ${status}`,user:user()?.name||'Usuário'});row.updatedAt=now();write(ORDERS_KEY,list)}
    closeModal();render('mtr');
  }

  function certificateForm(id=''){
    const data=env(),c=data.certificates.find(x=>x.id===id)||{},fac=facilities(),ords=eligibleOrders();
    modal(`<div class="env-modal-head"><div><span>CERTIFICADO AMBIENTAL</span><h3>${id?'Editar certificado':'Novo certificado / CDF'}</h3></div><button data-env-action="close">×</button></div><form id="env-cert-form" class="env-form"><input type="hidden" name="id" value="${esc(id)}"><label>Tipo<select name="type"><option ${c.type==='CDF'||!c.type?'selected':''}>CDF</option><option ${c.type==='Certificado de Destinação'?'selected':''}>Certificado de Destinação</option><option ${c.type==='Certificado de Reciclagem'?'selected':''}>Certificado de Reciclagem</option><option ${c.type==='Outro'?'selected':''}>Outro</option></select></label><label>Nº do certificado<input name="number" required value="${esc(c.number||'')}"></label><label>Destinador<select name="facilityId" required><option value="">Selecione</option>${fac.map(f=>`<option value="${f.id}" ${c.facilityId===f.id?'selected':''}>${esc(f.name)}</option>`).join('')}</select></label><label>Ordem vinculada (opcional)<select name="orderId"><option value="">Não vincular</option>${ords.map(o=>`<option value="${o.id}" ${c.orderId===o.id?'selected':''}>${esc(o.code)} • ${esc(clientName(o.clientId))}</option>`).join('')}</select></label><label>Data de emissão<input type="date" name="issueDate" value="${esc(c.issueDate||today())}"></label><label>Validade<input type="date" name="expiryDate" value="${esc(c.expiryDate||'')}"></label><label>Período inicial<input type="date" name="periodStart" value="${esc(c.periodStart||'')}"></label><label>Período final<input type="date" name="periodEnd" value="${esc(c.periodEnd||'')}"></label><label class="env-span-2">Anexo<input id="env-cert-file" type="file" accept="application/pdf,image/*"><small>${c.fileKey?`Arquivo atual: ${esc(c.fileName||'anexo salvo')}. Um novo arquivo substituirá o anterior.`:'PDF ou imagem. No protótipo, fica salvo neste dispositivo.'}</small></label><label class="env-span-2">Observações<textarea name="notes">${esc(c.notes||'')}</textarea></label><div class="env-form-actions"><button type="button" data-env-action="close">Cancelar</button><button class="primary">Salvar certificado</button></div></form>`,true);
    document.getElementById('env-cert-form')?.addEventListener('submit',async ev=>{ev.preventDefault();await saveCertificate(new FormData(ev.currentTarget),document.getElementById('env-cert-file')?.files?.[0])});
  }

  async function saveCertificate(fd,file){
    const data=env(),id=String(fd.get('id')||''),existing=data.certificates.find(x=>x.id===id);let fileKey=existing?.fileKey||'',fileName=existing?.fileName||'',fileType=existing?.fileType||'';
    if(file){fileKey=`cert-${id||Date.now()}-${Date.now()}`;await putFile(fileKey,file);fileName=file.name;fileType=file.type}
    const fields={type:String(fd.get('type')||'CDF'),number:String(fd.get('number')||'').trim(),facilityId:String(fd.get('facilityId')||''),orderId:String(fd.get('orderId')||''),issueDate:String(fd.get('issueDate')||''),expiryDate:String(fd.get('expiryDate')||''),periodStart:String(fd.get('periodStart')||''),periodEnd:String(fd.get('periodEnd')||''),notes:String(fd.get('notes')||'').trim(),fileKey,fileName,fileType,updatedAt:now(),updatedBy:user()?.name||'Usuário'};
    if(existing)Object.assign(existing,fields);else data.certificates.push({id:uid('cert'),...fields,createdAt:now(),createdBy:user()?.name||'Usuário'});saveEnv(data);closeModal();render('certificates');
  }

  function openFileDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(FILE_DB,1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('files'))d.createObjectStore('files',{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
  async function putFile(id,file){const d=await openFileDB();return await new Promise((resolve,reject)=>{const tx=d.transaction('files','readwrite');tx.objectStore('files').put({id,blob:file,name:file.name,type:file.type,createdAt:Date.now()});tx.oncomplete=()=>{d.close();resolve(id)};tx.onerror=()=>{d.close();reject(tx.error)}})}
  async function getFile(id){if(!id)return null;const d=await openFileDB();return await new Promise((resolve,reject)=>{const tx=d.transaction('files','readonly'),r=tx.objectStore('files').get(id);r.onsuccess=()=>{d.close();resolve(r.result||null)};r.onerror=()=>{d.close();reject(r.error)}})}
  async function openAttachment(kind,id){
    const data=env(),item=kind==='mtr'?data.mtrs.find(x=>x.id===id):data.certificates.find(x=>x.id===id);if(!item?.fileKey)return;
    try{const f=await getFile(item.fileKey);if(!f)return alert('O anexo não está disponível neste dispositivo.');const url=URL.createObjectURL(f.blob);const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}catch{alert('Não foi possível abrir o anexo.')}
  }

  function bindFilters(){const q=document.getElementById('env-search'),f=document.getElementById('env-filter');const apply=()=>{const text=(q?.value||'').toLowerCase(),filter=f?.value||'';document.querySelectorAll('.env-card').forEach(x=>x.hidden=!!(text&&!x.dataset.search?.includes(text))||!!(filter&&x.dataset.filter!==filter))};q?.addEventListener('input',apply);f?.addEventListener('change',apply)}

  function enhanceOrders(){
    document.querySelectorAll('.op-card').forEach(card=>{if(card.querySelector('[data-env-order-button]'))return;const id=card.querySelector('[data-op-action][data-id]')?.dataset.id,o=orders().find(x=>x.id===id);if(!o||!['Coletada','Destinada','Finalizada'].includes(o.status))return;const actions=card.querySelector('.op-card-actions');if(!actions)return;const b=document.createElement('button');b.type='button';b.dataset.envOrderButton='1';const m=mtrFor(id);b.textContent=m?'MTR / Docs':'Registrar MTR';if(!m)b.className='primary';b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();render('mtr');setTimeout(()=>mtrForm(id),50)});actions.appendChild(b)});
    document.querySelectorAll('.dw-card').forEach(card=>{if(card.querySelector('[data-env-order-button]'))return;const code=card.querySelector('.dw-card-top strong')?.textContent?.trim(),o=orders().find(x=>x.code===code);if(!o)return;const actions=card.querySelector('.dw-actions');if(!actions)return;const b=document.createElement('button');b.type='button';b.dataset.envOrderButton='1';b.textContent=mtrFor(o.id)?'MTR / Docs':'Registrar MTR';b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();render('mtr');setTimeout(()=>mtrForm(o.id),50)});actions.appendChild(b)});
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-env-action]');if(!b)return;const a=b.dataset.envAction;
    if(a==='close')closeModal();
    if(a==='tab')render(b.dataset.view);
    if(a==='mtr')mtrForm(b.dataset.order);
    if(a==='certificate')certificateForm(b.dataset.id||'');
    if(a==='file')openAttachment(b.dataset.kind,b.dataset.id);
    if(a==='destinations'){closeModal();if(window.TMDestination?.render)window.TMDestination.render('facilities');else alert('Abra Destinação / Pesagem e acesse Destinadores.');}
  });

  function enhance(){ensureNav();enhanceOrders()}
  const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(enhance,90)});observer.observe(document.documentElement,{subtree:true,childList:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance);else enhance();
  window.TMEnvironmental={render,mtrForm,certificateForm};
})();

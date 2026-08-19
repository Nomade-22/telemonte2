(() => {
  'use strict';

  const DB_KEY='telemonte-db-v3';
  const SESSION_KEY='telemonte-session-v2';
  const ORDERS_KEY='telemonte-collection-orders-v1';
  const POINTS_KEY='telemonte-pickup-points-v1';
  const MEDIA_DB='telemonte-media-v1';
  let timer=null;

  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const readJSON=(key,fallback)=>{try{const x=JSON.parse(localStorage.getItem(key)||'null');return x??fallback}catch{return fallback}};
  const writeJSON=(key,v)=>localStorage.setItem(key,JSON.stringify(v));
  const db=()=>readJSON(DB_KEY,{users:[],clients:[]});
  const orders=()=>{const x=readJSON(ORDERS_KEY,[]);return Array.isArray(x)?x:[]};
  const points=()=>{const x=readJSON(POINTS_KEY,[]);return Array.isArray(x)?x:[]};
  const currentUser=()=>{const d=db(),id=localStorage.getItem(SESSION_KEY);return d.users?.find(x=>x.id===id&&x.active)||null};
  const client=id=>db().clients?.find(x=>x.id===id)||null;
  const point=id=>points().find(x=>x.id===id)||null;
  const order=id=>orders().find(x=>x.id===id)||null;
  const now=()=>new Date().toLocaleString('pt-BR');

  function openMediaDB(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(MEDIA_DB,1);
      req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains('photos'))d.createObjectStore('photos',{keyPath:'id'})};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }

  async function getPhoto(id){
    if(!id)return null;
    try{
      const d=await openMediaDB();
      return await new Promise((resolve,reject)=>{
        const tx=d.transaction('photos','readonly');
        const r=tx.objectStore('photos').get(id);
        r.onsuccess=()=>{d.close();resolve(r.result?.blob||null)};
        r.onerror=()=>{d.close();reject(r.error)};
      });
    }catch{return null}
  }

  function blobToDataURL(blob){
    return new Promise(resolve=>{
      if(!blob)return resolve('');
      const r=new FileReader();
      r.onload=()=>resolve(String(r.result||''));
      r.onerror=()=>resolve('');
      r.readAsDataURL(blob);
    });
  }

  function markIssued(id){
    const list=orders();
    const i=list.findIndex(x=>x.id===id);if(i<0)return;
    const o=list[i],ex=o.execution=o.execution||{};
    if(ex.receiptIssuedAt)return;
    ex.receiptIssuedAt=now();
    ex.receiptIssuedBy=currentUser()?.name||'Usuário';
    o.updatedAt=ex.receiptIssuedAt;
    o.history=Array.isArray(o.history)?o.history:[];
    o.history.unshift({at:ex.receiptIssuedAt,action:'Comprovante de coleta emitido',user:ex.receiptIssuedBy});
    list[i]=o;writeJSON(ORDERS_KEY,list);
  }

  function hasReceipt(o){return !!o?.execution?.clientCompletedAt}

  function addButtons(){
    document.querySelectorAll('.driver-order-card').forEach(card=>{
      if(card.querySelector('[data-receipt-id]'))return;
      const anchor=card.querySelector('[data-dx-action][data-id]');
      const id=anchor?.dataset.id,o=order(id);
      if(!id||!hasReceipt(o))return;
      const area=card.querySelector('.driver-order-actions');if(!area)return;
      const b=document.createElement('button');b.type='button';b.dataset.receiptId=id;b.textContent='▤ Comprovante';area.appendChild(b);
    });

    document.querySelectorAll('.op-card').forEach(card=>{
      if(card.querySelector('[data-receipt-id]'))return;
      const anchor=card.querySelector('[data-op-action][data-id]');
      const id=anchor?.dataset.id,o=order(id);
      if(!id||!hasReceipt(o))return;
      const area=card.querySelector('.op-card-actions');if(!area)return;
      const b=document.createElement('button');b.type='button';b.dataset.receiptId=id;b.textContent='▤ Comprovante';area.prepend(b);
    });

    document.querySelectorAll('.dx-modal').forEach(modal=>{
      if(modal.querySelector('[data-receipt-id]'))return;
      const id=modal.querySelector('[data-dx-action][data-id]')?.dataset.id;
      const o=order(id);if(!id||!hasReceipt(o))return;
      const footer=modal.querySelector('.dx-footer');if(!footer)return;
      const b=document.createElement('button');b.type='button';b.dataset.receiptId=id;b.textContent='▤ Abrir comprovante';footer.insertBefore(b,footer.lastElementChild||null);
    });
  }

  function proofImage(src,label){
    return src?`<figure><img src="${src}" alt="${esc(label)}"><figcaption>${esc(label)}</figcaption></figure>`:`<div class="proof-missing"><b>${esc(label)}</b><span>Arquivo não disponível neste dispositivo.</span></div>`;
  }

  function row(label,value){return `<div class="info"><span>${esc(label)}</span><b>${esc(value||'—')}</b></div>`}

  async function openReceipt(id){
    const o=order(id);if(!o)return alert('Ordem não encontrada.');
    if(!hasReceipt(o))return alert('O comprovante será liberado após a conclusão do atendimento no cliente.');

    const win=window.open('','_blank','width=980,height=820');
    if(!win)return alert('Permita pop-ups para visualizar o comprovante.');
    win.document.write('<!doctype html><html><body style="font-family:Arial,sans-serif;padding:30px">Preparando comprovante...</body></html>');
    win.document.close();

    const ex=o.execution||{},c=client(o.clientId),p=point(o.pointId);
    const [beforeBlob,afterBlob]=await Promise.all([getPhoto(ex.photoBeforeKey),getPhoto(ex.photoAfterKey)]);
    const [before,after]=await Promise.all([blobToDataURL(beforeBlob),blobToDataURL(afterBlob)]);
    const logo=new URL('./assets/telemonte-logo.svg',window.location.href).href;
    markIssued(id);
    const fresh=order(id)||o,fx=fresh.execution||ex;

    const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comprovante ${esc(fresh.code)}</title><style>
      @page{size:A4;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#17372f;margin:0;background:#edf3f1}.toolbar{position:sticky;top:0;z-index:2;background:#17372f;color:white;padding:12px 18px;display:flex;gap:10px;justify-content:flex-end}.toolbar button{border:0;border-radius:8px;padding:10px 16px;font-weight:700;cursor:pointer}.toolbar .primary{background:#7bc043;color:#102b24}.sheet{width:210mm;min-height:297mm;margin:18px auto;background:white;padding:15mm;box-shadow:0 8px 30px #0002}.header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #7bc043;padding-bottom:12px;margin-bottom:18px}.header img{width:165px;height:auto}.title{text-align:right}.title small{display:block;color:#72817c;font-size:10px;letter-spacing:.15em;font-weight:800}.title h1{font-size:22px;margin:5px 0 2px}.title strong{font-size:15px}.status{display:inline-block;margin-top:5px;border-radius:999px;padding:5px 10px;background:#e9f6df;color:#28622b;font-size:11px;font-weight:800}.section{margin-top:19px}.section h2{font-size:12px;letter-spacing:.1em;color:#58706a;border-bottom:1px solid #dce6e2;padding-bottom:7px;margin:0 0 10px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 18px}.info span{display:block;color:#71817c;font-size:9px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}.info b{font-size:12px;line-height:1.35}.timeline{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.time{border:1px solid #dce6e2;border-radius:8px;padding:9px}.time span{display:block;font-size:9px;text-transform:uppercase;color:#71817c}.time b{display:block;font-size:11px;margin-top:4px}.photos{display:grid;grid-template-columns:1fr 1fr;gap:12px}.photos figure{margin:0;border:1px solid #dce6e2;border-radius:10px;overflow:hidden;background:#f7faf9}.photos img{display:block;width:100%;height:190px;object-fit:cover}.photos figcaption{font-size:10px;font-weight:700;padding:7px 9px}.proof-missing{min-height:190px;border:1px dashed #b7c8c2;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#71817c;text-align:center;padding:20px}.proof-missing b{color:#17372f;margin-bottom:5px}.signature{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:end}.signbox{border:1px solid #dce6e2;border-radius:10px;padding:10px;min-height:120px}.signbox img{display:block;max-width:100%;max-height:95px;margin:auto}.signline{border-top:1px solid #17372f;margin-top:22px;padding-top:5px;text-align:center;font-size:10px}.gps{font-family:monospace;font-size:10px;word-break:break-word}.notes{border-left:4px solid #7bc043;background:#f4f8f6;padding:10px 12px;font-size:11px;white-space:pre-wrap}.footer{margin-top:22px;padding-top:10px;border-top:1px solid #dce6e2;display:flex;justify-content:space-between;gap:20px;color:#71817c;font-size:8px}.footer b{color:#17372f}.legal{margin-top:7px;font-size:8px;color:#84938e}.badge{font-weight:800;color:#2d6e36}.mono{font-family:monospace}@media(max-width:760px){.sheet{width:100%;min-height:auto;margin:0;padding:18px}.grid,.photos,.signature,.timeline{grid-template-columns:1fr}.toolbar{position:relative}.header{align-items:flex-start;gap:15px}.header img{width:125px}.title h1{font-size:18px}.title{text-align:right}.photos img{height:auto;max-height:280px}}@media print{body{background:white}.toolbar{display:none}.sheet{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none}.photos img{height:150px}.section{break-inside:avoid}}
    </style></head><body>
      <div class="toolbar"><button onclick="window.close()">Fechar</button><button class="primary" onclick="window.print()">Imprimir / Salvar PDF</button></div>
      <main class="sheet">
        <header class="header"><img src="${logo}" alt="Telemonte"><div class="title"><small>COMPROVANTE OPERACIONAL</small><h1>Comprovante de Coleta</h1><strong class="mono">${esc(fresh.code)}</strong><br><span class="status">ATENDIMENTO CONCLUÍDO</span></div></header>
        <section class="section"><h2>CLIENTE E PONTO DE COLETA</h2><div class="grid">${row('Cliente',c?.name)}${row('CNPJ',c?.cnpj)}${row('Ponto de coleta',p?.name)}${row('Endereço',p?.address)}${row('Cidade / UF',p?.city||c?.city)}${row('Contato no local',p?.contact||p?.phone)}</div></section>
        <section class="section"><h2>DADOS DA OPERAÇÃO</h2><div class="grid">${row('Resíduo',fresh.wasteType)}${row('Quantidade',fresh.quantity?`${fresh.quantity} ${fresh.unit||''}`:'—')}${row('Caçamba',fresh.containerCode)}${row('Motorista',fresh.driver)}${row('Caminhão',fresh.vehicle?`Caminhão ${fresh.vehicle}`:'—')}${row('Rota',fresh.route)}${row('Programação',`${fresh.scheduledDate||'—'} ${fresh.scheduledTime||''}`)}${row('Status atual',fresh.status)}</div></section>
        <section class="section"><h2>LINHA DO TEMPO</h2><div class="timeline"><div class="time"><span>Saída / início</span><b>${esc(fx.startedAt||'—')}</b></div><div class="time"><span>Chegada</span><b>${esc(fx.arrivedAt||'—')}</b></div><div class="time"><span>Coleta</span><b>${esc(fx.collectedAt||'—')}</b></div><div class="time"><span>Conclusão</span><b>${esc(fx.clientCompletedAt||'—')}</b></div></div></section>
        <section class="section"><h2>LOCALIZAÇÕES REGISTRADAS</h2><div class="grid"><div class="info"><span>GPS de início</span><b class="gps">${esc(fx.startGps||'—')}</b></div><div class="info"><span>GPS de chegada</span><b class="gps">${esc(fx.arrivalGps||'—')}</b></div><div class="info"><span>GPS de conclusão</span><b class="gps">${esc(fx.finishGps||'—')}</b></div><div class="info"><span>QR da caçamba</span><b class="badge">${fx.qrVerified?`✓ ${esc(fresh.containerCode||'Verificado')}`:'Não registrado'}</b></div></div></section>
        <section class="section"><h2>REGISTRO FOTOGRÁFICO</h2><div class="photos">${proofImage(before,'Foto antes da coleta')}${proofImage(after,'Foto depois da coleta')}</div></section>
        <section class="section"><h2>RESPONSÁVEL NO LOCAL</h2><div class="signature"><div>${row('Nome do responsável',fx.responsible)}${row('Data / hora da assinatura',fx.signatureAt)}</div><div class="signbox">${fx.signature?`<img src="${fx.signature}" alt="Assinatura do responsável">`:'<div class="proof-missing">Assinatura indisponível</div>'}<div class="signline">Assinatura do responsável</div></div></div></section>
        ${fresh.notes?`<section class="section"><h2>OBSERVAÇÕES DA ORDEM</h2><div class="notes">${esc(fresh.notes)}</div></section>`:''}
        <footer class="footer"><div><b>Telemonte</b><br>Sistema de Gestão de Coleta de Resíduos</div><div>Comprovante emitido em ${esc(fx.receiptIssuedAt||now())}<br>Emitido por: ${esc(fx.receiptIssuedBy||currentUser()?.name||'Sistema')}</div></footer>
        <div class="legal">Este comprovante registra a execução operacional da coleta. Nota fiscal, MTR, certificado de destinação e demais documentos fiscais/ambientais, quando aplicáveis, são documentos independentes.</div>
      </main>
    </body></html>`;

    win.document.open();win.document.write(html);win.document.close();
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-receipt-id]');if(!b)return;
    e.preventDefault();e.stopPropagation();openReceipt(b.dataset.receiptId);
  });

  const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(addButtons,100)});
  observer.observe(document.documentElement,{subtree:true,childList:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addButtons);else addButtons();
  window.TMReceipt={open:openReceipt};
})();

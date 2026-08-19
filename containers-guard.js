(() => {
  'use strict';
  const STORE='telemonte-containers-control-v1';
  function items(){try{const raw=JSON.parse(localStorage.getItem(STORE)||'[]');return Array.isArray(raw)&&raw.length?raw:Array.from({length:20},(_,i)=>({number:i+1,code:`C-${String(i+1).padStart(3,'0')}`,status:'Disponível no pátio'}));}catch{return []}}
  function apply(){
    const nav=document.querySelector('[data-page="Caçambas"]');
    if(nav){const label=nav.querySelector('.nav-label');if(label&&label.textContent!=='Controle de Caçambas')label.textContent='Controle de Caçambas';nav.title='Controle de Caçambas';}
    const title=document.querySelector('.topbar h1')?.textContent?.trim();
    if(title==='Dashboard'){
      const list=items();
      document.querySelectorAll('.card').forEach(card=>{
        const label=card.querySelector('span');
        if(label?.textContent?.trim()==='Caçambas em clientes'){
          label.textContent='Caçambas controladas';
          const strong=card.querySelector('strong');
          const small=card.querySelector('small');
          if(strong)strong.textContent='20';
          if(small)small.textContent=`${list.filter(x=>x.status==='Em cliente').length} em clientes • ${list.filter(x=>x.status==='Disponível no pátio').length} disponíveis`;
        }
      });
    }
  }
  const observer=new MutationObserver(apply);observer.observe(document.documentElement,{subtree:true,childList:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply);else apply();
})();
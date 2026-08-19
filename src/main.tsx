import React, {useEffect, useRef, useState} from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Role = 'admin'|'supervisor'|'driver';
type User = {name:string; username:string; role:Role};
type Client = {id:string; name:string; cnpj:string; city:string; status:'Ativo'|'Inativo'};
type Vehicle = {id:string; number:string; plate:string; model:string; driver:string; status:'Disponível'|'Em rota'|'Manutenção'; lat:number; lng:number};
type Container = {id:string; code:string; capacity:string; status:'Disponível'|'Em cliente'|'Em transporte'|'Higienização'|'Manutenção'; client:string};
type Route = {id:string; code:string; date:string; vehicle:string; driver:string; clients:number; done:number; status:'Programada'|'Em andamento'|'Finalizada'};
type DB = {clients:Client[]; vehicles:Vehicle[]; containers:Container[]; routes:Route[]};

const seed:DB = {
  clients:[
    {id:'c1',name:'Hospital São Lucas',cnpj:'12.345.678/0001-90',city:'Montenegro/RS',status:'Ativo'},
    {id:'c2',name:'Clínica Vida',cnpj:'23.456.789/0001-01',city:'São Leopoldo/RS',status:'Ativo'},
    {id:'c3',name:'Indústria Alfa',cnpj:'34.567.890/0001-12',city:'Canoas/RS',status:'Ativo'}
  ],
  vehicles:[
    {id:'v1',number:'07',plate:'ABC1D23',model:'Mercedes Atego',driver:'João Silva',status:'Em rota',lat:-29.6888,lng:-51.4612},
    {id:'v2',number:'04',plate:'DEF4G56',model:'VW Delivery',driver:'Carlos Souza',status:'Disponível',lat:-29.6842,lng:-51.4690},
    {id:'v3',number:'09',plate:'HIJ7K89',model:'Iveco Tector',driver:'Marcos Lima',status:'Manutenção',lat:-29.692,lng:-51.455}
  ],
  containers:[
    {id:'k1',code:'C-041',capacity:'5 m³',status:'Em cliente',client:'Hospital São Lucas'},
    {id:'k2',code:'C-087',capacity:'5 m³',status:'Disponível',client:'—'},
    {id:'k3',code:'C-102',capacity:'7 m³',status:'Higienização',client:'—'}
  ],
  routes:[
    {id:'r1',code:'R-014',date:new Date().toISOString().slice(0,10),vehicle:'07',driver:'João Silva',clients:8,done:5,status:'Em andamento'},
    {id:'r2',code:'R-015',date:new Date().toISOString().slice(0,10),vehicle:'04',driver:'Carlos Souza',clients:6,done:0,status:'Programada'}
  ]
};

const menuAdmin = ['Dashboard','Mapa / Rastreamento','Rotas','Clientes','Caminhões','Caçambas','Importar / Exportar','Área do Motorista'];
const menuDriver = ['Minha Rota','Ocorrências','Histórico'];

function uid(prefix:string){return prefix+Math.random().toString(36).slice(2,9)}
function loadDB():DB{try{const x=localStorage.getItem('telemonte-db-v1');return x?JSON.parse(x):seed}catch{return seed}}
function saveDB(db:DB){localStorage.setItem('telemonte-db-v1',JSON.stringify(db))}
function download(name:string,content:string,type='application/json'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href)}

function App(){
  const [user,setUser]=useState<User|null>(()=>{try{return JSON.parse(localStorage.getItem('telemonte-user')||'null')}catch{return null}});
  const [db,setDB]=useState<DB>(loadDB);
  const [page,setPage]=useState('Dashboard');
  useEffect(()=>saveDB(db),[db]);
  useEffect(()=>{if(user)localStorage.setItem('telemonte-user',JSON.stringify(user));else localStorage.removeItem('telemonte-user')},[user]);
  if(!user)return <Login onLogin={u=>{setUser(u);setPage(u.role==='driver'?'Minha Rota':'Dashboard')}}/>;
  const driver=user.role==='driver';
  const menu=driver?menuDriver:menuAdmin;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">T</div><div><strong>TELEMONTE</strong><small>Gestão de Coleta</small></div></div>
      <nav>{menu.map(m=><button key={m} className={page===m?'active':''} onClick={()=>setPage(m)}>{m}</button>)}</nav>
      <div className="sidebar-user"><small>{user.role.toUpperCase()}</small><strong>{user.name}</strong><span>@{user.username}</span><button onClick={()=>setUser(null)}>Sair</button></div>
    </aside>
    <main>
      <header className="topbar"><div><h1>{page}</h1><span>Sistema operacional de coleta de resíduos</span></div><div className="status-dot">● Online</div></header>
      <section className="content">
        {page==='Dashboard'&&<Dashboard db={db} setPage={setPage}/>} 
        {page==='Mapa / Rastreamento'&&<MapPage vehicles={db.vehicles}/>} 
        {page==='Clientes'&&<CrudClients db={db} setDB={setDB}/>} 
        {page==='Caminhões'&&<CrudVehicles db={db} setDB={setDB}/>} 
        {page==='Caçambas'&&<CrudContainers db={db} setDB={setDB}/>} 
        {page==='Rotas'&&<CrudRoutes db={db} setDB={setDB}/>} 
        {page==='Importar / Exportar'&&<ImportExport db={db} setDB={setDB}/>} 
        {(page==='Área do Motorista'||page==='Minha Rota')&&<DriverArea db={db}/>} 
        {page==='Ocorrências'&&<Placeholder title="Ocorrências" text="Módulo preparado para registrar ocorrências com foto, texto, data e GPS na próxima fase."/>}
        {page==='Histórico'&&<Placeholder title="Histórico" text="Aqui ficarão as jornadas e coletas anteriores do motorista autenticado."/>}
      </section>
    </main>
  </div>
}

function Login({onLogin}:{onLogin:(u:User)=>void}){
  const [username,setUsername]=useState('admin');
  const [password,setPassword]=useState('admin123');
  const [error,setError]=useState('');
  const users=[
    {username:'admin',password:'admin123',name:'Administrador',role:'admin' as Role},
    {username:'supervisor',password:'super123',name:'Supervisor Operacional',role:'supervisor' as Role},
    {username:'motorista',password:'rota123',name:'João Silva',role:'driver' as Role}
  ];
  function submit(e:React.FormEvent){
    e.preventDefault();
    const normalized=username.trim().toLowerCase();
    const u=users.find(x=>x.username===normalized&&x.password===password);
    if(!u){setError('Usuário ou senha inválidos.');return}
    setError('');
    onLogin({username:u.username,name:u.name,role:u.role});
  }
  return <div className="login-page"><div className="login-card">
    <div className="login-logo">T</div><h1>Telemonte</h1><p>Sistema de Gestão de Coleta de Resíduos</p>
    <form onSubmit={submit}>
      <label>Usuário<input value={username} onChange={e=>setUsername(e.target.value)} type="text" autoComplete="username" autoCapitalize="none"/></label>
      <label>Senha<input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password"/></label>
      {error&&<div className="error">{error}</div>}
      <button className="primary" type="submit">Entrar</button>
    </form>
    <div className="demo"><strong>Acessos de demonstração</strong><span>Administrador: admin / admin123</span><span>Supervisor: supervisor / super123</span><span>Motorista: motorista / rota123</span></div>
  </div></div>
}

function Dashboard({db,setPage}:{db:DB;setPage:(x:string)=>void}){
  const activeRoutes=db.routes.filter(r=>r.status==='Em andamento').length;
  return <><div className="cards">
    <Card title="Coletas / rotas ativas" value={String(activeRoutes)} hint={`${db.routes.length} rotas cadastradas`}/>
    <Card title="Caminhões em rota" value={String(db.vehicles.filter(v=>v.status==='Em rota').length)} hint={`${db.vehicles.length} veículos cadastrados`}/>
    <Card title="Caçambas em clientes" value={String(db.containers.filter(c=>c.status==='Em cliente').length)} hint={`${db.containers.filter(c=>c.status==='Disponível').length} disponíveis`}/>
    <Card title="Clientes ativos" value={String(db.clients.filter(c=>c.status==='Ativo').length)} hint="base operacional"/>
  </div><div className="grid2"><div className="panel"><div className="panel-head"><h2>Rotas de hoje</h2><button onClick={()=>setPage('Rotas')}>Ver todas</button></div>{db.routes.map(r=><div className="route-row" key={r.id}><div><strong>{r.code}</strong><span>{r.driver} • Caminhão {r.vehicle}</span></div><div className="progress"><i style={{width:`${Math.round((r.done/r.clients)*100)}%`}}></i></div><b>{r.done}/{r.clients}</b></div>)}</div><div className="panel"><div className="panel-head"><h2>Atalhos</h2></div><div className="quick"><button onClick={()=>setPage('Clientes')}>+ Cliente</button><button onClick={()=>setPage('Rotas')}>+ Rota</button><button onClick={()=>setPage('Mapa / Rastreamento')}>Abrir mapa</button><button onClick={()=>setPage('Importar / Exportar')}>Importar dados</button></div></div></div></>
}
function Card({title,value,hint}:{title:string;value:string;hint:string}){return <div className="card"><span>{title}</span><strong>{value}</strong><small>{hint}</small></div>}

function MapPage({vehicles}:{vehicles:Vehicle[]}){
  const ref=useRef<HTMLDivElement>(null);const mapRef=useRef<any>(null);
  useEffect(()=>{const L=(window as any).L;if(!ref.current||!L)return;if(mapRef.current){mapRef.current.remove();mapRef.current=null}const map=L.map(ref.current).setView([-29.687,-51.463],12);mapRef.current=map;L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);vehicles.forEach(v=>{L.marker([v.lat,v.lng]).addTo(map).bindPopup(`<b>Caminhão ${v.number}</b><br>${v.plate}<br>${v.driver}<br>Status: ${v.status}`)});setTimeout(()=>map.invalidateSize(),50);return()=>{map.remove();mapRef.current=null}},[vehicles]);
  return <div className="map-layout"><div className="panel vehicle-list"><h2>Frota</h2>{vehicles.map(v=><div className="vehicle-item" key={v.id}><span className={`pill ${slug(v.status)}`}>{v.status}</span><strong>Caminhão {v.number}</strong><small>{v.driver} • {v.plate}</small></div>)}</div><div className="panel map-panel"><div ref={ref} className="map"></div><small className="map-note">Mapa funcional com OpenStreetMap. Na fase dos rastreadores, as coordenadas serão atualizadas pela API/GPS real.</small></div></div>
}

function CrudClients({db,setDB}:{db:DB;setDB:React.Dispatch<React.SetStateAction<DB>>}){
  const [q,setQ]=useState('');const [form,setForm]=useState({name:'',cnpj:'',city:''});const list=db.clients.filter(c=>(c.name+c.cnpj+c.city).toLowerCase().includes(q.toLowerCase()));
  function add(e:React.FormEvent){e.preventDefault();if(!form.name)return;setDB(d=>({...d,clients:[...d.clients,{id:uid('c'),...form,status:'Ativo'}]}));setForm({name:'',cnpj:'',city:''})}
  return <EntityPage title="Clientes" search={q} setSearch={setQ}><form className="inline-form" onSubmit={add}><input placeholder="Razão social" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input placeholder="CNPJ" value={form.cnpj} onChange={e=>setForm({...form,cnpj:e.target.value})}/><input placeholder="Cidade/UF" value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/><button className="primary">Adicionar</button></form><Table headers={['Cliente','CNPJ','Cidade','Status','']} rows={list.map(c=>[c.name,c.cnpj,c.city,<span className="pill ativo">{c.status}</span>,<button className="danger" onClick={()=>setDB(d=>({...d,clients:d.clients.filter(x=>x.id!==c.id)}))}>Excluir</button>])}/></EntityPage>
}

function CrudVehicles({db,setDB}:{db:DB;setDB:React.Dispatch<React.SetStateAction<DB>>}){
  const [q,setQ]=useState('');const [form,setForm]=useState({number:'',plate:'',model:'',driver:''});const list=db.vehicles.filter(v=>(v.number+v.plate+v.model+v.driver).toLowerCase().includes(q.toLowerCase()));
  function add(e:React.FormEvent){e.preventDefault();if(!form.number)return;setDB(d=>({...d,vehicles:[...d.vehicles,{id:uid('v'),...form,status:'Disponível',lat:-29.687+Math.random()/100,lng:-51.463+Math.random()/100}]}));setForm({number:'',plate:'',model:'',driver:''})}
  return <EntityPage title="Caminhões" search={q} setSearch={setQ}><form className="inline-form" onSubmit={add}><input placeholder="Nº" value={form.number} onChange={e=>setForm({...form,number:e.target.value})}/><input placeholder="Placa" value={form.plate} onChange={e=>setForm({...form,plate:e.target.value})}/><input placeholder="Modelo" value={form.model} onChange={e=>setForm({...form,model:e.target.value})}/><input placeholder="Motorista" value={form.driver} onChange={e=>setForm({...form,driver:e.target.value})}/><button className="primary">Adicionar</button></form><Table headers={['Nº','Placa','Modelo','Motorista','Status','']} rows={list.map(v=>[v.number,v.plate,v.model,v.driver,<span className={`pill ${slug(v.status)}`}>{v.status}</span>,<button className="danger" onClick={()=>setDB(d=>({...d,vehicles:d.vehicles.filter(x=>x.id!==v.id)}))}>Excluir</button>])}/></EntityPage>
}

function CrudContainers({db,setDB}:{db:DB;setDB:React.Dispatch<React.SetStateAction<DB>>}){
  const [q,setQ]=useState('');const [form,setForm]=useState({code:'',capacity:'5 m³'});const list=db.containers.filter(c=>(c.code+c.capacity+c.client).toLowerCase().includes(q.toLowerCase()));
  function add(e:React.FormEvent){e.preventDefault();if(!form.code)return;setDB(d=>({...d,containers:[...d.containers,{id:uid('k'),...form,status:'Disponível',client:'—'}]}));setForm({code:'',capacity:'5 m³'})}
  return <EntityPage title="Caçambas" search={q} setSearch={setQ}><form className="inline-form" onSubmit={add}><input placeholder="Código ex. C-120" value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/><input placeholder="Capacidade" value={form.capacity} onChange={e=>setForm({...form,capacity:e.target.value})}/><button className="primary">Adicionar</button></form><Table headers={['Código','Capacidade','Status','Cliente','']} rows={list.map(c=>[c.code,c.capacity,<span className={`pill ${slug(c.status)}`}>{c.status}</span>,c.client,<button className="danger" onClick={()=>setDB(d=>({...d,containers:d.containers.filter(x=>x.id!==c.id)}))}>Excluir</button>])}/></EntityPage>
}

function CrudRoutes({db,setDB}:{db:DB;setDB:React.Dispatch<React.SetStateAction<DB>>}){
  const [q,setQ]=useState('');const [form,setForm]=useState({code:'',date:new Date().toISOString().slice(0,10),vehicle:'',driver:'',clients:'1'});const list=db.routes.filter(r=>(r.code+r.vehicle+r.driver).toLowerCase().includes(q.toLowerCase()));
  function add(e:React.FormEvent){e.preventDefault();if(!form.code)return;setDB(d=>({...d,routes:[...d.routes,{id:uid('r'),code:form.code,date:form.date,vehicle:form.vehicle,driver:form.driver,clients:Number(form.clients)||1,done:0,status:'Programada'}]}));setForm({...form,code:''})}
  function advance(id:string){setDB(d=>({...d,routes:d.routes.map(r=>r.id===id?{...r,status:r.status==='Programada'?'Em andamento':'Finalizada',done:r.status==='Em andamento'?r.clients:r.done}:r)}))}
  return <EntityPage title="Rotas" search={q} setSearch={setQ}><form className="inline-form" onSubmit={add}><input placeholder="Código" value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/><input placeholder="Caminhão" value={form.vehicle} onChange={e=>setForm({...form,vehicle:e.target.value})}/><input placeholder="Motorista" value={form.driver} onChange={e=>setForm({...form,driver:e.target.value})}/><input type="number" min="1" placeholder="Clientes" value={form.clients} onChange={e=>setForm({...form,clients:e.target.value})}/><button className="primary">Criar rota</button></form><Table headers={['Rota','Data','Caminhão','Motorista','Progresso','Status','Ação']} rows={list.map(r=>[r.code,r.date,r.vehicle,r.driver,`${r.done}/${r.clients}`,<span className={`pill ${slug(r.status)}`}>{r.status}</span>,<button onClick={()=>advance(r.id)} disabled={r.status==='Finalizada'}>{r.status==='Programada'?'Iniciar':'Finalizar'}</button>])}/></EntityPage>
}

function ImportExport({db,setDB}:{db:DB;setDB:React.Dispatch<React.SetStateAction<DB>>}){
  const input=useRef<HTMLInputElement>(null);const [msg,setMsg]=useState('');
  function exportJson(){download(`telemonte-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(db,null,2))}
  function exportClientsCsv(){const rows=[['nome','cnpj','cidade','status'],...db.clients.map(c=>[c.name,c.cnpj,c.city,c.status])];download('clientes-telemonte.csv',rows.map(r=>r.map(x=>`"${String(x).replaceAll('"','""')}"`).join(';')).join('\n'),'text/csv;charset=utf-8')}
  async function importJson(file:File){try{const data=JSON.parse(await file.text());if(!data.clients||!data.vehicles||!data.containers||!data.routes)throw new Error();setDB(data);setMsg('Backup importado com sucesso.')}catch{setMsg('Arquivo inválido. Use um backup JSON exportado pelo sistema.')}}
  return <div className="panel"><h2>Importar e exportar</h2><p>Os dados desta primeira fase ficam salvos neste navegador. Use o backup para transferir ou preservar informações até ligarmos o banco online.</p><div className="quick"><button className="primary" onClick={exportJson}>Exportar backup JSON</button><button onClick={exportClientsCsv}>Exportar clientes CSV</button><button onClick={()=>input.current?.click()}>Importar backup JSON</button><button className="danger" onClick={()=>{if(confirm('Restaurar dados de demonstração?'))setDB(seed)}}>Restaurar demonstração</button></div><input ref={input} type="file" accept="application/json,.json" hidden onChange={e=>e.target.files?.[0]&&importJson(e.target.files[0])}/>{msg&&<div className="success">{msg}</div>}</div>
}

function DriverArea({db}:{db:DB}){
  const route=db.routes.find(r=>r.driver.toLowerCase().includes('joão'))||db.routes[0];
  const [log,setLog]=useState<string[]>(()=>JSON.parse(localStorage.getItem('driver-log')||'[]'));
  const [gps,setGps]=useState('Localização ainda não registrada');
  function event(label:string){const time=new Date().toLocaleString('pt-BR');const next=[`${time} — ${label}`,...log];setLog(next);localStorage.setItem('driver-log',JSON.stringify(next));if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>setGps(`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)} • precisão ${Math.round(p.coords.accuracy)} m`),()=>setGps('GPS não autorizado ou indisponível'))}
  return <div className="driver-wrap"><div className="driver-hero"><div><small>ROTA DE HOJE</small><h2>{route?.code||'Sem rota atribuída'}</h2><p>Caminhão {route?.vehicle||'—'} • {route?.clients||0} paradas</p></div><span className={`pill ${slug(route?.status||'Programada')}`}>{route?.status||'Sem rota'}</span></div><div className="driver-actions"><button className="primary" onClick={()=>event('Jornada iniciada')}>Iniciar jornada</button><button onClick={()=>event('Saída da base registrada')}>Saída da base</button><button onClick={()=>event('Chegada ao cliente registrada')}>Cheguei ao cliente</button><button onClick={()=>event('Coleta iniciada')}>Iniciar coleta</button><button onClick={()=>event('Coleta finalizada')}>Finalizar coleta</button><button onClick={()=>event('Destinação registrada')}>Destinação</button><button onClick={()=>event('Jornada finalizada')}>Finalizar jornada</button></div><div className="grid2"><div className="panel"><h2>GPS</h2><p>{gps}</p><button onClick={()=>event('Localização atualizada')}>Atualizar localização</button></div><div className="panel"><h2>Linha do tempo</h2>{log.length===0?<p>Nenhum evento registrado.</p>:<div className="timeline">{log.slice(0,12).map((x,i)=><div key={i}>{x}</div>)}</div>}</div></div></div>
}

function EntityPage({title,search,setSearch,children}:{title:string;search:string;setSearch:(s:string)=>void;children:React.ReactNode}){return <div className="panel"><div className="panel-head"><h2>{title}</h2><input className="search" placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)}/></div>{children}</div>}
function Table({headers,rows}:{headers:string[];rows:React.ReactNode[][]}){return <div className="table-wrap"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody></table></div>}
function Placeholder({title,text}:{title:string;text:string}){return <div className="panel empty"><h2>{title}</h2><p>{text}</p></div>}
function slug(s:string){return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll(' ','-')}

createRoot(document.getElementById('root')!).render(<App/>);

(() => {
  'use strict';

  const DB_KEY = 'telemonte-db-v2';
  const SESSION_KEY = 'telemonte-session-v2';
  const DRIVER_LOG_KEY = 'telemonte-driver-log-v2';

  const today = () => new Date().toISOString().slice(0, 10);
  const uid = (prefix) => prefix + Math.random().toString(36).slice(2, 10);
  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const slug = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll(' ', '-');
  const roleLabel = (role) => ({admin:'Administrador', supervisor:'Supervisor', driver:'Motorista'}[role] || role);

  const seed = {
    users: [
      {id:'u1', username:'admin', password:'admin123', name:'Administrador', role:'admin', active:true, employeeId:''},
      {id:'u2', username:'supervisor', password:'super123', name:'Supervisor Operacional', role:'supervisor', active:true, employeeId:'e2'},
      {id:'u3', username:'motorista', password:'rota123', name:'João Silva', role:'driver', active:true, employeeId:'e1'}
    ],
    employees: [
      {id:'e1', name:'João Silva', job:'Motorista', cpf:'123.456.789-00', phone:'(51) 99999-1001', cnh:'01234567890', cnhExpiry:'2027-05-20', status:'Ativo'},
      {id:'e2', name:'Carlos Souza', job:'Supervisor Operacional', cpf:'234.567.890-11', phone:'(51) 99999-1002', cnh:'', cnhExpiry:'', status:'Ativo'},
      {id:'e3', name:'Marcos Lima', job:'Motorista', cpf:'345.678.901-22', phone:'(51) 99999-1003', cnh:'09876543210', cnhExpiry:'2026-12-18', status:'Ativo'}
    ],
    clients: [
      {id:'c1', name:'Hospital São Lucas', cnpj:'12.345.678/0001-90', city:'Montenegro/RS', status:'Ativo'},
      {id:'c2', name:'Clínica Vida', cnpj:'23.456.789/0001-01', city:'São Leopoldo/RS', status:'Ativo'},
      {id:'c3', name:'Indústria Alfa', cnpj:'34.567.890/0001-12', city:'Canoas/RS', status:'Ativo'}
    ],
    vehicles: [
      {id:'v1', number:'07', plate:'ABC1D23', model:'Mercedes Atego', driver:'João Silva', status:'Em rota', lat:-29.6888, lng:-51.4612},
      {id:'v2', number:'04', plate:'DEF4G56', model:'VW Delivery', driver:'Marcos Lima', status:'Disponível', lat:-29.6842, lng:-51.4690},
      {id:'v3', number:'09', plate:'HIJ7K89', model:'Iveco Tector', driver:'—', status:'Manutenção', lat:-29.6920, lng:-51.4550}
    ],
    containers: [
      {id:'k1', code:'C-041', capacity:'5 m³', status:'Em cliente', client:'Hospital São Lucas'},
      {id:'k2', code:'C-087', capacity:'5 m³', status:'Disponível', client:'—'},
      {id:'k3', code:'C-102', capacity:'7 m³', status:'Higienização', client:'—'}
    ],
    routes: [
      {id:'r1', code:'R-014', date:today(), vehicle:'07', driver:'João Silva', clients:8, done:5, status:'Em andamento'},
      {id:'r2', code:'R-015', date:today(), vehicle:'04', driver:'Marcos Lima', clients:6, done:0, status:'Programada'}
    ]
  };

  function clone(value){ return JSON.parse(JSON.stringify(value)); }

  function loadDB(){
    try {
      const raw = localStorage.getItem(DB_KEY);
      if(raw) {
        const parsed = JSON.parse(raw);
        return {...clone(seed), ...parsed,
          users:Array.isArray(parsed.users)?parsed.users:clone(seed.users),
          employees:Array.isArray(parsed.employees)?parsed.employees:clone(seed.employees)};
      }
      const oldRaw = localStorage.getItem('telemonte-db-v1');
      if(oldRaw){
        const old = JSON.parse(oldRaw);
        const migrated = clone(seed);
        ['clients','vehicles','containers','routes'].forEach(k => { if(Array.isArray(old[k])) migrated[k] = old[k]; });
        localStorage.setItem(DB_KEY, JSON.stringify(migrated));
        return migrated;
      }
    } catch(e){ console.warn('Falha ao carregar banco local', e); }
    return clone(seed);
  }

  let db = loadDB();
  let page = 'Dashboard';
  let mapInstance = null;

  function save(){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  function currentUser(){
    const id = localStorage.getItem(SESSION_KEY);
    return db.users.find(u => u.id === id && u.active) || null;
  }
  function setSession(user){
    if(user) localStorage.setItem(SESSION_KEY, user.id); else localStorage.removeItem(SESSION_KEY);
  }
  function download(name, content, type='application/json'){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], {type}));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function notify(message){ alert(message); }

  const adminMenu = ['Dashboard','Mapa / Rastreamento','Rotas','Clientes','Funcionários','Caminhões','Caçambas','Importar / Exportar','Usuários e Permissões','Área do Motorista'];
  const supervisorMenu = ['Dashboard','Mapa / Rastreamento','Rotas','Clientes','Funcionários','Caminhões','Caçambas','Importar / Exportar','Área do Motorista'];
  const driverMenu = ['Minha Rota','Ocorrências','Histórico'];

  function menuFor(user){
    if(user.role === 'admin') return adminMenu;
    if(user.role === 'supervisor') return supervisorMenu;
    return driverMenu;
  }

  function render(){
    cleanupMap();
    const root = document.getElementById('root');
    const user = currentUser();
    if(!user){ root.innerHTML = loginHTML(); bindLogin(); return; }
    const menu = menuFor(user);
    if(!menu.includes(page)) page = user.role === 'driver' ? 'Minha Rota' : 'Dashboard';
    root.innerHTML = shellHTML(user, menu, renderPage(user));
    if(page === 'Mapa / Rastreamento') setTimeout(initMap, 0);
    if(page === 'Importar / Exportar') bindImport();
  }

  function loginHTML(){
    return `<div class="login-page"><div class="login-card">
      <div class="login-logo">T</div><h1>Telemonte</h1><p>Sistema de Gestão de Coleta de Resíduos</p>
      <form id="login-form">
        <label>Usuário<input id="login-user" value="admin" autocomplete="username" autocapitalize="none"></label>
        <label>Senha<input id="login-pass" value="admin123" type="password" autocomplete="current-password"></label>
        <div id="login-error" class="error" style="display:none"></div>
        <button class="primary" type="submit">Entrar</button>
      </form>
      <div class="demo"><strong>Acessos de demonstração</strong><span>Administrador: admin / admin123</span><span>Supervisor: supervisor / super123</span><span>Motorista: motorista / rota123</span></div>
    </div></div>`;
  }

  function bindLogin(){
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('login-user').value.trim().toLowerCase();
      const password = document.getElementById('login-pass').value;
      const user = db.users.find(u => u.username.toLowerCase() === username && u.password === password && u.active);
      const error = document.getElementById('login-error');
      if(!user){ error.textContent = 'Usuário ou senha inválidos, ou usuário bloqueado.'; error.style.display = 'block'; return; }
      setSession(user); page = user.role === 'driver' ? 'Minha Rota' : 'Dashboard'; render();
    });
  }

  function shellHTML(user, menu, body){
    return `<div class="app-shell"><aside class="sidebar">
      <div class="brand"><div class="brand-mark">T</div><div><strong>TELEMONTE</strong><small>Gestão de Coleta</small></div></div>
      <nav>${menu.map(m => `<button class="${page===m?'active':''}" data-page="${esc(m)}">${esc(m)}</button>`).join('')}</nav>
      <div class="sidebar-user"><small>${esc(roleLabel(user.role)).toUpperCase()}</small><strong>${esc(user.name)}</strong><span>@${esc(user.username)}</span><button onclick="TM.logout()">Sair</button></div>
    </aside><main>
      <header class="topbar"><div><h1>${esc(page)}</h1><span>Sistema operacional de coleta de resíduos</span></div><div class="status-dot">● Online</div></header>
      <section class="content">${body}</section>
    </main></div>`;
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page]');
    if(btn){ page = btn.dataset.page; render(); }
  });

  function renderPage(user){
    switch(page){
      case 'Dashboard': return dashboardHTML();
      case 'Mapa / Rastreamento': return mapHTML();
      case 'Rotas': return routesHTML();
      case 'Clientes': return clientsHTML();
      case 'Funcionários': return employeesHTML();
      case 'Caminhões': return vehiclesHTML();
      case 'Caçambas': return containersHTML();
      case 'Importar / Exportar': return importExportHTML();
      case 'Usuários e Permissões': return user.role === 'admin' ? usersHTML() : deniedHTML();
      case 'Área do Motorista': return driverHTML(user);
      case 'Minha Rota': return driverHTML(user);
      case 'Ocorrências': return placeholderHTML('Ocorrências','Na próxima fase esta tela receberá registro de ocorrência com categoria, foto, texto, data/hora e GPS.');
      case 'Histórico': return driverHistoryHTML(user);
      default: return dashboardHTML();
    }
  }

  function card(title,value,hint){ return `<div class="card"><span>${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(hint)}</small></div>`; }
  function dashboardHTML(){
    const activeRoutes = db.routes.filter(r => r.status === 'Em andamento').length;
    return `<div class="cards">
      ${card('Coletas / rotas ativas',activeRoutes,`${db.routes.length} rotas cadastradas`)}
      ${card('Caminhões em rota',db.vehicles.filter(v=>v.status==='Em rota').length,`${db.vehicles.length} veículos cadastrados`)}
      ${card('Caçambas em clientes',db.containers.filter(c=>c.status==='Em cliente').length,`${db.containers.filter(c=>c.status==='Disponível').length} disponíveis`)}
      ${card('Funcionários ativos',db.employees.filter(e=>e.status==='Ativo').length,`${db.employees.length} cadastrados`)}
    </div><div class="grid2"><div class="panel"><div class="panel-head"><h2>Rotas de hoje</h2><button data-page="Rotas">Ver todas</button></div>
      ${db.routes.map(r => `<div class="route-row"><div><strong>${esc(r.code)}</strong><span>${esc(r.driver)} • Caminhão ${esc(r.vehicle)}</span></div><div class="progress"><i style="width:${Math.min(100,Math.round((r.done/Math.max(1,r.clients))*100))}%"></i></div><b>${r.done}/${r.clients}</b></div>`).join('') || '<p>Nenhuma rota.</p>'}
    </div><div class="panel"><div class="panel-head"><h2>Atalhos</h2></div><div class="quick"><button data-page="Clientes">+ Cliente</button><button data-page="Funcionários">+ Funcionário</button><button data-page="Rotas">+ Rota</button><button data-page="Mapa / Rastreamento">Abrir mapa</button></div></div></div>`;
  }

  function mapHTML(){
    return `<div class="map-layout"><div class="panel vehicle-list"><h2>Frota</h2>
      ${db.vehicles.map(v=>`<div class="vehicle-item"><span class="pill ${slug(v.status)}">${esc(v.status)}</span><strong>Caminhão ${esc(v.number)}</strong><small>${esc(v.driver)} • ${esc(v.plate)}</small></div>`).join('')}
    </div><div class="panel map-panel"><div id="map" class="map"></div><small class="map-note">Mapa operacional. As coordenadas atuais são locais/demonstrativas até conectarmos o banco online e os rastreadores.</small></div></div>`;
  }
  function cleanupMap(){ if(mapInstance){ try{mapInstance.remove()}catch{} mapInstance=null; } }
  function initMap(){
    const el = document.getElementById('map'); const L = window.L;
    if(!el || !L) return;
    mapInstance = L.map(el).setView([-29.687,-51.463],12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(mapInstance);
    const bounds=[];
    db.vehicles.forEach(v=>{ if(Number.isFinite(v.lat)&&Number.isFinite(v.lng)){ bounds.push([v.lat,v.lng]); L.marker([v.lat,v.lng]).addTo(mapInstance).bindPopup(`<b>Caminhão ${esc(v.number)}</b><br>${esc(v.plate)}<br>${esc(v.driver)}<br>Status: ${esc(v.status)}`); }});
    if(bounds.length>1) mapInstance.fitBounds(bounds,{padding:[30,30]});
    setTimeout(()=>mapInstance && mapInstance.invalidateSize(),100);
  }

  function clientsHTML(){
    return `<div class="panel"><div class="panel-head"><h2>Clientes</h2><input class="search" id="client-search" placeholder="Buscar..." oninput="TM.filterTable('client-search','client-table')"></div>
      <form class="inline-form" onsubmit="TM.addClient(event)"><input name="name" placeholder="Razão social" required><input name="cnpj" placeholder="CNPJ"><input name="city" placeholder="Cidade/UF"><button class="primary">Adicionar</button></form>
      <div class="table-wrap"><table id="client-table"><thead><tr><th>Cliente</th><th>CNPJ</th><th>Cidade</th><th>Status</th><th>Ações</th></tr></thead><tbody>${db.clients.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.cnpj)}</td><td>${esc(c.city)}</td><td><span class="pill ${slug(c.status)}">${esc(c.status)}</span></td><td><button onclick="TM.editClient('${c.id}')">Editar</button> <button class="danger" onclick="TM.deleteClient('${c.id}')">Excluir</button></td></tr>`).join('')}</tbody></table></div>
    </div>`;
  }

  function employeesHTML(){
    return `<div class="panel"><div class="panel-head"><div><h2>Funcionários e Motoristas</h2><small>Cadastro operacional independente do usuário de acesso ao sistema.</small></div><input class="search" id="employee-search" placeholder="Buscar..." oninput="TM.filterTable('employee-search','employee-table')"></div>
      <form class="inline-form" onsubmit="TM.addEmployee(event)"><input name="name" placeholder="Nome completo" required><input name="job" placeholder="Função (ex.: Motorista)" required><input name="cpf" placeholder="CPF"><input name="phone" placeholder="Telefone"><input name="cnh" placeholder="CNH"><input name="cnhExpiry" type="date" title="Validade CNH"><button class="primary">Adicionar</button></form>
      <div class="table-wrap"><table id="employee-table"><thead><tr><th>Nome</th><th>Função</th><th>CPF</th><th>Telefone</th><th>CNH</th><th>Validade</th><th>Status</th><th>Ações</th></tr></thead><tbody>${db.employees.map(e=>`<tr><td>${esc(e.name)}</td><td>${esc(e.job)}</td><td>${esc(e.cpf)}</td><td>${esc(e.phone)}</td><td>${esc(e.cnh||'—')}</td><td>${esc(e.cnhExpiry||'—')}</td><td><span class="pill ${slug(e.status)}">${esc(e.status)}</span></td><td><button onclick="TM.editEmployee('${e.id}')">Editar</button> <button onclick="TM.toggleEmployee('${e.id}')">${e.status==='Ativo'?'Bloquear':'Ativar'}</button> <button class="danger" onclick="TM.deleteEmployee('${e.id}')">Excluir</button></td></tr>`).join('')}</tbody></table></div>
    </div>`;
  }

  function vehiclesHTML(){
    const drivers = db.employees.filter(e=>e.status==='Ativo' && e.job.toLowerCase().includes('motor')).map(e=>`<option>${esc(e.name)}</option>`).join('');
    return `<div class="panel"><div class="panel-head"><h2>Caminhões</h2><input class="search" id="vehicle-search" placeholder="Buscar..." oninput="TM.filterTable('vehicle-search','vehicle-table')"></div>
      <form class="inline-form" onsubmit="TM.addVehicle(event)"><input name="number" placeholder="Nº" required><input name="plate" placeholder="Placa"><input name="model" placeholder="Modelo"><select name="driver"><option value="—">Sem motorista fixo</option>${drivers}</select><button class="primary">Adicionar</button></form>
      <div class="table-wrap"><table id="vehicle-table"><thead><tr><th>Nº</th><th>Placa</th><th>Modelo</th><th>Motorista</th><th>Status</th><th>Ações</th></tr></thead><tbody>${db.vehicles.map(v=>`<tr><td>${esc(v.number)}</td><td>${esc(v.plate)}</td><td>${esc(v.model)}</td><td>${esc(v.driver)}</td><td><span class="pill ${slug(v.status)}">${esc(v.status)}</span></td><td><button onclick="TM.editVehicle('${v.id}')">Editar</button> <button class="danger" onclick="TM.deleteVehicle('${v.id}')">Excluir</button></td></tr>`).join('')}</tbody></table></div>
    </div>`;
  }

  function containersHTML(){
    return `<div class="panel"><div class="panel-head"><h2>Caçambas</h2><input class="search" id="container-search" placeholder="Buscar..." oninput="TM.filterTable('container-search','container-table')"></div>
      <form class="inline-form" onsubmit="TM.addContainer(event)"><input name="code" placeholder="Código ex. C-120" required><input name="capacity" placeholder="Capacidade" value="5 m³"><button class="primary">Adicionar</button></form>
      <div class="table-wrap"><table id="container-table"><thead><tr><th>Código</th><th>Capacidade</th><th>Status</th><th>Cliente</th><th>Ações</th></tr></thead><tbody>${db.containers.map(c=>`<tr><td>${esc(c.code)}</td><td>${esc(c.capacity)}</td><td><span class="pill ${slug(c.status)}">${esc(c.status)}</span></td><td>${esc(c.client)}</td><td><button onclick="TM.editContainer('${c.id}')">Editar</button> <button class="danger" onclick="TM.deleteContainer('${c.id}')">Excluir</button></td></tr>`).join('')}</tbody></table></div>
    </div>`;
  }

  function routesHTML(){
    const vehicles = db.vehicles.filter(v=>v.status!=='Manutenção').map(v=>`<option value="${esc(v.number)}">Caminhão ${esc(v.number)} • ${esc(v.plate)}</option>`).join('');
    const drivers = db.employees.filter(e=>e.status==='Ativo' && e.job.toLowerCase().includes('motor')).map(e=>`<option>${esc(e.name)}</option>`).join('');
    return `<div class="panel"><div class="panel-head"><h2>Rotas</h2><input class="search" id="route-search" placeholder="Buscar..." oninput="TM.filterTable('route-search','route-table')"></div>
      <form class="inline-form" onsubmit="TM.addRoute(event)"><input name="code" placeholder="Código ex. R-020" required><input name="date" type="date" value="${today()}" required><select name="vehicle" required><option value="">Selecione o caminhão</option>${vehicles}</select><select name="driver" required><option value="">Selecione o motorista</option>${drivers}</select><input name="clients" type="number" min="1" value="1" placeholder="Paradas"><button class="primary">Criar rota</button></form>
      <div class="table-wrap"><table id="route-table"><thead><tr><th>Rota</th><th>Data</th><th>Caminhão</th><th>Motorista</th><th>Progresso</th><th>Status</th><th>Ação</th></tr></thead><tbody>${db.routes.map(r=>`<tr><td>${esc(r.code)}</td><td>${esc(r.date)}</td><td>${esc(r.vehicle)}</td><td>${esc(r.driver)}</td><td>${r.done}/${r.clients}</td><td><span class="pill ${slug(r.status)}">${esc(r.status)}</span></td><td><button onclick="TM.advanceRoute('${r.id}')" ${r.status==='Finalizada'?'disabled':''}>${r.status==='Programada'?'Iniciar':r.status==='Em andamento'?'Finalizar':'Concluída'}</button></td></tr>`).join('')}</tbody></table></div>
    </div>`;
  }

  function usersHTML(){
    const employees = db.employees.filter(e=>e.status==='Ativo').map(e=>`<option value="${e.id}">${esc(e.name)} • ${esc(e.job)}</option>`).join('');
    return `<div class="panel"><div class="panel-head"><div><h2>Usuários e Permissões</h2><small>Acesso exclusivo do Administrador.</small></div></div>
      <form class="inline-form" onsubmit="TM.addUser(event)"><input name="username" placeholder="Nome de usuário" required><input name="password" type="password" placeholder="Senha" required><input name="name" placeholder="Nome de exibição" required><select name="role"><option value="driver">Motorista</option><option value="supervisor">Supervisor</option><option value="admin">Administrador</option></select><select name="employeeId"><option value="">Sem vínculo</option>${employees}</select><button class="primary">Criar usuário</button></form>
      <div class="table-wrap"><table><thead><tr><th>Usuário</th><th>Nome</th><th>Perfil</th><th>Funcionário vinculado</th><th>Status</th><th>Ações</th></tr></thead><tbody>${db.users.map(u=>{const emp=db.employees.find(e=>e.id===u.employeeId);return `<tr><td>@${esc(u.username)}</td><td>${esc(u.name)}</td><td>${esc(roleLabel(u.role))}</td><td>${esc(emp?.name||'—')}</td><td><span class="pill ${u.active?'ativo':'manutencao'}">${u.active?'Ativo':'Bloqueado'}</span></td><td><button onclick="TM.changePassword('${u.id}')">Senha</button> <button onclick="TM.toggleUser('${u.id}')">${u.active?'Bloquear':'Ativar'}</button> <button class="danger" onclick="TM.deleteUser('${u.id}')">Excluir</button></td></tr>`}).join('')}</tbody></table></div>
      <p style="font-size:12px;color:#72817b;margin-top:14px">Nesta fase os usuários ficam no navegador. Quando ligarmos o banco online, usuários, senhas e permissões passarão para autenticação segura no servidor.</p>
    </div>`;
  }

  function importExportHTML(){
    return `<div class="panel"><h2>Importar e exportar</h2><p>Nesta fase os dados ficam salvos neste navegador. Faça backup antes de alterações importantes.</p><div class="quick"><button class="primary" onclick="TM.exportBackup()">Exportar backup JSON</button><button onclick="TM.exportClients()">Exportar clientes CSV</button><button onclick="TM.exportEmployees()">Exportar funcionários CSV</button><button onclick="document.getElementById('import-file').click()">Importar backup JSON</button><button class="danger" onclick="TM.restoreDemo()">Restaurar demonstração</button></div><input id="import-file" type="file" accept="application/json,.json" hidden></div>`;
  }
  function bindImport(){
    const input=document.getElementById('import-file'); if(!input) return;
    input.addEventListener('change', async()=>{ const file=input.files?.[0]; if(!file)return; try{const data=JSON.parse(await file.text()); if(!Array.isArray(data.clients)||!Array.isArray(data.vehicles)||!Array.isArray(data.routes)) throw new Error('Estrutura inválida'); db={...clone(seed),...data};save();notify('Backup importado com sucesso.');render();}catch(e){notify('Arquivo inválido. Use um backup JSON exportado pelo sistema.');} });
  }

  function driverLogs(user){ try{return JSON.parse(localStorage.getItem(`${DRIVER_LOG_KEY}-${user.id}`)||'[]')}catch{return[]} }
  function driverHTML(user){
    const employee=db.employees.find(e=>e.id===user.employeeId);
    const route=db.routes.find(r=>employee && r.driver===employee.name && r.status!=='Finalizada') || db.routes.find(r=>r.status==='Em andamento') || db.routes[0];
    const logs=driverLogs(user);
    return `<div class="driver-wrap"><div class="driver-hero"><div><small>ROTA DE HOJE</small><h2>${esc(route?.code||'Sem rota')}</h2><p>Caminhão ${esc(route?.vehicle||'—')} • ${esc(route?.clients||0)} paradas • ${esc(route?.driver||user.name)}</p></div><span class="pill ${slug(route?.status||'Programada')}">${esc(route?.status||'Sem rota')}</span></div>
      <div class="driver-actions"><button class="primary" onclick="TM.driverEvent('Jornada iniciada')">Iniciar jornada</button><button onclick="TM.driverEvent('Saída da base registrada')">Saída da base</button><button onclick="TM.driverEvent('Chegada ao cliente registrada')">Cheguei ao cliente</button><button onclick="TM.driverEvent('Coleta iniciada')">Iniciar coleta</button><button onclick="TM.driverEvent('Coleta finalizada')">Finalizar coleta</button><button onclick="TM.driverEvent('Destinação registrada')">Destinação</button><button onclick="TM.driverEvent('Jornada finalizada')">Finalizar jornada</button></div>
      <div class="grid2"><div class="panel"><h2>Localização</h2><p id="driver-gps">Clique em atualizar ou registre um evento para capturar o GPS.</p><button onclick="TM.driverEvent('Localização atualizada')">Atualizar localização</button></div><div class="panel"><h2>Linha do tempo</h2><div class="timeline">${logs.length?logs.slice(0,12).map(x=>`<div>${esc(x.text)}${x.coords?`<br><small>${esc(x.coords)}</small>`:''}</div>`).join(''):'<p>Nenhum evento registrado.</p>'}</div></div></div>
    </div>`;
  }
  function driverHistoryHTML(user){
    const logs=driverLogs(user);
    return `<div class="panel"><h2>Histórico do motorista</h2>${logs.length?`<div class="timeline">${logs.map(x=>`<div>${esc(x.text)}${x.coords?`<br><small>${esc(x.coords)}</small>`:''}</div>`).join('')}</div>`:'<p>Nenhum registro ainda.</p>'}</div>`;
  }
  function deniedHTML(){ return `<div class="panel empty"><h2>Acesso negado</h2><p>Esta área é exclusiva do Administrador.</p></div>`; }
  function placeholderHTML(title,text){ return `<div class="panel empty"><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`; }

  const TM = {
    logout(){ setSession(null); page='Dashboard'; render(); },
    filterTable(inputId, tableId){ const q=(document.getElementById(inputId)?.value||'').toLowerCase(); document.querySelectorAll(`#${tableId} tbody tr`).forEach(tr=>tr.style.display=tr.textContent.toLowerCase().includes(q)?'':'none'); },

    addClient(e){e.preventDefault();const f=new FormData(e.target);db.clients.push({id:uid('c'),name:f.get('name').trim(),cnpj:f.get('cnpj').trim(),city:f.get('city').trim(),status:'Ativo'});save();render();},
    editClient(id){const c=db.clients.find(x=>x.id===id);if(!c)return;c.name=prompt('Razão social:',c.name)||c.name;c.cnpj=prompt('CNPJ:',c.cnpj)??c.cnpj;c.city=prompt('Cidade/UF:',c.city)??c.city;save();render();},
    deleteClient(id){if(confirm('Excluir este cliente?')){db.clients=db.clients.filter(x=>x.id!==id);save();render();}},

    addEmployee(e){e.preventDefault();const f=new FormData(e.target);db.employees.push({id:uid('e'),name:f.get('name').trim(),job:f.get('job').trim(),cpf:f.get('cpf').trim(),phone:f.get('phone').trim(),cnh:f.get('cnh').trim(),cnhExpiry:f.get('cnhExpiry'),status:'Ativo'});save();render();},
    editEmployee(id){const x=db.employees.find(e=>e.id===id);if(!x)return;x.name=prompt('Nome:',x.name)||x.name;x.job=prompt('Função:',x.job)||x.job;x.cpf=prompt('CPF:',x.cpf)??x.cpf;x.phone=prompt('Telefone:',x.phone)??x.phone;x.cnh=prompt('CNH:',x.cnh)??x.cnh;x.cnhExpiry=prompt('Validade CNH (AAAA-MM-DD):',x.cnhExpiry)??x.cnhExpiry;save();render();},
    toggleEmployee(id){const x=db.employees.find(e=>e.id===id);if(!x)return;x.status=x.status==='Ativo'?'Inativo':'Ativo';save();render();},
    deleteEmployee(id){if(db.users.some(u=>u.employeeId===id)){notify('Este funcionário está vinculado a um usuário. Remova o vínculo antes de excluir.');return;}if(confirm('Excluir este funcionário?')){db.employees=db.employees.filter(x=>x.id!==id);save();render();}},

    addVehicle(e){e.preventDefault();const f=new FormData(e.target);db.vehicles.push({id:uid('v'),number:f.get('number').trim(),plate:f.get('plate').trim(),model:f.get('model').trim(),driver:f.get('driver')||'—',status:'Disponível',lat:-29.687+Math.random()/100,lng:-51.463+Math.random()/100});save();render();},
    editVehicle(id){const v=db.vehicles.find(x=>x.id===id);if(!v)return;v.number=prompt('Número:',v.number)||v.number;v.plate=prompt('Placa:',v.plate)??v.plate;v.model=prompt('Modelo:',v.model)??v.model;v.driver=prompt('Motorista:',v.driver)??v.driver;const s=prompt('Status: Disponível, Em rota ou Manutenção',v.status);if(['Disponível','Em rota','Manutenção'].includes(s))v.status=s;save();render();},
    deleteVehicle(id){if(confirm('Excluir este caminhão?')){db.vehicles=db.vehicles.filter(x=>x.id!==id);save();render();}},

    addContainer(e){e.preventDefault();const f=new FormData(e.target);db.containers.push({id:uid('k'),code:f.get('code').trim(),capacity:f.get('capacity').trim(),status:'Disponível',client:'—'});save();render();},
    editContainer(id){const c=db.containers.find(x=>x.id===id);if(!c)return;c.code=prompt('Código:',c.code)||c.code;c.capacity=prompt('Capacidade:',c.capacity)??c.capacity;const s=prompt('Status: Disponível, Em cliente, Em transporte, Higienização ou Manutenção',c.status);if(['Disponível','Em cliente','Em transporte','Higienização','Manutenção'].includes(s))c.status=s;c.client=prompt('Cliente/local atual:',c.client)??c.client;save();render();},
    deleteContainer(id){if(confirm('Excluir esta caçamba?')){db.containers=db.containers.filter(x=>x.id!==id);save();render();}},

    addRoute(e){e.preventDefault();const f=new FormData(e.target);db.routes.push({id:uid('r'),code:f.get('code').trim(),date:f.get('date'),vehicle:f.get('vehicle'),driver:f.get('driver'),clients:Number(f.get('clients'))||1,done:0,status:'Programada'});save();render();},
    advanceRoute(id){const r=db.routes.find(x=>x.id===id);if(!r)return;if(r.status==='Programada'){r.status='Em andamento';const v=db.vehicles.find(v=>v.number===r.vehicle);if(v){v.status='Em rota';v.driver=r.driver;}}else if(r.status==='Em andamento'){r.status='Finalizada';r.done=r.clients;const v=db.vehicles.find(v=>v.number===r.vehicle);if(v)v.status='Disponível';}save();render();},

    addUser(e){e.preventDefault();const admin=currentUser();if(!admin||admin.role!=='admin'){notify('Acesso negado.');return;}const f=new FormData(e.target);const username=f.get('username').trim().toLowerCase();if(db.users.some(u=>u.username.toLowerCase()===username)){notify('Este nome de usuário já existe.');return;}db.users.push({id:uid('u'),username,password:f.get('password'),name:f.get('name').trim(),role:f.get('role'),active:true,employeeId:f.get('employeeId')||''});save();render();},
    changePassword(id){const admin=currentUser();if(!admin||admin.role!=='admin')return;const u=db.users.find(x=>x.id===id);if(!u)return;const p=prompt(`Nova senha para @${u.username}:`);if(p&&p.length>=4){u.password=p;save();notify('Senha alterada.');}},
    toggleUser(id){const admin=currentUser();if(!admin||admin.role!=='admin')return;const u=db.users.find(x=>x.id===id);if(!u)return;if(u.id===admin.id&&u.active){notify('Você não pode bloquear o próprio usuário enquanto está logado.');return;}u.active=!u.active;save();render();},
    deleteUser(id){const admin=currentUser();if(!admin||admin.role!=='admin')return;if(id===admin.id){notify('Você não pode excluir o próprio usuário.');return;}if(confirm('Excluir este usuário?')){db.users=db.users.filter(x=>x.id!==id);save();render();}},

    exportBackup(){download(`telemonte-backup-${today()}.json`,JSON.stringify(db,null,2));},
    exportClients(){const rows=[['nome','cnpj','cidade','status'],...db.clients.map(c=>[c.name,c.cnpj,c.city,c.status])];download('clientes-telemonte.csv',rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(';')).join('\n'),'text/csv;charset=utf-8');},
    exportEmployees(){const rows=[['nome','funcao','cpf','telefone','cnh','validade_cnh','status'],...db.employees.map(e=>[e.name,e.job,e.cpf,e.phone,e.cnh,e.cnhExpiry,e.status])];download('funcionarios-telemonte.csv',rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(';')).join('\n'),'text/csv;charset=utf-8');},
    restoreDemo(){if(confirm('Restaurar todos os dados de demonstração? Os dados atuais serão substituídos.')){db=clone(seed);save();setSession(null);render();}},

    driverEvent(label){const user=currentUser();if(!user)return;const time=new Date().toLocaleString('pt-BR');const logs=driverLogs(user);const base={text:`${time} — ${label}`,coords:''};const saveLog=(entry)=>{logs.unshift(entry);localStorage.setItem(`${DRIVER_LOG_KEY}-${user.id}`,JSON.stringify(logs));render();};if(!navigator.geolocation){saveLog(base);return;}navigator.geolocation.getCurrentPosition(pos=>{const coords=`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)} • precisão ${Math.round(pos.coords.accuracy)} m`;base.coords=coords;const emp=db.employees.find(e=>e.id===user.employeeId);const route=db.routes.find(r=>emp&&r.driver===emp.name&&r.status==='Em andamento');const vehicle=route&&db.vehicles.find(v=>v.number===route.vehicle);if(vehicle){vehicle.lat=pos.coords.latitude;vehicle.lng=pos.coords.longitude;save();}saveLog(base);},()=>saveLog({...base,coords:'GPS não autorizado ou indisponível'}),{enableHighAccuracy:true,timeout:10000,maximumAge:30000});}
  };

  window.TM = TM;
  render();
})();

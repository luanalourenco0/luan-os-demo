// Agenda publicada em acesso privado; tarefas e conclusões são confirmadas pelo servidor.
const P=globalThis.LuanPlanning;
const profile=globalThis.DashboardProfile;
const ZONE=P.ZONE;
let jobsLoading=false;
const D=globalThis.LuanLocalData;
const KEY=D.KEY;
const AREA_NAMES = {faculdade:'Faculdade',carreira:'Carreira',conteudo:'Conteúdo',saude:'Saúde',desenvolvimento:'Desenvolvimento',pessoal:'Pessoal'};
const KIND_NAMES = {deadline:'Entrega',exam:'Avaliação',class:'Aula',task:'Tarefa',appointment:'Compromisso'};
const dAdd=P.addDays;
const localToday=()=>P.day();
let today=localToday();
const dateShort = d => new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',day:'2-digit',month:'short'}).format(new Date(d+'T12:00:00Z')).replace('.','');
const dateLong = d => new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(new Date(d+'T12:00:00Z'));
const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('luan-os-state'):null;
const store=globalThis.LuanCloudData.createStore((url,options)=>fetch(url,options),()=>channel?.postMessage({type:'state-changed'}));
const service=globalThis.LuanPanelService.createService(store,(url,options)=>fetch(url,options));
// Read-only projections. All confirmed state and snapshot caches belong to services.
const viewData={get state(){return service.read();},get agenda(){return service.snapshot('agenda');},get updates(){return service.snapshot('updates');},get jobs(){return service.snapshot('jobs');},get calendarEvents(){return this.agenda?.items||[];},get snapshotEnd(){return this.agenda?.window_end||today;}};
async function save(reducer){
  try{await service.mutate(reducer);storageNotice('');return true;}
  catch(error){render();storageNotice((error.uncertain?'Resultado da gravação incerto. Seu rascunho foi preservado. ':'Sua alteração foi recusada. ')+error.message);return false;}
}
function storageNotice(message){for(const selector of ['#storage-alert','#task-storage-alert','#data-storage-alert','#delete-storage-alert']){const node=$(selector);node.textContent=message;node.hidden=!message;}}
const app={view:'day',start:today,horizon:'today',area:'all',priority:'all',showDone:false,weekDay:null};
const $=s=>document.querySelector(s);
const html=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
function renderProfile(){
  document.title=profile.productName;
  document.querySelectorAll('[data-product-name]').forEach(node=>{node.textContent=profile.productName;});
  document.querySelectorAll('[data-profile-name]').forEach(node=>{node.textContent=profile.fullName;});
  document.querySelectorAll('[data-profile-initials]').forEach(node=>{node.textContent=profile.initials;node.setAttribute('aria-label',profile.fullName);});
  document.querySelectorAll('[data-profile-label]').forEach(node=>{node.textContent=profile.workspaceLabel;});
  $('#profile-priorities').innerHTML=profile.priorities.map((item,index)=>`<div class="priority-line"><span class="priority-number">${String(index+1).padStart(2,'0')}</span><div><strong>${html(item.title)}</strong><small>${html(item.detail)}</small></div><span class="priority-bar p${index+1}" aria-hidden="true"></span></div>`).join('');
  $('#profile-footer-note').textContent=profile.footerNote;
}
renderProfile();
const items=()=>service.items();
const planningEnd=()=>P.planningEnd(today,viewData.agenda,service.read());
const isDone=item=>service.isDone(item.id);
const pass=item=>(app.area==='all'||item.area===app.area)&&(app.priority==='all'||item.priority===app.priority)&&(app.showDone||!isDone(item));
const selectable=item=>item.date>=app.start && (app.view==='day'?item.date===app.start:item.date<=(app.horizon==='later'?planningEnd():dAdd(app.start,6)));
const sortItems=P.sortItems;
const oldRecord=value=>P.oldRecord(value);
const coveredDate=date=>P.covered(viewData.agenda,date);
const weekDates=()=>Array.from({length:7},(_,index)=>dAdd(app.start,index));
function emptyDayText(date){
  if(!coveredDate(date))return 'Sem cobertura da agenda para esta data. Apenas tarefas do painel podem aparecer.';
  return app.area!=='all'||app.priority!=='all'||!app.showDone?'Sem compromissos listados nesta seleção.':'Sem compromissos listados.';
}
function renderDailyFocus(){
  const {briefing,current}=P.dailyFocus(viewData.updates,service.failed('updates'));
  $('#daily-focus-title').textContent=current?'Foco de hoje':briefing?.next_step?'Último foco registrado':'Foco ainda não informado';
  $('#daily-focus-state').textContent=service.failed('updates')?'Leitura indisponível':briefing&&oldRecord(briefing.updated_at)?'Registro antigo':current?'Briefing de hoje':'Aguardando foco de hoje';
  $('#daily-focus-state').classList.toggle('attention',!current);
  $('#daily-focus-action').textContent=briefing?.next_step||'Nenhuma próxima ação disponível no briefing desta sessão.';
  $('#daily-focus-date').innerHTML=briefing?`<span>Fonte: briefing · registro de <time datetime="${html(briefing.updated_at)}">${html(updateDate(briefing.updated_at))}</time></span>${current?'':'<span>Confirme este registro antes de usá-lo como foco de hoje.</span>'}`:'';
}
function renderFreshness(){
  const messages=[];
  if(service.failed('agenda'))messages.push(viewData.agenda?'Agenda: leitura indisponível. A última captura válida desta sessão foi mantida.':'Agenda: leitura indisponível. Nenhuma captura válida carregada nesta sessão.');
  else if(viewData.agenda&&oldRecord(viewData.agenda.captured_at))messages.push('Agenda: registro antigo, de '+updateDate(viewData.agenda.captured_at)+'. Confira alterações nos canais de origem.');
  if(service.failed('updates'))messages.push(viewData.updates?'Resumos: leitura indisponível. O último conteúdo válido desta sessão foi mantido.':'Resumos: leitura indisponível. Nenhum conteúdo válido carregado nesta sessão.');
  else if(viewData.updates&&(oldRecord(viewData.updates.updated_at)||viewData.updates.streams.some(item=>oldRecord(item.updated_at))))messages.push('Resumos: há registro com mais de 26 horas. Confira a data de cada frente antes de agir.');
  const notice=$('#freshness-notice');notice.hidden=!messages.length;notice.innerHTML=messages.map(message=>'<p>'+html(message)+'</p>').join('');
}
function renderWeekOverview(all){
  const enabled=app.view==='week'&&app.horizon!=='later';
  $('#week-overview').hidden=!enabled;$('#week-help').hidden=!enabled;
  if(!enabled){$('#week-overview').innerHTML='';return;}
  const dates=weekDates();if(!dates.includes(app.weekDay))app.weekDay=app.start;
  $('#week-overview').innerHTML=dates.map(date=>{
    const entries=all.filter(item=>item.date===date&&pass(item)).sort(sortItems);
    const deadlines=entries.filter(item=>['deadline','exam'].includes(item.kind)).length;
    const knownTimes=[...new Set(entries.map(item=>item.timeLabel||item.time).filter(Boolean))];
    const weekday=new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',weekday:'short'}).format(new Date(date+'T12:00:00Z')).replace('.','');
    const empty=coveredDate(date)?'Sem compromissos listados':'Sem cobertura da agenda';
    return `<button type="button" class="week-summary ${date===today?'is-today':''} ${deadlines?'has-deadline':''}" data-week-date="${date}" aria-pressed="${date===app.weekDay}" aria-label="${html(dateLong(date))}: ${entries.length} itens nesta seleção${deadlines?', '+deadlines+' prazos':''}${coveredDate(date)?'':'. Sem cobertura da agenda'}"><span class="week-weekday">${html(weekday)}${date===today?' · hoje':''}</span><strong>${html(dateShort(date))}</strong><span class="week-count">${entries.length?entries.length+' '+(entries.length===1?'item':'itens'):empty}</span>${deadlines?`<span class="week-deadlines">${deadlines} ${deadlines===1?'prazo':'prazos'}</span>`:''}${knownTimes.length?`<small class="week-times">${html(knownTimes.join(' · '))}</small>`:''}${entries.length&&!coveredDate(date)?'<small>Sem cobertura da agenda</small>':''}<span class="week-load" aria-hidden="true">${Array.from({length:Math.min(entries.length,5)},()=>'<i></i>').join('')}</span></button>`;
  }).join('');
}
function itemMarkup(item){const done=isDone(item),local=service.isPersonal(item.id);const actions=local?`<div class="task-actions"><button type="button" data-action="edit" data-id="${html(item.id)}" aria-label="Editar ${html(item.title)}">Editar</button><button type="button" data-action="delete" data-id="${html(item.id)}" aria-label="Excluir ${html(item.title)}">Excluir</button></div>`:'';return `<article class="event-item ${done?'done':''}"><input class="event-check" type="checkbox" data-id="${html(item.id)}" aria-label="${done?'Reabrir':'Concluir'} ${html(item.title)}" ${done?'checked':''}><span class="event-time">${html(item.timeLabel||item.time||'—')}</span><div class="event-body"><div class="event-title">${html(item.title)}</div><div class="event-sub"><span>${html(item.detail)}</span><span class="event-source">${html(item.source)}</span></div>${actions}</div><span class="tag ${html(item.kind)}">${KIND_NAMES[item.kind]||'Tarefa'}</span></article>`;}
function render(){
  const current=localToday();
  if(current!==today){if(app.horizon==='today'||app.horizon==='week')app.start=current;else if(app.horizon==='later')app.start=dAdd(current,7);today=current;}
  const all=items();
  renderDailyFocus();renderFreshness();renderWeekOverview(all);
  if(viewData.updates)$('#updates-list').innerHTML=viewData.updates.streams.map(updateMarkup).join('')||'<div class="updates-empty">Nenhuma atualização disponível.</div>';
  const nextDeadlines=all.filter(x=>x.date>=today&&x.date<=viewData.snapshotEnd&&['deadline','exam'].includes(x.kind)&&!isDone(x)).sort(sortItems).slice(0,3);
  $('#focus-intro').textContent=nextDeadlines.length?'Avaliações e entregas que pedem atenção.':'Sem avaliações ou entregas pendentes neste período.';
  $('#focus-steps').innerHTML=nextDeadlines.map((x,i)=>`<article class="focus-step"><div class="focus-step-top"><span class="focus-number">${String(i+1).padStart(2,'0')}</span><span class="focus-kind">${KIND_NAMES[x.kind]}</span></div><div class="focus-date">${html(dateShort(x.date))}${x.timeLabel?' <span>· '+html(x.timeLabel)+'</span>':x.time?' <span>· '+html(x.time)+'</span>':''}</div><strong>${html(x.title)}</strong><small>${html(x.detail)}</small></article>`).join('');
  const count=(a,b)=>all.filter(x=>x.date>=a&&x.date<=b&&pass(x)).length;
  $('#metric-today').textContent=count(today,today);
  $('#metric-week').textContent=count(today,dAdd(today,6));
  $('#metric-later').textContent=count(dAdd(today,7),planningEnd());
  $('#metric-later-caption').textContent='Agenda e tarefas futuras';
  document.querySelectorAll('.metric').forEach(b=>{const on=b.dataset.horizon===app.horizon;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
  document.querySelectorAll('.view-switch button').forEach(b=>{let on=b.dataset.view===app.view;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});
  $('#today-label').textContent=dateLong(today);
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,hour:'2-digit',hourCycle:'h23'}).format(new Date()));
  $('#hero-title').innerHTML=(hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite')+', '+html(profile.preferredName)+'<span class="accent">.</span>';
  $('#range-title').textContent=app.view==='day'?dateLong(app.start):app.horizon==='later'?'A partir de '+dateShort(app.start):`${dateShort(app.start)} – ${dateShort(dAdd(app.start,6))}`;
  $('#range-caption').textContent=app.horizon==='later'?'A partir do oitavo dia · inclui todas as tarefas futuras':app.view==='day'?'Compromissos e tarefas do dia':'Sete dias a partir desta data';
  const weekly=app.view==='week'&&app.horizon!=='later';
  const selectedDate=weekly?app.weekDay:app.start;
  const visible=all.filter(x=>pass(x)&&selectable(x)&&(!weekly||x.date===selectedDate)).sort(sortItems);
  const dayHeading=weekly?`<div class="week-day"><h3>${html(dateLong(selectedDate))}</h3></div>`:'';
  if(!visible.length){$('#event-list').innerHTML=dayHeading+`<div class="empty"><strong>Sem compromissos listados.</strong>${html(app.horizon==='later'?'Nenhum item futuro nesta seleção. Tarefas além da cobertura da agenda continuam disponíveis aqui.':emptyDayText(selectedDate))}</div>`;return;}
  let out='',date='';
  for(const item of visible){if(item.date!==date){if(date)out+='</div>';date=item.date;out+=app.view==='day'?'<div class="event-section-label">COMPROMISSOS E TAREFAS</div>':`<div class="week-day"><h3>${html(dateLong(date))}</h3>`;}out+=itemMarkup(item);}
  if(app.view==='week')out+='</div>';
  $('#event-list').innerHTML=out;
}
document.querySelectorAll('.metric').forEach(b=>b.addEventListener('click',()=>{app.horizon=b.dataset.horizon;app.start=app.horizon==='later'?dAdd(today,7):today;app.view=app.horizon==='today'?'day':'week';render();$('#agenda').scrollIntoView({behavior:'smooth',block:'start'});}));
document.querySelectorAll('.view-switch button').forEach(b=>b.addEventListener('click',()=>{app.view=b.dataset.view;app.horizon=null;render();}));
$('#area-filter').addEventListener('change',e=>{app.area=e.target.value;render();});
$('#priority-filter').addEventListener('change',e=>{app.priority=e.target.value;render();});
$('#show-done').addEventListener('change',e=>{app.showDone=e.target.checked;render();});
$('#prev').addEventListener('click',()=>{app.start=dAdd(app.start,app.view==='day'?-1:-7);app.horizon=null;render();});
$('#next').addEventListener('click',()=>{app.start=dAdd(app.start,app.view==='day'?1:7);app.horizon=null;render();});
$('#go-today').addEventListener('click',()=>{app.start=today;app.view='day';app.horizon='today';render();});
$('#week-overview').addEventListener('click',e=>{
  const button=e.target.closest('button[data-week-date]');if(!button||!weekDates().includes(button.dataset.weekDate)||app.horizon==='later')return;
  app.weekDay=button.dataset.weekDate;render();$(`[data-week-date="${app.weekDay}"]`).focus();
});
function setActiveNav(id){
  document.querySelectorAll('.nav-item,.mobile-nav-item').forEach(link=>{
    const active=link.getAttribute('href')==='#'+id;link.classList.toggle('active',active);
    if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');
  });
}
document.querySelectorAll('.nav-item,.mobile-nav-item').forEach(link=>link.addEventListener('click',()=>setActiveNav(link.getAttribute('href').slice(1))));
$('#quick-add-button').addEventListener('click',()=>openTask());
globalThis.addEventListener('hashchange',()=>setActiveNav(globalThis.location?.hash.slice(1)||'visao'));
let navFrame=false;
globalThis.addEventListener('scroll',()=>{
  if(navFrame)return;navFrame=true;
  requestAnimationFrame(()=>{
    navFrame=false;
    const sections=['visao','prioridades','agenda','atualizacoes','vagas'];
    const active=sections.filter(id=>$('#'+id).getBoundingClientRect().top<=globalThis.innerHeight*.3).at(-1)||'visao';setActiveNav(active);
  });
},{passive:true});
setActiveNav(globalThis.location?.hash.slice(1)||'visao');
function announce(message){$('#action-status').textContent=message;}
function focusAfterRender(id){const control=[...document.querySelectorAll('#event-list .event-check')].find(x=>x.dataset.id===id);(control||$('#event-list')).focus();}
$('#event-list').addEventListener('change',async e=>{
  if(!e.target.matches('.event-check'))return;
  const id=e.target.dataset.id,checked=e.target.checked;e.target.disabled=true;
  const saved=await save(current=>service.mark(current,id,checked));e.target.disabled=false;
  if(!saved){e.target.checked=service.isDone(id);return;}
  render();focusAfterRender(id);announce(checked?'Item concluído.':'Item reaberto.');
});
const dialog=$('#task-dialog');
let editingBase=null,deletingBase=null,draftTaskId=null;
function openTask(task=null){
  const f=$('#task-form');f.reset();editingBase=task?structuredClone(task):null;draftTaskId=null;
  for(const key of ['title','date','time','area','priority'])f.elements[key].value=task?.[key]||(key==='date'?(app.view==='week'&&app.horizon!=='later'?app.weekDay||app.start:app.start):key==='area'?'faculdade':key==='priority'?'high':'');
  $('#task-dialog-title').textContent=task?'Editar tarefa':'Nova tarefa';$('#task-submit').textContent=task?'Salvar alterações':'Adicionar tarefa';
  storageNotice('');dialog.showModal();f.elements.title.focus();
}
$('#add-button').addEventListener('click',()=>openTask());
$('#close-dialog').addEventListener('click',()=>dialog.close());
$('#cancel-dialog').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>$('#add-button').focus());
$('#event-list').addEventListener('click',e=>{
  const button=e.target.closest('button[data-action]');if(!button)return;
  const task=service.task(button.dataset.id);if(!task)return;
  if(button.dataset.action==='edit')openTask(task);
  else{deletingBase=structuredClone(task);$('#delete-task-title').textContent=task.title;storageNotice('');$('#delete-dialog').showModal();$('#cancel-delete').focus();}
});
$('#cancel-delete').addEventListener('click',()=>$('#delete-dialog').close());
$('#delete-dialog').addEventListener('close',()=>$('#add-button').focus());
$('#confirm-delete').addEventListener('click',async()=>{
  const base=deletingBase,button=$('#confirm-delete');if(!base)return;button.disabled=true;
  if(await save(current=>service.remove(current,base))){$('#delete-dialog').close();render();announce('Tarefa excluída.');}
  button.disabled=false;
});
function taskId(){
  if(globalThis.crypto?.randomUUID)return 'local-'+crypto.randomUUID();
  if(globalThis.crypto?.getRandomValues){const bytes=crypto.getRandomValues(new Uint8Array(16));return 'local-'+[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');}
  throw Error('Não foi possível criar um ID seguro. Abra o painel em HTTPS ou localhost.');
}
$('#task-form').addEventListener('submit',async ev=>{
  ev.preventDefault();const f=ev.target;if(!f.reportValidity())return;
  const data=new FormData(f),base=editingBase,title=String(data.get('title')).trim();if(!title)return;
  let id;try{id=base?.id||(draftTaskId??=taskId());}catch(error){storageNotice(error.message);return;}
  const task={...(base||{}),id,title,date:String(data.get('date')),time:String(data.get('time')),kind:'task',priority:String(data.get('priority')),area:String(data.get('area')),detail:AREA_NAMES[String(data.get('area'))],source:base?.source||'Tarefa · criada por você'};
  const button=$('#task-submit');button.disabled=true;
  if(await save(current=>base?service.edit(current,base,task):service.insert(current,task))){app.start=task.date;app.view='day';app.horizon=null;f.reset();dialog.close();render();announce(base?'Tarefa atualizada.':'Tarefa adicionada.');}
  button.disabled=false;
});
let importSession=null,importGeneration=0;
const dataDialog=$('#data-dialog');
$('#data-button').addEventListener('click',()=>{storageNotice('');dataDialog.showModal();});
$('#close-data').addEventListener('click',()=>dataDialog.close());
dataDialog.addEventListener('close',()=>{resetImport();$('#data-button').focus();});
$('#export-data').addEventListener('click',async()=>{
  try{
    const {data:current}=await store.refresh(),payload=JSON.stringify(D.backup(current),null,2)+'\n';
    if(new TextEncoder().encode(payload).length>D.MAX_BYTES)throw Error('Backup excede o limite de 2 MB.');
    const url=URL.createObjectURL(new Blob([payload],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download='luan-os-dados-'+localToday()+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('Backup exportado. Guarde o arquivo em um local privado.');
  }catch(error){storageNotice('Não foi possível exportar. '+error.message);}
});
function resetImport(){importGeneration++;importSession=null;$('#import-preview').hidden=true;$('#apply-import').disabled=true;$('#import-file').value='';}
$('#cancel-import').addEventListener('click',resetImport);
function importPreview(){
  if(!importSession)return;
  const result=D.merge(importSession.local,importSession.incoming,importSession.resolutions);
  const describe=(task,deleted,done,conflict)=>deleted?'Tarefa excluída':task?`${task.title} · ${task.date}${task.time?' '+task.time:''} · ${AREA_NAMES[task.area]} · ${task.priority==='high'?'Alta':task.priority==='low'?'Baixa':'Média'} · ${done?'Concluída':'Pendente'}`:conflict.completionOnly?`${viewData.calendarEvents.find(item=>item.id===conflict.id)?.title||conflict.id} · ${done?'Concluído':'Pendente'}`:'Ausente';
  $('#import-summary').textContent=`${result.added} tarefa(s) nova(s), ${result.conflicts.length} conflito(s). Conclusões diferentes exigem sua escolha; tarefas ausentes no arquivo são mantidas.`;
  $('#import-conflicts').innerHTML=result.conflicts.map((conflict,index)=>`<div class="import-conflict"><p><strong>No painel:</strong> ${html(describe(conflict.local,conflict.localDeleted,conflict.localDone,conflict))}</p><p><strong>No arquivo:</strong> ${html(describe(conflict.incoming,conflict.incomingDeleted,conflict.incomingDone,conflict))}</p><label>Qual versão manter? <select data-conflict="${index}" aria-label="Resolver conflito ${index+1}"><option value="">Escolha uma versão</option><option value="local" ${importSession.resolutions.get(conflict.id)==='local'?'selected':''}>Manter versão do painel</option><option value="incoming" ${importSession.resolutions.get(conflict.id)==='incoming'?'selected':''}>Usar versão do arquivo</option></select></label></div>`).join('');
  importSession.conflicts=result.conflicts;$('#import-preview').hidden=false;$('#apply-import').disabled=result.unresolved.length>0;
}
$('#import-file').addEventListener('change',async e=>{
  const generation=++importGeneration,file=e.target.files?.[0];importSession=null;$('#import-preview').hidden=true;$('#apply-import').disabled=true;storageNotice('');if(!file)return;
  try{
    if(file.size>D.MAX_BYTES)throw Error('Arquivo deve ter no máximo 2 MB.');
    const incoming=D.parseBackup(await file.text());if(generation!==importGeneration)return;
    service.assertImport(incoming);
    const {data:local}=await store.refresh();if(generation!==importGeneration)return;importSession={local,incoming,base:D.fingerprint(local),resolutions:new Map()};importPreview();
  }catch(error){if(generation===importGeneration)storageNotice('Arquivo não importado. '+error.message);}
});
$('#import-conflicts').addEventListener('change',e=>{
  const index=Number(e.target.dataset.conflict),conflict=importSession?.conflicts[index];if(!conflict)return;
  importSession.resolutions.set(conflict.id,e.target.value);const result=D.merge(importSession.local,importSession.incoming,importSession.resolutions);$('#apply-import').disabled=result.unresolved.length>0;
});
$('#apply-import').addEventListener('click',async()=>{
  const session=importSession,button=$('#apply-import');if(!session)return;button.disabled=true;
  const saved=await save(current=>service.importReviewed(current,session));
  if(saved){resetImport();dataDialog.close();render();announce('Dados importados e mesclados.');}else button.disabled=false;
});
let refreshing=false;
async function refreshCloud(){
  if(refreshing)return;refreshing=true;
  try{
    const before=D.fingerprint(service.read());await service.refresh();
    if(before!==D.fingerprint(service.read()))render();
    $('#sync-status').textContent='Dados sincronizados entre dispositivos.';
  }catch(error){$('#sync-status').textContent=error.message+(store.loaded?' A última versão desta sessão foi mantida.':' Nenhum dado do servidor foi carregado nesta sessão.');}
  finally{refreshing=false;}
}
channel?.addEventListener('message',event=>{if(event.data?.type==='state-changed')refreshCloud();});
globalThis.addEventListener('focus',refreshCloud);
globalThis.addEventListener('storage',event=>{if(event.key===KEY||event.key===null)legacyNotice();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCloud();});
function legacyNotice(){
  try{const raw=localStorage.getItem(KEY);$('#legacy-data').hidden=!raw;}
  catch{$('#legacy-data').hidden=true;}
}
$('#import-legacy').addEventListener('click',async()=>{
  const generation=++importGeneration;importSession=null;$('#import-preview').hidden=true;$('#apply-import').disabled=true;
  try{
    const raw=localStorage.getItem(KEY);if(!raw)throw Error('Nenhum dado antigo neste navegador.');
    const incoming=D.validateState(JSON.parse(raw)),{data:local}=await store.refresh();if(generation!==importGeneration)return;
    service.assertImport(incoming);
    importSession={local,incoming,base:D.fingerprint(local),resolutions:new Map()};storageNotice('');importPreview();
  }catch(error){storageNotice('Dados antigos não importados. Eles foram preservados. '+error.message);}
});
$('#export-legacy').addEventListener('click',()=>{
  try{
    const raw=localStorage.getItem(KEY);if(!raw)throw Error('Nenhum dado antigo neste navegador.');
    const payload=JSON.stringify(D.backup(D.validateState(JSON.parse(raw))),null,2)+'\n';
    const url=URL.createObjectURL(new Blob([payload],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='luan-os-dados-antigos-'+localToday()+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('Dados antigos exportados sem alteração.');
  }catch(error){storageNotice('Não foi possível exportar os dados antigos. '+error.message);}
});
render();
legacyNotice();refreshCloud();setInterval(()=>{if(!document.hidden)refreshCloud();},30000);
async function loadAgenda(){
  try{
    const data=await service.load('agenda');
    const stamp=updateDate(data.captured_at);
    const coverage='Cobertura: '+data.window_start+' a '+data.window_end;
    const age=snapshotAge(data.captured_at);
    $('#snapshot-title').textContent='Atualizado '+stamp;
    $('#snapshot-subtitle').textContent=age+' · '+coverage;
    $('#data-status').textContent='Agenda: captura '+stamp+' · '+age+' · '+coverage;
    render();
  }catch{
    $('#snapshot-subtitle').textContent=viewData.agenda?'Falha na leitura · última captura válida desta sessão':'Sem dados de agenda disponíveis';
    $('#data-status').textContent=viewData.agenda?'Agenda: falha na leitura · captura '+updateDate(viewData.agenda.captured_at)+' mantida nesta sessão · '+snapshotAge(viewData.agenda.captured_at)+' · Cobertura: '+viewData.agenda.window_start+' a '+viewData.agenda.window_end:'Agenda: falha na leitura · nenhum snapshot disponível';
    renderFreshness();
  }
}
loadAgenda();
setInterval(loadAgenda,15*60*1000);
function updateDate(value){
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return 'Data não informada';
  return new Intl.DateTimeFormat('pt-BR',{timeZone:ZONE,year:'numeric',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(date).replace('.','');
}
function snapshotAge(value){const age=Date.now()-Date.parse(value);return age<0?'Data no futuro · conferir captura':age<3600000?'Captura há menos de 1 h':age<86400000?'Captura há '+Math.floor(age/3600000)+' h':'Captura há '+Math.floor(age/86400000)+' dia(s)';}
function updateMarkup(item){
  const tone=item.status==='attention'?'attention':item.status==='pending'?'pending':'current';
  const status=oldRecord(item.updated_at)?'Registro antigo':tone==='attention'?'Requer atenção':tone==='pending'?'Pendente':'Atualizado';
  const badgeTone=oldRecord(item.updated_at)?'pending':tone;
  const next=item.next_step?'<div class="update-next"><span class="update-field-label">Próxima ação</span><p>'+html(item.next_step)+'</p></div>':'';
  return '<article class="update-item"><div class="update-item-head"><div class="update-label">'+html(item.label)+'</div><span class="update-status '+badgeTone+'"><span class="update-dot '+badgeTone+'" aria-hidden="true"></span>'+status+'</span></div><div class="update-copy"><strong>'+html(item.headline)+'</strong></div><div class="update-situation"><span class="update-field-label">Situação</span><p>'+html(item.summary)+'</p></div>'+next+'<div class="update-meta"><span class="update-field-label">Último registro</span><time datetime="'+html(item.updated_at)+'">'+html(updateDate(item.updated_at))+'</time><span>'+html(snapshotAge(item.updated_at))+'</span></div></article>';
}
async function loadUpdates(){
  try{
    const data=await service.load('updates');
    const markup=data.streams.map(updateMarkup).join('')||'<div class="updates-empty">Nenhuma atualização disponível.</div>';
    const stamp='Arquivo: '+updateDate(data.updated_at)+' · '+snapshotAge(data.updated_at);
    $('#updates-list').innerHTML=markup;
    $('#updates-stamp').textContent=stamp;
    renderDailyFocus();renderFreshness();
  }catch{
    $('#updates-stamp').textContent=viewData.updates?'Falha na leitura · arquivo '+updateDate(viewData.updates.updated_at)+' mantido nesta sessão':'Falha na leitura · nenhum resumo válido nesta sessão';
    if(!viewData.updates)$('#updates-list').innerHTML='<div class="updates-empty">Resumos indisponíveis nesta sessão. Tente novamente em alguns minutos.</div>';
    renderDailyFocus();renderFreshness();
  }
}
loadUpdates();
setInterval(loadUpdates,15*60*1000);
const jobAlertDate=date=>new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'}).format(new Date(date+'T12:00:00Z')).replace('.','');
function jobMarkup(job){
  return `<article class="job-item"><div class="job-top"><span class="job-fit ${job.fit}">${job.fit==='alta'?'Alta compatibilidade':'Compatibilidade média'}</span><span class="job-alerted">Alerta de ${html(jobAlertDate(job.alerted_at))}</span></div><h3>${html(job.title)}</h3><p class="job-company">${html(job.company)} <span aria-hidden="true">·</span> ${html(job.location)}</p><div class="job-reason"><span class="update-field-label">Por que combina</span><p>${html(job.reason)}</p></div><a class="job-link" href="${html(job.url)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir vaga ${html(job.title)} em nova aba">Ver vaga</a></article>`;
}
function renderJobs(){
  const stamp=$('#jobs-stamp'),stateNode=$('#jobs-state'),list=$('#jobs-list');
  if(!viewData.jobs){stamp.textContent=service.failed('jobs')?'Captura indisponível':'Carregando vagas…';stateNode.textContent=service.failed('jobs')?'Leitura indisponível':'Carregando';list.innerHTML=service.failed('jobs')?'<div class="jobs-empty"><strong>Não foi possível ler as vagas.</strong><span>Tente atualizar novamente mais tarde.</span></div>':'<p class="jobs-empty">Carregando oportunidades…</p>';return;}
  const old=oldRecord(viewData.jobs.captured_at),future=Date.parse(viewData.jobs.captured_at)>Date.now();
  stamp.textContent=(service.failed('jobs')?'Última captura válida desta sessão: ':'Captura: ')+updateDate(viewData.jobs.captured_at)+' · Fonte: '+viewData.jobs.source;
  stateNode.textContent=service.failed('jobs')?'Leitura indisponível'+(old?' · registro antigo':''):old?'Registro antigo':future?'Data da captura a conferir':'Registro recente';
  stateNode.classList.toggle('attention',service.failed('jobs')||old||future);
  list.innerHTML=viewData.jobs.items.length?viewData.jobs.items.map(jobMarkup).join(''):'<div class="jobs-empty"><strong>Nenhuma vaga neste registro.</strong><span>Confira novamente após a próxima captura.</span></div>';
}
async function loadJobs(){
  if(jobsLoading)return;jobsLoading=true;$('#jobs-retry').disabled=true;
  try{
    await service.load('jobs');
  }catch{}
  finally{jobsLoading=false;$('#jobs-retry').disabled=false;renderJobs();}
}
$('#jobs-retry').addEventListener('click',loadJobs);
renderJobs();loadJobs();setInterval(loadJobs,15*60*1000);
setInterval(()=>{
  if(document.hidden)return;
  if(localToday()!==today){render();return;}
  renderDailyFocus();renderFreshness();
  if(viewData.updates)$('#updates-list').innerHTML=viewData.updates.streams.map(updateMarkup).join('')||'<div class="updates-empty">Nenhuma atualização disponível.</div>';
  if(viewData.jobs)renderJobs();
},60*1000);

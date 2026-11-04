// Agenda publicada em acesso privado; tarefas e conclusões são confirmadas pelo servidor.
const P=globalThis.LuanPlanning;
const profile=globalThis.DashboardProfile;
const ZONE=P.ZONE;
const M=globalThis.LuanModules;
const automationPlan=globalThis.LuanAutomationPlan;
let jobsRead=null;
let jobActivity=null,consultationRead=null,consultationAttempt=0,consultationVersion=0,consultationFailed=false;
const D=globalThis.LuanLocalData;
const KEY=D.KEY;
const AREA_NAMES = {faculdade:'Faculdade',carreira:'Carreira',conteudo:'Conteúdo',saude:'Saúde',desenvolvimento:'Desenvolvimento',pessoal:'Pessoal'};
const KIND_NAMES = {deadline:'Entrega',exam:'Avaliação',class:'Aula',task:'Tarefa',appointment:'Compromisso'};
const dAdd=P.addDays;
const localToday=()=>P.day();
let today=localToday();
const dateShort = d => new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',day:'2-digit',month:'short'}).format(new Date(d+'T12:00:00Z')).replace('.','');
const dateLong = d => new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(new Date(d+'T12:00:00Z'));
const clockNow=()=>new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('luan-os-state'):null;
const store=globalThis.LuanCloudData.createStore((url,options)=>fetch(url,options),()=>channel?.postMessage({type:'state-changed'}));
const service=globalThis.LuanPanelService.createService(store,(url,options)=>fetch(url,options));
const workspace=globalThis.LuanWorkspaceService.createService(service);
// Optional Google Calendar task sync. Without its script or server credentials the panel behaves exactly as before.
const CS=globalThis.LuanCalendarSync,calendarClient=CS?CS.createClient((url,options)=>fetch(url,options)):null;
let calendarStatus=null,calendarTimer=null,calendarRunning=false,calendarModeSaving=false,calendarFormDirty=false,calendarChain=0,calendarLastRun=0,calendarBusyRetries=0,calendarWakeups=0;
const CALENDAR_ICON='<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"></rect><path d="M3 10h18M8 3v4M16 3v4"></path></svg>';
const CALENDAR_MODE_LABELS={inherit:'Seguir a configuração geral',on:'Sincronizar esta tarefa',off:'Não sincronizar esta tarefa'};
const svg=d=>'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+d+'</svg>';
const ICON={
  alert:svg('<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4M12 17h.01"/>'),
  clock:svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  note:svg('<path d="M6 4h8l4 4v12H6z"/><path d="M14 4v4h4M9 13h6M9 16h4"/>'),
  external:svg('<path d="M14 5h5v5M19 5l-8 8"/><path d="M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"/>'),
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path pathLength="1" d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
};
// Read-only projections. All confirmed state and snapshot caches belong to services.
const viewData={get state(){return service.read();},get agenda(){return service.snapshot('agenda');},get updates(){return service.snapshot('updates');},get jobs(){return service.snapshot('jobs');},get calendarEvents(){return this.agenda?.items||[];},get snapshotEnd(){return this.agenda?.window_end||today;}};
async function save(reducer){
  try{await service.mutate(reducer);storageNotice('');scheduleCalendarSync();return true;}
  catch(error){render();storageNotice((error.uncertain?'Resultado da gravação incerto. Seu rascunho foi preservado. ':'Sua alteração foi recusada. ')+error.message);return false;}
}
function storageNotice(message){for(const selector of ['#storage-alert','#task-storage-alert','#data-storage-alert','#delete-storage-alert']){const node=$(selector);node.textContent=message;node.hidden=!message;}}
const app={module:'hoje',view:'day',start:today,horizon:'today',area:'all',priority:'all',showDone:false,weekDay:null};
// Presentation-only memory of this page: which rows and summaries are open. Never persisted.
const expanded=new Set(),openStreams=new Set();
let filtersOpen=false;
let dayLineArea=null,recentTaskId=null,captureDraft=false;
const $=s=>document.querySelector(s);
const html=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const reducedMotion=()=>!!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// Repaints a region only when its markup changed, so open rows, focus and scroll survive unrelated redraws.
// Keyboard focus inside a repainted region returns to the element carrying the same data-focus-key.
const painted=new WeakMap();
function paint(node,markup){
  if(painted.get(node)===markup)return false;
  const active=document.activeElement,key=active&&typeof node.contains==='function'&&node.contains(active)?active.dataset?.focusKey:null;
  node.innerHTML=markup;painted.set(node,markup);
  if(key){const next=[...node.querySelectorAll('[data-focus-key]')].find(x=>x.dataset.focusKey===key);next?.focus();}
  return true;
}
function renderProfile(){
  document.title=profile.productName;
  document.querySelectorAll('[data-product-name]').forEach(node=>{node.textContent=profile.productName;});
  document.querySelectorAll('[data-profile-name]').forEach(node=>{node.textContent=profile.fullName;});
  document.querySelectorAll('[data-profile-initials]').forEach(node=>{node.textContent=profile.initials;node.setAttribute('aria-label',profile.fullName);});
  document.querySelectorAll('[data-profile-label]').forEach(node=>{node.textContent=profile.workspaceLabel;});
  $('#profile-priorities').innerHTML=profile.priorities.map(item=>`<div class="priority-line"><strong>${html(item.title)}</strong><span>${html(item.detail)}</span></div>`).join('');
  $('#profile-footer-note').textContent=profile.footerNote;
}
const items=()=>service.items();
const planningEnd=()=>P.planningEnd(today,viewData.agenda,service.read());
const isDone=item=>service.isDone(item.id);
const pass=item=>workspace.accepts(app.module,item)&&(app.area==='all'||item.area===app.area)&&(app.priority==='all'||item.priority===app.priority)&&(app.showDone||!isDone(item));
const effective=P.effectiveDate;
const selectable=item=>effective(item)>=app.start && (app.view==='day'?effective(item)===app.start:effective(item)<=(app.horizon==='later'?planningEnd():dAdd(app.start,6)));
const sortItems=P.sortItems;
const oldRecord=value=>P.oldRecord(value);
const coveredDate=date=>P.covered(viewData.agenda,date);
const weekDates=()=>Array.from({length:7},(_,index)=>dAdd(app.start,index));
const agendaLoading=()=>!viewData.agenda&&!service.failed('agenda');
function emptyState(date,all){
  if(app.horizon==='later')return ['Sem compromissos listados.','Nenhum item futuro nesta seleção. Tarefas além da cobertura da agenda continuam disponíveis aqui.'];
  if(agendaLoading())return ['Carregando a agenda…','Tarefas do painel aparecem assim que os dados forem confirmados.'];
  if(service.failed('agenda')&&!viewData.agenda)return ['Sem compromissos listados.','Agenda indisponível nesta sessão. Apenas tarefas do painel podem aparecer.'];
  if(!coveredDate(date))return ['Sem compromissos listados.','Sem cobertura da agenda para esta data. Apenas tarefas do painel podem aparecer.'];
  const hidden=all.some(item=>effective(item)===date&&workspace.accepts(app.module,item));
  return ['Sem compromissos listados.',hidden?'Há itens ocultos pelos filtros, como concluídos ou de outras áreas. Ajuste os filtros para vê-los.':'Nenhum compromisso ou tarefa registrado para esta data.'];
}
let focusExpanded=false,focusText='';
function renderDailyFocus(){
  const {briefing,current}=P.dailyFocus(viewData.updates,service.failed('updates'));
  const failed=service.failed('updates'),loading=!viewData.updates&&!failed;
  $('#daily-focus-title').textContent=current?'Foco de hoje':briefing?.next_step?'Último foco registrado':loading?'Carregando o foco':failed&&!briefing?'Foco indisponível':'Foco ainda não informado';
  $('#daily-focus-state').textContent=failed?'Leitura indisponível':briefing&&oldRecord(briefing.updated_at)?'Registro antigo':current?'Briefing de hoje':loading?'Carregando…':'Aguardando foco de hoje';
  $('#daily-focus-state').classList.toggle('attention',!current);
  $('#daily-focus').classList.toggle('is-stale',!current);
  const next=briefing?.next_step||(loading?'Carregando a próxima ação registrada no briefing.':failed?'Os resumos não puderam ser lidos nesta sessão. Nenhuma ação foi criada no lugar do briefing.':'Nenhuma próxima ação disponível no briefing desta sessão.');
  if(next!==focusText){focusText=next;focusExpanded=false;}
  const collapsible=next.length>240;
  $('#daily-focus-action').textContent=next;
  $('#daily-focus-action').classList.toggle('focus-preview',collapsible&&!focusExpanded);
  $('#daily-focus-toggle').hidden=!collapsible;
  $('#daily-focus-toggle').textContent=focusExpanded?'Recolher foco':'Ler foco completo';
  $('#daily-focus-toggle').setAttribute('aria-expanded',String(focusExpanded));
  $('#daily-focus-date').innerHTML=briefing?`<span>Fonte: briefing, registro de <time datetime="${html(briefing.updated_at)}">${html(updateDate(briefing.updated_at))}</time></span>${current?'':'<span>Confirme este registro antes de usá-lo como foco de hoje.</span>'}`:'';
}
function renderFreshness(){
  const messages=[],add=(text,tone='attention')=>messages.push({text,tone});
  if(service.failed('agenda'))add(viewData.agenda?'Agenda: leitura indisponível. A última captura válida desta sessão foi mantida.':'Agenda: leitura indisponível. Nenhuma captura válida carregada nesta sessão.','error');
  else if(viewData.agenda&&P.freshness(viewData.agenda.captured_at)==='future')add('Agenda: a data da captura, '+updateDate(viewData.agenda.captured_at)+', está no futuro. Confira a origem antes de usar.');
  else if(viewData.agenda&&oldRecord(viewData.agenda.captured_at))add('Agenda: registro antigo, de '+updateDate(viewData.agenda.captured_at)+'. Confira alterações nos canais de origem.');
  if(service.failed('updates'))add(viewData.updates?'Resumos: leitura indisponível. O último conteúdo válido desta sessão foi mantido.':'Resumos: leitura indisponível. Nenhum conteúdo válido carregado nesta sessão.','error');
  else if(viewData.updates){
    if([viewData.updates.updated_at,...viewData.updates.streams.map(item=>item.updated_at)].some(stamp=>P.freshness(stamp)==='future'))add('Resumos: há data de registro no futuro. Confira a origem antes de agir.');
    if(oldRecord(viewData.updates.updated_at)||viewData.updates.streams.some(item=>oldRecord(item.updated_at)))add('Resumos: há registro com mais de 26 horas. Confira a data de cada frente antes de agir.');
  }
  // Jobs keep their own cache and section state; the global notice only reports what that state already says.
  if(viewData.jobs){
    const captured=viewData.jobs.captured_at,future=P.freshness(captured)==='future',old=!future&&oldRecord(captured);
    if(service.failed('jobs'))add('Vagas: leitura indisponível. A última captura válida desta sessão, de '+updateDate(captured)+', foi mantida'+(future?' (data no futuro, confira a origem).':old?' (registro com mais de 26 horas).':'.'),'error');
    else if(future)add('Vagas: a data da captura, '+updateDate(captured)+', está no futuro. Confira a origem antes de usar.');
    else if(old)add('Vagas salvas: registro antigo, de '+updateDate(captured)+'. Os alertas recentes do Gmail aparecem separadamente no radar.');
  }else if(service.failed('jobs'))add('Vagas: leitura indisponível. Nenhuma captura válida carregada nesta sessão.','error');
  const notice=$('#freshness-notice');notice.hidden=!messages.length;
  notice.innerHTML=messages.map(message=>`<p class="notice-line${message.tone==='error'?' is-error':''}">${message.tone==='error'?ICON.alert:ICON.clock}<span>${html(message.text)}</span></p>`).join('');
  renderSources();
}
const CHIP_ICONS={ok:'M4 12.5l5 5L20 6.5',old:'M12 7v5l3 2M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0',warn:'M12 3 2 20h20zM12 10v4M12 17h.01',err:'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7.5v5M12 16h.01'};
// One state per snapshot source, derived only from what the services already hold.
function renderSources(){
  const sources=[['agenda','Agenda',viewData.agenda?.captured_at],['updates','Resumos',viewData.updates?.updated_at],['jobs','Vagas',viewData.jobs?.captured_at]];
  const states=sources.map(([name,label,stamp])=>{
    let tone='ok',note=stamp?updateDate(stamp):'';
    const stale=stamp&&(oldRecord(stamp)||name==='updates'&&viewData.updates.streams.some(item=>oldRecord(item.updated_at)));
    if(service.failed(name)){tone='err';note=stamp?'leitura indisponível · última captura mantida':'leitura indisponível';}
    else if(!stamp){tone='';note='carregando';}
    else if(P.freshness(stamp)==='future'||name==='updates'&&viewData.updates.streams.some(item=>P.freshness(item.updated_at)==='future')){tone='warn';note='data no futuro';}
    else if(stale){tone='old';note=name==='updates'&&!oldRecord(stamp)?'há frente com mais de 26 h':'registro antigo · '+note;}
    return {label,tone,note};
  });
  $('#source-chips').innerHTML=states.map(({label,tone,note})=>`<span class="chip ${tone}">${tone?`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${CHIP_ICONS[tone]}"></path></svg>`:''}${html(label)} <small>${html(note)}</small></span>`).join('');
  const summary=states.map(({tone})=>`<span class="dot ${tone}" aria-hidden="true"></span>`).join('')+`<span class="sr-only">${html(states.map(({label,note})=>label+': '+note).join('; '))}</span>`;
  $('#source-summary').innerHTML=summary;$('#source-summary-mobile').innerHTML=summary;
}
function dueBadge(date){
  const days=Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
  return `<span class="due-badge ${days<=2?'urgent':days<=5?'soon':''}">${days<=0?'hoje':days===1?'amanhã':'em '+days+' dias'}</span>`;
}
const filtered=item=>workspace.accepts(app.module,item)&&(app.area==='all'||item.area===app.area)&&(app.priority==='all'||item.priority===app.priority);
function renderDayProgress(all){
  const todays=service.loaded?all.filter(item=>effective(item)===today&&filtered(item)):[];
  const total=todays.length,done=todays.filter(isDone).length,pct=total?Math.round(done*100/total):0;
  $('#day-progress').hidden=!total;
  $('#day-progress-ring').setAttribute('stroke-dasharray',pct+' 100');
  $('#day-progress-pct').textContent=pct+'%';
  $('#day-progress-text').textContent=done+' de '+total+' concluídos';
  // A rolling seven-day projection of known items, independent of agenda filters.
  const week=service.loaded?all.filter(item=>workspace.accepts(app.module,item)&&P.inRange(item,today,dAdd(today,6))):[];
  const completed=week.filter(isDone).length;
  $('#week-progress-text').textContent=service.loaded?week.length?completed+' de '+week.length:'Sem itens': 'Carregando…';
  $('#week-progress-bar').value=week.length?Math.round(completed*100/week.length):0;
  $('#week-progress-note').textContent=Array.from({length:7},(_,i)=>dAdd(today,i)).every(coveredDate)?'Itens conhecidos':'Cobertura parcial';
}
// Known records for today. An absent time is explicit and never inferred.
const timed=item=>!item.timeLabel&&/^\d\d:\d\d$/.test(item.time||'');
function renderDayLine(all){
  const node=$('#day-line');
  if(app.module!=='hoje'){node.hidden=true;return;}
  node.hidden=false;
  const todays=all.filter(item=>effective(item)===today&&pass(item)).sort(sortItems);
  const next=todays.find(item=>!isDone(item)&&timed(item)&&item.time>=clockNow());
  let caption=next?`Próximo às ${next.time}: ${next.title}.`:todays.length?'Estes são os itens conhecidos de hoje.':'Nenhum item nesta seleção para hoje.';
  if(agendaLoading())caption+=' Carregando a agenda…';
  else if(service.failed('agenda')&&!viewData.agenda)caption+=' Agenda indisponível nesta sessão; aparecem só tarefas do painel.';
  else if(!coveredDate(today))caption+=' Sem cobertura da agenda para hoje; aparecem só tarefas do painel.';
  const cascade=dayLineArea!==null&&dayLineArea!==app.area;dayLineArea=app.area;
  const rows=todays.map(item=>`<div class="lunar-day-row${item.id===recentTaskId?' is-new':''}${isDone(item)?' is-done':''}" data-line-id="${html(item.id)}" data-focus-key="line:${html(item.id)}" tabindex="-1"><time>${html(item.timeLabel||item.time||'Sem hora')}</time><i data-area="${html(item.area)}" aria-hidden="true"></i><div><strong>${html(item.title)}</strong><small>${html(KIND_NAMES[item.kind]||item.kind)} · ${html(AREA_NAMES[item.area]||item.area)}${item.id===recentTaskId?' · agora mesmo':''}${isDone(item)?' · concluído':''}</small></div></div>`).join('');
  const coverageWarning=agendaLoading()||service.failed('agenda')&&!viewData.agenda||!coveredDate(today);
  paint(node,`<div class="lunar-day-rows${cascade?' is-filtering':''}">${rows||'<p>Nenhum item nesta seleção.</p>'}</div><p class="day-line-caption${coverageWarning?' is-coverage-warning':''}">${html(caption)}</p>`);
}
$('#day-line').addEventListener('animationend',e=>{if(e.animationName==='lunar-row'&&e.target.dataset?.lineId===recentTaskId)recentTaskId=null;});
function renderWeekOverview(all){
  const enabled=app.view==='week'&&app.horizon!=='later';
  $('#week-overview').hidden=!enabled;$('#week-help').hidden=!enabled;
  if(!enabled){paint($('#week-overview'),'');return;}
  const dates=weekDates();if(!dates.includes(app.weekDay))app.weekDay=app.start;
  paint($('#week-overview'),dates.map(date=>{
    const entries=all.filter(item=>effective(item)===date&&pass(item)).sort(sortItems);
    const deadlines=entries.filter(item=>['deadline','exam'].includes(item.kind)).length;
    const knownTimes=[...new Set(entries.map(item=>item.timeLabel||item.time).filter(Boolean))];
    const weekday=new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',weekday:'short'}).format(new Date(date+'T12:00:00Z')).replace('.','');
    const [day,...month]=dateShort(date).split(' ');
    const empty=coveredDate(date)?'Sem compromissos listados':'Sem cobertura da agenda';
    return `<button type="button" class="week-summary${date===today?' is-today':''}${deadlines?' has-deadline':''}" data-week-date="${date}" data-focus-key="week:${date}" aria-pressed="${date===app.weekDay}" aria-label="${html(dateLong(date))}: ${entries.length} itens nesta seleção${deadlines?', '+deadlines+' prazos':''}${coveredDate(date)?'':'. Sem cobertura da agenda'}"><span class="week-weekday">${html(weekday)}${date===today?' · hoje':''}</span><strong>${html(day)}<span class="wd-month"> ${html(month.join(' '))}</span></strong><span class="week-count${entries.length?'':' is-empty'}">${entries.length?entries.length+' '+(entries.length===1?'item':'itens'):empty}</span>${deadlines?`<span class="week-deadlines">${deadlines} ${deadlines===1?'prazo':'prazos'}</span>`:''}${knownTimes.length?`<small class="week-times">${html(knownTimes.join(' · '))}</small>`:''}${entries.length&&!coveredDate(date)?'<small>Sem cobertura da agenda</small>':''}<span class="week-load" aria-hidden="true">${Array.from({length:Math.min(entries.length,5)},()=>'<i></i>').join('')}</span></button>`;
  }).join(''));
}
// The state label comes from the calendar client itself, so a new sync state never contradicts the row badge.
function calendarFact(id){
  if(!calendarActive())return null;
  const entry=calendarStatus?.entries.find(x=>x.task_id===id),view=CS.badge(calendarStatus,id);
  return (view?view.tone==='ok'?'Sincronizada':view.label:'Sem evento vinculado')+(entry?.mode&&entry.mode!=='inherit'?' · '+CALENDAR_MODE_LABELS[entry.mode]:'');
}
// One row: time, completion, title. Notes, provenance, ID and the personal-task actions open on request.
function itemMarkup(item,index){
  const done=isDone(item),local=service.isPersonal(item.id),id=html(item.id),time=item.timeLabel||item.time;
  const note=item.detail&&item.detail!==AREA_NAMES[item.area]?item.detail:'';
  const sync=local?calendarFact(item.id):null;
  const facts=[note&&['Nota',note],item.source&&['Origem',item.source],sync&&['Google Agenda',sync],['ID',item.id,'id']].filter(Boolean).map(([label,value,cls])=>`<dt>${label}</dt><dd${cls?` class="${cls}"`:''}>${html(value)}</dd>`).join('');
  const actions=local?`<div class="task-actions"><button type="button" class="button secondary small" data-action="edit" data-id="${id}" data-focus-key="edit:${id}" aria-label="Editar ${html(item.title)}">Editar</button><button type="button" class="button danger-ghost small" data-action="delete" data-id="${id}" data-focus-key="delete:${id}" aria-label="Excluir ${html(item.title)}">Excluir</button></div>`:'<p class="event-readonly">Compromisso da agenda capturada. Alterações são feitas na origem.</p>';
  return `<article class="event-item${done?' done':''}" data-kind="${html(item.kind)}"><span class="event-time${time?'':' is-empty'}">${html(time||'—')}</span><label class="check"><input class="event-check" type="checkbox" data-id="${id}" data-focus-key="check:${id}" aria-label="${done?'Reabrir':'Concluir'} ${html(item.title)}"${done?' checked':''}><span class="check-box" aria-hidden="true">${ICON.check}</span></label><div class="event-body"><button type="button" class="event-toggle" data-toggle="${id}" data-focus-key="toggle:${id}" aria-expanded="false" aria-controls="event-detail-${index}"><span class="event-title">${html(item.title)}</span></button><div class="event-sub"><span class="area-chip" data-area="${html(item.area)}"><i aria-hidden="true"></i>${html(AREA_NAMES[item.area]||'')}</span><span class="event-kind">${KIND_NAMES[item.kind]||'Tarefa'}</span>${note?`<span class="note-mark">${ICON.note}Nota</span>`:''}${local?calendarBadge(item.id):''}</div><div class="event-detail" id="event-detail-${index}"><div class="event-detail-inner"><dl class="event-facts">${facts}</dl>${actions}</div></div></div></article>`;
}
function deadlineMarkup(item){
  const date=effective(item),time=item.timeLabel||item.time,detail=item.detail&&item.detail!==AREA_NAMES[item.area]?item.detail:'';
  return `<article class="deadline">${dueBadge(date)}<strong>${html(item.title)}</strong><p class="deadline-meta"><span>${KIND_NAMES[item.kind]}</span><time datetime="${date}">${html(dateShort(date))}</time>${time?`<span>${html(time)}</span>`:''}${detail?`<span>${html(detail)}</span>`:''}</p></article>`;
}
function render(){
  const current=localToday();
  if(current!==today){if(app.horizon==='today'||app.horizon==='week')app.start=current;else if(app.horizon==='later')app.start=dAdd(current,7);today=current;}
  const all=items();
  renderWorkspace();renderDailyFocus();renderFreshness();renderWeekOverview(all);
  if(viewData.updates)paint($('#updates-list'),updatesMarkup());
  const nextDeadlines=all.filter(x=>workspace.accepts(app.module,x)&&P.inRange(x,today,planningEnd())&&['deadline','exam'].includes(x.kind)&&!isDone(x)).sort(sortItems).slice(0,3);
  $('#focus-intro').hidden=nextDeadlines.length>0;
  $('#focus-intro').textContent=nextDeadlines.length?'Avaliações e entregas que pedem atenção.':agendaLoading()?'Carregando os prazos da agenda…':service.failed('agenda')&&!viewData.agenda?'Agenda indisponível nesta sessão. Só as tarefas do painel entram nesta lista.':'Sem avaliações ou entregas pendentes neste período.';
  paint($('#focus-steps'),nextDeadlines.map(deadlineMarkup).join(''));
  const count=(a,b)=>all.filter(x=>P.inRange(x,a,b)&&pass(x)).length;
  $('#metric-today').textContent=count(today,today);
  $('#metric-week').textContent=count(today,dAdd(today,6));
  $('#metric-later').textContent=count(dAdd(today,7),planningEnd());
  renderDayProgress(all);renderDayLine(all);
  document.querySelectorAll('.horizon').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.horizon===app.horizon)));
  document.querySelectorAll('.view-switch button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===app.view)));
  const active=(app.area!=='all')+(app.priority!=='all')+(app.showDone?1:0);
  $('#filters-count').textContent=active?String(active):'';
  $('#today-label').textContent=dateLong(today);
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,hour:'2-digit',hourCycle:'h23'}).format(new Date()));
  $('#hero-title').innerHTML=app.module!=='hoje'?html(M.resolve(app.module).title):(hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite')+', '+html(profile.preferredName)+'.';
  $('#range-title').textContent=app.view==='day'?dateLong(app.start):app.horizon==='later'?'A partir de '+dateShort(app.start):`${dateShort(app.start)} – ${dateShort(dAdd(app.start,6))}`;
  $('#range-caption').textContent=app.horizon==='later'?'A partir do oitavo dia, com todas as tarefas futuras':app.view==='day'?(app.start===today?'Hoje':'Compromissos e tarefas do dia'):'Sete dias a partir desta data';
  const showsToday=app.view==='day'?app.start===today:app.horizon!=='later'&&today>=app.start&&today<=dAdd(app.start,6);
  $('#go-today').hidden=app.horizon!==null||showsToday;
  const weekly=app.view==='week'&&app.horizon!=='later';
  const selectedDate=weekly?app.weekDay:app.start;
  const visible=all.filter(x=>pass(x)&&selectable(x)&&(!weekly||effective(x)===selectedDate)).sort(sortItems);
  const dayHeading=weekly?`<div class="week-day"><h3>${html(dateLong(selectedDate))}</h3></div>`:'';
  if(!visible.length){const [title,text]=emptyState(selectedDate,all);paint($('#event-list'),dayHeading+`<div class="empty"><strong>${html(title)}</strong><span>${html(text)}</span></div>`);return;}
  let out='',date='',shown=0,marked=false;
  const nowTime=app.view==='day'&&app.start===today?clockNow():null;
  for(const item of visible){
    if(effective(item)!==date){if(date&&app.view==='week')out+='</div>';date=effective(item);if(app.view==='week')out+=`<div class="week-day"><h3>${html(dateLong(date))}</h3>`;}
    // Current-time marker: only between items already listed and the first later timed item.
    if(nowTime&&!marked&&shown>0&&!item.timeLabel&&/^\d\d:\d\d$/.test(item.time)&&item.time>nowTime){out+=`<div class="now-marker" role="separator" aria-label="Agora, ${nowTime}"><span>Agora · ${nowTime}</span></div>`;marked=true;}
    out+=itemMarkup(item,shown);shown++;
  }
  if(app.view==='week')out+='</div>';
  paint($('#event-list'),out);applyExpanded();
}
document.querySelectorAll('.horizon').forEach(b=>b.addEventListener('click',()=>{app.horizon=b.dataset.horizon;app.start=app.horizon==='later'?dAdd(today,7):today;app.view=app.horizon==='today'?'day':'week';render();}));
document.querySelectorAll('.view-switch button').forEach(b=>b.addEventListener('click',()=>{app.view=b.dataset.view;app.horizon=null;render();}));
$('#area-filter').addEventListener('change',e=>{app.area=e.target.value;render();});
$('#priority-filter').addEventListener('change',e=>{app.priority=e.target.value;render();});
$('#show-done').addEventListener('change',e=>{app.showDone=e.target.checked;render();});
$('#prev').addEventListener('click',()=>{app.start=dAdd(app.start,app.view==='day'?-1:-7);app.horizon=null;render();});
$('#next').addEventListener('click',()=>{app.start=dAdd(app.start,app.view==='day'?1:7);app.horizon=null;render();});
$('#go-today').addEventListener('click',()=>{app.start=today;app.view='day';app.horizon='today';render();$('#event-list').focus();});
function setFilters(open){filtersOpen=open;$('#agenda-filters').classList.toggle('is-open',open);$('#filters-toggle').setAttribute('aria-expanded',String(open));}
$('#filters-toggle').addEventListener('click',()=>setFilters(!filtersOpen));
$('#agenda-filters').addEventListener('keydown',e=>{if(e.key==='Escape'){setFilters(false);$('#filters-toggle').focus();}});
$('#week-overview').addEventListener('click',e=>{
  const button=e.target.closest('button[data-week-date]');if(!button||!weekDates().includes(button.dataset.weekDate)||app.horizon==='later')return;
  app.weekDay=button.dataset.weekDate;render();$(`[data-week-date="${app.weekDay}"]`).focus();
});
$('#overdue-notice').addEventListener('click',e=>{
  const button=e.target.closest?.('button[data-overdue-date]');if(!button)return;
  const date=button.dataset.overdueDate;app.start=date;app.weekDay=date;app.view='week';app.horizon=null;render();
  $('#agenda').scrollIntoView({block:'start',behavior:reducedMotion()?'auto':'smooth'});$('#event-list').focus({preventScroll:true});
});
let disclosureModule=null;
function renderWorkspace(){
  const view=workspace.view(app.module),module=view.module,home=module.id==='hoje';
  document.title=home?profile.productName:module.label+' · '+profile.productName;
  $('#module-breadcrumb').textContent=module.label;
  $('#module-description').textContent=module.description;
  $('#module-context').hidden=home||!(module.note||view.task_status==='unavailable');$('#module-title').textContent=module.title;
  $('#module-note').textContent=module.note||module.description;
  $('#module-source-status').textContent=view.task_status==='unavailable'?'Tarefas: leitura indisponível. Não é possível afirmar ausência de pendências.':'';
  document.querySelectorAll('.home-only').forEach(node=>{node.hidden=!home;});
  const administrative=['agentes','configuracoes'].includes(module.id),agenda=!administrative&&module.id!=='financas';
  const updates=!administrative&&!(module.streams!==null&&!module.streams.length);
  $('#shared-workspace').hidden=administrative;
  $('#primary').hidden=!agenda;$('#agenda').hidden=!agenda;
  $('#prioridades').hidden=!agenda;$('#atualizacoes').hidden=!updates;
  $('#secondary').hidden=!agenda&&!updates;
  $('#shared-workspace').classList.toggle('has-aside',agenda);
  $('#vagas').hidden=!['hoje','carreira'].includes(module.id);
  $('#agents-panel').hidden=module.id!=='agentes';$('#settings-panel').hidden=module.id!=='configuracoes';
  if(disclosureModule!==module.id){
    $('#jobs-disclosure').open=['hoje','carreira'].includes(module.id);
    $('#updates-disclosure').open=!home;
    disclosureModule=module.id;
  }
  $('#quick-add-button').hidden=module.defaultArea===null;$('#fab-add').hidden=module.defaultArea===null;
  $('#lunar-capture').hidden=module.defaultArea===null;
  const overdue=view.overdue,notice=$('#overdue-notice');
  notice.hidden=!home||!overdue?.length;
  paint(notice,overdue?.length?`${ICON.alert}<span>${overdue.length} tarefa(s) pessoal(is) com data anterior a hoje. Confira antes de concluir ou reagendar.</span><button type="button" class="text-link" data-focus-key="overdue" data-overdue-date="${html(effective(overdue[0]))}">Ver desde ${html(dateShort(effective(overdue[0])))}</button>`:'');
}
function enterContent(){
  if(reducedMotion())return;
  const node=$('.content');node.classList.toggle('route-enter',false);void node.offsetWidth;node.classList.toggle('route-enter',true);
}
function activateRoute(){
  const id=globalThis.location?.hash.slice(1)||'hoje',next=M.resolve(id).id,changed=next!==app.module;
  if(changed){app.module=next;app.area='all';$('#area-filter').value='all';app.start=today;app.view=next==='hoje'?'day':'week';app.horizon=next==='hoje'?'today':'week';app.weekDay=today;}
  render();setActiveNav(id);
  if(id==='vagas')$('#jobs-disclosure').open=true;
  if(id==='atualizacoes')$('#updates-disclosure').open=true;
  if(id==='modulos'){
    $('#module-disclosure').open=true;
    // Wide screens list every module in the sidebar instead of this launcher: take the person there.
    if($('#modulos').offsetParent===null){$('#module-sidebar .nav-item')?.focus();return;}
  }
  const target=['visao','hoje','agenda','prioridades','atualizacoes','vagas','modulos'].includes(id)?$('#'+id):$('#hoje');
  target.scrollIntoView({block:'start'});
  if(changed)enterContent();
}
const moduleIconPaths={"hoje":"<path d=\"m3 10 9-7 9 7v10H3z\"/><path d=\"M9 20v-7h6v7\"/>","academico":"<path d=\"m2 9 10-5 10 5-10 5z\"/><path d=\"M6 11v6c4 3 8 3 12 0v-6M22 9v6\"/>","carreira":"<rect x=\"3\" y=\"7\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M8 7V3h8v4M3 12h18M10 12v3h4v-3\"/>","projetos":"<path d=\"M3 5h7l2 3h9v12H3z\"/><path d=\"m8 14 3 3 5-5\"/>","financas":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M3 9h18M15 13h6v4h-6zM3 5V3h14\"/>","fitness":"<path d=\"M4 7v10M7 5v14M17 5v14M20 7v10M7 12h10\"/>","agentes":"<rect x=\"5\" y=\"7\" width=\"14\" height=\"13\" rx=\"3\"/><path d=\"M12 3v4M2 12h3M19 12h3M9 16h6\"/><circle cx=\"9\" cy=\"12\" r=\".6\"/><circle cx=\"15\" cy=\"12\" r=\".6\"/>","configuracoes":"<path d=\"M4 7h16M4 17h16\"/><circle cx=\"9\" cy=\"7\" r=\"3\"/><circle cx=\"15\" cy=\"17\" r=\"3\"/>"};
function moduleIcon(id){return '<svg class="module-icon" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(moduleIconPaths[id]||moduleIconPaths.hoje)+'</svg>';}
// Navigation groups are presentation only; additional modules stay under "Áreas".
const NAV_GROUPS=[{label:'',ids:['hoje']},{label:'Áreas',ids:['academico','carreira','projetos','financas','fitness']},{label:'Sistema',ids:['agentes','configuracoes']}];
function navMarkup(prefix){
  const grouped=new Set(NAV_GROUPS.flatMap(group=>group.ids)),extra=M.modules.map(module=>module.id).filter(id=>!grouped.has(id));
  const groups=NAV_GROUPS.map(group=>group.label==='Áreas'?{...group,ids:[...group.ids,...extra]}:group);
  return groups.map((group,index)=>{
    const links=group.ids.map(id=>M.modules.find(module=>module.id===id)).filter(Boolean).map(module=>{
      const link='<a class="nav-item" data-module="'+module.id+'" href="#'+module.id+'">'+moduleIcon(module.id)+'<span class="nav-label">'+html(module.label)+'</span></a>';
      if(prefix!=='side'||group.label!=='Áreas')return link;
      return `<div class="nav-area-row">${link}<button class="nav-area-more" type="button" data-area-menu="${module.id}" aria-expanded="false" aria-controls="area-menu-${module.id}" aria-label="Ações de ${html(module.label)}">⋯</button><div id="area-menu-${module.id}" class="nav-area-menu" hidden><a href="#${module.id}">Abrir área</a><button type="button" data-area-task="${module.id}"${module.defaultArea?'':' disabled'}>Nova tarefa${module.defaultArea?'':' · em breve'}</button></div></div>`;
    }).join('');
    if(!links)return '';
    return group.label?`<div class="nav-group" role="group" aria-labelledby="${prefix}-group-${index}"><p class="nav-group-label" id="${prefix}-group-${index}">${group.label}</p>${links}</div>`:`<div class="nav-group">${links}</div>`;
  }).join('');
}
function renderModuleNavigation(){
  $('#module-sidebar').innerHTML=navMarkup('side');
  $('#sheet-links').innerHTML=navMarkup('sheet');
  $('#module-links').innerHTML=M.modules.map(module=>'<a class="module-link" data-module="'+module.id+'" href="#'+module.id+'">'+moduleIcon(module.id)+'<strong>'+html(module.label)+'</strong><span>'+html(module.description)+'</span></a>').join('');
  $('#automation-plan').innerHTML=automationPlan.routines.length?automationPlan.routines.map(routine=>'<article class="automation-row"><strong>'+html(routine.name)+'</strong><span>'+html(routine.schedule)+'</span><p>'+html(routine.role)+'</p></article>').join(''):'<p class="automation-empty">Nenhuma rotina configurada nesta instalação.</p>';
  const audited=typeof automationPlan.auditedOn==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(automationPlan.auditedOn)?automationPlan.auditedOn.split('-').reverse().join('/'):automationPlan.auditedOn;
  $('#automation-audit').textContent=(audited?'Configuração conferida em '+audited+'. ':'')+'Esta lista não é um monitor ao vivo de execuções. Consulte Agendado no ChatGPT para acompanhar resultados.';
}
function setActiveNav(id){
  document.querySelectorAll('.nav-item,.mobile-nav-item').forEach(link=>{
    const href=link.getAttribute('href'),active=href==='#'+id||href==='#'+M.resolve(id).id;link.classList.toggle('active',active);
    if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');
  });
  $('#more-button').classList.toggle('active',!['hoje','academico','carreira'].includes(M.resolve(id).id));
}
function closeAreaMenus(){
  document.querySelectorAll('[data-area-menu]').forEach(button=>button.setAttribute('aria-expanded','false'));
  document.querySelectorAll('.nav-area-menu').forEach(menu=>{menu.hidden=true;});
}
$('#module-sidebar').addEventListener('click',e=>{
  const more=e.target.closest?.('[data-area-menu]');
  if(more){const open=more.getAttribute('aria-expanded')!=='true';closeAreaMenus();$('#'+more.getAttribute('aria-controls')).hidden=!open;more.setAttribute('aria-expanded',String(open));return;}
  const task=e.target.closest?.('[data-area-task]');
  if(task){closeAreaMenus();if(!openTask())return;dialogOpener=$('#module-sidebar [data-module="'+task.dataset.areaTask+'"]');$('#task-form').elements.area.value=M.resolve(task.dataset.areaTask).defaultArea;}
  else if(e.target.closest?.('a'))closeAreaMenus();
});
$('#module-sidebar').addEventListener('keydown',e=>{if(e.key==='Escape'){const more=$('#module-sidebar [data-area-menu][aria-expanded="true"]');closeAreaMenus();more?.focus();}});
document.addEventListener('click',e=>{if(!$('#module-sidebar').contains?.(e.target))closeAreaMenus();});
$('#module-sidebar').addEventListener('focusout',e=>{if(e.relatedTarget&&!$('#module-sidebar').contains?.(e.relatedTarget))closeAreaMenus();});
function announce(message){
  const node=$('#action-status');node.textContent=message;
  clearTimeout(announce.timer);if(message)announce.timer=setTimeout(()=>{node.textContent='';},4200);
}
function focusAfterRender(id){const control=[...document.querySelectorAll('#event-list .event-check')].find(x=>x.dataset.id===id);(control||$('#event-list')).focus();}
// Dialogs return focus to whatever opened them, or to a stable fallback when that control left the page.
let dialogOpener=null;
function showDialog(node){dialogOpener=document.activeElement||null;node.showModal();}
function restoreFocus(fallback){
  const target=dialogOpener;dialogOpener=null;
  if(target&&target.isConnected&&typeof target.focus==='function'&&target!==document.body)target.focus();else fallback.focus();
}
// Open rows are applied after painting, so expanding one never invalidates the list markup.
function setItemOpen(button,open){button.closest('.event-item')?.classList.toggle('is-open',open);button.setAttribute('aria-expanded',String(open));}
function applyExpanded(){for(const button of $('#event-list').querySelectorAll?.('[data-toggle]')||[])setItemOpen(button,expanded.has(button.dataset.toggle));}
function toggleItem(button){
  const id=button.dataset.toggle,open=!expanded.has(id);
  if(open)expanded.add(id);else expanded.delete(id);
  setItemOpen(button,open);
}
function focusKey(key){
  const target=[...document.querySelectorAll('[data-focus-key]')].find(node=>node.dataset.focusKey===key);
  target?.focus();return !!target;
}
$('#event-list').addEventListener('change',async e=>{
  if(!e.target.matches('.event-check'))return;
  const id=e.target.dataset.id,checked=e.target.checked;e.target.disabled=true;
  const saved=await save(current=>service.mark(current,id,checked));e.target.disabled=false;
  if(!saved){e.target.checked=service.isDone(id);return;}
  render();focusAfterRender(id);announce(checked?'Item concluído.':'Item reaberto.');
});
const dialog=$('#task-dialog');
// editingCalendarMode: the Google Agenda preference this dialog session knows the server holds (set when the dialog
// opens, updated by every confirmation and by a reported concurrent change; see ensureTaskCalendarMode).
let editingBase=null,deletingBase=null,draftTaskId=null,editingCalendarMode='inherit';
function syncQuickDates(){
  const value=$('#task-form').elements.date?.value;
  for(const button of $('#quick-dates').querySelectorAll?.('button[data-date-offset]')||[])button.setAttribute('aria-pressed',String(value===dAdd(localToday(),Number(button.dataset.dateOffset))));
}
function openTask(task=null,{review=true}={}){
  if(captureSaving){announce('Salvando a captura…');return false;}
  if(!task)captureDraft=false;
  const f=$('#task-form');f.reset();editingBase=task?structuredClone(task):null;draftTaskId=null;
  for(const key of ['title','date','time','area','priority'])f.elements[key].value=task?.[key]||(key==='date'?(app.view==='week'&&app.horizon!=='later'?app.weekDay||app.start:app.start):key==='area'?(M.resolve(app.module).defaultArea||'pessoal'):key==='priority'?'high':'');
  $('#task-dialog-title').textContent=task?'Editar tarefa':'Nova tarefa';$('#task-submit').textContent=task?'Salvar alterações':'Adicionar tarefa';
  $('#task-calendar-field').hidden=!calendarActive();
  editingCalendarMode=(task&&calendarStatus?.entries.find(x=>x.task_id===task.id)?.mode)||'inherit';
  if(calendarActive()&&f.elements.calendar)f.elements.calendar.value=editingCalendarMode;
  syncQuickDates();
  storageNotice('');if(review){showDialog(dialog);f.elements.title.focus();}
  return true;
}
$('#quick-dates').addEventListener('click',e=>{
  const button=e.target.closest?.('button[data-date-offset]');if(!button)return;
  $('#task-form').elements.date.value=dAdd(localToday(),Number(button.dataset.dateOffset));syncQuickDates();
});
$('#task-form').addEventListener('input',e=>{if(e.target?.name==='date')syncQuickDates();});
$('#add-button').addEventListener('click',()=>openTask());
$('#quick-add-button').addEventListener('click',()=>openTask());
$('#fab-add').addEventListener('click',()=>openTask());
$('#close-dialog').addEventListener('click',()=>dialog.close());
$('#cancel-dialog').addEventListener('click',()=>dialog.close());
// After a save the saved task's row takes focus (the control that opened the dialog may have been redrawn).
let focusAfterSave=null;
dialog.addEventListener('close',()=>{const key=focusAfterSave;focusAfterSave=null;if(key&&focusKey(key)){dialogOpener=null;return;}restoreFocus($('#add-button'));});
$('#event-list').addEventListener('click',e=>{
  const toggle=e.target.closest('[data-toggle]');
  if(toggle&&typeof toggle.dataset?.toggle==='string'){toggleItem(toggle);return;}
  const button=e.target.closest('button[data-action]');if(!button)return;
  const task=service.task(button.dataset.id);if(!task)return;
  if(button.dataset.action==='edit')openTask(task);
  else{deletingBase=structuredClone(task);$('#delete-task-title').textContent=task.title;storageNotice('');showDialog($('#delete-dialog'));$('#cancel-delete').focus();}
});
$('#cancel-delete').addEventListener('click',()=>$('#delete-dialog').close());
$('#delete-dialog').addEventListener('close',()=>restoreFocus($('#event-list')));
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
async function submitTask(f){
  if(!f.reportValidity())return;
  const data=new FormData(f),base=editingBase,title=String(data.get('title')).trim();if(!title)return;
  let id;try{id=base?.id||(draftTaskId??=taskId());}catch(error){storageNotice(error.message);return;}
  const task={...(base||{}),id,title,date:String(data.get('date')),time:String(data.get('time')),kind:'task',priority:String(data.get('priority')),area:String(data.get('area')),detail:base?base.detail:AREA_NAMES[String(data.get('area'))],source:base?.source||'Tarefa · criada por você'};
  const button=$('#task-submit');button.disabled=true;
  // The Google Agenda preference is confirmed by the server BEFORE the task is written, so no run (in any tab)
  // can sync the task under a preference that was not stored. If it cannot be confirmed, nothing is saved.
  const calendarMode=calendarActive()&&f.elements.calendar?String(f.elements.calendar.value):null;
  if(calendarMode&&!await ensureTaskCalendarMode(id,calendarMode,!base)){button.disabled=false;return;}
  if(await save(current=>base?service.edit(current,base,task):service.insert(current,task))){
    const focusCapture=!base&&captureDraft&&app.module==='hoje'&&task.date===today;
    if(!base){recentTaskId=task.id;if(captureDraft){lastCaptureArea=task.area;captureInput.value='';if(app.area!=='all'&&app.area!==task.area){app.area='all';$('#area-filter').value='all';syncLunarFilters();}}setTimeout(()=>{if(recentTaskId===task.id){recentTaskId=null;renderDayLine(items());}},800);}
    captureDraft=false;app.start=task.date;app.view='day';app.horizon=task.date===today?'today':null;f.reset();
    const savedFocus=(focusCapture?'line:':'toggle:')+task.id;
    if(dialog.open){focusAfterSave=savedFocus;dialog.close();render();}else{render();focusKey(savedFocus);}
    announce(base?'Tarefa atualizada.':'Tarefa adicionada.');
  }
  button.disabled=false;
}
$('#task-form').addEventListener('submit',async ev=>{ev.preventDefault();await submitTask(ev.target);});
let importSession=null,importGeneration=0;
const dataDialog=$('#data-dialog');
$('#data-button').addEventListener('click',()=>{storageNotice('');showDialog(dataDialog);});
$('#close-data').addEventListener('click',()=>dataDialog.close());
dataDialog.addEventListener('close',()=>{resetImport();restoreFocus($('#data-button'));});
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
    $('#sync-status').textContent='Dados sincronizados entre dispositivos.';$('#sync-status').classList.toggle('attention',false);
  }catch(error){$('#sync-status').textContent=error.message+(store.loaded?' A última versão desta sessão foi mantida.':' Nenhum dado do servidor foi carregado nesta sessão.');$('#sync-status').classList.toggle('attention',true);}
  finally{refreshing=false;}
}
channel?.addEventListener('message',event=>{if(event.data?.type==='state-changed')refreshCloud();});
globalThis.addEventListener('focus',refreshCloud);
globalThis.addEventListener('storage',event=>{if(event.key===KEY||event.key===null)legacyNotice();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshCloud();refreshDueSnapshots();refreshView();}});
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
// One visibility policy for the three snapshot reads. A hidden tab never fetches and never marks
// a resource as refreshed; a returning tab reads only what is due, at most once per resource.
// The last valid data, failure flags and timestamps are left exactly as they were.
const SNAPSHOT_REFRESH_MS=15*60*1000;
const snapshotLoaders={agenda:()=>loadAgenda(),updates:()=>loadUpdates(),jobs:()=>loadJobs()};
const snapshotAttempt={agenda:0,updates:0,jobs:0},snapshotBusy={agenda:false,updates:false,jobs:false};
async function refreshSnapshot(name,{force=false}={}){
  if(document.hidden||snapshotBusy[name]||!force&&Date.now()-snapshotAttempt[name]<SNAPSHOT_REFRESH_MS)return false;
  snapshotBusy[name]=true;snapshotAttempt[name]=Date.now();
  try{await snapshotLoaders[name]();}finally{snapshotBusy[name]=false;}
  return true;
}
function refreshDueSnapshots(){return Promise.all([...Object.keys(snapshotLoaders).map(name=>refreshSnapshot(name)),loadConsultations()]);}
async function loadAgenda(){
  try{
    const data=await service.load('agenda');
    const stamp=updateDate(data.captured_at);
    const coverage='Cobertura: '+data.window_start+' a '+data.window_end;
    const age=snapshotAge(data.captured_at);
    $('#snapshot-title').textContent='Agenda atualizada '+stamp;
    $('#snapshot-subtitle').textContent=age+' · '+coverage;
    $('#data-status').textContent='Agenda: captura '+stamp+' · '+age+' · '+coverage;
    render();
  }catch{
    $('#snapshot-subtitle').textContent=viewData.agenda?'Falha na leitura · última captura válida desta sessão':'Sem dados de agenda disponíveis';
    $('#data-status').textContent=viewData.agenda?'Agenda: falha na leitura · captura '+updateDate(viewData.agenda.captured_at)+' mantida nesta sessão · '+snapshotAge(viewData.agenda.captured_at)+' · Cobertura: '+viewData.agenda.window_start+' a '+viewData.agenda.window_end:'Agenda: falha na leitura · nenhum snapshot disponível';
    render();
  }
}
function updateDate(value){
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return 'Data não informada';
  return new Intl.DateTimeFormat('pt-BR',{timeZone:ZONE,year:'numeric',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(date).replace('.','');
}
function snapshotAge(value){const age=Date.now()-Date.parse(value);return age<0?'Data no futuro · conferir captura':age<3600000?'Captura há menos de 1 h':age<86400000?'Captura há '+Math.floor(age/3600000)+' h':'Captura há '+Math.floor(age/86400000)+' dia(s)';}
function consultationText(name){
  const source=jobActivity?.routine?.[name],manual=name==='jobs'?jobActivity?.operation:null;
  const manualAt=manual?.summary?.checked_at||manual?.started_at;
  let text;
  if(manualAt&&(!source?.last_attempt_at||Date.parse(manualAt)>=Date.parse(source.last_attempt_at))){
    const date=updateDate(manualAt);
    if(P.freshness(manualAt)==='future')text='Data da consulta do botão no futuro. Confira a origem.';
    else if(manual.status==='completed'){
      const result=manual.summary,pending=result.counts.pending;
      text='Última consulta dos alertas (botão) em '+date+'. '+(result.status==='updated'?'Vagas salvas atualizadas.':'Vagas salvas mantidas.');
      if(pending)text+=pending===1?' 1 confirmação oficial pendente.':' '+pending+' confirmações oficiais pendentes.';
      else if(!result.official_complete)text+=' Confirmação oficial incompleta.';
    }else text='Última tentativa (botão) em '+date+(
      manual.status==='running'?' em andamento.':manual.status==='uncertain'?' com resultado incerto.':' falhou.');
  }else if(source?.last_attempt_at){
    const date=updateDate(source.last_attempt_at);
    if(P.freshness(source.last_attempt_at)==='future')text='Data da consulta da rotina no futuro. Confira a origem.';
    else if(source.status==='failed')text='Última tentativa da rotina em '+date+' falhou.'+
      (source.last_success_at?' Último sucesso em '+updateDate(source.last_success_at)+'.':'');
    else if(source.status==='success'){
      text='Última consulta '+(name==='jobs'?'dos alertas':'dos e-mails')+' (rotina) em '+date+'.';
      if(name==='jobs'&&source.new_items!==null)text+=' '+source.new_items+' alertas novos após deduplicação.';
    }
  }
  text||='Última consulta sem registro disponível.';
  if(consultationFailed)text+=' Histórico de consultas indisponível.';
  else if(jobActivity&&!jobActivity.routine)text+=' Histórico da rotina indisponível.';
  return text;
}
async function loadConsultations({force=false}={}){
  if(document.hidden)return;
  if(consultationRead)return consultationRead;
  if(!force&&Date.now()-consultationAttempt<SNAPSHOT_REFRESH_MS)return;
  consultationAttempt=Date.now();
  const version=consultationVersion;
  consultationRead=(async()=>{
    try{
      const result=await service.jobSearchStatus();
      if(version===consultationVersion){jobActivity=result;consultationFailed=false;}
    }catch{if(version===consultationVersion)consultationFailed=true;}
    finally{
      consultationRead=null;
      renderJobs();
      if(viewData.updates)paint($('#updates-list'),updatesMarkup());
    }
  })();
  return consultationRead;
}
function updatesMarkup(){return workspace.view(app.module).streams.map(updateMarkup).join('')||'<div class="updates-empty">Nenhum resumo específico desta área.</div>';}
function updateMarkup(item){
  const tone=item.status==='attention'?'attention':item.status==='pending'?'pending':'current';
  const future=P.freshness(item.updated_at)==='future';
  const status=future?'Data a conferir':oldRecord(item.updated_at)?'Registro antigo':tone==='attention'?'Requer atenção':tone==='pending'?'Pendente':'Atualizado';
  const badgeTone=future||oldRecord(item.updated_at)?'pending':tone;
  const next=item.next_step?'<div class="update-field"><span class="update-field-label">Próxima ação</span><p>'+html(item.next_step)+'</p></div>':'';
  const consultation=['estagios','emails'].includes(item.id)?'<p class="update-meta">'+html(consultationText('gmail'))+'</p>':'';
  return '<details class="update" data-stream="'+html(item.id)+'"'+(openStreams.has(item.id)?' open':'')+'><summary data-focus-key="stream:'+html(item.id)+'"><span class="update-label">'+html(item.label)+'</span><span class="update-status '+badgeTone+'"><span class="update-dot '+badgeTone+'" aria-hidden="true"></span>'+status+'</span><strong class="update-headline">'+html(item.headline)+'</strong></summary><div class="update-body"><div class="update-field"><span class="update-field-label">Situação</span><p>'+html(item.summary)+'</p></div>'+next+consultation+'<p class="update-meta"><span>Última alteração do conteúdo <time datetime="'+html(item.updated_at)+'">'+html(updateDate(item.updated_at))+'</time></span><span>'+html(snapshotAge(item.updated_at))+'</span></p></div></details>';
}
// A summary opened or closed by the person is remembered for this page, so redraws keep it as it is.
$('#updates-list').addEventListener('toggle',e=>{
  const node=e.target,id=node?.dataset?.stream;if(typeof id!=='string')return;
  if(node.open)openStreams.add(id);else openStreams.delete(id);
  painted.set($('#updates-list'),updatesMarkup());
},true);
async function loadUpdates(){
  try{
    const data=await service.load('updates');
    paint($('#updates-list'),updatesMarkup());
    $('#updates-stamp').textContent='Arquivo: '+updateDate(data.updated_at)+' · '+snapshotAge(data.updated_at);
    renderWorkspace();renderDailyFocus();renderFreshness();
  }catch{
    $('#updates-stamp').textContent=viewData.updates?'Falha na leitura · arquivo '+updateDate(viewData.updates.updated_at)+' mantido nesta sessão':'Falha na leitura · nenhum resumo válido nesta sessão';
    if(!viewData.updates)paint($('#updates-list'),'<div class="updates-empty">Resumos indisponíveis nesta sessão. Tente novamente em alguns minutos.</div>');
    renderWorkspace();renderDailyFocus();renderFreshness();
  }
}
const jobAlertDate=date=>new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'}).format(new Date(date+'T12:00:00Z')).replace('.','');
function jobMarkup(job){
  const fit=job.fit==='alta'?'Alta compatibilidade':'Compatibilidade média';
  return `<article class="job-item${lunarSelectedJob?.id===job.id?' is-selected':''}"><div class="job-summary"><h3>${html(job.title)}</h3><p class="job-company">${html(job.company)} <span aria-hidden="true">·</span> ${html(job.location)}</p><span class="job-alerted">Alerta de ${html(jobAlertDate(job.alerted_at))}</span></div><div class="job-top"><span class="job-fit ${html(job.fit)}" aria-label="${fit}"><span aria-hidden="true">${job.fit==='alta'?'Alta':'Média'}</span></span></div><button type="button" class="job-detail-button" data-job-detail="${html(job.id)}" data-focus-key="job:${html(job.id)}" aria-haspopup="dialog" aria-controls="lunar-job-dialog">Ver detalhes<span class="sr-only"> de ${html(job.title)} · ${fit}</span></button></article>`;
}
function renderJobs(){
  $('#jobs-consultation').textContent=consultationText('jobs');
  const stamp=$('#jobs-stamp'),stateNode=$('#jobs-state'),list=$('#jobs-list');
  list.setAttribute('aria-busy',String(!!jobsRead));
  if(!viewData.jobs){stamp.textContent=service.failed('jobs')?'Captura indisponível':'Carregando vagas…';stateNode.textContent=service.failed('jobs')?'Leitura indisponível':'Carregando';stateNode.classList.toggle('attention',service.failed('jobs'));paint(list,service.failed('jobs')?'<div class="jobs-empty"><strong>Não foi possível ler as vagas.</strong><span>Tente reler mais tarde. Nenhuma vaga foi descartada.</span></div>':'<div class="jobs-skeleton" aria-hidden="true"><i></i><i></i><i></i></div><p class="sr-only">Carregando oportunidades…</p>');return;}
  const old=oldRecord(viewData.jobs.captured_at),future=Date.parse(viewData.jobs.captured_at)>Date.now();
  stamp.textContent=(service.failed('jobs')?'Última captura válida desta sessão: ':'Última alteração das vagas salvas: ')+updateDate(viewData.jobs.captured_at)+' · Fonte: '+viewData.jobs.source;
  $('#jobs-saved-label').textContent='Vagas salvas anteriormente · '+updateDate(viewData.jobs.captured_at);
  stateNode.textContent=service.failed('jobs')?'Leitura indisponível'+(old?' · registro antigo':''):old?'Registro antigo':future?'Data da captura a conferir':'Registro recente';
  stateNode.classList.toggle('attention',service.failed('jobs')||old||future);
  paint(list,viewData.jobs.items.length?viewData.jobs.items.map(jobMarkup).join(''):'<div class="jobs-empty"><strong>Nada novo no radar por enquanto.</strong><span>Nenhuma vaga neste registro. Nada foi enviado em seu nome.</span></div>');
}
let lunarSelectedJob=null,lunarJobOpener=null;
let lunarJobHandoff=false;
const lunarJobDialog=$('#lunar-job-dialog');
$('#jobs-list').addEventListener('click',e=>{
  const button=e.target.closest?.('[data-job-detail]');if(!button)return;
  const job=viewData.jobs?.items.find(item=>item.id===button.dataset.jobDetail);if(!job)return;
  lunarSelectedJob=job;lunarJobOpener=button;
  $('#lunar-job-source').textContent='Vaga · '+viewData.jobs.source;
  $('#lunar-job-title').textContent=job.title;$('#lunar-job-company').textContent=job.company+' · '+job.location;
  $('#lunar-job-fit').textContent=job.fit==='alta'?'Alta':'Média';$('#lunar-job-reason').textContent=job.reason;
  $('#lunar-job-alert').textContent='Alerta de '+jobAlertDate(job.alerted_at)+'. Aderência estimada; confirme a disponibilidade na fonte.';
  const link=$('#lunar-job-link');link.hidden=!job.url;if(job.url)link.href=job.url;else link.removeAttribute('href');
  link.setAttribute('aria-label','Abrir vaga na fonte: '+job.title+' (nova aba)');
  document.querySelectorAll('#jobs-list .job-item').forEach(card=>card.classList.toggle('is-selected',card.contains(button)));
  lunarJobDialog.showModal();$('#lunar-job-close').focus();
});
$('#lunar-job-close').addEventListener('click',()=>lunarJobDialog.close());
lunarJobDialog.addEventListener('keydown',e=>{
  if(e.key!=='Tab')return;
  const controls=[...lunarJobDialog.querySelectorAll('button:not(:disabled),a[href]')].filter(node=>!node.hidden);
  const first=controls[0],last=controls.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
});
lunarJobDialog.addEventListener('close',()=>{
  if(!lunarJobHandoff){
    const replacement=[...document.querySelectorAll('[data-job-detail]')].find(button=>button.dataset.jobDetail===lunarSelectedJob?.id);
    (lunarJobOpener?.isConnected?lunarJobOpener:replacement||$('#jobs-reload')).focus();
  }
  lunarJobHandoff=false;lunarJobOpener=null;lunarSelectedJob=null;
  document.querySelectorAll('#jobs-list .job-item').forEach(card=>card.classList.toggle('is-selected',false));
});
$('#lunar-job-task').addEventListener('click',()=>{
  const job=lunarSelectedJob;if(!job||captureSaving)return;lunarJobHandoff=true;lunarJobDialog.close();openTask();
  $('#task-form').elements.title.value=('Revisar vaga: '+job.title+' — '+job.company).slice(0,100);
  $('#task-form').elements.area.value='carreira';
});

const captureInput=$('#lunar-capture-input'),shortcuts=$('#lunar-shortcuts');
let captureOptions=[],captureContext=null,activeCaptureOption=-1,lastCaptureArea=null,captureSaving=false;
const captureFold=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function showShortcuts(open){
  shortcuts.hidden=!open;captureInput.setAttribute('aria-expanded',String(open));
  if(!open){activeCaptureOption=-1;captureInput.removeAttribute('aria-activedescendant');}
}
function selectCaptureOption(index){
  const enabled=captureOptions.map((option,i)=>option.disabled?-1:i).filter(i=>i>=0);
  activeCaptureOption=enabled.includes(index)?index:-1;
  shortcuts.querySelectorAll('[data-capture-option]').forEach((node,i)=>node.classList.toggle('is-active',i===activeCaptureOption));
  if(activeCaptureOption<0)captureInput.removeAttribute('aria-activedescendant');
  else captureInput.setAttribute('aria-activedescendant','lunar-option-'+activeCaptureOption);
}
function refreshCaptureOptions(){
  const value=captureInput.value,cursor=captureInput.selectionStart??value.length,before=value.slice(0,cursor);
  captureContext=null;captureOptions=[];
  if(/^\/[^\s]*$/.test(value)){
    captureContext={start:0,end:value.length};
    captureOptions=[['tarefa','Nova tarefa',false],['lembrete','em breve',true],['vaga','em breve',true],['nota','em breve',true]]
      .filter(([name])=>name.startsWith(captureFold(value.slice(1))))
      .map(([name,description,disabled])=>({value:'/'+name,label:'/'+name,description,disabled}));
  }else{
    const match=before.match(/(?:^|\s)#([^\s#]*)$/);
    if(match){
      const start=before.lastIndexOf('#'),tail=value.slice(cursor).match(/^[^\s]*/)[0];
      captureContext={start,end:cursor+tail.length};
      captureOptions=Object.entries(AREA_NAMES).filter(([key,label])=>captureFold(key).startsWith(captureFold(match[1]))||captureFold(label).startsWith(captureFold(match[1])))
        .map(([key,label])=>({value:'#'+key,label:'#'+label,description:'Área existente',disabled:false}));
    }
  }
  paint(shortcuts,captureOptions.map((option,i)=>`<button id="lunar-option-${i}" type="button" role="menuitem" tabindex="-1" data-capture-option="${i}"${option.disabled?' disabled aria-disabled="true"':''}>${html(option.label)}<span>${html(option.description)}</span></button>`).join(''));
  showShortcuts(captureOptions.length>0);selectCaptureOption(-1);
}
function chooseCaptureOption(index){
  const option=captureOptions[index];if(!option||option.disabled||!captureContext)return;
  const {start,end}=captureContext;
  captureInput.value=captureInput.value.slice(0,start)+option.value+' '+captureInput.value.slice(end);
  showShortcuts(false);captureInput.focus();captureInput.setSelectionRange(start+option.value.length+1,start+option.value.length+1);
}
async function captureTask(){
  if($('#lunar-capture').hidden||captureSaving)return;
  const raw=captureInput.value.trim();if(!raw)return;
  if(raw.startsWith('/')&&!/^\/tarefa(?:\s|$)/.test(raw)){refreshCaptureOptions();announce('Use /tarefa. Os demais atalhos estão em breve.');return;}
  let area=null;
  const title=raw.replace(/^\/tarefa\s*/, '').replace(/(^|\s)#([^\s#]+)/g,(token,space,name)=>{
    const existing=Object.keys(AREA_NAMES).find(key=>captureFold(key)===captureFold(name)||captureFold(AREA_NAMES[key])===captureFold(name));
    if(!existing)return token;area=existing;return space;
  }).replace(/\s+/g,' ').trim();
  if(!title){announce('Escreva o título da tarefa.');return;}
  area=area||(app.area!=='all'?app.area:null)||lastCaptureArea||M.resolve(app.module).defaultArea||'pessoal';
  const review=calendarActive();
  showShortcuts(false);openTask(null,{review});captureDraft=true;
  const form=$('#task-form');form.elements.title.value=title;form.elements.date.value=today;form.elements.area.value=area;syncQuickDates();
  if(review){announce('Revise os campos e a preferência do Google Agenda antes de adicionar.');return;}
  captureSaving=true;captureInput.readOnly=true;$('.capture-submit').disabled=true;
  try{
    await submitTask(form);
    // The existing form owns validation, errors and safe retries of this same draft/ID.
    if(captureDraft){showDialog(dialog);form.elements.title.focus();}
  }finally{captureSaving=false;captureInput.readOnly=false;$('.capture-submit').disabled=false;}
}
$('#lunar-capture').addEventListener('submit',e=>{e.preventDefault();captureTask();});
shortcuts.addEventListener('click',e=>{const option=e.target.closest?.('[data-capture-option]');if(option)chooseCaptureOption(Number(option.dataset.captureOption));});
captureInput.addEventListener('input',refreshCaptureOptions);
$('#lunar-capture').addEventListener('keydown',e=>{
  if(e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key==='Escape'&&!shortcuts.hidden){e.preventDefault();showShortcuts(false);captureInput.focus();return;}
  if(['ArrowDown','ArrowUp'].includes(e.key)&&!shortcuts.hidden){
    e.preventDefault();const enabled=captureOptions.map((option,i)=>option.disabled?-1:i).filter(i=>i>=0);
    const current=enabled.indexOf(activeCaptureOption),step=e.key==='ArrowDown'?1:-1;
    selectCaptureOption(enabled[(current<0?(step>0?0:enabled.length-1):(current+step+enabled.length)%enabled.length)]);return;
  }
  if(e.key==='Enter'&&!e.shiftKey){
    e.preventDefault();
    if(!shortcuts.hidden){const index=activeCaptureOption>=0?activeCaptureOption:captureOptions.findIndex(option=>!option.disabled);chooseCaptureOption(index);}
    else captureTask();
  }
});
document.addEventListener('click',e=>{if(!$('#lunar-capture').contains?.(e.target))showShortcuts(false);});
$('#lunar-capture').addEventListener('focusout',e=>{if(e.relatedTarget&&!$('#lunar-capture').contains?.(e.relatedTarget))showShortcuts(false);});
// Keep keyboard focus clear of the two fixed mobile bars when the document scrolls.
document.addEventListener('focusin',e=>{
  const target=e.target;
  if(!globalThis.matchMedia?.('(max-width:1079px)').matches||!target?.closest?.('.content')||target.closest('.lunar-capture')||!target.matches(':focus-visible'))return;
  const rect=target.getBoundingClientRect(),top=$('.topbar').getBoundingClientRect().bottom;
  const bottom=($('#lunar-capture').hidden?$('.mobile-nav'):$('#lunar-capture')).getBoundingClientRect().top-8;
  if(rect.top<top||rect.bottom>bottom)target.scrollIntoView({block:'center',behavior:'auto'});
});
document.addEventListener('keydown',e=>{if(e.defaultPrevented||e.key!=='/'||e.ctrlKey||e.metaKey||e.altKey||e.isComposing||$('#lunar-capture').hidden||document.querySelector('dialog[open]')||e.target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName||''))return;e.preventDefault();captureInput.scrollIntoView({block:'center'});captureInput.focus();if(!captureInput.value)captureInput.value='/';refreshCaptureOptions();});
$('#lunar-filters').addEventListener('click',e=>{const button=e.target.closest?.('[data-lunar-area]');if(!button)return;app.area=button.dataset.lunarArea;$('#area-filter').value=app.area;syncLunarFilters();render();});
function syncLunarFilters(){document.querySelectorAll('[data-lunar-area]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.lunarArea===app.area)));}
$('#area-filter').addEventListener('change',syncLunarFilters);
function setLunarBackground(value){if(!['night','dots','plain'].includes(value))value='night';if(document.body.dataset)document.body.dataset.lunarBackground=value;document.querySelectorAll('[data-background]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.background===value)));try{localStorage.setItem('luan-ui-background',value);}catch{}}
let lunarBackground='night';try{lunarBackground=localStorage.getItem('luan-ui-background')||'night';}catch{}setLunarBackground(lunarBackground);
document.querySelectorAll('[data-background]').forEach(button=>button.addEventListener('click',()=>setLunarBackground(button.dataset.background)));
function loadJobs(){
  if(jobsRead)return jobsRead;$('#jobs-reload').disabled=true;
  jobsRead=(async()=>{
    $('#jobs-list').setAttribute('aria-busy','true');
    try{await service.load('jobs');}catch{}
    finally{jobsRead=null;$('#jobs-reload').disabled=false;renderJobs();renderFreshness();}
  })();return jobsRead;
}
let jobSearchRunning=false,gmailAuthorizing=false;
const JOB_SEARCH_ERRORS={
  gmail_not_configured:'A conexão do Gmail ainda não foi configurada nesta instalação.',
  gmail_authorization_required:'Autorize o Gmail para consultar os alertas de vagas.',
  gmail_reauthorization_required:'A conexão do Gmail precisa de uma nova autorização.',
  gmail_authentication_required:'Entre novamente na sua sessão para autorizar o Gmail.',
  job_preferences_not_configured:'As preferências de vagas ainda precisam ser configuradas.',
  job_search_busy:'Já existe uma busca em andamento. Aguarde antes de tentar novamente.',
  job_search_rate_limited:'Aguarde um pouco antes de iniciar outra busca.',
  gmail_rate_limited:'O Gmail limitou as consultas. Tente novamente mais tarde.',
  snapshot_revision_conflict:'As vagas salvas mudaram durante a busca. Releia a captura antes de tentar novamente.',
  job_search_revision_conflict:'As vagas salvas mudaram durante a busca. Releia a captura antes de tentar novamente.',
  job_search_result_uncertain:'O resultado da busca está incerto. A última captura exibida foi mantida nesta sessão; o servidor pode ter sido atualizado. Releia a captura para conferir.',
  job_search_baseline_required:'Releia as vagas salvas antes de tentar uma nova busca.',
  job_search_timeout:'A busca demorou a responder. A captura salva foi preservada.'
};
function jobSearchError(error){
  const code=error?.code,authorize=['gmail_authorization_required','gmail_reauthorization_required'].includes(code);
  $('#jobs-gmail-authorize').hidden=!authorize;$('#jobs-gmail-consent').hidden=!authorize;
  $('#jobs-search-status').textContent=(JOB_SEARCH_ERRORS[code]||'Não foi possível concluir a busca. As vagas salvas foram preservadas.')+(error?.retryAfter?' Tente novamente em '+error.retryAfter+' segundos.':'');
}
function renderPendingJobs(candidates,checkedAt){
  $('#jobs-pending').hidden=!candidates.length;
  $('#jobs-disclosure').open=!candidates.length;
  $('#jobs-pending-stamp').textContent=candidates.length?'Consulta realizada em '+updateDate(checkedAt)+'.':'';
  paint($('#jobs-pending-list'),candidates.map(job=>`<article class="job-item pending"><p class="job-pending-label">A confirmar · confirmação oficial pendente</p><h3>${html(job.title)}</h3><p class="job-company">${html(job.company)} · ${html(job.location)}</p><p>${html(job.reason)}</p><a class="job-link" href="${html(job.url)}" target="_blank" rel="noopener noreferrer" data-focus-key="pending:${html(job.id)}">Conferir anúncio${ICON.external}</a></article>`).join(''));
}
async function showJobSearchResult(result){
  consultationVersion++;
  jobActivity={...jobActivity,operation:{status:'completed',started_at:result.checked_at,summary:result}};
  consultationFailed=false;
  if(jobsRead)await jobsRead;
  await loadJobs();
  const count=result.counts;
  $('#jobs-search-status').textContent=(result.status==='updated'?'Vagas atualizadas. ':count.pending>0?'Alertas recentes encontrados; a confirmar. ':'Consulta dos alertas concluída. Vagas salvas mantidas. ')+count.messages+' mensagens lidas / '+count.confirmed+' confirmadas / '+count.pending+' pendentes.'+(result.source_complete?' Consulta dos alertas concluída em '+updateDate(result.checked_at)+'.':'')+(!result.official_complete?' Confirmação oficial incompleta.':'')+(result.warnings.includes('jobs_search_candidates_limited')?' O limite de verificação foi atingido; apenas parte dos candidatos elegíveis foi verificada.':'')+(count.pending>0&&!result.pending_candidates?.length?' Os detalhes das oportunidades pendentes não foram retidos nesta resposta.':'')+(result.warnings.length?' A consulta contém ressalvas; confira as oportunidades antes de decidir.':'')+(service.failed('jobs')?' Não foi possível reler a captura atualizada. A última captura válida foi mantida.':'');
  renderPendingJobs(result.pending_candidates||[],result.checked_at);
}
async function reconcileJobSearch(id){
  const status=await service.jobSearchStatus(id),operation=status.operation;
  if(operation?.status==='completed'&&operation.summary){await showJobSearchResult(operation.summary);return;}
  if(operation?.status==='failed'){jobSearchError({code:operation.error});return;}
  $('#jobs-search-status').textContent=(operation?.status==='running'?'A busca continua em andamento. A última captura exibida foi mantida nesta sessão; o servidor pode ter sido atualizado. Releia a captura para conferir.':JOB_SEARCH_ERRORS.job_search_result_uncertain)+' Nenhuma nova busca foi enviada.';
}
async function searchJobsManually(){
  if(jobSearchRunning)return;jobSearchRunning=true;$('#jobs-retry').disabled=true;$('#jobs-retry').setAttribute('aria-busy','true');
  $('#jobs-gmail-authorize').hidden=true;$('#jobs-gmail-consent').hidden=true;$('#jobs-search-status').textContent='Buscando alertas e verificando oportunidades…';
  let id;
  try{
    id=crypto.randomUUID();const result=await service.searchJobs({operation_id:id});
    if(result.status==='running')await reconcileJobSearch(id);else await showJobSearchResult(result);
  }catch(error){
    if(error.uncertain&&id){try{await reconcileJobSearch(id);}catch{jobSearchError({code:'job_search_result_uncertain'});}}
    else jobSearchError(error);
    await loadConsultations({force:true});
  }finally{jobSearchRunning=false;$('#jobs-retry').disabled=false;$('#jobs-retry').removeAttribute('aria-busy');}
}
$('#jobs-gmail-authorize').hidden=true;$('#jobs-gmail-consent').hidden=true;$('#jobs-pending').hidden=true;
$('#jobs-retry').addEventListener('click',searchJobsManually);
$('#jobs-reload').addEventListener('click',()=>Promise.all([refreshSnapshot('jobs',{force:true}),loadConsultations({force:true})]));
$('#jobs-gmail-authorize').addEventListener('click',async()=>{
  if(gmailAuthorizing)return;gmailAuthorizing=true;$('#jobs-gmail-authorize').disabled=true;
  try{const result=await service.startGmailAuthorization();globalThis.location.assign(result.authorization_url);}
  catch(error){$('#jobs-search-status').textContent=JOB_SEARCH_ERRORS[error.code]||'Não foi possível abrir a autorização segura do Gmail. Tente novamente mais tarde.';}
  finally{gmailAuthorizing=false;$('#jobs-gmail-authorize').disabled=false;}
});
function refreshView(){
  if(document.hidden)return;
  if(localToday()!==today){render();return;}
  renderWorkspace();renderDailyFocus();renderFreshness();renderDayLine(items());
  if(viewData.updates)paint($('#updates-list'),updatesMarkup());
  if(viewData.jobs)renderJobs();
}
function openSources(){
  const details=$('#source-details');details.open=true;
  details.scrollIntoView({block:'start',behavior:reducedMotion()?'auto':'smooth'});details.querySelector('summary')?.focus({preventScroll:true});
}
$('#sources-button').addEventListener('click',openSources);
$('#topbar-sources').addEventListener('click',openSources);
$('#skip-link').addEventListener('click',e=>{e.preventDefault();$('#visao').focus();});
$('#daily-focus-toggle').addEventListener('click',()=>{focusExpanded=!focusExpanded;renderDailyFocus();});
const sheet=$('#nav-sheet');let sheetNavigated=false;
$('#more-button').addEventListener('click',()=>showDialog(sheet));
$('#close-sheet').addEventListener('click',()=>sheet.close());
$('#sheet-links').addEventListener('click',e=>{if(e.target.closest?.('a[href]')){sheetNavigated=true;sheet.close();}});
sheet.addEventListener('close',()=>{if(sheetNavigated){sheetNavigated=false;dialogOpener=null;$('#visao').focus({preventScroll:true});}else restoreFocus($('#more-button'));});
// "N" opens a new task wherever a task can be created; never while typing or with a dialog open.
document.addEventListener('keydown',e=>{
  if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey||e.isComposing||String(e.key).toLowerCase()!=='n')return;
  const target=e.target;
  if(target?.isContentEditable||/^(INPUT|SELECT|TEXTAREA)$/.test(target?.tagName||'')||document.querySelector('dialog[open]')||$('#quick-add-button').hidden)return;
  e.preventDefault();openTask();
});

$('#settings-data-button').addEventListener('click',()=>{storageNotice('');showDialog(dataDialog);});
$('#core-health-button').addEventListener('click',async()=>{
  const button=$('#core-health-button');button.disabled=true;
  try{
    const report=await service.health(),labels={current:'recente',stale:'antiga',future:'futura',unavailable:'indisponível'},records={invalid:'registro armazenado inválido',incompatible:'registro armazenado incompatível'};
    $('#core-health-status').textContent='D1: '+(report.storage==='ok'?'disponível':'indisponível')+(report.state_record?' · tarefas: '+records[report.state_record]:'')+' · '+Object.entries(report.snapshots).map(([name,source])=>name+': '+labels[source.status]+(source.record_status?' ('+records[source.record_status]+')':'')+(source.input_status==='rejected'?' (entrada recusada)':'')).join(' · ')+' · Verificado em '+updateDate(report.checked_at)+'.';
  }catch{$('#core-health-status').textContent='Não foi possível verificar o Core. Isso não confirma perda de dados nem falha dos conectores.';}
  finally{button.disabled=false;}
});
// Google Calendar task sync. Status always comes from the server; the form only proposes settings.
function calendarActive(){return !!CS&&CS.active(calendarStatus);}
function calendarBadge(id){
  const view=CS?.badge(calendarStatus,id);
  return view?`<span class="sync-badge ${html(view.tone)}">${CALENDAR_ICON}${html(view.label)}</span>`:'';
}
function calendarNotice(message){const node=$('#calendar-sync-alert');node.textContent=message;node.hidden=!message;}
function renderCalendarSync(){
  if(!CS)return;
  const view=CS.summary(calendarStatus,updateDate),node=$('#calendar-sync-status');
  const primary=calendarStatus?.warnings.includes('primary_calendar_shared_with_agenda')?' Atenção: o calendário principal também é lido pela rotina da agenda; prefira um calendário só para tarefas.':'';
  node.textContent=view.text+primary;node.className='calendar-sync-status'+(view.tone?' '+view.tone:'');
  const form=$('#calendar-sync-form');form.hidden=!calendarStatus;
  if(calendarStatus&&!calendarFormDirty){
    const s=calendarStatus.settings,e=form.elements;
    e.enabled.checked=s.enabled;e.calendar_id.value=s.calendar_id||'';e.default_mode.value=s.default_mode;e.untimed.value=s.untimed;e.completed.value=s.completed;e.removal.value=s.removal;e.duration_minutes.value=String(s.duration_minutes);
  }
  const run=$('#calendar-sync-run');run.hidden=!calendarActive();run.disabled=calendarRunning||!!calendarStatus?.busy;
  const list=$('#calendar-sync-issues'),markup=CS.issues(calendarStatus).map((issue,index)=>`<article class="import-conflict calendar-issue" aria-labelledby="calendar-issue-title-${index}"><p id="calendar-issue-title-${index}"><strong>${html(service.task(issue.task_id)?.title||'Tarefa não encontrada')}</strong></p><p id="calendar-issue-text-${index}">${html(issue.text)}</p><div class="choice-actions">${issue.actions.map(action=>`<button type="button" data-calendar-choice="${html(action.choice)}" data-task-id="${html(issue.task_id)}" aria-describedby="calendar-issue-title-${index} calendar-issue-text-${index}">${html(action.label)}</button>`).join('')}</div></article>`).join('');
  // Unchanged markup is left alone (focus stays put); a re-render never drops keyboard focus on a removed node.
  if(list.innerHTML===markup)return;
  const active=document.activeElement,inside=!!active&&typeof list.contains==='function'&&list.contains(active);
  list.innerHTML=markup;
  if(inside)focusCalendarIssues(active.dataset?.taskId);
}
// Keeps keyboard focus on the same task's action, the next pending item, or the section heading.
function focusCalendarIssues(taskId){
  const buttons=[...($('#calendar-sync-issues').querySelectorAll?.('button[data-calendar-choice]')||[])];
  const target=buttons.find(b=>b.dataset.taskId===taskId)||buttons[0]||$('#calendar-sync-title');
  target.focus();
}
async function loadCalendarSync(){
  if(!calendarClient)return;
  try{calendarStatus=await calendarClient.status();}
  catch{if(!calendarStatus){$('#calendar-sync-status').textContent='Não foi possível ler o estado da integração com o Google Agenda nesta sessão.';return;}}
  renderCalendarSync();render();
}
function scheduleCalendarSync(delay=1500){
  if(!calendarActive())return;
  clearTimeout(calendarTimer);calendarTimer=setTimeout(()=>runCalendarSync(),delay);
}
async function runCalendarSync({manual=false}={}){
  if(!calendarActive()||document.hidden&&!manual)return;
  if(calendarRunning||calendarModeSaving){scheduleCalendarSync(3000);return;}
  calendarRunning=true;calendarLastRun=Date.now();renderCalendarSync();
  try{
    const result=await calendarClient.run();
    // Without a confirmed status (D1 could not be read back) the previous view stays and is re-read; nothing
    // unconfirmed is shown as success.
    if(result.status_detail)calendarStatus=result.status_detail;
    // Remote edits were written to D1: reload tasks through the normal state path.
    if(result.remote_applied)await refreshCloud();
    calendarNotice(['error','uncertain'].includes(result.status)?CS.errorText(result.code):'');
    calendarBusyRetries=0;
    // Bounded continuation of a backlog (remaining) or of an unfinished listing (incomplete); failures wait for
    // their own retry time, and only while the panel stays open (no background job).
    calendarChain=result.status==='partial'&&(result.remaining||result.incomplete)&&calendarChain<5?calendarChain+1:0;
    if(calendarChain)scheduleCalendarSync(5000);
    else if(result.status==='uncertain'||!result.status_detail)loadCalendarSync();
    else scheduleBackoffWakeup();
    if(manual)announce(result.status==='uncertain'?'Resultado da sincronização não confirmado. A próxima execução confere o Google antes de repetir.':'Sincronização com o Google Agenda concluída.');
  }catch(error){
    // Another tab is syncing: try again shortly, a bounded number of times.
    if(error.code==='calendar_sync_busy'&&!manual){if(calendarBusyRetries++<3)scheduleCalendarSync(15000);}
    else calendarNotice(error.message);
  }
  finally{calendarRunning=false;renderCalendarSync();render();}
}
// One-shot wake-up when the earliest per-task retry delay expires while the panel is open (bounded per page load).
function scheduleBackoffWakeup(){
  const due=(calendarStatus?.entries||[]).filter(e=>e.state==='error'&&e.retry_at).map(e=>Date.parse(e.retry_at)-Date.now()).filter(Number.isFinite);
  if(!due.length||calendarWakeups>=5)return;
  const delay=Math.max(1000,Math.min(...due)+1000);
  if(delay>15*60000)return;
  calendarWakeups++;scheduleCalendarSync(delay);
}
// Stores the per-task preference and returns true only when the server holds the person's current choice `mode`.
// The comparison is never with the value the dialog opened with, but with `editingCalendarMode`: what this dialog
// session KNOWS the server holds — the opening value, then every value the server confirmed (kept when the task save
// fails afterwards, so returning to the opening value is written too), then a value changed elsewhere once the person
// has been told. A refused or unknown write (409, busy, lost response, 5xx) is settled by re-reading the server:
// - the wanted value is stored: confirmed (our write landed, or someone chose the same) — no second write;
// - the known value is still stored: the change happened elsewhere in the record; the same decision is sent again;
// - any other value: someone else decided meanwhile — never overwritten; the draft stays and only a new, explicit
//   save (which now starts from that value) can change it. An unreadable state stops without another write.
// Unknown outcome: when a write failed in a way that may have been applied and the re-read failed too, the task is
// recorded in calendarModeUncertain (memory of this page only, across dialogs). Until a later re-read succeeds, the
// cached value proves nothing: every save of that task re-reads the server FIRST; the value found is accepted as the
// starting point only if it is the known one or the one we tried to write, otherwise it is a change made elsewhere.
const calendarModeUncertain=new Map();
async function ensureTaskCalendarMode(id,mode,draft){
  if(!calendarActive())return true;
  const stored=()=>calendarStatus?.entries.find(x=>x.task_id===id)?.mode||'inherit';
  const form=$('#task-form'),changed=value=>Object.assign(Error(''),{code:'calendar_mode_changed',mode:value});
  const unreadable=()=>Object.assign(Error('Não foi possível reler o estado da integração.'),{code:'unconfirmed'});
  calendarModeSaving=true;clearTimeout(calendarTimer);
  try{
    if(calendarModeUncertain.has(id)){
      try{calendarStatus=await calendarClient.status();}catch{throw unreadable();}
      const attempted=calendarModeUncertain.get(id),found=stored();
      calendarModeUncertain.delete(id);
      if(found!==editingCalendarMode&&found!==attempted)throw changed(found);
      editingCalendarMode=found;
    }
    const current=stored(),known=editingCalendarMode;
    if(current===mode){editingCalendarMode=mode;return true;}
    if(current!==known)throw changed(current);
    for(let attempt=0;attempt<4;attempt++){
      try{calendarStatus=await calendarClient.setTaskMode(calendarStatus.revision,id,mode,{draft});editingCalendarMode=mode;return true;}
      catch(error){
        if(!['calendar_sync_revision_conflict','calendar_sync_busy','calendar_sync_result_uncertain','offline','invalid_response'].includes(error.code)&&!(error.status>=500))throw error;
        if(error.code==='calendar_sync_busy')await new Promise(resolve=>setTimeout(resolve,2500));
        try{calendarStatus=await calendarClient.status();}
        catch{calendarModeUncertain.set(id,mode);throw unreadable();}
        const now=stored();
        if(now===mode){editingCalendarMode=mode;return true;}
        if(now!==known)throw changed(now);
      }
    }
    throw Object.assign(Error('O servidor não confirmou a escolha.'),{code:'unconfirmed'});
  }catch(error){
    if(error.code==='calendar_mode_changed'){
      // The person has now seen the other decision: a new save starts from it.
      editingCalendarMode=error.mode;
      storageNotice('A preferência do Google Agenda desta tarefa foi alterada em outra aba ou dispositivo para “'+CALENDAR_MODE_LABELS[error.mode]+'”. Nada foi salvo e seu rascunho foi preservado. Confira a escolha e salve novamente para aplicá-la.');
    }else storageNotice('A preferência do Google Agenda não foi confirmada, então a tarefa não foi salva. Seu rascunho foi preservado. '+error.message);
    form.elements.calendar?.focus();
    return false;
  }finally{calendarModeSaving=false;renderCalendarSync();}
}

// Startup: presentation first, then confirmed state and snapshots.
renderProfile();
renderModuleNavigation();
document.querySelectorAll('.mobile-nav-item').forEach(link=>{const module=M.resolve(link.getAttribute('href').slice(1));link.innerHTML=moduleIcon(module.id)+'<span>'+html(module.label.split(' / ')[0])+'</span>';});
document.querySelectorAll('.nav-item,.mobile-nav-item').forEach(link=>link.addEventListener('click',()=>setActiveNav(link.getAttribute('href').slice(1))));
globalThis.addEventListener('hashchange',activateRoute);
let navFrame=false;
globalThis.addEventListener('scroll',()=>{
  if(navFrame)return;navFrame=true;
  requestAnimationFrame(()=>{
    navFrame=false;
    if(app.module!=='hoje')return;
    setActiveNav(app.module);
  });
},{passive:true});
setActiveNav(globalThis.location?.hash.slice(1)||'visao');
render();
legacyNotice();refreshCloud();setInterval(()=>{if(!document.hidden)refreshCloud();},30000);
renderJobs();
refreshDueSnapshots();setInterval(refreshDueSnapshots,60*1000);
activateRoute();
setInterval(refreshView,60*1000);
if(CS){
  const form=$('#calendar-sync-form');
  form.addEventListener('input',()=>{calendarFormDirty=true;});
  form.addEventListener('submit',async ev=>{
    ev.preventDefault();if(!calendarStatus||!form.reportValidity())return;
    const e=form.elements,button=$('#calendar-sync-save');
    const settings={enabled:e.enabled.checked,calendar_id:e.calendar_id.value.trim()||null,default_mode:e.default_mode.value,untimed:e.untimed.value,completed:e.completed.value,removal:e.removal.value,duration_minutes:Number(e.duration_minutes.value)};
    if(settings.enabled&&!settings.calendar_id){calendarNotice('Informe o ID do calendário de destino para ativar a sincronização.');e.calendar_id.focus();return;}
    button.disabled=true;
    try{calendarStatus=await calendarClient.saveSettings(calendarStatus.revision,settings);calendarFormDirty=false;calendarNotice('');announce('Configuração do Google Agenda salva.');scheduleCalendarSync(0);}
    catch(error){if(error.code==='calendar_sync_revision_conflict'){calendarFormDirty=false;await loadCalendarSync();}calendarNotice(error.message);}
    finally{button.disabled=false;renderCalendarSync();render();}
  });
  $('#calendar-sync-run').addEventListener('click',()=>runCalendarSync({manual:true}));
  $('#calendar-sync-issues').addEventListener('click',async ev=>{
    const button=ev.target.closest('button[data-calendar-choice]');if(!button||button.disabled||!calendarStatus)return;
    button.disabled=true;const choice=button.dataset.calendarChoice,taskId=button.dataset.taskId;
    try{calendarStatus=await calendarClient.resolve(calendarStatus.revision,taskId,choice);calendarNotice('');announce('Pendência do Google Agenda atualizada.');if(choice==='remote')await refreshCloud();scheduleCalendarSync(0);}
    catch(error){calendarNotice(error.message);await loadCalendarSync();}
    finally{renderCalendarSync();render();focusCalendarIssues(taskId);}
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&calendarActive()&&Date.now()-calendarLastRun>10*60000)scheduleCalendarSync(1000);});
  loadCalendarSync().then(()=>scheduleCalendarSync(2000));
}else{
  // The optional script did not load: say so instead of "Verificando…" forever. Tasks keep working as before.
  $('#calendar-sync-status').textContent='A integração com o Google Agenda não está disponível nesta versão do painel. As tarefas continuam funcionando normalmente.';
}

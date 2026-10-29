// Agenda publicada em acesso privado; tarefas e conclusões são confirmadas pelo servidor.
const P=globalThis.LuanPlanning;
const profile=globalThis.DashboardProfile;
const ZONE=P.ZONE;
const M=globalThis.LuanModules;
const automationPlan=globalThis.LuanAutomationPlan;
let jobsRead=null;
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
    else if(old)add('Vagas: registro antigo, de '+updateDate(captured)+'. Confira os alertas na origem.');
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
}
// The day as one line: only known HH:MM times of today, plus "now". No duration or availability is implied.
const timed=item=>!item.timeLabel&&/^\d\d:\d\d$/.test(item.time||'');
const minutesOf=time=>Number(time.slice(0,2))*60+Number(time.slice(3,5));
function renderDayLine(all){
  const node=$('#day-line');
  if(app.module!=='hoje'){node.hidden=true;return;}
  node.hidden=false;
  const now=clockNow(),nowMin=minutesOf(now);
  const todays=all.filter(item=>effective(item)===today&&filtered(item)&&timed(item)).sort(sortItems);
  const start=Math.min(6,Math.floor(Math.min(nowMin,...todays.map(item=>minutesOf(item.time)))/180)*3),span=(24-start)*60;
  const at=minutes=>(Math.max(0,Math.min(1,(minutes-start*60)/span))*100).toFixed(2)+'%';
  let marks='';
  for(let hour=start;hour<=24;hour+=3)marks+=`<text class="dl-hour" x="${at(hour*60)}" y="52" text-anchor="${hour===start?'start':hour===24?'end':'middle'}">${hour}h</text>`;
  for(const item of todays){
    const deadline=['deadline','exam'].includes(item.kind),cls='dl-item'+(isDone(item)?' is-done':'')+(deadline?' is-deadline':'');
    marks+=deadline?`<svg x="${at(minutesOf(item.time))}" y="26" width="1" height="1" overflow="visible"><rect class="${cls}" x="-4.5" y="-4.5" width="9" height="9" transform="rotate(45)"></rect></svg>`:`<circle class="${cls}" cx="${at(minutesOf(item.time))}" cy="26" r="5"></circle>`;
  }
  const nowAt=at(nowMin),ratio=parseFloat(nowAt),anchor=ratio<8?'start':ratio>92?'end':'middle';
  const line=`<svg aria-hidden="true" focusable="false"><line class="dl-track" x1="0" y1="26" x2="100%" y2="26"></line><line class="dl-past" x1="0" y1="26" x2="${nowAt}" y2="26"></line>${marks}<svg x="${nowAt}" y="26" width="1" height="1" overflow="visible"><circle class="dl-now" r="8"></circle><circle class="dl-now-cut" cx="3.6" cy="-3.4" r="6.4"></circle></svg><text class="dl-now-label" x="${nowAt}" y="9" text-anchor="${anchor}">Agora ${now}</text></svg>`;
  const next=todays.find(item=>!isDone(item)&&minutesOf(item.time)>=nowMin);
  let caption=next?`Próximo às ${next.time}: ${next.title}.`:todays.length?'Nenhum outro horário marcado para hoje.':'Sem horários marcados para hoje.';
  if(agendaLoading())caption+=' Carregando a agenda…';
  else if(service.failed('agenda')&&!viewData.agenda)caption+=' Agenda indisponível nesta sessão; aparecem só tarefas do painel.';
  else if(!coveredDate(today))caption+=' Sem cobertura da agenda para hoje; aparecem só tarefas do painel.';
  paint(node,line+`<p class="day-line-caption">${html(caption)}</p>`);
}
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
    $('#jobs-disclosure').open=module.id==='carreira';
    $('#updates-disclosure').open=!home;
    disclosureModule=module.id;
  }
  $('#quick-add-button').hidden=module.defaultArea===null;$('#fab-add').hidden=module.defaultArea===null;
  const overdue=view.overdue,notice=$('#overdue-notice');
  notice.hidden=!home||!overdue?.length;
  paint(notice,overdue?.length?`${ICON.alert}<span>${overdue.length} tarefa(s) pessoal(is) com data anterior a hoje. Confira antes de concluir ou reagendar.</span><button type="button" class="text-link" data-focus-key="overdue" data-overdue-date="${html(effective(overdue[0]))}">Ver desde ${html(dateShort(effective(overdue[0])))}</button>`:'');
}
function enterContent(){
  if(reducedMotion())return;
  $('.content').animate?.([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:200,easing:'cubic-bezier(.2,.7,.2,1)'});
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
// Navigation groups are presentation only; a module missing from them still gets a link under "Frentes".
const NAV_GROUPS=[{label:'',ids:['hoje']},{label:'Frentes',ids:['academico','carreira','projetos','financas','fitness']},{label:'Sistema',ids:['agentes','configuracoes']}];
function navMarkup(prefix){
  const grouped=new Set(NAV_GROUPS.flatMap(group=>group.ids)),extra=M.modules.map(module=>module.id).filter(id=>!grouped.has(id));
  const groups=NAV_GROUPS.map(group=>group.label==='Frentes'?{...group,ids:[...group.ids,...extra]}:group);
  return groups.map((group,index)=>{
    const links=group.ids.map(id=>M.modules.find(module=>module.id===id)).filter(Boolean).map(module=>'<a class="nav-item" data-module="'+module.id+'" href="#'+module.id+'">'+moduleIcon(module.id)+'<span class="nav-label">'+html(module.label)+'</span></a>').join('');
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
function openTask(task=null){
  const f=$('#task-form');f.reset();editingBase=task?structuredClone(task):null;draftTaskId=null;
  for(const key of ['title','date','time','area','priority'])f.elements[key].value=task?.[key]||(key==='date'?(app.view==='week'&&app.horizon!=='later'?app.weekDay||app.start:app.start):key==='area'?(M.resolve(app.module).defaultArea||'pessoal'):key==='priority'?'high':'');
  $('#task-dialog-title').textContent=task?'Editar tarefa':'Nova tarefa';$('#task-submit').textContent=task?'Salvar alterações':'Adicionar tarefa';
  $('#task-calendar-field').hidden=!calendarActive();
  editingCalendarMode=(task&&calendarStatus?.entries.find(x=>x.task_id===task.id)?.mode)||'inherit';
  if(calendarActive()&&f.elements.calendar)f.elements.calendar.value=editingCalendarMode;
  syncQuickDates();
  storageNotice('');showDialog(dialog);f.elements.title.focus();
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
$('#task-form').addEventListener('submit',async ev=>{
  ev.preventDefault();const f=ev.target;if(!f.reportValidity())return;
  const data=new FormData(f),base=editingBase,title=String(data.get('title')).trim();if(!title)return;
  let id;try{id=base?.id||(draftTaskId??=taskId());}catch(error){storageNotice(error.message);return;}
  const task={...(base||{}),id,title,date:String(data.get('date')),time:String(data.get('time')),kind:'task',priority:String(data.get('priority')),area:String(data.get('area')),detail:base?base.detail:AREA_NAMES[String(data.get('area'))],source:base?.source||'Tarefa · criada por você'};
  const button=$('#task-submit');button.disabled=true;
  // The Google Agenda preference is confirmed by the server BEFORE the task is written, so no run (in any tab)
  // can sync the task under a preference that was not stored. If it cannot be confirmed, nothing is saved.
  const calendarMode=calendarActive()&&f.elements.calendar?String(f.elements.calendar.value):null;
  if(calendarMode&&!await ensureTaskCalendarMode(id,calendarMode,!base)){button.disabled=false;return;}
  if(await save(current=>base?service.edit(current,base,task):service.insert(current,task))){app.start=task.date;app.view='day';app.horizon=task.date===today?'today':null;f.reset();focusAfterSave='toggle:'+task.id;dialog.close();render();announce(base?'Tarefa atualizada.':'Tarefa adicionada.');}
  button.disabled=false;
});
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
function refreshDueSnapshots(){return Promise.all(Object.keys(snapshotLoaders).map(name=>refreshSnapshot(name)));}
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
function updatesMarkup(){return workspace.view(app.module).streams.map(updateMarkup).join('')||'<div class="updates-empty">Nenhum resumo específico desta área.</div>';}
function updateMarkup(item){
  const tone=item.status==='attention'?'attention':item.status==='pending'?'pending':'current';
  const future=P.freshness(item.updated_at)==='future';
  const status=future?'Data a conferir':oldRecord(item.updated_at)?'Registro antigo':tone==='attention'?'Requer atenção':tone==='pending'?'Pendente':'Atualizado';
  const badgeTone=future||oldRecord(item.updated_at)?'pending':tone;
  const next=item.next_step?'<div class="update-field"><span class="update-field-label">Próxima ação</span><p>'+html(item.next_step)+'</p></div>':'';
  return '<details class="update" data-stream="'+html(item.id)+'"'+(openStreams.has(item.id)?' open':'')+'><summary data-focus-key="stream:'+html(item.id)+'"><span class="update-label">'+html(item.label)+'</span><span class="update-status '+badgeTone+'"><span class="update-dot '+badgeTone+'" aria-hidden="true"></span>'+status+'</span><strong class="update-headline">'+html(item.headline)+'</strong></summary><div class="update-body"><div class="update-field"><span class="update-field-label">Situação</span><p>'+html(item.summary)+'</p></div>'+next+'<p class="update-meta"><span>Último registro <time datetime="'+html(item.updated_at)+'">'+html(updateDate(item.updated_at))+'</time></span><span>'+html(snapshotAge(item.updated_at))+'</span></p></div></details>';
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
  return `<article class="job-item"><div class="job-top"><span class="job-fit ${html(job.fit)}">${job.fit==='alta'?'Alta compatibilidade':'Compatibilidade média'}</span><span class="job-alerted">Alerta de ${html(jobAlertDate(job.alerted_at))}</span></div><h3>${html(job.title)}</h3><p class="job-company">${html(job.company)} <span aria-hidden="true">·</span> ${html(job.location)}</p><div class="job-reason"><span class="update-field-label">Por que combina</span><p>${html(job.reason)}</p></div><a class="job-link" href="${html(job.url)}" target="_blank" rel="noopener noreferrer" data-focus-key="job:${html(job.id)}" aria-label="Abrir vaga ${html(job.title)} em nova aba">Ver vaga${ICON.external}</a></article>`;
}
function renderJobs(){
  const stamp=$('#jobs-stamp'),stateNode=$('#jobs-state'),list=$('#jobs-list');
  if(!viewData.jobs){stamp.textContent=service.failed('jobs')?'Captura indisponível':'Carregando vagas…';stateNode.textContent=service.failed('jobs')?'Leitura indisponível':'Carregando';stateNode.classList.toggle('attention',service.failed('jobs'));paint(list,service.failed('jobs')?'<div class="jobs-empty"><strong>Não foi possível ler as vagas.</strong><span>Tente reler mais tarde. Nenhuma vaga foi descartada.</span></div>':'<p class="jobs-empty">Carregando oportunidades…</p>');return;}
  const old=oldRecord(viewData.jobs.captured_at),future=Date.parse(viewData.jobs.captured_at)>Date.now();
  stamp.textContent=(service.failed('jobs')?'Última captura válida desta sessão: ':'Captura: ')+updateDate(viewData.jobs.captured_at)+' · Fonte: '+viewData.jobs.source;
  stateNode.textContent=service.failed('jobs')?'Leitura indisponível'+(old?' · registro antigo':''):old?'Registro antigo':future?'Data da captura a conferir':'Registro recente';
  stateNode.classList.toggle('attention',service.failed('jobs')||old||future);
  paint(list,viewData.jobs.items.length?viewData.jobs.items.map(jobMarkup).join(''):'<div class="jobs-empty"><strong>Nenhuma vaga neste registro.</strong><span>Confira novamente após a próxima captura.</span></div>');
}
function loadJobs(){
  if(jobsRead)return jobsRead;$('#jobs-reload').disabled=true;
  jobsRead=(async()=>{
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
function renderPendingJobs(candidates){
  $('#jobs-pending').hidden=!candidates.length;
  paint($('#jobs-pending-list'),candidates.map(job=>`<article class="job-item pending"><p class="job-pending-label">Confirmação oficial pendente</p><h3>${html(job.title)}</h3><p class="job-company">${html(job.company)} · ${html(job.location)}</p><p>${html(job.reason)}</p><a class="job-link" href="${html(job.url)}" target="_blank" rel="noopener noreferrer" data-focus-key="pending:${html(job.id)}">Conferir anúncio${ICON.external}</a></article>`).join(''));
}
async function showJobSearchResult(result){
  if(jobsRead)await jobsRead;
  await loadJobs();
  const count=result.counts;
  $('#jobs-search-status').textContent=(result.status==='updated'?'Vagas atualizadas. ':'Sem novidades na captura salva. ')+count.messages+' mensagens lidas / '+count.confirmed+' confirmadas / '+count.pending+' pendentes.'+(result.source_complete?' Consulta dos alertas concluída em '+updateDate(result.checked_at)+'.':'')+(!result.official_complete?' Confirmação oficial incompleta.':'')+(result.warnings.includes('jobs_search_candidates_limited')?' O limite de verificação foi atingido; apenas parte dos candidatos elegíveis foi verificada.':'')+(count.pending>0&&!result.pending_candidates?.length?' Os detalhes das oportunidades pendentes não foram retidos nesta resposta.':'')+(result.warnings.length?' A consulta contém ressalvas; confira as oportunidades antes de decidir.':'')+(service.failed('jobs')?' Não foi possível reler a captura atualizada. A última captura válida foi mantida.':'');
  renderPendingJobs(result.pending_candidates||[]);
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
  }finally{jobSearchRunning=false;$('#jobs-retry').disabled=false;$('#jobs-retry').removeAttribute('aria-busy');}
}
$('#jobs-gmail-authorize').hidden=true;$('#jobs-gmail-consent').hidden=true;$('#jobs-pending').hidden=true;
$('#jobs-retry').addEventListener('click',searchJobsManually);
$('#jobs-reload').addEventListener('click',()=>refreshSnapshot('jobs',{force:true}));
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

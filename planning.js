(function(root){
  'use strict';
  const ZONE='America/Sao_Paulo',OLD_RECORD_MS=26*60*60*1000;
  const day=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const addDays=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  const oldRecord=(value,now=Date.now())=>now-Date.parse(value)>OLD_RECORD_MS;
  const freshness=(value,now=Date.now())=>Date.parse(value)>now?'future':oldRecord(value,now)?'stale':'current';
  // The calendar import stores a deadline due at 00:00 on the day before it is due, with
  // timeLabel "DD/MM 00h" naming the real day (scripts/build-agenda.mjs). Only that exact shape
  // is projected onto the labelled day; any other timeLabel keeps its stored date. Persisted
  // IDs, dates and completion are never changed.
  const MIDNIGHT_LABEL=/^(\d{2})\/(\d{2}) 00h$/;
  function effectiveDate(item){
    const date=item?.date,label=item?.kind==='deadline'&&item.time==='00:00'&&typeof item.timeLabel==='string'&&MIDNIGHT_LABEL.exec(item.timeLabel);
    if(!label||typeof date!=='string')return date;
    const next=new Date(date+'T12:00:00Z');if(Number.isNaN(next.getTime()))return date;
    next.setUTCDate(next.getUTCDate()+1);const iso=next.toISOString().slice(0,10);
    return iso.slice(8,10)===label[1]&&iso.slice(5,7)===label[2]?iso:date;
  }
  const inRange=(item,from,to)=>{const date=effectiveDate(item);return date>=from&&date<=to;};
  const sortTime=item=>effectiveDate(item)!==item.date?'00:00':item.timeLabel?'24:00':item.time||'25:00';
  const sortItems=(a,b)=>effectiveDate(a).localeCompare(effectiveDate(b))||sortTime(a).localeCompare(sortTime(b))||a.title.localeCompare(b.title);
  function items(agenda,state){
    // The calendar owns IDs from its source. A legacy colliding task stays in D1,
    // but cannot render a second row with the same completion checkbox ID.
    const out=new Map((agenda?.items||[]).map(item=>[item.id,item]));
    for(const item of state.tasks)if(!state.deleted.includes(item.id)&&!out.has(item.id))out.set(item.id,item);
    return [...out.values()];
  }
  const covered=(agenda,date)=>!!agenda&&date>=agenda.window_start&&date<=agenda.window_end;
  // Presentation horizon, not source coverage: it also reaches the effective day of known items, so a
  // deadline stored on the last covered day but due the next one is still listed and counted.
  const planningEnd=(today,agenda,state)=>[today,agenda?.window_end||today,...(agenda?.items||[]).map(effectiveDate),...state.tasks.map(effectiveDate)].sort().at(-1);
  function dailyFocus(updates,failed=false,now=Date.now()){
    const briefing=updates?.streams.find(item=>item.id==='briefing');
    const current=!!briefing&&!failed&&freshness(briefing.updated_at,now)==='current'&&day(new Date(briefing.updated_at))===day(new Date(now))&&!!briefing.next_step;
    return {briefing,current};
  }
  function rejectAgendaCollision(incoming,agenda){
    const ids=new Set((agenda?.items||[]).map(x=>x.id));
    if(incoming.tasks.some(x=>ids.has(x.id)))throw Error('Conflito de ID com a agenda.');
  }
  root.LuanPlanning={ZONE,OLD_RECORD_MS,day,addDays,oldRecord,freshness,effectiveDate,inRange,sortItems,items,covered,planningEnd,dailyFocus,rejectAgendaCollision};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.LuanPlanning;
})(globalThis);

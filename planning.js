(function(root){
  'use strict';
  const ZONE='America/Sao_Paulo',OLD_RECORD_MS=26*60*60*1000;
  const day=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const addDays=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  const oldRecord=(value,now=Date.now())=>now-Date.parse(value)>OLD_RECORD_MS;
  const freshness=(value,now=Date.now())=>Date.parse(value)>now?'future':oldRecord(value,now)?'stale':'current';
  const sortItems=(a,b)=>a.date.localeCompare(b.date)||(a.timeLabel?'24:00':a.time||'25:00').localeCompare(b.timeLabel?'24:00':b.time||'25:00')||a.title.localeCompare(b.title);
  function items(agenda,state){
    // The calendar owns IDs from its source. A legacy colliding task stays in D1,
    // but cannot render a second row with the same completion checkbox ID.
    const out=new Map((agenda?.items||[]).map(item=>[item.id,item]));
    for(const item of state.tasks)if(!state.deleted.includes(item.id)&&!out.has(item.id))out.set(item.id,item);
    return [...out.values()];
  }
  const covered=(agenda,date)=>!!agenda&&date>=agenda.window_start&&date<=agenda.window_end;
  const planningEnd=(today,agenda,state)=>[today,agenda?.window_end||today,...state.tasks.map(x=>x.date)].sort().at(-1);
  function dailyFocus(updates,failed=false,now=Date.now()){
    const briefing=updates?.streams.find(item=>item.id==='briefing');
    const current=!!briefing&&!failed&&freshness(briefing.updated_at,now)==='current'&&day(new Date(briefing.updated_at))===day(new Date(now))&&!!briefing.next_step;
    return {briefing,current};
  }
  function rejectAgendaCollision(incoming,agenda){
    const ids=new Set((agenda?.items||[]).map(x=>x.id));
    if(incoming.tasks.some(x=>ids.has(x.id)))throw Error('Conflito de ID com a agenda.');
  }
  root.LuanPlanning={ZONE,OLD_RECORD_MS,day,addDays,oldRecord,freshness,sortItems,items,covered,planningEnd,dailyFocus,rejectAgendaCollision};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.LuanPlanning;
})(globalThis);

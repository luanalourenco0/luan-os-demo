(function(root){
  'use strict';
  const P=root.LuanPlanning||(typeof require==='function'&&require('./planning.js'));
  const M=root.LuanModules||(typeof require==='function'&&require('../config/modules.js'));
  const accepts=(id,item)=>{const module=M.resolve(id);return module.areas===null||module.areas.includes(item.area);};
  function moduleItems(id,items){return items.filter(item=>accepts(id,item));}
  function moduleStreams(id,updates){
    const module=M.resolve(id);
    return (updates?.streams||[]).filter(stream=>module.streams===null||module.streams.includes(stream.id));
  }
  function view({id='hoje',state,agenda,updates,jobs,loaded=true,failed={}},now=Date.now()){
    const today=P.day(new Date(now)),all=P.items(agenda,state);
    const sources=Object.fromEntries(['agenda','updates','jobs'].map(name=>{
      const data={agenda,updates,jobs}[name],recordedAt=data?.captured_at||data?.updated_at||null;
      return [name,{status:failed[name]?'unavailable':data?'available':'unavailable',recorded_at:recordedAt,freshness:recordedAt?P.freshness(recordedAt,now):'unavailable',retained:!!data&&!!failed[name]}];
    }));
    const pending=all.filter(item=>!state.done.includes(item.id));
    return {module:M.resolve(id),date:today,sources,task_status:loaded?'available':'unavailable',
      items:moduleItems(id,all),streams:moduleStreams(id,updates),
      today:pending.filter(item=>P.effectiveDate(item)===today).sort(P.sortItems),
      overdue:loaded?state.tasks.filter(item=>P.effectiveDate(item)<today&&!state.done.includes(item.id)&&!state.deleted.includes(item.id)).sort(P.sortItems):null,
      deadlines:pending.filter(item=>P.effectiveDate(item)>=today&&['deadline','exam'].includes(item.kind)).sort(P.sortItems),
      focus:P.dailyFocus(updates,!!failed.updates,now),jobs:jobs?.items||[],
      coverage:{complete:P.covered(agenda,today),window_start:agenda?.window_start||null,window_end:agenda?.window_end||null}
    };
  }
  root.LuanWorkspace=Object.freeze({accepts,moduleItems,moduleStreams,view});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.LuanWorkspace;
})(globalThis);

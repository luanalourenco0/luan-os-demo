(function(root){
  'use strict';
  const D=root.LuanLocalData||(typeof require==='function'&&require('../core/state.js'));
  const V=root.LuanValidators||(typeof require==='function'&&require('../core/validators.js'));
  const P=root.LuanPlanning||(typeof require==='function'&&require('../core/planning.js'));
  function createService(store,fetcher,{timeoutMs=12000}={}){
    const snapshots={agenda:null,updates:null,jobs:null},failed={agenda:false,updates:false,jobs:false},loading=new Map();
    function read(){return store.read();}
    async function load(name){
      if(!Object.hasOwn(snapshots,name))throw Error('Fonte inválida.');
      if(loading.has(name))return loading.get(name);
      const operation=(async()=>{
        const controller=new AbortController();let timer;
        const timeout=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('A leitura demorou a responder.'));},timeoutMs);});
        try{
          const data=await Promise.race([(async()=>{
            const response=await fetcher('/api/snapshots/'+name,{cache:'no-store',credentials:'same-origin',signal:controller.signal});
            if(!response.ok)throw Error('Leitura indisponível.');
            return V[name](await response.json());
          })(),timeout]);
          snapshots[name]=structuredClone(data);failed[name]=false;return structuredClone(data);
        }catch(error){failed[name]=true;throw error;}
        finally{clearTimeout(timer);loading.delete(name);}
      })();
      loading.set(name,operation);return operation;
    }
    function importReviewed(current,session){
      const proposed=D.merge(session.local,session.incoming,session.resolutions);
      if(!proposed.unresolved.length&&D.fingerprint(current)===D.fingerprint(proposed.data))return current;
      if(D.fingerprint(current)!==session.base)throw Error('Os dados mudaram em outra aba. Selecione o arquivo novamente e revise a importação.');
      P.rejectAgendaCollision(session.incoming,snapshots.agenda);
      const result=D.merge(current,session.incoming,session.resolutions);
      if(result.unresolved.length)throw Error('Resolva todos os conflitos antes de importar.');
      return result.data;
    }
    return {read,refresh:()=>store.refresh(),mutate:reducer=>store.mutate(reducer),load,
      snapshot:name=>snapshots[name]?structuredClone(snapshots[name]):null,
      failed:name=>failed[name],items:()=>P.items(snapshots.agenda,read()),
      isDone:id=>store.hasDone?store.hasDone(id):read().done.includes(id),
      isPersonal:id=>!(snapshots.agenda?.items||[]).some(x=>x.id===id)&&(store.hasTask?store.hasTask(id):read().tasks.some(x=>x.id===id)),
      task:id=>store.task?store.task(id):read().tasks.find(x=>x.id===id),
      importReviewed,
      insert:(current,value)=>{P.rejectAgendaCollision({tasks:[value]},snapshots.agenda);return D.insert(current,value);},
      edit:D.edit,remove:D.remove,mark:D.mark,backup:D.backup,parseBackup:D.parseBackup,merge:D.merge,
      assertImport:incoming=>P.rejectAgendaCollision(incoming,snapshots.agenda),
      get loaded(){return store.loaded;},get revision(){return store.revision;}
    };
  }
  root.LuanPanelService={createService};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.LuanPanelService;
})(globalThis);

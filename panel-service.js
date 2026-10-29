(function(root){
  'use strict';
  const D=root.LuanLocalData||(typeof require==='function'&&require('../core/state.js'));
  const V=root.LuanValidators||(typeof require==='function'&&require('../core/validators.js'));
  const P=root.LuanPlanning||(typeof require==='function'&&require('../core/planning.js'));
  const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const safeText=x=>typeof x==='string'&&x.length>0&&x.length<=10000;
  const operationId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(x);
  const integer=x=>Number.isSafeInteger(x)&&x>=0;
  function valid(ok){if(!ok)throw Object.assign(Error('Resposta inválida da busca.'),{code:'job_search_invalid_response'});}
  function fields(value,required,optional=[]){valid(object(value)&&required.every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>required.includes(k)||optional.includes(k)));}
  function gmail(data){
    fields(data,['configured','connected','reauthorization_required'],['scope','connected_at']);
    valid(['configured','connected','reauthorization_required'].every(k=>typeof data[k]==='boolean'));
    if('scope'in data)valid(safeText(data.scope));if('connected_at'in data)valid(data.connected_at===null||V.timestamp(data.connected_at));return data;
  }
  function summary(data){
    valid(['updated','no_change'].includes(data.status)&&V.timestamp(data.checked_at)&&data.source_complete===true&&typeof data.official_complete==='boolean'&&integer(data.snapshot_revision));
    fields(data.counts,['messages','candidates','confirmed','pending']);valid(Object.values(data.counts).every(integer));
    valid(Array.isArray(data.warnings)&&data.warnings.length<=100&&data.warnings.every(x=>typeof x==='string'&&/^[a-z0-9_]{1,100}$/.test(x)));
  }
  function searchResult(data,id){
    if(data?.status==='running'){fields(data,['operation_id','status']);valid(data.operation_id===id);return data;}
    fields(data,['operation_id','status','checked_at','counts','warnings','source_complete','official_complete','snapshot_revision','pending_candidates'],['reconciled']);
    valid(data.operation_id===id&&(!('reconciled'in data)||typeof data.reconciled==='boolean'));summary(data);
    valid(Array.isArray(data.pending_candidates)&&data.pending_candidates.length<=100);
    const ids=new Set();for(const candidate of data.pending_candidates){
      fields(candidate,['id','title','company','location','url','reason']);valid(['title','company','location','reason'].every(k=>safeText(candidate[k]))&&typeof candidate.id==='string'&&/^\d+$/.test(candidate.id)&&candidate.url==='https://www.linkedin.com/jobs/view/'+candidate.id+'/'&&!ids.has(candidate.id));ids.add(candidate.id);
    }return data;
  }
  function searchStatus(data,id){
    fields(data,['gmail','preferences_configured','busy','operation']);gmail(data.gmail);valid(typeof data.preferences_configured==='boolean'&&typeof data.busy==='boolean');
    if(data.operation!==null){const op=data.operation;fields(op,['operation_id','status','started_at','lease_until','finished_at','summary','error']);
      valid(op.operation_id===id&&['running','completed','failed','uncertain'].includes(op.status)&&V.timestamp(op.started_at)&&(op.lease_until===null||V.timestamp(op.lease_until))&&(op.finished_at===null||V.timestamp(op.finished_at))&&(op.error===null||typeof op.error==='string'&&/^[a-z0-9_]{1,100}$/.test(op.error)));
      if(op.summary!==null){fields(op.summary,['status','checked_at','snapshot_revision','counts','warnings','source_complete','official_complete']);summary(op.summary);}
    }return data;
  }
  function authorization(data){
    fields(data,['authorization_url','expires_at']);valid(typeof data.authorization_url==='string'&&data.authorization_url.length<=10000&&V.timestamp(data.expires_at));
    let url;try{url=new URL(data.authorization_url);}catch{valid(false);}
    valid(url.protocol==='https:'&&url.hostname==='accounts.google.com'&&url.pathname==='/o/oauth2/v2/auth'&&!url.port&&!url.username&&!url.password&&!url.hash);return data;
  }
  function createService(store,fetcher,{timeoutMs=12000,jobSearchTimeoutMs=60000}={}){
    const snapshots={agenda:null,updates:null,jobs:null},failed={agenda:false,updates:false,jobs:false},loading=new Map();
    function read(){return store.read();}
    async function jobRequest(path,{body,validate,timeout=timeoutMs,uncertain=false}={}){
      const controller=new AbortController();let timer;
      try{
        const response=await Promise.race([(async()=>{
          const response=await fetcher(path,{method:body===undefined?'GET':'POST',cache:'no-store',credentials:'same-origin',signal:controller.signal,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
          const data=await response.json();
          if(!response.ok){
            const code=object(data)&&Object.keys(data).length===1&&typeof data.error==='string'&&/^[a-z0-9_]{1,100}$/.test(data.error)?data.error:'job_search_unavailable';
            const retry=Number(response.headers?.get('Retry-After'));
            throw Object.assign(Error('Não foi possível concluir a consulta.'),{code,retryAfter:Number.isSafeInteger(retry)&&retry>0?Math.min(retry,86400):null,uncertain:uncertain&&['job_search_result_uncertain','job_search_timeout'].includes(code)});
          }
          return validate(data);
        })(),new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(Error('A consulta demorou a responder.'),{code:'job_search_timeout',uncertain}));},timeout);})]);
        return structuredClone(response);
      }catch(error){if(error.code)throw error;throw Object.assign(Error('Não foi possível concluir a consulta.'),{code:'job_search_unavailable',uncertain});}
      finally{clearTimeout(timer);}
    }
    async function searchJobs(input){fields(input,['operation_id']);valid(operationId(input.operation_id));return jobRequest('/api/jobs/search',{body:input,validate:data=>searchResult(data,input.operation_id),timeout:jobSearchTimeoutMs,uncertain:true});}
    async function jobSearchStatus(id){valid(operationId(id));return jobRequest('/api/jobs/search/status?operation_id='+encodeURIComponent(id),{validate:data=>searchStatus(data,id)});}
    async function health(){
      const controller=new AbortController();let timer;
      try{
        const timeout=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('A leitura demorou a responder.'));},timeoutMs);});
        const data=await Promise.race([(async()=>{
          const response=await fetcher('/api/health',{cache:'no-store',credentials:'same-origin',signal:controller.signal});
          if(!response.ok)throw Error('Saúde do Core indisponível.');
          return response.json();
        })(),timeout]);
        if(!data||!['ok','degraded','unavailable'].includes(data.status)||!['ok','unavailable'].includes(data.storage)||!V.timestamp(data.checked_at)||!data.snapshots||typeof data.snapshots!=='object'||Array.isArray(data.snapshots)||('state_record'in data&&!['invalid','incompatible'].includes(data.state_record)))throw Error('Diagnóstico inválido.');
        for(const [name,source]of Object.entries(data.snapshots))if(!['agenda','updates','jobs'].includes(name)||!source||!['current','stale','future','unavailable'].includes(source.status)||('recorded_at'in source&&!V.timestamp(source.recorded_at))||('input_status'in source&&source.input_status!=='rejected')||('record_status'in source&&!['invalid','incompatible'].includes(source.record_status)))throw Error('Diagnóstico inválido.');
        return structuredClone(data);
      }finally{clearTimeout(timer);}
    }
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
    return {read,refresh:()=>store.refresh(),mutate:reducer=>store.mutate(reducer),load,health,searchJobs,jobSearchStatus,
      gmailStatus:()=>jobRequest('/api/gmail/status',{validate:gmail}),
      startGmailAuthorization:()=>jobRequest('/api/gmail/oauth/start',{body:{},validate:authorization}),
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

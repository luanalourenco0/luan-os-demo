(function(root){
  'use strict';
  const D=root.LuanLocalData||(typeof require==='function'&&require('./local-data.js'));
  const messages={401:'Entre novamente no painel para acessar seus dados.',403:'A gravação foi recusada. Reabra o painel no endereço original.',409:'Os dados mudaram em outro dispositivo. Revise a versão atual e tente novamente.',503:'O armazenamento do painel está indisponível.',404:'A sincronização ainda não está configurada neste ambiente.'};
  const storedRecordMessage='O registro salvo no servidor não pôde ser lido (inválido ou incompatível). Nada foi alterado ou apagado; a recuperação exige um procedimento controlado.';
  function createStore(fetcher,notify=()=>{},{timeoutMs=12000}={}){
    let current={revision:0,data:D.empty()},loaded=false,queue=Promise.resolve();
    const read=()=>D.validateState(current.data);
    function accept(value){
      if(!value||!Number.isSafeInteger(value.revision)||value.revision<0)throw Error('Resposta de sincronização inválida.');
      const data=D.validateState(value.data);
      if(!loaded||value.revision>=current.revision){current={revision:value.revision,data};loaded=true;}
      return {revision:current.revision,data:read()};
    }
    async function request(options){
      const writing=options.method==='PUT',controller=new AbortController();let timer;
      const timeout=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();const error=Error('O painel demorou a responder.');error.uncertain=writing;reject(error);},timeoutMs);});
      const operation=async()=>{
        let response;
        try{response=await fetcher('/api/state',{credentials:'same-origin',cache:'no-store',...options,signal:controller.signal});}
        catch{const error=Error('Sem conexão com o painel. Tente novamente quando estiver online.');error.uncertain=writing;throw error;}
        if(!response.ok){
          // A stored record the server cannot read is a data fault: nothing was written, so it is never an uncertain write.
          let code;try{code=(await response.json())?.error;}catch{}
          const stored=typeof code==='string'&&code.startsWith('stored_record_');
          const error=Error(stored?storedRecordMessage:messages[response.status]||'Não foi possível sincronizar os dados.');error.status=response.status;if(stored)error.code=code;error.uncertain=writing&&!stored&&response.status>=500;throw error;
        }
        try{return await response.json();}catch{const error=Error('Resposta de sincronização inválida.');error.uncertain=writing;throw error;}
      };
      try{
        const value=await Promise.race([operation(),timeout]);
        try{return accept(value);}catch(error){error.uncertain=writing;throw error;}
      }finally{clearTimeout(timer);}
    }
    const refresh=()=>request({method:'GET'});
    function mutate(reducer){
      const operation=async()=>{
        const latest=await refresh(),proposal=D.validateState(reducer(latest.data));
        if(D.fingerprint(proposal)===D.fingerprint(latest.data))return latest.data;
        try{
          const result=await request({method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:latest.revision,data:proposal})});
          notify();return result.data;
        }catch(error){
          if(error.uncertain){
            try{const confirmed=await refresh();if(D.fingerprint(confirmed.data)===D.fingerprint(proposal)){notify();return confirmed.data;}}catch{}
            const uncertain=Error('Não foi possível confirmar se o servidor salvou. Revise os dados ao reconectar; o mesmo ID será mantido ao tentar novamente.');uncertain.uncertain=true;throw uncertain;
          }
          if(error.status===409){try{await refresh();}catch{}}throw error;
        }
      };
      const pending=queue.then(operation);queue=pending.catch(()=>{});return pending;
    }
    return {read,refresh,mutate,hasDone:id=>current.data.done.includes(id),hasTask:id=>current.data.tasks.some(x=>x.id===id),task:id=>{const item=current.data.tasks.find(x=>x.id===id);return item?structuredClone(item):null;},get loaded(){return loaded;},get revision(){return current.revision;}};
  }
  root.LuanCloudData={createStore};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.LuanCloudData;
})(globalThis);

// Local data contract and transactions. No network calls or account dependencies.
(function(root){
  'use strict';
  const V=root.LuanValidators || (typeof require==='function' && require('./validators.js'));
  const KEY='luan-os-v1',LOCK='luan-os-local-data',MAX_BYTES=2*1024*1024;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const fail=message=>{throw Error(message);};
  const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const id=x=>typeof x==='string'&&x.trim().length>0&&x.length<=512;
  const fields=['id','title','date','time','kind','priority','area','detail','source','end','timeLabel'];
  function task(value){
    if(!object(value)||!id(value.id)||typeof value.title!=='string'||!value.title.trim()||value.title.length>100)fail('Tarefa: título ou ID inválido.');
    if(Object.keys(value).some(key=>!fields.includes(key)))fail('Tarefa: campo fora do contrato.');
    if(!V.date(value.date)||!V.time(value.time)||value.kind!=='task')fail('Tarefa: data, horário ou tipo inválido.');
    if(!['high','medium','low'].includes(value.priority)||!['faculdade','carreira','conteudo','saude','desenvolvimento','pessoal'].includes(value.area))fail('Tarefa: área ou prioridade inválida.');
    if(typeof value.detail!=='string'||typeof value.source!=='string')fail('Tarefa: origem ou detalhe inválido.');
    if('end' in value&&!V.time(value.end))fail('Tarefa: horário final inválido.');
    if('timeLabel' in value&&typeof value.timeLabel!=='string')fail('Tarefa: rótulo de horário inválido.');
    return value;
  }
  function ids(list,label){
    if(!Array.isArray(list)||list.length>50000||!list.every(id)||new Set(list).size!==list.length)fail(label+': IDs inválidos ou duplicados.');
  }
  function validateState(value){
    if(!object(value)||!Array.isArray(value.tasks)||value.tasks.length>10000)fail('Dados locais: formato inválido.');
    if(Object.keys(value).some(key=>!['tasks','done','deleted'].includes(key)))fail('Dados locais: campo fora do contrato.');
    ids(value.done,'Conclusões');ids(value.deleted||[],'Exclusões');
    value.tasks.forEach(task);ids(value.tasks.map(x=>x.id),'Tarefas');
    const deleted=new Set(value.deleted||[]);
    if(value.tasks.some(x=>deleted.has(x.id))||value.done.some(x=>deleted.has(x)))fail('Uma tarefa excluída não pode permanecer ativa ou concluída.');
    return clone({...value,deleted:value.deleted||[]});
  }
  const empty=()=>({done:[],tasks:[],deleted:[]});
  function parseState(raw){return raw===null?empty():validateState(JSON.parse(raw));}
  function fingerprint(data){return JSON.stringify(validateState(data));}
  function sameTask(a,b){return fields.every(key=>a?.[key]===b?.[key]);}
  function insert(data,value){
    const next=validateState(data);task(value);
    const existing=next.tasks.find(x=>x.id===value.id);
    if(existing&&sameTask(existing,value))return next; // A retry with its original ID.
    if(next.tasks.some(x=>x.id===value.id)||next.deleted.includes(value.id))fail('ID de tarefa já utilizado.');
    next.tasks.push(clone(value));return next;
  }
  function edit(data,base,value){
    const next=validateState(data),index=next.tasks.findIndex(x=>x.id===base.id);
    task(value);
    if(value.id!==base.id)fail('O ID da tarefa deve ser preservado.');
    if(index>=0&&sameTask(next.tasks[index],value))return next;
    if(index<0||!sameTask(next.tasks[index],base))fail('Esta tarefa mudou em outra aba. Reabra a edição para revisar a versão atual.');
    next.tasks[index]={...next.tasks[index],...clone(value)};return next;
  }
  function remove(data,base){
    const next=validateState(data),current=next.tasks.find(x=>x.id===base.id);
    if(!current&&next.deleted.includes(base.id))return next;
    if(!sameTask(current,base)||!current)fail('Esta tarefa mudou em outra aba. Revise antes de excluir.');
    next.tasks=next.tasks.filter(x=>x.id!==base.id);next.done=next.done.filter(x=>x!==base.id);next.deleted.push(base.id);return next;
  }
  function mark(data,itemId,checked){
    const next=validateState(data);if(!id(itemId)||next.deleted.includes(itemId))fail('Item inválido ou já excluído.');
    if(next.done.includes(itemId)===checked)return next;
    next.done=next.done.filter(x=>x!==itemId);if(checked)next.done.push(itemId);return next;
  }
  function backup(data,exportedAt=new Date().toISOString()){
    if(!V.timestamp(exportedAt))fail('Data de exportação inválida.');
    const state=validateState(data);
    return {format:'luan-os-local-data',schema_version:1,exported_at:exportedAt,data:{tasks:state.tasks,done:state.done,deleted:state.deleted}};
  }
  function parseBackup(raw){
    if(typeof raw!=='string'||new TextEncoder().encode(raw).length>MAX_BYTES)fail('Arquivo deve ter no máximo 2 MB.');
    const value=JSON.parse(raw);
    if(!object(value)||value.format!=='luan-os-local-data'||value.schema_version!==1||!V.timestamp(value.exported_at))fail('Backup LUAN OS inválido ou versão incompatível.');
    if(Object.keys(value).some(key=>!['format','schema_version','exported_at','data'].includes(key)))fail('Backup: campo fora do contrato.');
    return validateState(value.data);
  }
  function merge(local,incoming,resolutions=new Map()){
    local=validateState(local);incoming=validateState(incoming);
    const localTasks=new Map(local.tasks.map(x=>[x.id,x])),incomingTasks=new Map(incoming.tasks.map(x=>[x.id,x]));
    const localDeleted=new Set(local.deleted),incomingDeleted=new Set(incoming.deleted),localDone=new Set(local.done),incomingDone=new Set(incoming.done);
    const all=new Set([...localTasks.keys(),...incomingTasks.keys(),...localDeleted,...incomingDeleted,...localDone,...incomingDone]);
    const conflicts=[],tasks=[],deleted=[],done=new Set([...local.done,...incoming.done]);
    let added=0;
    for(const itemId of all){
      const a=localTasks.get(itemId),b=incomingTasks.get(itemId),ad=localDeleted.has(itemId),bd=incomingDeleted.has(itemId);
      const completionOnly=!a&&!b&&!ad&&!bd;
      const conflict=(a&&bd)||(b&&ad)||(a&&b&&(!sameTask(a,b)||localDone.has(itemId)!==incomingDone.has(itemId)))||(completionOnly&&localDone.has(itemId)!==incomingDone.has(itemId));
      let choice;
      if(conflict){
        conflicts.push({id:itemId,local:a||null,incoming:b||null,localDeleted:ad,incomingDeleted:bd,localDone:localDone.has(itemId),incomingDone:incomingDone.has(itemId),completionOnly});
        choice=resolutions.get(itemId);
        if(choice!=='local'&&choice!=='incoming')choice='local';
      }else choice=b||bd?'incoming':'local';
      const selected=choice==='incoming'?b:a,isDeleted=choice==='incoming'?bd:ad;
      if(isDeleted){deleted.push(itemId);done.delete(itemId);}
      else{if(selected){tasks.push(clone(selected));if(!a&&!ad)added++;}if((choice==='incoming'?incomingDone:localDone).has(itemId))done.add(itemId);else done.delete(itemId);}
    }
    const unresolved=conflicts.filter(x=>!['local','incoming'].includes(resolutions.get(x.id)));
    return {data:validateState({...local,tasks,done:[...done],deleted}),conflicts,unresolved,added};
  }
  function createStore(storage,lock){
    let queue=Promise.resolve();
    const read=()=>parseState(storage.getItem(KEY));
    function mutate(reducer){
      const operation=()=>{
        if(typeof lock!=='function')fail('Este navegador não oferece proteção entre abas. Use um navegador atual em HTTPS ou localhost para salvar.');
        return lock(LOCK,()=>{
          const current=read(),proposal=validateState(reducer(current));
          storage.setItem(KEY,JSON.stringify(proposal));return clone(proposal);
        });
      };
      const pending=queue.then(operation);queue=pending.catch(()=>{});return pending;
    }
    return {read,mutate};
  }
  root.LuanLocalData={KEY,LOCK,MAX_BYTES,empty,validateState,fingerprint,sameTask,insert,edit,remove,mark,backup,parseBackup,merge,createStore};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.LuanLocalData;
})(globalThis);

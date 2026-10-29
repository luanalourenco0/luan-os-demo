(function(root){
  'use strict';
  // Google Calendar task sync client. No cache of its own: every view comes from the server status.
  const ERRORS={
    auth_failed:'A autorização do Google expirou ou foi revogada. É preciso renovar a credencial do servidor.',
    calendar_not_found:'O calendário de destino não foi encontrado. Confira o ID nas configurações.',
    forbidden:'Sem permissão para alterar eventos nesse calendário.',
    rate_limited:'Limite de uso do Google atingido. Haverá nova tentativa mais tarde.',
    network_error:'Falha de rede ao falar com o Google. Haverá nova tentativa.',
    timeout:'O Google demorou demais para responder. O resultado será conferido antes de qualquer nova tentativa.',
    run_deadline:'O tempo desta sincronização acabou. O restante fica para a próxima execução.',
    budget_exhausted:'O limite de requisições desta execução foi atingido. O restante fica para a próxima execução.',
    calendar_sync_lease_lost:'Outra sincronização assumiu enquanto esta estava parada. Nada foi enviado depois disso; o estado foi recarregado.',
    ownership_lost:'O evento perdeu a marca do LUAN OS no Google e deixou de ser sincronizado; ele não será alterado.',
    precondition_failed:'O evento mudou no Google enquanto o LUAN OS gravava; nada foi aplicado. Haverá nova tentativa.',
    unavailable:'O Google Agenda está indisponível no momento.',
    event_id_unavailable:'Não foi possível reservar o evento no Google.',
    invalid_response:'O Google devolveu uma resposta inesperada.',
    request_rejected:'O Google recusou a alteração.',
    internal_error:'Erro interno na sincronização.',
    calendar_sync_result_uncertain:'Resultado não confirmado. A próxima execução confere o Google antes de repetir.',
    calendar_sync_busy:'Uma sincronização já está em andamento. Tente novamente em instantes.',
    calendar_sync_revision_conflict:'A configuração mudou em outra aba. Ela foi recarregada; revise e tente novamente.',
    invalid_calendar_settings:'Configuração inválida. Informe o ID do calendário para ativar.',
    calendar_resolution_invalid:'Esta pendência já mudou. A lista foi atualizada.',
    task_not_found:'A tarefa não existe mais.',
    stored_record_invalid:'O registro da sincronização no servidor não pôde ser lido. Nada foi alterado.',
    offline:'Sem conexão com o painel.'
  };
  const BADGES={synced:['ok','Google Agenda'],pending:['','Enviando ao Google'],error:['err','Falha no Google Agenda'],conflict:['warn','Conflito no Google Agenda'],detached:['old','Evento excluído no Google']};
  const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const errorText=code=>ERRORS[code]||'Não foi possível concluir a sincronização.';
  const clock=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});
  function valid(status){
    if(!object(status)||!Number.isSafeInteger(status.revision)||typeof status.configured!=='boolean'||typeof status.available!=='boolean'||typeof status.busy!=='boolean'||!object(status.settings)||!object(status.cursor)||!object(status.counts)||!Array.isArray(status.entries)||!Array.isArray(status.warnings))throw Object.assign(Error('Resposta da sincronização inválida.'),{code:'invalid_response'});
    return status;
  }
  function createClient(fetcher,{timeoutMs=20000}={}){
    async function request(path,{method='GET',body}={}){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
      try{
        let response;
        try{response=await fetcher(path,{method,credentials:'same-origin',cache:'no-store',signal:controller.signal,...(body!==undefined?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});}
        catch{throw Object.assign(Error(errorText('offline')),{code:'offline'});}
        let data=null;try{data=await response.json();}catch{}
        if(!response.ok){const code=typeof data?.error==='string'?data.error:'http_'+response.status;throw Object.assign(Error(errorText(code)),{code,status:response.status});}
        if(!object(data))throw Object.assign(Error('Resposta da sincronização inválida.'),{code:'invalid_response'});
        return data;
      }finally{clearTimeout(timer);}
    }
    return {
      status:()=>request('/api/calendar-sync').then(valid),
      saveSettings:(revision,settings)=>request('/api/calendar-sync/settings',{method:'PUT',body:{revision,settings}}).then(valid),
      // draft: the preference of a task that is about to be created (stored before the task itself).
      setTaskMode:(revision,task_id,mode,{draft=false}={})=>request('/api/calendar-sync/task',{method:'PUT',body:{revision,task_id,mode,...(draft?{draft:true}:{})}}).then(valid),
      resolve:(revision,task_id,choice)=>request('/api/calendar-sync/resolve',{method:'POST',body:{revision,task_id,choice}}).then(valid),
      // status_detail is null when the server could not confirm what D1 holds (uncertain result): re-read later.
      run:()=>request('/api/calendar-sync/run',{method:'POST',body:{}}).then(result=>({...result,status_detail:result.status_detail===null?null:valid(result.status_detail)}))
    };
  }
  const active=status=>!!status&&status.available&&status.settings.enabled;
  function summary(status,formatDate=x=>x){
    if(!status)return {tone:'',text:'Estado da integração indisponível nesta sessão.'};
    if(!status.configured)return {tone:'',text:'Integração não configurada no servidor: faltam as credenciais OAuth do Google. Nada é enviado ao Google.'};
    if(!status.available)return {tone:'warn',text:'As credenciais do Google deste servidor pertencem a outra conta do painel.'};
    if(!status.settings.enabled)return {tone:'',text:'Sincronização desativada. Nenhuma tarefa é enviada ao Google.'};
    if(status.busy)return {tone:'',text:'Sincronização em andamento…'};
    const c=status.cursor,last=c.last_run_at?' Última execução: '+formatDate(c.last_run_at)+'.':'';
    if(c.status==='error')return {tone:'err',text:errorText(c.error_code)+last};
    const problems=status.counts.conflict+status.counts.error+status.counts.detached;
    if(problems)return {tone:'warn',text:problems+(problems===1?' tarefa precisa':' tarefas precisam')+' de revisão.'+last};
    if(c.status==='never')return {tone:'',text:'Ativada. Aguardando a primeira sincronização.'};
    return {tone:'ok',text:status.counts.synced+(status.counts.synced===1?' tarefa sincronizada.':' tarefas sincronizadas.')+(c.status==='partial'?' Parte do lote ficou para a próxima execução.':'')+last};
  }
  function badge(status,taskId){
    if(!active(status))return null;
    const entry=status.entries.find(e=>e.task_id===taskId),pair=entry&&BADGES[entry.state];
    return pair?{tone:pair[0],label:pair[1]}:null;
  }
  const short=date=>date.slice(8,10)+'/'+date.slice(5,7);
  const describeRemote=r=>r?(r.all_day?short(r.start_date)+' (dia inteiro)':short(r.start_date)+' '+r.start_time+'–'+(r.end_date!==r.start_date?short(r.end_date)+' ':'')+r.end_time)+' · '+r.title:'';
  function issues(status){
    if(!active(status))return [];
    return status.entries.filter(e=>['error','conflict','detached'].includes(e.state)).map(e=>{
      if(e.state==='conflict'){
        const both=e.conflict?.reason==='both_changed'&&!!e.conflict.remote,recurring=e.conflict?.reason==='recurring_remote';
        if(recurring)return {task_id:e.task_id,state:e.state,text:'O evento virou uma série recorrente no Google. A série não será alterada nem excluída.',
          actions:[{choice:'local',label:'Manter a tarefa com um evento novo'}]};
        return {task_id:e.task_id,state:e.state,text:both?'A tarefa e o evento mudaram desde a última sincronização. No Google: '+describeRemote(e.conflict.remote)+'.':'O evento foi alterado no Google para um formato que a tarefa não comporta (vários dias, dia inteiro sem essa opção ativa ou sem título).',
          actions:[{choice:'local',label:'Manter a versão do LUAN OS'},...(both?[{choice:'remote',label:'Usar a versão do Google'}]:[])]};
      }
      if(e.state==='detached'&&e.error_code==='ownership_lost')return {task_id:e.task_id,state:e.state,text:errorText('ownership_lost')+' A tarefa foi mantida.',actions:[{choice:'retry',label:'Criar um evento novo'}]};
      if(e.state==='detached')return {task_id:e.task_id,state:e.state,text:'O evento foi excluído no Google. A tarefa foi mantida no LUAN OS.',actions:[{choice:'retry',label:'Recriar evento'}]};
      return {task_id:e.task_id,state:e.state,text:errorText(e.error_code)+(e.retry_at?' Nova tentativa automática depois das '+clock.format(new Date(e.retry_at))+'.':''),actions:[{choice:'retry',label:'Tentar agora'}]};
    });
  }
  root.LuanCalendarSync=Object.freeze({createClient,summary,badge,issues,errorText,active,describeRemote});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.LuanCalendarSync;
})(globalThis);

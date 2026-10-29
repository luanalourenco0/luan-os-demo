(function(root){
  'use strict';
  // Navigation and capabilities, never persistent user state or authenticated identity.
  const modules=[
    {id:'hoje',label:'Hoje',title:'Dashboard Diário',description:'O que preciso saber e fazer hoje?',areas:null,streams:null,defaultArea:'pessoal'},
    {id:'academico',label:'Acadêmico',title:'Acadêmico',description:'Aulas, avaliações, entregas e preparação.',areas:['faculdade'],streams:['briefing'],defaultArea:'faculdade'},
    {id:'carreira',label:'Carreira / Estágios',title:'Carreira / Estágios',description:'Compromissos, processos seletivos e oportunidades.',areas:['carreira'],streams:['carreira'],defaultArea:'carreira'},
    {id:'projetos',label:'Projetos',title:'Projetos',description:'Conteúdo, programação e desenvolvimento pessoal.',areas:['conteudo','desenvolvimento'],streams:[],defaultArea:'desenvolvimento'},
    {id:'financas',label:'Finanças',title:'Finanças',description:'Avisos administrativos e financeiros para conferência.',areas:[],streams:['emails'],defaultArea:null,note:'Ainda não há saldo, lançamentos ou contas financeiras conectados. Os avisos abaixo são resumos de e-mails e exigem conferência na origem.'},
    {id:'fitness',label:'Fitness',title:'Fitness',description:'Tarefas de saúde, treino e rotina.',areas:['saude'],streams:[],defaultArea:'saude',note:'Esta área reúne as tarefas de saúde existentes. Planilhas de treino e métricas físicas ainda não estão conectadas ao LUAN OS.'},
    {id:'agentes',label:'Agentes e Automações',title:'Agentes e Automações',description:'Integrações, rotinas e acesso de agentes ao mesmo Core.',areas:[],streams:[],defaultArea:null},
    {id:'configuracoes',label:'Configurações',title:'Configurações',description:'Perfil, sincronização e backup dos seus dados.',areas:[],streams:[],defaultArea:null}
  ];
  for(const module of modules){if(module.areas)Object.freeze(module.areas);if(module.streams)Object.freeze(module.streams);Object.freeze(module);}
  const aliases=Object.freeze({visao:'hoje',agenda:'hoje',prioridades:'hoje',atualizacoes:'hoje',vagas:'carreira',modulos:'hoje'});
  const resolve=id=>modules.find(module=>module.id===(aliases[id]||id))||modules[0];
  root.LuanModules=Object.freeze({modules:Object.freeze(modules),aliases,resolve});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.LuanModules;
})(globalThis);

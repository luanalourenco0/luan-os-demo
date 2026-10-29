// Plano de automações exibido na demonstração. Apresentação apenas: nada é agendado aqui.
(function (root) {
  'use strict';
  const plan = {
    auditedOn: null,
    timezone: 'America/Sao_Paulo',
    publisher: 'Demonstração (nenhuma rotina roda aqui)',
    routines: [
      {name: 'Atualização da manhã', schedule: 'Todos os dias às 07h', role: 'Lê agenda e e-mail em modo somente leitura e publica os resumos do dia.'},
      {name: 'Atualização da noite', schedule: 'Todos os dias às 19h', role: 'Atualiza resumos e o radar de vagas, sem candidatura automática.'}
    ]
  };
  plan.routines.forEach(Object.freeze);
  Object.freeze(plan.routines);
  root.LuanAutomationPlan = Object.freeze(plan);
})(globalThis);

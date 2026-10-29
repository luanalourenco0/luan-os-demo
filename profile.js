// Perfil da demonstração pública. Pessoa fictícia: nenhum dado aqui é real.
(function (root) {
  const profile = {
    productName: 'LUAN OS',
    fullName: 'Marina Costa',
    preferredName: 'Marina',
    initials: 'MC',
    workspaceLabel: 'Perfil de demonstração',
    priorities: [
      {title: 'Faculdade', detail: 'Provas, relatórios e listas da semana'},
      {title: 'Estágio', detail: 'Candidaturas e portfólio'},
      {title: 'Saúde e treino', detail: 'Manter a rotina de treino'},
      {title: 'Projetos com IA', detail: 'Um avanço pequeno por dia'}
    ],
    footerNote: 'Demonstração com dados fictícios. Tudo o que você mudar fica só neste navegador.'
  };
  profile.priorities.forEach(Object.freeze);
  Object.freeze(profile.priorities);
  root.DashboardProfile = Object.freeze(profile);
})(globalThis);

# LUAN OS: demonstração pública

Versão de demonstração do LUAN OS, o painel diário que eu uso todo dia: agenda, tarefas, prazos, resumos de e-mail e radar de vagas num só lugar.

**Todos os dados são fictícios.** A Marina não existe, as empresas das vagas são inventadas e tudo o que você mudar fica salvo só no seu navegador.

## O que dá para fazer

- Ver o dia de hoje, os próximos 7 dias, prazos e provas.
- Criar, editar, concluir e excluir tarefas.
- Ler os resumos por frente (faculdade, carreira, e-mail, conteúdo).
- Ver o radar de vagas com a compatibilidade de cada uma.
- Usar **Recomeçar a demo** para voltar ao estado inicial.

## Como a demo funciona

A interface é a mesma do LUAN OS real. Na versão real, ela conversa com um Worker na Cloudflare, com um banco D1 como fonte da verdade, e rotinas agendadas alimentam agenda, resumos e vagas às 07h e às 19h.

Aqui, o arquivo `demo-api.js` responde no próprio navegador às mesmas rotas (`/api/state` e `/api/snapshots/*`), com:

- dados fictícios gerados a partir da data de hoje;
- o mesmo controle de revisão do servidor real: uma gravação com revisão desatualizada é recusada (409) e dados fora do contrato são rejeitados (400);
- persistência em `localStorage`, só neste navegador.

Nenhum arquivo da interface foi alterado para a demo, exceto `profile.js` (perfil fictício) e a inclusão do `demo-api.js` no `index.html`.

O código da versão pessoal, as rotinas e o servidor MCP com 11 ferramentas continuam privados, porque lidam com dados reais.

Feito por [Luan de Almeida Lourenço](https://luanalourenco0.github.io/).

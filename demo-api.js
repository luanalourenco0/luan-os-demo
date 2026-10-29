// API de demonstração: responde no navegador às mesmas rotas do servidor real
// (/api/state e /api/snapshots/*) com dados fictícios. A interface original não muda.
(function (root) {
  'use strict';
  const ZONE = 'America/Sao_Paulo';
  const STORE_KEY = 'luan-os-demo-state';
  const PORTFOLIO = 'https://luanalourenco0.github.io/';
  const realFetch = root.fetch.bind(root);

  // ---------- Datas relativas a hoje, no fuso de São Paulo ----------
  // Dia e hora vêm sempre do mesmo instante, para não cruzar a meia-noite entre duas leituras.
  const PARTS = new Intl.DateTimeFormat('en-CA', {timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'});
  function clock(now = new Date()) {
    const p = Object.fromEntries(PARTS.formatToParts(now).map(x => [x.type, x.value]));
    return {day: p.year + '-' + p.month + '-' + p.day, hour: Number(p.hour)};
  }
  const today = () => clock().day;
  function addDays(day, n) {
    const d = new Date(day + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  // O painel real atualiza às 07h e às 19h; a captura fictícia segue o mesmo ritmo.
  function captureStamp() {
    const {day: d, hour: h} = clock();
    if (h >= 19) return d + 'T19:00:00-03:00';
    if (h >= 7) return d + 'T07:00:00-03:00';
    return addDays(d, -1) + 'T19:00:00-03:00';
  }

  // ---------- Dados fictícios ----------
  function agenda() {
    const t = today(), at = n => addDays(t, n);
    const item = (id, n, time, title, kind, priority, area, detail, extra) =>
      Object.assign({id: 'demo-ag-' + id, title, date: at(n), time, kind, priority, area, detail, source: 'Google Agenda (fictício)'}, extra || {});
    return {
      schema_version: 1,
      captured_at: captureStamp(),
      window_start: t,
      window_end: at(30),
      items: [
        item('aula-ft', 0, '08:20', 'Aula de Fenômenos de Transporte', 'class', 'medium', 'faculdade', 'Sala 204, bloco B', {end: '10:00'}),
        item('reuniao-tcc', 0, '14:00', 'Reunião com a orientadora', 'appointment', 'high', 'faculdade', 'Levar o cronograma do projeto', {end: '15:00'}),
        item('treino', 0, '18:30', 'Treino', 'appointment', 'low', 'saude', 'Academia do campus', {end: '19:30'}),
        item('prova-calc', 1, '10:10', 'Prova de Cálculo Numérico', 'exam', 'high', 'faculdade', 'Capítulos 3 a 5'),
        item('relatorio-lab', 2, '23:59', 'Entrega do relatório de laboratório', 'deadline', 'high', 'faculdade', 'Enviar em PDF pelo ambiente da disciplina'),
        item('mentoria', 3, '16:00', 'Mentoria de carreira', 'appointment', 'medium', 'carreira', 'Revisar currículo e portfólio', {end: '17:00'}),
        item('inscricao', 5, '23:59', 'Fim das inscrições do programa de estágio', 'deadline', 'high', 'carreira', 'Formulário e vídeo de apresentação'),
        item('aula-ope', 7, '13:30', 'Aula de Operações Unitárias', 'class', 'medium', 'faculdade', 'Laboratório 3', {end: '15:10'}),
        item('prova-ope', 12, '08:20', 'Prova de Operações Unitárias', 'exam', 'high', 'faculdade', 'Destilação e absorção'),
        item('entrevista', 15, '11:00', 'Entrevista com o time de recrutamento', 'appointment', 'high', 'carreira', 'Chamada de vídeo', {end: '11:45'}),
      ],
    };
  }

  function updates() {
    const stamp = captureStamp();
    return {
      schema_version: 1,
      updated_at: stamp,
      streams: [
        {id: 'briefing', label: 'Briefing', status: 'current', updated_at: stamp,
          headline: 'Dia de prova amanhã e prazo de estágio na semana',
          summary: 'A agenda tem três compromissos hoje; o relatório de laboratório vence depois de amanhã.',
          next_step: 'Resolver a lista de revisão de Cálculo antes das 22h.'},
        {id: 'faculdade', label: 'Faculdade', status: 'attention', updated_at: stamp,
          headline: 'Prova de Cálculo Numérico amanhã',
          summary: 'Dois e-mails da disciplina confirmam a sala e liberam a lista de revisão.',
          next_step: 'Resolver a lista de revisão hoje à noite.'},
        {id: 'carreira', label: 'Carreira', status: 'current', updated_at: stamp,
          headline: 'Duas vagas novas com alta compatibilidade',
          summary: 'O radar encontrou vagas de estágio em processos e em automação com IA.',
          next_step: 'Ler as duas vagas e decidir até sexta.'},
        {id: 'email', label: 'E-mail', status: 'pending', updated_at: stamp,
          headline: 'Três mensagens pedem resposta',
          summary: 'Confirmação da mentoria, convite para grupo de estudos e retorno de um recrutador.',
          next_step: 'Responder ao recrutador primeiro.'},
        {id: 'conteudo', label: 'Conteúdo', status: 'current', updated_at: stamp,
          headline: 'Post da semana pronto para revisão',
          summary: 'Rascunho sobre automação de relatórios de laboratório com IA.',
          next_step: 'Revisar o texto antes de publicar.'},
      ],
    };
  }

  function jobs() {
    const stamp = captureStamp(), d = stamp.slice(0, 10);
    // IDs fictícios; os cliques nesses links são interceptados (ver abaixo).
    const job = (id, title, company, location, fit, reason, back) => ({
      id, title, company, location, fit, reason, alerted_at: addDays(d, -back),
      url: 'https://www.linkedin.com/jobs/view/' + id + '/',
    });
    return {
      schema_version: 1,
      captured_at: stamp,
      source: 'Alertas de vagas do LinkedIn',
      items: [
        job('9000000101', 'Estágio em Automação com IA', 'Quimera Labs (empresa fictícia)', 'Remoto', 'alta', 'Pede agentes, automação e análise de dados: combina com seus projetos.', 0),
        job('9000000102', 'Estágio em Engenharia de Processos', 'Aurora Bioprocessos (empresa fictícia)', 'Florianópolis, SC (híbrido)', 'alta', 'Aceita Engenharia Química e valoriza experiência com dados.', 0),
        job('9000000103', 'Estágio em Melhoria Contínua', 'Vértice Embalagens (empresa fictícia)', 'Joinville, SC', 'media', 'Pede Excel avançado e Lean; exige presença 5 dias por semana.', 1),
        job('9000000104', 'Estágio em Dados', 'Delta Logística (empresa fictícia)', 'Remoto', 'media', 'Foco em SQL e dashboards; menos ligado a processos químicos.', 2),
      ],
    };
  }

  function seedState() {
    const t = today(), at = n => addDays(t, n);
    const task = (id, n, time, title, priority, area, detail) =>
      ({id: 'demo-task-' + id, title, date: at(n), time, kind: 'task', priority, area, detail, source: 'Tarefa pessoal'});
    return {
      done: [],
      deleted: [],
      tasks: [
        task('lista', 0, '20:00', 'Resolver a lista de revisão de Cálculo', 'high', 'faculdade', 'Foco nos exercícios de interpolação'),
        task('portfolio', 1, '', 'Atualizar o portfólio no GitHub', 'medium', 'carreira', 'Incluir o projeto mais recente'),
        task('video', 2, '', 'Gravar vídeo de apresentação para a inscrição', 'high', 'carreira', 'Até 2 minutos'),
        task('post', 3, '', 'Revisar o post sobre automação de relatórios', 'low', 'conteudo', ''),
        task('gastos', 4, '', 'Fechar a planilha de gastos do mês', 'low', 'pessoal', ''),
      ],
    };
  }

  // ---------- Estado persistido só neste navegador ----------
  // Se o localStorage falhar uma vez (bloqueado ou cheio), a aba passa a usar só a memória,
  // para nunca responder com uma revisão e depois ler outra mais antiga.
  let memory = null;
  let memoryOnly = false;
  const fresh = value => value && Number.isSafeInteger(value.revision) && value.seeded_for >= addDays(today(), -3);
  function readStorage() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      memoryOnly = true;
      return null;
    }
  }
  function saveStore(value) {
    memory = value;
    if (memoryOnly) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(value)); } catch (err) { memoryOnly = true; }
  }
  function loadStore() {
    let stored = null;
    if (!memoryOnly) {
      stored = readStorage();
      // Todo estado lido com sucesso fica espelhado na memória; se a leitura falhar depois,
      // a aba continua da última revisão confirmada em vez de recomeçar do zero.
      if (stored) memory = stored;
    }
    if (!stored) stored = memory;
    if (fresh(stored)) return stored;
    // Recomeça com datas novas, mas a revisão só sobe: abas abertas nunca veem a revisão voltar.
    const seeded = {revision: (stored && Number.isSafeInteger(stored.revision) ? stored.revision : 0) + 1, seeded_for: today(), data: seedState()};
    saveStore(seeded);
    return seeded;
  }
  // Ler, comparar e gravar como uma operação só, também entre abas, quando o navegador suporta.
  // Sem Web Locks (navegadores antigos), a demo segue funcionando sem essa garantia entre abas.
  const exclusive = fn => (navigator.locks && navigator.locks.request) ? navigator.locks.request(STORE_KEY, fn) : fn();
  function resetDemo() {
    return exclusive(async () => {
      const current = loadStore();
      saveStore({revision: current.revision + 1, seeded_for: today(), data: seedState()});
    });
  }

  // ---------- Rotas simuladas ----------
  const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
  const pause = ms => new Promise(r => setTimeout(r, ms));

  async function handle(path, init) {
    await pause(120); // latência pequena, como uma rede de verdade
    const method = (init && init.method || 'GET').toUpperCase();
    if (path === '/api/state') {
      if (method === 'GET') {
        const current = await exclusive(async () => loadStore());
        return json(200, {revision: current.revision, data: current.data});
      }
      if (method === 'PUT') {
        let body;
        try { body = JSON.parse(init.body); } catch (err) { return json(400, {error: 'JSON inválido'}); }
        if (!body || typeof body !== 'object' || !Number.isSafeInteger(body.revision)) return json(400, {error: 'Corpo inválido'});
        let data;
        try { data = root.LuanLocalData.validateState(body.data); } catch (err) { return json(400, {error: err.message}); }
        return exclusive(async () => {
          const current = loadStore();
          if (body.revision !== current.revision) return json(409, {error: 'Revisão desatualizada'});
          const next = {revision: current.revision + 1, seeded_for: current.seeded_for, data};
          saveStore(next);
          return json(200, {revision: next.revision, data: next.data});
        });
      }
      return json(405, {error: 'Método não suportado'});
    }
    const snap = path.match(/^\/api\/snapshots\/(agenda|updates|jobs)$/);
    if (snap && method === 'GET') return json(200, {agenda, updates, jobs}[snap[1]]());
    return null;
  }

  root.fetch = async function (input, init) {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin === location.origin) {
      const response = await handle(url.pathname, init);
      if (response) return response;
    }
    return realFetch(input, init);
  };

  // ---------- Faixa da demonstração e links fictícios ----------
  function toast(message) {
    let el = document.getElementById('demo-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'demo-toast';
      el.setAttribute('role', 'status');
      document.body.append(el);
    }
    el.textContent = message;
    el.classList.add('is-on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('is-on'), 3200);
  }

  // Os IDs das vagas são fictícios, mas um link do LinkedIn com um número qualquer pode abrir
  // uma vaga real. Assim que um link desses aparece, ele perde o endereço externo; isso cobre
  // clique comum, clique do meio, teclado e "abrir em nova aba".
  const JOB_LINK = 'a[href*="linkedin.com/jobs/view/"]';
  function neutralize(scope) {
    scope.querySelectorAll(JOB_LINK).forEach((a) => {
      a.setAttribute('href', '#');
      a.removeAttribute('target');
      a.dataset.demoJob = 'true';
      // Mantém o título da vaga no rótulo acessível; só troca o "em nova aba" pelo aviso.
      const label = (a.getAttribute('aria-label') || a.textContent.trim() || 'Vaga').replace(/\s*em nova aba\s*$/i, '');
      a.setAttribute('aria-label', label + ' (vaga fictícia)');
    });
  }
  document.addEventListener('click', (event) => {
    const link = event.target.closest && event.target.closest(JOB_LINK + ', a[data-demo-job]');
    if (link) {
      event.preventDefault();
      toast('Vaga fictícia. No LUAN OS real, este link abre a vaga no LinkedIn.');
    }
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    neutralize(document);
    new MutationObserver(() => neutralize(document.body)).observe(document.body, {childList: true, subtree: true});

    const style = document.createElement('style');
    // A faixa fica no fluxo da página (não fixa) para não cobrir o link de salto nem os cabeçalhos fixos.
    style.textContent = `
      .demo-bar{position:relative;display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;justify-content:center;
        padding:9px 16px;background:#14213d;color:#f5f1e6;font:500 14px/1.4 system-ui,sans-serif;text-align:center}
      .demo-bar a,.demo-bar button{color:#ffc857;font:inherit;font-weight:700;background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
      .demo-bar a:focus-visible,.demo-bar button:focus-visible{outline:2px solid #ffc857;outline-offset:3px}
      #demo-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translate(-50%,20px);opacity:0;z-index:1001;max-width:min(92vw,460px);
        padding:12px 16px;border-radius:10px;background:#14213d;color:#f5f1e6;font:500 14px/1.4 system-ui,sans-serif;transition:opacity .2s,transform .2s;pointer-events:none}
      #demo-toast.is-on{opacity:1;transform:translate(-50%,0)}
      @media (max-width: 900px){#demo-toast{bottom:calc(96px + env(safe-area-inset-bottom))}}
      @media (prefers-reduced-motion: reduce){#demo-toast{transition:none}}`;
    document.head.append(style);

    const bar = document.createElement('div');
    bar.className = 'demo-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Aviso de demonstração');
    bar.innerHTML = '<span>Demonstração do LUAN OS com dados fictícios. A Marina não existe e o que você mudar fica só neste navegador.</span>'
      + '<button type="button" data-demo-reset>Recomeçar a demo</button>'
      + '<a href="' + PORTFOLIO + '">Voltar ao portfólio</a>';
    document.body.prepend(bar);
    bar.querySelector('[data-demo-reset]').addEventListener('click', async () => {
      await resetDemo();
      if (!memoryOnly) { location.reload(); return; }
      // Sem armazenamento, recarregar apagaria a memória da aba: avisa a interface para reler o estado.
      if (typeof BroadcastChannel === 'function') new BroadcastChannel('luan-os-state').postMessage({type: 'state-changed'});
      // Sem BroadcastChannel, o evento de foco também faz a interface reler o estado.
      root.dispatchEvent(new Event('focus'));
      toast('Demo recomeçada.');
    });
  });
})(globalThis);

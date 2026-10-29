// Shared by classic browser scripts and Node; no external dependencies.
(function (root) {
  'use strict';
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const text = x => typeof x === 'string';
  const nonempty = x => text(x) && x.trim().length > 0;
  function date(x) {
    if (!text(x) || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
    const d = new Date(x + 'T12:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === x;
  }
  const time = x => text(x) && (x === '' || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x));
  function timestamp(x) {
    const m = text(x) && x.match(/^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d):([0-5]\d)(?:\.\d{1,9})?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/);
    return !!m && date(m[1]) && Number.isFinite(Date.parse(x));
  }
  function check(ok, message) { if (!ok) throw new Error(message); }
  function unique(values, label) {
    check(new Set(values).size === values.length, label + ': IDs duplicados');
  }
  function agenda(data) {
    check(object(data) && data.schema_version === 1, 'Agenda: versão inválida');
    check(date(data.window_start) && date(data.window_end) && data.window_start <= data.window_end, 'Agenda: janela inválida');
    check(timestamp(data.captured_at), 'Agenda: captura inválida');
    check(Array.isArray(data.items), 'Agenda: itens ausentes');
    const previous = new Date(data.window_start + 'T12:00:00Z');
    previous.setUTCDate(previous.getUTCDate() - 1);
    const eve = previous.toISOString().slice(0, 10);
    for (const item of data.items) {
      check(object(item), 'Agenda: item inválido');
      for (const key of ['id', 'title', 'source']) check(nonempty(item[key]), 'Agenda: ' + key + ' inválido');
      check(text(item.detail), 'Agenda: detail inválido');
      check(date(item.date) && time(item.time), 'Agenda: data/hora inválida');
      check(['deadline', 'exam', 'class', 'task', 'appointment'].includes(item.kind), 'Agenda: tipo inválido');
      check(['high', 'medium', 'low'].includes(item.priority), 'Agenda: prioridade inválida');
      check(['faculdade', 'carreira', 'conteudo', 'saude', 'desenvolvimento', 'pessoal'].includes(item.area), 'Agenda: área inválida');
      if ('end' in item) check(time(item.end), 'Agenda: hora final inválida');
      if ('timeLabel' in item) check(nonempty(item.timeLabel), 'Agenda: timeLabel inválido');
      const midnight = item.kind === 'deadline' && item.time === '00:00' && nonempty(item.timeLabel);
      check(item.date <= data.window_end && (item.date >= data.window_start || (item.date === eve && midnight)), 'Agenda: item fora da janela');
    }
    unique(data.items.map(x => x.id), 'Agenda');
    return data;
  }
  function updates(data) {
    check(object(data) && data.schema_version === 1, 'Atualizações: versão inválida');
    check(timestamp(data.updated_at), 'Atualizações: data inválida');
    check(Array.isArray(data.streams), 'Atualizações: frentes ausentes');
    for (const stream of data.streams) {
      check(object(stream), 'Atualizações: frente inválida');
      for (const key of ['id', 'label', 'headline', 'summary']) check(nonempty(stream[key]), 'Atualizações: ' + key + ' inválido');
      check(['current', 'attention', 'pending'].includes(stream.status), 'Atualizações: estado inválido');
      check(timestamp(stream.updated_at), 'Atualizações: data da frente inválida');
      if ('next_step' in stream) check(text(stream.next_step), 'Atualizações: próximo passo inválido');
    }
    unique(data.streams.map(x => x.id), 'Atualizações');
    return data;
  }
  function jobs(data) {
    check(object(data) && data.schema_version === 1, 'Vagas: versão inválida');
    check(timestamp(data.captured_at), 'Vagas: captura inválida');
    check(data.source === 'Alertas de vagas do LinkedIn', 'Vagas: fonte inválida');
    check(Array.isArray(data.items) && data.items.length <= 20, 'Vagas: lista inválida');
    for (const item of data.items) {
      check(object(item), 'Vagas: item inválido');
      for (const key of ['id', 'title', 'company', 'location', 'reason']) check(nonempty(item[key]), 'Vagas: ' + key + ' inválido');
      check(date(item.alerted_at) && item.alerted_at <= data.captured_at.slice(0, 10), 'Vagas: data do alerta inválida');
      check(['alta', 'media'].includes(item.fit), 'Vagas: compatibilidade inválida');
      check(/^https:\/\/www\.linkedin\.com\/jobs\/view\/\d+\/$/.test(item.url), 'Vagas: URL inválida');
      check(item.id === item.url.match(/\/view\/(\d+)\//)[1], 'Vagas: ID e URL divergentes');
    }
    unique(data.items.map(x => x.id), 'Vagas');
    return data;
  }
  root.LuanValidators = {date, time, timestamp, agenda, updates, jobs};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LuanValidators;
})(globalThis);

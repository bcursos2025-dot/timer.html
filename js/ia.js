/* ============================================================
   ASSISTENTE DE ESTUDO (chat com IA), versão do site, no mesmo desenho da extensão.
   Usa as mesmas IAs gratuitas e sem cadastro da extensão que aceitam chamadas de um site:
   Pollinations, LLM7 e OVHcloud. Sem chave guardada aqui (o site é público).
   O contexto (perfil, prova, horas, pontos fracos) é montado no navegador a partir dos
   dados do próprio aparelho e vai junto com a pergunta.
   As conversas anteriores ficam salvas SÓ neste aparelho (localStorage) e podem ser apagadas.
   ============================================================ */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const ov = $('iaSheet'), msgs = $('iaMensagens'), campo = $('iaCampo'), enviar = $('iaEnviar'), chips = $('iaSugestoes');
  if (!ov || !msgs || !campo) return;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAX_ENTRADA = 1500, MAX_HISTORICO = 10, TEMPO_MAX_MS = 40000, MAX_SALVAS = 20;
  const LS_HIST = 'cb2_ia_conversas', LS_MODO = 'cb2_ia_modo';

  const PROVEDORES = [
    { id: 'pollinations', url: 'https://text.pollinations.ai/openai?referrer=concurseiro-blindado-site', modelos: ['openai'], chave: '' },
    { id: 'llm7', url: 'https://api.llm7.io/v1/chat/completions', modelos: ['default'], chave: 'unused' },
    { id: 'ovh', url: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions',
      modelos: ['gpt-oss-120b', 'Meta-Llama-3_3-70B-Instruct', 'Mistral-Small-3.2-24B-Instruct-2506'], chave: '' }
  ];
  const MODOS = { rapida: 'Rápida', detalhada: 'Detalhada' };

  let conversa = [];           // { role: 'user' | 'assistant', content }
  let conversaId = null;
  let ocupado = false;
  let modo = 'rapida';
  try { const m = localStorage.getItem(LS_MODO); if (MODOS[m]) modo = m; } catch (e) { /* padrão */ }

  /* ---------- contexto do estudo (só lido do aparelho) ---------- */
  function msDoDia(chave){
    let a = 0, b = 0;
    try { a = Number(historico[chave]) || 0; } catch (e) { /* sem histórico */ }
    try { b = Number((estadoExtensao && estadoExtensao.historico || {})[chave]) || 0; } catch (e) { /* sem extensão */ }
    return Math.max(a, b);
  }
  function horas(ms){ return (ms / 3600000).toFixed(1).replace('.', ','); }
  function contexto(){
    const linhas = [];
    const concurso = (typeof perfilAtual === 'function' && perfilAtual() === 'concurso');
    linhas.push('Objetivo: ' + (concurso ? 'concurso público' : 'Exame de Ordem (OAB)') + '.');
    try {
      const p = lerJSON(LS.provaOab, null);
      if (p && p.data) {
        const [y, m, d] = p.data.split('-').map(Number);
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        const dias = Math.round((new Date(y, m - 1, d) - hoje) / 86400000);
        if (dias >= 0) linhas.push('Prova em ' + dias + ' dia(s)' + (p.fase ? ', ' + p.fase + 'ª fase' : '') + '.');
      }
    } catch (e) { /* sem prova */ }
    try {
      let semana = 0;
      for (let i = 0; i < 7; i++) { const dt = new Date(); dt.setDate(dt.getDate() - i); semana += msDoDia(chaveData(dt)); }
      linhas.push('Estudou hoje ' + horas(msDoDia(hojeChave())) + ' h e ' + horas(semana) + ' h nos últimos 7 dias; meta diária de ' + horas(config.dailyGoalMs) + ' h; sequência de ' + calcularStreak() + ' dia(s).');
    } catch (e) { /* sem dados */ }
    try {
      const reg = JSON.parse(localStorage.getItem('cb2_desempenho') || '[]');
      const por = {};
      reg.forEach(r => { if (r && r.disc && r.n > 0) { const x = por[r.disc] || (por[r.disc] = { n: 0, ok: 0 }); x.n += r.n; x.ok += r.ok || 0; } });
      const lista = Object.keys(por).map(k => ({ k, n: por[k].n, p: Math.round(por[k].ok / por[k].n * 100) })).filter(x => x.n >= 5).sort((a, b) => a.p - b.p);
      if (lista.length) linhas.push('Desempenho em questões (menor acerto primeiro): ' + lista.slice(0, 5).map(x => x.k + ' ' + x.p + '% (' + x.n + ' questões)').join('; ') + '.');
    } catch (e) { /* sem desempenho */ }
    return linhas.join(' ');
  }
  function sistema(){
    return 'Você é o assistente de estudos do Concurseiro Blindado, para quem se prepara para a OAB e concursos jurídicos no Brasil. ' +
      'Responda sempre em português do Brasil, de forma clara e amigável. ' +
      (modo === 'detalhada'
        ? 'Seja didático: explique com exemplos e termine com uma dica curta de memorização (até uns 25 linhas). '
        : 'Seja objetivo, com no máximo umas 12 linhas. ') +
      'Use listas curtas quando ajudar. Não use tabelas nem HTML. ' +
      'Seja honesto: nunca invente número de artigo, súmula, tema ou julgado; se não tiver certeza, diga e peça para conferir na lei (o site tem a aba Leis). ' +
      'Não dê consultoria jurídica para casos reais; foque em estudo, técnica, revisão e organização. ' +
      'Dados do aluno (use quando ajudar, sem repetir tudo): ' + contexto();
  }

  /* ---------- chamada às IAs (a primeira que responder vence) ---------- */
  async function chamar(prov, modelo, mensagens){
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TEMPO_MAX_MS);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (prov.chave) headers.Authorization = 'Bearer ' + prov.chave;
      const r = await fetch(prov.url, { method: 'POST', headers, signal: ctl.signal,
        body: JSON.stringify({ model: modelo, messages: mensagens, temperature: 0.4 }) });
      if (!r.ok) throw new Error(prov.id + '_' + r.status);
      const j = await r.json();
      const txt = String(j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      if (!txt) throw new Error(prov.id + '_vazia');
      return txt;
    } finally { clearTimeout(t); }
  }
  async function perguntar(){
    const mensagens = [{ role: 'system', content: sistema() }].concat(conversa.slice(-MAX_HISTORICO));
    let ultimo = null;
    for (const prov of PROVEDORES) {
      for (const modelo of prov.modelos) {
        try { return await chamar(prov, modelo, mensagens); } catch (e) { ultimo = e; }
      }
    }
    throw ultimo || new Error('sem_resposta');
  }

  /* ---------- texto -> HTML seguro (negrito, listas, código, tabelas simples) ---------- */
  function md(txt){
    const linhas = String(txt).replace(/<br\s*\/?>/gi, '\n').split('\n'); let html = '', lista = null, tabela = null;
    const fecha = () => { if (lista) { html += '</' + lista + '>'; lista = null; } };
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
    const celulas = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    function fechaTabela(){
      if (!tabela) return;
      const rows = tabela.filter(r => !r.every(c => /^:?-{2,}:?$/.test(c)));
      html += '<div class="ia-tab"><table>' + rows.map((r, i) => '<tr>' + r.map(c => '<' + (i === 0 ? 'th' : 'td') + '>' + inline(c) + '</' + (i === 0 ? 'th' : 'td') + '>').join('') + '</tr>').join('') + '</table></div>';
      tabela = null;
    }
    linhas.forEach(l => {
      let m;
      if (/^\s*\|.*\|\s*$/.test(l)) { fecha(); (tabela = tabela || []).push(celulas(l)); return; }
      fechaTabela();
      if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (lista !== 'ul') { fecha(); html += '<ul>'; lista = 'ul'; } html += '<li>' + inline(m[1]) + '</li>'; }
      else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (lista !== 'ol') { fecha(); html += '<ol>'; lista = 'ol'; } html += '<li>' + inline(m[1]) + '</li>'; }
      else if (!l.trim()) { fecha(); }
      else { fecha(); html += '<p>' + inline(l.replace(/^#{1,4}\s*/, '')) + '</p>'; }
    });
    fecha(); fechaTabela(); return html;
  }

  /* ---------- conversas salvas neste aparelho ---------- */
  function lerSalvas(){
    try { const a = JSON.parse(localStorage.getItem(LS_HIST) || '[]'); return Array.isArray(a) ? a.filter(c => c && c.id && Array.isArray(c.msgs)) : []; } catch (e) { return []; }
  }
  function gravarSalvas(a){ try { localStorage.setItem(LS_HIST, JSON.stringify(a.slice(0, MAX_SALVAS))); } catch (e) { /* cheio */ } }
  function salvarAtual(){
    if (!conversa.length) return;
    if (!conversaId) conversaId = 'c' + Date.now();
    const a = lerSalvas().filter(c => c.id !== conversaId);
    const titulo = String(conversa[0].content).replace(/\s+/g, ' ').slice(0, 60);
    a.unshift({ id: conversaId, titulo, ts: Date.now(), msgs: conversa.slice(-40) });
    gravarSalvas(a);
  }

  /* ---------- tela ---------- */
  function rolar(){ msgs.scrollTop = msgs.scrollHeight; }
  function bolha(papel, html, extra){
    const d = document.createElement('div');
    d.className = 'ia-msg ia-' + papel + (extra ? ' ' + extra : '');
    d.innerHTML = html; msgs.appendChild(d); rolar(); return d;
  }
  function boasVindas(){
    msgs.innerHTML = '';
    bolha('bot', '<p>Oi! Pode perguntar sobre técnicas de estudo, dúvidas de matérias ou pedir ajuda para organizar seu cronograma.</p>');
    if (chips) chips.hidden = false;
  }
  function novaConversa(){ if (ocupado) return; conversa = []; conversaId = null; boasVindas(); fecharMenus(); campo.focus(); }
  async function enviarPergunta(texto){
    texto = String(texto || '').trim().slice(0, MAX_ENTRADA);
    if (!texto || ocupado) return;
    fecharMenus();
    ocupado = true; enviar.disabled = true; if (chips) chips.hidden = true;
    bolha('eu', '<p>' + esc(texto).replace(/\n/g, '<br>') + '</p>');
    conversa.push({ role: 'user', content: texto });
    campo.value = ''; ajustarCampo();
    const digitando = bolha('bot', '<span class="ia-ponto"></span><span class="ia-ponto"></span><span class="ia-ponto"></span>', 'ia-digitando');
    try {
      const resp = await perguntar();
      digitando.remove();
      conversa.push({ role: 'assistant', content: resp });
      bolha('bot', md(resp));
      salvarAtual();
    } catch (e) {
      digitando.remove(); conversa.pop();
      const b = bolha('bot', '<p>Não consegui responder agora: as IAs gratuitas estão ocupadas ou sem conexão. Tente de novo em instantes.</p><button type="button" class="ia-tentar">Tentar de novo</button>', 'ia-erro');
      b.querySelector('.ia-tentar').addEventListener('click', () => { b.remove(); enviarPergunta(texto); });
    } finally { ocupado = false; atualizarEnviar(); campo.focus(); }
  }
  function ajustarCampo(){ campo.style.height = 'auto'; campo.style.height = Math.min(140, campo.scrollHeight) + 'px'; }
  function atualizarEnviar(){ enviar.disabled = ocupado || !campo.value.trim(); }

  campo.addEventListener('input', () => { ajustarCampo(); atualizarEnviar(); });
  campo.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarPergunta(campo.value); } });
  enviar.addEventListener('click', () => enviarPergunta(campo.value));
  if (chips) chips.addEventListener('click', e => { const b = e.target.closest('button[data-q]'); if (b) enviarPergunta(b.dataset.q); });
  const nova = $('iaNova'); if (nova) nova.addEventListener('click', novaConversa);

  /* ---------- menus: "+" (atalhos) e modo de resposta ---------- */
  const menuMais = $('iaMenuMais'), menuModo = $('iaMenuModo'), bMais = $('iaMais'), bModo = $('iaModo');
  function fecharMenus(){
    [menuMais, menuModo].forEach(m => { if (m) m.hidden = true; });
    [bMais, bModo].forEach(b => { if (b) b.setAttribute('aria-expanded', 'false'); });
  }
  function alternar(menu, botao){
    const abrir = menu.hidden; fecharMenus();
    if (abrir) { menu.hidden = false; botao.setAttribute('aria-expanded', 'true'); }
  }
  function mostrarModo(){
    const n = $('iaModoNome'); if (n) n.textContent = MODOS[modo];
    if (menuModo) menuModo.querySelectorAll('button').forEach(b => b.classList.toggle('ativo', b.dataset.modo === modo));
  }
  if (bMais && menuMais) bMais.addEventListener('click', e => { e.stopPropagation(); alternar(menuMais, bMais); });
  if (bModo && menuModo) bModo.addEventListener('click', e => { e.stopPropagation(); alternar(menuModo, bModo); });
  if (menuMais) menuMais.addEventListener('click', e => {
    const b = e.target.closest('button[data-pre]'); if (!b) return;
    campo.value = b.dataset.pre; fecharMenus(); ajustarCampo(); atualizarEnviar(); campo.focus();
    campo.setSelectionRange(campo.value.length, campo.value.length);
  });
  if (menuModo) menuModo.addEventListener('click', e => {
    const b = e.target.closest('button[data-modo], button.ia-pro'); if (!b) return;
    if (b.classList.contains('ia-pro')) { fecharMenus(); avisoPro(); return; }
    modo = b.dataset.modo; try { localStorage.setItem(LS_MODO, modo); } catch (er) { /* ok */ }
    mostrarModo(); fecharMenus();
  });
  document.addEventListener('click', e => { if (!e.target.closest('.ia-menu, #iaMais, #iaModo')) fecharMenus(); });
  mostrarModo();


  /* ---------- modo Pro: só com a extensão sincronizada ---------- */
  function pareado(){ try { return !!(typeof deviceId !== 'undefined' && deviceId); } catch (e) { return false; } }
  function avisoPro(){
    const ok = pareado();
    const b = bolha('bot', ok
      ? '<p><strong>Modo Pro</strong>: a precisão jurídica maior, com conferência nas fontes, roda <strong>dentro da extensão</strong>. Você já está sincronizado: abra o assistente por lá.</p>'
      : '<p><strong>Modo Pro</strong> dá respostas jurídicas bem mais precisas, conferidas nas fontes. Ele só funciona com a <strong>extensão instalada e sincronizada</strong> com o site.</p>' +
        '<div class="ia-acoes"><a class="ia-acao ia-acao-prim" href="instalar.html">Instalar a extensão</a><button type="button" class="ia-acao" id="iaConectar">Já instalei: conectar</button></div>', 'ia-info');
    const c = b.querySelector('#iaConectar');
    if (c) c.addEventListener('click', () => { fechar(); if (typeof abrirSheet === 'function') abrirSheet(); });
  }
  /* ---------- conversas anteriores ---------- */
  const hist = $('iaHist'), histLista = $('iaHistLista');
  function renderHist(){
    const a = lerSalvas();
    if (!a.length) { histLista.innerHTML = '<div class="ia-hist-vazio">Nenhuma conversa salva ainda.</div>'; return; }
    histLista.innerHTML = a.map(c => '<div class="ia-hist-item"><button type="button" class="ia-hist-abrir" data-id="' + esc(c.id) + '"><b>' + esc(c.titulo) + '</b><small>' +
      esc(new Date(c.ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })) + ' · ' + c.msgs.filter(m => m.role === 'user').length + ' pergunta(s)</small></button>' +
      '<button type="button" class="ia-hist-del" data-del="' + esc(c.id) + '" aria-label="Apagar esta conversa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button></div>').join('');
  }
  const bHist = $('iaHistorico');
  if (bHist && hist) {
    bHist.addEventListener('click', () => { renderHist(); hist.hidden = false; });
    $('iaHistFechar').addEventListener('click', () => { hist.hidden = true; });
    histLista.addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (del) { gravarSalvas(lerSalvas().filter(c => c.id !== del.dataset.del)); renderHist(); return; }
      const ab = e.target.closest('[data-id]'); if (!ab || ocupado) return;
      const c = lerSalvas().find(x => x.id === ab.dataset.id); if (!c) return;
      conversa = c.msgs.slice(); conversaId = c.id; msgs.innerHTML = ''; if (chips) chips.hidden = true;
      conversa.forEach(m => bolha(m.role === 'user' ? 'eu' : 'bot', m.role === 'user' ? '<p>' + esc(m.content).replace(/\n/g, '<br>') + '</p>' : md(m.content)));
      hist.hidden = true; rolar();
    });
    $('iaHistApagar').addEventListener('click', () => { if (confirm('Apagar todas as conversas salvas neste aparelho?')) { gravarSalvas([]); renderHist(); } });
  }

  function abrir(){ ov.classList.add('aberto'); if (!msgs.children.length) boasVindas(); setTimeout(() => campo.focus(), 250); }
  function fechar(){ ov.classList.remove('aberto'); fecharMenus(); if (hist) hist.hidden = true; }
  ['btnIA', 'btnIALateral', 'hojeBtnIA'].forEach(id => { const b = $(id); if (b) b.addEventListener('click', abrir); });
  const bf = $('iaFechar'); if (bf) bf.addEventListener('click', fechar);
  ov.addEventListener('click', e => { if (e.target === ov) fechar(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('aberto')) { if (hist && !hist.hidden) hist.hidden = true; else fechar(); } });
  window.abrirAssistente = abrir;
  atualizarEnviar();
})();

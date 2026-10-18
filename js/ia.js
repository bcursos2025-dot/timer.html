/* ============================================================
   ASSISTENTE DE ESTUDO (chat com IA), versão do site, igual ao da extensão:
   cabeçalho com Base de leis (PDF), Histórico, Chat temporário e Destaques;
   menu "+" (Pensar, Web, Pesquisa aprofundada: só com a extensão) e seletor de modelo.
   Usa as IAs gratuitas e sem cadastro que aceitam chamadas de um site:
   Pollinations, LLM7 e OVHcloud. Sem chave guardada aqui (o site é público).
   O contexto (perfil, prova, horas, pontos fracos) e os trechos da Base de leis
   são montados NO NAVEGADOR e vão junto com a pergunta. Os PDFs importados
   ficam só neste aparelho (IndexedDB). O histórico fica no localStorage.
   ============================================================ */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const ov = $('iaSheet'), msgs = $('iaMensagens'), campo = $('iaCampo'), enviar = $('iaEnviar'), chips = $('iaSugestoes'), folha = ov && ov.querySelector('.ia-folha');
  if (!ov || !msgs || !campo) return;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAX_ENTRADA = 1500, MAX_HISTORICO = 10, TEMPO_MAX_MS = 40000, MAX_SALVAS = 20;
  const LS_HIST = 'cb2_ia_conversas', LS_MODO = 'cb2_ia_modo', LS_DEST = 'cb2_ia_destaques';

  const PROVEDORES = [
    { id: 'pollinations', url: 'https://text.pollinations.ai/openai?referrer=concurseiro-blindado-site', modelos: ['openai'], chave: '' },
    { id: 'llm7', url: 'https://api.llm7.io/v1/chat/completions', modelos: ['default'], chave: 'unused' },
    { id: 'ovh', url: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions',
      modelos: ['gpt-oss-120b', 'Meta-Llama-3_3-70B-Instruct', 'Mistral-Small-3.2-24B-Instruct-2506'], chave: '' }
  ];
  const MODOS = { mini: '2.0 Mini', res: '2.5 Res' };      // o "2.5 PRO" exige a extensão

  let conversa = [], conversaId = null, ocupado = false, temporario = false, modo = 'mini';
  try {
    const m = localStorage.getItem(LS_MODO);
    modo = MODOS[m] ? m : (m === 'detalhada' ? 'res' : 'mini');
  } catch (e) { /* padrão */ }

  /* ---------- Base de leis (PDF): guardada no IndexedDB deste aparelho ---------- */
  const BD = { nome: 'cb2_ia_base', loja: 'pdfs' };
  function abrirBD(){
    return new Promise((res, rej) => {
      const r = indexedDB.open(BD.nome, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(BD.loja, { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function bdTodos(){ const db = await abrirBD(); return new Promise((res, rej) => { const q = db.transaction(BD.loja).objectStore(BD.loja).getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); }); }
  async function bdSalvar(o){ const db = await abrirBD(); return new Promise((res, rej) => { const t = db.transaction(BD.loja, 'readwrite'); t.objectStore(BD.loja).put(o); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
  async function bdRemover(id){ const db = await abrirBD(); return new Promise((res, rej) => { const t = db.transaction(BD.loja, 'readwrite'); t.objectStore(BD.loja).delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); }); }

  function carregarScript(src){
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('script')); document.head.appendChild(s); });
  }
  async function garantirPdfJs(){
    if (!window.pdfjsLib) await carregarScript('js/lib/pdfjs/pdf.min.js?v=1');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('js/lib/pdfjs/pdf.worker.min.js?v=1', location.href).href;
  }
  async function extrairTexto(buf, aoProgredir){
    await garantirPdfJs();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const paginas = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i); const c = await pg.getTextContent();
      paginas.push(c.items.map(it => it.str).join(' '));
      if (i % 10 === 0 || i === pdf.numPages) aoProgredir('Lendo página ' + i + ' de ' + pdf.numPages + '...');
    }
    return paginas;
  }
  // Divide por "Art. N" (lei brasileira); sem esse padrão, em blocos de ~1000 caracteres (mesma regra da extensão).
  function dividir(paginas){
    const texto = paginas.join('\n'), re = /Art\.?\s*\d+(?:\.\d+)?[ºª°A-Za-z\-]*\.?/g;
    const marcas = [...texto.matchAll(re)];
    const trechos = [];
    if (marcas.length < 3) {
      for (let i = 0; i < texto.length; i += 1000) { const t = texto.slice(i, i + 1000).trim(); if (t) trechos.push({ art: null, t }); }
      return trechos;
    }
    for (let i = 0; i < marcas.length; i++) {
      const ini = marcas[i].index, fim = i + 1 < marcas.length ? marcas[i + 1].index : texto.length;
      const t = texto.slice(ini, fim).trim().slice(0, 2000);
      if (t) trechos.push({ art: marcas[i][0].trim(), t });
    }
    return trechos;
  }
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const PARADAS = new Set('para como qual quais sobre entre porque pelo pela pelos pelas qual quando onde essa esse isso esta este aquele aquela uma umas uns dos das nos nas que com sem por mais menos muito pode deve ser sao foi era sua seu suas seus fazer faca explique resuma'.split(' '));
  async function buscarTrechos(pergunta){
    let leis = []; try { leis = await bdTodos(); } catch (e) { return []; }
    if (!leis.length) return [];
    const nArt = (String(pergunta).match(/art(?:igo)?\.?\s*(\d+)/i) || [])[1];
    const palavras = [...new Set(norm(pergunta).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !PARADAS.has(w)))];
    const cand = [];
    leis.forEach(l => l.trechos.forEach(tr => {
      const alvo = norm(tr.t); let pts = 0;
      if (nArt && tr.art && new RegExp('^art\\.?\\s*' + nArt + '(?!\\d)', 'i').test(norm(tr.art))) pts += 100;
      palavras.forEach(w => { const m = alvo.split(w).length - 1; if (m) pts += Math.min(m, 4) * (w.length >= 7 ? 2 : 1); });
      if (pts >= 3) cand.push({ pts, nome: l.nome, art: tr.art, t: tr.t });
    }));
    return cand.sort((a, b) => b.pts - a.pts).slice(0, 4);
  }

  /* ---------- contexto do estudo (só lido do aparelho) ---------- */
  function msDoDia(chave){
    let a = 0, b = 0;
    try { a = Number(historico[chave]) || 0; } catch (e) { /* sem histórico */ }
    try { b = Number((estadoExtensao && estadoExtensao.historico || {})[chave]) || 0; } catch (e) { /* sem extensão */ }
    return Math.max(a, b);
  }
  const horas = ms => (ms / 3600000).toFixed(1).replace('.', ',');
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
      const reg = JSON.parse(localStorage.getItem('cb2_desempenho') || '[]'), por = {};
      reg.forEach(r => { if (r && r.disc && r.n > 0) { const x = por[r.disc] || (por[r.disc] = { n: 0, ok: 0 }); x.n += r.n; x.ok += r.ok || 0; } });
      const lista = Object.keys(por).map(k => ({ k, n: por[k].n, p: Math.round(por[k].ok / por[k].n * 100) })).filter(x => x.n >= 5).sort((a, b) => a.p - b.p);
      if (lista.length) linhas.push('Desempenho em questões (menor acerto primeiro): ' + lista.slice(0, 5).map(x => x.k + ' ' + x.p + '% (' + x.n + ' questões)').join('; ') + '.');
    } catch (e) { /* sem desempenho */ }
    return linhas.join(' ');
  }
  function sistema(trechos){
    let s = 'Você é o assistente de estudos da Norma, para quem se prepara para a OAB e concursos jurídicos no Brasil. ' +
      'Responda sempre em português do Brasil, de forma clara e amigável. ' +
      (modo === 'res' ? 'Seja didático: explique com exemplos e termine com uma dica curta de memorização (até uns 25 linhas). ' : 'Seja objetivo, com no máximo umas 12 linhas. ') +
      'Use listas curtas quando ajudar. Não use tabelas nem HTML. ' +
      'Seja honesto: nunca invente número de artigo, súmula, tema ou julgado; se não tiver certeza, diga e peça para conferir na lei (o site tem a aba Leis). ' +
      'Não dê consultoria jurídica para casos reais; foque em estudo, técnica, revisão e organização. ' +
      'Dados do aluno (use quando ajudar, sem repetir tudo): ' + contexto();
    if (trechos && trechos.length) {
      s += ' TRECHOS DA BASE DE LEIS DO ALUNO (PDFs que ele importou; quando usar, cite o arquivo e o artigo): ' +
        trechos.map(t => '[' + t.nome + (t.art ? ' — ' + t.art : '') + '] ' + t.t.slice(0, 1200)).join(' || ');
    }
    return s;
  }

  /* ---------- chamada às IAs (a primeira que responder vence) ---------- */
  async function chamar(prov, modelo, mensagens){
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TEMPO_MAX_MS);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (prov.chave) headers.Authorization = 'Bearer ' + prov.chave;
      const r = await fetch(prov.url, { method: 'POST', headers, signal: ctl.signal, body: JSON.stringify({ model: modelo, messages: mensagens, temperature: 0.4 }) });
      if (!r.ok) throw new Error(prov.id + '_' + r.status);
      const j = await r.json();
      const txt = String(j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      if (!txt) throw new Error(prov.id + '_vazia');
      return txt;
    } finally { clearTimeout(t); }
  }
  async function perguntar(trechos){
    const mensagens = [{ role: 'system', content: sistema(trechos) }].concat(conversa.slice(-MAX_HISTORICO));
    let ultimo = null;
    for (const prov of PROVEDORES) for (const modelo of prov.modelos) { try { return await chamar(prov, modelo, mensagens); } catch (e) { ultimo = e; } }
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

  /* ---------- conversas salvas neste aparelho (não grava no chat temporário) ---------- */
  function lerSalvas(){ try { const a = JSON.parse(localStorage.getItem(LS_HIST) || '[]'); return Array.isArray(a) ? a.filter(c => c && c.id && Array.isArray(c.msgs)) : []; } catch (e) { return []; } }
  function gravarSalvas(a){ try { localStorage.setItem(LS_HIST, JSON.stringify(a.slice(0, MAX_SALVAS))); } catch (e) { /* cheio */ } }
  function salvarAtual(){
    if (temporario || !conversa.length) return;
    if (!conversaId) conversaId = 'c' + Date.now();
    const a = lerSalvas().filter(c => c.id !== conversaId);
    a.unshift({ id: conversaId, titulo: String(conversa[0].content).replace(/\s+/g, ' ').slice(0, 60), ts: Date.now(), msgs: conversa.slice(-40) });
    gravarSalvas(a);
  }

  /* ---------- tela ---------- */
  const rolar = () => { msgs.scrollTop = msgs.scrollHeight; };
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
    fecharMenus(); ocupado = true; enviar.disabled = true; if (chips) chips.hidden = true;
    bolha('eu', '<p>' + esc(texto).replace(/\n/g, '<br>') + '</p>');
    conversa.push({ role: 'user', content: texto });
    campo.value = ''; ajustarCampo();
    const digitando = bolha('bot', '<span class="ia-ponto"></span><span class="ia-ponto"></span><span class="ia-ponto"></span>', 'ia-digitando');
    try {
      const trechos = await buscarTrechos(texto);
      const resp = await perguntar(trechos);
      digitando.remove();
      conversa.push({ role: 'assistant', content: resp });
      let fontes = '';
      if (trechos.length) {
        const nomes = [...new Set(trechos.map(t => t.nome + (t.art ? ' · ' + t.art : '')))].slice(0, 4);
        fontes = '<div class="ia-fontes"><span>Da sua base de leis:</span>' + nomes.map(n => '<i>' + esc(n) + '</i>').join('') + '</div>';
      }
      bolha('bot', md(resp) + fontes);
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

  /* ---------- cabeçalho: chat temporário e destaques ---------- */
  const bTemp = $('iaTemp'), selo = $('iaTempSelo'), bDest = $('iaDestaques');
  if (bTemp) bTemp.addEventListener('click', () => {
    temporario = !temporario; bTemp.setAttribute('aria-pressed', String(temporario));
    if (selo) selo.hidden = !temporario; if (folha) folha.classList.toggle('ia-temporario', temporario);
    bTemp.title = temporario ? 'Chat temporário ligado: não salva no histórico' : 'Chat temporário: não salva no histórico';
  });
  function destaques(on){ if (folha) folha.classList.toggle('ia-sem-destaques', !on); if (bDest) { bDest.setAttribute('aria-pressed', String(on)); bDest.title = 'Destaques coloridos nas respostas: ' + (on ? 'ligados' : 'desligados'); } }
  let destOn = true; try { destOn = localStorage.getItem(LS_DEST) !== '0'; } catch (e) { /* padrão */ }
  destaques(destOn);
  if (bDest) bDest.addEventListener('click', () => { destOn = !destOn; try { localStorage.setItem(LS_DEST, destOn ? '1' : '0'); } catch (e) { /* ok */ } destaques(destOn); });

  /* ---------- menus: "+" (Pensar, Web, Pesquisa aprofundada) e modelo ---------- */
  const menuMais = $('iaMenuMais'), menuModo = $('iaMenuModo'), bMais = $('iaMais'), bModo = $('iaModo');
  function fecharMenus(){
    [menuMais, menuModo].forEach(m => { if (m) m.hidden = true; });
    [bMais, bModo].forEach(b => { if (b) b.setAttribute('aria-expanded', 'false'); });
  }
  function alternar(menu, botao){ const abrir = menu.hidden; fecharMenus(); if (abrir) { menu.hidden = false; botao.setAttribute('aria-expanded', 'true'); } }
  function mostrarModo(){
    const n = $('iaModoNome'); if (n) n.textContent = MODOS[modo];
    if (menuModo) menuModo.querySelectorAll('button[data-modo]').forEach(b => b.classList.toggle('ia-opt-ativo', b.dataset.modo === modo));
  }
  if (bMais && menuMais) bMais.addEventListener('click', e => { e.stopPropagation(); alternar(menuMais, bMais); });
  if (bModo && menuModo) bModo.addEventListener('click', e => { e.stopPropagation(); alternar(menuModo, bModo); });
  if (menuMais) menuMais.addEventListener('click', e => { const b = e.target.closest('button[data-rec]'); if (b) { fecharMenus(); avisoExtensao(b.dataset.rec); } });
  if (menuModo) menuModo.addEventListener('click', e => {
    const b = e.target.closest('button[data-modo]'); if (!b) return;
    if (b.dataset.modo === 'pro') { fecharMenus(); avisoExtensao('pro'); return; }
    modo = b.dataset.modo; try { localStorage.setItem(LS_MODO, modo); } catch (er) { /* ok */ }
    mostrarModo(); fecharMenus();
  });
  document.addEventListener('click', e => { if (!e.target.closest('.ia-menu, #iaMais, #iaModo')) fecharMenus(); });
  mostrarModo();

  /* ---------- recursos que só existem com a extensão sincronizada ---------- */
  const NOMES_REC = {
    pensar: ['Pensar', 'pesquisa lei, jurisprudência e doutrina antes de responder'],
    web: ['Web', 'pesquisa na internet antes de responder'],
    profunda: ['Pesquisa aprofundada', 'busca em 3 frentes (web + súmulas) e escreve um relatório com fontes'],
    pro: ['2.5 PRO', 'dá respostas jurídicas bem mais precisas, conferidas nas fontes']
  };
  const pareado = () => { try { return !!(typeof deviceId !== 'undefined' && deviceId); } catch (e) { return false; } };
  function avisoExtensao(rec){
    const [nome, desc] = NOMES_REC[rec] || NOMES_REC.pro;
    const b = bolha('bot', pareado()
      ? '<p><strong>' + nome + '</strong> ' + desc + '. Isso roda <strong>dentro da extensão</strong>, e você já está sincronizado: abra o assistente por lá.</p>'
      : '<p><strong>' + nome + '</strong> ' + desc + '. Só funciona com a <strong>extensão instalada e sincronizada</strong> com o site.</p>' +
        '<div class="ia-acoes">' + ((window.cbEhCelular && window.cbEhCelular()) ? '<button type="button" class="ia-acao ia-acao-prim" data-enviar-pc>Enviar o link para o PC</button><button type="button" class="ia-acao" id="iaConectar">Já instalei no PC: conectar</button>' : '<a class="ia-acao ia-acao-prim" href="instalar.html">Instalar a extensão</a><button type="button" class="ia-acao" id="iaConectar">Já instalei: conectar</button>') + '</div>', 'ia-info');
    const c = b.querySelector('#iaConectar');
    if (c) c.addEventListener('click', () => { fechar(); if (typeof abrirSheet === 'function') abrirSheet(); });
  }

  /* ---------- Histórico ---------- */
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

  /* ---------- Base de leis (PDF) ---------- */
  const leisPainel = $('iaLeis'), leisLista = $('iaLeisLista'), leisStatus = $('iaLeisStatus'), leisArq = $('iaLeisArquivo'), leisBt = $('iaLeisImportar');
  async function renderLeis(){
    let leis = []; try { leis = await bdTodos(); } catch (e) { leisLista.innerHTML = '<p class="ia-hist-vazio">Seu navegador bloqueou o armazenamento local, então não dá para guardar PDFs aqui.</p>'; return; }
    if (!leis.length) { leisLista.innerHTML = '<p class="ia-hist-vazio">Nenhuma lei importada ainda. Importe um PDF abaixo: a IA vai citar os artigos de verdade dele nas respostas.</p>'; return; }
    leisLista.innerHTML = leis.map(l => '<div class="ia-hist-item"><div class="ia-hist-abrir"><b>' + esc(l.nome) + '</b><small>' + l.trechos.length + ' trechos · importado em ' + esc(new Date(l.ts).toLocaleDateString('pt-BR')) + '</small></div>' +
      '<button type="button" class="ia-hist-del" data-rem="' + esc(l.id) + '" aria-label="Remover ' + esc(l.nome) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button></div>').join('');
  }
  async function importar(arq){
    if (!arq || !/pdf$/i.test(arq.type || arq.name)) { leisStatus.textContent = 'Escolha um arquivo PDF.'; return; }
    leisBt.disabled = true; leisStatus.textContent = 'Lendo o PDF...';
    try {
      const paginas = await extrairTexto(await arq.arrayBuffer(), t => { leisStatus.textContent = t; });
      leisStatus.textContent = 'Dividindo em artigos...';
      const trechos = dividir(paginas);
      if (!trechos.length) throw new Error('Não consegui extrair texto desse PDF (pode ser um PDF escaneado, só imagem).');
      await bdSalvar({ id: 'l' + Date.now(), nome: arq.name.replace(/\.pdf$/i, ''), ts: Date.now(), trechos });
      leisStatus.textContent = 'Pronto: ' + trechos.length + ' trechos importados.';
      renderLeis();
    } catch (e) { leisStatus.textContent = (e && e.message && !/script/.test(e.message)) ? e.message : 'Não consegui ler esse PDF. Confira a internet e tente de novo.'; }
    finally { leisBt.disabled = false; leisArq.value = ''; }
  }
  const bLeis = $('iaLeisAbrir');
  if (bLeis && leisPainel) {
    bLeis.addEventListener('click', () => { leisStatus.textContent = ''; renderLeis(); leisPainel.hidden = false; });
    $('iaLeisFechar').addEventListener('click', () => { leisPainel.hidden = true; });
    leisBt.addEventListener('click', () => leisArq.click());
    leisArq.addEventListener('change', () => { if (leisArq.files[0]) importar(leisArq.files[0]); });
    leisLista.addEventListener('click', async e => { const r = e.target.closest('[data-rem]'); if (r) { await bdRemover(r.dataset.rem); renderLeis(); } });
  }

  function abrir(){ ov.classList.add('aberto'); if (!msgs.children.length) boasVindas(); setTimeout(() => campo.focus(), 250); }
  function fechar(){ ov.classList.remove('aberto'); fecharMenus(); if (hist) hist.hidden = true; if (leisPainel) leisPainel.hidden = true; }
  ['btnIA', 'btnIALateral', 'hojeBtnIA'].forEach(id => { const b = $(id); if (b) b.addEventListener('click', abrir); });
  const bf = $('iaFechar'); if (bf) bf.addEventListener('click', fechar);
  ov.addEventListener('click', e => { if (e.target === ov) fechar(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !ov.classList.contains('aberto')) return;
    if (leisPainel && !leisPainel.hidden) leisPainel.hidden = true; else if (hist && !hist.hidden) hist.hidden = true; else fechar();
  });
  window.abrirAssistente = abrir;
  atualizarEnviar();
})();

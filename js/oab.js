/* ============================================================
   QUESTÕES DA OAB (oab.html)
   Arquitetura: data/oab/indice.json (leve) lista os exames; cada exame é um arquivo data/oab/<id>.json,
   baixado só quando a pessoa abre aquele exame (e guardado pelo navegador/service worker).
   Armazenamento local:
     cb2_oab_progresso = { "<id da questão>": { r:'B', ok:true|false, d:'AAAA-MM-DD', n:tentativas } }
     cb2_oab_ultimo    = { exame:'<id>' }
     cb2_desempenho    = registros do Painel; cada PRIMEIRA resposta soma 1 em disciplina+assunto do dia
   Todo texto vindo dos arquivos é inserido com textContent (nunca innerHTML).
   ============================================================ */
(function(){
  'use strict';

  const LS_PROG = 'cb2_oab_progresso', LS_ULT = 'cb2_oab_ultimo', LS_DESEMP = 'cb2_desempenho';
  const $ = id => document.getElementById(id);
  const selExame = $('selExame'), selDisc = $('selDisc'), selFiltro = $('selFiltro');

  const estado = { indice: null, exame: null, lista: [], pos: 0 };
  const cache = {};

  function lsLer(chave, padrao){ try { const v = localStorage.getItem(chave); return v == null ? padrao : JSON.parse(v); } catch (e) { return padrao; } }
  function lsGravar(chave, valor){ try { localStorage.setItem(chave, JSON.stringify(valor)); return true; } catch (e) { return false; } }

  function el(tag, classe, texto){
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
  }
  function hoje(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  let progresso = lsLer(LS_PROG, {});
  if (!progresso || typeof progresso !== 'object' || Array.isArray(progresso)) progresso = {};

  // Questão "só gabarito" (prova anterior): sem enunciado nem texto das alternativas; a pessoa lê a prova oficial (PDF) e marca A–D aqui.
  const ehGabarito = q => !q.enunciado;
  const letras = q => q.alternativas ? Object.keys(q.alternativas).sort() : ['A', 'B', 'C', 'D'];
  // só aceitamos link https (o arquivo do exame pode ter sido editado à mão)
  const urlSegura = u => (typeof u === 'string' && /^https:\/\/[^\s]+$/i.test(u)) ? u : null;

  // resposta atual da questão (null se nunca respondida ou se foi zerada para refazer)
  const atual = id => (progresso[id] && progresso[id].r) ? progresso[id] : null;
  function limparResposta(id){ if (progresso[id]) { progresso[id].r = null; progresso[id].ok = false; } }

  function erro(texto){ const m = $('msgErro'); m.textContent = texto; m.hidden = !texto; }

  /* ---------- carregar dados ---------- */
  async function buscarJson(url){
    const r = await fetch(url, { cache: 'default' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function carregarIndice(){
    try {
      estado.indice = await buscarJson('data/oab/indice.json');
      if (!estado.indice || !Array.isArray(estado.indice.exames) || !estado.indice.exames.length) throw new Error('índice vazio');
    } catch (e) {
      erro('Não consegui carregar a lista de exames. Verifique sua internet e recarregue a página.');
      return false;
    }
    selExame.textContent = '';
    estado.indice.exames.forEach(x => {
      const o = el('option', null, x.titulo + ' (' + x.total + ' questões)');
      o.value = x.id; selExame.append(o);
    });
    const ult = lsLer(LS_ULT, null);
    if (ult && estado.indice.exames.some(x => x.id === ult.exame)) selExame.value = ult.exame;
    return true;
  }

  async function abrirExame(id){
    erro('');
    const meta = estado.indice.exames.find(x => x.id === id);
    if (!meta) return;
    $('boxQuestao').hidden = true; $('boxVazio').hidden = true;
    try {
      if (!cache[id]) cache[id] = await buscarJson('data/oab/' + encodeURIComponent(meta.arquivo));
    } catch (e) {
      erro('Não consegui baixar este exame (' + meta.titulo + '). Verifique sua internet e tente de novo.');
      return;
    }
    estado.exame = cache[id];
    lsGravar(LS_ULT, { exame: id });
    const aviso = $('avisoBanco');
    aviso.textContent = '';
    if (estado.exame.aviso) { aviso.append(el('b', null, 'Sobre este banco'), el('p', null, estado.exame.aviso)); aviso.hidden = false; }
    else aviso.hidden = true;

    const discs = Array.from(new Set(estado.exame.questoes.map(q => q.disciplina))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    selDisc.textContent = '';
    const todas = el('option', null, 'Todas'); todas.value = ''; selDisc.append(todas);
    discs.forEach(d => { const o = el('option', null, d); o.value = d; selDisc.append(o); });
    aplicarFiltros();
  }

  /* ---------- filtros ---------- */
  function aplicarFiltros(){
    const disc = selDisc.value, f = selFiltro.value;
    estado.lista = estado.exame.questoes.filter(q => {
      if (disc && q.disciplina !== disc) return false;
      const p = atual(q.id);
      if (f === 'novas') return !p;
      if (f === 'erradas') return Boolean(p) && !p.ok;
      return true;
    });
    estado.pos = 0;
    pintarPlacar();
    pintar();
  }

  function pintarPlacar(){
    const qs = estado.exame.questoes;
    let resp = 0, certas = 0;
    qs.forEach(q => { const p = atual(q.id); if (p) { resp++; if (p.ok) certas++; } });
    const box = $('placar');
    box.textContent = '';
    const item = (n, rot) => { const s = el('span'); s.append(el('b', null, String(n)), document.createTextNode(rot)); return s; };
    box.append(item(resp + '/' + qs.length, 'respondidas'), item(resp ? Math.round(certas / resp * 100) + '%' : '—', 'de acerto'),
      item(resp - certas, 'para revisar'));
  }

  /* ---------- questão ---------- */
  function linkLei(f){
    if (!f || !f.lei) return null;
    const m = /art\.?\s*(\d+)/i.exec(f.dispositivo || '');
    return 'leis.html#' + encodeURIComponent(f.lei) + (m ? '/' + m[1] : '');
  }

  function pintar(){
    const box = $('boxQuestao'), vazio = $('boxVazio');
    if (!estado.lista.length) {
      box.hidden = true; vazio.hidden = false;
      vazio.textContent = selFiltro.value === 'erradas' ? 'Você não tem questões erradas neste filtro. Bom trabalho!'
        : selFiltro.value === 'novas' ? 'Você já respondeu todas as questões deste filtro.' : 'Nenhuma questão neste filtro.';
      return;
    }
    vazio.hidden = true; box.hidden = false;
    const q = estado.lista[estado.pos];
    $('qEtiqueta').textContent = (q.numero ? 'Questão ' + q.numero + ' · ' : '') + q.disciplina + (q.assunto ? ' · ' + q.assunto : '');
    $('qPos').textContent = (estado.pos + 1) + ' de ' + estado.lista.length;
    const prova = $('qProva'); prova.textContent = ''; prova.hidden = true;
    if (ehGabarito(q)) {
      $('qEnunciado').textContent = 'Abra a prova oficial, leia a questão' + (q.numero ? ' ' + q.numero : '') + ' e marque aqui a alternativa que você escolheria.';
      const ex = estado.exame, base = urlSegura(ex.pdf_prova);
      const a = el('a', 'btn pequeno', base ? 'Abrir a prova oficial (PDF)' : 'Procurar a prova no site da FGV');
      a.href = base ? base + (q.pagina ? '#page=' + encodeURIComponent(q.pagina) : '') : 'https://oab.fgv.br/';
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      prova.append(a); prova.hidden = false;
    } else {
      $('qEnunciado').textContent = q.enunciado;
      const base = urlSegura(estado.exame.pdf_prova);
      if (base) {
        const a = el('a', 'btn pequeno', 'Ver na prova original (PDF)');
        a.href = base + (q.pagina ? '#page=' + encodeURIComponent(q.pagina) : '');
        a.target = '_blank'; a.rel = 'noopener noreferrer';
        prova.append(a); prova.hidden = false;
      }
    }
    const alts = $('qAlts'); alts.textContent = '';
    const p = atual(q.id);
    letras(q).forEach(letra => {
      const b = el('button', 'o-alt' + (ehGabarito(q) ? ' so-letra' : '')); b.type = 'button'; b.dataset.letra = letra;
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false');
      b.append(el('span', 'letra', letra));
      if (q.alternativas) b.append(el('span', 'txt', q.alternativas[letra]));
      else b.setAttribute('aria-label', 'Alternativa ' + letra);
      b.addEventListener('click', () => responder(letra));
      alts.append(b);
    });
    $('qFeedback').hidden = true;
    if (p) mostrarResposta(q, p.r, true);
    $('btnAnterior').disabled = estado.pos === 0;
    $('btnProxima').disabled = estado.pos >= estado.lista.length - 1;
  }

  function mostrarResposta(q, letra, jaRespondida){
    const certa = Boolean(q.anulada) || letra === q.gabarito;
    document.querySelectorAll('#qAlts .o-alt').forEach(b => {
      b.disabled = true;
      if (b.dataset.letra === q.gabarito) b.classList.add('certa');
      else if (b.dataset.letra === letra) b.classList.add('errada');
      b.setAttribute('aria-checked', b.dataset.letra === letra ? 'true' : 'false');
    });
    const fb = $('qFeedback'); fb.textContent = '';
    fb.className = 'o-feedback ' + (certa ? 'ok' : 'erro');
    fb.append(el('b', null, q.anulada ? 'Questão anulada pela banca: vale como acerto para todos'
      : certa ? 'Resposta certa' : 'Resposta errada: o gabarito é a alternativa ' + q.gabarito));
    // Comentário só aparece quando tem autor (professor ou aluno). O texto gerado por IA no banco original NÃO é exibido como comentário.
    if (q.comentario && q.comentario_por) {
      fb.append(el('p', null, q.comentario), el('p', 'o-fonte', 'Comentário de ' + q.comentario_por));
    } else if (q.fonte && q.fonte.trecho) {
      fb.append(el('p', null, 'Trecho da lei: “' + q.fonte.trecho + '”'));
    }
    if (q.fonte && q.fonte.dispositivo) {
      const p = el('p', 'o-fonte');
      p.append(document.createTextNode('Base legal: ' + q.fonte.dispositivo + '. '));
      const href = linkLei(q.fonte);
      if (href) { const a = el('a', null, 'Abrir o artigo na lei'); a.href = href; p.append(a); }
      fb.append(p);
    }
    const refazer = el('button', 'btn pequeno', 'Refazer esta questão'); refazer.type = 'button';
    refazer.addEventListener('click', () => { limparResposta(q.id); lsGravar(LS_PROG, progresso); pintarPlacar(); pintar(); });
    fb.append(refazer);
    fb.hidden = false;
  }

  function registrarDesempenho(q){
    let regs = lsLer(LS_DESEMP, []);
    if (!Array.isArray(regs)) regs = [];
    const d = hoje(), id = 'oab|' + d + '|' + q.disciplina + '|' + (q.assunto || '');
    let r = regs.find(x => x && x.id === id);
    if (!r) { r = { id, d, disc: q.disciplina, ass: (q.assunto || '').slice(0, 60), fonte: 'Norma (OAB)', n: 0, ok: 0, ts: Date.now() }; regs.push(r); }
    r.n += 1; if (progresso[q.id].ok) r.ok += 1;
    lsGravar(LS_DESEMP, regs);
  }

  function responder(letra){
    const q = estado.lista[estado.pos];
    if (atual(q.id)) return;
    const antes = progresso[q.id] || { n: 0 };
    progresso[q.id] = { r: letra, ok: Boolean(q.anulada) || letra === q.gabarito, d: hoje(), n: (antes.n || 0) + 1, vez: antes.vez || 0 };
    // só a primeira resposta de cada questão entra no Painel (refazer não infla o desempenho)
    if (!antes.vez) { progresso[q.id].vez = 1; registrarDesempenho(q); }
    lsGravar(LS_PROG, progresso);
    mostrarResposta(q, letra, false);
    pintarPlacar();
  }

  function ir(delta){
    const nova = estado.pos + delta;
    if (nova < 0 || nova >= estado.lista.length) return;
    estado.pos = nova; pintar();
    $('boxQuestao').scrollIntoView({ block: 'start' });
  }

  /* ---------- eventos ---------- */
  selExame.addEventListener('change', () => abrirExame(selExame.value));
  selDisc.addEventListener('change', aplicarFiltros);
  selFiltro.addEventListener('change', aplicarFiltros);
  $('btnAnterior').addEventListener('click', () => ir(-1));
  $('btnProxima').addEventListener('click', () => ir(1));
  $('btnZerar').addEventListener('click', () => {
    if (!estado.exame || !confirm('Zerar o progresso deste exame? Seu histórico no Painel não é apagado.')) return;
    estado.exame.questoes.forEach(q => limparResposta(q.id));
    lsGravar(LS_PROG, progresso);
    aplicarFiltros();
  });
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target && e.target.tagName;
    if (t === 'SELECT' || t === 'INPUT' || t === 'TEXTAREA') return;
    if ($('boxQuestao').hidden) return;
    const k = e.key.toUpperCase();
    if (/^[A-E]$/.test(k) && estado.lista.length) {
      const q = estado.lista[estado.pos];
      if (letras(q).includes(k) && !atual(q.id)) { e.preventDefault(); responder(k); }
    } else if (e.key === 'ArrowRight') { e.preventDefault(); ir(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); ir(-1); }
  });

  carregarIndice().then(ok => { if (ok) abrirExame(selExame.value); });
})();

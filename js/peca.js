/* ============================================================
   CORREÇÃO DE PEÇA POR IA (peca.html)
   Endereço do serviço: window.CB_PECA_ENDPOINT, definido em js/peca-config.js (arquivo que o dono do site cria
   depois de publicar worker/index.js). Sem ele, a tela avisa "ainda não ativada" e NÃO gera nota nenhuma.
   Armazenamento local:
     cb2_peca_rascunho  = { modo, tipo, enunciado, peca, espelho, ts }
     cb2_peca_historico = [ { id, ts, modo, tipo, enunciado, peca, resultado, simulada } ]  (mais novo primeiro)
     cb2_peca_ciente    = "1"  (ciência de que o texto vai para um servidor externo)
   Todo texto vindo do servidor é inserido com textContent (nunca innerHTML).
   ============================================================ */
(function(){
  'use strict';

  const LS_RASC = 'cb2_peca_rascunho', LS_HIST = 'cb2_peca_historico', LS_CIENTE = 'cb2_peca_ciente';
  // Os limites e os tipos precisam bater com worker/index.js.
  const LIM = { enunciado: 6000, peca: 20000, espelho: 4000, minEnunciado: 40, minPeca: 200 };
  const HIST_MAX = 15;
  const TEMPO_MAX_MS = 70000;
  // Os ids dos tipos precisam bater com worker/index.js (TIPOS_OAB e TIPOS_PROC).
  const TIPOS_MODO = {
    oab: {
      peticao_inicial: 'Petição inicial', contestacao: 'Contestação', apelacao: 'Recurso de apelação',
      agravo_instrumento: 'Agravo de instrumento', embargos_execucao: 'Embargos à execução', mandado_seguranca: 'Mandado de segurança',
      habeas_corpus: 'Habeas corpus', resposta_acusacao: 'Resposta à acusação', alegacoes_finais: 'Alegações finais (memoriais)',
      reclamacao_trabalhista: 'Reclamação trabalhista', recurso_ordinario: 'Recurso ordinário (trabalhista)', outra: 'Outra peça (deduzir pelo enunciado)',
    },
    procurador: {
      proc_parecer: 'Parecer jurídico', proc_contestacao: 'Contestação (Fazenda Pública)', proc_apelacao: 'Apelação / contrarrazões (Fazenda Pública)',
      proc_agravo: 'Agravo de instrumento (Fazenda Pública)', proc_mandado_seguranca: 'Informações / defesa em mandado de segurança',
      proc_execucao_fiscal: 'Execução fiscal (embargos, exceção de pré-executividade)', proc_acao_civil_publica: 'Defesa em ação civil pública / improbidade',
      proc_discursiva: 'Questão discursiva (dissertação)', proc_outra: 'Outra peça (deduzir pelo enunciado)',
    },
  };
  const DICA_MODO = {
    oab: 'Espelho genérico inspirado no padrão da FGV, com 8 quesitos que somam 5,00. Não é o espelho oficial da sua prova.',
    procurador: 'Espelho genérico de concurso de Procurador, com 8 quesitos que somam 10,00. As bancas variam (FGV, Cebraspe, FCC, Vunesp): se você tiver o espelho oficial, cole no campo opcional abaixo.',
  };
  const MODOS = Object.keys(TIPOS_MODO);
  const TIPOS = Object.assign({}, TIPOS_MODO.oab, TIPOS_MODO.procurador);
  const tiposDoModo = m => TIPOS_MODO[m] || TIPOS_MODO.oab;

  const $ = id => document.getElementById(id);
  const selTipo = $('selTipo'), txtE = $('txtEnunciado'), txtP = $('txtPeca'), txtEsp = $('txtEspelho');
  const radiosModo = Array.from(document.querySelectorAll('input[name="modo"]'));
  const form = $('form'), btnCorrigir = $('btnCorrigir'), btnLimpar = $('btnLimpar');
  const boxCiente = $('boxCiente'), chkCiente = $('chkCiente'), msgForm = $('msgForm');
  const secRes = $('resultado'), listaHist = $('listaHistorico'), btnApagarTudo = $('btnApagarTudo');

  const nf = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt = n => nf.format(n);
  const milhar = n => n.toLocaleString('pt-BR');

  /* ---------- armazenamento (tudo com try/catch) ---------- */
  function lsLer(chave, padrao){
    try { const v = localStorage.getItem(chave); return v == null ? padrao : JSON.parse(v); } catch (e) { return padrao; }
  }
  function lsGravar(chave, valor){
    try { localStorage.setItem(chave, JSON.stringify(valor)); return true; } catch (e) { return false; }
  }
  function lsApagar(chave){ try { localStorage.removeItem(chave); } catch (e) { /* bloqueado */ } }

  function el(tag, classe, texto){
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
  }

  /* ---------- endereço do serviço ---------- */
  function lerEndpoint(){
    const v = window.CB_PECA_ENDPOINT;
    if (v == null || v === '') return { estado: 'ausente' };
    if (typeof v !== 'string') return { estado: 'invalido' };
    try {
      const u = new URL(v.trim());
      const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
      if (u.protocol === 'https:' || (u.protocol === 'http:' && local)) return { estado: 'ok', url: u.href, host: u.host };
    } catch (e) { /* cai em inválido */ }
    return { estado: 'invalido' };
  }
  const EP = lerEndpoint();

  function pintarStatus(){
    const box = $('statusServico');
    box.textContent = '';
    box.className = 'p-aviso';
    if (EP.estado === 'ausente') {
      box.classList.add('atencao');
      box.append(el('b', null, 'Correção ainda não ativada'),
        el('p', null, 'Este site ainda não está conectado a um serviço de correção por IA, então nenhuma nota é gerada aqui. Você já pode escrever a peça: o rascunho fica salvo neste aparelho. O botão Corrigir só funciona depois que o serviço for ativado.'));
    } else if (EP.estado === 'invalido') {
      box.classList.add('erro');
      box.append(el('b', null, 'Endereço do serviço de correção inválido'),
        el('p', null, 'O endereço configurado para o serviço de correção não é válido (precisa começar com https://). Por isso a correção está desativada. Avise o administrador do site.'));
    } else {
      box.append(el('b', null, 'Serviço de correção conectado'),
        el('p', null, 'A correção é automática e orientativa. O texto que você enviar vai para o servidor de correção (' + EP.host + ') e para um provedor de IA.'));
    }
  }

  /* ---------- modo (OAB / Procurador) ---------- */
  function modoAtual(){ const r = radiosModo.find(x => x.checked); return r ? r.value : 'oab'; }
  function preencherTipos(modo, manter){
    const antes = manter || selTipo.value;
    selTipo.textContent = '';
    Object.entries(tiposDoModo(modo)).forEach(([id, nome]) => { const o = el('option', null, nome); o.value = id; selTipo.append(o); });
    if (tiposDoModo(modo)[antes]) selTipo.value = antes;
    $('dicaModo').textContent = DICA_MODO[modo] || '';
  }
  function definirModo(modo, tipo){
    const m = MODOS.includes(modo) ? modo : 'oab';
    radiosModo.forEach(r => { r.checked = r.value === m; });
    preencherTipos(m, tipo);
  }

  /* ---------- contadores ---------- */
  function contar(texto){
    const t = texto.trim();
    return { palavras: t ? t.split(/\s+/).length : 0, linhas: texto ? texto.split('\n').length : 0, chars: texto.length };
  }
  function pintarContador(alvo, texto, limite){
    const c = contar(texto);
    alvo.textContent = '';
    alvo.append(el('span', null, milhar(c.palavras) + (c.palavras === 1 ? ' palavra' : ' palavras')),
      el('span', null, milhar(c.linhas) + (c.linhas === 1 ? ' linha' : ' linhas')));
    const lim = el('span', null, milhar(c.chars) + ' / ' + milhar(limite) + ' caracteres');
    if (c.chars > limite) {
      lim.className = 'estouro';
      lim.textContent += ' — passou ' + milhar(c.chars - limite) + ' do limite';
    } else if (c.chars > limite * 0.9) lim.className = 'perto';
    alvo.append(lim);
  }
  function atualizarContadores(){
    pintarContador($('cntEnunciado'), txtE.value, LIM.enunciado);
    pintarContador($('cntPeca'), txtP.value, LIM.peca);
    pintarContador($('cntEspelho'), txtEsp.value, LIM.espelho);
  }

  /* ---------- rascunho ---------- */
  let timerRasc = null;
  function horaCurta(ts){ return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  function salvarRascunho(){
    const info = $('infoRascunho');
    if (!txtE.value && !txtP.value && !txtEsp.value) { lsApagar(LS_RASC); info.textContent = ''; return; }
    const ts = Date.now();
    info.textContent = lsGravar(LS_RASC, { modo: modoAtual(), tipo: selTipo.value, enunciado: txtE.value, peca: txtP.value, espelho: txtEsp.value, ts })
      ? 'Rascunho salvo neste aparelho às ' + horaCurta(ts) + '.'
      : 'Não consegui salvar o rascunho (armazenamento cheio ou bloqueado).';
  }
  function agendarRascunho(){ clearTimeout(timerRasc); timerRasc = setTimeout(salvarRascunho, 500); }
  function carregarRascunho(){
    const r = lsLer(LS_RASC, null);
    if (!r || typeof r !== 'object') return;
    definirModo(r.modo, typeof r.tipo === 'string' ? r.tipo : undefined);
    if (typeof r.espelho === 'string' && r.espelho) { txtEsp.value = r.espelho; $('boxEspelho').open = true; }
    if (typeof r.enunciado === 'string') txtE.value = r.enunciado;
    if (typeof r.peca === 'string') txtP.value = r.peca;
    if (r.ts && (r.enunciado || r.peca)) $('infoRascunho').textContent = 'Rascunho recuperado (salvo às ' + horaCurta(r.ts) + ').';
  }

  /* ---------- estado do botão / ciência ---------- */
  function pintarBotao(ocupado){
    boxCiente.hidden = EP.estado !== 'ok';
    btnCorrigir.disabled = EP.estado !== 'ok' || ocupado;
    btnCorrigir.textContent = ocupado ? 'Corrigindo…' : 'Corrigir';
    btnCorrigir.title = EP.estado === 'ok' ? '' : 'A correção ainda não está ativada neste site.';
  }

  function erroForm(texto, campo){
    msgForm.textContent = texto;
    msgForm.hidden = false;
    if (campo) campo.focus();
  }
  function limparErroForm(){ msgForm.hidden = true; msgForm.textContent = ''; }

  function validarForm(){
    const e = txtE.value.trim(), p = txtP.value.trim();
    if (e.length < LIM.minEnunciado) return ['Cole o enunciado do problema (mínimo de ' + LIM.minEnunciado + ' caracteres) para a IA saber qual peça é a cabível.', txtE];
    if (p.length < LIM.minPeca) return ['Sua peça está curta demais para ser corrigida (mínimo de ' + LIM.minPeca + ' caracteres). Escreva ou cole a peça completa.', txtP];
    if (txtEsp.value.length > LIM.espelho) return ['O espelho oficial passou do limite de ' + milhar(LIM.espelho) + ' caracteres. Reduza ' + milhar(txtEsp.value.length - LIM.espelho) + ' caracteres.', txtEsp];
    if (txtE.value.length > LIM.enunciado) return ['O enunciado passou do limite de ' + milhar(LIM.enunciado) + ' caracteres. Reduza ' + milhar(txtE.value.length - LIM.enunciado) + ' caracteres.', txtE];
    if (txtP.value.length > LIM.peca) return ['A peça passou do limite de ' + milhar(LIM.peca) + ' caracteres. Reduza ' + milhar(txtP.value.length - LIM.peca) + ' caracteres.', txtP];
    if (!chkCiente.checked) return ['Marque a caixa de ciência para enviar o texto à correção.', chkCiente];
    return null;
  }

  /* ---------- validação da resposta do servidor (nunca mostramos nota que não passe aqui) ---------- */
  function ehNumero(v){ return typeof v === 'number' && Number.isFinite(v); }
  function listaTextos(v){ return Array.isArray(v) && v.every(x => typeof x === 'string') ? v.map(x => x.trim()).filter(Boolean) : null; }

  function validarResultado(j){
    if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
    if (!ehNumero(j.nota) || !ehNumero(j.maximo) || j.maximo <= 0 || j.nota < 0 || j.nota > j.maximo) return null;
    if (!Array.isArray(j.quesitos) || !j.quesitos.length || j.quesitos.length > 20) return null;
    let soma = 0, somaMax = 0;
    const quesitos = [];
    for (const q of j.quesitos) {
      if (!q || typeof q !== 'object' || typeof q.nome !== 'string' || !q.nome.trim()) return null;
      if (!ehNumero(q.pontos) || !ehNumero(q.maximo) || q.maximo <= 0 || q.pontos < 0 || q.pontos > q.maximo) return null;
      if (typeof q.comentario !== 'string') return null;
      soma += q.pontos; somaMax += q.maximo;
      quesitos.push({ nome: q.nome.trim(), pontos: q.pontos, maximo: q.maximo, comentario: q.comentario.trim() });
    }
    if (Math.abs(soma - j.nota) > 0.011 || Math.abs(somaMax - j.maximo) > 0.011) return null;   // nota que não fecha com a tabela = inválida
    const faltou = listaTextos(j.faltou), melhorar = listaTextos(j.melhorar);
    if (!faltou || !melhorar) return null;
    return { nota: j.nota, maximo: j.maximo, quesitos, faltou, melhorar };
  }

  /* ---------- mensagens de erro humanas ---------- */
  function espera(seg){
    if (!ehNumero(seg) || seg <= 0) return '';
    if (seg < 90) return 'alguns instantes';
    if (seg < 5400) return 'cerca de ' + Math.ceil(seg / 60) + ' minutos';
    return 'cerca de ' + Math.ceil(seg / 3600) + ' horas';
  }

  function erroPorStatus(status, resp, corpo){
    const msgServidor = corpo && typeof corpo.mensagem === 'string' ? corpo.mensagem.slice(0, 300) : '';
    if (status === 429) {
      let seg = parseInt(resp.headers.get('Retry-After') || '', 10);
      if (!(seg > 0) && corpo && ehNumero(corpo.retry_apos)) seg = corpo.retry_apos;
      const quando = espera(seg);
      return { titulo: 'Limite de correções atingido', texto: (msgServidor || 'Você fez correções demais em pouco tempo.') + (quando && msgServidor.indexOf(quando) < 0 ? ' Tente novamente em ' + quando + '.' : ''), tentar: false };
    }
    if (status === 400 || status === 413 || status === 415 || status === 422)
      return { titulo: 'O servidor não aceitou o texto', texto: msgServidor || 'O texto enviado está fora do que o serviço aceita. Confira os limites e tente de novo.', tentar: false };
    if (status === 403)
      return { titulo: 'Este site não está autorizado', texto: 'O serviço de correção recusou o pedido deste site. Avise o administrador do site.', tentar: false };
    if (status === 404)
      return { titulo: 'Serviço não encontrado', texto: 'O endereço do serviço de correção não responde como esperado. Avise o administrador do site.', tentar: false };
    if (status === 502 && corpo && corpo.erro === 'resposta_invalida')
      return { titulo: 'Correção em formato inválido', texto: 'A IA devolveu uma correção que não consegui validar. Nenhuma nota foi gerada. Tente de novo; costuma funcionar na segunda vez.', tentar: true };
    if (status === 503 && corpo && corpo.erro === 'nao_configurado')
      return { titulo: 'Serviço ainda não configurado', texto: 'O servidor de correção existe, mas ainda não foi configurado por completo. Nenhuma nota foi gerada.', tentar: false };
    if (status >= 500)
      return { titulo: 'Serviço indisponível agora', texto: (msgServidor || 'O serviço de correção está fora do ar ou sobrecarregado.') + ' Nenhuma nota foi gerada.', tentar: true };
    return { titulo: 'Não foi possível corrigir', texto: 'O serviço respondeu com um erro inesperado (código ' + status + '). Nenhuma nota foi gerada.', tentar: true };
  }

  /* ---------- exibição ---------- */
  let ctrlAtual = null;

  function mostrarRes(){ secRes.hidden = false; }
  function focarResultado(){
    secRes.tabIndex = -1;
    const reduz = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    secRes.scrollIntoView({ behavior: reduz ? 'auto' : 'smooth', block: 'start' });
    secRes.focus({ preventScroll: true });
  }

  function mostrarCarregando(){
    secRes.textContent = '';
    const card = el('div', 'p-card');
    const linha = el('div', 'p-carregando');
    linha.setAttribute('role', 'status');
    const txt = el('div', 'txt');
    txt.append(el('b', null, 'Corrigindo a sua peça…'),
      el('span', 'sub', 'A IA está lendo o enunciado e a peça. Isso pode levar de alguns segundos até cerca de um minuto. Não feche esta página.'));
    const cancelar = el('button', 'btn pequeno', 'Cancelar');
    cancelar.type = 'button';
    cancelar.addEventListener('click', () => { if (ctrlAtual) { ctrlAtual.cancelado = true; ctrlAtual.abort(); } });
    linha.append(el('div', 'p-giro'), txt, cancelar);
    card.append(linha);
    secRes.append(card);
    mostrarRes();
  }

  function mostrarErro(info){
    secRes.textContent = '';
    const card = el('div', 'p-card p-erro-card');
    card.setAttribute('role', 'alert');
    card.append(el('h3', null, info.titulo), el('p', null, info.texto));
    if (info.tentar && EP.estado === 'ok') {
      const b = el('button', 'btn pequeno', 'Tentar de novo');
      b.type = 'button';
      b.addEventListener('click', () => form.requestSubmit());
      card.append(b);
    }
    secRes.append(card);
    mostrarRes();
    focarResultado();
  }

  function mostrarResultado(res, meta){
    secRes.textContent = '';

    const topo = el('div', 'p-card');
    const linha = el('div', 'p-nota-topo');
    const bloco = el('div');
    bloco.append(el('div', 'p-nota-rotulo', 'Nota da peça'));
    const nota = el('div', 'p-nota', fmt(res.nota));
    nota.append(el('small', null, 'de ' + fmt(res.maximo)));
    bloco.append(nota);
    linha.append(bloco);
    if (meta && meta.simulada) linha.append(el('span', 'p-selo', 'RESPOSTA SIMULADA DE TESTE — não é correção real'));
    topo.append(linha);
    const barra = el('div', 'p-barra');
    barra.setAttribute('role', 'img');
    barra.setAttribute('aria-label', 'Nota ' + fmt(res.nota) + ' de ' + fmt(res.maximo));
    const preench = document.createElement('i');
    preench.style.width = Math.max(0, Math.min(100, res.nota / res.maximo * 100)).toFixed(1) + '%';
    barra.append(preench);
    topo.append(barra);
    if (meta && meta.tipo) topo.append(el('p', 'p-hist-ajuda', 'Peça indicada: ' + (TIPOS[meta.tipo] || meta.tipo) + (meta.modo === 'procurador' ? ' · Procurador' : ' · OAB') + (meta.ts ? ' · ' + new Date(meta.ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '')));
    secRes.append(topo);

    const cardTab = el('div', 'p-card');
    const tab = el('table', 'p-tabela');
    tab.append(el('caption', null, 'Pontuação por quesito'));
    const th = document.createElement('thead');
    const trh = document.createElement('tr');
    ['Quesito', 'Pontos', 'Comentário'].forEach(t => { const c = el('th', null, t); c.scope = 'col'; trh.append(c); });
    th.append(trh); tab.append(th);
    const tb = document.createElement('tbody');
    res.quesitos.forEach(q => {
      const tr = document.createElement('tr');
      const nome = el('th', null, q.nome); nome.scope = 'row';
      const pts = el('td', 'pts', fmt(q.pontos) + ' '); pts.append(el('span', null, '/ ' + fmt(q.maximo)));
      tr.append(nome, pts, el('td', 'com', q.comentario || '—'));
      tb.append(tr);
    });
    tab.append(tb);
    cardTab.append(tab);
    secRes.append(cardTab);

    const listas = el('div', 'p-listas');
    [['O que faltou', res.faltou, 'Nenhuma falta apontada pela IA.'], ['Como melhorar', res.melhorar, 'Nenhuma sugestão adicional da IA.']].forEach(([titulo, itens, vazio]) => {
      const c = el('div', 'p-card');
      c.append(el('h3', null, titulo));
      if (itens.length) { const ul = document.createElement('ul'); itens.forEach(t => ul.append(el('li', null, t))); c.append(ul); }
      else c.append(el('p', 'p-vazio', vazio));
      listas.append(c);
    });
    secRes.append(listas);

    const aviso = el('div', 'p-disclaimer');
    aviso.append(el('b', null, 'Atenção: '),
      document.createTextNode('correção automática e orientativa; não substitui avaliação humana nem prevê a nota da banca. O espelho usado é genérico' + (meta && meta.modo === 'procurador' ? ' (concurso de Procurador)' : ' (inspirado no padrão FGV)') + ', não o espelho oficial da sua prova, e a IA pode errar, inclusive em citações de lei. Confira tudo com a legislação e com um professor.'));
    secRes.append(aviso);

    mostrarRes();
    focarResultado();
  }

  /* ---------- histórico ---------- */
  function lerHistorico(){
    const h = lsLer(LS_HIST, []);
    if (!Array.isArray(h)) return [];
    return h.filter(x => x && typeof x === 'object' && x.id && validarResultado(x.resultado));
  }
  function gravarHistorico(lista){
    let l = lista.slice(0, HIST_MAX);
    while (!lsGravar(LS_HIST, l)) {
      if (l.length <= 1) {
        // último recurso: guarda só o resultado, sem os textos longos
        l = l.map(x => Object.assign({}, x, { enunciado: '', peca: '' }));
        return lsGravar(LS_HIST, l);
      }
      l = l.slice(0, l.length - 1);
    }
    return true;
  }

  function adicionarAoHistorico(res, dados, simulada){
    const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), modo: dados.modo, tipo: dados.tipo,
      enunciado: dados.enunciado, peca: dados.peca, resultado: res, simulada: Boolean(simulada) };
    gravarHistorico([item].concat(lerHistorico()));
    pintarHistorico();
    return item;
  }

  function pintarHistorico(){
    const h = lerHistorico();
    listaHist.textContent = '';
    btnApagarTudo.hidden = !h.length;
    if (!h.length) {
      const li = el('li', 'p-hist-vazio', 'Nenhuma correção salva ainda. Quando você corrigir uma peça, o resultado aparece aqui.');
      listaHist.append(li);
      return;
    }
    h.forEach(item => {
      const li = el('li', 'p-hist-item');
      const nota = el('div', 'p-hist-nota', fmt(item.resultado.nota));
      nota.append(el('small', null, '/ ' + fmt(item.resultado.maximo)));
      const meta = el('div', 'p-hist-meta');
      meta.append(el('b', null, (TIPOS[item.tipo] || 'Peça') + (item.simulada ? ' (simulada)' : '')),
        el('span', null, new Date(item.ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + (item.enunciado ? ' · ' + item.enunciado.replace(/\s+/g, ' ').slice(0, 90) : '')));
      const bts = el('div', 'p-hist-bts');
      const ver = el('button', 'btn pequeno', 'Ver correção'); ver.type = 'button';
      ver.addEventListener('click', () => mostrarResultado(item.resultado, { simulada: item.simulada, modo: item.modo, tipo: item.tipo, ts: item.ts }));
      bts.append(ver);
      if (item.peca) {
        const reusar = el('button', 'btn pequeno', 'Reabrir texto'); reusar.type = 'button';
        reusar.addEventListener('click', () => {
          if ((txtE.value.trim() || txtP.value.trim()) && !confirm('Substituir o enunciado e a peça que estão nos campos agora?')) return;
          definirModo(item.modo, item.tipo);
          txtE.value = item.enunciado; txtP.value = item.peca;
          atualizarContadores(); salvarRascunho(); limparErroForm();
          txtP.scrollIntoView({ block: 'center' });
        });
        bts.append(reusar);
      }
      const apagar = el('button', 'btn pequeno', 'Apagar'); apagar.type = 'button';
      apagar.setAttribute('aria-label', 'Apagar esta correção do histórico');
      apagar.addEventListener('click', () => {
        if (!confirm('Apagar esta correção do histórico?')) return;
        gravarHistorico(lerHistorico().filter(x => x.id !== item.id));
        pintarHistorico();
      });
      bts.append(apagar);
      li.append(nota, meta, bts);
      listaHist.append(li);
    });
  }

  btnApagarTudo.addEventListener('click', () => {
    if (!confirm('Apagar TODO o histórico de correções deste navegador? Isso não pode ser desfeito.')) return;
    lsApagar(LS_HIST);
    pintarHistorico();
  });

  /* ---------- envio ---------- */
  async function corrigir(ev){
    ev.preventDefault();
    if (EP.estado !== 'ok' || btnCorrigir.disabled) return;
    limparErroForm();
    const erro = validarForm();
    if (erro) { erroForm(erro[0], erro[1]); return; }
    lsGravar(LS_CIENTE, '1');
    salvarRascunho();

    const dados = { modo: modoAtual(), tipo: selTipo.value, enunciado: txtE.value.trim(), peca: txtP.value.trim() };
    if (txtEsp.value.trim()) dados.espelho = txtEsp.value.trim();
    ctrlAtual = new AbortController();
    const ctrl = ctrlAtual;
    const relogio = setTimeout(() => { ctrl.tempo = true; ctrl.abort(); }, TEMPO_MAX_MS);
    pintarBotao(true);
    mostrarCarregando();
    focarResultado();

    try {
      const falhaDeRede = () => {
        if (ctrl.cancelado) return mostrarErro({ titulo: 'Correção cancelada', texto: 'Você cancelou a correção. Nenhuma nota foi gerada e nada foi salvo no histórico.', tentar: true });
        if (ctrl.tempo) return mostrarErro({ titulo: 'A correção demorou demais', texto: 'O serviço não respondeu a tempo e a espera foi encerrada. Nenhuma nota foi gerada. Tente de novo; peças longas levam mais tempo.', tentar: true });
        return mostrarErro({ titulo: 'Sem conexão com o serviço de correção', texto: 'Não consegui falar com o serviço. Verifique sua internet e tente de novo. Se continuar, o serviço pode estar fora do ar. Seu texto continua salvo no rascunho.', tentar: true });
      };

      let resp, bruto;
      try {
        resp = await fetch(EP.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados),
          signal: ctrl.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
        });
        bruto = await resp.text();
      } catch (e) {
        return falhaDeRede();
      }

      let corpo = null;
      try { corpo = JSON.parse(bruto); } catch (e) { corpo = null; }

      if (!resp.ok) return mostrarErro(erroPorStatus(resp.status, resp, corpo));

      const res = validarResultado(corpo);
      if (!res) return mostrarErro({ titulo: 'Resposta inválida do serviço', texto: 'O serviço respondeu, mas o conteúdo não está no formato esperado ou a nota não fecha com a tabela. Por segurança, nenhuma nota foi mostrada nem salva. Tente de novo.', tentar: true });

      const simulada = Boolean(corpo.mock === true);
      const item = adicionarAoHistorico(res, dados, simulada);
      mostrarResultado(res, { simulada, modo: dados.modo, tipo: dados.tipo, ts: item.ts });
    } finally {
      clearTimeout(relogio);
      ctrlAtual = null;
      pintarBotao(false);
    }
  }

  /* ---------- limpar ---------- */
  btnLimpar.addEventListener('click', () => {
    if ((txtE.value.trim() || txtP.value.trim() || txtEsp.value.trim()) && !confirm('Limpar o enunciado e a peça? O rascunho salvo também será apagado.')) return;
    txtE.value = ''; txtP.value = ''; txtEsp.value = '';
    lsApagar(LS_RASC);
    $('infoRascunho').textContent = '';
    limparErroForm(); atualizarContadores();
    txtE.focus();
  });

  /* ---------- início ---------- */
  pintarStatus();
  definirModo('oab');
  carregarRascunho();
  chkCiente.checked = lsLer(LS_CIENTE, '') === '1';
  atualizarContadores();
  pintarBotao(false);
  pintarHistorico();

  radiosModo.forEach(r => r.addEventListener('change', () => { preencherTipos(modoAtual()); agendarRascunho(); }));
  [txtE, txtP, txtEsp].forEach(t => t.addEventListener('input', () => { atualizarContadores(); limparErroForm(); agendarRascunho(); }));
  selTipo.addEventListener('change', agendarRascunho);
  chkCiente.addEventListener('change', limparErroForm);
  form.addEventListener('submit', corrigir);
  window.addEventListener('pagehide', () => { clearTimeout(timerRasc); if (txtE.value || txtP.value || txtEsp.value) salvarRascunho(); });
})();

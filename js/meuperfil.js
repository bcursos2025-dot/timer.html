/* ============================================================
   MEU PERFIL (igual ao da extensao, sem conta) + ORDEM DA BARRA DE BAIXO.
   - Meu perfil: saudacao, ofensiva, a semana com os dias estudados, a contagem da
     prova e "Seu dia" (os blocos que vieram da extensao, quando pareado).
     Nao existe conta nem login: tudo e lido do proprio aparelho.
   - Ordem das abas: a pessoa escolhe a ordem da barra de baixo (e do menu lateral)
     em Configuracoes. Fica salva neste aparelho.
   Carrega depois de app.js, hoje.js e iniciante.js.
   ============================================================ */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- ordem das abas ---------------- */
  const PADRAO = ['hoje', 'timer', 'questoes', 'painel', 'agenda'];
  const NOMES = { hoje: 'Hoje', timer: 'Cronômetro', questoes: 'Questões', painel: 'Painel', agenda: 'Agenda' };
  const LS_ORDEM = 'cb2_ordem_abas';
  const SETA_CIMA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>';
  const SETA_BAIXO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

  function lerOrdem(){
    try {
      const a = JSON.parse(localStorage.getItem(LS_ORDEM) || 'null');
      if (Array.isArray(a) && a.length === PADRAO.length && PADRAO.every(x => a.includes(x))) return a;
    } catch (e) { /* usa o padrão */ }
    return PADRAO.slice();
  }
  let ordem = lerOrdem();
  function salvarOrdem(){ try { localStorage.setItem(LS_ORDEM, JSON.stringify(ordem)); } catch (e) { /* ok */ } }
  function aplicarOrdem(){
    document.querySelectorAll('.tabbar .tab-btn, .lat-nav .tab-btn').forEach(b => { b.style.order = String(ordem.indexOf(b.dataset.tab)); });
    renderOrdem();
  }
  function renderOrdem(){
    const el = $('ordemLista'); if (!el) return;
    el.innerHTML = ordem.map((t, i) =>
      '<div class="ordem-linha"><span class="ordem-num">' + (i + 1) + '</span><span class="ordem-nome">' + NOMES[t] + '</span>' +
      '<button type="button" class="ordem-bt" data-i="' + i + '" data-d="-1" aria-label="Subir ' + NOMES[t] + '"' + (i === 0 ? ' disabled' : '') + '>' + SETA_CIMA + '</button>' +
      '<button type="button" class="ordem-bt" data-i="' + i + '" data-d="1" aria-label="Descer ' + NOMES[t] + '"' + (i === ordem.length - 1 ? ' disabled' : '') + '>' + SETA_BAIXO + '</button></div>').join('');
  }
  const listaOrdem = $('ordemLista');
  if (listaOrdem) listaOrdem.addEventListener('click', e => {
    const b = e.target.closest('.ordem-bt'); if (!b || b.disabled) return;
    const i = Number(b.dataset.i), j = i + Number(b.dataset.d);
    if (j < 0 || j >= ordem.length) return;
    const t = ordem[i]; ordem[i] = ordem[j]; ordem[j] = t;
    salvarOrdem(); aplicarOrdem();
  });
  const bRest = $('ordemRestaurar');
  if (bRest) bRest.addEventListener('click', () => { ordem = PADRAO.slice(); try { localStorage.removeItem(LS_ORDEM); } catch (e) { /* ok */ } aplicarOrdem(); });
  aplicarOrdem();

  /* ---------------- Meu perfil ---------------- */
  const ov = $('perfilSheet');
  const corpo = $('perfilCorpo');
  const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

  function msDoDia(chave){
    let a = 0, b = 0;
    try { a = Number(historico[chave]) || 0; } catch (e) { /* sem histórico */ }
    try { b = Number((estadoExtensao && estadoExtensao.historico || {})[chave]) || 0; } catch (e) { /* sem extensão */ }
    return Math.max(a, b);
  }
  function fmtHM(ms){ const m = Math.floor(ms / 60000), h = Math.floor(m / 60); return h > 0 ? h + 'h ' + String(m % 60).padStart(2, '0') + 'm' : m + 'm'; }

  function diasParaProva(){
    try {
      const p = lerJSON(LS.provaOab, null);
      if (!p || typeof p.data !== 'string') return null;
      const [y, m, d] = p.data.split('-').map(Number);
      if (!y || !m || !d) return null;
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      return Math.round((new Date(y, m - 1, d) - hoje) / 86400000);
    } catch (e) { return null; }
  }

  function semanaHtml(){
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dom = new Date(hoje); dom.setDate(hoje.getDate() - hoje.getDay());
    let h = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(dom); d.setDate(dom.getDate() + i);
      const estudou = msDoDia(chaveData(d)) > 0;
      h += '<div class="cb-semana-dia' + (d.getTime() === hoje.getTime() ? ' hoje' : '') + '"><span class="cb-semana-num">' + d.getDate() +
        '</span><span class="cb-semana-lbl">' + DIAS[d.getDay()] + '</span><span class="cb-semana-ponto' + (estudou ? ' on' : '') + '"></span></div>';
    }
    return '<div class="cb-semana">' + h + '</div>';
  }

  function diaHtml(){
    let blocos = [];
    try { const ag = estadoExtensao && estadoExtensao.agenda; if (ag && ag[hojeChave()]) blocos = ag[hojeChave()].slice(); } catch (e) { /* sem agenda */ }
    const pareado = !!(typeof estadoExtensao !== 'undefined' && estadoExtensao);
    if (!blocos.length) {
      return '<div class="cb-dia-vazio">Nenhum bloco montado para hoje.<br><span>' + (pareado
        ? 'Monte o seu dia na extensão, na aba Cronograma.'
        : 'Monte o seu cronograma pela extensão no PC e ele aparece aqui. ' + ((window.cbEhCelular && window.cbEhCelular()) ? '<a href="#" data-enviar-pc>Enviar o link para o PC</a>' : '<a href="instalar.html">Ver como instalar</a>') + '') + '</span></div>';
    }
    blocos.sort((a, b) => minutosDe(a.inicio) - minutosDe(b.inicio));
    const min = minutosAgora();
    return '<div class="cb-dia-lista">' + blocos.map(b => {
      const agora = min >= minutosDe(b.inicio) && min < minutosDe(b.fim);
      const passou = min >= minutosDe(b.fim);
      return '<div class="cb-dia-bloco' + (agora ? ' agora' : '') + (passou ? ' passou' : '') + '"><div class="cb-dia-hora">' + esc(b.inicio) + '<span class="cb-dia-hora-fim">' + esc(b.fim) + '</span></div>' +
        '<div class="cb-dia-corpo"><span class="cb-dia-materia">' + esc(b.materia || (typeof CAT_LABEL !== 'undefined' && CAT_LABEL[b.tipo]) || 'Estudo') + '</span>' +
        '<span class="cb-dia-tipo">' + esc((typeof CAT_LABEL !== 'undefined' && CAT_LABEL[b.tipo]) || 'Outro') + '</span></div>' +
        (agora ? '<span class="cb-dia-agora-selo">agora</span>' : '') + '</div>';
    }).join('') + '</div>';
  }

  function render(){
    if (!corpo) return;
    const agora = new Date(), h = agora.getHours();
    const saud = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    const data = agora.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'long' });
    const streak = calcularStreak();
    const concurso = (typeof perfilAtual === 'function' && perfilAtual() === 'concurso');
    const dias = diasParaProva();
    const meta = (typeof config !== 'undefined' && config.dailyGoalMs) || 4 * 3600000;
    const hoje = msDoDia(hojeChave());
    let provaHtml = '';
    if (dias !== null) {
      provaHtml = '<div class="cb-perfil-prova' + (dias === 0 ? ' cb-perfil-prova-hoje' : '') + '"><span class="cb-perfil-prova-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/></svg></span>' +
        '<span class="cb-perfil-prova-texto"><span class="cb-perfil-prova-num">' + (dias > 0 ? dias : dias === 0 ? 'Hoje' : '—') + '</span><span class="cb-perfil-prova-lbl">' +
        (dias > 0 ? (dias === 1 ? 'dia para a prova' : 'dias para a prova') : dias === 0 ? 'é a prova — boa sorte!' : 'a prova já passou') + '</span></span></div>';
    }
    corpo.innerHTML =
      '<div class="cb-perfil-topo"><div class="cb-perfil-saudacao"><span class="cb-perfil-ola">' + saud + '</span><span class="cb-perfil-data">' + esc(data) + '</span></div>' +
      '<button type="button" class="streak-badge perfil-streak" id="perfilStreak" title="Ver a minha ofensiva"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17a2.5 2.5 0 0 0 2.5-2.5c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7.5 7.5 0 1 1-15 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5"/></svg>' + streak + (streak === 1 ? ' dia' : ' dias') + '</button></div>' +
      '<div class="cb-perfil-conta"><span class="cb-perfil-conta-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.2 3.58-7 8-7s8 2.8 8 7"/></svg></span>' +
      '<span class="cb-perfil-conta-txt"><strong>' + (concurso ? 'Estudando para concurso' : 'Estudando para a OAB') + '</strong><small>Seus dados ficam só neste aparelho</small></span>' +
      '<button type="button" class="cb-perfil-conta-btn" id="perfilConfig">Configurações</button></div>' +
      '<div class="cb-perfil-conta"><span class="cb-perfil-conta-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/></svg></span>' +
      '<span class="cb-perfil-conta-txt"><strong>É advogado(a)? Seja professor</strong><small>Comente questões e corrija peças de alunos</small></span>' +
      '<a class="cb-perfil-conta-btn" href="professor.html">Cadastrar</a></div>' +
      semanaHtml() + provaHtml +
      '<div class="cb-perfil-secao"><div class="cb-perfil-secao-tit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>Hoje em números</div>' +
      '<div class="perfil-hoje"><div><b>' + fmtHM(hoje) + '</b><span>estudados de ' + Math.round(meta / 3600000) + 'h</span></div><div><b>' + streak + '</b><span>' + (streak === 1 ? 'dia seguido' : 'dias seguidos') + '</span></div></div></div>' +
      '<div class="cb-perfil-secao"><div class="cb-perfil-secao-tit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>Seu dia</div>' + diaHtml() + '</div>';
    const bs = $('perfilStreak'); if (bs) bs.addEventListener('click', () => { fechar(); abrirStreakSheet(); });
    const bc = $('perfilConfig'); if (bc) bc.addEventListener('click', () => { fechar(); abrirSheet(); });
  }
  function abrir(){ render(); if (ov) ov.classList.add('aberto'); }
  function fechar(){ if (ov) ov.classList.remove('aberto'); }
  ['btnPerfil', 'btnPerfilLateral'].forEach(id => { const b = $(id); if (b) b.addEventListener('click', abrir); });
  const bf = $('perfilFechar'); if (bf) bf.addEventListener('click', fechar);
  if (ov) ov.addEventListener('click', e => { if (e.target === ov) fechar(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov && ov.classList.contains('aberto')) fechar(); });
  setInterval(() => { if (ov && ov.classList.contains('aberto')) render(); }, 30000);
})();

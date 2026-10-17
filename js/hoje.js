/* ============================================================
   ABA "HOJE" — prova da OAB, meta do dia, revisões e extensão.
   Carrega depois de app.js e usa as variáveis dele (historico,
   config, sessao, deviceId, estadoExtensao, LS, cartoesDevidos...).
   ============================================================ */
(function(){
  const $ = id => document.getElementById(id);
  const META_PADRAO_MS = 4 * 60 * 60 * 1000;

  /* ---- Prova da OAB ---- */
  function lerProva(){
    const p = lerJSON(LS.provaOab, null);
    return p && typeof p.data === 'string' ? p : null;
  }
  function diasAte(dataStr){
    const [y, m, d] = dataStr.split('-').map(Number);
    if (!y || !m || !d) return null;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    return Math.round((new Date(y, m - 1, d) - hoje) / 86400000);
  }
  function dataBR(dataStr){
    const [y, m, d] = dataStr.split('-');
    return `${d}/${m}/${y}`;
  }

  function renderProvaForm(valorData, valorFase){
    const el = $('hojeProva');
    const comFase = perfilAtual() !== 'concurso';
    el.innerHTML =
      '<p class="hoje-txt">Informe a data da sua prova pra eu contar os dias e organizar o estudo.</p>' +
      '<div class="prova-form">' +
        '<label class="dt-rotulo" for="hojeProvaData">Data da prova</label>' +
        '<div class="dt-campo">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>' +
          '<input type="date" id="hojeProvaData" required>' +
        '</div>' +
        (comFase
          ? '<label class="dt-rotulo" for="hojeProvaFase">Fase</label>' +
            '<div class="dt-campo dt-sel">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 22V4"/><path d="M4 4h13l-2.5 4L17 12H4"/></svg>' +
              '<select id="hojeProvaFase"><option value="1">1ª fase</option><option value="2">2ª fase</option></select>' +
            '</div>'
          : '') +
        '<button id="hojeProvaSalvar" class="h-btn primario dt-salvar" type="button">Salvar data</button>' +
      '</div>';
    if (valorData) $('hojeProvaData').value = valorData;
    if (comFase && valorFase) $('hojeProvaFase').value = valorFase;
    $('hojeProvaSalvar').addEventListener('click', () => {
      const data = $('hojeProvaData').value;
      if (!data) return;
      const fase = comFase ? $('hojeProvaFase').value : '';
      salvarJSON(LS.provaOab, { data, fase });
      renderProva();
    });
  }

  function renderProva(){
    const p = lerProva();
    const el = $('hojeProva');
    if (!p) { renderProvaForm(); return; }
    const dias = diasAte(p.data);
    if (dias === null) { renderProvaForm(); return; }
    // só a OAB tem 1ª/2ª fase; para concurso o texto fala simplesmente "a prova"
    const fase = perfilAtual() === 'concurso' ? 'prova' : (p.fase === '2' ? '2ª fase' : '1ª fase');
    let numero, rotulo;
    if (dias > 0) { numero = String(dias); rotulo = `${dias === 1 ? 'dia' : 'dias'} para a ${fase}`; }
    else if (dias === 0) { numero = 'Hoje'; rotulo = `é a ${fase} — boa prova!`; }
    else { numero = '—'; rotulo = `a ${fase} de ${dataBR(p.data)} já passou`; }
    el.innerHTML =
      `<div class="hoje-contagem"><span class="hoje-num">${numero}</span><span class="hoje-rotulo">${rotulo}</span></div>` +
      `<div class="hoje-data">${dataBR(p.data)} · <button class="hoje-link" id="hojeProvaEditar">alterar</button></div>`;
    $('hojeProvaEditar').addEventListener('click', () => renderProvaForm(p.data, p.fase));
  }

  /* ---- Números do dia ---- */
  function lerDia(){
    const espelha = !!(deviceId && estadoExtensao && !sessao.pomodoroMode);
    const meta = espelha ? (estadoExtensao.dailyGoalMs || META_PADRAO_MS) : config.dailyGoalMs;
    let ms = espelha ? (estadoExtensao.msHoje || 0) : (historico[hojeChave()] || 0);
    const estado = espelha ? estadoExtensao.sessionState : sessao.sessionState;
    const inicio = espelha ? estadoExtensao.inicioSessao : sessao.inicioSessao;
    const emDescanso = !espelha && sessao.pomodoroMode && sessao.pomodoroPhase === 'rest';
    if (estado === 'running' && inicio && !emDescanso) ms += Date.now() - inicio;
    return { ms, meta };
  }

  // Revisão = cartão que a pessoa JÁ respondeu e que voltou a vencer. Cartão nunca visto é
  // "novo", não "revisão" (antes aparecia o baralho inteiro, ex.: 864, como pendente).
  function revisoesDevidas(){
    try {
      const hoje = hojeChave();
      return Object.values(questoesEstado).filter(e => e && e.dueEm && e.dueEm <= hoje).length;
    } catch (e) { return 0; }
  }

  /* ---- Primeiros passos (some sozinho quando tudo estiver feito) ---- */
  const LS_PASSOS = 'cb2_passos_fechado';
  function passosEstado(){
    let grifos = 0, registros = 0;
    try { const g = JSON.parse(localStorage.getItem('cb2_grifos') || '{}'); Object.values(g).forEach(l => { grifos += (l || []).length; }); } catch (e) { /* sem grifos */ }
    try { registros = (JSON.parse(localStorage.getItem('cb2_desempenho') || '[]') || []).length; } catch (e) { /* sem registros */ }
    let estudou = false;
    try { estudou = Object.values(historico).some(ms => ms > 0) || sessao.sessionState !== 'stopped'; } catch (e) { /* sem histórico */ }
    return [
      { ok: !!perfilAtual(), txt: 'Escolher o seu perfil', acao: null },
      { ok: !!lerProva(), txt: 'Informar a data da prova', acao: { rot: 'Informar', fn: () => { const i = $('hojeProvaData'); if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); } } } },
      { ok: estudou, txt: 'Fazer o primeiro estudo com o cronômetro', acao: { rot: 'Abrir cronômetro', fn: () => irParaAba('timer') } },
      { ok: grifos > 0, txt: 'Grifar um trecho de lei', acao: { rot: 'Abrir as leis', href: 'leis.html' } },
      { ok: registros > 0, txt: 'Registrar questões que você fez', acao: { rot: 'Registrar', fn: () => window.abrirRegistroQuestoes && window.abrirRegistroQuestoes() } }
    ];
  }
  let htmlPassos = '';
  function renderPassos(){
    const el = $('hojePassos'); if (!el) return;
    let fechado = false; try { fechado = localStorage.getItem(LS_PASSOS) === '1'; } catch (e) { /* ok */ }
    const passos = passosEstado();
    const feitos = passos.filter(p => p.ok).length;
    if (fechado || feitos === passos.length) { el.hidden = true; return; }
    el.hidden = false;
    const html = '<h3>Primeiros passos <span class="h-passos-n">' + feitos + ' de ' + passos.length + '</span></h3>' +
      '<div class="h-passos-barra"><i style="width:' + Math.round(feitos / passos.length * 100) + '%"></i></div>' +
      '<ul class="h-passos-lista">' + passos.map((p, i) =>
        '<li class="' + (p.ok ? 'ok' : '') + '"><span class="h-passos-marca" aria-hidden="true">' + (p.ok ? '✓' : '') + '</span><span class="h-passos-txt">' + p.txt + '</span>' +
        (!p.ok && p.acao ? (p.acao.href ? '<a class="h-passos-bt" href="' + p.acao.href + '">' + p.acao.rot + '</a>' : '<button type="button" class="h-passos-bt" data-i="' + i + '">' + p.acao.rot + '</button>') : '') + '</li>').join('') + '</ul>' +
      '<button type="button" class="h-passos-fechar" id="hojePassosFechar">Ocultar este guia</button>';
    if (html === htmlPassos) return;
    htmlPassos = html; el.innerHTML = html;
    el.querySelectorAll('button.h-passos-bt').forEach(b => b.addEventListener('click', () => passos[Number(b.dataset.i)].acao.fn()));
    $('hojePassosFechar').addEventListener('click', () => { try { localStorage.setItem(LS_PASSOS, '1'); } catch (e) { /* ok */ } renderPassos(); });
  }

  function fmtHM(ms){
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min`;
  }

  function questoesHoje(){
    let n = 0;
    try { n += statsHojeQuestoes(fonteDadosQuestoes()).feitas || 0; } catch (e) { /* sem dados */ }
    try { n += window.desempenhoHoje().feitas; } catch (e) { /* sem registros manuais */ }
    return n;
  }

  const CIRC_ANEL = 2 * Math.PI * 52;

  function renderNumeros(){
    const { ms, meta } = lerDia();
    const streak = calcularStreak();
    const revisoes = revisoesDevidas();
    $('hojeStreak').textContent = streak;
    $('hojeRevisoes').textContent = revisoes;
    // sem revisão pendente, o botão vira "Praticar questões" (não mostra um 0 desanimador)
    const bRev = $('hojeBtnRevisar');
    bRev.innerHTML = revisoes > 0 ? 'Revisar hoje <span class="h-badge">' + revisoes + '</span>' : 'Praticar questões';
    bRev.dataset.rev = revisoes;
    $('hojeQuestoes').textContent = questoesHoje();
    $('hojeHoras').textContent = fmtHM(ms);
    $('hojeMetaTexto').textContent = `de ${(meta / 3600000).toFixed(0)}h`;
    $('hojeAnel').style.strokeDashoffset = (CIRC_ANEL * (1 - Math.min(1, ms / meta))).toFixed(2);

    const hora = new Date().getHours();
    const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    $('hojeSaudacao').textContent = streak > 0 ? `${saud} · ${streak} ${streak === 1 ? 'dia seguido' : 'dias seguidos'}` : saud;
    $('hojeFrase').textContent = ms >= meta ? 'Meta de hoje batida.'
      : ms >= 60000 ? `Já são ${fmtHM(ms)} de estudo hoje.`
      : 'Vamos começar o estudo de hoje?';
  }

  /* ---- Extensão (só redesenha se o conteúdo mudar, pra não perder o clique) ---- */
  let htmlExtensao = '';
  function renderExtensao(){
    const html = deviceId
      ? '<h3>Extensão do PC</h3>' +
        '<p class="hoje-txt">Conectada. O cronômetro do computador e o seu histórico aparecem aqui no site.</p>'
      : '<h3>Estude com a extensão no PC</h3>' +
        '<ul class="hoje-lista">' +
          '<li>Cronômetro que roda sozinho enquanto você estuda</li>' +
          '<li>Bloqueio dos sites que tiram o seu foco</li>' +
          '<li>Marcação de trechos nas leis do Planalto</li>' +
        '</ul>' +
        '<div class="h-acoes" style="margin-top:6px">' +
          '<a class="h-btn primario" href="instalar.html" style="text-decoration:none">Instalar no PC</a>' +
          '<button class="h-btn" id="hojeBtnConectar">Já instalei: conectar</button>' +
        '</div>';
    if (html === htmlExtensao) return;
    htmlExtensao = html;
    $('hojeExtensao').innerHTML = html;
    const b = $('hojeBtnConectar');
    if (b) b.addEventListener('click', () => abrirSheet());
  }

  function renderHoje(){
    renderNumeros();
    renderPassos();
    renderExtensao();
  }

  /* ---- Ligações ---- */
  document.addEventListener('perfil-mudou', () => { renderProva(); renderHoje(); });
  document.addEventListener('desempenho-mudou', renderHoje);
  const btnReg = $('hojeBtnRegistrar');
  if (btnReg) btnReg.addEventListener('click', () => window.abrirRegistroQuestoes && window.abrirRegistroQuestoes());
  const btnLateral = $('btnAjustesLateral');
  if (btnLateral) btnLateral.addEventListener('click', () => abrirSheet());
  $('hojeBtnEstudar').addEventListener('click', () => irParaAba('timer'));
  $('hojeBtnRevisar').addEventListener('click', () => {
    irParaAba('questoes');
    const b = $('qBtnRevisao');
    if (b && Number($('hojeBtnRevisar').dataset.rev) > 0) b.click();
  });
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.tab === 'hoje') { renderProva(); renderHoje(); }
  }));
  setInterval(() => {
    const ativa = document.querySelector('.pagina.ativa');
    if (ativa && ativa.dataset.pagina === 'hoje') renderHoje();
  }, 1000);

  renderProva();
  renderHoje();
})();

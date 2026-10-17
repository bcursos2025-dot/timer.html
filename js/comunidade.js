/* ============================================================
   COMUNIDADE (chat anônimo + comparação do dia), versão do site.
   Só funciona para quem LIGAR (opt-in). Mesmas regras da extensão:
   - apelido sorteado (Animal + Adjetivo + número), nunca digitado;
   - ninguém vê nome, e-mail ou login; qualquer pessoa pode apagar qualquer mensagem;
   - a comparação usa só a MÉDIA do dia (somas), nunca o dado de uma pessoa.
   A parte de contribuir com a média é um segundo interruptor, desligado por padrão.
   Se o site estiver pareado com a extensão, ela já contribui: o site não envia de novo.
   Carrega depois de app.js, desempenho.js e comunidade-chat.js.
   ============================================================ */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const ov = $('comSheet'), corpo = $('comCorpo');
  if (!ov || !corpo) return;

  const FB = 'https://concurseiro-blindado-default-rtdb.firebaseio.com';
  const LS_OPT = 'cb2_comunidade_optin', LS_CONTRIB = 'cb2_comunidade_contribui', LS_ENVIADO = 'cb2_comunidade_enviado';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ok */ } };
  let aba = 'conversa';

  /* ---------- números do dia (do aparelho) ---------- */
  function msHoje(){
    let a = 0, b = 0;
    try { a = Number(historico[hojeChave()]) || 0; } catch (e) { /* sem histórico */ }
    try { b = Number((estadoExtensao && estadoExtensao.historico || {})[hojeChave()]) || 0; } catch (e) { /* sem extensão */ }
    let extra = 0;
    try { if (sessao.sessionState === 'running' && sessao.inicioSessao && !sessao.pomodoroMode) extra = Date.now() - sessao.inicioSessao; } catch (e) { /* sem sessão */ }
    return Math.max(a, b) + extra;
  }
  function questoesHoje(){
    let feitas = 0, acertos = 0;
    try { const q = statsHojeQuestoes(fonteDadosQuestoes()); feitas += q.feitas || 0; acertos += q.acertos || 0; } catch (e) { /* sem dados */ }
    try { const d = window.desempenhoHoje(); feitas += d.feitas || 0; acertos += d.acertos || 0; } catch (e) { /* sem registros */ }
    return { feitas, acertos };
  }
  const pareado = () => { try { return !!(typeof deviceId !== 'undefined' && deviceId); } catch (e) { return false; } };

  /* ---------- contribuição anônima (só somas, só diferença desde o último envio) ---------- */
  async function contribuir(){
    if (lsGet(LS_OPT) !== '1' || lsGet(LS_CONTRIB) !== '1' || pareado()) return;
    const dia = hojeChave(), ms = msHoje(), q = questoesHoje();
    let reg = {}; try { reg = JSON.parse(lsGet(LS_ENVIADO) || '{}') || {}; } catch (e) { reg = {}; }
    const est = reg[dia] || { ms: 0, ac: 0, tot: 0, cE: false, cQ: false };
    const inc = {};
    if (ms - est.ms > 0) inc.somaEstudoMs = Math.round(ms - est.ms);
    if (!est.cE && ms > 0) inc.qtdEstudo = 1;
    if (q.feitas - est.tot > 0) { inc.somaQuestoes = q.feitas - est.tot; if (q.acertos - est.ac > 0) inc.somaAcertos = q.acertos - est.ac; }
    if (!est.cQ && q.feitas > 0) inc.qtdQuestoes = 1;
    if (!Object.keys(inc).length) return;
    const corpoPatch = {}; Object.keys(inc).forEach(k => { corpoPatch[k] = { '.sv': { increment: inc[k] } }; });
    try {
      const r = await fetch(FB + '/comunidade/' + dia + '.json', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpoPatch) });
      if (!r.ok) return;
      reg[dia] = { ms: Math.max(ms, est.ms), ac: Math.max(q.acertos, est.ac), tot: Math.max(q.feitas, est.tot), cE: est.cE || ms > 0, cQ: est.cQ || q.feitas > 0 };
      Object.keys(reg).sort().slice(0, -3).forEach(k => delete reg[k]);
      lsSet(LS_ENVIADO, JSON.stringify(reg));
    } catch (e) { /* sem rede: tenta no próximo ciclo */ }
  }
  setInterval(contribuir, 120000);

  /* ---------- telas ---------- */
  const SVG_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  function telaOptIn(){
    if (window.CBChat) window.CBChat.parar();
    corpo.innerHTML =
      '<div class="com-intro">' +
        '<div class="com-intro-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>' +
        '<h2>Estude junto, sem se expor</h2>' +
        '<p>Converse com outras pessoas que estão se preparando e veja como o seu dia se compara com o da comunidade.</p>' +
        '<ul class="com-regras">' +
          '<li><b>Anônimo:</b> você ganha um apelido sorteado. Ninguém vê nome, e-mail ou login.</li>' +
          '<li><b>Mensagens públicas:</b> qualquer pessoa pode ler e qualquer pessoa pode apagar qualquer mensagem.</li>' +
          '<li><b>Comparação:</b> só médias do dia. Você escolhe se quer entrar na média.</li>' +
          '<li>Isto liga o site a um serviço online (Firebase). Dá para sair quando quiser.</li>' +
        '</ul>' +
        '<button type="button" class="h-btn primario com-entrar" id="comEntrar">Entrar na comunidade</button>' +
        '<button type="button" class="com-agora-nao" id="comAgoraNao">Agora não</button>' +
      '</div>';
    $('comEntrar').addEventListener('click', () => { lsSet(LS_OPT, '1'); render(); });
    $('comAgoraNao').addEventListener('click', fechar);
  }

  function barra(titulo, vTxt, vNum, mTxt, mNum){
    const max = Math.max(vNum, mNum, 1);
    return '<div class="com-comp"><span class="com-comp-tit">' + esc(titulo) + '</span>' +
      '<div class="com-barra-linha"><span class="com-barra-rot">Você</span><div class="com-barra-bg"><div class="com-barra-fill voce" style="width:' + Math.min(100, vNum / max * 100) + '%"></div></div><span class="com-barra-val">' + esc(vTxt) + '</span></div>' +
      '<div class="com-barra-linha"><span class="com-barra-rot">Comunidade</span><div class="com-barra-bg"><div class="com-barra-fill media" style="width:' + Math.min(100, mNum / max * 100) + '%"></div></div><span class="com-barra-val">' + esc(mTxt) + '</span></div></div>';
  }
  const fmtH = ms => (ms / 3600000).toFixed(1).replace('.', ',') + 'h';

  async function telaHoje(alvo){
    const ms = msHoje(), q = questoesHoje();
    const pctVoce = q.feitas > 0 ? Math.round(q.acertos / q.feitas * 100) : null;
    const contrib = lsGet(LS_CONTRIB) === '1';
    const montar = d => {
      const dd = d || {};
      const msMedia = dd.qtdEstudo > 0 ? dd.somaEstudoMs / dd.qtdEstudo : 0;
      const pctMedia = (dd.qtdQuestoes > 0 && dd.somaQuestoes > 0) ? Math.round(dd.somaAcertos / dd.somaQuestoes * 100) : null;
      const part = Math.max(dd.qtdEstudo || 0, dd.qtdQuestoes || 0);
      const rodape = d === undefined ? 'Buscando a média da comunidade…'
        : d === null ? 'Não consegui falar com a comunidade agora. <button type="button" class="chat-link" id="comRetentar">Tentar de novo</button>'
        : part > 0 ? 'Baseado em ' + part + ' pessoa' + (part > 1 ? 's' : '') + ' estudando hoje.' : 'Ainda não há dados suficientes da comunidade hoje. Volte mais tarde.';
      return barra('Tempo de estudo hoje', fmtH(ms), ms, d === undefined ? '…' : fmtH(msMedia), msMedia) +
        (pctVoce !== null ? barra('Aproveitamento em questões hoje', pctVoce + '%', pctVoce, d === undefined ? '…' : (pctMedia !== null ? pctMedia + '%' : '—'), pctMedia || 0)
          : '<p class="com-nota">Registre questões hoje para comparar também o seu aproveitamento.</p>') +
        '<p class="com-nota">' + rodape + '</p>';
    };
    alvo.innerHTML =
      '<p class="com-nota" style="margin-top:0">Comparação anônima com quem está estudando hoje: só a média geral, sem nomes.</p>' +
      '<div id="comBlocoMedia">' + montar(undefined) + '</div>' +
      '<hr class="com-div">' +
      '<div class="com-contrib"><div class="com-contrib-txt"><b>Entrar na média de hoje</b><small>' +
        (pareado() ? 'Você está pareado: a extensão já envia a sua média, então o site não envia de novo.' : 'Envia só os totais do dia (horas e questões), sem nome e sem identificação. Você pode desligar quando quiser.') +
      '</small></div><label class="switch"><input type="checkbox" id="comContrib"' + (contrib ? ' checked' : '') + (pareado() ? ' disabled' : '') + '><span class="switch-track"></span></label></div>' +
      '<button type="button" class="com-sair" id="comSair">Sair da comunidade</button>';
    const carregar = () => {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
      fetch(FB + '/comunidade/' + hojeChave() + '.json', { signal: ctl.signal }).then(r => { if (!r.ok) throw new Error('http'); return r.json(); })
        .then(d => pintar(d || {})).catch(() => pintar(null)).finally(() => clearTimeout(t));
    };
    const pintar = d => {
      if (!alvo.isConnected || aba !== 'hoje') return;
      const el = alvo.querySelector('#comBlocoMedia'); if (!el) return;
      el.innerHTML = montar(d);
      const rt = el.querySelector('#comRetentar'); if (rt) rt.addEventListener('click', () => { el.innerHTML = montar(undefined); carregar(); });
    };
    carregar();
    const sw = alvo.querySelector('#comContrib');
    if (sw) sw.addEventListener('change', () => { lsSet(LS_CONTRIB, sw.checked ? '1' : '0'); if (sw.checked) contribuir(); });
    alvo.querySelector('#comSair').addEventListener('click', () => {
      if (!confirm('Sair da comunidade? Você deixa de contribuir e o chat fecha. Suas mensagens já enviadas continuam visíveis para os outros (qualquer pessoa pode apagá-las).')) return;
      lsSet(LS_OPT, '0'); lsSet(LS_CONTRIB, '0'); render();
    });
  }

  function render(){
    if (lsGet(LS_OPT) !== '1') { telaOptIn(); return; }
    corpo.innerHTML =
      '<div class="com-seg" role="tablist">' +
        '<button type="button" class="comunidade-tab-btn' + (aba === 'conversa' ? ' active' : '') + '" data-aba="conversa" role="tab">Conversa</button>' +
        '<button type="button" class="comunidade-tab-btn' + (aba === 'hoje' ? ' active' : '') + '" data-aba="hoje" role="tab">Hoje</button>' +
      '</div>' +
      '<div class="com-conteudo' + (aba === 'conversa' ? ' com-conteudo--chat' : '') + '" id="comConteudo"></div>';
    const alvo = $('comConteudo');
    corpo.querySelectorAll('.comunidade-tab-btn').forEach(b => b.addEventListener('click', () => { aba = b.dataset.aba; render(); }));
    if (aba === 'conversa') { if (window.CBChat) Promise.resolve(window.CBChat.montar(alvo)).catch(() => { alvo.innerHTML = '<p class="com-nota">Não consegui abrir a conversa agora.</p>'; }); }
    else { if (window.CBChat) window.CBChat.parar(); telaHoje(alvo); }
  }

  function abrir(){ ov.classList.add('aberto'); render(); }
  function fechar(){ ov.classList.remove('aberto'); if (window.CBChat) window.CBChat.parar(); }
  ['btnComunidadeLateral', 'hojeBtnCom'].forEach(id => { const b = $(id); if (b) b.addEventListener('click', abrir); });
  const bf = $('comFechar'); if (bf) bf.addEventListener('click', fechar);
  ov.addEventListener('click', e => { if (e.target === ov) fechar(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('aberto')) fechar(); });
  window.abrirComunidade = abrir;
  setTimeout(contribuir, 8000);
})();

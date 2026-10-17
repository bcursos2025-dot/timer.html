/* ============================================================
   MODO INICIANTE: o site abre simples e vai liberando recursos conforme a
   pessoa estuda. Quem e novo ve so o essencial (Hoje, Cronometro e Leis);
   o resto aparece com 10 min, 30 min, 1 h e 3 h de estudo no total.
   Carrega depois de app.js e hoje.js (usa historico e sessao).
   Em Ajustes da para desligar ("Mostrar tudo").
   ============================================================ */
(function(){
  const LS_INI = 'cb2_iniciante';          // '1' ligado, '0' desligado
  const $ = id => document.getElementById(id);

  const RECURSOS = [
    { id: 'questoes', min: 10,  nome: 'Questões e revisão', desc: 'Faça questões e revise os erros nos dias certos.', tab: 'questoes' },
    { id: 'extensao', min: 30,  nome: 'Extensão para o PC', desc: 'Cronômetro automático e bloqueio de sites que tiram o foco.' },
    { id: 'painel',   min: 60,  nome: 'Painel de progresso', desc: 'Veja o seu nível, a sequência e o histórico de estudo.', tab: 'painel' },
    { id: 'agenda',   min: 180, nome: 'Agenda de estudo', desc: 'Organize os blocos de estudo da semana.', tab: 'agenda' }
  ];

  function totalMs(){
    let t = 0;
    try { Object.values(historico).forEach(ms => { t += ms || 0; }); } catch (e) { /* sem historico */ }
    try { if (sessao.sessionState === 'running' && sessao.inicioSessao) t += Date.now() - sessao.inicioSessao; } catch (e) { /* sem sessao */ }
    return t;
  }
  function lerFlag(){ try { return localStorage.getItem(LS_INI); } catch (e) { return null; } }
  function gravarFlag(v){ try { localStorage.setItem(LS_INI, v); } catch (e) { /* ok */ } }
  function ligado(){
    let f = lerFlag();
    if (f !== '1' && f !== '0') {            // primeira vez: instalacao nova liga, quem ja estuda nao
      f = totalMs() < 5 * 60000 ? '1' : '0';
      gravarFlag(f);
    }
    return f === '1';
  }
  const liberado = (r, lig, total) => !lig || total >= r.min * 60000;
  function minFmt(ms){
    const m = Math.max(1, Math.ceil(ms / 60000));
    return m >= 60 ? (Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '')) : (m + ' min');
  }

  let toastEl = null, toastT = null;
  function aviso(txt){
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'ini-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = txt; toastEl.classList.add('vis');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('vis'), 3200);
  }

  function aplicar(){
    const lig = ligado(), total = totalMs();
    document.body.classList.toggle('modo-iniciante', lig);
    RECURSOS.forEach(r => {
      const ok = liberado(r, lig, total);
      document.body.classList.toggle('ini-sem-' + r.id, !ok);
      if (r.tab) document.querySelectorAll('.tab-btn[data-tab="' + r.tab + '"]').forEach(b => {
        b.classList.toggle('bloqueada', !ok);
        if (ok) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true');
      });
    });
    const sw = $('iniSwitch'); if (sw) sw.checked = lig;
    const est = $('iniEstado');
    if (est) {
      const faltam = RECURSOS.filter(r => !liberado(r, lig, total)).length;
      est.textContent = !lig ? 'Desligado: o site mostra todos os recursos.'
        : (faltam ? 'Ligado: faltam ' + faltam + ' recurso' + (faltam === 1 ? '' : 's') + ' para liberar. Eles aparecem conforme você estuda.' : 'Ligado: você já liberou tudo.');
    }
    renderProximos(lig, total);
  }

  /* Cartao "O que vem a seguir" na tela Hoje */
  let htmlProx = '';
  function renderProximos(lig, total){
    const el = $('hojeProximos'); if (!el) return;
    const faltando = RECURSOS.filter(r => !liberado(r, lig, total));
    if (!lig || !faltando.length) { el.hidden = true; return; }
    el.hidden = false;
    const prox = faltando[0];
    const pct = Math.min(100, Math.round(total / (prox.min * 60000) * 100));
    const html = '<h3>O que vem a seguir</h3>' +
      '<p class="ini-prox-txt">Estudando, você libera mais recursos. Sem pressa: o site fica simples até você precisar.</p>' +
      '<div class="h-passos-barra"><i style="width:' + pct + '%"></i></div>' +
      '<ul class="ini-lista">' + faltando.map(r =>
        '<li><span class="ini-cadeado" aria-hidden="true"></span><span class="ini-item"><b>' + r.nome + '</b><small>' + r.desc + '</small></span>' +
        '<span class="ini-falta">' + minFmt(r.min * 60000 - total) + '</span></li>').join('') + '</ul>' +
      '<button type="button" class="h-passos-fechar" id="iniMostrarTudo">Mostrar tudo agora</button>';
    if (html === htmlProx) return;
    htmlProx = html; el.innerHTML = html;
    $('iniMostrarTudo').addEventListener('click', () => { gravarFlag('0'); aplicar(); });
  }

  /* Bloqueia o clique nas abas ainda trancadas (antes dos tratadores do app.js) */
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.tab-btn.bloqueada');
    if (!b) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const r = RECURSOS.find(x => x.tab === b.dataset.tab);
    if (r) aviso(r.nome + ' libera com ' + minFmt(r.min * 60000) + ' de estudo. Faltam ' + minFmt(r.min * 60000 - totalMs()) + '.');
  }, true);

  const sw = $('iniSwitch');
  if (sw) sw.addEventListener('change', () => { gravarFlag(sw.checked ? '1' : '0'); aplicar(); });

  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => setTimeout(aplicar, 0)));
  setInterval(aplicar, 5000);
  aplicar();
})();

/* ============================================================
   MODO INICIANTE: o site abre com o mínimo possível e vai liberando recursos
   devagar, para a pessoa se acostumar sem se assustar.
   - Dia 1 (primeira vez): só o botão de começar a estudar. Nada de data da prova,
     leis, assistente, comunidade, sequência, abas extras...
   - Depois o site libera um recurso de cada vez, conforme a pessoa VOLTA
     (dias diferentes em que abriu o site) ou ESTUDA (minutos no cronômetro),
     o que vier primeiro.
   O site conta os dias de uso neste aparelho (localStorage); nada é enviado.
   Carrega depois de app.js e hoje.js (usa historico e sessao).
   Em Configurações dá para desligar ("Mostrar só o essencial").
   ============================================================ */
(function(){
  'use strict';
  const LS_INI = 'cb2_iniciante';              // '1' ligado, '0' desligado
  const LS_DIAS = 'cb2_dias_uso';              // ["AAAA-MM-DD", ...] dias em que a pessoa abriu o site
  const LS_PRIMEIRA = 'cb2_primeira_visita';   // timestamp da primeira visita
  const $ = id => document.getElementById(id);

  // dias = dias diferentes de uso; min = minutos de estudo no total. Libera com um OU outro.
  const RECURSOS = [
    { id: 'prova',      dias: 2, min: 10,  nome: 'Data da prova',        desc: 'Conte os dias que faltam para a sua prova.' },
    { id: 'streak',     dias: 2, min: 15,  nome: 'Sequência de dias',    desc: 'Veja quantos dias seguidos você estudou.' },
    { id: 'leis',       dias: 2, min: 10,  nome: 'Leis com grifos',      desc: 'Leia e grife as leis do Planalto.' },
    { id: 'questoes',   dias: 3, min: 20,  nome: 'Questões e revisão',   desc: 'Faça questões e revise os erros nos dias certos.', tab: 'questoes' },
    { id: 'assistente', dias: 4, min: 40,  nome: 'Assistente de estudo', desc: 'Tire dúvidas e peça um plano de revisão.' },
    { id: 'painel',     dias: 5, min: 60,  nome: 'Painel de progresso',  desc: 'Veja o seu nível, o gráfico geral e as ferramentas de foco.', tab: 'painel' },
    { id: 'perfil',     dias: 5, min: 60,  nome: 'Meu perfil',           desc: 'A sua semana e o seu dia num só lugar.' },
    { id: 'comunidade', dias: 7, min: 120, nome: 'Comunidade',           desc: 'Converse com outras pessoas que estudam.' },
    { id: 'extensao',   dias: 7, min: 120, nome: 'Extensão para o PC',   desc: 'Cronômetro automático e bloqueio de sites que tiram o foco.' },
    { id: 'agenda',     dias: 7, min: 180, nome: 'Agenda de estudo',     desc: 'Organize os blocos de estudo da semana.', tab: 'agenda' }
  ];

  const hojeStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function lerDias(){ try { const a = JSON.parse(localStorage.getItem(LS_DIAS) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function registrarDia(){
    const a = lerDias(), h = hojeStr();
    if (!a.includes(h)) { a.push(h); try { localStorage.setItem(LS_DIAS, JSON.stringify(a.slice(-90))); } catch (e) { /* ok */ } }
    try { if (!localStorage.getItem(LS_PRIMEIRA)) localStorage.setItem(LS_PRIMEIRA, String(Date.now())); } catch (e) { /* ok */ }
  }
  registrarDia();
  const diasDeUso = () => Math.max(1, lerDias().length);

  function totalMs(){
    let t = 0;
    try { Object.values(historico).forEach(ms => { t += ms || 0; }); } catch (e) { /* sem historico */ }
    try { if (sessao.sessionState === 'running' && sessao.inicioSessao) t += Date.now() - sessao.inicioSessao; } catch (e) { /* sem sessao */ }
    return t;
  }
  function lerFlag(){ try { return localStorage.getItem(LS_INI); } catch (e) { return null; } }
  function gravarFlag(v){ try { localStorage.setItem(LS_INI, v); } catch (e) { /* ok */ } }
  function ligado(){
    // quem já pareou com a extensão não é iniciante: libera tudo (e o modo iniciante deixa de esconder abas)
    try { if (localStorage.getItem('cb_deviceId')) return false; } catch (e) { /* ok */ }
    let f = lerFlag();
    if (f !== '1' && f !== '0') {            // primeira vez: instalacao nova liga, quem ja estuda nao
      f = totalMs() < 5 * 60000 ? '1' : '0';
      gravarFlag(f);
    }
    return f === '1';
  }
  const liberadoR = (r, lig, total, dias) => !lig || dias >= r.dias || total >= r.min * 60000;
  window.cbLiberado = id => { const r = RECURSOS.find(x => x.id === id); return !r || liberadoR(r, ligado(), totalMs(), diasDeUso()); };

  function falta(r, total, dias){
    const d = Math.max(0, r.dias - dias), m = Math.max(1, Math.ceil((r.min * 60000 - total) / 60000));
    const dTxt = d + (d === 1 ? ' dia de uso' : ' dias de uso');
    const mTxt = m >= 60 ? (Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '')) : (m + ' min');
    return dTxt + ' ou ' + mTxt + ' de estudo';
  }

  function aplicar(){
    const lig = ligado(), total = totalMs(), dias = diasDeUso();
    document.body.classList.toggle('modo-iniciante', lig);
    RECURSOS.forEach(r => {
      const ok = liberadoR(r, lig, total, dias);
      document.body.classList.toggle('ini-sem-' + r.id, !ok);
      if (r.tab) document.querySelectorAll('.tab-btn[data-tab="' + r.tab + '"]').forEach(b => {
        b.classList.toggle('bloqueada', !ok);                 // fica escondida (não mostra cadeado)
        if (ok) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true');
      });
    });
    const sw = $('iniSwitch'); if (sw) sw.checked = lig;
    const est = $('iniEstado');
    if (est) {
      const faltam = RECURSOS.filter(r => !liberadoR(r, lig, total, dias)).length;
      est.textContent = !lig ? 'Desligado: o site mostra todos os recursos.'
        : (faltam ? 'Ligado: este é o seu dia ' + dias + ' de uso e faltam ' + faltam + ' recurso' + (faltam === 1 ? '' : 's') + ' para liberar. Eles aparecem aos poucos.' : 'Ligado: você já liberou tudo.');
    }
    renderProximo(lig, total, dias);
  }

  /* Cartão "O que vem a seguir": só a partir do 2º dia, e mostra UM recurso por vez */
  let htmlProx = '';
  function renderProximo(lig, total, dias){
    const el = $('hojeProximos'); if (!el) return;
    const prox = RECURSOS.find(r => !liberadoR(r, lig, total, dias));
    const primeiroDia = !RECURSOS[0] || !liberadoR(RECURSOS[0], lig, total, dias);   // enquanto nada foi liberado, nada de aviso
    if (!lig || !prox) { el.hidden = true; return; }
    el.hidden = false;
    const html = primeiroDia
      ? '<h3>Por que está tão simples?</h3>' +
        '<p class="ini-prox-txt">De propósito: o resto está escondido e aparece aos poucos, a cada dia de uso.</p>'
      : '<h3>Próxima novidade</h3>' +
        '<ul class="ini-lista"><li><span class="ini-cadeado" aria-hidden="true"></span><span class="ini-item"><b>' + prox.nome + '</b><small>' + prox.desc + '</small></span></li></ul>' +
        '<p class="ini-prox-txt">Libera com ' + falta(prox, total, dias) + '.</p>';
    if (html === htmlProx) return;
    htmlProx = html; el.innerHTML = html;
  }

  const sw = $('iniSwitch');
  if (sw) sw.addEventListener('change', () => { gravarFlag(sw.checked ? '1' : '0'); aplicar(); });

  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => setTimeout(aplicar, 0)));
  setInterval(aplicar, 5000);
  aplicar();
})();

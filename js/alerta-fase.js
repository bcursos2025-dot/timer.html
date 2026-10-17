/* ============================================================
   ALERTA DE FIM DE FASE DO POMODORO, para quem não tem vibração (iPhone):
   1) aviso visual forte: a tela pisca devagar na cor do tema e aparece uma faixa;
   2) o título da aba muda ("Fim do foco!") até a pessoa voltar;
   3) um toque tátil do Safari recente (iOS 17.4+), feito com um interruptor escondido.
      Não dá para garantir: o iOS pode ignorar se não houve toque recente na tela.
   O som (bips) e a vibração (Android) continuam em tocarAlertaFase(), no app.js.
   ============================================================ */
(function(){
  'use strict';
  const reduzir = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TITULO = document.title;
  let tTitulo = null, tFaixa = null;

  /* ---- toque tátil do iOS: um <input type="checkbox" switch> escondido ---- */
  let rotulo = null;
  function prepararHaptico(){
    if (rotulo) return rotulo;
    const l = document.createElement('label');
    l.setAttribute('aria-hidden', 'true');
    l.style.cssText = 'position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0.01;pointer-events:none;overflow:hidden';
    const i = document.createElement('input');
    i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
    l.appendChild(i); document.body.appendChild(l);
    rotulo = l; return l;
  }
  function haptico(vezes){
    try {
      const l = prepararHaptico(); let n = 0;
      (function toque(){ l.click(); if (++n < (vezes || 3)) setTimeout(toque, 140); })();
    } catch (e) { /* sem suporte: segue só com som e visual */ }
  }

  /* ---- faixa e piscada ---- */
  function faixa(texto){
    let el = document.getElementById('cbFaixaFase');
    if (!el) { el = document.createElement('div'); el.id = 'cbFaixaFase'; el.className = 'cb-faixa-fase'; el.setAttribute('role', 'alert'); document.body.appendChild(el); }
    el.textContent = texto; el.classList.add('vis');
    clearTimeout(tFaixa); tFaixa = setTimeout(() => el.classList.remove('vis'), 7000);
    el.onclick = () => el.classList.remove('vis');
  }
  function piscar(){
    if (reduzir()) return;
    let el = document.getElementById('cbPiscaFase');
    if (!el) { el = document.createElement('div'); el.id = 'cbPiscaFase'; el.className = 'cb-pisca-fase'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); }
    el.classList.remove('rodando'); void el.offsetWidth; el.classList.add('rodando');
    setTimeout(() => el.classList.remove('rodando'), 2600);
  }
  function titulo(texto){
    clearInterval(tTitulo);
    let alterna = false;
    document.title = texto;
    tTitulo = setInterval(() => { alterna = !alterna; document.title = alterna ? TITULO : texto; }, 1200);
    const parar = () => { if (document.hidden) return; clearInterval(tTitulo); document.title = TITULO; window.removeEventListener('focus', parar); document.removeEventListener('visibilitychange', parar); };
    window.addEventListener('focus', parar); document.addEventListener('visibilitychange', parar);
    setTimeout(() => { clearInterval(tTitulo); document.title = TITULO; }, 30000);
  }

  window.cbAlertaFase = function(fase){
    const foco = fase === 'work';
    const texto = foco ? 'Hora de focar! O descanso acabou.' : 'Hora do descanso! Você terminou um foco.';
    faixa(texto); piscar(); titulo(foco ? 'Hora de focar!' : 'Fim do foco!'); haptico(3);
  };
  // "Testar o alerta" nas Configurações do Pomodoro
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#testarAlertaFase')) { window.cbAlertaFase('rest'); if (typeof tocarAlertaFase === 'function') tocarAlertaFase(); } });
})();

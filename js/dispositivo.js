/* ============================================================
   DISPOSITIVO: a extensão só existe para o navegador do computador. No celular
   não faz sentido pedir "instalar": o certo é mandar o link para o PC.
   Define window.cbEhCelular() e window.cbEnviarLinkPC() e liga qualquer elemento
   com [data-enviar-pc] (botão que envia o link da página de instalação).
   ============================================================ */
(function(){
  'use strict';
  const ehCelular = () => {
    try {
      if (/Android|iPhone|iPad|iPod|Mobile|Opera Mini/i.test(navigator.userAgent)) return true;
      return !!(window.matchMedia && matchMedia('(pointer:coarse)').matches && Math.min(screen.width, screen.height) < 900);
    } catch (e) { return false; }
  };
  window.cbEhCelular = ehCelular;

  function urlInstalar(){
    try { return new URL('instalar.html', location.href).href; } catch (e) { return location.origin + '/instalar.html'; }
  }
  function aviso(txt){
    let el = document.getElementById('cbAvisoDisp');
    if (!el) { el = document.createElement('div'); el.id = 'cbAvisoDisp'; el.className = 'ini-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = txt; el.classList.add('vis'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('vis'), 3600);
  }
  window.cbEnviarLinkPC = async function(){
    const url = urlInstalar();
    const texto = 'Instale a extensão do Concurseiro Blindado no seu computador (Windows): ' + url;
    try {
      if (navigator.share) { await navigator.share({ title: 'Concurseiro Blindado: extensão para o PC', text: 'Instale a extensão no seu computador:', url }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(url); aviso('Link copiado. Mande para o seu computador (WhatsApp, e-mail...).'); return; }
    } catch (e) { /* cai no WhatsApp */ }
    window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank', 'noopener');
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-enviar-pc]');
    if (b) { e.preventDefault(); window.cbEnviarLinkPC(); }
  });

  /* Página de instalação e landing: no celular, avisa e adapta o texto dos botões */
  function adaptar(){
    const ios0 = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const av0 = document.getElementById('iosPomodoroAviso'); if (av0) av0.hidden = !ios0;
    if (!ehCelular()) return;
    document.documentElement.classList.add('cb-celular');
    document.querySelectorAll('[data-instalar]').forEach((a) => { a.textContent = 'Ver a extensão para o PC'; });
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const avisoIos = document.getElementById('iosPomodoroAviso'); if (avisoIos) avisoIos.hidden = !ios;
    const alvo = document.getElementById('avisoCelular');
    if (alvo) alvo.hidden = false;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', adaptar); else adaptar();
})();

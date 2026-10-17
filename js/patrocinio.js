/* ============================================================
   Cartão "Patrocinado" do Painel. Sem script de terceiros, sem cookie, sem rastreio:
   é só um link comum. Fica escondido para quem está começando (Modo iniciante) e quando a
   lista em js/config-patrocinio.js está vazia. Nunca aparece no cronômetro.
   ============================================================ */
(function(){
  'use strict';
  const el = document.getElementById('patrocinioSlot');
  if (!el) return;
  const lista = (window.CB_PATROCINIOS || []).filter(p => p && p.titulo && /^https:\/\//i.test(p.link || ''));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function desenhar(){
    const liberado = !window.cbLiberado || window.cbLiberado('painel');
    if (!lista.length || !liberado) { el.hidden = true; return; }
    const p = lista[Math.floor(Date.now() / 86400000) % lista.length];   // troca uma vez por dia
    el.hidden = false;
    el.innerHTML = '<span class="pat-rotulo">Patrocinado</span>' +
      '<a class="pat-link" href="' + esc(p.link) + '" target="_blank" rel="sponsored noopener noreferrer">' +
      (p.imagem ? '<img src="' + esc(p.imagem) + '" alt="" loading="lazy">' : '') +
      '<span class="pat-txt"><b>' + esc(p.titulo) + '</b>' + (p.texto ? '<small>' + esc(p.texto) + '</small>' : '') + '</span>' +
      '<span class="pat-bt">' + esc(p.botao || 'Saiba mais') + '</span></a>';
  }
  desenhar();
  setInterval(desenhar, 30000);
})();

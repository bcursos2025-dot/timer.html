/* ============================================================
   ANIMAÇÕES: quando a pessoa toca num botão com ícone, o ícone faz um movimento
   que combina com ele (engrenagem gira, ponteiros do relógio andam, barras do painel
   crescem...). Também anima o ícone da aba que ficou ativa por outro caminho,
   sacode as abas ainda trancadas e conta o número da ofensiva subindo.
   Os movimentos estão em css/animacoes.css. Respeita "reduzir movimento".
   ============================================================ */
(function(){
  'use strict';
  const reduzir = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MAPA = [
    ['[data-tab="hoje"]', 'pop'],
    ['[data-tab="timer"]', 'relogio'],
    ['[data-tab="questoes"]', 'balanca'],
    ['[data-tab="painel"]', 'barras'],
    ['[data-tab="agenda"]', 'folhear'],
    ['#btnAjustes, #btnAjustesLateral', 'engrenagem'],
    ['#btnPerfil, #btnPerfilLateral', 'pessoa'],
    ['#btnIA, #btnIALateral, #hojeBtnIA', 'bolha'],
    ['#btnComunidadeLateral, #hojeBtnCom', 'pulo'],
    ['#streakBadge, #perfilStreak', 'chama'],
    ['#btnLatRecolher, #btnLatAbrir', 'pop'],
    ['#iaLeisAbrir, #iaHistorico, #iaTemp, #iaDestaques', 'pop'],
    ['.lat-item[href="leis.html"]', 'folhear'],
    ['.cb-descer', 'seta']
  ];
  const TODAS = ['pop', 'relogio', 'balanca', 'barras', 'folhear', 'engrenagem', 'pessoa', 'bolha', 'pulo', 'chama', 'tremer', 'seta'].map(n => 'cb-a-' + n);

  function animar(el, nome){
    if (reduzir() || !el) return;
    el.classList.remove(...TODAS);
    void el.offsetWidth;                       // reinicia a animação
    el.classList.add('cb-a-' + nome);
    clearTimeout(el._cbA);
    el._cbA = setTimeout(() => el.classList.remove('cb-a-' + nome), 1200);
  }
  window.cbAnimarIcone = animar;

  // toque em qualquer botão do mapa (na captura, antes de quem fecha a folha ou troca de aba)
  window.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button, a, .tab-btn');
    if (!b) return;
    if (b.classList.contains('bloqueada')) { animar(b, 'tremer'); return; }
    for (const [sel, nome] of MAPA) { if (b.matches(sel)) { animar(b, nome); return; } }
  }, true);

  // aba que passou a ficar ativa por outro caminho (um botão "Abrir cronômetro", por exemplo)
  const abas = document.querySelectorAll('.tab-btn[data-tab]');
  const mo = new MutationObserver((lista) => {
    lista.forEach((m) => {
      const el = m.target;
      if (!el.classList.contains('ativa') || (m.oldValue || '').split(' ').includes('ativa')) return;
      const par = MAPA.find(([sel]) => el.matches(sel));
      if (par) animar(el, par[1]);
    });
  });
  abas.forEach((b) => mo.observe(b, { attributes: true, attributeFilter: ['class'], attributeOldValue: true }));

  // número da ofensiva sobe de 0 até o valor, ao abrir a folha
  function contar(el){
    const alvo = parseInt(el.textContent, 10);
    if (!isFinite(alvo) || alvo <= 0 || reduzir()) return;
    const ini = performance.now(), dur = Math.min(900, 250 + alvo * 40);
    (function passo(t){
      const f = Math.min(1, (t - ini) / dur), v = Math.round(alvo * (1 - Math.pow(1 - f, 3)));
      el.textContent = String(v);
      if (f < 1) requestAnimationFrame(passo); else el.textContent = String(alvo);
    })(ini);
  }
  const corpo = document.getElementById('streakCorpo');
  if (corpo) new MutationObserver(() => { const n = corpo.querySelector('.ofe-numero'); if (n && !n.dataset.contado) { n.dataset.contado = '1'; contar(n); } })
    .observe(corpo, { childList: true });
})();

/* ============================================================
   bem-vindo.html — escolha do caminho. Cada cartão abre uma folha com a ilustração em tamanho grande, a explicação e os botões.
   Marca "cb2_bemvindo" quando a pessoa segue por qualquer botão, para o app não mostrar esta tela de novo sozinho.
   Link direto: bem-vindo.html?c=marca | cronometro | questoes | desempenho   (e &f=site | firefox | outro no marca-texto).
   ============================================================ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var folha = $('folha'), ilu = $('folhaIlu'), ultimoCartao = null;

  function marcar() { try { localStorage.setItem('cb2_bemvindo', '1'); } catch (e) { /* sem armazenamento: segue sem marcar */ } }
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest('[data-feito]');
    if (a) marcar();
  });

  function titulo(corpo) {
    var h = corpo.querySelector('h2'); if (h) h.id = 'folhaTitulo';
    folha.setAttribute('aria-labelledby', 'folhaTitulo');
  }

  function abrir(caminho, cartao, forma) {
    var corpos = folha.querySelectorAll('.bv-folha-corpo'), alvo = null;
    corpos.forEach(function (c) { var e = c.getAttribute('data-folha') === caminho; c.hidden = !e; if (e) alvo = c; else { var h = c.querySelector('h2'); if (h) h.removeAttribute('id'); } });
    if (!alvo) return;
    titulo(alvo);
    var origem = cartao || document.querySelector('.bv-cartao[data-caminho="' + caminho + '"]');
    ilu.textContent = '';
    if (origem) { var copia = origem.querySelector('.bv-ilu > *').cloneNode(true); ilu.append(copia); }
    ultimoCartao = origem;
    if (caminho === 'marca') escolherForma(forma || 'site', false);
    if (!folha.open) folha.showModal();
    folha.scrollTop = 0;
    try { history.replaceState(null, '', '?c=' + caminho); } catch (e) { /* ok */ }
  }

  function fechar() { if (folha.open) folha.close(); }
  folha.addEventListener('close', function () {
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ok */ }
    if (ultimoCartao) ultimoCartao.focus();
  });
  $('folhaFechar').addEventListener('click', fechar);
  folha.addEventListener('click', function (ev) { if (ev.target === folha) fechar(); });     // clique no fundo escurecido

  document.querySelectorAll('.bv-cartao').forEach(function (c) {
    c.addEventListener('click', function () { abrir(c.getAttribute('data-caminho'), c); });
  });

  /* ---------- controle segmentado do marca-texto (setas, Home, End) ---------- */
  var seg = folha.querySelector('.bv-seg'), abas = Array.prototype.slice.call(seg.querySelectorAll('[role=tab]'));
  var IDS = { site: 0, firefox: 1, outro: 2 };
  function escolherForma(nome, foco) {
    var i = IDS[nome] != null ? IDS[nome] : 0;
    abas.forEach(function (b, k) {
      var sel = k === i; b.setAttribute('aria-selected', sel ? 'true' : 'false'); b.tabIndex = sel ? 0 : -1;
      var p = $(b.getAttribute('aria-controls')); if (p) p.hidden = !sel;
    });
    seg.style.setProperty('--i', String(i));
    if (foco) abas[i].focus();
  }
  abas.forEach(function (b, k) {
    b.addEventListener('click', function () { escolherForma(['site', 'firefox', 'outro'][k], false); });
    b.addEventListener('keydown', function (ev) {
      var n = k;
      if (ev.key === 'ArrowRight') n = (k + 1) % abas.length; else if (ev.key === 'ArrowLeft') n = (k + abas.length - 1) % abas.length;
      else if (ev.key === 'Home') n = 0; else if (ev.key === 'End') n = abas.length - 1; else return;
      ev.preventDefault(); escolherForma(['site', 'firefox', 'outro'][n], true);
    });
  });

  /* link direto */
  try {
    var q = new URLSearchParams(location.search), c = q.get('c');
    if (c && document.querySelector('.bv-cartao[data-caminho="' + c + '"]')) abrir(c, null, q.get('f'));
  } catch (e) { /* sem parâmetro */ }
})();

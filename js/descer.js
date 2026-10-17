/* ============================================================
   BOTAO "DESCER" (bolinha de vidro com seta), igual ao da extensao.
   Aparece so quando a pagina (ou a folha de Configuracoes) rola: seta para
   baixo enquanto falta conteudo; no fim vira seta para cima e volta ao topo.
   Tambem poe o nome de cada aba da barra de baixo como dica (a barra so tem icones).
   ============================================================ */
(function(){
  'use strict';
  const MARGEM = 56;
  const SVG = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  const BAIXO = SVG('m6 9 6 6 6-6'), CIMA = SVG('m18 15-6-6-6 6');
  const reduzir = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function criar(){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'cb-descer'; b.title = 'Descer'; b.setAttribute('aria-label', 'Descer'); b.innerHTML = BAIXO;
    return b;
  }
  function definir(b, dir){
    if (dir === 'fora') { b.classList.remove('cb-descer-ver'); return; }
    if (b.dataset.dir !== dir) {
      b.dataset.dir = dir; b.innerHTML = dir === 'cima' ? CIMA : BAIXO;
      const t = dir === 'cima' ? 'Voltar ao topo' : 'Descer';
      b.title = t; b.setAttribute('aria-label', t);
    }
    b.classList.add('cb-descer-ver');
  }

  /* folhas com rolagem propria (Configuracoes) */
  function ligarArea(area){
    if (area.__cbDescer) return;
    area.__cbDescer = true;
    const suporte = document.createElement('div'); suporte.className = 'cb-descer-suporte';
    const b = criar(); suporte.appendChild(b); area.appendChild(suporte);
    const atualizar = () => {
      const falta = area.scrollHeight - area.scrollTop - area.clientHeight;
      const rola = area.scrollHeight > area.clientHeight + MARGEM && area.clientHeight > 0;
      definir(b, !rola ? 'fora' : (falta > MARGEM ? 'baixo' : 'cima'));
    };
    b.addEventListener('click', e => {
      e.stopPropagation();
      const c = reduzir() ? 'auto' : 'smooth';
      if (b.dataset.dir === 'cima') area.scrollTo({ top: 0, behavior: c });
      else area.scrollBy({ top: Math.max(120, area.clientHeight * 0.8), behavior: c });
    });
    /* SEGURAR fecha a folha: o botão enche de vermelho e, completo, vira um X e fecha */
    const folha = area.closest('.sheet-overlay, .perfil-overlay');
    const fechar = () => { const x = folha && folha.querySelector('.ap-sheet-close, .iac-fechar, [id$="Fechar"]'); if (x) x.click(); };
    let tSeg = null, engolir = false;
    const X = SVG('M18 6 6 18M6 6l12 12');
    const cancelar = () => { clearTimeout(tSeg); tSeg = null; if (!b.classList.contains('cb-descer-pronto')) b.classList.remove('cb-descer-seg'); };
    b.addEventListener('pointerdown', e => {
      if (e.button > 0 || !folha) return;
      engolir = false; b.classList.remove('cb-descer-pronto'); void b.offsetWidth; b.classList.add('cb-descer-seg');
      tSeg = setTimeout(() => {
        tSeg = null; engolir = true; b.classList.add('cb-descer-pronto'); b.innerHTML = X;
        if (navigator.vibrate) { try { navigator.vibrate(18); } catch (er) { /* ok */ } }
        setTimeout(() => { fechar(); setTimeout(() => { b.classList.remove('cb-descer-seg', 'cb-descer-pronto'); b.dataset.dir = ''; atualizar(); }, 450); }, reduzir() ? 0 : 220);
      }, 650);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, cancelar));
    b.addEventListener('contextmenu', e => e.preventDefault());
    b.addEventListener('click', e => { if (engolir) { e.stopImmediatePropagation(); e.preventDefault(); engolir = false; } }, true);
    area.addEventListener('scroll', atualizar, { passive: true });
    window.addEventListener('resize', atualizar);
    let ag = false;
    new MutationObserver(() => {
      if (suporte.parentNode !== area || suporte !== area.lastElementChild) area.appendChild(suporte);
      if (ag) return; ag = true; requestAnimationFrame(() => { ag = false; atualizar(); });
    }).observe(area, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
    if (window.ResizeObserver) new ResizeObserver(atualizar).observe(area);
    setTimeout(atualizar, 300);
  }

  /* a pagina inteira */
  function ligarJanela(){
    const b = criar(); b.classList.add('cb-descer-janela'); document.body.appendChild(b);
    const raiz = () => document.scrollingElement || document.documentElement;
    const atualizar = () => {
      const r = raiz();
      const falta = r.scrollHeight - r.scrollTop - r.clientHeight;
      const folhaAberta = !!document.querySelector('.sheet-overlay.aberto, .perfil-overlay:not([hidden]), .q-pratica-overlay.aberto');
      const rola = r.scrollHeight > r.clientHeight + MARGEM * 2;
      definir(b, (!rola || folhaAberta) ? 'fora' : (falta > MARGEM * 2 ? 'baixo' : 'cima'));
    };
    b.addEventListener('click', () => {
      const r = raiz(), c = reduzir() ? 'auto' : 'smooth';
      if (b.dataset.dir === 'cima') window.scrollTo({ top: 0, behavior: c });
      else window.scrollBy({ top: Math.max(160, r.clientHeight * 0.8), behavior: c });
    });
    window.addEventListener('scroll', atualizar, { passive: true });
    window.addEventListener('resize', atualizar);
    let ag = false;
    new MutationObserver(() => { if (ag) return; ag = true; requestAnimationFrame(() => { ag = false; atualizar(); }); })
      .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    setInterval(atualizar, 3000);
    atualizar();
  }

  function iniciar(){
    document.querySelectorAll('.tabbar .tab-btn').forEach(b => {
      const t = b.textContent.trim(); if (t) { b.title = t; b.setAttribute('aria-label', t); }
    });
    document.querySelectorAll('.ap-sheet-body').forEach(ligarArea);
    ligarJanela();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();

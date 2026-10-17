/* ============================================================
   CALENDÁRIO DE VIDRO (estilo Apple): substitui a janelinha feia do navegador nos
   campos de data. O campo continua sendo <input type="date"> (o valor segue em AAAA-MM-DD,
   então o resto do site não muda); só deixamos ele somente-leitura e abrimos este calendário.
   Dias, meses e anos; botões Hoje e Limpar; respeita min/max do campo.
   ============================================================ */
(function(){
  'use strict';
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const SEM = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const pad = n => String(n).padStart(2, '0');
  const chave = (a, m, d) => a + '-' + pad(m + 1) + '-' + pad(d);
  const hojeChaveCal = () => { const d = new Date(); return chave(d.getFullYear(), d.getMonth(), d.getDate()); };
  const SETA_E = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
  const SETA_D = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
  const reduzir = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let pop = null, campo = null, modo = 'dias', ano = 0, mes = 0;

  function fechar(){
    if (!pop) return;
    const p = pop; pop = null; campo = null;
    p.classList.remove('vis');
    setTimeout(() => p.remove(), reduzir() ? 0 : 160);
    document.removeEventListener('mousedown', fora, true);
    document.removeEventListener('keydown', teclas, true);
    window.removeEventListener('resize', fechar);
  }
  function fora(e){ if (pop && !pop.contains(e.target) && e.target !== campo && !(campo && campo.closest('.dt-campo') && campo.closest('.dt-campo').contains(e.target))) fechar(); }
  function teclas(e){ if (e.key === 'Escape') { e.stopPropagation(); fechar(); } }

  function escolher(valor){
    if (!campo) return;
    campo.value = valor;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
    fechar();
  }

  function desenhar(){
    if (!pop) return;
    const sel = campo.value, hoje = hojeChaveCal(), min = campo.min || '', max = campo.max || '';
    let corpo = '', titulo = '';
    if (modo === 'dias') {
      titulo = MESES[mes] + ' de ' + ano;
      const primeiro = new Date(ano, mes, 1).getDay(), total = new Date(ano, mes + 1, 0).getDate();
      let dias = '';
      for (let i = 0; i < primeiro; i++) dias += '<span class="cal-vazio"></span>';
      for (let d = 1; d <= total; d++) {
        const k = chave(ano, mes, d), fora = (min && k < min) || (max && k > max);
        dias += '<button type="button" class="cal-dia' + (k === sel ? ' sel' : '') + (k === hoje ? ' hoje' : '') + '" data-k="' + k + '"' + (fora ? ' disabled' : '') + '>' + d + '</button>';
      }
      corpo = '<div class="cal-sem">' + SEM.map(s => '<span>' + s + '</span>').join('') + '</div><div class="cal-grade">' + dias + '</div>';
    } else if (modo === 'meses') {
      titulo = String(ano);
      corpo = '<div class="cal-meses">' + MESES.map((m, i) => '<button type="button" class="cal-mes' + (i === mes ? ' sel' : '') + '" data-m="' + i + '">' + m.slice(0, 3) + '</button>').join('') + '</div>';
    } else {
      const base = Math.floor(ano / 12) * 12; titulo = base + ' – ' + (base + 11);
      let a = ''; for (let y = base; y < base + 12; y++) a += '<button type="button" class="cal-mes' + (y === ano ? ' sel' : '') + '" data-a="' + y + '">' + y + '</button>';
      corpo = '<div class="cal-meses">' + a + '</div>';
    }
    pop.innerHTML =
      '<div class="cal-topo"><button type="button" class="cal-titulo" data-acao="titulo" aria-label="Mudar mês ou ano"><span>' + titulo + '</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>' +
      '<span class="cal-nav"><button type="button" class="cal-seta" data-acao="ant" aria-label="Anterior">' + SETA_E + '</button><button type="button" class="cal-seta" data-acao="prox" aria-label="Próximo">' + SETA_D + '</button></span></div>' +
      corpo +
      '<div class="cal-rodape"><button type="button" class="cal-link" data-acao="limpar">Limpar</button><button type="button" class="cal-link" data-acao="hoje">Hoje</button></div>';
  }

  function posicionar(){
    const r = campo.getBoundingClientRect(), largura = Math.min(320, innerWidth - 24);
    pop.style.width = largura + 'px';
    let left = Math.min(Math.max(12, r.left), innerWidth - largura - 12);
    pop.style.left = left + 'px';
    const alt = pop.offsetHeight || 360;
    let top = r.bottom + 8;
    if (top + alt > innerHeight - 12) top = Math.max(12, r.top - alt - 8);
    pop.style.top = top + 'px';
  }

  function abrir(input){
    if (pop && campo === input) { fechar(); return; }
    fechar();
    campo = input; modo = 'dias';
    const base = /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? input.value : hojeChaveCal();
    ano = +base.slice(0, 4); mes = +base.slice(5, 7) - 1;
    pop = document.createElement('div');
    pop.className = 'cal-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Escolher a data');
    document.body.appendChild(pop);
    desenhar(); posicionar();
    requestAnimationFrame(() => pop && pop.classList.add('vis'));
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.k) return escolher(b.dataset.k);
      if (b.dataset.m !== undefined) { mes = +b.dataset.m; modo = 'dias'; return desenhar(); }
      if (b.dataset.a !== undefined) { ano = +b.dataset.a; modo = 'meses'; return desenhar(); }
      const a = b.dataset.acao;
      if (a === 'hoje') return escolher(hojeChaveCal());
      if (a === 'limpar') return escolher('');
      if (a === 'titulo') { modo = modo === 'dias' ? 'meses' : (modo === 'meses' ? 'anos' : 'dias'); return desenhar(); }
      const passo = a === 'prox' ? 1 : -1;
      if (modo === 'dias') { mes += passo; if (mes > 11) { mes = 0; ano++; } if (mes < 0) { mes = 11; ano--; } }
      else if (modo === 'meses') ano += passo; else ano += passo * 12;
      desenhar(); posicionar();
    });
    document.addEventListener('mousedown', fora, true);
    document.addEventListener('keydown', teclas, true);
    window.addEventListener('resize', fechar);
  }

  /* liga em todo <input type="date"> (inclusive os criados depois) */
  function ligar(input){
    if (input.__cbCal) return;
    input.__cbCal = true;
    input.readOnly = true;                        // impede o calendário feio do navegador
    input.addEventListener('click', (e) => { e.preventDefault(); abrir(input); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); abrir(input); }
      else if ((e.key === 'Backspace' || e.key === 'Delete') && input.value) { e.preventDefault(); input.value = ''; input.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  }
  function varrer(raiz){ (raiz || document).querySelectorAll('input[type="date"]').forEach(ligar); }
  varrer();
  new MutationObserver((lista) => lista.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    if (n.matches && n.matches('input[type="date"]')) ligar(n); else if (n.querySelectorAll) varrer(n);
  }))).observe(document.body, { childList: true, subtree: true });
})();

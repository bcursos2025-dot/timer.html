// ===================== CONFIGURAÇÕES: CAMPO DE BUSCA EM ILHA =====================
// Cópia de interface-popup/config-busca.js da extensão. Só mudou onde a folha é procurada
// (#sheetOverlay) e a classe que diz que ela está aberta ("aberto").
//
// Uma pílula de vidro no pé da folha de Configurações. Digitar filtra as seções (título e conteúdo, sem
// ligar para maiúsculas nem acentos, todas as palavras); as que batem no CONTEÚDO abrem sozinhas e, ao
// limpar a busca, cada seção volta ao estado que tinha antes.
(function () {
    'use strict';
    const folha = document.querySelector('#sheetOverlay .ap-settings');
    const corpo = folha && folha.querySelector('.ap-sheet-body');
    if (!folha || !corpo) return;

    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const ilha = document.createElement('div');
    ilha.className = 'cfg-busca-ilha';
    ilha.innerHTML = '<svg class="cfg-busca-lupa" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
        + '<input type="search" placeholder="Buscar nas configurações" autocomplete="off" spellcheck="false" aria-label="Buscar nas configurações">'
        + '<button type="button" class="cfg-busca-limpar" aria-label="Limpar busca" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
    folha.appendChild(ilha);
    const campo = ilha.querySelector('input');
    const limpar = ilha.querySelector('.cfg-busca-limpar');

    const vazio = document.createElement('p');
    vazio.className = 'cfg-busca-vazio';
    vazio.textContent = 'Nada encontrado nas configurações.';
    vazio.hidden = true;
    corpo.insertBefore(vazio, corpo.firstChild);

    let textos = null;           // acordeão → { tudo, titulo } normalizados, calculados na primeira busca
    let abertosAntes = null;     // acordeão → estava aberto?

    function indexar() {
        textos = new Map();
        folha.querySelectorAll('.settings-accordion').forEach((a) => {
            const cab = a.querySelector('.settings-accordion-head');
            textos.set(a, { titulo: norm(cab && cab.textContent), tudo: norm(a.textContent) });
        });
    }
    function abrir(a, sim) {
        a.classList.toggle('open', sim);
        const cab = a.querySelector('.settings-accordion-head');
        if (cab) cab.setAttribute('aria-expanded', String(sim));
    }

    function filtrar() {
        const palavras = norm(campo.value).split(/\s+/).filter(Boolean);
        limpar.hidden = !campo.value;
        if (!textos) indexar();
        if (!palavras.length) {
            if (abertosAntes) { abertosAntes.forEach((aberto, a) => abrir(a, aberto)); abertosAntes = null; }
            textos.forEach((_, a) => a.classList.remove('cfg-oculto'));
            folha.querySelectorAll('.cfg-grupo').forEach((g) => g.classList.remove('cfg-oculto'));
            vazio.hidden = true;
            return;
        }
        if (!abertosAntes) { abertosAntes = new Map(); textos.forEach((_, a) => abertosAntes.set(a, a.classList.contains('open'))); }
        let achou = 0;
        textos.forEach((t, a) => {
            const bate = palavras.every((p) => t.tudo.includes(p));
            a.classList.toggle('cfg-oculto', !bate);
            if (bate) { achou += 1; abrir(a, !palavras.every((p) => t.titulo.includes(p))); }   // bateu só no conteúdo: abre
        });
        folha.querySelectorAll('.cfg-grupo').forEach((g) => {
            g.classList.toggle('cfg-oculto', !g.querySelector('.settings-accordion:not(.cfg-oculto)'));
        });
        vazio.hidden = achou > 0;
        corpo.scrollTop = 0;
    }

    campo.addEventListener('input', filtrar);
    campo.addEventListener('keydown', (e) => { if (e.key === 'Escape' && campo.value) { e.stopPropagation(); campo.value = ''; filtrar(); } });
    limpar.addEventListener('click', () => { campo.value = ''; filtrar(); campo.focus(); });
    // ao fechar e reabrir a folha, começa sem filtro
    const overlay = document.getElementById('sheetOverlay');
    new MutationObserver(() => { if (!overlay.classList.contains('aberto') && campo.value) { campo.value = ''; filtrar(); } })
        .observe(overlay, { attributes: true, attributeFilter: ['class'] });
})();

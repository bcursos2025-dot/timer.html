// ===================== PUXAR A FOLHA PARA BAIXO PARA FECHAR =====================
// Cópia de interface-popup/folha-gestos.js da extensão. Mudou só a classe do fundo (no site é .sheet-overlay).
//
// Em toda folha (.ap-sheet: Configurações, Ofensiva, Comunidade, chat de IA...), segurar o "risco" do topo (ou o
// cabeçalho) e puxar para baixo arrasta a folha junto; soltando depois de ~90 px (ou num puxão rápido) ela
// desce e fecha, senão volta ao lugar. Quem fecha de verdade é o botão "fechar" de cada folha (clicado por
// aqui), então o que cada tela faz ao fechar (parar gravação de voz, salvar etc.) continua valendo.
// Os botões do cabeçalho seguem funcionando normalmente: o arrasto só começa fora deles.
(function () {
    'use strict';
    const LIMITE = 90;            // px arrastados para fechar
    const VELOCIDADE = 0.6;       // px/ms: puxão rápido também fecha
    const reduzir = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function ligar(overlay) {
        if (overlay.__cbGesto) return;
        const folha = overlay.querySelector('.ap-sheet');
        const cabeca = folha && folha.querySelector('.ap-sheet-head, .iac-head');
        const fechar = folha && folha.querySelector('.ap-sheet-close, .iac-fechar');
        if (!cabeca || !fechar) return;
        overlay.__cbGesto = true;

        cabeca.style.touchAction = 'none';
        cabeca.classList.add('cb-arrastavel');

        let y0 = null, dy = 0, ultimoY = 0, ultimoT = 0, vel = 0;

        function soltar() {
            if (y0 === null) return;
            const fecha = dy > LIMITE || (dy > 30 && vel > VELOCIDADE);
            y0 = null;
            const animar = !reduzir();
            if (fecha) {
                folha.style.transition = animar ? 'transform 0.22s ease-in' : 'none';
                folha.style.transform = 'translateY(110%)';
                setTimeout(() => {
                    fechar.click();
                    folha.style.transition = '';
                    folha.style.transform = '';
                    overlay.style.opacity = '';
                }, animar ? 200 : 0);
            } else {
                folha.style.transition = animar ? 'transform 0.28s cubic-bezier(0.2, 0.9, 0.25, 1)' : 'none';
                folha.style.transform = '';
                overlay.style.opacity = '';
                setTimeout(() => { folha.style.transition = ''; }, 300);
            }
            dy = 0;
        }

        cabeca.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            if (e.target.closest('button:not(.iac-grabber)') || e.target.closest('input,textarea,select,a')) return;
            y0 = e.clientY; dy = 0; ultimoT = performance.now(); ultimoY = e.clientY; vel = 0;
            try { cabeca.setPointerCapture(e.pointerId); } catch (err) { /* sem captura: segue assim mesmo */ }
        });
        cabeca.addEventListener('pointermove', (e) => {
            if (y0 === null) return;
            dy = Math.max(0, e.clientY - y0);
            const agora = performance.now();
            if (agora - ultimoT > 0) vel = (e.clientY - ultimoY) / (agora - ultimoT);
            ultimoY = e.clientY; ultimoT = agora;
            folha.style.transition = 'none';
            folha.style.transform = 'translateY(' + dy + 'px)';
            overlay.style.opacity = String(Math.max(0.35, 1 - dy / 420));
        });
        cabeca.addEventListener('pointerup', soltar);
        cabeca.addEventListener('pointercancel', soltar);
    }

    function varrer() { document.querySelectorAll('.sheet-overlay').forEach(ligar); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', varrer); else varrer();
    new MutationObserver(varrer).observe(document.body, { childList: true });
})();

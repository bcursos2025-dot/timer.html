/* Acalmar (respiração guiada e aterramento 5-4-3-2-1) e Reset de foco de 2 minutos.
   Código copiado de interface-popup/popup.js da extensão; só foram acrescentados o
   invólucro e a troca das abas "Acalmar | Foco | Estudos" do cartão "Mais ferramentas". */
(function () {
    'use strict';
    // ===================== ACALMAR A ANSIEDADE (RESPIRAÇÃO GUIADA) =====================
    // Padrões de respiração com evidência de uso clínico/popular para reduzir
    // ansiedade e estresse agudo (cada fase em segundos):
    //  - Box (4-4-4-4): usada em contextos de alta pressão (inclusive treinamento
    //    militar), 4 fases iguais — inspira, segura, expira, segura.
    //  - 4-7-8: expiração bem mais longa que a inspiração, efeito mais sedativo,
    //    boa para desacelerar antes de tentar dormir ou em pico de ansiedade.
    //  - Calma rápida (4-2-6): expiração mais longa que a inspiração ativa o
    //    sistema nervoso parassimpático mais rápido, útil quando o tempo é curto.
    const BREATHING_PATTERNS = {
        box: [
            { label: 'Inspire', seg: 4 },
            { label: 'Segure', seg: 4 },
            { label: 'Expire', seg: 4 },
            { label: 'Segure', seg: 4 },
        ],
        relax: [
            { label: 'Inspire', seg: 4 },
            { label: 'Segure', seg: 7 },
            { label: 'Expire', seg: 8 },
        ],
        calma: [
            { label: 'Inspire', seg: 4 },
            { label: 'Segure', seg: 2 },
            { label: 'Expire', seg: 6 },
        ],
    };
    let breathingPatternAtual = 'box';
    let breathingAtiva = false;
    let breathingTimeoutId = null;
    let breathingTickId = null;
    let breathingCiclos = 0;

    const calmPatternBtns = document.querySelectorAll('#calm-pattern-controls button');
    const breathingCircleEl = document.getElementById('breathing-circle');
    const breathingPhaseEl = document.getElementById('breathing-phase');
    const breathingCountEl = document.getElementById('breathing-count');
    const breathingCyclesEl = document.getElementById('breathing-cycles');
    const btnBreathingToggle = document.getElementById('btn-breathing-toggle');

    calmPatternBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (breathingAtiva) pararRespiracao();
            calmPatternBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            breathingPatternAtual = btn.dataset.pattern;
        });
    });

    function pararRespiracao() {
        breathingAtiva = false;
        clearTimeout(breathingTimeoutId);
        clearInterval(breathingTickId);
        breathingCircleEl.className = 'breathing-circle';
        breathingPhaseEl.textContent = 'Pronto?';
        breathingCountEl.textContent = '';  // parado: sem número (o traço "—" em 40px parecia um risco no meio do cartão)
        btnBreathingToggle.textContent = 'Iniciar respiração';
    }

    function rodarFaseRespiracao(fases, indice) {
        if (!breathingAtiva) return;
        const fase = fases[indice % fases.length];
        if (indice > 0 && indice % fases.length === 0) {
            breathingCiclos++;
            breathingCyclesEl.textContent = `${breathingCiclos} ciclo${breathingCiclos === 1 ? '' : 's'} completo${breathingCiclos === 1 ? '' : 's'}`;
        }

        breathingPhaseEl.textContent = fase.label;
        breathingCircleEl.className = 'breathing-circle';
        void breathingCircleEl.offsetWidth; // reinicia a animação CSS
        let classeAnim;
        if (fase.label === 'Inspire') {
            classeAnim = 'inspirando';
        } else if (fase.label === 'Expire') {
            classeAnim = 'expirando';
        } else {
            // "Segure" existe em dois momentos diferentes do ciclo (depois de
            // inspirar OU depois de expirar — o padrão Box tem os dois) e
            // cada um precisa manter o tamanho de onde a bolinha "parou":
            // grande se acabou de inspirar, pequena se acabou de expirar.
            // Olha a fase ANTERIOR (com wrap-around pro fim do array, pro
            // caso da própria primeira fase do ciclo ser "Segure") pra saber
            // qual das duas.
            const faseAnterior = fases[(indice - 1 + fases.length) % fases.length];
            classeAnim = faseAnterior.label === 'Expire' ? 'segurando-vazio' : 'segurando-cheio';
        }
        breathingCircleEl.classList.add(classeAnim);
        breathingCircleEl.style.transitionDuration = `${fase.seg}s`;

        let restante = fase.seg;
        breathingCountEl.textContent = restante;
        clearInterval(breathingTickId);
        breathingTickId = setInterval(() => {
            restante--;
            if (restante > 0) breathingCountEl.textContent = restante;
        }, 1000);

        breathingTimeoutId = setTimeout(() => {
            clearInterval(breathingTickId);
            rodarFaseRespiracao(fases, indice + 1);
        }, fase.seg * 1000);
    }

    function iniciarRespiracao() {
        breathingAtiva = true;
        breathingCiclos = 0;
        breathingCyclesEl.textContent = '0 ciclos completos';
        btnBreathingToggle.textContent = 'Parar';
        rodarFaseRespiracao(BREATHING_PATTERNS[breathingPatternAtual], 0);
    }

    btnBreathingToggle?.addEventListener('click', () => {
        if (breathingAtiva) pararRespiracao();
        else iniciarRespiracao();
    });

    // ----- Aterramento 5-4-3-2-1 -----
    const GROUNDING_STEPS = [
        { n: 5, sentido: 'coisas que você consegue VER ao seu redor agora', icone: '👀' },
        { n: 4, sentido: 'coisas que você consegue TOCAR perto de você', icone: '✋' },
        { n: 3, sentido: 'sons que você consegue OUVIR neste momento', icone: '👂' },
        { n: 2, sentido: 'cheiros que você consegue perceber (ou de que gosta)', icone: '👃' },
        { n: 1, sentido: 'coisa boa que você pode dizer sobre si mesmo agora', icone: '💚' },
    ];
    let groundingStepAtual = 0;
    const groundingStepRender = document.getElementById('grounding-step-render');
    const btnGroundingToggle = document.getElementById('btn-grounding-toggle');
    const calmGroundingBody = document.getElementById('calm-grounding-body');

    function renderGroundingStep() {
        if (groundingStepAtual >= GROUNDING_STEPS.length) {
            groundingStepRender.innerHTML = `
                <div class="grounding-done">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.2 2.2 4.8-4.8"/></svg>
                    <span>Exercício concluído. Repare como você está agora, comparado a antes de começar.</span>
                </div>
                <button class="breathing-btn breathing-btn--ghost" id="btn-grounding-restart">Recomeçar</button>
            `;
            document.getElementById('btn-grounding-restart')?.addEventListener('click', () => {
                groundingStepAtual = 0;
                renderGroundingStep();
            });
            return;
        }
        const step = GROUNDING_STEPS[groundingStepAtual];
        groundingStepRender.innerHTML = `
            <div class="grounding-step">
                <span class="grounding-step-num">${step.icone} ${step.n}</span>
                <p>Nomeie <strong>${step.n}</strong> ${step.sentido}.</p>
                <button class="breathing-btn" id="btn-grounding-next">${groundingStepAtual === GROUNDING_STEPS.length - 1 ? 'Concluir' : 'Próximo'}</button>
            </div>
        `;
        document.getElementById('btn-grounding-next')?.addEventListener('click', () => {
            groundingStepAtual++;
            renderGroundingStep();
        });
    }
    renderGroundingStep();

    btnGroundingToggle?.addEventListener('click', () => {
        calmGroundingBody.classList.toggle('open');
        btnGroundingToggle.classList.toggle('open');
    });

    // ===================== RECUPERAR O FOCO =====================
    // Reset de foco de 2 minutos: transição curta entre "modo scroll" (vídeos
    // curtos, estímulo constante) e foco sustentado, combinando três passos com
    // apoio em pesquisa — desacelerar a respiração, soltar o olhar de perto
    // (relaxa o sistema visual acostumado a telas) e escolher uma única tarefa
    // antes de recomeçar, em vez de alternar entre várias.
    const FOCUS_RESET_STEPS = [
        { seg: 20, texto: 'Olhe para o ponto mais distante que conseguir ver (janela, fim da sala). Solte o foco de perto por alguns segundos.' },
        { seg: 60, texto: 'Respire devagar: inspire por 4s, expire por 6s. Deixe os pensamentos passarem sem seguir nenhum.' },
        { seg: 40, texto: 'Escolha mentalmente UMA única coisa para fazer nos próximos minutos. Só essa. O resto espera.' },
    ];
    let focusResetAtivo = false;
    let focusResetIntervalId = null;
    const focusResetTimeEl = document.getElementById('focus-reset-time');
    const focusResetInstructionEl = document.getElementById('focus-reset-instruction');
    const focusResetFillEl = document.getElementById('focus-reset-fill');
    const btnFocusReset = document.getElementById('btn-focus-reset');

    function formatMMSS(totalSeg) {
        const m = Math.floor(totalSeg / 60);
        const s = totalSeg % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function pararFocusReset(concluido) {
        focusResetAtivo = false;
        clearInterval(focusResetIntervalId);
        btnFocusReset.textContent = 'Iniciar reset de foco';
        focusResetFillEl.style.width = '0%';
        focusResetTimeEl.textContent = '02:00';
        focusResetInstructionEl.textContent = concluido
            ? 'Feito! Agora aproveite esse foco e comece a tarefa que você escolheu, sem abrir redes sociais antes.'
            : 'Um exercício curto pra sair do modo "scroll" antes de voltar a estudar: olhar longe, respirar devagar e escolher uma única tarefa.';
    }

    function iniciarFocusReset() {
        focusResetAtivo = true;
        btnFocusReset.textContent = 'Cancelar';
        const totalSeg = FOCUS_RESET_STEPS.reduce((s, p) => s + p.seg, 0);
        let decorrido = 0;
        let stepIdx = 0;
        let restanteStep = FOCUS_RESET_STEPS[0].seg;
        focusResetInstructionEl.textContent = FOCUS_RESET_STEPS[0].texto;

        focusResetIntervalId = setInterval(() => {
            decorrido++;
            restanteStep--;
            const restanteTotal = totalSeg - decorrido;
            focusResetTimeEl.textContent = formatMMSS(Math.max(0, restanteTotal));
            focusResetFillEl.style.width = `${Math.min(100, (decorrido / totalSeg) * 100)}%`;

            if (restanteStep <= 0 && stepIdx < FOCUS_RESET_STEPS.length - 1) {
                stepIdx++;
                restanteStep = FOCUS_RESET_STEPS[stepIdx].seg;
                focusResetInstructionEl.textContent = FOCUS_RESET_STEPS[stepIdx].texto;
            }
            if (decorrido >= totalSeg) {
                pararFocusReset(true);
            }
        }, 1000);
    }

    btnFocusReset?.addEventListener('click', () => {
        if (focusResetAtivo) pararFocusReset(false);
        else iniciarFocusReset();
    });

    // ---- abas do cartão "Mais ferramentas" ----
    const abas = document.getElementById('ferrAbas');
    if (abas) abas.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-f]'); if (!b) return;
        abas.querySelectorAll('button').forEach((x) => x.classList.toggle('ativo', x === b));
        document.querySelectorAll('.ferr-painel').forEach((p) => { p.hidden = p.dataset.f !== b.dataset.f; });
        if (b.dataset.f !== 'calma' && breathingAtiva) pararRespiracao();
    });
})();

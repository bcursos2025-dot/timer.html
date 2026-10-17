// =====================================================================
// ESTUDOS — autoavaliação diária honesta ("eu me dei ao máximo ontem?")
// e relatório mensal. Arquivo isolado do popup.js (mesmo padrão do
// tarefas-widget.js) pra não mexer no arquivo grande existente.
//
// Cópia de interface-popup/estudos.js da extensão. No site guarda no localStorage ("cb2_estudos_registro"), só neste aparelho:
//   { "2026-09-10": { nota: 0|1|2|3, comentario: "...", ts: 173... }, ... }
// =====================================================================
(function () {
    const CHAVE_STORAGE = 'cbEstudosRegistro';

    const cardTitulo = document.getElementById('estudos-card-titulo');
    const dataAvaliadaEl = document.getElementById('estudos-data-avaliada');
    const segEl = document.getElementById('estudos-escala');
    const segThumb = document.getElementById('estudos-seg-thumb');
    const segLegenda = document.getElementById('estudos-seg-legenda');
    const comentarioEl = document.getElementById('estudos-comentario');
    const statusMsgEl = document.getElementById('estudos-status-msg');
    const btnSalvar = document.getElementById('estudos-btn-salvar');
    const ultimosDiasEl = document.getElementById('estudos-ultimos-dias');
    const mesLabelEl = document.getElementById('estudos-mes-label');
    const mesPrevBtn = document.getElementById('estudos-mes-prev');
    const mesNextBtn = document.getElementById('estudos-mes-next');
    const relatorioCorpoEl = document.getElementById('estudos-relatorio-corpo');

    // Se a aba "Estudos" ainda não existir nesta versão do popup.html, sai
    // silenciosamente (mesma defesa usada no tarefas-widget.js).
    if (!segEl || !btnSalvar || !relatorioCorpoEl) return;

    const NOTA_DESC = [
        '0 — Muito ruim: você sabe que não se dedicou de verdade.',
        '1 — Ruim: teve esforço, mas bem abaixo do que você é capaz.',
        '2 — Bom: se dedicou na maior parte do tempo.',
        '3 — Muito bom: deu o seu máximo de verdade.'
    ];
    const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const DIAS_SEMANA_ABREV = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

    let registro = {};
    let notaSelecionadaTemp = null;
    let dataSelecionadaForm = keyDia(addDias(hoje(), -1)); // por padrão, avalia "ontem"
    let mesAtual = { ano: hoje().getFullYear(), mes: hoje().getMonth() };

    // ---------------- helpers de data ----------------
    function hoje() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }
    function addDias(data, n) {
        const d = new Date(data);
        d.setDate(d.getDate() + n);
        return d;
    }
    function keyDia(data) {
        const y = data.getFullYear();
        const m = String(data.getMonth() + 1).padStart(2, '0');
        const d = String(data.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    function dataDaKey(key) {
        const [y, m, d] = key.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    function formatLabelLongo(data) {
        return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(data);
    }

    // ---------------- storage ----------------
    function carregarRegistro() {
        try { return Promise.resolve(JSON.parse(localStorage.getItem('cb2_estudos_registro') || '{}') || {}); }
        catch (e) { return Promise.resolve({}); }
    }
    function salvarRegistro() {
        try { localStorage.setItem('cb2_estudos_registro', JSON.stringify(registro)); } catch (e) { /* armazenamento cheio ou bloqueado */ }
        return Promise.resolve();
    }

    // ---------------- segmented control ----------------
    function moverThumbPara(nota) {
        if (nota === null) {
            segThumb.style.opacity = '0';
            return;
        }
        segThumb.style.opacity = '1';
        segThumb.style.transform = `translateX(${nota * 100}%)`;
    }

    function marcarSegAtivo(nota) {
        segEl.querySelectorAll('.estudos-seg-opt').forEach((btn) => {
            btn.classList.toggle('active', Number(btn.dataset.nota) === nota);
        });
        moverThumbPara(nota);
        segLegenda.textContent = nota === null
            ? 'Toque numa nota — 0 é muito ruim, 3 é muito bom.'
            : NOTA_DESC[nota];
    }

    segEl.querySelectorAll('.estudos-seg-opt').forEach((btn) => {
        btn.addEventListener('click', () => {
            notaSelecionadaTemp = Number(btn.dataset.nota);
            marcarSegAtivo(notaSelecionadaTemp);
            btnSalvar.classList.remove('salvo');
            btnSalvar.querySelector('.estudos-btn-salvar-txt').textContent = 'Salvar';
        });
    });

    // ---------------- card principal (form) ----------------
    function renderCardForm() {
        const dataObj = dataDaKey(dataSelecionadaForm);
        const ehOntem = dataSelecionadaForm === keyDia(addDias(hoje(), -1));

        if (cardTitulo) {
            cardTitulo.textContent = ehOntem
                ? 'Eu me dei ao máximo ontem nos estudos?'
                : 'Eu me dei ao máximo nesse dia nos estudos?';
        }
        if (dataAvaliadaEl) dataAvaliadaEl.textContent = formatLabelLongo(dataObj);

        const existente = registro[dataSelecionadaForm];
        notaSelecionadaTemp = existente ? existente.nota : null;
        marcarSegAtivo(notaSelecionadaTemp);
        comentarioEl.value = existente ? (existente.comentario || '') : '';

        statusMsgEl.textContent = existente
            ? 'Respondido — pode alterar e salvar de novo.'
            : 'Ainda sem resposta pra esse dia.';

        btnSalvar.classList.remove('salvo');
        btnSalvar.querySelector('.estudos-btn-salvar-txt').textContent = 'Salvar';
    }

    btnSalvar.addEventListener('click', async () => {
        if (notaSelecionadaTemp === null) {
            statusMsgEl.textContent = 'Escolha uma nota de 0 a 3 antes de salvar.';
            return;
        }
        registro[dataSelecionadaForm] = {
            nota: notaSelecionadaTemp,
            comentario: comentarioEl.value.trim(),
            ts: Date.now()
        };
        await salvarRegistro();
        statusMsgEl.textContent = 'Salvo! Continue sendo honesto com você mesmo amanhã também.';
        btnSalvar.classList.add('salvo');
        btnSalvar.querySelector('.estudos-btn-salvar-txt').textContent = 'Salvo';
        renderUltimosDias();
        renderRelatorio();
    });

    // ---------------- últimos dias ----------------
    function renderUltimosDias() {
        ultimosDiasEl.innerHTML = '';
        const ontem = addDias(hoje(), -1);
        for (let i = 6; i >= 0; i--) {
            const data = addDias(ontem, -i);
            const key = keyDia(data);
            const entrada = registro[key];

            const item = document.createElement('button');
            item.className = 'estudos-dia-dot';
            if (key === dataSelecionadaForm) item.classList.add('hoje-avaliado');

            const bola = document.createElement('span');
            bola.className = 'estudos-dia-bola' + (entrada ? ` n${entrada.nota}` : '');

            const label = document.createElement('span');
            label.textContent = DIAS_SEMANA_ABREV[data.getDay()] + ' ' + data.getDate();

            item.appendChild(bola);
            item.appendChild(label);
            item.title = entrada ? `Nota ${entrada.nota} — clique pra corrigir` : 'Clique pra responder este dia';
            item.addEventListener('click', () => {
                dataSelecionadaForm = key;
                renderCardForm();
                renderUltimosDias();
            });
            ultimosDiasEl.appendChild(item);
        }
    }

    // ---------------- relatório mensal ----------------
    function mesEhFuturo(ano, mes) {
        const atual = hoje();
        return ano > atual.getFullYear() || (ano === atual.getFullYear() && mes > atual.getMonth());
    }

    function renderRelatorio() {
        const { ano, mes } = mesAtual;
        mesLabelEl.textContent = `${MESES_PT[mes]} de ${ano}`;
        mesNextBtn.disabled = mesEhFuturo(ano, mes + 1);

        const diasNoMes = new Date(ano, mes + 1, 0).getDate();
        const atual = hoje();
        const ehMesAtual = ano === atual.getFullYear() && mes === atual.getMonth();
        const limiteDia = ehMesAtual ? Math.max(atual.getDate() - 1, 0) : diasNoMes; // não cobra "hoje", só até ontem

        let soma = 0, respondidos = 0;
        const dist = [0, 0, 0, 0];
        const diasDoMes = [];

        for (let dia = 1; dia <= diasNoMes; dia++) {
            const key = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            const entrada = registro[key];
            diasDoMes.push({ dia, entrada });
            if (entrada) {
                soma += entrada.nota;
                respondidos++;
                dist[entrada.nota]++;
            }
        }

        relatorioCorpoEl.innerHTML = '';
        const totalDiasValidos = limiteDia > 0 ? limiteDia : diasNoMes;

        if (respondidos === 0) {
            const vazio = document.createElement('div');
            vazio.className = 'estudos-relatorio-vazio';
            vazio.textContent = (ehMesAtual && limiteDia <= 0)
                ? 'Ainda não passou nenhum dia completo pra avaliar neste mês.'
                : 'Nenhum dia registrado neste mês ainda.';
            relatorioCorpoEl.appendChild(vazio);
            return;
        }

        const media = soma / respondidos;
        const pct = Math.round((media / 3) * 100);

        // ---- anel de progresso + descrição ----
        const anelLinha = document.createElement('div');
        anelLinha.className = 'estudos-anel-linha';
        anelLinha.innerHTML = `
            <div class="estudos-anel" style="--estudos-pct:${pct}%">
                <div class="estudos-anel-miolo">
                    <span class="estudos-anel-num">${media.toFixed(1)}</span>
                    <span class="estudos-anel-den">DE 3</span>
                </div>
            </div>
            <div class="estudos-anel-desc"><strong>${respondidos}</strong> de ${totalDiasValidos} dia(s) avaliado(s) neste mês.</div>
        `;
        relatorioCorpoEl.appendChild(anelLinha);

        // ---- distribuição ----
        const distWrap = document.createElement('div');
        distWrap.className = 'estudos-dist-barras';
        for (let n = 3; n >= 0; n--) {
            const percentualBarra = respondidos ? Math.round((dist[n] / respondidos) * 100) : 0;
            const linha = document.createElement('div');
            linha.className = 'estudos-dist-linha';
            linha.innerHTML = `
                <span class="estudos-dist-rotulo">${n}</span>
                <span class="estudos-dist-trilho"><span class="estudos-dist-fill n${n}" style="width:${percentualBarra}%"></span></span>
                <span class="estudos-dist-count">${dist[n]}</span>
            `;
            distWrap.appendChild(linha);
        }
        relatorioCorpoEl.appendChild(distWrap);

        // ---- calendário do mês ----
        const cal = document.createElement('div');
        cal.className = 'estudos-calendario';
        DIAS_SEMANA_ABREV.forEach((d) => {
            const head = document.createElement('div');
            head.className = 'estudos-cal-dia estudos-cal-head';
            head.textContent = d[0].toUpperCase();
            cal.appendChild(head);
        });
        const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
        for (let i = 0; i < primeiroDiaSemana; i++) {
            const vazio = document.createElement('div');
            vazio.className = 'estudos-cal-dia vazio';
            cal.appendChild(vazio);
        }
        diasDoMes.forEach(({ dia, entrada }) => {
            const cel = document.createElement('div');
            cel.className = 'estudos-cal-dia' + (entrada ? ` n${entrada.nota}` : '');
            cel.textContent = dia;
            cal.appendChild(cel);
        });
        relatorioCorpoEl.appendChild(cal);

        const legenda = document.createElement('div');
        legenda.className = 'estudos-cal-legenda';
        legenda.innerHTML = `
            <span>pouco</span>
            <span class="estudos-cal-legenda-bola n0"></span>
            <span class="estudos-cal-legenda-bola n1"></span>
            <span class="estudos-cal-legenda-bola n2"></span>
            <span class="estudos-cal-legenda-bola n3"></span>
            <span>muito</span>
        `;
        relatorioCorpoEl.appendChild(legenda);

        // ---- mensagem final ----
        const resumo = document.createElement('div');
        resumo.className = 'estudos-resumo-texto';
        resumo.textContent = mensagemParaMedia(media, respondidos, totalDiasValidos);
        relatorioCorpoEl.appendChild(resumo);
    }

    function mensagemParaMedia(media, respondidos, totalDias) {
        const cobertura = respondidos < totalDias
            ? ` Você só registrou ${respondidos} de ${totalDias} dias — tente responder todo dia pra esse número refletir a realidade.`
            : '';
        if (media < 1) {
            return 'A maioria dos dias ficou marcada como "muito ruim" ou "ruim". Vale parar e ser sincero: o que está tirando o seu foco de verdade? Pequenos ajustes na rotina de hoje já contam.' + cobertura;
        }
        if (media < 2) {
            return 'Média mediana neste mês — teve esforço, mas ainda longe do seu máximo na maior parte dos dias. Escolha um ponto específico pra melhorar amanhã, em vez de tentar consertar tudo de uma vez.' + cobertura;
        }
        if (media < 2.5) {
            return 'Bom mês! Na maioria dos dias você se dedicou de verdade. Olhe os dias mais fracos no calendário acima e veja o que foi diferente neles.' + cobertura;
        }
        return 'Excelente consistência — você tem se dado ao máximo quase todos os dias. Continue assim, e não deixe de registrar mesmo nos dias ruins, eles também contam pro relatório.' + cobertura;
    }

    mesPrevBtn.addEventListener('click', () => {
        mesAtual.mes--;
        if (mesAtual.mes < 0) { mesAtual.mes = 11; mesAtual.ano--; }
        renderRelatorio();
    });
    mesNextBtn.addEventListener('click', () => {
        if (mesEhFuturo(mesAtual.ano, mesAtual.mes + 1)) return;
        mesAtual.mes++;
        if (mesAtual.mes > 11) { mesAtual.mes = 0; mesAtual.ano++; }
        renderRelatorio();
    });

    (async () => {
        registro = await carregarRegistro();
        renderCardForm();
        renderUltimosDias();
        renderRelatorio();
    })();
})();

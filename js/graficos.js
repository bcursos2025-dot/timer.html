// ============================================================================
// graficos.js — dois gráficos desenhados à mão em SVG
// ----------------------------------------------------------------------------
//   1) cbAreaSuave  — curva suave com preenchimento em degradê (evolução no tempo)
//   2) cbRadar      — teia por matéria (equilíbrio no edital)
//
// POR QUE SVG NA MÃO, E NÃO UMA BIBLIOTECA
//   Extensão MV3 tem Content Security Policy: biblioteca de CDN não carrega, e
//   embutir Chart.js seriam ~200 KB no pacote para desenhar duas formas. Estas
//   duas cabem em pouco mais de 200 linhas e não trazem dependência nenhuma.
//
// AS CORES VÊM DO TEMA, NÃO DAQUI
//   O SVG fica embutido no HTML, então `var(--accent)` funciona dentro dele e
//   os três temas (claro, escuro, navy) são atendidos sem nenhum código extra.
//   Só o degradê precisa de <linearGradient>, porque `fill` com degradê não
//   aceita variável CSS direto — daí o id único por gráfico.
// ============================================================================

(function (escopo) {
    'use strict';

    let _seq = 0;
    function idUnico(prefixo) { _seq += 1; return prefixo + '-' + _seq; }

    function esc(t) {
        return String(t == null ? '' : t)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ========================================================================
    //  INTERPOLAÇÃO MONOTÔNICA (Fritsch–Carlson)
    // ------------------------------------------------------------------------
    //  A curva "bonita" mais comum (Catmull-Rom) tem um defeito sério aqui:
    //  entre dois pontos ela ULTRAPASSA os valores deles. Num gráfico de horas
    //  estudadas isso desenha a curva abaixo de zero entre um dia de 4 h e um
    //  dia de 0 h — ou seja, o gráfico mostraria tempo negativo, que não existe.
    //
    //  A monotônica resolve: ela é suave, mas garante que a curva nunca passa
    //  fora do intervalo dos pontos vizinhos. É a mesma escolha que o d3 faz
    //  com curveMonotoneX, e pelo mesmo motivo.
    // ========================================================================
    function tangentesMonotonicas(xs, ys) {
        const n = xs.length;
        if (n < 2) return [0];

        const delta = [];   // inclinação de cada trecho
        for (let i = 0; i < n - 1; i++) {
            const dx = xs[i + 1] - xs[i];
            delta.push(dx === 0 ? 0 : (ys[i + 1] - ys[i]) / dx);
        }

        const m = [delta[0]];
        for (let i = 1; i < n - 1; i++) {
            // Trecho que sobe seguido de trecho que desce (ou o contrário):
            // o ponto é um pico ou um vale, e a tangente tem que ser zero,
            // senão a curva "passa do ponto" e inventa valor.
            if (delta[i - 1] * delta[i] <= 0) m.push(0);
            else m.push((delta[i - 1] + delta[i]) / 2);
        }
        m.push(delta[n - 2]);

        // Ajuste final que impede o exagero da curva (o passo do algoritmo
        // de Fritsch–Carlson que garante a monotonicidade de verdade).
        for (let i = 0; i < n - 1; i++) {
            if (delta[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
            const a = m[i] / delta[i];
            const b = m[i + 1] / delta[i];
            const s = a * a + b * b;
            if (s > 9) {
                const t = 3 / Math.sqrt(s);
                m[i] = t * a * delta[i];
                m[i + 1] = t * b * delta[i];
            }
        }
        return m;
    }

    function caminhoSuave(pontos) {
        if (pontos.length === 0) return '';
        if (pontos.length === 1) return 'M ' + pontos[0].x + ' ' + pontos[0].y;

        const xs = pontos.map((p) => p.x);
        const ys = pontos.map((p) => p.y);
        const m = tangentesMonotonicas(xs, ys);

        let d = 'M ' + xs[0].toFixed(2) + ' ' + ys[0].toFixed(2);
        for (let i = 0; i < pontos.length - 1; i++) {
            const dx = xs[i + 1] - xs[i];
            const c1x = xs[i] + dx / 3;
            const c1y = ys[i] + (m[i] * dx) / 3;
            const c2x = xs[i + 1] - dx / 3;
            const c2y = ys[i + 1] - (m[i + 1] * dx) / 3;
            d += ' C ' + c1x.toFixed(2) + ' ' + c1y.toFixed(2) +
                 ', ' + c2x.toFixed(2) + ' ' + c2y.toFixed(2) +
                 ', ' + xs[i + 1].toFixed(2) + ' ' + ys[i + 1].toFixed(2);
        }
        return d;
    }

    // ========================================================================
    //  1) ÁREA SUAVE
    //  dados: [{ rotulo, valor }]   opcoes: { formatar, altura, titulo }
    // ========================================================================
    function cbAreaSuave(dados, opcoes) {
        const o = opcoes || {};
        const formatar = o.formatar || ((v) => String(v));
        const L = 400, A = o.altura || 150;
        const mE = 42, mD = 10, mT = 14, mB = 26;   // margens
        const larg = L - mE - mD;
        const alt = A - mT - mB;

        if (!dados || dados.length === 0) return '';

        const valores = dados.map((d) => Number(d.valor) || 0);
        const maxReal = Math.max.apply(null, valores);
        // Teto com folga de 15% pro pico não encostar no topo, e nunca zero.
        const max = maxReal > 0 ? maxReal * 1.15 : 1;

        const n = dados.length;
        const px = (i) => mE + (n === 1 ? larg / 2 : (i / (n - 1)) * larg);
        const py = (v) => mT + alt - (v / max) * alt;

        const pontos = valores.map((v, i) => ({ x: px(i), y: py(v) }));
        const linha = caminhoSuave(pontos);
        const area = linha + ' L ' + pontos[pontos.length - 1].x.toFixed(2) + ' ' + (mT + alt) +
                     ' L ' + pontos[0].x.toFixed(2) + ' ' + (mT + alt) + ' Z';

        const idGrad = idUnico('cbgrad');

        // Três linhas de grade horizontais. Mais que isso vira gaiola.
        let grade = '';
        for (let i = 0; i <= 3; i++) {
            const v = (max / 3) * i;
            const y = py(v);
            grade += `<line x1="${mE}" y1="${y.toFixed(1)}" x2="${L - mD}" y2="${y.toFixed(1)}"
                        stroke="currentColor" stroke-opacity="0.10" stroke-width="1"/>`;
            grade += `<text x="${mE - 7}" y="${(y + 3.2).toFixed(1)}" text-anchor="end"
                        font-size="8" fill="currentColor" fill-opacity="0.45">${esc(formatar(v))}</text>`;
        }

        // Rótulos do eixo X: no máximo 7, senão viram borrão.
        const passo = Math.max(1, Math.ceil(n / 7));
        let rotulos = '';
        dados.forEach((d, i) => {
            if (i % passo !== 0 && i !== n - 1) return;
            rotulos += `<text x="${px(i).toFixed(1)}" y="${A - 8}" text-anchor="middle"
                          font-size="8" fill="currentColor" fill-opacity="0.45">${esc(d.rotulo)}</text>`;
        });

        // Pontinho só nos valores que importam: o maior e o último. Bolinha em
        // todo ponto polui e some no meio da própria linha.
        const iMax = valores.indexOf(maxReal);
        let marcas = '';
        [iMax, n - 1].forEach((i) => {
            if (i < 0 || !pontos[i]) return;
            marcas += `<circle cx="${pontos[i].x.toFixed(1)}" cy="${pontos[i].y.toFixed(1)}" r="3.2"
                         fill="var(--bg-elevated)" stroke="var(--accent)" stroke-width="2"/>`;
        });

        const rotuloPico = maxReal > 0
            ? `<text x="${Math.min(L - mD - 2, Math.max(mE + 2, pontos[iMax].x)).toFixed(1)}"
                     y="${Math.max(10, pontos[iMax].y - 8).toFixed(1)}" text-anchor="middle"
                     font-size="9" font-weight="700" fill="var(--accent)">${esc(formatar(maxReal))}</text>`
            : '';

        return `
<svg viewBox="0 0 ${L} ${A}" class="cb-svg-area" role="img"
     aria-label="${esc(o.titulo || 'Evolução no período')}">
  <defs>
    <linearGradient id="${idGrad}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="var(--accent)" stop-opacity="0.42"/>
      <stop offset="55%"  stop-color="var(--accent)" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g>${grade}</g>
  <path d="${area}" fill="url(#${idGrad})"/>
  <path d="${linha}" fill="none" stroke="var(--accent)" stroke-width="2.2"
        stroke-linecap="round" stroke-linejoin="round"/>
  ${marcas}
  ${rotuloPico}
  <g>${rotulos}</g>
</svg>`;
    }

    // ========================================================================
    //  2) RADAR (teia)
    //  eixos: [{ rotulo, valor, max? }]   opcoes: { formatar, titulo }
    // ========================================================================
    function cbRadar(eixos, opcoes) {
        const o = opcoes || {};
        const formatar = o.formatar || ((v) => String(v));
        // Abaixo de 3 eixos não existe polígono — vira linha. Nesse caso quem
        // chama deve mostrar uma lista simples, não um radar.
        if (!eixos || eixos.length < 3) return '';

        // A tela é MAIS LARGA que alta de propósito. Com uma tela quadrada, o
        // rótulo dos eixos da esquerda ("Raciocínio Lógico") era desenhado a
        // partir da borda pra fora e ficava cortado pela metade. Como o texto
        // cresce na horizontal e não na vertical, a folga extra tem que estar
        // nas laterais — daí 380 de largura pra 310 de altura.
        const LARG = 380, ALT = 310;
        const cx = LARG / 2, cy = ALT / 2 + 4;
        const raio = 92;
        const n = eixos.length;
        const aneis = 4;

        const maxDado = Math.max.apply(null, eixos.map((e) => Number(e.valor) || 0));
        const max = o.max || (maxDado > 0 ? maxDado : 1);

        // Começa no topo (-90°) e gira no sentido horário, que é como se lê.
        const ang = (i) => (-Math.PI / 2) + (i * 2 * Math.PI) / n;
        const ponto = (i, r) => ({
            x: cx + Math.cos(ang(i)) * r,
            y: cy + Math.sin(ang(i)) * r
        });

        let teia = '';
        for (let a = 1; a <= aneis; a++) {
            const r = (raio * a) / aneis;
            const pts = [];
            for (let i = 0; i < n; i++) {
                const p = ponto(i, r);
                pts.push(p.x.toFixed(1) + ',' + p.y.toFixed(1));
            }
            teia += `<polygon points="${pts.join(' ')}" fill="none" stroke="currentColor"
                       stroke-opacity="${a === aneis ? 0.22 : 0.10}" stroke-width="1"/>`;
        }

        let raios = '';
        for (let i = 0; i < n; i++) {
            const p = ponto(i, raio);
            raios += `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}"
                        stroke="currentColor" stroke-opacity="0.12" stroke-width="1"/>`;
        }

        const pts = [];
        let marcas = '';
        eixos.forEach((e, i) => {
            const v = Number(e.valor) || 0;
            // Piso de 4% do raio: matéria zerada precisa continuar visível como
            // ponto no centro, senão o polígono "engole" o eixo e a pessoa não
            // percebe que aquela matéria existe e está zerada — que é
            // justamente a informação mais importante do gráfico.
            const r = Math.max(raio * 0.04, (v / max) * raio);
            const p = ponto(i, r);
            pts.push(p.x.toFixed(1) + ',' + p.y.toFixed(1));
            marcas += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.6"
                         fill="var(--accent)"/>`;
        });

        const idGrad = idUnico('cbradar');

        let rotulos = '';
        eixos.forEach((e, i) => {
            const p = ponto(i, raio + 20);
            const cos = Math.cos(ang(i));
            const anchor = Math.abs(cos) < 0.2 ? 'middle' : (cos > 0 ? 'start' : 'end');
            const dy = Math.sin(ang(i)) > 0.7 ? 8 : (Math.sin(ang(i)) < -0.7 ? -2 : 3);

            // Nome curto: matéria longa quebraria o desenho todo.
            let nome = String(e.rotulo || '');
            if (nome.length > 14) nome = nome.slice(0, 13).trim() + '…';

            rotulos += `<text x="${p.x.toFixed(1)}" y="${(p.y + dy).toFixed(1)}" text-anchor="${anchor}"
                          font-size="9.5" font-weight="600" fill="currentColor" fill-opacity="0.72">${esc(nome)}</text>`;
            rotulos += `<text x="${p.x.toFixed(1)}" y="${(p.y + dy + 11).toFixed(1)}" text-anchor="${anchor}"
                          font-size="8.5" font-weight="700" fill="var(--accent)">${esc(formatar(e.valor))}</text>`;
        });

        return `
<svg viewBox="0 0 ${LARG} ${ALT}" class="cb-svg-radar" role="img"
     aria-label="${esc(o.titulo || 'Equilíbrio por matéria')}">
  <defs>
    <radialGradient id="${idGrad}">
      <stop offset="0%"   stop-color="var(--accent)" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.20"/>
    </radialGradient>
  </defs>
  <g>${teia}</g>
  <g>${raios}</g>
  <polygon points="${pts.join(' ')}" fill="url(#${idGrad})" stroke="var(--accent)"
           stroke-width="2" stroke-linejoin="round"/>
  ${marcas}
  <g>${rotulos}</g>
</svg>`;
    }

    escopo.CBGraficos = { cbAreaSuave, cbRadar, caminhoSuave };

// ============================================================================
//  3) MULTILINHA COM LEITURA AO PASSAR O MOUSE  (aba Geral)
// ----------------------------------------------------------------------------
//  O PROBLEMA CENTRAL, E COMO ELE FOI RESOLVIDO
//
//  Quatro grandezas de unidades diferentes no mesmo desenho: horas estudadas,
//  quantidade de questões, percentual de acerto e horas de distração. Plotar
//  tudo no mesmo eixo é mentira gráfica — "4 horas" e "80%" e "120 questões"
//  não dividem escala, e quem desenhasse assim faria a linha de questões
//  esmagar todas as outras contra o chão.
//
//  A saída: cada linha é normalizada PELO PRÓPRIO MÁXIMO do período. O eixo Y
//  deixa de ser uma unidade e passa a ser "quanto do seu melhor" — o que
//  torna as FORMAS comparáveis (subiu junto? caiu junto?) sem fingir que os
//  valores são. Os números de verdade aparecem no balão ao passar o mouse,
//  cada um na sua unidade.
//
//  É por isso que o eixo Y é rotulado como % e a legenda diz "% do próprio
//  máximo": um eixo sem unidade declarada seria exatamente a mentira que
//  este desenho existe pra evitar.
// ============================================================================

    function cbMultiLinha(container, config) {
        if (!container) return;
        const rotulos = (config && config.rotulos) || [];
        const series = ((config && config.series) || []).filter((s) => s && s.valores);
        if (rotulos.length < 2 || series.length === 0) { container.innerHTML = ''; return; }

        const L = 440, A = 224;
        // Mais ar em cima e embaixo: a referência respira, e aperto é o
        // cheiro mais forte de layout automático.
        const mE = 36, mD = 14, mT = 20, mB = 30;
        const larg = L - mE - mD, alt = A - mT - mB;
        const n = rotulos.length;
        const px = (i) => mE + (n === 1 ? larg / 2 : (i / (n - 1)) * larg);
        const py = (frac) => mT + alt - frac * alt;

        // Fração de 0 a 1 do próprio máximo. Série toda zerada vira linha no
        // chão — e isso é informação legítima ("não houve nada nesse período"),
        // não um caso a esconder.
        series.forEach((s) => {
            const max = Math.max.apply(null, s.valores.map((v) => Number(v) || 0));
            s._max = max;
            s._fracs = s.valores.map((v) => (max > 0 ? (Number(v) || 0) / max : 0));
        });

        // A grade da referência é VERTICAL, não horizontal — e é isso que
        // faz o desenho parecer leve. Faixas horizontais atravessando a
        // curva inteira competem com ela; linhas verticais discretas
        // ancoram os pontos sem cortar nada. Deixo três horizontais quase
        // invisíveis só pra dar noção de altura.
        let grade = '';
        for (let i = 0; i < n; i++) {
            grade += `<line x1="${px(i).toFixed(1)}" y1="${mT}" x2="${px(i).toFixed(1)}" y2="${mT + alt}"
                        stroke="currentColor" stroke-opacity="0.055" stroke-width="1"/>`;
        }
        for (let i = 0; i <= 4; i++) {
            const y = py(i / 4);
            if (i > 0 && i < 4) {
                grade += `<line x1="${mE}" y1="${y.toFixed(1)}" x2="${L - mD}" y2="${y.toFixed(1)}"
                            stroke="currentColor" stroke-opacity="0.045" stroke-width="1"/>`;
            }
            grade += `<text x="${mE - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="7.5"
                        fill="currentColor" fill-opacity="0.38">${i * 25}%</text>`;
        }

        const passo = Math.max(1, Math.ceil(n / 7));
        let eixoX = '';
        rotulos.forEach((r, i) => {
            if (i % passo !== 0 && i !== n - 1) return;
            eixoX += `<text x="${px(i).toFixed(1)}" y="${A - 8}" text-anchor="middle" font-size="7.5"
                        fill="currentColor" fill-opacity="0.4">${esc(r)}</text>`;
        });

        // PREENCHIMENTO SOB A LINHA — o que mais faltava em relação à
        // referência. Mas com uma condição: só entra quando há no máximo
        // DUAS linhas visíveis.
        //
        // A referência tem duas séries e por isso as áreas se sobrepõem
        // pouco. Com quatro, quatro degradês empilhados viram um borrão
        // colorido e as linhas somem dentro dele — ficaria pior que sem.
        // Então o gráfico se adapta: escondendo linhas na legenda, as
        // restantes ganham área; com todas visíveis, só traço.
        const visiveis = series.filter((x) => !x.oculta).length;
        const comArea = visiveis <= 2;

        let defs = '';
        let areas = '';
        let linhas = '';
        series.forEach((s, idx) => {
            const pts = s._fracs.map((f, i) => ({ x: px(i), y: py(f) }));
            const d = caminhoSuave(pts);
            const idg = idUnico('cbmlg');
            defs += `<linearGradient id="${idg}" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="0%" stop-color="${s.cor}" stop-opacity="0.34"/>
                       <stop offset="70%" stop-color="${s.cor}" stop-opacity="0.06"/>
                       <stop offset="100%" stop-color="${s.cor}" stop-opacity="0"/>
                     </linearGradient>`;
            const fechado = d + ` L ${pts[pts.length - 1].x.toFixed(1)} ${mT + alt}` +
                                ` L ${pts[0].x.toFixed(1)} ${mT + alt} Z`;
            areas += `<path class="cb-ml-area" data-serie="${idx}" d="${fechado}"
                        fill="url(#${idg})" opacity="${comArea && !s.oculta ? 1 : 0}"/>`;
            linhas += `<path class="cb-ml-linha" data-serie="${idx}" d="${d}"
                         fill="none" stroke="${s.cor}" stroke-width="2.6"
                         stroke-linecap="round" stroke-linejoin="round"
                         opacity="${s.oculta ? 0 : 1}"/>`;
        });

        // UMA faixa que cobre o gráfico inteiro, e o índice sai da posição do
        // mouse dentro dela.
        //
        // A primeira versão usava um retângulo por coluna com `mouseenter`, e
        // no teste o balão simplesmente não abria: entre um retângulo e o
        // seguinte há a fronteira exata onde o evento pode não disparar, e
        // qualquer elemento desenhado por cima rouba o ponteiro. Uma faixa só
        // com `mousemove` não tem fronteira pra falhar, cobre todo o gráfico e
        // ainda gera 1 nó no DOM em vez de N.
        const alvos = `<rect class="cb-ml-alvo" x="${mE}" y="${mT}"
                         width="${larg}" height="${alt}" fill="transparent"/>`;

        let marcas = '';
        series.forEach((s, idx) => {
            // Miolo claro com anel colorido, não bolinha chapada: é assim
            // que o ponto continua legível mesmo em cima da própria linha.
            marcas += `<circle class="cb-ml-ponto" data-serie="${idx}" r="4.6"
                         fill="var(--bg-elevated)" stroke="${s.cor}" stroke-width="2.6" opacity="0"/>`;
        });

        container.innerHTML = `
            <div class="cb-ml-wrap">
              <svg viewBox="0 0 ${L} ${A}" class="cb-ml-svg">
                <defs>${defs}</defs>
                <g>${grade}</g>
                <g class="cb-ml-areas">${areas}</g>
                <line class="cb-ml-guia" x1="0" y1="${mT}" x2="0" y2="${mT + alt}"
                      stroke="currentColor" stroke-opacity="0.28" stroke-width="1"
                      stroke-dasharray="3 3" opacity="0"/>
                <g>${linhas}</g>
                ${marcas}
                <g>${eixoX}</g>
                <g>${alvos}</g>
              </svg>
              <div class="cb-ml-balao" hidden></div>
            </div>`;

        const svg = container.querySelector('.cb-ml-svg');
        const guia = container.querySelector('.cb-ml-guia');
        const balao = container.querySelector('.cb-ml-balao');
        const pontos = Array.from(container.querySelectorAll('.cb-ml-ponto'));

        function mostrar(i) {
            const x = px(i);
            guia.setAttribute('x1', x); guia.setAttribute('x2', x);
            guia.setAttribute('opacity', '1');

            pontos.forEach((c, idx) => {
                const s = series[idx];
                if (s.oculta) { c.setAttribute('opacity', '0'); return; }
                c.setAttribute('cx', x.toFixed(1));
                c.setAttribute('cy', py(s._fracs[i]).toFixed(1));
                c.setAttribute('opacity', '1');
            });

            balao.innerHTML =
                `<div class="cb-ml-balao-tit">${esc(rotulos[i])}</div>` +
                series.filter((s) => !s.oculta).map((s) => `
                    <div class="cb-ml-balao-linha">
                        <span class="cb-ml-balao-cor" style="background:${s.cor}"></span>
                        <span class="cb-ml-balao-nome">${esc(s.nome)}</span>
                        <span class="cb-ml-balao-val">${esc(s.formatar ? s.formatar(s.valores[i]) : s.valores[i])}</span>
                    </div>`).join('');
            balao.hidden = false;

            // O balão vira de lado perto da borda direita pra não sair da caixa.
            const pct = (x / L) * 100;
            balao.style.left = pct + '%';
            balao.classList.toggle('a-esquerda', pct > 62);
        }

        function esconder() {
            guia.setAttribute('opacity', '0');
            pontos.forEach((c) => c.setAttribute('opacity', '0'));
            balao.hidden = true;
        }

        const alvo = container.querySelector('.cb-ml-alvo');

        // Converte a posição do ponteiro na tela para o índice da coluna mais
        // próxima. Divide pela largura RENDERIZADA, não pela do viewBox: o SVG
        // escala com o popup e as duas quase nunca são iguais.
        function indiceDoEvento(ev) {
            const caixa = svg.getBoundingClientRect();
            if (!caixa.width) return 0;
            const escalaX = L / caixa.width;
            const xNoGrafico = (ev.clientX - caixa.left) * escalaX;
            const frac = (xNoGrafico - mE) / (larg || 1);
            return Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
        }

        let ultimo = -1;
        // O balão sumia na hora que o mouse saía do gráfico — rápido demais
        // pra copiar/ler um valor com calma (pedido explícito pra dar uma
        // folga). Em vez de esconder na hora, agenda pra sumir daqui 4s; se
        // o mouse voltar antes disso (ou nunca chegou a sair de verdade,
        // só passou por cima de outro elemento por cima do SVG), o timeout
        // é cancelado e o balão continua onde estava.
        let esconderTimeoutId = null;
        function agendarEsconder() {
            clearTimeout(esconderTimeoutId);
            esconderTimeoutId = setTimeout(() => {
                ultimo = -1;
                esconder();
            }, 4000);
        }
        function esconderJa() {
            clearTimeout(esconderTimeoutId);
            ultimo = -1;
            esconder();
        }

        function aoMover(ev) {
            clearTimeout(esconderTimeoutId); // mouse ainda em cima: cancela o "sumir" agendado
            const i = indiceDoEvento(ev);
            // Só redesenha quando muda de coluna: sem isso, o balão seria
            // reconstruído a cada pixel de movimento do mouse.
            if (i === ultimo) return;
            ultimo = i;
            mostrar(i);
        }

        alvo.addEventListener('mousemove', aoMover);
        // No celular não existe "passar o mouse": o toque abre a leitura.
        alvo.addEventListener('click', aoMover);
        svg.addEventListener('mouseleave', agendarEsconder);

        return {
            alternarSerie(idx) {
                const s = series[idx];
                if (!s) return;
                s.oculta = !s.oculta;
                const linha = container.querySelector('.cb-ml-linha[data-serie="' + idx + '"]');
                if (linha) linha.style.opacity = s.oculta ? '0' : '1';

                // Com uma ou duas linhas na tela, as áreas voltam; com três
                // ou quatro, saem. O gráfico decide sozinho o que fica bom.
                const visiveisAgora = series.filter((x) => !x.oculta).length;
                container.querySelectorAll('.cb-ml-area').forEach((el, i) => {
                    el.style.opacity = (visiveisAgora <= 2 && !series[i].oculta) ? '1' : '0';
                });
                esconderJa();
                return s.oculta;
            }
        };
    }

    escopo.CBGraficos.cbMultiLinha = cbMultiLinha;
})(typeof self !== 'undefined' ? self : window);

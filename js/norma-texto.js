/* ============================================================
   NORMA — texto formatado dos comentários (negrito, sublinhado, marca-texto colorido, títulos, citação da lei, lista).
   O comentário é guardado como TEXTO SIMPLES com uma marcação curta e é desenhado na tela por este leitor, que só
   cria os elementos da lista abaixo com textContent. Nunca usa innerHTML nem aceita HTML, então um comentário não
   consegue injetar código.

   Marcação:
     # Título                  seção (título destacado)
     > trecho da lei           citação (laranja, com barra)
     - item                    lista
     **negrito**   __sublinhado__   *itálico*
     {amarelo|texto}  também laranja, azul, verde, rosa, vermelho   (marca-texto)
   Linha em branco separa parágrafos.
   ============================================================ */
(function () {
  'use strict';
  var CORES = ['amarelo', 'laranja', 'azul', 'verde', 'rosa', 'vermelho'];
  var MAX_PROF = 5;

  function el(tag, classe, texto) { var e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; }

  /* ---------- leitor: texto com marcação -> elementos ---------- */
  function inline(txt, pai, prof) {
    if (prof > MAX_PROF) { pai.append(document.createTextNode(txt)); return; }
    var i = 0, buf = '';
    function solta() { if (buf) { pai.append(document.createTextNode(buf)); buf = ''; } }
    while (i < txt.length) {
      var c = txt.charAt(i), dois = txt.substr(i, 2), f, n;
      if (dois === '**') {
        f = txt.indexOf('**', i + 2);
        if (f > i + 2) { solta(); n = el('strong'); inline(txt.slice(i + 2, f), n, prof + 1); pai.append(n); i = f + 2; continue; }
      }
      if (dois === '__') {
        f = txt.indexOf('__', i + 2);
        if (f > i + 2) { solta(); n = el('u'); inline(txt.slice(i + 2, f), n, prof + 1); pai.append(n); i = f + 2; continue; }
      }
      if (c === '*' && txt.charAt(i + 1) !== '*' && txt.charAt(i + 1) !== ' ' && txt.charAt(i + 1) !== '') {
        var j = i + 1;
        while (j < txt.length) {
          if (txt.charAt(j) === '*' && txt.charAt(j + 1) !== '*' && txt.charAt(j - 1) !== ' ' && txt.charAt(j - 1) !== '*') break;
          j++;
        }
        if (j < txt.length && j > i + 1) { solta(); n = el('em'); inline(txt.slice(i + 1, j), n, prof + 1); pai.append(n); i = j + 1; continue; }
      }
      if (c === '{') {
        var barra = txt.indexOf('|', i + 1);
        if (barra > i + 1 && barra - i - 1 <= 10 && CORES.indexOf(txt.slice(i + 1, barra)) >= 0) {
          var cor = txt.slice(i + 1, barra), d = 1, k = barra + 1;
          while (k < txt.length) { if (txt.charAt(k) === '{') d++; else if (txt.charAt(k) === '}') { d--; if (d === 0) break; } k++; }
          if (k < txt.length) { solta(); n = el('mark', 'mk-' + cor); inline(txt.slice(barra + 1, k), n, prof + 1); pai.append(n); i = k + 1; continue; }
        }
      }
      buf += c; i++;
    }
    solta();
  }

  function renderizar(texto, alvo) {
    alvo.textContent = ''; alvo.classList.add('n-rt');
    var L = String(texto == null ? '' : texto).replace(/\r\n?/g, '\n').split('\n'), i = 0;
    var ehTitulo = function (l) { return /^#\s+/.test(l); }, ehCit = function (l) { return /^>/.test(l); }, ehItem = function (l) { return /^-\s+/.test(l); };
    while (i < L.length) {
      var l = L[i];
      if (!l.trim()) { i++; continue; }
      if (ehTitulo(l)) { var h = el('h4'); inline(l.replace(/^#\s+/, ''), h, 0); alvo.append(h); i++; continue; }
      if (ehCit(l)) {
        var bq = el('blockquote'), k = 0;
        while (i < L.length && ehCit(L[i])) { if (k++) bq.append(el('br')); inline(L[i].replace(/^>\s?/, ''), bq, 0); i++; }
        alvo.append(bq); continue;
      }
      if (ehItem(l)) {
        var ul = el('ul');
        while (i < L.length && ehItem(L[i])) { var li = el('li'); inline(L[i].replace(/^-\s+/, ''), li, 0); ul.append(li); i++; }
        alvo.append(ul); continue;
      }
      var p = el('p'), primeira = true;
      while (i < L.length && L[i].trim() && !ehTitulo(L[i]) && !ehCit(L[i]) && !ehItem(L[i])) { if (!primeira) p.append(el('br')); inline(L[i], p, 0); primeira = false; i++; }
      alvo.append(p);
    }
  }

  /* texto sem as marcas (para resumos e prévias de uma linha) */
  function semMarcas(t) {
    return String(t == null ? '' : t).replace(/\r\n?/g, '\n')
      .replace(/^(#\s+|>\s?|-\s+)/gm, '')
      .replace(/\{(?:amarelo|laranja|azul|verde|rosa|vermelho)\|/g, '').replace(/\*\*|__|[{}]/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  /* ---------- editor: barra de formatação + pré-visualização ---------- */
  var MODELO = [
    '# Tema central', 'Diga em uma ou duas frases o assunto cobrado na questão.', '',
    '# Legislação aplicável', '> Cole aqui o trecho da lei (artigo, parágrafo ou inciso).', '',
    '# Doutrina e jurisprudência', 'Cite com precisão. Se não tiver certeza da súmula ou do precedente, não cite.', '',
    '# Análise das alternativas',
    '**A)** {verde|Correta!} Explique por quê.',
    '**B)** {vermelho|Errada!} Explique o erro.',
    '**C)** {vermelho|Errada!} Explique o erro.',
    '**D)** {vermelho|Errada!} Explique o erro.', '',
    '# Possível pegadinha', 'O que a banca costuma explorar neste tema: {amarelo|a palavra-chave}.', '',
    '# Conclusão', 'O que fixar para a prova.'
  ].join('\n');

  function evento(ta) { ta.dispatchEvent(new Event('input', { bubbles: true })); }

  function envolver(ta, abre, fecha, exemplo) {
    var a = ta.selectionStart, b = ta.selectionEnd, v = ta.value, sel = v.slice(a, b) || exemplo;
    ta.value = v.slice(0, a) + abre + sel + fecha + v.slice(b);
    ta.focus(); ta.setSelectionRange(a + abre.length, a + abre.length + sel.length); evento(ta);
  }
  function prefixar(ta, pre) {
    var v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
    var ini = v.lastIndexOf('\n', a - 1) + 1, fim = v.indexOf('\n', b); if (fim < 0) fim = v.length;
    var trecho = v.slice(ini, fim).split('\n').map(function (l) { return pre + l.replace(/^(#\s+|>\s?|-\s+)/, ''); }).join('\n');
    ta.value = v.slice(0, ini) + trecho + v.slice(fim);
    ta.focus(); ta.setSelectionRange(ini, ini + trecho.length); evento(ta);
  }

  function montarEditor(ta) {
    var barra = el('div', 'n-barra'); barra.setAttribute('role', 'toolbar'); barra.setAttribute('aria-label', 'Formatação do comentário');
    function bt(rotulo, titulo, acao, classe) {
      var b = el('button', 'n-bt' + (classe ? ' ' + classe : ''), rotulo); b.type = 'button'; b.title = titulo; b.setAttribute('aria-label', titulo);
      b.addEventListener('click', acao); barra.append(b); return b;
    }
    bt('N', 'Negrito', function () { envolver(ta, '**', '**', 'texto em negrito'); }, 'neg');
    bt('I', 'Itálico', function () { envolver(ta, '*', '*', 'texto em itálico'); }, 'ita');
    bt('S', 'Sublinhado', function () { envolver(ta, '__', '__', 'texto sublinhado'); }, 'sub');
    var sep = el('span', 'n-sep'); sep.setAttribute('aria-hidden', 'true'); barra.append(sep);
    CORES.forEach(function (c) {
      var b = bt('', 'Marca-texto ' + c, function () { envolver(ta, '{' + c + '|', '}', 'trecho em destaque'); }, 'cor mk-' + c);
      b.append(el('span', 'n-cor-amostra'));
    });
    var sep2 = el('span', 'n-sep'); sep2.setAttribute('aria-hidden', 'true'); barra.append(sep2);
    bt('Título', 'Título de seção', function () { prefixar(ta, '# '); });
    bt('Lei', 'Citação da lei (trecho em destaque)', function () { prefixar(ta, '> '); });
    bt('Lista', 'Lista', function () { prefixar(ta, '- '); });
    bt('Modelo', 'Inserir a estrutura-modelo de comentário', function () {
      if (ta.value.trim() && !confirm('Substituir o que você já escreveu pelo modelo?')) return;
      ta.value = MODELO; ta.focus(); evento(ta);
    });

    var previa = el('div', 'n-prev'); previa.setAttribute('aria-live', 'polite');
    var cab = el('p', 'n-prev-tit', 'Pré-visualização');
    function atualizar() {
      if (!ta.value.trim()) { previa.textContent = ''; previa.append(el('p', 'n-vazio', 'O que você escrever aparece aqui, já formatado.')); return; }
      renderizar(ta.value, previa);
    }
    ta.addEventListener('input', atualizar); atualizar();
    return { barra: barra, previa: previa, titulo: cab };
  }

  window.NormaTexto = { renderizar: renderizar, semMarcas: semMarcas, montarEditor: montarEditor, MODELO: MODELO, CORES: CORES };
})();

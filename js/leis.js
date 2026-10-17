/* ============================================================
   LEIS — leitor com busca e grifos em tempo real (leis.html).
   Dados: leis/index.json e leis/<id>.json (gerados por tools/atualizar_leis.py).
   Grifos: localStorage 'cb2_grifos' = { [leiId]: [ {id,k,i,f,c,t,n,ts} ] }
     k = âncora do bloco ("7º#0|3": artigo, ocorrência, posição dentro do artigo)
     i,f = início/fim no texto do bloco; t = trecho (para reencontrar se a lei mudar)
   ============================================================ */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const CORES = [
    { id: 'amarelo', nome: 'Importante' },
    { id: 'verde',   nome: 'Decorar' },
    { id: 'azul',    nome: 'Prazo ou número' },
    { id: 'rosa',    nome: 'Pegadinha' },
    { id: 'laranja', nome: 'Dúvida' }
  ];
  const COR_IDS = CORES.map(c => c.id);
  const LS_G = 'cb2_grifos', LS_LEI = 'cb2_lei_atual';
  const LOTE = 200;
  const RE_TIT = /^(T[IÍ]TULO|CAP[IÍ]TULO|SE[CÇ][AÃ]O|SUBSE[CÇ][AÃ]O|LIVRO|PARTE|ANEXO)/i;

  let indice = [];
  const docs = {};
  let lei = null, blocos = [], chaves = [], mapaChave = new Map(), mapaG = new Map(), artDe = [];
  let renderizados = 0;
  let grifosTodos = lerG();
  let acao = null;          // { modo:'novo', partes:[{idx,ini,fim}] } | { modo:'existente', gid }
  let corAtiva = 'amarelo';

  /* ---------- utilidades ---------- */
  function norm(s){ return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function esc(s){ return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function novoId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function toast(msg){
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  /* ---------- armazenamento ---------- */
  function lerG(){
    try { const o = JSON.parse(localStorage.getItem(LS_G) || '{}'); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; }
    catch (e) { return {}; }
  }
  function salvarG(){
    let ok = true;
    try { localStorage.setItem(LS_G, JSON.stringify(grifosSemTemp())); }
    catch (e) { ok = false; toast('Não consegui salvar os grifos (armazenamento cheio ou bloqueado).'); }
    atualizarContagem();
    return ok;
  }
  function grifosDaLei(){ return grifosTodos[lei.id] || (grifosTodos[lei.id] = []); }
  function atualizarContagem(){
    let n = 0; for (const k in grifosTodos) n += (grifosTodos[k] || []).length;
    $('numGrifos').textContent = n;
  }

  /* ---------- carregar leis ---------- */
  async function getJSON(url){
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(url + ' ' + r.status);
    return r.json();
  }
  async function carregarDoc(id){
    if (docs[id]) return docs[id];
    const d = await getJSON('leis/' + id + '.json');
    d._n = d.blocos.map(b => norm(b[1]));
    docs[id] = d;
    return d;
  }

  function prepararDoc(d){
    // âncoras por bloco + artigo de cada bloco
    const chv = new Array(d.blocos.length).fill(null), art = new Array(d.blocos.length).fill(-1);
    const ocorr = {}; let cab = -1, sub = 0, rotulo = '';
    d.blocos.forEach((b, i) => {
      if (b[0] === 'art') {
        const m = /^Art(?:\.|igo)\s*([0-9]+(?:\.[0-9]+)?[ºo°]?(?:-[A-Z]{1,2})?)/i.exec(b[1]);
        rotulo = m ? m[1] : ('?' + i);
        ocorr[rotulo] = (ocorr[rotulo] == null) ? 0 : ocorr[rotulo] + 1;
        cab = i; sub = 0;
        chv[i] = rotulo + '#' + ocorr[rotulo] + '|0';
        art[i] = i;
      } else if (b[0] !== 'tit' && cab >= 0) {
        sub++;
        chv[i] = rotulo + '#' + ocorr[rotulo] + '|' + sub;
        art[i] = cab;
      }
    });
    return { chv, art };
  }

  function rotuloArt(i){
    const a = artDe[i];
    if (a == null || a < 0) return '';
    const m = /^(Art(?:\.|igo)\s*[0-9.]+[ºo°]?(?:-[A-Z]{1,2})?)/i.exec(blocos[a][1]);
    return m ? m[1].replace(/^Artigo/i, 'Art.') : '';
  }

  /* ---------- ancorar grifos salvos nos blocos atuais ---------- */
  function ancorar(){
    let reancorou = false;
    mapaG = new Map();
    const lista = grifosDaLei();
    lista.forEach(g => { g._idx = -1; });
    lista.forEach(g => {
      let idx = mapaChave.get(g.k);
      const txt = idx != null ? blocos[idx][1] : null;
      if (idx != null && txt.slice(g.i, g.f) === g.t) { g._idx = idx; }
      else {
        // a lei mudou: procura o trecho dentro do mesmo artigo
        const artNum = String(g.k).split('|')[0];
        const cabIdx = mapaChave.get(artNum + '|0');
        if (cabIdx != null) {
          for (let j = cabIdx; j < blocos.length && (j === cabIdx || artDe[j] === cabIdx); j++) {
            if (blocos[j][0] === 'tit') continue;
            const p = blocos[j][1].indexOf(g.t);
            if (p >= 0) { g._idx = j; g.i = p; g.f = p + g.t.length; g.k = chaves[j]; reancorou = true; break; }
          }
        }
      }
      if (g._idx >= 0) { if (!mapaG.has(g._idx)) mapaG.set(g._idx, []); mapaG.get(g._idx).push(g); }
    });
    if (reancorou) salvarG();
  }

  /* ---------- desenhar texto ---------- */
  function montarTexto(lt, i){
    const txt = blocos[i][1];
    const gs = (mapaG.get(i) || []).slice().sort((a, b) => a.i - b.i);
    lt.textContent = '';
    let pos = 0;
    for (const g of gs) {
      if (g.i < pos) continue;
      if (g.i > pos) lt.append(txt.slice(pos, g.i));
      const m = document.createElement('mark');
      m.className = 'g c-' + g.c + (g.n ? ' tem-nota' : '');
      m.dataset.g = g.id;
      m.textContent = txt.slice(g.i, g.f);
      if (g.n) m.title = g.n;
      lt.append(m);
      pos = g.f;
    }
    if (pos < txt.length) lt.append(txt.slice(pos));
  }

  function criarBloco(i){
    const b = blocos[i], tipo = b[0];
    const el = document.createElement('div');
    el.className = 'b b-' + tipo; el.dataset.i = i;
    if (tipo === 'tit') {
      const prev = blocos[i - 1];
      if (prev && prev[0] === 'tit' && !RE_TIT.test(b[1])) el.classList.add('sub');
      el.textContent = b[1];
      return el;
    }
    const lt = document.createElement('span'); lt.className = 'lt';
    el.appendChild(lt); montarTexto(lt, i);
    if (b[2] && b[2].length) { const n = document.createElement('span'); n.className = 'nt'; n.textContent = b[2].join(' '); el.appendChild(n); }
    return el;
  }

  function renderizarAte(n){
    const raiz = $('texto');
    const fim = Math.min(blocos.length, Math.max(n, renderizados));
    const frag = document.createDocumentFragment();
    for (let i = renderizados; i < fim; i++) frag.appendChild(criarBloco(i));
    raiz.appendChild(frag);
    renderizados = fim;
    $('maisWrap').hidden = renderizados >= blocos.length;
  }
  function rerenderBloco(i){
    const el = $('texto').querySelector('.b[data-i="' + i + '"]');
    if (!el) return;
    const lt = el.querySelector('.lt'); if (lt) montarTexto(lt, i);
  }

  async function abrirLei(id){
    let d;
    try { d = await carregarDoc(id); }
    catch (e) { toast('Não consegui carregar esta lei. Confira a conexão.'); return; }
    lei = d; blocos = d.blocos;
    const p = prepararDoc(d); chaves = p.chv; artDe = p.art;
    mapaChave = new Map(); chaves.forEach((k, i) => { if (k && !mapaChave.has(k)) mapaChave.set(k, i); });
    ancorar();
    renderizados = 0; $('texto').textContent = '';
    renderizarAte(LOTE);
    try { localStorage.setItem(LS_LEI, id); } catch (e) { /* sem armazenamento */ }
    $('selLei').value = id;
    const meta = indice.find(l => l.id === id) || {};
    const info = $('infoLei');
    info.hidden = false;
    info.innerHTML = '<b>' + esc(d.norma) + '</b> · ' + d.artigos + ' artigos · texto do Planalto atualizado em ' + esc(formatarData(d.baixado_em || meta.atualizado)) +
      ' · <a href="' + esc(d.fonte) + '" target="_blank" rel="noopener">ver no site oficial</a>. Confira sempre a redação no site oficial.';
    fecharBarra(); esconderResultados();
  }
  function formatarData(s){ const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : '—'; }

  async function irParaBloco(i, comPulso){
    if (i >= renderizados) renderizarAte(i + 40);
    const el = $('texto').querySelector('.b[data-i="' + i + '"]');
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    if (comPulso !== false) { el.classList.remove('achado'); void el.offsetWidth; el.classList.add('achado'); }
  }

  const RE_NUM = /^Art(?:\.|igo)?\s*([0-9]+(?:\.[0-9]+)?[ºo°]?(?:-[A-Z]{1,2})?)/i;
  // "1.045", "1045", "5º", "5o", "5°" e "5" são o mesmo artigo; "59-A" e "59-a" também
  function rotuloNorm(s){ return norm(s).replace(/\./g, '').replace(/(\d)[º°o](?=-|$)/g, '$1'); }
  let ultimoSalto = { chave: '', pos: 0 };

  function irParaArtigo(txt){
    let alvo = norm(txt).trim().replace(/\s+/g, ' ');
    let soAdct = false;
    if (/^adct\b/.test(alvo)) { soAdct = true; alvo = alvo.replace(/^adct\s*/, ''); }
    alvo = alvo.replace(/^art(igo)?\.?\s*/, '').replace(/\s+/g, '').replace(/\.$/, '');
    alvo = rotuloNorm(alvo);
    if (!alvo) return;
    let inicio = 0;
    if (soAdct) {
      inicio = blocos.findIndex(b => b[0] === 'tit' && /disposicoes constitucionais transitorias/.test(norm(b[1])));
      if (inicio < 0) { toast('Esta lei não tem ADCT.'); return; }
    }
    const idxs = [];
    for (let i = inicio; i < blocos.length; i++) {
      if (blocos[i][0] !== 'art') continue;
      const m = RE_NUM.exec(blocos[i][1]);
      if (m && rotuloNorm(m[1]) === alvo) idxs.push(i);
    }
    if (!idxs.length) { toast('Artigo ' + txt + ' não encontrado nesta lei.'); return; }
    const chave = lei.id + '|' + (soAdct ? 'adct ' : '') + alvo;
    ultimoSalto.pos = (ultimoSalto.chave === chave) ? (ultimoSalto.pos + 1) % idxs.length : 0;
    ultimoSalto.chave = chave;
    esconderResultados();
    irParaBloco(idxs[ultimoSalto.pos]);
    if (idxs.length > 1) toast('Ocorrência ' + (ultimoSalto.pos + 1) + ' de ' + idxs.length + '. Tecle Enter de novo para a próxima' + (lei.id === 'cf88' ? ' (ou digite “adct ' + alvo + '”).' : '.'));
  }

  /* ---------- busca ---------- */
  function esconderResultados(){ const r = $('resultados'); r.hidden = true; r.textContent = ''; }

  async function buscar(){
    const q = $('inpBusca').value.trim();
    const nq = norm(q);
    if (!nq) { esconderResultados(); return; }
    const termos = nq.split(/\s+/).filter(t => t.length > 1 || /\d/.test(t));
    if (!termos.length || (nq.length < 3 && !/\d/.test(nq))) {
      const c = $('resultados'); c.hidden = false; c.textContent = '';
      const d = document.createElement('div'); d.className = 'g-vazio'; d.textContent = 'Digite pelo menos 3 letras (ou um número) para buscar.';
      c.appendChild(d); return;
    }
    const todas = $('chkTodas').checked;
    let alvos;
    if (todas) {
      toast('Carregando as leis…');
      try { alvos = await Promise.all(indice.map(l => carregarDoc(l.id))); }
      catch (e) { toast('Não consegui carregar todas as leis.'); return; }
    } else alvos = [lei];
    const achados = []; let total = 0;
    for (const d of alvos) {
      const art = prepararDoc(d).art;
      for (let i = 0; i < d.blocos.length; i++) {
        const n = d._n[i];
        if (termos.every(t => n.includes(t))) {
          total++;
          if (achados.length < 80) achados.push({ d, i, art: art[i] });
        }
      }
    }
    const cont = $('resultados'); cont.hidden = false; cont.textContent = '';
    const cab = document.createElement('div'); cab.className = 'l-res-cab';
    cab.innerHTML = '<span>' + total + ' resultado' + (total === 1 ? '' : 's') + (total > 80 ? ' (mostrando os 80 primeiros)' : '') + '</span>';
    const fechar = document.createElement('button'); fechar.className = 'g-bt'; fechar.type = 'button'; fechar.textContent = 'Limpar';
    fechar.addEventListener('click', () => { $('inpBusca').value = ''; esconderResultados(); });
    cab.appendChild(fechar); cont.appendChild(cab);
    if (!achados.length) { const v = document.createElement('div'); v.className = 'g-vazio'; v.textContent = 'Nada encontrado para “' + q + '”.'; cont.appendChild(v); return; }
    for (const a of achados) {
      const b = a.d.blocos[a.i];
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'l-res-item';
      let ref = '';
      if (a.art >= 0) { const m = /^(Art(?:\.|igo)\s*[0-9.]+[ºo°]?(?:-[A-Z]{1,2})?)/i.exec(a.d.blocos[a.art][1]); ref = m ? m[1] : ''; }
      btn.innerHTML = '<span class="l-res-ref">' + esc(a.d.nome) + (ref ? ' · ' + esc(ref) : '') + '</span>' + destacar(b[1], termos);
      btn.addEventListener('click', async () => {
        if (!lei || lei.id !== a.d.id) await abrirLei(a.d.id);
        irParaBloco(a.i);
      });
      cont.appendChild(btn);
    }
    cont.scrollIntoView({ block: 'start' });
  }
  function destacar(txt, termos){
    const n = norm(txt); const faixas = [];
    termos.forEach(t => { let p = 0; while ((p = n.indexOf(t, p)) >= 0) { faixas.push([p, p + t.length]); p += t.length; } });
    faixas.sort((a, b) => a[0] - b[0]);
    let out = '', pos = 0;
    for (const [i, f] of faixas) { if (i < pos) continue; out += esc(txt.slice(pos, i)) + '<mark class="bsc">' + esc(txt.slice(i, f)) + '</mark>'; pos = f; }
    return out + esc(txt.slice(pos));
  }

  /* ---------- seleção e grifos ---------- */
  function blocoDe(no){
    let e = no && (no.nodeType === 1 ? no : no.parentElement);
    while (e && e !== $('texto')) { if (e.classList && e.classList.contains('b')) return e; e = e.parentElement; }
    return null;
  }
  function offsetEm(lt, no, off, ehFim){
    // nó ancestral do texto (o contêiner #texto, ou o próprio bloco): começo = 0, fim = tudo
    if (no !== lt && no.contains && no.contains(lt)) return ehFim ? lt.textContent.length : 0;
    if (!lt.contains(no)) return (lt.compareDocumentPosition(no) & Node.DOCUMENT_POSITION_PRECEDING) ? 0 : lt.textContent.length;
    const r = document.createRange(); r.selectNodeContents(lt); r.setEnd(no, off); return r.toString().length;
  }
  function lerSelecao(){
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    if (!$('texto').contains(r.commonAncestorContainer)) return null;
    let ini = blocoDe(r.startContainer), fim = blocoDe(r.endContainer);
    if (!ini || !fim) {
      // seleção que começa/termina fora de um bloco (ex.: no espaço entre blocos)
      const todos = $('texto').children;
      if (!ini) ini = (r.startContainer === $('texto')) ? todos[r.startOffset] : null;
      if (!fim) fim = (r.endContainer === $('texto')) ? todos[Math.max(0, r.endOffset - 1)] : null;
      if (!ini || !fim) return null;
    }
    const partes = [];
    for (let el = ini; el; el = el.nextElementSibling) {
      if (!el.classList.contains('b-tit')) {
        const lt = el.querySelector('.lt');
        if (lt) {
          const txt = lt.textContent;
          let a = (el === ini) ? offsetEm(lt, r.startContainer, r.startOffset, false) : 0;
          let b = (el === fim) ? offsetEm(lt, r.endContainer, r.endOffset, true) : txt.length;
          while (a < b && /\s/.test(txt[a])) a++;
          while (b > a && /\s/.test(txt[b - 1])) b--;
          if (b > a) partes.push({ idx: Number(el.dataset.i), ini: a, fim: b });
        }
      }
      if (el === fim) break;
    }
    if (!partes.length) return null;
    const rects = r.getClientRects();
    const ult = rects.length ? rects[rects.length - 1] : r.getBoundingClientRect();
    return { partes, rect: ult };
  }

  function posicionarBarra(rect){
    const b = $('gBarra');
    if (window.innerWidth <= 700) { b.style.left = ''; b.style.top = ''; return; }
    b.style.visibility = 'hidden'; b.hidden = false;
    const w = b.offsetWidth, h = b.offsetHeight;
    let left = rect.left + rect.width / 2 - w / 2, top = rect.top - h - 10;
    if (top < 74) top = rect.bottom + 10;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    b.style.left = left + 'px'; b.style.top = top + 'px'; b.style.visibility = '';
  }
  function mostrarBarra(novaAcao, rect, comRemover, notaInicial){
    acao = novaAcao;
    $('gRemover').hidden = !comRemover;
    $('gNotaWrap').hidden = true;
    $('gNotaTxt').value = notaInicial || '';
    $('gBarra').hidden = false;
    posicionarBarra(rect);
    document.querySelectorAll('.g-cor').forEach(c => c.classList.toggle('ativa', comRemover && achar(novaAcao.gid) && achar(novaAcao.gid).c === c.dataset.cor));
  }
  function fecharBarra(){ $('gBarra').hidden = true; acao = null; $('gNotaWrap').hidden = true; }

  function achar(gid){ return grifosDaLei().find(g => g.id === gid) || null; }

  function aplicarGrifo(idx, ini, fim, cor, nota){
    const txt = blocos[idx][1], k = chaves[idx];
    if (!k) return null;
    const lista = grifosDaLei();
    const no_bloco = lista.filter(g => g._idx === idx);
    for (const g of no_bloco) {
      if (g.f <= ini || g.i >= fim) continue;
      const esq = g.i < ini, dir = g.f > fim;
      if (esq && dir) {
        const g2 = { id: novoId(), k: g.k, i: fim, f: g.f, c: g.c, t: txt.slice(fim, g.f), ts: g.ts, _idx: idx };
        lista.push(g2); g.f = ini; g.t = txt.slice(g.i, g.f);
      } else if (esq) { g.f = ini; g.t = txt.slice(g.i, g.f); }
      else if (dir) { g.i = fim; g.t = txt.slice(g.i, g.f); }
      else { lista.splice(lista.indexOf(g), 1); }
    }
    const novo = { id: novoId(), k, i: ini, f: fim, c: cor, t: txt.slice(ini, fim), ts: Date.now(), _idx: idx };
    if (nota) novo.n = nota;
    lista.push(novo);
    return novo;
  }
  function reindexar(){
    mapaG = new Map();
    grifosDaLei().forEach(g => { if (g._idx >= 0) { if (!mapaG.has(g._idx)) mapaG.set(g._idx, []); mapaG.get(g._idx).push(g); } });
  }
  // grava sem o campo temporário _idx (posição do bloco, só existe em memória)
  function persistir(){ salvarG(); }

  function grifar(cor){
    if (!acao) return;
    corAtiva = cor;
    const tocados = new Set();
    if (acao.modo === 'novo') {
      for (const p of acao.partes) { aplicarGrifo(p.idx, p.ini, p.fim, cor); tocados.add(p.idx); }
      window.getSelection().removeAllRanges();
    } else {
      const g = achar(acao.gid); if (!g) return;
      g.c = cor; tocados.add(g._idx);
    }
    reindexar(); persistir();
    tocados.forEach(rerenderBloco);
    fecharBarra();
  }
  function salvarNota(){
    const nota = $('gNotaTxt').value.trim();
    if (!acao) return;
    const tocados = new Set();
    if (acao.modo === 'novo') {
      for (const p of acao.partes) { aplicarGrifo(p.idx, p.ini, p.fim, corAtiva, nota); tocados.add(p.idx); }
      window.getSelection().removeAllRanges();
    } else {
      const g = achar(acao.gid); if (!g) return;
      if (nota) g.n = nota; else delete g.n;
      tocados.add(g._idx);
    }
    reindexar(); persistir(); tocados.forEach(rerenderBloco); fecharBarra();
  }
  function removerGrifo(){
    if (!acao || acao.modo !== 'existente') return;
    const g = achar(acao.gid); if (!g) return;
    const lista = grifosDaLei(); lista.splice(lista.indexOf(g), 1);
    const idx = g._idx;
    reindexar(); persistir(); rerenderBloco(idx); fecharBarra();
  }

  /* ---------- eventos de seleção ---------- */
  let timerSel = null;
  function aoMudarSelecao(){
    clearTimeout(timerSel);
    timerSel = setTimeout(() => {
      if (document.activeElement === $('gNotaTxt')) return;
      const s = lerSelecao();
      if (s) mostrarBarra({ modo: 'novo', partes: s.partes }, s.rect, false, '');
      else if (acao && acao.modo === 'novo') fecharBarra();
    }, 140);
  }
  document.addEventListener('selectionchange', aoMudarSelecao);

  $('texto').addEventListener('click', e => {
    const m = e.target.closest && e.target.closest('mark.g');
    if (!m) return;
    const sel = window.getSelection(); if (sel && !sel.isCollapsed) return;
    const g = achar(m.dataset.g); if (!g) return;
    mostrarBarra({ modo: 'existente', gid: g.id }, m.getBoundingClientRect(), true, g.n || '');
  });

  // a barra não pode roubar a seleção quando clicamos nos botões dela
  $('gBarra').addEventListener('mousedown', e => { if (!e.target.closest('textarea')) e.preventDefault(); });
  $('gFechar').addEventListener('click', () => { fecharBarra(); window.getSelection().removeAllRanges(); });
  $('gRemover').addEventListener('click', removerGrifo);
  $('gNota').addEventListener('click', () => {
    const w = $('gNotaWrap'); w.hidden = !w.hidden;
    if (!w.hidden) { $('gNotaTxt').focus(); if (acao && acao.modo === 'novo') posicionarBarra(lerSelecao() ? lerSelecao().rect : $('gBarra').getBoundingClientRect()); }
  });
  $('gNotaSalvar').addEventListener('click', salvarNota);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!$('gGaveta').hidden) $('gGaveta').hidden = true; else fecharBarra(); return; }
    if ($('gBarra').hidden || document.activeElement === $('gNotaTxt')) return;
    const n = Number(e.key);
    if (n >= 1 && n <= COR_IDS.length) { e.preventDefault(); grifar(COR_IDS[n - 1]); }
  });
  document.addEventListener('mousedown', e => {
    if (!$('gBarra').hidden && acao && acao.modo === 'existente' && !e.target.closest('#gBarra') && !e.target.closest('mark.g')) fecharBarra();
  });

  /* ---------- gaveta de grifos ---------- */
  let filtroCor = '';
  function nomeLei(id){ const l = indice.find(x => x.id === id); return l ? l.nome : id; }
  function refDoGrifo(leiId, g){
    const m = /^([^#|]+)#/.exec(g.k || ''); return 'Art. ' + (m ? m[1] : '?');
  }
  function abrirGaveta(){
    $('gGaveta').hidden = false; desenharGaveta();
  }
  function desenharGaveta(){
    const f = $('gFiltros'); f.textContent = '';
    const mk = (id, rot, cor) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'g-filtro' + (filtroCor === id ? ' on' : '');
      b.innerHTML = (cor ? '<i style="background:var(--g-' + cor + '-s)"></i>' : '') + esc(rot);
      b.addEventListener('click', () => { filtroCor = id; desenharGaveta(); });
      f.appendChild(b);
    };
    mk('', 'Todos'); CORES.forEach(c => mk(c.id, c.nome, c.id));
    const L = $('gLista'); L.textContent = '';
    let n = 0;
    Object.keys(grifosTodos).forEach(leiId => {
      (grifosTodos[leiId] || []).forEach(g => {
        if (filtroCor && g.c !== filtroCor) return;
        n++;
        const b = document.createElement('button'); b.type = 'button'; b.className = 'g-item';
        const dados = leiId === (lei && lei.id) ? g : null;
        const orfao = dados && dados._idx < 0;
        b.innerHTML = '<small>' + esc(nomeLei(leiId)) + ' · ' + esc(refDoGrifo(leiId, g)) + (orfao ? ' · texto mudou na lei' : '') + '</small>' +
          '<q><span class="c-' + esc(g.c) + '" style="background:var(--g-' + esc(g.c) + ')">' + esc(g.t) + '</span></q>' + (g.n ? '<em>' + esc(g.n) + '</em>' : '');
        b.addEventListener('click', async () => {
          if (!lei || lei.id !== leiId) await abrirLei(leiId);
          const x = grifosDaLei().find(y => y.id === g.id);
          if (x && x._idx >= 0) { $('gGaveta').hidden = true; irParaBloco(x._idx); }
          else toast('O texto desta lei mudou e não achei este trecho. O grifo continua guardado.');
        });
        L.appendChild(b);
      });
    });
    if (!n) { const v = document.createElement('div'); v.className = 'g-vazio'; v.textContent = filtroCor ? 'Nenhum grifo desta cor.' : 'Você ainda não grifou nada. Selecione um trecho do texto para começar.'; L.appendChild(v); }
  }

  function exportar(){
    const blob = new Blob([JSON.stringify({ versao: 1, exportado_em: new Date().toISOString(), grifos: grifosSemTemp() }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'grifos-concurseiro-blindado.json'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function grifosSemTemp(){
    const out = {};
    Object.keys(grifosTodos).forEach(k => { out[k] = (grifosTodos[k] || []).map(g => { const c = Object.assign({}, g); delete c._idx; return c; }); });
    return out;
  }
  function importar(arq){
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const dados = JSON.parse(rd.result); const src = dados && dados.grifos;
        if (!src || typeof src !== 'object') throw new Error('formato');
        let add = 0;
        Object.keys(src).forEach(leiId => {
          if (!/^[a-z0-9_-]{1,20}$/i.test(leiId) || !Array.isArray(src[leiId])) return;
          if (['__proto__', 'constructor', 'prototype'].includes(leiId)) return;
          if (!Object.prototype.hasOwnProperty.call(grifosTodos, leiId) || !Array.isArray(grifosTodos[leiId])) grifosTodos[leiId] = [];
          const atual = grifosTodos[leiId];
          src[leiId].forEach(g => {
            if (!g || typeof g.id !== 'string' || typeof g.k !== 'string' || typeof g.t !== 'string') return;
            if (!Number.isInteger(g.i) || !Number.isInteger(g.f) || g.f <= g.i || !COR_IDS.includes(g.c)) return;
            if (atual.some(x => x.id === g.id)) return;
            const novo = { id: g.id.slice(0, 40), k: g.k.slice(0, 40), i: g.i, f: g.f, c: g.c, t: g.t.slice(0, 20000), ts: Number(g.ts) || Date.now() };
            if (typeof g.n === 'string' && g.n) novo.n = g.n.slice(0, 1000);
            atual.push(novo); add++;
          });
        });
        if (lei) { grifosDaLei(); ancorar(); }
        const salvou = salvarG();
        if (lei) { $('texto').textContent = ''; const n = renderizados; renderizados = 0; renderizarAte(n); }
        desenharGaveta();
        toast(salvou ? add + ' grifo' + (add === 1 ? '' : 's') + ' importado' + (add === 1 ? '' : 's') + '.'
                     : 'Importei na tela, mas NÃO consegui salvar (armazenamento cheio ou bloqueado).');
      } catch (e) { toast('Esse arquivo não parece ser um backup de grifos.'); }
    };
    rd.readAsText(arq);
  }

  /* ---------- inicialização ---------- */
  function montarControles(){
    const sel = $('selLei'); sel.textContent = '';
    indice.forEach(l => { const o = document.createElement('option'); o.value = l.id; o.textContent = l.nome + ' (' + l.norma.replace(/^Lei n[ºo°]? |^Decreto-Lei n[ºo°]? /i, '') + ')'; sel.appendChild(o); });
    sel.addEventListener('change', () => abrirLei(sel.value));
    const cores = $('gCores'); cores.textContent = '';
    CORES.forEach((c, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'g-cor'; b.dataset.cor = c.id;
      b.style.background = 'var(--g-' + c.id + '-s)'; b.title = c.nome + ' (tecla ' + (i + 1) + ')'; b.setAttribute('aria-label', c.nome);
      b.addEventListener('click', () => grifar(c.id)); cores.appendChild(b);
    });
    const leg = $('legenda'); leg.textContent = '';
    CORES.forEach(c => { const s = document.createElement('span'); s.className = 'l-chip'; s.innerHTML = '<i style="background:var(--g-' + c.id + '-s)"></i>' + esc(c.nome); leg.appendChild(s); });
    let tb = null;
    $('inpBusca').addEventListener('input', () => { clearTimeout(tb); tb = setTimeout(buscar, 250); });
    $('chkTodas').addEventListener('change', buscar);
    $('inpIr').addEventListener('keydown', e => { if (e.key === 'Enter') irParaArtigo($('inpIr').value); });
    $('btnMais').addEventListener('click', () => renderizarAte(renderizados + LOTE));
    $('btnGrifos').addEventListener('click', abrirGaveta);
    $('gGavFechar').addEventListener('click', () => { $('gGaveta').hidden = true; });
    $('gExportar').addEventListener('click', exportar);
    $('gImportar').addEventListener('change', e => { if (e.target.files[0]) importar(e.target.files[0]); e.target.value = ''; });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => { if (es.some(x => x.isIntersecting) && !$('maisWrap').hidden) renderizarAte(renderizados + LOTE); }, { rootMargin: '600px' }).observe($('maisWrap'));
    }
  }

  function lerHash(){
    try { return /^#([a-z0-9_-]+)(?:\/(.+))?$/i.exec(decodeURIComponent(location.hash || '')); } catch (e) { return null; }
  }
  async function aplicarHash(){
    const h = lerHash();
    if (!h || !indice.some(l => l.id === h[1])) return;
    if (!lei || lei.id !== h[1]) await abrirLei(h[1]);
    if (h[2]) irParaArtigo(h[2]);
  }
  window.addEventListener('hashchange', aplicarHash);
  // outra aba mudou os grifos: recarrega em vez de sobrescrever às cegas
  window.addEventListener('storage', e => {
    if (e.key !== LS_G) return;
    grifosTodos = lerG();
    if (lei) { grifosDaLei(); ancorar(); $('texto').textContent = ''; const n = renderizados; renderizados = 0; renderizarAte(n); }
    atualizarContagem();
  });

  async function iniciar(){
    atualizarContagem();
    try { indice = (await getJSON('leis/index.json')).leis || []; }
    catch (e) { $('infoLei').hidden = false; $('infoLei').textContent = 'Não consegui carregar a lista de leis. Abra esta página pelo site (não direto do arquivo).'; return; }
    if (!indice.length) { $('infoLei').hidden = false; $('infoLei').textContent = 'Nenhuma lei disponível ainda.'; return; }
    montarControles();
    // #<lei>/<artigo> abre direto (ex.: leis.html#l8906/7)
    const h = lerHash();
    let lembrada = ''; try { lembrada = localStorage.getItem(LS_LEI) || ''; } catch (e) { /* armazenamento bloqueado */ }
    let id = (h && indice.some(l => l.id === h[1])) ? h[1] : lembrada;
    if (!indice.some(l => l.id === id)) id = indice[0].id;
    await abrirLei(id);
    if (h && h[2]) {
      // o navegador pode devolver a rolagem ao topo no fim do carregamento: repete o salto uma vez
      irParaArtigo(h[2]);
      const voltar = () => { if (window.scrollY < 100) irParaArtigo(h[2]); };
      window.addEventListener('load', () => setTimeout(voltar, 250), { once: true });
      setTimeout(voltar, 900);
    }
  }
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  iniciar();
})();

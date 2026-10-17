/* ============================================================
   DESEMPENHO MANUAL — questões feitas FORA do site (QConcursos, TEC, simulados…).
   O site não consegue ler o QConcursos, então a pessoa registra aqui: quantas
   questões fez, quantas acertou, em qual disciplina/assunto. O Painel mostra o
   resultado por disciplina e aponta os assuntos com mais erros.
   Dados: localStorage 'cb2_desempenho' = [ {id, d:'AAAA-MM-DD', disc, ass, fonte, n, ok} ]
   ============================================================ */
(function(){
  'use strict';
  const LS_DESEMP = 'cb2_desempenho';
  const DISCIPLINAS = [
    'Ética Profissional', 'Direito Constitucional', 'Direito Civil', 'Direito Processual Civil', 'Direito Penal',
    'Direito Processual Penal', 'Direito do Trabalho', 'Direito Processual do Trabalho', 'Direito Administrativo',
    'Direito Tributário', 'Direito Empresarial', 'Direitos Humanos', 'Direito Internacional', 'Direito Ambiental',
    'Direito do Consumidor', 'ECA', 'Filosofia do Direito', 'Direito Previdenciário', 'Direito Eleitoral'
  ];
  const FONTES = ['QConcursos', 'TEC Concursos', 'Estratégia', 'Gran Cursos', 'Simulado', 'Prova anterior'];
  let periodo = 30;      // 7 | 30 | 0 (tudo)
  let registros = ler();

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function ler(){
    try {
      const a = JSON.parse(localStorage.getItem(LS_DESEMP) || '[]');
      return Array.isArray(a) ? a.filter(r => r && /^\d{4}-\d{2}-\d{2}$/.test(r.d) && Number.isInteger(r.n) && Number.isInteger(r.ok) && r.n > 0 && r.ok >= 0 && r.ok <= r.n) : [];
    } catch (e) { return []; }
  }
  function salvar(){
    try { localStorage.setItem(LS_DESEMP, JSON.stringify(registros)); } catch (e) { alert('Não consegui salvar (armazenamento cheio ou bloqueado).'); }
    document.dispatchEvent(new Event('desempenho-mudou'));
  }
  function hojeStr(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function diasAtras(n){ const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fmtData(s){ const [y, m, d] = s.split('-'); return d + '/' + m; }
  function pct(ok, n){ return n ? Math.round(ok / n * 100) : 0; }
  function corPct(p){ return p >= 80 ? 'var(--ap-ok)' : p >= 60 ? 'var(--warning)' : 'var(--danger)'; }
  function corTxt(p){ return p >= 80 ? 'var(--t-ok)' : p >= 60 ? 'var(--t-aviso)' : 'var(--t-ruim)'; }

  /* usado pela tela Hoje */
  window.desempenhoHoje = function(){
    const h = hojeStr(); let n = 0, ok = 0;
    registros.forEach(r => { if (r.d === h) { n += r.n; ok += r.ok; } });
    return { feitas: n, acertos: ok };
  };

  function filtrados(){
    if (!periodo) return registros;
    const ini = diasAtras(periodo - 1);
    return registros.filter(r => r.d >= ini);
  }

  /* ---------- cartão no Painel ---------- */
  function render(){
    const raiz = $('desempenho'); if (!raiz) return;
    const lista = filtrados();
    let n = 0, ok = 0; const dias = new Set(); const porDisc = {}, porAss = {};
    lista.forEach(r => {
      n += r.n; ok += r.ok; dias.add(r.d);
      const D = porDisc[r.disc] || (porDisc[r.disc] = { n: 0, ok: 0 }); D.n += r.n; D.ok += r.ok;
      if (r.ass) { const k = r.disc + '||' + r.ass; const A = porAss[k] || (porAss[k] = { disc: r.disc, ass: r.ass, n: 0, ok: 0 }); A.n += r.n; A.ok += r.ok; }
    });

    let h = '<h3><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Desempenho nas questões</h3>';
    h += '<div class="dp-seg" role="tablist">' + [[7, '7 dias'], [30, '30 dias'], [0, 'Tudo']].map(([v, t]) =>
      '<button type="button" role="tab" class="' + (periodo === v ? 'on' : '') + '" data-p="' + v + '">' + t + '</button>').join('') + '</div>';

    if (!registros.length) {
      h += '<p class="dp-vazio">Faça questões no QConcursos, no TEC ou em simulados e registre aqui o resultado. O site mostra o seu acerto por disciplina e aponta os assuntos com mais erros.</p>';
    } else if (!lista.length) {
      h += '<p class="dp-vazio">Nenhuma questão registrada neste período.</p>';
    } else {
      h += '<div class="dp-resumo"><div><b>' + n + '</b><span>questões</span></div><div><b style="color:' + corTxt(pct(ok, n)) + '">' + pct(ok, n) + '%</b><span>de acerto</span></div><div><b>' + dias.size + '</b><span>' + (dias.size === 1 ? 'dia' : 'dias') + ' com questões</span></div></div>';
      const discs = Object.keys(porDisc).sort((a, b) => porDisc[b].n - porDisc[a].n);
      h += '<div class="dp-tit">Por disciplina</div>';
      discs.forEach(d => {
        const D = porDisc[d], p = pct(D.ok, D.n);
        h += '<div class="dp-linha"><div class="dp-nome">' + esc(d) + '</div><div class="dp-barra"><i style="width:' + p + '%;background:' + corPct(p) + '"></i></div><div class="dp-val">' + p + '% <small>' + D.ok + '/' + D.n + '</small></div></div>';
      });
      const fracos = Object.values(porAss).filter(a => a.n >= 3 && pct(a.ok, a.n) < 80).sort((a, b) => (b.n - b.ok) - (a.n - a.ok) || pct(a.ok, a.n) - pct(b.ok, b.n)).slice(0, 5);
      if (fracos.length) {
        h += '<div class="dp-tit">Onde você mais erra</div>';
        fracos.forEach(a => {
          h += '<div class="dp-fraco"><div><b>' + esc(a.ass) + '</b><span>' + esc(a.disc) + '</span></div><div class="dp-fval" style="color:' + corTxt(pct(a.ok, a.n)) + '">' + (a.n - a.ok) + ' erro' + (a.n - a.ok === 1 ? '' : 's') + '<small>de ' + a.n + ' · ' + pct(a.ok, a.n) + '%</small></div></div>';
        });
      }
    }
    h += '<div class="h-acoes" style="margin-top:16px"><button type="button" class="h-btn primario" id="dpRegistrar">Registrar questões</button></div>';
    if (registros.length) {
      const rec = registros.slice().sort((a, b) => b.d.localeCompare(a.d) || (b.ts || 0) - (a.ts || 0)).slice(0, 8);
      h += '<details class="dp-rec"><summary>Últimos registros</summary>' + rec.map(r =>
        '<div class="dp-reg"><div><b>' + esc(r.disc) + (r.ass ? ' · ' + esc(r.ass) : '') + '</b><span>' + fmtData(r.d) + (r.fonte ? ' · ' + esc(r.fonte) : '') + ' · ' + r.ok + '/' + r.n + ' (' + pct(r.ok, r.n) + '%)</span></div>' +
        '<button type="button" class="dp-del" data-id="' + esc(r.id) + '" aria-label="Excluir este registro">Excluir</button></div>').join('') + '</details>';
    }
    raiz.innerHTML = h;
    raiz.querySelectorAll('.dp-seg button').forEach(b => b.addEventListener('click', () => { periodo = Number(b.dataset.p); render(); }));
    const reg = $('dpRegistrar'); if (reg) reg.addEventListener('click', abrirSheet);
    raiz.querySelectorAll('.dp-del').forEach(b => b.addEventListener('click', () => {
      if (!confirm('Excluir este registro?')) return;
      registros = registros.filter(r => r.id !== b.dataset.id); salvar(); render();
    }));
  }

  /* ---------- folha de registro ---------- */
  let sheet = null;
  function montarSheet(){
    const ov = document.createElement('div');
    ov.className = 'sheet-overlay'; ov.id = 'dpOverlay';
    ov.innerHTML =
      '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="dpTitulo">' +
        '<div class="sheet-topo"><h2 id="dpTitulo">Registrar questões</h2><button class="sheet-fechar" type="button" id="dpFechar" aria-label="Fechar">×</button></div>' +
        '<form id="dpForm" novalidate>' +
          '<label class="dp-campo"><span>Data</span><input type="date" id="dpData" required></label>' +
          '<label class="dp-campo"><span>Disciplina</span><select id="dpDisc">' + DISCIPLINAS.map(d => '<option>' + esc(d) + '</option>').join('') + '<option value="__outra">Outra…</option></select></label>' +
          '<label class="dp-campo" id="dpOutraWrap" hidden><span>Nome da disciplina</span><input type="text" id="dpOutra" maxlength="40" autocomplete="off"></label>' +
          '<label class="dp-campo"><span>Assunto <small>(opcional)</small></span><input type="text" id="dpAss" maxlength="60" list="dpAssLista" placeholder="ex.: Honorários advocatícios" autocomplete="off"><datalist id="dpAssLista"></datalist></label>' +
          '<label class="dp-campo"><span>De onde <small>(opcional)</small></span><input type="text" id="dpFonte" maxlength="30" list="dpFonteLista" placeholder="ex.: QConcursos" autocomplete="off"><datalist id="dpFonteLista">' + FONTES.map(f => '<option value="' + esc(f) + '">').join('') + '</datalist></label>' +
          '<div class="dp-duplo"><label class="dp-campo"><span>Questões feitas</span><input type="number" id="dpN" min="1" max="1000" inputmode="numeric" required></label>' +
          '<label class="dp-campo"><span>Acertos</span><input type="number" id="dpOk" min="0" max="1000" inputmode="numeric" required></label></div>' +
          '<div class="dp-previa" id="dpPrevia">Preencha as quantidades.</div>' +
          '<div class="dp-erro" id="dpErro" role="alert"></div>' +
          '<button type="submit" class="h-btn primario dp-salvar">Salvar</button>' +
        '</form>' +
      '</div>';
    document.body.appendChild(ov);
    sheet = ov;
    $('dpFechar').addEventListener('click', fecharSheet);
    ov.addEventListener('click', e => { if (e.target === ov) fecharSheet(); });
    $('dpDisc').addEventListener('change', () => { $('dpOutraWrap').hidden = $('dpDisc').value !== '__outra'; atualizarAssuntos(); });
    ['dpN', 'dpOk'].forEach(id => $(id).addEventListener('input', previa));
    $('dpForm').addEventListener('submit', enviar);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('aberto')) fecharSheet(); });
  }
  function atualizarAssuntos(){
    const disc = $('dpDisc').value;
    const set = new Set(); registros.forEach(r => { if (r.ass && (disc === '__outra' || r.disc === disc)) set.add(r.ass); });
    $('dpAssLista').innerHTML = [...set].slice(0, 30).map(a => '<option value="' + esc(a) + '">').join('');
  }
  function previa(){
    const n = parseInt($('dpN').value, 10), ok = parseInt($('dpOk').value, 10);
    const p = $('dpPrevia');
    if (!(n > 0) || !(ok >= 0)) { p.textContent = 'Preencha as quantidades.'; return; }
    if (ok > n) { p.textContent = 'Os acertos não podem passar das questões feitas.'; return; }
    p.textContent = (n - ok) + ' erro' + (n - ok === 1 ? '' : 's') + ' · ' + pct(ok, n) + '% de acerto';
  }
  function abrirSheet(){
    if (!sheet) montarSheet();
    $('dpForm').reset(); $('dpData').value = hojeStr(); $('dpData').max = hojeStr();
    $('dpOutraWrap').hidden = true; $('dpErro').textContent = ''; atualizarAssuntos(); previa();
    sheet.classList.add('aberto'); $('dpN').focus();
  }
  function fecharSheet(){ if (sheet) sheet.classList.remove('aberto'); }
  window.abrirRegistroQuestoes = abrirSheet;

  function enviar(e){
    e.preventDefault();
    const erro = msg => { $('dpErro').textContent = msg; };
    const d = $('dpData').value;
    const n = parseInt($('dpN').value, 10), ok = parseInt($('dpOk').value, 10);
    let disc = $('dpDisc').value === '__outra' ? $('dpOutra').value.trim() : $('dpDisc').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return erro('Escolha a data.');
    if (d > hojeStr()) return erro('A data não pode ser no futuro.');
    if (!disc) return erro('Informe a disciplina.');
    if (!(n >= 1 && n <= 1000)) return erro('Informe quantas questões você fez (de 1 a 1000).');
    if (!(ok >= 0) || ok > n) return erro('Os acertos precisam ficar entre 0 e ' + n + '.');
    registros.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), d, disc: disc.slice(0, 40),
      ass: $('dpAss').value.trim().slice(0, 60), fonte: $('dpFonte').value.trim().slice(0, 30), n, ok, ts: Date.now() });
    salvar(); fecharSheet(); render();
  }

  document.addEventListener('desempenho-mudou', render);
  render();
})();

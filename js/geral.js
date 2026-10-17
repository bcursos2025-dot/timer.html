/* ============================================================
   PAINEL > VISAO GERAL: o mesmo grafico da aba "Geral" da extensao
   (graficos.js e o desenho copiado dela). Sobrepoe tres medidas para mostrar o
   que anda junto com o que: horas de estudo, questoes feitas e % de acerto.
   De onde vem o dado:
   - horas: o cronometro do site e, se estiver pareado, o historico da extensao;
   - questoes: as registradas aqui, os flashcards e o que a extensao sincroniza do QConcursos.
   A "Distracao" da extensao fica de fora de proposito: e o historico de navegacao
   da pessoa, que nao sai do computador dela.
   Cada linha e medida contra o proprio maximo (o valor real aparece no balao).
   ============================================================ */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const SERIES = [
    { chave: 'estudo',     nome: 'Estudo',     cor: '#8b5cf6' },
    { chave: 'questoes',   nome: 'Questões',   cor: '#3ecf8e' },
    { chave: 'desempenho', nome: 'Desempenho', cor: '#e6bb6f' }
  ];
  let periodo = 'week', api = null, ultimaSig = '';
  const ocultas = new Set();

  const chaveDe = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const DIA_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  function baldes(p, ref){
    const out = [];
    if (p === 'semester') {
      for (let i = 5; i >= 0; i--) {
        const m = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
        const ultimo = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
        const chaves = [];
        for (let d = 1; d <= ultimo; d++) chaves.push(chaveDe(new Date(m.getFullYear(), m.getMonth(), d)));
        out.push({ rotulo: MES[m.getMonth()], chaves });
      }
    } else if (p === 'month') {
      for (let i = 3; i >= 0; i--) {
        const chaves = [];
        for (let j = 6; j >= 0; j--) { const d = new Date(ref); d.setDate(ref.getDate() - (i * 7 + j)); chaves.push(chaveDe(d)); }
        out.push({ rotulo: 'Sem. ' + (4 - i), chaves });
      }
    } else {
      const dias = p === 'week' ? 7 : 3;
      for (let i = dias - 1; i >= 0; i--) {
        const d = new Date(ref); d.setDate(ref.getDate() - i);
        out.push({ rotulo: dias > 3 ? DIA_SEM[d.getDay()] : (String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0')), chaves: [chaveDe(d)] });
      }
    }
    return out;
  }

  function registrosManuais(){
    try {
      const a = JSON.parse(localStorage.getItem('cb2_desempenho') || '[]');
      return Array.isArray(a) ? a.filter(r => r && r.d && r.n > 0) : [];
    } catch (e) { return []; }
  }
  function msDoDia(chave){
    let local = 0, ext = 0;
    try { local = Number(historico[chave]) || 0; } catch (e) { /* sem historico */ }
    try { ext = Number((estadoExtensao && estadoExtensao.historico || {})[chave]) || 0; } catch (e) { /* sem extensao */ }
    return Math.max(local, ext);        // evita contar duas vezes o mesmo estudo
  }
  function questoesDoDia(chave, manuais, fonte){
    let tot = 0, ok = 0;
    try { const q = diaQuestoes(chave, fonte); tot += q.feitas || 0; ok += q.acertos || 0; } catch (e) { /* sem dados */ }
    manuais.forEach(r => { if (r.d === chave) { tot += r.n; ok += r.ok || 0; } });
    return { tot, ok };
  }
  function fmtH(ms){
    const min = Math.round(ms / 60000);
    if (min === 0) return '—';
    if (min < 60) return min + 'm';
    const h = min / 60;
    return (h % 1 === 0 ? h : h.toFixed(1)) + 'h';
  }

  function render(){
    const alvo = $('geralRender'), leg = $('geralLegenda'), vazio = $('geralVazio');
    if (!alvo || !window.CBGraficos) return;
    const bs = baldes(periodo, new Date());
    const manuais = registrosManuais();
    let fonte = 'local'; try { fonte = fonteDadosQuestoes(); } catch (e) { /* ok */ }
    const estudo = [], questoes = [], desempenho = [];
    bs.forEach(b => {
      let ms = 0, tot = 0, ok = 0;
      b.chaves.forEach(k => { ms += msDoDia(k); const q = questoesDoDia(k, manuais, fonte); tot += q.tot; ok += q.ok; });
      estudo.push(ms); questoes.push(tot);
      desempenho.push(tot > 0 ? Math.round(ok / tot * 100) : 0);     // sem questao nao ha %; o balao mostra "—"
    });

    const sig = JSON.stringify([periodo, estudo, questoes, desempenho, Array.from(ocultas)]);
    if (sig === ultimaSig && alvo.firstChild) return;     // nada mudou: não redesenha (o balão não some enquanto se lê)
    ultimaSig = sig;
    if (![estudo, questoes].some(a => a.some(v => v > 0))) {
      alvo.innerHTML = ''; if (leg) leg.innerHTML = '';
      if (vazio) vazio.innerHTML = '<div class="cb-geral-aviso"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/></svg><span>Sem dados neste período ainda. Estude um pouco e registre suas questões: as linhas aparecem sozinhas.</span></div>';
      return;
    }
    const dados = { estudo, questoes, desempenho };
    const formatos = { estudo: fmtH, questoes: v => (v > 0 ? String(v) : '—'), desempenho: v => (v > 0 ? v + '%' : '—') };
    api = window.CBGraficos.cbMultiLinha(alvo, {
      rotulos: bs.map(b => b.rotulo),
      series: SERIES.map(s => ({ nome: s.nome, cor: s.cor, valores: dados[s.chave], formatar: formatos[s.chave], oculta: ocultas.has(s.chave) }))
    });
    const preenchidos = bs.filter((_, i) => estudo[i] > 0 || questoes[i] > 0).length;
    if (vazio) vazio.innerHTML = preenchidos < 3
      ? '<div class="cb-geral-aviso"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg><span>Só <strong>' + preenchidos + '</strong> ' + (preenchidos === 1 ? 'dia tem' : 'dias têm') + ' registro neste período. Como cada linha é medida contra o próprio máximo, um único dia com dados vira 100% e o resto vira zero. Com uns quatro dias a curva começa a ter forma.</span></div>'
      : '';
    if (leg) {
      leg.innerHTML = SERIES.map((s, i) => '<button type="button" class="cb-ml-leg' + (ocultas.has(s.chave) ? ' off' : '') + '" data-i="' + i + '" data-chave="' + s.chave + '"><span class="cb-ml-leg-cor" style="background:' + s.cor + '"></span>' + s.nome + '</button>').join('');
      leg.querySelectorAll('.cb-ml-leg').forEach(b => b.addEventListener('click', () => {
        const chave = b.dataset.chave, i = Number(b.dataset.i);
        if (!ocultas.has(chave) && ocultas.size >= SERIES.length - 1) return;      // não deixa esconder a última
        if (ocultas.has(chave)) ocultas.delete(chave); else ocultas.add(chave);
        b.classList.toggle('off');
        if (api) api.alternarSerie(i);
      }));
    }
  }

  const ctr = $('geralPeriodos');
  if (ctr) ctr.addEventListener('click', ev => {
    const b = ev.target.closest('button[data-p]'); if (!b) return;
    periodo = b.dataset.p;
    ctr.querySelectorAll('button').forEach(x => x.classList.toggle('ativo', x === b));
    render();
  });
  document.addEventListener('desempenho-mudou', render);
  document.querySelectorAll('.tab-btn[data-tab="painel"]').forEach(b => b.addEventListener('click', () => setTimeout(render, 0)));
  setInterval(() => { const p = document.querySelector('.pagina.ativa'); if (p && p.dataset.pagina === 'painel') render(); }, 5000);
  render();
})();

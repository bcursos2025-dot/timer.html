/* ============================================================
   professores.html — lista pública (ordem por curtidas), cartão com foto, OAB, comentários nas questões e avaliações
   dos alunos, e pedido de correção. Texto do banco entra sempre com textContent (nunca innerHTML); a foto é uma
   data URL JPEG validada pelas regras do banco e usada só como src de <img>.
   ============================================================ */
(function () {
  'use strict';
  var D = window.NormaDados, $ = function (id) { return document.getElementById(id); };
  function el(tag, classe, texto) { var e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; }
  function reais(n) { return 'R$ ' + Number(n).toLocaleString('pt-BR'); }
  function num1(n) { return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function dia(ts) { return ts ? new Date(ts).toLocaleDateString('pt-BR') : ''; }
  function iniciais(nome) { var p = String(nome || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
  if (D.mock) $('avisoTeste').hidden = false;

  var usuario = null, alvo = null, exames = {};
  D.onUsuario(function (u) { usuario = u; });

  /* ---------- rótulo da questão: "Exame 47 · questão 1" ---------- */
  function rotuloQuestao(qid) {
    var m = /^([A-Za-z0-9]+)-(\d+)$/.exec(qid); if (!m) return 'Questão';
    var n = parseInt(m[2], 10), exId = 'exame-' + m[1].toLowerCase();
    if (exames[exId]) return exames[exId] + ' · questão ' + n;
    if (/^ETI$/i.test(m[1])) return 'Banco Norma de Ética · questão ' + n;
    return 'Questão ' + n;
  }
  function estrelas(media) {
    var cheias = Math.round(media), s = '';
    for (var i = 1; i <= 5; i++) s += i <= cheias ? '★' : '☆';
    return s;
  }

  function avatar(p, grande) {
    var a = el('div', 'n-avatar' + (grande ? ' grande' : ''));
    if (p.foto && String(p.foto).indexOf('data:image/jpeg;base64,') === 0) { var i = el('img'); i.src = p.foto; i.alt = 'Foto de ' + p.nome; a.append(i); }
    else { a.append(el('span', null, iniciais(p.nome))); a.setAttribute('aria-hidden', 'true'); }
    return a;
  }

  /* ---------- painéis do cartão ---------- */
  function painelCurriculo(p) { var d = el('div', 'n-painel'); d.append(el('p', 'n-curriculo', p.curriculo)); return d; }

  function painelComentarios(p) {
    var d = el('div', 'n-painel'), lista = p.lista_comentarios || [];
    if (!lista.length) { d.append(el('p', 'n-vazio', 'Este professor ainda não comentou questões.')); return d; }
    var MOSTRAR = 5, extra = [];
    lista.forEach(function (c, i) {
      var it = el('div', 'n-coment');
      var topo = el('div', 'n-coment-topo');
      topo.append(el('b', null, rotuloQuestao(c.qid) + (c.video ? ' · com vídeo' : '')), el('span', null, c.curtidas + (c.curtidas === 1 ? ' curtida' : ' curtidas') + (c.ts ? ' · ' + dia(c.ts) : '')));
      var txt = el('p', null, c.texto.length > 280 ? c.texto.slice(0, 280).replace(/\s+\S*$/, '') + '…' : c.texto);
      var rod = el('div', 'n-linha'); rod.style.marginTop = '8px';
      var a = el('a', 'btn pequeno', 'Abrir a questão'); a.href = 'oab.html?q=' + encodeURIComponent(c.qid);
      rod.append(a); it.append(topo, txt, rod);
      if (i >= MOSTRAR) { it.hidden = true; extra.push(it); }
      d.append(it);
    });
    if (extra.length) {
      var b = el('button', 'btn pequeno', 'Mostrar os outros ' + extra.length); b.type = 'button';
      b.addEventListener('click', function () { extra.forEach(function (x) { x.hidden = false; }); b.remove(); });
      d.append(b);
    }
    return d;
  }

  function painelAvaliacoes(p, recarregar) {
    var d = el('div', 'n-painel'), avs = p.avaliacoes || [];
    d.append(el('p', 'n-sub', 'As avaliações vêm de alunos que pediram correção a este professor. Elas não mudam a ordem da lista.'));
    var formBox = el('div'); d.append(formBox);
    if (!avs.length) d.append(el('p', 'n-vazio', 'Ainda não há avaliações.'));
    avs.forEach(function (a) {
      var it = el('div', 'n-coment');
      var topo = el('div', 'n-coment-topo'); var st = el('b', 'n-estrelas', estrelas(a.estrelas)); st.setAttribute('aria-label', a.estrelas + ' de 5 estrelas');
      topo.append(st, el('span', null, a.nome + ' · ' + dia(a.ts)));
      it.append(topo); if (a.texto) it.append(el('p', null, a.texto));
      if (usuario && a.id === usuario.uid) {
        var ap = el('button', 'btn pequeno', 'Apagar minha avaliação'); ap.type = 'button'; ap.style.marginTop = '8px';
        ap.addEventListener('click', function () { if (confirm('Apagar a sua avaliação?')) D.apagarAvaliacao(p.id, usuario.uid).then(recarregar).catch(function (e) { alert(D.erroHumano(e)); }); });
        it.append(ap);
      }
      d.append(it);
    });

    // formulário só para quem pediu correção a este professor e ainda não avaliou
    d.carregarForm = function () {
      if (!usuario) { formBox.append(el('p', 'n-vazio', 'Entre na sua conta para avaliar se você já pediu uma correção a este professor.')); return; }
      Promise.all([D.jaPediu(usuario.uid, p.id), D.minhaAvaliacao(usuario.uid, p.id)]).then(function (r) {
        if (!r[0]) { formBox.append(el('p', 'n-vazio', 'Só quem pediu correção a este professor pode avaliar.')); return; }
        if (r[1]) return;
        var f = el('form', 'n-novo'); var nota = 0;
        var linha = el('div', 'n-linha'); linha.setAttribute('role', 'radiogroup'); linha.setAttribute('aria-label', 'Nota de 1 a 5 estrelas');
        var bts = [1, 2, 3, 4, 5].map(function (i) {
          var b = el('button', 'n-estrela', '☆'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false'); b.setAttribute('aria-label', i + (i === 1 ? ' estrela' : ' estrelas'));
          b.addEventListener('click', function () { nota = i; bts.forEach(function (x, j) { x.textContent = j < i ? '★' : '☆'; x.setAttribute('aria-checked', j === i - 1 ? 'true' : 'false'); }); });
          linha.append(b); return b;
        });
        var nome = el('input'); nome.maxLength = 40; nome.placeholder = 'Seu primeiro nome'; nome.setAttribute('aria-label', 'Seu primeiro nome'); nome.required = true;
        var t = el('textarea'); t.maxLength = 600; t.rows = 3; t.placeholder = 'Como foi a correção? (opcional)'; t.setAttribute('aria-label', 'Comentário da avaliação');
        var msg = el('div', 'p-msg'); msg.hidden = true; msg.setAttribute('role', 'alert');
        var env = el('button', 'btn principal', 'Enviar avaliação'); env.type = 'submit';
        f.append(el('h3', null, 'Avalie este professor'), linha, nome, t, msg, env);
        f.addEventListener('submit', function (ev) {
          ev.preventDefault(); msg.hidden = true; env.disabled = true;
          D.avaliar(p.id, usuario, { estrelas: nota, nome: nome.value, texto: t.value }).then(recarregar)
            .catch(function (e) { msg.textContent = e && e.code === 'validacao' ? e.message : D.erroHumano(e); msg.hidden = false; env.disabled = false; });
        });
        formBox.append(f);
      });
    };
    return d;
  }

  /* ---------- cartão ---------- */
  function card(p, i, recarregar) {
    var c = el('article', 'n-card n-prof-card');
    var cab = el('div', 'n-prof-cab');
    cab.append(avatar(p, true));
    var id = el('div', 'n-prof-id');
    var h = el('h2', 'n-prof-nome'); h.append(el('span', 'n-posicao', String(i + 1)), document.createTextNode(p.nome));
    var chips = el('div', 'n-chips');
    chips.append(el('span', 'n-chip oab', 'OAB/' + p.uf + (p.oab ? ' ' + p.oab : '')));
    String(p.areas).split(',').slice(0, 4).forEach(function (a) { a = a.trim(); if (a) chips.append(el('span', 'n-chip', a)); });
    id.append(h, chips);
    var nAv = (p.avaliacoes || []).length;
    var st = el('div', 'n-estrelas-linha');
    if (nAv) { var s = el('span', 'n-estrelas', estrelas(p.media)); s.setAttribute('aria-hidden', 'true'); st.append(s, el('span', null, num1(p.media) + ' · ' + nAv + (nAv === 1 ? ' avaliação' : ' avaliações'))); }
    else st.append(el('span', null, 'Sem avaliações ainda'));
    id.append(st); cab.append(id);
    var b = el('button', 'btn principal', 'Pedir correção'); b.type = 'button'; b.addEventListener('click', function () { pedir(p); });
    cab.append(b); c.append(cab);

    var nums = el('div', 'n-numeros');
    [[p.comentarios || 0, (p.comentarios || 0) === 1 ? 'comentário' : 'comentários'], [p.curtidas || 0, (p.curtidas || 0) === 1 ? 'curtida' : 'curtidas'], [reais(p.preco_min), 'a partir de'], [p.prazo_h + ' h', 'prazo máximo']].forEach(function (k) {
      var sp = el('span', 'n-pilula'); sp.append(el('b', null, String(k[0])), document.createTextNode(' ' + k[1])); nums.append(sp);
    });
    c.append(nums);

    // abas
    var abas = el('div', 'n-abas-card'); abas.setAttribute('role', 'tablist');
    var corpo = el('div'); var paineis = {};
    var defs = [['curriculo', 'Currículo', function () { return painelCurriculo(p); }],
                ['coments', 'Comentários nas questões (' + (p.lista_comentarios || []).length + ')', function () { return painelComentarios(p); }],
                ['avals', 'Avaliações (' + nAv + ')', function () { var x = painelAvaliacoes(p, recarregar); setTimeout(function () { x.carregarForm(); }, 0); return x; }]];
    var botoes = {};
    function abrirAba(k) {
      Object.keys(botoes).forEach(function (j) { botoes[j].setAttribute('aria-selected', j === k ? 'true' : 'false'); botoes[j].classList.toggle('ativo', j === k); });
      Object.keys(paineis).forEach(function (j) { paineis[j].hidden = j !== k; });
      if (!paineis[k]) { var pn = defs.filter(function (x) { return x[0] === k; })[0][2](); paineis[k] = pn; corpo.append(pn); }
      else paineis[k].hidden = false;
    }
    defs.forEach(function (d) {
      var bt = el('button', 'n-aba-card', d[1]); bt.type = 'button'; bt.setAttribute('role', 'tab'); bt.setAttribute('aria-selected', 'false');
      bt.addEventListener('click', function () { if (bt.classList.contains('ativo')) { bt.classList.remove('ativo'); bt.setAttribute('aria-selected', 'false'); Object.keys(paineis).forEach(function (j) { paineis[j].hidden = true; }); } else abrirAba(d[0]); });
      botoes[d[0]] = bt; abas.append(bt);
    });
    c.append(abas, corpo);
    return c;
  }

  function carregar() {
    var lista = $('lista');
    var comIndice = fetch('data/oab/indice.json').then(function (r) { return r.json(); }).then(function (j) { (j.exames || []).forEach(function (e) { exames[e.id] = e.titulo; }); }).catch(function () { /* só o rótulo fica mais simples */ });
    Promise.all([D.ranking(), comIndice]).then(function (r) {
      var ps = r[0]; lista.textContent = '';
      if (!ps.length) { lista.append(el('p', 'n-vazio', 'Ainda não há professores aprovados. Se você é advogado(a), seja o(a) primeiro(a): cadastre-se.')); return; }
      ps.forEach(function (p, i) { lista.append(card(p, i, carregar)); });
    }).catch(function (e) { lista.textContent = ''; $('msgLista').textContent = D.erroHumano(e); $('msgLista').hidden = false; });
  }

  /* ---------- pedido de correção ---------- */
  function pedir(p) {
    alvo = p;
    var abrir = function (u) {
      if (!u) return;
      usuario = u;
      $('dlgPedidoSub').textContent = 'Para ' + p.nome + ' (OAB/' + p.uf + ').';
      $('pContato').value = u.email; $('msgPedido').hidden = true;
      if (!u.emailVerified) { $('msgPedido').textContent = 'Confirme seu e-mail (link que enviamos) antes de enviar pedidos. Depois recarregue esta página.'; $('msgPedido').hidden = false; }
      $('dlgPedido').showModal();
    };
    if (usuario) abrir(usuario); else window.NormaAuthUI.abrir('entrar').then(abrir);
  }

  $('btnPedidoFechar').addEventListener('click', function () { $('dlgPedido').close(); });
  $('formPedido').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var m = $('msgPedido'); m.hidden = true; m.classList.remove('n-ok');
    if (!usuario || !alvo) return;
    var b = $('btnPedidoEnviar'); b.disabled = true;
    D.enviarPedido(alvo.id, usuario, { nome: $('pNome').value, contato: $('pContato').value, tipo: $('pTipo').value, mensagem: $('pMsg').value })
      .then(function () {
        m.textContent = 'Pedido enviado! O professor vai responder no e-mail que você informou. Depois, volte aqui para avaliar.'; m.classList.add('n-ok'); m.hidden = false;
        $('pMsg').value = ''; setTimeout(function () { $('dlgPedido').close(); }, 2200);
      })
      .catch(function (e) { m.textContent = e && e.code === 'validacao' ? e.message : D.erroHumano(e); m.hidden = false; })
      .then(function () { b.disabled = false; });
  });

  carregar();
})();

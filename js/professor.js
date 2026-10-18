/* ============================================================
   professor.html — cadastro do professor, status da análise e pedidos recebidos.
   Tudo que vem do banco entra na tela com textContent (nunca innerHTML).
   ============================================================ */
(function () {
  'use strict';
  var D = window.NormaDados, $ = function (id) { return document.getElementById(id); };
  var UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');

  function el(tag, classe, texto) { var e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; }
  function mostrar(id, sim) { $(id).hidden = !sim; }
  function data(ts) { return ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''; }

  var uf = $('cUf'); var o0 = el('option', null, 'Escolha'); o0.value = ''; uf.append(o0);
  UFS.forEach(function (u) { var o = el('option', null, u); o.value = u; uf.append(o); });
  if (D.mock) $('avisoTeste').hidden = false;

  var usuario = null, cadastro = null, aprovado = null;

  function msgCad(t) { $('msgCad').textContent = t || ''; $('msgCad').hidden = !t; }

  function pintarStatus() {
    var box = $('boxStatus'); box.textContent = ''; box.hidden = true;
    if (aprovado) {
      box.hidden = false;
      var topo = el('div', 'n-linha'); topo.append(el('h2', null, 'Você é professor na Norma'), el('span', 'n-selo ok', 'Aprovado'));
      box.append(topo,
        el('p', 'n-sub', 'Seu perfil já aparece na lista de professores. Para comentar uma questão, abra-a em Questões, responda e use a caixa "Comentar como professor".'));
      var l = el('div', 'n-linha');
      var a1 = el('a', 'btn principal', 'Ver a lista de professores'); a1.href = 'professores.html';
      var a2 = el('a', 'btn', 'Ir para as questões'); a2.href = 'oab.html';
      l.append(a1, a2); box.append(l);
    } else if (cadastro && cadastro.status === 'pendente') {
      box.hidden = false;
      var t = el('div', 'n-linha'); t.append(el('h2', null, 'Cadastro em análise'), el('span', 'n-selo espera', 'Pendente'));
      box.append(t, el('p', 'n-sub', 'Recebemos seu cadastro em ' + data(cadastro.ts) + '. Vamos conferir o número da OAB e você aparece na lista assim que for aprovado. Você ainda pode corrigir os dados abaixo e reenviar.'));
    } else if (cadastro && cadastro.status === 'recusado') {
      box.hidden = false;
      var r = el('div', 'n-linha'); r.append(el('h2', null, 'Cadastro não aprovado'), el('span', 'n-selo erro', 'Recusado'));
      box.append(r, el('p', 'n-sub', cadastro.motivo ? 'Motivo: ' + cadastro.motivo : 'Não conseguimos conferir seus dados.'), el('p', 'n-sub', 'Corrija o que for preciso abaixo e envie de novo.'));
    }
  }

  function preencher() {
    var c = cadastro || {};
    $('cNome').value = c.nome || ''; $('cOab').value = c.oab || ''; $('cUf').value = c.uf || '';
    $('cAreas').value = c.areas || ''; $('cCurriculo').value = c.curriculo || '';
    $('cContato').value = c.contato || (usuario && usuario.email) || '';
    $('cPreco').value = c.preco_min || 50; $('cPrazo').value = c.prazo_h || 48;
    contar();
  }
  function contar() { $('cntCurriculo').textContent = $('cCurriculo').value.length + ' / ' + D.LIM.curriculo + ' caracteres'; }
  $('cCurriculo').addEventListener('input', contar);

  function pintarPedidos() {
    var lista = $('listaPedidos'); lista.textContent = '';
    D.meusPedidos(usuario.uid).then(function (ps) {
      if (!ps.length) { lista.append(el('p', 'n-vazio', 'Nenhum pedido ainda. Quando um aluno pedir, aparece aqui.')); return; }
      ps.forEach(function (p) {
        var c = el('div', 'n-coment');
        var topo = el('div', 'n-coment-topo'); topo.append(el('b', null, p.nome), el('span', null, (p.tipo ? p.tipo + ' · ' : '') + data(p.ts)));
        var corpo = el('p', null, p.mensagem);
        var rod = el('div', 'n-linha'); rod.style.marginTop = '8px';
        var a = el('a', 'btn pequeno', 'Responder por e-mail'); a.href = 'mailto:' + encodeURIComponent(p.contato).replace('%40', '@'); a.rel = 'noopener';
        var ap = el('button', 'btn pequeno', 'Apagar'); ap.type = 'button';
        ap.addEventListener('click', function () { if (confirm('Apagar este pedido?')) D.apagarPedido(usuario.uid, p.id).then(pintarPedidos); });
        rod.append(a, ap); c.append(topo, corpo, rod); lista.append(c);
      });
    }).catch(function (e) { lista.append(el('p', 'n-vazio', D.erroHumano(e))); });
  }

  function atualizarTela() {
    $('txtEmail').textContent = usuario.email;
    $('txtPapel').textContent = aprovado ? 'Professor aprovado' : (cadastro && cadastro.status === 'pendente' ? 'Cadastro em análise' : 'Conta criada');
    var verificado = usuario.emailVerified;
    mostrar('boxVerif', !verificado);
    pintarStatus();
    var podeEditar = !aprovado;
    mostrar('boxCadastro', podeEditar && verificado);
    $('tituloCadastro').textContent = cadastro ? 'Corrigir meu cadastro' : 'Seu cadastro de professor';
    $('btnEnviarCad').textContent = cadastro ? 'Reenviar para análise' : 'Enviar para análise';
    mostrar('boxPedidos', !!aprovado);
    if (aprovado) pintarPedidos();
  }

  function carregarDados() {
    Promise.all([D.meuCadastro(usuario.uid), D.souAprovado(usuario.uid), D.ehAdmin(usuario)]).then(function (r) {
      cadastro = r[0]; aprovado = r[1]; $('linkAdmin').hidden = !r[2];
      preencher(); atualizarTela();
    }).catch(function (e) { msgCad(D.erroHumano(e)); mostrar('boxCadastro', true); });
  }

  D.onUsuario(function (u, erro) {
    mostrar('estCarregando', false);
    if (erro === 'sdk') { mostrar('avisoSdk', true); mostrar('estDeslogado', true); return; }
    usuario = u;
    mostrar('estDeslogado', !u); mostrar('estLogado', !!u);
    if (u) carregarDados();
  });

  $('btnEntrar').addEventListener('click', function () { window.NormaAuthUI.abrir('entrar'); });
  $('btnSair').addEventListener('click', function () { D.sair(); });
  $('btnReenviar').addEventListener('click', function () {
    $('msgVerif').textContent = 'Enviando…';
    D.reenviarVerificacao().then(function () { $('msgVerif').textContent = 'E-mail reenviado. Veja também a caixa de spam.'; }).catch(function (e) { $('msgVerif').textContent = D.erroHumano(e); });
  });
  $('btnJaConfirmei').addEventListener('click', function () {
    $('msgVerif').textContent = 'Conferindo…';
    D.recarregarUsuario().then(function (u) {
      if (u && u.emailVerified) { usuario = u; $('msgVerif').textContent = ''; atualizarTela(); }
      else $('msgVerif').textContent = 'Ainda não consta como confirmado. Abra o link do e-mail e tente de novo.';
    }).catch(function (e) { $('msgVerif').textContent = D.erroHumano(e); });
  });

  $('formCad').addEventListener('submit', function (ev) {
    ev.preventDefault(); msgCad('');
    var dados = { nome: $('cNome').value, oab: $('cOab').value, uf: $('cUf').value, areas: $('cAreas').value, curriculo: $('cCurriculo').value,
      contato: $('cContato').value, preco_min: $('cPreco').value, prazo_h: $('cPrazo').value };
    var v = D.validarCadastro(dados);
    if (!v.ok) { msgCad(v.erro); return; }
    if (!$('cTermos').checked) { msgCad('Marque a declaração para enviar o cadastro.'); return; }
    var b = $('btnEnviarCad'); b.disabled = true;
    D.enviarCadastro(usuario.uid, dados).then(function () { return D.meuCadastro(usuario.uid); })
      .then(function (c) { cadastro = c; $('cTermos').checked = false; atualizarTela(); window.scrollTo({ top: 0, behavior: 'smooth' }); })
      .catch(function (e) { msgCad(e && e.code === 'validacao' ? e.message : D.erroHumano(e)); })
      .then(function () { b.disabled = false; });
  });
})();

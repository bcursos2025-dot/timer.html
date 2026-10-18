/* ============================================================
   admin.html — aprovação manual de professores. Só funciona para contas listadas em admins/{uid}
   (colocadas à mão no console do Firebase; as regras do banco recusam qualquer outra conta).
   ============================================================ */
(function () {
  'use strict';
  var D = window.NormaDados, $ = function (id) { return document.getElementById(id); };
  function el(tag, classe, texto) { var e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; }
  function msg(t) { $('msgAdm').textContent = t || ''; $('msgAdm').hidden = !t; }
  function data(ts) { return ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''; }
  if (D.mock) {
    $('avisoTeste').hidden = false;
    // só no modo de teste: vira admin a conta que está logada
    window.NormaAdminTeste = function () { var u = D.usuario(); if (!u) return 'entre primeiro'; var db = JSON.parse(localStorage.getItem('norma_mock_db') || '{}'); db.admins = db.admins || {}; db.admins[u.uid] = true; localStorage.setItem('norma_mock_db', JSON.stringify(db)); location.reload(); return 'ok'; };
  }

  function pintar() {
    var lista = $('lista'); lista.textContent = ''; lista.hidden = false;
    D.listarPendentes().then(function (ps) {
      if (!ps.length) { lista.append(el('p', 'n-vazio', 'Nenhum cadastro pendente.')); return; }
      ps.forEach(function (p) {
        var c = el('article', 'n-card');
        var topo = el('div', 'n-prof-topo'); var q = el('div');
        q.append(el('h2', 'n-prof-nome', p.nome), el('p', 'n-prof-meta', 'OAB ' + p.oab + '/' + p.uf + ' · ' + p.areas + ' · enviado em ' + data(p.ts)));
        topo.append(q); c.append(topo);
        c.append(el('p', 'n-curriculo', p.curriculo));
        c.append(el('p', 'n-prof-meta', 'Contato: ' + p.contato + ' · a partir de R$ ' + p.preco_min + ' · prazo ' + p.prazo_h + ' h'));
        var ac = el('div', 'n-linha'); ac.style.marginTop = '10px';
        var ok = el('button', 'btn principal', 'Aprovar'); ok.type = 'button';
        var no = el('button', 'btn', 'Recusar'); no.type = 'button';
        ok.addEventListener('click', function () {
          if (!confirm('Você conferiu a OAB ' + p.oab + '/' + p.uf + ' de ' + p.nome + ' no Cadastro Nacional?')) return;
          ok.disabled = no.disabled = true;
          D.aprovar(p.id, p).then(pintar).catch(function (e) { msg(D.erroHumano(e)); ok.disabled = no.disabled = false; });
        });
        no.addEventListener('click', function () {
          var m = prompt('Motivo da recusa (o professor vai ler):', 'Não consegui conferir o número da OAB.'); if (m === null) return;
          ok.disabled = no.disabled = true;
          D.recusar(p.id, m).then(pintar).catch(function (e) { msg(D.erroHumano(e)); ok.disabled = no.disabled = false; });
        });
        ac.append(ok, no); c.append(ac); lista.append(c);
      });
    }).catch(function (e) { msg(D.erroHumano(e)); });
  }

  D.onUsuario(function (u, erro) {
    msg('');
    $('boxEntrar').hidden = !!u || !!erro; $('boxNegado').hidden = true; $('lista').hidden = true;
    if (erro) return msg('Não consegui falar com o Firebase. Verifique a internet.');
    if (!u) return;
    D.ehAdmin(u.uid).then(function (sim) { if (sim) pintar(); else $('boxNegado').hidden = false; });
  });
  $('btnEntrar').addEventListener('click', function () { window.NormaAuthUI.abrir('entrar'); });
  $('btnSair').addEventListener('click', function () { D.sair(); });
})();

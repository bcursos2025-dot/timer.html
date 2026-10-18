/* ============================================================
   professores.html — lista pública (ranking por curtidas) e pedido de correção.
   Texto do banco entra sempre com textContent.
   ============================================================ */
(function () {
  'use strict';
  var D = window.NormaDados, $ = function (id) { return document.getElementById(id); };
  function el(tag, classe, texto) { var e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; }
  function reais(n) { return 'R$ ' + Number(n).toLocaleString('pt-BR'); }
  function num(n) { return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 }); }
  if (D.mock) $('avisoTeste').hidden = false;

  var usuario = null, alvo = null;
  D.onUsuario(function (u) { usuario = u; });

  function card(p, i) {
    var c = el('article', 'n-card');
    var topo = el('div', 'n-prof-topo');
    var q = el('div');
    var h = el('h2', 'n-prof-nome'); h.append(el('span', 'n-posicao', String(i + 1)), document.createTextNode(p.nome));
    q.append(h, el('p', 'n-prof-meta', 'OAB/' + p.uf + ' · ' + p.areas));
    var b = el('button', 'btn principal', 'Pedir correção'); b.type = 'button';
    b.addEventListener('click', function () { pedir(p); });
    topo.append(q, b); c.append(topo);

    var nums = el('div', 'n-numeros');
    [['comentarios', 'comentários'], ['curtidas', 'curtidas']].forEach(function (k) { var s = el('span'); s.append(el('b', null, String(p[k[0]] || 0)), document.createTextNode(k[1])); nums.append(s); });
    var s3 = el('span'); s3.append(el('b', null, reais(p.preco_min)), document.createTextNode('a partir de')); nums.append(s3);
    var s4 = el('span'); s4.append(el('b', null, p.prazo_h + ' h'), document.createTextNode('prazo máximo')); nums.append(s4);
    c.append(nums);

    var det = document.createElement('details');
    det.append(el('summary', null, 'Ver currículo'), el('p', 'n-curriculo', p.curriculo));
    det.querySelector('p').style.marginTop = '8px'; det.style.marginTop = '8px';
    c.append(det);
    return c;
  }

  function carregar() {
    var lista = $('lista');
    D.ranking().then(function (ps) {
      lista.textContent = '';
      if (!ps.length) {
        lista.append(el('p', 'n-vazio', 'Ainda não há professores aprovados. Se você é advogado(a), seja o(a) primeiro(a): cadastre-se.'));
        return;
      }
      ps.forEach(function (p, i) { lista.append(card(p, i)); });
    }).catch(function (e) { lista.textContent = ''; $('msgLista').textContent = D.erroHumano(e); $('msgLista').hidden = false; });
  }

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
        m.textContent = 'Pedido enviado! O professor vai responder no e-mail que você informou.'; m.classList.add('n-ok'); m.hidden = false;
        $('pMsg').value = ''; setTimeout(function () { $('dlgPedido').close(); }, 1800);
      })
      .catch(function (e) { m.textContent = e && e.code === 'validacao' ? e.message : D.erroHumano(e); m.hidden = false; })
      .then(function () { b.disabled = false; });
  });

  carregar();
})();

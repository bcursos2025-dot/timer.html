/* ============================================================
   NORMA — diálogo de entrar / criar conta (reaproveitado em professor.html, professores.html e oab.html).
   NormaAuthUI.abrir() devolve uma Promise: resolve com o usuário quando a pessoa entra, ou com null se fechar.
   Depende de js/norma-dados.js. A senha só passa pelo Firebase; nunca é guardada nem mostrada em log.
   ============================================================ */
(function () {
  'use strict';
  var D = window.NormaDados;
  var dlg = null, estado = { modo: 'entrar', resolver: null };

  function el(tag, classe, texto) { var e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; }

  function campo(rotulo, id, tipo, extra) {
    var l = el('label', 'p-campo'); l.append(el('span', 'p-rotulo', rotulo));
    var i = el('input'); i.id = id; i.type = tipo; i.required = true; i.autocomplete = extra.auto || 'off'; if (extra.min) i.minLength = extra.min;
    l.append(i); return l;
  }

  function montar() {
    dlg = document.createElement('dialog'); dlg.className = 'n-dialogo'; dlg.setAttribute('aria-labelledby', 'nAuthTitulo');
    var form = el('form'); form.method = 'dialog'; form.noValidate = false;
    form.append(el('h2', null, 'Entrar na Norma')); form.firstChild.id = 'nAuthTitulo';
    form.append(el('p', 'n-sub', 'Conta gratuita, só com e-mail e senha. Serve para professores e para quem pede correção de peça.'));

    var abas = el('div', 'n-abas'); abas.setAttribute('role', 'tablist');
    var bEntrar = el('button', 'n-aba ativo', 'Entrar'); bEntrar.type = 'button'; bEntrar.dataset.modo = 'entrar';
    var bCriar = el('button', 'n-aba', 'Criar conta'); bCriar.type = 'button'; bCriar.dataset.modo = 'criar';
    abas.append(bEntrar, bCriar); form.append(abas);

    form.append(campo('E-mail', 'nAuthEmail', 'email', { auto: 'email' }));
    form.append(campo('Senha', 'nAuthSenha', 'password', { auto: 'current-password', min: 8 }));
    var g2 = campo('Repita a senha', 'nAuthSenha2', 'password', { auto: 'new-password', min: 8 }); g2.id = 'nAuthG2'; g2.hidden = true; g2.querySelector('input').required = false; form.append(g2);

    var aceite = el('label', 'p-ciente'); aceite.id = 'nAuthAceite'; aceite.hidden = true;
    var ck = el('input'); ck.type = 'checkbox'; ck.id = 'nAuthCk';
    aceite.append(ck, el('span', null, 'Li e concordo que meus dados de conta (e-mail) ficam guardados no Firebase para o funcionamento do site. Não uso dados de terceiros.'));
    form.append(aceite);

    var msg = el('div', 'p-msg'); msg.id = 'nAuthMsg'; msg.setAttribute('role', 'alert'); msg.hidden = true; form.append(msg);

    var acoes = el('div', 'n-acoes');
    var ok = el('button', 'btn principal', 'Entrar'); ok.type = 'submit'; ok.id = 'nAuthOk';
    var cancela = el('button', 'btn', 'Cancelar'); cancela.type = 'button'; cancela.id = 'nAuthCancela';
    acoes.append(ok, cancela); form.append(acoes);
    function botaoProvedor(id, rotulo, acao) {
      var b = el('button', 'btn n-prov', rotulo); b.type = 'button'; b.id = id;
      b.addEventListener('click', function () {
        b.disabled = true;
        acao().then(function () { fechar(D.usuario()); }).catch(function (er) { mostrar(D.erroHumano(er)); }).then(function () { b.disabled = false; });
      });
      form.append(b);
    }
    if (D.loginGoogle || D.loginApple) {
      var ou = el('p', 'n-sub', 'ou'); ou.style.textAlign = 'center'; ou.style.margin = '0'; form.append(ou);
      if (D.loginGoogle) botaoProvedor('nAuthGoogle', 'Continuar com o Google', function () { return D.entrarGoogle(); });
      if (D.loginApple) botaoProvedor('nAuthApple', 'Entrar com Apple', function () { return D.entrarApple(); });
      var nota = el('p', 'n-sub', 'Ao continuar com o Google, você concorda que o seu e-mail fique guardado no Firebase para o funcionamento do site.'); nota.style.fontSize = '12.5px'; nota.style.margin = '0'; form.append(nota);
    }
    var esq = el('button', 'n-link', 'Esqueci minha senha'); esq.type = 'button'; esq.id = 'nAuthEsqueci'; form.append(esq);
    dlg.append(form); document.body.append(dlg);

    function modo(m) {
      estado.modo = m;
      bEntrar.classList.toggle('ativo', m === 'entrar'); bCriar.classList.toggle('ativo', m === 'criar');
      g2.hidden = aceite.hidden = m !== 'criar'; esq.hidden = m !== 'entrar';
      g2.querySelector('input').required = m === 'criar';
      ok.textContent = m === 'criar' ? 'Criar conta' : 'Entrar';
      form.querySelector('#nAuthSenha').autocomplete = m === 'criar' ? 'new-password' : 'current-password';
      msg.hidden = true;
    }
    abas.addEventListener('click', function (ev) { var b = ev.target.closest('.n-aba'); if (b) modo(b.dataset.modo); });
    cancela.addEventListener('click', function () { fechar(null); });
    dlg.addEventListener('cancel', function (ev) { ev.preventDefault(); fechar(null); });
    esq.addEventListener('click', function () {
      var e = form.querySelector('#nAuthEmail').value.trim();
      if (!D.emailOk(e)) return mostrar('Digite seu e-mail acima e clique de novo.');
      D.recuperar(e).then(function () { mostrar('Se esse e-mail tiver conta, enviamos um link para criar uma nova senha.', true); }).catch(function (er) { mostrar(D.erroHumano(er)); });
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var e = form.querySelector('#nAuthEmail').value.trim().toLowerCase(), s = form.querySelector('#nAuthSenha').value;
      if (!D.emailOk(e)) return mostrar('Esse e-mail não parece válido.');
      if (s.length < 8) return mostrar('A senha precisa ter pelo menos 8 caracteres.');
      if (estado.modo === 'criar') {
        if (s !== form.querySelector('#nAuthSenha2').value) return mostrar('As duas senhas não são iguais.');
        if (!ck.checked) return mostrar('Marque a caixa de concordância para criar a conta.');
      }
      ok.disabled = true; var antes = ok.textContent; ok.textContent = 'Aguarde…';
      (estado.modo === 'criar' ? D.criar(e, s) : D.entrar(e, s))
        .then(function () { form.querySelector('#nAuthSenha').value = ''; form.querySelector('#nAuthSenha2').value = ''; fechar(D.usuario()); })
        .catch(function (er) { mostrar(D.erroHumano(er)); })
        .then(function () { ok.disabled = false; ok.textContent = antes; });
    });
    function mostrar(t, bom) { msg.textContent = t; msg.hidden = false; msg.classList.toggle('n-ok', !!bom); }
    function fechar(u) { if (dlg.open) dlg.close(); var r = estado.resolver; estado.resolver = null; if (r) r(u); }
    dlg._modo = modo;
  }

  window.NormaAuthUI = {
    abrir: function (modoInicial) {
      if (!dlg) montar();
      dlg._modo(modoInicial === 'criar' ? 'criar' : 'entrar');
      return new Promise(function (res) {
        estado.resolver = res;
        if (!dlg.open) dlg.showModal();
        var i = dlg.querySelector('#nAuthEmail'); if (i) i.focus();
      });
    },
  };
})();

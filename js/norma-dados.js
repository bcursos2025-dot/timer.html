/* ============================================================
   NORMA — camada de dados de professores, comentários, curtidas e pedidos (Firebase Auth + Realtime Database).
   Usada por professor.html, professores.html, admin.html e oab.html (comentários).
   Tudo passa por window.NormaDados; as páginas nunca falam direto com o Firebase.

   Nós do banco (regras em database.rules.professores.json):
     admins/{uid}                         true (colocado À MÃO no console; só o próprio admin lê)
     professores_pendentes/{uid}          cadastro enviado pelo professor (status pendente | aprovado | recusado)
     professores_aprovados/{uid}          perfil PÚBLICO (só o admin grava)
     comentarios/{questaoId}/{id}         comentário de professor aprovado
     curtidas/{questaoId}/{comentId}/{uid} true
     pedidos/{professorUid}/{id}          pedido de correção enviado por um aluno logado

   Modo de teste: abrir qualquer página com ?mock=1 em localhost usa um banco falso guardado no navegador
   (localStorage "norma_mock_db"), sem tocar no Firebase de produção. ?mock=0 desliga.
   ============================================================ */
(function () {
  'use strict';

  // Login com Apple: o código está pronto, mas o botão só aparece quando isto for true. Só funciona depois de
  // configurar o Apple Developer Program (US$ 99/ano) e o provedor Apple no Firebase (docs/PROFESSORES.md, "Login com Apple").
  var LOGIN_APPLE = false;
  var SDK_VERSAO = '10.12.2';
  var SDK_URLS = ['app', 'auth', 'database'].map(function (n) { return 'https://www.gstatic.com/firebasejs/' + SDK_VERSAO + '/firebase-' + n + '-compat.js'; });
  var CONFIG = {
    apiKey: 'AIzaSyAqpHJny30HIfedbdwq22Ex1K0QDllO5hw',
    authDomain: 'concurseiro-blindado.firebaseapp.com',
    databaseURL: 'https://concurseiro-blindado-default-rtdb.firebaseio.com',
    projectId: 'concurseiro-blindado',
  };
  var LIM = { foto: 40000, nome: 80, oab: 20, areas: 200, curriculo: 1500, contato: 120, comentario: 6000, mensagem: 1500, precoMin: 50, precoMax: 5000, prazoMin: 2, prazoMax: 48 };

  /* ---------- modo de teste ---------- */
  var LOCAL = (function () { var h = location.hostname; return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.slice(-10) === '.localhost'; })();
  var MOCK = (function () {
    if (!LOCAL) return false;
    try {
      var q = new URLSearchParams(location.search).get('mock');
      if (q === '1') sessionStorage.setItem('norma_mock', '1');
      if (q === '0') sessionStorage.removeItem('norma_mock');
      return sessionStorage.getItem('norma_mock') === '1';
    } catch (e) { return false; }
  })();

  /* ---------- mensagens de erro em português ---------- */
  function erroHumano(e) {
    var c = (e && (e.code || e.message)) || '';
    c = String(c);
    var mapa = {
      'auth/invalid-email': 'Esse e-mail não parece válido.',
      'auth/user-not-found': 'E-mail ou senha incorretos.',
      'auth/wrong-password': 'E-mail ou senha incorretos.',
      'auth/invalid-credential': 'E-mail ou senha incorretos.',
      'auth/invalid-login-credentials': 'E-mail ou senha incorretos.',
      'auth/email-already-in-use': 'Já existe uma conta com esse e-mail. Use "Entrar".',
      'auth/weak-password': 'Senha fraca: use pelo menos 8 caracteres.',
      'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
      'auth/network-request-failed': 'Sem conexão com o Firebase. Verifique sua internet.',
      'auth/operation-not-allowed': 'O login por e-mail e senha ainda não foi ligado no Firebase (veja docs/PROFESSORES.md, passo 1).',
      'auth/unauthorized-domain': 'Este endereço do site não está autorizado no Firebase (veja docs/PROFESSORES.md, passo 2).',
      'auth/popup-closed-by-user': 'Você fechou a janela de login antes de terminar.',
      'auth/cancelled-popup-request': 'Já existe uma janela de login aberta.',
      'auth/popup-blocked': 'O navegador bloqueou a janela de login. Libere pop-ups para este site e tente de novo.',
      'auth/account-exists-with-different-credential': 'Já existe uma conta com esse e-mail por outro método. Entre com e-mail e senha.',
      'auth/user-disabled': 'Esta conta foi desativada.',
      'auth/requires-recent-login': 'Por segurança, saia e entre de novo para continuar.',
      'PERMISSION_DENIED': 'O banco recusou esta operação. As regras novas do banco ainda não foram publicadas, ou sua conta não tem permissão (veja docs/PROFESSORES.md, passo 3).',
    };
    if (mapa[c]) return mapa[c];
    if (/permission[_ ]denied/i.test(c)) return mapa.PERMISSION_DENIED;
    if (/network|offline|timeout/i.test(c)) return 'Sem conexão com o Firebase. Verifique sua internet.';
    return 'Não deu certo agora. Tente de novo em instantes.';
  }

  /* ---------- utilidades ---------- */
  function texto(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max); }
  function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= LIM.contato; }
  function lista(obj) {
    if (!obj || typeof obj !== 'object') return [];
    return Object.keys(obj).map(function (k) { var o = obj[k]; return o && typeof o === 'object' ? Object.assign({ id: k }, o) : null; }).filter(Boolean);
  }

  /* validação do cadastro de professor (as regras do banco repetem os mesmos limites) */
  function validarCadastro(d) {
    var r = {
      nome: texto(d.nome, LIM.nome), oab: texto(d.oab, LIM.oab).replace(/\s+/g, ''), uf: texto(d.uf, 2).toUpperCase(),
      areas: texto(d.areas, LIM.areas), curriculo: texto(d.curriculo, LIM.curriculo), contato: texto(d.contato, LIM.contato).toLowerCase(),
      preco_min: Number(d.preco_min), prazo_h: Number(d.prazo_h),
    };
    if (r.nome.length < 5 || r.nome.indexOf(' ') < 0) return { erro: 'Escreva seu nome completo.', campo: 'nome' };
    if (!/^\d{1,7}$/.test(r.oab)) return { erro: 'Número da OAB: só números (ex.: 123456).', campo: 'oab' };
    if (!/^[A-Z]{2}$/.test(r.uf)) return { erro: 'Escolha a seccional (UF).', campo: 'uf' };
    if (r.areas.length < 3) return { erro: 'Diga em quais áreas você atua.', campo: 'areas' };
    if (r.curriculo.length < 40) return { erro: 'Escreva um currículo com pelo menos 40 caracteres.', campo: 'curriculo' };
    if (!emailOk(r.contato)) return { erro: 'Informe um e-mail de contato válido.', campo: 'contato' };
    if (!(r.preco_min >= LIM.precoMin && r.preco_min <= LIM.precoMax)) return { erro: 'O preço mínimo por correção é R$ ' + LIM.precoMin + ' (e no máximo R$ ' + LIM.precoMax + ').', campo: 'preco_min' };
    if (!(r.prazo_h >= LIM.prazoMin && r.prazo_h <= LIM.prazoMax && Math.floor(r.prazo_h) === r.prazo_h)) return { erro: 'O prazo de devolução vai de ' + LIM.prazoMin + ' a ' + LIM.prazoMax + ' horas.', campo: 'prazo_h' };
    var foto = typeof d.foto === 'string' ? d.foto : '';
    if (foto) {
      if (foto.indexOf('data:image/jpeg;base64,') !== 0 || foto.length > LIM.foto) return { erro: 'A foto precisa ser um JPEG pequeno (a página reduz sozinha). Tente outra imagem.', campo: 'foto' };
      r.foto = foto;
    }
    return { ok: true, dados: r };
  }

  /* vídeo-explicação: só YouTube e Google Drive, guardado sempre no formato canônico (as regras do banco conferem o mesmo formato) */
  function videoCanonico(u) {
    u = String(u == null ? '' : u).trim();
    if (!u) return { ok: true, url: '' };
    var m;
    if ((m = /^https:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})/.exec(u))) return { ok: true, url: 'https://www.youtube.com/watch?v=' + m[1] };
    if ((m = /^https:\/\/youtu\.be\/([A-Za-z0-9_-]{11})/.exec(u))) return { ok: true, url: 'https://www.youtube.com/watch?v=' + m[1] };
    if ((m = /^https:\/\/(?:www\.)?youtube\.com\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/.exec(u))) return { ok: true, url: 'https://www.youtube.com/watch?v=' + m[1] };
    if ((m = /^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,100})(?:[/?#]|$)/.exec(u))) return { ok: true, url: 'https://drive.google.com/file/d/' + m[1] + '/view' };
    if ((m = /^https:\/\/drive\.google\.com\/open\?(?:[^#]*&)?id=([A-Za-z0-9_-]{10,100})/.exec(u))) return { ok: true, url: 'https://drive.google.com/file/d/' + m[1] + '/view' };
    return { erro: 'Use um link do YouTube ou do Google Drive. No Drive, compartilhe como "qualquer pessoa com o link".' };
  }
  function videoEmbed(url) {
    var m;
    if ((m = /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/.exec(url || ''))) return 'https://www.youtube-nocookie.com/embed/' + m[1];
    if ((m = /^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,100})\/view$/.exec(url || ''))) return 'https://drive.google.com/file/d/' + m[1] + '/preview';
    return '';
  }

  /* pontuação do ranking: média de curtidas por comentário, valorizando quem comenta mais (log). Documentada em docs/PROFESSORES.md */
  function pontuacao(comentarios, curtidas) {
    if (!comentarios) return 0;
    return (curtidas / comentarios) * (Math.log(1 + comentarios) / Math.LN2);
  }
  function estatisticas(comentarios, curtidas) {
    // comentarios: {questaoId:{comentId:{uid,...}}}, curtidas: {questaoId:{comentId:{uid:true}}}
    var porProf = {};
    Object.keys(comentarios || {}).forEach(function (q) {
      Object.keys(comentarios[q] || {}).forEach(function (c) {
        var cm = comentarios[q][c]; if (!cm || !cm.uid) return;
        var p = porProf[cm.uid] || (porProf[cm.uid] = { comentarios: 0, curtidas: 0 });
        p.comentarios += 1;
        var cu = curtidas && curtidas[q] && curtidas[q][c];
        p.curtidas += cu ? Object.keys(cu).length : 0;
      });
    });
    Object.keys(porProf).forEach(function (u) { porProf[u].pontos = pontuacao(porProf[u].comentarios, porProf[u].curtidas); });
    return porProf;
  }

  /* ============================================================
     BANCO DE TESTE (?mock=1): mesma interface, dados no localStorage
     ============================================================ */
  function criarMock() {
    var KEY = 'norma_mock_db', KU = 'norma_mock_user';
    function ler() { try { return JSON.parse(localStorage.getItem(KEY)) || { _usuarios: {} }; } catch (e) { return { _usuarios: {} }; } }
    function gravar(db) { localStorage.setItem(KEY, JSON.stringify(db)); }
    function seg(p) { return p.split('/').filter(Boolean); }
    function get(db, p) { var n = db; var s = seg(p); for (var i = 0; i < s.length; i++) { if (n == null || typeof n !== 'object') return null; n = n[s[i]]; } return n === undefined ? null : n; }
    function set(db, p, v) {
      var s = seg(p), n = db;
      for (var i = 0; i < s.length - 1; i++) { if (n[s[i]] == null || typeof n[s[i]] !== 'object') n[s[i]] = {}; n = n[s[i]]; }
      if (v === null) delete n[s[s.length - 1]]; else n[s[s.length - 1]] = v;
    }
    var ouvintes = [];
    function atual() { try { return JSON.parse(localStorage.getItem(KU)); } catch (e) { return null; } }
    function avisar() { var u = atual(); ouvintes.forEach(function (f) { f(u); }); }
    var uid = function (email) { return 'u_' + email.replace(/[^a-z0-9]/gi, '_').toLowerCase(); };
    function falha(code) { var e = new Error(code); e.code = code; return e; }

    return {
      usuario: atual,
      onUsuario: function (f) { ouvintes.push(f); setTimeout(function () { f(atual()); }, 0); },
      entrar: function (email, senha) {
        var db = ler(), u = db._usuarios[email];
        if (!u || u.senha !== senha) return Promise.reject(falha('auth/invalid-credential'));
        localStorage.setItem(KU, JSON.stringify({ uid: u.uid, email: email, emailVerified: !!u.verificado })); avisar(); return Promise.resolve();
      },
      criar: function (email, senha) {
        var db = ler(); if (db._usuarios[email]) return Promise.reject(falha('auth/email-already-in-use'));
        if (senha.length < 8) return Promise.reject(falha('auth/weak-password'));
        db._usuarios[email] = { uid: uid(email), senha: senha, verificado: false }; gravar(db);
        localStorage.setItem(KU, JSON.stringify({ uid: uid(email), email: email, emailVerified: false })); avisar(); return Promise.resolve();
      },
      sair: function () { localStorage.removeItem(KU); avisar(); return Promise.resolve(); },
      recuperar: function () { return Promise.resolve(); },
      reenviarVerificacao: function () { return Promise.resolve(); },
      entrarApple: function () { return Promise.reject({ code: 'auth/operation-not-allowed' }); },
      recarregarUsuario: function () {
        // no teste, "verificar o e-mail" acontece sozinho ao clicar em "já verifiquei"
        var u = atual(); if (!u) return Promise.resolve(null);
        var db = ler(); if (db._usuarios[u.email]) { db._usuarios[u.email].verificado = true; gravar(db); }
        u.emailVerified = true; localStorage.setItem(KU, JSON.stringify(u)); avisar(); return Promise.resolve(u);
      },
      ler: function (p) { return Promise.resolve(get(ler(), p)); },
      gravar: function (p, v) { var db = ler(); set(db, p, v); gravar(db); return Promise.resolve(); },
      atualizar: function (mapa) { var db = ler(); Object.keys(mapa).forEach(function (p) { set(db, p, mapa[p]); }); gravar(db); return Promise.resolve(); },
      empurrar: function (p, v) { var id = 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); var db = ler(); set(db, p + '/' + id, v); gravar(db); return Promise.resolve(id); },
      agora: function () { return Date.now(); },
    };
  }

  /* ============================================================
     FIREBASE DE VERDADE
     ============================================================ */
  var carregando = null;
  function carregarSdk() {
    if (carregando) return carregando;
    carregando = new Promise(function (ok, falha) {
      var i = 0;
      (function proximo() {
        if (window.firebase && window.firebase.database && window.firebase.auth) return ok();
        if (i >= SDK_URLS.length) return window.firebase ? ok() : falha(new Error('sdk'));
        var s = document.createElement('script'); s.src = SDK_URLS[i++]; s.async = false;
        s.onload = proximo; s.onerror = function () { falha(new Error('network-request-failed')); };
        document.head.appendChild(s);
      })();
    }).then(function () {
      var app = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(CONFIG);
      return { auth: firebase.auth(app), db: firebase.database(app) };
    });
    carregando.catch(function () { carregando = null; });
    return carregando;
  }

  function criarFirebase() {
    var cache = null, ouvintes = [], usuarioAtual = null, ligado = false;
    function f() { return carregarSdk().then(function (x) { cache = x; return x; }); }
    function cvt(u) { return u ? { uid: u.uid, email: u.email, emailVerified: !!u.emailVerified } : null; }
    function ligar() {
      if (ligado) return; ligado = true;
      f().then(function (x) { x.auth.onAuthStateChanged(function (u) { usuarioAtual = cvt(u); ouvintes.forEach(function (fn) { fn(usuarioAtual); }); }); })
        .catch(function () { ouvintes.forEach(function (fn) { fn(null, 'sdk'); }); });
    }
    return {
      usuario: function () { return usuarioAtual; },
      onUsuario: function (fn) { ouvintes.push(fn); if (ligado && usuarioAtual !== null) fn(usuarioAtual); ligar(); },
      entrar: function (e, s) { return f().then(function (x) { return x.auth.signInWithEmailAndPassword(e, s); }).then(function () {}); },
      criar: function (e, s) { return f().then(function (x) { return x.auth.createUserWithEmailAndPassword(e, s); }).then(function (c) { try { c.user.sendEmailVerification(); } catch (er) { /* ok */ } }); },
      sair: function () { return f().then(function (x) { return x.auth.signOut(); }); },
      recuperar: function (e) { return f().then(function (x) { return x.auth.sendPasswordResetEmail(e); }); },
      reenviarVerificacao: function () { return f().then(function (x) { return x.auth.currentUser ? x.auth.currentUser.sendEmailVerification() : null; }); },
      entrarApple: function () {
        return f().then(function (x) {
          var prov = new firebase.auth.OAuthProvider('apple.com'); prov.addScope('email'); prov.addScope('name');
          return x.auth.signInWithPopup(prov);
        }).then(function () {});
      },
      recarregarUsuario: function () {
        return f().then(function (x) {
          var u = x.auth.currentUser; if (!u) return null;
          return u.reload().then(function () { return u.getIdToken(true); }).then(function () { usuarioAtual = cvt(u); ouvintes.forEach(function (fn) { fn(usuarioAtual); }); return usuarioAtual; });
        });
      },
      ler: function (p) { return f().then(function (x) { return x.db.ref(p).get(); }).then(function (s) { return s.val(); }); },
      gravar: function (p, v) { return f().then(function (x) { return x.db.ref(p).set(v); }); },
      atualizar: function (m) { return f().then(function (x) { return x.db.ref().update(m); }); },
      empurrar: function (p, v) { return f().then(function (x) { var r = x.db.ref(p).push(); return r.set(v).then(function () { return r.key; }); }); },
      agora: function () { return firebase.database.ServerValue.TIMESTAMP; },
    };
  }

  var base = MOCK ? criarMock() : criarFirebase();

  /* ============================================================
     API PÚBLICA
     ============================================================ */
  var NormaDados = {
    mock: MOCK, loginApple: LOGIN_APPLE && !MOCK, entrarApple: function () { return base.entrarApple(); }, LIM: LIM, videoCanonico: videoCanonico, videoEmbed: videoEmbed, erroHumano: erroHumano, validarCadastro: validarCadastro, pontuacao: pontuacao, emailOk: emailOk, texto: texto,
    usuario: base.usuario, onUsuario: base.onUsuario, entrar: base.entrar, criar: base.criar, sair: base.sair, recuperar: base.recuperar,
    reenviarVerificacao: base.reenviarVerificacao, recarregarUsuario: base.recarregarUsuario,

    // O e-mail do dono é admin (as regras do banco conferem o mesmo e-mail, verificado); outros admins entram por admins/{uid}.
    EMAIL_ADMIN: 'b.cursos2025@gmail.com',
    ehAdmin: function (user) {
      if (!user) return Promise.resolve(false);
      if (user.emailVerified && String(user.email).toLowerCase() === NormaDados.EMAIL_ADMIN) return Promise.resolve(true);
      return base.ler('admins/' + user.uid).then(function (v) { return v === true; }).catch(function () { return false; });
    },

    /* professor */
    meuCadastro: function (uid) { return base.ler('professores_pendentes/' + uid); },
    enviarCadastro: function (uid, d) {
      var v = validarCadastro(d); if (!v.ok) return Promise.reject({ code: 'validacao', message: v.erro, campo: v.campo });
      var dados = Object.assign({}, v.dados, { status: 'pendente', ts: base.agora() });
      return base.gravar('professores_pendentes/' + uid, dados);
    },
    souAprovado: function (uid) { return base.ler('professores_aprovados/' + uid).then(function (v) { return v && typeof v === 'object' ? v : null; }); },
    listarAprovados: function () { return base.ler('professores_aprovados').then(lista); },

    /* admin */
    listarPendentes: function () { return base.ler('professores_pendentes').then(function (o) { return lista(o).filter(function (x) { return x.status === 'pendente'; }); }); },
    listarCadastros: function () { return base.ler('professores_pendentes').then(lista); },
    remover: function (uid) {
      var m = {}; m['professores_aprovados/' + uid] = null; m['professores_pendentes/' + uid + '/status'] = 'recusado'; m['professores_pendentes/' + uid + '/motivo'] = 'Removido da lista pelo administrador.';
      return base.atualizar(m);
    },
    aprovar: function (uid, c) {
      var m = {};
      var pub = { nome: c.nome, oab: c.oab, uf: c.uf, areas: c.areas, curriculo: c.curriculo, preco_min: c.preco_min, prazo_h: c.prazo_h, desde: c.desde || base.agora() };
      if (c.foto) pub.foto = c.foto;
      m['professores_aprovados/' + uid] = pub;
      m['professores_pendentes/' + uid + '/status'] = 'aprovado';
      return base.atualizar(m);
    },
    recusar: function (uid, motivo) {
      var m = {}; m['professores_pendentes/' + uid + '/status'] = 'recusado'; m['professores_pendentes/' + uid + '/motivo'] = texto(motivo, 300);
      return base.atualizar(m);
    },

    /* comentários e curtidas */
    comentarios: function (qid) {
      return Promise.all([base.ler('comentarios/' + qid), base.ler('curtidas/' + qid)]).then(function (r) {
        var cs = lista(r[0]), cu = r[1] || {};
        return cs.map(function (c) { var l = cu[c.id] || {}; return Object.assign(c, { curtidas: Object.keys(l), }); }).sort(function (a, b) { return b.curtidas.length - a.curtidas.length || (a.ts || 0) - (b.ts || 0); });
      });
    },
    comentar: function (qid, user, perfil, txt, videoUrl) {
      var t = texto(txt, LIM.comentario); if (t.length < 20) return Promise.reject({ code: 'validacao', message: 'Escreva um comentário com pelo menos 20 caracteres.' });
      var v = videoCanonico(videoUrl); if (!v.ok) return Promise.reject({ code: 'validacao', message: v.erro });
      var corpo = { uid: user.uid, nome: perfil.nome, texto: t, ts: base.agora() }; if (v.url) corpo.video = v.url;
      return base.empurrar('comentarios/' + qid, corpo);
    },
    apagarComentario: function (qid, cid) { return base.gravar('comentarios/' + qid + '/' + cid, null); },
    curtir: function (qid, cid, uid, sim) { return base.gravar('curtidas/' + qid + '/' + cid + '/' + uid, sim ? true : null); },

    /* ranking: pontuação por curtidas; junto vêm os comentários e as avaliações de cada professor */
    ranking: function () {
      var tolera = function (p) { return p.catch(function () { return null; }); };   // avaliações: se as regras novas ainda não foram publicadas, a lista continua
      return Promise.all([base.ler('professores_aprovados'), base.ler('comentarios'), base.ler('curtidas'), tolera(base.ler('avaliacoes'))]).then(function (r) {
        var st = estatisticas(r[1], r[2]), cm = r[1] || {}, cu = r[2] || {}, av = r[3] || {};
        var porProf = {};
        Object.keys(cm).forEach(function (q) {
          Object.keys(cm[q] || {}).forEach(function (c) {
            var x = cm[q][c]; if (!x || !x.uid) return;
            var l = cu[q] && cu[q][c] ? Object.keys(cu[q][c]).length : 0;
            (porProf[x.uid] = porProf[x.uid] || []).push({ qid: q, cid: c, texto: x.texto, video: x.video || '', ts: x.ts || 0, curtidas: l });
          });
        });
        return lista(r[0]).map(function (p) {
          var s0 = st[p.id] || { comentarios: 0, curtidas: 0, pontos: 0 };
          var coments = (porProf[p.id] || []).sort(function (a, b) { return b.curtidas - a.curtidas || b.ts - a.ts; });
          var avs = lista(av[p.id]).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
          var media = avs.length ? avs.reduce(function (t, x) { return t + Number(x.estrelas || 0); }, 0) / avs.length : 0;
          return Object.assign(p, s0, { lista_comentarios: coments, avaliacoes: avs, media: media });
        }).sort(function (a, b) { return b.pontos - a.pontos || b.curtidas - a.curtidas || (a.desde || 0) - (b.desde || 0); });
      });
    },

    /* avaliações dos alunos (só quem pediu correção ao professor; não mudam o ranking) */
    jaPediu: function (uid, profUid) { return base.ler('pedidos_de/' + uid + '/' + profUid).then(function (v) { return v === true; }).catch(function () { return false; }); },
    minhaAvaliacao: function (uid, profUid) { return base.ler('avaliacoes/' + profUid + '/' + uid).catch(function () { return null; }); },
    avaliar: function (profUid, user, d) {
      var est = Number(d.estrelas), nome = texto(d.nome, 40), t = texto(d.texto, 600);
      if (!(est >= 1 && est <= 5 && Math.floor(est) === est)) return Promise.reject({ code: 'validacao', message: 'Escolha de 1 a 5 estrelas.' });
      if (nome.length < 2) return Promise.reject({ code: 'validacao', message: 'Escreva seu primeiro nome.' });
      var o = { estrelas: est, nome: nome, ts: base.agora() }; if (t) o.texto = t;
      return base.gravar('avaliacoes/' + profUid + '/' + user.uid, o);
    },
    apagarAvaliacao: function (profUid, uid) { return base.gravar('avaliacoes/' + profUid + '/' + uid, null); },

    /* pedidos de correção */
    enviarPedido: function (profUid, user, d) {
      var msg = texto(d.mensagem, LIM.mensagem), nome = texto(d.nome, LIM.nome), contato = texto(d.contato, LIM.contato).toLowerCase(), tipo = texto(d.tipo, 40);
      if (nome.length < 3) return Promise.reject({ code: 'validacao', message: 'Escreva seu nome.' });
      if (!emailOk(contato)) return Promise.reject({ code: 'validacao', message: 'Informe um e-mail de contato válido.' });
      if (msg.length < 20) return Promise.reject({ code: 'validacao', message: 'Conte em pelo menos 20 caracteres o que você precisa (peça, prazo, prova).' });
      return base.gravar('pedidos_de/' + user.uid + '/' + profUid, true).then(function () {
        return base.empurrar('pedidos/' + profUid, { de: user.uid, nome: nome, contato: contato, tipo: tipo, mensagem: msg, ts: base.agora() });
      });
    },
    meusPedidos: function (uid) { return base.ler('pedidos/' + uid).then(function (o) { return lista(o).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); }); },
    apagarPedido: function (uid, id) { return base.gravar('pedidos/' + uid + '/' + id, null); },
  };

  window.NormaDados = NormaDados;
})();

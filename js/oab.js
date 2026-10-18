/* ============================================================
   QUESTÕES DA OAB (oab.html)
   Arquitetura: data/oab/indice.json (leve) lista os exames; cada exame é um arquivo data/oab/<id>.json,
   baixado só quando a pessoa abre aquele exame (e guardado pelo navegador/service worker).
   Armazenamento local:
     cb2_oab_progresso = { "<id da questão>": { r:'B', ok:true|false, d:'AAAA-MM-DD', n:tentativas } }
     cb2_oab_ultimo    = { exame:'<id>' }
     cb2_desempenho    = registros do Painel; cada PRIMEIRA resposta soma 1 em disciplina+assunto do dia
   Todo texto vindo dos arquivos é inserido com textContent (nunca innerHTML).
   ============================================================ */
(function(){
  'use strict';

  const LS_PROG = 'cb2_oab_progresso', LS_ULT = 'cb2_oab_ultimo', LS_DESEMP = 'cb2_desempenho';
  const $ = id => document.getElementById(id);
  const selExame = $('selExame'), selDisc = $('selDisc'), selFiltro = $('selFiltro');

  const estado = { indice: null, exame: null, lista: [], pos: 0 };
  const cache = {};

  function lsLer(chave, padrao){ try { const v = localStorage.getItem(chave); return v == null ? padrao : JSON.parse(v); } catch (e) { return padrao; } }
  function lsGravar(chave, valor){ try { localStorage.setItem(chave, JSON.stringify(valor)); return true; } catch (e) { return false; } }

  function el(tag, classe, texto){
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    return e;
  }
  function hoje(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  let progresso = lsLer(LS_PROG, {});
  if (!progresso || typeof progresso !== 'object' || Array.isArray(progresso)) progresso = {};

  // Questão "só gabarito" (prova anterior): sem enunciado nem texto das alternativas; a pessoa lê a prova oficial (PDF) e marca A–D aqui.
  const ehGabarito = q => !q.enunciado;
  const letras = q => q.alternativas ? Object.keys(q.alternativas).sort() : ['A', 'B', 'C', 'D'];
  // só aceitamos link https (o arquivo do exame pode ter sido editado à mão)
  const urlSegura = u => (typeof u === 'string' && /^https:\/\/[^\s]+$/i.test(u)) ? u : null;

  // resposta atual da questão (null se nunca respondida ou se foi zerada para refazer)
  const atual = id => (progresso[id] && progresso[id].r) ? progresso[id] : null;
  function limparResposta(id){ if (progresso[id]) { progresso[id].r = null; progresso[id].ok = false; } }

  function erro(texto){ const m = $('msgErro'); m.textContent = texto; m.hidden = !texto; }

  /* ---------- carregar dados ---------- */
  async function buscarJson(url){
    const r = await fetch(url, { cache: 'default' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function carregarIndice(){
    try {
      estado.indice = await buscarJson('data/oab/indice.json');
      if (!estado.indice || !Array.isArray(estado.indice.exames) || !estado.indice.exames.length) throw new Error('índice vazio');
    } catch (e) {
      erro('Não consegui carregar a lista de exames. Verifique sua internet e recarregue a página.');
      return false;
    }
    selExame.textContent = '';
    estado.indice.exames.forEach(x => {
      const o = el('option', null, x.titulo + ' (' + x.total + ' questões)');
      o.value = x.id; selExame.append(o);
    });
    const ult = lsLer(LS_ULT, null);
    if (ult && estado.indice.exames.some(x => x.id === ult.exame)) selExame.value = ult.exame;
    return true;
  }

  async function abrirExame(id){
    erro('');
    const meta = estado.indice.exames.find(x => x.id === id);
    if (!meta) return;
    $('boxQuestao').hidden = true; $('boxVazio').hidden = true;
    try {
      if (!cache[id]) cache[id] = await buscarJson('data/oab/' + encodeURIComponent(meta.arquivo));
    } catch (e) {
      erro('Não consegui baixar este exame (' + meta.titulo + '). Verifique sua internet e tente de novo.');
      return;
    }
    estado.exame = cache[id];
    lsGravar(LS_ULT, { exame: id });
    const aviso = $('avisoBanco');
    aviso.textContent = '';
    if (estado.exame.aviso) { aviso.append(el('b', null, 'Sobre este banco'), el('p', null, estado.exame.aviso)); aviso.hidden = false; }
    else aviso.hidden = true;

    const discs = Array.from(new Set(estado.exame.questoes.map(q => q.disciplina))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    selDisc.textContent = '';
    const todas = el('option', null, 'Todas'); todas.value = ''; selDisc.append(todas);
    discs.forEach(d => { const o = el('option', null, d); o.value = d; selDisc.append(o); });
    aplicarFiltros();
  }

  /* ---------- filtros ---------- */
  function aplicarFiltros(){
    const disc = selDisc.value, f = selFiltro.value;
    estado.lista = estado.exame.questoes.filter(q => {
      if (disc && q.disciplina !== disc) return false;
      const p = atual(q.id);
      if (f === 'novas') return !p;
      if (f === 'erradas') return Boolean(p) && !p.ok;
      return true;
    });
    estado.pos = 0;
    pintarPlacar();
    pintar();
  }

  function pintarPlacar(){
    const qs = estado.exame.questoes;
    let resp = 0, certas = 0;
    qs.forEach(q => { const p = atual(q.id); if (p) { resp++; if (p.ok) certas++; } });
    const box = $('placar');
    box.textContent = '';
    const item = (n, rot) => { const s = el('span'); s.append(el('b', null, String(n)), document.createTextNode(rot)); return s; };
    box.append(item(resp + '/' + qs.length, 'respondidas'), item(resp ? Math.round(certas / resp * 100) + '%' : '—', 'de acerto'),
      item(resp - certas, 'para revisar'));
  }

  /* ---------- questão ---------- */
  function linkLei(f){
    if (!f || !f.lei) return null;
    const m = /art\.?\s*(\d+)/i.exec(f.dispositivo || '');
    return 'leis.html#' + encodeURIComponent(f.lei) + (m ? '/' + m[1] : '');
  }

  function pintar(){
    const box = $('boxQuestao'), vazio = $('boxVazio');
    if (!estado.lista.length) {
      box.hidden = true; vazio.hidden = false;
      vazio.textContent = selFiltro.value === 'erradas' ? 'Você não tem questões erradas neste filtro. Bom trabalho!'
        : selFiltro.value === 'novas' ? 'Você já respondeu todas as questões deste filtro.' : 'Nenhuma questão neste filtro.';
      return;
    }
    vazio.hidden = true; box.hidden = false;
    const q = estado.lista[estado.pos];
    $('qEtiqueta').textContent = (q.numero ? 'Questão ' + q.numero + ' · ' : '') + q.disciplina + (q.assunto ? ' · ' + q.assunto : '');
    $('qPos').textContent = (estado.pos + 1) + ' de ' + estado.lista.length;
    const prova = $('qProva'); prova.textContent = ''; prova.hidden = true;
    if (ehGabarito(q)) {
      $('qEnunciado').textContent = 'Abra a prova oficial, leia a questão' + (q.numero ? ' ' + q.numero : '') + ' e marque aqui a alternativa que você escolheria.';
      const ex = estado.exame, base = urlSegura(ex.pdf_prova);
      const a = el('a', 'btn pequeno', base ? 'Abrir a prova oficial (PDF)' : 'Procurar a prova no site da FGV');
      a.href = base ? base + (q.pagina ? '#page=' + encodeURIComponent(q.pagina) : '') : 'https://oab.fgv.br/';
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      prova.append(a); prova.hidden = false;
    } else {
      $('qEnunciado').textContent = q.enunciado;
      const base = urlSegura(estado.exame.pdf_prova);
      if (base) {
        const a = el('a', 'btn pequeno', 'Ver na prova original (PDF)');
        a.href = base + (q.pagina ? '#page=' + encodeURIComponent(q.pagina) : '');
        a.target = '_blank'; a.rel = 'noopener noreferrer';
        prova.append(a); prova.hidden = false;
      }
    }
    const alts = $('qAlts'); alts.textContent = '';
    const p = atual(q.id);
    letras(q).forEach(letra => {
      const b = el('button', 'o-alt' + (ehGabarito(q) ? ' so-letra' : '')); b.type = 'button'; b.dataset.letra = letra;
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false');
      b.append(el('span', 'letra', letra));
      if (q.alternativas) b.append(el('span', 'txt', q.alternativas[letra]));
      else b.setAttribute('aria-label', 'Alternativa ' + letra);
      b.addEventListener('click', () => responder(letra));
      alts.append(b);
    });
    $('qFeedback').hidden = true;
    tokenComent++; $('qComents').hidden = true;
    tokenDuv++; $('qDuvidas').hidden = true;
    pintarNota(q);
    if (p) mostrarResposta(q, p.r, true);
    $('btnAnterior').disabled = estado.pos === 0;
    $('btnProxima').disabled = estado.pos >= estado.lista.length - 1;
  }

  function mostrarResposta(q, letra, jaRespondida){
    const certa = Boolean(q.anulada) || letra === q.gabarito;
    document.querySelectorAll('#qAlts .o-alt').forEach(b => {
      b.disabled = true;
      if (b.dataset.letra === q.gabarito) b.classList.add('certa');
      else if (b.dataset.letra === letra) b.classList.add('errada');
      b.setAttribute('aria-checked', b.dataset.letra === letra ? 'true' : 'false');
    });
    const fb = $('qFeedback'); fb.textContent = '';
    fb.className = 'o-feedback ' + (certa ? 'ok' : 'erro');
    fb.append(el('b', null, q.anulada ? 'Questão anulada pela banca: vale como acerto para todos'
      : certa ? 'Resposta certa' : 'Resposta errada: o gabarito é a alternativa ' + q.gabarito));
    // Comentário só aparece quando tem autor (professor ou aluno). O texto gerado por IA no banco original NÃO é exibido como comentário.
    if (q.comentario && q.comentario_por) {
      fb.append(el('p', null, q.comentario), el('p', 'o-fonte', 'Comentário de ' + q.comentario_por));
    } else if (q.fonte && q.fonte.trecho) {
      fb.append(el('p', null, 'Trecho da lei: “' + q.fonte.trecho + '”'));
    }
    if (q.fonte && q.fonte.dispositivo) {
      const p = el('p', 'o-fonte');
      p.append(document.createTextNode('Base legal: ' + q.fonte.dispositivo + '. '));
      const href = linkLei(q.fonte);
      if (href) { const a = el('a', null, 'Abrir o artigo na lei'); a.href = href; p.append(a); }
      fb.append(p);
    }
    const refazer = el('button', 'btn pequeno', 'Refazer esta questão'); refazer.type = 'button';
    refazer.addEventListener('click', () => { limparResposta(q.id); lsGravar(LS_PROG, progresso); pintarPlacar(); pintar(); });
    fb.append(refazer);
    fb.hidden = false;
    pintarComentarios(q);
    pintarDuvidas(q);
  }


  /* ---------- comentários de professores (Firebase carregado só depois da primeira resposta) ---------- */
  const ND = window.NormaDados;
  let qComentAtual = null, uidRenderizado = null, ouvindoLogin = false;
  let tokenComent = 0, perfilProf;          // perfilProf: undefined = não sabido, null = não é professor, objeto = professor aprovado
  const dataCurta = ts => ts ? new Date(ts).toLocaleDateString('pt-BR') : '';

  function pintarComentarios(q){
    const box = $('qComents');
    if (!ND) { box.hidden = true; return; }
    const meu = ++tokenComent;
    qComentAtual = q; uidRenderizado = (ND.usuario() || {}).uid || null;
    if (!ouvindoLogin) {                        // só liga o Firebase quando a primeira questão é respondida
      ouvindoLogin = true;
      ND.onUsuario(() => {
        const agora = (ND.usuario() || {}).uid || null;
        if (agora !== uidRenderizado && qComentAtual && !$('qComents').hidden) { pintarComentarios(qComentAtual); pintarDuvidas(qComentAtual); }
      });
    }
    box.hidden = false; box.textContent = '';
    box.append(el('h3', null, 'Comentários de professores'), el('p', 'n-vazio', 'Carregando…'));
    Promise.all([ND.comentarios(q.id), ND.usuario() ? ND.souAprovado(ND.usuario().uid) : Promise.resolve(null)]).then(([lista, prof]) => {
      if (meu !== tokenComent) return;           // a pessoa já foi para outra questão
      perfilProf = prof;
      desenharComentarios(q, lista, prof, meu);
    }).catch(() => {
      if (meu !== tokenComent) return;
      box.textContent = '';
      box.append(el('h3', null, 'Comentários de professores'), el('p', 'n-vazio', 'Não consegui carregar os comentários agora. Tente de novo em instantes.'));
    });
  }

  function desenharComentarios(q, lista, prof, meu){
    const box = $('qComents'); box.textContent = '';
    box.append(el('h3', null, 'Comentários de professores'));
    const user = ND.usuario();
    if (!lista.length) box.append(el('p', 'n-vazio', 'Ainda não há comentários nesta questão.'));
    lista.forEach(c => {
      const card = el('div', 'n-coment');
      const topo = el('div', 'n-coment-topo');
      topo.append(el('b', null, c.nome + ' · professor(a)'), el('span', null, dataCurta(c.ts)));
      const rod = el('div', 'n-linha'); rod.style.marginTop = '8px';
      const jaCurti = Boolean(user) && c.curtidas.includes(user.uid);
      const b = el('button', 'n-curtir', (jaCurti ? 'Curtido' : 'Curtir') + ' · ' + c.curtidas.length); b.type = 'button';
      b.setAttribute('aria-pressed', jaCurti ? 'true' : 'false');
      if (user && user.uid === c.uid) { b.disabled = true; b.title = 'Você não pode curtir o próprio comentário.'; }
      b.addEventListener('click', () => {
        const agir = u => {
          if (!u) return;
          b.disabled = true;
          ND.curtir(q.id, c.id, u.uid, !c.curtidas.includes(u.uid)).then(() => pintarComentarios(q)).catch(e => { b.disabled = false; alert(ND.erroHumano(e)); });
        };
        if (ND.usuario()) agir(ND.usuario()); else window.NormaAuthUI.abrir('entrar').then(agir);
      });
      rod.append(b);
      if (user && user.uid === c.uid) {
        const ap = el('button', 'btn pequeno', 'Apagar meu comentário'); ap.type = 'button';
        ap.addEventListener('click', () => { if (confirm('Apagar este comentário?')) ND.apagarComentario(q.id, c.id).then(() => pintarComentarios(q)).catch(e => alert(ND.erroHumano(e))); });
        rod.append(ap);
      }
      const corpo = el('div');
      if (window.NormaTexto) window.NormaTexto.renderizar(c.texto, corpo); else corpo.append(el('p', null, c.texto));
      card.append(topo, corpo);
      const embed = c.video ? ND.videoEmbed(c.video) : '';
      if (embed) {
        const vb = el('div', 'n-video');
        const play = el('button', 'btn pequeno', '▶ Assistir à explicação em vídeo'); play.type = 'button';
        play.addEventListener('click', () => {
          play.remove();
          const f = el('iframe'); f.src = embed; f.title = 'Explicação em vídeo de ' + c.nome; f.loading = 'lazy';
          f.allow = 'encrypted-media; fullscreen; picture-in-picture'; f.referrerPolicy = 'no-referrer'; f.allowFullscreen = true;
          f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups');
          const fora = el('a', 'btn pequeno', 'Abrir em outra aba'); fora.href = c.video; fora.target = '_blank'; fora.rel = 'noopener noreferrer';
          vb.append(f, el('p', 'n-video-aviso', 'Se o vídeo não abrir, o professor precisa liberar o acesso ("qualquer pessoa com o link").'), fora);
        });
        vb.append(play); card.append(vb);
      }
      card.append(rod);
      box.append(card);
    });

    if (prof) {
      const form = el('form', 'n-novo');
      const t = el('textarea'); t.maxLength = 6000; t.rows = 9; t.required = true;
      t.setAttribute('aria-label', 'Seu comentário como professor'); t.placeholder = 'Escreva o comentário. Use a barra acima para negrito, marca-texto colorido, títulos e citação da lei, ou clique em Modelo. Não copie texto de curso ou de livro.';
      const vid = el('input'); vid.type = 'url'; vid.maxLength = 200; vid.placeholder = 'Link de vídeo da explicação (YouTube ou Google Drive) — opcional';
      vid.setAttribute('aria-label', 'Link do vídeo da explicação, opcional');
      const msg = el('div', 'p-msg'); msg.hidden = true; msg.setAttribute('role', 'alert');
      const enviar = el('button', 'btn principal', 'Comentar como professor'); enviar.type = 'submit';
      const ed = window.NormaTexto ? window.NormaTexto.montarEditor(t) : null;
      if (ed) form.append(ed.barra, t, ed.titulo, ed.previa, vid, msg, enviar); else form.append(t, vid, msg, enviar);
      form.addEventListener('submit', ev => {
        ev.preventDefault(); msg.hidden = true; enviar.disabled = true;
        ND.comentar(q.id, ND.usuario(), prof, t.value, vid.value).then(() => pintarComentarios(q))
          .catch(e => { msg.textContent = e && e.code === 'validacao' ? e.message : ND.erroHumano(e); msg.hidden = false; enviar.disabled = false; });
      });
      box.append(form);
    } else {
      const dica = el('p', 'n-vazio');
      dica.append(document.createTextNode('É advogado(a)? '));
      const a = el('a', null, 'Cadastre-se como professor'); a.href = 'professor.html';
      dica.append(a, document.createTextNode(' para comentar as questões.'));
      box.append(dica);
    }
  }


  /* ---------- dúvidas dos alunos (professor aprovado responde) ---------- */
  let tokenDuv = 0;
  const LS_NOME = 'cb2_nome_duvida';

  function pintarDuvidas(q){
    const box = $('qDuvidas');
    if (!ND) { box.hidden = true; return; }
    const meu = ++tokenDuv;
    box.hidden = false; box.textContent = '';
    box.append(el('h3', null, 'Dúvidas dos alunos'), el('p', 'n-vazio', 'Carregando…'));
    Promise.all([ND.duvidas(q.id), ND.usuario() ? ND.souAprovado(ND.usuario().uid) : Promise.resolve(null)]).then(([lista, prof]) => {
      if (meu !== tokenDuv) return;
      desenharDuvidas(q, lista, prof);
    }).catch(() => {
      if (meu !== tokenDuv) return;
      box.textContent = '';
      box.append(el('h3', null, 'Dúvidas dos alunos'), el('p', 'n-vazio', 'Não consegui carregar as dúvidas agora. Tente de novo em instantes.'));
    });
  }

  function desenharDuvidas(q, lista, prof){
    const box = $('qDuvidas'); box.textContent = '';
    const user = ND.usuario();
    box.append(el('h3', null, 'Dúvidas dos alunos'));
    box.append(el('p', 'n-vazio', 'Pergunte aqui: um professor aprovado responde e aparece com nome e OAB no perfil dele.'));
    if (!lista.length) box.append(el('p', 'n-vazio', 'Ainda não há dúvidas nesta questão.'));
    lista.forEach(d => {
      const card = el('div', 'n-coment');
      const topo = el('div', 'n-coment-topo'); topo.append(el('b', null, d.nome + ' perguntou'), el('span', null, dataCurta(d.ts)));
      card.append(topo, el('p', null, d.texto));
      d.respostas.forEach(r => {
        const rb = el('div', 'n-resposta');
        const rt = el('div', 'n-coment-topo'); rt.append(el('b', null, r.nome + ' · professor(a)'), el('span', null, dataCurta(r.ts)));
        const corpo = el('div'); if (window.NormaTexto) window.NormaTexto.renderizar(r.texto, corpo); else corpo.append(el('p', null, r.texto));
        rb.append(rt, corpo);
        const embed = r.video ? ND.videoEmbed(r.video) : '';
        if (embed) { const a = el('a', 'btn pequeno', '▶ Assistir à explicação em vídeo'); a.href = r.video; a.target = '_blank'; a.rel = 'noopener noreferrer'; rb.append(a); }
        if (user && user.uid === r.uid) {
          const ap = el('button', 'btn pequeno', 'Apagar minha resposta'); ap.type = 'button'; ap.style.marginTop = '8px';
          ap.addEventListener('click', () => { if (confirm('Apagar esta resposta?')) ND.apagarResposta(q.id, d.id, r.id).then(() => pintarDuvidas(q)).catch(e => alert(ND.erroHumano(e))); });
          rb.append(ap);
        }
        card.append(rb);
      });
      const rod = el('div', 'n-linha'); rod.style.marginTop = '8px';
      if (prof) {
        const bt = el('button', 'btn pequeno', 'Responder como professor'); bt.type = 'button';
        bt.addEventListener('click', () => {
          bt.remove();
          const f = el('form', 'n-novo');
          const t = el('textarea'); t.maxLength = 6000; t.rows = 6; t.required = true; t.setAttribute('aria-label', 'Sua resposta'); t.placeholder = 'Responda a dúvida. Use a barra para formatar.';
          const ed = window.NormaTexto ? window.NormaTexto.montarEditor(t) : null;
          const msg = el('div', 'p-msg'); msg.hidden = true; msg.setAttribute('role', 'alert');
          const env = el('button', 'btn principal', 'Enviar resposta'); env.type = 'submit';
          if (ed) f.append(ed.barra, t, ed.titulo, ed.previa, msg, env); else f.append(t, msg, env);
          f.addEventListener('submit', ev => {
            ev.preventDefault(); msg.hidden = true; env.disabled = true;
            ND.responder(q.id, d.id, ND.usuario(), prof, t.value, '').then(() => pintarDuvidas(q))
              .catch(e => { msg.textContent = e && e.code === 'validacao' ? e.message : ND.erroHumano(e); msg.hidden = false; env.disabled = false; });
          });
          card.append(f); t.focus();
        });
        rod.append(bt);
      }
      if (user && user.uid === d.uid) {
        const ap = el('button', 'btn pequeno', 'Apagar minha dúvida'); ap.type = 'button';
        ap.addEventListener('click', () => { if (confirm('Apagar esta dúvida?')) ND.apagarDuvida(q.id, d.id).then(() => pintarDuvidas(q)).catch(e => alert(ND.erroHumano(e))); });
        rod.append(ap);
      }
      if (rod.childNodes.length) card.append(rod);
      box.append(card);
    });

    // formulário de nova dúvida
    if (!user) {
      const b = el('button', 'btn', 'Entrar para perguntar'); b.type = 'button';
      b.addEventListener('click', () => window.NormaAuthUI.abrir('entrar').then(() => { pintarDuvidas(q); }));
      box.append(b);
    } else if (!user.emailVerified) {
      box.append(el('p', 'n-vazio', 'Confirme o seu e-mail (link que o Firebase enviou) para poder perguntar. Depois recarregue a página.'));
    } else {
      const f = el('form', 'n-novo');
      const nome = el('input'); nome.maxLength = 40; nome.required = true; nome.placeholder = 'Seu primeiro nome'; nome.setAttribute('aria-label', 'Seu primeiro nome');
      try { nome.value = localStorage.getItem(LS_NOME) || String(user.email || '').split('@')[0].replace(/[^A-Za-zÀ-ú]+/g, ' ').trim().split(' ')[0] || ''; } catch (e) { /* sem armazenamento */ }
      const t = el('textarea'); t.maxLength = 600; t.rows = 3; t.required = true; t.setAttribute('aria-label', 'Sua dúvida'); t.placeholder = 'Qual é a sua dúvida sobre esta questão? (mínimo 10 caracteres)';
      const msg = el('div', 'p-msg'); msg.hidden = true; msg.setAttribute('role', 'alert');
      const env = el('button', 'btn principal', 'Enviar dúvida'); env.type = 'submit';
      f.append(nome, t, msg, env);
      f.addEventListener('submit', ev => {
        ev.preventDefault(); msg.hidden = true; env.disabled = true;
        try { localStorage.setItem(LS_NOME, nome.value.trim().slice(0, 40)); } catch (e) { /* ok */ }
        ND.perguntar(q.id, ND.usuario(), { nome: nome.value, texto: t.value }).then(() => pintarDuvidas(q))
          .catch(e => { msg.textContent = e && e.code === 'validacao' ? e.message : ND.erroHumano(e); msg.hidden = false; env.disabled = false; });
      });
      box.append(f);
    }
  }

  /* ---------- minha anotação (só neste aparelho; entra no backup) ---------- */
  const LS_NOTAS = 'cb2_oab_notas';
  let notas = lsLer(LS_NOTAS, {});
  if (!notas || typeof notas !== 'object' || Array.isArray(notas)) notas = {};

  function pintarNota(q){
    const box = $('qNota');
    box.hidden = false; box.textContent = '';
    const tem = Boolean(notas[q.id] && notas[q.id].t);
    const sum = el('summary', null, 'Minha anotação (só você vê)' + (tem ? ' · salva' : ''));
    const ta = el('textarea'); ta.maxLength = 4000; ta.rows = 6; ta.value = tem ? notas[q.id].t : '';
    ta.setAttribute('aria-label', 'Minha anotação sobre esta questão');
    ta.placeholder = 'Anote o que você quer lembrar: pegadinha, artigo, macete. Use a barra para grifar.';
    const status = el('p', 'n-vazio'); status.setAttribute('aria-live', 'polite');
    box.append(sum);
    const ed = window.NormaTexto ? window.NormaTexto.montarEditor(ta) : null;
    if (ed) box.append(ed.barra, ta, ed.titulo, ed.previa); else box.append(ta);
    box.append(status);
    box.open = tem;
    let timer = null;
    ta.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (ta.value.trim()) notas[q.id] = { t: ta.value.slice(0, 4000), ts: Date.now() }; else delete notas[q.id];
        const ok = lsGravar(LS_NOTAS, notas);
        const h = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        status.textContent = ok ? 'Salvo neste aparelho às ' + h + '.' : 'Não consegui salvar (armazenamento cheio ou bloqueado).';
        sum.textContent = 'Minha anotação (só você vê)' + (notas[q.id] ? ' · salva' : '');
      }, 500);
    });
  }

  function registrarDesempenho(q){
    let regs = lsLer(LS_DESEMP, []);
    if (!Array.isArray(regs)) regs = [];
    const d = hoje(), id = 'oab|' + d + '|' + q.disciplina + '|' + (q.assunto || '');
    let r = regs.find(x => x && x.id === id);
    if (!r) { r = { id, d, disc: q.disciplina, ass: (q.assunto || '').slice(0, 60), fonte: 'Norma (OAB)', n: 0, ok: 0, ts: Date.now() }; regs.push(r); }
    r.n += 1; if (progresso[q.id].ok) r.ok += 1;
    lsGravar(LS_DESEMP, regs);
  }

  function responder(letra){
    const q = estado.lista[estado.pos];
    if (atual(q.id)) return;
    const antes = progresso[q.id] || { n: 0 };
    progresso[q.id] = { r: letra, ok: Boolean(q.anulada) || letra === q.gabarito, d: hoje(), n: (antes.n || 0) + 1, vez: antes.vez || 0 };
    // só a primeira resposta de cada questão entra no Painel (refazer não infla o desempenho)
    if (!antes.vez) { progresso[q.id].vez = 1; registrarDesempenho(q); }
    lsGravar(LS_PROG, progresso);
    mostrarResposta(q, letra, false);
    pintarPlacar();
  }

  function ir(delta){
    const nova = estado.pos + delta;
    if (nova < 0 || nova >= estado.lista.length) return;
    estado.pos = nova; pintar();
    $('boxQuestao').scrollIntoView({ block: 'start' });
  }

  /* ---------- eventos ---------- */
  selExame.addEventListener('change', () => abrirExame(selExame.value));
  selDisc.addEventListener('change', aplicarFiltros);
  selFiltro.addEventListener('change', aplicarFiltros);
  $('btnAnterior').addEventListener('click', () => ir(-1));
  $('btnProxima').addEventListener('click', () => ir(1));
  $('btnZerar').addEventListener('click', () => {
    if (!estado.exame || !confirm('Zerar o progresso deste exame? Seu histórico no Painel não é apagado.')) return;
    estado.exame.questoes.forEach(q => limparResposta(q.id));
    lsGravar(LS_PROG, progresso);
    aplicarFiltros();
  });
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target && e.target.tagName;
    if (t === 'SELECT' || t === 'INPUT' || t === 'TEXTAREA') return;
    if ($('boxQuestao').hidden) return;
    const k = e.key.toUpperCase();
    if (/^[A-E]$/.test(k) && estado.lista.length) {
      const q = estado.lista[estado.pos];
      if (letras(q).includes(k) && !atual(q.id)) { e.preventDefault(); responder(k); }
    } else if (e.key === 'ArrowRight') { e.preventDefault(); ir(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); ir(-1); }
  });

  // link direto para uma questão (usado pela lista de professores): oab.html?q=47-001
  function exameDaQuestao(qid){
    const m = /^([A-Za-z0-9]+)-\d+$/.exec(qid || ''); if (!m) return null;
    const cand = 'exame-' + m[1].toLowerCase();
    if (estado.indice.exames.some(x => x.id === cand)) return cand;
    if (/^ETI$/i.test(m[1]) && estado.indice.exames.some(x => x.id === 'norma-etica-profissional')) return 'norma-etica-profissional';
    return null;
  }
  carregarIndice().then(async ok => {
    if (!ok) return;
    let alvoQ = null; try { alvoQ = new URLSearchParams(location.search).get('q'); } catch (e) { /* sem parâmetro */ }
    const ex = alvoQ && exameDaQuestao(alvoQ);
    if (ex) selExame.value = ex;
    await abrirExame(selExame.value);
    if (ex && estado.exame) {
      const i = estado.lista.findIndex(q => q.id === alvoQ);
      if (i >= 0) {
        estado.pos = i; pintar();
        let dv = false; try { dv = new URLSearchParams(location.search).get('dv') === '1'; } catch (e) { /* sem parâmetro */ }
        if (dv && !atual(alvoQ)) { const q = estado.lista[i]; pintarComentarios(q); pintarDuvidas(q); $('qDuvidas').scrollIntoView({ block: 'start' }); }
        else $('boxQuestao').scrollIntoView({ block: 'start' });
      }
    }
  });
})();

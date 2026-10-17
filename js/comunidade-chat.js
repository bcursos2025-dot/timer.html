// ===================== CHAT ANÔNIMO DA COMUNIDADE (cópia da extensão, adaptada ao site) =====================
// Única mudança em relação à extensão: o armazenamento local (abaixo, rmazem) usa o localStorage.
//
// Uma sala só, aberta a todo mundo que usa a extensão. Regras do produto (pedidas):
//   • anônimo: cada instalação ganha um apelido sorteado (Animal + Adjetivo + número) e um id
//     próprio (cbChatId), sem ligação com o id do celular, do ranking nem do grupo;
//   • qualquer pessoa pode apagar qualquer mensagem, e some para todos de forma definitiva;
//   • cada mensagem mostra quando foi enviada e quantas pessoas a viram;
//   • mensagem nova deixa o ícone da comunidade vermelho (ver o aviso em firebase-sync.js e
//     marcarIcone() abaixo).
//
// Dados no Firebase Realtime Database (REST, sem login), em chat/mensagens/{pushId}:
//   { t: texto (1–500), a: apelido, i: id anônimo, ts: horário do SERVIDOR, v: quantas pessoas viram }
// As regras que protegem isso estão em database.rules.json (precisam ser publicadas).
//
// Dados locais (chrome.storage.local):
//   cbChatId, cbChatApelido  → identidade anônima
//   cbChatUltimoVisto        → ts da última mensagem que a pessoa viu (base do "não lida")
//   cbChatNaoLidas           → quantas chegaram depois disso (escrito aqui e por firebase-sync.js)
//   cbChatVistos             → ids que já contei como "vista" (cada pessoa conta uma vez por mensagem)
(function (root) {
    'use strict';

    const FIREBASE = 'https://concurseiro-blindado-default-rtdb.firebaseio.com';
    const MSGS = FIREBASE + '/chat/mensagens';
    const LIMITE_TEXTO = 500;
    const JANELA = 60;             // mensagens carregadas
    const POLL_MS = 4000;          // atualização enquanto a conversa está aberta
    const TTL_DIAS = 30;           // mensagens mais velhas são apagadas por quem enviar a próxima
    const INTERVALO_ENVIO_MS = 2500;
    const MAX_VISTOS = 400;
    const POLL_MAX_MS = 12000;     // sem novidade, o intervalo vai crescendo até aqui
    const CACHE_LISTA = 'cbChatCacheLista';

    // ------------------------------------------------------------------ funções puras (testadas em Node)
    const ANIMAIS = ['Coruja', 'Falcão', 'Tartaruga', 'Formiga', 'Águia', 'Leão', 'Lobo', 'Golfinho', 'Tigre', 'Urso', 'Raposa', 'Gavião'];
    const ADJETIVOS = ['Dedicado', 'Focado', 'Persistente', 'Determinado', 'Disciplinado', 'Constante', 'Aplicado', 'Estudioso', 'Resiliente', 'Concentrado', 'Motivado', 'Incansável'];

    function apelidoAleatorio(rnd) {
        rnd = rnd || Math.random;
        const a = ANIMAIS[Math.floor(rnd() * ANIMAIS.length)];
        const b = ADJETIVOS[Math.floor(rnd() * ADJETIVOS.length)];
        return `${a} ${b} #${10 + Math.floor(rnd() * 90)}`;
    }
    function iniciais(apelido) {
        const p = String(apelido || '').split(' ');
        return ((p[0] || '?')[0] + ((p[1] || '')[0] || '')).toUpperCase();
    }
    function hashTexto(s) {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return h;
    }
    const matiz = (id) => hashTexto(String(id || '')) % 360;

    const pad = (n) => String(n).padStart(2, '0');
    const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const mesmoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    // "agora" · "há 5 min" · "14:32" (hoje) · "ontem 14:32" · "12 out 14:32"
    function fmtQuando(ts, agora) {
        const d = new Date(ts), n = agora ? new Date(agora) : new Date();
        const dif = n - d;
        if (dif < 45 * 1000) return 'agora';
        if (dif < 60 * 60 * 1000 && dif >= 0) return `há ${Math.max(1, Math.round(dif / 60000))} min`;
        const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        if (mesmoDia(d, n)) return hm;
        const ontem = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1);
        if (mesmoDia(d, ontem)) return `ontem ${hm}`;
        return `${d.getDate()} ${MESES[d.getMonth()]} ${hm}`;
    }
    function fmtDiaSeparador(ts, agora) {
        const d = new Date(ts), n = agora ? new Date(agora) : new Date();
        if (mesmoDia(d, n)) return 'Hoje';
        if (mesmoDia(d, new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1))) return 'Ontem';
        return `${d.getDate()} de ${MESES[d.getMonth()]}`;
    }
    function fmtCompleto(ts) {
        const d = new Date(ts);
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    function textoVisto(n) { return n === 0 ? 'Ninguém viu ainda' : n === 1 ? 'Visto por 1 pessoa' : `Visto por ${n} pessoas`; }

    // Objeto do Firebase { id: {t,a,i,ts,v} } → lista ordenada (os ids do push são cronológicos), sem lixo.
    function ordenarMensagens(obj) {
        if (!obj || typeof obj !== 'object') return [];
        return Object.keys(obj).sort()
            .map((id) => ({ id, ...obj[id] }))
            .filter((m) => m && typeof m.t === 'string' && m.t.length > 0 && typeof m.ts === 'number')
            .map((m) => ({ id: m.id, t: m.t, a: String(m.a || 'Anônimo'), i: String(m.i || ''), ts: m.ts, v: Math.max(0, +m.v || 0) }));
    }
    function contarNaoLidas(msgs, ultimoVisto, meuId) {
        return (msgs || []).filter((m) => m.ts > (ultimoVisto || 0) && m.i !== meuId).length;
    }
    // Texto que a pessoa digitou → texto a enviar (ou '' se não vale). Limita tamanho e linhas em branco.
    function limparTexto(s) {
        return String(s == null ? '' : s).replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, LIMITE_TEXTO);
    }
    // Quais mensagens antigas apagar (as mais velhas que o TTL, só entre as primeiras do banco).
    function idsParaPodar(obj, agora, ttlDias) {
        const corte = (agora || Date.now()) - (ttlDias || TTL_DIAS) * 86400000;
        return ordenarMensagens(obj).filter((m) => m.ts < corte).map((m) => m.id);
    }

    // ------------------------------------------------------------------ rede
    async function http(url, opts, prazoMs) {
        // Prazo (10 s por padrão): sem ele, uma rede lenta deixa a conversa parada em "Carregando…".
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), prazoMs || 10000);
        let r;
        try { r = await fetch(url, Object.assign({}, opts, { signal: ctl.signal })); } finally { clearTimeout(t); }
        if (!r.ok && r.status !== 304) {
            const e = new Error('chat_http_' + r.status);
            e.status = r.status;
            throw e;
        }
        return r;
    }
    const URL_LISTA = `${MSGS}.json?orderBy=%22%24key%22&limitToLast=${JANELA}`;

    // O Firebase NÃO aceita ETag junto com filtros (orderBy/limitToLast): responde 400 "Mixing querying parameters and ETag requests
    // is not supported", e o chat ficava eternamente em "Sem conexão". Por isso a lista (no máximo JANELA mensagens, pouco texto) é
    // pedida inteira e comparada com a anterior; `etag` guarda o texto da última resposta.
    async function carregar(anterior, textoPronto) {
        const texto = textoPronto != null ? textoPronto : await (await http(URL_LISTA)).text();
        if (anterior != null && texto === anterior) return { mudou: false, etag: anterior };
        return { mudou: true, etag: texto, msgs: ordenarMensagens(texto ? JSON.parse(texto) : null) };
    }
    // Pedido adiantado: quem abre a folha já dispara a busca da lista, em paralelo com a leitura do armazenamento local.
    let adiantado = null;
    function prefetch() {
        if (adiantado && Date.now() - adiantado.em < 15000) return adiantado.p;
        const p = http(URL_LISTA).then((r) => r.text());
        adiantado = { p, em: Date.now() };
        p.catch(() => { if (adiantado && adiantado.p === p) adiantado = null; });
        return p;
    }
    // Última lista vista (localStorage é síncrono e rápido; o chrome.storage no Firefox pode demorar).
    function lerCache() { try { return root.localStorage ? root.localStorage.getItem(CACHE_LISTA) : null; } catch (e) { return null; } }
    function gravarCache(txt) { try { if (root.localStorage) root.localStorage.setItem(CACHE_LISTA, txt); } catch (e) { /* cheio/bloqueado: sem cache */ } }

    async function enviarMensagem(t, a, i) {
        // 25 s: a gravação costuma chegar ao servidor mesmo quando a resposta demora; abortar cedo dava "erro" com a mensagem já enviada.
        const r = await http(`${MSGS}.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ t, a, i, ts: { '.sv': 'timestamp' }, v: 0 }),
        }, 25000);
        return (await r.json()).name;
    }
    const apagarMensagem = (id) => http(`${MSGS}/${encodeURIComponent(id)}.json`, { method: 'DELETE' });
    const contarVista = (id) => http(`${MSGS}/${encodeURIComponent(id)}/v.json`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ '.sv': { increment: 1 } }),
    });
    // Limpeza de quem acabou de enviar: apaga (no máximo 20) mensagens mais velhas que o TTL.
    async function podarAntigas() {
        const r = await http(`${MSGS}.json?orderBy=%22%24key%22&limitToFirst=20`);
        const ids = idsParaPodar(await r.json());
        for (const id of ids) { try { await apagarMensagem(id); } catch (e) { /* tenta na próxima */ } }
        return ids.length;
    }

    // ------------------------------------------------------------------ armazenamento local
    // No site o armazenamento é o localStorage do navegador (na extensão era chrome.storage).
    const armazem = {
        ler: (chaves) => {
            const o = {};
            (Array.isArray(chaves) ? chaves : [chaves]).forEach((k) => {
                try { const v = root.localStorage.getItem('cb2_' + k); if (v != null) o[k] = JSON.parse(v); } catch (e) { /* ignora */ }
            });
            return Promise.resolve(o);
        },
        gravar: (obj) => {
            Object.keys(obj).forEach((k) => { try { root.localStorage.setItem('cb2_' + k, JSON.stringify(obj[k])); } catch (e) { /* cheio/bloqueado */ } });
            return Promise.resolve();
        },
    };    async function identidade() {
        const r = await armazem.ler(['cbChatId', 'cbChatApelido']);
        if (r.cbChatId && r.cbChatApelido) return { id: r.cbChatId, apelido: r.cbChatApelido };
        const nova = { cbChatId: 'ch_' + (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()), cbChatApelido: apelidoAleatorio() };
        await armazem.gravar(nova);
        return { id: nova.cbChatId, apelido: nova.cbChatApelido };
    }

    // ------------------------------------------------------------------ ícone vermelho (botão da comunidade)
    function marcarIcone(n) {
        const btn = typeof document !== 'undefined' && document.getElementById('btn-comunidade');
        if (!btn) return;
        btn.classList.toggle('tem-novas', n > 0);
        btn.title = n > 0 ? `Comunidade: ${n} mensagem${n === 1 ? '' : 's'} nova${n === 1 ? '' : 's'}` : 'Comunidade';
        btn.setAttribute('aria-label', btn.title);
    }
    function ligarIcone() {
        if (typeof chrome === 'undefined' || !chrome.storage) return;
        chrome.storage.local.get(['cbChatNaoLidas'], (r) => marcarIcone((r && r.cbChatNaoLidas) || 0));
        chrome.storage.onChanged.addListener((mud, area) => {
            if (area === 'local' && mud.cbChatNaoLidas) marcarIcone(mud.cbChatNaoLidas.newValue || 0);
        });
        // Pede ao service worker para olhar agora (o alarme dele só roda de minuto em minuto).
        try { chrome.runtime.sendMessage({ action: 'cbChatChecar' }, () => void chrome.runtime.lastError); } catch (e) { /* sem background (teste) */ }
    }

    // ------------------------------------------------------------------ tela
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const SVG_OLHO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
    const SVG_LIXO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
    const SVG_ENVIAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';

    let estado = null; // { alvo, eu, msgs, etag, timer, visto:Set, ultimoEnvio, parado }

    function elMensagem(m, eu) {
        const minha = m.i === eu.id;
        const el = document.createElement('div');
        el.className = 'chat-msg' + (minha ? ' chat-msg--minha' : '') + (m.enviando ? ' chat-msg--enviando' : '');
        el.dataset.id = m.id;
        el.innerHTML = `
            ${minha ? '' : `<span class="chat-av" style="--h:${matiz(m.i)}" aria-hidden="true">${esc(iniciais(m.a))}</span>`}
            <div class="chat-corpo">
                ${minha ? '' : `<span class="chat-autor">${esc(m.a)}</span>`}
                <div class="chat-balao">${esc(m.t)}</div>
                <div class="chat-meta">
                    <time datetime="${new Date(m.ts).toISOString()}" title="${esc(fmtCompleto(m.ts))}">${esc(fmtQuando(m.ts))}</time>
                    <span class="chat-vistas" title="${esc(textoVisto(m.v))}">${SVG_OLHO}<span class="chat-vistas-n">${m.v}</span></span>
                    <button type="button" class="chat-apagar" data-acao="apagar" title="Apagar para todos" aria-label="Apagar mensagem">${SVG_LIXO}</button>
                </div>
            </div>`;
        return el;
    }

    function pintar(forcarRolagem) {
        const lista = estado.alvo.querySelector('.chat-lista');
        const perto = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 80;
        const existentes = new Map([...lista.querySelectorAll('.chat-msg')].map((e) => [e.dataset.id, e]));
        const vivos = new Set(estado.msgs.map((m) => m.id));
        existentes.forEach((el, id) => { if (!vivos.has(id)) el.remove(); });          // apagada por alguém
        lista.querySelectorAll('.chat-dia').forEach((e) => e.remove());
        let diaAnterior = null;
        let cursor = null;
        estado.msgs.forEach((m) => {
            let el = existentes.get(m.id);
            if (!el) el = elMensagem(m, estado.eu);
            else {
                el.querySelector('.chat-vistas-n').textContent = m.v;
                el.querySelector('.chat-vistas').title = textoVisto(m.v);
                el.querySelector('time').textContent = fmtQuando(m.ts);
            }
            const dia = new Date(m.ts).toDateString();
            if (dia !== diaAnterior) {
                const sep = document.createElement('div');
                sep.className = 'chat-dia';
                sep.textContent = fmtDiaSeparador(m.ts);
                lista.insertBefore(sep, cursor ? cursor.nextSibling : lista.firstChild);
                cursor = sep;
                diaAnterior = dia;
            }
            const alvoPos = cursor.nextSibling;
            if (el !== alvoPos) lista.insertBefore(el, alvoPos);
            cursor = el;
        });
        estado.alvo.querySelector('.chat-vazio').hidden = estado.msgs.length > 0;
        if (forcarRolagem || perto) lista.scrollTop = lista.scrollHeight;
    }

    function mostrarAviso(texto) {
        const av = estado && estado.alvo.querySelector('.chat-aviso');
        if (!av) return;
        av.hidden = !texto;
        av.textContent = texto || '';
    }
    function mensagemDeErro(e) {
        if (e && (e.status === 401 || e.status === 403)) return 'O chat ainda não foi liberado no servidor. Quem mantém a extensão precisa publicar as regras do Firebase (database.rules.json).';
        return 'Sem conexão com a conversa agora. Tentando de novo…';
    }

    // Conta, uma única vez por pessoa, as mensagens de OUTROS que acabaram de aparecer na tela.
    async function contarVistas() {
        const novas = estado.msgs.filter((m) => m.i !== estado.eu.id && !estado.visto.has(m.id)).slice(0, 25);
        if (!novas.length) return;
        novas.forEach((m) => { estado.visto.add(m.id); m.v += 1; });                 // otimista
        const lista = [...estado.visto].slice(-MAX_VISTOS);
        armazem.gravar({ cbChatVistos: lista });
        pintar(false);
        for (const m of novas) { try { await contarVista(m.id); } catch (e) { /* sem rede: não conta */ } }
    }

    async function atualizar(primeira, pedidoAdiantado) {
        if (!estado || estado.parado) return;
        try {
            const r = await carregar(estado.etag, pedidoAdiantado ? await pedidoAdiantado : undefined);
            if (!estado || estado.parado) return;
            mostrarAviso('');
            if (r.mudou) {
                estado.etag = r.etag;
                estado.msgs = r.msgs.concat(estado.pendentes);
                gravarCache(r.etag);
                estado.espera = POLL_MS;
                pintar(primeira);
            } else {
                estado.espera = Math.min(Math.round(estado.espera * 1.5), POLL_MAX_MS);
            }
            const maxTs = estado.msgs.reduce((x, m) => (m.enviando ? x : Math.max(x, m.ts)), 0);
            // Só grava quando mudou: cada gravação no chrome.storage é cara no Firefox e atrasava as próximas leituras.
            if (maxTs && maxTs !== estado.vistoGravado) {
                estado.vistoGravado = maxTs;
                armazem.gravar({ cbChatUltimoVisto: maxTs, cbChatNaoLidas: 0 });
            }
            marcarIcone(0);
            if (r.mudou) contarVistas();
        } catch (e) {
            mostrarAviso(mensagemDeErro(e));
        }
        if (primeira && estado) estado.alvo.querySelector('.chat-carregando').hidden = true;
    }

    function agendar() {
        if (!estado || estado.parado) return;
        estado.timer = setTimeout(async () => {
            if (!estado || estado.parado) return;
            if (!estado.alvo.isConnected) { parar(); return; }
            if (!document.hidden) await atualizar(false);
            agendar();
        }, estado.espera);
    }

    // A resposta do envio pode se perder (rede lenta) com a mensagem já gravada: confere na lista antes de dizer que falhou.
    async function jaFoiGravada(texto, meuId, desde) {
        const r = await carregar(null);
        return r.msgs.some((m) => m.i === meuId && m.t === texto && m.ts >= desde - 120000);
    }

    async function enviar() {
        const campo = estado.alvo.querySelector('.chat-campo');
        const botao = estado.alvo.querySelector('.chat-enviar');
        const texto = limparTexto(campo.value);
        if (!texto) return;
        const espera = INTERVALO_ENVIO_MS - (Date.now() - estado.ultimoEnvio);
        if (espera > 0) { mostrarAviso(`Calma, espere ${Math.ceil(espera / 1000)} s para enviar outra.`); return; }
        // Otimista: a mensagem aparece na hora (esmaecida) e o campo já fica livre.
        const pend = { id: 'tmp_' + Date.now(), t: texto, a: estado.eu.apelido, i: estado.eu.id, ts: Date.now(), v: 0, enviando: true };
        estado.pendentes.push(pend);
        estado.msgs = estado.msgs.concat([pend]);
        estado.ultimoEnvio = Date.now();
        campo.value = '';
        campo.style.height = '';
        botao.disabled = true;
        mostrarAviso('');
        pintar(true);
        campo.focus();
        const concluir = () => {
            estado.pendentes = estado.pendentes.filter((p) => p !== pend);
            estado.etag = null;
            estado.espera = POLL_MS;
            const lista = atualizar(true);
            if (Math.random() < 0.2) podarAntigas().catch(() => {});
            return lista;
        };
        try {
            await enviarMensagem(texto, estado.eu.apelido, estado.eu.id);
            await concluir();
        } catch (e) {
            let gravada = false;
            const recusado = e && (e.status === 401 || e.status === 403 || e.status === 400);
            if (!recusado) { try { gravada = await jaFoiGravada(texto, estado.eu.id, pend.ts); } catch (e2) { /* sem rede de verdade */ } }
            if (!estado) return;
            if (gravada) { await concluir(); return; }
            estado.pendentes = estado.pendentes.filter((p) => p !== pend);
            estado.msgs = estado.msgs.filter((m) => m !== pend);
            pintar(false);
            if (!campo.value) { campo.value = texto; botao.disabled = false; }   // devolve o texto para tentar de novo
            mostrarAviso(e && (e.status === 401 || e.status === 403) ? mensagemDeErro(e) : 'Não consegui enviar. Confira a internet e tente de novo.');
        }
    }

    function aoClicar(ev) {
        const bt = ev.target.closest('[data-acao]');
        if (!bt) return;
        const msg = bt.closest('.chat-msg');
        const meta = msg && msg.querySelector('.chat-meta');
        const acao = bt.dataset.acao;
        if (acao === 'apagar') {
            // Apagar some para TODOS e não tem volta: pede confirmação no próprio lugar.
            meta.dataset.antes = meta.innerHTML;
            meta.innerHTML = '<span class="chat-conf">Apagar para todos?</span><button type="button" class="chat-btn chat-btn--ruim" data-acao="apagar-sim">Apagar</button><button type="button" class="chat-btn" data-acao="apagar-nao">Cancelar</button>';
        } else if (acao === 'apagar-nao') {
            meta.innerHTML = meta.dataset.antes;
        } else if (acao === 'apagar-sim') {
            const id = msg.dataset.id;
            msg.classList.add('chat-msg--saindo');
            apagarMensagem(id).then(() => {
                estado.msgs = estado.msgs.filter((m) => m.id !== id);
                estado.etag = null;
                pintar(false);
            }).catch((e) => {
                msg.classList.remove('chat-msg--saindo');
                meta.innerHTML = meta.dataset.antes || '';
                mostrarAviso(e && (e.status === 401 || e.status === 403) ? mensagemDeErro(e) : 'Não consegui apagar agora. Tente de novo.');
            });
        } else if (acao === 'novo-apelido') {
            const novo = apelidoAleatorio();
            estado.eu.apelido = novo;
            armazem.gravar({ cbChatApelido: novo });
            estado.alvo.querySelector('.chat-eu b').textContent = novo;
        }
    }

    // Monta a conversa dentro de `alvo` (elemento vazio) e começa a atualizar.
    async function montar(alvo) {
        parar();
        alvo.innerHTML = `
            <div class="chat">
                <div class="chat-eu">Você aparece como <b></b><button type="button" class="chat-link" data-acao="novo-apelido">trocar</button></div>
                <div class="chat-lista" role="log" aria-live="polite">
                    <p class="chat-carregando">Carregando a conversa…</p>
                    <div class="chat-vazio" hidden><b>Nenhuma mensagem ainda</b><span>Seja a primeira pessoa a escrever. Ninguém vê seu nome.</span></div>
                </div>
                <div class="chat-aviso" role="status" hidden></div>
                <form class="chat-form" autocomplete="off">
                    <textarea class="chat-campo" rows="1" maxlength="${LIMITE_TEXTO}" placeholder="Mensagem anônima" aria-label="Mensagem"></textarea>
                    <button type="submit" class="chat-enviar" aria-label="Enviar" disabled>${SVG_ENVIAR}</button>
                </form>
            </div>`;
        const pedido = prefetch();              // a rede começa já, junto com as leituras locais abaixo
        pedido.catch(() => {});
        const [eu, salvo] = await Promise.all([identidade(), armazem.ler(['cbChatVistos'])]);
        estado = { alvo, eu, msgs: [], etag: null, timer: null, visto: new Set(salvo.cbChatVistos || []), ultimoEnvio: 0, parado: false, pendentes: [], espera: POLL_MS, vistoGravado: 0 };
        alvo.querySelector('.chat-eu b').textContent = eu.apelido;
        alvo.addEventListener('click', aoClicar);
        const campo = alvo.querySelector('.chat-campo'), botao = alvo.querySelector('.chat-enviar');
        let ajusteAgendado = false;
        campo.addEventListener('input', () => {
            botao.disabled = !limparTexto(campo.value);
            // Mede a altura uma vez por quadro (e não a cada tecla): ler scrollHeight força o layout da página inteira.
            if (ajusteAgendado) return;
            ajusteAgendado = true;
            requestAnimationFrame(() => {
                ajusteAgendado = false;
                campo.style.height = 'auto';
                campo.style.height = Math.min(96, campo.scrollHeight) + 'px';
            });
        });
        campo.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!botao.disabled) enviar(); }
        });
        alvo.querySelector('.chat-form').addEventListener('submit', (e) => { e.preventDefault(); enviar(); });
        // Mostra na hora a última conversa vista; a rede atualiza por cima.
        const cache = lerCache();
        if (cache) {
            try {
                estado.msgs = ordenarMensagens(JSON.parse(cache));
                estado.etag = cache;
                pintar(true);
                alvo.querySelector('.chat-carregando').hidden = true;
            } catch (e) { estado.msgs = []; estado.etag = null; }
        }
        await atualizar(true, pedido);
        agendar();
    }

    function parar() {
        if (estado) { estado.parado = true; clearTimeout(estado.timer); }
        estado = null;
    }

    const api = {
        // puras
        apelidoAleatorio, iniciais, matiz, fmtQuando, fmtDiaSeparador, fmtCompleto, textoVisto, ordenarMensagens,
        contarNaoLidas, limparTexto, idsParaPodar, LIMITE_TEXTO, TTL_DIAS,
        // com rede / tela
        montar, parar, prefetch, marcarIcone, ligarIcone, carregar, enviarMensagem, apagarMensagem, contarVista, podarAntigas,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        root.CBChat = api;
        ligarIcone();
    }
})(typeof window !== 'undefined' ? window : globalThis);

// =====================================================================
// CRONÔMETRO DE LEITURA — conta tempo por página enquanto a aba está
// visível e em foco (pausa sozinho se você troca de aba, minimiza, ou
// bloqueia o celular), e manda os números pro MESMO Firebase que a
// extensão já usa pro pareamento (dados-config/firebase-sync.js no lado
// da extensão) — sem precisar carregar o SDK inteiro do Firebase aqui,
// só `fetch` na API REST, igual custom/github-sync.js já faz.
//
// Identidade do aparelho: lida do MESMO localStorage que o site usa
// (chave "cb_deviceId" — ver LS.deviceId no arquivo do site). Como o
// leitor e o site moram no mesmo domínio do GitHub Pages, o localStorage
// é compartilhado automaticamente: pareou o celular (ou até o próprio
// PC) uma vez no site, o leitor já reconhece o mesmo deviceId sem
// nenhuma configuração extra.
//
// Sem pareamento, o cronômetro continua funcionando (salva só no
// localStorage deste navegador) — só não aparece no histórico da
// extensão nem sincroniza entre aparelhos, até você parear.
// =====================================================================
(function () {
  "use strict";

  const CB_FIREBASE_URL = "https://concurseiro-blindado-default-rtdb.firebaseio.com";
  const LS_DEVICE_KEY = "cb_deviceId";
  const LS_LOCAL_PREFIX = "pdfLeitura:"; // + pdfId, guarda uma cópia local sempre, pareado ou não

  const TICK_MS = 1000;        // granularidade da contagem
  const FLUSH_MS = 15000;      // de quanto em quanto tempo manda pro Firebase
  const PAGINA_LIDA_MIN_MS = 4000; // dwell mínimo pra contar a página como "lida" (evita inflar só de passar rápido procurando algo)

  function hojeChave() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function lerDeviceId() {
    try { return localStorage.getItem(LS_DEVICE_KEY) || null; } catch { return null; }
  }

  function lerLocal(pdfId) {
    try {
      const bruto = localStorage.getItem(LS_LOCAL_PREFIX + pdfId);
      return bruto ? JSON.parse(bruto) : null;
    } catch { return null; }
  }
  function salvarLocal(pdfId, dados) {
    try { localStorage.setItem(LS_LOCAL_PREFIX + pdfId, JSON.stringify(dados)); } catch { /* storage indisponível — segue só em memória */ }
  }

  async function firebaseGet(path) {
    try {
      const res = await fetch(`${CB_FIREBASE_URL}/${path}.json`);
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  // PUT em vez de PATCH de propósito: cada chamada já manda o estado
  // MESCLADO por inteiro (baseline lido uma vez no início da sessão +
  // tudo que essa sessão somou), então é seguro repetir sem "somar
  // duas vezes". Isso evita ter que fazer leitura+escrita atômica a
  // cada 15s só pra incrementar um número — troca-off consciente: se
  // duas sessões da MESMA pessoa estiverem ativas ao mesmo tempo em
  // dois aparelhos (raro, num app de uso pessoal), a que salvar por
  // último pode "pisar" em alguns segundos da outra. Pra uma métrica de
  // tempo de estudo (não um saldo financeiro), essa margem de erro é
  // aceitável — ver mesma lógica de trade-off documentada em
  // dados-config/firebase-sync.js.
  async function firebasePut(path, valor) {
    try {
      await fetch(`${CB_FIREBASE_URL}/${path}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valor),
        keepalive: true, // deixa a requisição terminar mesmo se a aba fechar logo em seguida
      });
    } catch { /* sem internet agora — os dados continuam seguros no localStorage */ }
  }

  class LeitorDeTempo {
    constructor({ pdfId, nome, totalPaginas, onAtualizar }) {
      this.pdfId = pdfId;
      this.nome = nome || pdfId;
      this.totalPaginas = totalPaginas || null;
      this.onAtualizar = onAtualizar || function () {};
      this.deviceId = lerDeviceId();

      this.paginaAtual = null;
      this.sessaoPorPagina = {};   // { [pagina]: msAcumuladoNestaSessao }
      this.sessaoMsTotal = 0;

      // "baseline" = o que já existia (local + remoto) antes desta sessão
      // começar; tudo que a sessão soma é somado EM CIMA disso, nunca
      // sobrescreve. remoteHoje / remotePdf só existem se estiver pareado.
      this.baseLocal = lerLocal(pdfId) || { paginas: {}, tempoTotalMs: 0, ultimaPagina: null };
      this.baseRemotoPdf = null;
      this.baseRemotoHoje = null;

      this._tickTimer = null;
      this._flushTimer = null;
      this._destruido = false;

      this._iniciar();
    }

    async _iniciar() {
      if (this.deviceId) {
        const [pdfRemoto, hojeRemoto] = await Promise.all([
          firebaseGet(`dispositivos/${this.deviceId}/leituraPdf/porPdf/${this.pdfId}`),
          firebaseGet(`dispositivos/${this.deviceId}/leituraPdf/historicoDiario/${hojeChave()}`),
        ]);
        this.baseRemotoPdf = pdfRemoto || { nome: this.nome, totalPaginas: this.totalPaginas, tempoTotalMs: 0, paginas: {} };
        this.baseRemotoHoje = hojeRemoto || { msLido: 0, pdfs: {} };
      }

      this._tickTimer = setInterval(() => this._tick(), TICK_MS);
      this._flushTimer = setInterval(() => this._flush(), FLUSH_MS);

      // Pausa/retoma sozinho sem precisar de lógica espalhada — o próprio
      // _tick já confere estaAtivo() a cada segundo, então só precisamos
      // garantir que um flush aconteça ao esconder/fechar, pra não perder
      // os últimos segundos contados.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") this._flush();
      });
      window.addEventListener("pagehide", () => this._flush());
      window.addEventListener("beforeunload", () => this._flush());
    }

    definirTotalPaginas(n) {
      if (n && !this.totalPaginas) this.totalPaginas = n;
    }

    mudarPagina(numeroPagina) {
      this.paginaAtual = numeroPagina;
    }

    _estaAtivo() {
      return document.visibilityState === "visible" && document.hasFocus() && !!this.paginaAtual;
    }

    _tick() {
      if (this._destruido || !this._estaAtivo()) return;
      const p = this.paginaAtual;
      this.sessaoPorPagina[p] = (this.sessaoPorPagina[p] || 0) + TICK_MS;
      this.sessaoMsTotal += TICK_MS;
      this.onAtualizar(this._resumoAtual());
    }

    _resumoAtual() {
      const paginasVistas = new Set([
        ...Object.keys(this.baseLocal.paginas || {}),
        ...Object.keys(this.sessaoPorPagina),
      ]);
      const tempoTotalMs = (this.baseLocal.tempoTotalMs || 0) + this.sessaoMsTotal;
      const mediaPorPaginaMs = paginasVistas.size ? Math.round(tempoTotalMs / paginasVistas.size) : 0;
      return {
        pdfId: this.pdfId,
        tempoTotalMs,
        paginasVistas: paginasVistas.size,
        mediaPorPaginaMs,
        paginaAtual: this.paginaAtual,
        totalPaginas: this.totalPaginas,
      };
    }

    async _flush() {
      if (this._destruido) return;

      // ---- Mescla com o que já existia localmente e regrava sempre ----
      const paginasMescladas = { ...(this.baseLocal.paginas || {}) };
      for (const [pag, ms] of Object.entries(this.sessaoPorPagina)) {
        paginasMescladas[pag] = (paginasMescladas[pag] || 0) + ms;
      }
      const localNovo = {
        nome: this.nome,
        totalPaginas: this.totalPaginas,
        paginas: paginasMescladas,
        tempoTotalMs: (this.baseLocal.tempoTotalMs || 0) + this.sessaoMsTotal,
        ultimaPagina: this.paginaAtual,
        ultimaLeituraEm: Date.now(),
      };
      salvarLocal(this.pdfId, localNovo);

      if (!this.deviceId || !this.baseRemotoPdf) return; // sem pareamento — só local mesmo

      // ---- Nó por-PDF (tempo total, páginas, última leitura) ----
      const paginasRemotoMescladas = { ...(this.baseRemotoPdf.paginas || {}) };
      for (const [pag, ms] of Object.entries(this.sessaoPorPagina)) {
        paginasRemotoMescladas[pag] = (paginasRemotoMescladas[pag] || 0) + ms;
      }
      const remotoPdfNovo = {
        nome: this.nome,
        totalPaginas: this.totalPaginas || this.baseRemotoPdf.totalPaginas || null,
        paginas: paginasRemotoMescladas,
        tempoTotalMs: (this.baseRemotoPdf.tempoTotalMs || 0) + this.sessaoMsTotal,
        ultimaPagina: this.paginaAtual,
        ultimaLeituraEm: Date.now(),
      };

      // ---- Nó do dia (pra "quantas páginas eu li hoje" e o histórico
      //      dia/semana/mês, cruzando todos os PDFs do dia) ----
      const chaveHoje = hojeChave();
      // Se a sessão atravessou a meia-noite, o que sobrar depois disso
      // some do "hoje" (fica só registrado no nó por-PDF) — caso raro
      // o bastante pra não valer a complexidade de dividir a sessão.
      const diaBase = this.baseRemotoHoje && this._chaveHojeNoInicio === chaveHoje ? this.baseRemotoHoje : { msLido: 0, pdfs: {} };
      if (!this._chaveHojeNoInicio) this._chaveHojeNoInicio = chaveHoje;

      const pdfsDoDia = { ...(diaBase.pdfs || {}) };
      const paginasLidasHojeSet = new Set(pdfsDoDia[this.pdfId]?.paginasLidas || []);
      for (const [pag, ms] of Object.entries(this.sessaoPorPagina)) {
        const totalDaPaginaHoje = (pdfsDoDia[this.pdfId]?.msPorPagina?.[pag] || 0) + ms;
        if (totalDaPaginaHoje >= PAGINA_LIDA_MIN_MS) paginasLidasHojeSet.add(Number(pag));
      }
      const msPorPaginaHoje = { ...(pdfsDoDia[this.pdfId]?.msPorPagina || {}) };
      for (const [pag, ms] of Object.entries(this.sessaoPorPagina)) {
        msPorPaginaHoje[pag] = (msPorPaginaHoje[pag] || 0) + ms;
      }
      pdfsDoDia[this.pdfId] = {
        nome: this.nome,
        ms: (pdfsDoDia[this.pdfId]?.ms || 0) + this.sessaoMsTotal,
        paginasLidas: Array.from(paginasLidasHojeSet).sort((a, b) => a - b),
        msPorPagina: msPorPaginaHoje,
      };
      const remotoHojeNovo = {
        msLido: (diaBase.msLido || 0) + this.sessaoMsTotal,
        pdfs: pdfsDoDia,
        atualizadoEm: Date.now(),
      };

      await Promise.all([
        firebasePut(`dispositivos/${this.deviceId}/leituraPdf/porPdf/${this.pdfId}`, remotoPdfNovo),
        firebasePut(`dispositivos/${this.deviceId}/leituraPdf/historicoDiario/${chaveHoje}`, remotoHojeNovo),
      ]);
    }

    destruir() {
      this._flush();
      clearInterval(this._tickTimer);
      clearInterval(this._flushTimer);
      this._destruido = true;
    }
  }

  window.CBLeitorDeTempo = LeitorDeTempo;
})();

// Classic script, runs after viewer.mjs has defined window.PDFViewerApplication.
// Uses pdf.js's own documented extension points (`webviewerloaded` +
// `initializedPromise`) instead of patching their bundle, so upgrading to a
// newer pdf.js release later is just "re-run the build, keep this folder."
(function () {
  "use strict";

  function toast(message, opts) {
    opts = opts || {};
    const el = document.createElement("div");
    el.className = "customToast" + (opts.error ? " error" : "");
    el.textContent = message;
    const container = document.getElementById("customToasts");
    container.appendChild(el);
    setTimeout(() => el.remove(), opts.duration || 3200);
  }

  const supportsFSAccess = "showOpenFilePicker" in window;
  let fileHandle = null; // set only when the file was opened via File System Access
  let autosaveTimer = null;
  const AUTOSAVE_DELAY_MS = 1500;

  // ---------------------------------------------------------------
  // Parâmetros da URL — é assim que a Biblioteca (site ou este mesmo
  // leitor) diz "abre ESTE arquivo do GitHub, com ESTE id de leitura".
  // Ex.: viewer.html?ghpath=_biblioteca/pdfs/lei-8112-ab12cd.pdf&pdfid=lei-8112-ab12cd&pdfnome=Lei%208.112
  // Sem esses parâmetros o leitor funciona exatamente como antes
  // (abrir local / arrastar e soltar), só sem vínculo com a Biblioteca.
  // ---------------------------------------------------------------
  const parametros = new URLSearchParams(window.location.search);
  const ghPathAlvo = parametros.get("ghpath");
  const pdfIdAlvo = parametros.get("pdfid");
  const pdfNomeAlvo = parametros.get("pdfnome");

  function slugArquivo(nome) {
    return (nome || "documento")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/\.pdf$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
      .slice(0, 60) || "documento";
  }

  async function main() {
    await window.PDFViewerApplication.initializedPromise;
    const app = window.PDFViewerApplication;

    // ---------------------------------------------------------------
    // GitHub sync
    // ---------------------------------------------------------------
    const gh = new window.CustomGithubSync({
      onToast: toast,
      onStatusChange: (status, message) => {
        const badge = document.getElementById("customSyncBadge");
        badge.className = "toolbarButton customSyncBadge state-" + status;
        badge.title = message;
      },
    });

    // Caminho no GitHub pra onde o "Salvar" deve mandar as alterações
    // deste documento. Quando veio da Biblioteca (?ghpath=...), é esse
    // caminho fixo — nunca o `gh.config.path` genérico (que é só do
    // modo antigo "um arquivo só"). Assim, vários PDFs da Biblioteca
    // compartilham o mesmo token/repo sem pisarem uns nos outros.
    let caminhoGithubAtual = ghPathAlvo || null;

    // ---------------------------------------------------------------
    // Cronômetro de leitura (custom/reading-tracker.js) — sempre ativo,
    // mesmo sem GitHub configurado (fica só local até você parear).
    // ---------------------------------------------------------------
    let leitorDeTempo = null;
    function iniciarLeitorDeTempo() {
      leitorDeTempo?.destruir();
      const id = pdfIdAlvo || `avulso-${slugArquivo(app._docFilename || "documento")}`;
      leitorDeTempo = new window.CBLeitorDeTempo({
        pdfId: id,
        nome: pdfNomeAlvo || app._docFilename || "Documento",
        totalPaginas: app.pagesCount || null,
        onAtualizar: atualizarBadgeLeitura,
      });
    }
    function atualizarBadgeLeitura(resumo) {
      const badge = document.getElementById("customReadingBadge");
      if (!badge) return;
      const min = Math.floor(resumo.tempoTotalMs / 60000);
      badge.title = `Tempo neste PDF: ${min} min · média ${Math.round(resumo.mediaPorPaginaMs / 1000)}s por página`;
      badge.querySelector(".customReadingBadgeText").textContent = `${min} min`;
    }
    app.eventBus.on("documentloaded", () => {
      iniciarLeitorDeTempo();
      // Assim que sabemos o total de páginas, guarda no manifesto da
      // Biblioteca (só se esse PDF veio de lá e ainda não tinha esse
      // dado) — é "melhor esforço": se falhar, a leitura continua
      // funcionando normalmente, só a barra de progresso da Biblioteca
      // fica sem o total até a próxima vez.
      if (pdfIdAlvo && gh.isConfigured() && window.CBBibliotecaPdf) {
        const biblioteca = new window.CBBibliotecaPdf(gh);
        biblioteca.atualizarMeta(pdfIdAlvo, { paginas: app.pagesCount }).catch(() => {});
      }
    });
    app.eventBus.on("pagechanging", (evt) => {
      leitorDeTempo?.mudarPagina(evt.pageNumber);
    });

    // ---------------------------------------------------------------
    // Abertura automática vindo da Biblioteca — essencial no iPhone,
    // que não tem File System Access API (não existe "pasta do PC" lá):
    // o único jeito de ler/anotar um PDF da Biblioteca no celular é
    // puxando a versão mais recente direto do GitHub.
    // ---------------------------------------------------------------
    if (ghPathAlvo) {
      if (!gh.isConfigured()) {
        toast("Configure a sincronização com GitHub (ícone de engrenagem) para abrir PDFs da Biblioteca.", { error: true });
      } else {
        toast("Baixando PDF da Biblioteca…");
        gh.pull(ghPathAlvo).then((resultado) => {
          if (!resultado) {
            toast("Não encontrei esse PDF no GitHub ainda.", { error: true });
            return;
          }
          main._justOpenedViaFSAccess = false; // veio do GitHub, não tem handle local de arquivo
          main._justOpenedViaGithub = true;
          fileHandle = null;
          app.open({ data: resultado.bytes, filename: pdfNomeAlvo || ghPathAlvo.split("/").pop() });
        });
      }
    }

    function openSettingsModal() {
      const c = gh.config || {};
      document.getElementById("customGhToken").value = c.token || "";
      document.getElementById("customGhOwner").value = c.owner || "";
      document.getElementById("customGhRepo").value = c.repo || "";
      document.getElementById("customGhPath").value = c.path || (app._docFilename ? `pdfs/${app._docFilename}` : "");
      document.getElementById("customGhBranch").value = c.branch || "main";
      document.getElementById("customSyncModal").style.display = "flex";
    }
    document.getElementById("customSyncSettingsButton").addEventListener("click", openSettingsModal);
    document.getElementById("customSyncBadge").addEventListener("click", openSettingsModal);
    document.getElementById("customGhCancel").addEventListener("click", () => {
      document.getElementById("customSyncModal").style.display = "none";
    });
    document.getElementById("customSyncModal").addEventListener("click", (e) => {
      if (e.target.id === "customSyncModal") e.target.style.display = "none";
    });
    document.getElementById("customGhSave").addEventListener("click", () => {
      const cfg = {
        token: document.getElementById("customGhToken").value.trim(),
        owner: document.getElementById("customGhOwner").value.trim(),
        repo: document.getElementById("customGhRepo").value.trim(),
        path: document.getElementById("customGhPath").value.trim(),
        branch: document.getElementById("customGhBranch").value.trim() || "main",
      };
      if (!cfg.token || !cfg.owner || !cfg.repo || !cfg.path) {
        toast("Preencha token, usuário, repositório e caminho do arquivo.", { error: true });
        return;
      }
      gh.setConfig(cfg);
      document.getElementById("customSyncModal").style.display = "none";
      toast("Sincronização com GitHub configurada");
    });
    document.getElementById("customGhDisconnect").addEventListener("click", () => {
      gh.clearConfig();
      document.getElementById("customSyncModal").style.display = "none";
      toast("Dados de sincronização removidos deste navegador");
    });

    // ---------------------------------------------------------------
    // Forced page-color inversion (independent of the app's own theme)
    // ---------------------------------------------------------------
    const invertKey = "pdfviewer:force-invert";
    function applyInvert(on) {
      document.body.classList.toggle("customForceInvert", on);
      document.getElementById("customInvertButton").classList.toggle("toggled", on);
      localStorage.setItem(invertKey, on ? "1" : "0");
    }
    applyInvert(localStorage.getItem(invertKey) === "1");
    document.getElementById("customInvertButton").addEventListener("click", () => {
      const on = !document.body.classList.contains("customForceInvert");
      applyInvert(on);
      if (on) {
        toast("Modo escuro forçado ligado — em PDFs com fotos/imagens de fundo as cores ficam invertidas (é esperado).");
      }
    });

    // ---------------------------------------------------------------
    // File System Access: open with a real handle (so "Save" can write in
    // place), only offered when the browser supports it. Safari/iOS keeps
    // using pdf.js's normal <input type=file> open flow untouched.
    // ---------------------------------------------------------------
    if (supportsFSAccess) {
      const openBtn = document.getElementById("secondaryOpenFile");
      openBtn.addEventListener(
        "click",
        async (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          app.secondaryToolbar?.close?.();
          try {
            const [handle] = await window.showOpenFilePicker({
              types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
            });
            const file = await handle.getFile();
            const bytes = new Uint8Array(await file.arrayBuffer());
            fileHandle = handle;
            main._justOpenedViaFSAccess = true;
            main._justOpenedViaGithub = false;
            caminhoGithubAtual = null; // abriu outro arquivo local por fora da Biblioteca — não deve mais salvar no caminho antigo
            await app.open({ data: bytes, filename: file.name });
            setAutosaveStatus("saved");
            gh.onDocumentOpened && gh.onDocumentOpened(file.name);
          } catch (err) {
            if (err.name !== "AbortError") {
              console.error(err);
              toast("Não foi possível abrir o arquivo.", { error: true });
            }
          }
        },
        { capture: true }
      );
    }

    function setAutosaveStatus(kind) {
      const map = {
        saving: "Salvando no PC…",
        saved: "Salvo automaticamente no PC",
        error: "Erro ao salvar automaticamente",
      };
      // Piggyback on the existing sync badge title when there's no GitHub
      // config, so the person still gets *some* save-state feedback.
      if (!gh.isConfigured()) {
        const badge = document.getElementById("customSyncBadge");
        if (map[kind]) badge.title = map[kind];
      }
    }

    // ---------------------------------------------------------------
    // Override Save to write in place via the File System Access handle,
    // and push to GitHub afterward when configured. Falls back to pdf.js's
    // own download-based save when we don't hold a handle (Safari, or the
    // file was opened the normal way).
    // ---------------------------------------------------------------
    const originalSave = app.save.bind(app);
    app.save = async function customSave() {
      // No modo Biblioteca (aberto via ?ghpath=), o próprio conteúdo
      // JÁ está sincronizado — GitHub é a única cópia (o iPhone nem
      // tem outra), então SEMPRE empurra pro mesmo caminho, sem
      // depender de `fileHandle` (que no celular nunca existe).
      if (caminhoGithubAtual) {
        try {
          setAutosaveStatus("saving");
          const bytes = await app.pdfDocument.saveDocument();
          if (fileHandle) {
            // No PC, também grava local (além do GitHub) — melhor dos
            // dois mundos: abre rápido offline da próxima vez, e ainda
            // sincroniza.
            const writable = await fileHandle.createWritable();
            await writable.write(bytes);
            await writable.close();
          }
          await gh.push(bytes, app._docFilename || "documento.pdf", caminhoGithubAtual);
          toast(fileHandle ? "Salvo no PC e no GitHub" : "Salvo no GitHub");
          setAutosaveStatus("saved");
        } catch (err) {
          console.error(err);
          setAutosaveStatus("error");
          toast("Erro ao salvar o PDF.", { error: true });
        }
        return;
      }

      // Fluxo antigo (fora da Biblioteca): mantém exatamente como era.
      if (!fileHandle) {
        await originalSave();
        if (gh.isConfigured() && app.pdfDocument) {
          try {
            const bytes = await app.pdfDocument.saveDocument();
            await gh.push(bytes, app._docFilename || "documento.pdf");
          } catch (err) {
            console.error(err);
          }
        }
        return;
      }
      if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
      }
      try {
        setAutosaveStatus("saving");
        const bytes = await app.pdfDocument.saveDocument();
        const writable = await fileHandle.createWritable();
        await writable.write(bytes);
        await writable.close();
        toast("Salvo no seu computador");
        setAutosaveStatus("saved");
        if (gh.isConfigured()) await gh.push(bytes, app._docFilename || "documento.pdf");
      } catch (err) {
        console.error(err);
        setAutosaveStatus("error");
        toast("Erro ao salvar o PDF.", { error: true });
      }
    };

    // ---------------------------------------------------------------
    // Autosave to the local file: debounced on pdf.js's own
    // "editingstateschanged" event, which fires whenever an annotation
    // editor (highlight/ink/stamp/etc.) is added, edited, or removed. Only
    // meaningful when we hold a real file handle — otherwise there's
    // nothing to silently write to, and we don't want to spam downloads.
    // ---------------------------------------------------------------
    app.eventBus.on("editingstateschanged", () => {
      // Autosalva quando há um handle local (PC) OU quando o documento
      // veio da Biblioteca (aí o GitHub é a única cópia, então precisa
      // salvar sozinho mesmo sem handle — é o caso do iPhone).
      if (!fileHandle && !caminhoGithubAtual) return;
      gh.markLocalChange();
      if (autosaveTimer) clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(() => {
        autosaveTimer = null;
        app.save();
      }, AUTOSAVE_DELAY_MS);
    });

    // Reset the file handle whenever a *different* document is opened the
    // normal way (drag-drop or the plain file input), so Save correctly
    // falls back to download instead of silently writing to the previous
    // file's handle.
    app.eventBus.on("documentloaded", () => {
      // `open()` from our own File System Access flow sets fileHandle right
      // before calling app.open(); any other load path should clear it.
      if (!main._justOpenedViaFSAccess) fileHandle = null;
      // Mesma ideia pro caminho da Biblioteca: só mantém se este load foi
      // o nosso próprio pull do GitHub (ou o primeiro load da página,
      // vindo direto de ?ghpath=). Um drag-and-drop ou o seletor simples
      // do navegador depois disso significa "abandonei a Biblioteca,
      // abri outro arquivo por fora" — salvar não deve mais ir pro
      // caminho antigo.
      if (!main._justOpenedViaGithub) caminhoGithubAtual = null;
      main._justOpenedViaFSAccess = false;
      main._justOpenedViaGithub = false;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();

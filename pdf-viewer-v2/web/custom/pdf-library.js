// =====================================================================
// BIBLIOTECA DE PDFS — um "índice" (manifest.json) gravado no mesmo
// repositório GitHub já usado pela sincronização de cada arquivo
// individual (custom/github-sync.js). Reaproveita EXATAMENTE a mesma
// configuração salva em localStorage (token/usuário/repo/branch) — ou
// seja, quem já configurou a sincronização do leitor não precisa
// configurar nada de novo pra usar a Biblioteca.
//
// Layout no repositório (caminhos fixos, dentro do repo já configurado):
//   _biblioteca/manifest.json   → lista de todos os PDFs
//   _biblioteca/pdfs/<id>.pdf   → o arquivo de cada PDF
//
// Usado tanto pelo leitor (pdf-viewer-v2/web/custom/app-hooks.js, pra
// abrir um item da biblioteca) quanto pelo site (aba Questões → PDF),
// que só lista/adiciona/remove itens sem precisar abrir o leitor.
//
// Script clássico (não é módulo ES) de propósito, igual ao
// github-sync.js — assim os dois dão pra usar em qualquer página
// estática com uma simples <script src="...">, sem bundler.
// =====================================================================
(function () {
  "use strict";

  const MANIFEST_PATH = "_biblioteca/manifest.json";
  const PASTA_PDFS = "_biblioteca/pdfs";

  function slugificar(nome) {
    return (nome || "documento")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acento
      .toLowerCase()
      .replace(/\.pdf$/i, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "documento";
  }

  function gerarId(nomeOriginal) {
    const base = slugificar(nomeOriginal);
    const sufixo = Math.random().toString(36).slice(2, 8);
    return `${base}-${sufixo}`;
  }

  class BibliotecaPdf {
    // `ghClient` é uma instância de window.CustomGithubSync já criada
    // (a página que usar esta classe decide os callbacks de toast/status).
    constructor(ghClient) {
      this.gh = ghClient;
      this._manifestSha = null;
    }

    isConfigured() {
      return this.gh.isConfigured();
    }

    // Lê o manifesto do GitHub. Se ainda não existir (primeiro uso),
    // devolve uma lista vazia — não é tratado como erro.
    async listar() {
      const resultado = await this.gh.pullJson(MANIFEST_PATH);
      if (!resultado) {
        this._manifestSha = null;
        return [];
      }
      this._manifestSha = resultado.sha;
      const manifest = resultado.json || {};
      return Array.isArray(manifest.pdfs) ? manifest.pdfs : [];
    }

    async _salvarManifest(lista) {
      const payload = { versao: 1, atualizadoEm: Date.now(), pdfs: lista };
      const res = await this.gh.pushJson(MANIFEST_PATH, payload, this._manifestSha, "Atualiza biblioteca de PDFs");
      this._manifestSha = res && res.sha;
    }

    // `bytes` = Uint8Array do PDF. `nomeOriginal` = nome do arquivo que a
    // pessoa escolheu (usado só como título de exibição). `paginas` é
    // opcional (o leitor manda depois de abrir o arquivo pela 1ª vez, via
    // atualizarMeta) — deixa null/undefined se ainda não souber.
    async adicionar(bytes, nomeOriginal, paginas) {
      if (!this.isConfigured()) throw new Error("Sincronização com GitHub não configurada.");
      const id = gerarId(nomeOriginal);
      const path = `${PASTA_PDFS}/${id}.pdf`;
      await this.gh.push(bytes, nomeOriginal, path);

      const lista = await this.listar();
      const entrada = {
        id,
        nome: nomeOriginal || `${id}.pdf`,
        path,
        paginas: paginas || null,
        tamanhoBytes: bytes.length,
        criadoEm: Date.now(),
        atualizadoEm: Date.now(),
      };
      lista.push(entrada);
      await this._salvarManifest(lista);
      return entrada;
    }

    // Atualiza campos de uma entrada existente (ex.: número de páginas,
    // assim que o leitor consegue ler isso do PDF aberto).
    async atualizarMeta(id, patch) {
      const lista = await this.listar();
      const idx = lista.findIndex((p) => p.id === id);
      if (idx === -1) return null;
      lista[idx] = { ...lista[idx], ...patch, atualizadoEm: Date.now() };
      await this._salvarManifest(lista);
      return lista[idx];
    }

    async remover(id) {
      const lista = await this.listar();
      const idx = lista.findIndex((p) => p.id === id);
      if (idx === -1) return false;
      const entrada = lista[idx];

      // Descobre o sha atual do arquivo pra poder apagar (a API do GitHub
      // exige o sha na hora de deletar, como proteção contra apagar a
      // versão errada por engano).
      try {
        const atual = await this.gh.pull(entrada.path);
        if (atual && atual.sha) {
          await this.gh.deleteFile(entrada.path, atual.sha, `Remove ${entrada.nome} da biblioteca`);
        }
      } catch (err) {
        console.warn("[Biblioteca] Não consegui apagar o arquivo do GitHub (removendo só do índice):", err);
      }

      lista.splice(idx, 1);
      await this._salvarManifest(lista);
      return true;
    }

    async abrirBytes(id) {
      const lista = await this.listar();
      const entrada = lista.find((p) => p.id === id);
      if (!entrada) return null;
      const resultado = await this.gh.pull(entrada.path);
      if (!resultado) return null;
      return { entrada, bytes: resultado.bytes };
    }
  }

  window.CBBibliotecaPdf = BibliotecaPdf;
})();

// Plain classic script (not a module) so it can attach to `window` and be
// used by app-hooks.js without needing a bundler step for this static site.
(function () {
  "use strict";

  const STORAGE_KEY = "pdfviewer:github-sync";

  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function saveConfig(cfg) {
    if (cfg) localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(STORAGE_KEY);
  }

  function encodePath(path) {
    return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  }

  function buildGetRequest({ owner, repo, path, branch, token }) {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}${branch ? `?ref=${encodeURIComponent(branch)}` : ""}`;
    return {
      url,
      headers: {
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "X-GitHub-Api-Version": "2022-11-28",
      },
    };
  }

  function buildPutRequest({ owner, repo, path, branch, token, message, contentBase64, sha }) {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`;
    return {
      url,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        content: contentBase64,
        ...(branch ? { branch } : {}),
        ...(sha ? { sha } : {}),
      }),
    };
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  function base64ToBytes(base64) {
    const binary = atob(base64.replace(/\n/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function describeError(err) {
    const msg = String((err && err.message) || err);
    if (msg.includes("401") || /bad credentials/i.test(msg)) return "Token do GitHub inválido ou expirado.";
    if (msg.includes("404")) return "Repositório ou caminho não encontrado no GitHub.";
    if (msg.includes("403")) return "Sem permissão — verifique o escopo do token ou o limite de requisições.";
    return `Falha ao falar com o GitHub: ${msg}`;
  }

  class GithubSync {
    constructor({ onStatusChange, onToast }) {
      this.onStatusChange = onStatusChange || function () {};
      this.onToast = onToast || function () {};
      this.config = loadConfig();
      this.lastSyncedSha = null;
      this._report();
    }

    isConfigured() {
      // Antes exigia também `c.path` (fixo, do modo "um arquivo só"). A
      // Biblioteca não grava mais esse campo — cada chamada de pull/push
      // recebe o caminho na hora — então exigir path aqui fazia
      // isConfigured() voltar false sempre, mesmo com token/usuário/repo
      // certos, e travava tudo que dependia disso (autopull da
      // Biblioteca, badge de status, autosave).
      const c = this.config;
      return !!(c && c.token && c.owner && c.repo);
    }

    setConfig(cfg) {
      this.config = cfg;
      saveConfig(cfg);
      this.lastSyncedSha = null;
      this._report();
    }

    clearConfig() {
      this.config = null;
      saveConfig(null);
      this._report();
    }

    markLocalChange() {
      if (this.isConfigured()) this._report("pending", "Alterações não enviadas");
    }

    _report(status, message) {
      if (status) return this.onStatusChange(status, message);
      if (!this.isConfigured()) return this.onStatusChange("off", "Sync desligado");
      return this.onStatusChange(
        this.lastSyncedSha ? "synced" : "pending",
        this.lastSyncedSha ? "Sincronizado com GitHub" : "Ainda não sincronizado"
      );
    }

    // `path` é opcional em todos os métodos abaixo: quando informado (usado
    // pela Biblioteca, que mexe em vários arquivos com o mesmo token/repo),
    // ele vence; quando omitido, cai no `this.config.path` fixo (uso antigo,
    // de um único arquivo — mantido pra não quebrar quem já configurou assim).
    async pull(path) {
      if (!this.isConfigured()) return null;
      const alvo = path || this.config.path;
      if (!alvo) return null;
      try {
        const req = buildGetRequest({ ...this.config, path: alvo });
        const res = await fetch(req.url, { headers: req.headers });
        if (res.status === 404) return null; // arquivo ainda não existe no repo — não é erro
        if (!res.ok) throw new Error(`GitHub respondeu ${res.status}`);
        const json = await res.json();
        if (!path) this.lastSyncedSha = json.sha; // só rastreia sha pro fluxo antigo de 1 arquivo
        this._report();
        this.onToast("Versão mais recente baixada do GitHub");
        return { bytes: base64ToBytes(json.content), fileName: alvo.split("/").pop(), sha: json.sha };
      } catch (err) {
        console.error(err);
        this._report("error", "Erro ao puxar");
        this.onToast(describeError(err), { error: true });
        return null;
      }
    }

    // Lê um JSON qualquer do repo (usado pelo manifesto da Biblioteca).
    // Retorna { json, sha } ou null se o arquivo ainda não existir (404).
    async pullJson(path) {
      if (!this.isConfigured()) return null;
      try {
        const req = buildGetRequest({ ...this.config, path });
        const res = await fetch(req.url, { headers: req.headers });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`GitHub respondeu ${res.status}`);
        const json = await res.json();
        const texto = new TextDecoder("utf-8").decode(base64ToBytes(json.content));
        return { json: JSON.parse(texto), sha: json.sha };
      } catch (err) {
        console.error(err);
        this.onToast(describeError(err), { error: true });
        throw err;
      }
    }

    async push(bytes, fileName, path) {
      if (!this.isConfigured()) return null;
      const alvo = path || this.config.path;
      if (!alvo) return null;
      try {
        let remoteSha = null;
        const getReq = buildGetRequest({ ...this.config, path: alvo });
        const getRes = await fetch(getReq.url, { headers: getReq.headers });
        if (getRes.status === 200) {
          remoteSha = (await getRes.json()).sha;
        } else if (getRes.status !== 404) {
          throw new Error(`GitHub respondeu ${getRes.status} ao verificar o arquivo`);
        }

        const shaConhecido = path ? null : this.lastSyncedSha; // conflito só é checado no fluxo de 1 arquivo fixo
        if (shaConhecido && remoteSha && shaConhecido !== remoteSha) {
          const proceed = window.confirm(
            "O arquivo no GitHub foi alterado por outro aparelho desde a última sincronização. Enviar mesmo assim vai sobrescrever essa versão. Continuar?"
          );
          if (!proceed) {
            this._report("pending", "Conflito — não enviado");
            return null;
          }
        }

        const putReq = buildPutRequest({
          ...this.config,
          path: alvo,
          message: `Atualiza ${fileName} via leitor de PDF — ${new Date().toISOString()}`,
          contentBase64: bytesToBase64(bytes),
          sha: remoteSha || undefined,
        });
        const putRes = await fetch(putReq.url, { method: "PUT", headers: putReq.headers, body: putReq.body });
        if (!putRes.ok) {
          const body = await putRes.json().catch(() => ({}));
          throw new Error(body.message || `GitHub respondeu ${putRes.status}`);
        }
        const putJson = await putRes.json();
        const novoSha = putJson.content && putJson.content.sha;
        if (!path) this.lastSyncedSha = novoSha;
        this._report("synced", "Sincronizado com GitHub");
        this.onToast("Enviado para o GitHub");
        return { sha: novoSha };
      } catch (err) {
        console.error(err);
        this._report("error", "Erro ao enviar");
        this.onToast(describeError(err), { error: true });
        return null;
      }
    }

    // Grava um objeto JS como JSON formatado no repo (usado pelo manifesto).
    async pushJson(path, obj, sha, mensagem) {
      if (!this.isConfigured()) return null;
      const texto = JSON.stringify(obj, null, 2);
      const bytes = new TextEncoder().encode(texto);
      const putReq = buildPutRequest({
        ...this.config,
        path,
        message: mensagem || `Atualiza ${path} — ${new Date().toISOString()}`,
        contentBase64: bytesToBase64(bytes),
        sha: sha || undefined,
      });
      const putRes = await fetch(putReq.url, { method: "PUT", headers: putReq.headers, body: putReq.body });
      if (!putRes.ok) {
        const body = await putRes.json().catch(() => ({}));
        throw new Error(body.message || `GitHub respondeu ${putRes.status}`);
      }
      const putJson = await putRes.json();
      return { sha: putJson.content && putJson.content.sha };
    }

    async deleteFile(path, sha, mensagem) {
      if (!this.isConfigured() || !sha) return false;
      const url = `https://api.github.com/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repo)}/contents/${encodePath(path)}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.config.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: mensagem || `Remove ${path} — ${new Date().toISOString()}`,
          sha,
          ...(this.config.branch ? { branch: this.config.branch } : {}),
        }),
      });
      return res.ok;
    }
  }

  window.CustomGithubSync = GithubSync;
})();

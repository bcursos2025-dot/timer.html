/* Service worker da Norma.
   Estratégia simples e segura: REDE PRIMEIRO, cache como reserva. Com internet o site é sempre a versão
   mais nova; sem internet (ou com rede ruim) abre o que já foi visitado. Troque V a cada publicação para
   limpar caches antigos. Não guarda PDFs nem a biblioteca (arquivos grandes). */
const V = 'cb-2026-10-18-x';
const SHELL = ['./', 'index.html', 'timer.html', 'leis.html', 'oab.html', 'peca.html', 'instalar.html', 'favicon.svg', 'manifest.webmanifest',
  'css/app.css', 'css/design.css', 'css/landing.css', 'css/leis.css', 'css/oab.css', 'css/peca.css', 'js/oab.js', 'js/peca.js', 'data/oab/indice.json', 'css/bem-estar.css', 'css/animacoes.css',
  'js/app.js', 'js/dispositivo.js', 'js/alerta-fase.js', 'js/calendario.js', 'js/hoje.js', 'js/iniciante.js', 'js/descer.js', 'js/meuperfil.js', 'js/bem-estar.js', 'js/estudos.js', 'js/config-busca.js', 'js/folha-gestos.js', 'js/animacoes.js', 'js/ia.js', 'js/comunidade-chat.js', 'js/comunidade.js', 'js/graficos.js', 'js/geral.js', 'js/perfil.js', 'js/desempenho.js', 'js/backup.js', 'js/leis.js', 'js/a11y.js', 'js/pwa.js',
  'leis/index.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                                   // Firebase, GitHub, etc. seguem direto
  if (/\/(_biblioteca|pdf-viewer-v2)\//.test(url.pathname) || /\.(pdf|zip)$/i.test(url.pathname)) return;
  const guardar = (r) => { if (r && r.ok) { const copia = r.clone(); caches.open(V).then(c => c.put(req, copia)).catch(() => {}); } return r; };
  if (req.mode === 'navigate') {
    // a página: tenta a rede por até 3 s; se a rede estiver lenta, abre a cópia guardada na hora
    e.respondWith(new Promise((ok) => {
      let feito = false;
      const t = setTimeout(() => caches.match(req, { ignoreSearch: true }).then(h => { if (h && !feito) { feito = true; ok(h); } }), 3000);
      fetch(req, { cache: 'no-cache' }).then(r => { clearTimeout(t); if (!feito) { feito = true; ok(guardar(r)); } else guardar(r); })
        .catch(() => { clearTimeout(t); if (!feito) caches.match(req, { ignoreSearch: true }).then(h => { feito = true; ok(h || caches.match('timer.html') || Response.error()); }); });
    }));
    return;
  }
  // CSS, JS e imagens: o arquivo guardado abre na hora; os links levam ?v=, então versão nova = arquivo novo
  e.respondWith(
    caches.match(req).then(h => h ? (url.searchParams.has('v') ? h : (fetch(req, { cache: 'no-cache' }).then(guardar).catch(() => null), h)) : fetch(req, { cache: 'no-cache' }).then(guardar).catch(() => caches.match(req, { ignoreSearch: true }).then(x => x || Response.error())))
  );
});

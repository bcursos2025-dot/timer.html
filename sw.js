/* Service worker do Concurseiro Blindado.
   Estratégia simples e segura: REDE PRIMEIRO, cache como reserva. Com internet o site é sempre a versão
   mais nova; sem internet (ou com rede ruim) abre o que já foi visitado. Troque V a cada publicação para
   limpar caches antigos. Não guarda PDFs nem a biblioteca (arquivos grandes). */
const V = 'cb-2026-10-17-c';
const SHELL = ['./', 'index.html', 'timer.html', 'leis.html', 'instalar.html', 'favicon.svg', 'manifest.webmanifest',
  'css/app.css', 'css/design.css', 'css/landing.css', 'css/leis.css',
  'js/app.js', 'js/hoje.js', 'js/iniciante.js', 'js/perfil.js', 'js/desempenho.js', 'js/backup.js', 'js/leis.js', 'js/a11y.js', 'js/pwa.js',
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
  e.respondWith(
    fetch(req).then(r => {
      if (r && r.ok) { const copia = r.clone(); caches.open(V).then(c => c.put(req, copia)).catch(() => {}); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(h => h || (req.mode === 'navigate' ? caches.match('timer.html') : Response.error())))
  );
});

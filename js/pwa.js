/* Registra o service worker (só em https ou localhost). Falha em silêncio: o site funciona sem ele. */
(function(){
  if (!('serviceWorker' in navigator)) return;
  if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('sw.js').catch(function(){ /* sem service worker: tudo bem */ });
  });
})();

// Service worker cache-first: depois do primeiro load, o app inteiro funciona
// sem internet — essencial pra mesa de negociação sem sinal.

const CACHE_NAME = "acelerador-quitacao-v4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./entrada.html",
  "./estrategia.html",
  "./resultados.html",
  "./cronograma.html",
  "./manifest.webmanifest",
  "./assets/css/style.css",
  "./assets/vendor/chart.min.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./js/format.js",
  "./js/storage.js",
  "./js/state.js",
  "./js/nav.js",
  "./js/ui.js",
  "./js/charts.js",
  "./js/compartilhar.js",
  "./js/csv.js",
  "./js/calc/incc.js",
  "./js/calc/evolucaoObra.js",
  "./js/calc/amortizacao.js",
  "./js/calc/fgts.js",
  "./js/calc/caixa.js",
  "./js/calc/entrada.js",
  "./js/calc/cenarios.js",
  "./js/calc/calendario.js",
  "./js/calc/cronograma.js",
  "./js/screens/aprovacao.js",
  "./js/screens/entrada.js",
  "./js/screens/estrategia.js",
  "./js/screens/resultados.js",
  "./js/screens/cronograma.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== CACHE_NAME).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((resposta) => {
          const clone = resposta.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return resposta;
        })
        .catch(() => cached);
    })
  );
});

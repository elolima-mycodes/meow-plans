const CACHE_NAME = 'meow-plans-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './login.html',
  './calendario.html',
  './gerenciar.html',
  './usuario.html',
  './pet.html',
  './style.css',
  './login.js',
  './calendario.js',
  './gerenciar.js',
  './usuario.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './imgs/corvo.png',
  './imgs/dinossauro.png',
  './imgs/gato.png',
  './imgs/pato.png',
  './imgs/logo.png'
];

// Instalação: salva os arquivos estáticos em cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Ativação: limpa caches antigos quando você atualizar a versão
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Interceptação de requisições:
// - Chamadas ao PocketBase (127.0.0.1:8090) vão direto para a rede
// - Arquivos estáticos usam Network-First com fallback para Cache
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('127.0.0.1:8090') || event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
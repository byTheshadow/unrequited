const CACHE_NAME = 'unrequited-shell-v13';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './css/global.css',
  './css/themes.css',
  './css/components.css',
  './css/animations.css',
  './js/main.js',
  './js/router.js',
  './js/db.js',
  './js/themeManager.js',
  './js/utils.js',
  './js/cardEngine.js',
  './js/lib/keepAlive.js',
  './js/lib/sound.js',
  './js/lib/scheduler.js',
  './js/pages/launch.js',
  './js/pages/home.js',
  './js/pages/cards.js',
  './js/pages/chat.js',
  './js/pages/characters.js',
  './js/pages/decks.js',
  './js/pages/settings/index.js',
  './js/pages/divination/index.js',
  './data/healingQuotes.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

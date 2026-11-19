/* Release shell: bump RELEASE and every versioned index.html asset together. */
const RELEASE = '1103';
const APP_VERSION = '2.11.2';
const RELEASE_NOTES = ["全国マップのピンを、中くらいの拡大でもまとめて見られるよう調整しました。2倍・4倍・8倍で段階的に分かれます。","1000％までの拡大と、縮小した時の再統合はそのまま使えます。"];
const BASE = new URL('./', self.registration.scope);
const CACHE_PREFIX = `snowboard-stance-haru-detail:${BASE.href}:`;
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE}`;
const SHELL = [
  `weather/map-viewport.js?v=${RELEASE}`, 
  `weather/national-map.css?v=${RELEASE}`, `weather/national-map.js?v=${RELEASE}`, `weather/japan-outline.js?v=${RELEASE}`,
  `weather/spot-info.css?v=${RELEASE}`, `weather/spot-info.js?v=${RELEASE}`,
  `weather/map-store.js?v=${RELEASE}`, `weather/map-pdf.js?v=${RELEASE}`, 'weather/spot-catalog.json',
  `weather/views.css?v=${RELEASE}`, `weather/views.js?v=${RELEASE}`,
  'weather-design-lab/index.html', `weather-design-lab/style.css?v=${RELEASE}`,
  `weather-design-lab/samples.js?v=${RELEASE}`, `weather-design-lab/app.js?v=${RELEASE}`,
  'weather/index.html', `weather/weather.css?v=${RELEASE}`,
  `weather/engine.js?v=${RELEASE}`, `weather/app.js?v=${RELEASE}`, 'weather/resorts.json',
  'index.html', `style.css?v=${RELEASE}`, `outdoor.css?v=${RELEASE}`,
  `theme.css?v=${RELEASE}`, `theme.js?v=${RELEASE}`, `script.js?v=${RELEASE}`,
  `pwa.css?v=${RELEASE}`, `pwa.js?v=${RELEASE}`, 'manifest.webmanifest',
  `board-suggestions.css?v=${RELEASE}`, `board-suggestions.js?v=${RELEASE}`,
  `detail.css?v=${RELEASE}`, `detail.js?v=${RELEASE}`,
  `history-views.css?v=${RELEASE}`, `history-views.js?v=${RELEASE}`,
  `ui-consistency.css?v=${RELEASE}`,
  `menu-ui.css?v=${RELEASE}`, `menu-ui.js?v=${RELEASE}`,
  `board-shape-history.js?v=${RELEASE}`,
  `history-stats.js?v=${RELEASE}`,
  `history-editor.js?v=${RELEASE}`,
  `draft-guard.js?v=${RELEASE}`, `history-tools.js?v=${RELEASE}`,
  `tutorial.css?v=${RELEASE}`, `tutorial.js?v=${RELEASE}`,
  `foot-dock.js?v=${RELEASE}`,
  `menu-navigation.js?v=${RELEASE}`, `menu-navigation.css?v=${RELEASE}`,
  `record-search.js?v=${RELEASE}`, `record-search.css?v=${RELEASE}`,
  `view-navigation.js?v=${RELEASE}`, `view-navigation.css?v=${RELEASE}`,
  'icons/icon-trial-192.png', 'icons/icon-trial-512.png',
  'icons/icon-trial-maskable-512.png', 'icons/apple-touch-icon-trial.png',
].map(path => new URL(path, BASE).href);
const SHELL_URLS = new Set(SHELL);
self.addEventListener('install', event => {
  // Refresh the HTTP cache too, so an old unversioned index.html cannot be
  // copied into the newly installed offline shell.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL.map(url => new Request(url, {cache: 'reload'})))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'GET_RELEASE_INFO') {
    event.ports?.[0]?.postMessage({type: 'RELEASE_INFO', version: APP_VERSION, release: RELEASE, notes: RELEASE_NOTES});
  }
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  const page = request.mode === 'navigate' ? (url.pathname === BASE.pathname || url.pathname === new URL('index.html', BASE).pathname) ? 'index.html'
    : (url.pathname === new URL('weather/', BASE).pathname || url.pathname === new URL('weather/index.html', BASE).pathname) ? 'weather/index.html'
    : (url.pathname === new URL('weather-design-lab/', BASE).pathname || url.pathname === new URL('weather-design-lab/index.html', BASE).pathname) ? 'weather-design-lab/index.html' : null : null;
  const navigation = page !== null;
  if (!navigation && !SHELL_URLS.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(navigation ? new URL(page, BASE).href : request);
    if (cached) return cached;
    try { return await fetch(request); }
    catch (error) {
      if (!navigation) throw error;
      return new Response('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>スタンスメモ</title><h1>通信を確認してください</h1><p>アプリの準備がまだ完了していません。通信できる状態で一度開いてください。履歴データを削除する必要はありません。</p></html>', {status: 503, headers: {'Content-Type': 'text/html; charset=utf-8'}});
    }
  })());
});

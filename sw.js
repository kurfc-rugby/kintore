/* KURFC 筋トレ — Service Worker（ホーム画面に置いたときの起動を速くし、電波が弱くても画面を出す）
 *  画面（index.html）… ネット優先。つながらなければしまっておいた画面
 *  css・js・画像（?v=版 付き）… しまっておいたもの優先。無ければ取りに行ってしまう
 *  フォント … しまっておいたもの優先
 *  サーバー（script.google.com）への通信 … 触らない（いつもネット）
 * 版を上げるときは VERSION と、index.html の ?v= を一緒に変える。 */
const VERSION = '2.6.0';
const CACHE = 'kintore-' + VERSION;
const SHELL = ['./', 'style.css?v=' + VERSION, 'app.js?v=' + VERSION, 'logic.js?v=' + VERSION, 'config.js?v=' + VERSION,
  'crest.webp?v=1', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  // すぐには切り替えない（画面の「更新する」で切り替える）。初めての登録のときだけはすぐ使う
  if (!self.registration.active) self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.indexOf('kintore-') === 0 && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

function fromCacheFirst(req) {
  return caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }));
}
function networkFirst(req) {
  return fetch(req).then((res) => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); }
    return res;
  }).catch(() => caches.match('./').then((hit) => hit || caches.match(req)));
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) { e.respondWith(fromCacheFirst(req)); return; }
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req)); return; }
  if (/\/sw\.js$/.test(url.pathname)) return;
  e.respondWith(fromCacheFirst(req));
});

/* KURFC 筋トレ — Service Worker（ホーム画面に置いたときの起動を速くし、電波が弱くても画面を出す）
 *  画面（index.html）… ネット優先。つながらなければしまっておいた画面
 *  css・js・画像（?v=版 付き）… しまっておいたもの優先。無ければ取りに行ってしまう
 *  フォント … しまっておいたもの優先
 *  サーバー（script.google.com）への通信 … 触らない（いつもネット）
 *  通知（push）… 中身は来ないので、サーバー（pushInbox）に取りに行って表示する
 * 版を上げるときは VERSION と、index.html の ?v= を一緒に変える。 */
const VERSION = '2.7.2';
const CACHE = 'kintore-' + VERSION;
try { importScripts('config.js?v=' + VERSION); } catch (e) { /* 読めなくても画面はしまっておいたもので動く */ }
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

// ---------- 通知 ----------
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let msgs = [];
    try { if (e.data) { const j = e.data.json(); if (j && j.title) msgs = [j]; } } catch (x) { /* 中身なし */ }
    if (!msgs.length && self.KINTORE_API) {
      try {
        const sub = await self.registration.pushManager.getSubscription();
        const r = await fetch(self.KINTORE_API, { method: 'POST', body: JSON.stringify({ op: 'pushInbox', endpoint: sub ? sub.endpoint : '' }), redirect: 'follow' });
        const j = await r.json();
        msgs = (j && j.messages) || [];
      } catch (x) { msgs = []; }
    }
    if (!msgs.length) msgs = [{ title: 'KURFC 筋トレ', body: '新しいお知らせがあります。開いて確かめてください。', url: './', tag: 'kintore' }];
    for (const m of msgs.slice(-3)) {
      await self.registration.showNotification(m.title, { body: m.body || '', tag: m.tag || undefined, renotify: !!m.tag, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', lang: 'ja', data: { url: m.url || './' } });
    }
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) { if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) { await c.focus(); if ('navigate' in c) { try { await c.navigate(url); } catch (x) { /* noop */ } } return; } }
    await self.clients.openWindow(url);
  })());
});

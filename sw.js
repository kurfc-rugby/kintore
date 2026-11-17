/* KURFC 筋トレ — Service Worker（ホーム画面に置いたときの起動を速くし、電波が弱くても画面を出す）
 *  画面（index.html）… ネット優先。つながらなければしまっておいた画面
 *  css・js・画像（?v=版 付き）… しまっておいたもの優先。無ければ取りに行ってしまう
 *  フォント … しまっておいたもの優先
 *  サーバー（script.google.com）への通信 … 触らない（いつもネット）
 *  通知（push）… 中身は来ないので、サーバー（pushInbox）に取りに行って表示する
 *  動画（Background Sync・Android）… 画面を閉じても、端末にしまった動画をサーバーに送る
 * 版を上げるときは VERSION と、index.html の ?v= を一緒に変える。 */
const VERSION = '2.22.0-t15';
try { importScripts('config.js?v=' + VERSION); } catch (e) { /* 読めなくても画面はしまっておいたもので動く */ }
// テスト環境（KINTORE_STORE = 'kintoreTest'）は、本番としまう場所の名前を分ける（同じ github.io の中なので）
const CPREFIX = (self.KINTORE_STORE || 'kintore') + '-';
const CACHE = CPREFIX + VERSION;
const SHELL = ['./', 'style.css?v=' + VERSION, 'app.js?v=' + VERSION, 'logic.js?v=' + VERSION, 'config.js?v=' + VERSION,
  'crest.webp?v=1', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  // すぐには切り替えない（画面の「更新する」で切り替える）。初めての登録のときだけはすぐ使う
  if (!self.registration.active) self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.indexOf(CPREFIX) === 0 && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

function fromCacheFirst(req) {
  return caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }));
}
// ページはネットから。3秒たっても返ってこない（電波が弱い）ときは、保存してあるページを先に出す（ネットの分は裏で保存し直す）
function networkFirst(req, e) {
  const fromCache = () => caches.match('./').then((hit) => hit || caches.match(req));
  const net = fetch(req).then((res) => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); }
    return res;
  });
  if (e) e.waitUntil(net.catch(() => {}));
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done && r) { done = true; resolve(r); } };
    const t = setTimeout(() => { fromCache().then(finish); }, 3000);
    net.then((res) => { clearTimeout(t); finish(res); })
      .catch(() => { clearTimeout(t); fromCache().then((hit) => { if (hit) finish(hit); else finish(Response.error()); }); });
  });
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) { e.respondWith(fromCacheFirst(req)); return; }
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, e)); return; }
  if (/\/sw\.js$/.test(url.pathname)) return;
  if (/\/media\//.test(url.pathname)) return; // 動画は分割して読むので、Service Worker を通さない
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
// ブラウザが通知の宛先を作り直したとき、サーバーの登録を新しい宛先に移す
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    const old = e.oldSubscription;
    let sub = e.newSubscription;
    if (!sub && old && old.options) { try { sub = await self.registration.pushManager.subscribe(old.options); } catch (x) { return; } }
    if (!sub || !old || !self.KINTORE_API) return;
    try { await fetch(self.KINTORE_API, { method: 'POST', body: JSON.stringify({ op: 'pushMove', old: old.endpoint, sub: sub.toJSON() }), redirect: 'follow' }); } catch (x) { /* 次に画面を開いたときに登録し直す */ }
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

// ---------- 動画を送る（Android の Chrome。画面を閉じても送る） ----------
// 画面が IndexedDB（<KINTORE_STORE>.clips）にしまった動画を、1本ずつ送る。送れたら消す
const CLIP_DB = (self.KINTORE_STORE || 'kintore') + '.clips';
function clipDb() {
  return new Promise((ok) => {
    try {
      const r = indexedDB.open(CLIP_DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('q', { keyPath: 'at' });
      r.onsuccess = () => ok(r.result); r.onerror = () => ok(null);
    } catch (e) { ok(null); }
  });
}
function clipTx(db, mode, fn) {
  return new Promise((ok) => {
    try {
      const tx = db.transaction('q', mode), r = fn(tx.objectStore('q'));
      tx.oncomplete = () => ok(r && 'result' in r ? r.result : undefined);
      tx.onerror = tx.onabort = () => ok(undefined);
    } catch (e) { ok(undefined); }
  });
}
function bufToB64(buf) {
  const a = new Uint8Array(buf); let s = '';
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
  return btoa(s);
}
async function clipTell(msg, note) {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const shown = list.filter((c) => c.visibilityState === 'visible');
  list.forEach((c) => c.postMessage(msg));
  // 画面を見ていないときは通知で知らせる（通知を許可している人だけ）
  if (!shown.length && note && self.Notification && Notification.permission === 'granted') {
    try { await self.registration.showNotification(note.title, { body: note.body, tag: 'clip', icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', lang: 'ja', data: { url: './' } }); } catch (e) { /* noop */ }
  }
}
async function sendClips() {
  if (!self.KINTORE_API) return;
  const db = await clipDb();
  if (!db) return;
  const items = (await clipTx(db, 'readonly', (st) => st.getAll())) || [];
  let retry = false;
  for (const it of items) {
    if (!(await clipTx(db, 'readonly', (st) => st.get(it.at)))) continue; // 画面が先に送った
    const post = async (body) => {
      try {
        const r = await fetch(self.KINTORE_API, { method: 'POST', redirect: 'follow', body: JSON.stringify(Object.assign({ device: it.device || '', token: it.token || '', mime: it.mime, thumb: it.thumb || '', recordedAt: it.at, code: it.code }, body)) });
        return await r.json();
      } catch (e) { return null; }
    };
    let j = null;
    const tm = { at: it.at, by: '裏（Service Worker）', kb: Math.round(it.buf.byteLength / 1024) };
    // 1. 小さいデータだけ先に送る → すぐ「実施した」
    if (!it.started) {
      const s0 = Date.now();
      j = await post({ op: 'clipStart' });
      tm.start = Date.now() - s0; if (j && j.t) tm.startSrv = j.t;
      if (j && j.error === 'unknown_op') { it.started = true; j = null; } // サーバーが古い：動画といっしょに1回で送る
      else if (j && j.ok) {
        it.started = true;
        await clipTx(db, 'readwrite', (st) => st.put(it));
        await clipTell({ clip: 'started', at: it.at, thumb: it.thumb, r: j }, null);
      }
    }
    // 下書き（撮ってすぐ画面が送った分）で動画がもう届いていれば、送らない
    let have = !!(j && j.ok && j.clip && j.clip.nv === 0);
    if (!have && it.started && it.drafting) {
      // 画面が下書きの結果を書いてくれるのを待つ（0.3秒ごとに見る。最大15秒）
      let res = it.draftRes || '';
      for (let i = 0; i < 50 && !res; i++) {
        await new Promise((ok) => setTimeout(ok, 300));
        const cur = await clipTx(db, 'readonly', (st) => st.get(it.at));
        res = (cur && cur.draftRes) || '';
      }
      if (res === 'have') { // 下書きの動画が、出した行についた
        have = true;
        if (j && j.clip) j = Object.assign({}, j, { clip: Object.assign({}, j.clip, { nv: 0 }) });
      }
      else if (res !== 'fail') {
        // 下書きの行ができた・結果がわからない：サーバーに確かめ直す（行が2つならまとめてくれる）
        for (const wait of res === 'draft' ? [0, 3000] : [0, 3000, 6000]) {
          if (wait) await new Promise((ok) => setTimeout(ok, wait));
          const j2 = await post({ op: 'clipStart' });
          if (j2 && j2.ok && j2.clip && j2.clip.nv === 0) { have = true; j = j2; break; }
        }
      }
    }
    if (have) { tm.skip = true; it.started = false; }
    // 2. 動画を送る
    if (it.started) {
      const s1 = Date.now(); const data = bufToB64(it.buf); tm.prep = Date.now() - s1;
      const s2 = Date.now(); j = await post({ op: 'clipUpload', data: data }); tm.upload = Date.now() - s2; if (j && j.t) tm.uploadSrv = j.t;
    }
    if (j && j.ok) {
      await clipTx(db, 'readwrite', (st) => st.delete(it.at));
      const day = it.at.slice(5, 7).replace(/^0/, '') + '/' + it.at.slice(8, 10).replace(/^0/, '');
      await clipTell({ clip: 'sent', at: it.at, thumb: it.thumb, r: j, tm: tm }, { title: '動画を送りました', body: j.pending ? 'スタッフが確認するまで待ちです' : day + 'は「実施した」になりました' });
    } else if (j && /^(bad_|too_|not_|forbidden)/.test(String(j.error || ''))) {
      await clipTx(db, 'readwrite', (st) => st.delete(it.at));
      await clipTell({ clip: 'dropped', at: it.at, message: j.message }, { title: '動画を送れませんでした', body: j.message || '' });
    } else {
      // 電波が無い・サーバーが混んでいる → あとでもう一度（ログインが切れたときは、開いたときに画面が送る）
      await clipTell({ clip: 'wait', at: it.at }, null);
      retry = !(j && j.error === 'auth');
      break;
    }
  }
  if (retry) throw new Error('あとで送り直す');
}
self.addEventListener('sync', (e) => {
  if (e.tag !== 'clips') return;
  const run = () => sendClips();
  e.waitUntil(self.navigator && self.navigator.locks && self.navigator.locks.request ? self.navigator.locks.request((self.KINTORE_STORE || 'kintore') + '.clip-send', run) : run());
});

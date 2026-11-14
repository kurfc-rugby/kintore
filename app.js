/* KURFC 筋トレ管理アプリ — 画面 v2（ジャージ・背番号） */
(function () {
  'use strict';
  const L = window.KLogic;
  const API = window.KINTORE_API;
  const VERSION = '2.11.0';
  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  const PERM = { admin: '管理者', manager: 'マネージャー', leader: 'FWリーダー', member: '一般部員' };
  const MODE = { leader: 'メニュー参加', self: '自主トレ' };
  const MGROUP = { FW: 'FW', BK: 'BK', ALL: '全体' };
  const GRADES = ['1年', '2年', '3年', '4年', 'M1', 'M2'];
  const CLUB_ROLES = ['部員', '主将', '副主将', '主務', '副務', 'マネージャー', 'トレーナー'];
  // ポジションの背番号（共通名簿から来なかったときの予備）
  const FALLBACK_POS = [
    { code: 'PR', group: 'FW', name: 'プロップ', numbers: [1, 3] }, { code: 'HO', group: 'FW', name: 'フッカー', numbers: [2] },
    { code: 'LO', group: 'FW', name: 'ロック', numbers: [4, 5] }, { code: 'FL', group: 'FW', name: 'フランカー', numbers: [6, 7] },
    { code: 'No.8', group: 'FW', name: 'ナンバーエイト', numbers: [8] }, { code: 'SH', group: 'BK', name: 'スクラムハーフ', numbers: [9] },
    { code: 'SO', group: 'BK', name: 'スタンドオフ', numbers: [10] }, { code: 'CTB', group: 'BK', name: 'センター', numbers: [12, 13] },
    { code: 'WTB', group: 'BK', name: 'ウイング', numbers: [11, 14] }, { code: 'FB', group: 'BK', name: 'フルバック', numbers: [15] }
  ];
  // フォーメーション図の置き場所（%）。上が相手ゴール側
  const FORMATION = {
    PR: [30, 8], HO: [70, 8], LO: [50, 23], FL: [20, 37], 'No.8': [80, 37],
    SH: [16, 53], SO: [37, 62], CTB: [60, 71], WTB: [84, 80], FB: [44, 91]
  };

  // ---------- 小道具 ----------
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl2br = (s) => esc(s).replace(/\n/g, '<br>');
  const store = {
    get(k, d) { try { const v = localStorage.getItem('kintore.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('kintore.' + k, JSON.stringify(v)); } catch (e) { /* 保存できなくても動く */ } },
    del(k) { try { localStorage.removeItem('kintore.' + k); } catch (e) { /* noop */ } }
  };
  const md = (s) => +s.slice(5, 7) + '/' + +s.slice(8, 10);
  const mdw = (s) => md(s) + '(' + WD[L.dow(s)] + ')';
  const ymLabel = (s) => s.slice(0, 4) + '年' + +s.slice(5, 7) + '月';
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** 画面の切り替えを滑らかにする（View Transitions。使えない端末・動きを減らす設定ではそのまま切り替える）
   *  kind: tab（タブ移動）/ push・pop（詳細へ進む・戻る）/ next・prev（期間を送る）/ swap（表示の切り替え） */
  function vt(fn, kind) {
    // 同じ画面の中の切り替え（週間・月間、期間送り、表示の切り替え、並べ替え）は動かさずにすぐ変える
    if (!kind || kind === 'swap' || kind === 'next' || kind === 'prev') { fn(); return; }
    if (!document.startViewTransition || reduceMotion() || document.hidden || !S.data) { fn(); return; }
    const root = document.documentElement;
    root.dataset.vt = kind || 'swap';
    // 区切りボタンの印が滑るのは同じ画面の中の切り替えだけ。画面ごと移るときは中身と一緒に動かす
    const morph = (kind || 'swap') === 'swap';
    if (morph) nameMorphs();
    try {
      const t = document.startViewTransition(() => { fn(); if (morph) nameMorphs(); });
      t.finished.catch(() => {}).then(() => { clearMorphs(); if (root.dataset.vt === (kind || 'swap')) delete root.dataset.vt; });
      t.ready.catch(() => {});
    } catch (e) { delete root.dataset.vt; fn(); }
  }
  /** 触ったときの小さな手ごたえ（対応する Android だけ） */
  const tick = (ms) => { try { if (navigator.vibrate && !reduceMotion()) navigator.vibrate(ms || 8); } catch (e) { /* なし */ } };

  // ---------- 表示の設定（端末ごと） ----------
  const PREF = { theme: store.get('theme', 'light'), size: store.get('size', 'm'), self: store.get('self', '') };
  const SIZES = [['s', '小'], ['m', '標準'], ['l', '大'], ['xl', '特大']];
  const darkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function applyPrefs() {
    const dark = PREF.theme === 'dark' || (PREF.theme === 'auto' && darkMQ && darkMQ.matches);
    const root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.size = PREF.size;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#2a1215' : '#6f3036');
  }
  if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener('change', () => { if (PREF.theme === 'auto') applyPrefs(); });
  applyPrefs();
  // 応援スタンプ用の端末の番号（ランダム。個人は特定しない）
  let DEVICE = store.get('device', '');
  if (!/^[0-9a-f]{24}$/.test(DEVICE)) {
    const a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    DEVICE = Array.from(a).map((b) => ('0' + b.toString(16)).slice(-2)).join('');
    store.set('device', DEVICE);
  }
  /** ログインの一覧に出す端末の名前（例：iPhone・Safari） */
  function deviceName() {
    const u = navigator.userAgent || '';
    const os = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1) ? 'iPad' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'Mac' : /CrOS/.test(u) ? 'Chromebook' : 'その他';
    const br = / Line\//.test(u) ? 'LINE' : /EdgA?\//.test(u) ? 'Edge' : /CriOS|Chrome\//.test(u) ? 'Chrome' : /FxiOS|Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : 'ブラウザ';
    return os + '・' + br;
  }

  // ---------- ホーム画面に置くアプリ（PWA） ----------
  const PWA = { prompt: null, reg: null, waiting: null };
  const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); PWA.prompt = e; if (S.route && S.route.name === 'settings') render(); });
  window.addEventListener('appinstalled', () => { PWA.prompt = null; toast('ホーム画面に追加しました'); });
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    // 開発用のサーバー（localhost）では、テストの邪魔にならないよう使わない（kintore.swdev を入れたときだけ使う）
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !store.get('swdev', 0)) return;
    navigator.serviceWorker.register('sw.js').then((reg) => {
      PWA.reg = reg;
      if (S.data && !S.data.locked) loadPush().then(() => { if (S.route.name === 'settings') render(); });
      const watch = (w) => { if (!w) return; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { PWA.waiting = w; showUpdate(); } }); };
      if (reg.waiting && navigator.serviceWorker.controller) { PWA.waiting = reg.waiting; showUpdate(); }
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
    }).catch(() => { /* 使えなくてもふつうに動く */ });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (PWA.waiting && !reloaded) { reloaded = true; location.reload(); } });
  }
  function showUpdate() {
    if ($('#update-bar')) return;
    const el = document.createElement('div');
    el.id = 'update-bar'; el.className = 'update-bar'; el.setAttribute('role', 'status');
    el.innerHTML = '<span>新しい版があります</span><button class="btn small" data-act="sw-update">更新する</button>';
    document.body.appendChild(el);
  }
  // ---------- 通知 ----------
  const PUSH = { endpoint: null, ready: false };
  const PUSH_KINDS = [
    ['goal', '今週あと○回のお知らせ', '土曜18時・日曜9時。まだ届いていない週だけ', 'self'],
    ['cheer', '応援が届いたとき', '1時間ごとにまとめて。夜10時〜朝7時は送りません', 'self'],
    ['milestone', '記録の節目', '連続達成が自己ベストに並んだ・更新した、通算○回になったとき', 'self'],
    ['menu', '新しいメニューが出たとき', '自分が対象のメニューだけ', 'self'],
    ['pinreq', '管理者へのお知らせ', '管理者だけ。暗証番号の再発行の依頼と、要望・不具合が届いたらすぐ', 'admin']
  ];
  const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  function b64uBytes(s) {
    const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out;
  }
  async function loadPush() {
    if (PUSH.loading) return PUSH.loading;
    PUSH.loading = loadPush0();
    try { await PUSH.loading; } finally { PUSH.loading = null; }
  }
  async function loadPush0() {
    if (!PWA.reg || !pushSupported()) { PUSH.ready = true; return; }
    try { const sub = await PWA.reg.pushManager.getSubscription(); PUSH.endpoint = sub ? sub.endpoint : ''; } catch (e) { PUSH.endpoint = ''; }
    PUSH.ready = true;
    // 1日1回、登録を新しくしておく（名前を変えたとき・サーバーで消えたとき用）
    if (PUSH.endpoint && store.get('pushSync', '') !== L.todayJST()) { store.set('pushSync', L.todayJST()); registerPush(store.get('pushKinds', []), true).catch(() => {}); }
  }
  async function registerPush(kinds, quiet) {
    let sub = await PWA.reg.pushManager.getSubscription();
    if (!sub) {
      try { sub = await PWA.reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(S.data.pushKey) }); }
      catch (e) {
        if (Notification.permission === 'denied') throw { message: '通知が「許可しない」になっています。下の方法で許可してから、もう一度押してください。' };
        throw { message: '通知を登録できませんでした（' + (e && e.name || 'エラー') + '）。少し待ってもう一度試してください。' };
      }
    }
    const r = await api('pushRegister', { sub: sub.toJSON(), memberId: PREF.self || '', kinds: kinds, deviceName: deviceName() });
    PUSH.endpoint = sub.endpoint; store.set('pushKinds', r.push.kinds); store.set('pushSync', L.todayJST());
    if (!quiet && S.route.name === 'settings') render();
    return r.push;
  }
  function pushBlock() {
    let h = '<section class="block" id="push"><div class="block-h"><h2>通知</h2><span class="count">この端末</span></div>';
    if (!pushSupported()) {
      if (isIOS() && !isStandalone()) return h + '<p class="lead-line small">iPhone では、<b>ホーム画面に追加したアプリ</b>からだけ通知を受け取れます（iOS 16.4 以上）。上の手順で追加して、ホーム画面のアイコンから開き、ここで設定してください。</p></section>';
      return h + '<p class="lead-line small">このブラウザでは通知を受け取れません。LINE の中で開いているときは、Chrome か Safari で開き直してください。</p></section>';
    }
    if (!PWA.reg || !S.data.pushKey) return h + '<p class="lead-line small">準備中です。少し待ってから開き直してください。</p></section>';
    if (!PUSH.ready) { loadPush().then(() => { if (S.route.name === 'settings') render(); }); return h + '<p class="empty small">読み込み中…</p></section>'; }
    const on = !!PUSH.endpoint, cur = on ? store.get('pushKinds', []) : ['goal', 'cheer', 'pinreq'];
    const denied = Notification.permission === 'denied';
    h += '<p class="lead-line small">' + (on ? icon('check') + '<b>この端末で通知を受け取っています。</b>' : 'スマホに通知を出せます。受け取りたいものを選んで「通知をオンにする」を押してください。') + '</p>';
    if (!PREF.self) h += '<p class="hint strong">「今週あと○回」「応援」は、上の「自分の名前」を選ぶと受け取れます。</p>';
    h += '<form data-form="push" class="form"><ul class="pushk">' + PUSH_KINDS.filter((k) => k[3] !== 'admin' || can('admin')).map((k) => {
      const dis = k[3] === 'self' && !PREF.self;
      return '<li><label class="pk' + (dis ? ' dis' : '') + '"><input type="checkbox" name="kinds" value="' + k[0] + '"' + (cur.indexOf(k[0]) >= 0 && !dis ? ' checked' : '') + (dis ? ' disabled' : '') + '><span><b>' + k[1] + '</b><small>' + k[2] + '</small></span></label></li>';
    }).join('') + '</ul>' +
      (denied ? '<p class="form-err">通知が「許可しない」になっています。' + (isIOS() ? 'iPhone の「設定」→「通知」→「筋トレ」で許可してください。' : 'Chrome の右上「︙」→「設定」→「サイトの設定」→「通知」で、このサイトを「許可」にしてください。') + '</p>' : '<p class="form-err" hidden></p>') +
      '<div class="toolbar">' + (on
        ? '<button class="btn primary" type="submit">設定を保存</button><button type="button" class="btn" data-act="push-test">テスト通知を送る</button><button type="button" class="btn danger" data-act="push-off">通知をオフにする</button>'
        : '<button class="btn primary" type="submit"' + (denied ? ' disabled' : '') + '>' + icon('check') + '通知をオンにする</button>') + '</div></form>' +
      '<p class="note">通知はこの端末だけの設定です。だれが何回やったかは本人にしか届きません（未達の人をみんなに知らせることはしません）。</p>';
    return h + '</section>';
  }

  function installBlock() {
    if (isStandalone()) return '<section class="block"><div class="block-h"><h2>ホーム画面のアプリ</h2></div><p class="lead-line small">' + icon('check') + 'ホーム画面から開いています。新しい版が出ると、画面の下に「更新する」が出ます。</p></section>';
    let h = '<section class="block"><div class="block-h"><h2>ホーム画面に追加</h2></div><p class="lead-line small">ホーム画面にアイコンを置くと、アプリのように1タップで開けます（App Store は使いません）。</p>';
    if (PWA.prompt) h += '<div class="toolbar"><button class="btn primary" data-act="pwa-install">' + icon('plus') + 'ホーム画面に追加</button></div>';
    else if (isIOS()) h += '<ol class="howto"><li><b>Safari</b> でこのページを開く（LINEの中で開いているときは、右下のメニューから「Safariで開く」）</li><li>下の<b>共有ボタン</b>（□に↑）を押す</li><li><b>「ホーム画面に追加」</b>→ 右上の「追加」</li></ol>' +
      '<p class="note">ホーム画面から開くと、ログインや自分の名前・文字の大きさの設定はもう一度必要です（Safari とは別に保存されます）。</p>';
    else h += '<ol class="howto"><li><b>Chrome</b> でこのページを開く</li><li>右上の<b>︙</b>を押す</li><li><b>「ホーム画面に追加」</b>または<b>「アプリをインストール」</b></li></ol>';
    return h + '<p class="note"><a href="#help/install">くわしい手順（絵つき）</a></p></section>';
  }

  const ICON = {
    more: '<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>',
    copy: '<path d="M9 9h10v12H9zM5 3h10v3H8v11H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    share: '<path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    dots: '<circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>',
    bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    help: '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.5 9.5a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 3.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.2"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    scale: '<path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm7 3a5 5 0 0 0-4.6 3h3.1l1.5-2 .5.4-1 1.6H16.6A5 5 0 0 0 12 7z" fill-rule="evenodd"/>',
    trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    image: '<path d="M4 5h16v14H4z M4 16l5-5 4 4 2-2 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="15.5" cy="9" r="1.6"/>',
    home: '<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    rank: '<path d="M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7z"/>',
    cal: '<path d="M7 2v3M17 2v3M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    menu: '<path d="M2 10h3V7h3v10H5v-3H2zm20 0h-3V7h-3v10h3v-3h3zM9 11h6v2H9z"/>',
    users: '<path d="M8.5 4.5 11 3.5q1 1.6 2 0l2.5 1 3 2.6-1.6 2.6-1.9-1.1V20h-8V8.6l-1.9 1.1L3.5 7.1z"/>',
    check: '<path d="M4 12.5 9.5 18 20 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
    gear: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm9 3.5-2.1-.8a7 7 0 0 0-.6-1.5l.9-2-1.9-1.9-2 .9a7 7 0 0 0-1.5-.6L13 4h-2l-.8 2.1a7 7 0 0 0-1.5.6l-2-.9-1.9 1.9.9 2a7 7 0 0 0-.6 1.5L3 12l2.1.8c.1.5.3 1 .6 1.5l-.9 2 1.9 1.9 2-.9c.5.3 1 .5 1.5.6L11 20h2l.8-2.1c.5-.1 1-.3 1.5-.6l2 .9 1.9-1.9-.9-2c.3-.5.5-1 .6-1.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    back: '<path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
    next: '<path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
    lock: '<path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z"/>',
    plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    reload: '<path d="M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    send: '<path d="M4 12 20 4l-5 16-3.5-6.5zM11.5 13.5 20 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    grid: '<path d="M4 5h16v14H4zM4 10h16M4 14.5h16M9.3 5v14M14.7 5v14" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    crown: '<path d="M4 18 3 8l5 4 4-6 4 6 5-4-1 10z" fill="currentColor"/><path d="M5 20.5h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    flag: '<path d="M6 21V4M6 4h11l-2 4 2 4H6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
  };
  const icon = (n) => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">' + ICON[n] + '</svg>';

  // ジャージ（背中側）。num に背番号の位置へ入れる文字、name に背中上部の名前
  // ジャージは部のユニホーム（2026年デザイン資料）をなぞった絵。index.html の #jk-front／#jk-back を使い回す
  const JK_VB = '0.6 4 132.1 106.2';
  function jersey(opt) {
    const kind = opt.kind || 'home';
    const front = kind === 'mark' || opt.front;
    const num = String(opt.num == null ? '' : opt.num);
    const fs = num.length >= 4 ? 20 : num.length === 3 ? 27 : 38;
    return '<svg class="jersey j-' + kind + (opt.cls ? ' ' + opt.cls : '') + '" viewBox="' + JK_VB + '" aria-hidden="true">' +
      '<use href="#jk-' + (front ? 'front' : 'back') + '"/>' +
      (!front && opt.name ? '<text x="66.6" y="27" class="jn-name" text-anchor="middle">' + esc(opt.name) + '</text>' : '') +
      (!front && num ? '<text x="66.6" y="' + (opt.name ? 64 : 60) + '" class="jn-num" text-anchor="middle" font-size="' + fs + '">' + esc(num) + (opt.suffix ? '<tspan class="jn-suf" font-size="' + Math.round(fs * 0.42) + '" dx="1">' + esc(opt.suffix) + '</tspan>' : '') + '</text>' : '') +
      (opt.shine ? '<g clip-path="url(#jk-clip)"><rect class="jk-shine" x="-70" y="0" width="56" height="112" fill="url(#jk-shine-g)"/></g>' : '') +
      '</svg>';
  }

  // ---------- 状態 ----------
  const S = {
    data: null, idx: null, loading: false, loadError: '', lastLoad: 0,
    token: store.get('token', ''), viewToken: store.get('viewToken', ''),
    kind: store.get('kind', 'week'), anchor: null,
    group: 'ALL', position: '', sort: 'count',
    menuTab: 'upcoming', menuGroup: 'ALL',
    rec: { date: null, edits: {}, group: 'ALL', position: '' },
    memberMonth: null, logs: null, route: { name: 'home', arg: '' }, counted: false,
    hist: {}, archive: null, recSort: store.get('recSort', 'pos')
  };
  const me = () => (S.data && S.data.me) || null;
  const can = (what) => {
    const m = me();
    if (!m) return false;
    if (what === 'record') return m.perm === 'admin' || m.perm === 'manager';
    if (what === 'menu') return m.perm === 'admin' || m.perm === 'leader';
    if (what === 'admin') return m.perm === 'admin';
    if (what === 'body') return m.perm === 'admin' || m.perm === 'manager' || m.perm === 'leader';
    if (what === 'archive') return m.perm === 'admin' || m.perm === 'manager' || m.perm === 'leader';
    return false;
  };
  const goal = () => L.goalOf(S.data && S.data.weekGoal);
  const positions = () => (S.data && S.data.positions && S.data.positions.length ? S.data.positions : FALLBACK_POS);
  const posOf = (code) => positions().find((p) => p.code === code) || null;
  const memberById = (id) => (S.data.members || []).find((m) => m.id === id) || null;
  const nameOf = (id) => { const m = memberById(id); return m ? m.name : ''; };
  const posLabel = (m) => (m.position ? m.position + (m.subs && m.subs.length ? '<small>/' + m.subs.map(esc).join('/') + '</small>' : '') : (m.group || '－'));
  const posText = (m) => (m.position ? m.position + (m.subs && m.subs.length ? '/' + m.subs.join('/') : '') : (m.group || '未設定'));

  // ---------- 通信 ----------
  async function api(op, payload) {
    const body = Object.assign({ op: op, device: DEVICE }, payload || {});
    if (S.token) body.token = S.token;
    if (S.viewToken) body.viewToken = S.viewToken;
    let res;
    try {
      res = await fetch(API, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' });
    } catch (e) {
      throw { code: 'network', message: '通信できませんでした。電波の状態を確認して、もう一度試してください。' };
    }
    let j;
    try { j = await res.json(); } catch (e) { throw { code: 'network', message: 'サーバーから正しい返事がありませんでした。少し待ってもう一度試してください。' }; }
    if (!j.ok) throw { code: j.error, message: j.message || 'エラーが起きました。' };
    return j;
  }

  // ---------- 画面のエラーを自動で記録（1回の起動で5件まで。通信のエラーなど、想定しているものは送らない） ----------
  let errSent = 0;
  function reportError(message, src, line) {
    if (errSent >= 5 || !message) return;
    errSent++;
    try {
      const body = { op: 'clientError', device: DEVICE, message: String(message).slice(0, 300), src: String(src || '').slice(0, 200), line: line || 0,
        page: (location.hash || '#home').split('/')[0], version: VERSION, ua: deviceName() };
      if (S.token) body.token = S.token;
      fetch(API, { method: 'POST', body: JSON.stringify(body), keepalive: true }).catch(() => {});
    } catch (e) { /* 記録できなくても画面は止めない */ }
  }
  window.addEventListener('error', (e) => {
    if (!e || !e.message || /ResizeObserver loop|^Script error\.?$/.test(e.message)) return;
    reportError(e.message, e.filename, e.lineno);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    if (!r || r.code) return; // サーバーが返したエラー（想定内）は送らない
    reportError(r.message || String(r), r.stack ? String(r.stack).split('\n')[1] || '' : '', 0);
  });

  function setData(d) {
    S.data = d;
    S.idx = d.locked ? null : L.buildIndex(d);
    S.lastLoad = Date.now();
    S.stampMap = {};
    (d.stamps || []).forEach((x) => { S.stampMap[x.t + '|' + x.e] = x; });
    if (S.token && !d.me) { S.token = ''; store.del('token'); }
    if (!d.locked) { d.savedAt = Date.now(); store.set('state2', d); }
  }
  /** その日の記録を入れ替え、通算（life）もそろえる（「通算○回」のおめでとうがずれないように） */
  function replaceDay(date, recs) {
    const life = S.data.life || (S.data.life = {});
    S.data.records.filter((x) => x[1] === date && +x[2] === 1).forEach((x) => { const l = life[x[0]]; if (l && --l[0] <= 0) delete life[x[0]]; });
    recs.filter((x) => +x[2] === 1).forEach((x) => { const l = life[x[0]] || (life[x[0]] = [0, x[1]]); l[0]++; if (x[1] < l[1]) l[1] = x[1]; });
    S.data.records = S.data.records.filter((x) => x[1] !== date).concat(recs);
  }
  async function loadState(range) {
    S.loading = true; S.loadError = '';
    try {
      const d = await api('state', range || (S.data && S.data.range ? { from: S.data.range.from, to: S.data.range.to } : {}));
      if (S.data && S.data.today && d.today !== S.data.today && !range) setData(await api('state', {}));
      else setData(d);
    } catch (e) {
      S.loadError = e.message;
    }
    S.loading = false;
  }
  async function ensureRange(from, to) {
    const r = S.data && S.data.range;
    if (!r || S.loading) return;
    if (from >= r.from && to <= r.to) return;
    await loadState({ from: from < r.from ? L.addDays(from, -14) : r.from, to: to > r.to ? L.addDays(to, 14) : r.to });
    render();
  }

  // ---------- トースト・シート ----------
  /** 何もない画面：小さな絵と、次にやること */
  const EMPTY_ART = {
    menu: '<rect x="18" y="14" width="44" height="54" rx="5"/><path d="M30 10h20v9H30zM28 32h24M28 42h24M28 52h14"/><g class="ea-acc"><path d="M50 58h18M53 53v10M65 53v10"/></g>',
    rank: '<path d="M14 66V46h16v20M32 66V34h16v32M50 66V52h16v14M10 66h60"/><g class="ea-acc"><circle cx="40" cy="20" r="6"/></g>',
    list: '<rect x="14" y="16" width="52" height="48" rx="5"/><path d="M24 30h32M24 40h32M24 50h20"/><g class="ea-acc"><path d="M58 52l5 5 9-11"/></g>',
    send: '<path d="M12 40 66 16 54 66 40 46z"/><g class="ea-acc"><path d="M40 46 66 16"/></g>',
    people: '<circle cx="30" cy="30" r="9"/><path d="M14 62c2-12 9-17 16-17s14 5 16 17"/><g class="ea-acc"><circle cx="54" cy="28" r="7"/><path d="M48 46c8-2 16 3 18 14"/></g>'
  };
  function emptyState(art, title, text, action) {
    return '<div class="empty-st"><svg class="ea" viewBox="0 0 80 80" aria-hidden="true">' + (EMPTY_ART[art] || EMPTY_ART.list) + '</svg>' +
      '<p class="es-t">' + title + '</p>' + (text ? '<p class="es-s">' + text + '</p>' : '') + (action || '') + '</div>';
  }
  /** 達成の紙吹雪（えんじ・白・金・黒。1.6秒で消える。動きを減らす設定では出さない） */
  function confetti() {
    if (reduceMotion() || document.hidden) return;
    const box = document.createElement('div');
    box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
    const colors = ['var(--enji-bg)', '#ffffff', 'var(--gold)', '#1d1d1f', 'var(--enji-bg)'];
    let html = '';
    for (let i = 0; i < 42; i++) {
      const x = 50 + (Math.random() - 0.5) * 70, dx = (Math.random() - 0.5) * 60, rot = Math.round(Math.random() * 720 - 360);
      const dl = Math.random() * 0.25, dur = 1.1 + Math.random() * 0.6, w = 6 + Math.random() * 5;
      html += '<i style="left:' + x.toFixed(1) + '%;--dx:' + dx.toFixed(1) + 'vw;--rot:' + rot + 'deg;width:' + w.toFixed(1) + 'px;height:' + (w * 0.45).toFixed(1) + 'px;background:' + colors[i % colors.length] +
        ';animation-delay:' + dl.toFixed(2) + 's;animation-duration:' + dur.toFixed(2) + 's"></i>';
    }
    box.innerHTML = html;
    document.body.appendChild(box);
    tick(14);
    setTimeout(() => box.remove(), 2200);
  }
  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    $('#toast-root').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, kind === 'err' ? 5000 : 2600);
  }
  let sheetLocked = false;
  // 閉じるときの動きは「抜け殻」（操作できない複製）で見せる。中身はすぐ消すので、閉じた直後に次のシートを開いても混ざらない
  let sheetGhost = null, ghostAt = 0;
  function dropGhost() { if (sheetGhost) { sheetGhost.remove(); sheetGhost = null; } }
  function openSheet(title, html, opt) {
    opt = opt || {};
    const replacing = !!$('#sheet-root .sheet') || (sheetGhost && performance.now() - ghostAt < 120);
    dropGhost();
    sheetLocked = !!opt.locked;
    $('#sheet-root').innerHTML =
      '<div class="sheet-bg' + (replacing ? ' still' : '') + '" data-act="sheet-bg"></div>' +
      '<section class="sheet' + (opt.wide ? ' wide' : '') + (replacing ? ' swap' : '') + (opt.locked ? ' locked' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<header class="sheet-h"><h2>' + esc(title) + '</h2>' +
      (opt.locked ? '' : '<button class="xbtn" data-act="sheet-close" aria-label="閉じる">×</button>') + '</header>' +
      '<div class="sheet-b">' + html + '</div></section>';
    document.body.classList.add('sheet-open');
    const f = $('#sheet-root [autofocus]');
    if (f) setTimeout(() => f.focus(), 50);
  }
  function closeSheet(drag) {
    sheetLocked = false;
    const root = $('#sheet-root'), sh = $('.sheet', root);
    dropGhost();
    if (sh && !reduceMotion()) {
      const g = document.createElement('div');
      g.className = 'sheet-ghost'; g.setAttribute('aria-hidden', 'true'); g.inert = true;
      while (root.firstChild) g.appendChild(root.firstChild);
      // 複製がテストや操作に拾われないよう、目印をはずす
      $$('[id],[data-act],[data-form],[name],[autofocus]', g).forEach((el) => ['id', 'data-act', 'data-form', 'name', 'autofocus'].forEach((a) => el.removeAttribute(a)));
      $$('.sheet, .sheet-bg, .sheet-h, .sheet-b', g).forEach((el) => { el.className = el.className.replace(/\bsheet(-bg|-h|-b)?\b/g, 'g$&'); });
      if (drag) g.style.setProperty('--drag', drag + 'px');
      document.body.appendChild(g);
      sheetGhost = g; ghostAt = performance.now();
      setTimeout(() => { if (sheetGhost === g) dropGhost(); else g.remove(); }, 320);
    }
    root.innerHTML = '';
    document.body.classList.remove('sheet-open');
  }
  // 下に引いて閉じる（スマホの縦長シートだけ。必ず入力してもらうシートは閉じない）
  (function sheetDrag() {
    let st = null;
    document.addEventListener('pointerdown', (ev) => {
      const h = ev.target.closest && ev.target.closest('#sheet-root .sheet-h');
      if (!h || ev.target.closest('button') || sheetLocked || innerWidth >= 560 || ev.button > 0) return;
      const sh = h.parentElement;
      st = { y: ev.clientY, t: performance.now(), sh, bg: $('#sheet-root .sheet-bg'), dy: 0, id: ev.pointerId };
      sh.classList.add('dragging');
      try { h.setPointerCapture(ev.pointerId); } catch (e) { /* なし */ }
    });
    document.addEventListener('pointermove', (ev) => {
      if (!st || ev.pointerId !== st.id) return;
      const raw = ev.clientY - st.y;
      st.dy = raw > 0 ? raw : -Math.pow(-raw, .6); // 上へはゴムのように少しだけ
      st.sh.style.transform = 'translateY(' + st.dy + 'px)';
      if (st.bg) st.bg.style.opacity = String(Math.max(0, 1 - Math.max(0, st.dy) / (st.sh.offsetHeight || 600)));
    });
    const end = (ev) => {
      if (!st || ev.pointerId !== st.id) return;
      const s = st; st = null;
      const v = s.dy / Math.max(1, performance.now() - s.t);
      s.sh.classList.remove('dragging');
      if (s.dy > Math.min(140, s.sh.offsetHeight * .3) || (s.dy > 24 && v > .5)) { tick(6); closeSheet(s.dy); return; }
      s.sh.style.transform = ''; if (s.bg) s.bg.style.opacity = '';
    };
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  })();
  // ---------- 引っぱって更新・横にはらって期間を送る（スマホ） ----------
  (function gestures() {
    let st = null, ind = null, busyPull = false;
    const PULL = 64;
    const indicator = () => {
      if (!ind) { ind = document.createElement('div'); ind.className = 'ptr'; ind.setAttribute('aria-hidden', 'true'); ind.innerHTML = '<span class="ptr-i">' + icon('reload') + '</span>'; document.body.appendChild(ind); }
      return ind;
    };
    const hide = () => { if (!ind) return; ind.classList.remove('loading', 'ready'); ind.classList.add('back'); ind.style.transform = ''; ind.style.opacity = ''; setTimeout(() => { if (ind) ind.classList.remove('back'); }, 300); };
    const blocked = (t) => !!t.closest('input, textarea, select, .matrix-wrap, .wk-wrap, .poschips, .seg, .stamps, .podium, .guide, #sheet-root, .sheet-ghost');
    document.addEventListener('touchstart', (ev) => {
      if (ev.touches.length !== 1 || !S.data || S.data.locked || busyPull || $('#sheet-root').innerHTML || $('#guide-root').innerHTML) { st = null; return; }
      const t = ev.touches[0];
      st = { x: t.clientX, y: t.clientY, t: performance.now(), top: window.scrollY <= 0, mode: '', d: 0, swipeOk: !blocked(ev.target), pullOk: !ev.target.closest('input, textarea, select, .wk-wrap, .guide') };
    }, { passive: true });
    document.addEventListener('touchmove', (ev) => {
      if (!st || ev.touches.length !== 1) return;
      const t = ev.touches[0], dx = t.clientX - st.x, dy = t.clientY - st.y;
      if (!st.mode) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        st.mode = Math.abs(dx) > Math.abs(dy) * 1.4 ? 'x' : (dy > 0 && st.top && st.pullOk ? 'pull' : 'none');
      }
      if (st.mode === 'pull') {
        st.d = Math.min(120, Math.max(0, dy) * 0.5);
        const el = indicator();
        el.style.transform = 'translate(-50%, ' + st.d + 'px) rotate(' + Math.round(st.d * 4) + 'deg)';
        el.style.opacity = String(Math.min(1, st.d / 40));
        el.classList.toggle('ready', st.d >= PULL);
      }
    }, { passive: true });
    document.addEventListener('touchend', async (ev) => {
      const s0 = st; st = null;
      if (!s0) return;
      if (s0.mode === 'pull') {
        if (s0.d < PULL || S.route.name === 'record' && recDirty()) { hide(); return; }
        busyPull = true;
        const el = indicator();
        el.classList.add('loading'); el.style.transform = 'translate(-50%, ' + PULL + 'px)'; el.style.opacity = '1';
        tick(8);
        // 通信が長引いても、くるくるが出たままにならないように（20秒で止める）
        const guard = setTimeout(() => { busyPull = false; hide(); }, 20000);
        try { await loadState(); render(); }
        finally { clearTimeout(guard); busyPull = false; hide(); }
        toast(S.loadError ? S.loadError : '最新の情報に更新しました', S.loadError ? 'err' : '');
        return;
      }
      if (s0.mode !== 'x' || !s0.swipeOk) return;
      const t = ev.changedTouches[0], dx = t.clientX - s0.x, dy = t.clientY - s0.y, dt = performance.now() - s0.t;
      if (Math.abs(dx) < 70 || Math.abs(dy) > 50 || dt > 700) return;
      const v = dx < 0 ? '1' : '-1';
      const r = S.route.name;
      if (r === 'home' || r === 'rank' || r === 'cal') {
        const p = curPeriod();
        const n = v === '1' ? L.nextPeriod(S.kind, p.from) : L.prevPeriod(S.kind, p.from);
        if (n.from > S.data.today) { const m = $('#main'); if (m) { m.classList.remove('nudge'); void m.offsetWidth; m.classList.add('nudge'); } return; }
        tick(6); acts.period({ dataset: { v: v } });
      } else if (r === 'member' && S.memberMonth) {
        if (v === '1' && L.addMonths(S.memberMonth, 1) > S.data.today) return;
        tick(6); acts.mmonth({ dataset: { v: v } });
      }
    }, { passive: true });
    document.addEventListener('touchcancel', () => { if (st && st.mode === 'pull') hide(); st = null; }, { passive: true });
  })();

  function sheetErrorIn(f, msg) {
    const el = f && $('.form-err', f);
    if (el) { el.textContent = msg; el.hidden = !msg; } else if (msg) toast(msg, 'err');
  }
  function sheetError(msg) {
    const el = $('#sheet-root .form-err');
    if (el) { el.textContent = msg; el.hidden = !msg; } else if (msg) toast(msg, 'err');
  }
  async function busy(btn, fn) {
    if (btn && btn.disabled) return;
    const label = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>' + label; }
    try { await fn(); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; } }
  }

  // ---------- 期間・絞り込み ----------
  function curPeriod() {
    const a = S.anchor || S.data.today;
    return S.kind === 'week' ? L.weekRange(a) : L.monthRange(a);
  }
  function periodLabel(p) {
    const t = S.data.today;
    // 見出しは必ず2行（今週／先週／3週前、今月／先月／3か月前 ＋ 日付）。幅も固定して、切り替えで矢印が動かないように
    let tag;
    if (S.kind === 'week') {
      const n = Math.round((L.parse(L.weekStart(t)) - L.parse(p.from)) / (7 * 86400000));
      tag = n <= 0 ? '今週' : n === 1 ? '先週' : n + '週前';
    } else {
      const n = (+t.slice(0, 4) - +p.from.slice(0, 4)) * 12 + (+t.slice(5, 7) - +p.from.slice(5, 7));
      tag = n <= 0 ? '今月' : n === 1 ? '先月' : n + 'か月前';
    }
    return { tag: tag, text: S.kind === 'week' ? mdw(p.from) + '〜' + mdw(p.to) : ymLabel(p.from) };
  }
  function periodBar() {
    const p = curPeriod(), lb = periodLabel(p), t = S.data.today;
    const atNow = t >= p.from && t <= p.to;
    return '<div class="pbar">' +
      '<div class="seg" role="group" aria-label="集計の期間">' +
      '<button data-act="kind" data-v="week" aria-pressed="' + (S.kind === 'week') + '">週間</button>' +
      '<button data-act="kind" data-v="month" aria-pressed="' + (S.kind === 'month') + '">月間</button></div>' +
      '<div class="pnav"><button class="ibtn" data-act="period" data-v="-1" aria-label="前の' + (S.kind === 'week' ? '週' : '月') + '">' + icon('back') + '</button>' +
      '<div class="plabel"><b>' + lb.tag + '</b><span>' + lb.text + '</span></div>' +
      '<button class="ibtn" data-act="period" data-v="1" aria-label="次の' + (S.kind === 'week' ? '週' : '月') + '"' + (atNow ? ' disabled' : '') + '>' + icon('next') + '</button></div></div>';
  }
  /** 全体・FW・BK の絞り込み（v2.11 からポジションの絞り込みはなし）。act は data-act の前置き（例 'f' → f-group） */
  function filterBar(group, act) {
    return '<div class="fbar"><div class="seg small" role="group" aria-label="グループ">' +
      ['ALL', 'FW', 'BK'].map((g) => '<button data-act="' + act + '-group" data-v="' + g + '" aria-pressed="' + (group === g) + '">' + MGROUP[g] + '</button>').join('') + '</div></div>';
  }
  function filterOpt() { return { group: S.position ? 'ALL' : S.group, position: S.position, goal: goal() }; }


  function delta(cur, prev, unit) {
    const d = cur - prev;
    const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
    return '<span class="delta ' + cls + '">' + (d > 0 ? '▲' : d < 0 ? '▼' : '±') + Math.abs(d) + unit + '</span>';
  }

  // ---------- ホーム ----------
  function vHome() {
    const d = S.data, today = d.today, p = curPeriod(), pv = L.prevPeriod(S.kind, p.from);
    const cur = L.periodStats(d, S.idx, p.from, p.to, today, { goal: goal() });
    const isNow = today >= p.from && today <= p.to;
    // 途中の週・月は、前の期間も「同じ時点まで」で比べる（月の半ばに前の月まるごとと比べない）
    const span = Math.round((Date.parse(today) - Date.parse(p.from)) / 864e5);
    const pvTo = isNow && L.addDays(pv.from, span) < pv.to ? L.addDays(pv.from, span) : pv.to;
    const pre = L.periodStats(d, S.idx, pv.from, pvTo, today, { goal: goal() });
    const rk = L.rank(cur.rows, 'count');
    const ranked = rk.filter((r) => r.rank !== null);
    const prevWord = (S.kind === 'week' ? '前の週' : '前の月') + (pvTo !== pv.to ? 'の同じ時点' : '');
    const t = cur.team;
    let h = pinReqBanner() + selfCard() + periodBar();
    h += '<section class="board" aria-label="部全体の状況"><svg class="board-streaks" viewBox="25 40 85 66" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><use href="#jk-streaks"/></svg>' +
      '<div class="board-main"><div class="board-k">部全体の実施回数</div>' +
      '<div class="board-v"><span class="num" data-count="' + t.done + '">' + t.done + '</span><span class="unit">回</span></div>' +
      '<div class="board-s">' + prevWord + ' ' + pre.team.done + '回 ' + delta(t.done, pre.team.done, '回') + '</div></div>' +
      '<div class="board-side">' +
      goalCell(t) +
      '</div></section>';
    // ホームは「いまの状況」だけ。くわしい分析はランキングの「分析」へ
    if (isNow) h += todayCard();
    if (S.kind === 'week') h += goalBlock(cur.rows, isNow, p);
    if (S.kind === 'week' && isNow) h += voiceBlock();
    h += '<section class="block"><div class="block-h"><h2>ランキング</h2><a class="more" href="#rank">すべて見る</a></div>';
    if (!ranked.length) h += emptyState('rank', 'この期間の記録はまだありません', can('record') ? 'やった人の「実施した」を押すと、ここに順位が出ます。' : 'マネージャーが記録すると、ここに順位が出ます。', can('record') ? '<div class="toolbar center"><a class="btn primary" href="#record">' + icon('check') + '記録をつける</a></div>' : '');
    else {
      const pod = podiumPeople(ranked);
      // ホームは表彰台だけ（4位から下はランキングで）。表彰台に乗せきれないときは上位3行
      if (pod.length) h += podium(pod);
      else h += '<ol class="rlist">' + ranked.slice(0, 3).map(rankRow).join('') + '</ol>';
    }
    h += '</section>';
    if (isNow) h += feedBlock();
    if (S.kind === 'month') h += awardsBlock(cur.rows, pre.rows, p, isNow);
    h += '<a class="to-stats" href="#rank" data-act="to-stats">' + icon('rank') + '<span><b>くわしい分析</b><small>FW対BK・ポジション別・達成率の分布' + (S.kind === 'month' ? '・週ごとの達成' : '') + '</small></span>' + icon('next') + '</a>';
    return h;
  }

  // 週◯回（マスト）の達成。週間は人数、月間は「終わった週」の達成率
  function goalCell(t) {
    // 週間・月間とも「週◯回の達成率」。％＋メーター＋内訳1行の同じ形（切り替えで高さが変わらない）
    const g = t.goal;
    let r, sub;
    if (S.kind === 'week') {
      const n = t.goalNow + t.goalClosed, ok = t.goalNowOk + t.goalHit;
      r = n ? Math.round(ok / n * 100) : null;
      sub = n ? '達成 ' + ok + '/' + n + '人' + (t.goalNowEx ? '・免除' + t.goalNowEx + '人' : '') : (t.goalNowEx ? '今週は全員免除' : 'まだ対象の人がいません');
    } else {
      r = t.goalClosed ? Math.round(t.goalHit / t.goalClosed * 100) : null;
      sub = t.goalClosed ? '達成 ' + t.goalHit + '/' + t.goalClosed + '週（人×週）' : 'まだ終わった週がありません';
    }
    return '<div class="board-cell"><div class="board-k">週' + g + '回の達成率（マスト）</div>' +
      '<div class="board-v2"><span class="num"' + (r === null ? '' : ' data-count="' + r + '"') + '>' + (r === null ? '－' : r) + '</span>' + (r === null ? '' : '<span class="unit">%</span>') + '</div>' +
      '<div class="meter" role="img" aria-label="' + (r || 0) + '%"><i style="width:' + (r || 0) + '%"></i></div>' +
      '<div class="board-s">' + sub + '</div></div>';
  }
  function goalBlock(rows, isNow, p) {
    const g = goal();
    const list = rows.filter((r) => r.goal.weeks.length).map((r) => Object.assign({ w: r.goal.weeks[0] }, r));
    if (!list.length) return '';
    const exempt = list.filter((r) => r.w.exempt).sort((a, b) => a.sort - b.sort);
    const miss = list.filter((r) => !r.w.exempt && !r.w.ok).sort((a, b) => (a.w.left - b.w.left) || (b.w.count - a.w.count) || (a.sort - b.sort));
    const okN = list.filter((r) => r.w.ok).length;
    let h = '<section class="block goal"><div class="block-h"><h2>週' + g + '回（マスト）' + (isNow ? 'まだの人' : '未達の人') + '</h2><span class="count">' + miss.length + '人</span></div>';
    if (!miss.length) h += '<p class="goal-all">' + icon('check') + '全員が週' + g + '回を達成' + (isNow ? 'しています' : 'しました') + '。</p>';
    else {
      const li = (r) => '<li><a href="#member/' + r.id + '"><span class="goal-n">' + esc(r.name) + '</span>' +
        '<span class="goal-c"><b class="num">' + r.w.count + '</b>/' + r.w.need + '</span>' +
        '<span class="goal-s' + (isNow ? '' : ' ng') + '">' + (isNow ? 'あと' + r.w.left : '未達') + '</span></a></li>';
      const FIRST = 8;
      h += '<ul class="goal-list">' + miss.slice(0, FIRST).map(li).join('') + '</ul>';
      if (miss.length > FIRST) h += '<details class="goal-more"><summary>ほか ' + (miss.length - FIRST) + '人を見る</summary><ul class="goal-list">' + miss.slice(FIRST).map(li).join('') + '</ul></details>';
    }
    if (exempt.length) h += '<p class="goal-ex"><b>今週は免除</b>' + exempt.map((r) => '<a href="#member/' + r.id + '">' + esc(r.name) + '</a>').join('、') + '</p>';
    if (can('record') || can('menu')) h += '<div class="share-row"><button class="btn small" data-act="goal-copy" data-from="' + p.from + '">' + icon('copy') + 'LINE用の文章をコピー</button>' +
      '<button class="btn small line" data-act="goal-line" data-from="' + p.from + '">LINEで送る</button></div>';
    return h + '</section>';
  }
  /** LINE に貼る文章（その週の「まだの人」） */
  function goalText(from) {
    const d = S.data, today = d.today, to = L.addDays(from, 6), g = goal();
    const st = L.periodStats(d, S.idx, from, to, today, { goal: g });
    const list = st.rows.filter((r) => r.goal.weeks.length).map((r) => Object.assign({ w: r.goal.weeks[0] }, r));
    const open = to >= today;
    const miss = list.filter((r) => !r.w.exempt && !r.w.ok);
    const okN = list.filter((r) => r.w.ok).length, n = list.filter((r) => !r.w.exempt).length;
    const sn = (r) => r.name.split(/\s+/)[0];
    const dup = {}; list.forEach((r) => { dup[sn(r)] = (dup[sn(r)] || 0) + 1; });
    const sur = (r) => (dup[sn(r)] > 1 ? r.name : sn(r)); // 同じ名字が2人以上いればフルネーム
    let t = '【筋トレ 週' + g + '回チェック】' + mdw(from) + '〜' + mdw(to) + '\n';
    t += '達成 ' + okN + '/' + n + '人' + (open ? '（' + mdw(to) + 'まで）' : '') + '\n';
    if (!miss.length) t += '\n全員達成！' + (open ? 'この調子で' : 'おつかれさま') + '\n';
    else if (open) {
      const by = {};
      miss.forEach((r) => { (by[r.w.left] = by[r.w.left] || []).push(r); });
      Object.keys(by).sort((a, b) => a - b).forEach((k) => { t += '\nあと' + k + '回：' + by[k].sort((a, b) => a.sort - b.sort).map(sur).join('、'); });
      t += '\n\n' + mdw(to) + 'までに週' + g + '回！\n';
    } else {
      t += '\n未達：' + miss.sort((a, b) => a.sort - b.sort).map((r) => sur(r) + '(' + r.w.count + '/' + r.w.need + ')').join('、') + '\n';
    }
    return t + location.origin + location.pathname;
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (x) { ok = false; }
      ta.remove(); return ok;
    }
  }

  function todayCard() {
    const d = S.data, today = d.today;
    const ds = L.dayStatus(d, S.idx, today);
    const menus = S.idx.menusByDate[today] || [];
    if (!menus.length && !can('record')) return '';
    let h = '<section class="todaycard"><div class="today-h"><h2><span>今日</span>' + mdw(today) + '</h2>' +
      (can('record') ? '<a class="btn small primary" href="#record">' + icon('check') + '記録する</a>' : '') + '</div>';
    if (menus.length) {
      h += '<ul class="today-menus">' + menus.map((w) => '<li><button data-act="menu-open" data-id="' + w.id + '">' + targetChip(w) + '<b>' + esc(w.title) + '</b><span>対象' + w.targets.length + '人</span></button></li>').join('') + '</ul>';
      h += '<p class="today-s">メニュー対象者のうち <b>' + ds.targetDone + '/' + ds.targets + '人</b> が実施' + (ds.targets > ds.targetDone ? '。記録の無い人は明日から「実施していない」になります' : '') + '</p>';
    } else h += '<p class="today-s">今日のFWリーダーメニューはありません。</p>';
    if (ds.othersDone) h += '<p class="today-s">メニュー対象以外で実施 <b>' + ds.othersDone + '人</b></p>';
    return h + '</section>';
  }
  function targetChip(w) {
    if (w.positions && w.positions.length) return '<span class="chip g-' + w.group + '">' + w.positions.map(esc).join('・') + '</span>';
    return '<span class="chip g-' + w.group + '">' + MGROUP[w.group] + '</span>';
  }

  /** 表彰台に乗せる人：3位以内の人（同率はみんな）。5人をこえるときは1位の人だけ、それでも多ければ乗せない */
  function podiumPeople(ranked) {
    let top = ranked.filter((r) => r.rank !== null && r.rank <= 3);
    if (top.length > 5) top = ranked.filter((r) => r.rank === 1);
    return top.length > 5 ? [] : top;
  }
  function podium(top) {
    const tie = top.filter((r) => r.rank === 1).length > 1 || top.length > 3; // 1位が複数・4人以上のときだけ横並び
    // 同率がなければ 2位・1位・3位 の並び。同率があれば順位の順に同じ大きさで並べる
    const order = !tie && top.length === 3 ? [top[1], top[0], top[2]] : top;
    return '<ol class="podium n' + top.length + (tie ? ' tie' + (top.length > 3 ? ' many' : '') : '') + '">' + order.map((r) =>
      '<li class="pod r' + r.rank + (r.rank === 1 ? ' lead' : '') + '"><a href="#member/' + r.id + '" aria-label="' + r.rank + '位 ' + esc(r.name) + ' ' + r.done + '回">' +
      jersey({ num: r.rank, suffix: '位', name: r.name.split(/\s+/)[0], shine: r.rank === 1 && top.filter((x) => x.rank === 1).length === 1 }) +
      '<span class="pod-name">' + esc(r.name) + '</span>' +
      '<span class="pod-val"><span class="num">' + r.done + '</span>回' + (r.rate !== null ? '<small>' + Math.round(r.rate * 100) + '%</small>' : '') + '</span>' +
      '</a></li>').join('') + '</ol>';
  }
  function rankRow(r) {
    return '<li class="rrank' + (r.rank && r.rank <= 3 ? ' is-top' : '') + '"><a href="#member/' + r.id + '">' +
      '<span class="rk">' + (r.rank === null ? '－' : r.rank + '<small>位</small>') + '</span>' +
      '<span class="rname"><b>' + esc(r.name) + '</b><small><span class="pos-tag g-' + (r.group || 'X') + '">' + posLabel(r) + '</span></small></span>' +
      '<span class="rcount"><span class="num">' + r.done + '</span>回</span>' +
      '<span class="rrate">' + (r.rate === null ? '<span class="dash">－</span>' : '<span class="num">' + Math.round(r.rate * 100) + '</span>%') + '</span>' +
      '</a></li>';
  }

  function formationBlock(p) {
    const d = S.data;
    const ps = L.positionStats(d, S.idx, p.from, p.to, d.today, positions());
    const max = Math.max(1, ...positions().map((x) => (ps[x.code].members ? ps[x.code].done / ps[x.code].members : 0)));
    let h = '<section class="block"><div class="block-h"><h2>ポジション別</h2><span class="count">1人あたりの実施回数</span></div>' +
      '<div class="pitch" role="list">' +
      '<svg class="pitch-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
      '<rect x="1" y="1" width="98" height="98" rx="2"/><line x1="1" y1="16" x2="99" y2="16" class="dash"/><line x1="1" y1="46" x2="99" y2="46"/><line x1="1" y1="76" x2="99" y2="76" class="dash"/></svg>';
    positions().forEach((pos) => {
      const s = ps[pos.code];
      const xy = FORMATION[pos.code] || [50, 50];
      const per = s.members ? s.done / s.members : 0;
      const heat = s.members ? Math.max(0.15, per / max) : 0;
      h += '<div role="listitem" class="pnode' + (s.members ? '' : ' empty') + '" style="left:' + xy[0] + '%;top:' + xy[1] + '%;--heat:' + heat.toFixed(2) + '" aria-label="' + esc(pos.name) + ' ' + s.members + '人 実施' + s.done + '回">' +
        jersey({ num: pos.code, kind: s.members ? 'heat' : 'ghost', cls: 'pj' }) +
        '<span class="pn-num">' + pos.numbers.join('・') + '</span>' +
        '<span class="pn-val">' + (s.members ? '<b class="num">' + (Math.round(per * 10) / 10) + '</b>回<small>' + s.members + '人</small>' : '<small>0人</small>') + '</span></div>';
    });
    h += '</div>';
    const none = ps[''];
    h += '<p class="note">ジャージが濃いほど、1人あたりの実施回数が多いポジションです。' +
      (none.members ? '<br>ポジション未設定の部員が ' + none.members + '人います。' + (can('admin') ? '<a href="#members">部員</a>の「まとめて編集」で設定できます。' : '') : '') + '</p></section>';
    return h;
  }

  // ---------- 月間の表彰（MVP・週◯回の皆勤・いちばん伸びた人） ----------
  function awardsOf(rows, preRows) {
    const top = Math.max(0, ...rows.map((r) => r.done));
    const mvp = top > 0 ? rows.filter((r) => r.done === top).sort((a, b) => a.sort - b.sort) : [];
    const perfect = rows.filter((r) => r.goal.every).sort((a, b) => (b.done - a.done) || (a.sort - b.sort));
    const prev = {};
    (preRows || []).forEach((r) => { prev[r.id] = r.done; });
    let best = 0;
    rows.forEach((r) => { if (prev[r.id] !== undefined) best = Math.max(best, r.done - prev[r.id]); });
    const up = best > 0 ? rows.filter((r) => prev[r.id] !== undefined && r.done - prev[r.id] === best).sort((a, b) => a.sort - b.sort) : [];
    return { top: top, mvp: mvp, perfect: perfect, up: up, best: best, closed: Math.max(0, ...rows.map((r) => r.goal.closed)) };
  }
  function awardsBlock(rows, preRows, p, isNow) {
    const a = awardsOf(rows, preRows), g = goal();
    if (!a.mvp.length && !a.perfect.length) return '';
    const names = (list) => list.map((r) => '<a href="#member/' + r.id + '">' + esc(r.name) + '</a>').join('、');
    let h = '<section class="block awards"><div class="block-h"><h2>' + ymLabel(p.from) + 'の表彰' + (isNow ? '<small>（途中）</small>' : '') + '</h2></div><ul class="award-list">';
    if (a.mvp.length) h += '<li><span class="award-k">MVP</span><span class="award-v">' + names(a.mvp) + '<small>実施 ' + a.top + '回</small></span></li>';
    if (a.perfect.length) h += '<li><span class="award-k">週' + g + '回 皆勤</span><span class="award-v">' + names(a.perfect.slice(0, 12)) + (a.perfect.length > 12 ? ' ほか' + (a.perfect.length - 12) + '人' : '') + '<small>終わった' + a.closed + '週すべて達成</small></span></li>';
    if (a.up.length) h += '<li><span class="award-k">いちばん伸びた</span><span class="award-v">' + names(a.up) + '<small>前の月より +' + a.best + '回</small></span></li>';
    h += '</ul><div class="share-row"><button class="btn small" data-act="award-copy" data-from="' + p.from + '">' + icon('copy') + 'LINE用の文章をコピー</button></div></section>';
    return h;
  }
  function monthAwards(from) {
    const d = S.data, today = d.today, p = L.monthRange(from), pv = L.prevPeriod('month', p.from);
    const cur = L.periodStats(d, S.idx, p.from, p.to, today, { goal: goal() });
    const pre = L.periodStats(d, S.idx, pv.from, pv.to, today, { goal: goal() });
    return { p: p, a: awardsOf(cur.rows, pre.rows), open: today <= p.to };
  }
  function awardText(from) {
    const x = monthAwards(from), a = x.a, g = goal();
    let t = '【筋トレ ' + ymLabel(x.p.from) + 'の表彰】' + (x.open ? '（途中）' : '') + '\n';
    if (a.mvp.length) t += '\nMVP：' + a.mvp.map((r) => r.name).join('、') + '（' + a.top + '回）';
    if (a.perfect.length) t += '\n週' + g + '回 皆勤：' + a.perfect.map((r) => r.name).join('、');
    if (a.up.length) t += '\nいちばん伸びた：' + a.up.map((r) => r.name).join('、') + '（+' + a.best + '回）';
    return t + '\n\n' + location.origin + location.pathname;
  }
  function continuityBlock(rows) {
    const g = goal();
    const list = rows.filter((r) => r.goal.weeks.length);
    if (!list.length) return '';
    list.sort((a, b) => (b.goal.hit - a.goal.hit) || (b.done - a.done) || (a.sort - b.sort));
    const closed = Math.max(...list.map((r) => r.goal.closed));
    const every = list.filter((r) => r.goal.every);
    let h = '<section class="block"><div class="block-h"><h2>週' + g + '回の達成（マスト）</h2></div>' +
      (closed ? '<p class="lead-line"><span class="num">' + every.length + '</span>人が、終わった' + closed + '週すべてで週' + g + '回を達成しています。</p>' : '<p class="lead-line small">この月はまだ終わった週がありません。</p>') + '<ul class="cont">';
    list.forEach((r) => {
      const gs = r.goal;
      h += '<li><a href="#member/' + r.id + '"><span class="cont-n">' + esc(r.name) + '</span>' +
        '<span class="cont-w" role="img" aria-label="' + gs.closed + '週のうち' + gs.hit + '週で達成">' + gs.weeks.map((w) => '<i class="' + (w.exempt ? 'ex' : w.ok ? 'on' : w.open ? 'open' : 'ng') + '" title="' + mdw(w.from) + '〜 ' + (w.exempt ? '免除' : w.count + '/' + w.need + '回') + '"></i>').join('') + '</span>' +
        '<span class="cont-v">' + gs.hit + '/' + gs.closed + '週</span></a></li>';
    });
    return h + '</ul><p class="note">月曜始まりの週ごとに、' + g + '回以上「実施した」なら ■（達成）、足りなければ赤枠、終わっていない週は点線、灰色は免除の週。月曜がその月にある週を、その月に数えます。</p></section>';
  }

  // ---------- 応援スタンプ・おめでとう・ピンチ ----------
  const STAMPS = [['clap', '👏', 'すごい'], ['fire', '🔥', '燃えてる'], ['muscle', '💪', 'ナイス筋トレ'], ['party', '🎉', 'おめでとう'], ['hundred', '💯', '完璧'],
    ['rugby', '🏉', 'ナイスラン'], ['crown', '👑', '王者'], ['star', '⭐', 'キラリ'], ['cheer', '📣', 'がんばれ']];
  const stampOf = (t, e) => (S.stampMap && S.stampMap[t + '|' + e]) || { t: t, e: e, c: {}, f: [], mine: [] };
  function stampBar(target, event, opt) {
    const x = stampOf(target, event);
    const own = PREF.self && PREF.self === target;
    const open = S.stampOpen && S.stampOpen[target + '|' + event];
    let extra = 0;
    // ふだんは押されたスタンプだけを見せる。「＋」で全部（9種類）を出す
    const btns = STAMPS.map((k) => {
      const n = x.c[k[0]] || 0, on = x.mine.indexOf(k[0]) >= 0;
      const ex = !n && !on;
      if (ex) extra++;
      return '<button class="stamp' + (on ? ' on' : '') + (n ? '' : ' zero') + (ex ? ' extra' : '') + '" data-act="stamp" data-k="' + k[0] + '" aria-pressed="' + on + '" aria-label="' + k[2] + (n ? ' ' + n : '') + '"' + (own ? ' disabled' : '') + '><span aria-hidden="true">' + k[1] + '</span>' + (n ? '<b class="num">' + n + '</b>' : '') + '</button>';
    }).join('');
    return '<div class="stamps' + (opt && opt.small ? ' small' : '') + (open ? ' open' : '') + '" data-t="' + esc(target) + '" data-e="' + esc(event) + '">' + btns +
      (extra && !own ? '<button class="stamp more' + (extra === STAMPS.length && !open ? ' first' : '') + '" data-act="stamp-more" aria-label="' + (open ? 'スタンプを閉じる' : '応援スタンプを押す') + '" aria-expanded="' + !!open + '"><span aria-hidden="true">' + (open ? '−' : '＋') + '</span>' + (extra === STAMPS.length && !open ? '<small>おめでとう</small>' : '') + '</button>' : '') + '</div>';
  }
  function stampSum(list) {
    const c = {};
    list.forEach((x) => { Object.keys(x.c).forEach((k) => { c[k] = (c[k] || 0) + x.c[k]; }); });
    const total = Object.keys(c).reduce((a, k) => a + c[k], 0);
    return { c: c, total: total, html: STAMPS.filter((k) => c[k[0]]).map((k) => '<span class="ssum">' + k[1] + '<b class="num">' + c[k[0]] + '</b></span>').join('') };
  }
  /** その人あての応援（新しい順） */
  function cheersFor(id) {
    return (S.data.stamps || []).filter((x) => x.t === id && Object.keys(x.c).length).sort((a, b) => (a.at < b.at ? 1 : -1));
  }
  function eventLabel(e) {
    const k = e.split(':');
    if (k[0] === 'g') return mdw(k[1]) + 'の週 週' + goal() + '回達成';
    if (k[0] === 'c') return '通算' + k[1] + '回';
    if (k[0] === 'f') return '初めての記録';
    if (k[0] === 'v') return mdw(k[1]) + 'の週のMVP';
    if (k[0] === 'b') { const b = L.badgeList(goal()).find((x) => x.key === k[1]); return '称号「' + (b ? b.name : k[1]) + '」'; }
    return '';
  }
  function fromNames(list) {
    const ids = [];
    list.forEach((x) => (x.f || []).forEach((id) => { if (ids.indexOf(id) < 0) ids.push(id); }));
    const names = ids.map(nameOf).filter(Boolean);
    return names.length ? names.slice(0, 3).map(esc).join('、') + (names.length > 3 ? 'ほか' : '') + ' から' : '';
  }

  /** 「わたし」：設定で自分の名前を選んだ人だけに出す */
  function selfCard() {
    const m = PREF.self && memberById(PREF.self);
    if (!m || !m.player || !m.active) return '';
    const today = S.data.today, ws = L.weekStart(today), g = goal();
    const c = L.weekCount(S.idx, m, ws), nd = L.weekNeed(S.idx, m, ws, g);
    const streak = L.streakWeeks(S.idx, m, today, S.data.range.from, g);
    const recent = cheersFor(m.id).filter((x) => x.at.slice(0, 10) >= L.addDays(today, -14));
    const sum = stampSum(recent);
    const state = nd.need === 0 ? '今週は免除' : c >= nd.need ? '今週の週' + nd.need + '回 達成' : 'あと' + (nd.need - c) + '回で今週の達成';
    const hit = nd.need && c >= nd.need;
    if (hit && !store.get('cele:' + m.id + ':' + ws, 0)) S.celebrate = { key: 'cele:' + m.id + ':' + ws, text: '今週の週' + nd.need + '回を達成しました' };
    const ms = milestoneOf(m);
    if (ms && !store.get('cele:' + m.id + ':' + ms.key, 0)) S.celebrate = { key: 'cele:' + m.id + ':' + ms.key, text: '通算' + ms.n + '回になりました' };
    return '<a class="selfcard' + (ms ? ' mile' : '') + '" href="#member/' + m.id + '"><span class="self-j">' + jersey({ num: c, name: m.name.split(/\s+/)[0] }) + '</span>' +
      '<span class="self-t"><small>わたし</small><b>' + esc(m.name) + '</b>' + (ms ? '<span class="self-m">通算<b class="num">' + ms.n + '</b>回 達成！</span>' : '') +
      '<span class="self-s' + (hit ? ' ok' : '') + '">' + state + (streak ? '・' + streak + '週連続' : '') + '</span>' +
      '<span class="self-p">' + vsLastWeek(c, lastWeekSoFar(m, today)) + '</span>' +
      (sum.total ? '<span class="self-c">' + fromNames(recent) + 'おめでとうが届いています ' + sum.html + '</span>' : '') + '</span>' + icon('next') + '</a>';
  }
  /** 最近7日に通算の節目（10・30・50・100回…）を迎えたか。迎えた日と回数 */
  function milestoneOf(m) {
    const lf = S.data.life && S.data.life[m.id];
    if (!lf) return null;
    const ds = L.doneDates(S.idx, m.id), before = lf[0] - ds.length, since = L.addDays(S.data.today, -7);
    let hit = null;
    ds.forEach((d, i) => { const n = before + i + 1; if (d >= since && L.TOTAL_MARKS.indexOf(n) >= 0) hit = { n: n, date: d, key: 'c:' + n }; });
    return hit;
  }
  function pinchBlock() {
    const list = L.pinchList(S.data, S.idx, S.data.today, goal(), S.data.range.from);
    if (!list.length) return '';
    const g = goal();
    return '<div class="pinch"><h3 class="sub3">連続記録がピンチ<small>' + list.length + '人</small></h3>' +
      '<ul class="pinch-list">' + list.map((r) => '<li class="' + (r.slack <= 0 ? 'hot' : r.slack <= 1 ? 'warm' : '') + '"><a href="#member/' + r.id + '">' +
        '<span class="pinch-n">' + esc(r.name) + '<small>' + r.streak + '週連続中</small></span>' +
        '<span class="pinch-v">あと<b class="num">' + r.left + '</b>回<small>' + (r.slack < 0 ? '今週は届かない' : '残り' + r.daysLeft + '日') + '</small></span></a></li>').join('') + '</ul></div>';
  }
  function feedBlock() {
    const ev = L.feedEvents(S.data, S.idx, S.data.today, goal(), S.data.life || {}, 10);
    if (!ev.length) return '';
    const FIRST = 4;
    const li = (e) => {
      const what = e.kind === 'goal' ? '週' + goal() + '回を達成' + (e.streak >= 2 ? '<em>' + e.streak + '週連続</em>' : '')
        : e.kind === 'total' ? '通算<em>' + e.n + '回</em>' : '初めての記録';
      return '<li class="feed-i' + (e.mark || e.kind !== 'goal' ? ' big' : '') + '"><div class="feed-h"><a href="#member/' + e.id + '"><b>' + esc(e.name) + '</b></a><span>' + what + '</span><time>' + mdw(e.date) + '</time></div>' + stampBar(e.id, e.key, { small: true }) + '</li>';
    };
    let h = '<section class="block feed"><div class="block-h"><h2>おめでとう</h2><span class="count">最近10日</span></div><ul class="feed-list">' + ev.slice(0, FIRST).map(li).join('') + '</ul>';
    if (ev.length > FIRST) h += '<details class="goal-more"><summary>ほか ' + (ev.length - FIRST) + '件を見る</summary><ul class="feed-list">' + ev.slice(FIRST).map(li).join('') + '</ul></details>';
    return h + '</section>';
  }
  // ---------- v2.9：MVP・FW対BK・落ちてきている人・分布・先週との比べ ----------
  /** 声をかけたい人：連続がピンチ（みんな）と、落ちてきている人（スタッフだけ）をひとつに */
  function voiceBlock() {
    const pin = pinchBlock(), slip = slipBlock();
    if (!pin && !slip) return '';
    return '<section class="block voice"><div class="block-h"><h2>声をかけたい人</h2></div>' + pin + slip + '</section>';
  }
  /** FW対BK：1人あたりの実施回数で比べる（週の目標の達成率も添える） */
  function versusBlock(p) {
    const d = S.data;
    const side = (g) => {
      const st = L.periodStats(d, S.idx, p.from, p.to, d.today, { goal: goal(), group: g });
      const t = st.team, n = st.rows.length;
      const ach = S.kind === 'week' ? (t.goalNow + t.goalClosed ? (t.goalNowOk + t.goalHit) / (t.goalNow + t.goalClosed) : null) : (t.goalClosed ? t.goalHit / t.goalClosed : null);
      return { g: g, n: n, done: t.done, per: n ? t.done / n : 0, ach: ach };
    };
    const fw = side('FW'), bk = side('BK');
    if (!fw.n || !bk.n) return '';
    const sum = fw.per + bk.per, share = sum ? fw.per / sum : 0.5;
    const lead = Math.abs(fw.per - bk.per) < 0.05 ? '' : fw.per > bk.per ? 'FW' : 'BK';
    const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
    const col = (x) => '<div class="vs-side vs-' + x.g + (lead === x.g ? ' win' : '') + '"><span class="vs-g">' + x.g + '</span><span class="vs-v"><b class="num">' + f1(x.per) + '</b>回<small>1人あたり</small></span>' +
      '<span class="vs-s">' + x.n + '人・計' + x.done + '回' + (x.ach === null ? '' : '・達成' + Math.round(x.ach * 100) + '%') + '</span></div>';
    return '<section class="block versus"><div class="block-h"><h2>FW対BK</h2><span class="count">' + (lead ? lead + 'がリード' : '互角') + '</span></div>' +
      '<div class="vs">' + col(fw) + '<span class="vs-x" aria-hidden="true">VS</span>' + col(bk) + '</div>' +
      '<div class="vs-bar" role="img" aria-label="1人あたりの実施回数 FW ' + f1(fw.per) + '回・BK ' + f1(bk.per) + '回"><i style="width:' + (share * 100).toFixed(1) + '%"></i></div>' +
      '<p class="note">人数が違うので、1人あたりの実施回数で比べます。達成は週' + goal() + '回（マスト）を達成した割合です。</p></section>';
  }
  /** 落ちてきている人（スタッフだけ）：終わった直近2週とも週の目標に届かなかった人 */
  /** 部で最初に「実施した」が記録された日（通算の最初の日の中でいちばん前） */
  function teamStart() {
    let st = '';
    Object.keys(S.data.life || {}).forEach((k) => { const f = S.data.life[k][1]; if (f && (!st || f < st)) st = f; });
    (S.data.records || []).forEach((r) => { if (+r[2] === 1 && (!st || r[1] < st)) st = r[1]; });
    return st;
  }
  function slipBlock() {
    if (!can('record') && !can('menu')) return '';
    const list = L.slipList(S.data, S.idx, S.data.today, goal(), teamStart());
    if (!list.length) return '';
    const FIRST = 6;
    const li = (r) => '<li><a href="#member/' + r.id + '"><span class="slip-n">' + esc(r.name) + '<small>先週' + r.weeks[1].count + '回・先々週' + r.weeks[0].count + '回・' +
      (r.last ? '最後の実施 ' + mdw(r.last) : 'まだ記録なし') + '</small></span>' + icon('next') + '</a></li>';
    return '<div class="slip"><h3 class="sub3">落ちてきている人<small>' + list.length + '人・スタッフだけに表示</small></h3>' +
      '<ul class="slip-list">' + list.slice(0, FIRST).map(li).join('') + '</ul>' +
      (list.length > FIRST ? '<details class="goal-more"><summary>ほか ' + (list.length - FIRST) + '人を見る</summary><ul class="slip-list">' + list.slice(FIRST).map(li).join('') + '</ul></details>' : '') +
      '</div>';
  }
  /** 達成率の分布：週は「回数÷必要な回数」、月は「達成した週÷終わった週」で、何人がどのくらいか */
  function spreadBlock(rows) {
    const B = [['0%', (x) => x === 0], ['1〜49%', (x) => x > 0 && x < 0.5], ['50〜99%', (x) => x >= 0.5 && x < 1], ['100%', (x) => x >= 1]];
    const vals = [];
    rows.forEach((r) => {
      const gs = r.goal;
      if (!gs || !gs.weeks.length) return;
      if (S.kind === 'week') { const w = gs.weeks[0]; if (!w.exempt) vals.push(Math.min(1, w.count / w.need)); }
      else if (gs.closed) vals.push(gs.hit / gs.closed);
    });
    if (vals.length < 2) return '';
    const cnt = B.map((b) => vals.filter(b[1]).length), max = Math.max(...cnt, 1);
    return '<section class="block"><div class="block-h"><h2>達成率の分布</h2><span class="count">' + vals.length + '人</span></div>' +
      '<ul class="spread">' + B.map((b, i) => '<li class="sp-' + i + '"><span class="sp-k">' + b[0] + '</span><span class="sp-bar"><i style="width:' + (cnt[i] / max * 100).toFixed(1) + '%"></i></span><span class="sp-v"><b class="num">' + cnt[i] + '</b>人</span></li>').join('') + '</ul>' +
      '<p class="note">' + (S.kind === 'week' ? 'この週の「実施回数 ÷ 必要な回数（週' + goal() + '回。免除の日があれば減る）」' : 'この月の「週' + goal() + '回を達成した週 ÷ 終わった週」') + 'で分けています。免除の人は入りません。</p></section>';
  }
  /** 先週の同じ曜日までの回数（比べる用） */
  function lastWeekSoFar(m, today) {
    const ws = L.weekStart(today), off = (L.dow(today) + 6) % 7, pw = L.addDays(ws, -7);
    let n = 0;
    for (let i = 0; i <= off; i++) { const r = L.getRec(S.idx, m.id, L.addDays(pw, i)); if (r && r.s === 1) n++; }
    return n;
  }
  function vsLastWeek(cur, prev) {
    const d = cur - prev;
    return '先週の同じ時点 ' + prev + '回' + (d > 0 ? '（<b class="up">+' + d + '</b>）' : d < 0 ? '（<b class="down">−' + -d + '</b>）' : '（同じ）');
  }

  function pinReqBanner() {
    const list = can('admin') ? (S.data.pinRequests || []) : [];
    if (!list.length) return '';
    return '<a class="banner warn" href="#settings">' + icon('lock') + '<span>暗証番号の再発行の依頼が <b>' + list.length + '件</b>（' + list.map((x) => esc(x.name)).join('、') + '）</span>' + icon('next') + '</a>';
  }

  // ---------- ランキング ----------
  function vRank() {
    const d = S.data, p = curPeriod();
    const tab = S.rankTab || 'list';
    let h = periodBar() + '<div class="fbar"><div class="seg wide2" role="group" aria-label="表示">' +
      [['list', '順位'], ['stats', '分析']].map((x) => '<button data-act="rank-tab" data-v="' + x[0] + '" aria-pressed="' + (tab === x[0]) + '">' + x[1] + '</button>').join('') + '</div></div>';
    if (tab === 'stats') return h + rankStats(p);
    const cur = L.periodStats(d, S.idx, p.from, p.to, d.today, filterOpt());
    const rk = L.rank(cur.rows, S.sort);
    h += filterBar(S.group, 'f');
    if (!rk.length) return h + emptyState('people', '表示できる部員がいません', S.group !== 'ALL' || S.position ? '絞り込みを「全体」に戻してみてください。' : '');
    const ranked = rk.filter((r) => r.rank !== null), top = podiumPeople(ranked);
    h += '<section class="block">';
    if (top.length) h += podium(top);
    else if (ranked.length) h += '<p class="pod-skip">' + icon('crown') + '1位が ' + ranked.filter((r) => r.rank === 1).length + '人 並んでいます（同じ順位なので表彰台は省きます）</p>';
    // 並び順は表の見出しを押して変える（▼が今の並び順）
    const sh = (k, label, sub) => '<button class="rsort' + (S.sort === k ? ' on' : '') + '" data-act="sort" data-v="' + k + '" aria-pressed="' + (S.sort === k) + '" aria-label="' + label + 'の順に並べる">' + label + (S.sort === k ? '<i aria-hidden="true">▼</i>' : '') + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
    h += '<div class="rhead"><span>順位</span><span>名前</span>' + sh('count', '実施回数') + sh('rate', '実施率') + '</div>' +
      '<ol class="rlist full">' + rk.map(rankRow).join('') + '</ol></section>';
    return h;
  }
  /** ランキングの「分析」：FW対BK・ポジション別・達成率の分布・週ごとの達成（月間）・集計のルール */
  function rankStats(p) {
    const d = S.data;
    const all = L.periodStats(d, S.idx, p.from, p.to, d.today, { goal: goal() });
    let h = versusBlock(p) + formationBlock(p) + spreadBlock(all.rows);
    if (S.kind === 'month') h += continuityBlock(all.rows);
    h += '<details class="rules"><summary><h3>集計のルール</h3></summary><ul>' +
      '<li><b>実施回数</b>：マネージャーが「実施した」と記録した日数。全員が同じ条件です。</li>' +
      '<li><b>実施率</b>：FWリーダーメニューに参加している人だけ。実施した対象日 ÷ 対象日。対象日に記録が無ければ、翌日から「実施していない」になります（今日の分は、実施したときだけ数えます）。</li>' +
      '<li>自主トレの人は実施率を出さず「－」。実施回数で比べます。</li>' +
      '<li>回数（または実施率）が同じ人は<b>同じ順位</b>です。実施率が同じときの並びは、実施回数の多い人が先。表彰台にも同じ順位で並びます。</li>' +
      '<li>ポジションで絞ると、メインかサブがそのポジションの人が入ります。</li>' +
      '<li><b>週' + goal() + '回以上がマスト</b>：月曜〜日曜の週ごとに' + goal() + '回以上「実施した」で達成。週間ではその週の達成、月間では終わった週のうち達成した週の数を出します。</li>' +
      '<li>週は月曜〜日曜、月は1日〜月末（日本時間）。</li></ul></details>';
    return h;
  }

  // ---------- カレンダー ----------
  const CELL = {
    done: ['○', '実施した'], not: ['×', '実施していない'], today: ['・', '今日の対象（記録待ち）'],
    planned: ['・', '予定'], none: ['', '予定なし'], out: ['', '在籍期間外'], ex: ['免', '免除（怪我・オフなど）']
  };
  function cellHtml(state) {
    const c = CELL[state];
    return '<span class="cell s-' + state + '" title="' + c[1] + '"><span aria-hidden="true">' + c[0] + '</span><span class="sr">' + c[1] + '</span></span>';
  }
  function legend() {
    return '<ul class="legend">' + ['done', 'not', 'today', 'planned', 'ex', 'none'].map((k) => '<li>' + cellHtml(k) + CELL[k][1] + '</li>').join('') + '</ul>';
  }
  function sortMembers(list) {
    const ord = {};
    positions().forEach((p, i) => { ord[p.code] = i; });
    return list.slice().sort((a, b) => ((a.group === 'BK') - (b.group === 'BK')) || ((ord[a.position] ?? 99) - (ord[b.position] ?? 99)) || (a.sort - b.sort) || (a.name < b.name ? -1 : 1));
  }
  function vCal() {
    const d = S.data, p = curPeriod(), today = d.today;
    const dates = L.dateList(p.from, p.to);
    const opt = filterOpt();
    const members = sortMembers(d.members.filter((m) => L.inRosterRange(m, p.from, p.to) && (!opt.position ? (opt.group === 'ALL' || m.group === opt.group) : L.hasPosition(m, opt.position))));
    let h = periodBar() + filterBar(S.group, 'f');
    if (!members.length) return h + '<p class="empty">表示できる部員がいません。</p>';
    h += '<div class="matrix-wrap ' + S.kind + '"><table class="matrix"><thead><tr><th class="mname">名前</th>';
    dates.forEach((dt) => {
      const w = L.dow(dt), hasMenu = !!(S.idx.menusByDate[dt] || []).length;
      h += '<th class="' + (dt === today ? 'today ' : '') + (w === 0 ? 'sun ' : w === 6 ? 'sat ' : '') + (hasMenu ? 'has-menu' : '') + '"><span class="dn">' + +dt.slice(8, 10) + '</span><span class="dw">' + WD[w] + '</span></th>';
    });
    h += '<th class="msum">回</th></tr></thead><tbody>';
    members.forEach((m) => {
      let n = 0;
      h += '<tr><th class="mname"><a href="#member/' + m.id + '"><span class="pos-tag g-' + (m.group || 'X') + '">' + esc(m.position || m.group || '－') + '</span>' + esc(m.name) + '</a></th>';
      dates.forEach((dt) => {
        const st = L.cellState(S.idx, m, dt, today);
        if (st === 'done') n++;
        h += '<td class="' + (dt === today ? 'today' : '') + '">' + cellHtml(st) + '</td>';
      });
      h += '<td class="msum"><span class="num">' + n + '</span></td></tr>';
    });
    return h + '</tbody></table></div>' + legend() +
      '<p class="note">日付の下に線がある日は、FWリーダーメニューがある日です。名前を押すと、その人のカレンダーと履歴を見られます。</p>';
  }

  // ---------- 部員 ----------
  function vMembers() {
    const d = S.data, mo = L.monthRange(d.today);
    const st = L.periodStats(d, S.idx, mo.from, mo.to, d.today);
    const cnt = {};
    st.rows.forEach((r) => { cnt[r.id] = r; });
    const act = d.members.filter((m) => m.active);
    const row = (m) => {
      const r = cnt[m.id];
      return '<li><a href="#member/' + m.id + '">' +
        '<span class="rec-pos g-' + (m.player ? (m.group || 'X') : 'X') + '">' + (m.player ? esc(m.position || m.group || '－') : 'MG') + '</span>' +
        '<span class="mrow-n"><b>' + esc(m.name) + '</b><small>' + (m.grade ? esc(m.grade) + '・' : '') + (m.player ? posText(m) + '・' + MODE[m.mode] : esc(m.clubRole)) +
        (m.perm !== 'member' ? '<span class="chip role">' + PERM[m.perm] + '</span>' : '') + '</small></span>' +
        (m.player ? '<span class="mrow-c">今月<span class="num">' + (r ? r.done : 0) + '</span>回</span>' : '<span class="mrow-c"></span>') + '</a></li>';
    };
    let h = '';
    if (can('admin')) {
      h += '<div class="toolbar"><button class="btn primary" data-act="bulk-open">まとめて編集</button>' +
        '<button class="btn" data-act="member-new">' + icon('plus') + '部員を追加</button>' +
        '<button class="btn" data-act="member-import">一覧を貼り付け</button>' +
        '<button class="btn" data-act="promote-open">進級（学年を上げる）</button></div>' +
        '<p class="note is-top">名簿は会計アプリと共通です。学年・在籍・ポジションはどちらで変えても両方に反映されます。名前の変更と「財務」は会計アプリで行ってください。</p>';
    }
    const groups = [['FW', 'FW（フォワード）'], ['BK', 'BK（バックス）'], ['', 'ポジション未設定']];
    groups.forEach((g) => {
      const list = sortMembers(act.filter((m) => m.player && (m.group || '') === g[0]));
      if (!list.length && !g[0]) return;
      h += '<section class="block"><div class="block-h"><h2>' + g[1] + '</h2><span class="count">' + list.length + '人</span></div>' +
        (list.length ? '<ul class="mlist">' + list.map(row).join('') + '</ul>' : '<p class="empty">まだいません。</p>') + '</section>';
    });
    const staff = act.filter((m) => !m.player).sort((a, b) => a.sort - b.sort);
    if (staff.length) h += '<section class="block"><div class="block-h"><h2>マネージャーなど</h2><span class="count">' + staff.length + '人</span></div><ul class="mlist">' + staff.map(row).join('') + '</ul></section>';
    const gone = d.members.filter((m) => !m.active).sort((a, b) => a.sort - b.sort);
    if (can('admin') && gone.length) h += '<details class="block gone-box"><summary><h2>在籍していない部員</h2><span class="count">' + gone.length + '人</span></summary><ul class="mlist gone">' + gone.map(row).join('') + '</ul></details>';
    h += bodyOverview();
    h += '<p class="note">「メニュー参加」はFWリーダーのメニューに沿って取り組む人、「自主トレ」は自分でメニューを決める人です。変えたいときは管理者に伝えてください。</p>';
    return h;
  }

  function vMember(id) {
    const d = S.data, m = memberById(id), today = d.today;
    if (!m) return '<p class="empty">この部員は見つかりません。</p>';
    if (!S.memberMonth) S.memberMonth = L.monthRange(today).from;
    const mo = L.monthRange(S.memberMonth), wk = L.weekRange(today), tm = L.monthRange(today);
    const sw = L.memberStats(S.idx, m, wk.from, wk.to, today);
    const sm = L.memberStats(S.idx, m, tm.from, tm.to, today);
    const g = goal();
    const streak = m.player ? L.streakWeeks(S.idx, m, today, d.range.from, g) : 0;
    const wc = L.weekCount(S.idx, m, wk.from), wn = L.weekNeed(S.idx, m, wk.from, g);
    const pos = posOf(m.position);
    let h = '<div class="profile"><a class="ibtn back" href="#members" data-act="go-back" aria-label="戻る">' + icon('back') + '</a>' +
      '<div class="profile-j">' + jersey({ num: pos ? pos.numbers[0] : '', name: m.name.split(/\s+/)[0] }) + '</div>' +
      '<div class="profile-t"><h1>' + esc(m.name) + '</h1>' +
      '<p class="profile-pos">' + (m.player ? (pos ? '<b>' + esc(pos.code) + '</b>' + esc(pos.name) : '<b>' + esc(m.group || '－') + '</b>ポジション未設定') + (m.subs && m.subs.length ? '<span>サブ ' + m.subs.map(esc).join('・') + '</span>' : '') : '<b>' + esc(m.clubRole) + '</b>') + '</p>' +
      '<div class="chips">' + (m.grade ? '<span class="chip">' + esc(m.grade) + '</span>' : '') + (m.player ? '<span class="chip mode-' + m.mode + '">' + MODE[m.mode] + '</span>' : '') +
      (m.perm !== 'member' ? '<span class="chip role">' + PERM[m.perm] + '</span>' : '') + (!m.active ? '<span class="chip">在籍なし</span>' : '') + '</div></div>' +
      (can('admin') ? '<button class="btn small" data-act="member-edit" data-id="' + m.id + '">編集</button>' : '') + '</div>';
    if (!m.player) return h + '<p class="empty">選手ではないため、筋トレの記録はありません。</p>';
    const ms = milestoneOf(m);
    if (ms) h += '<section class="mile-card"><div class="mile-n"><span class="num">' + ms.n + '</span><small>回</small></div><div class="mile-t"><b>通算' + ms.n + '回 達成</b><small>' + mdw(ms.date) + '・これまでの「実施した」が' + ms.n + '回になりました</small>' +
      stampBar(m.id, ms.key, { small: true }) + '</div></section>';
    h += '<div class="tiles">' +
      (wn.need === 0
        ? '<div class="tile"><div class="tile-k">今週</div><div class="tile-v"><span class="num">' + sw.done + '</span>回</div><div class="tile-s">今週は免除</div></div>'
        : '<div class="tile' + (wc >= wn.need ? ' t-ok' : '') + '"><div class="tile-k">今週</div><div class="tile-v"><span class="num">' + sw.done + '</span>回<small>/' + wn.need + '</small></div>' +
          '<div class="tile-s">' + (wc >= wn.need ? '週' + wn.need + '回 達成' : 'あと' + (wn.need - wc) + '回') + (wn.ex ? '（免除' + wn.ex + '日）' : '') + '</div>' +
          '<div class="tile-s cmp">' + vsLastWeek(wc, lastWeekSoFar(m, today)) + '</div></div>') +
      '<div class="tile"><div class="tile-k">今月</div><div class="tile-v"><span class="num">' + sm.done + '</span>回</div></div>' +
      '<div class="tile"><div class="tile-k">今月の実施率</div><div class="tile-v">' + (sm.rate === null ? '<span class="dash">－</span>' : '<span class="num">' + Math.round(sm.rate * 100) + '</span>%') + '</div>' +
      '<div class="tile-s">' + (sm.rate === null ? (m.mode === 'self' ? '自主トレは回数で見ます' : 'まだ対象日がありません') : sm.doneT + '/' + sm.targetDays + '日') + '</div></div>' +
      '<div class="tile"><div class="tile-k">週' + g + '回の連続達成</div><div class="tile-v"><span class="num">' + streak + '</span>週</div></div></div>';
    // 3つに分けて見せる：記録（カレンダー・履歴・免除）／実績（自己ベスト・称号・応援）／体（体重）
    const tab = S.memberTab || 'rec';
    h += '<div class="fbar"><div class="seg wide3" role="group" aria-label="表示">' + [['rec', '記録'], ['best', '実績'], ['body', '体']].map((x) =>
      '<button data-act="member-tab" data-v="' + x[0] + '" aria-pressed="' + (tab === x[0]) + '">' + x[1] + '</button>').join('') + '</div></div>';
    if (tab === 'best') {
      const pers = personalOf(m);
      return h + bestsBlock(m, pers) + badgesBlock(m, pers) + cheerBlock(m);
    }
    if (tab === 'body') return h + (bodyBlock(m) || emptyState('list', '体重の記録はまだありません', 'スタッフが測定した値を入れると、ここに変化が出ます。'));
    const atNow = mo.from === tm.from;
    h += '<section class="block"><div class="mcal-nav"><button class="ibtn" data-act="mmonth" data-v="-1" aria-label="前の月">' + icon('back') + '</button>' +
      '<b>' + ymLabel(mo.from) + '</b><button class="ibtn" data-act="mmonth" data-v="1" aria-label="次の月"' + (atNow ? ' disabled' : '') + '>' + icon('next') + '</button></div>' +
      '<div class="mcal"><div class="mcal-w">' + ['月', '火', '水', '木', '金', '土', '日'].map((w) => '<span>' + w + '</span>').join('') + '</div><div class="mcal-g">';
    const lead = (L.dow(mo.from) + 6) % 7;
    for (let i = 0; i < lead; i++) h += '<span class="mday blank"></span>';
    const hist = [];
    L.dateList(mo.from, mo.to).forEach((dt) => {
      const st = L.cellState(S.idx, m, dt, today);
      const menus = (S.idx.menusByDate[dt] || []).filter((w) => w.targets.indexOf(m.id) >= 0);
      h += '<span class="mday s-' + st + (dt === today ? ' today' : '') + '"><span class="mday-n">' + +dt.slice(8, 10) + '</span><span class="mday-m" aria-hidden="true">' + CELL[st][0] + '</span><span class="sr">' + CELL[st][1] + '</span></span>';
      const r = L.getRec(S.idx, m.id, dt);
      if (r || st === 'not' || st === 'today') hist.push({ dt: dt, st: st, r: r, menus: menus });
    });
    h += '</div></div>' + legend() + '</section>';
    // 履歴はカレンダーと同じ中身なので、押したら開く（だれが記録したか・その日のメニュー名を見たいとき用）
    if (!hist.length) return h + exemptBlock(m);
    h += '<section class="block"><details class="goal-more hist-box"><summary>' + ymLabel(mo.from) + 'の履歴を見る（' + hist.length + '件）</summary>';
    h += '<ul class="hist">' + hist.reverse().map((x) =>
      '<li>' + cellHtml(x.st) + '<span class="hist-d">' + mdw(x.dt) + '</span>' +
      '<span class="hist-t">' + CELL[x.st][1] + (x.menus.length ? '<small>' + x.menus.map((w) => esc(w.title)).join('、') + '</small>' : '') + '</span>' +
      (x.r && x.r.by ? '<span class="hist-b">記録：' + esc(nameOf(x.r.by)) + '</span>' : '') + '</li>').join('') + '</ul></details>';
    return h + '</section>' + exemptBlock(m);
  }

  // ---------- 部員ページ：自己ベスト・称号・体組成・応援 ----------
  async function loadHistory(id) {
    if (S.hist[id] && (S.hist[id].loading || Date.now() - S.hist[id].at < 120000)) return;
    S.hist[id] = Object.assign(S.hist[id] || {}, { loading: true });
    try {
      const r = await api('memberHistory', { memberId: id });
      S.hist[id] = { at: Date.now(), records: r.records, exempts: r.exempts };
    } catch (e) { S.hist[id] = { at: Date.now(), err: e.message }; }
    if (S.route.name === 'member' && S.route.arg === id) render();
  }
  function personalOf(m) {
    const h = S.hist[m.id];
    if (!h || !h.records) return null;
    const ix = L.buildIndex({ records: h.records, exempts: h.exempts });
    return L.personal(ix, m, S.data.today, goal());
  }
  function bestsBlock(m, p) {
    if (!p) return '<section class="block"><div class="block-h"><h2>自己ベスト</h2></div><p class="empty small">' + (S.hist[m.id] && S.hist[m.id].err ? esc(S.hist[m.id].err) : '読み込み中…') + '</p></section>';
    if (!p.total) return '';
    const ym = (k) => +k.slice(0, 4) + '年' + +k.slice(5, 7) + '月';
    return '<section class="block"><div class="block-h"><h2>自己ベスト</h2><span class="count">' + (p.first ? md(p.first) + '（' + p.first.slice(0, 4) + '）から' : '') + '</span></div>' +
      '<div class="bests">' +
      '<div class="best"><span class="best-k">通算</span><span class="best-v"><b class="num">' + p.total + '</b>回</span></div>' +
      '<div class="best"><span class="best-k">いちばん長い連続</span><span class="best-v"><b class="num">' + p.streakMax + '</b>週</span><small>週' + goal() + '回を続けた週数' + (p.streakNow ? '・いま' + p.streakNow + '週' : '') + '</small></div>' +
      '<div class="best"><span class="best-k">いちばん多い月</span><span class="best-v"><b class="num">' + p.bestMonth.count + '</b>回</span><small>' + ym(p.bestMonth.month) + '</small></div>' +
      '<div class="best"><span class="best-k">いちばん多い週</span><span class="best-v"><b class="num">' + p.bestWeek.count + '</b>回</span><small>' + mdw(p.bestWeek.from) + 'の週</small></div>' +
      '</div></section>';
  }
  function badgesBlock(m, p) {
    if (!p) return '';
    const list = L.badgeList(goal());
    const got = list.filter((b) => p.earned[b.key]);
    const next = list.filter((b) => !p.earned[b.key]);
    let h = '<section class="block"><div class="block-h"><h2>称号</h2><span class="count">' + got.length + '/' + list.length + '</span></div>';
    const tile = (b, on) => '<li class="badge' + (on ? ' on' : '') + '"><button data-act="badge-open" data-id="' + m.id + '" data-k="' + b.key + '">' + medal(b.key, !on) + '<b>' + esc(b.name) + '</b>' +
      '<small>' + (on ? md(p.earned[b.key]) + '（' + p.earned[b.key].slice(0, 4) + '）' : 'まだ') + '</small></button></li>';
    h += '<ul class="badges">' + got.sort((a, b) => (p.earned[a.key] < p.earned[b.key] ? 1 : -1)).map((b) => tile(b, true)).join('') + next.slice(0, 3).map((b) => tile(b, false)).join('') + '</ul>';
    h += '<p class="note">' + (got.length ? 'メダルを押すと、取った日と応援スタンプが見られます。' : '「実施した」がつくと、最初の称号がもらえます。') + '</p>';
    return h + '</section>';
  }
  function openBadge(memberId, key) {
    const m = memberById(memberId), p = m && personalOf(m);
    const b = L.badgeList(goal()).find((x) => x.key === key);
    if (!m || !b) return;
    const on = !!(p && p.earned[key]);
    openSheet('称号：' + b.name, '<div class="badge-detail">' + medal(key, !on) + '<p class="bd-d">' + esc(b.desc) + '</p>' +
      (on ? '<p class="bd-w">' + esc(m.name) + ' さんが ' + mdw(p.earned[key]) + '（' + p.earned[key].slice(0, 4) + '）に取りました</p>' + stampBar(m.id, 'b:' + key) : '<p class="bd-w">まだ取っていません</p>') + '</div>');
  }
  /** 称号のメダル。中の文字（数字か短いことば）と、むずかしさで色（銅・銀・金） */
  function medal(key, locked) {
    const k = key.replace(/^([a-z]+)(\d*)$/, '$1'), n = +key.replace(/^\D+/, '') || 0;
    const face = k === 'first' ? '1st' : k === 'goal1' ? '✓' : k === 'pm' ? '皆' : k === 'back' ? '再' : k === 'w5' ? '5' : String(n);
    const tier = (k === 's' && n >= 12) || (k === 't' && n >= 200) || (k === 'm' && n >= 20) || k === 'pm' ? 'gold'
      : (k === 's' && n >= 8) || (k === 't' && n >= 50) || (k === 'm' && n >= 15) || k === 'w5' || k === 'back' ? 'silver' : 'bronze';
    const cap = k === 's' ? '週連続' : k === 't' ? '通算' : k === 'm' ? '月' : '';
    return '<span class="medal m-' + tier + (locked ? ' locked' : '') + '" aria-hidden="true"><svg viewBox="0 0 40 40"><circle class="md-r" cx="20" cy="20" r="18"/><circle class="md-f" cx="20" cy="20" r="14"/>' +
      '<text class="md-t' + (face.length > 2 ? ' long' : '') + '" x="20" y="' + (cap ? 21 : 25) + '" text-anchor="middle">' + esc(face) + '</text>' + (cap ? '<text class="md-c" x="20" y="30" text-anchor="middle">' + cap + '</text>' : '') + '</svg></span>';
  }
  function cheerBlock(m) {
    const list = cheersFor(m.id);
    if (!list.length) return '';
    const sum = stampSum(list);
    return '<section class="block"><div class="block-h"><h2>届いた応援</h2><span class="count">最近' + 60 + '日</span></div>' +
      '<p class="cheer-sum">' + sum.html + '</p><ul class="cheers">' + list.slice(0, 8).map((x) =>
        '<li><span class="cheer-e">' + esc(eventLabel(x.e)) + '<small>' + fromNames([x]) + '</small></span><span class="cheer-c">' + stampSum([x]).html + '</span></li>').join('') + '</ul></section>';
  }
  // v2.11 から体重だけ（体脂肪率・筋肉量は入れない・見せない。前に入れた値はスプレッドシートに残る）
  const BODY_K = [['weight', '体重', 'kg', 3]];
  function bodyOf(id) { return (S.data.body || []).filter((b) => b[1] === id && b[3] !== null).sort((a, b) => (a[2] < b[2] ? -1 : 1)); }
  function bodyChart(list, col, unit, goalW) {
    const pts = list.filter((b) => b[col] !== null);
    if (pts.length < 2) return '';
    const W = 320, H = 110, P = 26;
    const v = pts.map((b) => b[col]).concat(goalW ? [goalW] : []), lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
    const t0 = L.parse(pts[0][2]).getTime(), t1 = L.parse(pts[pts.length - 1][2]).getTime(), ts = t1 - t0 || 1;
    const xy = pts.map((b) => [P + (L.parse(b[2]).getTime() - t0) / ts * (W - P * 2), 12 + (1 - (b[col] - lo) / span) * (H - 34)]);
    return '<svg class="bchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(unit) + 'の変化">' +
      '<polyline points="' + xy.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '"/>' +
      xy.map((p, i) => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3"><title>' + md(pts[i][2]) + ' ' + pts[i][col] + unit + '</title></circle>').join('') +
      '<text x="' + P + '" y="' + (H - 4) + '">' + md(pts[0][2]) + '</text><text x="' + (W - P) + '" y="' + (H - 4) + '" text-anchor="end">' + md(pts[pts.length - 1][2]) + '</text>' +
      (goalW ? (function () { const y = (12 + (1 - (goalW - lo) / span) * (H - 34)).toFixed(1); return '<line class="goal" x1="' + P + '" x2="' + (W - 6) + '" y1="' + y + '" y2="' + y + '"/><text class="goal-t" x="' + (W - 6) + '" y="' + (y - 4) + '" text-anchor="end">目標 ' + goalW + unit + '</text>'; })() : '') +
      '<text x="2" y="14" class="ax">' + hi + '</text><text x="2" y="' + (H - 22) + '" class="ax">' + lo + '</text></svg>';
  }
  /** 体重（線）と、月ごとの実施回数（棒）を同じ時間でならべる。部員ページの全期間の記録を使う */
  function bodyVsCount(m, list) {
    const h = S.hist[m.id];
    const pts = list.filter((b) => b[3] !== null);
    if (!h || !h.records || pts.length < 2) return '';
    let from = pts[0][2].slice(0, 7), to = S.data.today.slice(0, 7);
    const months = [];
    for (let k = from; k <= to; k = L.addMonths(k + '-01', 1).slice(0, 7)) months.push(k);
    while (months.length > 12) months.shift();
    if (months.length < 2) return '';
    const cnt = {}, wsum = {}, wn = {};
    h.records.forEach((r) => { if (+r[2] === 1) cnt[r[1].slice(0, 7)] = (cnt[r[1].slice(0, 7)] || 0) + 1; });
    pts.forEach((b) => { const k = b[2].slice(0, 7); wsum[k] = (wsum[k] || 0) + b[3]; wn[k] = (wn[k] || 0) + 1; });
    const W = 320, H = 130, P = 26, bw = (W - P * 2) / months.length, barW = Math.min(bw * 0.64, 22);
    const cmax = Math.max(4, ...months.map((k) => cnt[k] || 0));
    const wv = months.filter((k) => wn[k]).map((k) => wsum[k] / wn[k]);
    const lo = Math.min(...wv), hi = Math.max(...wv), span = hi - lo || 1;
    const x = (i) => P + bw * i + bw / 2;
    const wy = (v) => 14 + (1 - (v - lo) / span) * (H - 44);
    const line = months.map((k, i) => (wn[k] ? x(i).toFixed(1) + ',' + wy(wsum[k] / wn[k]).toFixed(1) : null)).filter(Boolean);
    return '<h3 class="sub3">体重と月の実施回数</h3><svg class="bchart vs" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="月ごとの実施回数（棒）と体重（線）">' +
      months.map((k, i) => { const c = cnt[k] || 0, bh = c / cmax * (H - 44); return '<rect x="' + (x(i) - barW / 2).toFixed(1) + '" y="' + (H - 22 - bh).toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2"><title>' + +k.slice(5) + '月 ' + c + '回</title></rect>' +
        (i % Math.ceil(months.length / 6) === 0 || i === months.length - 1 ? '<text x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + +k.slice(5) + '月</text>' : ''); }).join('') +
      (line.length > 1 ? '<polyline points="' + line.join(' ') + '"/>' : '') +
      line.map((pt) => '<circle cx="' + pt.split(',')[0] + '" cy="' + pt.split(',')[1] + '" r="3"/>').join('') +
      '<text x="2" y="16" class="ax">' + (Math.round(hi * 10) / 10) + 'kg</text><text x="2" y="' + (H - 26) + '" class="ax">' + (Math.round(lo * 10) / 10) + '</text>' +
      '<text x="' + (W - 2) + '" y="16" class="ax" text-anchor="end">' + cmax + '回</text></svg>' +
      '<p class="note">棒＝その月の実施回数、線＝その月に測った体重の平均。</p>';
  }
  /** 種目ごとの重さの目安（最新の体重 × 倍率。2.5kg きざみ） */
  function liftBlock(w) {
    const list = (S.data.liftRatios || []);
    if (!w || !list.length) return '';
    const kg = (r) => Math.round(w * r / 2.5) * 2.5;
    return '<h3 class="sub3">重さの目安<small>体重 ' + w + 'kg × 倍率</small></h3><ul class="lifts">' + list.map((x) =>
      '<li><span class="lf-n">' + esc(x.name) + '</span><span class="lf-v"><b class="num">' + kg(x.ratio) + '</b>kg</span><small>×' + x.ratio + '</small></li>').join('') + '</ul>' +
      '<p class="note">部で決めた「体重に対する倍率」から出した目安です（1回を上げる重さ）。無理はせず、フォームを優先してください。</p>';
  }
  function bodyBlock(m) {
    const list = bodyOf(m.id), staff = can('body');
    if (!list.length && !staff) return '';
    let h = '<section class="block"><div class="block-h"><h2>体重</h2>' + (staff ? '<span class="bh-a"><button class="btn small" data-act="body-goal" data-id="' + m.id + '">' + icon('flag') + '目標</button><button class="btn small" data-act="body-new" data-id="' + m.id + '">' + icon('plus') + '入れる</button></span>' : '') + '</div>';
    if (!list.length) return h + (m.goalW ? '<p class="bgoal">' + icon('flag') + '<span>目標 <b class="num">' + m.goalW + '</b>kg' + (m.goalD ? '（' + md(m.goalD) + 'まで）' : '') + '</span></p>' : '') + '<p class="empty small">まだ記録がありません。測ったら入れてください（数値は部員みんなが見られます）。</p></section>';
    const last = list[list.length - 1];
    h += '<div class="bnow">' + BODY_K.map((k) => {
      const prev = list.slice(0, -1).reverse().find((b) => b[k[3]] !== null);
      const v = last[k[3]];
      if (v === null) return '';
      const d = prev ? Math.round((v - prev[k[3]]) * 10) / 10 : null;
      return '<div class="bv"><span class="best-k">' + k[1] + '</span><span class="best-v"><b class="num">' + v + '</b>' + k[2] + '</span>' +
        (d !== null ? '<small class="' + (d > 0 ? 'up' : d < 0 ? 'down' : '') + '">' + (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) + k[2] + '</small><small>' + md(prev[2]) + 'から</small>' : '') + '</div>';
    }).join('') + '</div><p class="note is-top">' + mdw(last[2]) + ' に測定</p>';
    const latestW = (list.slice().reverse().find((b) => b[3] !== null) || [])[3] || null;
    if (m.goalW) {
      const diff = latestW !== null ? Math.round((m.goalW - latestW) * 10) / 10 : null;
      h += '<p class="bgoal">' + icon('flag') + '<span>目標 <b class="num">' + m.goalW + '</b>kg' + (m.goalD ? '（' + md(m.goalD) + 'まで）' : '') +
        (diff === null ? '' : diff === 0 ? '・<b>達成</b>' : '・あと <b class="num">' + (diff > 0 ? '+' : '−') + Math.abs(diff) + '</b>kg') + '</span></p>';
    }
    h += bodyChart(list, 3, 'kg', m.goalW || null);
    h += bodyVsCount(m, list);
    h += liftBlock(latestW);
    h += '<details class="goal-more"><summary>これまでの記録（' + list.length + '回）</summary><ul class="blist">' + list.slice().reverse().map((b) =>
      '<li><span class="ex-d">' + b[2].replace(/-/g, '/') + '</span><span>' + BODY_K.map((k) => (b[k[3]] === null ? '' : k[1] + ' ' + b[k[3]] + k[2])).filter(Boolean).join('・') + (b[6] ? '<small>' + esc(b[6]) + '</small>' : '') + '</span>' +
      (staff && (can('admin') || b[7] === me().id) ? '<button class="textbtn" data-act="body-del" data-id="' + esc(b[0]) + '">消す</button>' : '') + '</li>').join('') + '</ul></details>';
    return h + '</section>';
  }
  function bodyInputs(prefix, v) {
    return BODY_K.map((k) => '<label>' + k[1] + '<span class="opt">' + k[2] + '</span><input type="text" inputmode="decimal" name="' + prefix + k[0] + '" value="' + (v && v[k[3]] !== null && v[k[3]] !== undefined ? v[k[3]] : '') + '" autocomplete="off"></label>').join('');
  }
  function openBody(memberId) {
    const m = memberById(memberId);
    openSheet('体重（' + m.name + '）',
      '<form data-form="body1" class="form"><input type="hidden" name="memberId" value="' + esc(memberId) + '">' +
      '<label>測定日<input type="date" name="date" value="' + S.data.today + '" max="' + S.data.today + '" required></label>' +
      bodyInputs('', null) +
      '<label>メモ<span class="opt">任意・スタッフだけに見える</span><input type="text" name="note" maxlength="100" placeholder="例：朝・練習前"></label>' +
      '<p class="hint">数値は部員みんなが見られます。同じ日にもう一度入れると上書きします。</p><p class="form-err" hidden></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">保存</button></div></form>');
  }
  function openBodyGoal(memberId) {
    const m = memberById(memberId);
    openSheet('目標体重（' + m.name + '）',
      '<form data-form="bodygoal" class="form"><input type="hidden" name="memberId" value="' + esc(memberId) + '">' +
      '<div class="two"><label>目標体重<span class="opt">kg</span><input type="text" inputmode="decimal" name="weight" value="' + (m.goalW || '') + '" autocomplete="off" placeholder="例：85"></label>' +
      '<label>期日<span class="opt">任意</span><input type="date" name="date" value="' + esc(m.goalD || '') + '"></label></div>' +
      '<p class="hint">増量・減量の目標です。体重のグラフに目標の線が引かれ、「あと何kg」が出ます。空にして保存すると外せます。数値は部員みんなが見られます。</p><p class="form-err" hidden></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">保存</button></div></form>');
  }
  function openBodyBulk() {
    const list = sortMembers(S.data.members.filter((m) => m.active && m.player));
    openSheet('体重をまとめて入れる',
      '<form data-form="bodybulk" class="form"><label>測定日<input type="date" name="date" value="' + S.data.today + '" max="' + S.data.today + '" required></label>' +
      '<p class="hint">測った人だけ入れてください（空の人は保存しません）。同じ日にもう一度入れると上書きします。数値は部員みんなが見られます。</p>' +
      '<div class="bulk bodyb"><div class="bulk-h"><span>名前</span><span>体重kg</span></div>' +
      list.map((m) => '<div class="bulk-r" data-id="' + m.id + '"><span class="bulk-n"><b>' + esc(m.name) + '</b><small>' + esc(m.position || m.group || '') + '</small></span>' +
        BODY_K.map((k) => '<input type="text" inputmode="decimal" name="' + k[0] + '_' + m.id + '" aria-label="' + esc(m.name) + 'の' + k[1] + '" autocomplete="off">').join('') + '</div>').join('') +
      '</div><p class="form-err" hidden></p>' +
      '<div class="actions sticky"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">保存</button></div></form>', { wide: true });
  }
  /** 部員一覧の下：体重の最新（みんなが見られる） */
  function bodyOverview() {
    const latest = {};
    (S.data.body || []).forEach((b) => { if (b[3] !== null && (!latest[b[1]] || latest[b[1]][2] < b[2])) latest[b[1]] = b; });
    const list = sortMembers(S.data.members.filter((m) => m.active && m.player && latest[m.id]));
    if (!list.length && !can('body')) return '';
    let h = can('body') ? '<div class="toolbar"><button class="btn" data-act="body-bulk">' + icon('scale') + '体重をまとめて入れる</button></div>' : '';
    h += '<details class="block gone-box"' + (list.length ? '' : ' open') + '><summary><h2>体重（最新）</h2><span class="count">' + list.length + '人</span></summary>';
    if (!list.length) return h + '<p class="empty small">まだ記録がありません。</p></details>';
    h += '<table class="btable"><thead><tr><th>名前</th><th>体重</th><th>測定日</th></tr></thead><tbody>' + list.map((m) => {
      const b = latest[m.id];
      return '<tr><th><a href="#member/' + m.id + '">' + esc(m.name) + '</a></th>' + BODY_K.map((k) => '<td>' + (b[k[3]] === null ? '<span class="dash">－</span>' : '<b class="num">' + b[k[3]] + '</b>') + '</td>').join('') + '<td class="bd">' + md(b[2]) + '</td></tr>';
    }).join('') + '</tbody></table></details>';
    return h;
  }

  // ---------- 免除（部員ごと・部全体のオフ） ----------
  const EX_REASONS = ['怪我', '病気・体調不良', '就活・実習', '家の用事', 'その他'];
  const OFF_REASONS = ['試験期間', '合宿・遠征', '年末年始', 'オフ', 'その他'];
  function exemptBlock(m) {
    const d = S.data, today = d.today;
    const mine = (d.exempts || []).filter((e) => e.memberId === m.id).sort((a, b) => (a.from < b.from ? 1 : -1));
    const staff = can('record');
    if (!mine.length && !staff) return '';
    let h = '<section class="block"><div class="block-h"><h2>免除</h2>' + (staff ? '<button class="btn small" data-act="ex-new" data-id="' + m.id + '">' + icon('plus') + '免除を追加</button>' : '') + '</div>';
    if (!mine.length) h += '<p class="empty small">怪我・病気などで筋トレできない期間を登録すると、その日は週' + goal() + '回の判定とメニューの対象から外れます。</p>';
    else h += '<ul class="exlist">' + mine.map((e) => exRow(e, today)).join('') + '</ul>';
    return h + '</section>';
  }
  function exRow(e, today) {
    const state = e.to < today ? '終了' : e.from > today ? '予定' : '期間中';
    const canDel = can('admin') || (can('record') && e.memberId !== 'ALL' && e.createdBy === me().id);
    return '<li><span class="ex-d">' + mdw(e.from) + '〜' + mdw(e.to) + '<small class="ex-st s-' + (state === '期間中' ? 'now' : state === '予定' ? 'next' : 'past') + '">' + state + '</small></span>' +
      '<span class="ex-r">' + esc(e.reason || '免除') + (e.note ? '<small>' + esc(e.note) + '</small>' : '') + '</span>' +
      (canDel ? '<button class="textbtn" data-act="ex-del" data-id="' + e.id + '">取り消す</button>' : '') + '</li>';
  }
  function openExempt(memberId) {
    const team = memberId === 'ALL';
    const m = team ? null : S.data.members.find((x) => x.id === memberId);
    const today = S.data.today;
    const reasons = team ? OFF_REASONS : EX_REASONS;
    openSheet(team ? '部全体のオフ期間を追加' : '免除を追加（' + m.name + '）',
      '<form data-form="exempt" class="form"><input type="hidden" name="memberId" value="' + esc(memberId) + '">' +
      '<p class="lead-line small">' + (team ? 'この期間は全員の「週' + goal() + '回」とメニューの対象から外れます（試験期間・合宿など）。' : 'この期間は「週' + goal() + '回」の判定とメニューの対象から外れます。期間中に筋トレした日は、ふつうに実施回数に入ります。') + '</p>' +
      '<div class="two"><label>開始日<input type="date" name="from" value="' + today + '" required></label><label>終了日<input type="date" name="to" value="' + L.addDays(today, 6) + '" required></label></div>' +
      '<label>理由<select name="reason" required>' + reasons.map((r) => '<option>' + r + '</option>').join('') + '</select></label>' +
      '<label>メモ（任意）<input type="text" name="note" maxlength="100" placeholder="' + (team ? '例：前期の試験' : '例：右足首の捻挫、全治2週間') + '"></label>' +
      (team ? '' : '<p class="hint">理由とメモは、ログインした管理者・マネージャー・FWリーダーにだけ見えます（ふつうの部員の画面には「免除」とだけ出ます）。</p>') +
      '<p class="form-err" hidden></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">登録する</button></div></form>');
  }
  function openOffs() {
    const d = S.data, today = d.today;
    const offs = (d.exempts || []).filter((e) => e.memberId === 'ALL').sort((a, b) => (a.from < b.from ? 1 : -1));
    openSheet('部全体のオフ期間',
      '<p class="lead-line small">試験期間・合宿・年末年始など、部全体で筋トレの目標をなしにする期間です。この期間は全員の「週' + goal() + '回」とメニューの対象から外れます。</p>' +
      (offs.length ? '<ul class="exlist">' + offs.map((e) => exRow(e, today)).join('') + '</ul>' : '<p class="empty small">まだ登録されていません。</p>') +
      '<div class="actions"><button class="btn" data-act="sheet-close">閉じる</button><button class="btn primary" data-act="ex-new" data-id="ALL">' + icon('plus') + 'オフ期間を追加</button></div>');
  }

  // ---------- メニュー ----------
  const WD_MON = [1, 2, 3, 4, 5, 6, 0];
  const repeatLabel = (t) => (t.repeat && t.repeat.length ? '毎週' + WD_MON.filter((d) => t.repeat.indexOf(d) >= 0).map((d) => WD[d]).join('・') : '');
  function vMenus() {
    const d = S.data, today = d.today;
    const tabs = [['upcoming', '今日から'], ['past', 'これまで']].concat(can('menu') ? [['templates', '型・繰り返し']] : []);
    if (S.menuTab === 'templates' && !can('menu')) S.menuTab = 'upcoming';
    let h = '<div class="fbar"><div class="seg" role="group" aria-label="表示">' +
      tabs.map((t) => '<button data-act="menu-tab" data-v="' + t[0] + '" aria-pressed="' + (S.menuTab === t[0]) + '">' + t[1] + '</button>').join('') + '</div>' +
      (S.menuTab === 'templates' ? '' : '<div class="seg small" role="group" aria-label="グループ">' + ['ALL', 'FW', 'BK'].map((g) => '<button data-act="menu-group" data-v="' + g + '" aria-pressed="' + (S.menuGroup === g) + '">' + MGROUP[g] + '</button>').join('') + '</div>') + '</div>';
    if (S.menuTab === 'templates') return h + vTemplates();
    const all = d.menus.filter((w) => S.menuGroup === 'ALL' || w.group === S.menuGroup || w.group === 'ALL');
    const list = all.filter((w) => (S.menuTab === 'upcoming' ? w.date >= today : w.date < today));
    list.sort((a, b) => (S.menuTab === 'upcoming' ? (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) : (a.date > b.date ? -1 : a.date < b.date ? 1 : 0)) || (a.group < b.group ? -1 : 1));
    if (can('menu') || can('archive')) h += '<div class="toolbar">' + (can('menu') ? '<button class="btn primary" data-act="menu-new">' + icon('plus') + 'メニューを作成</button>' : '') +
      (can('archive') ? '<a class="btn" href="#archive">これまでのメニュー一覧（引き継ぎ）</a>' : '') + '</div>';
    if (S.menuTab === 'upcoming') h += selfRecBlock();
    if (!list.length) {
      if (S.menuTab !== 'upcoming') return h + emptyState('list', 'これまでのメニューはありません', '');
      return h + (can('menu')
        ? emptyState('menu', '今日からのメニューはまだありません', 'メニューを作ると、対象の人に通知で知らせます。よく使うメニューは「型」にすると曜日ごとに自動で作れます。', '<div class="toolbar center"><button class="btn primary" data-act="menu-new">' + icon('plus') + 'メニューを作成</button><button class="btn" data-act="menu-tab" data-v="templates">型・繰り返し</button></div>')
        : emptyState('menu', '今日からのメニューはまだありません', 'FWリーダーがメニューを出したら、ここに出ます。' + (pushSupported() ? '通知をオンにすると、自分が対象のメニューが出たときに知らせます。' : ''), pushSupported() ? '<div class="toolbar center"><a class="btn" href="#settings/push">' + icon('bell') + '通知の設定</a></div>' : ''));
    }
    // 「今日から」は今週と来週だけ。その先はたたむ（繰り返しのメニューで長くならないように）
    const until = L.addDays(L.weekStart(today), 13);
    const near = S.menuTab === 'upcoming' ? list.filter((w) => w.date <= until) : list;
    const far = S.menuTab === 'upcoming' ? list.filter((w) => w.date > until) : [];
    h += near.length ? menuDays(near, today) : '<p class="empty small">今週と来週のメニューはまだありません。</p>';
    if (far.length) h += '<details class="goal-more menu-far"><summary>その先のメニューを見る（' + far.length + '件）</summary>' + menuDays(far, today) + '</details>';
    if (!near.length && !far.length) return h;
    return h + '<p class="note">メニューの対象は、FWリーダーメニューに参加している人だけです。ポジションを指定したメニューは、メインかサブがそのポジションの人が対象です。</p>';
  }
  /** 日付の見出しごとにメニューのカードを並べる */
  function menuDays(list, today) {
    let h = '', last = '';
    list.forEach((w) => {
      if (w.date !== last) {
        if (last) h += '</ul>';
        h += '<h2 class="dayhead' + (w.date === today ? ' today' : '') + '">' + mdw(w.date) + (w.date === today ? '<span>今日</span>' : '') + '</h2><ul class="menus">';
        last = w.date;
      }
      h += '<li><button class="menu-card g-' + w.group + '" data-act="menu-open" data-id="' + w.id + '">' +
        '<span class="menu-top">' + targetChip(w) + '<b>' + esc(w.title) + '</b>' + (w.video ? '<span class="vtag">' + icon('play') + '動画</span>' : '') + '</span>' +
        '<span class="menu-body">' + esc(w.content.split('\n').slice(0, 3).join(' / ')) + '</span>' +
        '<span class="menu-foot">対象 ' + w.targets.length + '人' + (w.templateId ? '<small>繰り返し</small>' : '') + '</span></button></li>';
    });
    return h + (last ? '</ul>' : '');
  }
  /** 自主トレのおすすめ（FWリーダーが型に印を付けたもの。だれでも見られる） */
  function selfRecBlock() {
    const list = (S.data.selfRecs || []).filter((t) => S.menuGroup === 'ALL' || t.group === S.menuGroup || t.group === 'ALL');
    if (!list.length) return '';
    return '<section class="selfrec"><div class="block-h"><h2>自主トレのおすすめ</h2><span class="count">' + list.length + '件</span></div><ul class="sr-list">' +
      list.map((t) => '<li><button class="sr-card g-' + t.group + '" data-act="selfrec-open" data-id="' + t.id + '">' + targetChip(t) + '<b>' + esc(t.title) + '</b>' +
        '<span>' + esc(t.content.split('\n').slice(0, 2).join(' / ')) + '</span>' + (t.video ? '<span class="vtag">' + icon('play') + '動画</span>' : '') + '</button></li>').join('') + '</ul></section>';
  }
  function openSelfRec(id) {
    const t = (S.data.selfRecs || []).find((x) => x.id === id);
    if (!t) return;
    openSheet(t.title,
      '<div class="detail"><p class="detail-meta">' + targetChip(t) + '<small class="chip">自主トレのおすすめ</small></p>' +
      (t.video ? '<p>' + videoLink(t.video) + '</p>' : '') +
      '<h3>トレーニング内容</h3><p class="pre">' + nl2br(t.content) + '</p>' +
      (t.detail ? '<h3>回数・セット数・重量</h3><p class="pre">' + nl2br(t.detail) + '</p>' : '') +
      (t.note ? '<h3>備考</h3><p class="pre">' + nl2br(t.note) + '</p>' : '') +
      '<p class="note">メニューがない日や自主トレの人向けに、FWリーダーがすすめているメニューです。やったらマネージャーに伝えてください（「実施した」が付きます）。</p></div>');
  }
  function videoLink(url) {
    return url ? '<a class="btn small vbtn" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + icon('play') + 'フォームの見本（動画）を見る</a>' : '';
  }
  function openMenu(id) {
    const w = S.data.menus.find((x) => x.id === id);
    if (!w) return;
    const names = w.targets.map(nameOf).filter(Boolean);
    const tpl = w.templateId && (S.data.templates || []).find((t) => t.id === w.templateId);
    openSheet(w.title,
      '<div class="detail"><p class="detail-meta">' + targetChip(w) + mdw(w.date) + (tpl ? '<small class="chip">' + esc(repeatLabel(tpl) || '型') + '</small>' : '') + '</p>' +
      (w.video ? '<p>' + videoLink(w.video) + '</p>' : '') +
      '<h3>トレーニング内容</h3><p class="pre">' + nl2br(w.content) + '</p>' +
      (w.detail ? '<h3>回数・セット数・重量</h3><p class="pre">' + nl2br(w.detail) + '</p>' : '') +
      (w.note ? '<h3>備考</h3><p class="pre">' + nl2br(w.note) + '</p>' : '') +
      '<h3>対象者（' + names.length + '人）</h3><p class="names">' + (names.length ? names.map(esc).join('、') : 'メニュー参加の人がいません。') + '</p>' +
      '<p class="note">対象はFWリーダーメニューに参加している人です。' + (w.createdBy ? '作成：' + esc(nameOf(w.createdBy)) : '') + (w.templateId && !w.edited ? '。型を直すと、このメニューもそろいます' : '') + '</p>' +
      (can('menu') ? '<div class="actions wrap"><button class="btn" data-act="menu-copy" data-id="' + w.id + '">' + icon('copy') + '別の日にコピー</button><button class="btn" data-act="tpl-from-menu" data-id="' + w.id + '">型にする</button></div>' +
        '<div class="actions"><button class="btn danger" data-act="menu-del" data-id="' + w.id + '">削除</button><button class="btn primary" data-act="menu-edit" data-id="' + w.id + '">編集</button></div>' : '') +
      '</div>');
  }
  // 種目のライブラリ（押すとトレーニング内容に足す。回数は目安）
  const LIB = [
    ['下半身', [['スクワット', '5回×5セット'], ['フロントスクワット', '5回×4セット'], ['デッドリフト', '5回×3セット'], ['ルーマニアンデッドリフト', '8回×3セット'], ['ブルガリアンスクワット', '左右8回×3セット'], ['ランジ', '左右10回×3セット'], ['レッグプレス', '10回×3セット'], ['ヒップスラスト', '10回×3セット'], ['カーフレイズ', '15回×3セット']]],
    ['胸・押す', [['ベンチプレス', '5回×5セット'], ['インクラインベンチプレス', '8回×3セット'], ['ダンベルプレス', '10回×3セット'], ['腕立て伏せ', '20回×3セット'], ['ディップス', '10回×3セット']]],
    ['背中・引く', [['懸垂', '限界まで×3セット'], ['ベントオーバーロウ', '8回×4セット'], ['ラットプルダウン', '10回×3セット'], ['ダンベルロウ', '左右10回×3セット'], ['シュラッグ', '12回×3セット']]],
    ['肩・腕', [['ショルダープレス', '8回×3セット'], ['サイドレイズ', '15回×3セット'], ['アームカール', '12回×3セット'], ['トライセプスエクステンション', '12回×3セット']]],
    ['体幹・首', [['プランク', '60秒×3セット'], ['サイドプランク', '左右45秒×3セット'], ['アブローラー', '10回×3セット'], ['首（前後左右）', '各15回×2セット']]],
    ['パワー', [['パワークリーン', '3回×5セット'], ['ハングクリーン', '3回×4セット'], ['ボックスジャンプ', '5回×4セット'], ['メディシンボール投げ', '8回×3セット']]]
  ];
  function libPicker() {
    return '<details class="lib"><summary>' + icon('plus') + '種目のライブラリから足す</summary><p class="hint">押すと「トレーニング内容」に種目、「回数・セット数・重量」に目安を足します。あとで直せます。</p>' +
      LIB.map((c, ci) => '<div class="lib-c"><span class="lib-k">' + c[0] + '</span><div class="lib-l">' + c[1].map((x, i) => '<button type="button" class="lib-b" data-act="lib-add" data-c="' + ci + '" data-i="' + i + '">' + esc(x[0]) + '</button>').join('') + '</div></div>').join('') + '</details>';
  }
  function menuFields(v, opt) {
    opt = opt || {};
    return '<fieldset><legend>対象</legend><div class="radios">' +
      ['FW', 'BK', 'ALL'].map((g) => '<label><input type="radio" name="group" value="' + g + '"' + (v.group === g && !(v.positions || []).length ? ' checked' : '') + '><span>' + MGROUP[g] + '</span></label>').join('') + '</div>' +
      '<p class="hint">ポジションで絞るときは、下から選んでください（複数可）。選ぶと上のグループより優先します。</p>' +
      posPicker('positions', v.positions || []) +
      '<p class="hint strong" id="tgt-hint"></p></fieldset>' +
      '<label>メニュー名<input type="text" name="title" maxlength="60" value="' + esc(v.title) + '" placeholder="例：下半身の日" required' + (opt.focus ? ' autofocus' : '') + '></label>' +
      libPicker() +
      '<label>トレーニング内容<textarea name="content" rows="5" maxlength="3000" placeholder="例：&#10;スクワット&#10;デッドリフト" required>' + esc(v.content) + '</textarea></label>' +
      '<label>回数・セット数・重量<span class="opt">任意</span><textarea name="detail" rows="3" maxlength="3000" placeholder="例：スクワット 5回×5セット（MAXの80%）">' + esc(v.detail) + '</textarea></label>' +
      '<label>フォームの見本の動画<span class="opt">任意・URL</span><input type="url" name="video" maxlength="500" value="' + esc(v.video || '') + '" placeholder="https://youtu.be/..." inputmode="url" autocomplete="off"></label>' +
      '<label>備考<span class="opt">任意</span><textarea name="note" rows="2" maxlength="1000">' + esc(v.note) + '</textarea></label>';
  }
  function openMenuForm(id, prefill) {
    const w = id ? S.data.menus.find((x) => x.id === id) : null;
    const v = w || Object.assign({ date: S.data.today, group: 'FW', positions: [], title: '', content: '', detail: '', note: '', video: '' }, prefill || {});
    const tpls = (S.data.templates || []);
    openSheet(w ? 'メニューを編集' : 'メニューを作成',
      '<form data-form="menu" class="form">' + (w ? '<input type="hidden" name="id" value="' + w.id + '">' : '') +
      (!w && tpls.length ? '<label>型から作る<span class="opt">任意</span><select data-act-change="tpl-fill"><option value="">使わない</option>' + tpls.map((t) => '<option value="' + t.id + '">' + esc(t.title) + (t.repeat.length ? '（' + repeatLabel(t) + '）' : '') + '</option>').join('') + '</select></label>' : '') +
      '<label>実施予定日<input type="date" name="date" value="' + v.date + '" required></label>' +
      menuFields(v, { focus: !w && !prefill }) +
      (w && w.templateId && !w.edited ? '<p class="hint">このメニューは繰り返しの型から作られています。ここで直すと、型を直してもこの日はそろわなくなります。</p>' : '') +
      '<p class="form-err" hidden></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">' + (w ? '変更を保存' : 'メニューを登録') + '</button></div></form>');
    updateTargetHint();
  }
  // 型（テンプレート）と繰り返し
  function vTemplates() {
    const d = S.data, today = d.today;
    const list = (d.templates || []).slice().sort((a, b) => ((b.repeat.length > 0) - (a.repeat.length > 0)) || (a.title < b.title ? -1 : 1));
    let h = '<div class="toolbar"><button class="btn primary" data-act="tpl-new">' + icon('plus') + '型を作る</button>' + (can('archive') ? '<a class="btn" href="#archive">これまでのメニュー一覧</a>' : '') + '</div>' +
      '<p class="note is-top">よく使うメニューを「型」にしておくと、作るときに選ぶだけで入ります。曜日を選ぶと、その曜日のメニューを4週間先まで自動で作ります（毎日のびます）。</p>';
    if (!list.length) return h + emptyState('menu', 'まだ型がありません', 'メニューの「型にする」からも作れます。「自主トレのおすすめ」にした型は、部員みんなのメニュー画面に出ます。');
    return h + '<ul class="menus">' + list.map((t) => {
      const next = d.menus.filter((w) => w.templateId === t.id && w.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
      return '<li><button class="menu-card g-' + t.group + '" data-act="tpl-open" data-id="' + t.id + '"><span class="menu-top">' + targetChip(t) + '<b>' + esc(t.title) + '</b>' + (t.video ? '<span class="vtag">' + icon('play') + '</span>' : '') + '</span>' +
        '<span class="menu-body">' + esc(t.content.split('\n').slice(0, 3).join(' / ')) + '</span>' +
        '<span class="menu-foot">' + (t.repeat.length ? repeatLabel(t) + (next ? '・次は ' + mdw(next.date) : '') + (t.repeatTo ? '・' + md(t.repeatTo) + 'まで' : '') : '繰り返しなし') + (t.selfRec ? '<small>自主トレのおすすめ</small>' : '') + '</span></button></li>';
    }).join('') + '</ul>';
  }
  function openTemplate(id) {
    const t = (S.data.templates || []).find((x) => x.id === id);
    if (!t) return;
    openSheet('型：' + t.title,
      '<div class="detail"><p class="detail-meta">' + targetChip(t) + (t.repeat.length ? repeatLabel(t) : '繰り返しなし') + (t.repeatFrom || t.repeatTo ? '<small>' + (t.repeatFrom ? md(t.repeatFrom) : '') + '〜' + (t.repeatTo ? md(t.repeatTo) : '') + '</small>' : '') + '</p>' +
      (t.video ? '<p>' + videoLink(t.video) + '</p>' : '') +
      '<h3>トレーニング内容</h3><p class="pre">' + nl2br(t.content) + '</p>' +
      (t.detail ? '<h3>回数・セット数・重量</h3><p class="pre">' + nl2br(t.detail) + '</p>' : '') +
      (t.note ? '<h3>備考</h3><p class="pre">' + nl2br(t.note) + '</p>' : '') +
      '<p class="note">作成：' + esc(nameOf(t.createdBy)) + '</p>' +
      '<div class="actions wrap"><button class="btn" data-act="tpl-use" data-id="' + t.id + '">この型でメニューを作る</button></div>' +
      '<div class="actions"><button class="btn danger" data-act="tpl-del" data-id="' + t.id + '">削除</button><button class="btn primary" data-act="tpl-edit" data-id="' + t.id + '">編集</button></div></div>');
  }
  function openTemplateForm(id, prefill) {
    const t = id ? (S.data.templates || []).find((x) => x.id === id) : null;
    const v = t || Object.assign({ group: 'FW', positions: [], title: '', content: '', detail: '', note: '', video: '', repeat: [], repeatFrom: '', repeatTo: '' }, prefill || {});
    openSheet(t ? '型を編集' : '型を作る',
      '<form data-form="template" class="form">' + (t ? '<input type="hidden" name="id" value="' + t.id + '">' : '') +
      menuFields(v, { focus: !t && !prefill }) +
      '<fieldset><legend>繰り返す曜日<span class="opt">任意</span></legend><div class="radios wd">' +
      WD_MON.map((d) => '<label><input type="checkbox" name="repeat" value="' + d + '"' + (v.repeat.indexOf(d) >= 0 ? ' checked' : '') + '><span>' + WD[d] + '</span></label>').join('') + '</div>' +
      '<p class="hint">選ぶと、その曜日のメニューを今日から4週間先まで自動で作ります（毎日のびます）。選ばなければ、型として保存するだけです。</p>' +
      '<div class="two"><label>開始日<span class="opt">任意</span><input type="date" name="repeatFrom" value="' + esc(v.repeatFrom || '') + '"></label><label>終了日<span class="opt">任意</span><input type="date" name="repeatTo" value="' + esc(v.repeatTo || '') + '"></label></div></fieldset>' +
      '<label class="check"><input type="checkbox" name="selfRec"' + (v.selfRec ? ' checked' : '') + '><span>自主トレのおすすめとして、部員みんなに見せる<small>メニュー画面の上に出ます。メニューがない日や自主トレの人向け</small></span></label>' +
      (t ? '<p class="hint">保存すると、今日以降の繰り返しのメニュー（手で直していないもの）も、この内容にそろえます。曜日を外した日の分は消えます。</p>' : '') +
      '<p class="form-err" hidden></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">' + (t ? '変更を保存' : '型を保存') + '</button></div></form>');
    updateTargetHint();
  }
  function openCopy(id) {
    const w = S.data.menus.find((x) => x.id === id);
    if (!w) return;
    const today = S.data.today, start = L.weekStart(today);
    let cal = '<div class="mcal-w">' + ['月', '火', '水', '木', '金', '土', '日'].map((x) => '<span>' + x + '</span>').join('') + '</div><div class="mcal-g copycal">';
    let first = true;
    for (let i = 0; i < 42; i++) {
      const d = L.addDays(start, i);
      const past = d < today, same = d === w.date;
      if (past) { cal += '<span class="mday blank"></span>'; continue; }
      cal += '<label class="cday' + (same ? ' src' : '') + '"><input type="checkbox" name="dates" value="' + d + '"' + (same ? ' disabled' : '') + '><span><b>' + +d.slice(8, 10) + '</b>' + (d.slice(8, 10) === '01' || first ? '<small>' + +d.slice(5, 7) + '月</small>' : '') + '</span></label>';
      first = false;
    }
    cal += '</div>';
    openSheet('別の日にコピー',
      '<form data-form="copy" class="form"><input type="hidden" name="id" value="' + w.id + '"><p class="lead-line small">「' + esc(w.title) + '」（' + mdw(w.date) + '）を、選んだ日にコピーします。対象者はその日の設定で決まります。</p>' +
      '<div class="mcal">' + cal + '</div><p class="hint" id="copy-n">日付を選んでください（6週間先まで・複数可）</p>' +
      '<p class="form-err" hidden></p><div class="actions"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">コピーする</button></div></form>');
  }
  // これまでのメニュー（引き継ぎ用）
  async function loadArchive() {
    try { const r = await api('menuArchive', {}); S.archive = { list: r.menus, q: (S.archive && S.archive.q) || '', by: (S.archive && S.archive.by) || '' }; }
    catch (e) { S.archive = { list: [], q: '', by: '', err: e.message }; }
    if (S.route.name === 'archive') render();
  }
  function archiveFiltered() {
    const a = S.archive, q = (a.q || '').trim().toLowerCase();
    return a.list.filter((w) => (!a.by || w.createdBy === a.by) && (!q || (w.title + '\n' + w.content + '\n' + w.detail + '\n' + w.note).toLowerCase().indexOf(q) >= 0));
  }
  function vArchive() {
    let h = '<div class="sub-h"><a class="ibtn" href="#menus" aria-label="戻る">' + icon('back') + '</a><h1>これまでのメニュー</h1></div>';
    if (!can('archive')) return h + '<p class="empty">ログインした管理者・FWリーダー・マネージャーが見られます。</p>';
    if (!S.archive) { loadArchive(); return h + '<p class="empty">読み込み中…</p>'; }
    if (S.archive.err) return h + '<p class="empty">' + esc(S.archive.err) + '</p>';
    const a = S.archive, list = archiveFiltered();
    const authors = []; a.list.forEach((w) => { if (w.createdBy && authors.indexOf(w.createdBy) < 0) authors.push(w.createdBy); });
    h += '<p class="note is-top">FWリーダーの交代のときの引き継ぎ用です。これまでに作られたメニュー（' + a.list.length + '件）を全部見られます。いいメニューは「型にする」で次の人も使えます。</p>' +
      '<div class="fbar arch-f"><input type="search" class="search" data-act-input="arch-q" value="' + esc(a.q) + '" placeholder="メニュー名・種目で探す" aria-label="探す">' +
      '<select data-act-change="arch-by" aria-label="作った人"><option value="">作った人：全員</option>' + authors.map((id) => '<option value="' + id + '"' + (a.by === id ? ' selected' : '') + '>' + esc(nameOf(id) || id) + '</option>').join('') + '</select>' +
      '<button class="btn small" data-act="arch-csv">' + icon('copy') + '表（CSV）で保存</button></div>';
    if (!list.length) return h + '<p class="empty">見つかりません。</p>';
    let last = '';
    list.slice(0, 300).forEach((w) => {
      const mo = w.date.slice(0, 7);
      if (mo !== last) { if (last) h += '</ul>'; h += '<h2 class="dayhead">' + ymLabel(w.date) + '</h2><ul class="arch">'; last = mo; }
      h += '<li><details><summary><span class="arch-d">' + mdw(w.date) + '</span>' + targetChip(w) + '<b>' + esc(w.title) + '</b><small>' + esc(nameOf(w.createdBy)) + '・対象' + w.targetCount + '人</small></summary>' +
        (w.video ? '<p>' + videoLink(w.video) + '</p>' : '') +
        '<p class="pre">' + nl2br(w.content) + '</p>' + (w.detail ? '<p class="pre sub">' + nl2br(w.detail) + '</p>' : '') + (w.note ? '<p class="pre sub">' + nl2br(w.note) + '</p>' : '') +
        (can('menu') ? '<div class="share-row"><button class="btn small" data-act="arch-tpl" data-id="' + w.id + '">型にする</button><button class="btn small" data-act="arch-new" data-id="' + w.id + '">これを元に作る</button></div>' : '') + '</details></li>';
    });
    h += '</ul>';
    if (list.length > 300) h += '<p class="note">先頭の300件だけ表示しています。探す・作った人で絞るか、CSVで全部を保存してください。</p>';
    return h;
  }
  function archiveCsv() {
    const rows = [['日付', '対象', 'メニュー名', 'トレーニング内容', '回数・セット数・重量', '備考', '動画リンク', '作った人', '対象人数']];
    archiveFiltered().forEach((w) => rows.push([w.date, w.positions.length ? w.positions.join('・') : MGROUP[w.group], w.title, w.content, w.detail, w.note, w.video, nameOf(w.createdBy), w.targetCount]));
    const csv = '﻿' + rows.map((r) => r.map((c) => { const x = String(c == null ? '' : c); return /[",\n\r]/.test(x) || /^[=+\-@]/.test(x) ? '"' + (/^[=+\-@]/.test(x) ? "'" : '') + x.replace(/"/g, '""') + '"' : x; }).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const el = document.createElement('a'); el.href = url; el.download = 'kintore-menus-' + S.data.today + '.csv'; document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function previewTargets(group, poss, date) {
    return S.data.members.filter((m) => L.inRoster(m, date) && m.mode === 'leader' &&
      (poss.length ? poss.some((p) => L.hasPosition(m, p)) : (group === 'ALL' || m.group === group))).length;
  }
  function posPicker(name, selected, opt) {
    opt = opt || {};
    return '<div class="pospick">' + ['FW', 'BK'].map((g) => '<div class="pospick-row"><span class="pospick-g">' + g + '</span>' +
      positions().filter((p) => p.group === g).map((p) => '<label class="pchip-l"><input type="' + (opt.single ? 'radio' : 'checkbox') + '" name="' + name + '" value="' + esc(p.code) + '"' + (selected.indexOf(p.code) >= 0 ? ' checked' : '') + '><span class="pchip g-' + g + '">' + esc(p.code) + '</span></label>').join('') +
      '</div>').join('') + (opt.single ? '<div class="pospick-row"><label class="pchip-l"><input type="radio" name="' + name + '" value=""' + (!selected.length ? ' checked' : '') + '><span class="pchip">未設定</span></label></div>' : '') + '</div>';
  }
  function menuFormValues(f) {
    const poss = $$('input[name="positions"]:checked', f).map((x) => x.value);
    const gEl = $('input[name="group"]:checked', f);
    return { poss: poss, group: gEl ? gEl.value : 'ALL' };
  }
  function updateTargetHint() {
    const f = $('#sheet-root form[data-form="menu"]') || $('#sheet-root form[data-form="template"]');
    if (!f) return;
    const v = menuFormValues(f), dt = f.date ? f.date.value : S.data.today;
    if (!L.isDate(dt)) return;
    const n = previewTargets(v.group, v.poss, dt);
    $('#tgt-hint').textContent = '対象：' + (v.poss.length ? v.poss.join('・') : MGROUP[v.group]) + 'のメニュー参加者 ' + n + '人（自主トレの人は入りません）';
  }

  // ---------- 実施記録（管理者・マネージャー） ----------
  function recRows() {
    const d = S.data, date = S.rec.date;
    const tgt = S.idx.tgt[date] || {};
    const rows = [];
    d.members.forEach((m) => {
      const r = L.getRec(S.idx, m.id, date);
      if (!r && !L.inRoster(m, date)) return;
      const saved = !!(r && r.s === 1);
      const isT = (r && r.t === 1) || !!tgt[m.id];
      const raw = d.records.find((x) => x[0] === m.id && x[1] === date) || [];
      const locked = !!r && me().perm === 'manager' && raw[5] !== me().id;
      rows.push({ m: m, saved: saved, sec: isT ? 0 : (m.mode === 'self' ? 1 : 2), locked: locked, by: r ? r.by : '' });
    });
    const ord = recOrder(rows.map((x) => x.m), date);
    rows.sort((a, b) => (a.sec - b.sec) || (ord[a.m.id] - ord[b.m.id]));
    return rows;
  }
  const REC_SORTS = [['pos', 'ポジション'], ['grade', '学年'], ['name', '名前'], ['recent', '最近やった順']];
  /** 記録画面の並び順。recent は、その日までに最後に「実施した」日が新しい順 */
  function recOrder(list, date) {
    let arr;
    if (S.recSort === 'grade') {
      const gi = (g) => { const i = GRADES.indexOf(g || ''); return i < 0 ? 99 : i; };
      const base = sortMembers(list);
      arr = base.slice().sort((a, b) => (gi(a.grade) - gi(b.grade)) || (base.indexOf(a) - base.indexOf(b)));
    } else if (S.recSort === 'name') {
      arr = list.slice().sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    } else if (S.recSort === 'recent') {
      const last = {};
      (S.data.records || []).forEach((r) => { if (+r[2] === 1 && r[1] <= date && (!last[r[0]] || last[r[0]] < r[1])) last[r[0]] = r[1]; });
      const base = sortMembers(list);
      arr = base.slice().sort((a, b) => ((last[b.id] || '') < (last[a.id] || '') ? -1 : (last[b.id] || '') > (last[a.id] || '') ? 1 : 0) || (base.indexOf(a) - base.indexOf(b)));
    } else arr = sortMembers(list);
    const o = {};
    arr.forEach((m, i) => { o[m.id] = i; });
    return o;
  }
  const recCur = (row) => (S.rec.edits[row.m.id] !== undefined ? S.rec.edits[row.m.id] : row.saved);
  function recVisible(row) {
    if (S.rec.position) return L.hasPosition(row.m, S.rec.position);
    return S.rec.group === 'ALL' || row.m.group === S.rec.group;
  }
  function recChanges() {
    const rows = recRows();
    const add = [], del = [];
    rows.forEach((r) => {
      const e = S.rec.edits[r.m.id];
      if (e === undefined || e === r.saved) return;
      (e ? add : del).push(r);
    });
    return { add: add, del: del, rows: rows };
  }
  function recRowHtml(row) {
    const cur = recCur(row), changed = cur !== row.saved, m = row.m;
    return '<li class="rec-row' + (cur ? ' on' : '') + (changed ? ' changed' : '') + (row.locked ? ' locked' : '') + '" data-id="' + m.id + '">' +
      '<span class="rec-pos g-' + (m.group || 'X') + '">' + esc(m.position || m.group || '－') + '</span>' +
      '<div class="rec-n"><b>' + esc(m.name) + (L.exemptOn(S.idx, m.id, S.rec.date) ? '<span class="ex-tag">免除</span>' : '') + '</b><small>' + (m.grade ? esc(m.grade) : '') +
      (changed ? '・<em>未保存</em>' : (row.saved && row.by ? '・記録：' + esc(nameOf(row.by)) : '')) +
      (can('admin') && row.saved && !changed ? '・<button class="textbtn" data-act="rec-del" data-id="' + m.id + '">取り消す</button>' : '') + '</small></div>' +
      (row.locked
        ? '<div class="rec-lock">' + icon('lock') + '<span>実施した</span></div>'
        : '<button class="rec-btn" data-act="rec-toggle" data-id="' + m.id + '" aria-pressed="' + cur + '">' + icon('check') + '<span>実施した</span></button>') +
      '</li>';
  }
  function recBarHtml() {
    const ch = recChanges();
    const vis = ch.rows;
    const on = vis.filter((r) => recCur(r)).length;
    const tg = vis.filter((r) => r.sec === 0);
    const n = ch.add.length + ch.del.length;
    return '<div class="rec-sum"><span class="s-on">' + icon('check') + '<b class="num">' + on + '</b>人</span>' +
      (tg.length ? '<span class="s-t">対象 ' + tg.filter((r) => recCur(r)).length + '/' + tg.length + '</span>' : '') + '</div>' +
      '<button class="btn primary" data-act="rec-confirm"' + (n ? '' : ' disabled') + '>' + (n ? '保存する（' + n + '件）' : '変更なし') + '</button>';
  }
  function vRecord() {
    if (!can('record')) return '<p class="empty">実施記録をつけられるのは、管理者とマネージャーです。<br><button class="btn primary" data-act="login">ログイン</button></p>';
    const d = S.data, today = d.today;
    if (!S.rec.date) S.rec.date = today;
    const date = S.rec.date;
    const menus = S.idx.menusByDate[date] || [];
    const rows = recRows();
    let h = '<div class="rec-date"><button class="ibtn" data-act="rec-day" data-v="-1" aria-label="前の日">' + icon('back') + '</button>' +
      '<label class="rec-pick"><span>' + mdw(date) + (date === today ? '<small>今日</small>' : '') + '</span><input type="date" data-act-change="rec-date" value="' + date + '" max="' + today + '" aria-label="記録する日付"></label>' +
      '<button class="ibtn" data-act="rec-day" data-v="1" aria-label="次の日"' + (date >= today ? ' disabled' : '') + '>' + icon('next') + '</button></div>';
    h += '<div class="rec-menus">' + (menus.length
      ? menus.map((w) => '<button class="mini-menu" data-act="menu-open" data-id="' + w.id + '">' + targetChip(w) + esc(w.title) + '<small>対象' + w.targets.length + '人</small></button>').join('')
      : '<span>この日のFWリーダーメニューはありません。自主トレの実施を記録できます。</span>') + '</div>';
    // 上は2段：絞り込み＋「その他」（1週間まとめて・取り消した記録）／並び順
    h += '<div class="fbar rec-fbar">' + filterBar(S.rec.group, 'r').replace(/^<div class="fbar">|<\/div>$/g, '') +
      '<button class="btn small rec-more" data-act="rec-more" aria-haspopup="dialog">' + icon('more') + 'その他</button></div>' +
      '<div class="fbar"><div class="seg small" role="group" aria-label="並び順">' + REC_SORTS.map((x) => '<button data-act="rec-sort" data-v="' + x[0] + '" aria-pressed="' + (S.recSort === x[0]) + '">' + x[1] + '</button>').join('') + '</div></div>';
    if (!rows.length) return h + emptyState('people', 'この日に記録できる部員がいません', '部員の在籍期間（開始日・退部日）を確認してください。');
    const secName = ['FWリーダーメニューの対象者', '自主トレの人', 'メニュー参加（この日は対象メニューなし）'];
    let sec = -1, shown = 0;
    rows.forEach((r) => {
      if (!recVisible(r)) return;
      if (r.sec !== sec) {
        if (sec >= 0) h += '</ul>';
        sec = r.sec;
        h += '<h2 class="rec-sec">' + secName[sec] + '<span>' + rows.filter((x) => x.sec === sec && recVisible(x)).length + '人</span></h2><ul class="rec-list">';
      }
      h += recRowHtml(r); shown++;
    });
    if (sec >= 0) h += '</ul>';
    if (!shown) h += '<p class="empty">絞り込みに合う部員がいません。</p>';
    h += '<p class="note">やった人の「実施した」を押すだけです。押していない人は「実施していない」になります（メニューの対象日だけ。翌日から集計に入ります）。もう一度押すと取り消せます。</p>' +
      '<div class="rec-bar" id="rec-bar">' + recBarHtml() + '</div>';
    return h;
  }
  // ---------- 1週間まとめて記録・修正（表） ----------
  function weekGrid() {
    const d = S.data, today = d.today, W = S.wk, ws = W.ws;
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => L.addDays(ws, i));
    const recOf = (id, dt) => d.records.find((x) => x[0] === id && x[1] === dt);
    const members = sortMembers(d.members.filter((m) => m.player && days.some((dt) => L.inRoster(m, dt) || recOf(m.id, dt))))
      .filter((m) => (S.rec.position ? L.hasPosition(m, S.rec.position) : S.rec.group === 'ALL' || m.group === S.rec.group));
    const n = Object.keys(W.edits).length;
    let h = '<div class="wk-nav"><button class="ibtn" data-act="week-move" data-v="-1" aria-label="前の週">' + icon('back') + '</button><b>' + mdw(ws) + '〜' + mdw(days[6]) + '</b>' +
      '<button class="ibtn" data-act="week-move" data-v="1" aria-label="次の週"' + (L.addDays(ws, 7) > today ? ' disabled' : '') + '>' + icon('next') + '</button></div>' +
      '<p class="hint">マスを押すと「実施した」⇔「なし」が切り替わります。保存するまで反映しません。' + (me().perm === 'manager' ? 'ほかの人が入れた記録（' + icon('lock') + '）は管理者だけが取り消せます。' : '') + '</p>' +
      '<div class="wk-wrap"><table class="wk"><thead><tr><th>名前</th>' + days.map((dt) => '<th class="' + (dt === today ? 'today' : '') + (dt > today ? ' fut' : '') + '"><small>' + WD[L.dow(dt)] + '</small>' + +dt.slice(8) + '</th>').join('') + '<th>計</th></tr></thead><tbody>';
    members.forEach((m) => {
      let total = 0;
      h += '<tr><th><b>' + esc(m.name) + '</b><small>' + esc(m.position || m.group || '') + '</small></th>';
      days.forEach((dt) => {
        const r = recOf(m.id, dt), saved = !!(r && +r[2] === 1), k = m.id + '|' + dt;
        const cur = W.edits[k] !== undefined ? W.edits[k] : saved;
        if (cur) total++;
        const off = dt > today || (!r && !L.inRoster(m, dt));
        const locked = saved && me().perm === 'manager' && r[5] !== me().id;
        const ex = L.exemptOn(S.idx, m.id, dt);
        h += '<td>' + (off ? '<span class="wk-off"></span>' : locked ? '<span class="wk-c on locked" title="ほかの人の記録">' + icon('lock') + '</span>'
          : '<button class="wk-c' + (cur ? ' on' : '') + (cur !== saved ? ' changed' : '') + (ex ? ' ex' : '') + '" data-act="week-cell" data-k="' + esc(k) + '" aria-pressed="' + cur + '" aria-label="' + esc(m.name) + ' ' + mdw(dt) + (ex ? '（免除）' : '') + '">' + (cur ? icon('check') : ex ? '免' : '') + '</button>') + '</td>';
      });
      const nd = L.weekNeed(S.idx, m, ws, goal()).need;
      h += '<td class="wk-t' + (nd && total >= nd ? ' ok' : '') + '"><b class="num">' + total + '</b></td></tr>';
    });
    if (!members.length) h += '<tr><td colspan="9">' + emptyState('people', '表示できる部員がいません', '絞り込みを確かめてください。') + '</td></tr>';
    h += '</tbody></table></div><p class="form-err" hidden></p>' +
      '<div class="actions sticky"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" data-act="week-save"' + (n ? '' : ' disabled') + '>' + (n ? '保存する（' + n + '件）' : '変更なし') + '</button></div>';
    return h;
  }
  function openWeek(ws) {
    S.wk = { ws: ws, edits: {} };
    openSheet('1週間まとめて記録', '<div class="wkbox">' + weekGrid() + '</div>', { wide: true });
  }
  function refreshWeek() { const b = $('#sheet-root .wkbox'); if (b) b.innerHTML = weekGrid(); }
  /** 保存の前後で、週の目標に届いた人（紙吹雪とお知らせ用） */
  function goalHitters(beforeIdx, afterIdx, weeks) {
    const out = [];
    S.data.members.filter((m) => m.player && m.active).forEach((m) => {
      weeks.forEach((ws) => {
        const nd = L.weekNeed(afterIdx, m, ws, goal()).need;
        if (nd && L.weekCount(beforeIdx, m, ws) < nd && L.weekCount(afterIdx, m, ws) >= nd && out.indexOf(m.name) < 0) out.push(m.name);
      });
    });
    return out;
  }
  function recRefreshRow(id) {
    const row = recRows().find((r) => r.m.id === id);
    const li = $('.rec-row[data-id="' + id + '"]');
    if (row && li) li.outerHTML = recRowHtml(row);
    const bar = $('#rec-bar');
    if (bar) bar.innerHTML = recBarHtml();
  }
  function recDirty() { const c = recChanges(); return c.add.length + c.del.length > 0; }
  function recLeaveOk() {
    if (!S.rec.date || !S.idx || !can('record') || !recDirty()) return true;
    if (confirm('保存していない記録があります。破棄して移動しますか？')) { S.rec.edits = {}; return true; }
    return false;
  }
  function openRecConfirm() {
    const ch = recChanges(), date = S.rec.date;
    const tgOff = ch.rows.filter((r) => r.sec === 0 && !recCur(r));
    const li = (r) => '<li><b>' + esc(r.m.name) + '</b><span>' + esc(r.m.position || r.m.group || '') + '</span></li>';
    openSheet(mdw(date) + ' の記録を保存',
      '<div class="confirm">' +
      (ch.add.length ? '<h3>「実施した」にする（' + ch.add.length + '人）</h3><ul class="clist">' + ch.add.map(li).join('') + '</ul>' : '') +
      (ch.del.length ? '<h3>取り消す（' + ch.del.length + '人）</h3><ul class="clist">' + ch.del.map(li).join('') + '</ul>' : '') +
      (tgOff.length ? '<p class="note">メニュー対象で押していない人：' + tgOff.length + '人（' + (date < S.data.today ? 'この日は「実施していない」になります' : '明日から「実施していない」になります') + '）</p>' : '') +
      '<p class="form-err" hidden></p>' +
      '<div class="actions"><button class="btn" data-act="sheet-close">戻って直す</button><button class="btn primary" data-act="rec-save">この内容で保存</button></div></div>');
  }

  // ---------- 設定 ----------
  function vSettings() {
    const m = me();
    let h = '';
    if (can('admin') && (S.data.pinRequests || []).length) {
      h += '<section class="block warnbox"><div class="block-h"><h2>暗証番号の再発行の依頼</h2><span class="count">' + S.data.pinRequests.length + '件</span></div><ul class="exlist">' +
        S.data.pinRequests.map((x) => '<li><span class="ex-d">' + esc(x.at.slice(5, 16).replace('-', '/')) + '</span><span class="ex-r"><b>' + esc(x.name) + '</b><small>' + PERM[x.perm] + '</small></span>' +
          '<span class="pr-a"><button class="btn small primary" data-act="pin-reset" data-id="' + x.id + '">発行</button><button class="textbtn" data-act="pinreq-close" data-id="' + x.id + '">閉じる</button></span></li>').join('') + '</ul>' +
        '<p class="note">「発行」で新しい最初の暗証番号が出ます。本人に直接伝えてください。心当たりのない依頼は「閉じる」。</p></section>';
    }
    const players = sortMembers(S.data.members.filter((x) => x.active && x.player));
    // 1. 自分の名前・見やすさ（この端末だけ）
    h += '<section class="block"><div class="block-h"><h2>自分の名前・見やすさ</h2><span class="count">この端末だけ</span></div>' +
      '<label class="prefrow form"><span>自分の名前<small>ホームに「わたし」（今週あと何回・届いた応援）が出ます。応援を送るときの名前・通知にも使います</small></span>' +
      '<select data-act-change="pref-self"><option value="">選ばない</option>' + players.map((x) => '<option value="' + x.id + '"' + (PREF.self === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></label>' +
      '<div class="prefrow"><span>画面の明るさ</span><div class="seg small" role="group" aria-label="画面の明るさ">' +
      [['light', 'ライト'], ['dark', 'ダーク'], ['auto', 'スマホに合わせる']].map((x) => '<button data-act="pref-theme" data-v="' + x[0] + '" aria-pressed="' + (PREF.theme === x[0]) + '">' + x[1] + '</button>').join('') + '</div></div>' +
      '<div class="prefrow"><span>文字の大きさ</span><div class="seg small" role="group" aria-label="文字の大きさ">' +
      SIZES.map((x) => '<button data-act="pref-size" data-v="' + x[0] + '" aria-pressed="' + (PREF.size === x[0]) + '">' + x[1] + '</button>').join('') + '</div></div></section>';
    // 2. 通知・ホーム画面のアプリ
    h += pushBlock() + (isStandalone() ? '' : installBlock());
    // 3. ログイン（スタッフ）
    h += '<section class="block"><div class="block-h"><h2>ログイン</h2><span class="count">管理者・マネージャー・FWリーダー</span></div>';
    if (m) h += '<p class="acct"><b>' + esc(m.name) + '</b><span class="chip role">' + PERM[m.perm] + '</span></p>' +
      '<div class="toolbar"><button class="btn" data-act="pin-change">暗証番号を変更</button><button class="btn" data-act="sessions-open">ログインしている端末</button><button class="btn" data-act="logout">ログアウト</button></div>';
    else h += '<p class="lead-line small">見るだけならログインは不要です。記録やメニューを入力する人だけログインしてください。</p>' +
      '<div class="toolbar"><button class="btn primary" data-act="login">ログイン</button></div>';
    h += '</section>';
    // 4. 管理者メニュー（2つに分ける）
    if (can('admin')) {
      h += '<section class="block"><div class="block-h"><h2>管理者メニュー</h2></div><h3 class="sub3">部員と記録</h3><ul class="links">' +
        '<li><a href="#members">部員の追加・編集・権限<small>ポジション・取り組み方の設定は「まとめて編集」が便利です</small></a></li>' +
        '<li><button data-act="perms-open">役職をまとめて付け替え<small>新年度のFWリーダー・マネージャーの交代。新しい人の暗証番号もまとめて発行します</small></button></li>' +
        '<li><button data-act="trash-open">取り消した記録<small>まちがえて取り消した「実施した」を戻せます</small></button></li>' +
        '<li><a href="#feedback">要望・不具合' + (S.data.feedbackOpen ? '<span class="badge-n">' + S.data.feedbackOpen + '</span>' : '') + '<small>部員から届いたもの。対応したら「対応済み」に</small></a></li>' +
        '<li><a href="#logs">操作履歴<small>だれが・いつ・何を変えたか。画面のエラーも自動で残ります</small></a></li>' +
        '</ul><h3 class="sub3">部のルール</h3><ul class="links">' +
        '<li><button data-act="goal-open">週の目標回数（マスト）<small>いまは週' + goal() + '回以上</small></button></li>' +
        '<li><button data-act="offs-open">部全体のオフ期間<small>試験期間・合宿など、全員の目標をなしにする期間</small></button></li>' +
        '<li><button data-act="lifts-open">重さの目安（体重×倍率）<small>' + esc((S.data.liftRatios || []).map((x) => x.name + '×' + x.ratio).join('・') || '未設定') + '</small></button></li>' +
        '<li><button data-act="viewlock">閲覧の合言葉<small>' + (S.data.viewLock ? '設定中：合言葉を知っている人だけ見られます' : '未設定：URLを知っていれば誰でも見られます') + '</small></button></li>' +
        '</ul></section>';
    }
    // 5. サポート
    h += '<section class="block" id="feedback"><div class="block-h"><h2>サポート</h2></div><ul class="links">' +
      '<li><a href="#help">' + icon('help') + '使い方ガイド<small>40秒の動画と、立場ごとの使い方</small></a></li>' +
      '<li><button data-act="guide">30秒の紹介をもう一度<small>はじめて開いたときの案内</small></button></li>' +
      '<li><button data-act="fb-open">' + icon('send') + '要望・不具合を送る<small>「こうしてほしい」「ここがおかしい」を管理者に。ログインはいりません</small></button></li></ul></section>';
    h +=
      '<p class="ver">KURFC 筋トレ管理 v' + VERSION + (S.data.version ? '（サーバー v' + esc(S.data.version) + '）' : '') + '</p>';
    return h;
  }
  async function openSessions() {
    openSheet('ログインしている端末', '<p class="empty small">読み込み中…</p>');
    try {
      const r = await api('sessions', {});
      const list = r.sessions;
      openSheet('ログインしている端末',
        '<p class="lead-line small">' + esc(me().name) + ' さんでログインしている端末です。心当たりのない端末や、なくしたスマホはログアウトさせてください。</p>' +
        '<ul class="exlist sess">' + list.map((x) => '<li><span class="ex-r"><b>' + esc(x.device || '名前のない端末') + (x.current ? '<small class="ex-st s-now">この端末</small>' : '') + '</b><small>ログイン ' + esc(x.createdAt.slice(0, 16).replace(/-/g, '/')) + '</small></span>' +
          (x.current ? '<span></span>' : '<button class="btn small" data-act="sess-out" data-k="' + esc(x.key) + '">ログアウト</button>') + '</li>').join('') + '</ul>' +
        (list.length > 1 ? '<div class="actions"><button class="btn danger" data-act="sess-out" data-k="others">この端末以外をすべてログアウト</button></div>' : '<p class="note">この端末だけです。</p>') +
        '<p class="note">暗証番号を変えると、ほかの端末は自動でログアウトします。</p>');
    } catch (e) { openSheet('ログインしている端末', '<p class="form-err">' + esc(e.message) + '</p>'); }
  }
  function openPerms() {
    const list = S.data.members.filter((m) => m.active);
    const rank = { admin: 0, leader: 1, manager: 2, member: 3 };
    const sorted = sortMembers(list).sort((a, b) => rank[a.perm] - rank[b.perm]);
    openSheet('役職をまとめて付け替え',
      '<form data-form="perms" class="form"><p class="lead-line small">新年度にFWリーダー・マネージャーが交代するときに使います。変えた人だけ保存します。</p>' +
      '<p class="hint">新しくログインする人（一般部員から変えた人）には、最初の暗証番号をまとめて発行して、次の画面に出します。一般部員に戻した人はログインできなくなります。自分自身はここでは変えられません。</p>' +
      '<ul class="pm-list">' + sorted.map((m) => '<li class="pm-top"><span><b>' + esc(m.name) + '</b><small>' + esc(m.grade || '') + (m.player ? '・' + esc(m.position || m.group || '') : '・' + esc(m.clubRole)) + '</small></span>' +
        '<select name="p_' + m.id + '" data-cur="' + m.perm + '" aria-label="' + esc(m.name) + 'の権限"' + (m.id === me().id ? ' disabled' : '') + '>' +
        ['member', 'manager', 'leader', 'admin'].map((r) => '<option value="' + r + '"' + (m.perm === r ? ' selected' : '') + '>' + PERM[r] + '</option>').join('') + '</select></li>').join('') + '</ul>' +
      '<p class="form-err" hidden></p><div class="actions sticky"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">変更を保存</button></div></form>', { wide: true });
  }
  async function openTrash() {
    openSheet('取り消した記録', '<p class="empty small">読み込み中…</p>');
    try {
      const r = await api('trash', {});
      const mine = me();
      openSheet('取り消した記録',
        '<p class="lead-line small">「実施した」を取り消した記録です（新しい順・最大200件）。まちがえて取り消したものは「戻す」で元に戻せます。' + (mine.perm === 'manager' ? 'マネージャーは自分が取り消したものだけ戻せます。' : '') + '</p>' +
        (r.trash.length ? '<ul class="exlist">' + r.trash.map((x) => '<li><span class="ex-d">' + mdw(x.date) + '</span><span class="ex-r"><b>' + esc(x.name) + '</b><small>' + esc(x.removedByName) + 'が ' + esc(x.removedAt.slice(5, 16).replace('-', '/')) + ' に取り消し</small></span>' +
          ((mine.perm === 'admin' || x.removedBy === mine.id) ? '<button class="btn small" data-act="trash-restore" data-id="' + x.id + '">戻す</button>' : '<span></span>') + '</li>').join('') + '</ul>' : '<p class="empty small">取り消した記録はありません。</p>'));
    } catch (e) { openSheet('取り消した記録', '<p class="form-err">' + esc(e.message) + '</p>'); }
  }
  function openPinRequest() {
    const staff = (S.data && S.data.staff) || [];
    openSheet('暗証番号を忘れたとき',
      '<form data-form="pinreq" class="form"><p class="lead-line small">管理者に「暗証番号を出し直してほしい」と依頼を送ります。管理者が新しい最初の暗証番号を出したら、本人に直接伝えてもらってください。</p>' +
      '<label>名前<select name="memberId" required><option value="">選んでください</option>' + staff.map((x) => '<option value="' + x.id + '">' + esc(x.name) + '（' + PERM[x.perm] + '）</option>').join('') + '</select></label>' +
      '<p class="form-err" hidden></p><div class="actions"><button type="button" class="btn" data-act="login">戻る</button><button class="btn primary" type="submit">依頼を送る</button></div></form>');
  }

  // ---------- 使い方（くわしいガイド） ----------
  const HELP_ROLES = [['all', 'みんな'], ['manager', 'マネージャー'], ['leader', 'FWリーダー'], ['admin', '管理者']];
  const kbd = (t) => '<span class="kbd">' + t + '</span>';
  const steps = (list) => '<ol class="steps">' + list.map((x) => '<li>' + x + '</li>').join('') + '</ol>';
  const tip = (t) => '<p class="tip">' + icon('star') + '<span>' + t + '</span></p>';
  const goBtn = (href, label) => '<a class="btn small" href="' + href + '">' + label + icon('next') + '</a>';
  function helpInstall() {
    const ios = isIOS();
    const iosSteps = steps([
      '<b>Safari</b> でこのページを開く。LINE の中で開いているときは、右下の ' + kbd('…') + ' や ' + kbd('⤴') + ' から「Safariで開く」',
      '画面の下（iPad は上）の <b>共有ボタン</b> ' + kbd(icon('share')) + ' を押す',
      '下へ動かして <b>「ホーム画面に追加」</b> を押す（無ければ一番下の「アクションを編集」から追加できます）',
      '右上の <b>「追加」</b> を押す → ホーム画面に「筋トレ」のアイコンができます',
      '<b>これからはアイコンから開く</b>（ホーム画面版は Safari と別なので、自分の名前・ログイン・文字の大きさはもう一度設定します）'
    ]);
    const andSteps = steps([
      '<b>Chrome</b> でこのページを開く。LINE の中で開いているときは、右上の ' + kbd('⋮') + ' から「ブラウザで開く」',
      '右上の ' + kbd(icon('dots')) + ' を押す',
      '<b>「ホーム画面に追加」</b>または<b>「アプリをインストール」</b>を押す',
      '<b>「インストール」</b>（または「追加」）を押す → ホーム画面に「筋トレ」のアイコンができます'
    ]);
    let h = '';
    if (isStandalone()) h += '<p class="okline">' + icon('check') + 'いまホーム画面のアプリから開いています。設定は済んでいます。</p>';
    else if (PWA.prompt) h += '<div class="toolbar"><button class="btn primary" data-act="pwa-install">' + icon('plus') + 'いますぐホーム画面に追加</button></div>';
    h += '<div class="devtabs">' + (ios ? '<h4>iPhone・iPad（あなたの端末）</h4>' + iosSteps + '<h4>Android</h4>' + andSteps : '<h4>Android' + (/Android/.test(navigator.userAgent) ? '（あなたの端末）' : '') + '</h4>' + andSteps + '<h4>iPhone・iPad</h4>' + iosSteps) + '</div>';
    return h + tip('ホーム画面から開くと、アドレスバーなしの全画面で、起動も速くなります。電波が弱くても、前に読み込んだ情報は見られます。') +
      '<p class="small-note">新しい版が出ると、画面の下に「新しい版があります［更新する］」が出ます。押すだけで最新になります（入れ直しは不要）。</p>';
  }
  function helpPush() {
    const iosNeedsHome = isIOS() && !isStandalone();
    return (iosNeedsHome ? '<p class="warnline">' + icon('lock') + '<span>iPhone では、<b>ホーム画面に追加したアプリから</b>でないと通知を受け取れません（iOS 16.4 以上）。先に「ホーム画面に追加」をしてください。</span></p>' : '') +
      steps([
        '先に <b>自分の名前</b> を選ぶ（「今週あと○回」「応援」は、選んだ名前の人に届きます）',
        '「設定」→ 下のほうの <b>「通知」</b> で、受け取りたいものにチェック',
        '<b>「通知をオンにする」</b> → スマホの確認で <b>「許可」</b>',
        '<b>「テスト通知を送る」</b> で、数秒で届けばOK'
      ]) +
      '<table class="htable"><thead><tr><th>通知</th><th>いつ</th></tr></thead><tbody>' +
      '<tr><td><b>今週あと○回</b><small>まだ週' + goal() + '回に届いていない本人だけ</small></td><td>土曜18時・日曜9時</td></tr>' +
      '<tr><td><b>応援が届いた</b><small>だれからか・どのスタンプか</small></td><td>1時間ごとにまとめて（夜10時〜朝7時は送らない）</td></tr>' +
      '<tr><td><b>暗証番号の再発行の依頼</b><small>管理者だけ（ログインして設定）</small></td><td>依頼が来たらすぐ</td></tr></tbody></table>' +
      '<div class="toolbar">' + goBtn('#settings/push', '通知の設定を開く') + '</div>' +
      '<details class="faq"><summary>通知が来ないとき</summary><ul class="dots">' +
      '<li>「テスト通知を送る」で届くか確かめる。届かなければ「通知をオフにする」→ もう一度「オンにする」</li>' +
      '<li>「許可しない」を押してしまった：<b>Android</b> は Chrome の ' + kbd('⋮') + '→「設定」→「サイトの設定」→「通知」で許可。<b>iPhone</b> は「設定」アプリ →「通知」→「筋トレ」で許可</li>' +
      '<li>省電力モード・おやすみモード（集中モード）だと遅れたり出なかったりします</li>' +
      '<li>iPhone でホーム画面のアイコンを消すと、通知の設定も消えます（追加し直して、もう一度オン）</li>' +
      '<li>機種変更したら、新しいスマホでもう一度オンにしてください</li></ul></details>';
  }
  function helpSelf() {
    const players = sortMembers(S.data.members.filter((x) => x.active && x.player));
    return '<p>自分の名前を選んでおくと、こうなります。</p><ul class="dots">' +
      '<li>ホームの一番上に <b>「わたし」</b>（今週あと何回・何週連続・届いた応援）が出る</li>' +
      '<li>応援スタンプを送ると、<b>あなたから届いた</b>ことが相手に伝わる</li>' +
      '<li>「今週あと○回」「応援が届いた」の <b>通知</b> を受け取れる</li></ul>' +
      '<label class="guide-self">自分の名前<span>（この端末だけ・あとで変えられます）</span><select data-act-change="pref-self"><option value="">選ばない</option>' +
      players.map((x) => '<option value="' + x.id + '"' + (PREF.self === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></label>' +
      tip('ログインとは関係ありません。見るだけの部員も選べます。');
  }
  function helpSections() {
    const g = goal();
    return [
      ['about', 'all', 'このアプリでできること', '30秒でわかる全体の流れ',
        '<ul class="dots"><li>マネージャーが、Setlog などを見て <b>筋トレをした人に「実施した」</b>を付けます</li>' +
        '<li>部員は <b>見るだけ</b>。ログインはいりません（URLを知っていれば見られます）</li>' +
        '<li><b>週' + g + '回以上（月曜〜日曜）がマスト</b>。ホームで「まだの人」、ランキングで回数がわかります</li>' +
        '<li>FWリーダーのメニュー・自己ベスト・称号・体重の変化・応援スタンプ・通知もあります</li></ul>' +
        '<div class="flow"><span>筋トレ<small>Setlog で撮る</small></span>' + icon('next') + '<span>マネージャー<small>「実施した」を押す</small></span>' + icon('next') + '<span>みんな<small>アプリで見る</small></span></div>'],
      ['install', 'all', 'ホーム画面に追加する', 'アプリのように1タップで開ける', helpInstall()],
      ['self', 'all', '自分の名前を選ぶ', '「わたし」・応援・通知に使う', helpSelf()],
      ['push', 'all', '通知を受け取る', '今週あと○回・応援が届いた', helpPush()],
      ['home', 'all', 'ホームの見かた', '赤い板・まだの人・声をかけたい人・おめでとう',
        '<dl class="defs">' +
        '<dt>赤い板</dt><dd>部全体の実施回数と、<b>週' + g + '回の達成率</b>。途中の週・月は、前の週・月の<b>同じ時点まで</b>と比べます。上の「週間／月間」と ' + kbd('‹') + kbd('›') + ' で期間を変えられます</dd>' +
        '<dt>週' + g + '回（マスト）まだの人</dt><dd>今週まだ届いていない人と、あと何回か。週は<b>月曜〜日曜</b>で、日曜までに' + g + '回以上で達成。<b>怪我などで免除の日</b>がある人は、そのぶん必要な回数が減ります（7日とも免除ならその週は対象外）</dd>' +
        '<dt>声をかけたい人</dt><dd>「連続記録がピンチ」は、先週まで週' + g + '回を2週以上続けていて、今週まだ届いていない人。スタッフには「落ちてきている人」（先々週・先週と2週続けて届かなかった人。免除の週がある人と、部で記録を始める前の週は入りません）も出ます</dd>' +
        '<dt>ランキング</dt><dd>上位3人の表彰台（ジャージの背番号が順位）。4位から下は「すべて見る」で</dd>' +
        '<dt>おめでとう</dt><dd>最近10日に週' + g + '回を達成した人・通算○回になった人。「＋」から<b>応援スタンプ</b>を送ると、その人に「おめでとう」が届きます（ログイン不要。設定で自分の名前を選ぶと、だれからかも伝わります）</dd>' +
        '<dt>くわしい分析</dt><dd>FW対BK・ポジション別・達成率の分布は、ランキングの<b>「分析」</b>にあります</dd></dl>'],
      ['rank', 'all', 'ランキング・カレンダー', '並べ替え・FW／BKで絞る・○×の意味',
        '<ul class="dots"><li>上の <b>全体／FW／BK</b> で絞れます</li>' +
        '<li>表の見出しの<b>「実施回数」「実施率」を押す</b>と並べ替え。<b>実施率</b>はメニュー参加の人だけ（自主トレの人は「－」）</li>' +
        '<li>上の<b>「分析」</b>で、FW対BK・ポジション別（ジャージが濃いほど1人あたりの回数が多い）・達成率の分布・集計のルール</li></ul>' +
        '<div class="legend-h">' + ['done', 'not', 'today', 'planned', 'ex', 'none'].map((k) => '<span>' + cellHtml(k) + CELL[k][1] + '</span>').join('') + '</div>' +
        tip('「×（実施していない）」はメニューの対象日に記録が無かった日です。翌日から×になります。')],
      ['member', 'all', '部員のページ', '自己ベスト・称号・体重・届いた応援',
        '<p>ランキングやカレンダーの<b>名前を押す</b>と開きます。</p><ul class="dots">' +
        '<li>上に<b>今週・今月</b>の回数と、週' + g + '回の連続達成。その下を3つに分けています</li>' +
        '<li><b>記録</b>：月ごとのカレンダーと履歴、免除</li>' +
        '<li><b>実績</b>：自己ベスト（通算・いちばん長い連続・いちばん多い月／週）、<b>称号のメダル</b>（全20種。押すと取った日と応援）、届いた応援</li>' +
        '<li><b>体</b>：体重のグラフ、目標体重、重さの目安（入力はスタッフ）</li></ul>'],
      ['cheer', 'all', '応援スタンプを送る', '「＋」から9種類。ログインなしでOK',
        steps(['ホームの<b>「おめでとう」</b>、または部員ページの<b>称号</b>の下のスタンプを押す', '数字が増えれば送れています。<b>もう一度押すと取り消し</b>', '相手が通知をオンにしていれば、1時間以内に「応援が届きました」が届きます']) +
        tip('自分の名前を選んでおくと「○○さんから」と伝わります。自分あてのスタンプは押せません。')],
      ['v29', 'all', '新しくなったところ（v2.9）', 'MVP・FW対BK・自主トレのおすすめ・要望',
        '<ul class="dots"><li>ランキングに<b>先週のMVP</b>。ランキングの「分析」に<b>FW対BK</b>（1人あたりの回数で比べる）と<b>達成率の分布</b></li>' +
        '<li>部員のページは<b>「記録・実績・体」</b>に分けました</li>' +
        '<li>「わたし」と部員ページで、<b>先週の同じ時点</b>と比べられます。通算10・30・50・100回…の<b>節目</b>はお祝いが出ます</li>' +
        '<li>称号は<b>メダル</b>に。「週5回」「復活」が増えました</li>' +
        '<li>メニュー画面の上に<b>自主トレのおすすめ</b>。体重のところに<b>目標体重</b>と<b>重さの目安</b></li>' +
        '<li>画面を<b>一番上で下に引っぱる</b>と最新に。ホーム・ランキング・カレンダーは<b>左右にはらう</b>と週・月を送れます</li>' +
        '<li>通知に「<b>記録の節目</b>」「<b>新しいメニュー</b>」が増えました（設定 → 通知）</li>' +
        '<li>「こうしてほしい」「おかしい」は、<b>設定 → 要望・不具合を送る</b>から</li></ul>'],
      ['view', 'all', '見やすくする', '文字の大きさ・ダークモード',
        '<p>「設定」→「見やすさ・自分の名前」で変えられます（この端末だけ）。</p><ul class="dots"><li><b>文字の大きさ</b>：小・標準・大・特大</li><li><b>画面の明るさ</b>：ライト（はじめはこれ）・ダーク・スマホに合わせる</li></ul>' +
        '<div class="toolbar">' + goBtn('#settings', '設定を開く') + '</div>'],
      ['exempt', 'all', '怪我・病気で休むとき', '免除してもらう',
        '<p>怪我・病気・就活などで筋トレできない期間は、<b>マネージャーに伝えてください</b>。「免除」に登録されると、その日数ぶん週' + g + '回の必要回数が減り、メニューの×にもなりません。</p>' +
        tip('免除の理由やメモは、スタッフにしか見えません（みんなの画面には「免除」とだけ出ます）。')],
      ['faq', 'all', 'よくある質問', '記録がちがう・数え方・古いまま',
        '<dl class="defs"><dt>自分の記録がちがう</dt><dd>マネージャーに伝えてください（取り消しや追加ができます）</dd>' +
        '<dt>週' + g + '回の「週」はいつから？</dt><dd>月曜〜日曜です。月曜にその週の回数が0に戻ります</dd>' +
        '<dt>自主トレの人の実施率が「－」</dt><dd>実施率はFWリーダーのメニューに参加している人だけ。自主トレの人は回数で見ます</dd>' +
        '<dt>情報が古いまま</dt><dd>画面を<b>一番上で下に引っぱる</b>と最新になります。ホーム画面版で「新しい版があります」が出たら「更新する」</dd>' +
        '<dt>機種変更した</dt><dd>新しいスマホで開き直し、自分の名前・通知・ホーム画面への追加をもう一度</dd></dl>'],
      // スタッフ
      ['login', 'staff', 'ログインする', '暗証番号・忘れたとき',
        steps(['「設定」→ <b>「ログイン」</b>', '自分の名前を選び、<b>暗証番号</b>を入れる（最初は管理者からもらった番号）', '最初のログインでは、<b>自分だけの暗証番号（半角6文字以上）</b>に変える']) +
        '<ul class="dots"><li>忘れたとき：ログイン画面の<b>「暗証番号を忘れたとき」</b>→ 名前を選んで依頼 → 管理者が新しい番号を出してくれます</li>' +
        '<li>5回まちがえると15分ログインできません</li><li>なくしたスマホは「設定」→「ログインしている端末」からログアウトできます</li></ul>'],
      ['record', 'manager', '実施記録をつける', '押すだけ・まとめて・確認して保存',
        steps(['下の <b>「記録」</b> を開く（日付は今日。' + kbd('‹') + ' で前の日にも付けられます）', 'やった人の <b>「実施した」</b> を押す（もう一度押すと戻る）', '<b>「保存する」</b>→ 内容を確かめて <b>「この内容で保存」</b>']) +
        '<ul class="dots"><li>押していない人は「実施していない」になります（メニューの対象日だけ。翌日から）</li>' +
        '<li>並び順：ポジション・学年・名前・<b>最近やった順</b>（よくやる人が上）</li>' +
        '<li>ほかのマネージャーが付けた記録は鍵マーク（変えるのは管理者）</li></ul>'],
      ['week', 'manager', '1週間まとめて記録・修正', '表で7日分を一度に',
        steps(['「記録」の画面の <b>' + icon('more') + 'その他</b> →<b>「1週間まとめて入力」</b>', '部員×7日の表のマスを押すと「実施した」⇔「なし」が切り替わる（青い枠は未保存）', '<b>保存する</b>。週' + g + '回に届いた人がいると紙吹雪が出ます']) +
        tip('記録し忘れた日をあとからまとめて入れるときに便利です。左右の矢印で前の週に移れます。')],
      ['trash', 'manager', 'まちがえて取り消したとき', '取り消した記録を戻す',
        steps(['「記録」の上の <b>「その他」</b>→<b>「取り消した記録」</b>', '戻したい記録の <b>「戻す」</b>']) + tip('マネージャーは自分が取り消したものだけ戻せます。ほかは管理者へ。')],
      ['exreg', 'manager', '免除を登録する', '怪我・病気の期間',
        steps(['部員のページを開く →「免除」の <b>「免除を追加」</b>', '開始日・終了日・理由（メモは任意）を入れて <b>「登録する」</b>']) + tip('部全体のオフ（試験期間・合宿など）は管理者が「設定」から登録します。')],
      ['body', 'staff', '体重を入れる', 'まとめて／1人ずつ',
        steps(['「部員」→ <b>「体重をまとめて入れる」</b>（1人だけなら部員ページの「入れる」）', '測定日を選び、測った人だけ体重を入れる → <b>「保存」</b>']) + tip('同じ日にもう一度入れると上書き。数値は部員みんなが見られます（メモはスタッフだけ）。')],
      ['line', 'manager', 'LINEで「まだの人」を送る', '文章を自動で作る',
        steps(['ホーム（週間・今週）の「週' + g + '回（マスト）まだの人」の下', '<b>「LINE用の文章をコピー」</b>→ LINEに貼る、または <b>「LINEで送る」</b>']) + tip('月間のホームでは、MVP・皆勤などの<b>表彰の文章</b>もコピーできます。')],
      ['menu', 'leader', 'メニューを作る', '対象・種目ライブラリ・動画',
        steps(['「メニュー」→ <b>「メニューを作成」</b>', '実施予定日と <b>対象</b>（FW／BK／全体、またはポジション）を選ぶ。対象人数の目安が出ます', 'メニュー名と内容を書く。<b>「種目のライブラリから足す」</b>で押すだけで種目と回数の目安が入ります', 'フォームの見本の <b>動画のURL</b>（YouTube など）も付けられます → <b>「メニューを登録」</b>']) +
        tip('対象は「メニュー参加」の人だけ。自主トレの人は入りません。')],
      ['tpl', 'leader', '型と繰り返し', '毎週のメニューを自動で作る',
        steps(['「メニュー」→ <b>「型・繰り返し」</b>→ <b>「型を作る」</b>（今あるメニューの「型にする」からも）', '<b>繰り返す曜日</b>を選ぶ → 4週間先まで自動で作られ、毎日のびます', '型を直すと、手で直していない今日以降の分もそろいます']) +
        '<ul class="dots"><li>曜日を選ばなければ、作るときに「型から作る」で選ぶだけの型になります</li><li>1回だけ別の日にしたいとき：メニューを開いて <b>「別の日にコピー」</b></li></ul>'],
      ['selfrec', 'leader', '自主トレのおすすめ', '型に印を付けて、みんなに見せる',
        steps(['メニュー → <b>型・繰り返し</b> で型を作る（または開いて編集）', '<b>「自主トレのおすすめとして、部員みんなに見せる」</b>に印を付けて保存', 'メニュー画面の上に、横に並んで出ます（ログインしていない部員にも見えます）'])],
      ['archive', 'leader', 'FWリーダーの引き継ぎ', 'これまでのメニューを全部見る',
        steps(['「メニュー」→ <b>「これまでのメニュー一覧（引き継ぎ）」</b>', '種目名で探す・作った人で絞る。良いメニューは <b>「型にする」</b>', '<b>「表（CSV）で保存」</b>で、Excel やスプレッドシートに残せます'])],
      ['members', 'admin', '部員の管理', '追加・まとめて編集・進級',
        '<ul class="dots"><li><b>まとめて編集</b>：ポジション（メイン・サブ）と取り組み方を一度に</li><li><b>一覧を貼り付け</b>：「名前, PR, 参加」の形で何人でも</li>' +
        '<li><b>進級</b>：新年度に1回。1年→2年…、4年・M2は卒業／進学／そのままを選ぶ（留年は「そのまま」）</li><li>名簿は会計アプリと共通です</li></ul>'],
      ['roles', 'admin', '役職の交代・暗証番号', '新年度のFWリーダー・マネージャー',
        steps(['「設定」→ <b>「役職をまとめて付け替え」</b>', '新しいFWリーダー・マネージャーを選んで保存 → <b>最初の暗証番号</b>がまとめて出るので本人に伝える']) +
        '<ul class="dots"><li>暗証番号の<b>再発行の依頼</b>はホームと設定に出ます →「発行」</li><li>通知の「暗証番号の再発行の依頼」をオンにすると、スマホにも届きます</li></ul>'],
      ['settings', 'admin', '部のルールの設定', '週の目標回数・オフ期間・合言葉',
        '<ul class="dots"><li><b>週の目標回数</b>：いまは週' + g + '回（1〜7回）</li><li><b>部全体のオフ期間</b>：試験期間・合宿など、全員の目標をなしに</li>' +
        '<li><b>閲覧の合言葉</b>：設定すると、知っている人だけ見られる</li><li><b>操作履歴</b>：だれが・いつ・何を変えたか</li></ul>']
    ];
  }
  function vHelp() {
    if (!S.helpRole) { const m = me(); S.helpRole = m ? (m.perm === 'admin' ? 'admin' : m.perm) : 'all'; }
    const role = S.helpRole, open = S.route.arg || '';
    const show = (r) => role === 'all' ? r === 'all' : (r === role || r === 'staff' || (role === 'admin' && r !== 'all'));
    let h = '<div class="sub-h"><a class="ibtn" href="#settings" data-act="go-back" aria-label="戻る">' + icon('back') + '</a><h1>使い方ガイド</h1></div>' +
      '<div class="fbar"><div class="seg small help-seg" role="group" aria-label="だれ向け">' + HELP_ROLES.map((x) => '<button data-act="help-role" data-v="' + x[0] + '" aria-pressed="' + (role === x[0]) + '">' + x[1] + '</button>').join('') + '</div></div>' +
      '<button class="howvid" data-act="video-open" aria-label="40秒でわかる使い方の動画を全画面で再生"><span class="hv-thumb"><img src="media/howto.jpg?v=2" alt="" width="132" height="235"><span class="hv-play" aria-hidden="true">' + icon('play') + '</span></span>' +
      '<span class="howvid-t"><b>40秒でわかる使い方</b><small>ホーム・ランキング・自分の名前・応援・メニュー・要望の送り方（音はありません）</small><span class="hv-go">' + icon('play') + '全画面で見る</span></span></button>' +
      (role === 'all' ? '<p class="note is-top">知りたいところを押すと開きます。マネージャー・FWリーダー・管理者の使い方は、上で切り替えてください。</p>' : '<p class="note is-top">ログインしてできることです。みんな向けの使い方は「みんな」にあります。</p>') +
      '<div class="help">';
    helpSections().filter((x) => show(x[1])).forEach((x, i) => {
      h += '<details class="hsec" id="h-' + x[0] + '"' + (open === x[0] ? ' open' : '') + '><summary><span class="hnum">' + (i + 1) + '</span><span class="ht"><b>' + x[2] + '</b><small>' + x[3] + '</small></span></summary><div class="hb">' + x[4] + '</div></details>';
    });
    h += '</div><div class="toolbar center"><button class="btn" data-act="guide">30秒の紹介をもう一度見る</button></div>';
    return h;
  }

  /** 使い方の動画を全画面で再生する（黒い画面いっぱい。×・画面の外・戻るボタン・Esc で閉じる） */
  function openVideo() {
    closeVideo();
    const el = document.createElement('div');
    el.className = 'vplayer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '40秒でわかる使い方');
    el.innerHTML = '<video src="media/howto.mp4?v=2" poster="media/howto.jpg?v=2" controls autoplay playsinline muted></video>' +
      '<button class="vp-x" data-act="video-close" aria-label="閉じる">×</button>';
    el.addEventListener('click', (ev) => { if (ev.target === el) closeVideo(); });
    document.body.appendChild(el);
    document.body.classList.add('sheet-open');
    const v = el.querySelector('video');
    v.addEventListener('ended', () => { setTimeout(closeVideo, 600); });
    try { history.pushState({ video: 1 }, ''); } catch (e) { /* なし */ }
    const p = v.play(); if (p && p.catch) p.catch(() => {});
  }
  function closeVideo(fromPop) {
    const el = $('.vplayer');
    if (!el) return;
    const v = el.querySelector('video'); if (v) v.pause();
    el.classList.add('out');
    setTimeout(() => el.remove(), reduceMotion() ? 0 : 200);
    if (!$('#sheet-root').innerHTML) document.body.classList.remove('sheet-open');
    if (!fromPop && history.state && history.state.video) history.back();
  }
  window.addEventListener('popstate', () => { if ($('.vplayer')) closeVideo(true); });

  // ---------- はじめて開いた人への使い方ガイド（30秒） ----------
  // 30秒の紹介（初めて開いたとき）。それぞれの画面で、その場で設定もできる
  const GUIDE = [
    { t: 'KURFC 筋トレへようこそ', i: 'home', p: () => '部員みんなの筋トレの記録を見るアプリです。<b>見るだけならログインは不要</b>。かんたんに使い方を紹介します（1分）。' },
    { t: '週{g}回がマスト', i: 'check', p: () => 'マネージャーが「実施した」を付けると、ホームに回数が出ます。<b>月曜〜日曜に週{g}回以上</b>で達成。「まだの人」「連続がピンチの人」もホームでわかります。名前を押すと、その人の<b>自己ベスト・称号・体重の変化</b>が見られます。' },
    { t: '自分の名前を選ぶ', i: 'users', p: () => '選ぶと、ホームに<b>「わたし」</b>（今週あと何回・届いた応援）が出て、通知も受け取れます。応援スタンプを送るときの名前にもなります。', x: 'self' },
    { t: 'ホーム画面に追加', i: 'plus', p: () => isStandalone() ? 'いまホーム画面のアプリから開いています。このままで大丈夫です。' : 'アイコンを置くと、アプリのように<b>1タップ</b>で開けます。', x: 'install' },
    { t: '通知を受け取る', i: 'bell', p: () => (isIOS() && !isStandalone()) ? 'iPhone は、<b>ホーム画面に追加したアプリ</b>から設定すると、「今週あと○回」「応援が届いた」が通知で届きます。' : '「今週あと○回」（土曜18時・日曜9時）と「応援が届いた」を、スマホに通知できます。', x: 'push' },
    { t: '見やすく・くわしく', i: 'gear', p: () => '文字の大きさと明るさは、いつでも「設定」で変えられます。わからないときは、上の ' + kbd('?') + ' の<b>「使い方ガイド」</b>を見てください。マネージャー・FWリーダーの使い方もあります。', x: 'view' }
  ];
  let guideStep = 0;
  function guideExtra(x) {
    if (x === 'self') {
      const players = S.data && S.data.members ? sortMembers(S.data.members.filter((m) => m.active && m.player)) : [];
      return players.length ? '<label class="guide-self">自分の名前<span>（あとで設定で変えられます）</span><select data-act-change="pref-self"><option value="">選ばない</option>' + players.map((m) => '<option value="' + m.id + '"' + (PREF.self === m.id ? ' selected' : '') + '>' + esc(m.name) + '</option>').join('') + '</select></label>' : '';
    }
    if (x === 'install') {
      if (isStandalone()) return '';
      if (PWA.prompt) return '<div class="guide-acts"><button class="btn primary" data-act="pwa-install">' + icon('plus') + 'いますぐ追加</button></div>';
      return '<ol class="steps small">' + (isIOS()
        ? '<li><b>Safari</b> で開いて、共有ボタン ' + kbd(icon('share')) + '</li><li><b>「ホーム画面に追加」</b>→「追加」</li><li>これからは<b>アイコンから</b>開く</li>'
        : '<li>Chrome の右上 ' + kbd(icon('dots')) + '</li><li><b>「ホーム画面に追加」</b>または<b>「アプリをインストール」</b></li>') + '</ol>';
    }
    if (x === 'push') {
      if (isIOS() && !isStandalone()) return '<div class="guide-acts"><button class="btn" data-act="guide-help" data-v="install">追加のしかたを見る</button></div>';
      return pushSupported() ? '<div class="guide-acts"><button class="btn primary" data-act="guide-push">' + icon('bell') + '通知の設定を開く</button></div>' : '';
    }
    if (x === 'view') {
      return '<div class="guide-prefs"><div class="seg small" role="group" aria-label="文字の大きさ">' + SIZES.map((z) => '<button data-act="pref-size" data-v="' + z[0] + '" aria-pressed="' + (PREF.size === z[0]) + '">' + z[1] + '</button>').join('') + '</div>' +
        '<div class="seg small" role="group" aria-label="画面の明るさ">' + [['light', 'ライト'], ['dark', 'ダーク'], ['auto', 'スマホに合わせる']].map((z) => '<button data-act="pref-theme" data-v="' + z[0] + '" aria-pressed="' + (PREF.theme === z[0]) + '">' + z[1] + '</button>').join('') + '</div></div>' +
        '<div class="guide-acts"><button class="btn" data-act="guide-help" data-v="">くわしい使い方ガイドを開く</button></div>';
    }
    return '';
  }
  function openGuide(step) {
    guideStep = Math.max(0, Math.min(GUIDE.length - 1, step || 0));
    const g = GUIDE[guideStep], last = guideStep === GUIDE.length - 1;
    const sub = (t) => t.replace(/\{g\}/g, goal());
    $('#guide-root').innerHTML = '<div class="guide-bg"></div><section class="guide" role="dialog" aria-modal="true" aria-label="使い方の紹介">' +
      '<div class="guide-i" aria-hidden="true">' + icon(g.i) + '</div><h2>' + esc(sub(g.t)) + '</h2><p>' + sub(g.p()) + '</p>' + guideExtra(g.x) +
      '<div class="guide-dots" aria-hidden="true">' + GUIDE.map((x, i) => '<i class="' + (i === guideStep ? 'on' : '') + '"></i>').join('') + '</div>' +
      '<div class="actions">' + (guideStep ? '<button class="btn" data-act="guide-prev">戻る</button>' : '<button class="btn" data-act="guide-close">スキップ</button>') +
      '<button class="btn primary" data-act="' + (last ? 'guide-close' : 'guide-next') + '" autofocus>' + (last ? 'はじめる' : '次へ') + '</button></div>' +
      '<p class="guide-n">' + (guideStep + 1) + ' / ' + GUIDE.length + (guideStep ? '・<button class="linkbtn inline" data-act="guide-close">閉じる</button>' : '') + '</p></section>';
    document.body.classList.add('sheet-open');
    const b = $('#guide-root [autofocus]'); if (b) b.focus();
  }
  function closeGuide() { $('#guide-root').innerHTML = ''; store.set('guided', 1); if (!$('#sheet-root').innerHTML) document.body.classList.remove('sheet-open'); if (S.data && !S.data.locked) render(); }

  function vLogs() {
    if (!can('admin')) return '<p class="empty">操作履歴を見られるのは管理者だけです。</p>';
    let h = '<div class="sub-h"><a class="ibtn" href="#settings" aria-label="戻る">' + icon('back') + '</a><h1>操作履歴</h1></div>';
    if (!S.logs) { loadLogs(0); return h + '<p class="empty">読み込み中…</p>'; }
    if (!S.logs.list.length) return h + emptyState('list', 'まだ履歴がありません', '');
    h += '<ul class="logs">' + S.logs.list.map((x) =>
      '<li><div class="log-h"><b>' + esc(x.action) + '</b><time>' + esc(x.at.slice(5, 16).replace('-', '/')) + '</time></div>' +
      (x.detail ? '<p>' + esc(x.detail) + '</p>' : '') + '<small>' + esc(x.name || 'スプレッドシート') + (x.role ? '（' + esc(x.role) + '）' : '') + '</small></li>').join('') + '</ul>';
    if (S.logs.list.length < S.logs.total) h += '<div class="toolbar"><button class="btn" data-act="logs-more">さらに表示</button></div>';
    return h;
  }
  async function loadLogs(offset) {
    try {
      const r = await api('logs', { limit: 100, offset: offset });
      S.logs = { list: (offset && S.logs ? S.logs.list : []).concat(r.logs), total: r.total };
    } catch (e) { S.logs = { list: [], total: 0 }; toast(e.message, 'err'); }
    if (S.route.name === 'logs') render();
  }

  // ---------- 要望・不具合 ----------
  const FB_KINDS = [['idea', '要望・アイデア'], ['bug', '不具合・おかしいところ'], ['other', 'その他']];
  function openFeedback() {
    const self = PREF.self && memberById(PREF.self);
    openSheet('要望・不具合を送る',
      '<form data-form="feedback" class="form"><fieldset><legend>種類</legend><div class="radios">' +
      FB_KINDS.map((k, i) => '<label><input type="radio" name="kind" value="' + k[0] + '"' + (i === 0 ? ' checked' : '') + '><span>' + k[1] + '</span></label>').join('') + '</div></fieldset>' +
      '<label>内容<textarea name="text" rows="5" maxlength="1000" required autofocus placeholder="例：ランキングで、FWだけの順位も見たい／記録の画面で名前が2行になる"></textarea></label>' +
      '<p class="hint">' + (me() ? esc(me().name) + ' さんとして送ります。' : self ? esc(self.name) + ' さんとして送ります（設定で選んだ名前）。' : '名前なしで送ります（設定で自分の名前を選ぶと、名前つきになります）。') +
      '管理者に届きます。不具合は「どの画面で・何をしたら・どうなったか」があると早く直せます。</p><p class="form-err" hidden></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">' + icon('send') + '送る</button></div></form>');
  }
  function vFeedback() {
    if (!can('admin')) return '<p class="empty">要望・不具合の一覧を見られるのは管理者だけです。</p>';
    let h = '<div class="sub-h"><a class="ibtn" href="#settings" data-act="go-back" aria-label="戻る">' + icon('back') + '</a><h1>要望・不具合</h1></div>';
    if (!S.fb) { loadFeedback(); return h + '<p class="empty">読み込み中…</p>'; }
    if (S.fb.err) return h + '<p class="empty">' + esc(S.fb.err) + '</p>';
    if (!S.fb.list.length) return h + emptyState('send', 'まだ届いていません', '部員が「設定 → 要望・不具合を送る」から送ると、ここに出ます。');
    const open = S.fb.list.filter((x) => !x.done), done = S.fb.list.filter((x) => x.done);
    const li = (x) => '<li class="fb-i' + (x.done ? ' done' : '') + '"><div class="fb-h"><span class="chip fb-' + x.kind + '">' + (FB_KINDS.find((k) => k[0] === x.kind) || ['', 'その他'])[1] + '</span><time>' + esc(x.at.slice(5, 16).replace('-', '/')) + '</time></div>' +
      '<p class="pre">' + nl2br(x.text) + '</p><small>' + esc(x.from || '名前なし') + (x.page ? '・' + esc(x.page) : '') + (x.version ? '・v' + esc(x.version) : '') + '</small>' +
      '<button class="btn small' + (x.done ? '' : ' primary') + '" data-act="fb-done" data-id="' + esc(x.id) + '" data-v="' + (x.done ? '0' : '1') + '">' + (x.done ? '未対応に戻す' : icon('check') + '対応済みにする') + '</button></li>';
    h += '<section class="block"><div class="block-h"><h2>未対応</h2><span class="count">' + open.length + '件</span></div>' + (open.length ? '<ul class="fb-list">' + open.map(li).join('') + '</ul>' : '<p class="empty small">ありません。</p>') + '</section>';
    if (done.length) h += '<details class="block gone-box"><summary><h2>対応済み</h2><span class="count">' + done.length + '件</span></summary><ul class="fb-list">' + done.map(li).join('') + '</ul></details>';
    return h + '<p class="note">画面のエラーは自動で「操作履歴」に残ります（「画面のエラー」）。</p>';
  }
  async function loadFeedback() {
    try { const r = await api('feedbackList', {}); S.fb = { list: r.feedback }; S.data.feedbackOpen = r.open; }
    catch (e) { S.fb = { list: [], err: e.message }; }
    if (S.route.name === 'feedback') render();
  }
  function openLifts() {
    const list = (S.data.liftRatios || []).slice();
    while (list.length < 5) list.push({ name: '', ratio: '' });
    openSheet('重さの目安（体重×倍率）',
      '<form data-form="lifts" class="form"><p class="lead-line small">部員ページの体重の下に「この種目は何kgが目安」と出ます。最新の体重 × 倍率を、2.5kg きざみで出します。</p>' +
      '<div class="lift-rows">' + list.map((x, i) => '<div class="two"><label>種目' + (i + 1) + '<input type="text" name="ln" maxlength="20" value="' + esc(x.name) + '" placeholder="例：ベンチプレス"></label>' +
        '<label>倍率<input type="text" inputmode="decimal" name="lr" value="' + esc(x.ratio) + '" placeholder="例：1.2"></label></div>').join('') + '</div>' +
      '<p class="hint">空の行は保存しません（12種目まで）。倍率は部のS&Cの方針に合わせてください（例：ベンチプレス 1.0〜1.25、スクワット 1.5〜2.0）。</p><p class="form-err" hidden></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">保存</button></div></form>');
  }

  // ---------- ログイン・暗証番号 ----------
  function openLogin() {
    const staff = (S.data && S.data.staff) || [];
    if (!staff.length) {
      openSheet('ログイン', '<p class="lead-line small">ログインできる人がまだいません。スプレッドシートのメニュー「筋トレ管理」→「管理者を登録」を実行してください。</p>');
      return;
    }
    openSheet('ログイン',
      '<form data-form="login" class="form"><label>名前<select name="memberId" required><option value="">選んでください</option>' +
      staff.map((s) => '<option value="' + s.id + '">' + esc(s.name) + '（' + PERM[s.perm] + '）</option>').join('') + '</select></label>' +
      '<label>暗証番号<input type="password" name="pin" autocomplete="current-password" required></label>' +
      '<p class="form-err" hidden></p><p class="hint">一般部員はログイン不要です。<button type="button" class="linkbtn inline" data-act="pinreq-open">暗証番号を忘れたとき</button></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">ログイン</button></div></form>');
  }
  function openPinChange(forced, oldPin) {
    openSheet(forced ? '新しい暗証番号を決める' : '暗証番号を変更',
      '<form data-form="pin" class="form">' +
      (forced ? '<p class="lead-line small">最初のログインです。自分だけが知っている暗証番号に変えてください。</p><input type="hidden" name="oldPin" value="' + esc(oldPin || '') + '">'
        : '<label>今の暗証番号<input type="password" name="oldPin" autocomplete="current-password" required autofocus></label>') +
      '<label>新しい暗証番号<span class="opt">半角6文字以上</span><input type="password" name="newPin" autocomplete="new-password" minlength="6" required' + (forced ? ' autofocus' : '') + '></label>' +
      '<label>もう一度<input type="password" name="newPin2" autocomplete="new-password" minlength="6" required></label>' +
      '<p class="form-err" hidden></p>' +
      '<div class="actions">' + (forced ? '<button type="button" class="btn" data-act="logout">ログアウト</button>' : '<button type="button" class="btn" data-act="sheet-close">やめる</button>') +
      '<button class="btn primary" type="submit">暗証番号を変更</button></div></form>', { locked: forced });
  }

  // ---------- 部員の編集（管理者） ----------
  function openMemberForm(id) {
    const m = id ? memberById(id) : null;
    const v = m || { name: '', grade: '', clubRole: '部員', player: true, group: '', position: '', subs: [], mode: 'self', perm: 'member', start: '' };
    const radio = (name, val, label, cur) => '<label><input type="radio" name="' + name + '" value="' + val + '"' + (cur === val ? ' checked' : '') + '><span>' + label + '</span></label>';
    const gradeOpts = GRADES.concat(v.grade && GRADES.indexOf(v.grade) < 0 ? [v.grade] : []);
    const roleOpts = CLUB_ROLES.concat(v.clubRole && CLUB_ROLES.indexOf(v.clubRole) < 0 ? [v.clubRole] : []);
    openSheet(m ? '部員を編集' : '部員を追加',
      '<form data-form="member" class="form">' + (m ? '<input type="hidden" name="id" value="' + m.id + '">' : '') +
      (m ? '<div class="ro"><span>名前</span><b>' + esc(m.name) + '</b><small>名前の変更は会計アプリで行います（取引・集金の名前もそろえるため）</small></div>'
        : '<label>名前<input type="text" name="name" maxlength="30" required autofocus placeholder="例：山田 太郎"></label>') +
      '<div class="two"><label>学年<select name="grade"><option value="">－</option>' + gradeOpts.map((g) => '<option' + (v.grade === g ? ' selected' : '') + '>' + esc(g) + '</option>').join('') + '</select></label>' +
      '<label>役割' + (v.finance ? '<input type="text" value="財務" disabled><input type="hidden" name="clubRole" value="財務">' :
        '<select name="clubRole">' + roleOpts.map((g) => '<option' + (v.clubRole === g ? ' selected' : '') + '>' + esc(g) + '</option>').join('') + '</select>') + '</label></div>' +
      (v.finance ? '<p class="hint">「財務」の付け外しは会計アプリで行います。</p>' : '<p class="hint">役割がマネージャー・トレーナーの人は選手ではないので、筋トレの記録の対象外です。</p>') +
      '<fieldset><legend>メインのポジション</legend>' + posPicker('position', v.position ? [v.position] : [], { single: true }) + '</fieldset>' +
      '<fieldset><legend>サブのポジション<span class="opt">複数可</span></legend>' + posPicker('subs', v.subs || []) + '</fieldset>' +
      '<fieldset><legend>取り組み方</legend><div class="radios">' + radio('mode', 'leader', 'メニュー参加', v.mode) + radio('mode', 'self', '自主トレ', v.mode) + '</div>' +
      '<p class="hint">ポジションと取り組み方の変更は今日から反映され、昨日までの記録や集計は変わりません。</p></fieldset>' +
      '<label>筋トレアプリの権限<select name="perm">' + ['member', 'manager', 'leader', 'admin'].map((r) => '<option value="' + r + '"' + (v.perm === r ? ' selected' : '') + '>' + PERM[r] + '</option>').join('') + '</select></label>' +
      '<p class="hint">一般部員は見るだけ（ログインなし）。マネージャーは実施記録、FWリーダーはメニュー、管理者はすべてを操作できます。</p>' +
      '<details class="adv"><summary>くわしい設定</summary><label>記録の開始日<span class="opt">任意</span><input type="date" name="start" value="' + esc(v.start || '') + '"></label><p class="hint">入れると、この日より前は記録の対象になりません（途中入部など）。</p></details>' +
      '<p class="form-err" hidden></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">' + (m ? '変更を保存' : '部員を追加') + '</button></div>' +
      (m ? '<div class="danger-zone">' +
        (m.active && m.perm !== 'member' ? '<button type="button" class="btn" data-act="pin-reset" data-id="' + m.id + '">暗証番号を発行' + (m.pinSet ? 'し直す' : '') + '</button>' +
          '<p class="hint">' + (m.pinSet ? (m.locked ? 'いまロック中です。出し直すと解除されます。' : (m.mustChange ? '発行済み（本人がまだ変更していません）' : '設定済み')) : 'まだ発行していないので、この人はログインできません。') + '</p>' : '') +
        (m.active ? (m.finance ? '<p class="hint">財務の人の在籍は会計アプリで外します。</p>' : '<button type="button" class="btn danger" data-act="member-del" data-id="' + m.id + '">在籍を外す（卒業・退部）</button><p class="hint">会計アプリの名簿でも在籍なしになります。これまでの記録は残り、あとで戻せます。</p>')
          : '<button type="button" class="btn" data-act="member-restore" data-id="' + m.id + '">在籍に戻す</button>') + '</div>' : '') +
      '</form>', { wide: true });
  }
  function openBulk() {
    const list = sortMembers(S.data.members.filter((m) => m.active && m.player));
    const opts = (cur) => '<option value="">－</option>' + positions().map((p) => '<option' + (cur === p.code ? ' selected' : '') + '>' + esc(p.code) + '</option>').join('');
    openSheet('まとめて編集',
      '<form data-form="bulk" class="form"><p class="lead-line small">メインのポジション・サブ（「FL/No.8」のように / で区切る）・取り組み方を一度に設定できます。変えた人だけ保存します。</p>' +
      '<div class="bulk"><div class="bulk-h"><span>名前</span><span>メイン</span><span>サブ</span><span>メニュー参加</span></div>' +
      list.map((m) => '<div class="bulk-r" data-id="' + m.id + '"><span class="bulk-n"><b>' + esc(m.name) + '</b><small>' + esc(m.grade || '') + '</small></span>' +
        '<select name="p_' + m.id + '" aria-label="' + esc(m.name) + 'のメインのポジション">' + opts(m.position) + '</select>' +
        '<input type="text" name="s_' + m.id + '" value="' + esc((m.subs || []).join('/')) + '" placeholder="なし" aria-label="' + esc(m.name) + 'のサブ" autocomplete="off">' +
        '<label class="sw"><input type="checkbox" name="m_' + m.id + '"' + (m.mode === 'leader' ? ' checked' : '') + '><span aria-hidden="true"></span><span class="sr">' + esc(m.name) + 'はメニュー参加</span></label></div>').join('') +
      '</div><p class="form-err" hidden></p>' +
      '<div class="actions sticky"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">変更を保存</button></div></form>', { wide: true });
  }
  // 進級：1年→2年→3年→4年、M1→M2。4年・M2は卒業／進学／そのままを選ぶ（サーバーの opPromote_ と同じ決まり）
  const GRADE_NEXT = { '1年': '2年', '2年': '3年', '3年': '4年', 'M1': 'M2' };
  function openPromote() {
    const me0 = me();
    const list = S.data.members.filter((m) => m.active).sort((a, b) => (a.id < b.id ? -1 : 1));
    const sig = list.map((m) => m.id + ':' + (m.grade || '')).join(',');
    const ORDER = ['1年', '2年', '3年', '4年', 'M1', 'M2'];
    const byGrade = {};
    list.forEach((m) => { (byGrade[m.grade || ''] = byGrade[m.grade || ''] || []).push(m); });
    const row = (m) => {
      const g = m.grade;
      let opts, def = 'up', note = '';
      if (GRADE_NEXT[g]) opts = [['up', GRADE_NEXT[g] + 'へ'], ['stay', g + 'のまま']];
      else {
        const lock = m.id === me0.id ? '自分自身は卒業にできません' : m.finance ? '財務の人の卒業は会計アプリで' : '';
        opts = (g === '4年' ? [['grad', '卒業'], ['M1', 'M1へ（進学）'], ['stay', '4年のまま']] : [['grad', '卒業'], ['stay', 'M2のまま']]).filter((o) => !(lock && o[0] === 'grad'));
        def = lock ? 'stay' : 'grad'; note = lock;
      }
      return '<li class="pm-top"><span><b>' + esc(m.name) + '</b>' + (note ? '<small>' + note + '</small>' : '') + '</span>' +
        '<select name="c_' + m.id + '" aria-label="' + esc(m.name) + 'の進級">' + opts.map((o) => '<option value="' + o[0] + '"' + (o[0] === def ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></li>';
    };
    let body = '';
    ORDER.forEach((g) => {
      const arr = (byGrade[g] || []).sort((a, b) => a.sort - b.sort);
      if (!arr.length) return;
      body += '<h3 class="pm-h">' + g + '（' + arr.length + '人）<small>' + (GRADE_NEXT[g] ? 'ふつうは ' + GRADE_NEXT[g] + ' へ' : 'ふつうは卒業') + '</small></h3><ul class="pm-list">' + arr.map(row).join('') + '</ul>';
    });
    const other = list.filter((m) => ORDER.indexOf(m.grade || '') < 0);
    openSheet('進級（学年をまとめて上げる）',
      '<form data-form="promote" class="form"><input type="hidden" name="sig" value="' + esc(sig) + '">' +
      '<p class="lead-line small">在籍している全員の学年を1つ上げます。<b>新年度に1回だけ</b>押してください。名簿は会計アプリと共通なので、会計アプリの学年も変わります。</p>' +
      '<p class="hint">留年などで学年が変わらない人は「○年のまま」を選んでください。4年・M2で「卒業」にすると在籍が外れます（記録は残り、あとで戻せます。集金も今までどおり集められます）。</p>' +
      body +
      (other.length ? '<p class="hint">学年が「1年〜4年・M1・M2」以外の ' + other.length + '人（' + other.map((m) => esc(m.name)).join('、') + '）は、そのままです。</p>' : '') +
      '<p class="form-err" hidden></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">進級する</button></div></form>');
  }
  function openImport() {
    openSheet('一覧を貼り付け',
      '<form data-form="import" class="form"><p class="lead-line small">1行に1人、「名前, ポジション, 取り組み方」の順に書いてください。名簿にいる人は更新、いない人は追加します。スプレッドシートからの貼り付け（タブ区切り）も使えます。</p>' +
      '<label>一覧<textarea name="rows" rows="10" placeholder="山田 太郎, PR, 参加&#10;鈴木 次郎, FL/No.8, 自主&#10;佐藤 三郎, CTB" required autofocus></textarea></label>' +
      '<p class="hint">ポジションは PR・HO・LO・FL・No.8・SH・SO・CTB・WTB・FB（背番号でも可）。「FL/No.8」のように書くと、最初がメイン・後ろがサブ。取り組み方は「参加」か「自主」。書いていない項目は変えません。新しい人は会計アプリの名簿にも入ります。</p>' +
      '<p class="form-err" hidden></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">反映する</button></div></form>');
  }
  function normPos(s) {
    const t = String(s || '').trim().toUpperCase().replace(/[．。]/g, '.').replace(/\s/g, '');
    if (!t) return '';
    if (/^(NO\.?8|N8|8番?)$/.test(t)) return 'No.8';
    const num = parseInt(t, 10);
    if (num >= 1 && num <= 15 && String(num) === t.replace('番', '')) { const p = positions().find((x) => x.numbers.indexOf(num) >= 0); return p ? p.code : null; }
    const p = positions().find((x) => x.code.toUpperCase() === t || x.name === s.trim());
    return p ? p.code : null;
  }
  function parsePosList(s) {
    const parts = String(s || '').split(/[\/／・、]+/).map((x) => x.trim()).filter(Boolean);
    const codes = parts.map(normPos);
    return codes.indexOf(null) >= 0 ? null : codes;
  }
  function parseImport(text) {
    const rows = [], errs = [];
    text.split(/\n/).forEach((line, i) => {
      const t = line.trim();
      if (!t) return;
      const c = t.split(/[,\t，]/).map((x) => x.trim());
      if (!c[0]) { errs.push((i + 1) + '行目'); return; }
      const r = { name: c[0] };
      if (c[1]) {
        const g = c[1].toUpperCase();
        if (g === 'FW' || g === 'BK') r.group = g;
        else { const codes = parsePosList(c[1]); if (!codes) { errs.push((i + 1) + '行目（ポジション）'); return; } r.position = codes[0]; r.subs = codes.slice(1); }
      }
      if (c[2]) r.mode = /参加|リーダー|メニュー|leader/i.test(c[2]) ? 'leader' : 'self';
      rows.push(r);
    });
    return { rows: rows, errs: errs };
  }
  function openGoal() {
    const g = goal();
    openSheet('週の目標回数',
      '<form data-form="goal" class="form"><p class="lead-line small">月曜〜日曜の1週間に、何回以上の筋トレをマストにするか。変えると、過去の週の達成もこの回数で数え直します。</p>' +
      '<label>週の回数<select name="goal">' + [1, 2, 3, 4, 5, 6, 7].map((n) => '<option value="' + n + '"' + (n === g ? ' selected' : '') + '>' + n + '回以上</option>').join('') + '</select></label>' +
      '<p class="form-err" hidden></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">保存</button></div></form>');
  }
  function openViewLock() {
    openSheet('閲覧の合言葉',
      '<form data-form="viewlock" class="form"><p class="lead-line small">' + (S.data.viewLock
        ? 'いまは合言葉を知っている人だけが見られます。新しい合言葉を入れると変更、空のまま保存すると解除になります。'
        : 'いまはURLを知っていれば誰でも見られます。合言葉を設定すると、最初に1回だけ入力を求めます。') + '</p>' +
      '<label>合言葉<span class="opt">4文字以上</span><input type="text" name="pass" autocomplete="off" autofocus></label>' +
      '<p class="form-err" hidden></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">保存</button></div></form>');
  }

  // ---------- 全体の描画 ----------
  const NAV = [['home', 'ホーム', 'home'], ['rank', 'ランキング', 'rank'], ['record', '記録', 'check'], ['cal', 'カレンダー', 'cal'], ['menus', 'メニュー', 'menu'], ['members', '部員', 'users']];
  const TITLE = { home: 'ホーム', rank: 'ランキング', record: '実施記録', cal: 'カレンダー', menus: 'メニュー', members: '部員', member: '部員', settings: '設定', logs: '操作履歴', archive: 'これまでのメニュー', help: '使い方', feedback: '要望・不具合' };
  function shell(inner) {
    const r = S.route.name, m = me();
    const navOn = r === 'member' ? 'members' : (r === 'logs' || r === 'help' || r === 'feedback') ? 'settings' : r === 'archive' ? 'menus' : r;
    const items = NAV.filter((n) => n[0] !== 'record' || can('record'));
    return '<header class="top"><a class="brand" href="#home" aria-label="ホーム"><img class="mark" src="crest.webp?v=1" alt="" width="30" height="32"><span class="brand-t"><b>KURFC</b>筋トレ</span></a>' +
      '<span class="top-title"><span>' + (TITLE[r] || '') + '</span></span>' +
      '<a class="top-help' + (r === 'help' ? ' on' : '') + '" href="#help" aria-label="使い方ガイド">' + icon('help') + '</a>' +
      '<a class="top-acct' + (navOn === 'settings' ? ' on' : '') + '" href="#settings" aria-label="設定">' + (m ? '<span class="who">' + PERM[m.perm] + '</span>' : '') + icon('gear') + '</a></header>' +
      '<div class="hoops" aria-hidden="true"></div>' +
      '<nav class="nav n' + items.length + '" aria-label="メニュー">' + items.map((n) =>
        '<a href="#' + n[0] + '" class="' + (navOn === n[0] ? 'on' : '') + (n[0] === 'record' ? ' rec' : '') + '"' + (navOn === n[0] ? ' aria-current="page"' : '') + '>' + (navOn === n[0] ? '<i class="nav-ind" aria-hidden="true"></i>' : '') + icon(n[2]) + '<span>' + n[1] + '</span></a>').join('') +
      '<a href="#settings" class="nav-set ' + (navOn === 'settings' ? 'on' : '') + '">' + (navOn === 'settings' ? '<i class="nav-ind" aria-hidden="true"></i>' : '') + icon('gear') + '<span>設定</span></a></nav>' +
      '<main class="main view-' + r + '" id="main">' +
      (S.loadError ? '<div class="banner err">' + esc(S.loadError) + '<button class="btn small" data-act="reload">再読み込み</button></div>' : '') +
      inner + '</main>';
  }
  /** ホームの数字を 0 から数え上げる（画面に入ったときだけ） */
  function countUp() {
    if (reduceMotion()) return;
    $$('.board .num[data-count]').forEach((el, i) => {
      const to = +el.dataset.count;
      if (!(to > 0)) return;
      const t0 = performance.now() + i * 60, dur = 760;
      const step = (t) => {
        if (!el.isConnected) return;
        const k = Math.max(0, Math.min(1, (t - t0) / dur));
        el.textContent = Math.round(to * (1 - Math.pow(1 - k, 4)));
        if (k < 1) requestAnimationFrame(step);
      };
      el.textContent = '0';
      requestAnimationFrame(step);
    });
  }
  /** 区切りボタンの「選んでいる印」と下のタブの印に名前を付け、切り替えで滑って移るようにする */
  function clearMorphs() { $$('.seg button').forEach((b) => { if (b.style.viewTransitionName) b.style.viewTransitionName = ''; }); }
  function nameMorphs() {
    if (!document.startViewTransition) return;
    clearMorphs();
    // 画面ごとに名前を変える（別の画面の区切りボタンへ飛んでいかないように）
    const r = S.route.name.replace(/[^a-z]/g, '');
    $$('.seg').forEach((s, i) => { const on = $('[aria-pressed="true"]', s); if (on) on.style.viewTransitionName = 'seg-' + r + '-' + i; });
  }
  function render() {
    const app = $('#app');
    if (!S.data) {
      app.innerHTML = '<div class="boot"><img class="boot-crest" src="crest.webp?v=1" alt="" width="84" height="90"><span class="boot-hoops" aria-hidden="true"></span><p>' + (S.loadError ? esc(S.loadError) : '読み込み中…') + '</p>' +
        (S.loadError ? '<button class="btn primary" data-act="reload">もう一度読み込む</button>' : '') + '</div>';
      return;
    }
    if (S.data.locked) { app.innerHTML = lockedView(); return; }
    const r = S.route;
    const fn = { home: vHome, rank: vRank, cal: vCal, menus: vMenus, members: vMembers, record: vRecord, settings: vSettings, logs: vLogs, archive: vArchive, help: vHelp, feedback: vFeedback };
    app.innerHTML = shell(r.name === 'member' ? vMember(r.arg) : (fn[r.name] || vHome)());
    document.title = (TITLE[r.name] ? TITLE[r.name] + '｜' : '') + 'KURFC 筋トレ';
    const entering = S.enter !== false;
    S.enter = false;
    if (entering) {
      const main = $('#main');
      if (main && !reduceMotion()) { main.classList.add('enter'); setTimeout(() => main.classList.remove('enter'), 1200); }
      if (r.name === 'home') countUp();
    }
    if (S.celebrate && r.name === 'home') {
      const c = S.celebrate; S.celebrate = null; store.set(c.key, 1);
      setTimeout(() => { if (S.route.name === 'home') { confetti(); toast(c.text + ' 🎉'); } }, 500);
    }
    S.celebrate = null;
    if ((r.name === 'help' || r.name === 'settings') && r.arg) {
      const el = document.getElementById(r.name === 'help' ? 'h-' + r.arg : r.arg);
      if (el) setTimeout(() => el.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' }), 60);
    }
    if (r.name === 'home' || r.name === 'rank' || r.name === 'cal') {
      const p = curPeriod(), pv = L.prevPeriod(S.kind, p.from);
      ensureRange(r.name === 'home' ? pv.from : p.from, p.to > S.data.today ? S.data.today : p.to);
    } else if (r.name === 'member' && S.memberMonth) ensureRange(S.memberMonth, S.memberMonth);
    if (r.name === 'member' && memberById(r.arg) && memberById(r.arg).player) loadHistory(r.arg);
    else if (r.name === 'record' && S.rec.date) ensureRange(S.rec.date, S.rec.date);
    if (me() && me().mustChange && !$('#sheet-root form[data-form="pin"]')) openPinChange(true, pendingOldPin);
    const wrap = $('.matrix-wrap'), th = wrap && $('thead th.today', wrap);
    if (th) wrap.scrollLeft = Math.max(0, th.offsetLeft - wrap.clientWidth + th.offsetWidth + 48);
  }
  function lockedView() {
    return '<div class="gate"><div class="boot-mark" aria-hidden="true">' + jersey({ num: '', front: true }) + '</div><h1>KURFC 筋トレ</h1>' +
      '<form data-form="gate" class="form"><label>部の合言葉<input type="password" name="pass" autocomplete="off" required autofocus></label>' +
      '<p class="form-err" hidden></p><button class="btn primary wide" type="submit">開く</button></form>' +
      '<button class="linkbtn" data-act="login">管理者・マネージャー・FWリーダーのログイン</button></div>';
  }

  function putStamp(x) {
    if (!S.stampMap) S.stampMap = {};
    S.stampMap[x.t + '|' + x.e] = x;
    const list = S.data.stamps || (S.data.stamps = []);
    const i = list.findIndex((y) => y.t === x.t && y.e === x.e);
    if (i >= 0) list[i] = Object.assign({}, list[i], x); else list.push(Object.assign({ at: '' }, x));
    $$('.stamps').forEach((b) => { if (b.dataset.t === x.t && b.dataset.e === x.e) b.outerHTML = stampBar(x.t, x.e, { small: b.classList.contains('small') }); });
  }
  const STAMP_BUSY = {};
  /** スタンプを押したときの小さな演出 */
  function burst(r, k) {
    const span = document.createElement('span');
    span.className = 'burst'; span.textContent = (STAMPS.find((x) => x[0] === k) || ['', '✨'])[1];
    span.style.left = (r.left + r.width / 2) + 'px'; span.style.top = r.top + 'px';
    document.body.appendChild(span); setTimeout(() => span.remove(), 700);
  }
  function rerenderKeepGuide() {
    if (S.data) render();
    if ($('#guide-root').innerHTML) openGuide(guideStep);
  }

  // ---------- ルーティング ----------
  let prevHash = '';
  function parseHash() {
    const h = (location.hash || '#home').slice(1).split('/');
    return { name: h[0] || 'home', arg: h[1] ? decodeURIComponent(h[1]) : '' };
  }
  // 詳細の画面（一覧から進む先）。深さで「進む・戻る」の動きを決める
  const DEPTH = { member: 1, logs: 1, archive: 1, help: 1, feedback: 1 };
  function onHash() {
    const next = parseHash(), prev = S.route;
    if (S.route.name === 'record' && next.name !== 'record' && !recLeaveOk()) { history.replaceState(null, '', '#record'); return; }
    if (next.name === 'record' && next.arg && L.isDate(next.arg)) { S.rec.date = next.arg; S.rec.edits = {}; }
    if (next.name === 'member' && S.route.arg !== next.arg) S.memberMonth = null;
    if (next.name !== 'logs') S.logs = null;
    if (next.name !== 'archive') S.archive = null;
    if (next.name !== 'feedback') S.fb = null;
    const newSection = prevHash.split('/')[0] !== location.hash.split('/')[0];
    const da = DEPTH[prev.name] || 0, db = DEPTH[next.name] || 0;
    const kind = prev.name === next.name ? 'swap' : db > da ? 'push' : db < da ? 'pop' : 'tab';
    S.route = next;
    if (prev.name !== next.name) S.enter = true;
    prevHash = location.hash;
    closeSheet();
    vt(() => {
      render();
      if (newSection) window.scrollTo(0, 0);
    }, kind);
  }

  // ---------- 操作 ----------
  let pendingOldPin = '';
  const setFilter = (key) => (el) => {
    const v = el.dataset.v;
    if (key === 'group') { S.group = v; S.position = ''; }
    else S.position = S.position === v ? '' : v;
    vt(render, 'swap');
  };
  const acts = {
    'sheet-close': () => { if (!sheetLocked) closeSheet(); },
    'sheet-bg': () => { if (!sheetLocked) closeSheet(); },
    'go-back': (el, ev) => { if (history.length > 1 && prevHash) { ev.preventDefault(); history.back(); } },
    kind: (el) => { if (S.kind === el.dataset.v) return; S.kind = el.dataset.v; store.set('kind', S.kind); vt(render, 'swap'); },
    period: (el) => {
      const p = curPeriod();
      const n = +el.dataset.v < 0 ? L.prevPeriod(S.kind, p.from) : L.nextPeriod(S.kind, p.from);
      if (n.from > S.data.today) return;
      S.anchor = n.from; vt(render, +el.dataset.v < 0 ? 'prev' : 'next');
    },
    'f-group': setFilter('group'),
    'rank-tab': (el) => { if ((S.rankTab || 'list') === el.dataset.v) return; S.rankTab = el.dataset.v; vt(render, 'swap'); },
    'to-stats': () => { S.rankTab = 'stats'; },
    sort: (el) => { if (S.sort === el.dataset.v) return; S.sort = el.dataset.v; vt(render, 'swap'); },
    'menu-tab': (el) => { if (S.menuTab === el.dataset.v) return; S.menuTab = el.dataset.v; vt(render, 'swap'); },
    'menu-group': (el) => { if (S.menuGroup === el.dataset.v) return; S.menuGroup = el.dataset.v; vt(render, 'swap'); },
    'menu-open': (el, ev) => { ev.preventDefault(); openMenu(el.dataset.id); },
    'menu-new': () => openMenuForm(''),
    'menu-edit': (el) => openMenuForm(el.dataset.id),
    'menu-del': async (el) => {
      const w = S.data.menus.find((x) => x.id === el.dataset.id);
      if (!w || !confirm('「' + w.title + '」（' + mdw(w.date) + '）を削除しますか？\nすでに付けた実施記録は消えません。')) return;
      await busy(el, async () => {
        try { await api('deleteMenu', { id: w.id }); closeSheet(); await loadState(); render(); toast('メニューを削除しました'); }
        catch (e) { toast(e.message, 'err'); }
      });
    },
    mmonth: (el) => {
      const n = L.addMonths(S.memberMonth, +el.dataset.v);
      if (n > S.data.today) return;
      S.memberMonth = n; vt(render, +el.dataset.v < 0 ? 'prev' : 'next');
    },
    'member-new': () => openMemberForm(''),
    'member-edit': (el) => openMemberForm(el.dataset.id),
    'member-import': () => openImport(),
    'bulk-open': () => openBulk(),
    'member-del': async (el) => {
      const m = memberById(el.dataset.id);
      if (!m || !confirm(m.name + ' さんの在籍を外しますか？\n会計アプリの名簿でも在籍なしになります。これまでの記録は残り、あとで戻せます。')) return;
      await busy(el, async () => {
        try { await api('setMemberActive', { id: m.id, active: false }); closeSheet(); await loadState(); location.hash = '#members'; render(); toast('在籍を外しました'); }
        catch (e) { sheetError(e.message); }
      });
    },
    'member-restore': async (el) => {
      await busy(el, async () => {
        try { await api('setMemberActive', { id: el.dataset.id, active: true }); closeSheet(); await loadState(); render(); toast('在籍に戻しました'); }
        catch (e) { sheetError(e.message); }
      });
    },
    'pin-reset': async (el) => {
      const m = memberById(el.dataset.id);
      if (!m || !confirm(m.name + ' さんの暗証番号を' + (m.pinSet ? '出し直しますか？\n今の暗証番号は使えなくなります。' : '発行しますか？'))) return;
      await busy(el, async () => {
        try {
          const r = await api('resetPin', { id: m.id });
          await loadState(); render();
          openSheet('暗証番号を発行しました',
            '<div class="pinshow"><p>' + esc(r.name) + ' さんの最初の暗証番号</p><div class="pin num">' + esc(r.tempPin) + '</div>' +
            '<p class="note">この番号を本人に伝えてください。最初のログインで、本人が新しい暗証番号を決めます。<br>この画面を閉じると、番号はもう表示できません。</p>' +
            '<div class="actions"><button class="btn primary" data-act="sheet-close">伝えたので閉じる</button></div></div>');
        } catch (e) { sheetError(e.message); }
      });
    },
    login: () => openLogin(),
    logout: async () => {
      if (!recLeaveOk()) return;
      try { await api('logout', {}); } catch (e) { /* 通信できなくても端末側は消す */ }
      S.token = ''; store.del('token'); pendingOldPin = '';
      closeSheet(); await loadState(); render(); toast('ログアウトしました');
    },
    'pin-change': () => openPinChange(false),
    'goal-open': () => openGoal(),
    'offs-open': () => openOffs(),
    'ex-new': (el) => openExempt(el.dataset.id),
    'ex-del': async (el) => {
      // 確認のダイアログは使わず、2回押しで確定
      if (el.dataset.armed !== '1') { el.dataset.armed = '1'; el.textContent = 'もう一度押すと取り消し'; setTimeout(() => { if (el.isConnected) { el.dataset.armed = ''; el.textContent = '取り消す'; } }, 4000); return; }
      try {
        await api('deleteExempt', { id: el.dataset.id });
        closeSheet(); await loadState(); render(); toast('免除を取り消しました');
      } catch (e) { toast(e.message, 'err'); }
    },
    'goal-copy': async (el) => { toast((await copyText(goalText(el.dataset.from))) ? 'コピーしました。LINEに貼り付けてください' : 'コピーできませんでした', 'ok'); },
    'goal-line': (el) => { window.open('https://line.me/R/share?text=' + encodeURIComponent(goalText(el.dataset.from)), '_blank', 'noopener'); },
    'award-copy': async (el) => { toast((await copyText(awardText(el.dataset.from))) ? 'コピーしました。LINEに貼り付けてください' : 'コピーできませんでした', 'ok'); },
    'promote-open': () => openPromote(),
    // 応援スタンプ（押すとすぐ数を変え、サーバーの返事で直す）
    stamp: async (el) => {
      const box = el.closest('.stamps'), t = box.dataset.t, e = box.dataset.e, k = el.dataset.k, key = t + '|' + e;
      if (STAMP_BUSY[key]) return;
      const rect = el.getBoundingClientRect();
      const before = JSON.parse(JSON.stringify(stampOf(t, e)));
      const x = JSON.parse(JSON.stringify(before));
      const on = x.mine.indexOf(k) < 0;
      if (on) { x.mine.push(k); x.c[k] = (x.c[k] || 0) + 1; } else { x.mine = x.mine.filter((y) => y !== k); x.c[k] = Math.max(0, (x.c[k] || 1) - 1); if (!x.c[k]) delete x.c[k]; }
      putStamp(x); STAMP_BUSY[key] = 1;
      if (on && !reduceMotion()) burst(rect, k);
      try { const r = await api('stamp', { target: t, event: e, kind: k, from: PREF.self || '' }); putStamp(r.stamp); }
      catch (err) { putStamp(before); toast(err.message, 'err'); }
      finally { delete STAMP_BUSY[key]; }
    },
    'pref-theme': (el) => { PREF.theme = el.dataset.v; store.set('theme', PREF.theme); applyPrefs(); rerenderKeepGuide(); },
    'pref-size': (el) => { PREF.size = el.dataset.v; store.set('size', PREF.size); applyPrefs(); rerenderKeepGuide(); },
    guide: () => openGuide(0),
    'push-test': async (el) => {
      await busy(el, async () => {
        try { await api('pushTest', { endpoint: PUSH.endpoint }); toast('テスト通知を送りました。数秒で届きます'); }
        catch (e) { toast(e.message, 'err'); }
      });
    },
    'push-off': async (el) => {
      await busy(el, async () => {
        try {
          const sub = await PWA.reg.pushManager.getSubscription();
          if (sub) { await api('pushUnregister', { sub: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe(); }
          PUSH.endpoint = ''; store.del('pushKinds'); render(); toast('通知をオフにしました');
        } catch (e) { toast('オフにできませんでした', 'err'); }
      });
    },
    'sw-update': (el) => { el.disabled = true; if (PWA.waiting) PWA.waiting.postMessage('skipWaiting'); else location.reload(); },
    'pwa-install': async () => { const p = PWA.prompt; if (!p) return; PWA.prompt = null; p.prompt(); try { await p.userChoice; } catch (e) { /* noop */ } render(); },
    'guide-next': () => openGuide(guideStep + 1),
    'guide-prev': () => openGuide(guideStep - 1),
    'guide-push': () => { closeGuide(); location.hash = '#settings/push'; },
    'guide-help': (el) => { closeGuide(); location.hash = '#help' + (el.dataset.v ? '/' + el.dataset.v : ''); },
    'help-role': (el) => { S.helpRole = el.dataset.v; render(); },
    'guide-close': () => closeGuide(),
    'sessions-open': () => openSessions(),
    'sess-out': async (el) => {
      if (el.dataset.armed !== '1') { el.dataset.armed = '1'; const t0 = el.textContent; el.textContent = 'もう一度押すとログアウト'; setTimeout(() => { if (el.isConnected) { el.dataset.armed = ''; el.textContent = t0; } }, 4000); return; }
      await busy(el, async () => {
        try { const r = await api('logoutSession', { key: el.dataset.k }); toast(r.removed + '台の端末をログアウトしました'); openSessions(); }
        catch (e) { toast(e.message, 'err'); }
      });
    },
    'perms-open': () => openPerms(),
    'trash-open': () => openTrash(),
    'trash-restore': async (el) => {
      await busy(el, async () => {
        try {
          const r = await api('restoreRecord', { id: el.dataset.id });
          replaceDay(r.date, r.records);
          setData(S.data); S.hist = {}; render(); openTrash(); toast(mdw(r.date) + ' の記録を戻しました');
        } catch (e) { toast(e.message, 'err'); }
      });
    },
    'pinreq-open': () => openPinRequest(),
    'pinreq-close': async (el) => {
      await busy(el, async () => {
        try { await api('dismissPinRequest', { id: el.dataset.id }); await loadState(); render(); toast('依頼を閉じました'); }
        catch (e) { toast(e.message, 'err'); }
      });
    },
    'body-new': (el) => openBody(el.dataset.id),
    'body-goal': (el) => openBodyGoal(el.dataset.id),
    'stamp-more': (el) => {
      const box = el.closest('.stamps'), key = box.dataset.t + '|' + box.dataset.e;
      S.stampOpen = S.stampOpen || {};
      S.stampOpen[key] = !S.stampOpen[key];
      box.outerHTML = stampBar(box.dataset.t, box.dataset.e, { small: box.classList.contains('small') });
    },
    'selfrec-open': (el) => openSelfRec(el.dataset.id),
    'member-tab': (el) => { if ((S.memberTab || 'rec') === el.dataset.v) return; S.memberTab = el.dataset.v; vt(render, 'swap'); },
    'badge-open': (el) => openBadge(el.dataset.id, el.dataset.k),
    'week-open': () => { if (recDirty() && !confirm('この日の保存していない記録は破棄されます。続けますか？')) return; S.rec.edits = {}; openWeek(L.weekStart(S.rec.date || S.data.today)); },
    'week-move': (el) => {
      const n = Object.keys(S.wk.edits).length;
      if (n && !confirm('この週の保存していない変更（' + n + '件）は破棄されます。続けますか？')) return;
      const ws = L.addDays(S.wk.ws, +el.dataset.v * 7);
      if (ws > S.data.today) return;
      S.wk = { ws: ws, edits: {} };
      ensureRange(ws, L.addDays(ws, 6)).then(refreshWeek);
      refreshWeek();
    },
    'week-cell': (el) => {
      const k = el.dataset.k, id = k.split('|')[0], dt = k.split('|')[1];
      const r = S.data.records.find((x) => x[0] === id && x[1] === dt), saved = !!(r && +r[2] === 1);
      const cur = S.wk.edits[k] !== undefined ? S.wk.edits[k] : saved;
      if (!cur === saved) delete S.wk.edits[k]; else S.wk.edits[k] = !cur;
      tick(!cur ? 10 : 5);
      refreshWeek();
      const b = $('#sheet-root .wk-c[data-k="' + k.replace(/"/g, '') + '"]');
      if (b && !cur) b.classList.add('pop-on');
    },
    'week-save': async (el) => {
      const by = {};
      Object.keys(S.wk.edits).forEach((k) => { const a = k.split('|'); (by[a[1]] = by[a[1]] || []).push({ memberId: a[0], done: S.wk.edits[k] }); });
      const days = Object.keys(by).sort().map((dt) => ({ date: dt, items: by[dt] }));
      const before = S.idx;
      await busy(el, async () => {
        try {
          const r = await api('saveRecordsWeek', { days: days });
          r.days.forEach((dt) => replaceDay(dt, r.records.filter((x) => x[1] === dt)));
          setData(S.data); S.hist = {};
          const hit = goalHitters(before, S.idx, [S.wk.ws]);
          closeSheet(); render();
          if (r.rejected.length) toast('保存できなかった記録があります：' + r.rejected.map((x) => (x.name || '') + ' ' + md(x.date) + '（' + x.message + '）').join('、'), 'err');
          else toast('保存しました（実施 ' + r.saved + '件' + (r.removed ? '・取り消し ' + r.removed + '件' : '') + '）' + (hit.length ? '　' + hit.slice(0, 3).join('・') + (hit.length > 3 ? 'ほか' : '') + 'が週' + goal() + '回を達成！' : ''));
          if (hit.length) confetti();
        } catch (e) {
          if (e.code === 'auth') { closeSheet(); await loadState(); render(); toast('ログインが切れました。もう一度ログインしてください', 'err'); }
          else sheetError(e.message);
        }
      });
    },
    'fb-open': () => openFeedback(),
    'video-open': () => openVideo(),
    'video-close': () => closeVideo(),
    'fb-done': async (el) => {
      try {
        const r = await api('feedbackDone', { id: el.dataset.id, done: el.dataset.v === '1' });
        const i = S.fb.list.findIndex((x) => x.id === r.item.id);
        if (i >= 0) S.fb.list[i] = r.item;
        S.data.feedbackOpen = r.open; render();
        toast(r.item.done ? '対応済みにしました' : '未対応に戻しました');
      } catch (e) { toast(e.message, 'err'); }
    },
    'lifts-open': () => openLifts(),
    'body-bulk': () => openBodyBulk(),
    'body-del': async (el) => {
      if (el.dataset.armed !== '1') { el.dataset.armed = '1'; el.textContent = 'もう一度押すと消す'; setTimeout(() => { if (el.isConnected) { el.dataset.armed = ''; el.textContent = '消す'; } }, 4000); return; }
      try { await api('deleteBody', { id: el.dataset.id }); S.data.body = (S.data.body || []).filter((b) => b[0] !== el.dataset.id); render(); toast('消しました'); }
      catch (e) { toast(e.message, 'err'); }
    },
    'rec-sort': (el) => { S.recSort = el.dataset.v; store.set('recSort', S.recSort); render(); },
    'menu-copy': (el) => openCopy(el.dataset.id),
    'tpl-from-menu': (el) => { const w = S.data.menus.find((x) => x.id === el.dataset.id); if (w) openTemplateForm('', { group: w.group, positions: w.positions, title: w.title, content: w.content, detail: w.detail, note: w.note, video: w.video, repeat: [L.dow(w.date)] }); },
    'tpl-new': () => openTemplateForm(''),
    'tpl-open': (el) => openTemplate(el.dataset.id),
    'tpl-edit': (el) => openTemplateForm(el.dataset.id),
    'tpl-use': (el) => { const t = (S.data.templates || []).find((x) => x.id === el.dataset.id); if (t) openMenuForm('', { group: t.group, positions: t.positions, title: t.title, content: t.content, detail: t.detail, note: t.note, video: t.video }); },
    'tpl-del': async (el) => {
      const t = (S.data.templates || []).find((x) => x.id === el.dataset.id);
      if (!t) return;
      const keep = t.repeat.length ? !confirm('「' + t.title + '」の型を削除します。\n明日以降の繰り返しのメニュー（手で直していないもの）も消しますか？\n\nOK：消す ／ キャンセル：メニューは残す') : true;
      await busy(el, async () => {
        try { const r = await api('deleteTemplate', { id: t.id, keepMenus: keep }); closeSheet(); await loadState(); render(); toast('型を削除しました' + (r.removed ? '（メニュー ' + r.removed + '件も削除）' : '')); }
        catch (e) { toast(e.message, 'err'); }
      });
    },
    'lib-add': (el) => {
      const f = el.closest('form'), x = LIB[+el.dataset.c][1][+el.dataset.i];
      const add = (ta, line) => { ta.value = (ta.value.replace(/\s+$/, '') ? ta.value.replace(/\s+$/, '') + '\n' : '') + line; };
      add(f.content, x[0]); add(f.detail, x[0] + '：' + x[1]);
      el.classList.add('added'); toast('「' + x[0] + '」を足しました');
    },
    'arch-csv': () => archiveCsv(),
    'arch-tpl': (el) => { const w = S.archive.list.find((x) => x.id === el.dataset.id); if (w) openTemplateForm('', { group: w.group, positions: w.positions, title: w.title, content: w.content, detail: w.detail, note: w.note, video: w.video }); },
    'arch-new': (el) => { const w = S.archive.list.find((x) => x.id === el.dataset.id); if (w) openMenuForm('', { group: w.group, positions: w.positions, title: w.title, content: w.content, detail: w.detail, note: w.note, video: w.video }); },

    viewlock: () => openViewLock(),
    reload: async (el) => { await busy(el, async () => { await loadState(); render(); if (!S.loadError) toast('最新の情報に更新しました'); }); },
    'logs-more': (el) => busy(el, () => loadLogs(S.logs.list.length)),
    // 記録
    'rec-toggle': (el) => {
      const id = el.dataset.id;
      const row = recRows().find((r) => r.m.id === id);
      if (!row || row.locked) return;
      const next = !recCur(row);
      if (next === row.saved) delete S.rec.edits[id]; else S.rec.edits[id] = next;
      recRefreshRow(id);
      tick(next ? 10 : 5);
      const b = $('.rec-row[data-id="' + id + '"] .rec-btn');
      if (b) b.classList.add(next ? 'pop-on' : 'pop-off');
      const n = $('#rec-bar .s-on .num');
      if (n) { n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); }
    },
    'rec-del': async (el) => {
      const m = memberById(el.dataset.id), date = S.rec.date;
      if (!m || !confirm(m.name + ' さんの ' + mdw(date) + ' の「実施した」を取り消しますか？')) return;
      await busy(el, async () => {
        try {
          const r = await api('deleteRecord', { memberId: m.id, date: date });
          replaceDay(date, r.records);
          setData(S.data); S.hist = {}; render(); toast('取り消しました');
        } catch (e) { toast(e.message, 'err'); }
      });
    },
    'rec-more': () => openSheet('その他', '<ul class="links rec-more-list">' +
      '<li><button data-act="week-open">' + icon('grid') + '1週間まとめて入力<small>1人ずつ、1週間ぶんの「実施した」を表でまとめて直す</small></button></li>' +
      '<li><button data-act="trash-open">' + icon('trash') + '取り消した記録<small>まちがえて取り消した「実施した」を戻す</small></button></li></ul>'),
    'r-group': (el) => { S.rec.group = el.dataset.v; S.rec.position = ''; render(); },
    'rec-day': (el) => {
      const n = L.addDays(S.rec.date, +el.dataset.v);
      if (n > S.data.today || !recLeaveOk()) return;
      S.rec.date = n; S.rec.edits = {}; render();
    },
    'rec-confirm': () => openRecConfirm(),
    'rec-save': async (el) => {
      const ch = recChanges();
      const items = ch.add.map((r) => ({ memberId: r.m.id, done: true })).concat(ch.del.map((r) => ({ memberId: r.m.id, done: false })));
      const date = S.rec.date;
      await busy(el, async () => {
        try {
          const before = S.idx;
          const r = await api('saveRecords', { date: date, items: items });
          replaceDay(date, r.records);
          setData(S.data); S.hist = {};
          S.rec.edits = {};
          const hit = goalHitters(before, S.idx, [L.weekStart(date)]);
          closeSheet(); render();
          if (r.rejected.length) toast('保存できなかった記録があります：' + r.rejected.map((x) => (x.name || '') + '（' + x.message + '）').join('、'), 'err');
          else toast('保存しました（実施 ' + r.saved + '人' + (r.removed ? '・取り消し ' + r.removed + '人' : '') + '）' + (hit.length ? '　' + hit.slice(0, 3).join('・') + (hit.length > 3 ? 'ほか' : '') + 'が週' + goal() + '回を達成！' : ''));
          if (hit.length) confetti();
        } catch (e) {
          if (e.code === 'auth') { closeSheet(); await loadState(); render(); toast('ログインが切れました。もう一度ログインしてください', 'err'); }
          else sheetError(e.message);
        }
      });
    }
  };

  const forms = {
    login: async (f, btn) => {
      const pin = f.pin.value;
      await busy(btn, async () => {
        try {
          const r = await api('login', { memberId: f.memberId.value, pin: pin, deviceName: deviceName() });
          S.token = r.token; store.set('token', r.token);
          pendingOldPin = r.me.mustChange ? pin : '';
          closeSheet(); await loadState(); render();
          if (!r.me.mustChange) toast(r.me.name + ' さんでログインしました');
        } catch (e) { sheetError(e.message); }
      });
    },
    pin: async (f, btn) => {
      if (f.newPin.value !== f.newPin2.value) { sheetError('新しい暗証番号が2回で違っています。'); return; }
      await busy(btn, async () => {
        try {
          await api('changePin', { oldPin: f.oldPin.value, newPin: f.newPin.value });
          pendingOldPin = ''; closeSheet(); await loadState(); render(); toast('暗証番号を変更しました');
        } catch (e) { sheetError(e.message); }
      });
    },
    gate: async (f, btn) => {
      await busy(btn, async () => {
        try {
          const r = await api('viewLogin', { pass: f.pass.value });
          S.viewToken = r.viewToken; store.set('viewToken', r.viewToken);
          await loadState(); render();
        } catch (e) { const el = $('.gate .form-err'); if (el) { el.textContent = e.message; el.hidden = false; } }
      });
    },
    menu: async (f, btn) => {
      const v = menuFormValues(f);
      const menu = { id: f.id ? f.id.value : '', date: f.date.value, group: v.group, positions: v.poss, title: f.title.value, content: f.content.value, detail: f.detail.value, note: f.note.value, video: f.video.value.trim() };
      await busy(btn, async () => {
        try {
          await api('saveMenu', { menu: menu });
          closeSheet(); await loadState();
          S.menuTab = menu.date >= S.data.today ? 'upcoming' : 'past';
          render(); toast(menu.id ? 'メニューを変更しました' : 'メニューを登録しました');
        } catch (e) { sheetError(e.message); }
      });
    },
    member: async (f, btn) => {
      const pos = ($('input[name="position"]:checked', f) || {}).value || '';
      const subs = $$('input[name="subs"]:checked', f).map((x) => x.value).filter((x) => x !== pos);
      const member = { id: f.id ? f.id.value : '', grade: f.grade.value, clubRole: f.clubRole.value, position: pos, subs: subs, mode: ($('input[name="mode"]:checked', f) || {}).value || 'self', perm: f.perm.value, start: f.start.value };
      if (!member.id) member.name = f.name.value;
      await busy(btn, async () => {
        try {
          const r = await api('saveMember', { member: member });
          closeSheet(); await loadState(); render();
          const m = memberById(r.member.id);
          if (m && m.perm !== 'member' && !m.pinSet) toast('保存しました。ログインできるように「編集」から暗証番号を発行してください');
          else toast(member.id ? '変更を保存しました' : '部員を追加しました（会計アプリの名簿にも入りました）');
        } catch (e) { sheetError(e.message); }
      });
    },
    bulk: async (f, btn) => {
      const rows = [], errs = [];
      $$('.bulk-r', f).forEach((el) => {
        const id = el.dataset.id, m = memberById(id);
        const position = f['p_' + id].value;
        const subs = parsePosList(f['s_' + id].value);
        if (!subs) { errs.push(m.name); return; }
        const mode = f['m_' + id].checked ? 'leader' : 'self';
        const subsClean = subs.filter((x, i) => x !== position && subs.indexOf(x) === i);
        if (position !== (m.position || '') || subsClean.join(',') !== (m.subs || []).join(',') || mode !== m.mode) rows.push({ id: id, position: position, subs: subsClean, mode: mode });
      });
      if (errs.length) { sheetError('サブのポジションが読めません：' + errs.join('、')); return; }
      if (!rows.length) { closeSheet(); toast('変更はありません'); return; }
      await busy(btn, async () => {
        try {
          const r = await api('bulkMembers', { rows: rows });
          closeSheet(); await loadState(); render(); toast(r.changed + '人を変更しました');
        } catch (e) { sheetError(e.message); }
      });
    },
    import: async (f, btn) => {
      const p = parseImport(f.rows.value);
      if (p.errs.length) { sheetError(p.errs.join('、') + ' を読み取れません。「名前, PR, 参加」の形にしてください。'); return; }
      if (!p.rows.length) { sheetError('1人以上書いてください。'); return; }
      await busy(btn, async () => {
        try {
          const r = await api('importMembers', { rows: p.rows });
          closeSheet(); await loadState(); render();
          toast('追加 ' + r.added + '人・更新 ' + r.updated + '人' + (r.skipped.length ? '（そのままの人：' + r.skipped.join('、') + '）' : ''));
        } catch (e) { sheetError(e.message); }
      });
    },
    promote: async (f, btn) => {
      const choice = {};
      Array.from(f.elements).forEach((el) => { if (el.name && el.name.indexOf('c_') === 0) choice[el.name.slice(2)] = el.value; });
      await busy(btn, async () => {
        try {
          const r = await api('promote', { sig: f.sig.value, choice: choice });
          closeSheet(); await loadState(); render();
          toast('進級しました：学年を上げた ' + r.up + '人・卒業 ' + r.grad + '人・そのまま ' + r.stay + '人' + (r.notGrad.length ? '（卒業にできなかった人：' + r.notGrad.join('、') + '）' : ''));
        } catch (e) { sheetError(e.message); }
      });
    },
    push: async (f, btn) => {
      const kinds = $$('input[name="kinds"]:checked', f).map((x) => x.value);
      if (!kinds.length) { sheetErrorIn(f, '受け取る通知を1つ以上選んでください。（すべてやめるときは「通知をオフにする」）'); return; }
      // 許可の確認は、押した直後に出す（iPhone は押した操作の中でないと出せない）
      if (Notification.permission === 'default') {
        let perm = 'default';
        try { perm = await Notification.requestPermission(); } catch (e) { perm = 'denied'; }
        if (perm !== 'granted') { sheetErrorIn(f, '通知が許可されませんでした。「許可」を押すと受け取れます。'); render(); return; }
      }
      await busy(btn, async () => {
        try { const r = await registerPush(kinds); toast(r.kinds.length ? '通知をオンにしました。「テスト通知を送る」で確かめられます' : '受け取れる通知がありません（自分の名前を選んでください）'); }
        catch (e) { sheetErrorIn(f, e.message); }
      });
    },
    template: async (f, btn) => {
      const v = menuFormValues(f);
      const t = { id: f.id ? f.id.value : '', group: v.group, positions: v.poss, title: f.title.value, content: f.content.value, detail: f.detail.value, note: f.note.value, video: f.video.value.trim(),
        repeat: $$('input[name="repeat"]:checked', f).map((x) => +x.value), repeatFrom: f.repeatFrom.value, repeatTo: f.repeatTo.value, selfRec: !!(f.selfRec && f.selfRec.checked) };
      await busy(btn, async () => {
        try {
          const r = await api('saveTemplate', { template: t });
          closeSheet(); await loadState(); S.menuTab = 'templates'; if (S.route.name !== 'menus') location.hash = '#menus'; render();
          toast((t.id ? '型を変更しました' : '型を保存しました') + (r.created ? '（メニューを ' + r.created + '件作成）' : '') + (r.updated ? '（' + r.updated + '件をそろえました）' : '') + (r.removed ? '（' + r.removed + '件を削除）' : ''));
        } catch (e) { sheetError(e.message); }
      });
    },
    copy: async (f, btn) => {
      const dates = $$('input[name="dates"]:checked', f).map((x) => x.value);
      if (!dates.length) { sheetError('コピーする日を選んでください。'); return; }
      await busy(btn, async () => {
        try { const r = await api('copyMenu', { id: f.id.value, dates: dates }); closeSheet(); await loadState(); render(); toast(r.created + '日にコピーしました'); }
        catch (e) { sheetError(e.message); }
      });
    },
    bodygoal: async (f, btn) => {
      await busy(btn, async () => {
        try {
          const r = await api('saveBodyGoal', { memberId: f.memberId.value, weight: f.weight.value, date: f.date.value });
          const m = memberById(r.memberId);
          if (m) { if (r.goalW) { m.goalW = r.goalW; m.goalD = r.goalD; } else { delete m.goalW; delete m.goalD; } }
          closeSheet(); render(); toast(r.goalW ? '目標体重を ' + r.goalW + 'kg にしました' : '目標体重を外しました');
        } catch (e) { sheetError(e.message); }
      });
    },
    feedback: async (f, btn) => {
      const kind = ($('input[name="kind"]:checked', f) || {}).value || 'other';
      await busy(btn, async () => {
        try {
          await api('feedback', { kind: kind, text: f.text.value, from: PREF.self || '', page: (prevHash || '#home').split('/')[0], version: VERSION });
          closeSheet(); toast('送りました。ありがとうございます');
        } catch (e) { sheetError(e.message); }
      });
    },
    lifts: async (f, btn) => {
      const names = $$('input[name="ln"]', f).map((x) => x.value.trim()), rs = $$('input[name="lr"]', f).map((x) => x.value.trim());
      const list = names.map((n, i) => ({ name: n, ratio: rs[i] })).filter((x) => x.name || x.ratio);
      if (list.some((x) => !x.name || !x.ratio)) { sheetError('種目名と倍率の両方を入れてください。'); return; }
      await busy(btn, async () => {
        try { const r = await api('saveSettings', { liftRatios: list }); S.data.liftRatios = r.liftRatios; closeSheet(); render(); toast('重さの目安を保存しました'); }
        catch (e) { sheetError(e.message); }
      });
    },
    body1: async (f, btn) => {
      const row = { memberId: f.memberId.value, date: f.date.value, weight: f.weight.value, fat: '', muscle: '', note: f.note.value };
      await busy(btn, async () => {
        try { const r = await api('saveBody', { rows: [row] }); S.data.body = r.body; closeSheet(); render(); toast('保存しました'); }
        catch (e) { sheetError(e.message); }
      });
    },
    bodybulk: async (f, btn) => {
      const rows = [];
      $$('.bulk-r', f).forEach((el) => {
        const id = el.dataset.id, v = {};
        v.weight = f['weight_' + id].value.trim(); v.fat = ''; v.muscle = '';
        if (v.weight) rows.push(Object.assign({ memberId: id, date: f.date.value }, v));
      });
      if (!rows.length) { sheetError('1人以上入れてください。'); return; }
      await busy(btn, async () => {
        try { const r = await api('saveBody', { rows: rows }); S.data.body = r.body; closeSheet(); render(); toast(rows.length + '人分を保存しました'); }
        catch (e) { sheetError(e.message); }
      });
    },
    perms: async (f, btn) => {
      const rows = $$('select[name^="p_"]', f).filter((x) => !x.disabled && x.value !== x.dataset.cur).map((x) => ({ id: x.name.slice(2), perm: x.value }));
      if (!rows.length) { closeSheet(); toast('変更はありません'); return; }
      await busy(btn, async () => {
        try {
          const r = await api('bulkPerms', { rows: rows });
          closeSheet(); await loadState(); render();
          if (r.pins.length) openSheet('暗証番号を発行しました',
            '<div class="pinshow"><p>新しくログインする人の最初の暗証番号です。本人に直接伝えてください。</p><ul class="pins">' +
            r.pins.map((x) => '<li><span><b>' + esc(x.name) + '</b><small>' + PERM[x.perm] + '</small></span><span class="pin num">' + esc(x.pin) + '</span></li>').join('') + '</ul>' +
            '<p class="note">最初のログインで、本人が新しい暗証番号を決めます。この画面を閉じると、番号はもう表示できません（あとで「部員の編集」から出し直せます）。</p>' +
            '<div class="actions"><button class="btn primary" data-act="sheet-close">伝えたので閉じる</button></div></div>', { locked: false });
          else toast(r.changed + '人の役職を変えました');
        } catch (e) { sheetError(e.message); }
      });
    },
    pinreq: async (f, btn) => {
      await busy(btn, async () => {
        try {
          await api('pinRequest', { memberId: f.memberId.value });
          openSheet('依頼を送りました', '<p class="lead-line">管理者に依頼が届きました。管理者が新しい最初の暗証番号を出したら、その番号でログインしてください（ログインすると、自分の暗証番号を決め直す画面になります）。</p><div class="actions"><button class="btn primary" data-act="sheet-close">閉じる</button></div>');
        } catch (e) { sheetError(e.message); }
      });
    },
    exempt: async (f, btn) => {
      if (f.to.value < f.from.value) { sheetError('終了日は開始日より後にしてください。'); return; }
      await busy(btn, async () => {
        try {
          await api('saveExempt', { memberId: f.memberId.value, from: f.from.value, to: f.to.value, reason: f.reason.value, note: f.note.value });
          closeSheet(); await loadState(); render(); toast(f.memberId.value === 'ALL' ? 'オフ期間を登録しました' : '免除を登録しました');
        } catch (e) { sheetError(e.message); }
      });
    },
    goal: async (f, btn) => {
      await busy(btn, async () => {
        try {
          await api('saveSettings', { weekGoal: Number(f.goal.value) });
          closeSheet(); await loadState(); render(); toast('週の目標を ' + f.goal.value + '回以上にしました');
        } catch (e) { sheetError(e.message); }
      });
    },
    viewlock: async (f, btn) => {
      await busy(btn, async () => {
        try {
          await api('saveSettings', { viewPass: f.pass.value });
          closeSheet(); await loadState(); render(); toast(f.pass.value ? '合言葉を設定しました' : '合言葉を解除しました');
        } catch (e) { sheetError(e.message); }
      });
    }
  };

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = acts[el.dataset.act];
    if (fn) fn(el, ev);
  });
  document.addEventListener('submit', (ev) => {
    const f = ev.target.closest('form[data-form]');
    if (!f) return;
    ev.preventDefault();
    sheetError('');
    const fn = forms[f.dataset.form];
    if (fn) fn(f, f.querySelector('button[type="submit"]'));
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset && t.dataset.actChange === 'rec-date') {
      const v = t.value;
      if (!L.isDate(v) || v > S.data.today || !recLeaveOk()) { t.value = S.rec.date; return; }
      S.rec.date = v; S.rec.edits = {}; render();
      return;
    }
    if (t.dataset && t.dataset.actChange === 'pref-self') {
      PREF.self = t.value; if (PREF.self) store.set('self', PREF.self); else store.del('self');
      if (PUSH.endpoint) registerPush(store.get('pushKinds', []), true).catch(() => {});
      if (!$('#guide-root').innerHTML) render();
      return;
    }
    if (t.dataset && t.dataset.actChange === 'arch-by') { S.archive.by = t.value; render(); return; }
    if (t.dataset && t.dataset.actChange === 'tpl-fill') {
      const tp = (S.data.templates || []).find((x) => x.id === t.value), f = t.form;
      if (!tp) return;
      ['title', 'content', 'detail', 'note', 'video'].forEach((k) => { f[k].value = tp[k] || ''; });
      $$('input[name="positions"]', f).forEach((x) => { x.checked = tp.positions.indexOf(x.value) >= 0; });
      $$('input[name="group"]', f).forEach((x) => { x.checked = !tp.positions.length && x.value === tp.group; });
      updateTargetHint(); return;
    }
    if (t.form && t.form.dataset.form === 'copy') {
      const n = $$('input[name="dates"]:checked', t.form).length;
      $('#copy-n').textContent = n ? n + '日を選んでいます' : '日付を選んでください（6週間先まで・複数可）';
      return;
    }
    if (t.form && (t.form.dataset.form === 'menu' || t.form.dataset.form === 'template')) {
      if (t.name === 'group') $$('input[name="positions"]', t.form).forEach((x) => { x.checked = false; });
      if (t.name === 'positions' && t.checked) { const g = $('input[name="group"]:checked', t.form); if (g) g.checked = false; }
      updateTargetHint();
    }
  });
  let archTimer = 0;
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.dataset && t.dataset.actInput === 'arch-q') {
      clearTimeout(archTimer);
      archTimer = setTimeout(() => { if (!S.archive || S.route.name !== 'archive') return; S.archive.q = t.value; render(); const el = $('.search'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 250);
    }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && $('.vplayer')) { closeVideo(); return; }
    if (ev.key === 'Escape' && $('#guide-root').innerHTML) { closeGuide(); return; }
    if (ev.key === 'Escape' && !sheetLocked && $('#sheet-root').innerHTML) closeSheet();
  });
  window.addEventListener('hashchange', onHash);
  window.addEventListener('beforeunload', (ev) => {
    if (S.route.name === 'record' && S.idx && can('record') && recDirty()) { ev.preventDefault(); ev.returnValue = ''; }
  });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && PWA.reg) PWA.reg.update().catch(() => {});
    if (document.visibilityState !== 'visible' || !S.data || S.loading) return;
    if (Date.now() - S.lastLoad < 60000) return;
    if ($('#sheet-root').innerHTML || (S.route.name === 'record' && S.idx && can('record') && recDirty())) return;
    await loadState(); render();
  });

  // ---------- 起動 ----------
  (async function boot() {
    S.route = parseHash();
    prevHash = location.hash;
    store.del('state');
    registerSW();
    // 起動の演出（校章 → 段柄。1秒以内。1回の起動で1度だけ・動きを減らす設定では出さない）
    try {
      if (!reduceMotion() && !sessionStorage.getItem('kt.intro')) {
        sessionStorage.setItem('kt.intro', '1');
        const it = document.createElement('div');
        it.className = 'intro'; it.setAttribute('aria-hidden', 'true');
        it.innerHTML = '<img src="crest.webp?v=1" alt="" width="92" height="98"><span class="intro-hoops"></span>';
        document.body.appendChild(it);
        setTimeout(() => it.remove(), 1300);
      }
    } catch (e) { /* sessionStorage が使えない端末は演出なし */ }
    const cached = store.get('state2', null);
    if (cached && cached.members) cached.me = null; // 権限は必ずサーバーに確かめる
    if (cached && cached.members && cached.today === L.todayJST()) { S.data = cached; S.idx = L.buildIndex(cached); }
    render();
    await loadState({});
    // つながらないときは、前に読み込んだ情報を出す（日付が古くても）
    if (S.loadError && cached && cached.members && (!S.data || S.data === cached)) {
      S.data = cached; S.idx = L.buildIndex(cached);
      const t = cached.savedAt ? new Date(cached.savedAt + 9 * 3600 * 1000).toISOString().slice(5, 16).replace('-', '/').replace('T', ' ') : '';
      S.loadError = 'つながらないため、' + (t ? t + ' に' : '前に') + '読み込んだ情報を表示しています。';
    }
    render();
    if (S.data && !S.data.locked && !store.get('guided', 0)) openGuide(0);
  })();
})();

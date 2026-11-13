/* KURFC 筋トレ管理アプリ — 画面 v2（ジャージ・背番号） */
(function () {
  'use strict';
  const L = window.KLogic;
  const API = window.KINTORE_API;
  const VERSION = '2.5.0';
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

  // ---------- 表示の設定（端末ごと） ----------
  const PREF = { theme: store.get('theme', 'auto'), size: store.get('size', 'm'), self: store.get('self', '') };
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

  const ICON = {
    copy: '<path d="M9 9h10v12H9zM5 3h10v3H8v11H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
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
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
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

  function setData(d) {
    S.data = d;
    S.idx = d.locked ? null : L.buildIndex(d);
    S.lastLoad = Date.now();
    S.stampMap = {};
    (d.stamps || []).forEach((x) => { S.stampMap[x.t + '|' + x.e] = x; });
    if (S.token && !d.me) { S.token = ''; store.del('token'); }
    if (!d.locked) store.set('state2', d);
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
  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    $('#toast-root').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, kind === 'err' ? 5000 : 2600);
  }
  let sheetLocked = false;
  function openSheet(title, html, opt) {
    opt = opt || {};
    sheetLocked = !!opt.locked;
    $('#sheet-root').innerHTML =
      '<div class="sheet-bg" data-act="sheet-bg"></div>' +
      '<section class="sheet' + (opt.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<header class="sheet-h"><h2>' + esc(title) + '</h2>' +
      (opt.locked ? '' : '<button class="xbtn" data-act="sheet-close" aria-label="閉じる">×</button>') + '</header>' +
      '<div class="sheet-b">' + html + '</div></section>';
    document.body.classList.add('sheet-open');
    const f = $('#sheet-root [autofocus]');
    if (f) setTimeout(() => f.focus(), 50);
  }
  function closeSheet() { sheetLocked = false; $('#sheet-root').innerHTML = ''; document.body.classList.remove('sheet-open'); }
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
    let tag = '';
    if (t >= p.from && t <= p.to) tag = S.kind === 'week' ? '今週' : '今月';
    else if (L.prevPeriod(S.kind, (S.kind === 'week' ? L.weekRange(t) : L.monthRange(t)).from).from === p.from) tag = S.kind === 'week' ? '先週' : '先月';
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
      '<div class="plabel">' + (lb.tag ? '<b>' + lb.tag + '</b>' : '') + '<span>' + lb.text + '</span></div>' +
      '<button class="ibtn" data-act="period" data-v="1" aria-label="次の' + (S.kind === 'week' ? '週' : '月') + '"' + (atNow ? ' disabled' : '') + '>' + icon('next') + '</button></div></div>';
  }
  /** グループとポジションの絞り込み。act は data-act の前置き（例 'f' → f-group / f-pos） */
  function filterBar(group, position, act) {
    const pos = positions().filter((p) => group === 'ALL' || p.group === group);
    return '<div class="fbar"><div class="seg small" role="group" aria-label="グループ">' +
      ['ALL', 'FW', 'BK'].map((g) => '<button data-act="' + act + '-group" data-v="' + g + '" aria-pressed="' + (group === g && !position) + '">' + MGROUP[g] + '</button>').join('') + '</div>' +
      '<div class="poschips" role="group" aria-label="ポジション">' +
      pos.map((p) => '<button class="pchip g-' + p.group + '" data-act="' + act + '-pos" data-v="' + esc(p.code) + '" aria-pressed="' + (position === p.code) + '">' + esc(p.code) + '</button>').join('') +
      '</div></div>';
  }
  function filterOpt() { return { group: S.position ? 'ALL' : S.group, position: S.position, goal: goal() }; }
  function filterNote() {
    if (S.position) { const p = posOf(S.position); return p ? p.code + '（' + p.name + '・背番号' + p.numbers.join('・') + '）。サブが' + p.code + 'の人も入ります' : ''; }
    return '';
  }

  function delta(cur, prev, unit) {
    const d = cur - prev;
    const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
    return '<span class="delta ' + cls + '">' + (d > 0 ? '▲' : d < 0 ? '▼' : '±') + Math.abs(d) + unit + '</span>';
  }

  // ---------- ホーム ----------
  function vHome() {
    const d = S.data, today = d.today, p = curPeriod(), pv = L.prevPeriod(S.kind, p.from);
    const cur = L.periodStats(d, S.idx, p.from, p.to, today, { goal: goal() });
    const pre = L.periodStats(d, S.idx, pv.from, pv.to, today, { goal: goal() });
    const rk = L.rank(cur.rows, 'count');
    const ranked = rk.filter((r) => r.rank !== null);
    const isNow = today >= p.from && today <= p.to;
    const prevWord = S.kind === 'week' ? '前の週' : '前の月';
    const t = cur.team;
    let h = pinReqBanner() + selfCard() + periodBar();
    h += '<section class="board" aria-label="部全体の状況"><svg class="board-streaks" viewBox="25 40 85 66" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><use href="#jk-streaks"/></svg>' +
      '<div class="board-main"><div class="board-k">部全体の実施回数</div>' +
      '<div class="board-v"><span class="num" data-count="' + t.done + '">' + t.done + '</span><span class="unit">回</span></div>' +
      '<div class="board-s">' + prevWord + ' ' + pre.team.done + '回 ' + delta(t.done, pre.team.done, '回') + '</div></div>' +
      '<div class="board-side">' +
      '<div class="board-cell"><div class="board-k">メニュー参加者の実施率</div><div class="board-v2"><span class="num">' + (t.rate === null ? '－' : Math.round(t.rate * 100)) + '</span>' + (t.rate === null ? '' : '<span class="unit">%</span>') + '</div>' +
      '<div class="board-s">' + (t.rate === null ? 'まだ対象日がありません' : t.doneT + '/' + t.targetDays + '日') +
      (t.rate !== null && pre.team.rate !== null ? ' ' + delta(Math.round(t.rate * 100), Math.round(pre.team.rate * 100), 'pt') : '') + '</div></div>' +
      goalCell(t) +
      '</div></section>';
    if (isNow) h += todayCard();
    if (S.kind === 'week') h += goalBlock(cur.rows, isNow, p);
    if (S.kind === 'week' && isNow) h += pinchBlock();
    h += '<section class="block"><div class="block-h"><h2>ランキング</h2><a class="more" href="#rank">すべて見る</a></div>';
    if (!ranked.length) h += '<p class="empty">この期間の実施記録はまだありません。' + (can('record') ? '<br><a href="#record">記録をつける</a>' : '') + '</p>';
    else {
      h += podium(ranked.slice(0, 3));
      const rest = ranked.slice(3, 8);
      if (rest.length) h += '<ol class="rlist">' + rest.map(rankRow).join('') + '</ol>';
    }
    h += '</section>';
    if (isNow) h += feedBlock();
    h += formationBlock(p);
    if (S.kind === 'month') h += awardsBlock(cur.rows, pre.rows, p, isNow) + continuityBlock(cur.rows);
    return h;
  }

  // 週◯回（マスト）の達成。週間は人数、月間は「終わった週」の達成率
  function goalCell(t) {
    const g = t.goal;
    if (S.kind === 'week') {
      const n = t.goalNow + t.goalClosed, ok = t.goalNowOk + t.goalHit, w = n ? Math.round(ok / n * 100) : 0;
      return '<div class="board-cell"><div class="board-k">週' + g + '回の達成（マスト）</div><div class="board-v2"><span class="num">' + ok + '</span><span class="unit">/' + n + '人</span></div>' +
        '<div class="meter" role="img" aria-label="' + w + '%"><i style="width:' + w + '%"></i></div>' +
        '<div class="board-s">' + (t.goalNow ? '日曜までに' + g + '回で達成' : 'この週に' + g + '回以上の人') + (t.goalNowEx ? '・免除 ' + t.goalNowEx + '人' : '') + '</div></div>';
    }
    const r = t.goalClosed ? Math.round(t.goalHit / t.goalClosed * 100) : null;
    return '<div class="board-cell"><div class="board-k">週' + g + '回の達成率（マスト）</div><div class="board-v2"><span class="num">' + (r === null ? '－' : r) + '</span>' + (r === null ? '' : '<span class="unit">%</span>') + '</div>' +
      '<div class="board-s">' + (r === null ? 'まだ終わった週がありません' : '終わった週 ' + t.goalHit + '/' + t.goalClosed + '（人×週）') + '</div></div>';
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
    h += '<div class="share-row"><button class="btn small" data-act="goal-copy" data-from="' + p.from + '">' + icon('copy') + 'LINE用の文章をコピー</button>' +
      '<button class="btn small line" data-act="goal-line" data-from="' + p.from + '">LINEで送る</button></div>';
    return h + '<p class="note">週は月曜〜日曜。' + (isNow ? '日曜までに' + g + '回以上で達成です。' : '') + '免除の日がある週は、その日数に応じて必要な回数が減ります（7日とも免除ならその週は対象外）。' + (okN ? ' 達成 ' + okN + '人。' : '') + '</p></section>';
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

  function podium(top) {
    const order = top.length === 3 ? [top[1], top[0], top[2]] : top;
    return '<ol class="podium n' + top.length + '">' + order.map((r) =>
      '<li class="pod r' + r.rank + (r === top[0] ? ' lead' : '') + '"><a href="#member/' + r.id + '" aria-label="' + r.rank + '位 ' + esc(r.name) + ' ' + r.done + '回">' +
      jersey({ num: r.rank, suffix: '位', name: r.name.split(/\s+/)[0] }) +
      '<span class="pod-name">' + esc(r.name) + '</span>' +
      '<span class="pod-val"><span class="num">' + r.done + '</span>回' + (r.rate !== null ? '<small>' + Math.round(r.rate * 100) + '%</small>' : '') + '</span>' +
      '</a></li>').join('') + '</ol>';
  }
  function goalTag(r) {
    const gs = r.goal;
    if (!gs || !gs.weeks.length) return '';
    if (S.kind === 'week') {
      const w = gs.weeks[0];
      if (w.exempt) return '<small class="gt">免除</small>';
      return w.ok ? '<small class="gt ok">達成</small>' : w.open ? '<small class="gt">あと' + w.left + '</small>' : '<small class="gt ng">未達</small>';
    }
    return gs.closed ? '<small class="gt' + (gs.every ? ' ok' : '') + '">達成' + gs.hit + '/' + gs.closed + '週</small>' : '';
  }
  function rankRow(r) {
    return '<li class="rrank' + (r.rank && r.rank <= 3 ? ' is-top' : '') + '"><a href="#member/' + r.id + '">' +
      '<span class="rk">' + (r.rank === null ? '－' : r.rank + '<small>位</small>') + '</span>' +
      '<span class="rname"><b>' + esc(r.name) + '</b><small><span class="pos-tag g-' + (r.group || 'X') + '">' + posLabel(r) + '</span>' + (r.grade ? esc(r.grade) + '・' : '') + MODE[r.mode] + '</small></span>' +
      '<span class="rcount"><span class="num">' + r.done + '</span>回' + goalTag(r) + '</span>' +
      '<span class="rrate">' + (r.rate === null ? '<span class="dash">－</span>' : '<span class="num">' + Math.round(r.rate * 100) + '</span>%<small>' + r.doneT + '/' + r.targetDays + '</small>') + '</span>' +
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
      h += '<a role="listitem" class="pnode' + (s.members ? '' : ' empty') + '" href="#rank" data-act="pos-go" data-v="' + esc(pos.code) + '" style="left:' + xy[0] + '%;top:' + xy[1] + '%;--heat:' + heat.toFixed(2) + '" aria-label="' + esc(pos.name) + ' ' + s.members + '人 実施' + s.done + '回">' +
        jersey({ num: pos.code, kind: s.members ? 'heat' : 'ghost', cls: 'pj' }) +
        '<span class="pn-num">' + pos.numbers.join('・') + '</span>' +
        '<span class="pn-val">' + (s.members ? '<b class="num">' + (Math.round(per * 10) / 10) + '</b>回<small>' + s.members + '人</small>' : '<small>0人</small>') + '</span></a>';
    });
    h += '</div>';
    const none = ps[''];
    h += '<p class="note">ジャージが濃いほど、1人あたりの実施回数が多いポジションです。押すとそのポジションのランキングを開きます。' +
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
    h += '</ul><div class="share-row"><button class="btn small" data-act="award-img" data-from="' + p.from + '">' + icon('image') + '表彰カードを画像で保存</button>' +
      '<button class="btn small" data-act="award-copy" data-from="' + p.from + '">' + icon('copy') + 'LINE用の文章をコピー</button></div></section>';
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
  /** 表彰カード（1080×1350 の画像）。ユニホームの絵は index.html の #jk-back をそのまま使う */
  async function awardImage(from) {
    const x = monthAwards(from), a = x.a, g = goal();
    const W = 1080, H = 1350, back0 = document.getElementById('jk-back'), vb = back0.getAttribute('viewBox');
    // 画像にするときは CSS が効かないので、色を直接書く
    const back = { innerHTML: back0.innerHTML.replace(/var\(--jk-[a-z]+,\s*(#[0-9a-fA-F]+)\)/g, '$1').replace(/class="jk-line"/g, 'stroke="#000" stroke-opacity=".7" stroke-width=".6" stroke-linejoin="round"') };
    const crest = await fetch('crest.webp?v=1').then((r) => r.blob()).then((b) => new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); })).catch(() => '');
    const F = '-apple-system, BlinkMacSystemFont, &quot;Hiragino Sans&quot;, &quot;Noto Sans JP&quot;, &quot;Yu Gothic&quot;, Meiryo, sans-serif';
    const tx = (x0, y0, size, txt, opt) => '<text x="' + x0 + '" y="' + y0 + '" font-family="' + F + '" font-size="' + size + '" font-weight="' + ((opt && opt.w) || 700) + '" fill="' + ((opt && opt.c) || '#fff') + '" text-anchor="' + ((opt && opt.a) || 'middle') + '">' + esc(txt) + '</text>';
    const jersey1 = (cx, cy, w, num, nm) => {
      const s = w / 132.1;
      return '<g transform="translate(' + (cx - w / 2) + ',' + (cy - 106.2 * s / 2) + ') scale(' + s + ') translate(-0.6,-4)">' + back.innerHTML +
        '<text x="66.6" y="27" font-family="' + F + '" font-size="10" font-weight="500" fill="#fff" text-anchor="middle">' + esc(nm) + '</text>' +
        '<text x="66.6" y="64" font-family="' + F + '" font-size="38" font-weight="700" fill="#fff" text-anchor="middle">' + esc(num) + '<tspan font-size="16">回</tspan></text></g>';
    };
    let body = '';
    const mvp = a.mvp.slice(0, 3);
    if (mvp.length) {
      body += tx(W / 2, 370, 36, 'MVP', { c: '#ffd9df' });
      const w = mvp.length === 1 ? 420 : mvp.length === 2 ? 340 : 280, gap = w + 40;
      mvp.forEach((r, i) => {
        const cx = W / 2 + (i - (mvp.length - 1) / 2) * gap;
        body += jersey1(cx, 590, w, a.top, r.name.split(/\s+/)[0]) + tx(cx, 590 + w * 0.43 + 40, 34, r.name);
      });
    }
    let y = mvp.length ? 930 : 400;
    // 名前を1行22文字くらいで折り返す（4行まで。あふれたら「ほか○人」）
    const wrap = (names) => {
      const lines = []; let cur = '', used = 0;
      for (let i = 0; i < names.length; i++) {
        const add = (cur ? '・' : '') + names[i];
        if ((cur + add).length > 22 && cur) { lines.push(cur); cur = names[i]; if (lines.length === 4) { used = i; break; } }
        else cur += add;
        used = i + 1;
      }
      if (lines.length < 4 && cur) lines.push(cur);
      if (used < names.length) lines[lines.length - 1] += ' ほか' + (names.length - used) + '人';
      return lines;
    };
    const line = (k, names, sub) => {
      let o = tx(W / 2, y, 30, k, { c: '#ffd9df' });
      const ls = wrap(names);
      ls.forEach((t, i) => { o += tx(W / 2, y + 52 + i * 48, 38, t); });
      const yy = y + 52 + (ls.length - 1) * 48;
      o += sub ? tx(W / 2, yy + 42, 24, sub, { w: 500, c: '#f3c6cd' }) : '';
      y = yy + (sub ? 110 : 80); return o;
    };
    if (a.perfect.length) body += line('週' + g + '回 皆勤（' + a.perfect.length + '人）', a.perfect.map((r) => r.name), '終わった' + a.closed + '週すべて達成');
    if (a.up.length) body += line('いちばん伸びた', a.up.map((r) => r.name), '前の月より +' + a.best + '回');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
      '<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a0424"/><stop offset="1" stop-color="#4b0014"/></linearGradient>' +
      '<symbol id="jk-back" viewBox="' + vb + '">' + back.innerHTML + '</symbol></defs>' +
      '<rect width="' + W + '" height="' + H + '" fill="url(#bg)"/>' +
      '<g opacity=".18" fill="#c40225" transform="translate(-140,700) scale(14)"><use href="#jk-streaks"/></g>' +
      (crest ? '<image href="' + crest + '" x="' + (W / 2 - 60) + '" y="60" width="120" height="128"/>' : '') +
      tx(W / 2, 228, 30, 'KURFC 筋トレ', { w: 500, c: '#f3c6cd' }) +
      tx(W / 2, 290, 60, ymLabel(x.p.from) + 'の表彰' + (x.open ? '（途中）' : '')) +
      body +
      (y < H - 70 ? tx(W / 2, H - 44, 24, 'KURFC 筋トレ管理', { w: 500, c: '#f3c6cd' }) : '') + '</svg>';
    const streaks = document.getElementById('jk-streaks');
    const svgFull = svg.replace('</defs>', (streaks ? '<path id="jk-streaks" d="' + streaks.getAttribute('d') + '" fill-rule="evenodd"/>' : '') + '</defs>');
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgFull);
    await img.decode();
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    c.getContext('2d').drawImage(img, 0, 0);
    return new Promise((ok) => c.toBlob(ok, 'image/png'));
  }
  async function saveAwardImage(from) {
    const blob = await awardImage(from);
    const name = 'kintore-' + from.slice(0, 7) + '-award.png';
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: ymLabel(from) + 'の表彰' }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'saved';
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
  const STAMPS = [['clap', '👏', 'すごい'], ['fire', '🔥', '燃えてる'], ['muscle', '💪', 'ナイス筋トレ'], ['party', '🎉', 'おめでとう'], ['hundred', '💯', '完璧']];
  const stampOf = (t, e) => (S.stampMap && S.stampMap[t + '|' + e]) || { t: t, e: e, c: {}, f: [], mine: [] };
  function stampBar(target, event, opt) {
    const x = stampOf(target, event);
    const own = PREF.self && PREF.self === target;
    return '<div class="stamps' + (opt && opt.small ? ' small' : '') + '" data-t="' + esc(target) + '" data-e="' + esc(event) + '">' + STAMPS.map((k) => {
      const n = x.c[k[0]] || 0, on = x.mine.indexOf(k[0]) >= 0;
      return '<button class="stamp' + (on ? ' on' : '') + (n ? '' : ' zero') + '" data-act="stamp" data-k="' + k[0] + '" aria-pressed="' + on + '" aria-label="' + k[2] + (n ? ' ' + n : '') + '"' + (own ? ' disabled' : '') + '><span aria-hidden="true">' + k[1] + '</span>' + (n ? '<b class="num">' + n + '</b>' : '') + '</button>';
    }).join('') + '</div>';
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
    if (k[0] === 'b') { const b = L.badgeList(goal()).find((x) => x.key === k[1]); return '称号「' + (b ? b.name : k[1]) + '」'; }
    return '';
  }
  function fromNames(list) {
    const ids = [];
    list.forEach((x) => (x.f || []).forEach((id) => { if (ids.indexOf(id) < 0) ids.push(id); }));
    const names = ids.map(nameOf).filter(Boolean);
    return names.length ? names.slice(0, 3).join('、') + (names.length > 3 ? 'ほか' : '') + ' から' : '';
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
    return '<a class="selfcard" href="#member/' + m.id + '"><span class="self-j">' + jersey({ num: c, name: m.name.split(/\s+/)[0] }) + '</span>' +
      '<span class="self-t"><small>わたし</small><b>' + esc(m.name) + '</b><span class="self-s' + (nd.need && c >= nd.need ? ' ok' : '') + '">' + state + (streak ? '・' + streak + '週連続' : '') + '</span>' +
      (sum.total ? '<span class="self-c">' + fromNames(recent) + 'おめでとうが届いています ' + sum.html + '</span>' : '') + '</span>' + icon('next') + '</a>';
  }
  function pinchBlock() {
    const list = L.pinchList(S.data, S.idx, S.data.today, goal(), S.data.range.from);
    if (!list.length) return '';
    const g = goal();
    return '<section class="block pinch"><div class="block-h"><h2>連続記録がピンチ</h2><span class="count">' + list.length + '人</span></div>' +
      '<ul class="pinch-list">' + list.map((r) => '<li class="' + (r.slack <= 0 ? 'hot' : r.slack <= 1 ? 'warm' : '') + '"><a href="#member/' + r.id + '">' +
        '<span class="pinch-n">' + esc(r.name) + '<small>' + r.streak + '週連続中</small></span>' +
        '<span class="pinch-v">あと<b class="num">' + r.left + '</b>回<small>' + (r.slack < 0 ? '今週は届かない' : '残り' + r.daysLeft + '日') + '</small></span></a></li>').join('') + '</ul>' +
      '<p class="note">先週まで週' + g + '回を2週以上続けていて、今週まだ届いていない人です。声をかけて連続を守りましょう。</p></section>';
  }
  function feedBlock() {
    const ev = L.feedEvents(S.data, S.idx, S.data.today, goal(), S.data.life || {}, 10);
    if (!ev.length) return '';
    const FIRST = 6;
    const li = (e) => {
      const what = e.kind === 'goal' ? '週' + goal() + '回を達成' + (e.streak >= 2 ? '<em>' + e.streak + '週連続</em>' : '')
        : e.kind === 'total' ? '通算<em>' + e.n + '回</em>' : '初めての記録';
      return '<li class="feed-i' + (e.mark || e.kind !== 'goal' ? ' big' : '') + '"><div class="feed-h"><a href="#member/' + e.id + '"><b>' + esc(e.name) + '</b></a><span>' + what + '</span><time>' + mdw(e.date) + '</time></div>' + stampBar(e.id, e.key, { small: true }) + '</li>';
    };
    let h = '<section class="block feed"><div class="block-h"><h2>おめでとう</h2><span class="count">最近10日</span></div><ul class="feed-list">' + ev.slice(0, FIRST).map(li).join('') + '</ul>';
    if (ev.length > FIRST) h += '<details class="goal-more"><summary>ほか ' + (ev.length - FIRST) + '件を見る</summary><ul class="feed-list">' + ev.slice(FIRST).map(li).join('') + '</ul></details>';
    return h + '<p class="note">スタンプを押すと、その人に「おめでとう」が届きます（ログイン不要。同じスタンプはもう一度押すと取り消し）。' + (PREF.self ? '' : '<a href="#settings">設定</a>で自分の名前を選ぶと、だれから届いたかも伝わります。') + '</p></section>';
  }
  function pinReqBanner() {
    const list = can('admin') ? (S.data.pinRequests || []) : [];
    if (!list.length) return '';
    return '<a class="banner warn" href="#settings">' + icon('lock') + '<span>暗証番号の再発行の依頼が <b>' + list.length + '件</b>（' + list.map((x) => esc(x.name)).join('、') + '）</span>' + icon('next') + '</a>';
  }

  // ---------- ランキング ----------
  function vRank() {
    const d = S.data, p = curPeriod();
    const cur = L.periodStats(d, S.idx, p.from, p.to, d.today, filterOpt());
    const rk = L.rank(cur.rows, S.sort);
    let h = periodBar() + filterBar(S.group, S.position, 'f') +
      '<div class="fbar"><div class="seg small" role="group" aria-label="並び順">' +
      '<button data-act="sort" data-v="count" aria-pressed="' + (S.sort === 'count') + '">実施回数順</button>' +
      '<button data-act="sort" data-v="rate" aria-pressed="' + (S.sort === 'rate') + '">実施率順</button></div></div>';
    if (filterNote()) h += '<p class="fnote">' + esc(filterNote()) + '</p>';
    if (!rk.length) return h + '<p class="empty">表示できる部員がいません。</p>';
    const top = rk.filter((r) => r.rank !== null).slice(0, 3);
    h += '<section class="block">';
    if (top.length) h += podium(top);
    h += '<div class="rhead"><span>順位</span><span>名前</span><span>実施回数</span><span>実施率<small>実施/対象</small></span></div>' +
      '<ol class="rlist full">' + rk.map(rankRow).join('') + '</ol></section>';
    h += '<section class="rules"><h3>集計のルール</h3><ul>' +
      '<li><b>実施回数</b>：マネージャーが「実施した」と記録した日数。全員が同じ条件です。</li>' +
      '<li><b>実施率</b>：FWリーダーメニューに参加している人だけ。実施した対象日 ÷ 対象日。対象日に記録が無ければ、翌日から「実施していない」になります（今日の分は、実施したときだけ数えます）。</li>' +
      '<li>自主トレの人は実施率を出さず「－」。実施回数で比べます。</li>' +
      '<li>実施率が同じときは、実施回数の多い人が上です。</li>' +
      '<li>ポジションで絞ると、メインかサブがそのポジションの人が入ります。</li>' +
      '<li><b>週' + goal() + '回以上がマスト</b>：月曜〜日曜の週ごとに' + goal() + '回以上「実施した」で達成。週間ではその週の達成、月間では終わった週のうち達成した週の数を出します。</li>' +
      '<li>週は月曜〜日曜、月は1日〜月末（日本時間）。</li></ul></section>';
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
    let h = periodBar() + filterBar(S.group, S.position, 'f');
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
    if (PREF.self === m.id) h += '<p class="self-note">' + icon('check') + 'あなたのページです（設定で選んだ名前）</p>';
    h += '<div class="tiles">' +
      (wn.need === 0
        ? '<div class="tile"><div class="tile-k">今週</div><div class="tile-v"><span class="num">' + sw.done + '</span>回</div><div class="tile-s">今週は免除</div></div>'
        : '<div class="tile' + (wc >= wn.need ? ' t-ok' : '') + '"><div class="tile-k">今週</div><div class="tile-v"><span class="num">' + sw.done + '</span>回<small>/' + wn.need + '</small></div>' +
          '<div class="tile-s">' + (wc >= wn.need ? '週' + wn.need + '回 達成' : 'あと' + (wn.need - wc) + '回') + (wn.ex ? '（免除' + wn.ex + '日）' : '') + '</div></div>') +
      '<div class="tile"><div class="tile-k">今月</div><div class="tile-v"><span class="num">' + sm.done + '</span>回</div></div>' +
      '<div class="tile"><div class="tile-k">今月の実施率</div><div class="tile-v">' + (sm.rate === null ? '<span class="dash">－</span>' : '<span class="num">' + Math.round(sm.rate * 100) + '</span>%') + '</div>' +
      '<div class="tile-s">' + (sm.rate === null ? (m.mode === 'self' ? '自主トレは回数で見ます' : 'まだ対象日がありません') : sm.doneT + '/' + sm.targetDays + '日') + '</div></div>' +
      '<div class="tile"><div class="tile-k">週' + g + '回の連続達成</div><div class="tile-v"><span class="num">' + streak + '</span>週</div></div></div>';
    const pers = personalOf(m);
    h += cheerBlock(m) + bestsBlock(m, pers) + badgesBlock(m, pers) + bodyBlock(m);
    h += exemptBlock(m);
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
    h += '<section class="block"><div class="block-h"><h2>' + ymLabel(mo.from) + 'の履歴</h2></div>';
    if (!hist.length) h += '<p class="empty">この月の記録はありません。</p>';
    else h += '<ul class="hist">' + hist.reverse().map((x) =>
      '<li>' + cellHtml(x.st) + '<span class="hist-d">' + mdw(x.dt) + '</span>' +
      '<span class="hist-t">' + CELL[x.st][1] + (x.menus.length ? '<small>' + x.menus.map((w) => esc(w.title)).join('、') + '</small>' : '') + '</span>' +
      (x.r && x.r.by ? '<span class="hist-b">記録：' + esc(nameOf(x.r.by)) + '</span>' : '') + '</li>').join('') + '</ul>';
    return h + '</section>';
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
    h += '<ul class="badges">' + got.sort((a, b) => (p.earned[a.key] < p.earned[b.key] ? 1 : -1)).map((b) =>
      '<li class="badge on"><span class="badge-i" aria-hidden="true">' + icon('star') + '</span><b>' + esc(b.name) + '</b><small>' + mdw(p.earned[b.key]) + ' ' + p.earned[b.key].slice(0, 4) + '</small>' +
      stampBar(m.id, 'b:' + b.key, { small: true }) + '</li>').join('') +
      next.slice(0, 4).map((b) => '<li class="badge"><span class="badge-i" aria-hidden="true">' + icon('star') + '</span><b>' + esc(b.name) + '</b><small>' + esc(b.desc) + '</small></li>').join('') + '</ul>';
    if (!got.length) h += '<p class="note">「実施した」がつくと、最初の称号がもらえます。</p>';
    return h + '</section>';
  }
  function cheerBlock(m) {
    const list = cheersFor(m.id);
    if (!list.length) return '';
    const sum = stampSum(list);
    return '<section class="block"><div class="block-h"><h2>届いた応援</h2><span class="count">最近' + 60 + '日</span></div>' +
      '<p class="cheer-sum">' + sum.html + '</p><ul class="cheers">' + list.slice(0, 8).map((x) =>
        '<li><span class="cheer-e">' + esc(eventLabel(x.e)) + '<small>' + fromNames([x]) + '</small></span><span class="cheer-c">' + stampSum([x]).html + '</span></li>').join('') + '</ul></section>';
  }
  const BODY_K = [['weight', '体重', 'kg', 3], ['fat', '体脂肪率', '%', 4], ['muscle', '筋肉量', 'kg', 5]];
  function bodyOf(id) { return (S.data.body || []).filter((b) => b[1] === id).sort((a, b) => (a[2] < b[2] ? -1 : 1)); }
  function bodyChart(list, col, unit) {
    const pts = list.filter((b) => b[col] !== null);
    if (pts.length < 2) return '';
    const W = 320, H = 110, P = 26;
    const v = pts.map((b) => b[col]), lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
    const t0 = L.parse(pts[0][2]).getTime(), t1 = L.parse(pts[pts.length - 1][2]).getTime(), ts = t1 - t0 || 1;
    const xy = pts.map((b) => [P + (L.parse(b[2]).getTime() - t0) / ts * (W - P * 2), 12 + (1 - (b[col] - lo) / span) * (H - 34)]);
    return '<svg class="bchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(unit) + 'の変化">' +
      '<polyline points="' + xy.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '"/>' +
      xy.map((p, i) => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3"><title>' + md(pts[i][2]) + ' ' + pts[i][col] + unit + '</title></circle>').join('') +
      '<text x="' + P + '" y="' + (H - 4) + '">' + md(pts[0][2]) + '</text><text x="' + (W - P) + '" y="' + (H - 4) + '" text-anchor="end">' + md(pts[pts.length - 1][2]) + '</text>' +
      '<text x="2" y="14" class="ax">' + hi + '</text><text x="2" y="' + (H - 22) + '" class="ax">' + lo + '</text></svg>';
  }
  function bodyBlock(m) {
    const list = bodyOf(m.id), staff = can('body');
    if (!list.length && !staff) return '';
    let h = '<section class="block"><div class="block-h"><h2>体重・体組成</h2>' + (staff ? '<button class="btn small" data-act="body-new" data-id="' + m.id + '">' + icon('plus') + '入れる</button>' : '') + '</div>';
    if (!list.length) return h + '<p class="empty small">まだ記録がありません。測ったら入れてください（数値は部員みんなが見られます）。</p></section>';
    const last = list[list.length - 1];
    h += '<div class="bnow">' + BODY_K.map((k) => {
      const prev = list.slice(0, -1).reverse().find((b) => b[k[3]] !== null);
      const v = last[k[3]];
      if (v === null) return '';
      const d = prev ? Math.round((v - prev[k[3]]) * 10) / 10 : null;
      return '<div class="bv"><span class="best-k">' + k[1] + '</span><span class="best-v"><b class="num">' + v + '</b>' + k[2] + '</span>' +
        (d !== null ? '<small class="' + (d > 0 ? 'up' : d < 0 ? 'down' : '') + '">' + (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) + k[2] + '</small><small>' + md(prev[2]) + 'から</small>' : '') + '</div>';
    }).join('') + '</div><p class="note is-top">' + mdw(last[2]) + ' に測定</p>';
    h += bodyChart(list, 3, 'kg');
    h += '<details class="goal-more"><summary>これまでの記録（' + list.length + '回）</summary><ul class="blist">' + list.slice().reverse().map((b) =>
      '<li><span class="ex-d">' + b[2].replace(/-/g, '/') + '</span><span>' + BODY_K.map((k) => (b[k[3]] === null ? '' : k[1] + ' ' + b[k[3]] + k[2])).filter(Boolean).join('・') + (b[6] ? '<small>' + esc(b[6]) + '</small>' : '') + '</span>' +
      (staff ? '<button class="textbtn" data-act="body-del" data-id="' + esc(b[0]) + '">消す</button>' : '') + '</li>').join('') + '</ul></details>';
    return h + '</section>';
  }
  function bodyInputs(prefix, v) {
    return BODY_K.map((k) => '<label>' + k[1] + '<span class="opt">' + k[2] + '</span><input type="text" inputmode="decimal" name="' + prefix + k[0] + '" value="' + (v && v[k[3]] !== null && v[k[3]] !== undefined ? v[k[3]] : '') + '" autocomplete="off"></label>').join('');
  }
  function openBody(memberId) {
    const m = memberById(memberId);
    openSheet('体重・体組成（' + m.name + '）',
      '<form data-form="body1" class="form"><input type="hidden" name="memberId" value="' + esc(memberId) + '">' +
      '<label>測定日<input type="date" name="date" value="' + S.data.today + '" max="' + S.data.today + '" required></label>' +
      '<div class="three">' + bodyInputs('', null) + '</div>' +
      '<label>メモ<span class="opt">任意・スタッフだけに見える</span><input type="text" name="note" maxlength="100" placeholder="例：朝・練習前"></label>' +
      '<p class="hint">数値は部員みんなが見られます。同じ日にもう一度入れると上書きします。</p><p class="form-err" hidden></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">保存</button></div></form>');
  }
  function openBodyBulk() {
    const list = sortMembers(S.data.members.filter((m) => m.active && m.player));
    openSheet('体重・体組成をまとめて入れる',
      '<form data-form="bodybulk" class="form"><label>測定日<input type="date" name="date" value="' + S.data.today + '" max="' + S.data.today + '" required></label>' +
      '<p class="hint">測った人だけ入れてください（空の人は保存しません）。同じ日にもう一度入れると上書きします。数値は部員みんなが見られます。</p>' +
      '<div class="bulk bodyb"><div class="bulk-h"><span>名前</span><span>体重kg</span><span>体脂肪%</span><span>筋肉量kg</span></div>' +
      list.map((m) => '<div class="bulk-r" data-id="' + m.id + '"><span class="bulk-n"><b>' + esc(m.name) + '</b><small>' + esc(m.position || m.group || '') + '</small></span>' +
        BODY_K.map((k) => '<input type="text" inputmode="decimal" name="' + k[0] + '_' + m.id + '" aria-label="' + esc(m.name) + 'の' + k[1] + '" autocomplete="off">').join('') + '</div>').join('') +
      '</div><p class="form-err" hidden></p>' +
      '<div class="actions sticky"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">保存</button></div></form>', { wide: true });
  }
  /** 部員一覧の下：体組成の最新（みんなが見られる） */
  function bodyOverview() {
    const latest = {};
    (S.data.body || []).forEach((b) => { if (!latest[b[1]] || latest[b[1]][2] < b[2]) latest[b[1]] = b; });
    const list = sortMembers(S.data.members.filter((m) => m.active && m.player && latest[m.id]));
    if (!list.length && !can('body')) return '';
    let h = can('body') ? '<div class="toolbar"><button class="btn" data-act="body-bulk">' + icon('scale') + '体重・体組成をまとめて入れる</button></div>' : '';
    h += '<details class="block gone-box"' + (list.length ? '' : ' open') + '><summary><h2>体重・体組成（最新）</h2><span class="count">' + list.length + '人</span></summary>';
    if (!list.length) return h + '<p class="empty small">まだ記録がありません。</p></details>';
    h += '<table class="btable"><thead><tr><th>名前</th><th>体重</th><th>体脂肪</th><th>筋肉量</th><th>測定日</th></tr></thead><tbody>' + list.map((m) => {
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
    if (!list.length) return h + '<p class="empty">' + (S.menuTab === 'upcoming' ? '今日からのメニューはまだ登録されていません。' : 'これまでのメニューはありません。') + '</p>';
    let last = '';
    list.forEach((w) => {
      if (w.date !== last) {
        if (last) h += '</ul>';
        h += '<h2 class="dayhead' + (w.date === today ? ' today' : '') + '">' + mdw(w.date) + (w.date === today ? '<span>今日</span>' : '') + '</h2><ul class="menus">';
        last = w.date;
      }
      h += '<li><button class="menu-card g-' + w.group + '" data-act="menu-open" data-id="' + w.id + '">' +
        '<span class="menu-top">' + targetChip(w) + '<b>' + esc(w.title) + '</b>' + (w.video ? '<span class="vtag" title="動画あり">' + icon('play') + '</span>' : '') + '</span>' +
        '<span class="menu-body">' + esc(w.content.split('\n').slice(0, 3).join(' / ')) + '</span>' +
        '<span class="menu-foot">対象 ' + w.targets.length + '人' + (w.templateId ? '<small>繰り返し</small>' : '') + '</span></button></li>';
    });
    return h + '</ul><p class="note">メニューの対象は、FWリーダーメニューに参加している人だけです。ポジションを指定したメニューは、メインかサブがそのポジションの人が対象です。</p>';
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
    if (!list.length) return h + '<p class="empty">まだ型がありません。メニューの「型にする」からも作れます。</p>';
    return h + '<ul class="menus">' + list.map((t) => {
      const next = d.menus.filter((w) => w.templateId === t.id && w.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
      return '<li><button class="menu-card g-' + t.group + '" data-act="tpl-open" data-id="' + t.id + '"><span class="menu-top">' + targetChip(t) + '<b>' + esc(t.title) + '</b>' + (t.video ? '<span class="vtag">' + icon('play') + '</span>' : '') + '</span>' +
        '<span class="menu-body">' + esc(t.content.split('\n').slice(0, 3).join(' / ')) + '</span>' +
        '<span class="menu-foot">' + (t.repeat.length ? repeatLabel(t) + (next ? '・次は ' + mdw(next.date) : '') + (t.repeatTo ? '・' + md(t.repeatTo) + 'まで' : '') : '繰り返しなし') + '</span></button></li>';
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
    for (let i = 0; i < 42; i++) {
      const d = L.addDays(start, i);
      const past = d < today, same = d === w.date;
      cal += past ? '<span class="mday blank"></span>' : '<label class="cday' + (same ? ' src' : '') + '"><input type="checkbox" name="dates" value="' + d + '"' + (same ? ' disabled' : '') + '><span><b>' + +d.slice(8, 10) + '</b>' + (d.slice(8, 10) === '01' || i === 0 || (i === L.dow(today) - 1) ? '<small>' + +d.slice(5, 7) + '月</small>' : '') + '</span></label>';
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
    h += filterBar(S.rec.group, S.rec.position, 'r') +
      '<div class="fbar"><div class="seg small" role="group" aria-label="並び順">' + REC_SORTS.map((x) => '<button data-act="rec-sort" data-v="' + x[0] + '" aria-pressed="' + (S.recSort === x[0]) + '">' + x[1] + '</button>').join('') + '</div></div>' +
      '<div class="toolbar"><button class="btn small" data-act="rec-all">表示中の全員を「実施した」に</button><button class="btn small" data-act="trash-open">' + icon('trash') + '取り消した記録</button></div>';
    if (!rows.length) return h + '<p class="empty">この日に記録できる部員がいません。</p>';
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
    h += '<section class="block"><div class="block-h"><h2>ログイン</h2></div>';
    if (m) h += '<p class="acct"><b>' + esc(m.name) + '</b><span class="chip role">' + PERM[m.perm] + '</span></p>' +
      '<div class="toolbar"><button class="btn" data-act="pin-change">暗証番号を変更</button><button class="btn" data-act="sessions-open">ログインしている端末</button><button class="btn" data-act="logout">ログアウト</button></div>';
    else h += '<p class="lead-line small">見るだけならログインは不要です。記録やメニューを入力する管理者・マネージャー・FWリーダーだけログインしてください。</p>' +
      '<div class="toolbar"><button class="btn primary" data-act="login">ログイン</button></div>';
    h += '</section>';
    const players = sortMembers(S.data.members.filter((x) => x.active && x.player));
    h += '<section class="block"><div class="block-h"><h2>見やすさ・自分の名前</h2><span class="count">この端末だけ</span></div>' +
      '<div class="prefrow"><span>画面の明るさ</span><div class="seg small" role="group" aria-label="画面の明るさ">' +
      [['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク']].map((x) => '<button data-act="pref-theme" data-v="' + x[0] + '" aria-pressed="' + (PREF.theme === x[0]) + '">' + x[1] + '</button>').join('') + '</div></div>' +
      '<div class="prefrow"><span>文字の大きさ</span><div class="seg small" role="group" aria-label="文字の大きさ">' +
      SIZES.map((x) => '<button data-act="pref-size" data-v="' + x[0] + '" aria-pressed="' + (PREF.size === x[0]) + '">' + x[1] + '</button>').join('') + '</div></div>' +
      '<label class="prefrow form"><span>自分の名前<small>ホームに自分の状況と、届いた「おめでとう」が出ます。応援を送るときの名前にもなります</small></span>' +
      '<select data-act-change="pref-self"><option value="">選ばない</option>' + players.map((x) => '<option value="' + x.id + '"' + (PREF.self === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></label>' +
      '<div class="toolbar"><button class="btn small" data-act="guide">使い方ガイドをもう一度見る</button></div></section>';
    if (can('admin')) {
      h += '<section class="block"><div class="block-h"><h2>管理者メニュー</h2></div><ul class="links">' +
        '<li><a href="#members">部員の追加・編集・権限<small>ポジション・取り組み方の設定は「まとめて編集」が便利です</small></a></li>' +
        '<li><button data-act="perms-open">役職をまとめて付け替え<small>新年度のFWリーダー・マネージャーの交代。新しい人の暗証番号もまとめて発行します</small></button></li>' +
        '<li><button data-act="trash-open">取り消した記録<small>まちがえて取り消した「実施した」を戻せます</small></button></li>' +
        '<li><a href="#logs">操作履歴<small>だれが・いつ・何を変えたか</small></a></li>' +
        '<li><button data-act="goal-open">週の目標回数（マスト）<small>いまは週' + goal() + '回以上</small></button></li>' +
        '<li><button data-act="offs-open">部全体のオフ期間<small>試験期間・合宿など、全員の目標をなしにする期間</small></button></li>' +
        '<li><button data-act="viewlock">閲覧の合言葉<small>' + (S.data.viewLock ? '設定中：合言葉を知っている人だけ見られます' : '未設定：URLを知っていれば誰でも見られます') + '</small></button></li>' +
        '</ul></section>';
    }
    h += '<section class="rules"><h3>このアプリの見かた</h3><ul>' +
      '<li>マネージャーが Setlog などを確認して、筋トレをした人に「実施した」を付けます。</li>' +
      '<li>取り組み方は2つ。<b>メニュー参加</b>（FWリーダーのメニューに沿う）と<b>自主トレ</b>（自分で決める）。どちらも実施記録の対象です。</li>' +
      '<li>メニューの対象日に「実施した」が無ければ、翌日から<b>実施していない</b>（×）になります。メニューが無い日・自主トレの人は×になりません。</li>' +
      '<li><b>週' + goal() + '回以上の筋トレがマスト</b>です（月曜〜日曜）。ホームで「まだの人」、ランキングで達成・未達が分かります。怪我・病気などの<b>免除</b>や部全体の<b>オフ期間</b>の日は、その日数に応じて必要な回数が減ります。</li>' +
      '<li><b>実施率</b>はメニュー参加の人だけ。実施した対象日 ÷ 対象日。自主トレの人は実施回数で見ます。</li>' +
      '<li>名前を押すと、その人の<b>自己ベスト・称号・体組成</b>が見られます。友達の達成には<b>応援スタンプ</b>で「おめでとう」を送れます。</li>' +
      '<li>部員名簿は会計アプリと共通です。進級や入部・退部は、どちらで直しても両方に反映されます。</li></ul></section>';
    h += '<div class="toolbar"><button class="btn" data-act="reload">最新の情報に更新</button></div>' +
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

  // ---------- はじめて開いた人への使い方ガイド（30秒） ----------
  const GUIDE = [
    ['KURFC 筋トレへようこそ', '部員みんなの筋トレの記録を見るアプリです。<b>見るだけならログインは不要</b>。30秒で使い方を紹介します。', 'home'],
    ['週' + '{g}' + '回がマスト', 'ホームの赤い板が部全体の回数。月曜〜日曜に<b>週{g}回以上</b>筋トレすれば達成です。「まだの人」「連続がピンチの人」もホームで分かります。', 'check'],
    ['ランキングと自分の記録', 'ランキングやカレンダーの名前を押すと、その人の記録・<b>自己ベスト・称号</b>・体重の変化が見られます。', 'rank'],
    ['友達に「おめでとう」', 'ホームの「おめでとう」で、達成した友達に<b>応援スタンプ</b>を送れます。下で自分の名前を選ぶと、自分あての応援がホームに出ます。', 'star'],
    ['見やすく使う', '設定で<b>文字の大きさ</b>と<b>ダークモード</b>を変えられます。マネージャー・FWリーダーは設定からログインして記録やメニューを入れます。', 'gear']
  ];
  let guideStep = 0;
  function openGuide(step) {
    guideStep = step || 0;
    const g = GUIDE[guideStep], last = guideStep === GUIDE.length - 1;
    const players = S.data && S.data.members ? sortMembers(S.data.members.filter((x) => x.active && x.player)) : [];
    $('#guide-root').innerHTML = '<div class="guide-bg"></div><section class="guide" role="dialog" aria-modal="true" aria-label="使い方ガイド">' +
      '<div class="guide-i" aria-hidden="true">' + icon(g[2]) + '</div><h2>' + esc(g[0].replace('{g}', goal())) + '</h2><p>' + g[1].replace(/\{g\}/g, goal()) + '</p>' +
      (guideStep === 3 && players.length ? '<label class="guide-self">自分の名前<span>（あとで設定で変えられます）</span><select data-act-change="pref-self"><option value="">選ばない</option>' + players.map((x) => '<option value="' + x.id + '"' + (PREF.self === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></label>' : '') +
      (guideStep === 4 ? '<div class="guide-prefs"><div class="seg small" role="group" aria-label="文字の大きさ">' + SIZES.map((x) => '<button data-act="pref-size" data-v="' + x[0] + '" aria-pressed="' + (PREF.size === x[0]) + '">' + x[1] + '</button>').join('') + '</div>' +
        '<div class="seg small" role="group" aria-label="画面の明るさ">' + [['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク']].map((x) => '<button data-act="pref-theme" data-v="' + x[0] + '" aria-pressed="' + (PREF.theme === x[0]) + '">' + x[1] + '</button>').join('') + '</div></div>' : '') +
      '<div class="guide-dots" aria-hidden="true">' + GUIDE.map((x, i) => '<i class="' + (i === guideStep ? 'on' : '') + '"></i>').join('') + '</div>' +
      '<div class="actions"><button class="btn" data-act="guide-close">' + (last ? '閉じる' : 'スキップ') + '</button><button class="btn primary" data-act="' + (last ? 'guide-close' : 'guide-next') + '" autofocus>' + (last ? 'はじめる' : '次へ') + '</button></div>' +
      '<p class="guide-n">' + (guideStep + 1) + ' / ' + GUIDE.length + '</p></section>';
    document.body.classList.add('sheet-open');
    const b = $('#guide-root [autofocus]'); if (b) b.focus();
  }
  function closeGuide() { $('#guide-root').innerHTML = ''; store.set('guided', 1); if (!$('#sheet-root').innerHTML) document.body.classList.remove('sheet-open'); if (S.data && !S.data.locked) render(); }

  function vLogs() {
    if (!can('admin')) return '<p class="empty">操作履歴を見られるのは管理者だけです。</p>';
    let h = '<div class="sub-h"><a class="ibtn" href="#settings" aria-label="戻る">' + icon('back') + '</a><h1>操作履歴</h1></div>';
    if (!S.logs) { loadLogs(0); return h + '<p class="empty">読み込み中…</p>'; }
    if (!S.logs.list.length) return h + '<p class="empty">まだ履歴がありません。</p>';
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
  const TITLE = { home: 'ホーム', rank: 'ランキング', record: '実施記録', cal: 'カレンダー', menus: 'メニュー', members: '部員', member: '部員', settings: '設定', logs: '操作履歴', archive: 'これまでのメニュー' };
  function shell(inner) {
    const r = S.route.name, m = me();
    const navOn = r === 'member' ? 'members' : r === 'logs' ? 'settings' : r === 'archive' ? 'menus' : r;
    const items = NAV.filter((n) => n[0] !== 'record' || can('record'));
    return '<header class="top"><a class="brand" href="#home" aria-label="ホーム"><img class="mark" src="crest.webp?v=1" alt="" width="30" height="32"><span class="brand-t"><b>KURFC</b>筋トレ</span></a>' +
      '<span class="top-title">' + (TITLE[r] || '') + '</span>' +
      '<a class="top-acct' + (navOn === 'settings' ? ' on' : '') + '" href="#settings" aria-label="設定">' + (m ? '<span class="who">' + PERM[m.perm] + '</span>' : '') + icon('gear') + '</a></header>' +
      '<div class="hoops" aria-hidden="true"></div>' +
      '<nav class="nav n' + items.length + '" aria-label="メニュー">' + items.map((n) =>
        '<a href="#' + n[0] + '" class="' + (navOn === n[0] ? 'on' : '') + (n[0] === 'record' ? ' rec' : '') + '"' + (navOn === n[0] ? ' aria-current="page"' : '') + '>' + icon(n[2]) + '<span>' + n[1] + '</span></a>').join('') +
      '<a href="#settings" class="nav-set ' + (navOn === 'settings' ? 'on' : '') + '">' + icon('gear') + '<span>設定</span></a></nav>' +
      '<main class="main view-' + r + '" id="main">' +
      (S.loadError ? '<div class="banner err">' + esc(S.loadError) + '<button class="btn small" data-act="reload">再読み込み</button></div>' : '') +
      inner + '</main>';
  }
  function countUp() {
    if (S.counted || reduceMotion()) { S.counted = true; return; }
    const el = $('.board-v .num[data-count]');
    if (!el) return;
    S.counted = true;
    const to = +el.dataset.count;
    if (!to) return;
    const t0 = performance.now(), dur = 700;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  }
  function render() {
    const app = $('#app');
    if (!S.data) {
      app.innerHTML = '<div class="boot"><div class="boot-mark" aria-hidden="true">' + jersey({ num: '', front: true }) + '</div><p>' + (S.loadError ? esc(S.loadError) : '読み込み中…') + '</p>' +
        (S.loadError ? '<button class="btn primary" data-act="reload">もう一度読み込む</button>' : '') + '</div>';
      return;
    }
    if (S.data.locked) { app.innerHTML = lockedView(); return; }
    const r = S.route;
    const fn = { home: vHome, rank: vRank, cal: vCal, menus: vMenus, members: vMembers, record: vRecord, settings: vSettings, logs: vLogs, archive: vArchive };
    app.innerHTML = shell(r.name === 'member' ? vMember(r.arg) : (fn[r.name] || vHome)());
    document.title = (TITLE[r.name] ? TITLE[r.name] + '｜' : '') + 'KURFC 筋トレ';
    if (r.name === 'home') countUp();
    if (r.name === 'home' || r.name === 'rank' || r.name === 'cal') {
      const p = curPeriod(), pv = L.prevPeriod(S.kind, p.from);
      ensureRange(r.name === 'home' ? pv.from : p.from, p.to > S.data.today ? S.data.today : p.to);
    } else if (r.name === 'member' && S.memberMonth) ensureRange(S.memberMonth, S.memberMonth);
    if (r.name === 'member' && memberById(r.arg) && memberById(r.arg).player) loadHistory(r.arg);
    else if (r.name === 'record' && S.rec.date) ensureRange(S.rec.date, S.rec.date);
    if (me() && me().mustChange && !$('#sheet-root form[data-form="pin"]')) openPinChange(true, pendingOldPin);
    const wrap = $('.matrix-wrap'), th = wrap && $('thead th.today', wrap);
    if (th) wrap.scrollLeft = Math.max(0, th.offsetLeft - wrap.clientWidth + th.offsetWidth + 48);
    const chips = $('.poschips [aria-pressed="true"]');
    if (chips) chips.scrollIntoView({ block: 'nearest', inline: 'center' });
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
  function onHash() {
    const next = parseHash();
    if (S.route.name === 'record' && next.name !== 'record' && !recLeaveOk()) { history.replaceState(null, '', '#record'); return; }
    if (next.name === 'record' && next.arg && L.isDate(next.arg)) { S.rec.date = next.arg; S.rec.edits = {}; }
    if (next.name === 'member' && S.route.arg !== next.arg) S.memberMonth = null;
    if (next.name !== 'logs') S.logs = null;
    if (next.name !== 'archive') S.archive = null;
    S.route = next;
    closeSheet();
    render();
    if (prevHash.split('/')[0] !== location.hash.split('/')[0]) window.scrollTo(0, 0);
    prevHash = location.hash;
  }

  // ---------- 操作 ----------
  let pendingOldPin = '';
  const setFilter = (key) => (el) => {
    const v = el.dataset.v;
    if (key === 'group') { S.group = v; S.position = ''; }
    else S.position = S.position === v ? '' : v;
    render();
  };
  const acts = {
    'sheet-close': () => { if (!sheetLocked) closeSheet(); },
    'sheet-bg': () => { if (!sheetLocked) closeSheet(); },
    'go-back': (el, ev) => { if (history.length > 1 && prevHash) { ev.preventDefault(); history.back(); } },
    kind: (el) => { S.kind = el.dataset.v; store.set('kind', S.kind); render(); },
    period: (el) => {
      const p = curPeriod();
      const n = +el.dataset.v < 0 ? L.prevPeriod(S.kind, p.from) : L.nextPeriod(S.kind, p.from);
      if (n.from > S.data.today) return;
      S.anchor = n.from; render();
    },
    'f-group': setFilter('group'),
    'f-pos': setFilter('pos'),
    'pos-go': (el, ev) => { ev.preventDefault(); S.position = el.dataset.v; S.group = 'ALL'; location.hash = '#rank'; },
    sort: (el) => { S.sort = el.dataset.v; render(); },
    'menu-tab': (el) => { S.menuTab = el.dataset.v; render(); },
    'menu-group': (el) => { S.menuGroup = el.dataset.v; render(); },
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
      S.memberMonth = n; render();
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
    'award-img': async (el) => {
      el.disabled = true;
      try { const r = await saveAwardImage(el.dataset.from); if (r === 'saved') toast('画像を保存しました'); }
      catch (e) { toast('画像を作れませんでした', 'err'); }
      finally { el.disabled = false; }
    },
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
    'guide-next': () => openGuide(guideStep + 1),
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
          S.data.records = S.data.records.filter((x) => x[1] !== r.date).concat(r.records);
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
    },
    'rec-del': async (el) => {
      const m = memberById(el.dataset.id), date = S.rec.date;
      if (!m || !confirm(m.name + ' さんの ' + mdw(date) + ' の「実施した」を取り消しますか？')) return;
      await busy(el, async () => {
        try {
          const r = await api('deleteRecord', { memberId: m.id, date: date });
          S.data.records = S.data.records.filter((x) => x[1] !== date).concat(r.records);
          setData(S.data); S.hist = {}; render(); toast('取り消しました');
        } catch (e) { toast(e.message, 'err'); }
      });
    },
    'rec-all': () => {
      let n = 0;
      recRows().forEach((r) => { if (!r.locked && recVisible(r) && !recCur(r)) { S.rec.edits[r.m.id] = true; if (r.saved) delete S.rec.edits[r.m.id]; n++; } });
      if (!n) { toast('全員「実施した」になっています'); return; }
      render(); toast(n + '人を「実施した」にしました。やっていない人は押して外してください');
    },
    'r-group': (el) => { S.rec.group = el.dataset.v; S.rec.position = ''; render(); },
    'r-pos': (el) => { S.rec.position = S.rec.position === el.dataset.v ? '' : el.dataset.v; render(); },
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
          const r = await api('saveRecords', { date: date, items: items });
          S.data.records = S.data.records.filter((x) => x[1] !== date).concat(r.records);
          setData(S.data); S.hist = {};
          S.rec.edits = {};
          closeSheet(); render();
          if (r.rejected.length) toast('保存できなかった記録があります：' + r.rejected.map((x) => (x.name || '') + '（' + x.message + '）').join('、'), 'err');
          else toast('保存しました（実施 ' + r.saved + '人' + (r.removed ? '・取り消し ' + r.removed + '人' : '') + '）');
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
    template: async (f, btn) => {
      const v = menuFormValues(f);
      const t = { id: f.id ? f.id.value : '', group: v.group, positions: v.poss, title: f.title.value, content: f.content.value, detail: f.detail.value, note: f.note.value, video: f.video.value.trim(),
        repeat: $$('input[name="repeat"]:checked', f).map((x) => +x.value), repeatFrom: f.repeatFrom.value, repeatTo: f.repeatTo.value };
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
    body1: async (f, btn) => {
      const row = { memberId: f.memberId.value, date: f.date.value, weight: f.weight.value, fat: f.fat.value, muscle: f.muscle.value, note: f.note.value };
      await busy(btn, async () => {
        try { const r = await api('saveBody', { rows: [row] }); S.data.body = r.body; closeSheet(); render(); toast('保存しました'); }
        catch (e) { sheetError(e.message); }
      });
    },
    bodybulk: async (f, btn) => {
      const rows = [];
      $$('.bulk-r', f).forEach((el) => {
        const id = el.dataset.id, v = {};
        ['weight', 'fat', 'muscle'].forEach((k) => { v[k] = f[k + '_' + id].value.trim(); });
        if (v.weight || v.fat || v.muscle) rows.push(Object.assign({ memberId: id, date: f.date.value }, v));
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
      archTimer = setTimeout(() => { S.archive.q = t.value; render(); const el = $('.search'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 250);
    }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && $('#guide-root').innerHTML) { closeGuide(); return; }
    if (ev.key === 'Escape' && !sheetLocked && $('#sheet-root').innerHTML) closeSheet();
  });
  window.addEventListener('hashchange', onHash);
  window.addEventListener('beforeunload', (ev) => {
    if (S.route.name === 'record' && S.idx && can('record') && recDirty()) { ev.preventDefault(); ev.returnValue = ''; }
  });
  document.addEventListener('visibilitychange', async () => {
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
    const cached = store.get('state2', null);
    if (cached && cached.members && cached.today === L.todayJST()) {
      cached.me = null; // 権限は必ずサーバーに確かめる
      S.data = cached; S.idx = L.buildIndex(cached);
    }
    render();
    await loadState({});
    render();
    if (S.data && !S.data.locked && !store.get('guided', 0)) openGuide(0);
  })();
})();

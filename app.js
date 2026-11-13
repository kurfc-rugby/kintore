/* KURFC 筋トレ管理アプリ — 画面 v2（ジャージ・背番号） */
(function () {
  'use strict';
  const L = window.KLogic;
  const API = window.KINTORE_API;
  const VERSION = '2.1.0';
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

  const ICON = {
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
      (!front && num ? '<text x="66.6" y="' + (opt.name ? 64 : 60) + '" class="jn-num" text-anchor="middle" font-size="' + fs + '">' + esc(num) + '</text>' : '') +
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
    memberMonth: null, logs: null, route: { name: 'home', arg: '' }, counted: false
  };
  const me = () => (S.data && S.data.me) || null;
  const can = (what) => {
    const m = me();
    if (!m) return false;
    if (what === 'record') return m.perm === 'admin' || m.perm === 'manager';
    if (what === 'menu') return m.perm === 'admin' || m.perm === 'leader';
    if (what === 'admin') return m.perm === 'admin';
    return false;
  };
  const positions = () => (S.data && S.data.positions && S.data.positions.length ? S.data.positions : FALLBACK_POS);
  const posOf = (code) => positions().find((p) => p.code === code) || null;
  const memberById = (id) => (S.data.members || []).find((m) => m.id === id) || null;
  const nameOf = (id) => { const m = memberById(id); return m ? m.name : ''; };
  const posLabel = (m) => (m.position ? m.position + (m.subs && m.subs.length ? '<small>/' + m.subs.map(esc).join('/') + '</small>' : '') : (m.group || '－'));
  const posText = (m) => (m.position ? m.position + (m.subs && m.subs.length ? '/' + m.subs.join('/') : '') : (m.group || '未設定'));

  // ---------- 通信 ----------
  async function api(op, payload) {
    const body = Object.assign({ op: op }, payload || {});
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
  function filterOpt() { return { group: S.position ? 'ALL' : S.group, position: S.position }; }
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
    const cur = L.periodStats(d, S.idx, p.from, p.to, today);
    const pre = L.periodStats(d, S.idx, pv.from, pv.to, today);
    const rk = L.rank(cur.rows, 'count');
    const ranked = rk.filter((r) => r.rank !== null);
    const isNow = today >= p.from && today <= p.to;
    const prevWord = S.kind === 'week' ? '前の週' : '前の月';
    const t = cur.team;
    let h = periodBar();
    h += '<section class="board" aria-label="部全体の状況"><svg class="board-streaks" viewBox="25 40 85 66" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><use href="#jk-streaks"/></svg>' +
      '<div class="board-main"><div class="board-k">部全体の実施回数</div>' +
      '<div class="board-v"><span class="num" data-count="' + t.done + '">' + t.done + '</span><span class="unit">回</span></div>' +
      '<div class="board-s">' + prevWord + ' ' + pre.team.done + '回 ' + delta(t.done, pre.team.done, '回') + '</div></div>' +
      '<div class="board-side">' +
      '<div class="board-cell"><div class="board-k">メニュー参加者の実施率</div><div class="board-v2"><span class="num">' + (t.rate === null ? '－' : Math.round(t.rate * 100)) + '</span>' + (t.rate === null ? '' : '<span class="unit">%</span>') + '</div>' +
      '<div class="board-s">' + (t.rate === null ? 'まだ対象日がありません' : t.doneT + '/' + t.targetDays + '日') +
      (t.rate !== null && pre.team.rate !== null ? ' ' + delta(Math.round(t.rate * 100), Math.round(pre.team.rate * 100), 'pt') : '') + '</div></div>' +
      '<div class="board-cell"><div class="board-k">実施した部員</div><div class="board-v2"><span class="num">' + t.active + '</span><span class="unit">/' + t.members + '人</span></div>' +
      '<div class="meter" role="img" aria-label="' + (t.members ? Math.round(t.active / t.members * 100) : 0) + '%"><i style="width:' + (t.members ? Math.round(t.active / t.members * 100) : 0) + '%"></i></div>' +
      '<div class="board-s">1回以上「実施した」の人</div></div>' +
      '</div></section>';
    if (isNow) h += todayCard();
    h += '<section class="block"><div class="block-h"><h2>ランキング</h2><a class="more" href="#rank">すべて見る</a></div>';
    if (!ranked.length) h += '<p class="empty">この期間の実施記録はまだありません。' + (can('record') ? '<br><a href="#record">記録をつける</a>' : '') + '</p>';
    else {
      h += podium(ranked.slice(0, 3));
      const rest = ranked.slice(3, 8);
      if (rest.length) h += '<ol class="rlist">' + rest.map(rankRow).join('') + '</ol>';
    }
    h += '</section>';
    h += formationBlock(p);
    if (S.kind === 'month') h += continuityBlock(cur.rows, p);
    return h;
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
      jersey({ num: r.rank, name: r.name.split(/\s+/)[0] }) +
      '<span class="pod-name">' + esc(r.name) + '</span>' +
      '<span class="pod-val"><span class="num">' + r.done + '</span>回' + (r.rate !== null ? '<small>' + Math.round(r.rate * 100) + '%</small>' : '') + '</span>' +
      '</a></li>').join('') + '</ol>';
  }
  function rankRow(r) {
    return '<li class="rrank' + (r.rank && r.rank <= 3 ? ' is-top' : '') + '"><a href="#member/' + r.id + '">' +
      '<span class="rk">' + (r.rank === null ? '－' : r.rank) + '</span>' +
      '<span class="rname"><b>' + esc(r.name) + '</b><small><span class="pos-tag g-' + (r.group || 'X') + '">' + posLabel(r) + '</span>' + (r.grade ? esc(r.grade) + '・' : '') + MODE[r.mode] + '</small></span>' +
      '<span class="rcount"><span class="num">' + r.done + '</span>回</span>' +
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

  function continuityBlock(rows, p) {
    const d = S.data;
    const list = rows.map((r) => Object.assign({ c: L.continuity(S.idx, memberById(r.id), p.from, p.to, d.today) }, r)).filter((r) => r.c.weeks > 0);
    if (!list.length) return '';
    list.sort((a, b) => (b.c.hit - a.c.hit) || (b.done - a.done) || (a.name < b.name ? -1 : 1));
    const every = list.filter((r) => r.c.every);
    let h = '<section class="block"><div class="block-h"><h2>継続状況</h2></div>' +
      '<p class="lead-line"><span class="num">' + every.length + '</span>人が、ここまでの' + list[0].c.weeks + '週すべてで実施しています。</p><ul class="cont">';
    list.forEach((r) => {
      h += '<li><a href="#member/' + r.id + '"><span class="cont-n">' + esc(r.name) + '</span>' +
        '<span class="cont-w" role="img" aria-label="' + r.c.weeks + '週のうち' + r.c.hit + '週で実施">' + r.c.marks.map((m) => '<i class="' + (m ? 'on' : '') + '"></i>').join('') + '</span>' +
        '<span class="cont-v">' + r.c.hit + '/' + r.c.weeks + '週</span></a></li>';
    });
    return h + '</ul><p class="note">月曜始まりの週ごとに、1回でも「実施した」があれば ■ になります。</p></section>';
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
      '<li>週は月曜〜日曜、月は1日〜月末（日本時間）。</li></ul></section>';
    return h;
  }

  // ---------- カレンダー ----------
  const CELL = {
    done: ['○', '実施した'], not: ['×', '実施していない'], today: ['・', '今日の対象（記録待ち）'],
    planned: ['・', '予定'], none: ['', '予定なし'], out: ['', '在籍期間外']
  };
  function cellHtml(state) {
    const c = CELL[state];
    return '<span class="cell s-' + state + '" title="' + c[1] + '"><span aria-hidden="true">' + c[0] + '</span><span class="sr">' + c[1] + '</span></span>';
  }
  function legend() {
    return '<ul class="legend">' + ['done', 'not', 'today', 'planned', 'none'].map((k) => '<li>' + cellHtml(k) + CELL[k][1] + '</li>').join('') + '</ul>';
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
        '<button class="btn" data-act="member-import">一覧を貼り付け</button></div>' +
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
    const streak = m.player ? L.streakWeeks(S.idx, m, today, d.range.from) : 0;
    const pos = posOf(m.position);
    let h = '<div class="profile"><a class="ibtn back" href="#members" data-act="go-back" aria-label="戻る">' + icon('back') + '</a>' +
      '<div class="profile-j">' + jersey({ num: pos ? pos.numbers[0] : '', name: m.name.split(/\s+/)[0] }) + '</div>' +
      '<div class="profile-t"><h1>' + esc(m.name) + '</h1>' +
      '<p class="profile-pos">' + (m.player ? (pos ? '<b>' + esc(pos.code) + '</b>' + esc(pos.name) : '<b>' + esc(m.group || '－') + '</b>ポジション未設定') + (m.subs && m.subs.length ? '<span>サブ ' + m.subs.map(esc).join('・') + '</span>' : '') : '<b>' + esc(m.clubRole) + '</b>') + '</p>' +
      '<div class="chips">' + (m.grade ? '<span class="chip">' + esc(m.grade) + '</span>' : '') + (m.player ? '<span class="chip mode-' + m.mode + '">' + MODE[m.mode] + '</span>' : '') +
      (m.perm !== 'member' ? '<span class="chip role">' + PERM[m.perm] + '</span>' : '') + (!m.active ? '<span class="chip">在籍なし</span>' : '') + '</div></div>' +
      (can('admin') ? '<button class="btn small" data-act="member-edit" data-id="' + m.id + '">編集</button>' : '') + '</div>';
    if (!m.player) return h + '<p class="empty">選手ではないため、筋トレの記録はありません。</p>';
    h += '<div class="tiles">' +
      '<div class="tile"><div class="tile-k">今週</div><div class="tile-v"><span class="num">' + sw.done + '</span>回</div></div>' +
      '<div class="tile"><div class="tile-k">今月</div><div class="tile-v"><span class="num">' + sm.done + '</span>回</div></div>' +
      '<div class="tile"><div class="tile-k">今月の実施率</div><div class="tile-v">' + (sm.rate === null ? '<span class="dash">－</span>' : '<span class="num">' + Math.round(sm.rate * 100) + '</span>%') + '</div>' +
      '<div class="tile-s">' + (sm.rate === null ? (m.mode === 'self' ? '自主トレは回数で見ます' : 'まだ対象日がありません') : sm.doneT + '/' + sm.targetDays + '日') + '</div></div>' +
      '<div class="tile"><div class="tile-k">連続</div><div class="tile-v"><span class="num">' + streak + '</span>週</div></div></div>';
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

  // ---------- メニュー ----------
  function vMenus() {
    const d = S.data, today = d.today;
    const all = d.menus.filter((w) => S.menuGroup === 'ALL' || w.group === S.menuGroup || w.group === 'ALL');
    const list = all.filter((w) => (S.menuTab === 'upcoming' ? w.date >= today : w.date < today));
    list.sort((a, b) => (S.menuTab === 'upcoming' ? (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) : (a.date > b.date ? -1 : a.date < b.date ? 1 : 0)) || (a.group < b.group ? -1 : 1));
    let h = '<div class="fbar"><div class="seg" role="group" aria-label="表示する期間">' +
      '<button data-act="menu-tab" data-v="upcoming" aria-pressed="' + (S.menuTab === 'upcoming') + '">今日から</button>' +
      '<button data-act="menu-tab" data-v="past" aria-pressed="' + (S.menuTab === 'past') + '">これまで</button></div>' +
      '<div class="seg small" role="group" aria-label="グループ">' + ['ALL', 'FW', 'BK'].map((g) => '<button data-act="menu-group" data-v="' + g + '" aria-pressed="' + (S.menuGroup === g) + '">' + MGROUP[g] + '</button>').join('') + '</div></div>';
    if (can('menu')) h += '<div class="toolbar"><button class="btn primary" data-act="menu-new">' + icon('plus') + 'メニューを作成</button></div>';
    if (!list.length) return h + '<p class="empty">' + (S.menuTab === 'upcoming' ? '今日からのメニューはまだ登録されていません。' : 'これまでのメニューはありません。') + '</p>';
    let last = '';
    list.forEach((w) => {
      if (w.date !== last) {
        if (last) h += '</ul>';
        h += '<h2 class="dayhead' + (w.date === today ? ' today' : '') + '">' + mdw(w.date) + (w.date === today ? '<span>今日</span>' : '') + '</h2><ul class="menus">';
        last = w.date;
      }
      h += '<li><button class="menu-card g-' + w.group + '" data-act="menu-open" data-id="' + w.id + '">' +
        '<span class="menu-top">' + targetChip(w) + '<b>' + esc(w.title) + '</b></span>' +
        '<span class="menu-body">' + esc(w.content.split('\n').slice(0, 3).join(' / ')) + '</span>' +
        '<span class="menu-foot">対象 ' + w.targets.length + '人</span></button></li>';
    });
    return h + '</ul><p class="note">メニューの対象は、FWリーダーメニューに参加している人だけです。ポジションを指定したメニューは、メインかサブがそのポジションの人が対象です。</p>';
  }
  function openMenu(id) {
    const w = S.data.menus.find((x) => x.id === id);
    if (!w) return;
    const names = w.targets.map(nameOf).filter(Boolean);
    openSheet(w.title,
      '<div class="detail"><p class="detail-meta">' + targetChip(w) + mdw(w.date) + '</p>' +
      '<h3>トレーニング内容</h3><p class="pre">' + nl2br(w.content) + '</p>' +
      (w.detail ? '<h3>回数・セット数・重量</h3><p class="pre">' + nl2br(w.detail) + '</p>' : '') +
      (w.note ? '<h3>備考</h3><p class="pre">' + nl2br(w.note) + '</p>' : '') +
      '<h3>対象者（' + names.length + '人）</h3><p class="names">' + (names.length ? names.map(esc).join('、') : 'メニュー参加の人がいません。') + '</p>' +
      '<p class="note">対象はFWリーダーメニューに参加している人です。' + (w.createdBy ? '作成：' + esc(nameOf(w.createdBy)) : '') + '</p>' +
      (can('menu') ? '<div class="actions"><button class="btn danger" data-act="menu-del" data-id="' + w.id + '">削除</button><button class="btn primary" data-act="menu-edit" data-id="' + w.id + '">編集</button></div>' : '') +
      '</div>');
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
  function openMenuForm(id) {
    const w = id ? S.data.menus.find((x) => x.id === id) : null;
    const v = w || { date: S.data.today, group: 'FW', positions: [], title: '', content: '', detail: '', note: '' };
    openSheet(w ? 'メニューを編集' : 'メニューを作成',
      '<form data-form="menu" class="form">' + (w ? '<input type="hidden" name="id" value="' + w.id + '">' : '') +
      '<label>実施予定日<input type="date" name="date" value="' + v.date + '" required></label>' +
      '<fieldset><legend>対象</legend><div class="radios">' +
      ['FW', 'BK', 'ALL'].map((g) => '<label><input type="radio" name="group" value="' + g + '"' + (v.group === g && !(v.positions || []).length ? ' checked' : '') + '><span>' + MGROUP[g] + '</span></label>').join('') + '</div>' +
      '<p class="hint">ポジションで絞るときは、下から選んでください（複数可）。選ぶと上のグループより優先します。</p>' +
      posPicker('positions', v.positions || []) +
      '<p class="hint strong" id="tgt-hint"></p></fieldset>' +
      '<label>メニュー名<input type="text" name="title" maxlength="60" value="' + esc(v.title) + '" placeholder="例：下半身の日" required' + (w ? '' : ' autofocus') + '></label>' +
      '<label>トレーニング内容<textarea name="content" rows="5" maxlength="3000" placeholder="例：&#10;スクワット&#10;デッドリフト" required>' + esc(v.content) + '</textarea></label>' +
      '<label>回数・セット数・重量<span class="opt">任意</span><textarea name="detail" rows="3" maxlength="3000" placeholder="例：スクワット 5回×5セット（MAXの80%）">' + esc(v.detail) + '</textarea></label>' +
      '<label>備考<span class="opt">任意</span><textarea name="note" rows="2" maxlength="1000">' + esc(v.note) + '</textarea></label>' +
      '<p class="form-err" hidden></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="sheet-close">やめる</button><button class="btn primary" type="submit">' + (w ? '変更を保存' : 'メニューを登録') + '</button></div></form>');
    updateTargetHint();
  }
  function menuFormValues(f) {
    const poss = $$('input[name="positions"]:checked', f).map((x) => x.value);
    const gEl = $('input[name="group"]:checked', f);
    return { poss: poss, group: gEl ? gEl.value : 'ALL' };
  }
  function updateTargetHint() {
    const f = $('#sheet-root form[data-form="menu"]');
    if (!f) return;
    const v = menuFormValues(f), dt = f.date.value;
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
    rows.sort((a, b) => (a.sec - b.sec) || 0);
    const ord = sortMembers(rows.map((x) => x.m)).map((m) => m.id);
    rows.sort((a, b) => (a.sec - b.sec) || (ord.indexOf(a.m.id) - ord.indexOf(b.m.id)));
    return rows;
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
      '<div class="rec-n"><b>' + esc(m.name) + '</b><small>' + (m.grade ? esc(m.grade) : '') +
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
      '<div class="toolbar"><button class="btn small" data-act="rec-all">表示中の全員を「実施した」に</button></div>';
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
    let h = '<section class="block"><div class="block-h"><h2>ログイン</h2></div>';
    if (m) h += '<p class="acct"><b>' + esc(m.name) + '</b><span class="chip role">' + PERM[m.perm] + '</span></p>' +
      '<div class="toolbar"><button class="btn" data-act="pin-change">暗証番号を変更</button><button class="btn" data-act="logout">ログアウト</button></div>';
    else h += '<p class="lead-line small">見るだけならログインは不要です。記録やメニューを入力する管理者・マネージャー・FWリーダーだけログインしてください。</p>' +
      '<div class="toolbar"><button class="btn primary" data-act="login">ログイン</button></div>';
    h += '</section>';
    if (can('admin')) {
      h += '<section class="block"><div class="block-h"><h2>管理者メニュー</h2></div><ul class="links">' +
        '<li><a href="#members">部員の追加・編集・権限<small>ポジション・取り組み方の設定は「まとめて編集」が便利です</small></a></li>' +
        '<li><a href="#logs">操作履歴<small>だれが・いつ・何を変えたか</small></a></li>' +
        '<li><button data-act="viewlock">閲覧の合言葉<small>' + (S.data.viewLock ? '設定中：合言葉を知っている人だけ見られます' : '未設定：URLを知っていれば誰でも見られます') + '</small></button></li>' +
        '</ul></section>';
    }
    h += '<section class="rules"><h3>このアプリの見かた</h3><ul>' +
      '<li>マネージャーが Setlog などを確認して、筋トレをした人に「実施した」を付けます。</li>' +
      '<li>取り組み方は2つ。<b>メニュー参加</b>（FWリーダーのメニューに沿う）と<b>自主トレ</b>（自分で決める）。どちらも実施記録の対象です。</li>' +
      '<li>メニューの対象日に「実施した」が無ければ、翌日から<b>実施していない</b>（×）になります。メニューが無い日・自主トレの人は×になりません。</li>' +
      '<li><b>実施率</b>はメニュー参加の人だけ。実施した対象日 ÷ 対象日。自主トレの人は実施回数で見ます。</li>' +
      '<li>部員名簿は会計アプリと共通です。進級や入部・退部は、どちらで直しても両方に反映されます。</li></ul></section>';
    h += '<div class="toolbar"><button class="btn" data-act="reload">最新の情報に更新</button></div>' +
      '<p class="ver">KURFC 筋トレ管理 v' + VERSION + (S.data.version ? '（サーバー v' + esc(S.data.version) + '）' : '') + '</p>';
    return h;
  }
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
      '<p class="form-err" hidden></p><p class="hint">一般部員はログイン不要です。暗証番号を忘れたときは、管理者に出し直してもらってください。</p>' +
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
  const TITLE = { home: 'ホーム', rank: 'ランキング', record: '実施記録', cal: 'カレンダー', menus: 'メニュー', members: '部員', member: '部員', settings: '設定', logs: '操作履歴' };
  function shell(inner) {
    const r = S.route.name, m = me();
    const navOn = r === 'member' ? 'members' : r === 'logs' ? 'settings' : r;
    const items = NAV.filter((n) => n[0] !== 'record' || can('record'));
    return '<header class="top"><a class="brand" href="#home" aria-label="ホーム"><span class="mark" aria-hidden="true">' + jersey({ num: '', kind: 'mark' }) + '</span><span class="brand-t"><b>KURFC</b>筋トレ</span></a>' +
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
    const fn = { home: vHome, rank: vRank, cal: vCal, menus: vMenus, members: vMembers, record: vRecord, settings: vSettings, logs: vLogs };
    app.innerHTML = shell(r.name === 'member' ? vMember(r.arg) : (fn[r.name] || vHome)());
    document.title = (TITLE[r.name] ? TITLE[r.name] + '｜' : '') + 'KURFC 筋トレ';
    if (r.name === 'home') countUp();
    if (r.name === 'home' || r.name === 'rank' || r.name === 'cal') {
      const p = curPeriod(), pv = L.prevPeriod(S.kind, p.from);
      ensureRange(r.name === 'home' ? pv.from : p.from, p.to > S.data.today ? S.data.today : p.to);
    } else if (r.name === 'member' && S.memberMonth) ensureRange(S.memberMonth, S.memberMonth);
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
          setData(S.data); render(); toast('取り消しました');
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
          setData(S.data);
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
          const r = await api('login', { memberId: f.memberId.value, pin: pin });
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
      const menu = { id: f.id ? f.id.value : '', date: f.date.value, group: v.group, positions: v.poss, title: f.title.value, content: f.content.value, detail: f.detail.value, note: f.note.value };
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
    if (t.form && t.form.dataset.form === 'menu') {
      if (t.name === 'group') $$('input[name="positions"]', t.form).forEach((x) => { x.checked = false; });
      if (t.name === 'positions' && t.checked) { const g = $('input[name="group"]:checked', t.form); if (g) g.checked = false; }
      updateTargetHint();
    }
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !sheetLocked && $('#sheet-root').innerHTML) closeSheet(); });
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
  })();
})();

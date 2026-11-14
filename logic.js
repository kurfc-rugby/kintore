/*
 * KURFC 筋トレ管理アプリ — 集計ロジック（画面とテストで共用）
 *
 * 用語
 *   実施回数   … マネージャーが「実施した」と記録した日数
 *   対象日     … FWリーダーメニューの対象になった日（同じ日に複数メニューがあっても1回）
 *   実施率     … 実施した対象日 ÷ 記録済みの対象日 × 100（未記録は分母・分子に入れない）
 *   未記録     … 対象日なのにまだ記録が無い（「実施していない」とは別）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 日付（すべて 'YYYY-MM-DD' の文字列・Asia/Tokyo の暦日） ----------
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function parse(s) { var a = s.split('-'); return new Date(Date.UTC(+a[0], +a[1] - 1, +a[2])); }
  function fmt(dt) { return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); }
  function isDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    return fmt(parse(s)) === s;
  }
  function addDays(s, n) { var d = parse(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); }
  function dow(s) { return parse(s).getUTCDay(); } // 0=日
  function weekStart(s) { var w = dow(s); return addDays(s, w === 0 ? -6 : 1 - w); } // 月曜始まり
  function weekRange(s) { var a = weekStart(s); return { from: a, to: addDays(a, 6) }; }
  function monthRange(s) {
    var y = +s.slice(0, 4), m = +s.slice(5, 7);
    var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: ymd(y, m, 1), to: ymd(y, m, last) };
  }
  function addMonths(s, n) {
    var y = +s.slice(0, 4), m = +s.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return ymd(y, m + 1, 1);
  }
  function todayJST(nowMs) { return fmt(new Date((nowMs == null ? Date.now() : nowMs) + 9 * 3600 * 1000)); }
  function dateList(from, to) { var out = []; for (var d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; }
  function prevPeriod(kind, from) {
    if (kind === 'week') { var a = addDays(from, -7); return { from: a, to: addDays(a, 6) }; }
    return monthRange(addMonths(from, -1));
  }
  function nextPeriod(kind, from) {
    if (kind === 'week') { var a = addDays(from, 7); return { from: a, to: addDays(a, 6) }; }
    return monthRange(addMonths(from, 1));
  }

  // ---------- 索引 ----------
  // state: { members:[{id,player,active,start,left,group,position,subs,mode,...}], menus:[{id,date,targets:[id]}], records:[[memberId,date,s,t,by]] }
  function buildIndex(state) {
    var rec = Object.create(null), tgt = Object.create(null), menusByDate = Object.create(null);
    (state.records || []).forEach(function (r) {
      rec[r[0] + '|' + r[1]] = { s: +r[2] === 1 ? 1 : 0, t: +r[3] === 1 ? 1 : 0, by: r[4] || '' };
    });
    (state.menus || []).forEach(function (m) {
      (menusByDate[m.date] = menusByDate[m.date] || []).push(m);
      var set = (tgt[m.date] = tgt[m.date] || Object.create(null));
      (m.targets || []).forEach(function (id) { set[id] = 1; });
    });
    // 免除（怪我・テスト期間など）。memberId が 'ALL' のものは部全体のオフ期間
    var ex = Object.create(null), exAll = [];
    (state.exempts || []).forEach(function (e) {
      if (!e || !e.from || !e.to) return;
      var v = { id: e.id, from: e.from, to: e.to, reason: e.reason || '' };
      if (e.memberId === 'ALL') exAll.push(v); else (ex[e.memberId] = ex[e.memberId] || []).push(v);
    });
    return { rec: rec, tgt: tgt, menusByDate: menusByDate, ex: ex, exAll: exAll };
  }
  /** その日が免除なら免除の内容（部全体のオフを先に見る）、違えば null */
  function exemptOn(idx, id, date) {
    var a = idx.exAll || [], i;
    for (i = 0; i < a.length; i++) if (date >= a[i].from && date <= a[i].to) return a[i];
    var b = (idx.ex && idx.ex[id]) || [];
    for (i = 0; i < b.length; i++) if (date >= b[i].from && date <= b[i].to) return b[i];
    return null;
  }
  function getRec(idx, id, date) { return idx.rec[id + '|' + date] || null; }
  function inRoster(m, date) {
    if (!m.player) return false;
    if (m.start && date < m.start) return false;
    if (m.left && date >= m.left) return false;
    if (m.active === false && !m.left) return false;
    return true;
  }
  function inRosterRange(m, from, to) {
    if (!m.player) return false;
    if (m.start && to < m.start) return false;
    if (m.left && from >= m.left) return false;
    if (m.active === false && !m.left) return false;
    return true;
  }
  /** メイン・サブのどちらかがそのポジションか */
  function hasPosition(m, code) {
    return m.position === code || (m.subs || []).indexOf(code) >= 0;
  }
  // 記録があれば記録時点の対象フラグ、無ければ現在のメニューの対象者で判定
  function isTarget(idx, id, date) {
    var r = getRec(idx, id, date);
    if (r && r.t === 1) return true;
    return !!(idx.tgt[date] && idx.tgt[date][id]);
  }
  // マス目の状態
  //  done=実施した / not=実施していない（メニューの対象日で記録が無く、その日が過ぎた）/ today=今日の対象（記録待ち）
  //  planned=これからの対象日 / none=予定なし・記録なし / out=在籍期間外
  function cellState(idx, m, date, today) {
    var r = getRec(idx, m.id, date);
    if (r) return r.s === 1 ? 'done' : 'not';
    if (!inRoster(m, date)) return 'out';
    if (exemptOn(idx, m.id, date)) return 'ex';
    if (idx.tgt[date] && idx.tgt[date][m.id]) return date < today ? 'not' : date === today ? 'today' : 'planned';
    return 'none';
  }

  // ---------- 個人の集計 ----------
  //  targetDays … 集計に入れる対象日（過ぎた対象日＋今日実施した対象日）
  //  rate       … 実施した対象日 ÷ targetDays。対象日が無ければ null（自主トレの人など）
  function memberStats(idx, m, from, to, today) {
    var s = { id: m.id, done: 0, notDone: 0, targetDays: 0, doneT: 0, todayOpen: 0, rate: null, lastDone: '' };
    var end = to < today ? to : today;
    for (var d = from; d <= end; d = addDays(d, 1)) {
      var r = getRec(idx, m.id, d);
      var done = !!(r && r.s === 1);
      if (done) { s.done++; s.lastDone = d; }
      var tg = r ? (r.t === 1 || !!(idx.tgt[d] && idx.tgt[d][m.id])) : (inRoster(m, d) && !!(idx.tgt[d] && idx.tgt[d][m.id]));
      if (!tg) continue;
      if (!done && exemptOn(idx, m.id, d)) continue; // 免除の日は対象日に数えない
      if (d === today && !done) { s.todayOpen++; continue; }
      s.targetDays++;
      if (done) s.doneT++; else s.notDone++;
    }
    if (s.targetDays > 0) s.rate = s.doneT / s.targetDays;
    return s;
  }

  // ---------- 期間の集計 ----------
  // opt.group: 'ALL' | 'FW' | 'BK'、opt.position: 'PR' など（メイン・サブのどちらか）
  function matches(m, opt) {
    if (opt.group && opt.group !== 'ALL' && m.group !== opt.group) return false;
    if (opt.position && !hasPosition(m, opt.position)) return false;
    return true;
  }
  function periodStats(state, idx, from, to, today, opt) {
    opt = opt || {};
    var rows = [], team = { done: 0, notDone: 0, targetDays: 0, doneT: 0, rate: null, active: 0, members: 0, leaderMembers: 0, todayOpen: 0, goal: goalOf(opt.goal), goalClosed: 0, goalHit: 0, goalNow: 0, goalNowOk: 0, goalNowEx: 0 };
    (state.members || []).forEach(function (m) {
      if (!inRosterRange(m, from, to)) return;
      if (!matches(m, opt)) return;
      var s = memberStats(idx, m, from, to, today);
      s.name = m.name; s.group = m.group; s.mode = m.mode; s.sort = m.sort || 0;
      s.position = m.position || ''; s.subs = m.subs || []; s.grade = m.grade || '';
      s.goal = goalSummary(idx, m, from, to, today, opt.goal);
      rows.push(s);
      team.goalClosed += s.goal.closed; team.goalHit += s.goal.hit;
      if (s.goal.now) { team.goalNow++; if (s.goal.now.ok) team.goalNowOk++; }
      if (s.goal.nowExempt) team.goalNowEx++;
      team.members++;
      if (m.mode === 'leader') team.leaderMembers++;
      team.done += s.done; team.notDone += s.notDone; team.targetDays += s.targetDays; team.doneT += s.doneT; team.todayOpen += s.todayOpen;
      if (s.done > 0) team.active++;
    });
    if (team.targetDays > 0) team.rate = team.doneT / team.targetDays;
    return { from: from, to: to, rows: rows, team: team };
  }

  /** ポジションごとの集計（メインのポジションで数える） */
  function positionStats(state, idx, from, to, today, positions) {
    var out = {};
    (positions || []).forEach(function (p) { out[p.code] = { code: p.code, group: p.group, members: 0, done: 0, doneT: 0, targetDays: 0, active: 0, rate: null }; });
    var none = { code: '', members: 0, done: 0, doneT: 0, targetDays: 0, active: 0, rate: null };
    (state.members || []).forEach(function (m) {
      if (!inRosterRange(m, from, to)) return;
      var o = out[m.position] || none;
      var s = memberStats(idx, m, from, to, today);
      o.members++; o.done += s.done; o.doneT += s.doneT; o.targetDays += s.targetDays;
      if (s.done > 0) o.active++;
    });
    Object.keys(out).concat(['']).forEach(function (k) {
      var o = k ? out[k] : none;
      if (o.targetDays > 0) o.rate = o.doneT / o.targetDays;
    });
    out[''] = none;
    return out;
  }

  function byName(a, b) { return (a.sort - b.sort) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); }
  // by: 'count' | 'rate'
  //  count … 実施回数の多い順。同数は同順位。0回は順位なし
  //  rate  … 実施率の高い順。同率なら実施回数の多い方が上。実施率を出せない人は順位なしで下に並べる
  function rank(rows, by) {
    var list = rows.slice(), out = [], i, prev = null, rk = 0;
    if (by === 'rate') {
      var has = list.filter(function (r) { return r.rate !== null; });
      var no = list.filter(function (r) { return r.rate === null; });
      has.sort(function (a, b) { return (b.rate - a.rate) || (b.done - a.done) || byName(a, b); });
      for (i = 0; i < has.length; i++) {
        if (!prev || prev.rate !== has[i].rate || prev.done !== has[i].done) rk = i + 1;
        out.push(Object.assign({ rank: rk }, has[i])); prev = has[i];
      }
      no.sort(function (a, b) { return (b.done - a.done) || byName(a, b); });
      no.forEach(function (r) { out.push(Object.assign({ rank: null }, r)); });
      return out;
    }
    list.sort(function (a, b) {
      return (b.done - a.done) || ((b.rate === null ? -1 : b.rate) - (a.rate === null ? -1 : a.rate)) || byName(a, b);
    });
    for (i = 0; i < list.length; i++) {
      if (list[i].done <= 0) { out.push(Object.assign({ rank: null }, list[i])); continue; }
      if (!prev || prev.done !== list[i].done) rk = i + 1;
      out.push(Object.assign({ rank: rk }, list[i])); prev = list[i];
    }
    return out;
  }

  // ---------- その日の状況 ----------
  function dayStatus(state, idx, date) {
    var o = { date: date, targets: 0, targetDone: 0, done: 0, others: 0, othersDone: 0, roster: 0 };
    (state.members || []).forEach(function (m) {
      var r = getRec(idx, m.id, date);
      if (!r && !inRoster(m, date)) return;
      o.roster++;
      var done = !!(r && r.s === 1);
      if (done) o.done++;
      if (isTarget(idx, m.id, date)) { o.targets++; if (done) o.targetDone++; }
      else { o.others++; if (done) o.othersDone++; }
    });
    return o;
  }

  // ---------- 週の目標（週◯回以上がマスト。週は月曜〜日曜） ----------
  var DEFAULT_GOAL = 3;
  function goalOf(g) { g = Number(g); return g >= 1 && g <= 7 ? Math.floor(g) : DEFAULT_GOAL; }
  /** その週（月曜 ws から7日）に「実施した」日数 */
  function weekCount(idx, m, ws) {
    var n = 0;
    for (var i = 0; i < 7; i++) { var r = getRec(idx, m.id, addDays(ws, i)); if (r && r.s === 1) n++; }
    return n;
  }
  /** その週の免除の日数と、必要な回数（免除の日数に応じて減らす。7日とも免除なら0＝その週は対象外） */
  function weekNeed(idx, m, ws, goal) {
    goal = goalOf(goal);
    var ex = 0;
    for (var i = 0; i < 7; i++) if (exemptOn(idx, m.id, addDays(ws, i))) ex++;
    return { ex: ex, need: ex >= 7 ? 0 : Math.ceil(goal * (7 - ex) / 7) };
  }
  /**
   * 期間の中の週（月曜が期間内にあり、今日までに始まった週）ごとの達成状況。週の途中で期間が終わっても、週はまるごと数える。
   * 在籍していない週は入れない。open … まだ終わっていない週（今日が日曜でもまだ終わっていない扱い）
   * exempt … 7日とも免除で、その週は対象外（達成にも未達にも数えない）。need … 免除を引いた必要回数
   */
  function goalWeeks(idx, m, from, to, today, goal) {
    goal = goalOf(goal);
    var out = [];
    for (var ws = weekStart(from); ws <= to && ws <= today; ws = addDays(ws, 7)) {
      if (ws < from) continue; // 月の初めの週は、月曜が前の月なら前の月に入れる
      var we = addDays(ws, 6);
      if (!inRosterRange(m, ws, we)) continue;
      var c = weekCount(idx, m, ws), n = weekNeed(idx, m, ws, goal);
      var exempt = n.need === 0;
      out.push({ from: ws, to: we, count: c, need: n.need, ex: n.ex, exempt: exempt, ok: exempt ? null : c >= n.need, open: we >= today, left: exempt ? 0 : Math.max(0, n.need - c) });
    }
    return out;
  }
  /** 週の目標のまとめ。closed … 終わった週の数、hit … そのうち達成した週、now … 終わっていない週（無ければ null）。免除の週は数えない */
  function goalSummary(idx, m, from, to, today, goal) {
    var ws = goalWeeks(idx, m, from, to, today, goal), closed = 0, hit = 0, now = null, nowEx = null;
    ws.forEach(function (w) {
      if (w.exempt) { if (w.open) nowEx = w; return; }
      if (w.open) now = w; else { closed++; if (w.ok) hit++; }
    });
    return { weeks: ws, closed: closed, hit: hit, now: now, nowExempt: nowEx, every: closed > 0 && hit === closed };
  }
  // 続けて目標を達成している週の数（今週がまだ未達なら先週から数える）。免除の週はとばす（切れも増えもしない）。minDate より前は数えない
  function streakWeeks(idx, m, today, minDate, goal) {
    goal = goalOf(goal);
    var ws = weekStart(today), n = 0, first = true;
    for (; ws >= weekStart(minDate); ws = addDays(ws, -7)) {
      var nd = weekNeed(idx, m, ws, goal);
      if (nd.need === 0) { first = false; continue; }
      var ok = weekCount(idx, m, ws) >= nd.need;
      if (first) { first = false; if (!ok) continue; }
      if (!ok) break;
      n++;
    }
    return n;
  }


  // ---------- 自己ベスト・称号（1人の全期間の記録から） ----------
  //  idx は buildIndex({ records: その人の全記録, exempts: その人と部全体の免除 }) で作る
  var STREAK_MARKS = [4, 8, 12, 26, 52];
  var MONTH_MARKS = [10, 15, 20];
  var TOTAL_MARKS = [10, 30, 50, 100, 200, 300, 500];
  function doneDates(idx, id) {
    var out = [], k;
    for (k in idx.rec) { if (k.indexOf(id + '|') === 0 && idx.rec[k].s === 1) out.push(k.slice(id.length + 1)); }
    return out.sort();
  }
  /**
   * 週ごと・月ごとの集計と、称号を取った日。
   *  total … 通算の実施回数、streakMax … いちばん長い連続達成（週）、streakNow … 今の連続
   *  bestWeek {count, from}、bestMonth {count, month('YYYY-MM')}、perfectMonths … 週の目標を全部達成した月（終わった週が3つ以上）
   *  earned … { key: 取った日 }
   */
  function personal(idx, m, today, goal) {
    goal = goalOf(goal);
    var ds = doneDates(idx, m.id);
    var o = { total: ds.length, first: ds[0] || '', last: ds[ds.length - 1] || '', streakMax: 0, streakNow: 0,
      bestWeek: { count: 0, from: '' }, bestMonth: { count: 0, month: '' }, goalHits: 0, perfectMonths: [], earned: {} };
    if (!ds.length) return o;
    var earn = function (k, d) { if (!o.earned[k]) o.earned[k] = d; };
    earn('first', ds[0]);
    TOTAL_MARKS.forEach(function (n) { if (ds.length >= n) earn('t' + n, ds[n - 1]); });
    // 月
    var months = {};
    ds.forEach(function (d) {
      var k = d.slice(0, 7), x = months[k] || (months[k] = []);
      x.push(d);
    });
    Object.keys(months).sort().forEach(function (k) {
      var list = months[k];
      if (list.length > o.bestMonth.count) o.bestMonth = { count: list.length, month: k };
      MONTH_MARKS.forEach(function (n) { if (list.length >= n) earn('m' + n, list[n - 1]); });
    });
    // 週（最初の記録の週から今週まで）
    var streak = 0, monthWeeks = {}, missRun = 0;
    for (var ws = weekStart(ds[0]); ws <= today; ws = addDays(ws, 7)) {
      var we = addDays(ws, 6), cnt = 0, hitDay = '';
      var nd = weekNeed(idx, m, ws, goal);
      for (var i = 0; i < 7; i++) {
        var d = addDays(ws, i), r = getRec(idx, m.id, d);
        if (r && r.s === 1) { cnt++; if (nd.need && cnt === nd.need) hitDay = d; if (cnt === 5) earn('w5', d); }
      }
      if (cnt > o.bestWeek.count) o.bestWeek = { count: cnt, from: ws };
      var open = we >= today;
      var mk = ws.slice(0, 7), mw = monthWeeks[mk] || (monthWeeks[mk] = { closed: 0, hit: 0, open: false, end: '' });
      if (nd.need === 0) { if (open) mw.open = true; continue; } // 免除の週はとばす
      var ok = cnt >= nd.need;
      if (open) mw.open = true; else { mw.closed++; if (ok) mw.hit++; mw.end = we; }
      if (ok) {
        if (missRun >= 2 && o.goalHits > 0) earn('back', hitDay); // 2週以上とぎれてから、また達成
        missRun = 0;
        o.goalHits++;
        earn('goal1', hitDay);
        streak++;
        if (streak > o.streakMax) o.streakMax = streak;
        STREAK_MARKS.forEach(function (n) { if (streak >= n) earn('s' + n, hitDay); });
      } else if (!open) { streak = 0; missRun++; }
    }
    o.streakNow = streakWeeks(idx, m, today, ds[0], goal);
    Object.keys(monthWeeks).sort().forEach(function (k) {
      var mw = monthWeeks[k];
      // 月曜がその月にある週が全部終わり、3週以上あって全部達成
      if (!mw.open && mw.closed >= 3 && mw.hit === mw.closed) { o.perfectMonths.push(k); earn('pm', mw.end); }
    });
    return o;
  }
  /** 称号の一覧（取った順の判定は personal の earned を見る） */
  function badgeList(goal) {
    goal = goalOf(goal);
    var b = [
      { key: 'first', name: 'はじめの一歩', desc: '初めて「実施した」がついた' },
      { key: 'goal1', name: '週' + goal + '回クリア', desc: '初めて週' + goal + '回を達成' }
    ];
    STREAK_MARKS.forEach(function (n) { b.push({ key: 's' + n, name: (n === 26 ? '半年' : n === 52 ? '1年' : n + '週') + '連続', desc: '週' + goal + '回を' + n + '週続けて達成' }); });
    MONTH_MARKS.forEach(function (n) { b.push({ key: 'm' + n, name: '月' + n + '回', desc: '1か月に' + n + '回実施' }); });
    b.push({ key: 'pm', name: '皆勤の月', desc: '1か月の週すべてで週' + goal + '回を達成' });
    b.push({ key: 'w5', name: '週5回', desc: '1週間に5回実施' });
    b.push({ key: 'back', name: '復活', desc: '2週以上とぎれたあと、また週' + goal + '回を達成' });
    TOTAL_MARKS.forEach(function (n) { b.push({ key: 't' + n, name: '通算' + n + '回', desc: 'これまでに' + n + '回実施' }); });
    return b;
  }

  // ---------- 連続がピンチの人（今週まだ目標に届かず、先週までの連続が2週以上） ----------
  function pinchList(state, idx, today, goal, minDate) {
    goal = goalOf(goal);
    var ws = weekStart(today), we = addDays(ws, 6), out = [];
    var daysLeft = Math.round((parse(we) - parse(today)) / 86400000) + 1; // 今日を含めて日曜まで
    (state.members || []).forEach(function (m) {
      if (!inRosterRange(m, ws, we) || m.active === false) return;
      var nd = weekNeed(idx, m, ws, goal);
      if (nd.need === 0) return;
      var c = weekCount(idx, m, ws);
      if (c >= nd.need) return;
      var pw = addDays(ws, -7), pn = weekNeed(idx, m, pw, goal);
      if (pn.need > 0 && weekCount(idx, m, pw) < pn.need) return; // 先週で切れている
      var st = streakWeeks(idx, m, addDays(ws, -1), minDate, goal);
      if (st < 2) return;
      var left = nd.need - c;
      out.push({ id: m.id, name: m.name, sort: m.sort || 0, streak: st, count: c, need: nd.need, left: left, daysLeft: daysLeft, slack: daysLeft - left });
    });
    return out.sort(function (a, b) { return (a.slack - b.slack) || (b.streak - a.streak) || (a.sort - b.sort); });
  }

  // ---------- 落ちてきている人（終わった直近2週とも、週の目標に届かなかった） ----------
  function slipList(state, idx, today, goal) {
    goal = goalOf(goal);
    var ws = weekStart(today), w1 = addDays(ws, -7), w2 = addDays(ws, -14), out = [];
    (state.members || []).forEach(function (m) {
      if (!m.player || m.active === false || !inRosterRange(m, w2, addDays(w1, 6))) return;
      var n1 = weekNeed(idx, m, w1, goal), n2 = weekNeed(idx, m, w2, goal);
      if (n1.need === 0 || n2.need === 0) return;
      var c1 = weekCount(idx, m, w1), c2 = weekCount(idx, m, w2);
      if (c1 >= n1.need || c2 >= n2.need) return;
      var last = '';
      (state.records || []).forEach(function (r) { if (r[0] === m.id && +r[2] === 1 && r[1] <= today && r[1] > last) last = r[1]; });
      out.push({ id: m.id, name: m.name, sort: m.sort || 0, group: m.group || '', weeks: [{ from: w2, count: c2, need: n2.need }, { from: w1, count: c1, need: n1.need }],
        now: weekCount(idx, m, ws), last: last });
    });
    return out.sort(function (a, b) { return ((a.weeks[0].count + a.weeks[1].count) - (b.weeks[0].count + b.weeks[1].count)) || (a.last < b.last ? -1 : a.last > b.last ? 1 : 0) || (a.sort - b.sort); });
  }

  // ---------- おめでとう（最近のできごと） ----------
  //  life … { id: [通算回数, 最初の日] }（サーバーが全期間で数えたもの）。days … 何日前までを出すか
  //  g:<週の月曜> 週の目標を達成（連続の週数つき） / c:<回数> 通算○回 / f:first 初めての記録
  function feedEvents(state, idx, today, goal, life, days) {
    goal = goalOf(goal);
    var since = addDays(today, -(days || 14)), out = [];
    var minDate = (state.range && state.range.from) || addDays(today, -100);
    (state.members || []).forEach(function (m) {
      if (!m.player || m.active === false) return;
      var ds = doneDates(idx, m.id);
      // 週の目標（今週と先週）
      [weekStart(today), addDays(weekStart(today), -7)].forEach(function (ws) {
        if (ws < weekStart(minDate)) return;
        var nd = weekNeed(idx, m, ws, goal);
        if (nd.need === 0) return;
        var cnt = 0, hit = '';
        for (var i = 0; i < 7; i++) { var d = addDays(ws, i), r = getRec(idx, m.id, d); if (r && r.s === 1) { cnt++; if (cnt === nd.need) hit = d; } }
        if (!hit || hit < since) return;
        var st = streakWeeks(idx, m, addDays(ws, 6) < today ? addDays(ws, 6) : today, minDate, goal);
        out.push({ key: 'g:' + ws, id: m.id, name: m.name, sort: m.sort || 0, date: hit, kind: 'goal', streak: st, mark: STREAK_MARKS.indexOf(st) >= 0 });
      });
      // 通算（サーバーの通算から、読み込んだ期間の前の回数を引いて数える）
      var lf = life && life[m.id];
      if (lf && ds.length) {
        var before = lf[0] - ds.length;
        ds.forEach(function (d, i) {
          var n = before + i + 1;
          if (d < since) return;
          if (n === 1 && lf[1] === d) out.push({ key: 'f:first', id: m.id, name: m.name, sort: m.sort || 0, date: d, kind: 'first' });
          if (TOTAL_MARKS.indexOf(n) >= 0) out.push({ key: 'c:' + n, id: m.id, name: m.name, sort: m.sort || 0, date: d, kind: 'total', n: n });
        });
      }
    });
    var rank = { total: 0, first: 1, goal: 2 };
    return out.sort(function (a, b) { return (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || ((b.mark ? 1 : 0) - (a.mark ? 1 : 0)) || (rank[a.kind] - rank[b.kind]) || (a.sort - b.sort); });
  }

  function pct(rate) { return rate === null || rate === undefined ? '－' : Math.round(rate * 100) + '%'; }

  return {
    pad: pad, ymd: ymd, parse: parse, fmt: fmt, isDate: isDate, addDays: addDays, dow: dow, weekStart: weekStart,
    weekRange: weekRange, monthRange: monthRange, addMonths: addMonths, todayJST: todayJST, dateList: dateList,
    prevPeriod: prevPeriod, nextPeriod: nextPeriod,
    buildIndex: buildIndex, getRec: getRec, inRoster: inRoster, inRosterRange: inRosterRange, isTarget: isTarget, hasPosition: hasPosition,
    cellState: cellState, memberStats: memberStats, periodStats: periodStats, positionStats: positionStats, rank: rank, dayStatus: dayStatus,
    DEFAULT_GOAL: DEFAULT_GOAL, goalOf: goalOf, weekCount: weekCount, weekNeed: weekNeed, exemptOn: exemptOn, goalWeeks: goalWeeks, goalSummary: goalSummary, streakWeeks: streakWeeks, pct: pct,
    personal: personal, badgeList: badgeList, pinchList: pinchList, slipList: slipList, TOTAL_MARKS: TOTAL_MARKS, feedEvents: feedEvents, doneDates: doneDates
  };
});

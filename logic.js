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

  function pct(rate) { return rate === null || rate === undefined ? '－' : Math.round(rate * 100) + '%'; }

  return {
    pad: pad, ymd: ymd, parse: parse, fmt: fmt, isDate: isDate, addDays: addDays, dow: dow, weekStart: weekStart,
    weekRange: weekRange, monthRange: monthRange, addMonths: addMonths, todayJST: todayJST, dateList: dateList,
    prevPeriod: prevPeriod, nextPeriod: nextPeriod,
    buildIndex: buildIndex, getRec: getRec, inRoster: inRoster, inRosterRange: inRosterRange, isTarget: isTarget, hasPosition: hasPosition,
    cellState: cellState, memberStats: memberStats, periodStats: periodStats, positionStats: positionStats, rank: rank, dayStatus: dayStatus,
    DEFAULT_GOAL: DEFAULT_GOAL, goalOf: goalOf, weekCount: weekCount, weekNeed: weekNeed, exemptOn: exemptOn, goalWeeks: goalWeeks, goalSummary: goalSummary, streakWeeks: streakWeeks, pct: pct
  };
});

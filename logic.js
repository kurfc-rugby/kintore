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
  // state: { members:[{id,player,start,left,group,mode,...}], menus:[{id,date,targets:[id]}], records:[[memberId,date,s,t,by]] }
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
    return { rec: rec, tgt: tgt, menusByDate: menusByDate };
  }
  function getRec(idx, id, date) { return idx.rec[id + '|' + date] || null; }
  function inRoster(m, date) {
    if (!m.player) return false;
    if (m.start && date < m.start) return false;
    if (m.left && date >= m.left) return false;
    return true;
  }
  function inRosterRange(m, from, to) {
    if (!m.player) return false;
    if (m.start && to < m.start) return false;
    if (m.left && from >= m.left) return false;
    return true;
  }
  // 記録があれば記録時点の対象フラグ、無ければ現在のメニューの対象者で判定
  function isTarget(idx, id, date) {
    var r = getRec(idx, id, date);
    if (r) return r.t === 1;
    return !!(idx.tgt[date] && idx.tgt[date][id]);
  }
  // マス目の状態
  //  done=実施した / not=実施していない / pending=未記録（対象日・今日まで）/ planned=予定（対象日・未来）
  //  none=予定なし・記録なし / out=在籍期間外
  function cellState(idx, m, date, today) {
    var r = getRec(idx, m.id, date);
    if (r) return r.s === 1 ? 'done' : 'not';
    if (!inRoster(m, date)) return 'out';
    if (idx.tgt[date] && idx.tgt[date][m.id]) return date <= today ? 'pending' : 'planned';
    return 'none';
  }

  // ---------- 個人の集計 ----------
  function memberStats(idx, m, from, to, today) {
    var s = { id: m.id, done: 0, notDone: 0, targetDays: 0, recT: 0, doneT: 0, pending: 0, rate: null, lastDone: '' };
    var end = to < today ? to : today;
    for (var d = from; d <= end; d = addDays(d, 1)) {
      var r = getRec(idx, m.id, d);
      if (r) {
        if (r.s === 1) { s.done++; s.lastDone = d; } else s.notDone++;
        if (r.t === 1) { s.targetDays++; s.recT++; if (r.s === 1) s.doneT++; }
      } else if (inRoster(m, d) && idx.tgt[d] && idx.tgt[d][m.id]) {
        s.targetDays++; s.pending++;
      }
    }
    if (s.recT > 0) s.rate = s.doneT / s.recT;
    return s;
  }

  // ---------- 期間の集計 ----------
  // opt.group: 'ALL' | 'FW' | 'BK'
  function periodStats(state, idx, from, to, today, opt) {
    opt = opt || {};
    var g = opt.group || 'ALL';
    var rows = [], team = { done: 0, notDone: 0, targetDays: 0, recT: 0, doneT: 0, pending: 0, rate: null, active: 0, members: 0, leaderMembers: 0 };
    (state.members || []).forEach(function (m) {
      if (!inRosterRange(m, from, to)) return;
      if (g !== 'ALL' && m.group !== g) return;
      var s = memberStats(idx, m, from, to, today);
      s.name = m.name; s.group = m.group; s.mode = m.mode; s.sort = m.sort || 0;
      rows.push(s);
      team.members++;
      if (m.mode === 'leader') team.leaderMembers++;
      team.done += s.done; team.notDone += s.notDone; team.targetDays += s.targetDays;
      team.recT += s.recT; team.doneT += s.doneT; team.pending += s.pending;
      if (s.done > 0) team.active++;
    });
    if (team.recT > 0) team.rate = team.doneT / team.recT;
    return { from: from, to: to, rows: rows, team: team };
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

  // ---------- その日の記録状況 ----------
  function dayStatus(state, idx, date) {
    var o = { date: date, targets: 0, targetRecorded: 0, pending: 0, done: 0, notDone: 0, others: 0, othersRecorded: 0, roster: 0 };
    (state.members || []).forEach(function (m) {
      var r = getRec(idx, m.id, date);
      if (!r && !inRoster(m, date)) return;
      o.roster++;
      if (r) { if (r.s === 1) o.done++; else o.notDone++; }
      if (isTarget(idx, m.id, date)) { o.targets++; if (r) o.targetRecorded++; else o.pending++; }
      else { o.others++; if (r) o.othersRecorded++; }
    });
    return o;
  }

  // ---------- 継続状況 ----------
  // 月の中の「週」（月曜始まり・月内に切り詰め・今日まで）ごとに1回以上実施したか
  function monthWeeks(from, to, today) {
    var out = [], end = to < today ? to : today;
    for (var a = from; a <= end;) {
      var b = addDays(weekStart(a), 6);
      if (b > to) b = to;
      out.push({ from: a, to: b > end ? end : b });
      a = addDays(b, 1);
    }
    return out;
  }
  function continuity(idx, m, from, to, today) {
    var weeks = monthWeeks(from, to, today), hit = 0, marks = [];
    weeks.forEach(function (w) {
      var got = false;
      for (var d = w.from; d <= w.to; d = addDays(d, 1)) {
        var r = getRec(idx, m.id, d);
        if (r && r.s === 1) { got = true; break; }
      }
      if (got) hit++;
      marks.push(got);
    });
    return { weeks: weeks.length, hit: hit, every: weeks.length > 0 && hit === weeks.length, marks: marks };
  }
  // 連続で実施している週の数（今週まだ実施が無ければ先週から数える）。minDate より前は数えない
  function streakWeeks(idx, m, today, minDate) {
    function has(ws) {
      for (var i = 0; i < 7; i++) { var d = addDays(ws, i); if (d > today) break; var r = getRec(idx, m.id, d); if (r && r.s === 1) return true; }
      return false;
    }
    var ws = weekStart(today), n = 0;
    if (!has(ws)) ws = addDays(ws, -7);
    while (ws >= weekStart(minDate) && has(ws)) { n++; ws = addDays(ws, -7); }
    return n;
  }

  function pct(rate) { return rate === null || rate === undefined ? '－' : Math.round(rate * 100) + '%'; }

  return {
    pad: pad, ymd: ymd, parse: parse, fmt: fmt, isDate: isDate, addDays: addDays, dow: dow, weekStart: weekStart,
    weekRange: weekRange, monthRange: monthRange, addMonths: addMonths, todayJST: todayJST, dateList: dateList,
    prevPeriod: prevPeriod, nextPeriod: nextPeriod,
    buildIndex: buildIndex, getRec: getRec, inRoster: inRoster, inRosterRange: inRosterRange, isTarget: isTarget,
    cellState: cellState, memberStats: memberStats, periodStats: periodStats, rank: rank, dayStatus: dayStatus,
    monthWeeks: monthWeeks, continuity: continuity, streakWeeks: streakWeeks, pct: pct
  };
});

/**
 * KURFC 共通名簿（Apps Script ライブラリ）  v1.0.0
 *
 * 部の部員名簿は「KURFC会計アプリ」スプレッドシートの「部員」シート1か所だけに置く（ここが正）。
 * 会計アプリはこれまでどおり自分のシートとして読み書きし、筋トレ管理アプリやこれから作るアプリは
 * このライブラリを通して読み書きする。どのアプリで変えても、ほかのアプリにすぐ反映される。
 *
 * 部員シートの列（見出しの名前で探すので、並び順は自由）
 *   名前 / 学年 / 役割 / 在籍 / 表示順          … 会計アプリが使う列
 *   部員ID / グループ / ポジション / サブポジション … このライブラリが足した列（会計アプリは触らない）
 *
 * 決まりごと
 *   - 部員はIDで見分ける（名前は変わることがある）。IDは一度付けたら変えない・使い回さない
 *   - 名前の変更と「財務」の付け外しは会計アプリで行う（会計アプリは名前で取引・集金を結び付け、財務でログインを決めているため）
 *   - 行は消さない。卒業・退部は「在籍」を外す
 *
 * 使い方（ほかのアプリ）
 *   エディタの「ライブラリ」＋ → このプロジェクトのスクリプトID → ID「KurfcRoster」で追加
 *   KurfcRoster.list()                      … 全員（在籍していない人も含む）
 *   KurfcRoster.add([{name, grade, ...}])   … 追加
 *   KurfcRoster.update(id, {grade, ...})    … 変更
 *   KurfcRoster.version()                   … 名簿が変わるたびに変わる文字列（キャッシュの見分けに使う）
 * 詳しくは 04_ドキュメント/共通部員名簿_仕組みと使い方.md
 */

var ROSTER_VERSION = '1.0.0';
var MASTER_ID = '1cBIdb6Wl7ifMBBkS5SVkPL_GhcVQRCuKAyz0mEto-I8'; // KURFC会計アプリ
var SHEET_NAME = '部員';
var TZ_ = 'Asia/Tokyo';
var CACHE_SEC_ = 300;

var COLS_ = [
  ['name', '名前'], ['grade', '学年'], ['role', '役割'], ['active', '在籍'], ['order', '表示順'],
  ['id', '部員ID'], ['group', 'グループ'], ['position', 'ポジション'], ['subPositions', 'サブポジション']
];
var OWN_COLS_ = ['id', 'group', 'position', 'subPositions']; // このライブラリが足す列

/** ポジション（10区分）。numbers は背番号 */
var POSITIONS_ = [
  { code: 'PR', group: 'FW', name: 'プロップ', numbers: [1, 3] },
  { code: 'HO', group: 'FW', name: 'フッカー', numbers: [2] },
  { code: 'LO', group: 'FW', name: 'ロック', numbers: [4, 5] },
  { code: 'FL', group: 'FW', name: 'フランカー', numbers: [6, 7] },
  { code: 'No.8', group: 'FW', name: 'ナンバーエイト', numbers: [8] },
  { code: 'SH', group: 'BK', name: 'スクラムハーフ', numbers: [9] },
  { code: 'SO', group: 'BK', name: 'スタンドオフ', numbers: [10] },
  { code: 'CTB', group: 'BK', name: 'センター', numbers: [12, 13] },
  { code: 'WTB', group: 'BK', name: 'ウイング', numbers: [11, 14] },
  { code: 'FB', group: 'BK', name: 'フルバック', numbers: [15] }
];
/** 選手ではない役割（筋トレなどの対象から外す） */
var NON_PLAYER_ROLES_ = ['マネージャー', 'トレーナー', 'MG'];
var FINANCE_ROLE_ = '財務';

// ---------------------------------------------------------------------------
// 公開する関数（名前の最後に _ が付いた関数はライブラリの外からは見えない）
// ---------------------------------------------------------------------------

/** ポジションの一覧 */
function positions() {
  return JSON.parse(JSON.stringify(POSITIONS_));
}

/** 名簿の情報（どのスプレッドシートか、など） */
function info() {
  return { version: ROSTER_VERSION, masterId: masterId_(), sheet: SHEET_NAME, url: 'https://docs.google.com/spreadsheets/d/' + masterId_() + '/edit' };
}

/** 名簿の版。名簿が変わるたびに変わる */
function version() {
  return PropertiesService.getScriptProperties().getProperty('ROSTER_VER') || '0';
}

/** 名簿が変わったことを知らせる（会計アプリが自分で部員シートを書き換えたときに呼ぶ） */
function touch() {
  var v = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  PropertiesService.getScriptProperties().setProperty('ROSTER_VER', v);
  return v;
}

/**
 * 全員の一覧。IDの無い行（会計アプリで足した人）には、ここでIDを付ける。
 * 返す形：{id, name, grade, role, active, order, group, position, subPositions[], player, finance}
 */
function list() {
  var ver = version();
  var cache = CacheService.getScriptCache();
  var hit = cache.get('roster:' + ver);
  if (hit) return JSON.parse(hit);
  var t = read_();
  if (t.missingCols.length || t.rows.some(function (r) { return !r.id; })) {
    withLock(function () { prepare_(); });
    t = read_();
    ver = version();
  }
  var out = t.rows.map(public_);
  try { cache.put('roster:' + ver, JSON.stringify(out), CACHE_SEC_); } catch (e) { /* 覚えられなくても動く */ }
  return out;
}

/** IDで1人。いなければ null */
function get(id) {
  var all = list();
  for (var i = 0; i < all.length; i++) if (all[i].id === String(id)) return all[i];
  return null;
}

/**
 * 部員を追加する。people = [{name, grade, role, group, position, subPositions}]
 * 名前が（空白の違いを無視して）同じ人がすでにいれば追加せず skipped に入れる。
 * 返す形：{added: [部員], skipped: [{name, id, reason}]}
 */
function add(people) {
  if (!Array.isArray(people) || !people.length) throw new Error('追加する部員がいません。');
  if (people.length > 200) throw new Error('一度に追加できるのは200人までです。');
  var input = people.map(function (p) { return normalizeNew_(p || {}); });
  return withLock(function () {
    prepare_();
    var t = read_();
    var byKey = {};
    t.rows.forEach(function (r) { byKey[nameKey_(r.name)] = r; });
    var maxOrder = t.rows.reduce(function (m, r) { return Math.max(m, Number(r.order) || 0); }, 0);
    var nextId = maxIdNum_(t.rows);
    var added = [], skipped = [];
    input.forEach(function (p) {
      var dup = byKey[nameKey_(p.name)];
      if (dup) { skipped.push({ name: p.name, id: dup.id, reason: dup.active ? 'exists' : 'inactive' }); return; }
      var row = {
        name: p.name, grade: p.grade, role: p.role, active: true, order: (maxOrder += 10),
        id: formatId_(++nextId), group: p.group, position: p.position, subPositions: p.subPositions
      };
      appendRow_(t, row);
      byKey[nameKey_(p.name)] = row;
      added.push(public_(row));
    });
    if (added.length) touch();
    return { added: added, skipped: skipped };
  });
}

/**
 * 部員の情報を変える。patch に入れた項目だけ変える。
 * 変えられるもの：grade, role, active, order, group, position, subPositions
 * 名前の変更・「財務」の付け外し・財務の人の在籍を外すことは、会計アプリで行う（ここではエラー）。
 */
function update(id, patch) {
  patch = patch || {};
  if (patch.name !== undefined) throw new Error('名前の変更は会計アプリの「部員」で行ってください（取引・集金の名前もそろえて変えるため）。');
  return withLock(function () {
    prepare_();
    var t = read_();
    var cur = null;
    for (var i = 0; i < t.rows.length; i++) if (t.rows[i].id === String(id)) cur = t.rows[i];
    if (!cur) throw new Error('名簿にその部員がいません（ID ' + id + '）。');
    var next = normalizePatch_(cur, patch);
    var changed = {};
    Object.keys(next).forEach(function (k) {
      var a = k === 'subPositions' ? cur[k].join(',') : String(cur[k]);
      var b = k === 'subPositions' ? next[k].join(',') : String(next[k]);
      if (a !== b) changed[k] = next[k];
    });
    if (!Object.keys(changed).length) return public_(cur);
    if (changed.role !== undefined && (cur.role === FINANCE_ROLE_ || changed.role === FINANCE_ROLE_)) {
      throw new Error('「財務」の付け外しは会計アプリで行ってください（会計アプリにログインできる人が変わるため）。');
    }
    if (changed.active === false && cur.role === FINANCE_ROLE_) {
      throw new Error('財務の人の在籍は会計アプリで外してください。');
    }
    writeCells_(t, cur, changed);
    touch();
    Object.keys(changed).forEach(function (k) { cur[k] = changed[k]; });
    return public_(cur);
  });
}

/** 名簿をほかのアプリと同時に書き換えないためのロック（このライブラリを使う全アプリで共通） */
function withLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw new Error('名簿をほかの人が保存中です。少し待ってからもう一度試してください。');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** 列とIDを用意する（何度実行してもよい）。エディタから実行してもよい */
function setup() {
  return withLock(function () { prepare_(); return info(); });
}

// ---------------------------------------------------------------------------
// 中身
// ---------------------------------------------------------------------------

function masterId_() {
  return PropertiesService.getScriptProperties().getProperty('MASTER_ID') || MASTER_ID;
}

function sheet_() {
  var sh = SpreadsheetApp.openById(masterId_()).getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('名簿のシート「' + SHEET_NAME + '」が見つかりません。');
  return sh;
}

function cellStr_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, TZ_, 'yyyy-MM-dd');
  return String(v).trim();
}

/** シートを読む。列の位置は見出しの名前で探す */
function read_() {
  var sh = sheet_();
  var values = sh.getDataRange().getValues();
  var header = (values[0] || []).map(function (h) { return String(h).trim(); });
  var col = {}, missing = [];
  COLS_.forEach(function (c) {
    var i = header.indexOf(c[1]);
    if (i < 0) missing.push(c[1]);
    col[c[0]] = i;
  });
  ['name', 'grade', 'role', 'active', 'order'].forEach(function (k) {
    if (col[k] < 0) throw new Error('名簿のシートに「' + COLS_.filter(function (c) { return c[0] === k; })[0][1] + '」の列がありません。');
  });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var v = values[r];
    var name = cellStr_(v[col.name]);
    if (!name) continue;
    var get = function (k) { return col[k] >= 0 ? v[col[k]] : ''; };
    var act = get('active');
    rows.push({
      _row: r + 1,
      name: name,
      grade: cellStr_(get('grade')),
      role: cellStr_(get('role')) || '部員',
      active: act === true || String(act).toUpperCase() === 'TRUE',
      order: Number(get('order')) || 0,
      id: cellStr_(get('id')),
      group: cellStr_(get('group')),
      position: cellStr_(get('position')),
      subPositions: cellStr_(get('subPositions')).split(/[,、\/／・\s]+/).filter(Boolean)
    });
  }
  return { sheet: sh, header: header, col: col, rows: rows, missingCols: missing, lastRow: values.length };
}

/** 足りない列を足し、IDの無い行にIDを付ける（ロックの中で呼ぶ） */
function prepare_() {
  var t = read_();
  var sh = t.sheet;
  if (t.missingCols.length) {
    var start = t.header.length + 1;
    sh.getRange(1, start, 1, t.missingCols.length).setValues([t.missingCols])
      .setFontWeight('bold').setBackground('#6f3036').setFontColor('#ffffff');
    var rows = Math.max(sh.getMaxRows() - 1, 1);
    sh.getRange(2, start, rows, t.missingCols.length).setNumberFormat('@');
    t = read_();
  }
  var noId = t.rows.filter(function (r) { return !r.id; });
  if (!noId.length) return;
  var next = maxIdNum_(t.rows);
  var idCol = t.col.id + 1;
  var nameCol = t.col.name + 1;
  noId.sort(function (a, b) { return (a.order - b.order) || (a._row - b._row); }).forEach(function (r) {
    // 書く直前に、その行がまだ同じ人かを確かめる（会計アプリが行を消して行がずれた場合に備える）
    if (cellStr_(sh.getRange(r._row, nameCol).getValue()) !== r.name) return;
    sh.getRange(r._row, idCol).setValue(formatId_(++next));
  });
  touch();
}

function maxIdNum_(rows) {
  return rows.reduce(function (m, r) {
    var n = /^M(\d+)$/.exec(r.id || '');
    return n ? Math.max(m, parseInt(n[1], 10)) : m;
  }, 0);
}
function formatId_(n) {
  return 'M' + ('0000' + n).slice(-4);
}

/** 空白の違い（全角・半角・有無）を無視した名前 */
function nameKey_(s) {
  return String(s || '').replace(/[\s　]+/g, '');
}
function cleanName_(s) {
  var name = String(s == null ? '' : s).replace(/[\s　]+/g, ' ').trim();
  if (!name) throw new Error('名前が空です。');
  if (name.length > 30) throw new Error('名前は30文字以内にしてください：' + name);
  if (/^[=+\-@]/.test(name)) throw new Error('名前の最初に = + - @ は使えません：' + name);
  return name;
}
function cleanText_(s, max, label) {
  var v = String(s == null ? '' : s).replace(/[\s　]+/g, ' ').trim();
  if (v.length > max) throw new Error(label + 'は' + max + '文字以内にしてください。');
  if (/^[=+\-@]/.test(v)) throw new Error(label + 'の最初に = + - @ は使えません。');
  return v;
}

/** ポジションの書き方をそろえる（no8・NO.8・ナンバーエイト → No.8 など）。分からなければ null */
function positionCode_(s) {
  var raw = String(s || '').trim();
  if (!raw) return '';
  var t = raw.toUpperCase().replace(/[．。]/g, '.').replace(/\s/g, '');
  if (/^(NO\.?8|N8|ナンバーエイト|ナンバー8|エイト|8番?)$/.test(t)) return 'No.8';
  var alias = {
    'PR': 'PR', 'プロップ': 'PR', '1': 'PR', '3': 'PR', '1番': 'PR', '3番': 'PR',
    'HO': 'HO', 'HK': 'HO', 'フッカー': 'HO', '2': 'HO', '2番': 'HO',
    'LO': 'LO', 'ロック': 'LO', '4': 'LO', '5': 'LO', '4番': 'LO', '5番': 'LO',
    'FL': 'FL', 'フランカー': 'FL', 'FLANKER': 'FL', '6': 'FL', '7': 'FL', '6番': 'FL', '7番': 'FL',
    'SH': 'SH', 'スクラムハーフ': 'SH', 'ハーフ': 'SH', '9': 'SH', '9番': 'SH',
    'SO': 'SO', 'FH': 'SO', 'スタンドオフ': 'SO', '10': 'SO', '10番': 'SO',
    'CTB': 'CTB', 'CT': 'CTB', 'C': 'CTB', 'センター': 'CTB', '12': 'CTB', '13': 'CTB', '12番': 'CTB', '13番': 'CTB',
    'WTB': 'WTB', 'WG': 'WTB', 'WING': 'WTB', 'ウイング': 'WTB', 'ウィング': 'WTB', '11': 'WTB', '14': 'WTB', '11番': 'WTB', '14番': 'WTB',
    'FB': 'FB', 'フルバック': 'FB', '15': 'FB', '15番': 'FB'
  };
  return alias[t] || alias[raw] || null;
}
function positionGroup_(code) {
  for (var i = 0; i < POSITIONS_.length; i++) if (POSITIONS_[i].code === code) return POSITIONS_[i].group;
  return '';
}
function cleanPosition_(s) {
  var c = positionCode_(s);
  if (c === null) throw new Error('ポジション「' + s + '」が分かりません（PR・HO・LO・FL・No.8・SH・SO・CTB・WTB・FB）。');
  return c;
}
function cleanSubs_(v, main) {
  var arr = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,、\/／・\s]+/);
  var out = [];
  arr.forEach(function (x) {
    if (!String(x || '').trim()) return;
    var c = cleanPosition_(x);
    if (c && c !== main && out.indexOf(c) < 0) out.push(c);
  });
  return out;
}
function cleanGroup_(g, position) {
  if (position) return positionGroup_(position);
  var s = String(g || '').toUpperCase().trim();
  if (s === 'ＦＷ') s = 'FW';
  if (s === 'ＢＫ') s = 'BK';
  if (s && s !== 'FW' && s !== 'BK') throw new Error('グループは FW か BK にしてください。');
  return s;
}

function normalizeNew_(p) {
  var position = p.position ? cleanPosition_(p.position) : '';
  return {
    name: cleanName_(p.name),
    grade: cleanText_(p.grade, 10, '学年'),
    role: cleanText_(p.role, 20, '役割') || '部員',
    group: cleanGroup_(p.group, position),
    position: position,
    subPositions: cleanSubs_(p.subPositions, position)
  };
}
function normalizePatch_(cur, patch) {
  var out = {};
  if (patch.grade !== undefined) out.grade = cleanText_(patch.grade, 10, '学年');
  if (patch.role !== undefined) out.role = cleanText_(patch.role, 20, '役割') || '部員';
  if (patch.active !== undefined) out.active = patch.active === true || String(patch.active).toUpperCase() === 'TRUE';
  if (patch.order !== undefined) out.order = Number(patch.order) || 0;
  var position = patch.position !== undefined ? (patch.position ? cleanPosition_(patch.position) : '') : cur.position;
  if (patch.position !== undefined) out.position = position;
  if (patch.group !== undefined || patch.position !== undefined) out.group = cleanGroup_(patch.group !== undefined ? patch.group : cur.group, position);
  if (patch.subPositions !== undefined || patch.position !== undefined) {
    out.subPositions = cleanSubs_(patch.subPositions !== undefined ? patch.subPositions : cur.subPositions, position);
  }
  return out;
}

function cellValue_(k, v) {
  if (k === 'active') return v === true;
  if (k === 'order') return Number(v) || 0;
  if (k === 'subPositions') return (v || []).join(',');
  var s = String(v == null ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/** 変えた項目のセルだけを書く（ほかの列・ほかの行には触らない） */
function writeCells_(t, row, changed) {
  var sh = t.sheet;
  var nameCol = t.col.name + 1;
  if (cellStr_(sh.getRange(row._row, nameCol).getValue()) !== row.name) {
    throw new Error('名簿がほかで変わりました。もう一度試してください。');
  }
  Object.keys(changed).forEach(function (k) {
    var c = t.col[k];
    if (c < 0) return;
    sh.getRange(row._row, c + 1).setValue(cellValue_(k, changed[k]));
  });
}

function appendRow_(t, row) {
  var sh = t.sheet;
  var arr = [];
  for (var i = 0; i < t.header.length; i++) arr.push('');
  COLS_.forEach(function (c) {
    var i = t.col[c[0]];
    if (i >= 0) arr[i] = cellValue_(c[0], row[c[0]]);
  });
  sh.appendRow(arr);
  var r = sh.getLastRow();
  try { sh.getRange(r, t.col.active + 1).insertCheckboxes().setValue(true); } catch (e) { /* チェックボックスにできなくても値は入っている */ }
  row._row = r;
}

function public_(r) {
  return {
    id: r.id, name: r.name, grade: r.grade, role: r.role, active: r.active, order: r.order,
    group: r.group || positionGroup_(r.position), position: r.position, subPositions: (r.subPositions || []).slice(),
    player: NON_PLAYER_ROLES_.indexOf(r.role) < 0,
    finance: r.role === FINANCE_ROLE_
  };
}

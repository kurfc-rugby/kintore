/**
 * KURFC 筋トレ管理アプリ — サーバー（Google Apps Script・スプレッドシートに紐付け）  v2
 *
 * 画面は GitHub Pages（kurfc-rugby.github.io/kintore）に置き、このスクリプトを JSON API として呼ぶ。
 * 部員名簿（名前・学年・役割・在籍・FW/BK・ポジション）は部の共通名簿（ライブラリ KurfcRoster ＝
 * 会計アプリの「部員」シート）を使う。このスプレッドシートには筋トレだけの情報（取り組み方・権限・
 * 暗証番号・メニュー・実施記録・履歴）を置く。権限チェックはすべてここで行う。
 *
 * 必要なもの：ライブラリ「KURFC 共通名簿」を ID「KurfcRoster」で追加しておく。
 * 最初にやること：スプレッドシートのメニュー「筋トレ管理」→「管理者を登録」
 * 詳しくは 04_ドキュメント/筋トレ管理アプリ_使い方と引き継ぎ.md
 */
const APP_VERSION = '2.2.0';
const SCHEMA_VERSION = '2';
const TZ = 'Asia/Tokyo';
const SESSION_DAYS = 90;
const VIEW_SESSION_DAYS = 180;
const PIN_MIN = 6;
const PIN_MAX = 32;
const LOCK_EVERY = 5;
const LOCK_MINUTES = 15;
const HASH_ROUNDS = 300;
const DEFAULT_BACK_DAYS = 100;
const DEFAULT_AHEAD_DAYS = 60;
const MAX_RANGE_DAYS = 800;
const OLD_DATE = '2000-01-01';

// ---------------------------------------------------------------------------
// シート定義（列は見出し名で探すので、並べ替えや列の追加に強い）
// ---------------------------------------------------------------------------
const DEF = {
  people: { name: '部員設定', cols: [
    ['id', '部員ID'], ['nameMemo', '名前（控え）'], ['mode', '取り組み方'], ['perm', '権限'],
    ['start', '開始日'], ['left', '退部日'],
    ['pinHash', '暗証番号ハッシュ'], ['pinSalt', 'ソルト'], ['mustChange', '要変更'], ['failCount', '失敗回数'],
    ['lockUntil', 'ロック解除'], ['createdAt', '作成日時'], ['updatedAt', '更新日時']] },
  history: { name: '設定変更履歴', cols: [
    ['memberId', '部員ID'], ['effDate', '適用開始日'], ['group', 'グループ'], ['mode', '取り組み方'],
    ['position', 'ポジション'], ['subPositions', 'サブポジション'], ['by', '変更者ID'], ['at', '変更日時']] },
  menus: { name: 'メニュー', cols: [
    ['id', 'ID'], ['date', '実施予定日'], ['group', '対象グループ'], ['positions', '対象ポジション'], ['title', 'メニュー名'],
    ['content', 'トレーニング内容'], ['detail', '回数・セット数・重量'], ['note', '備考'], ['targets', '対象者ID'],
    ['createdBy', '作成者ID'], ['createdAt', '作成日時'], ['updatedBy', '更新者ID'], ['updatedAt', '更新日時'],
    ['deletedBy', '削除者ID'], ['deletedAt', '削除日時']] },
  records: { name: '実施記録', cols: [
    ['memberId', '部員ID'], ['date', '日付'], ['status', '実施状況'], ['target', 'メニュー対象'], ['menuIds', 'メニューID'],
    ['createdBy', '記録者ID'], ['createdAt', '記録日時'], ['updatedBy', '修正者ID'], ['updatedAt', '修正日時']] },
  sessions: { name: 'ログイン', cols: [
    ['tokenHash', 'トークンハッシュ'], ['memberId', '部員ID'], ['kind', '種類'], ['createdAt', '作成日時'], ['expiresAt', '有効期限']] },
  logs: { name: '操作履歴', cols: [
    ['at', '日時'], ['actorId', '操作者ID'], ['actorName', '操作者'], ['role', '権限'], ['action', '操作'], ['detail', '内容']] },
  settings: { name: '設定', cols: [['key', '項目'], ['value', '値']] }
};
const DATE_COLS = { start: 1, left: 1, effDate: 1, date: 1 };

const ENC = {
  mode: { leader: 'リーダーメニュー', self: '自主トレ' },
  perm: { admin: '管理者', manager: 'マネージャー', leader: 'FWリーダー', member: '一般部員' },
  status: { done: '実施した', not: '実施していない' },
  mgroup: { FW: 'FW', BK: 'BK', ALL: '全体' },
  bool: { '1': 'はい', '0': 'いいえ' }
};
const FIELD_ENC = {
  people: { mode: 'mode', perm: 'perm', mustChange: 'bool' },
  history: { mode: 'mode' },
  menus: { group: 'mgroup' },
  records: { status: 'status', target: 'bool' }
};
const STAFF = { admin: 1, manager: 1, leader: 1 };

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------
function doGet() {
  return out_({ ok: true, app: 'KURFC 筋トレ管理', version: APP_VERSION });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (x) {
    return out_({ ok: false, error: 'bad_request', message: '送信内容を読み取れませんでした。' });
  }
  return out_(handle_(req));
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

let REQ_ = null; // 1回のリクエストの間だけ使う読み取りキャッシュ

function handle_(req) {
  REQ_ = { tables: {}, ss: null, roster: null };
  try {
    if (!req || typeof req !== 'object') throw err_('bad_request', '送信内容が正しくありません。');
    ensureSchema_();
    syncRoster_();
    const ctx = { req: req, me: null, view: false };
    resolveSession_(ctx);
    const op = String(req.op || '');
    const open = { ping: 1, state: 1, login: 1, logout: 1, viewLogin: 1, changePin: 1 };
    if (!open[op] && ctx.me && ctx.me.mustChange) {
      throw err_('must_change_pin', '先に暗証番号を変更してください。');
    }
    switch (op) {
      case 'ping': return { ok: true, version: APP_VERSION, today: today_() };
      case 'state': return opState_(ctx);
      case 'viewLogin': return opViewLogin_(ctx);
      case 'login': return opLogin_(ctx);
      case 'logout': return opLogout_(ctx);
      case 'changePin': return opChangePin_(ctx);
      case 'saveRecords': return opSaveRecords_(ctx);
      case 'deleteRecord': return opDeleteRecord_(ctx);
      case 'saveMenu': return opSaveMenu_(ctx);
      case 'deleteMenu': return opDeleteMenu_(ctx);
      case 'saveMember': return opSaveMember_(ctx);
      case 'bulkMembers': return opBulkMembers_(ctx);
      case 'importMembers': return opImportMembers_(ctx);
      case 'setMemberActive': return opSetMemberActive_(ctx);
      case 'resetPin': return opResetPin_(ctx);
      case 'logs': return opLogs_(ctx);
      case 'saveSettings': return opSaveSettings_(ctx);
      default: throw err_('unknown_op', '不明な操作です。');
    }
  } catch (x) {
    if (x && x.appError) return { ok: false, error: x.code, message: x.message };
    try { console.error(x && x.stack ? x.stack : x); } catch (y) { /* noop */ }
    const msg = x && x.message ? String(x.message) : '';
    // 共通名簿（ライブラリ）が出した、利用者向けの文はそのまま見せる
    if (/会計アプリ|名簿|ポジション|グループ|名前|学年|役割/.test(msg) && msg.length < 200) {
      return { ok: false, error: 'roster', message: msg };
    }
    return { ok: false, error: 'server_error', message: 'サーバーでエラーが起きました。少し待ってもう一度試してください。' };
  } finally {
    REQ_ = null;
  }
}

function err_(code, message) {
  const e = new Error(message);
  e.appError = true; e.code = code;
  return e;
}

// ---------------------------------------------------------------------------
// 日付・時刻
// ---------------------------------------------------------------------------
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function nowPlusMin_(min) { return Utilities.formatDate(new Date(Date.now() + min * 60000), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function isDate_(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const a = s.split('-');
  const d = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2]));
  return d.getUTCFullYear() === +a[0] && d.getUTCMonth() === +a[1] - 1 && d.getUTCDate() === +a[2];
}
function addDays_(s, n) {
  const a = s.split('-');
  const d = new Date(Date.UTC(+a[0], +a[1] - 1, +a[2] + n));
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}
function reqDate_(v, label) {
  const s = String(v == null ? '' : v);
  if (!isDate_(s)) throw err_('bad_date', (label || '日付') + 'が正しくありません。');
  return s;
}

// ---------------------------------------------------------------------------
// スプレッドシートの読み書き
// ---------------------------------------------------------------------------
function ss_() {
  if (REQ_ && REQ_.ss) return REQ_.ss;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw err_('no_sheet', 'スプレッドシートが見つかりません。');
  if (REQ_) REQ_.ss = ss;
  return ss;
}

function decodeCell_(v, key) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, DATE_COLS[key] ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm:ss');
  if (v === null || v === undefined) return '';
  return String(v).trim();
}
function decodeField_(tkey, key, s) {
  const kind = (FIELD_ENC[tkey] || {})[key];
  if (!kind) return s;
  const map = ENC[kind];
  for (const k in map) if (map[k] === s) return k;
  if (map[s] !== undefined) return s;
  if (kind === 'bool') return (s === 'TRUE' || s === 'true' || s === '1') ? '1' : '0';
  return s;
}
function encodeField_(tkey, key, v) {
  const kind = (FIELD_ENC[tkey] || {})[key];
  let s = v === null || v === undefined ? '' : String(v);
  if (kind) {
    if (kind === 'bool') s = (v === true || s === '1' || s === 'true') ? '1' : '0';
    if (ENC[kind][s] !== undefined) s = ENC[kind][s];
  }
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function table_(tkey) {
  if (REQ_ && REQ_.tables[tkey]) return REQ_.tables[tkey];
  const def = DEF[tkey];
  const sheet = ss_().getSheetByName(def.name);
  if (!sheet) throw err_('no_sheet', 'シート「' + def.name + '」がありません。初期設定を実行してください。');
  const values = sheet.getDataRange().getValues();
  const head = values.length ? values[0].map(function (h) { return String(h).trim(); }) : [];
  const col = {};
  def.cols.forEach(function (c) {
    const i = head.indexOf(c[1]);
    if (i < 0) throw err_('bad_sheet', 'シート「' + def.name + '」に列「' + c[1] + '」がありません。初期設定を実行してください。');
    col[c[0]] = i;
  });
  const first = def.cols[0][0];
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const raw = values[r];
    const o = { _r: r + 1 };
    def.cols.forEach(function (c) { o[c[0]] = decodeField_(tkey, c[0], decodeCell_(raw[col[c[0]]], c[0])); });
    if (!o[first]) continue;
    rows.push(o);
  }
  const t = { key: tkey, sheet: sheet, col: col, width: head.length, rows: rows, lastRow: values.length };
  if (REQ_) REQ_.tables[tkey] = t;
  return t;
}

function rowArray_(t, o) {
  const arr = [];
  for (let i = 0; i < t.width; i++) arr.push('');
  DEF[t.key].cols.forEach(function (c) { arr[t.col[c[0]]] = encodeField_(t.key, c[0], o[c[0]]); });
  return arr;
}
function insert_(tkey, objs) {
  if (!objs.length) return;
  const t = table_(tkey);
  const rows = objs.map(function (o) { return rowArray_(t, o); });
  t.sheet.getRange(t.lastRow + 1, 1, rows.length, t.width).setValues(rows);
  objs.forEach(function (o, i) { o._r = t.lastRow + 1 + i; t.rows.push(o); });
  t.lastRow += rows.length;
}
function update_(tkey, o) {
  const t = table_(tkey);
  const cur = t.sheet.getRange(o._r, 1, 1, t.width).getValues()[0];
  DEF[tkey].cols.forEach(function (c) { cur[t.col[c[0]]] = encodeField_(tkey, c[0], o[c[0]]); });
  for (let i = 0; i < cur.length; i++) {
    if (cur[i] instanceof Date) cur[i] = Utilities.formatDate(cur[i], TZ, 'yyyy-MM-dd HH:mm:ss');
  }
  t.sheet.getRange(o._r, 1, 1, t.width).setValues([cur]);
}
function remove_(tkey, o) {
  const t = table_(tkey);
  t.sheet.deleteRow(o._r);
  const r = o._r;
  t.rows = t.rows.filter(function (x) { return x !== o; });
  t.rows.forEach(function (x) { if (x._r > r) x._r--; });
  t.lastRow--;
}
function removeMany_(tkey, list) {
  list.slice().sort(function (a, b) { return b._r - a._r; }).forEach(function (o) { remove_(tkey, o); });
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (x) {
    throw err_('busy', 'いま混み合っています。少し待ってもう一度試してください。');
  }
  try {
    if (REQ_) { REQ_.tables = {}; REQ_.roster = null; REQ_.members = null; }
    const res = fn();
    SpreadsheetApp.flush();
    return res;
  } finally {
    if (REQ_) { REQ_.roster = null; REQ_.members = null; }
    lock.releaseLock();
  }
}

function setting_(key) {
  const row = table_('settings').rows.filter(function (r) { return r.key === key; })[0];
  return row ? row.value : '';
}
/** 週の目標回数（週◯回以上がマスト）。設定が無ければ3 */
const DEFAULT_WEEK_GOAL = 3;
function weekGoal_() {
  const v = parseInt(setting_('weekGoal'), 10);
  return v >= 1 && v <= 7 ? v : DEFAULT_WEEK_GOAL;
}
function setSetting_(key, value) {
  const row = table_('settings').rows.filter(function (r) { return r.key === key; })[0];
  if (row) { row.value = value; update_('settings', row); } else insert_('settings', [{ key: key, value: value }]);
}

function log_(me, action, detail) {
  insert_('logs', [logRow_(me, action, detail)]);
}
function logRow_(me, action, detail) {
  return { at: now_(), actorId: me ? me.id : '', actorName: me ? me.name : '', role: me ? ENC.perm[me.perm] || '' : '', action: action, detail: detail };
}

// ---------------------------------------------------------------------------
// 共通名簿（ライブラリ KurfcRoster）
// ---------------------------------------------------------------------------
function rosterLib_() {
  if (typeof KurfcRoster === 'undefined') {
    throw err_('no_roster', '共通名簿（ライブラリ KurfcRoster）が追加されていません。Apps Script のエディタで追加してください。');
  }
  return KurfcRoster;
}
function roster_() {
  if (REQ_ && REQ_.roster) return REQ_.roster;
  const list = rosterLib_().list();
  if (REQ_) REQ_.roster = list;
  return list;
}
function positionsList_() {
  if (REQ_ && REQ_.positions) return REQ_.positions;
  const p = rosterLib_().positions();
  if (REQ_) REQ_.positions = p;
  return p;
}
function positionCodes_() { return positionsList_().map(function (p) { return p.code; }); }
function nameKey_(s) { return String(s || '').replace(/[\s　]+/g, ''); }

/** 名簿＋筋トレの設定を合わせた部員一覧 */
function members_() {
  if (REQ_ && REQ_.members) return REQ_.members;
  const sets = {};
  table_('people').rows.forEach(function (s) { sets[s.id] = s; });
  const seen = {};
  const list = roster_().map(function (r) {
    seen[r.id] = 1;
    return mergeMember_(r, sets[r.id] || null);
  });
  // 名簿から消された人（会計アプリで行ごと削除）は、筋トレの記録を見られるように控えの名前で残す
  table_('people').rows.forEach(function (s) {
    if (seen[s.id]) return;
    list.push(mergeMember_({ id: s.id, name: s.nameMemo || s.id, grade: '', role: '部員', active: false, order: 99999,
      group: '', position: '', subPositions: [], player: true, finance: false, gone: true }, s));
  });
  if (REQ_) REQ_.members = list;
  return list;
}
function mergeMember_(r, s) {
  return {
    id: r.id, name: r.name, grade: r.grade, clubRole: r.role, active: !!r.active, order: Number(r.order) || 0,
    group: r.group || '', position: r.position || '', subs: (r.subPositions || []).slice(), player: !!r.player, finance: !!r.finance,
    gone: !!r.gone,
    mode: (s && s.mode) || 'self', perm: (s && s.perm) || 'member', start: (s && s.start) || '', left: (s && s.left) || '',
    set: s
  };
}
function memberById_(id) {
  return members_().filter(function (m) { return m.id === String(id); })[0] || null;
}
/** 筋トレの設定の行。なければ作る（ロックの中で呼ぶ） */
function peopleRow_(m) {
  if (m.set) return m.set;
  const now = now_();
  const row = { id: m.id, nameMemo: m.name, mode: m.mode, perm: m.perm, start: m.start, left: m.left,
    pinHash: '', pinSalt: '', mustChange: '0', failCount: '0', lockUntil: '', createdAt: now, updatedAt: '' };
  insert_('people', [row]);
  m.set = row;
  return row;
}

/**
 * 名簿の変化を筋トレ側に取り込む（毎回のリクエストの最初）。
 *   - 在籍が外れた人に退部日を入れる／戻った人の退部日を消す
 *   - グループ・ポジションの変更を「設定変更履歴」に今日から記録する（過去の集計は変えない）
 *   - 名前の控えを最新にする
 * 変える必要があるときだけロックを取って書く。
 */
function syncRoster_() {
  if (!needsSync_()) return;
  withLock_(function () {
    if (!needsSync_()) return;
    const today = today_(), now = now_();
    const hist = historyIndex_();
    const newHist = [];
    members_().forEach(function (m) {
      if (m.gone) {
        if (m.set && !m.set.left) { m.set.left = today; m.set.updatedAt = now; update_('people', m.set); }
        return;
      }
      if (!m.active && !m.left) { const s = peopleRow_(m); s.left = today; s.updatedAt = now; update_('people', s); m.left = today; }
      if (m.active && m.left) { const s = peopleRow_(m); s.left = ''; s.updatedAt = now; update_('people', s); m.left = ''; }
      if (m.set && m.set.nameMemo !== m.name) { m.set.nameMemo = m.name; update_('people', m.set); }
      const list = hist[m.id];
      const last = list && list.length ? list[list.length - 1] : null;
      if (!last) {
        newHist.push({ memberId: m.id, effDate: m.start || OLD_DATE, group: m.group, mode: m.mode, position: m.position, subPositions: m.subs.join(','), by: '', at: now });
      } else if (histDiffers_(last, m)) {
        addHistory_(m, today, now, '', hist, newHist);
      }
    });
    insert_('history', newHist);
    if (newHist.length) refreshFutureTargets_();
  });
}
function needsSync_() {
  const hist = historyIndex_();
  return members_().some(function (m) {
    if (m.gone) return !!(m.set && !m.set.left);
    if (!m.active && !m.left) return true;
    if (m.active && m.left) return true;
    if (m.set && m.set.nameMemo !== m.name) return true;
    const list = hist[m.id];
    const last = list && list.length ? list[list.length - 1] : null;
    return !last || histDiffers_(last, m);
  });
}
function histDiffers_(h, m) {
  return h.group !== m.group || h.position !== m.position || h.subPositions !== m.subs.join(',') || h.mode !== m.mode;
}
/**
 * 今日から適用する履歴を足す（今日の分がすでにあれば書き換える）。
 * ただし、まだだれも設定していない人（履歴が自動で作ったものだけ）を管理者が初めて設定したときは、
 * 「最初の設定」として前の日付にもさかのぼって使う（設定前の状態には意味がないため）。
 */
function addHistory_(m, today, now, by, hist, pending) {
  const list = hist[m.id] || [];
  if (by && list.length && list.every(function (h) { return !h.by && h._r; })) {
    const base = list[0];
    Object.assign(base, { group: m.group, mode: m.mode, position: m.position, subPositions: m.subs.join(','), by: by, at: now });
    update_('history', base);
    removeMany_('history', list.slice(1));
    hist[m.id] = [base];
    return;
  }
  const todays = list.filter(function (h) { return h.effDate === today && h._r; })[0];
  const row = { memberId: m.id, effDate: today, group: m.group, mode: m.mode, position: m.position, subPositions: m.subs.join(','), by: by, at: now };
  if (todays) { Object.assign(todays, row); update_('history', todays); return; }
  const p = pending ? pending.filter(function (h) { return h.memberId === m.id && h.effDate === today; })[0] : null;
  if (p) { Object.assign(p, row); return; }
  if (pending) pending.push(row); else insert_('history', [row]);
}

// ---------------------------------------------------------------------------
// 初期設定・移行
// ---------------------------------------------------------------------------
function ensureSchema_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SCHEMA') === SCHEMA_VERSION) return;
  withLock_(function () {
    if (props.getProperty('SCHEMA') === SCHEMA_VERSION) return;
    prepareSheets_();
    migrateV1_();
    props.setProperty('SCHEMA', SCHEMA_VERSION);
  });
}

function prepareSheets_() {
  const ss = ss_();
  Object.keys(DEF).forEach(function (k) {
    const def = DEF[k];
    let sh = ss.getSheetByName(def.name);
    if (!sh) sh = ss.insertSheet(def.name);
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
    const lastCol = sh.getLastColumn();
    const head = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
    const missing = def.cols.filter(function (c) { return head.indexOf(c[1]) < 0; }).map(function (c) { return c[1]; });
    if (missing.length) sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]);
    sh.setFrozenRows(1);
  });
  const blank = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  if (REQ_) REQ_.tables = {};
}

/** v1（筋トレ専用の「部員」シート）から、共通名簿＋「部員設定」へ移す。何度呼んでもよい */
function migrateV1_() {
  const ss = ss_();
  const old = ss.getSheetByName('部員');
  if (!old) return;
  const values = old.getDataRange().getValues();
  const head = (values[0] || []).map(function (h) { return String(h).trim(); });
  const ix = function (name) { return head.indexOf(name); };
  if (ix('ID') < 0 || ix('名前') < 0) return;
  const lib = rosterLib_();
  const roster = lib.list();
  const byKey = {};
  roster.forEach(function (r) { byKey[nameKey_(r.name)] = r; });
  const map = {}; // 旧ID → 新ID
  const sets = {};
  table_('people').rows.forEach(function (s) { sets[s.id] = s; });
  const now = now_();
  const rev = function (kind, s) { const m = ENC[kind]; for (const k in m) if (m[k] === s) return k; return m[s] !== undefined ? s : ''; };
  for (let r = 1; r < values.length; r++) {
    const v = values[r];
    const oldId = String(v[ix('ID')] || '').trim();
    const name = String(v[ix('名前')] || '').trim();
    if (!oldId || !name) continue;
    const get = function (h) { const i = ix(h); return i >= 0 ? String(v[i] instanceof Date ? Utilities.formatDate(v[i], TZ, 'yyyy-MM-dd') : v[i]).trim() : ''; };
    let rr = byKey[nameKey_(name)];
    if (!rr) {
      const player = get('選手') !== 'いいえ';
      const res = lib.add([{ name: name, group: player ? get('グループ') : '', role: player ? '部員' : 'マネージャー' }]);
      rr = res.added[0] || roster.filter(function (x) { return x.id === (res.skipped[0] || {}).id; })[0];
      if (!rr) continue;
      byKey[nameKey_(name)] = rr;
    }
    map[oldId] = rr.id;
    if (sets[rr.id]) continue;
    const row = {
      id: rr.id, nameMemo: rr.name, mode: rev('mode', get('取り組み方')) || 'self', perm: rev('perm', get('権限')) || 'member',
      start: get('開始日'), left: get('退部日'),
      pinHash: get('暗証番号ハッシュ'), pinSalt: get('ソルト'), mustChange: get('要変更') === 'はい' ? '1' : '0',
      failCount: get('失敗回数') || '0', lockUntil: get('ロック解除'), createdAt: get('作成日時') || now, updatedAt: now
    };
    insert_('people', [row]);
    sets[rr.id] = row;
  }
  // 記録・履歴・メニュー・ログインの部員IDを付け替える
  const remap = function (id) { return map[id] || id; };
  table_('records').rows.forEach(function (x) {
    const n = { memberId: remap(x.memberId), createdBy: remap(x.createdBy), updatedBy: remap(x.updatedBy) };
    if (n.memberId !== x.memberId || n.createdBy !== x.createdBy || n.updatedBy !== x.updatedBy) { Object.assign(x, n); update_('records', x); }
  });
  table_('history').rows.forEach(function (x) {
    const n = { memberId: remap(x.memberId), by: remap(x.by) };
    if (n.memberId !== x.memberId || n.by !== x.by) { Object.assign(x, n); update_('history', x); }
  });
  table_('menus').rows.forEach(function (x) {
    const t = x.targets ? x.targets.split(',').map(remap).join(',') : '';
    const n = { targets: t, createdBy: remap(x.createdBy), updatedBy: remap(x.updatedBy), deletedBy: remap(x.deletedBy) };
    if (n.targets !== x.targets || n.createdBy !== x.createdBy || n.updatedBy !== x.updatedBy || n.deletedBy !== x.deletedBy) { Object.assign(x, n); update_('menus', x); }
  });
  table_('sessions').rows.forEach(function (x) {
    if (map[x.memberId]) { x.memberId = map[x.memberId]; update_('sessions', x); }
  });
  let name = '旧_部員（v1）';
  for (let i = 2; ss.getSheetByName(name); i++) name = '旧_部員（v1）' + i;
  old.setName(name);
  insert_('logs', [logRow_(null, '共通名簿へ移行', Object.keys(map).length + '人')]);
  if (REQ_) { REQ_.members = null; REQ_.roster = null; }
}

// ---------------------------------------------------------------------------
// 認証
// ---------------------------------------------------------------------------
function sha256Hex_(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += ('0' + (bytes[i] & 0xff).toString(16)).slice(-2);
  return hex;
}
function pinHash_(salt, pin) {
  let h = salt + ':' + pin;
  for (let i = 0; i < HASH_ROUNDS; i++) h = sha256Hex_(salt + ':' + h);
  return h;
}
function randomHex_() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }
function randomPin_() {
  const n = parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 1000000;
  return ('000000' + n).slice(-6);
}
function checkPinFormat_(pin) {
  if (typeof pin !== 'string' || pin.length < PIN_MIN || pin.length > PIN_MAX || !/^[\x21-\x7e]+$/.test(pin)) {
    throw err_('bad_pin', '暗証番号は半角' + PIN_MIN + '文字以上にしてください。');
  }
}
function meOf_(m) {
  return { id: m.id, name: m.name, perm: m.perm, mustChange: !!(m.set && m.set.mustChange === '1') };
}
function canLogin_(m) {
  return !!(m && m.active && !m.gone && STAFF[m.perm] && m.set && m.set.pinHash);
}

function resolveSession_(ctx) {
  const req = ctx.req;
  const now = now_();
  if (req.token && typeof req.token === 'string') {
    const h = sha256Hex_(req.token);
    const s = table_('sessions').rows.filter(function (r) { return r.tokenHash === h && r.kind === 'staff'; })[0];
    if (s && s.expiresAt > now) {
      const m = memberById_(s.memberId);
      if (canLogin_(m)) { ctx.me = meOf_(m); ctx.session = s; }
    }
  }
  if (req.viewToken && typeof req.viewToken === 'string') {
    const h2 = sha256Hex_(req.viewToken);
    const v = table_('sessions').rows.filter(function (r) { return r.tokenHash === h2 && r.kind === 'view'; })[0];
    if (v && v.expiresAt > now) ctx.view = true;
  }
}

function requireRole_(ctx, perms) {
  if (!ctx.me) throw err_('auth', 'ログインが必要です。');
  if (perms.indexOf(ctx.me.perm) < 0) throw err_('forbidden', 'この操作をする権限がありません。');
  return ctx.me;
}

function staffList_() {
  return members_().filter(canLogin_).map(function (m) { return { id: m.id, name: m.name, perm: m.perm }; });
}

function killSessions_(memberId, keepHash) {
  removeMany_('sessions', table_('sessions').rows.filter(function (r) { return r.memberId === memberId && r.tokenHash !== keepHash; }));
}

function opLogin_(ctx) {
  const id = String(ctx.req.memberId || '');
  const pin = String(ctx.req.pin == null ? '' : ctx.req.pin);
  return withLock_(function () {
    const m = memberById_(id);
    const bad = err_('login_failed', '名前か暗証番号が違います。');
    if (!canLogin_(m)) throw bad;
    const s = m.set;
    const now = now_();
    if (s.lockUntil && s.lockUntil > now) {
      throw err_('locked', '暗証番号を続けてまちがえたため、' + s.lockUntil.slice(11, 16) + ' までログインできません。');
    }
    if (pinHash_(s.pinSalt, pin) !== s.pinHash) {
      const n = (parseInt(s.failCount, 10) || 0) + 1;
      s.failCount = String(n);
      if (n % LOCK_EVERY === 0) s.lockUntil = nowPlusMin_(LOCK_MINUTES);
      update_('people', s);
      log_(meOf_(m), 'ログイン失敗', n + '回目');
      throw bad;
    }
    s.failCount = '0'; s.lockUntil = '';
    update_('people', s);
    removeMany_('sessions', table_('sessions').rows.filter(function (r) { return r.expiresAt <= now; }));
    const token = randomHex_();
    insert_('sessions', [{ tokenHash: sha256Hex_(token), memberId: m.id, kind: 'staff', createdAt: now, expiresAt: nowPlusMin_(SESSION_DAYS * 1440) }]);
    const me = meOf_(m);
    log_(me, 'ログイン', '');
    return { ok: true, token: token, me: me };
  });
}

function opLogout_(ctx) {
  if (!ctx.session) return { ok: true };
  return withLock_(function () {
    const h = ctx.session.tokenHash;
    removeMany_('sessions', table_('sessions').rows.filter(function (r) { return r.tokenHash === h; }));
    return { ok: true };
  });
}

function opChangePin_(ctx) {
  const me = requireRole_(ctx, ['admin', 'manager', 'leader']);
  const oldPin = String(ctx.req.oldPin == null ? '' : ctx.req.oldPin);
  const newPin = String(ctx.req.newPin == null ? '' : ctx.req.newPin);
  checkPinFormat_(newPin);
  if (oldPin === newPin) throw err_('bad_pin', '今と違う暗証番号にしてください。');
  return withLock_(function () {
    const m = memberById_(me.id);
    const s = m.set;
    if (pinHash_(s.pinSalt, oldPin) !== s.pinHash) throw err_('login_failed', '今の暗証番号が違います。');
    s.pinSalt = randomHex_().slice(0, 32);
    s.pinHash = pinHash_(s.pinSalt, newPin);
    s.mustChange = '0'; s.updatedAt = now_();
    update_('people', s);
    killSessions_(me.id, ctx.session.tokenHash);
    log_(me, '暗証番号を変更', '');
    return { ok: true, me: meOf_(m) };
  });
}

function opViewLogin_(ctx) {
  const pass = String(ctx.req.pass == null ? '' : ctx.req.pass);
  const cache = CacheService.getScriptCache();
  const fails = parseInt(cache.get('viewFails') || '0', 10);
  if (fails >= 20) throw err_('locked', 'まちがいが続いたため、しばらく入力できません。10分ほど待ってください。');
  const hash = setting_('viewPassHash');
  if (!hash) return { ok: true, viewToken: '' };
  if (pinHash_(setting_('viewPassSalt'), pass) !== hash) {
    cache.put('viewFails', String(fails + 1), 600);
    throw err_('login_failed', '合言葉が違います。');
  }
  return withLock_(function () {
    const token = randomHex_();
    insert_('sessions', [{ tokenHash: sha256Hex_(token), memberId: '', kind: 'view', createdAt: now_(), expiresAt: nowPlusMin_(VIEW_SESSION_DAYS * 1440) }]);
    return { ok: true, viewToken: token };
  });
}

// ---------------------------------------------------------------------------
// 部員の状態（在籍・その日の所属と取り組み方）
// ---------------------------------------------------------------------------
function inRoster_(m, date) {
  if (!m.player || m.gone && !m.left) return false;
  if (m.start && date < m.start) return false;
  if (m.left && date >= m.left) return false;
  if (!m.active && !m.left) return false;
  return true;
}
function historyIndex_() {
  const by = {};
  table_('history').rows.forEach(function (h) { (by[h.memberId] = by[h.memberId] || []).push(h); });
  for (const k in by) by[k].sort(function (a, b) { return a.effDate < b.effDate ? -1 : a.effDate > b.effDate ? 1 : a._r - b._r; });
  return by;
}
/** その日の時点のグループ・取り組み方・ポジション。設定を変えても過去の日付の答えは変わらない */
function stateAt_(m, date, hist) {
  const list = hist[m.id];
  if (!list || !list.length) return { group: m.group, mode: m.mode, position: m.position, subs: m.subs };
  let pick = list[0];
  for (let i = 0; i < list.length; i++) { if (list[i].effDate <= date) pick = list[i]; else break; }
  return { group: pick.group, mode: pick.mode, position: pick.position, subs: pick.subPositions ? pick.subPositions.split(',') : [] };
}
/** メニューの対象者：その日の時点でメニュー参加の人のうち、ポジション指定があればそのポジション（サブも含む）、なければグループで絞る */
function computeTargets_(date, group, positions, hist) {
  const ids = [];
  members_().forEach(function (m) {
    if (!inRoster_(m, date)) return;
    const st = stateAt_(m, date, hist);
    if (st.mode !== 'leader') return;
    if (positions.length) {
      const mine = [st.position].concat(st.subs).filter(Boolean);
      if (!mine.some(function (p) { return positions.indexOf(p) >= 0; })) return;
    } else if (group !== 'ALL' && st.group !== group) return;
    ids.push(m.id);
  });
  return ids;
}
function menuPositions_(w) { return w.positions ? w.positions.split(',').filter(Boolean) : []; }
function targetMap_(date) {
  const map = {};
  table_('menus').rows.forEach(function (w) {
    if (w.deletedAt || w.date !== date) return;
    w.targets.split(',').forEach(function (id) { if (id) (map[id] = map[id] || []).push(w.id); });
  });
  return map;
}
/** メニューや設定が変わったとき、その日の記録の「メニュー対象」をそろえる（過去の日付は対象外→対象だけ） */
function syncRecordTargets_(date) {
  const today = today_();
  const map = targetMap_(date);
  table_('records').rows.forEach(function (r) {
    if (r.date !== date) return;
    const want = map[r.memberId] ? '1' : '0';
    if (r.target === want) return;
    if (want === '0' && date < today) return;
    r.target = want; r.menuIds = (map[r.memberId] || []).join(',');
    update_('records', r);
  });
}
/** 今日以降のメニューの対象者を、今の設定で作り直す */
function refreshFutureTargets_() {
  const today = today_();
  const hist = historyIndex_();
  const dates = {};
  table_('menus').rows.forEach(function (w) {
    if (w.deletedAt || w.date < today) return;
    const t = computeTargets_(w.date, w.group, menuPositions_(w), hist).join(',');
    if (t !== w.targets) { w.targets = t; update_('menus', w); dates[w.date] = 1; }
  });
  if (dates[today]) syncRecordTargets_(today);
}

// ---------------------------------------------------------------------------
// 読み取り
// ---------------------------------------------------------------------------
function memberWire_(m, admin) {
  const o = {
    id: m.id, name: m.name, grade: m.grade, clubRole: m.clubRole, group: m.group, position: m.position, subs: m.subs,
    player: m.player, active: m.active && !m.gone, start: m.start, left: m.left, sort: m.order,
    mode: m.mode, perm: m.perm, finance: m.finance
  };
  if (admin) {
    const s = m.set || {};
    o.pinSet = !!s.pinHash; o.mustChange = s.mustChange === '1';
    o.locked = !!(s.lockUntil && s.lockUntil > now_());
  }
  return o;
}
function menuWire_(w) {
  return {
    id: w.id, date: w.date, group: w.group, positions: menuPositions_(w), title: w.title, content: w.content, detail: w.detail, note: w.note,
    targets: w.targets ? w.targets.split(',') : [], createdBy: w.createdBy, updatedAt: w.updatedAt || w.createdAt
  };
}
function recordsWire_(from, to) {
  const out = [];
  table_('records').rows.forEach(function (r) {
    if (r.date < from || r.date > to) return;
    out.push([r.memberId, r.date, r.status === 'done' ? 1 : 0, r.target === '1' ? 1 : 0, r.updatedBy || r.createdBy, r.createdBy]);
  });
  return out;
}

function opState_(ctx) {
  const today = today_();
  const locked = !!setting_('viewPassHash') && !ctx.me && !ctx.view;
  const base = { ok: true, version: APP_VERSION, today: today, me: ctx.me, staff: staffList_(), viewLock: !!setting_('viewPassHash'), weekGoal: weekGoal_(), positions: positionsList_() };
  if (locked) { base.locked = true; return base; }
  let from = ctx.req.from ? reqDate_(ctx.req.from, '開始日') : addDays_(today, -DEFAULT_BACK_DAYS);
  let to = ctx.req.to ? reqDate_(ctx.req.to, '終了日') : addDays_(today, DEFAULT_AHEAD_DAYS);
  if (to < from) { const x = from; from = to; to = x; }
  if (addDays_(from, MAX_RANGE_DAYS) < to) from = addDays_(to, -MAX_RANGE_DAYS);
  const admin = !!(ctx.me && ctx.me.perm === 'admin');
  base.range = { from: from, to: to };
  base.members = members_().map(function (m) { return memberWire_(m, admin); });
  base.menus = table_('menus').rows.filter(function (w) { return !w.deletedAt && w.date >= from && w.date <= to; }).map(menuWire_);
  base.records = recordsWire_(from, to);
  return base;
}

// ---------------------------------------------------------------------------
// 実施記録（管理者・マネージャー）。「実施した」だけを記録する。記録の無い対象日は、翌日から「実施していない」になる
// ---------------------------------------------------------------------------
function opSaveRecords_(ctx) {
  const me = requireRole_(ctx, ['admin', 'manager']);
  const date = reqDate_(ctx.req.date);
  if (date > today_()) throw err_('future_date', '未来の日付は記録できません。');
  const items = Array.isArray(ctx.req.items) ? ctx.req.items : [];
  if (!items.length) throw err_('empty', '記録する内容がありません。');
  if (items.length > 500) throw err_('too_many', '一度に送る件数が多すぎます。');
  return withLock_(function () {
    const existing = {};
    table_('records').rows.forEach(function (r) { if (r.date === date) existing[r.memberId] = r; });
    const tgt = targetMap_(date);
    const now = now_();
    const inserts = [], removes = [], logs = [], rejected = [], seen = {};
    let updated = 0, unchanged = 0;
    items.forEach(function (it) {
      const id = String((it && it.memberId) || '');
      const done = it && (it.done === true || it.status === 'done') ? true : it && (it.done === false || it.status === 'not') ? false : null;
      const m = memberById_(id);
      if (!m || done === null) { rejected.push({ memberId: id, reason: 'invalid', message: '内容が正しくありません。' }); return; }
      if (seen[id]) return;
      seen[id] = 1;
      const ex = existing[id];
      if (done) {
        if (ex && ex.status === 'done') { unchanged++; return; }
        if (ex) {
          ex.status = 'done'; ex.updatedBy = me.id; ex.updatedAt = now;
          update_('records', ex); updated++;
          logs.push(logRow_(me, '記録を修正', m.name + ' ' + date + '：実施した'));
          return;
        }
        if (!inRoster_(m, date)) {
          rejected.push({ memberId: id, name: m.name, reason: 'not_in_roster', message: 'この日は記録の対象ではありません。' });
          return;
        }
        inserts.push({ memberId: id, date: date, status: 'done', target: tgt[id] ? '1' : '0', menuIds: (tgt[id] || []).join(','),
          createdBy: me.id, createdAt: now, updatedBy: '', updatedAt: '' });
        logs.push(logRow_(me, '記録を追加', m.name + ' ' + date + '：実施した'));
      } else {
        if (!ex) { unchanged++; return; }
        if (me.perm === 'manager' && ex.createdBy !== me.id) {
          rejected.push({ memberId: id, name: m.name, reason: 'not_owner', message: 'ほかの人が入力した記録は、管理者だけが取り消せます。' });
          return;
        }
        removes.push(ex);
        logs.push(logRow_(me, '記録を取り消し', m.name + ' ' + date + '：' + ENC.status[ex.status] + ' → 記録なし'));
      }
    });
    removeMany_('records', removes);
    insert_('records', inserts);
    insert_('logs', logs);
    return { ok: true, date: date, saved: inserts.length, removed: removes.length, updated: updated, unchanged: unchanged, rejected: rejected, records: recordsWire_(date, date) };
  });
}

function opDeleteRecord_(ctx) {
  const me = requireRole_(ctx, ['admin']);
  const date = reqDate_(ctx.req.date);
  const id = String(ctx.req.memberId || '');
  return withLock_(function () {
    const r = table_('records').rows.filter(function (x) { return x.memberId === id && x.date === date; })[0];
    if (!r) throw err_('not_found', 'その記録は見つかりません。');
    const m = memberById_(id);
    remove_('records', r);
    log_(me, '記録を削除', (m ? m.name : id) + ' ' + date + '：' + ENC.status[r.status] + ' → 記録なし');
    return { ok: true, date: date, records: recordsWire_(date, date) };
  });
}

// ---------------------------------------------------------------------------
// メニュー（管理者・FWリーダー）
// ---------------------------------------------------------------------------
function text_(v, max, label, required) {
  const s = String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim();
  if (required && !s) throw err_('required', label + 'を入力してください。');
  if (s.length > max) throw err_('too_long', label + 'は' + max + '文字以内にしてください。');
  return s;
}
function cleanPositions_(arr) {
  const codes = positionCodes_();
  const list = Array.isArray(arr) ? arr : [];
  const out = [];
  list.forEach(function (p) {
    const s = String(p || '');
    if (!s) return;
    if (codes.indexOf(s) < 0) throw err_('bad_position', 'ポジション「' + s + '」が正しくありません。');
    if (out.indexOf(s) < 0) out.push(s);
  });
  return codes.filter(function (c) { return out.indexOf(c) >= 0; });
}
function groupOfPositions_(list) {
  const gs = {};
  positionsList_().forEach(function (p) { if (list.indexOf(p.code) >= 0) gs[p.group] = 1; });
  const keys = Object.keys(gs);
  return keys.length === 1 ? keys[0] : 'ALL';
}
function menuLabel_(w) {
  const pos = menuPositions_(w);
  return w.title + '（' + w.date + '・' + (pos.length ? pos.join('/') : ENC.mgroup[w.group]) + '）';
}

function opSaveMenu_(ctx) {
  const me = requireRole_(ctx, ['admin', 'leader']);
  const src = ctx.req.menu || {};
  const positions = cleanPositions_(src.positions);
  const data = {
    date: reqDate_(src.date, '実施予定日'),
    group: positions.length ? groupOfPositions_(positions) : (['FW', 'BK', 'ALL'].indexOf(src.group) >= 0 ? src.group : null),
    positions: positions.join(','),
    title: text_(src.title, 60, 'メニュー名', true),
    content: text_(src.content, 3000, 'トレーニング内容', true),
    detail: text_(src.detail, 3000, '回数・セット数・重量', false),
    note: text_(src.note, 1000, '備考', false)
  };
  if (!data.group) throw err_('bad_group', '対象グループを選んでください。');
  return withLock_(function () {
    const hist = historyIndex_();
    const now = now_();
    let w;
    if (src.id) {
      w = table_('menus').rows.filter(function (x) { return x.id === String(src.id) && !x.deletedAt; })[0];
      if (!w) throw err_('not_found', 'そのメニューは見つかりません。削除された可能性があります。');
      const oldDate = w.date;
      const moved = w.date !== data.date || w.group !== data.group || w.positions !== data.positions;
      const before = menuLabel_(w);
      Object.assign(w, { title: data.title, content: data.content, detail: data.detail, note: data.note, date: data.date, group: data.group, positions: data.positions });
      if (moved || w.date >= today_()) w.targets = computeTargets_(w.date, w.group, positions, hist).join(',');
      w.updatedBy = me.id; w.updatedAt = now;
      update_('menus', w);
      syncRecordTargets_(w.date);
      if (oldDate !== w.date) syncRecordTargets_(oldDate);
      log_(me, 'メニューを編集', before + ' → ' + menuLabel_(w));
    } else {
      w = {
        id: 'w' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), date: data.date, group: data.group, positions: data.positions,
        title: data.title, content: data.content, detail: data.detail, note: data.note,
        targets: computeTargets_(data.date, data.group, positions, hist).join(','),
        createdBy: me.id, createdAt: now, updatedBy: '', updatedAt: '', deletedBy: '', deletedAt: ''
      };
      insert_('menus', [w]);
      syncRecordTargets_(w.date);
      log_(me, 'メニューを作成', menuLabel_(w) + '・対象' + (w.targets ? w.targets.split(',').length : 0) + '人');
    }
    return { ok: true, menu: menuWire_(w) };
  });
}

function opDeleteMenu_(ctx) {
  const me = requireRole_(ctx, ['admin', 'leader']);
  const id = String(ctx.req.id || '');
  return withLock_(function () {
    const w = table_('menus').rows.filter(function (x) { return x.id === id && !x.deletedAt; })[0];
    if (!w) throw err_('not_found', 'そのメニューは見つかりません。');
    w.deletedBy = me.id; w.deletedAt = now_();
    update_('menus', w);
    syncRecordTargets_(w.date);
    log_(me, 'メニューを削除', menuLabel_(w));
    return { ok: true, id: id };
  });
}

// ---------------------------------------------------------------------------
// 部員（管理者）。名簿の項目は共通名簿へ、筋トレの項目はこのシートへ書く
// ---------------------------------------------------------------------------
function activeAdmins_() {
  return members_().filter(function (m) { return m.active && !m.gone && m.perm === 'admin'; });
}
function describe_(m) {
  const pos = m.position ? m.position + (m.subs.length ? '/' + m.subs.join('/') : '') : (m.group || '－');
  return (m.player ? pos + '・' + ENC.mode[m.mode] : '選手以外') + '・' + ENC.perm[m.perm];
}

/** 筋トレの項目（取り組み方・権限・開始日）を書き、必要なら履歴を足す */
function applyAppFields_(m, d, me, now) {
  const s = peopleRow_(m);
  const modeChanged = d.mode !== undefined && s.mode !== d.mode;
  const permChanged = d.perm !== undefined && s.perm !== d.perm;
  if (d.mode !== undefined) s.mode = d.mode;
  if (d.perm !== undefined) s.perm = d.perm;
  if (d.start !== undefined) s.start = d.start;
  s.nameMemo = m.name; s.updatedAt = now;
  if (permChanged && !STAFF[s.perm]) { s.pinHash = ''; s.pinSalt = ''; s.mustChange = '0'; s.failCount = '0'; s.lockUntil = ''; }
  update_('people', s);
  m.mode = s.mode; m.perm = s.perm; m.start = s.start;
  if (permChanged) killSessions_(m.id, '');
  return { modeChanged: modeChanged, permChanged: permChanged };
}
function rosterPatch_(m, d) {
  const p = {};
  if (d.grade !== undefined && d.grade !== m.grade) p.grade = d.grade;
  if (d.clubRole !== undefined && d.clubRole !== m.clubRole) p.role = d.clubRole;
  if (d.position !== undefined && d.position !== m.position) p.position = d.position;
  if (d.subs !== undefined && d.subs.join(',') !== m.subs.join(',')) p.subPositions = d.subs;
  const pos = d.position !== undefined ? d.position : m.position;
  if (d.group !== undefined && d.group !== m.group && !pos) p.group = d.group;
  return p;
}
function memberInput_(src, isNew) {
  const d = {};
  if (isNew) d.name = text_(src.name, 30, '名前', true);
  if (src.grade !== undefined) d.grade = text_(src.grade, 10, '学年', false);
  if (src.clubRole !== undefined) d.clubRole = text_(src.clubRole, 20, '役割', false) || '部員';
  if (src.position !== undefined) {
    d.position = src.position ? cleanPositions_([src.position])[0] : '';
  }
  if (src.subs !== undefined) d.subs = cleanPositions_(src.subs).filter(function (p) { return p !== (d.position !== undefined ? d.position : ''); });
  if (src.group !== undefined) {
    if (src.group && ['FW', 'BK'].indexOf(src.group) < 0) throw err_('bad_group', 'グループは FW か BK です。');
    d.group = src.group || '';
  }
  if (src.mode !== undefined) d.mode = src.mode === 'leader' ? 'leader' : 'self';
  if (src.perm !== undefined) {
    if (!ENC.perm[src.perm]) throw err_('bad_perm', '権限が正しくありません。');
    d.perm = src.perm;
  }
  if (src.start !== undefined) d.start = src.start ? reqDate_(src.start, '開始日') : '';
  return d;
}

function opSaveMember_(ctx) {
  const me = requireRole_(ctx, ['admin']);
  const src = ctx.req.member || {};
  const isNew = !src.id;
  const d = memberInput_(src, isNew);
  return withLock_(function () {
    const now = now_(), today = today_();
    let m;
    if (isNew) {
      const res = rosterLib_().add([{ name: d.name, grade: d.grade || '', role: d.clubRole || '部員', group: d.group || '', position: d.position || '', subPositions: d.subs || [] }]);
      if (!res.added.length) {
        const sk = res.skipped[0] || {};
        throw err_('duplicate', sk.reason === 'inactive'
          ? '同じ名前の人が名簿にいます（在籍なし）。部員の一覧の「削除した部員」から戻してください。'
          : '同じ名前の部員が名簿にすでにいます。');
      }
      REQ_.roster = null; REQ_.members = null;
      m = memberById_(res.added[0].id);
      applyAppFields_(m, d, me, now);
      addHistory_(m, OLD_DATE, now, me.id, historyIndex_(), null);
      log_(me, '部員を追加', m.name + '（' + describe_(m) + '）');
    } else {
      m = memberById_(src.id);
      if (!m || m.gone) throw err_('not_found', 'その部員は見つかりません。');
      if (m.perm === 'admin' && d.perm && d.perm !== 'admin' && activeAdmins_().length <= 1) {
        throw err_('last_admin', '管理者が1人もいなくなるので変更できません。先に別の人を管理者にしてください。');
      }
      const before = m.name + '（' + describe_(m) + '）';
      const patch = rosterPatch_(m, d);
      if (Object.keys(patch).length) {
        const r = rosterLib_().update(m.id, patch);
        Object.assign(m, { grade: r.grade, clubRole: r.role, group: r.group, position: r.position, subs: r.subPositions, player: r.player, finance: r.finance });
      }
      const ch = applyAppFields_(m, d, me, now);
      if (patch.position !== undefined || patch.subPositions !== undefined || patch.group !== undefined || ch.modeChanged) {
        addHistory_(m, today, now, me.id, historyIndex_(), null);
      }
      log_(me, '部員を編集', before + ' → ' + m.name + '（' + describe_(m) + '）');
    }
    REQ_.roster = null; REQ_.members = null;
    refreshFutureTargets_();
    return { ok: true, member: memberWire_(memberById_(m.id), true) };
  });
}

/** まとめて編集：rows = [{id, position, subs, mode}] */
function opBulkMembers_(ctx) {
  const me = requireRole_(ctx, ['admin']);
  const rows = Array.isArray(ctx.req.rows) ? ctx.req.rows : [];
  if (!rows.length) throw err_('empty', '変更がありません。');
  if (rows.length > 200) throw err_('too_many', '一度に変えられるのは200人までです。');
  const input = rows.map(function (r) { return { id: String(r.id || ''), d: memberInput_({ position: r.position, subs: r.subs, mode: r.mode }, false) }; });
  return withLock_(function () {
    const now = now_(), today = today_();
    let n = 0;
    const names = [];
    input.forEach(function (x) {
      const m = memberById_(x.id);
      if (!m || m.gone) return;
      const patch = rosterPatch_(m, x.d);
      if (Object.keys(patch).length) {
        const r = rosterLib_().update(m.id, patch);
        Object.assign(m, { group: r.group, position: r.position, subs: r.subPositions });
      }
      const ch = applyAppFields_(m, { mode: x.d.mode }, me, now);
      if (Object.keys(patch).length || ch.modeChanged) {
        addHistory_(m, today, now, me.id, historyIndex_(), null);
        n++; names.push(m.name);
      }
    });
    if (n) log_(me, '部員をまとめて編集', n + '人：' + names.join('、'));
    REQ_.roster = null; REQ_.members = null;
    refreshFutureTargets_();
    return { ok: true, changed: n };
  });
}

/** 一覧の貼り付け：rows = [{name, grade, position, subs, group, mode}]。名簿にいる人は更新、いない人は追加 */
function opImportMembers_(ctx) {
  const me = requireRole_(ctx, ['admin']);
  const rows = Array.isArray(ctx.req.rows) ? ctx.req.rows : [];
  if (!rows.length) throw err_('empty', '部員がいません。');
  if (rows.length > 200) throw err_('too_many', '一度に扱えるのは200人までです。');
  // 書いてある項目だけを使う（空の項目で名簿の値を消さない）
  const input = rows.map(function (r) {
    const src = { name: r.name };
    if (r.position) src.position = r.position;
    if (r.subs && r.subs.length) src.subs = r.subs;
    if (r.group) src.group = r.group;
    if (r.mode) src.mode = r.mode;
    if (r.grade) src.grade = r.grade;
    return memberInput_(src, true);
  });
  return withLock_(function () {
    const now = now_(), today = today_();
    const byKey = {};
    members_().forEach(function (m) { if (!m.gone) byKey[nameKey_(m.name)] = m; });
    const toAdd = [], updated = [], skipped = [];
    input.forEach(function (d) {
      const m = byKey[nameKey_(d.name)];
      if (!m) { toAdd.push(d); return; }
      if (!m.active) { skipped.push(m.name + '（在籍なし）'); return; }
      const patch = rosterPatch_(m, d);
      if (Object.keys(patch).length) {
        const r = rosterLib_().update(m.id, patch);
        Object.assign(m, { group: r.group, position: r.position, subs: r.subPositions, grade: r.grade });
      }
      const ch = applyAppFields_(m, { mode: d.mode }, me, now);
      if (Object.keys(patch).length || ch.modeChanged) { addHistory_(m, today, now, me.id, historyIndex_(), null); updated.push(m.name); }
    });
    let added = [];
    if (toAdd.length) {
      const res = rosterLib_().add(toAdd.map(function (d) {
        return { name: d.name, grade: d.grade || '', group: d.group || '', position: d.position || '', subPositions: d.subs || [] };
      }));
      REQ_.roster = null; REQ_.members = null;
      res.added.forEach(function (r) {
        const m = memberById_(r.id);
        const d = toAdd.filter(function (x) { return nameKey_(x.name) === nameKey_(r.name); })[0];
        applyAppFields_(m, { mode: d.mode, perm: 'member' }, me, now);
        addHistory_(m, OLD_DATE, now, me.id, historyIndex_(), null);
      });
      added = res.added.map(function (r) { return r.name; });
      res.skipped.forEach(function (s) { skipped.push(s.name); });
    }
    log_(me, '部員の一覧を反映', '追加' + added.length + '人・変更' + updated.length + '人');
    REQ_.roster = null; REQ_.members = null;
    refreshFutureTargets_();
    return { ok: true, added: added.length, updated: updated.length, skipped: skipped };
  });
}

function opSetMemberActive_(ctx) {
  const me = requireRole_(ctx, ['admin']);
  const id = String(ctx.req.id || '');
  const active = !!ctx.req.active;
  return withLock_(function () {
    const m = memberById_(id);
    if (!m || m.gone) throw err_('not_found', 'その部員は見つかりません。');
    if (!active) {
      if (m.id === me.id) throw err_('self', '自分自身は外せません。');
      if (m.perm === 'admin' && activeAdmins_().length <= 1) throw err_('last_admin', '管理者が1人もいなくなるので外せません。');
    }
    rosterLib_().update(m.id, { active: active });
    const s = peopleRow_(m);
    s.left = active ? '' : today_(); s.updatedAt = now_();
    update_('people', s);
    if (!active) killSessions_(m.id, '');
    log_(me, active ? '部員を戻す' : '部員の在籍を外す', m.name + (active ? '' : '（過去の記録は残ります）'));
    REQ_.roster = null; REQ_.members = null;
    refreshFutureTargets_();
    return { ok: true, member: memberWire_(memberById_(m.id), true) };
  });
}

function opResetPin_(ctx) {
  const me = requireRole_(ctx, ['admin']);
  const id = String(ctx.req.id || '');
  return withLock_(function () {
    const m = memberById_(id);
    if (!m || !m.active || m.gone) throw err_('not_found', 'その部員は見つかりません。');
    if (!STAFF[m.perm]) throw err_('not_staff', '一般部員はログインしないので、暗証番号はありません。');
    const pin = issuePin_(m);
    log_(me, '暗証番号を発行', m.name);
    return { ok: true, id: m.id, name: m.name, tempPin: pin };
  });
}
function issuePin_(m) {
  const pin = randomPin_();
  const s = peopleRow_(m);
  s.pinSalt = randomHex_().slice(0, 32);
  s.pinHash = pinHash_(s.pinSalt, pin);
  s.mustChange = '1'; s.failCount = '0'; s.lockUntil = ''; s.updatedAt = now_();
  update_('people', s);
  killSessions_(m.id, '');
  return pin;
}

// ---------------------------------------------------------------------------
// 操作履歴・設定（管理者）
// ---------------------------------------------------------------------------
function opLogs_(ctx) {
  requireRole_(ctx, ['admin']);
  const limit = Math.min(Math.max(parseInt(ctx.req.limit, 10) || 100, 1), 500);
  const offset = Math.max(parseInt(ctx.req.offset, 10) || 0, 0);
  const rows = table_('logs').rows;
  const out = [];
  for (let i = rows.length - 1 - offset; i >= 0 && out.length < limit; i--) {
    const r = rows[i];
    out.push({ at: r.at, name: r.actorName, role: r.role, action: r.action, detail: r.detail });
  }
  return { ok: true, logs: out, total: rows.length };
}

function opSaveSettings_(ctx) {
  const me = requireRole_(ctx, ['admin']);
  return withLock_(function () {
    if (ctx.req.weekGoal !== undefined) {
      const g = Number(ctx.req.weekGoal);
      if (!(g >= 1 && g <= 7 && Math.floor(g) === g)) throw err_('bad_goal', '週の目標回数は1〜7回で選んでください。');
      const before = weekGoal_();
      if (g !== before) {
        setSetting_('weekGoal', String(g));
        log_(me, '週の目標回数を変更', '週' + before + '回 → 週' + g + '回');
      }
    }
    if (ctx.req.viewPass !== undefined) {
      const p = String(ctx.req.viewPass == null ? '' : ctx.req.viewPass);
      if (p === '') {
        setSetting_('viewPassHash', ''); setSetting_('viewPassSalt', '');
        log_(me, '閲覧の合言葉を解除', '');
      } else {
        if (p.length < 4 || p.length > 64) throw err_('bad_pass', '合言葉は4文字以上にしてください。');
        const salt = randomHex_().slice(0, 32);
        setSetting_('viewPassSalt', salt); setSetting_('viewPassHash', pinHash_(salt, p));
        removeMany_('sessions', table_('sessions').rows.filter(function (r) { return r.kind === 'view'; }));
        log_(me, '閲覧の合言葉を設定', '');
      }
    }
    return { ok: true, viewLock: !!setting_('viewPassHash'), weekGoal: weekGoal_() };
  });
}

// ---------------------------------------------------------------------------
// スプレッドシートのメニュー（持ち主が最初に使う）
// ---------------------------------------------------------------------------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('筋トレ管理')
    .addItem('初期設定（シートを用意する）', 'setup')
    .addItem('管理者を登録／暗証番号を出し直す', 'menuRegisterAdmin')
    .addToUi();
}

/** シートと見出しを用意し、v1 のデータを共通名簿へ移す。何度実行してもよい */
function setup() {
  REQ_ = { tables: {}, ss: null, roster: null };
  try {
    withLock_(function () {
      prepareSheets_();
      migrateV1_();
      PropertiesService.getScriptProperties().setProperty('SCHEMA', SCHEMA_VERSION);
    });
    syncRoster_();
  } finally {
    REQ_ = null;
  }
  try { SpreadsheetApp.getActiveSpreadsheet().toast('準備ができました。', '筋トレ管理', 5); } catch (x) { /* noop */ }
  return 'ok';
}

/** 管理者を登録する。名簿にいる名前なら、その人を管理者にして暗証番号を出し直す */
function menuRegisterAdmin() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('管理者を登録', '管理者にする人の名前を入力してください（部員名簿にいる名前）。\n登録済みの名前なら、暗証番号を出し直します。', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const name = String(res.getResponseText() || '').trim();
  if (!name) { ui.alert('名前が空です。'); return; }
  const pin = registerAdmin_(name);
  ui.alert('管理者：' + name + '\n最初の暗証番号：' + pin + '\n\nアプリの「設定」→「ログイン」で入力すると、新しい暗証番号を決める画面になります。\nこの番号はここにしか表示されません。');
}
function registerAdmin_(name) {
  REQ_ = { tables: {}, ss: null, roster: null };
  try {
    ensureSchema_();
    return withLock_(function () {
      let m = members_().filter(function (x) { return !x.gone && x.active && nameKey_(x.name) === nameKey_(name); })[0];
      const now = now_();
      if (!m) {
        const r = rosterLib_().add([{ name: name, role: '部員' }]);
        REQ_.roster = null; REQ_.members = null;
        m = memberById_((r.added[0] || {}).id || (r.skipped[0] || {}).id);
        if (!m) throw new Error('名簿に追加できませんでした。');
      }
      applyAppFields_(m, { perm: 'admin' }, null, now);
      const pin = issuePin_(m);
      insert_('logs', [logRow_(null, '管理者を登録（スプレッドシートから）', m.name)]);
      return pin;
    });
  } finally {
    REQ_ = null;
  }
}

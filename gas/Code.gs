/**
 * KURFC 筋トレ管理アプリ — サーバー（Google Apps Script・スプレッドシートに紐付け）
 *
 * 画面は GitHub Pages（kurfc-rugby.github.io）に置き、このスクリプトを JSON API として呼ぶ。
 * データはこのスプレッドシートの各シートに保存する。権限チェックはすべてここで行う。
 *
 * 最初にやること：スプレッドシートのメニュー「筋トレ管理」→「初期設定」→「管理者を登録」
 * 詳しくは 04_ドキュメント/筋トレ管理アプリ_使い方と引き継ぎ.md
 */
const APP_VERSION = '1.0.0';
const TZ = 'Asia/Tokyo';
const SESSION_DAYS = 90;
const VIEW_SESSION_DAYS = 180;
const PIN_MIN = 6;
const PIN_MAX = 32;
const LOCK_EVERY = 5;        // この回数まちがえるごとにロック
const LOCK_MINUTES = 15;
const HASH_ROUNDS = 300;
const DEFAULT_BACK_DAYS = 100;
const DEFAULT_AHEAD_DAYS = 60;
const MAX_RANGE_DAYS = 800;

// ---------------------------------------------------------------------------
// シート定義（列は見出し名で探すので、並べ替えや列の追加に強い）
// ---------------------------------------------------------------------------
const DEF = {
  members: { name: '部員', cols: [
    ['id', 'ID'], ['name', '名前'], ['group', 'グループ'], ['mode', '取り組み方'], ['role', '権限'],
    ['player', '選手'], ['active', '在籍'], ['start', '開始日'], ['left', '退部日'], ['sort', '並び順'],
    ['pinHash', '暗証番号ハッシュ'], ['pinSalt', 'ソルト'], ['mustChange', '要変更'], ['failCount', '失敗回数'],
    ['lockUntil', 'ロック解除'], ['createdAt', '作成日時'], ['updatedAt', '更新日時']] },
  history: { name: '設定変更履歴', cols: [
    ['memberId', '部員ID'], ['effDate', '適用開始日'], ['group', 'グループ'], ['mode', '取り組み方'],
    ['by', '変更者ID'], ['at', '変更日時']] },
  menus: { name: 'メニュー', cols: [
    ['id', 'ID'], ['date', '実施予定日'], ['group', '対象グループ'], ['title', 'メニュー名'], ['content', 'トレーニング内容'],
    ['detail', '回数・セット数・重量'], ['note', '備考'], ['targets', '対象者ID'],
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

// シートに書く値 ⇔ 内部の値
const ENC = {
  mode: { leader: 'リーダーメニュー', self: '自主トレ' },
  role: { admin: '管理者', manager: 'マネージャー', leader: 'FWリーダー', member: '一般部員' },
  status: { done: '実施した', not: '実施していない' },
  mgroup: { FW: 'FW', BK: 'BK', ALL: '全体' },
  bool: { '1': 'はい', '0': 'いいえ' }
};
const FIELD_ENC = {
  members: { mode: 'mode', role: 'role', player: 'bool', active: 'bool', mustChange: 'bool' },
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
  REQ_ = { tables: {}, ss: null };
  try {
    if (!req || typeof req !== 'object') throw err_('bad_request', '送信内容が正しくありません。');
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
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    const id = PropertiesService.getScriptProperties().getProperty('SS_ID');
    if (id) ss = SpreadsheetApp.openById(id);
  }
  if (!ss) throw err_('no_sheet', 'スプレッドシートが見つかりません。初期設定を実行してください。');
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
  if (map[s] !== undefined) return s;      // 内部の値がそのまま入っていても読む
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
  // 数式として解釈されないようにする
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
// 定義にある列だけを書き換える（ほかの列を足していても壊さない）
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

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (x) {
    throw err_('busy', 'いま混み合っています。少し待ってもう一度試してください。');
  }
  try {
    if (REQ_) REQ_.tables = {}; // ロックを取ってから読み直す
    const res = fn();
    SpreadsheetApp.flush();
    return res;
  } finally {
    lock.releaseLock();
  }
}

function setting_(key) {
  const row = table_('settings').rows.filter(function (r) { return r.key === key; })[0];
  return row ? row.value : '';
}
function setSetting_(key, value) {
  const row = table_('settings').rows.filter(function (r) { return r.key === key; })[0];
  if (row) { row.value = value; update_('settings', row); } else insert_('settings', [{ key: key, value: value }]);
}

function log_(me, action, detail) {
  insert_('logs', [logRow_(me, action, detail)]);
}
function logRow_(me, action, detail) {
  return { at: now_(), actorId: me ? me.id : '', actorName: me ? me.name : '', role: me ? ENC.role[me.role] || me.role : '', action: action, detail: detail };
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
  let n = parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 1000000;
  return ('000000' + n).slice(-6);
}
function checkPinFormat_(pin) {
  if (typeof pin !== 'string' || pin.length < PIN_MIN || pin.length > PIN_MAX || !/^[\x21-\x7e]+$/.test(pin)) {
    throw err_('bad_pin', '暗証番号は半角' + PIN_MIN + '文字以上にしてください。');
  }
}

function resolveSession_(ctx) {
  const req = ctx.req;
  const now = now_();
  if (req.token && typeof req.token === 'string') {
    const h = sha256Hex_(req.token);
    const s = table_('sessions').rows.filter(function (r) { return r.tokenHash === h && r.kind === 'staff'; })[0];
    if (s && s.expiresAt > now) {
      const m = table_('members').rows.filter(function (r) { return r.id === s.memberId; })[0];
      if (m && m.active === '1' && STAFF[m.role]) {
        ctx.me = { id: m.id, name: m.name, role: m.role, mustChange: m.mustChange === '1' };
        ctx.session = s;
      }
    }
  }
  if (req.viewToken && typeof req.viewToken === 'string') {
    const h2 = sha256Hex_(req.viewToken);
    const v = table_('sessions').rows.filter(function (r) { return r.tokenHash === h2 && r.kind === 'view'; })[0];
    if (v && v.expiresAt > now) ctx.view = true;
  }
}

function requireRole_(ctx, roles) {
  if (!ctx.me) throw err_('auth', 'ログインが必要です。');
  if (roles.indexOf(ctx.me.role) < 0) throw err_('forbidden', 'この操作をする権限がありません。');
  return ctx.me;
}

function staffList_() {
  return table_('members').rows.filter(function (m) { return m.active === '1' && STAFF[m.role]; })
    .map(function (m) { return { id: m.id, name: m.name, role: m.role }; });
}

function opLogin_(ctx) {
  const id = String(ctx.req.memberId || '');
  const pin = String(ctx.req.pin == null ? '' : ctx.req.pin);
  return withLock_(function () {
    const m = table_('members').rows.filter(function (r) { return r.id === id; })[0];
    const bad = err_('login_failed', '名前か暗証番号が違います。');
    if (!m || m.active !== '1' || !STAFF[m.role] || !m.pinHash) throw bad;
    const now = now_();
    if (m.lockUntil && m.lockUntil > now) {
      throw err_('locked', '暗証番号を続けてまちがえたため、' + m.lockUntil.slice(11, 16) + ' までログインできません。');
    }
    if (pinHash_(m.pinSalt, pin) !== m.pinHash) {
      const n = (parseInt(m.failCount, 10) || 0) + 1;
      m.failCount = String(n);
      if (n % LOCK_EVERY === 0) m.lockUntil = nowPlusMin_(LOCK_MINUTES);
      update_('members', m);
      log_({ id: m.id, name: m.name, role: m.role }, 'ログイン失敗', n + '回目');
      throw bad;
    }
    m.failCount = '0'; m.lockUntil = '';
    update_('members', m);
    // 期限切れのログイン情報を片付ける
    const t = table_('sessions');
    t.rows.filter(function (r) { return r.expiresAt <= now; })
      .sort(function (a, b) { return b._r - a._r; })
      .forEach(function (r) { remove_('sessions', r); });
    const token = randomHex_();
    insert_('sessions', [{ tokenHash: sha256Hex_(token), memberId: m.id, kind: 'staff', createdAt: now, expiresAt: nowPlusMin_(SESSION_DAYS * 1440) }]);
    const me = { id: m.id, name: m.name, role: m.role, mustChange: m.mustChange === '1' };
    log_(me, 'ログイン', '');
    return { ok: true, token: token, me: me };
  });
}

function opLogout_(ctx) {
  if (!ctx.session) return { ok: true };
  return withLock_(function () {
    const h = ctx.session.tokenHash;
    const s = table_('sessions').rows.filter(function (r) { return r.tokenHash === h; })[0];
    if (s) remove_('sessions', s);
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
    const m = table_('members').rows.filter(function (r) { return r.id === me.id; })[0];
    if (pinHash_(m.pinSalt, oldPin) !== m.pinHash) throw err_('login_failed', '今の暗証番号が違います。');
    m.pinSalt = randomHex_().slice(0, 32);
    m.pinHash = pinHash_(m.pinSalt, newPin);
    m.mustChange = '0'; m.updatedAt = now_();
    update_('members', m);
    // ほかの端末のログインを切る
    const keep = ctx.session.tokenHash;
    table_('sessions').rows.filter(function (r) { return r.memberId === me.id && r.kind === 'staff' && r.tokenHash !== keep; })
      .sort(function (a, b) { return b._r - a._r; })
      .forEach(function (r) { remove_('sessions', r); });
    log_(me, '暗証番号を変更', '');
    return { ok: true, me: { id: m.id, name: m.name, role: m.role, mustChange: false } };
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
  if (m.player !== '1') return false;
  if (m.start && date < m.start) return false;
  if (m.left && date >= m.left) return false;
  return true;
}
// その日の時点のグループと取り組み方。設定を変えても過去の日付の答えは変わらない
function stateAt_(m, date, histByMember) {
  const list = histByMember[m.id];
  if (!list || !list.length) return { group: m.group, mode: m.mode };
  let pick = list[0];
  for (let i = 0; i < list.length; i++) { if (list[i].effDate <= date) pick = list[i]; else break; }
  return { group: pick.group, mode: pick.mode };
}
function historyIndex_() {
  const by = {};
  table_('history').rows.forEach(function (h) { (by[h.memberId] = by[h.memberId] || []).push(h); });
  for (const k in by) by[k].sort(function (a, b) { return a.effDate < b.effDate ? -1 : a.effDate > b.effDate ? 1 : a._r - b._r; });
  return by;
}
function computeTargets_(date, group, members, hist) {
  const ids = [];
  members.forEach(function (m) {
    if (!inRoster_(m, date)) return;
    const st = stateAt_(m, date, hist);
    if (st.mode !== 'leader') return;
    if (group !== 'ALL' && st.group !== group) return;
    ids.push(m.id);
  });
  return ids;
}
// その日の「部員ID → 対象メニューIDの一覧」
function targetMap_(date) {
  const map = {};
  table_('menus').rows.forEach(function (w) {
    if (w.deletedAt || w.date !== date) return;
    w.targets.split(',').forEach(function (id) { if (id) (map[id] = map[id] || []).push(w.id); });
  });
  return map;
}
// メニューや設定が変わったとき、その日の記録の「メニュー対象」をそろえる。
// 今日以降は現在の内容に合わせる。過去の日付は「対象外→対象」だけ行い、対象だった記録を対象外には戻さない
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
// 今日以降のメニューの対象者を、現在の設定で作り直す
function refreshFutureTargets_() {
  const today = today_();
  const members = table_('members').rows;
  const hist = historyIndex_();
  const dates = {};
  table_('menus').rows.forEach(function (w) {
    if (w.deletedAt || w.date < today) return;
    const t = computeTargets_(w.date, w.group, members, hist).join(',');
    if (t !== w.targets) { w.targets = t; update_('menus', w); dates[w.date] = 1; }
  });
  Object.keys(dates).forEach(function (d) { if (d === today) syncRecordTargets_(d); });
}

// ---------------------------------------------------------------------------
// 読み取り
// ---------------------------------------------------------------------------
function memberWire_(m, admin) {
  const o = {
    id: m.id, name: m.name, group: m.group, mode: m.mode, role: m.role, player: m.player === '1',
    active: m.active === '1', start: m.start, left: m.left, sort: parseInt(m.sort, 10) || 0
  };
  if (admin) {
    o.pinSet = !!m.pinHash; o.mustChange = m.mustChange === '1';
    o.locked = !!(m.lockUntil && m.lockUntil > now_());
  }
  return o;
}
function menuWire_(w) {
  return {
    id: w.id, date: w.date, group: w.group, title: w.title, content: w.content, detail: w.detail, note: w.note,
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
  const base = { ok: true, version: APP_VERSION, today: today, me: ctx.me, staff: staffList_(), viewLock: !!setting_('viewPassHash') };
  if (locked) { base.locked = true; return base; }
  let from = ctx.req.from ? reqDate_(ctx.req.from, '開始日') : addDays_(today, -DEFAULT_BACK_DAYS);
  let to = ctx.req.to ? reqDate_(ctx.req.to, '終了日') : addDays_(today, DEFAULT_AHEAD_DAYS);
  if (to < from) { const x = from; from = to; to = x; }
  if (addDays_(from, MAX_RANGE_DAYS) < to) from = addDays_(to, -MAX_RANGE_DAYS);
  const admin = !!(ctx.me && ctx.me.role === 'admin');
  base.range = { from: from, to: to };
  base.members = table_('members').rows.map(function (m) { return memberWire_(m, admin); });
  base.menus = table_('menus').rows.filter(function (w) { return !w.deletedAt && w.date >= from && w.date <= to; }).map(menuWire_);
  base.records = recordsWire_(from, to);
  return base;
}

// ---------------------------------------------------------------------------
// 実施記録（管理者・マネージャー）
// ---------------------------------------------------------------------------
function opSaveRecords_(ctx) {
  const me = requireRole_(ctx, ['admin', 'manager']);
  const date = reqDate_(ctx.req.date);
  if (date > today_()) throw err_('future_date', '未来の日付は記録できません。');
  const items = Array.isArray(ctx.req.items) ? ctx.req.items : [];
  if (!items.length) throw err_('empty', '記録する内容がありません。');
  if (items.length > 500) throw err_('too_many', '一度に送る件数が多すぎます。');
  return withLock_(function () {
    const byId = {};
    table_('members').rows.forEach(function (m) { byId[m.id] = m; });
    const existing = {};
    table_('records').rows.forEach(function (r) { existing[r.memberId + '|' + r.date] = r; });
    const tgt = targetMap_(date);
    const now = now_();
    const inserts = [], logs = [], rejected = [], seen = {};
    let updated = 0, unchanged = 0;
    items.forEach(function (it) {
      const id = String((it && it.memberId) || '');
      const st = it && (it.status === 'done' || it.status === 'not') ? it.status : null;
      const m = byId[id];
      if (!m || !st) { rejected.push({ memberId: id, reason: 'invalid', message: '内容が正しくありません。' }); return; }
      if (seen[id]) return;
      seen[id] = 1;
      const ex = existing[id + '|' + date];
      if (ex) {
        if (ex.status === st) { unchanged++; return; }
        if (me.role === 'manager' && ex.createdBy !== me.id) {
          rejected.push({ memberId: id, name: m.name, reason: 'not_owner', message: 'ほかの人が入力した記録は、管理者だけが修正できます。' });
          return;
        }
        const old = ex.status;
        ex.status = st; ex.updatedBy = me.id; ex.updatedAt = now;
        update_('records', ex);
        updated++;
        logs.push(logRow_(me, '記録を修正', m.name + ' ' + date + '：' + ENC.status[old] + ' → ' + ENC.status[st]));
      } else {
        if (!inRoster_(m, date)) {
          rejected.push({ memberId: id, name: m.name, reason: 'not_in_roster', message: 'この日は記録の対象ではありません。' });
          return;
        }
        inserts.push({
          memberId: id, date: date, status: st, target: tgt[id] ? '1' : '0', menuIds: (tgt[id] || []).join(','),
          createdBy: me.id, createdAt: now, updatedBy: '', updatedAt: ''
        });
        logs.push(logRow_(me, '記録を追加', m.name + ' ' + date + '：' + ENC.status[st]));
      }
    });
    insert_('records', inserts);
    insert_('logs', logs);
    return { ok: true, date: date, saved: inserts.length, updated: updated, unchanged: unchanged, rejected: rejected, records: recordsWire_(date, date) };
  });
}

function opDeleteRecord_(ctx) {
  const me = requireRole_(ctx, ['admin']);
  const date = reqDate_(ctx.req.date);
  const id = String(ctx.req.memberId || '');
  return withLock_(function () {
    const r = table_('records').rows.filter(function (x) { return x.memberId === id && x.date === date; })[0];
    if (!r) throw err_('not_found', 'その記録は見つかりません。');
    const m = table_('members').rows.filter(function (x) { return x.id === id; })[0];
    remove_('records', r);
    log_(me, '記録を削除', (m ? m.name : id) + ' ' + date + '：' + ENC.status[r.status] + ' → 未記録');
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

function opSaveMenu_(ctx) {
  const me = requireRole_(ctx, ['admin', 'leader']);
  const src = ctx.req.menu || {};
  const data = {
    date: reqDate_(src.date, '実施予定日'),
    group: ['FW', 'BK', 'ALL'].indexOf(src.group) >= 0 ? src.group : null,
    title: text_(src.title, 60, 'メニュー名', true),
    content: text_(src.content, 3000, 'トレーニング内容', true),
    detail: text_(src.detail, 3000, '回数・セット数・重量', false),
    note: text_(src.note, 1000, '備考', false)
  };
  if (!data.group) throw err_('bad_group', '対象グループを選んでください。');
  return withLock_(function () {
    const members = table_('members').rows;
    const hist = historyIndex_();
    const now = now_();
    let w;
    if (src.id) {
      w = table_('menus').rows.filter(function (x) { return x.id === String(src.id) && !x.deletedAt; })[0];
      if (!w) throw err_('not_found', 'そのメニューは見つかりません。削除された可能性があります。');
      const oldDate = w.date;
      const moved = w.date !== data.date || w.group !== data.group;
      const before = w.title + '（' + w.date + '・' + ENC.mgroup[w.group] + '）';
      w.title = data.title; w.content = data.content; w.detail = data.detail; w.note = data.note;
      w.date = data.date; w.group = data.group;
      // 日付か対象グループを変えたとき、または今日以降のメニューは対象者を作り直す。
      // 過去のメニューの文面だけを直したときは、登録時点の対象者をそのまま残す
      if (moved || w.date >= today_()) w.targets = computeTargets_(w.date, w.group, members, hist).join(',');
      w.updatedBy = me.id; w.updatedAt = now;
      update_('menus', w);
      syncRecordTargets_(w.date);
      if (oldDate !== w.date) syncRecordTargets_(oldDate);
      log_(me, 'メニューを編集', before + ' → ' + w.title + '（' + w.date + '・' + ENC.mgroup[w.group] + '）');
    } else {
      w = {
        id: 'w' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), date: data.date, group: data.group, title: data.title,
        content: data.content, detail: data.detail, note: data.note,
        targets: computeTargets_(data.date, data.group, members, hist).join(','),
        createdBy: me.id, createdAt: now, updatedBy: '', updatedAt: '', deletedBy: '', deletedAt: ''
      };
      insert_('menus', [w]);
      syncRecordTargets_(w.date);
      log_(me, 'メニューを作成', w.title + '（' + w.date + '・' + ENC.mgroup[w.group] + '・対象' + (w.targets ? w.targets.split(',').length : 0) + '人）');
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
    log_(me, 'メニューを削除', w.title + '（' + w.date + '・' + ENC.mgroup[w.group] + '）');
    return { ok: true, id: id };
  });
}

// ---------------------------------------------------------------------------
// 部員（管理者）
// ---------------------------------------------------------------------------
function nextMemberId_() {
  let max = 0;
  table_('members').rows.forEach(function (m) { const n = parseInt(String(m.id).replace(/^m/, ''), 10); if (n > max) max = n; });
  return 'm' + ('000' + (max + 1)).slice(-3);
}
function activeAdmins_() {
  return table_('members').rows.filter(function (m) { return m.active === '1' && m.role === 'admin'; });
}
function memberInput_(src) {
  const d = {
    name: text_(src.name, 30, '名前', true),
    player: src.player === false || src.player === '0' ? '0' : '1',
    group: ['FW', 'BK'].indexOf(src.group) >= 0 ? src.group : '',
    mode: src.mode === 'leader' ? 'leader' : 'self',
    role: ENC.role[src.role] ? src.role : 'member',
    start: src.start ? reqDate_(src.start, '開始日') : '',
    sort: String(parseInt(src.sort, 10) || 0)
  };
  if (d.player === '1' && !d.group) throw err_('bad_group', 'FW か BK を選んでください。');
  if (d.player !== '1') { d.group = ''; d.mode = 'self'; }
  return d;
}
function createMember_(d, me, now) {
  const m = {
    id: nextMemberId_(), name: d.name, group: d.group, mode: d.mode, role: d.role, player: d.player, active: '1',
    start: d.start, left: '', sort: d.sort, pinHash: '', pinSalt: '', mustChange: '0', failCount: '0', lockUntil: '',
    createdAt: now, updatedAt: ''
  };
  insert_('members', [m]);
  insert_('history', [{ memberId: m.id, effDate: d.start || '2000-01-01', group: m.group, mode: m.mode, by: me ? me.id : '', at: now }]);
  return m;
}
function describeMember_(m) {
  return (m.player === '1' ? (m.group + '・' + ENC.mode[m.mode]) : '選手ではない') + '・' + ENC.role[m.role];
}

function opSaveMember_(ctx) {
  const me = requireRole_(ctx, ['admin']);
  const src = ctx.req.member || {};
  const d = memberInput_(src);
  return withLock_(function () {
    const t = table_('members');
    const now = now_(), today = today_();
    const dup = t.rows.filter(function (x) { return x.name === d.name && x.active === '1' && x.id !== String(src.id || ''); })[0];
    if (dup) throw err_('duplicate', '同じ名前の部員がすでにいます。');
    let m;
    if (src.id) {
      m = t.rows.filter(function (x) { return x.id === String(src.id); })[0];
      if (!m) throw err_('not_found', 'その部員は見つかりません。');
      if (m.role === 'admin' && d.role !== 'admin' && m.active === '1' && activeAdmins_().length <= 1) {
        throw err_('last_admin', '管理者が1人もいなくなるので変更できません。先に別の人を管理者にしてください。');
      }
      const before = m.name + '（' + describeMember_(m) + '）';
      const changed = m.group !== d.group || m.mode !== d.mode;
      const roleChanged = m.role !== d.role;
      m.name = d.name; m.group = d.group; m.mode = d.mode; m.role = d.role; m.player = d.player; m.start = d.start; m.sort = d.sort;
      m.updatedAt = now;
      if (roleChanged && !STAFF[m.role]) { m.pinHash = ''; m.pinSalt = ''; m.mustChange = '0'; m.failCount = '0'; m.lockUntil = ''; }
      update_('members', m);
      if (changed) {
        // 今日から適用。過去の日付の所属・取り組み方は変えない
        const h = table_('history').rows.filter(function (x) { return x.memberId === m.id && x.effDate === today; })[0];
        if (h) { h.group = m.group; h.mode = m.mode; h.by = me.id; h.at = now; update_('history', h); }
        else insert_('history', [{ memberId: m.id, effDate: today, group: m.group, mode: m.mode, by: me.id, at: now }]);
      }
      if (roleChanged) {
        table_('sessions').rows.filter(function (r) { return r.memberId === m.id; })
          .sort(function (a, b) { return b._r - a._r; }).forEach(function (r) { remove_('sessions', r); });
      }
      log_(me, '部員を編集', before + ' → ' + m.name + '（' + describeMember_(m) + '）');
    } else {
      m = createMember_(d, me, now);
      log_(me, '部員を追加', m.name + '（' + describeMember_(m) + '）');
    }
    refreshFutureTargets_();
    return { ok: true, member: memberWire_(m, true) };
  });
}

function opImportMembers_(ctx) {
  const me = requireRole_(ctx, ['admin']);
  const rows = Array.isArray(ctx.req.rows) ? ctx.req.rows : [];
  if (!rows.length) throw err_('empty', '追加する部員がいません。');
  if (rows.length > 200) throw err_('too_many', '一度に追加できるのは200人までです。');
  const list = rows.map(function (r) { return memberInput_(Object.assign({}, r, { role: 'member' })); });
  return withLock_(function () {
    const now = now_();
    const names = {};
    table_('members').rows.forEach(function (x) { if (x.active === '1') names[x.name] = 1; });
    const added = [], skipped = [];
    list.forEach(function (d) {
      if (names[d.name]) { skipped.push(d.name); return; }
      names[d.name] = 1;
      added.push(createMember_(d, me, now));
    });
    if (added.length) log_(me, '部員をまとめて追加', added.length + '人：' + added.map(function (m) { return m.name; }).join('、'));
    refreshFutureTargets_();
    return { ok: true, added: added.length, skipped: skipped };
  });
}

function opSetMemberActive_(ctx) {
  const me = requireRole_(ctx, ['admin']);
  const id = String(ctx.req.id || '');
  const active = !!ctx.req.active;
  return withLock_(function () {
    const m = table_('members').rows.filter(function (x) { return x.id === id; })[0];
    if (!m) throw err_('not_found', 'その部員は見つかりません。');
    if (!active) {
      if (m.id === me.id) throw err_('self', '自分自身は削除できません。');
      if (m.role === 'admin' && activeAdmins_().length <= 1) throw err_('last_admin', '管理者が1人もいなくなるので削除できません。');
      m.active = '0'; m.left = today_();
      table_('sessions').rows.filter(function (r) { return r.memberId === m.id; })
        .sort(function (a, b) { return b._r - a._r; }).forEach(function (r) { remove_('sessions', r); });
    } else {
      const dup = table_('members').rows.filter(function (x) { return x.name === m.name && x.active === '1' && x.id !== m.id; })[0];
      if (dup) throw err_('duplicate', '同じ名前の部員がすでにいます。');
      m.active = '1'; m.left = '';
    }
    m.updatedAt = now_();
    update_('members', m);
    log_(me, active ? '部員を戻す' : '部員を削除', m.name + (active ? '' : '（過去の記録は残ります）'));
    refreshFutureTargets_();
    return { ok: true, member: memberWire_(m, true) };
  });
}

function opResetPin_(ctx) {
  const me = requireRole_(ctx, ['admin']);
  const id = String(ctx.req.id || '');
  return withLock_(function () {
    const m = table_('members').rows.filter(function (x) { return x.id === id; })[0];
    if (!m || m.active !== '1') throw err_('not_found', 'その部員は見つかりません。');
    if (!STAFF[m.role]) throw err_('not_staff', '一般部員はログインしないので、暗証番号はありません。');
    const pin = issuePin_(m);
    log_(me, '暗証番号を発行', m.name);
    return { ok: true, id: m.id, name: m.name, tempPin: pin };
  });
}
function issuePin_(m) {
  const pin = randomPin_();
  m.pinSalt = randomHex_().slice(0, 32);
  m.pinHash = pinHash_(m.pinSalt, pin);
  m.mustChange = '1'; m.failCount = '0'; m.lockUntil = ''; m.updatedAt = now_();
  update_('members', m);
  table_('sessions').rows.filter(function (r) { return r.memberId === m.id; })
    .sort(function (a, b) { return b._r - a._r; }).forEach(function (r) { remove_('sessions', r); });
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
    if (ctx.req.viewPass !== undefined) {
      const p = String(ctx.req.viewPass == null ? '' : ctx.req.viewPass);
      if (p === '') {
        setSetting_('viewPassHash', ''); setSetting_('viewPassSalt', '');
        log_(me, '閲覧の合言葉を解除', '');
      } else {
        if (p.length < 4 || p.length > 64) throw err_('bad_pass', '合言葉は4文字以上にしてください。');
        const salt = randomHex_().slice(0, 32);
        setSetting_('viewPassSalt', salt); setSetting_('viewPassHash', pinHash_(salt, p));
        table_('sessions').rows.filter(function (r) { return r.kind === 'view'; })
          .sort(function (a, b) { return b._r - a._r; }).forEach(function (r) { remove_('sessions', r); });
        log_(me, '閲覧の合言葉を設定', '');
      }
    }
    return { ok: true, viewLock: !!setting_('viewPassHash') };
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

/** シートと見出しを用意する。何度実行しても、すでにあるデータは消さない */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SS_ID', ss.getId());
  Object.keys(DEF).forEach(function (k) {
    const def = DEF[k];
    let sh = ss.getSheetByName(def.name);
    if (!sh) sh = ss.insertSheet(def.name);
    // 日付や番号が勝手に変換されないよう、全体を「書式なしテキスト」にする
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
    const lastCol = sh.getLastColumn();
    const head = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
    const missing = def.cols.filter(function (c) { return head.indexOf(c[1]) < 0; }).map(function (c) { return c[1]; });
    if (missing.length) sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]);
    sh.setFrozenRows(1);
  });
  const def = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  try { ss.toast('シートの準備ができました。次に「管理者を登録」を実行してください。', '筋トレ管理', 8); } catch (x) { /* noop */ }
  return 'ok';
}

/** 管理者を登録する。すでにいる人の名前を入れると、その人を管理者にして暗証番号を出し直す */
function menuRegisterAdmin() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('管理者を登録', '管理者にする人の名前を入力してください。\n（すでに登録済みの名前なら、暗証番号を出し直します）', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const name = String(res.getResponseText() || '').trim();
  if (!name) { ui.alert('名前が空です。'); return; }
  const pin = registerAdmin_(name);
  ui.alert('管理者：' + name + '\n最初の暗証番号：' + pin + '\n\nアプリの「設定」→「ログイン」で入力すると、新しい暗証番号を決める画面になります。\nこの番号はここにしか表示されません。');
}
function registerAdmin_(name) {
  REQ_ = { tables: {}, ss: null };
  try {
    return withLock_(function () {
      let m = table_('members').rows.filter(function (x) { return x.name === name && x.active === '1'; })[0];
      const now = now_();
      if (!m) {
        m = createMember_({ name: name, group: 'FW', mode: 'self', role: 'admin', player: '1', start: '', sort: '0' }, null, now);
      } else if (m.role !== 'admin') {
        m.role = 'admin'; update_('members', m);
      }
      const pin = issuePin_(m);
      insert_('logs', [logRow_(null, '管理者を登録（スプレッドシートから）', name)]);
      return pin;
    });
  } finally {
    REQ_ = null;
  }
}

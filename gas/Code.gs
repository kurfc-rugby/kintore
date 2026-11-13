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
const APP_VERSION = '2.7.0';
const SCHEMA_VERSION = '5';
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
    ['lockUntil', 'ロック解除'], ['createdAt', '作成日時'], ['updatedAt', '更新日時'], ['pinReqAt', '暗証番号の再発行依頼']] },
  history: { name: '設定変更履歴', cols: [
    ['memberId', '部員ID'], ['effDate', '適用開始日'], ['group', 'グループ'], ['mode', '取り組み方'],
    ['position', 'ポジション'], ['subPositions', 'サブポジション'], ['by', '変更者ID'], ['at', '変更日時']] },
  menus: { name: 'メニュー', cols: [
    ['id', 'ID'], ['date', '実施予定日'], ['group', '対象グループ'], ['positions', '対象ポジション'], ['title', 'メニュー名'],
    ['content', 'トレーニング内容'], ['detail', '回数・セット数・重量'], ['note', '備考'], ['targets', '対象者ID'],
    ['createdBy', '作成者ID'], ['createdAt', '作成日時'], ['updatedBy', '更新者ID'], ['updatedAt', '更新日時'],
    ['deletedBy', '削除者ID'], ['deletedAt', '削除日時'], ['video', '動画リンク'], ['templateId', '型ID']] },
  records: { name: '実施記録', cols: [
    ['memberId', '部員ID'], ['date', '日付'], ['status', '実施状況'], ['target', 'メニュー対象'], ['menuIds', 'メニューID'],
    ['createdBy', '記録者ID'], ['createdAt', '記録日時'], ['updatedBy', '修正者ID'], ['updatedAt', '修正日時']] },
  sessions: { name: 'ログイン', cols: [
    ['tokenHash', 'トークンハッシュ'], ['memberId', '部員ID'], ['kind', '種類'], ['createdAt', '作成日時'], ['expiresAt', '有効期限'], ['device', '端末']] },
  logs: { name: '操作履歴', cols: [
    ['at', '日時'], ['actorId', '操作者ID'], ['actorName', '操作者'], ['role', '権限'], ['action', '操作'], ['detail', '内容']] },
  settings: { name: '設定', cols: [['key', '項目'], ['value', '値']] },
  exempts: { name: '免除', cols: [
    ['id', 'ID'], ['memberId', '部員ID'], ['from', '開始日'], ['to', '終了日'], ['reason', '理由'], ['note', 'メモ'],
    ['createdBy', '登録者ID'], ['createdAt', '登録日時'], ['deletedBy', '削除者ID'], ['deletedAt', '削除日時']] },
  templates: { name: 'メニューの型', cols: [
    ['id', 'ID'], ['title', 'メニュー名'], ['group', '対象グループ'], ['positions', '対象ポジション'], ['content', 'トレーニング内容'],
    ['detail', '回数・セット数・重量'], ['note', '備考'], ['video', '動画リンク'],
    ['repeat', '繰り返す曜日'], ['repeatFrom', '繰り返しの開始日'], ['repeatTo', '繰り返しの終了日'],
    ['createdBy', '作成者ID'], ['createdAt', '作成日時'], ['updatedBy', '更新者ID'], ['updatedAt', '更新日時'],
    ['deletedBy', '削除者ID'], ['deletedAt', '削除日時']] },
  trash: { name: '取り消した記録', cols: [
    ['id', 'ID'], ['memberId', '部員ID'], ['date', '日付'], ['status', '実施状況'], ['target', 'メニュー対象'], ['menuIds', 'メニューID'],
    ['createdBy', '記録者ID'], ['createdAt', '記録日時'], ['removedBy', '取り消した人ID'], ['removedAt', '取り消し日時'],
    ['restoredBy', '戻した人ID'], ['restoredAt', '戻した日時']] },
  body: { name: '体組成', cols: [
    ['id', 'ID'], ['memberId', '部員ID'], ['date', '測定日'], ['weight', '体重(kg)'], ['fat', '体脂肪率(%)'], ['muscle', '筋肉量(kg)'], ['note', 'メモ'],
    ['createdBy', '記録者ID'], ['createdAt', '記録日時'], ['updatedBy', '修正者ID'], ['updatedAt', '修正日時'],
    ['deletedBy', '削除者ID'], ['deletedAt', '削除日時']] },
  stamps: { name: '応援', cols: [
    ['id', 'ID'], ['target', '相手の部員ID'], ['event', 'できごと'], ['kind', 'スタンプ'], ['fromId', '送った部員ID'], ['device', '端末'], ['at', '日時']] },
  push: { name: '通知の宛先', cols: [
    ['id', 'ID'], ['endpoint', '宛先'], ['memberId', '部員ID（本人が選んだ名前）'], ['staffId', 'ログインした人のID'], ['kinds', '受け取る通知'],
    ['device', '端末'], ['createdAt', '登録日時'], ['updatedAt', '更新日時'], ['okAt', '最後に届いた日時'], ['failCount', '失敗回数']] }
};
const DATE_COLS = { start: 1, left: 1, effDate: 1, date: 1, from: 1, to: 1, repeatFrom: 1, repeatTo: 1 };

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
  records: { status: 'status', target: 'bool' },
  templates: { group: 'mgroup' },
  trash: { status: 'status', target: 'bool' }
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
    dailyMaint_();
    const ctx = { req: req, me: null, view: false };
    resolveSession_(ctx);
    const op = String(req.op || '');
    const open = { ping: 1, state: 1, login: 1, logout: 1, viewLogin: 1, changePin: 1, memberHistory: 1, stamp: 1, pinRequest: 1, pushRegister: 1, pushUnregister: 1, pushTest: 1, pushInbox: 1 };
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
      case 'promote': return opPromote_(ctx);
      case 'saveExempt': return opSaveExempt_(ctx);
      case 'deleteExempt': return opDeleteExempt_(ctx);
      case 'resetPin': return opResetPin_(ctx);
      case 'logs': return opLogs_(ctx);
      case 'saveSettings': return opSaveSettings_(ctx);
      case 'memberHistory': return opMemberHistory_(ctx);
      case 'saveTemplate': return opSaveTemplate_(ctx);
      case 'deleteTemplate': return opDeleteTemplate_(ctx);
      case 'copyMenu': return opCopyMenu_(ctx);
      case 'menuArchive': return opMenuArchive_(ctx);
      case 'trash': return opTrash_(ctx);
      case 'restoreRecord': return opRestoreRecord_(ctx);
      case 'saveBody': return opSaveBody_(ctx);
      case 'deleteBody': return opDeleteBody_(ctx);
      case 'stamp': return opStamp_(ctx);
      case 'pinRequest': return opPinRequest_(ctx);
      case 'dismissPinRequest': return opDismissPinRequest_(ctx);
      case 'sessions': return opSessions_(ctx);
      case 'logoutSession': return opLogoutSession_(ctx);
      case 'bulkPerms': return opBulkPerms_(ctx);
      case 'pushRegister': return opPushRegister_(ctx);
      case 'pushUnregister': return opPushUnregister_(ctx);
      case 'pushTest': return opPushTest_(ctx);
      case 'pushInbox': return opPushInbox_(ctx);
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
function dow_(s) { const a = s.split('-'); return new Date(Date.UTC(+a[0], +a[1] - 1, +a[2])).getUTCDay(); } // 0=日
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
    pinHash: '', pinSalt: '', mustChange: '0', failCount: '0', lockUntil: '', createdAt: now, updatedAt: '', pinReqAt: '' };
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
    insert_('sessions', [{ tokenHash: sha256Hex_(token), memberId: m.id, kind: 'staff', createdAt: now, expiresAt: nowPlusMin_(SESSION_DAYS * 1440), device: deviceLabel_(ctx.req.deviceName) }]);
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
    insert_('sessions', [{ tokenHash: sha256Hex_(token), memberId: '', kind: 'view', createdAt: now_(), expiresAt: nowPlusMin_(VIEW_SESSION_DAYS * 1440), device: deviceLabel_(ctx.req.deviceName) }]);
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
    targets: w.targets ? w.targets.split(',') : [], createdBy: w.createdBy, updatedAt: w.updatedAt || w.createdAt,
    video: w.video || '', templateId: w.templateId || '', edited: !!w.updatedBy
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
  const base = { ok: true, version: APP_VERSION, today: today, me: ctx.me, staff: staffList_(), viewLock: !!setting_('viewPassHash'), weekGoal: weekGoal_(), positions: positionsList_(), pushKey: vapidKeys_().pub };
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
  base.exempts = exemptsWire_(addDays_(from, -7), addDays_(to, 7), ctx.me);
  base.life = lifeWire_();
  base.body = bodyWire_(ctx.me);
  base.stamps = stampsWire_(addDays_(today, -STAMP_DAYS), ctx.req.device);
  if (ctx.me && (ctx.me.perm === 'admin' || ctx.me.perm === 'leader')) base.templates = table_('templates').rows.filter(function (t) { return !t.deletedAt; }).map(templateWire_);
  if (admin) base.pinRequests = pinRequests_();
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
    insert_('trash', removes.map(function (x) { return trashRow_(x, me, now); }));
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
    insert_('trash', [trashRow_(r, me, now_())]);
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
    note: text_(src.note, 1000, '備考', false),
    video: url_(src.video, '動画リンク')
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
      Object.assign(w, { title: data.title, content: data.content, detail: data.detail, note: data.note, video: data.video, date: data.date, group: data.group, positions: data.positions });
      if (moved || w.date >= today_()) w.targets = computeTargets_(w.date, w.group, positions, hist).join(',');
      w.updatedBy = me.id; w.updatedAt = now;
      update_('menus', w);
      syncRecordTargets_(w.date);
      if (oldDate !== w.date) syncRecordTargets_(oldDate);
      log_(me, 'メニューを編集', before + ' → ' + menuLabel_(w));
    } else {
      w = {
        id: 'w' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), date: data.date, group: data.group, positions: data.positions,
        title: data.title, content: data.content, detail: data.detail, note: data.note, video: data.video, templateId: '',
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

// ---------------------------------------------------------------------------
// 進級（学年をまとめて1つ上げる。4年・M2 は卒業／進学／そのままを選ぶ）
//   1年→2年→3年→4年、M1→M2（留年などで「そのまま」も選べる）。4年は「卒業」「M1へ」「4年のまま」、M2は「卒業」「M2のまま」。
//   それ以外の学年（空・その他）はそのまま。名簿は共通なので会計アプリの学年も変わる。
//   二重に押されないよう、画面が見た名簿（sig）と今の名簿が同じときだけ実行する。
// ---------------------------------------------------------------------------
const GRADE_NEXT = { '1年': '2年', '2年': '3年', '3年': '4年', 'M1': 'M2' };
const GRADE_TOP = { '4年': ['grad', 'M1', 'stay'], 'M2': ['grad', 'stay'] };
function promoteTargets_() {
  return members_().filter(function (m) { return m.active && !m.gone; })
    .sort(function (a, b) { return a.id < b.id ? -1 : 1; });
}
function promoteSig_(list) {
  return list.map(function (m) { return m.id + ':' + (m.grade || ''); }).join(',');
}
function opPromote_(ctx) {
  const me = requireRole_(ctx, ['admin']);
  const choice = ctx.req.choice && typeof ctx.req.choice === 'object' ? ctx.req.choice : {};
  return withLock_(function () {
    const list = promoteTargets_();
    if (String(ctx.req.sig || '') !== promoteSig_(list)) {
      throw err_('changed', '名簿がほかの所で変わったか、進級がすでに済んでいます。画面を開き直してから、もう一度確かめてください。');
    }
    const admins = activeAdmins_().length;
    let up = 0, grad = 0, stay = 0, gradAdmins = 0;
    const gradNames = [], errs = [];
    list.forEach(function (m) {
      const g = m.grade || '';
      if (GRADE_NEXT[g]) {
        if (choice[m.id] === 'stay') { stay++; return; } // 留年など
        rosterLib_().update(m.id, { grade: GRADE_NEXT[g] }); up++; return;
      }
      if (!GRADE_TOP[g]) return;
      const c = GRADE_TOP[g].indexOf(choice[m.id]) >= 0 ? choice[m.id] : 'stay';
      if (c === 'M1') { rosterLib_().update(m.id, { grade: 'M1' }); up++; return; }
      if (c !== 'grad') { stay++; return; }
      if (m.id === me.id) { errs.push(m.name + '（自分自身）'); stay++; return; }
      if (m.finance) { errs.push(m.name + '（財務は会計アプリで）'); stay++; return; }
      if (m.perm === 'admin' && admins - gradAdmins <= 1) { errs.push(m.name + '（最後の管理者）'); stay++; return; }
      if (m.perm === 'admin') gradAdmins++;
      rosterLib_().update(m.id, { active: false });
      const s = peopleRow_(m);
      s.left = today_(); s.updatedAt = now_();
      update_('people', s);
      killSessions_(m.id, '');
      grad++; gradNames.push(m.name);
    });
    log_(me, '進級', '学年を上げた ' + up + '人・卒業 ' + grad + '人' + (gradNames.length ? '（' + gradNames.join('、') + '）' : '') + '・そのまま ' + stay + '人');
    REQ_.roster = null; REQ_.members = null;
    if (grad) refreshFutureTargets_();
    return { ok: true, up: up, grad: grad, stay: stay, notGrad: errs };
  });
}

// ---------------------------------------------------------------------------
// 免除（怪我・病気・テスト期間など）。その日は「週の目標」と「メニューの対象日」から外す。
//   部員ごと：管理者・マネージャーが登録。部全体のオフ期間（部員ID＝ALL）：管理者だけ。
//   一般公開の画面には、部員ごとの理由・メモは出さない（「免除」とだけ出す）。
// ---------------------------------------------------------------------------
const EXEMPT_MAX_DAYS = 366;
function exemptsWire_(from, to, me) {
  const staff = !!(me && STAFF[me.perm]);
  return table_('exempts').rows.filter(function (e) { return !e.deletedAt && e.from <= to && e.to >= from; })
    .map(function (e) {
      const team = e.memberId === 'ALL';
      return { id: e.id, memberId: e.memberId, from: e.from, to: e.to,
        reason: team || staff ? e.reason : '', note: staff ? e.note : '', createdBy: staff ? e.createdBy : '' };
    });
}
function opSaveExempt_(ctx) {
  const me = requireRole_(ctx, ['admin', 'manager']);
  const memberId = String(ctx.req.memberId || '');
  const team = memberId === 'ALL';
  if (team && me.perm !== 'admin') throw err_('forbidden', '部全体のオフ期間は管理者だけが登録できます。');
  const from = reqDate_(ctx.req.from, '開始日'), to = reqDate_(ctx.req.to, '終了日');
  if (to < from) throw err_('bad_range', '終了日は開始日より後にしてください。');
  if (addDays_(from, EXEMPT_MAX_DAYS) < to) throw err_('bad_range', '一度に登録できるのは1年までです。');
  const reason = text_(ctx.req.reason, 20, '理由', true);
  const note = text_(ctx.req.note, 100, 'メモ', false);
  return withLock_(function () {
    let label = '部全体';
    if (!team) {
      const m = memberById_(memberId);
      if (!m || m.gone) throw err_('not_found', 'その部員は見つかりません。');
      if (!m.player) throw err_('not_player', '選手ではない人は免除の対象になりません。');
      label = m.name;
    }
    const e = { id: 'x' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), memberId: memberId, from: from, to: to,
      reason: reason, note: note, createdBy: me.id, createdAt: now_(), deletedBy: '', deletedAt: '' };
    insert_('exempts', [e]);
    log_(me, team ? 'オフ期間を登録' : '免除を登録', label + '：' + from + '〜' + to + '（' + reason + '）');
    return { ok: true, exempt: exemptsWire_(from, to, me).filter(function (x) { return x.id === e.id; })[0] };
  });
}
function opDeleteExempt_(ctx) {
  const me = requireRole_(ctx, ['admin', 'manager']);
  const id = String(ctx.req.id || '');
  return withLock_(function () {
    const e = table_('exempts').rows.filter(function (x) { return x.id === id && !x.deletedAt; })[0];
    if (!e) throw err_('not_found', 'その免除は見つかりません。');
    if (me.perm !== 'admin' && (e.memberId === 'ALL' || e.createdBy !== me.id)) throw err_('forbidden', '自分が登録した免除だけ取り消せます。ほかは管理者に頼んでください。');
    e.deletedBy = me.id; e.deletedAt = now_();
    update_('exempts', e);
    const m = e.memberId === 'ALL' ? null : memberById_(e.memberId);
    log_(me, e.memberId === 'ALL' ? 'オフ期間を取り消し' : '免除を取り消し', (m ? m.name : '部全体') + '：' + e.from + '〜' + e.to + '（' + e.reason + '）');
    return { ok: true, id: id };
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
  s.mustChange = '1'; s.failCount = '0'; s.lockUntil = ''; s.pinReqAt = ''; s.updatedAt = now_();
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
// 共通の小道具（v2.5）
// ---------------------------------------------------------------------------
function newId_(prefix) { return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function url_(v, label) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (s.length > 500 || !/^https?:\/\/[^\s<>"']+$/.test(s)) throw err_('bad_url', label + 'は https:// から始まるURLにしてください。');
  return s;
}
function deviceLabel_(v) { return String(v == null ? '' : v).replace(/[\x00-\x1f<>]/g, '').trim().slice(0, 40); }
/** 合言葉がかかっているとき、合言葉もログインも無ければ断る */
function requireView_(ctx) {
  if (setting_('viewPassHash') && !ctx.me && !ctx.view) throw err_('locked', '部の合言葉を入れてから使ってください。');
}
function memberOrThrow_(id) {
  const m = memberById_(id);
  if (!m || m.gone) throw err_('not_found', 'その部員は見つかりません。');
  return m;
}

// ---------------------------------------------------------------------------
// 1日1回の手入れ（最初のリクエストで）。メニューの型の繰り返しを先まで作る・古い応援を片付ける
// ---------------------------------------------------------------------------
const REPEAT_AHEAD_DAYS = 28;
const STAMP_DAYS = 60;          // 画面に返す応援の期間
const STAMP_KEEP_DAYS = 400;    // これより古い応援はシートから消す
function dailyMaint_() {
  const today = today_();
  if (setting_('maintOn') === today) return;
  withLock_(function () {
    if (setting_('maintOn') === today) return;
    const hist = historyIndex_();
    table_('templates').rows.forEach(function (t) { if (!t.deletedAt && t.repeat) fillTemplate_(t, hist, today); });
    pruneStamps_(today);
    setSetting_('maintOn', today);
  });
}
function pruneStamps_(today) {
  const t = table_('stamps');
  const limit = addDays_(today, -STAMP_KEEP_DAYS);
  let n = 0;
  for (let i = 0; i < t.rows.length && t.rows[i].at.slice(0, 10) < limit; i++) n++;
  if (!n) return;
  t.sheet.deleteRows(2, n);
  REQ_.tables.stamps = null; delete REQ_.tables.stamps;
}

// ---------------------------------------------------------------------------
// メニューの型（テンプレート）と繰り返し（管理者・FWリーダー）
//   型はそのまま「型から作る」に使える。曜日を選ぶと、その曜日のメニューを今日から4週間先まで自動で作る（毎日のばす）。
//   型を直すと、まだだれも手で直していない今日以降のメニューもそろえる。手で直した・消したメニューは触らない。
// ---------------------------------------------------------------------------
function templateWire_(t) {
  return { id: t.id, title: t.title, group: t.group, positions: menuPositions_(t), content: t.content, detail: t.detail, note: t.note, video: t.video,
    repeat: t.repeat ? t.repeat.split(',').map(Number) : [], repeatFrom: t.repeatFrom, repeatTo: t.repeatTo, createdBy: t.createdBy, updatedAt: t.updatedAt || t.createdAt };
}
function repeatDays_(arr) {
  const list = Array.isArray(arr) ? arr : [];
  const out = [];
  list.forEach(function (x) { const n = Number(x); if (n >= 0 && n <= 6 && Math.floor(n) === n && out.indexOf(n) < 0) out.push(n); });
  return out.sort();
}
function onSchedule_(t, date) {
  if (!t.repeat) return false;
  if (t.repeatFrom && date < t.repeatFrom) return false;
  if (t.repeatTo && date > t.repeatTo) return false;
  return t.repeat.split(',').map(Number).indexOf(dow_(date)) >= 0;
}
/** 繰り返しのメニューを先まで作る。作った件数を返す（ロックの中で呼ぶ） */
function fillTemplate_(t, hist, today) {
  if (!t.repeat || t.deletedAt) return 0;
  let to = addDays_(today, REPEAT_AHEAD_DAYS - 1);
  if (t.repeatTo && t.repeatTo < to) to = t.repeatTo;
  const from = t.repeatFrom && t.repeatFrom > today ? t.repeatFrom : today;
  const have = {};
  table_('menus').rows.forEach(function (w) { if (w.templateId === t.id) have[w.date] = 1; }); // 消したメニューの日も作り直さない
  const now = now_(), rows = [];
  const pos = menuPositions_(t);
  for (let d = from; d <= to; d = addDays_(d, 1)) {
    if (have[d] || !onSchedule_(t, d)) continue;
    rows.push({ id: newId_('w'), date: d, group: t.group, positions: t.positions, title: t.title, content: t.content, detail: t.detail, note: t.note,
      video: t.video, templateId: t.id, targets: computeTargets_(d, t.group, pos, hist).join(','),
      createdBy: t.updatedBy || t.createdBy, createdAt: now, updatedBy: '', updatedAt: '', deletedBy: '', deletedAt: '' });
  }
  insert_('menus', rows);
  if (rows.some(function (w) { return w.date === today; })) syncRecordTargets_(today);
  return rows.length;
}
function opSaveTemplate_(ctx) {
  const me = requireRole_(ctx, ['admin', 'leader']);
  const src = ctx.req.template || {};
  const positions = cleanPositions_(src.positions);
  const days = repeatDays_(src.repeat);
  const data = {
    group: positions.length ? groupOfPositions_(positions) : (['FW', 'BK', 'ALL'].indexOf(src.group) >= 0 ? src.group : null),
    positions: positions.join(','),
    title: text_(src.title, 60, 'メニュー名', true),
    content: text_(src.content, 3000, 'トレーニング内容', true),
    detail: text_(src.detail, 3000, '回数・セット数・重量', false),
    note: text_(src.note, 1000, '備考', false),
    video: url_(src.video, '動画リンク'),
    repeat: days.join(','),
    repeatFrom: src.repeatFrom ? reqDate_(src.repeatFrom, '繰り返しの開始日') : '',
    repeatTo: src.repeatTo ? reqDate_(src.repeatTo, '繰り返しの終了日') : ''
  };
  if (!data.group) throw err_('bad_group', '対象グループを選んでください。');
  if (data.repeatFrom && data.repeatTo && data.repeatTo < data.repeatFrom) throw err_('bad_range', '繰り返しの終了日は開始日より後にしてください。');
  return withLock_(function () {
    const now = now_(), today = today_(), hist = historyIndex_();
    let t, updated = 0, removed = 0;
    if (src.id) {
      t = table_('templates').rows.filter(function (x) { return x.id === String(src.id) && !x.deletedAt; })[0];
      if (!t) throw err_('not_found', 'その型は見つかりません。');
      Object.assign(t, data, { updatedBy: me.id, updatedAt: now });
      update_('templates', t);
      // 手で直していない今日以降のメニューをそろえる（予定から外れた日のものは消す）
      const gone = [];
      table_('menus').rows.forEach(function (w) {
        if (w.templateId !== t.id || w.deletedAt || w.updatedBy || w.date < today) return;
        if (!onSchedule_(t, w.date)) { if (w.date > today) gone.push(w); return; }
        Object.assign(w, { group: t.group, positions: t.positions, title: t.title, content: t.content, detail: t.detail, note: t.note, video: t.video });
        w.targets = computeTargets_(w.date, w.group, positions, hist).join(',');
        update_('menus', w); updated++;
      });
      removeMany_('menus', gone); removed = gone.length;
      log_(me, 'メニューの型を編集', t.title + repeatLabel_(t));
    } else {
      t = Object.assign({ id: newId_('t') }, data, { createdBy: me.id, createdAt: now, updatedBy: '', updatedAt: '', deletedBy: '', deletedAt: '' });
      insert_('templates', [t]);
      log_(me, 'メニューの型を作成', t.title + repeatLabel_(t));
    }
    const created = fillTemplate_(t, hist, today);
    syncRecordTargets_(today);
    return { ok: true, template: templateWire_(t), created: created, updated: updated, removed: removed };
  });
}
function repeatLabel_(t) {
  if (!t.repeat) return '';
  const W = ['日', '月', '火', '水', '木', '金', '土'];
  return '（毎週' + t.repeat.split(',').map(function (n) { return W[+n]; }).join('・') + '）';
}
function opDeleteTemplate_(ctx) {
  const me = requireRole_(ctx, ['admin', 'leader']);
  const id = String(ctx.req.id || '');
  const keep = !!ctx.req.keepMenus;
  return withLock_(function () {
    const t = table_('templates').rows.filter(function (x) { return x.id === id && !x.deletedAt; })[0];
    if (!t) throw err_('not_found', 'その型は見つかりません。');
    t.deletedBy = me.id; t.deletedAt = now_();
    update_('templates', t);
    let removed = 0;
    if (!keep) {
      const today = today_();
      const gone = table_('menus').rows.filter(function (w) { return w.templateId === t.id && !w.deletedAt && !w.updatedBy && w.date > today; });
      removeMany_('menus', gone); removed = gone.length;
    }
    log_(me, 'メニューの型を削除', t.title + (removed ? '・明日以降の繰り返し ' + removed + '件も削除' : ''));
    return { ok: true, id: id, removed: removed };
  });
}

/** メニューを別の日にコピー（最大31日分） */
function opCopyMenu_(ctx) {
  const me = requireRole_(ctx, ['admin', 'leader']);
  const id = String(ctx.req.id || '');
  const dates = (Array.isArray(ctx.req.dates) ? ctx.req.dates : []).map(function (d) { return reqDate_(d, 'コピー先の日付'); })
    .filter(function (d, i, a) { return a.indexOf(d) === i; }).sort();
  if (!dates.length) throw err_('empty', 'コピー先の日付を選んでください。');
  if (dates.length > 31) throw err_('too_many', '一度にコピーできるのは31日分までです。');
  return withLock_(function () {
    const src = table_('menus').rows.filter(function (x) { return x.id === id && !x.deletedAt; })[0];
    if (!src) throw err_('not_found', 'そのメニューは見つかりません。');
    const hist = historyIndex_(), now = now_(), pos = menuPositions_(src);
    const rows = dates.map(function (d) {
      return { id: newId_('w'), date: d, group: src.group, positions: src.positions, title: src.title, content: src.content, detail: src.detail, note: src.note,
        video: src.video, templateId: '', targets: computeTargets_(d, src.group, pos, hist).join(','),
        createdBy: me.id, createdAt: now, updatedBy: '', updatedAt: '', deletedBy: '', deletedAt: '' };
    });
    insert_('menus', rows);
    dates.forEach(syncRecordTargets_);
    log_(me, 'メニューをコピー', menuLabel_(src) + ' → ' + dates.map(function (d) { return d.slice(5).replace('-', '/'); }).join('、'));
    return { ok: true, created: rows.length };
  });
}

/** これまでのメニューの一覧（引き継ぎ用。管理者・FWリーダー・マネージャー） */
function opMenuArchive_(ctx) {
  requireRole_(ctx, ['admin', 'leader', 'manager']);
  const list = table_('menus').rows.filter(function (w) { return !w.deletedAt; })
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; })
    .map(function (w) { const o = menuWire_(w); o.targetCount = o.targets.length; delete o.targets; return o; });
  return { ok: true, menus: list };
}

// ---------------------------------------------------------------------------
// 取り消した記録（ごみ箱）と復元（管理者・マネージャー。マネージャーは自分が取り消したものだけ戻せる）
// ---------------------------------------------------------------------------
const TRASH_LIST = 200;
function trashRow_(r, me, now) {
  return { id: newId_('r'), memberId: r.memberId, date: r.date, status: r.status, target: r.target, menuIds: r.menuIds,
    createdBy: r.createdBy, createdAt: r.createdAt, removedBy: me.id, removedAt: now, restoredBy: '', restoredAt: '' };
}
function opTrash_(ctx) {
  requireRole_(ctx, ['admin', 'manager']);
  const rows = table_('trash').rows;
  const out = [];
  for (let i = rows.length - 1; i >= 0 && out.length < TRASH_LIST; i--) {
    const x = rows[i];
    if (x.restoredAt) continue;
    const m = memberById_(x.memberId);
    out.push({ id: x.id, memberId: x.memberId, name: m ? m.name : x.memberId, date: x.date, status: x.status,
      createdBy: x.createdBy, removedBy: x.removedBy, removedByName: (memberById_(x.removedBy) || {}).name || '', removedAt: x.removedAt });
  }
  return { ok: true, trash: out };
}
function opRestoreRecord_(ctx) {
  const me = requireRole_(ctx, ['admin', 'manager']);
  const id = String(ctx.req.id || '');
  return withLock_(function () {
    const x = table_('trash').rows.filter(function (t) { return t.id === id && !t.restoredAt; })[0];
    if (!x) throw err_('not_found', 'その記録は見つかりません。すでに戻した可能性があります。');
    if (me.perm !== 'admin' && x.removedBy !== me.id) throw err_('forbidden', '自分が取り消した記録だけ戻せます。ほかは管理者に頼んでください。');
    const m = memberById_(x.memberId);
    if (table_('records').rows.some(function (r) { return r.memberId === x.memberId && r.date === x.date; })) {
      throw err_('exists', 'この日はもう記録があるので戻せません。');
    }
    const now = now_();
    let target = x.target, menuIds = x.menuIds;
    if (x.date >= today_()) { const tgt = targetMap_(x.date); target = tgt[x.memberId] ? '1' : '0'; menuIds = (tgt[x.memberId] || []).join(','); }
    insert_('records', [{ memberId: x.memberId, date: x.date, status: x.status, target: target, menuIds: menuIds,
      createdBy: x.createdBy, createdAt: x.createdAt, updatedBy: me.id, updatedAt: now }]);
    x.restoredBy = me.id; x.restoredAt = now;
    update_('trash', x);
    log_(me, '記録を戻す', (m ? m.name : x.memberId) + ' ' + x.date + '：' + ENC.status[x.status]);
    return { ok: true, date: x.date, records: recordsWire_(x.date, x.date) };
  });
}

// ---------------------------------------------------------------------------
// 部員ごとの全期間の記録（自己ベスト・称号用。だれでも見られる）
// ---------------------------------------------------------------------------
function opMemberHistory_(ctx) {
  requireView_(ctx);
  const m = memberOrThrow_(String(ctx.req.memberId || ''));
  const recs = [];
  table_('records').rows.forEach(function (r) {
    if (r.memberId === m.id) recs.push([r.memberId, r.date, r.status === 'done' ? 1 : 0, r.target === '1' ? 1 : 0, r.updatedBy || r.createdBy, r.createdBy]);
  });
  const ex = exemptsWire_('0000-01-01', '9999-12-31', ctx.me).filter(function (e) { return e.memberId === m.id || e.memberId === 'ALL'; });
  return { ok: true, memberId: m.id, records: recs, exempts: ex };
}
/** 部員ごとの通算の実施回数と最初の記録日 { id: [回数, 最初の日] } */
function lifeWire_() {
  const o = {};
  table_('records').rows.forEach(function (r) {
    if (r.status !== 'done') return;
    const x = o[r.memberId] || (o[r.memberId] = [0, r.date]);
    x[0]++; if (r.date < x[1]) x[1] = r.date;
  });
  return o;
}

// ---------------------------------------------------------------------------
// 体重・体組成（入力は管理者・マネージャー・FWリーダー。数値はだれでも見られる。メモはスタッフだけ）
// ---------------------------------------------------------------------------
const BODY_RANGE = { weight: [20, 250, '体重'], fat: [1, 70, '体脂肪率'], muscle: [5, 150, '筋肉量'] };
function bodyNum_(v, key) {
  const s = String(v == null ? '' : v).trim().replace(/[０-９．]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); });
  if (!s) return '';
  const n = Number(s), r = BODY_RANGE[key];
  if (!isFinite(n) || n < r[0] || n > r[1]) throw err_('bad_number', r[2] + 'は ' + r[0] + '〜' + r[1] + ' の数で入れてください。');
  return String(Math.round(n * 10) / 10);
}
function bodyWire_(me) {
  const staff = !!(me && STAFF[me.perm]);
  return table_('body').rows.filter(function (b) { return !b.deletedAt; })
    .map(function (b) { return [b.id, b.memberId, b.date, b.weight === '' ? null : Number(b.weight), b.fat === '' ? null : Number(b.fat), b.muscle === '' ? null : Number(b.muscle), staff ? b.note : '']; });
}
function opSaveBody_(ctx) {
  const me = requireRole_(ctx, ['admin', 'manager', 'leader']);
  const rows = Array.isArray(ctx.req.rows) ? ctx.req.rows : [];
  if (!rows.length) throw err_('empty', '入力がありません。');
  if (rows.length > 200) throw err_('too_many', '一度に入れられるのは200人分までです。');
  const today = today_();
  const input = rows.map(function (r) {
    const d = { memberId: String(r.memberId || ''), date: reqDate_(r.date, '測定日'),
      weight: bodyNum_(r.weight, 'weight'), fat: bodyNum_(r.fat, 'fat'), muscle: bodyNum_(r.muscle, 'muscle'), note: text_(r.note, 100, 'メモ', false) };
    if (d.date > today) throw err_('future_date', '未来の日付は入れられません。');
    if (d.weight === '' && d.fat === '' && d.muscle === '') throw err_('empty', '体重・体脂肪率・筋肉量のどれかを入れてください。');
    return d;
  });
  return withLock_(function () {
    const now = now_();
    const cur = {};
    table_('body').rows.forEach(function (b) { if (!b.deletedAt) cur[b.memberId + '|' + b.date] = b; });
    const ins = [], names = [];
    let upd = 0;
    input.forEach(function (d) {
      const m = memberOrThrow_(d.memberId);
      const ex = cur[d.memberId + '|' + d.date];
      if (ex) {
        Object.assign(ex, { weight: d.weight, fat: d.fat, muscle: d.muscle, note: d.note, updatedBy: me.id, updatedAt: now });
        update_('body', ex); upd++;
      } else {
        const row = Object.assign({ id: newId_('b') }, d, { createdBy: me.id, createdAt: now, updatedBy: '', updatedAt: '', deletedBy: '', deletedAt: '' });
        ins.push(row); cur[d.memberId + '|' + d.date] = row;
      }
      names.push(m.name);
    });
    insert_('body', ins);
    log_(me, '体組成を記録', names.length + '人（' + names.slice(0, 10).join('、') + (names.length > 10 ? 'ほか' : '') + '）');
    return { ok: true, added: ins.length, updated: upd, body: bodyWire_(me) };
  });
}
function opDeleteBody_(ctx) {
  const me = requireRole_(ctx, ['admin', 'manager', 'leader']);
  const id = String(ctx.req.id || '');
  return withLock_(function () {
    const b = table_('body').rows.filter(function (x) { return x.id === id && !x.deletedAt; })[0];
    if (!b) throw err_('not_found', 'その記録は見つかりません。');
    if (me.perm !== 'admin' && b.createdBy !== me.id) throw err_('forbidden', '自分が入れた記録だけ消せます。');
    b.deletedBy = me.id; b.deletedAt = now_();
    update_('body', b);
    log_(me, '体組成を削除', ((memberById_(b.memberId) || {}).name || b.memberId) + ' ' + b.date);
    return { ok: true, id: id };
  });
}

// ---------------------------------------------------------------------------
// 応援スタンプ（ログイン不要。端末ごとに同じ相手・できごと・スタンプは1回。もう一度押すと取り消し）
// ---------------------------------------------------------------------------
const STAMP_KINDS = { clap: 1, fire: 1, muscle: 1, party: 1, hundred: 1 };
const STAMP_DAY_MAX = 300;
function stampsWire_(from, device) {
  const dev = String(device || '');
  const by = {};
  table_('stamps').rows.forEach(function (s) {
    if (s.at.slice(0, 10) < from) return;
    const k = s.target + '|' + s.event;
    const o = by[k] || (by[k] = { t: s.target, e: s.event, c: {}, f: [], mine: [], at: '' });
    o.c[s.kind] = (o.c[s.kind] || 0) + 1;
    if (s.fromId && o.f.indexOf(s.fromId) < 0) o.f.push(s.fromId);
    if (dev && s.device === dev) o.mine.push(s.kind);
    if (s.at > o.at) o.at = s.at;
  });
  return Object.keys(by).map(function (k) { return by[k]; });
}
function opStamp_(ctx) {
  requireView_(ctx);
  const req = ctx.req;
  const target = String(req.target || ''), event = String(req.event || ''), kind = String(req.kind || '');
  const device = String(req.device || ''), fromId = String(req.from || '');
  if (!STAMP_KINDS[kind]) throw err_('bad_stamp', 'そのスタンプは使えません。');
  if (!/^[a-z]:[0-9A-Za-z:\-]{1,40}$/.test(event)) throw err_('bad_stamp', '応援する内容が正しくありません。');
  if (!/^[0-9a-f]{16,40}$/.test(device)) throw err_('bad_stamp', 'この端末からは送れません。画面を開き直してください。');
  const m = memberOrThrow_(target);
  if (!m.active || !m.player) throw err_('not_found', 'その部員には送れません。');
  if (fromId && !memberById_(fromId)) throw err_('not_found', '送る人が見つかりません。');
  const cache = CacheService.getScriptCache();
  const ck = 'stamp:' + device + ':' + today_();
  const n = parseInt(cache.get(ck) || '0', 10);
  if (n >= STAMP_DAY_MAX) throw err_('too_many', '今日はもう送れません。また明日どうぞ。');
  return withLock_(function () {
    const t = table_('stamps');
    const ex = t.rows.filter(function (s) { return s.device === device && s.target === target && s.event === event && s.kind === kind; })[0];
    let on;
    if (ex) { remove_('stamps', ex); on = false; }
    else {
      insert_('stamps', [{ id: newId_('s'), target: target, event: event, kind: kind, fromId: fromId, device: device, at: now_() }]);
      on = true;
      cache.put(ck, String(n + 1), 86400);
    }
    const mine = stampsWire_('0000-01-01', device).filter(function (o) { return o.t === target && o.e === event; })[0] || { t: target, e: event, c: {}, f: [], mine: [], at: '' };
    return { ok: true, on: on, stamp: mine };
  });
}

// ---------------------------------------------------------------------------
// 暗証番号を忘れたとき：ログイン画面から管理者に再発行を頼む（ログイン不要。何度も送れないようにする）
// ---------------------------------------------------------------------------
const PIN_REQ_DAYS = 14;
function opPinRequest_(ctx) {
  const id = String(ctx.req.memberId || '');
  const cache = CacheService.getScriptCache();
  const all = parseInt(cache.get('pinreq:all') || '0', 10);
  if (all >= 30) throw err_('busy', '依頼が多すぎます。しばらく待ってから送ってください。');
  if (cache.get('pinreq:' + id)) throw err_('already', 'すでに依頼を送っています。管理者が暗証番号を出し直すのを待ってください。');
  const m = withLock_(function () {
    const m = memberById_(id);
    if (!m || !m.active || m.gone || !STAFF[m.perm]) throw err_('not_found', 'ログインできる人の中から選んでください。');
    const s = peopleRow_(m);
    s.pinReqAt = now_();
    update_('people', s);
    log_(meOf_(m), '暗証番号の再発行を依頼', '');
    cache.put('pinreq:' + id, '1', 1800);
    cache.put('pinreq:all', String(all + 1), 3600);
    return m;
  });
  notifyPinRequest_(m);
  return { ok: true };
}
function pinRequests_() {
  const limit = nowPlusMin_(-PIN_REQ_DAYS * 1440);
  return members_().filter(function (m) { return m.set && m.set.pinReqAt && m.set.pinReqAt > limit && m.active && !m.gone && STAFF[m.perm]; })
    .map(function (m) { return { id: m.id, name: m.name, perm: m.perm, at: m.set.pinReqAt }; });
}
function opDismissPinRequest_(ctx) {
  const me = requireRole_(ctx, ['admin']);
  const id = String(ctx.req.id || '');
  return withLock_(function () {
    const m = memberOrThrow_(id);
    const s = peopleRow_(m);
    if (!s.pinReqAt) return { ok: true };
    s.pinReqAt = '';
    update_('people', s);
    log_(me, '再発行の依頼を閉じる', m.name);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// ログインしている端末（自分の分だけ見る・ログアウトさせる）
// ---------------------------------------------------------------------------
function opSessions_(ctx) {
  const me = requireRole_(ctx, ['admin', 'manager', 'leader']);
  const now = now_(), cur = ctx.session.tokenHash;
  const list = table_('sessions').rows.filter(function (r) { return r.kind === 'staff' && r.memberId === me.id && r.expiresAt > now; })
    .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; })
    .map(function (r) { return { key: r.tokenHash.slice(0, 16), device: r.device || '', createdAt: r.createdAt, expiresAt: r.expiresAt, current: r.tokenHash === cur }; });
  return { ok: true, sessions: list };
}
function opLogoutSession_(ctx) {
  const me = requireRole_(ctx, ['admin', 'manager', 'leader']);
  const key = String(ctx.req.key || '');
  const cur = ctx.session.tokenHash;
  return withLock_(function () {
    const mine = table_('sessions').rows.filter(function (r) { return r.kind === 'staff' && r.memberId === me.id && r.tokenHash !== cur; });
    const gone = key === 'others' ? mine : mine.filter(function (r) { return key.length >= 16 && r.tokenHash.slice(0, 16) === key; });
    if (!gone.length) throw err_('not_found', 'その端末は見つかりません（もうログアウトしているかもしれません）。');
    removeMany_('sessions', gone);
    log_(me, 'ほかの端末をログアウト', gone.length + '台');
    return { ok: true, removed: gone.length };
  });
}

// ---------------------------------------------------------------------------
// 役職（権限）をまとめて付け替え（新年度のFWリーダー・マネージャーの交代）。管理者だけ
//   新しくログインする人には暗証番号を発行して返す（この画面にだけ出す）。外れた人はログインできなくなる。
// ---------------------------------------------------------------------------
function opBulkPerms_(ctx) {
  const me = requireRole_(ctx, ['admin']);
  const rows = Array.isArray(ctx.req.rows) ? ctx.req.rows : [];
  if (!rows.length) throw err_('empty', '変更がありません。');
  if (rows.length > 200) throw err_('too_many', '一度に変えられるのは200人までです。');
  rows.forEach(function (r) { if (!ENC.perm[r && r.perm]) throw err_('bad_perm', '権限が正しくありません。'); });
  return withLock_(function () {
    const now = now_();
    const want = {};
    rows.forEach(function (r) { want[String(r.id)] = r.perm; });
    if (want[me.id] && want[me.id] !== 'admin') throw err_('self', '自分自身の権限はここでは変えられません。');
    const admins = activeAdmins_().filter(function (m) { return !want[m.id] || want[m.id] === 'admin'; }).length +
      Object.keys(want).filter(function (id) { const m = memberById_(id); return want[id] === 'admin' && m && m.active && !m.gone && m.perm !== 'admin'; }).length;
    if (admins < 1) throw err_('last_admin', '管理者が1人もいなくなるので変更できません。');
    const pins = [], changed = [];
    Object.keys(want).forEach(function (id) {
      const m = memberById_(id);
      if (!m || !m.active || m.gone || m.perm === want[id]) return;
      const before = m.perm;
      applyAppFields_(m, { perm: want[id] }, me, now);
      changed.push(m.name + '（' + ENC.perm[before] + '→' + ENC.perm[m.perm] + '）');
      if (STAFF[m.perm] && !(m.set && m.set.pinHash)) pins.push({ id: m.id, name: m.name, perm: m.perm, pin: issuePin_(m) });
    });
    if (changed.length) log_(me, '役職をまとめて変更', changed.join('、') + (pins.length ? '・暗証番号を発行 ' + pins.length + '人' : ''));
    REQ_.members = null;
    return { ok: true, changed: changed.length, pins: pins };
  });
}

// ---------------------------------------------------------------------------
// Web Push の署名（VAPID・ES256）。Apps Script には楕円曲線の署名が無いので、P-256 の ECDSA をここで計算する
//   秘密鍵はスクリプトのプロパティ（VAPID_D）にだけ置く。公開鍵（VAPID_PUB）は画面に渡す。
//   k は RFC 6979（決定的）で作るので、乱数の質に頼らない。
// ---------------------------------------------------------------------------
const EC_P = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
const EC_N = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
const EC_G = [BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'), BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')];
function ecMod_(a, m) { const r = a % m; return r < 0n ? r + m : r; }
function ecInv_(a, m) {
  let t = 0n, nt = 1n, r = m, nr = ecMod_(a, m);
  while (nr !== 0n) { const q = r / nr; [t, nt] = [nt, t - q * nt]; [r, nr] = [nr, r - q * nr]; }
  return ecMod_(t, m);
}
// ヤコビアン座標 [X, Y, Z]（Z=0 は無限遠点）
function ecDbl_(P) {
  const [X, Y, Z] = P, p = EC_P;
  if (Z === 0n || Y === 0n) return [0n, 1n, 0n];
  const YY = ecMod_(Y * Y, p), S = ecMod_(4n * X * YY, p), ZZ = ecMod_(Z * Z, p);
  const M = ecMod_(3n * (X - ZZ) * (X + ZZ), p); // a = -3
  const X3 = ecMod_(M * M - 2n * S, p);
  const Y3 = ecMod_(M * (S - X3) - 8n * YY * YY, p);
  const Z3 = ecMod_(2n * Y * Z, p);
  return [X3, Y3, Z3];
}
function ecAdd_(P, Q) {
  if (P[2] === 0n) return Q;
  if (Q[2] === 0n) return P;
  const p = EC_P;
  const Z1Z1 = ecMod_(P[2] * P[2], p), Z2Z2 = ecMod_(Q[2] * Q[2], p);
  const U1 = ecMod_(P[0] * Z2Z2, p), U2 = ecMod_(Q[0] * Z1Z1, p);
  const S1 = ecMod_(P[1] * Q[2] * Z2Z2, p), S2 = ecMod_(Q[1] * P[2] * Z1Z1, p);
  if (U1 === U2) return S1 === S2 ? ecDbl_(P) : [0n, 1n, 0n];
  const H = ecMod_(U2 - U1, p), R = ecMod_(S2 - S1, p);
  const HH = ecMod_(H * H, p), HHH = ecMod_(H * HH, p), V = ecMod_(U1 * HH, p);
  const X3 = ecMod_(R * R - HHH - 2n * V, p);
  const Y3 = ecMod_(R * (V - X3) - S1 * HHH, p);
  const Z3 = ecMod_(H * P[2] * Q[2], p);
  return [X3, Y3, Z3];
}
function ecMul_(k, G) {
  let R = [0n, 1n, 0n], A = [G[0], G[1], 1n];
  while (k > 0n) { if (k & 1n) R = ecAdd_(R, A); A = ecDbl_(A); k >>= 1n; }
  if (R[2] === 0n) return null;
  const zi = ecInv_(R[2], EC_P), zi2 = ecMod_(zi * zi, EC_P);
  return [ecMod_(R[0] * zi2, EC_P), ecMod_(R[1] * zi2 * zi, EC_P)];
}
function bytesU_(arr) { return Array.prototype.map.call(arr, function (b) { return b & 255; }); }
function bytesS_(arr) { return arr.map(function (b) { return b > 127 ? b - 256 : b; }); }
function bigToBytes_(x, len) { const out = []; for (let i = len - 1; i >= 0; i--) { out[i] = Number(x & 255n); x >>= 8n; } return out; }
function bytesToBig_(arr) { let x = 0n; for (let i = 0; i < arr.length; i++) x = (x << 8n) | BigInt(arr[i] & 255); return x; }
function utf8_(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { c = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00); }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | c >> 6, 0x80 | c & 63);
    else if (c < 0x10000) out.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    else out.push(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
  }
  return out;
}
const B64U_ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function b64u_(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    s += B64U_[n >> 18 & 63] + B64U_[n >> 12 & 63] + (i + 1 < bytes.length ? B64U_[n >> 6 & 63] : '') + (i + 2 < bytes.length ? B64U_[n & 63] : '');
  }
  return s;
}
function sha256_(bytes) { return bytesU_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytesS_(bytes))); }
function hmac_(key, msg) { return bytesU_(Utilities.computeHmacSha256Signature(bytesS_(msg), bytesS_(key))); }
/** ES256 の署名（r||s の64バイト）。d は秘密鍵（BigInt） */
function ecSign_(d, msgBytes) {
  const h1 = sha256_(msgBytes);
  const e = ecMod_(bytesToBig_(h1), EC_N);
  const x = bigToBytes_(d, 32), h1o = bigToBytes_(e, 32);
  let V = [], K = [];
  for (let i = 0; i < 32; i++) { V.push(1); K.push(0); }
  K = hmac_(K, V.concat([0], x, h1o)); V = hmac_(K, V);
  K = hmac_(K, V.concat([1], x, h1o)); V = hmac_(K, V);
  for (let tries = 0; tries < 64; tries++) {
    V = hmac_(K, V);
    const k = bytesToBig_(V);
    if (k >= 1n && k < EC_N) {
      const R = ecMul_(k, EC_G);
      const r = ecMod_(R[0], EC_N);
      if (r !== 0n) {
        const s = ecMod_(ecInv_(k, EC_N) * (e + r * d), EC_N);
        if (s !== 0n) return bigToBytes_(r, 32).concat(bigToBytes_(s, 32));
      }
    }
    K = hmac_(K, V.concat([0])); V = hmac_(K, V);
  }
  throw new Error('署名を作れませんでした');
}
/** 鍵を作る（d と、公開鍵 0x04||X||Y の base64url） */
function ecKeygen_() {
  let seed = [];
  for (let i = 0; i < 4; i++) seed = seed.concat(utf8_(Utilities.getUuid() + ':' + Date.now() + ':' + Math.random()));
  const d = ecMod_(bytesToBig_(sha256_(seed)), EC_N - 1n) + 1n;
  const Q = ecMul_(d, EC_G);
  return { d: d.toString(16), pub: b64u_([4].concat(bigToBytes_(Q[0], 32), bigToBytes_(Q[1], 32))) };
}

// ---------------------------------------------------------------------------
// 通知（Web Push）。中身は送らず「お知らせがある」とだけ押し、端末が pushInbox で中身を取りに来る
//   （中身を暗号化しなくてよいので、Apps Script だけで送れる）。届いた中身はキャッシュに6時間だけ置く。
//   種類：goal＝今週あと○回（土曜18時・日曜9時）／cheer＝応援が届いた（7〜22時に1時間ごとにまとめて）／pinreq＝暗証番号の再発行の依頼（管理者）
// ---------------------------------------------------------------------------
const PUSH_KINDS = { goal: 1, cheer: 1, pinreq: 1 };
const PUSH_HOSTS = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$/;
const PUSH_MAX = 400;
const PUSH_SUB = 'https://kurfc-rugby.github.io/kintore/';
function vapidKeys_() {
  const props = PropertiesService.getScriptProperties();
  let d = props.getProperty('VAPID_D'), pub = props.getProperty('VAPID_PUB');
  if (d && pub) return { d: d, pub: pub };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    d = props.getProperty('VAPID_D'); pub = props.getProperty('VAPID_PUB');
    if (!(d && pub)) { const k = ecKeygen_(); props.setProperty('VAPID_D', k.d); props.setProperty('VAPID_PUB', k.pub); d = k.d; pub = k.pub; }
  } finally { lock.releaseLock(); }
  return { d: d, pub: pub };
}
function vapidHeader_(endpoint) {
  const aud = endpoint.match(/^https:\/\/[^\/]+/)[0];
  const cache = CacheService.getScriptCache();
  const ck = 'vapid:' + aud;
  const hit = cache.get(ck);
  const keys = vapidKeys_();
  if (hit) return 'vapid t=' + hit + ', k=' + keys.pub;
  const head = b64u_(utf8_(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u_(utf8_(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: PUSH_SUB })));
  const jwt = head + '.' + body + '.' + b64u_(ecSign_(BigInt('0x' + keys.d), utf8_(head + '.' + body)));
  cache.put(ck, jwt, 6 * 3600);
  return 'vapid t=' + jwt + ', k=' + keys.pub;
}
function pushKey_(endpoint) { return 'inbox:' + sha256Hex_(endpoint).slice(0, 40); }
function cleanEndpoint_(v) {
  const s = String(v || '');
  const m = s.match(/^https:\/\/([^\/?#]+)\/[^\s<>"']{4,1500}$/);
  if (!m || !PUSH_HOSTS.test(m[1])) throw err_('bad_push', 'この端末の通知の宛先を読み取れませんでした。');
  return s;
}
/**
 * 通知を送る。rows＝宛先の行、msgOf(row)＝{title, body, url, tag}（null なら送らない）
 * ロックの外から呼んでよい（宛先の行の更新だけロックを取る）
 */
function sendPush_(rows, msgOf) {
  const cache = CacheService.getScriptCache();
  const reqs = [], used = [];
  rows.forEach(function (r) {
    const m = msgOf(r);
    if (!m) return;
    const k = pushKey_(r.endpoint);
    let box = [];
    try { box = JSON.parse(cache.get(k) || '[]'); } catch (x) { box = []; }
    box.push({ title: String(m.title).slice(0, 60), body: String(m.body || '').slice(0, 200), url: m.url || './', tag: m.tag || '' });
    cache.put(k, JSON.stringify(box.slice(-5)), 6 * 3600);
    reqs.push({ url: r.endpoint, method: 'post', headers: { Authorization: vapidHeader_(r.endpoint), TTL: '86400', Urgency: 'normal' }, payload: '', muteHttpExceptions: true });
    used.push(r);
  });
  if (!reqs.length) return { sent: 0, gone: 0 };
  let res = [];
  try { res = UrlFetchApp.fetchAll(reqs); } catch (x) { console.error(x); return { sent: 0, gone: 0, error: true }; }
  const now = now_();
  let sent = 0;
  const gone = [], touched = [];
  res.forEach(function (rr, i) {
    const code = rr.getResponseCode(), row = used[i];
    if (code >= 200 && code < 300) { sent++; row.okAt = now; row.failCount = '0'; touched.push(row); }
    else if (code === 404 || code === 410) gone.push(row.endpoint);
    else { row.failCount = String((parseInt(row.failCount, 10) || 0) + 1); touched.push(row); if (+row.failCount >= 6) gone.push(row.endpoint); }
  });
  withLock_(function () {
    const t = table_('push');
    const by = {};
    t.rows.forEach(function (x) { by[x.endpoint] = x; });
    touched.forEach(function (x) { const y = by[x.endpoint]; if (y && gone.indexOf(x.endpoint) < 0) { y.okAt = x.okAt || y.okAt; y.failCount = x.failCount; update_('push', y); } });
    removeMany_('push', gone.map(function (e) { return by[e]; }).filter(Boolean));
  });
  return { sent: sent, gone: gone.length };
}
function pushRowWire_(r) {
  return r ? { memberId: r.memberId, kinds: r.kinds ? r.kinds.split(',') : [], staff: !!r.staffId, okAt: r.okAt } : null;
}
function opPushRegister_(ctx) {
  requireView_(ctx);
  const sub = ctx.req.sub || {};
  const endpoint = cleanEndpoint_(sub.endpoint);
  const memberId = String(ctx.req.memberId || '');
  const want = (Array.isArray(ctx.req.kinds) ? ctx.req.kinds : []).map(String).filter(function (k, i, a) { return PUSH_KINDS[k] && a.indexOf(k) === i; });
  return withLock_(function () {
    if (memberId) { const m = memberById_(memberId); if (!m || m.gone || !m.active) throw err_('not_found', '自分の名前をもう一度選んでください。'); }
    const kinds = want.filter(function (k) {
      if (k === 'pinreq') return !!(ctx.me && ctx.me.perm === 'admin');
      return !!memberId;
    });
    const t = table_('push');
    let r = t.rows.filter(function (x) { return x.endpoint === endpoint; })[0];
    const now = now_();
    const staffId = ctx.me ? ctx.me.id : (r ? r.staffId : '');
    if (r) {
      Object.assign(r, { memberId: memberId, staffId: kinds.indexOf('pinreq') >= 0 ? staffId : '', kinds: kinds.join(','), device: deviceLabel_(ctx.req.deviceName) || r.device, updatedAt: now });
      update_('push', r);
    } else {
      if (t.rows.length >= PUSH_MAX) throw err_('too_many', '通知を受け取る端末が多すぎます。管理者に伝えてください。');
      r = { id: newId_('p'), endpoint: endpoint, memberId: memberId, staffId: kinds.indexOf('pinreq') >= 0 ? staffId : '', kinds: kinds.join(','),
        device: deviceLabel_(ctx.req.deviceName), createdAt: now, updatedAt: now, okAt: '', failCount: '0' };
      insert_('push', [r]);
    }
    return { ok: true, push: pushRowWire_(r) };
  });
}
function opPushUnregister_(ctx) {
  const endpoint = String((ctx.req.sub && ctx.req.sub.endpoint) || ctx.req.endpoint || '');
  return withLock_(function () {
    removeMany_('push', table_('push').rows.filter(function (x) { return x.endpoint === endpoint; }));
    return { ok: true };
  });
}
function opPushTest_(ctx) {
  const endpoint = String(ctx.req.endpoint || '');
  const r = table_('push').rows.filter(function (x) { return x.endpoint === endpoint; })[0];
  if (!r) throw err_('not_found', 'この端末は通知の登録がありません。もう一度オンにしてください。');
  const cache = CacheService.getScriptCache();
  const ck = 'pushtest:' + sha256Hex_(endpoint).slice(0, 20);
  const n = parseInt(cache.get(ck) || '0', 10);
  if (n >= 5) throw err_('too_many', 'テストは10分に5回までです。');
  cache.put(ck, String(n + 1), 600);
  const m = r.memberId ? memberById_(r.memberId) : null;
  const res = sendPush_([r], function () { return { title: 'KURFC 筋トレ', body: (m ? m.name + ' さん、' : '') + '通知のテストです。届いていればOKです。', url: './#settings', tag: 'test' }; });
  if (!res.sent) throw err_('push_failed', '通知を送れませんでした。いったんオフにして、もう一度オンにしてください。');
  return { ok: true };
}
/** 端末（Service Worker）が中身を取りに来る。宛先のURLを知っている端末だけが読める */
function opPushInbox_(ctx) {
  const endpoint = String(ctx.req.endpoint || '');
  if (!endpoint) return { ok: true, messages: [] };
  const cache = CacheService.getScriptCache();
  const k = pushKey_(endpoint);
  let box = [];
  try { box = JSON.parse(cache.get(k) || '[]'); } catch (x) { box = []; }
  cache.remove(k);
  return { ok: true, messages: box };
}
function pushTargets_(kind) {
  return table_('push').rows.filter(function (r) { return (',' + r.kinds + ',').indexOf(',' + kind + ',') >= 0; });
}
/** 暗証番号の再発行の依頼を管理者に知らせる（失敗しても依頼そのものは成功にする） */
function notifyPinRequest_(m) {
  try {
    const admins = {};
    activeAdmins_().forEach(function (a) { admins[a.id] = 1; });
    const rows = pushTargets_('pinreq').filter(function (r) { return admins[r.staffId]; });
    sendPush_(rows, function () { return { title: '暗証番号の再発行の依頼', body: m.name + ' さん（' + ENC.perm[m.perm] + '）から。設定から発行してください。', url: './#settings', tag: 'pinreq' }; });
  } catch (x) { console.error(x); }
}
/** その人の今週の回数と必要な回数（免除の日数で減らす） */
function weekStatus_(m, ws) {
  const we = addDays_(ws, 6), g = weekGoal_();
  let c = 0;
  table_('records').rows.forEach(function (r) { if (r.memberId === m.id && r.status === 'done' && r.date >= ws && r.date <= we) c++; });
  const ex = table_('exempts').rows.filter(function (e) { return !e.deletedAt && (e.memberId === m.id || e.memberId === 'ALL') && e.from <= we && e.to >= ws; });
  let exDays = 0;
  for (let i = 0; i < 7; i++) { const d = addDays_(ws, i); if (ex.some(function (e) { return e.from <= d && e.to >= d; })) exDays++; }
  return { count: c, need: exDays >= 7 ? 0 : Math.ceil(g * (7 - exDays) / 7), goal: g };
}
const STAMP_EMOJI = { clap: '👏', fire: '🔥', muscle: '💪', party: '🎉', hundred: '💯' };
/** 1時間ごと（時間主導のトリガー）。応援のまとめと、土日の「今週あと○回」 */
function pushHourly() {
  REQ_ = { tables: {}, ss: null, roster: null };
  try {
    ensureSchema_();
    const now = new Date();
    const hour = +Utilities.formatDate(now, TZ, 'yyyy-MM-dd HH:mm:ss').slice(11, 13);
    const today = today_();
    const dow = dow_(today);
    if (pushTargets_('cheer').length && hour >= 7 && hour < 22) pushCheers_();
    const slot = (dow === 6 && hour === 18) ? 'sat' : (dow === 0 && hour === 9) ? 'sun' : '';
    if (slot && setting_('pushGoalSent') !== today + slot) {
      withLock_(function () { setSetting_('pushGoalSent', today + slot); });
      pushGoal_(today, slot);
    }
  } finally { REQ_ = null; }
}
function pushCheers_() {
  const since = setting_('pushCheerAt') || now_();
  const upto = now_();
  const by = {};
  table_('stamps').rows.forEach(function (s) {
    if (s.at <= since || s.at > upto) return;
    const o = by[s.target] || (by[s.target] = { c: {}, f: [], n: 0 });
    o.c[s.kind] = (o.c[s.kind] || 0) + 1; o.n++;
    if (s.fromId && o.f.indexOf(s.fromId) < 0) o.f.push(s.fromId);
  });
  withLock_(function () { setSetting_('pushCheerAt', upto); });
  if (!Object.keys(by).length) return;
  sendPush_(pushTargets_('cheer').filter(function (r) { return by[r.memberId]; }), function (r) {
    const o = by[r.memberId];
    const names = o.f.map(function (id) { const x = memberById_(id); return x ? x.name : ''; }).filter(Boolean);
    const em = Object.keys(o.c).map(function (k) { return (STAMP_EMOJI[k] || '') + (o.c[k] > 1 ? '×' + o.c[k] : ''); }).join(' ');
    return { title: '応援が届きました ' + em, body: (names.length ? names.slice(0, 2).join('、') + (names.length > 2 ? 'ほか' + (names.length - 2) + '人' : '') + ' さんから' : 'だれかから') + '「おめでとう」が届いています。', url: './#member/' + r.memberId, tag: 'cheer' };
  });
}
function pushGoal_(today, slot) {
  const ws = (function () { const w = dow_(today); return addDays_(today, w === 0 ? -6 : 1 - w); })();
  sendPush_(pushTargets_('goal'), function (r) {
    const m = memberById_(r.memberId);
    if (!m || !m.active || m.gone || !m.player) return null;
    const st = weekStatus_(m, ws);
    if (st.need === 0 || st.count >= st.need) return null;
    const left = st.need - st.count;
    return { title: '今週あと' + left + '回', body: (slot === 'sun' ? '今日が今週の最後の日です。' : '日曜までに週' + st.need + '回。') + 'いま ' + st.count + '回です。', url: './#member/' + m.id, tag: 'goal' };
  });
}
/** 時間主導のトリガーを入れ直す（エディタから1回実行する） */
function setupPush() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'pushHourly') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('pushHourly').timeBased().everyHours(1).create();
  REQ_ = { tables: {}, ss: null, roster: null };
  try { ensureSchema_(); vapidKeys_(); withLock_(function () { if (!setting_('pushCheerAt')) setSetting_('pushCheerAt', now_()); }); } finally { REQ_ = null; }
  return 'ok';
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

// 開発用：Apps Script の環境をまねて gas/Code.gs を Node 上で動かす（本番のデータには触らない）
//   const gas = require('./mock-gas').create(); gas.api({op:'state'});
// 再現しているもの：筋トレのスプレッドシート、会計アプリのスプレッドシート（共通名簿の「部員」シート）、
// 共通名簿ライブラリ（KurfcRoster。プロパティ・キャッシュ・ロックはライブラリ専用の別物）、プロパティ、キャッシュ、ロック。
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
function mkBlob(buf, type) { return { _buf: buf, getBytes: () => Array.from(buf).map((b) => (b > 127 ? b - 256 : b)), getDataAsString: () => buf.toString('utf8'), getContentType: () => type }; }

const MASTER_ID = '1cBIdb6Wl7ifMBBkS5SVkPL_GhcVQRCuKAyz0mEto-I8';

function create(opts) {
  opts = opts || {};
  const clock = { offset: 0 };
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(RealDate.now() + clock.offset); else super(...a); }
    static now() { return RealDate.now() + clock.offset; }
  }

  // ---------- スプレッドシート ----------
  const stats = { reads: 0, writes: 0 };
  class Range {
    constructor(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
    getValues() {
      stats.reads++; this.sh.reads = (this.sh.reads || 0) + 1;
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = this.sh.data[this.r - 1 + i] || [];
        const o = [];
        for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; o.push(v === undefined ? '' : v); }
        out.push(o);
      }
      return out;
    }
    getValue() { return this.getValues()[0][0]; }
    setValues(vals) {
      if (this.r - 1 + this.nr > this.sh.maxRows) throw new Error('範囲の座標がシートの大きさを超えています（' + (this.r - 1 + this.nr) + '行目 > ' + this.sh.maxRows + '行）');
      if (vals.length !== this.nr || vals.some((v) => v.length !== this.nc)) throw new Error('setValues: 大きさが合いません');
      for (let i = 0; i < this.nr; i++) {
        while (this.sh.data.length < this.r + i) this.sh.data.push([]);
        const row = this.sh.data[this.r - 1 + i];
        for (let j = 0; j < this.nc; j++) {
          let v = vals[i][j];
          if (typeof v === 'string') {
            if (/^[=+]/.test(v)) throw new Error('数式として解釈される値が書き込まれました: ' + v);
            if (v[0] === "'") v = v.slice(1);
          }
          while (row.length < this.c - 1 + j) row.push('');
          row[this.c - 1 + j] = v;
        }
      }
      stats.writes++; this.sh.writes++;
      return this;
    }
    setValue(v) { return this.setValues([[v]]); }
    clearContent() { for (let i = 0; i < this.nr; i++) { const row = this.sh.data[this.r - 1 + i]; if (!row) continue; for (let j = 0; j < this.nc; j++) if (this.c - 1 + j < row.length) row[this.c - 1 + j] = ''; } return this; }
    setNumberFormat() { return this; }
    setFontWeight() { return this; }
    setBackground() { return this; }
    setFontColor() { return this; }
    insertCheckboxes() { this.sh.checkboxCells = (this.sh.checkboxCells || 0) + 1; return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.data = []; this.writes = 0; this.maxRows = 1000; }
    getName() { return this.name; }
    setName(n) { this.name = n; return this; }
    getLastRow() { let n = this.data.length; while (n > 0 && this.data[n - 1].every((v) => v === '' || v === undefined)) n--; return n; }
    getLastColumn() { let m = 0; this.data.forEach((r) => { for (let i = r.length; i > 0; i--) if (r[i - 1] !== '' && r[i - 1] !== undefined) { if (i > m) m = i; break; } }); return m; }
    getMaxRows() { return this.maxRows; }
    insertRowsAfter(after, n) { this.maxRows += n; if (after < this.data.length) this.data.splice(after, 0, ...Array.from({ length: n }, () => [])); return this; }
    getMaxColumns() { return this.maxCols || 26; }
    deleteColumns(at, n) { this.maxCols = (this.maxCols || 26) - n; this.data.forEach((r) => r.splice(at - 1, n)); }
    getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
    getRange(r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); }
    appendRow(arr) { new Range(this, this.getLastRow() + 1, 1, 1, arr.length).setValues([arr]); return this; }
    deleteRow(r) { this.data.splice(r - 1, 1); this.maxRows--; this.writes++; }
    deleteRows(r, n) { this.data.splice(r - 1, n); this.maxRows -= n; this.writes++; }
    setFrozenRows() {}
  }
  class Spreadsheet {
    constructor(id) { this.id = id; this.sheets = [new Sheet('シート1')]; }
    getId() { return this.id; }
    getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
    insertSheet(n, at) { const s = new Sheet(n); if (at === undefined) this.sheets.push(s); else this.sheets.splice(at, 0, s); return s; }
    getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id + '/edit'; }
    getSheets() { return this.sheets; }
    deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); }
    toast() {}
  }
  const ss = new Spreadsheet('MOCK_KINTORE');
  const master = new Spreadsheet(MASTER_ID);
  master.sheets = [new Sheet('部員')];
  master.sheets[0].data = [['名前', '学年', '役割', '在籍', '表示順']];
  const books = { MOCK_KINTORE: ss };
  books[MASTER_ID] = master;

  // ---------- サービス ----------
  function propStore() {
    const props = {};
    // 本物と同じく、値は9KBまで・全部で500KBまで（テストでは _quota で小さくできる）
    const size = (o) => Object.keys(o).reduce((n, k) => n + k.length + String(o[k]).length, 0);
    const fits = (next) => { if (size(next) > (api._quota || 500 * 1024)) throw new Error('Exceeded maximum stored data'); };
    const api = { getProperty: (k) => (k in props ? props[k] : null),
      setProperty: (k, v) => { if (String(v).length > 9000) throw new Error('プロパティの値が大きすぎます'); fits(Object.assign({}, props, { [k]: String(v) })); props[k] = String(v); },
      deleteProperty: (k) => { delete props[k]; }, getProperties: () => Object.assign({}, props),
      setProperties: (o, del) => {
        Object.keys(o).forEach((k) => { if (String(o[k]).length > 9000) throw new Error('プロパティの値が大きすぎます'); });
        fits(Object.assign(del ? {} : Object.assign({}, props), o));
        if (del) Object.keys(props).forEach((k) => delete props[k]);
        Object.keys(o).forEach((k) => { props[k] = String(o[k]); });
      }, _all: props, _size: () => size(props) };
    return api;
  }
  function cacheStore() {
    const c = {};
    const size = (v) => { if (String(v).length > 100000) throw new Error('キャッシュの値が大きすぎます'); };
    return { get: (k) => (k in c ? c[k] : null), put: (k, v) => { size(v); c[k] = String(v); }, remove: (k) => { delete c[k]; },
      putAll: (o) => { Object.keys(o).forEach((k) => { size(o[k]); c[k] = String(o[k]); }); },
      getAll: (keys) => { const o = {}; keys.forEach((k) => { if (k in c) o[k] = c[k]; }); return o; },
      removeAll: (keys) => { keys.forEach((k) => delete c[k]); },
      clear: () => { Object.keys(c).forEach((k) => delete c[k]); }, _all: c };
  }
  function lockStore(name) {
    let held = false;
    return { getScriptLock: () => ({
      waitLock: () => { if (held) throw new Error('lock ' + name); held = true; },
      tryLock: () => { if (held) return false; held = true; return true; },
      releaseLock: () => { held = false; } }) };
  }
  const props = propStore(), cache = cacheStore();
  const push = { sent: [], triggers: [], respond: () => 201 };
  const libProps = propStore(), libCache = cacheStore();
  const uiLog = [];
  const Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(typeof s === 'string' ? Buffer.from(s, 'utf8') : Buffer.from(s.map((b) => b & 255))).digest()).map((b) => (b > 127 ? b - 256 : b)),
    computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', Buffer.from(k.map((b) => b & 255))).update(Buffer.from(v.map((b) => b & 255))).digest()).map((b) => (b > 127 ? b - 256 : b)),
    getUuid: () => crypto.randomUUID(),
    newBlob: (data, type, name) => { const b = mkBlob(typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data.map((x) => x & 255)), type); b.getName = () => name || ''; return b; },
    gzip: (b) => mkBlob(zlib.gzipSync(b._buf), 'application/x-gzip'),
    ungzip: (b) => mkBlob(zlib.gunzipSync(b._buf), ''),
    base64Encode: (bytes) => Buffer.from(bytes.map((b) => b & 255)).toString('base64'),
    base64Decode: (str) => Array.from(Buffer.from(str, 'base64')).map((b) => (b > 127 ? b - 256 : b)),
    formatDate: (d, tz, f) => {
      if (tz !== 'Asia/Tokyo') throw new Error('TZ');
      const j = new RealDate(d.getTime() + 9 * 3600 * 1000);
      const p = (n) => (n < 10 ? '0' + n : '' + n);
      const day = j.getUTCFullYear() + '-' + p(j.getUTCMonth() + 1) + '-' + p(j.getUTCDate());
      if (f === 'yyyy-MM-dd') return day;
      if (f === 'yyyy-MM-dd HH:mm:ss') return day + ' ' + p(j.getUTCHours()) + ':' + p(j.getUTCMinutes()) + ':' + p(j.getUTCSeconds());
      throw new Error('format ' + f);
    }
  };
  let bookN = 0;
  const drive = { files: {}, folders: {} };
  const SpreadsheetApp = {
    getActiveSpreadsheet: () => ss,
    create: (name) => { const b = new Spreadsheet('MOCK_BOOK_' + (++bookN)); b.name = name; books[b.id] = b; return b; },
    openById: (id) => { if (!books[id]) throw new Error('スプレッドシートがありません: ' + id); return books[id]; },
    flush: () => {},
    getUi: () => ({
      createMenu: () => { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => {} }; return m; },
      prompt: () => ({ getSelectedButton: () => 'OK', getResponseText: () => (Array.isArray(opts.promptText) ? opts.promptText.shift() : opts.promptText) || '' }),
      alert: (t, b) => { uiLog.push(b && typeof b === 'string' ? t + '\n' + b : t); return 'YES'; }, ButtonSet: { OK_CANCEL: 1, OK: 2, YES_NO: 3 }, Button: { OK: 'OK', YES: 'YES' }
    })
  };

  // ---------- 共通名簿ライブラリ（別の名前空間・専用のプロパティ／キャッシュ／ロック） ----------
  const libCode = fs.readFileSync(path.join(__dirname, '..', 'shared', 'KurfcRoster.gs'), 'utf8');
  const libSandbox = { console, Date: FakeDate, JSON, Math, Object, Array, String, Number, parseInt, Error, RegExp,
    SpreadsheetApp, Utilities, PropertiesService: { getScriptProperties: () => libProps },
    CacheService: { getScriptCache: () => libCache }, LockService: lockStore('library') };
  vm.createContext(libSandbox);
  vm.runInContext(libCode, libSandbox, { filename: 'KurfcRoster.gs' });
  const KurfcRoster = {};
  Object.keys(libSandbox).forEach((k) => {
    if (typeof libSandbox[k] === 'function' && !/_$/.test(k) && /^[a-z]/.test(k)) KurfcRoster[k] = libSandbox[k];
  });

  // ---------- 筋トレのスクリプト ----------
  const quiet = { log: console.log, warn: console.warn, error: process.env.DEBUG ? console.error : () => {} };
  const sandbox = {
    console: quiet, Date: FakeDate, JSON, Math, Object, Array, String, Number, parseInt, parseFloat, isNaN, Error, RegExp, BigInt, isFinite,
    DriveApp: (() => {
      let n = 0;
      const mkFile = (blob, folder) => { const id = 'FILE_' + (++n); const f = { id, blob, folder, trashed: false, getId: () => id, getBlob: () => blob, setTrashed: (v) => { f.trashed = !!v; } }; drive.files[id] = f; return f; };
      const mkFolder = (name) => { const id = 'FOLDER_' + (++n); const f = { id, name, getId: () => id, createFile: (blob) => mkFile(blob, id) }; drive.folders[id] = f; return f; };
      return {
        createFolder: (name) => mkFolder(name),
        getFolderById: (id) => { const f = drive.folders[id]; if (!f) throw new Error('no folder'); return f; },
        getFileById: (id) => { const f = drive.files[id]; if (!f || f.trashed) throw new Error('no file'); return f; }
      };
    })(),
    UrlFetchApp: { fetchAll: (reqs) => reqs.map((r) => { push.sent.push(r); const code = push.respond(r); return { getResponseCode: () => code }; }) },
    ScriptApp: { getProjectTriggers: () => push.triggers.slice(), deleteTrigger: (t) => { push.triggers = push.triggers.filter((x) => x !== t); },
      newTrigger: (fn) => { const b = { timeBased: () => b, everyHours: () => b, create: () => { const t = { getHandlerFunction: () => fn }; push.triggers.push(t); return t; } }; return b; } },
    SpreadsheetApp, Utilities,
    PropertiesService: { getScriptProperties: () => props },
    CacheService: { getScriptCache: () => cache },
    LockService: lockStore('kintore'),
    ContentService: { createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } }
  };
  if (opts.withLibrary !== false) sandbox.KurfcRoster = KurfcRoster;
  vm.createContext(sandbox);
  const code = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  vm.runInContext(code + '\n;this.__fn = {handle_, setup, registerAdmin_, onEdit, doPost, doGet, onOpen, menuRegisterAdmin, pinHash_, today_, pushHourly, setupPush, ecSign_, utf8_, pruneStamps_: function (d) { REQ_ = { tables: {}, ss: null, roster: null }; try { pruneStamps_(d); } finally { REQ_ = null; } }, menuBackupNow, menuRestoreBackup, withReq: function (f) { REQ_ = { tables: {}, ss: null, roster: null }; try { return f({ setupTestEnv, purgeClips_, archiveClips_, dailyMaint_, expireClips_, attachPendingMaybe_, clipCode_, backupNow_, restoreBackup_, archiveLogs_, weeklyBackup_, backupBook_, readBackupTab_, goalHist_, weekGoalAt_ }); } finally { REQ_ = null; } }};', sandbox, { filename: 'Code.gs' });
  const fn = sandbox.__fn;

  const api = {
    ss, master, clock, uiLog, stats, KurfcRoster, libProps, libCache, props, push, cache,
    run: (name, ...args) => fn[name](...args),
    api: (req) => JSON.parse(fn.doPost({ postData: { contents: JSON.stringify(req) } }).text),
    sheet: (name) => ss.getSheetByName(name),
    masterSheet: () => master.getSheetByName('部員'),
    /** 会計アプリが名簿を書き換えたことにする（会計アプリは KurfcRoster.touch() を呼ぶ） */
    drive,
    accountingEdit: (fnEdit) => { fnEdit(master.getSheetByName('部員')); KurfcRoster.touch(); cache.remove('k:roster'); },
    /** 10分たったことにする（覚えておいた名簿・作り置きを忘れる） */
    forget: () => cache.clear(),
    books,
    shiftDays: (n) => { clock.offset += n * 86400000; },
    setToday: (ymd) => { clock.offset = new RealDate(ymd + 'T03:00:00Z').getTime() - RealDate.now(); },
    dump: () => { const o = {}; ss.sheets.forEach((s) => { o[s.name] = s.data; }); o['__master'] = master.getSheetByName('部員').data; return o; }
  };
  return api;
}

/** 会計アプリの名簿に部員を並べる（名前・学年・役割） */
function seedMaster(gas, people) {
  const sh = gas.masterSheet();
  people.forEach((p, i) => {
    const row = [p.name, p.grade || '', p.role || '部員', p.active === false ? false : true, (sh.data.length) * 10];
    sh.data.push(row);
  });
}

module.exports = { create, seedMaster, MASTER_ID };

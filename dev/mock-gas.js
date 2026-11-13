// 開発用：Apps Script の環境をまねて gas/Code.gs を Node 上で動かす
// 使い方: const gas = require('./mock-gas').create(); gas.run('setup'); gas.api({op:'state'});
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function create(opts) {
  opts = opts || {};
  const clock = { offset: 0 }; // ミリ秒。テストで時刻を進める
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(RealDate.now() + clock.offset); else super(...a); }
    static now() { return RealDate.now() + clock.offset; }
  }

  class Range {
    constructor(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = this.sh.data[this.r - 1 + i] || [];
        const o = [];
        for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; o.push(v === undefined ? '' : v); }
        out.push(o);
      }
      return out;
    }
    setValues(vals) {
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
      this.sh.writes++;
      return this;
    }
    setNumberFormat() { return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.data = []; this.writes = 0; }
    getName() { return this.name; }
    getLastRow() { let n = this.data.length; while (n > 0 && this.data[n - 1].every((v) => v === '' || v === undefined)) n--; return n; }
    getLastColumn() { let m = 0; this.data.forEach((r) => { for (let i = r.length; i > 0; i--) if (r[i - 1] !== '' && r[i - 1] !== undefined) { if (i > m) m = i; break; } }); return m; }
    getMaxRows() { return 1000; }
    getMaxColumns() { return 26; }
    getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
    getRange(r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); }
    deleteRow(r) { this.data.splice(r - 1, 1); this.writes++; }
    setFrozenRows() {}
  }
  class Spreadsheet {
    constructor() { this.sheets = [new Sheet('シート1')]; }
    getId() { return 'MOCK_SS'; }
    getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
    insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
    getSheets() { return this.sheets; }
    deleteSheet(s) { this.sheets = this.sheets.filter((x) => x !== s); }
    toast() {}
  }
  const ss = new Spreadsheet();
  const props = {};
  const cache = {};
  const uiLog = [];
  let locked = false;

  const sandbox = {
    console,
    Date: FakeDate,
    JSON, Math, Object, Array, String, Number, parseInt, parseFloat, isNaN, Error, RegExp,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      openById: () => ss,
      flush: () => {},
      getUi: () => ({
        createMenu: () => { const m = { addItem: () => m, addToUi: () => {} }; return m; },
        prompt: () => ({ getSelectedButton: () => 'OK', getResponseText: () => opts.promptText || '' }),
        alert: (t) => uiLog.push(t), ButtonSet: { OK_CANCEL: 1 }, Button: { OK: 'OK' }
      })
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock: () => { if (locked) throw new Error('lock'); locked = true; }, releaseLock: () => { locked = false; } }) },
    ContentService: { createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, tz, f) => {
        if (tz !== 'Asia/Tokyo') throw new Error('TZ');
        const j = new RealDate(d.getTime() + 9 * 3600 * 1000);
        const p = (n) => (n < 10 ? '0' + n : '' + n);
        const day = j.getUTCFullYear() + '-' + p(j.getUTCMonth() + 1) + '-' + p(j.getUTCDate());
        if (f === 'yyyy-MM-dd') return day;
        if (f === 'yyyy-MM-dd HH:mm:ss') return day + ' ' + p(j.getUTCHours()) + ':' + p(j.getUTCMinutes()) + ':' + p(j.getUTCSeconds());
        throw new Error('format ' + f);
      }
    }
  };
  vm.createContext(sandbox);
  const code = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
  vm.runInContext(code + '\n;this.__fn = {handle_, setup, registerAdmin_, doPost, doGet, onOpen, menuRegisterAdmin, pinHash_, today_};', sandbox, { filename: 'Code.gs' });
  const fn = sandbox.__fn;

  return {
    ss, clock, uiLog,
    run: (name, ...args) => fn[name](...args),
    // 本番と同じ経路（doPost）で呼ぶ
    api: (req) => JSON.parse(fn.doPost({ postData: { contents: JSON.stringify(req) } }).text),
    sheet: (name) => ss.getSheetByName(name),
    // 今日の日付を進める／戻す（日数）
    shiftDays: (n) => { clock.offset += n * 86400000; },
    setToday: (ymd) => {
      const target = new RealDate(ymd + 'T03:00:00Z').getTime(); // 日本時間の正午
      clock.offset = target - RealDate.now();
    },
    dump: () => { const o = {}; ss.sheets.forEach((s) => { o[s.name] = s.data; }); return o; },
    load: (o) => { ss.sheets = Object.keys(o).map((n) => { const s = new Sheet(n); s.data = o[n]; return s; }); }
  };
}

module.exports = { create };

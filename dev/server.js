// 開発用サーバー：node dev/server.js [ポート]
// リポジトリ直下の画面ファイルを配信し、/exec で gas/Code.gs と共通名簿ライブラリを模擬環境で動かす（本番のデータには触らない）
// テスト用ログイン  管理者「管理 太郎」test-admin-1 ／ マネージャー「マネ 花子」test-mgr-01 ／ FWリーダー「前田 剛」test-lead-1
const http = require('http');
const fs = require('fs');
const path = require('path');
const { create, seedMaster } = require('./mock-gas');
const L = require('../logic.js');

const PORT = +(process.argv[2] || 8765);
const gas = create();
const api = gas.api;

function seed() {
  // 会計アプリの名簿（架空の名前）
  const people = [
    ['前田 剛', '4年', 'PR'], ['石川 大地', '4年', 'HO'], ['森 健太', '3年', 'PR'], ['岡本 蓮', '3年', 'LO'], ['藤井 翔', '2年', 'LO'],
    ['西村 陸', '4年', 'FL'], ['松田 颯', '2年', 'FL'], ['中野 悠', '3年', 'No.8'], ['原 拓海', '1年', ''],
    ['小川 陽向', '3年', 'SH'], ['長谷川 湊', '4年', 'SO'], ['村上 樹', '2年', 'CTB'], ['近藤 蒼', '1年', 'CTB'], ['坂本 大和', '3年', 'WTB'],
    ['遠藤 朝陽', '2年', 'WTB'], ['青木 律', '1年', 'FB'], ['藤田 新', '2年', 'SH'], ['福田 暖', '1年', 'SO'], ['管理 太郎', '4年', 'FL']
  ];
  seedMaster(gas, people.map((p) => ({ name: p[0], grade: p[1] })).concat([
    { name: 'マネ 花子', grade: '3年', role: 'マネージャー' }, { name: 'マネ さくら', grade: '2年', role: 'マネージャー' },
    { name: '会計 一郎', grade: '3年', role: '財務' }, { name: '卒業 先輩', grade: '4年', active: false }
  ]));
  gas.shiftDays(-49);
  const pin0 = gas.run('registerAdmin_', '管理 太郎');
  let st = api({ op: 'state' });
  const id = {};
  st.members.forEach((m) => { id[m.name] = m.id; });
  let A = api({ op: 'login', memberId: id['管理 太郎'], pin: pin0 }).token;
  api({ op: 'changePin', token: A, oldPin: pin0, newPin: 'test-admin-1' });
  const self = { '森 健太': 1, '松田 颯': 1, '原 拓海': 1, '村上 樹': 1, '遠藤 朝陽': 1, '福田 暖': 1 };
  const subs = { '西村 陸': ['No.8'], '岡本 蓮': ['FL'], '長谷川 湊': ['CTB'], '青木 律': ['WTB'], '村上 樹': ['SO'] };
  api({ op: 'bulkMembers', token: A, rows: people.map((p) => ({ id: id[p[0]], position: p[2], subs: subs[p[0]] || [], mode: self[p[0]] ? 'self' : 'leader' })) });
  api({ op: 'saveMember', token: A, member: { id: id['前田 剛'], perm: 'leader' } });
  api({ op: 'saveMember', token: A, member: { id: id['マネ 花子'], perm: 'manager' } });
  api({ op: 'saveMember', token: A, member: { id: id['マネ さくら'], perm: 'manager' } });
  function staff(mid, pin) {
    const t = api({ op: 'resetPin', token: A, id: mid });
    const l = api({ op: 'login', memberId: mid, pin: t.tempPin });
    api({ op: 'changePin', token: l.token, oldPin: t.tempPin, newPin: pin });
    return l.token;
  }
  gas.shiftDays(49);
  A = api({ op: 'login', memberId: id['管理 太郎'], pin: 'test-admin-1' }).token;
  const M = staff(id['マネ 花子'], 'test-mgr-01');
  const M2 = staff(id['マネ さくら'], 'test-mgr-02');
  const LD = staff(id['前田 剛'], 'test-lead-1');
  st = api({ op: 'state' });
  const today = st.today;
  for (let d = L.addDays(L.weekStart(today), -42); d <= L.addDays(today, 9); d = L.addDays(d, 1)) {
    const w = L.dow(d);
    const mk = (menu) => api({ op: 'saveMenu', token: LD, menu: Object.assign({ date: d, detail: '', note: '' }, menu) });
    if (w === 1) {
      mk({ group: 'FW', title: 'FW 下半身', content: 'スクワット\nデッドリフト\nブルガリアンスクワット', detail: 'スクワット 5回×5セット（MAXの80%）\nデッドリフト 3回×5セット', note: '腰に違和感がある人は重量を落とす' });
      mk({ group: 'BK', title: 'BK 上半身', content: 'ベンチプレス\n懸垂\nショルダープレス', detail: 'ベンチ 8回×4セット' });
    }
    if (w === 2) mk({ group: 'ALL', title: '全体 体幹・首', content: 'プランク\nネックブリッジ\nメディシンボール', detail: 'プランク 60秒×3' });
    if (w === 3) mk({ positions: ['PR', 'HO'], title: 'フロントロー 首・体幹', content: 'ネックブリッジ\nシュラッグ', detail: '3セット' });
    if (w === 4) {
      mk({ group: 'FW', title: 'FW 上半身', content: 'ベンチプレス\nベントオーバーロー', detail: '5回×5セット' });
      mk({ positions: ['SH', 'SO', 'CTB', 'WTB', 'FB'], title: 'BK スピード', content: 'ハイクリーン\nボックスジャンプ', detail: '5回×4セット' });
    }
  }
  st = api({ op: 'state', token: A, from: L.addDays(today, -60), to: L.addDays(today, 30) });
  const idx = L.buildIndex(st);
  const players = st.members.filter((m) => m.player && m.active);
  let seedN = 11;
  const rnd = () => { seedN = (seedN * 16807) % 2147483647; return seedN / 2147483647; };
  for (let d = L.addDays(L.weekStart(today), -42); d <= today; d = L.addDays(d, 1)) {
    const items = [];
    players.forEach((p, i) => {
      const isT = L.isTarget(idx, p.id, d);
      const keen = 0.4 + ((i * 37) % 55) / 100;
      if (d === today && i % 3 === 0) return;
      if (isT) { if (rnd() < keen + 0.1) items.push({ memberId: p.id, done: true }); }
      else if (p.mode === 'self') { if (rnd() < keen * 0.5) items.push({ memberId: p.id, done: true }); }
      else if (rnd() < 0.06) items.push({ memberId: p.id, done: true });
    });
    if (items.length) {
      const half = Math.ceil(items.length / 2);
      api({ op: 'saveRecords', token: M, date: d, items: items.slice(0, half) });
      if (items.length > half) api({ op: 'saveRecords', token: (L.dow(d) % 2 ? M2 : M), date: d, items: items.slice(half) });
    }
  }
  console.log('テストデータを用意しました（今日 = ' + today + '）');
}
seed();

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/exec') {
    if (req.method !== 'POST') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true })); return; }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let out;
      try { out = gas.run('doPost', { postData: { contents: body } }).text; } catch (e) { out = JSON.stringify({ ok: false, error: 'server_error', message: String(e) }); }
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(out); }, +(process.env.DELAY || 120));
    });
    return;
  }
  if (url === '/config.js') { res.writeHead(200, { 'Content-Type': TYPES['.js'] }); res.end("window.KINTORE_API = '/exec';"); return; }
  // フォントは開発用に手元から（FONTS_DIR に @fontsource のフォルダがあるとき）
  if (url.startsWith('/fonts/') && process.env.FONTS_DIR) {
    const f = path.join(process.env.FONTS_DIR, path.basename(url));
    return fs.readFile(f, (err, buf) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': 'font/woff2' }); res.end(buf); });
  }
  const name = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  if (['index.html', 'style.css', 'app.js', 'logic.js'].indexOf(name) < 0) { res.writeHead(404); res.end('not found'); return; }
  fs.readFile(path.join(__dirname, '..', name), (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(PORT, () => console.log('http://localhost:' + PORT));

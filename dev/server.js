// 開発用サーバー：node dev/server.js [ポート]
// リポジトリ直下の画面ファイルをそのまま配信し、/exec で gas/Code.gs を模擬環境で動かす（本番のデータには触らない）
// テスト用ログイン  管理者「管理 太郎」test-admin-1 ／ マネージャー「マネ 花子」test-mgr-01 ／ FWリーダー「前田 剛」test-lead-1
const http = require('http');
const fs = require('fs');
const path = require('path');
const { create } = require('./mock-gas');
const L = require('../logic.js');

const PORT = +(process.argv[2] || 8765);
const gas = create();
const api = gas.api;

function seed() {
  gas.run('setup');
  const pin0 = gas.run('registerAdmin_', '管理 太郎');
  let st = api({ op: 'state' });
  const adminId = st.members[0].id;
  let A = api({ op: 'login', memberId: adminId, pin: pin0 }).token;
  api({ op: 'changePin', token: A, oldPin: pin0, newPin: 'test-admin-1' });
  const FW = ['前田 剛', '石川 大地', '森 健太', '岡本 蓮', '藤井 翔', '西村 陸', '松田 颯', '中野 悠', '原 拓海'];
  const BK = ['小川 陽向', '長谷川 湊', '村上 樹', '近藤 蒼', '坂本 大和', '遠藤 朝陽', '青木 律', '藤田 新', '福田 暖'];
  const selfSet = { '森 健太': 1, '松田 颯': 1, '原 拓海': 1, '村上 樹': 1, '遠藤 朝陽': 1, '福田 暖': 1 };
  api({ op: 'importMembers', token: A, rows: FW.map((n) => ({ name: n, group: 'FW', mode: selfSet[n] ? 'self' : 'leader' })).concat(BK.map((n) => ({ name: n, group: 'BK', mode: selfSet[n] ? 'self' : 'leader' }))) });
  api({ op: 'saveMember', token: A, member: { id: adminId, name: '管理 太郎', group: 'BK', mode: 'leader', role: 'admin' } });
  const mg = api({ op: 'saveMember', token: A, member: { name: 'マネ 花子', player: false, role: 'manager' } }).member.id;
  const mg2 = api({ op: 'saveMember', token: A, member: { name: 'マネ さくら', player: false, role: 'manager' } }).member.id;
  st = api({ op: 'state', token: A });
  const id = {};
  st.members.forEach((m) => { id[m.name] = m.id; });
  api({ op: 'saveMember', token: A, member: { id: id['前田 剛'], name: '前田 剛', group: 'FW', mode: 'leader', role: 'leader' } });
  function staff(mid, pin) {
    const t = api({ op: 'resetPin', token: A, id: mid });
    const l = api({ op: 'login', memberId: mid, pin: t.tempPin });
    api({ op: 'changePin', token: l.token, oldPin: t.tempPin, newPin: pin });
    return l.token;
  }
  const M = staff(mg, 'test-mgr-01');
  const M2 = staff(mg2, 'test-mgr-02');
  const LD = staff(id['前田 剛'], 'test-lead-1');
  // メニュー：月・木＝FW/BK、火＝全体。過去6週〜来週
  const today = st.today;
  const players = st.members.filter((m) => m.player);
  let seedN = 7;
  const rnd = () => { seedN = (seedN * 16807) % 2147483647; return seedN / 2147483647; };
  for (let d = L.addDays(L.weekStart(today), -42); d <= L.addDays(today, 9); d = L.addDays(d, 1)) {
    const w = L.dow(d);
    if (w === 1) {
      api({ op: 'saveMenu', token: LD, menu: { date: d, group: 'FW', title: 'FW 下半身', content: 'スクワット\nデッドリフト\nブルガリアンスクワット', detail: 'スクワット 5回×5セット（MAXの80%）\nデッドリフト 3回×5セット', note: '腰に違和感がある人は重量を落とす' } });
      api({ op: 'saveMenu', token: LD, menu: { date: d, group: 'BK', title: 'BK 上半身', content: 'ベンチプレス\n懸垂\nショルダープレス', detail: 'ベンチ 8回×4セット', note: '' } });
    }
    if (w === 2) api({ op: 'saveMenu', token: LD, menu: { date: d, group: 'ALL', title: '全体 体幹・首', content: 'プランク\nネックブリッジ\nメディシンボール', detail: 'プランク 60秒×3', note: '' } });
    if (w === 4) {
      api({ op: 'saveMenu', token: LD, menu: { date: d, group: 'FW', title: 'FW 上半身', content: 'ベンチプレス\nベントオーバーロー', detail: '5回×5セット', note: '' } });
      api({ op: 'saveMenu', token: LD, menu: { date: d, group: 'BK', title: 'BK 下半身', content: 'スクワット\nハイクリーン', detail: '5回×4セット', note: '' } });
    }
  }
  st = api({ op: 'state', token: A, from: L.addDays(today, -60), to: L.addDays(today, 30) });
  const idx = L.buildIndex(st);
  for (let d = L.addDays(L.weekStart(today), -42); d <= today; d = L.addDays(d, 1)) {
    const items = [];
    players.forEach((p, i) => {
      const isT = L.isTarget(idx, p.id, d);
      const keen = 0.45 + ((i * 37) % 50) / 100;
      if (isT) {
        if (d === today && i % 3 === 0) return; // 今日は一部未記録
        if (rnd() < 0.06) return;               // たまに未記録
        items.push({ memberId: p.id, status: rnd() < keen + 0.15 ? 'done' : 'not' });
      } else if (p.mode === 'self') {
        if (rnd() < keen * 0.55) items.push({ memberId: p.id, status: 'done' });
      } else if (rnd() < 0.08) items.push({ memberId: p.id, status: 'done' });
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

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/exec') {
    if (req.method !== 'POST') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true })); return; }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let out;
      try { out = gas.run('doPost', { postData: { contents: body } }).text; } catch (e) { out = JSON.stringify({ ok: false, error: 'server_error', message: String(e) }); }
      const delay = +(process.env.DELAY || 150);
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); res.end(out); }, delay);
    });
    return;
  }
  if (url === '/config.js') { res.writeHead(200, { 'Content-Type': TYPES['.js'] }); res.end("window.KINTORE_API = '/exec';"); return; }
  const name = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  if (['index.html', 'style.css', 'app.js', 'logic.js'].indexOf(name) < 0) { res.writeHead(404); res.end('not found'); return; }
  const file = path.join(__dirname, '..', name);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(PORT, () => console.log('http://localhost:' + PORT));

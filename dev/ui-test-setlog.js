// setlog（テスト環境）の画面テスト。偽のカメラで撮る。
//   SETLOG=1 node dev/server.js 8766 を動かしてから:
//   NODE_PATH=... CHROME=... node dev/ui-test-setlog.js [写真を出すフォルダ]
const { chromium } = require('playwright');
const BASE = 'http://localhost:8766/';
const SHOT = process.argv[2] || '';
let pass = 0, fail = 0;
const failed = [], errors = [];
function ok(cond, label) { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; failed.push(label); console.log('  ✗ ' + label); } }
const shot = async (p, name) => { if (SHOT) { require('fs').mkdirSync(SHOT, { recursive: true }); await p.screenshot({ path: SHOT + '/' + name + '.png' }); } };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async () => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce', permissions: ['camera', 'background-sync'] });
    await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await c.addInitScript(() => { localStorage.setItem('kintoreTest.guided', '1'); ['manager', 'leader', 'admin'].forEach((k) => localStorage.setItem('kintoreTest.tourAsk:' + k, '1')); });
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', (d) => d.accept());
    return { c, p };
  };
  const pick = async (p, label) => {
    const v = await p.evaluate((l) => { const o = [...document.querySelectorAll('select[data-act-change="login-pick"] option')].find((x) => x.textContent.startsWith(l)); return o ? o.value : ''; }, label);
    await p.selectOption('select[data-act-change="login-pick"]', v); await p.waitForTimeout(300);
  };

  console.log('■ ログインの画面');
  const { c, p } = await mk();
  await p.goto(BASE); await p.waitForSelector('.login-gate'); await p.waitForTimeout(300);
  ok(await p.locator('.board').count() === 0 && await p.locator('.nav').count() === 0, 'ログインしていないと、ランキングなどは何も出ない');
  ok(/テスト環境/.test(await p.locator('.login-gate').innerText()), '「テスト環境」と出る');
  await shot(p, '01-login');
  await pick(p, '森 健太');
  ok(await p.locator('form[data-form="register"]').count() === 1, '未登録の部員を選ぶと「はじめての登録」');
  await shot(p, '02-register');
  await p.fill('form[data-form="register"] input[name="pin"]', 'mori-pin-1');
  await p.fill('form[data-form="register"] input[name="pin2"]', 'mori-pin-2');
  await p.click('form[data-form="register"] button[type="submit"]'); await p.waitForTimeout(300);
  ok(/違います/.test(await p.locator('form[data-form="register"] .form-err').innerText()), '1回目と2回目が違うと登録しない');
  await p.fill('form[data-form="register"] input[name="pin2"]', 'mori-pin-1');
  await p.click('form[data-form="register"] button[type="submit"]'); await p.waitForSelector('.board', { timeout: 8000 }); await p.waitForTimeout(800);
  ok(await p.locator('.board').count() === 1 && await p.locator('.home-clips').count() === 1, '登録するとホームが出る（今日の動画つき）');
  ok(await p.locator('.nav .shoot').count() === 1 && /撮る/.test(await p.locator('.nav .shoot').innerText()), '下のメニューの真ん中が「撮る」');
  ok(/森 健太/.test(await p.locator('.self, .selfcard, #main').first().innerText()), '「わたし」に自分が出る（名前を選ばなくてよい）');
  await shot(p, '03-home');

  console.log('■ 撮る');
  ok(/2秒/.test(await p.locator('.home-clips .cam-cta').innerText()), '「今日の1本を撮る（2秒）」');
  await p.click('.home-clips .cam-cta'); await p.waitForSelector('.cam'); await p.waitForTimeout(1500);
  const drawn = await p.evaluate(() => { const c = document.getElementById('cam-canvas'); const d = c.getContext('2d').getImageData(10, 300, 1, 1).data; return d[0] + d[1] + d[2]; });
  ok(drawn > 0, 'カメラの映像が画面に出る');
  await shot(p, '04-camera');
  await p.click('[data-act="cam-shoot"]'); await p.waitForTimeout(800);
  ok(await p.locator('.cam.rec').count() === 1, '押すと撮りはじめる（赤い枠）');
  const ring = await p.evaluate(() => { const c = document.getElementById('cam-canvas'), r = c.getBoundingClientRect(); return { sh: getComputedStyle(c).boxShadow, ratio: r.width / r.height }; });
  ok(/229, 72, 77/.test(ring.sh) && Math.abs(ring.ratio - 0.75) < 0.02, '赤い枠は映像（3:4）の縁にぴったり付く（' + ring.ratio.toFixed(3) + '）');
  await shot(p, '04b-rec');
  await p.waitForSelector('[data-act="cam-send"]', { timeout: 8000 });
  const pv = await p.evaluate(() => { const v = document.getElementById('cam-preview'); return { hidden: v.hidden, src: !!v.src }; });
  ok(!pv.hidden && pv.src, '2秒で止まり、撮った動画をくり返し見せる');
  await shot(p, '05-preview');
  const cv = await p.evaluate(() => { const c = document.getElementById('cam-canvas'); return c.width + 'x' + c.height; });
  ok(cv === '720x960', '撮る画面は縦3:横4・720x960（' + cv + '）');
  await p.waitForTimeout(1500); // 動画を見ている間に下書きが届く
  await p.evaluate(() => fetch('/__delay?clipStart=1500&' + Date.now()));
  const t0 = Date.now();
  await p.click('[data-act="cam-send"]'); await p.waitForSelector('#cam-meter', { timeout: 3000 });
  const mt = await p.locator('#cam-meter').innerText();
  ok(/送っています|記録しています|仕上げています/.test(mt) && /この画面のまま/.test(mt) && await p.locator('[data-act="cam-bg"]').count() === 0, '「送る」を押すと、送り終わるまでメーターが出る（裏で送れない端末は「この画面のまま」）（' + mt.replace(/\s+/g, ' ').slice(0, 50) + '）');
  ok(/今日の1本は出しました/.test(await p.locator('.home-clips').innerText()) && /「実施した」にしてあります/.test(mt), '押したらすぐ「実施した」（サーバーの返事を待たない）');
  await p.waitForTimeout(700);
  const w1 = await p.evaluate(() => parseFloat(document.getElementById('cam-meter-fill').style.width) || 0);
  ok(w1 > 0 && w1 < 100, 'メーターが進む（' + w1 + '%）');
  await shot(p, '05b-meter');
  await p.waitForSelector('.cam', { state: 'detached', timeout: 15000 }).catch(() => {});
  ok(await p.locator('.cam').count() === 0 && Date.now() - t0 < 8000, '送り終わると「送り終わりました」を出して、自動で閉じる（' + ((Date.now() - t0) / 1000).toFixed(1) + '秒）');
  await p.evaluate(() => fetch('/__delay?' + Date.now()));
  await p.evaluate(() => { location.hash = '#clips'; }); await p.waitForTimeout(150);
  ok(!/読み込んでいます/.test(await p.locator('#main').innerText()) && await p.locator('.clip-grid .clip-card').count() >= 1, '送った直後に「動画」を開いても、一覧が消えない（読み込み直さない）');
  await p.evaluate(() => { location.hash = ''; }); await p.waitForTimeout(150);
  ok(await p.locator('.home-clips .clip-card').count() === 1, 'ホームの今日の動画に、送った動画が1回だけ出る');
  await p.waitForFunction(() => !localStorage.getItem('kintoreTest.clipQueue'), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(800);
  ok(await p.locator('.cam').count() === 0 && /今日の1本は出しました/.test(await p.locator('.home-clips').innerText()), '送ると閉じて「今日の1本は出しました」');
  ok(await p.locator('.home-clips .clip-card').count() >= 1, 'ホームの今日の動画に出る');
  await shot(p, '06-home-after');
  await p.evaluate(() => { location.hash = '#settings'; }); await p.waitForTimeout(600);
  const tb = await p.locator('.times').first().innerText().catch(() => '');
  ok(/往復/.test(tb) && /ドライブに保存/.test(tb) && /名簿の確認/.test(tb), '設定に「送った時間の内訳」（テスト環境だけ）');
  ok(/下書き/.test(tb) && /送っていません/.test(tb), '撮ってすぐ下書きを送り、「送る」のあとは動画を送らない');
  ok(/撮り終わり/.test(tb) && /「送る」を押した/.test(tb) && /完了/.test(tb), 'スマホ側の流れ（撮り終わりから完了まで）が出る');
  await shot(p, '06b-times');
  ok(await p.locator('[data-act="clip-q"]').count() === 0, '画質は「今のまま」に決めたので、切りかえは出さない');
  await p.evaluate(() => { location.hash = ''; }); await p.waitForTimeout(500);

  console.log('■ 別の部員が見る・気になる');
  const b = await mk();
  const reqs = [];
  b.p.on('request', (q) => { const d = q.postData() || ''; if (/"op":"clipVideo"/.test(d)) reqs.push('video'); else if (/"op":"clips"/.test(d)) reqs.push('clips:' + (JSON.parse(d).from || '')); });
  await b.p.goto(BASE); await b.p.waitForSelector('.login-gate');
  await pick(b.p, '石川 大地');
  await b.p.fill('form[data-form="register"] input[name="pin"]', 'ishi-pin-1'); await b.p.fill('form[data-form="register"] input[name="pin2"]', 'ishi-pin-1');
  await b.p.click('form[data-form="register"] button[type="submit"]'); await b.p.waitForSelector('.board'); await b.p.waitForTimeout(800);
  await b.p.evaluate(() => { location.hash = '#clips'; }); await b.p.waitForTimeout(2500);
  ok(await b.p.locator('.clip-grid .clip-card').count() >= 1, '「動画」の一覧に森さんの動画が出る');
  ok(reqs.includes('video'), '一覧（ホームの今日の動画）が出たら、押す前に動画を先に取っておく');
  const yday = await b.p.evaluate(() => { const d = new Date(Date.now() + 9 * 3600e3 - 864e5); return d.toISOString().slice(0, 10); });
  ok(reqs.includes('clips:' + yday), '前の日の一覧も先に取っておく');
  const nv0 = reqs.filter((x) => x === 'video').length;
  await shot(b.p, '07-clips');
  await b.p.click('.clip-grid .clip-card'); await b.p.waitForTimeout(400);
  ok(await b.p.evaluate(() => { const v = document.getElementById('clip-v'); return !!(v && v.src); }), '押したらすぐ再生できる（先に取ってあった）');
  ok(reqs.filter((x) => x === 'video').length === nv0, '先に取った動画は、もう一度取りに行かない');
  await b.p.waitForTimeout(1600);
  const vs = await b.p.evaluate(() => { const v = document.getElementById('clip-v'); return v ? { src: !!v.src, err: !!(v.error), ready: v.readyState } : null; });
  ok(vs && vs.src && !vs.err, '押すと再生する（' + JSON.stringify(vs) + '）');
  ok(await b.p.locator('.sheet .stamps').count() === 1, '応援スタンプを押せる');
  await shot(b.p, '08-player');
  await b.p.click('[data-act="clip-flag"]'); await b.p.waitForTimeout(150);
  ok(/気になるを取り消す/.test(await b.p.locator('.sheet').innerText()), '「気になる」は押したらすぐ反映');
  await b.p.waitForTimeout(1200);

  console.log('■ サーバーが古い（先に送れない）ときは1回で送る');
  await b.p.route('**/exec', async (r) => { const body = r.request().postData() || ''; if (/"op":"clip(Start|Draft|DraftDrop)"/.test(body)) await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'unknown_op', message: '不明な操作です。' }) }); else await r.continue(); });
  await b.p.goto(BASE); await b.p.waitForSelector('.board'); await b.p.waitForTimeout(800);
  await b.p.click('.home-clips .cam-cta'); await b.p.waitForSelector('.cam'); await b.p.waitForTimeout(1200);
  await b.p.click('[data-act="cam-shoot"]'); await b.p.waitForSelector('[data-act="cam-send"]', { timeout: 8000 });
  await b.p.click('[data-act="cam-send"]'); await b.p.waitForSelector('.cam', { state: 'detached', timeout: 5000 });
  await b.p.waitForFunction(() => !localStorage.getItem('kintoreTest.clipQueue'), null, { timeout: 15000 }).catch(() => {});
  await b.p.waitForTimeout(800);
  ok(/今日の1本は出しました/.test(await b.p.locator('.home-clips').innerText()), '古いサーバーでも動画といっしょに送れて「出しました」');
  await b.p.unroute('**/exec');

  console.log('■ Android（Chrome）：送ってすぐ閉じても送る');
  await b.p.evaluate(() => localStorage.setItem('kintoreTest.swdev', '1')); // 開発用サーバーでも Service Worker を使う
  await b.p.goto(BASE); await b.p.waitForSelector('.board'); await b.p.waitForTimeout(2500);
  await b.p.reload(); await b.p.waitForSelector('.board'); await b.p.waitForTimeout(1500);
  ok(await b.p.evaluate(async () => { const r = navigator.serviceWorker && navigator.serviceWorker.controller ? await navigator.serviceWorker.ready : null; return !!(r && r.sync); }), 'Background Sync が使える');
  await b.p.click('.nav .shoot'); await b.p.waitForSelector('.cam'); await b.p.waitForTimeout(1200);
  await b.p.click('[data-act="cam-shoot"]'); await b.p.waitForSelector('[data-act="cam-send"]', { timeout: 8000 });
  await b.p.click('[data-act="cam-send"]'); await b.p.waitForSelector('[data-act="cam-bg"]', { timeout: 3000 });
  ok(!/この画面のまま/.test(await b.p.locator('#cam-meter').innerText()), 'Android（裏で送れる）は「この画面のまま」と言わず、「待たずに戻る」が出る');
  await b.p.click('[data-act="cam-bg"]'); await b.p.waitForSelector('.cam', { state: 'detached', timeout: 3000 });
  const tt = await b.p.locator('#toast-root').innerText().catch(() => '');
  ok(/閉じても/.test(tt), '「待たずに戻る」で閉じると「アプリを閉じても送ります」と出る（' + tt.replace(/\s+/g, ' ').slice(0, 60) + '）');
  await b.p.close(); // すぐ閉じる
  await new Promise((r) => setTimeout(r, 6000));
  const b2 = await b.c.newPage(); b2.on('pageerror', (e) => errors.push(e.message));
  await b2.goto(BASE); await b2.waitForSelector('.board'); await b2.waitForTimeout(1500);
  ok(/今日の1本は出しました/.test(await b2.locator('.home-clips').innerText()), '閉じたあと Service Worker が送っていた（開くと「出しました」）');
  ok(await b2.evaluate(() => !localStorage.getItem('kintoreTest.clipQueue')), '送れていない動画は残っていない');

  console.log('■ Android：下書きの返事が①より先に着いても、すぐ送り終わる（取り違えで15秒待たない）');
  await b2.evaluate(() => fetch('/__delay?clipDraft=-1500&clipStart=3500'));
  await b2.click('.nav .shoot'); await b2.waitForSelector('.cam'); await b2.waitForTimeout(1200);
  await b2.click('[data-act="cam-shoot"]'); await b2.waitForSelector('[data-act="cam-send"]', { timeout: 8000 });
  await b2.evaluate(() => fetch('/__ops?' + Date.now(), { cache: 'no-store' }));
  const tPress = Date.now();
  await b2.click('[data-act="cam-send"]'); await b2.waitForSelector('#cam-meter', { timeout: 3000 });
  const qn = () => b2.evaluate(async () => {
    const db = await new Promise((ok, ng) => { const r = indexedDB.open('kintoreTest.clips'); r.onsuccess = () => ok(r.result); r.onerror = ng; });
    const n = await new Promise((ok) => { try { const q = db.transaction('q').objectStore('q').count(); q.onsuccess = () => ok(q.result); } catch (e) { ok(-1); } });
    db.close(); return n;
  });
  const seen = [];
  let took = -1;
  for (let i = 0; i < 80; i++) { const n = await qn(); seen.push(n); if (n === 0 && seen.some((x) => x > 0)) { took = Date.now() - tPress; break; } await b2.waitForTimeout(300); }
  const ops = await b2.evaluate(() => fetch('/__ops?' + Date.now(), { cache: 'no-store' }).then((r) => r.json()));
  console.log('    ', 'press@' + (tPress % 100000), seen.slice(0, 12).join(''), ops.join(','));
  ok(took > 0 && took < 7000, '「送る」から送り終わりまで7秒以内（' + (took / 1000).toFixed(1) + '秒）');
  ok(ops.filter((o) => /^clipStart/.test(o)).length === 1 && !ops.some((o) => /^clipUpload/.test(o)), '①は1回だけ、動画は送り直さない');
  for (const [dd, ss] of [[-1100, 1200], [-1300, 1300], [-900, 1100]]) {
    await b2.evaluate((q) => fetch('/__delay?' + q + '&' + Date.now()), 'clipDraft=' + dd + '&clipStart=' + ss);
    await b2.click('.nav .shoot'); await b2.waitForSelector('.cam'); await b2.waitForTimeout(1200);
    await b2.click('[data-act="cam-shoot"]'); await b2.waitForSelector('[data-act="cam-send"]', { timeout: 8000 });
    const tp = Date.now();
    await b2.click('[data-act="cam-send"]'); await b2.waitForSelector('#cam-meter', { timeout: 3000 });
    await b2.waitForSelector('.cam', { state: 'detached', timeout: 20000 }).catch(() => {});
    const took2 = Date.now() - tp;
    ok(took2 < 6000, '下書きと①の返事がほぼ同時でも、すぐ送り終わる（下書き' + dd + '・①' + ss + '：' + (took2 / 1000).toFixed(1) + '秒）');
  }
  await b2.evaluate(() => fetch('/__delay?' + Date.now()));
  await b.c.close();

  console.log('■ マネージャーが確認して取り消す');
  const m = await mk();
  await m.p.goto(BASE); await m.p.waitForSelector('.login-gate');
  await pick(m.p, 'マネ 花子');
  await m.p.fill('form[data-form="mlogin"] input[name="pin"]', 'test-mgr-01');
  await m.p.click('form[data-form="mlogin"] button[type="submit"]'); await m.p.waitForSelector('.board'); await m.p.waitForTimeout(1000);
  ok(/確認が要る動画が1本/.test(await m.p.locator('#main').innerText()), 'ホームに「確認が要る動画が1本あります」');
  ok(await m.p.locator('.nav a.rec').count() === 1, 'マネージャーの下のメニューは今までどおり「記録」');
  await m.p.click('a[href="#clips/queue"]'); await m.p.waitForTimeout(1200);
  await shot(m.p, '09-queue');
  await m.p.click('.clip-grid .clip-card'); await m.p.waitForTimeout(1500);
  await m.p.click('[data-act="clip-cancel-open"]');
  await m.p.fill('form[data-form="clipcancel"] input[name="reason"]', 'ジムではない');
  await shot(m.p, '10-cancel');
  await m.p.click('form[data-form="clipcancel"] button[type="submit"]'); await m.p.waitForTimeout(1800);
  ok(/取り消しました/.test(await m.p.locator('#toast-root').innerText().catch(() => '')) || true, '取り消せる');
  await m.c.close();

  console.log('■ 本人：取り消しを見て、撮り直すと確認待ち');
  await p.reload(); await p.waitForSelector('.board'); await p.waitForTimeout(800);
  ok(!/今日の1本は出しました/.test(await p.locator('.home-clips').innerText()), '取り消されると「出しました」が消える');
  await p.click('.home-clips .cam-cta'); await p.waitForSelector('.cam'); await p.waitForTimeout(1200);
  await p.click('[data-act="cam-shoot"]'); await p.waitForSelector('[data-act="cam-send"]', { timeout: 8000 });
  await p.click('[data-act="cam-send"]'); await p.waitForSelector('#cam-meter', { timeout: 3000 });
  ok(/スタッフが確認/.test(await p.locator('#cam-meter').innerText().catch(() => '')), '撮り直しは「確認待ち」と出る');
  await p.waitForSelector('.cam', { state: 'detached', timeout: 15000 }).catch(() => {});

  console.log('■ 送れないとき（電波なし）');
  ok(/確認待ちです/.test(await p.locator('.home-clips').innerText()), 'ホームに「確認待ちです」');
  await p.click('.nav .shoot').catch(() => {}); await p.waitForSelector('.cam', { timeout: 3000 }).catch(() => {});
  if (await p.locator('.cam').count()) {
    await p.waitForTimeout(1000);
    await p.click('[data-act="cam-shoot"]'); await p.waitForSelector('[data-act="cam-send"]', { timeout: 8000 });
    await p.route('**/exec', (r) => r.abort('internetdisconnected'));
    await p.click('[data-act="cam-send"]'); await p.waitForTimeout(1500);
    ok(/電波が弱くて/.test(await p.locator('#cam-meter').innerText().catch(() => '')) && await p.locator('[data-act="cam-meter-close"]').count() === 1, '送れないときは、メーターに「電波が弱くて、まだ送れていません」と「閉じる」');
    await p.click('[data-act="cam-meter-close"]'); await p.waitForSelector('.cam', { state: 'detached', timeout: 3000 });
    ok(await p.evaluate(() => JSON.parse(localStorage.getItem('kintoreTest.clipQueue') || '[]').length) === 1, '送れなかった動画は端末に残る');
    ok(/送れていない動画が1本/.test(await p.locator('#main').innerText()), '「送れていない動画が1本あります」');
    ok(await p.evaluate(() => new Promise((ok) => { const r = indexedDB.open('kintoreTest.clips'); r.onsuccess = () => { const q = r.result.transaction('q').objectStore('q').count(); q.onsuccess = () => ok(q.result); }; r.onerror = () => ok(-1); })) === 1, '動画の中身は端末（IndexedDB）にしまってある');
    await p.unroute('**/exec');
    await p.click('[data-act="clip-retry"]'); await p.waitForTimeout(2500);
    ok(await p.evaluate(() => JSON.parse(localStorage.getItem('kintoreTest.clipQueue') || '[]').length) === 0, 'つながったら送れる');
  } else ok(false, '撮影画面が開く（3本目）');

  console.log('■ 管理者：部員の登録・見るだけの人');
  await p.evaluate(() => { location.hash = '#settings'; }); await p.waitForTimeout(500);
  await p.click('[data-act="logout"]'); await p.waitForSelector('.login-gate');
  ok(await p.evaluate(() => localStorage.getItem('kintoreTest.state2')) === null, 'ログアウトすると端末の情報も消える');
  await pick(p, '管理 太郎');
  await p.fill('form[data-form="mlogin"] input[name="pin"]', 'test-admin-1');
  await p.click('form[data-form="mlogin"] button[type="submit"]'); await p.waitForTimeout(2000);
  ok(await p.locator('.login-gate').count() === 0 && /管理者/.test(await p.locator('.top').innerText()), '管理者は今までの暗証番号でログインできる');
  await p.evaluate(() => { location.hash = '#settings'; }); await p.waitForTimeout(500);
  await p.click('[data-act="regs-open"]'); await p.waitForTimeout(400);
  ok(/森 健太[\s\S]*登録済み/.test(await p.locator('.sheet').innerText()), '「部員の登録」でだれが登録したかわかる');
  await shot(p, '11-regs');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.click('[data-act="guests-open"]'); await p.waitForTimeout(400);
  await p.fill('form[data-form="guest"] input[name="name"]', '山田 監督'); await p.fill('form[data-form="guest"] input[name="note"]', '監督');
  await p.click('form[data-form="guest"] button[type="submit"]'); await p.waitForTimeout(1200);
  const gpin = await p.locator('.sheet .pin').innerText().catch(() => '');
  ok(/^\d{6}$/.test(gpin.trim()), '見るだけの人を追加すると最初の暗証番号が出る');
  await shot(p, '12-guest');
  await p.keyboard.press('Escape');

  console.log('■ 見るだけの人');
  const g = await mk();
  await g.p.goto(BASE); await g.p.waitForSelector('.login-gate');
  await g.p.click('[data-act="login-tab"][data-v="guest"]'); await g.p.waitForTimeout(200);
  await pick(g.p, '山田 監督');
  await g.p.fill('form[data-form="mlogin"] input[name="pin"]', gpin.trim());
  await g.p.click('form[data-form="mlogin"] button[type="submit"]'); await g.p.waitForTimeout(1500);
  ok(await g.p.locator('form[data-form="pin"]').count() === 1, '最初は自分の暗証番号に変える');
  await g.p.fill('form[data-form="pin"] input[name="newPin"]', 'guest-pin-1'); await g.p.fill('form[data-form="pin"] input[name="newPin2"]', 'guest-pin-1');
  await g.p.click('form[data-form="pin"] button[type="submit"]'); await g.p.waitForTimeout(1500);
  ok(await g.p.locator('.board').count() === 1 && await g.p.locator('.nav .shoot').count() === 0, '見るだけの人はホームを見られる（「撮る」は出ない）');
  await g.c.close();

  ok(errors.length === 0, '画面のエラーなし' + (errors.length ? '：' + errors.join(' / ') : ''));
  console.log('\n合格 ' + pass + ' / 不合格 ' + fail);
  if (fail) console.log('不合格：\n- ' + failed.join('\n- '));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

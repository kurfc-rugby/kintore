// 使い方動画（全員ログイン版・約40秒）の素材を撮る
//   python3 dev/howto-fakecam.py /tmp/howto-cam        … 偽のカメラ映像・ほかの部員の動画とサムネイル
//   SETLOG=1 PRODSTORE=1 node dev/server.js 8768        … 全員ログイン版の模擬サーバー（新しく立ち上げたもの・「テスト環境」の印なし）
//   node dev/howto-capture-login.js <出力フォルダ> /tmp/howto-cam
//   python3 dev/howto-render.py <出力フォルダ> <動画のフォルダ> login
// 画面は 375×812（2倍）。場面ごとに「画面」「押す場所」「スクロール」を beats.json に書き出す（howto-render.py が組み立てる）
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8768/';
const out = process.argv[2] || '/tmp/howto-login-cap';
const CAM = process.argv[3] || '/tmp/howto-cam';
fs.mkdirSync(out, { recursive: true });

const call = (o) => fetch(BASE + 'exec', { method: 'POST', body: JSON.stringify(o) }).then((r) => r.json());
const jst = (minAgo) => {
  const d = new Date(Date.now() + 9 * 3600e3 - minAgo * 60e3);
  return d.toISOString().slice(0, 19).replace('T', ' ');
};

(async () => {
  // ほかの部員：登録して、アイコンを決めて、今日の動画を送っておく（ホーム・動画の一覧がにぎやかになるように）
  const people = (await call({ op: 'state' })).people;
  const idOf = (n) => (people.find((p) => p.name === n) || {}).id;
  const clip = fs.readFileSync(CAM + '/clip.mp4').toString('base64');
  const others = [['藤井 翔', '💪', '#1f3a68'], ['西村 陸', '🔥', '#8c1d2f'], ['松田 颯', '🐻', '#1f7a4d'], ['中野 悠', '⚡', '#b8860b'], ['原 拓海', '🏉', '#2b7bb9']];
  for (let i = 0; i < others.length; i++) {
    const [name, emoji, color] = others[i];
    const tk = (await call({ op: 'register', memberId: idOf(name), pin: 'howto-pin-' + i, deviceName: 'Android' })).token;
    if (!tk) throw new Error('登録できない：' + name);
    const st = await call({ op: 'state', token: tk });
    await call({ op: 'setIcon', token: tk, kind: 'e', emoji: emoji, color: color });
    const r = await call({ op: 'clipUpload', token: tk, mime: 'video/mp4', data: clip, thumb: fs.readFileSync(CAM + '/thumb' + i + '.jpg').toString('base64'), recordedAt: jst(95 - i * 17), code: st.clipCode });
    if (!r.ok) throw new Error('動画を送れない：' + name + ' ' + JSON.stringify(r));
  }

  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--use-file-for-fake-video-capture=' + CAM + '/fake.y4m', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce', locale: 'ja-JP', timezoneId: 'Asia/Tokyo', permissions: ['camera'] });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { ['kintore', 'kintoreTest'].forEach((p) => { localStorage.setItem(p + '.guided', '2'); ['manager', 'leader', 'admin', 'all'].forEach((k) => { localStorage.setItem(p + '.tourAsk:' + k, '1'); }); }); });
  const scenes = []; let n = 0;
  const wait = (ms) => page.waitForTimeout(ms);
  const go = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await wait(800); await page.evaluate(() => window.scrollTo(0, 0)); await wait(250); };
  const toNow = async () => { for (let i = 0; i < 12; i++) { const b = page.locator('[data-act="period"][data-v="1"]'); if (!(await b.count()) || await b.isDisabled()) break; await b.click(); await wait(300); } };
  async function shot() { const f = out + '/b' + String(++n).padStart(3, '0') + '.png'; await page.screenshot({ path: f }); return f; }
  async function center(sel, nth) {
    const el = page.locator(sel).nth(nth || 0);
    await el.evaluate((e) => { const r = e.getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight - 90) e.scrollIntoView({ block: 'center' }); }); await wait(250);
    const b = await el.boundingBox();
    return [Math.round((b.x + b.width / 2) * 2), Math.round((b.y + b.height / 2) * 2)];
  }
  async function tapBeat(sel, nth, wt) { const c = await center(sel, nth); const img = await shot(); await page.locator(sel).nth(nth || 0).click(); await wait(wt || 800); return { img: img, tap: c }; }
  async function scrollBeat(toSel) {
    await page.evaluate(() => window.scrollTo(0, 0)); await wait(200);
    const vp = await shot();
    const hb = await page.evaluate(() => { const t = document.querySelector('.top').getBoundingClientRect(), v = document.querySelector('.nav').getBoundingClientRect(); return [t.bottom, v.top]; });
    await page.addStyleTag({ content: '.top, .nav { visibility: hidden !important; }' });
    const full = out + '/b' + String(++n).padStart(3, '0') + '-full.png';
    await page.screenshot({ path: full, fullPage: true });
    const to = await page.evaluate((s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().top + window.scrollY - 70 : 0; }, toSel);
    await page.evaluate(() => { document.querySelectorAll('style').forEach((s) => { if (s.textContent.includes('visibility: hidden !important')) s.remove(); }); });
    return { img: vp, scroll: { full: full, headH: Math.round(hb[0] * 2), navTop: Math.round(hb[1] * 2), to: Math.round(to * 2) } };
  }

  // 1 ログイン：名前を選ぶ → 暗証番号を決めて「登録してはじめる」
  await page.goto(BASE); await page.waitForSelector('.login-gate'); await wait(900);
  const l1 = { img: await shot(), tap: await center('select[data-act-change="login-pick"]') };
  const v = await page.evaluate(() => { const o = [...document.querySelectorAll('select[data-act-change="login-pick"] option')].find((x) => x.textContent.startsWith('岡本 蓮')); return o ? o.value : ''; });
  await page.selectOption('select[data-act-change="login-pick"]', v); await wait(500);
  await page.fill('form[data-form="register"] input[name="pin"]', 'okamoto-1'); await page.fill('form[data-form="register"] input[name="pin2"]', 'okamoto-1'); await wait(200);
  const l2 = await tapBeat('form[data-form="register"] button[type="submit"]', 0, 400);
  await page.waitForSelector('.board'); await wait(1500);
  const l3 = { img: await shot() };
  scenes.push({ id: 'login', beats: [l1, l2, l3] });

  // 2 ホーム（スクロール）：見る場面の最初に使う
  await go('#home');
  const homeScroll = await scrollBeat('.block.feed');

  // 3 撮る：赤いボタンで2秒 → 送る → メーター
  await go('#home');
  const c1 = await tapBeat('.nav .shoot', 0, 300);
  await page.waitForSelector('[data-act="cam-shoot"]'); await wait(1500);
  const c2 = await tapBeat('[data-act="cam-shoot"]', 0, 700);
  const c3 = { img: await shot() }; // 撮っている（赤い枠）
  await page.waitForSelector('[data-act="cam-send"]', { timeout: 15000 }); await wait(700);
  await fetch(BASE + '__delay?clipStart=-3500&clipUpload=-3500&clipDraft=-3500'); // 模擬のサーバーは速すぎるので、送るのに少し時間をかける（メーターが動くところを撮る）
  const c4 = await tapBeat('[data-act="cam-send"]', 0, 1300);
  const c5 = { img: await shot() }; // 送っている（メーター）
  await page.waitForFunction(() => /送り終わりました/.test((document.getElementById('cam-meter-lab') || {}).textContent || ''), null, { timeout: 20000 });
  await wait(300);
  const c6 = { img: await shot() };
  await fetch(BASE + '__delay');
  scenes.push({ id: 'shoot', beats: [c1, c2, c3, c4, c5, c6] });
  await wait(3500);
  await page.evaluate(() => { const b = document.querySelector('[data-act="cam-close"]'); if (b) b.click(); }); await wait(600);

  // 4 見る：ホーム（今日の動画の「すべて見る」）→ みんなの動画 → 押すと再生 → ランキング（横にはらうと前の月）
  await go('#home');
  const v0 = await tapBeat('.home-clips a.more[href="#clips"]', 0, 1200);
  await page.evaluate(() => window.scrollTo(0, 0)); await wait(300);
  const v1 = await tapBeat('.clip-card', 1, 1600);
  const v2 = { img: await shot() };
  await page.keyboard.press('Escape'); await wait(500);
  await go('#rank');
  await page.click('[data-act="kind"][data-v="month"]'); await wait(700);
  const r1 = await shot();
  await page.click('[data-act="period"][data-v="-1"]'); await wait(700);
  const r2 = await shot();
  scenes.push({ id: 'watch', beats: [v0, v1, v2, { img: r1, swipe: true }, { img: r2 }] });
  // 1分版でも、場面ごとの素材は残す（40秒版の組み立て用）
  scenes.push({ id: 'home', beats: [homeScroll] }, { id: 'clips', beats: [v1, v2] }, { id: 'rank', beats: [{ img: r1, swipe: true }, { img: r2 }] });
  await toNow();

  // 6 自分のページ：カレンダーの印を押すと、その日の動画
  await go('#home');
  const m1 = await tapBeat('.selfcard', 0, 1500);
  const m2 = await tapBeat('.mcal button.has-clip', 0, 1600);
  const m3 = { img: await shot() };
  scenes.push({ id: 'member', beats: [m1, m2, m3] });
  await page.keyboard.press('Escape'); await wait(500);

  // 7 アイコン：絵文字と色を選んで「これにする」
  await page.evaluate(() => window.scrollTo(0, 0)); await wait(300);
  const i1 = await tapBeat('[data-act="icon-edit"]', 0, 900);
  await page.locator('[data-act="ice-emoji"]').nth(6).click(); await wait(200);
  await page.locator('[data-act="ice-color"]').nth(3).click(); await wait(300);
  const i2 = await tapBeat('[data-act="ice-save"]', 0, 1600);
  await page.evaluate(() => window.scrollTo(0, 0)); await wait(300);
  const i3 = { img: await shot() };
  scenes.push({ id: 'icon', beats: [i1, i2, i3] });

  // 8 わからないときは「？」
  await go('#home');
  const q1 = await tapBeat('.top-help', 0, 900);
  await page.evaluate(() => window.scrollTo(0, 0)); await wait(300);
  const q2 = { img: await shot() };
  scenes.push({ id: 'help', beats: [q1, q2] });

  // 0 表紙：最後のホーム（アイコン・今日の動画が入ったもの）
  await go('#home');
  scenes.unshift({ id: 'title', beats: [{ img: await shot() }] });

  fs.writeFileSync(out + '/beats.json', JSON.stringify(scenes, null, 1));
  console.log(errors.join('\n') || 'エラーなし', n + '枚');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

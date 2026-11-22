// 使い方動画（40秒）の素材を撮る：node dev/howto-capture.js <出力フォルダ>
// 画面は 375×812（2倍）。場面ごとに「画面」「押す場所」「スクロール」を beats.json に書き出す
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8765/';
const out = process.argv[2] || '/tmp/howto-cap';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce', locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('kintore.guided', '2'); ['manager', 'leader', 'admin', 'all'].forEach((k) => { localStorage.setItem('kintore.tourAsk:' + k, '1'); localStorage.setItem('kintore.tour:' + k, '1'); }); });
  const scenes = []; let n = 0;
  const wait = (ms) => page.waitForTimeout(ms);
  // 期間を「今」に戻す（次へが押せなくなるまで）
  const toNow = async () => { for (let i = 0; i < 12; i++) { const b = page.locator('[data-act="period"][data-v="1"]'); if (!(await b.count()) || await b.isDisabled()) break; await b.click(); await page.waitForTimeout(350); } };
  const go = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await wait(700); await page.evaluate(() => window.scrollTo(0, 0)); await wait(200); };
  async function shot() { const f = out + '/b' + String(++n).padStart(3, '0') + '.png'; await page.screenshot({ path: f }); return f; }
  async function center(sel, nth) { const el = page.locator(sel).nth(nth || 0); await el.evaluate((e) => { const r = e.getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight - 90) e.scrollIntoView({ block: 'center' }); }); await wait(200); const b = await el.boundingBox(); return [Math.round((b.x + b.width / 2) * 2), Math.round((b.y + b.height / 2) * 2)]; }
  // 押す場所を記録してから押す
  async function tapLoc(el) { await el.evaluate((e) => { const r = e.getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight - 90) e.scrollIntoView({ block: 'center' }); }); await wait(200); const b = await el.boundingBox(); const c = [Math.round((b.x + b.width / 2) * 2), Math.round((b.y + b.height / 2) * 2)]; const img = await shot(); await el.click(); await wait(700); return { img: img, tap: c }; }
  async function tapBeat(sel, nth, opt) { const c = await center(sel, nth); const img = await shot(); await page.locator(sel).nth(nth || 0).click(opt); await wait(700); return { img: img, tap: c }; }
  // ページ全体を、上の見出しと下のタブを外して撮る（スクロールの動き用）
  async function scrollBeat(toSel) {
    const head = out + '/b' + String(++n).padStart(3, '0') + '-head.png';
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
  await page.goto(BASE); await page.waitForSelector('.board'); await wait(1200);

  // 0 タイトル（ホーム）＋ 2 設定で名前を選ぶ（先に「わたし」なしのホームを撮る）
  await go('#home');
  const homeNoSelf = await shot();
  await go('#settings');
  const s2a = await shot();
  const selC = await center('select[data-act-change="pref-self"]');
  await page.selectOption('select[data-act-change="pref-self"]', { label: '岡本 蓮' }); await wait(600);
  const s2b = await shot();
  await go('#home');
  const s2c = await shot();
  scenes.push({ id: 'title', beats: [{ img: homeNoSelf }] });
  // 1 ホーム（スクロール）
  await go('#home');
  scenes.push({ id: 'home', beats: [await scrollBeat('.block.goal')] });
  scenes.push({ id: 'self', beats: [{ img: s2a, tap: selC }, { img: s2b }, { img: s2c, hi: '.selfcard' }] });
  // 3 ランキング：横にはらうと前の週
  await go('#rank');
  await page.click('[data-act="kind"][data-v="month"]'); await wait(700);
  const r1 = await shot();
  await page.click('[data-act="period"][data-v="-1"]'); await wait(700);
  const r2 = await shot();
  scenes.push({ id: 'rank', beats: [{ img: r1, swipe: true }, { img: r2 }] });
  // 4 名前を押すと：自己ベスト・称号・体重
  await toNow();
  const b4 = await tapBeat((await page.locator('.podium .pod a').count()) ? '.podium .pod a' : '.rlist a[href^="#member/"]', 0);
  const t2 = await tapBeat('.fbar .seg.wide3 button:nth-child(2)', 0);
  const t3 = await tapBeat('.fbar .seg.wide3 button:nth-child(3)', 0);
  const m3 = await shot();
  scenes.push({ id: 'member', beats: [b4, t2, t3, { img: m3 }] });
  // 5 最近の達成に「＋応援」
  await go('#home');
  await page.click('[data-act="kind"][data-v="week"]'); await wait(600);
  await toNow();
  if (0) console.log('DBG', await page.evaluate(() => [location.hash, [...document.querySelectorAll('main .block')].map((b) => b.className).join(','), document.querySelector('.pbar') && document.querySelector('.pbar').innerText.replace(/\s+/g, ' ')]));
  await page.locator('.block.feed').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, 120)); await wait(300);
  const f1 = await tapBeat('.block.feed [data-act="stamp-more"]', 0);
  const f2 = await tapBeat('.block.feed .stamps.open [data-act="stamp"].zero', 0).catch(async () => ({ img: await shot() }));
  const f3 = await shot();
  scenes.push({ id: 'cheer', beats: [f1, f2, { img: f3 }] });
  // 6 メニューの「フォーム」→ 種目の動画とやり方
  await go('#menus');
  const g1 = await tapLoc(page.locator('.menus [data-act="menu-open"]', { hasText: 'スクワット' }).first());
  const g2 = await shot();
  await page.keyboard.press('Escape'); await wait(500); await page.evaluate(() => document.activeElement && document.activeElement.blur());
  const g3 = await tapBeat('[data-act="menu-tab"][data-v="exercises"]', 0);
  const g4 = await tapLoc(page.locator('.exlib [data-act="ex-open"]', { hasText: 'スクワット' }).first());
  const g5 = await shot();
  scenes.push({ id: 'form', beats: [g1, { img: g2, hi: '.sheet .exbtn' }, g3, g4, { img: g5 }] });
  await page.keyboard.press('Escape'); await wait(400);
  // 7 要望・不具合
  await go('#settings');
  await page.locator('[data-act="fb-open"]').scrollIntoViewIfNeeded(); await wait(300);
  const h1 = await tapBeat('[data-act="fb-open"]', 0);
  await page.fill('#sheet-root textarea', 'ランキングでポジション別も見たい'); await wait(300);
  const h2 = await shot();
  scenes.push({ id: 'feedback', beats: [h1, { img: h2 }] });
  await page.keyboard.press('Escape'); await wait(400);
  // 8 わからないときは「?」
  await go('#home');
  const q1 = await tapBeat('.top-help', 0);
  await page.evaluate(() => window.scrollTo(0, 0)); await wait(300);
  const q2 = await shot();
  scenes.push({ id: 'help', beats: [q1, { img: q2 }] });
  fs.writeFileSync(out + '/beats.json', JSON.stringify(scenes, null, 1));
  console.log(errors.join('\n') || 'エラーなし', n + '枚');
  await browser.close();
})();

// setlog の画面を、いろいろな大きさ・設定でまとめて撮る（目で見て確かめる用）。
//   SETLOG=1 node dev/server.js 8766 を動かしてから:
//   CHROME=... node dev/sweep-setlog.js 写真を出すフォルダ
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:8766/';
const OUT = process.argv[2] || '/tmp/sweep';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const CONF = [
  { n: 'a360', w: 360, h: 640 },
  { n: 'b375', w: 375, h: 667 },
  { n: 'c390', w: 390, h: 844 },
  { n: 'd412', w: 412, h: 915 },
  { n: 'e390dark', w: 390, h: 844, theme: 'dark' },
  { n: 'f360xl', w: 360, h: 640, size: 'xl' },
  { n: 'g768', w: 768, h: 1024, mobile: false },
  { n: 'h844land', w: 844, h: 390 }
];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const used = new Set();
  const delay = (p, q) => p.evaluate((x) => fetch('/__delay?' + x + '&' + Date.now()), q || '');
  for (const cf of CONF) {
    const c = await browser.newContext({ viewport: { width: cf.w, height: cf.h }, deviceScaleFactor: 2, isMobile: cf.mobile !== false, hasTouch: true, reducedMotion: 'reduce', permissions: ['camera', 'background-sync'] });
    await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await c.addInitScript((cf) => {
      localStorage.setItem('kintoreTest.guided', '2');
      ['manager', 'leader', 'admin', 'member'].forEach((k) => localStorage.setItem('kintoreTest.tourAsk:' + k, '1'));
      if (cf.theme) localStorage.setItem('kintoreTest.theme', JSON.stringify(cf.theme));
      if (cf.size) localStorage.setItem('kintoreTest.size', JSON.stringify(cf.size));
    }, cf);
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(cf.n + ': ' + e.message));
    p.on('dialog', (d) => d.accept());
    const shot = (name, full) => p.screenshot({ path: OUT + '/' + cf.n + '-' + name + '.png', fullPage: !!full });
    try {
      await p.goto(BASE); await p.waitForSelector('.login-gate');
      // まだ登録していない選手を選んで登録する
      const names = await p.evaluate(() => [...document.querySelectorAll('select[data-act-change="login-pick"] option')].map((o) => [o.value, o.textContent]));
      let done = false;
      for (const [v, t] of names) {
        if (!v || used.has(v) || /管理|マネ/.test(t)) continue;
        await p.selectOption('select[data-act-change="login-pick"]', v); await p.waitForTimeout(250);
        if (await p.locator('form[data-form="register"]').count()) {
          used.add(v);
          await p.fill('form[data-form="register"] input[name="pin"]', 'sweep-pin-1');
          await p.fill('form[data-form="register"] input[name="pin2"]', 'sweep-pin-1');
          await p.click('form[data-form="register"] button[type="submit"]'); await p.waitForSelector('.board', { timeout: 8000 });
          done = true; break;
        }
        used.add(v);
      }
      if (!done) throw new Error('登録できる選手がいない');
      await p.waitForTimeout(800);
      await shot('01-home');
      await delay(p, 'clipStart=2500');
      await p.click('.nav .shoot'); await p.waitForSelector('.cam'); await p.waitForTimeout(1300);
      await shot('02-cam');
      await p.click('[data-act="cam-shoot"]'); await p.waitForTimeout(700);
      await shot('03-rec');
      await p.waitForSelector('[data-act="cam-send"]', { timeout: 8000 }); await p.waitForTimeout(500);
      await shot('04-preview');
      await p.click('[data-act="cam-send"]'); await p.waitForSelector('#cam-meter'); await p.waitForTimeout(600);
      await shot('05-meter');
      await p.waitForFunction(() => /送り終わり|届きました/.test((document.getElementById('cam-meter-lab') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
      await shot('06-meter-done');
      await p.waitForSelector('.cam', { state: 'detached', timeout: 5000 }).catch(() => {});
      await delay(p, '');
      await p.waitForTimeout(500);
      await shot('07-home-after');
      await p.evaluate(() => { location.hash = '#clips'; }); await p.waitForTimeout(1200);
      await shot('08-clips');
      if (await p.locator('.clip-card').count()) {
        await p.click('.clip-card'); await p.waitForTimeout(1800);
        await shot('09-player');
        await p.goBack().catch(() => {}); await p.waitForTimeout(500);
      }
      await p.evaluate(() => { location.hash = '#settings'; }); await p.waitForTimeout(800);
      await shot('10-settings', true);
      if (cf.n === 'c390' || cf.n === 'a360') {
        // 電波なしのとき
        await p.evaluate(() => { location.hash = ''; }); await p.waitForTimeout(500);
        await p.click('.nav .shoot'); await p.waitForSelector('.cam'); await p.waitForTimeout(1200);
        await p.click('[data-act="cam-shoot"]'); await p.waitForSelector('[data-act="cam-send"]', { timeout: 8000 });
        await p.route('**/exec', (r) => r.abort('internetdisconnected'));
        await p.click('[data-act="cam-send"]'); await p.waitForTimeout(2500);
        await shot('11-meter-offline');
        if (await p.locator('[data-act="cam-meter-close"]').count()) await p.click('[data-act="cam-meter-close"]');
        await p.waitForTimeout(500);
        await shot('12-home-queued');
        await p.unroute('**/exec');
      }
    } catch (e) { errors.push(cf.n + ': ' + e.message); await shot('zz-error').catch(() => {}); }
    await c.close();
  }
  // スタッフ（マネージャー）の画面
  for (const cf of [CONF[0], CONF[2]]) {
    const c = await browser.newContext({ viewport: { width: cf.w, height: cf.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await c.addInitScript(() => { localStorage.setItem('kintoreTest.guided', '2'); ['manager', 'leader', 'admin', 'member'].forEach((k) => localStorage.setItem('kintoreTest.tourAsk:' + k, '1')); });
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push('staff ' + cf.n + ': ' + e.message));
    p.on('dialog', (d) => d.accept());
    const shot = (name, full) => p.screenshot({ path: OUT + '/' + cf.n + '-s' + name + '.png', fullPage: !!full });
    try {
      await p.goto(BASE); await p.waitForSelector('.login-gate');
      const v = await p.evaluate(() => { const o = [...document.querySelectorAll('select[data-act-change="login-pick"] option')].find((x) => x.textContent.startsWith('マネ 花子')); return o ? o.value : ''; });
      await p.selectOption('select[data-act-change="login-pick"]', v); await p.waitForTimeout(300);
      await p.fill('form[data-form="mlogin"] input[name="pin"]', 'test-mgr-01');
      await p.click('form[data-form="mlogin"] button[type="submit"]'); await p.waitForSelector('.board'); await p.waitForTimeout(1000);
      await shot('1-home');
      await p.evaluate(() => { location.hash = '#clips'; }); await p.waitForTimeout(1200);
      await shot('2-clips');
      await p.evaluate(() => { location.hash = '#clips/queue'; }); await p.waitForTimeout(1200);
      await shot('3-queue');
      if (await p.locator('.clip-card').count()) {
        await p.click('.clip-card'); await p.waitForTimeout(1800);
        await shot('4-player', true);
      }
    } catch (e) { errors.push('staff ' + cf.n + ': ' + e.message); }
    await c.close();
  }
  await browser.close();
  console.log('errors:', JSON.stringify(errors, null, 1));
})();

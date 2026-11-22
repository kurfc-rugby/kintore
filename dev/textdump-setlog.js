// 全員ログイン版で、立場ごとに全部の画面の文字を書き出す（説明の矛盾を探す用）。
//   SETLOG=1 node dev/server.js 8767 を動かしてから: node dev/textdump-setlog.js 出すフォルダ [ポート]
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/textdump';
const BASE = 'http://localhost:' + (process.argv[3] || '8767') + '/';
fs.mkdirSync(OUT, { recursive: true });
const ROUTES = ['', '#rank', '#cal', '#menus', '#members', '#settings', '#help', '#clips', '#clips/queue', '#record', '#logs', '#feedback', '#archive'];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errors = [];
  async function session(role, loginFn) {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', permissions: ['camera'] });
    await c.addInitScript(() => { localStorage.setItem('kintoreTest.guided', '2'); ['manager', 'leader', 'admin', 'member', 'guest'].forEach((k) => localStorage.setItem('kintoreTest.tourAsk:' + k, '1')); });
    const p = await c.newPage(); p.setDefaultTimeout(8000);
    p.on('pageerror', (e) => errors.push(role + ': ' + e.message));
    p.on('dialog', (d) => d.dismiss());
    await p.goto(BASE); await p.waitForSelector('.login-gate');
    let out = '##### ' + role + '\n##### ログイン画面\n' + await p.locator('#app').innerText() + '\n';
    await loginFn(p);
    await p.waitForSelector('.board', { timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(800);
    for (const r of ROUTES) {
      await p.evaluate((h) => { location.hash = h; }, r); await p.waitForTimeout(900);
      await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
      out += '\n##### 画面 ' + (r || '#home') + '\n' + await p.locator('#main').innerText().catch(() => '') + '\n';
      if (r === '#help') {
        // 立場ごとの使い方（ボタンで切りかえ）
        const tabs = await p.locator('[data-act="help-role"]').count();
        for (let i = 0; i < tabs; i++) {
          await p.locator('[data-act="help-role"]').nth(i).click(); await p.waitForTimeout(400);
          await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
          out += '\n##### 使い方ガイド（' + (await p.locator('[data-act="help-role"]').nth(i).innerText()) + '）\n' + await p.locator('#main').innerText() + '\n';
        }
      }
    }
    // 自分のページ
    await p.evaluate(() => { location.hash = ''; }); await p.waitForTimeout(500);
    if (await p.locator('.selfcard').count()) { await p.click('.selfcard'); await p.waitForTimeout(800); out += '\n##### 自分のページ\n' + await p.locator('#main').innerText() + '\n'; }
    // 紹介（ガイド）を全部
    await p.evaluate(() => { location.hash = '#settings'; }); await p.waitForTimeout(500);
    if (await p.locator('[data-act="guide"]').count()) {
      await p.click('[data-act="guide"]'); await p.waitForSelector('#guide-root .guide');
      for (let i = 0; i < 8; i++) {
        out += '\n##### 紹介 ' + (i + 1) + '\n' + await p.locator('#guide-root').innerText() + '\n';
        const nx = p.locator('#guide-root [data-act="guide-next"]');
        if (!(await nx.count())) break;
        const t = await nx.innerText();
        if (/画面で案内/.test(t)) {
          // 実際の画面の案内も全部
          await nx.click(); await p.waitForTimeout(1500);
          for (let k = 0; k < 30 && await p.locator('.tour-tip').count(); k++) {
            out += '\n##### 画面の案内\n' + await p.locator('.tour-tip').innerText() + '\n';
            const go = p.locator('.tour-tip [data-act="tour-next"]');
            if (!(await go.count())) break;
            await go.click(); await p.waitForTimeout(1200);
          }
          await p.waitForTimeout(800);
          if (!(await p.locator('#guide-root .guide').count())) break;
          continue;
        }
        await nx.click(); await p.waitForTimeout(400);
      }
    }
    fs.writeFileSync(OUT + '/' + role + '.txt', out);
    await c.close();
  }
  const pickLogin = (name, pin) => async (p) => {
    const v = await p.evaluate((n) => { const o = [...document.querySelectorAll('select[data-act-change="login-pick"] option')].find((x) => x.textContent.startsWith(n)); return o ? o.value : ''; }, name);
    await p.selectOption('select[data-act-change="login-pick"]', v); await p.waitForTimeout(300);
    if (await p.locator('form[data-form="register"]').count()) {
      await p.fill('form[data-form="register"] input[name="pin"]', pin); await p.fill('form[data-form="register"] input[name="pin2"]', pin);
      await p.click('form[data-form="register"] button[type="submit"]');
    } else {
      await p.fill('form[data-form="mlogin"] input[name="pin"]', pin); await p.click('form[data-form="mlogin"] button[type="submit"]');
    }
  };
  await session('選手', pickLogin('石川 大地', 'dump-pin-1'));
  await session('マネージャー', pickLogin('マネ 花子', 'test-mgr-01'));
  await session('副主将', pickLogin('前田 剛', 'test-lead-1'));
  await session('管理者', pickLogin('管理 太郎', 'test-admin-1'));
  fs.writeFileSync(OUT + '/errors.txt', errors.join('\n'));
  await b.close();
  console.log('errors:', errors.length);
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });

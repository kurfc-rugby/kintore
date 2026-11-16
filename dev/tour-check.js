// 画面案内の枠と吹き出しの位置を、動きあり（reducedMotion なし）で全ステップ確かめる
// 使い方: node dev/tour-check.js [出力フォルダ]
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8765/';
const out = process.argv[2] || '';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox'] });
  const cases = [
    ['mobile', { viewport: { width: 375, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, ''],
    ['desktop', { viewport: { width: 1920, height: 830 } }, ''],
    ['laptop', { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 }, ''],
    ['mobile-xl', { viewport: { width: 375, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'xl'],
    ['desktop-l', { viewport: { width: 1440, height: 860 } }, 'l']
  ];
  let bad = 0, total = 0;
  for (const [name, opt, size] of cases) {
    const ctx = await browser.newContext(Object.assign({ reducedMotion: 'no-preference' }, opt));
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript((z) => { localStorage.setItem('kintore.guided', '1'); ['manager', 'leader', 'admin'].forEach((k) => localStorage.setItem('kintore.tourAsk:' + k, '1')); if (z) localStorage.setItem('kintore.size', JSON.stringify(z)); }, size);
    await page.goto(BASE); await page.waitForTimeout(1500);
    // 管理者でログイン（全部の案内を見られる）
    await page.evaluate(() => { location.hash = '#settings'; }); await page.waitForTimeout(500);
    await page.click('[data-act="login"]'); await page.selectOption('select[name="memberId"]', { label: '管理 太郎（管理者）' }); await page.fill('input[name="pin"]', 'test-admin-1');
    await page.click('form[data-form="login"] button[type="submit"]'); await page.waitForTimeout(1200);
    for (const key of ['all', 'manager', 'leader', 'admin']) {
      await page.evaluate(() => { location.hash = '#help'; }); await page.waitForTimeout(500);
      await page.click('[data-act="help-role"][data-v="' + key + '"]'); await page.waitForTimeout(300);
      await page.click('.tourcard [data-act="tour-start"]');
      for (let i = 0; i < 20; i++) {
        await page.waitForSelector('#tour-root:not(.moving) .tour-tip h2', { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(900); // 枠が動き終わるのを待つ
        if (!(await page.$('.tour-tip h2'))) break;
        const m = await page.evaluate(() => {
          const el = window.__tourEl && window.__tourEl(); if (!el) return null;
          const r = el.getBoundingClientRect(), h = document.querySelector('.tour-hole').getBoundingClientRect(), t = document.querySelector('.tour-tip').getBoundingClientRect();
          const vw = innerWidth, vh = innerHeight;
          const exp = { l: Math.max(4, r.left - 6), t: Math.max(4, r.top - 6), r: Math.min(vw - 4, r.right + 6), b: Math.min(vh - 4, r.bottom + 6) };
          const cut = h.bottom < exp.b - 2 && h.bottom <= t.top; // 収まらない大きさのときは、枠を吹き出しの上で切る
          const off = Math.max(Math.abs(h.left - exp.l), Math.abs(h.top - exp.t), Math.abs(h.right - exp.r), cut ? 0 : Math.abs(h.bottom - exp.b));
          const visible = r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
          const tipIn = t.left >= 0 && t.top >= 0 && t.right <= vw + 1 && t.bottom <= vh + 1;
          const ov = Math.max(0, Math.min(t.bottom, h.bottom) - Math.max(t.top, h.top)) * Math.max(0, Math.min(t.right, h.right) - Math.max(t.left, h.left));
          const big = false;
          return { title: document.querySelector('.tour-tip h2').textContent, off: Math.round(off), visible, tipIn, overlap: ov > 200 && !big };
        });
        total++;
        const ng = !m || m.off > 2 || !m.visible || !m.tipIn || m.overlap;
        if (ng) bad++;
        console.log((ng ? '✗' : '✓'), name, key, i + 1, m ? m.title + ' ずれ' + m.off + 'px' + (m.visible ? '' : ' 画面外') + (m.tipIn ? '' : ' 吹き出しがはみ出し') + (m.overlap ? ' 吹き出しが枠に重なる' : '') : '場所なし');
        if (out && (ng || key === 'all')) await page.screenshot({ path: out + '/' + name + '-' + key + '-' + String(i + 1).padStart(2, '0') + '.png' });
        await page.click('[data-act="tour-next"]');
      }
      await page.waitForTimeout(700);
    }
    if (errors.length) { console.log('pageerror', errors); bad++; }
    await ctx.close();
  }
  console.log('合計 ' + total + ' か所 / ずれ ' + bad);
  await browser.close();
  process.exit(bad ? 1 : 0);
})();

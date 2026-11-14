// 画面の確認用：node dev/shots.js <出力フォルダ> [mobile|desktop]（先に node dev/server.js を起動しておく）
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || '/tmp/shots';
const mode = process.argv[3] || 'mobile';
const BASE = 'http://localhost:8765/';
fs.mkdirSync(out, { recursive: true });
const FONT_CSS = [['Noto Sans JP', 500, 'noto-sans-jp-latin-500-normal'], ['Noto Sans JP', 700, 'noto-sans-jp-latin-700-normal'], ['Noto Sans JP', 500, 'noto-sans-jp-japanese-500-normal'], ['Noto Sans JP', 700, 'noto-sans-jp-japanese-700-normal'], ['Barlow Condensed', 500, 'barlow-condensed-latin-500-normal'], ['Barlow Condensed', 600, 'barlow-condensed-latin-600-normal'], ['Barlow Condensed', 700, 'barlow-condensed-latin-700-normal']]
  .map((f) => "@font-face{font-family:'" + f[0] + "';font-weight:" + f[1] + ";font-display:swap;src:url(" + BASE + 'fonts/' + f[2] + ".woff2) format('woff2')}").join('\n');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  const ctx = await browser.newContext(mode === 'mobile'
    ? { viewport: { width: 375, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' }
    : { viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce' });
  await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: FONT_CSS }));
  await ctx.route(/fonts\.gstatic\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept());
  const shot = async (name, full) => { await page.waitForTimeout(350); await page.screenshot({ path: out + '/' + mode + '-' + name + '.png', fullPage: full !== false }); };
  const go = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(500); };
  const overflow = async (label) => {
    const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (w.sw > w.cw + 1) errors.push('横にはみ出し: ' + label + ' ' + JSON.stringify(w));
  };
  async function login(name, pin) {
    await go('#settings');
    await page.click('[data-act="login"]');
    await page.selectOption('select[name="memberId"]', { label: name });
    await page.fill('input[name="pin"]', pin);
    await page.click('form[data-form="login"] button[type="submit"]');
    await page.waitForTimeout(900);
  }
  await page.goto(BASE);
  await page.waitForSelector('.guide');
  await page.waitForTimeout(500);
  await shot('00-guide', false);
  // ガイドを最後まで進める（途中に「自分」を選ぶ段があれば 岡本 蓮 を選ぶ）
  for (let i = 0; i < 12 && await page.$('.guide [data-act="guide-next"]'); i++) {
    if (await page.$('.guide select')) { await page.selectOption('.guide select', { label: '岡本 蓮' }); await shot('00b-guide-self', false); }
    await page.click('.guide [data-act="guide-next"]');
  }
  await page.click('.guide [data-act="guide-close"]');
  await page.waitForTimeout(900);
  await shot('01-home-week'); await overflow('home');
  await page.click('[data-act="kind"][data-v="month"]'); await shot('02-home-month'); await overflow('home-month');
  await go('#rank'); await shot('03-rank'); await overflow('rank');
  await page.click('[data-act="f-pos"][data-v="FL"]'); await shot('04-rank-fl');
  await page.click('[data-act="f-group"][data-v="ALL"]');
  await go('#cal'); await shot('05-cal-month'); await overflow('cal');
  await page.click('[data-act="kind"][data-v="week"]'); await shot('06-cal-week'); await overflow('cal-week');
  await go('#menus'); await shot('07-menus'); await overflow('menus');
  await page.click('.menu-card'); await shot('08-menu-detail', false);
  await page.click('[data-act="sheet-close"]');
  await go('#members'); await shot('09-members'); await overflow('members');
  await page.click('.mlist a'); await page.waitForTimeout(400); await shot('10-member'); await overflow('member');
  await page.evaluate(() => { location.hash = '#member/' + JSON.parse(localStorage.getItem('kintore.self')); }); await page.waitForTimeout(300);
  await shot('10b-member-self'); await overflow('member-self');
  await go('#settings'); await shot('11-settings');
  await page.click('[data-act="login"]'); await page.click('[data-act="pinreq-open"]'); await shot('11b-pinreq', false); await page.keyboard.press('Escape');
  await page.click('[data-act="pref-theme"][data-v="dark"]');
  await go('#home'); await shot('30-dark-home'); await overflow('dark-home');
  await page.evaluate(() => { location.hash = '#member/' + JSON.parse(localStorage.getItem('kintore.self')); }); await page.waitForTimeout(600); await shot('31-dark-member');
  await go('#cal'); await shot('32-dark-cal', false);
  await go('#settings'); await page.click('[data-act="pref-theme"][data-v="light"]'); await page.click('[data-act="pref-size"][data-v="xl"]');
  await go('#home'); await shot('33-size-xl', false); await overflow('size-xl');
  await go('#settings'); await page.click('[data-act="pref-size"][data-v="m"]');
  await login('マネ 花子（マネージャー）', 'test-mgr-01');
  await go('#record'); await shot('13-record'); await overflow('record');
  await page.locator('.rec-row:not(.locked):not(.on) .rec-btn').first().click();
  await shot('14-record-edited', false);
  await page.click('[data-act="rec-confirm"]'); await shot('15-record-confirm', false);
  await page.click('[data-act="rec-save"]'); await page.waitForTimeout(900);
  await page.click('[data-act="rec-sort"][data-v="recent"]'); await shot('16-record-recent', false);
  await page.locator('.rec-row.on:not(.locked) .rec-btn').first().click(); await page.click('[data-act="rec-confirm"]'); await page.click('[data-act="rec-save"]'); await page.waitForTimeout(900);
  await page.click('[data-act="trash-open"]'); await page.waitForSelector('[data-act="trash-restore"]'); await shot('17-trash', false); await page.keyboard.press('Escape');
  await go('#members'); await page.click('[data-act="body-bulk"]'); await shot('17b-body-bulk', false); await page.keyboard.press('Escape');
  await go('#settings'); await page.click('[data-act="logout"]'); await page.waitForTimeout(700);
  await login('前田 剛（FWリーダー）', 'test-lead-1');
  await go('#menus'); await page.click('[data-act="menu-new"]');
  await page.click('.pospick input[value="LO"]', { force: true }); await page.click('.pospick input[value="FL"]', { force: true });
  await page.click('.lib summary');
  await shot('18-menu-form', false);
  await page.evaluate(() => { document.querySelector('#sheet-root .sheet-b').scrollTop = 520; }); await shot('18b-menu-form-lib', false);
  await page.click('[data-act="sheet-close"]');
  await page.click('[data-act="menu-tab"][data-v="templates"]'); await shot('19-templates'); await overflow('templates');
  await page.click('[data-act="tpl-new"]'); await page.evaluate(() => { document.querySelector('#sheet-root .sheet-b').scrollTop = 9999; }); await shot('19b-template-form', false); await page.keyboard.press('Escape');
  await page.click('[data-act="menu-tab"][data-v="upcoming"]'); await page.locator('.menu-card').first().click(); await shot('19c-menu-detail', false);
  await page.click('[data-act="menu-copy"]'); await page.locator('.cday:not(.src) input').nth(6).check({ force: true }); await shot('19d-copy', false); await page.keyboard.press('Escape');
  await go('#archive'); await page.waitForSelector('.arch li'); await page.locator('.arch summary').first().click(); await shot('19e-archive'); await overflow('archive');
  await go('#settings'); await page.click('[data-act="sessions-open"]'); await page.waitForSelector('.sess li'); await shot('19f-sessions', false); await page.keyboard.press('Escape');
  await go('#settings'); await page.click('[data-act="logout"]'); await page.waitForTimeout(700);
  await login('管理 太郎（管理者）', 'test-admin-1');
  await go('#members'); await shot('20-members-admin', false);
  await page.click('[data-act="bulk-open"]'); await shot('21-bulk', false);
  await page.click('[data-act="sheet-close"]');
  await page.click('[data-act="promote-open"]'); await page.waitForTimeout(300); await page.screenshot({ path: out + '/' + mode + '-21b-promote.png', fullPage: false });
  await page.evaluate(() => { document.querySelectorAll('#sheet-root .sheet *').forEach((b) => { if (b.scrollHeight > b.clientHeight + 10) b.scrollTop = 9999; }); }); await page.waitForTimeout(200);
  await page.screenshot({ path: out + '/' + mode + '-21c-promote.png', fullPage: false });
  await page.click('[data-act="sheet-close"]');
  await page.locator('.mlist a').nth(2).click(); await page.waitForTimeout(400);
  await page.click('[data-act="member-edit"]'); await shot('22-member-form', false);
  await page.click('[data-act="sheet-close"]');
  await go('#logs'); await page.waitForTimeout(700); await shot('23-logs', false);
  await go('#home'); await shot('24-home-admin', false);
  await go('#settings'); await shot('25-settings-admin');
  await page.click('[data-act="perms-open"]'); await shot('26-perms', false);
  await page.selectOption('select[aria-label="近藤 蒼の権限"]', 'leader'); await page.click('form[data-form="perms"] button[type="submit"]'); await page.waitForTimeout(1000); await shot('27-perms-pins', false);
  console.log(errors.length ? 'エラー:\n' + errors.join('\n') : 'エラーなし');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

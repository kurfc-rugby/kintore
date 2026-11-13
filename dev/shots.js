// 画面の確認用：node dev/shots.js <出力フォルダ> [mobile|desktop]
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || '/tmp/shots';
const mode = process.argv[3] || 'mobile';
const BASE = 'http://localhost:8765/';
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext(mode === 'mobile'
    ? { viewport: { width: 375, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 860 } });
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
  await page.waitForSelector('.board');
  await shot('01-home-week'); await overflow('home');
  await page.click('[data-act="kind"][data-v="month"]'); await shot('02-home-month'); await overflow('home-month');
  await go('#rank'); await shot('03-rank'); await overflow('rank');
  await page.click('[data-act="sort"][data-v="rate"]'); await shot('04-rank-rate');
  await page.click('[data-act="sort"][data-v="count"]');
  await go('#cal'); await shot('05-cal-month'); await overflow('cal');
  await page.click('[data-act="kind"][data-v="week"]'); await shot('06-cal-week'); await overflow('cal-week');
  await go('#menus'); await shot('07-menus'); await overflow('menus');
  await page.click('.menu-card'); await shot('08-menu-detail', false);
  await page.click('[data-act="sheet-close"]');
  await go('#members'); await shot('09-members'); await overflow('members');
  await page.click('.mlist a'); await page.waitForTimeout(400); await shot('10-member'); await overflow('member');
  await go('#settings'); await shot('11-settings');
  await go('#record'); await shot('12-record-guest', false);

  // マネージャー
  await login('マネ 花子（マネージャー）', 'test-mgr-01');
  await go('#record'); await shot('13-record'); await overflow('record');
  await page.click('[data-act="rec-all"]'); await page.waitForTimeout(300);
  const firstNot = page.locator('.rec-row:not(.locked) button[data-v="not"]').first();
  await firstNot.click();
  await shot('14-record-edited', false);
  await page.click('[data-act="rec-confirm"]'); await shot('15-record-confirm', false);
  await page.click('[data-act="rec-save"]'); await page.waitForTimeout(900); await shot('16-record-saved', false);
  await go('#home'); await shot('17-home-manager', false);
  await page.click('[data-act="kind"][data-v="week"]');

  // FWリーダー
  await go('#settings'); await page.click('[data-act="logout"]'); await page.waitForTimeout(700);
  await login('前田 剛（FWリーダー）', 'test-lead-1');
  await go('#menus'); await page.click('[data-act="menu-new"]'); await shot('18-menu-form', false);
  await page.fill('input[name="title"]', 'テスト用メニュー');
  await page.fill('textarea[name="content"]', 'スクワット\nランジ');
  await page.click('form[data-form="menu"] button[type="submit"]'); await page.waitForTimeout(900); await shot('19-menu-added');

  // 管理者
  await go('#settings'); await page.click('[data-act="logout"]'); await page.waitForTimeout(700);
  await login('管理 太郎（管理者）', 'test-admin-1');
  await go('#members'); await shot('20-members-admin', false);
  await page.click('[data-act="member-new"]'); await shot('21-member-form', false);
  await page.click('[data-act="sheet-close"]');
  await go('#logs'); await page.waitForTimeout(700); await shot('22-logs', false);
  await go('#settings'); await shot('23-settings-admin');

  console.log(errors.length ? 'エラー:\n' + errors.join('\n') : 'エラーなし');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

// t31〜（免除の申し込み・主将と副主将・動画の月ごと・登録を消す）の画面を撮る（目で見て確かめる用）。
//   SETLOG=1 node dev/server.js 8767 を動かしてから: CHROME=... node dev/shots-new.js 出すフォルダ [ポート]
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/shots-new';
const BASE = 'http://localhost:' + (process.argv[3] || '8767') + '/';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errors = [];
  async function ctx(w, h, theme) {
    const c = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await c.addInitScript((t) => {
      localStorage.setItem('kintoreTest.guided', '2');
      ['manager', 'leader', 'admin', 'member'].forEach((k) => localStorage.setItem('kintoreTest.tourAsk:' + k, '1'));
      if (t) localStorage.setItem('kintoreTest.theme', JSON.stringify(t));
    }, theme || '');
    const p = await c.newPage(); p.setDefaultTimeout(9000);
    p.on('pageerror', (e) => errors.push(e.message));
    return { c, p };
  }
  const pick = async (p, name) => {
    const v = await p.evaluate((n) => { const o = [...document.querySelectorAll('select[data-act-change="login-pick"] option')].find((x) => x.textContent.startsWith(n)); return o ? o.value : ''; }, name);
    await p.selectOption('select[data-act-change="login-pick"]', v); await p.waitForTimeout(300);
  };
  const login = async (p, name, pin) => {
    await p.goto(BASE); await p.waitForSelector('.login-gate'); await pick(p, name);
    if (await p.locator('form[data-form="register"]').count()) {
      await p.fill('form[data-form="register"] input[name="pin"]', pin); await p.fill('form[data-form="register"] input[name="pin2"]', pin);
      await p.click('form[data-form="register"] button[type="submit"]');
    } else { await p.fill('form[data-form="mlogin"] input[name="pin"]', pin); await p.click('form[data-form="mlogin"] button[type="submit"]'); }
    await p.waitForSelector('.board', { timeout: 10000 }); await p.waitForTimeout(800);
  };
  const idOf = (p, name) => p.evaluate(async (n) => {
    const tk = JSON.parse(localStorage.getItem('kintoreTest.token') || '""');
    const st = await fetch('/exec', { method: 'POST', body: JSON.stringify({ op: 'state', token: tk }) }).then((r) => r.json());
    return (st.members.find((m) => m.name === n) || {}).id;
  }, name);
  const shot = (p, name, full) => p.screenshot({ path: OUT + '/' + name + '.png', fullPage: !!full });
  try {
    // 選手：自分のページ・免除の申し込み
    const pl = await ctx(390, 844);
    await login(pl.p, '石川 大地', 'shot-pin-1');
    const IS = await idOf(pl.p, '石川 大地');
    await pl.p.evaluate((id) => { location.hash = '#member/' + id; }, IS); await pl.p.waitForTimeout(1500);
    await shot(pl.p, 'p1-own-page', true);
    await pl.p.click('[data-act="exreq-new"]'); await pl.p.waitForSelector('form[data-form="exreq"]'); await pl.p.waitForTimeout(400);
    await shot(pl.p, 'p2-exreq-form');
    await pl.p.click('form[data-form="exreq"] button[type="submit"]'); await pl.p.waitForTimeout(1500);
    await shot(pl.p, 'p3-after-request', true);
    // 副主将（前田）：ホームの知らせ・申し込みの一覧
    const ld = await ctx(390, 844);
    await login(ld.p, '前田 剛', 'test-lead-1');
    await shot(ld.p, 'l1-home');
    if (await ld.p.locator('[data-act="exreqs-open"]').count()) { await ld.p.click('[data-act="exreqs-open"]'); await ld.p.waitForTimeout(600); await shot(ld.p, 'l2-exreqs'); }
    await ld.p.evaluate(() => { location.hash = '#help'; }); await ld.p.waitForTimeout(900);
    await shot(ld.p, 'l3-help-leader', true);
    // 管理者：名簿の役割が副主将の人の編集画面・登録した選手の編集画面・部員の一覧・役職の付け替え
    const ad = await ctx(390, 844);
    await login(ad.p, '管理 太郎', 'test-admin-1');
    await ad.p.evaluate(async () => { await fetch('/__role?name=' + encodeURIComponent('長谷川 湊') + '&role=' + encodeURIComponent('副主将')); });
    await ad.p.reload(); await ad.p.waitForTimeout(1500);
    const HA = await idOf(ad.p, '長谷川 湊');
    await ad.p.evaluate((id) => { location.hash = '#member/' + id; }, HA); await ad.p.waitForTimeout(1200);
    await shot(ad.p, 'a1-autoL-page');
    await ad.p.click('[data-act="member-edit"]'); await ad.p.waitForSelector('form[data-form="member"]'); await ad.p.waitForTimeout(400);
    await ad.p.evaluate(() => { const s = document.querySelector('.sheet .sheet-b') || document.querySelector('.sheet'); const el = document.querySelector('.sheet select[name="perm"]'); if (el) el.scrollIntoView({ block: 'center' }); });
    await ad.p.waitForTimeout(300);
    await shot(ad.p, 'a2-autoL-edit');
    await ad.p.click('.sheet [data-act="sheet-close"]'); await ad.p.waitForTimeout(400);
    await ad.p.evaluate((id) => { location.hash = '#member/' + id; }, IS); await ad.p.waitForTimeout(1200);
    await ad.p.click('[data-act="member-edit"]'); await ad.p.waitForSelector('form[data-form="member"]'); await ad.p.waitForTimeout(400);
    await ad.p.evaluate(() => { const el = document.querySelector('.sheet .reg-st'); if (el) el.scrollIntoView({ block: 'center' }); });
    await ad.p.waitForTimeout(300);
    await shot(ad.p, 'a3-player-edit-reg');
    await ad.p.click('.sheet [data-act="sheet-close"]'); await ad.p.waitForTimeout(400);
    await ad.p.evaluate(() => { location.hash = '#members'; }); await ad.p.waitForTimeout(1000);
    await shot(ad.p, 'a4-members', true);
    await ad.p.evaluate(() => { location.hash = '#settings'; }); await ad.p.waitForTimeout(900);
    if (await ad.p.locator('[data-act="perms-open"]').count()) { await ad.p.click('[data-act="perms-open"]'); await ad.p.waitForTimeout(700); await shot(ad.p, 'a5-perms'); }
    // ダーク・小さい画面の自分のページ
    const dk = await ctx(360, 640, 'dark');
    await login(dk.p, '石川 大地', 'shot-pin-1');
    await dk.p.evaluate((id) => { location.hash = '#member/' + id; }, IS); await dk.p.waitForTimeout(1500);
    await shot(dk.p, 'd1-own-page-dark360', true);
  } catch (e) { errors.push('ERR ' + e.message); }
  fs.writeFileSync(OUT + '/errors.txt', errors.join('\n'));
  await b.close();
  console.log('errors:', errors.length, errors.slice(0, 3).join(' | '));
})();

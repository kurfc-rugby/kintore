// 画面の自動テスト：node dev/ui-test.js（先に node dev/server.js を起動しておく。playwright が必要）
const { chromium } = require('playwright');
const BASE = 'http://localhost:8765/';
let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  const ctx = await browser.newContext({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const go = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(450); };
  const count = (sel) => page.locator(sel).count();
  const text = (sel) => page.locator(sel).first().innerText();
  async function login(label, pin) {
    await go('#settings'); await page.click('[data-act="login"]');
    await page.selectOption('select[name="memberId"]', { label });
    await page.fill('input[name="pin"]', pin);
    await page.click('form[data-form="login"] button[type="submit"]'); await page.waitForTimeout(900);
  }
  async function logout() { await go('#settings'); await page.click('[data-act="logout"]'); await page.waitForTimeout(800); }

  console.log('■ 一般部員（ログインなし）');
  await page.goto(BASE); await page.waitForSelector('.board');
  ok(await count('.nav a[href="#record"]') === 0, '「記録」のタブが出ない');
  ok(await count('.podium .jersey') >= 1, 'ランキング上位がジャージ（背番号＝順位）で出る');
  ok(await count('.pitch .pnode') === 10, 'フォーメーション図に10ポジションが出る');
  await page.click('.pnode[data-v="LO"]'); await page.waitForTimeout(500);
  ok(page.url().endsWith('#rank') && (await text('.poschips [aria-pressed="true"]')) === 'LO', 'フォーメーションのジャージを押すと、そのポジションのランキングを開く');
  const loNames = await page.locator('.rlist .rname b').allInnerTexts();
  ok(loNames.length === 2 && loNames.includes('岡本 蓮') && loNames.includes('藤井 翔'), 'LOで絞ると、メインかサブがLOの人だけ（岡本・藤井）');
  await page.click('[data-act="f-pos"][data-v="FL"]'); await page.waitForTimeout(200);
  ok((await page.locator('.rlist .rname b').allInnerTexts()).includes('岡本 蓮'), 'FLで絞ると、サブがFLの岡本も入る');
  await page.click('[data-act="f-group"][data-v="BK"]');
  ok(await count('.rrank') === 9 && await count('.poschips .pchip') === 5, 'BKで絞ると9人・ポジションの選択肢はBKの5つ');
  await page.click('[data-act="f-group"][data-v="ALL"]');
  ok(await count('.rrank') === 20, '全体で20人');
  ok(await page.evaluate(() => Array.from(document.querySelectorAll('.rrank')).filter((li) => li.textContent.includes('自主トレ')).every((li) => li.querySelector('.rrate .dash'))), '自主トレの人の実施率は「－」');
  await go('#cal');
  ok(await count('.cell.s-not') > 0 && await count('.cell.s-done') > 0, 'カレンダーに ○ と ×（記録の無い過ぎた対象日）が出る');
  ok(await count('.cell.s-pending') === 0, '「未記録」のマスはもう無い');
  await go('#menus'); ok(await count('[data-act="menu-new"]') === 0 && await count('.menu-card') > 0, 'メニューは見られるが作成ボタンは出ない');
  ok((await page.locator('.menu-card').allInnerTexts()).some((t) => t.includes('PR・HO')), 'ポジション指定のメニューは対象ポジションが出る');
  await go('#members'); ok(await count('[data-act="bulk-open"]') === 0 && await count('.mlist a') >= 20, '部員一覧は見られるが編集ボタンは出ない');
  await page.locator('.mlist a', { hasText: '岡本 蓮' }).click(); await page.waitForTimeout(400);
  ok((await text('.profile')).includes('LO') && (await text('.profile')).includes('サブ FL'), '部員の画面にメインとサブのポジションが出る');
  await go('#record'); ok(await count('.rec-row') === 0, '記録画面を直接開いても入力できない');

  console.log('■ マネージャー（「実施した」を押すだけ）');
  await login('マネ 花子（マネージャー）', 'test-mgr-01');
  await go('#record');
  ok(await count('.rec-row') === 20 && await count('.rec-btn') + await count('.rec-lock') === 20, '選手20人が並び、ボタンは「実施した」の1つだけ');
  const offBefore = await count('.rec-row:not(.on)');
  await page.locator('.rec-row:not(.on):not(.locked) .rec-btn').first().click();
  ok(await count('.rec-row.changed.on') === 1, 'ワンタップで「実施した」になる');
  await page.locator('.rec-row.changed .rec-btn').first().click();
  ok(await count('.rec-row.changed') === 0, 'もう一度押すと戻る');
  await page.click('[data-act="r-pos"][data-v="PR"]');
  ok(await count('.rec-row') === 2, 'ポジション（PR）で絞れる');
  await page.click('[data-act="rec-all"]'); await page.waitForTimeout(200);
  await page.click('[data-act="r-group"][data-v="ALL"]');
  ok(await count('.rec-row.changed') >= 1 && await count('.rec-row.on') <= 20, '表示中の人だけをまとめて「実施した」にできる');
  await page.click('[data-act="rec-confirm"]');
  ok((await text('.confirm')).includes('「実施した」にする'), '保存前に内容を確認できる');
  await page.click('[data-act="rec-save"]'); await page.waitForTimeout(900);
  ok(await count('.rec-row.changed') === 0, '保存できる');
  await page.reload(); await page.waitForSelector('.rec-row');
  ok(await count('.rec-row:not(.on)') < offBefore, '再読み込みしても保存した内容が残る');
  ok(await page.locator('[data-act="rec-day"][data-v="1"]').isDisabled(), '未来の日付には進めない');
  await page.click('[data-act="rec-day"][data-v="-1"]'); await page.waitForTimeout(300);
  ok((await text('.rec-pick span')).includes('11/12'), '過去の日付に移動できる');
  ok(await count('.textbtn[data-act="rec-del"]') === 0, 'マネージャーには管理者用の「取り消す」が出ない');
  await logout();

  console.log('■ FWリーダー');
  await login('前田 剛（FWリーダー）', 'test-lead-1');
  ok(await count('.nav a[href="#record"]') === 0, '「記録」のタブが出ない');
  await go('#menus'); await page.click('[data-act="menu-new"]');
  ok((await text('#tgt-hint')).includes('FW'), '対象人数の目安が出る');
  await page.click('.pospick input[value="LO"]', { force: true }); await page.waitForTimeout(100);
  ok((await text('#tgt-hint')).includes('LO') && (await text('#tgt-hint')).includes('2人'), 'ポジション（LO）を選ぶと対象はLOのメニュー参加者2人');
  await page.fill('input[name="title"]', 'LO テスト'); await page.fill('textarea[name="content"]', 'ジャンプ');
  await page.click('form[data-form="menu"] button[type="submit"]'); await page.waitForTimeout(900);
  ok((await text('.main')).includes('LO テスト'), 'ポジション指定のメニューを登録できる');
  await page.locator('.menu-card', { hasText: 'LO テスト' }).click(); await page.click('[data-act="menu-del"]'); await page.waitForTimeout(900);
  ok(!(await text('.main')).includes('LO テスト'), 'メニューを削除できる');
  await logout();

  console.log('■ 管理者（共通名簿）');
  await login('管理 太郎（管理者）', 'test-admin-1');
  await go('#members');
  ok((await text('.note.is-top')).includes('会計アプリと共通'), '名簿が会計アプリと共通であることを表示');
  await page.click('[data-act="bulk-open"]');
  const rowSel = '.bulk-r:has-text("原 拓海")';
  await page.selectOption(rowSel + ' select', 'WTB');
  await page.fill(rowSel + ' input[type="text"]', 'FB/CTB');
  await page.click(rowSel + ' .sw', { force: true });
  await page.click('form[data-form="bulk"] button[type="submit"]'); await page.waitForTimeout(1000);
  const hara = await page.locator('.mlist a', { hasText: '原 拓海' }).innerText();
  ok(hara.includes('WTB/CTB/FB') && hara.includes('メニュー参加'), 'まとめて編集でメイン・サブ・取り組み方を変えられる（サブはポジション順にそろう）' + (hara.includes('WTB/CTB/FB') ? '' : ' → ' + hara.replace(/\n/g, ' ') + ' / ' + (await page.locator('.toast').allInnerTexts()).join(',')));
  await page.click('[data-act="member-new"]');
  await page.fill('input[name="name"]', '新人 一年');
  await page.selectOption('select[name="grade"]', '1年');
  await page.click('.pospick input[name="position"][value="HO"]', { force: true });
  await page.click('form[data-form="member"] button[type="submit"]'); await page.waitForTimeout(1000);
  ok((await text('.main')).includes('新人 一年'), '部員を追加できる（会計アプリの名簿にも入る）');
  await page.locator('.mlist a', { hasText: '新人 一年' }).click(); await page.waitForTimeout(400);
  await page.click('[data-act="member-edit"]');
  ok(await count('input[name="name"]') === 0 && (await text('.ro')).includes('会計アプリ'), '既存の部員の名前は変えられない（会計アプリで変える案内）');
  await page.click('[data-act="member-del"]'); await page.waitForTimeout(1000);
  ok(await count('.gone-box') === 1, '在籍を外せる（在籍していない部員に移る）');
  await go('#record');
  ok(await count('.rec-row.locked') === 0, '管理者はだれの記録も変えられる（鍵なし）');
  ok(await count('[data-act="rec-del"]') >= 1, '管理者は保存済みの「実施した」を取り消せる');
  await go('#logs'); await page.waitForTimeout(800);
  ok((await text('.logs')).includes('部員をまとめて編集') && (await text('.logs')).includes('部員の在籍を外す'), '操作履歴に残る');
  for (const w of [320, 768, 1280]) {
    await page.setViewportSize({ width: w, height: 800 });
    for (const h of ['#home', '#rank', '#record', '#members', '#cal']) {
      await go(h);
      const x = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      if (x[0] > x[1] + 1) { ok(false, '横にはみ出し：幅' + w + ' ' + h); }
    }
  }
  ok(true, '幅320・768・1280px で主な画面が横にはみ出さない（はみ出しがあれば上に出る）');
  ok(errors.length === 0, '画面のエラーなし' + (errors.length ? ': ' + errors.join(' / ') : ''));
  console.log('\n合格 ' + pass + ' / 不合格 ' + fail);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// 自動テスト：node dev/test.js
// サーバー（gas/Code.gs）・共通名簿ライブラリ（shared/KurfcRoster.gs）・集計（logic.js）を模擬環境で確かめる
const { create, seedMaster } = require('./mock-gas');
const L = require('../logic.js');

let pass = 0, fail = 0;
const failed = [];
function section(t) { console.log('\n■ ' + t); }
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; failed.push(label); console.log('  ✗ ' + label); }
}
function eq(a, b, label) { const same = JSON.stringify(a) === JSON.stringify(b); ok(same, label + (same ? '' : '  → 実際: ' + JSON.stringify(a) + ' / 期待: ' + JSON.stringify(b))); }
function throws(fn, re, label) { try { fn(); ok(false, label + '（エラーにならなかった）'); } catch (e) { ok(re.test(e.message), label + (re.test(e.message) ? '' : '  → ' + e.message)); } }

const gas = create();
gas.setToday('2026-11-13'); // 金曜日
const api = gas.api;
const R = gas.KurfcRoster;
const col = (name) => gas.masterSheet().data[0].indexOf(name);
const masterRow = (name) => gas.masterSheet().data.find((r) => r[0] === name);

// 会計アプリの名簿（本番と同じ形：名前・学年・役割・在籍・表示順）
seedMaster(gas, [
  { name: '前田 剛', grade: '4年' }, { name: '石川 大地', grade: '4年' }, { name: '森 健太', grade: '3年' },
  { name: '橋本 侑青', grade: '4年', role: '財務' }, { name: '小川 陽向', grade: '3年' }, { name: '長谷川 湊', grade: '2年' },
  { name: '村上 樹', grade: '2年' }, { name: '近藤 蒼', grade: '1年' }, { name: 'マネ 花子', grade: '2年', role: 'マネージャー' },
  { name: 'マネ さくら', grade: '1年', role: 'マネージャー' }, { name: '卒業 先輩', grade: '4年', active: false }
]);

// v1 の筋トレ専用「部員」シート（本番で管理者だけ登録済みだった状態）
const oldPin = 'old-admin-pin';
(function () {
  const sh = gas.ss.insertSheet('部員');
  const salt = 'abcdef0123456789abcdef0123456789';
  sh.data = [['ID', '名前', 'グループ', '取り組み方', '権限', '選手', '在籍', '開始日', '退部日', '並び順', '暗証番号ハッシュ', 'ソルト', '要変更', '失敗回数', 'ロック解除', '作成日時', '更新日時'],
    ['m001', '橋本侑青', 'FW', '自主トレ', '管理者', 'はい', 'はい', '', '', '0', gas.run('pinHash_', salt, oldPin), salt, 'いいえ', '0', '', '2026-11-13 17:02:54', '']];
  const h = gas.ss.insertSheet('設定変更履歴');
  h.data = [['部員ID', '適用開始日', 'グループ', '取り組み方', '変更者ID', '変更日時'], ['m001', '2000-01-01', 'FW', '自主トレ', '', '2026-11-13 17:02:54']];
})();

// ---------------- 共通名簿と移行 ----------------
section('共通名簿ライブラリ');
const list0 = R.list();
ok(list0.length === 11 && list0.every((m) => /^M\d{4}$/.test(m.id)), '会計アプリの名簿の全員にIDが付く（在籍なしの人も）');
ok(col('部員ID') >= 5 && col('ポジション') >= 5 && col('サブポジション') >= 5 && col('グループ') >= 5, '名簿のシートに 部員ID・グループ・ポジション・サブポジション の列が右端に足される');
eq(gas.masterSheet().data[0].slice(0, 5), ['名前', '学年', '役割', '在籍', '表示順'], '会計アプリの列（名前・学年・役割・在籍・表示順）はそのまま');
ok(list0.find((m) => m.name === 'マネ 花子').player === false && list0.find((m) => m.name === '前田 剛').player === true, '役割がマネージャーの人は選手ではない');
ok(list0.find((m) => m.name === '橋本 侑青').finance === true, '財務の人がわかる');
const v0 = R.version();
ok(R.list().length === 11 && R.version() === v0, '2回目はIDを付け直さない（版も変わらない）');
eq(R.positions().map((p) => p.code), ['PR', 'HO', 'LO', 'FL', 'No.8', 'SH', 'SO', 'CTB', 'WTB', 'FB'], 'ポジションは10区分');

section('v1 からの移行（初回のリクエストで自動）');
let st = api({ op: 'state' });
ok(st.ok, '状態を読める');
ok(!gas.sheet('部員') && gas.sheet('旧_部員（v1）'), '旧「部員」シートは「旧_部員（v1）」に名前を変えて残す');
const hashi = st.members.find((m) => m.name === '橋本 侑青');
ok(hashi && /^M\d{4}$/.test(hashi.id) && hashi.perm === 'admin', '名前の空白の違い（橋本侑青／橋本 侑青）があっても同じ人として移る（管理者のまま）');
eq(st.staff.map((s) => s.name), ['橋本 侑青'], 'ログインできる人の一覧に出る');
let r = api({ op: 'login', memberId: hashi.id, pin: oldPin });
ok(r.ok && r.me.perm === 'admin' && r.me.mustChange === false, '移行前の暗証番号でそのままログインできる');
const A = r.token;
ok(gas.sheet('設定変更履歴').data.slice(1).every((row) => row[0] !== 'm001'), '履歴の部員IDも新しいIDに付け替わる');
eq(st.members.length, 11, '名簿の全員が部員として見える');
ok(!st.members.find((m) => m.name === '卒業 先輩').active, '在籍なしの人は在籍なしとして見える');
eq(st.positions.length, 10, 'ポジションの一覧を返す');

const id = {};
st.members.forEach((m) => { id[m.name] = m.id; });

// ---------------- 部員の設定 ----------------
section('ポジションと取り組み方');
r = api({ op: 'bulkMembers', token: A, rows: [
  { id: id['前田 剛'], position: 'PR', subs: [], mode: 'leader' },
  { id: id['石川 大地'], position: 'LO', subs: ['FL'], mode: 'leader' },
  { id: id['森 健太'], position: 'FL', subs: ['No.8'], mode: 'self' },
  { id: id['橋本 侑青'], position: 'No.8', subs: ['FL'], mode: 'leader' },
  { id: id['小川 陽向'], position: 'SH', subs: [], mode: 'leader' },
  { id: id['長谷川 湊'], position: 'CTB', subs: ['WTB', 'FB'], mode: 'leader' },
  { id: id['村上 樹'], position: 'WTB', subs: [], mode: 'self' },
  { id: id['近藤 蒼'], position: 'FB', subs: ['SO'], mode: 'leader' }
] });
ok(r.ok && r.changed === 8, '管理者がまとめてポジション（メイン＋サブ）と取り組み方を設定できる');
eq(masterRow('石川 大地').slice(col('グループ'), col('グループ') + 1).concat([masterRow('石川 大地')[col('ポジション')], masterRow('石川 大地')[col('サブポジション')]]), ['FW', 'LO', 'FL'], '会計アプリの名簿のシートに グループ・ポジション・サブ が書かれる');
ok(R.version() !== v0, '名簿の版が変わる（会計アプリが古い名簿を出さないように）');
st = api({ op: 'state' });
const M = (name) => st.members.find((m) => m.name === name);
eq([M('長谷川 湊').group, M('長谷川 湊').position, M('長谷川 湊').subs], ['BK', 'CTB', ['WTB', 'FB']], 'グループはメインのポジションから決まる');
r = api({ op: 'saveMember', token: A, member: { id: id['近藤 蒼'], position: 'FB', subs: ['FB', 'SO', 'xx'] } });
ok(r.error === 'bad_position', 'ない名前のポジションは拒否');
r = api({ op: 'saveMember', token: A, member: { id: id['近藤 蒼'], position: 'FB', subs: ['FB', 'SO'] } });
eq(r.member.subs, ['SO'], 'メインと同じサブは入れない');

section('名簿の決まり（会計アプリを壊さない）');
throws(() => R.update(id['前田 剛'], { name: '前田 剛志' }), /会計アプリ/, '名前の変更はライブラリから拒否（会計アプリで行う）');
r = api({ op: 'saveMember', token: A, member: { id: id['前田 剛'], clubRole: '財務' } });
ok(!r.ok && /財務/.test(r.message), '「財務」を付けるのは会計アプリで（筋トレからは拒否）');
r = api({ op: 'saveMember', token: A, member: { id: id['橋本 侑青'], clubRole: '部員' } });
ok(!r.ok && /財務/.test(r.message), '「財務」を外すのも会計アプリで');
r = api({ op: 'setMemberActive', token: A, id: id['橋本 侑青'], active: false });
ok(!r.ok, '自分（財務）の在籍は外せない');
r = api({ op: 'saveMember', token: A, member: { id: id['村上 樹'], grade: '3年' } });
ok(r.ok && masterRow('村上 樹')[1] === '3年', '学年の変更は会計アプリの名簿に書かれる');
r = api({ op: 'saveMember', token: A, member: { name: '新人 一年', grade: '1年', position: 'HO', mode: 'leader' } });
ok(r.ok && r.member.position === 'HO' && masterRow('新人 一年') && masterRow('新人 一年')[3] === true, '筋トレで追加した部員は会計アプリの名簿にも入る（在籍はチェックボックス）');
ok(/^M\d{4}$/.test(masterRow('新人 一年')[col('部員ID')]), '追加した人にもIDが付く');
id['新人 一年'] = r.member.id;
r = api({ op: 'saveMember', token: A, member: { name: '新人一年', grade: '1年' } });
ok(r.error === 'duplicate', '空白の違いだけの同じ名前は追加できない');
r = api({ op: 'saveMember', token: A, member: { name: '卒業先輩' } });
ok(r.error === 'duplicate' && /在籍なし/.test(r.message), '在籍なしの人と同じ名前は「戻す」を案内');
r = api({ op: 'saveMember', token: A, member: { name: '=HYPERLINK("x")' } });
ok(!r.ok, '数式に見える名前は名簿に入れない');

section('会計アプリで名簿を変えたとき（進級・追加・改名・卒業）');
gas.accountingEdit((sh) => {
  sh.data.forEach((row, i) => { if (i > 0 && row[1] === '1年') row[1] = '2年'; }); // 進級（1年→2年）
  sh.data.push(['入部 太郎', '1年', '部員', true, 999]);                           // 新入部員（IDの列は空）
  const k = sh.data.findIndex((row) => row[0] === '小川 陽向'); sh.data[k][0] = '小川 陽向太';  // 改名（IDの列はそのまま）
  const g = sh.data.findIndex((row) => row[0] === '森 健太'); sh.data[g][3] = false;          // 卒業（在籍を外す）
});
st = api({ op: 'state' });
ok(M('近藤 蒼').grade === '2年', '進級（学年の変更）がすぐ筋トレに出る');
ok(M('入部 太郎') && /^M\d{4}$/.test(M('入部 太郎').id) && /^M\d{4}$/.test(masterRow('入部 太郎')[col('部員ID')]), '会計アプリで足した人にIDが付き、筋トレに出る');
ok(M('小川 陽向太') && M('小川 陽向太').id === id['小川 陽向'] && M('小川 陽向太').position === 'SH', '会計アプリで改名しても同じ人（ID・ポジションはそのまま）');
ok(M('森 健太').active === false && M('森 健太').left === '2026-11-13', '会計アプリで在籍を外すと、筋トレではその日から退部扱い');
id['入部 太郎'] = M('入部 太郎').id;

// ---------------- メニュー ----------------
section('FWリーダーのメニュー（ポジション指定）');
r = api({ op: 'saveMember', token: A, member: { id: id['前田 剛'], perm: 'leader' } });
function staffLogin(memberId, newPin) {
  const t = api({ op: 'resetPin', token: A, id: memberId });
  const l = api({ op: 'login', memberId, pin: t.tempPin });
  api({ op: 'changePin', token: l.token, oldPin: t.tempPin, newPin });
  return l.token;
}
const LD = staffLogin(id['前田 剛'], 'leader-pin-1');
api({ op: 'saveMember', token: A, member: { id: id['マネ 花子'], perm: 'manager' } });
api({ op: 'saveMember', token: A, member: { id: id['マネ さくら'], perm: 'manager' } });
const M1 = staffLogin(id['マネ 花子'], 'manager-1-pin');
const M2 = staffLogin(id['マネ さくら'], 'manager-2-pin');
ok(api({ op: 'state', token: M1 }).me.perm === 'manager' && api({ op: 'state', token: LD }).me.perm === 'leader', 'マネージャー・FWリーダーがログインできる');
const menu = (o) => Object.assign({ title: 'メニュー', content: 'スクワット', detail: '', note: '' }, o);
r = api({ op: 'saveMenu', token: LD, menu: menu({ date: '2026-11-10', group: 'FW', title: 'FW火曜' }) });
eq(r.menu.targets.slice().sort(), [id['前田 剛'], id['石川 大地'], id['橋本 侑青'], id['新人 一年']].sort(), 'FW向けメニューの対象はFWのメニュー参加者（自主トレの森は入らない）。最初の設定は過去の日付にも使う');
const wTue = r.menu;
r = api({ op: 'saveMenu', token: LD, menu: menu({ date: '2026-11-12', positions: ['FL'], title: 'FL強化' }) });
eq(r.menu.targets.slice().sort(), [id['石川 大地'], id['橋本 侑青']].sort(), 'ポジション指定（FL）はサブにFLがある人も対象（自主トレの人は入らない）');
eq(r.menu.group, 'FW', 'FWのポジションだけを選ぶと対象グループはFW');
r = api({ op: 'saveMenu', token: LD, menu: menu({ date: '2026-11-13', positions: ['SH', 'SO', 'FB'], title: 'BK今日' }) });
eq(r.menu.targets.slice().sort(), [id['小川 陽向'], id['長谷川 湊'], id['近藤 蒼']].sort(), 'BKのポジション指定（SH・SO・FB）。サブにFBがある長谷川も対象');
r = api({ op: 'saveMenu', token: LD, menu: menu({ date: '2026-11-13', positions: ['PR', 'WTB'], title: '混合' }) });
eq(r.menu.group, 'ALL', 'FWとBKのポジションを混ぜると対象グループは全体');
const wMix = r.menu;
r = api({ op: 'saveMenu', token: LD, menu: menu({ date: '2026-11-16', group: 'ALL', title: '来週全体' }) });
const wNext = r.menu;
ok(!wNext.targets.includes(id['森 健太']), '退部した人は来週のメニューの対象に入らない');
ok(api({ op: 'saveMenu', token: M1, menu: menu({ date: '2026-11-14', group: 'FW' }) }).error === 'forbidden', 'マネージャーはメニューを作れない');
ok(api({ op: 'saveMenu', menu: menu({ date: '2026-11-14', group: 'FW' }) }).error === 'auth', '一般部員はメニューを作れない');
ok(api({ op: 'saveMenu', token: LD, menu: menu({ date: '2026-11-14', positions: ['PRR'] }) }).error === 'bad_position', '正しくないポジションは拒否');

// ---------------- 実施記録 ----------------
section('実施記録（「実施した」を押すだけ）');
r = api({ op: 'saveRecords', token: M1, date: '2026-11-10', items: [{ memberId: id['前田 剛'], done: true }, { memberId: id['橋本 侑青'], done: true }] });
ok(r.ok && r.saved === 2, '「実施した」の人だけを送って保存できる');
r = api({ op: 'saveRecords', token: M1, date: '2026-11-11', items: [{ memberId: id['村上 樹'], done: true }] });
ok(r.ok && r.saved === 1, 'メニューが無い日でも自主トレの実施を記録できる');
r = api({ op: 'saveRecords', token: M1, date: '2026-11-13', items: [{ memberId: id['小川 陽向'], done: true }, { memberId: id['前田 剛'], done: true }] });
ok(r.ok && r.saved === 2, '今日の分を記録できる');
r = api({ op: 'saveRecords', token: M1, date: '2026-11-13', items: [{ memberId: id['前田 剛'], done: false }] });
ok(r.ok && r.removed === 1, '押し直すと「記録なし」に戻せる（行が消える）');
r = api({ op: 'saveRecords', token: M1, date: '2026-11-13', items: [{ memberId: id['前田 剛'], done: true }] });
r = api({ op: 'saveRecords', token: M2, date: '2026-11-13', items: [{ memberId: id['前田 剛'], done: false }] });
ok(r.rejected[0] && r.rejected[0].reason === 'not_owner', 'ほかのマネージャーが入れた記録は取り消せない');
r = api({ op: 'saveRecords', token: A, date: '2026-11-13', items: [{ memberId: id['前田 剛'], done: false }, { memberId: id['前田 剛'], done: true }] });
ok(r.ok && r.removed === 1, '管理者はだれの記録でも取り消せる（同じ人が2回あれば最初だけ）');
api({ op: 'saveRecords', token: M1, date: '2026-11-13', items: [{ memberId: id['前田 剛'], done: true }] });
const recKeys = gas.sheet('実施記録').data.slice(1).map((x) => x[0] + '|' + x[1]);
ok(new Set(recKeys).size === recKeys.length, '同じ部員・同じ日付の記録は1件だけ');
ok(api({ op: 'saveRecords', token: M1, date: '2026-11-14', items: [{ memberId: id['前田 剛'], done: true }] }).error === 'future_date', '未来の日付は記録できない');
ok(api({ op: 'saveRecords', token: M1, date: '2026-11-13', items: [{ memberId: id['マネ 花子'], done: true }] }).rejected[0].reason === 'not_in_roster', '選手ではない人（マネージャー）は記録の対象にならない');
ok(api({ op: 'saveRecords', token: M1, date: '2026-11-13', items: [{ memberId: id['森 健太'], done: true }] }).rejected[0].reason === 'not_in_roster', '退部した日からは記録できない');
ok(api({ op: 'saveRecords', token: LD, date: '2026-11-13', items: [{ memberId: id['前田 剛'], done: true }] }).error === 'forbidden', 'FWリーダーは実施記録を変えられない');
ok(api({ op: 'saveRecords', date: '2026-11-13', items: [{ memberId: id['前田 剛'], done: true }] }).error === 'auth', '一般部員（ログインなし）は実施記録を変えられない');
ok(api({ op: 'saveRecords', token: M1, date: '2026-11-13', items: [{ memberId: id['前田 剛'], done: 'maybe' }] }).rejected[0].reason === 'invalid', '実施した／していない 以外は拒否');

section('記録が無い対象日は、翌日から「実施していない」');
st = api({ op: 'state' });
let idx = L.buildIndex(st);
eq(L.cellState(idx, M('前田 剛'), '2026-11-10', st.today), 'done', '実施した → ○');
eq(L.cellState(idx, M('石川 大地'), '2026-11-10', st.today), 'not', '過ぎた対象日で記録なし → ×（実施していない）');
eq(L.cellState(idx, M('小川 陽向太'), '2026-11-13', st.today), 'done', '今日実施した → ○');
eq(L.cellState(idx, M('近藤 蒼'), '2026-11-13', st.today), 'today', '今日の対象で記録なし → まだ×にしない（記録待ち）');
eq(L.cellState(idx, M('村上 樹'), '2026-11-10', st.today), 'none', '自主トレの人はメニューの無い日に×が付かない');
eq(L.cellState(idx, M('前田 剛'), '2026-11-11', st.today), 'none', 'メニューの無い日は×にしない');
eq(L.cellState(idx, M('前田 剛'), '2026-11-16', st.today), 'planned', 'これからの対象日 → 予定');
let wk = L.weekRange(st.today);
let ps = L.periodStats(st, idx, wk.from, wk.to, st.today);
const row = (name) => ps.rows.find((x) => x.name === name);
eq([row('石川 大地').done, row('石川 大地').targetDays, row('石川 大地').rate], [0, 2, 0], '石川：対象2日（火・木）とも記録なし → 実施率0%');
eq([row('橋本 侑青').done, row('橋本 侑青').targetDays, row('橋本 侑青').rate], [1, 2, 0.5], '橋本：火は実施・木は記録なし → 50%');
eq([row('近藤 蒼').targetDays, row('近藤 蒼').todayOpen, row('近藤 蒼').rate], [0, 1, null], '近藤：今日の対象はまだ数えない（実施率は－）');
eq([row('小川 陽向太').targetDays, row('小川 陽向太').rate], [1, 1], '小川：今日実施した対象日は数える（100%）');
eq([row('村上 樹').done, row('村上 樹').rate], [1, null], '自主トレの村上：実施1回・実施率は出さない');
gas.shiftDays(1); // 11/14
st = api({ op: 'state' }); idx = L.buildIndex(st);
eq(L.cellState(idx, M('近藤 蒼'), '2026-11-13', st.today), 'not', '翌日になると、記録の無い昨日の対象日は×');
ps = L.periodStats(st, idx, wk.from, wk.to, st.today);
eq([ps.rows.find((x) => x.name === '近藤 蒼').targetDays, ps.rows.find((x) => x.name === '近藤 蒼').rate], [1, 0], '近藤：昨日の対象日が0%で数えられる');
gas.shiftDays(-1);

section('指示書の計算例（対象10回・実施6回）');
(function () {
  const members = [{ id: 'x', name: 'X', player: true, active: true, group: 'FW', mode: 'leader', start: '', left: '' }];
  const menus = [], records = [];
  for (let i = 1; i <= 10; i++) {
    const d = L.ymd(2026, 10, i);
    menus.push({ id: 'w' + i, date: d, targets: ['x'] });
    if (i <= 6) records.push(['x', d, 1, 1, 'a']);
  }
  const s = { members, menus, records };
  const p = L.periodStats(s, L.buildIndex(s), '2026-10-01', '2026-10-31', '2026-10-31').rows[0];
  eq([p.done, p.notDone, p.targetDays, L.pct(p.rate)], [6, 4, 10, '60%'], '実施6・実施していない4（記録なし）→ 60%');
  const s2 = { members, menus: [{ id: 'a', date: '2026-10-01', targets: ['x'] }, { id: 'b', date: '2026-10-01', targets: ['x'] }], records: [] };
  eq(L.periodStats(s2, L.buildIndex(s2), '2026-10-01', '2026-10-31', '2026-10-31').rows[0].targetDays, 1, '同じ日に複数メニューがあっても対象は1回');
})();

section('ランキング・ポジション別');
st = api({ op: 'state' }); idx = L.buildIndex(st);
ps = L.periodStats(st, idx, wk.from, wk.to, st.today);
let rk = L.rank(ps.rows, 'count');
ok(rk[0].done >= rk[1].done && rk.filter((x) => x.done === 0).every((x) => x.rank === null), '実施回数順（0回は順位なし）');
rk = L.rank(ps.rows, 'rate');
ok(rk.filter((x) => x.mode === 'self').every((x) => x.rate === null && x.rank === null), '自主トレの人に実施率・実施率順位を付けない');
eq(L.periodStats(st, idx, wk.from, wk.to, st.today, { position: 'FL' }).rows.map((x) => x.name).sort(), ['森 健太', '橋本 侑青', '石川 大地'].sort(), 'ポジション（FL）で絞ると、サブがFLの人も入る（今週退部した森も今週分は入る）');
eq(L.periodStats(st, idx, wk.from, wk.to, st.today, { group: 'BK' }).rows.map((x) => x.name).sort(), ['入部 太郎', '小川 陽向太', '村上 樹', '近藤 蒼', '長谷川 湊'].sort().filter((n) => M(n).group === 'BK'), 'BKで絞れる');
const pos = L.positionStats(st, idx, wk.from, wk.to, st.today, st.positions);
ok(pos.PR.members === 1 && pos.PR.done === 2 && pos.SH.done === 1 && pos.FL.members === 1 && pos.LO.members === 1, 'ポジション別の集計（メインで数える）');

section('設定を変えても過去は変わらない');
const before = JSON.stringify(L.periodStats(st, idx, wk.from, wk.to, '2026-11-13').rows.map((x) => [x.name, x.done, x.targetDays, x.rate]));
r = api({ op: 'saveMember', token: A, member: { id: id['石川 大地'], position: 'WTB', subs: [], mode: 'self' } });
ok(r.ok && r.member.group === 'BK', 'ポジションをFW→BKに変えるとグループも変わる');
gas.accountingEdit((sh) => { const k = sh.data.findIndex((x) => x[0] === '橋本 侑青'); sh.data[k][col('ポジション')] = 'SO'; sh.data[k][col('グループ')] = 'BK'; });
st = api({ op: 'state' }); idx = L.buildIndex(st);
const after = JSON.stringify(L.periodStats(st, idx, wk.from, wk.to, '2026-11-13').rows.map((x) => [x.name, x.done, x.targetDays, x.rate]));
eq(after, before, '筋トレ側・名簿のシート側のどちらでポジションを変えても、昨日までの集計は変わらない');
eq(st.menus.find((w) => w.id === wTue.id).targets.length, 4, '過去のメニューの対象者は登録時点のまま');
ok(!st.menus.find((w) => w.id === wNext.id).targets.includes(id['石川 大地']), '来週のメニューの対象は新しい設定で作り直される（自主トレになった石川は外れる）');
const hist = gas.sheet('設定変更履歴').data;
ok(hist.some((h) => h[0] === id['橋本 侑青'] && h[1] === '2026-11-13' && h[hist[0].indexOf('ポジション')] === 'SO'), '名簿のシートで直接変えたポジションも履歴に今日から残る');

section('部員の一覧の貼り付け');
r = api({ op: 'importMembers', token: A, rows: [
  { name: '長谷川湊', position: 'CTB', subs: ['WTB'], mode: 'self' },
  { name: '新入 二郎', position: 'HO', mode: 'leader', grade: '1年' },
  { name: '村上 樹' }
] });
ok(r.ok && r.updated === 1 && r.added === 1, '名簿にいる人は更新（空白の違いは同じ人）・いない人は追加');
st = api({ op: 'state' });
eq([M('長谷川 湊').subs, M('長谷川 湊').mode], [['WTB'], 'self'], '貼り付けで サブ・取り組み方 が変わる');
eq(M('村上 樹').position, 'WTB', '何も書いていない項目は消さない');
ok(masterRow('新入 二郎') && masterRow('新入 二郎')[col('ポジション')] === 'HO', '貼り付けで追加した人は会計アプリの名簿にも入る');

// ---------------- 権限 ----------------
section('権限（サーバー側で拒否されること）');
ok(api({ op: 'deleteRecord', token: M1, memberId: id['前田 剛'], date: '2026-11-13' }).error === 'forbidden', 'マネージャーは記録の削除（管理者用）を使えない');
ok(api({ op: 'saveMember', token: M1, member: { name: '新人' } }).error === 'forbidden', 'マネージャーは部員を追加できない');
ok(api({ op: 'bulkMembers', token: LD, rows: [{ id: id['前田 剛'], position: 'HO', mode: 'self' }] }).error === 'forbidden', 'FWリーダーは部員の設定を変えられない');
ok(api({ op: 'saveMember', member: { id: id['前田 剛'], mode: 'self' } }).error === 'auth', '一般部員（ログインなし）は取り組み方を変えられない');
ok(api({ op: 'importMembers', token: M1, rows: [{ name: 'x' }] }).error === 'forbidden', 'マネージャーは一覧を貼り付けられない');
ok(api({ op: 'resetPin', token: M1, id: id['マネ さくら'] }).error === 'forbidden', 'マネージャーは暗証番号を発行できない');
ok(api({ op: 'logs', token: M1 }).error === 'forbidden' && api({ op: 'logs' }).error === 'auth', '操作履歴は管理者だけ');
ok(api({ op: 'saveMember', token: A, member: { id: id['橋本 侑青'], perm: 'member' } }).error === 'last_admin', '最後の管理者は一般部員にできない');
ok(api({ op: 'resetPin', token: A, id: id['村上 樹'] }).error === 'not_staff', '一般部員には暗証番号を発行しない');
ok(api({ op: 'state', token: 'bogus' }).me === null, 'でたらめなトークンはログイン扱いにならない');
st = api({ op: 'state' });
ok(st.members[0].pinSet === undefined, 'ログインなしでは暗証番号の情報を返さない');

section('ログインの保護');
for (let i = 0; i < 5; i++) api({ op: 'login', memberId: id['マネ さくら'], pin: 'x' + i });
ok(api({ op: 'login', memberId: id['マネ さくら'], pin: 'manager-2-pin' }).error === 'locked', '5回続けてまちがえると15分ロック');
gas.clock.offset += 16 * 60000;
ok(api({ op: 'login', memberId: id['マネ さくら'], pin: 'manager-2-pin' }).ok, '15分たつとログインできる');
api({ op: 'saveMember', token: A, member: { id: id['マネ 花子'], perm: 'member' } });
ok(api({ op: 'saveRecords', token: M1, date: '2026-11-13', items: [{ memberId: id['前田 剛'], done: true }] }).error === 'auth', '権限を外された人のログインはその場で無効');
gas.accountingEdit((sh) => { const k = sh.data.findIndex((x) => x[0] === 'マネ さくら'); sh.data[k][3] = false; });
ok(api({ op: 'state', token: M2 }).me === null, '会計アプリで在籍を外された人はログインできなくなる');
const dump = JSON.stringify(gas.dump());
ok(!dump.includes('manager-1-pin') && !dump.includes('leader-pin-1') && !dump.includes(A), '暗証番号とトークンはそのままの形では保存しない');

section('週の目標回数（週3回以上がマスト）');
(function () {
  const m = { id: 'g', name: 'g', player: true, active: true, start: '', left: '' };
  const recs = (ds) => ds.map((d) => ['g', d, 1, 0, '']);
  // 11/2(月)〜8(日)に3回、11/9〜15に2回（今日は11/13金）、10/26の週に1回
  const s = { members: [m], menus: [], records: recs(['2026-10-27', '2026-11-02', '2026-11-04', '2026-11-08', '2026-11-10', '2026-11-12']) };
  const ix = L.buildIndex(s);
  eq(L.weekCount(ix, m, '2026-11-02'), 3, '週の回数（月曜〜日曜）');
  const gw = L.goalWeeks(ix, m, '2026-11-01', '2026-11-30', '2026-11-13', 3);
  eq(gw.map((w) => [w.from, w.count, w.ok, w.open]), [['2026-11-02', 3, true, false], ['2026-11-09', 2, false, true]], '月の週は「月曜がその月にある週」だけ、今週は途中');
  const sm = L.goalSummary(ix, m, '2026-11-01', '2026-11-30', '2026-11-13', 3);
  ok(sm.closed === 1 && sm.hit === 1 && sm.every && sm.now.left === 1, '終わった週1つで達成、今週はあと1回');
  eq(L.streakWeeks(ix, m, '2026-11-13', '2026-01-01', 3), 1, '連続達成：今週が未達なら先週から数える');
  eq(L.streakWeeks(ix, m, '2026-11-13', '2026-01-01', 2), 2, '目標2回なら今週も入れて2週連続');
  const ps = L.periodStats(s, ix, '2026-10-26', '2026-11-01', '2026-11-13', { goal: 3 });
  ok(ps.team.goalClosed === 1 && ps.team.goalHit === 0 && ps.rows[0].goal.weeks[0].left === 2, '過去の週で足りなければ未達');
  eq(L.goalOf(undefined), 3, '目標の設定が無ければ3回');
})();
st = api({ op: 'state' });
eq(st.weekGoal, 3, 'サーバーの初期値は週3回');
ok(api({ op: 'saveSettings', token: A, weekGoal: 4 }).weekGoal === 4 && api({ op: 'state' }).weekGoal === 4, '管理者が週の目標回数を変えられる');
ok(api({ op: 'saveSettings', token: A, weekGoal: 9 }).error === 'bad_goal', '1〜7回以外は保存しない');
ok(api({ op: 'saveSettings', token: LD, weekGoal: 2 }).ok !== true, '管理者以外は変えられない');
api({ op: 'saveSettings', token: A, weekGoal: 3 });

section('免除・部全体のオフ期間');
(function () {
  const m = { id: 'e', name: 'e', player: true, active: true, start: '', left: '' };
  const recs = (ds) => ds.map((d) => ['e', d, 1, 0, '']);
  // 11/2〜8 に2回だけ。11/2〜4 の3日が免除 → 必要 ceil(3*4/7)=2 → 達成
  let st = { members: [m], menus: [{ id: 'w1', date: '2026-11-03', targets: ['e'] }], records: recs(['2026-11-06', '2026-11-07']),
    exempts: [{ id: 'x1', memberId: 'e', from: '2026-11-02', to: '2026-11-04', reason: '怪我' }] };
  let ix = L.buildIndex(st);
  eq(L.weekNeed(ix, m, '2026-11-02', 3), { ex: 3, need: 2 }, '免除3日の週は必要回数が2回に減る');
  ok(L.goalWeeks(ix, m, '2026-11-02', '2026-11-08', '2026-11-13', 3)[0].ok === true, '減った回数を満たせば達成');
  eq(L.cellState(ix, m, '2026-11-03', '2026-11-13'), 'ex', '免除の日のマスは「免除」（メニューの対象日でも×にならない）');
  ok(L.memberStats(ix, m, '2026-11-02', '2026-11-08', '2026-11-13').targetDays === 0, '免除の日のメニューは対象日に数えない（実施率に入らない）');
  // 部全体のオフで7日とも → その週は対象外
  st.exempts.push({ id: 'x2', memberId: 'ALL', from: '2026-11-09', to: '2026-11-15', reason: '試験期間' });
  ix = L.buildIndex(st);
  const w2 = L.goalWeeks(ix, m, '2026-11-09', '2026-11-15', '2026-11-13', 3)[0];
  ok(w2.exempt && w2.ok === null && w2.need === 0, '7日とも免除（オフ）の週は対象外');
  const sm = L.goalSummary(ix, m, '2026-11-01', '2026-11-30', '2026-11-13', 3);
  ok(sm.closed === 1 && sm.hit === 1 && sm.now === null && sm.nowExempt, '対象外の週は達成にも未達にも数えない');
  eq(L.streakWeeks(ix, m, '2026-11-13', '2026-01-01', 3), 1, '連続達成は免除の週をとばして続く');
})();
section('自己ベスト・称号・ピンチ・おめでとう（集計）');
(function () {
  const m = { id: 'p', name: '山田 太郎', player: true, active: true, start: '', left: '', sort: 1 };
  // 10/5〜11/1 の4週は毎週3回（月水金）、11/2の週は2回、11/9の週（今週）は1回
  const dates = [];
  ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'].forEach((ws) => { [0, 2, 4].forEach((i) => dates.push(L.addDays(ws, i))); });
  dates.push('2026-11-02', '2026-11-04', '2026-11-10');
  const st = { members: [m], menus: [], records: dates.map((d) => ['p', d, 1, 0, '']), exempts: [], range: { from: '2026-08-01' } };
  const ix = L.buildIndex(st);
  const p = L.personal(ix, m, '2026-11-13', 3);
  ok(p.total === 15 && p.streakMax === 4 && p.streakNow === 0, '通算15回・最長4週連続・今の連続は0（先週が未達）');
  eq(p.bestMonth, { count: 12, month: '2026-10' }, 'いちばん多い月');
  ok(p.earned.first === '2026-10-05' && p.earned.goal1 === '2026-10-09' && p.earned.s4 === '2026-10-30' && p.earned.m10 === '2026-10-26', '称号を取った日（初記録・初達成・4週連続・月10回）');
  ok(!p.earned.s8 && !p.earned.t50, 'まだの称号は無い');
  ok(p.perfectMonths.indexOf('2026-10') >= 0 && p.earned.pm, '10月は週の目標を全部達成（皆勤の月）');
  ok(L.badgeList(3).length === 16 && L.badgeList(3)[1].name === '週3回クリア', '称号の一覧');
  // ピンチ：先週まで2週連続、今週まだ
  const m2 = { id: 'q', name: '鈴木 次郎', player: true, active: true, sort: 2 };
  const st2 = { members: [m, m2], menus: [], records: st.records.concat(['2026-10-26', '2026-10-28', '2026-10-30', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-11'].map((d) => ['q', d, 1, 0, ''])) };
  const ix2 = L.buildIndex(st2);
  const pin = L.pinchList(st2, ix2, '2026-11-13', 3, '2026-08-01');
  ok(pin.length === 1 && pin[0].id === 'q' && pin[0].streak === 2 && pin[0].left === 2 && pin[0].daysLeft === 3, '先週まで2週連続で、今週まだの人が出る（あと2回・残り3日）');
  // おめでとう
  const life = { p: [15, '2026-10-05'], q: [50, '2026-04-01'] };
  const st3 = Object.assign({}, st2, { range: { from: '2026-08-01' } });
  const ev = L.feedEvents(st3, ix2, '2026-11-13', 3, life, 14);
  ok(ev.some((e) => e.id === 'q' && e.key === 'g:2026-11-02' && e.streak === 2), '先週の週の目標の達成が出る（連続の週数つき）');
  ok(ev.some((e) => e.id === 'q' && e.key === 'c:50' && e.date === '2026-11-11'), '通算50回になった日が出る');
  ok(!ev.some((e) => e.id === 'p' && e.kind === 'goal'), '達成していない週は出ない');
})();
api({ op: 'saveMember', token: A, member: { id: id['村上 樹'], perm: 'manager' } });
const MX = staffLogin(id['村上 樹'], 'manager-x-pin');
st = api({ op: 'state' });
eq(st.exempts, [], '最初は免除なし');
const someone = st.members.find((m) => m.player && m.active);
r = api({ op: 'saveExempt', token: MX, memberId: someone.id, from: '2026-11-10', to: '2026-11-20', reason: '怪我', note: '右足首' });
ok(r.ok && r.exempt.reason === '怪我', 'マネージャーが部員の免除を登録できる');
ok(api({ op: 'saveExempt', token: MX, memberId: 'ALL', from: '2026-11-10', to: '2026-11-12', reason: '試験期間' }).error === 'forbidden', '部全体のオフは管理者だけ');
ok(api({ op: 'saveExempt', token: LD, memberId: someone.id, from: '2026-11-10', to: '2026-11-12', reason: '怪我' }).ok !== true, 'FWリーダーは免除を登録できない');
ok(api({ op: 'saveExempt', token: A, memberId: someone.id, from: '2026-11-20', to: '2026-11-10', reason: '怪我' }).error === 'bad_range', '終了日が開始日より前なら登録しない');
const off = api({ op: 'saveExempt', token: A, memberId: 'ALL', from: '2026-11-10', to: '2026-11-12', reason: '試験期間', note: '前期試験' });
ok(off.ok, '管理者は部全体のオフ期間を登録できる');
const pub = api({ op: 'state' }).exempts;
ok(pub.length === 2 && pub.find((e) => e.memberId === someone.id).reason === '' && pub.find((e) => e.memberId === 'ALL').reason === '試験期間', 'ログインなしの画面では部員ごとの理由は見えない（オフの理由は見える）');
ok(api({ op: 'state', token: MX }).exempts.find((e) => e.memberId === someone.id).note === '右足首', 'スタッフには理由とメモが見える');
ok(api({ op: 'deleteExempt', token: MX, id: off.exempt.id }).error === 'forbidden', 'マネージャーは部全体のオフを取り消せない');
ok(api({ op: 'deleteExempt', token: MX, id: r.exempt.id }).ok && api({ op: 'state' }).exempts.length === 1, '自分が登録した免除は取り消せる');
ok(gas.sheet('免除') && gas.sheet('免除').data.length === 3, '免除はシート「免除」に残る（取り消しも削除日時で残す）');

section('閲覧の合言葉');
ok(api({ op: 'saveSettings', token: A, viewPass: 'kurfc2026' }).viewLock === true, '管理者が合言葉を設定できる');
st = api({ op: 'state' });
ok(st.locked === true && st.members === undefined, '合言葉ONのとき、ログインなしではデータを返さない');
r = api({ op: 'viewLogin', pass: 'kurfc2026' });
ok(r.ok && api({ op: 'state', viewToken: r.viewToken }).members.length > 0, '正しい合言葉で見られる');
api({ op: 'saveSettings', token: A, viewPass: '' });

section('進級（学年をまとめて上げる）');
(function () {
  const before = api({ op: 'state', token: A });
  const list = before.members.filter((m) => m.active).sort((x, y) => (x.id < y.id ? -1 : 1));
  const sig = list.map((m) => m.id + ':' + (m.grade || '')).join(',');
  const g = (n) => list.find((m) => m.name === n);
  ok(api({ op: 'promote', token: A, sig: sig + 'x', choice: {} }).error === 'changed', '画面で見た名簿と違えば進級しない');
  ok(api({ op: 'promote', token: LD, sig: sig, choice: {} }).ok !== true, '管理者以外は進級できない');
  const four = list.filter((m) => m.grade === '4年').map((m) => m.name);
  const choice = {};
  list.filter((m) => m.grade === '4年').forEach((m) => { choice[m.id] = 'grad'; });
  const stayName = four.find((n) => n !== '橋本 侑青');
  if (stayName) choice[g(stayName).id] = 'M1';
  const repeat = list.find((m) => m.grade === '2年');
  choice[repeat.id] = 'stay';
  const r = api({ op: 'promote', token: A, sig: sig, choice: choice });
  ok(r.ok && r.notGrad.some((x) => /橋本/.test(x)), '自分自身・財務は卒業にしない（理由を返す）');
  const after = api({ op: 'state', token: A });
  const a = (n) => after.members.find((m) => m.name === n);
  ok(a(repeat.name).grade === '2年', '「そのまま」を選んだ人（留年）は学年が変わらない');
  const ups = list.filter((m) => ({ '1年': 1, '2年': 1, '3年': 1 })[m.grade] && m.id !== repeat.id);
  ok(ups.length > 0 && ups.every((m) => a(m.name).grade === ({ '1年': '2年', '2年': '3年', '3年': '4年' })[m.grade]), '1〜3年は1つ上がる');
  ok(!stayName || (a(stayName).grade === 'M1' && a(stayName).active), '4年で「M1へ」を選んだ人はM1になる');
  const grads = four.filter((n) => n !== stayName && n !== '橋本 侑青');
  ok(grads.every((n) => a(n).active === false && a(n).left === after.today), '4年で「卒業」を選んだ人は在籍が外れ、退部日が今日になる');
  ok(a('橋本 侑青').grade === '4年' && a('橋本 侑青').active, '卒業にできなかった人は4年のまま');
  const k = (n) => gas.masterSheet().data.find((row) => row[0] === n);
  ok(ups.every((m) => k(m.name)[col('学年')] === a(m.name).grade), '会計アプリの名簿（部員シート）の学年も変わる');
  ok(api({ op: 'promote', token: A, sig: sig, choice: choice }).error === 'changed', '同じ画面からもう一度押しても二重に上がらない');
})();

section('メニューの型と繰り返し');
(function () {
  gas.setToday('2026-11-13'); // 金
  const tpl = { title: '下半身の日', group: 'FW', positions: [], content: 'スクワット\nデッドリフト', detail: '5×5', note: '', video: 'https://youtu.be/abc', repeat: [1, 3] };
  let r = api({ op: 'saveTemplate', token: LD, template: tpl });
  ok(r.ok && r.created === 8, '毎週 月・水 の型を作ると、4週間先までのメニューができる（8回）');
  ok(api({ op: 'saveTemplate', token: MX, template: tpl }).error === 'forbidden', 'マネージャーは型を作れない');
  const tid = r.template.id;
  let st = api({ op: 'state', token: LD });
  const mine = () => api({ op: 'state', token: LD }).menus.filter((w) => w.templateId === tid);
  ok(st.templates.some((t) => t.id === tid) && api({ op: 'state' }).templates === undefined, '型の一覧は管理者・FWリーダーにだけ返す');
  eq(mine().map((w) => w.date).slice(0, 3), ['2026-11-16', '2026-11-18', '2026-11-23'], '月曜・水曜の日付に作られる');
  ok(mine().every((w) => w.video === 'https://youtu.be/abc'), '動画リンクもメニューに入る');
  // 1つを手で直す
  const one = mine()[0];
  api({ op: 'saveMenu', token: LD, menu: Object.assign({}, one, { title: '下半身（軽め）' }) });
  r = api({ op: 'saveTemplate', token: LD, template: Object.assign({}, tpl, { id: tid, title: '下半身の日v2', repeat: [1] }) });
  ok(r.ok && r.removed === 4 && r.updated === 3, '型を直すと、手で直していないメニューはそろい、予定から外れた水曜の分は消える');
  const after = mine();
  ok(after.find((w) => w.id === one.id).title === '下半身（軽め）', '手で直したメニューはそのまま');
  ok(after.filter((w) => w.id !== one.id).every((w) => w.title === '下半身の日v2' && L.dow(w.date) === 1), 'ほかは新しい名前・月曜だけ');
  // 1つを消すと、同じ日には作り直さない
  const del = after.find((w) => w.id !== one.id);
  api({ op: 'deleteMenu', token: LD, id: del.id });
  gas.shiftDays(7);
  st = api({ op: 'state', token: LD });
  const later = st.menus.filter((w) => w.templateId === tid).map((w) => w.date);
  ok(later.indexOf(del.date) < 0, '消した日のメニューは作り直さない');
  ok(later.indexOf('2026-12-14') >= 0, '1週間たつと、毎日の手入れでさらに先の分が作られる');
  ok(api({ op: 'saveTemplate', token: LD, template: Object.assign({}, tpl, { video: 'javascript:alert(1)' }) }).error === 'bad_url', '動画リンクは http(s) のURLだけ');
  r = api({ op: 'deleteTemplate', token: LD, id: tid });
  ok(r.ok && r.removed >= 3, '型を消すと、明日以降の手で直していない繰り返しも消える');
  ok(!api({ op: 'state', token: LD }).templates.some((t) => t.id === tid), '消した型は一覧に出ない');
  gas.setToday('2026-11-13');
})();

section('メニューのコピー・これまでのメニュー');
(function () {
  const st = api({ op: 'state', token: LD });
  const src = st.menus.find((w) => w.date === '2026-11-13') || st.menus[0];
  let r = api({ op: 'copyMenu', token: LD, id: src.id, dates: ['2026-11-20', '2026-11-27', '2026-11-20'] });
  ok(r.ok && r.created === 2, '別の日にコピーできる（同じ日は1回だけ）');
  ok(api({ op: 'saveMenu', token: LD, menu: { date: '2026-11-20', group: 'FW', title: 'x', content: 'y', video: 'ftp://a' } }).error === 'bad_url', 'メニューの動画リンクも http(s) だけ');
  r = api({ op: 'menuArchive', token: MX });
  ok(r.ok && r.menus.length > 0 && r.menus[0].targetCount !== undefined && r.menus[0].date >= r.menus[r.menus.length - 1].date, 'これまでのメニューを新しい順に一覧できる（引き継ぎ用）');
  ok(api({ op: 'menuArchive' }).error === 'auth', 'ログインしていないと一覧は出さない');
})();

section('取り消した記録と復元');
(function () {
  const st = api({ op: 'state', token: MX });
  const p = st.members.filter((m) => m.player && m.active)[0];
  api({ op: 'saveRecords', token: MX, date: '2026-11-11', items: [{ memberId: p.id, done: true }] });
  api({ op: 'saveRecords', token: MX, date: '2026-11-11', items: [{ memberId: p.id, done: false }] });
  let t = api({ op: 'trash', token: MX });
  const x = t.trash.find((y) => y.memberId === p.id && y.date === '2026-11-11');
  ok(x && x.removedByName === '村上 樹', '取り消した記録は「取り消した記録」に残る（だれが取り消したかも）');
  let r = api({ op: 'restoreRecord', token: MX, id: x.id });
  ok(r.ok && r.records.some((y) => y[0] === p.id && y[2] === 1), '取り消した記録を戻せる');
  ok(api({ op: 'restoreRecord', token: MX, id: x.id }).error === 'not_found', '同じものを2回は戻せない');
  api({ op: 'deleteRecord', token: A, date: '2026-11-11', memberId: p.id });
  const y = api({ op: 'trash', token: A }).trash.find((z) => z.memberId === p.id && z.date === '2026-11-11');
  ok(api({ op: 'restoreRecord', token: MX, id: y.id }).error === 'forbidden', 'マネージャーは管理者が取り消した記録を戻せない');
  api({ op: 'saveRecords', token: MX, date: '2026-11-11', items: [{ memberId: p.id, done: true }] });
  ok(api({ op: 'restoreRecord', token: A, id: y.id }).error === 'exists', 'その日にもう記録があれば戻さない');
  ok(api({ op: 'trash', token: LD }).ok !== true, 'FWリーダーは見られない');
})();

section('全期間の記録・通算');
(function () {
  const st = api({ op: 'state' });
  const p = st.members.filter((m) => m.player && m.active)[0];
  const h = api({ op: 'memberHistory', memberId: p.id });
  ok(h.ok && h.records.every((x) => x[0] === p.id) && h.records.length >= 1, '1人の全期間の記録を返す（ログイン不要）');
  ok(st.life[p.id] && st.life[p.id][0] === h.records.filter((x) => x[2] === 1).length, '状態に通算の実施回数が入る');
})();

section('体重・体組成');
(function () {
  const st = api({ op: 'state', token: LD });
  const ps = st.members.filter((m) => m.player && m.active).slice(0, 2);
  let r = api({ op: 'saveBody', token: LD, rows: [{ memberId: ps[0].id, date: '2026-11-10', weight: '82.4', fat: '18', muscle: '', note: '朝' }, { memberId: ps[1].id, date: '2026-11-10', weight: '７５．０' }] });
  ok(r.ok && r.added === 2, 'FWリーダーが体重・体組成をまとめて入れられる（全角の数字も読む）');
  const pub = api({ op: 'state' }).body;
  ok(pub.length === 2 && pub.find((b) => b[1] === ps[1].id)[3] === 75 && pub[0][6] === '', 'だれでも数値を見られる（メモはスタッフだけ）');
  ok(api({ op: 'state', token: LD }).body.find((b) => b[1] === ps[0].id)[6] === '朝', 'スタッフにはメモも見える');
  r = api({ op: 'saveBody', token: MX, rows: [{ memberId: ps[0].id, date: '2026-11-10', weight: '82.0' }] });
  ok(r.ok && r.updated === 1 && r.added === 0, '同じ人・同じ日は上書き');
  ok(api({ op: 'saveBody', token: MX, rows: [{ memberId: ps[0].id, date: '2026-11-10', weight: '500' }] }).error === 'bad_number', 'ありえない数は入れない');
  ok(api({ op: 'saveBody', token: MX, rows: [{ memberId: ps[0].id, date: '2026-11-10' }] }).error === 'empty', '何も入っていなければ入れない');
  ok(api({ op: 'saveBody', rows: [{ memberId: ps[0].id, date: '2026-11-10', weight: 70 }] }).error === 'auth', '一般部員（ログインなし）は入れられない');
  const b1 = api({ op: 'state', token: LD }).body.find((b) => b[1] === ps[1].id);
  ok(api({ op: 'deleteBody', token: MX, id: b1[0] }).error === 'forbidden', 'ほかの人が入れた記録は（管理者以外）消せない');
  ok(api({ op: 'deleteBody', token: LD, id: b1[0] }).ok && api({ op: 'state' }).body.length === 1, '自分が入れた記録は消せる');
})();

section('応援スタンプ');
(function () {
  const st = api({ op: 'state' });
  const p = st.members.filter((m) => m.player && m.active)[0];
  const dev = 'a1b2c3d4e5f60718';
  let r = api({ op: 'stamp', target: p.id, event: 'g:2026-11-09', kind: 'fire', device: dev });
  ok(r.ok && r.on && r.stamp.c.fire === 1, 'ログインなしで応援スタンプを送れる');
  api({ op: 'stamp', target: p.id, event: 'g:2026-11-09', kind: 'fire', device: 'ffffeeeeddddcccc', from: st.members[1].id });
  const s1 = api({ op: 'state', device: dev }).stamps.find((x) => x.t === p.id && x.e === 'g:2026-11-09');
  ok(s1 && s1.c.fire === 2 && s1.mine.indexOf('fire') >= 0 && s1.f.length === 1, '数・自分が押したか・送った人が分かる');
  r = api({ op: 'stamp', target: p.id, event: 'g:2026-11-09', kind: 'fire', device: dev });
  ok(r.ok && !r.on && r.stamp.c.fire === 1, 'もう一度押すと取り消し（同じ端末で二重に数えない）');
  ok(api({ op: 'stamp', target: p.id, event: 'g:2026-11-09', kind: 'poop', device: dev }).error === 'bad_stamp', '決まったスタンプ以外は送れない');
  ok(api({ op: 'stamp', target: p.id, event: '<script>', kind: 'fire', device: dev }).error === 'bad_stamp', 'できごとの形が違えば送れない');
})();

section('暗証番号の再発行の依頼');
(function () {
  const ldId = id['前田 剛'];
  let r = api({ op: 'pinRequest', memberId: ldId });
  ok(r.ok, 'ログイン画面から管理者に再発行を頼める（ログイン不要）');
  ok(api({ op: 'pinRequest', memberId: ldId }).error === 'already', '続けて何度も送れない');
  ok(api({ op: 'pinRequest', memberId: id['近藤 蒼'] }).error === 'not_found', 'ログインする人（スタッフ）以外は頼めない');
  const reqs = api({ op: 'state', token: A }).pinRequests;
  ok(reqs.length === 1 && reqs[0].id === ldId, '管理者に依頼が届く');
  ok(api({ op: 'state', token: LD }).pinRequests === undefined, '管理者以外には出ない');
  ok(api({ op: 'dismissPinRequest', token: A, id: ldId }).ok && api({ op: 'state', token: A }).pinRequests.length === 0, '管理者は依頼を閉じられる');
})();

section('ログインしている端末');
(function () {
  const mid = id['村上 樹'];
  const t1 = api({ op: 'login', memberId: mid, pin: 'manager-x-pin', deviceName: 'iPhone・Safari' }).token;
  const t2 = api({ op: 'login', memberId: mid, pin: 'manager-x-pin', deviceName: 'Windows・Chrome' }).token;
  let r = api({ op: 'sessions', token: t2 });
  ok(r.ok && r.sessions.length >= 3 && r.sessions.filter((s) => s.current).length === 1 && r.sessions.some((s) => s.device === 'iPhone・Safari'), '自分がログインしている端末の一覧（今の端末が分かる）');
  const k1 = r.sessions.find((s) => s.device === 'iPhone・Safari').key;
  ok(api({ op: 'logoutSession', token: t2, key: k1 }).removed === 1 && api({ op: 'state', token: t1 }).me === null, '選んだ端末をログアウトできる');
  r = api({ op: 'logoutSession', token: t2, key: 'others' });
  ok(r.ok && api({ op: 'state', token: MX }).me === null && api({ op: 'state', token: t2 }).me.id === mid, '「ほかの端末をすべてログアウト」で今の端末だけ残る');
})();
const MX2 = api({ op: 'login', memberId: id['村上 樹'], pin: 'manager-x-pin' }).token;

section('役職をまとめて付け替え');
(function () {
  const st = api({ op: 'state', token: A });
  const kon = st.members.find((m) => m.name === '近藤 蒼');
  let r = api({ op: 'bulkPerms', token: A, rows: [{ id: kon.id, perm: 'leader' }, { id: id['前田 剛'], perm: 'member' }] });
  ok(r.ok && r.changed === 2 && r.pins.length === 1 && r.pins[0].name === '近藤 蒼' && /^\d{6}$/.test(r.pins[0].pin), '新しくログインする人には暗証番号を発行して返す');
  ok(api({ op: 'state', token: LD }).me === null, '外れた人はログインできなくなる');
  ok(api({ op: 'state' }).staff.some((s) => s.name === '近藤 蒼'), '新しいFWリーダーがログインの一覧に出る');
  ok(api({ op: 'bulkPerms', token: A, rows: [{ id: id['橋本 侑青'], perm: 'member' }] }).error === 'self', '自分自身の権限は変えられない');
  ok(api({ op: 'bulkPerms', token: MX2, rows: [{ id: kon.id, perm: 'member' }] }).ok !== true, '管理者以外は使えない');
  ok(api({ op: 'bulkPerms', token: A, rows: [{ id: kon.id, perm: 'boss' }] }).error === 'bad_perm', '決まった権限以外は入れない');
})();

section('操作履歴');
r = api({ op: 'logs', token: A, limit: 500 });
const acts = r.logs.map((x) => x.action);
ok(['共通名簿へ移行', '記録を追加', '記録を取り消し', 'メニューを作成', '部員を編集', '部員をまとめて編集', '部員の一覧を反映', 'ログイン', '暗証番号を発行'].every((a) => acts.includes(a)), '移行・記録・メニュー・部員・ログインの操作が履歴に残る');

section('2回目以降・保存と読み込み');
const reqs = gas.stats.writes;
api({ op: 'state' }); api({ op: 'state' });
ok(gas.stats.writes === reqs, '変化が無ければ、読むだけのリクエストでは何も書かない');
const res2 = gas.run('setup');
ok(res2 === 'ok' && gas.sheet('旧_部員（v1）') && !gas.sheet('旧_部員（v1）2'), '初期設定は何度実行しても壊れない（移行も1回だけ）');
const pin2 = gas.run('registerAdmin_', '長谷川 湊');
ok(/^\d{6}$/.test(pin2) && api({ op: 'state' }).staff.some((s) => s.name === '長谷川 湊'), 'スプレッドシートのメニューから名簿にいる人を管理者にできる');

console.log('\n==============================');
console.log('合格 ' + pass + ' / 不合格 ' + fail);
if (fail) { console.log('不合格:\n - ' + failed.join('\n - ')); process.exit(1); }

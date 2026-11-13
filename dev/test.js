// 自動テスト：node dev/test.js
// 指示書「11. 必須テスト項目」をサーバー（Code.gs）と集計（logic.js）に対して実行する
const { create } = require('./mock-gas');
const L = require('../logic.js');

let pass = 0, fail = 0;
const failed = [];
function section(t) { console.log('\n■ ' + t); }
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; failed.push(label); console.log('  ✗ ' + label); }
}
function eq(a, b, label) { ok(JSON.stringify(a) === JSON.stringify(b), label + (JSON.stringify(a) === JSON.stringify(b) ? '' : '  → 実際: ' + JSON.stringify(a) + ' / 期待: ' + JSON.stringify(b))); }

const gas = create();
gas.setToday('2026-11-13'); // 金曜日
const api = gas.api;

// ---------------- 準備 ----------------
section('初期設定と管理者の登録');
eq(gas.run('setup'), 'ok', '初期設定でシートができる');
eq(gas.run('setup'), 'ok', '初期設定は2回実行しても壊れない');
ok(['部員', '設定変更履歴', 'メニュー', '実施記録', 'ログイン', '操作履歴', '設定'].every((n) => gas.sheet(n)), '7つのシートがある');
const adminPin0 = gas.run('registerAdmin_', '橋本 侑青');
ok(/^\d{6}$/.test(adminPin0), '管理者の最初の暗証番号（6桁）が発行される');

let st = api({ op: 'state' });
ok(st.ok && !st.me && st.members.length === 1, 'ログインなしで状態を読める（一般部員は見るだけ）');
const adminId = st.members[0].id;
ok(st.members[0].pinSet === undefined, 'ログインなしでは暗証番号の情報は返らない');

section('ログインと暗証番号');
ok(api({ op: 'login', memberId: adminId, pin: '000000' }).error === 'login_failed', 'まちがった暗証番号ではログインできない');
let r = api({ op: 'login', memberId: adminId, pin: adminPin0 });
ok(r.ok && r.me.role === 'admin' && r.me.mustChange === true, '最初の暗証番号でログインでき、変更を求められる');
let A = r.token;
ok(api({ op: 'saveMember', token: A, member: { name: 'x', group: 'FW' } }).error === 'must_change_pin', '暗証番号を変えるまでは操作できない');
ok(api({ op: 'changePin', token: A, oldPin: adminPin0, newPin: '123' }).error === 'bad_pin', '短い暗証番号は拒否');
ok(api({ op: 'changePin', token: A, oldPin: 'wrong1', newPin: 'admin-pass-1' }).error === 'login_failed', '今の暗証番号が違うと変更できない');
ok(api({ op: 'changePin', token: A, oldPin: adminPin0, newPin: 'admin-pass-1' }).ok, '暗証番号を変更できる');
ok(api({ op: 'state', token: A }).me.mustChange === false, '変更後は通常どおり使える');
ok(api({ op: 'state', token: 'bogus' }).me === null, 'でたらめなトークンはログイン扱いにならない');

// ---------------- 部員 ----------------
section('部員の追加と取り組み方の設定');
r = api({ op: 'importMembers', token: A, rows: [
  { name: 'FW太郎', group: 'FW', mode: 'leader' },
  { name: 'FW次郎', group: 'FW', mode: 'leader' },
  { name: 'FW三郎', group: 'FW', mode: 'self' },
  { name: 'BK一郎', group: 'BK', mode: 'leader' },
  { name: 'BK二郎', group: 'BK', mode: 'self' },
  { name: 'BK三郎', group: 'BK', mode: 'leader' },
  { name: '=SUM(A1)', group: 'BK', mode: 'self' }
] });
ok(r.ok && r.added === 7, '部員をまとめて追加できる（数式に見える名前も文字として保存）');
ok(api({ op: 'importMembers', token: A, rows: [{ name: 'FW太郎', group: 'FW' }] }).skipped.length === 1, '同じ名前は二重に追加されない');
r = api({ op: 'saveMember', token: A, member: { name: 'マネ花子', player: false, role: 'manager' } });
ok(r.ok && r.member.player === false && r.member.role === 'manager', 'マネージャー（選手ではない）を追加できる');
const mgr1 = r.member.id;
r = api({ op: 'saveMember', token: A, member: { name: 'マネ桜', player: false, role: 'manager' } });
const mgr2 = r.member.id;
st = api({ op: 'state', token: A });
const id = {};
st.members.forEach((m) => { id[m.name] = m.id; });
ok(st.members.find((m) => m.name === '=SUM(A1)'), '数式に見える名前がそのまま読める');
// FW太郎をFWリーダーに
r = api({ op: 'saveMember', token: A, member: { id: id['FW太郎'], name: 'FW太郎', group: 'FW', mode: 'leader', role: 'leader' } });
ok(r.ok && r.member.role === 'leader', '管理者が権限を変更できる（FWリーダーに）');
ok(api({ op: 'saveMember', token: A, member: { id: adminId, name: '橋本 侑青', group: 'BK', mode: 'self', role: 'member' } }).error === 'last_admin', '最後の管理者は一般部員に変えられない');
ok(api({ op: 'saveMember', token: A, member: { id: adminId, name: '橋本 侑青', group: 'BK', mode: 'self', role: 'admin' } }).ok, '管理者が部員情報（グループ）を編集できる');
ok(api({ op: 'saveMember', token: A, member: { name: 'FW太郎', group: 'FW' } }).error === 'duplicate', '同じ名前の部員は追加できない');

function staffLogin(memberId, newPin) {
  const t = api({ op: 'resetPin', token: A, id: memberId });
  const l = api({ op: 'login', memberId, pin: t.tempPin });
  api({ op: 'changePin', token: l.token, oldPin: t.tempPin, newPin });
  return l.token;
}
const M1 = staffLogin(mgr1, 'manager-1-pin');
const M2 = staffLogin(mgr2, 'manager-2-pin');
const LD = staffLogin(id['FW太郎'], 'leader-pin-1');
ok(api({ op: 'state', token: M1 }).me.role === 'manager' && api({ op: 'state', token: LD }).me.role === 'leader', 'マネージャー・FWリーダーがログインできる');
ok(api({ op: 'resetPin', token: A, id: id['BK二郎'] }).error === 'not_staff', '一般部員には暗証番号を発行しない（ログイン不要）');
ok(api({ op: 'login', memberId: id['BK二郎'], pin: '123456' }).error === 'login_failed', '一般部員はログインできない');

// ---------------- メニュー ----------------
section('FWリーダーのメニュー登録');
const menu = (o) => Object.assign({ title: 'メニュー', content: 'スクワット', detail: '5回×5セット', note: '' }, o);
r = api({ op: 'saveMenu', token: LD, menu: menu({ date: '2026-11-13', group: 'FW', title: 'FW下半身' }) });
ok(r.ok, 'FWリーダーがFW向けメニューを登録できる');
const wFW = r.menu;
eq(wFW.targets.slice().sort(), [id['FW太郎'], id['FW次郎']].sort(), 'FWメニューの対象はFWのメニュー参加者だけ（自主トレのFW三郎は含まれない）');
r = api({ op: 'saveMenu', token: LD, menu: menu({ date: '2026-11-13', group: 'BK', title: 'BK上半身' }) });
const wBK = r.menu;
eq(wBK.targets.slice().sort(), [id['BK一郎'], id['BK三郎']].sort(), '同じ日にBK向けの別メニューを登録できる（対象はBKの参加者だけ）');
r = api({ op: 'saveMenu', token: LD, menu: menu({ date: '2026-11-13', group: 'ALL', title: '全体体幹' }) });
const wALL = r.menu;
eq(wALL.targets.length, 4, '同じ日に全体メニューも登録できる（対象は参加者4人。自主トレ・マネージャーは含まれない）');
ok(!wALL.targets.includes(id['FW三郎']) && !wALL.targets.includes(id['BK二郎']) && !wALL.targets.includes(mgr1), '自主トレの部員とマネージャーは対象外');
r = api({ op: 'saveMenu', token: LD, menu: menu({ date: '2026-11-10', group: 'ALL', title: '火曜全体' }) });
const wTue = r.menu;
r = api({ op: 'saveMenu', token: LD, menu: Object.assign({}, wFW, { title: 'FW下半身（改）', detail: '6回×4セット' }) });
ok(r.ok && r.menu.title === 'FW下半身（改）', 'FWリーダーがメニューを編集できる');
r = api({ op: 'saveMenu', token: LD, menu: menu({ date: '2026-11-20', group: 'FW', title: '消す予定' }) });
const wDel = r.menu;
ok(api({ op: 'deleteMenu', token: LD, id: wDel.id }).ok, 'FWリーダーがメニューを削除できる');
ok(!api({ op: 'state' }).menus.find((w) => w.id === wDel.id), '削除したメニューは一覧に出ない');
ok(api({ op: 'saveMenu', token: M1, menu: menu({ date: '2026-11-14', group: 'FW' }) }).error === 'forbidden', 'マネージャーはメニューを作成できない');
ok(api({ op: 'deleteMenu', token: M1, id: wFW.id }).error === 'forbidden', 'マネージャーはメニューを削除できない');
ok(api({ op: 'saveMenu', menu: menu({ date: '2026-11-14', group: 'FW' }) }).error === 'auth', 'ログインなし（一般部員）はメニューを作成できない');
ok(api({ op: 'saveMenu', token: LD, menu: menu({ date: '2026-02-30', group: 'FW' }) }).error === 'bad_date', '存在しない日付は拒否');
ok(api({ op: 'saveMenu', token: LD, menu: menu({ date: '2026-11-14', group: 'XX' }) }).error === 'bad_group', '対象グループは FW・BK・全体 のみ');
ok(api({ op: 'saveMenu', token: A, menu: menu({ date: '2026-11-14', group: 'FW', title: '管理者作成' }) }).ok, '管理者もメニューを作成できる');

// ---------------- 実施記録 ----------------
section('マネージャーの実施記録');
const players = Object.keys(id).filter((n) => !n.startsWith('マネ')).map((n) => id[n]);
r = api({ op: 'saveRecords', token: M1, date: '2026-11-13', items: players.map((p) => ({ memberId: p, status: 'done' })) });
ok(r.ok && r.saved === players.length && r.rejected.length === 0, '全員をまとめて「実施した」で記録できる（自主トレの部員も含む）');
r = api({ op: 'saveRecords', token: M1, date: '2026-11-13', items: [{ memberId: id['FW次郎'], status: 'not' }] });
ok(r.ok && r.updated === 1, '一括記録のあと、個別に「実施していない」へ修正できる');
r = api({ op: 'saveRecords', token: M1, date: '2026-11-13', items: players.map((p) => ({ memberId: p, status: 'done' })) });
ok(r.ok && r.saved === 0 && r.updated === 1 && r.unchanged === players.length - 1, '同じ内容の再送信は重複せず、変わった分だけ更新される');
const recSheet = gas.sheet('実施記録').data.slice(1);
const keys = recSheet.map((x) => x[0] + '|' + x[1]);
ok(new Set(keys).size === keys.length && keys.length === players.length, '同じ部員・同じ日付の記録は1件だけ');
ok(api({ op: 'saveRecords', token: M1, date: '2026-11-13', items: [{ memberId: id['FW次郎'], status: 'excluded' }] }).rejected[0].reason === 'invalid', '選択肢は「実施した」「実施していない」の2つだけ（それ以外は拒否）');
ok(api({ op: 'saveRecords', token: M1, date: '2026-11-13', items: [{ memberId: mgr1, status: 'done' }] }).rejected[0].reason === 'not_in_roster', '選手ではない人（マネージャー）は記録の対象にならない');
ok(api({ op: 'saveRecords', token: M1, date: '2026-11-14', items: [{ memberId: id['FW次郎'], status: 'done' }] }).error === 'future_date', '未来の日付は記録できない');
r = api({ op: 'saveRecords', token: M1, date: '2026-11-11', items: [{ memberId: id['FW三郎'], status: 'done' }, { memberId: id['BK二郎'], status: 'done' }] });
ok(r.ok && r.saved === 2, 'メニューが無い日（11/11）でも自主トレの記録ができる');
r = api({ op: 'saveRecords', token: M1, date: '2026-10-28', items: [{ memberId: id['FW三郎'], status: 'done' }, { memberId: id['FW太郎'], status: 'not' }] });
ok(r.ok && r.saved === 2, '過去の日付（10/28）の記録ができる');
// 火曜の全体メニュー：太郎=実施、次郎=未実施、BK一郎=未記録、BK三郎=未記録
r = api({ op: 'saveRecords', token: M1, date: '2026-11-10', items: [{ memberId: id['FW太郎'], status: 'done' }, { memberId: id['FW次郎'], status: 'not' }] });
ok(r.ok && r.saved === 2, '一部の人だけ記録して保存できる（残りは未記録のまま）');

section('権限（サーバー側で拒否されること）');
ok(api({ op: 'saveRecords', token: LD, date: '2026-11-13', items: [{ memberId: id['FW次郎'], status: 'not' }] }).error === 'forbidden', 'FWリーダーは実施記録を変更できない');
ok(api({ op: 'saveRecords', date: '2026-11-13', items: [{ memberId: id['FW次郎'], status: 'not' }] }).error === 'auth', '一般部員（ログインなし）は実施記録を編集できない');
ok(api({ op: 'deleteRecord', token: M1, memberId: id['FW次郎'], date: '2026-11-13' }).error === 'forbidden', 'マネージャーは記録を削除できない');
ok(api({ op: 'saveMember', token: M1, member: { name: '新人', group: 'FW' } }).error === 'forbidden', 'マネージャーは部員を追加できない');
ok(api({ op: 'saveMember', token: LD, member: { id: id['FW次郎'], name: 'FW次郎', group: 'FW', mode: 'self' } }).error === 'forbidden', 'FWリーダーは部員の設定を変更できない');
ok(api({ op: 'saveMember', member: { id: id['FW次郎'], name: 'FW次郎', group: 'FW', mode: 'self' } }).error === 'auth', '一般部員（ログインなし）は取り組み方を変更できない');
ok(api({ op: 'setMemberActive', token: M1, id: id['FW次郎'], active: false }).error === 'forbidden', 'マネージャーは部員を削除できない');
ok(api({ op: 'resetPin', token: M1, id: mgr2 }).error === 'forbidden', 'マネージャーは暗証番号を発行できない');
ok(api({ op: 'logs', token: M1 }).error === 'forbidden' && api({ op: 'logs', token: LD }).error === 'forbidden' && api({ op: 'logs' }).error === 'auth', '操作履歴は管理者だけが見られる');
ok(api({ op: 'saveSettings', token: M1, viewPass: 'abcd' }).error === 'forbidden', '設定は管理者だけが変えられる');
r = api({ op: 'saveRecords', token: M2, date: '2026-11-13', items: [{ memberId: id['FW次郎'], status: 'not' }] });
ok(r.ok && r.updated === 0 && r.rejected[0].reason === 'not_owner', 'マネージャーは、ほかのマネージャーが入力した記録を修正できない');
r = api({ op: 'saveRecords', token: A, date: '2026-11-13', items: [{ memberId: id['FW次郎'], status: 'not' }] });
ok(r.ok && r.updated === 1, '管理者はだれの記録でも修正できる');
r = api({ op: 'saveRecords', token: A, date: '2026-11-13', items: [{ memberId: id['=SUM(A1)'], status: 'not' }] });
ok(api({ op: 'deleteRecord', token: A, memberId: id['=SUM(A1)'], date: '2026-11-13' }).ok, '管理者は記録を削除できる（未記録に戻る）');
ok(api({ op: 'unknown' }).error === 'unknown_op', '不明な操作は拒否');

// ---------------- 集計 ----------------
section('未記録と「実施していない」の区別・実施率');
st = api({ op: 'state' });
let idx = L.buildIndex(st);
const M = (name) => st.members.find((m) => m.name === name);
eq(L.cellState(idx, M('FW太郎'), '2026-11-10', st.today), 'done', '実施した → done');
eq(L.cellState(idx, M('FW次郎'), '2026-11-10', st.today), 'not', '実施していない → not');
eq(L.cellState(idx, M('BK一郎'), '2026-11-10', st.today), 'pending', '対象日でまだ記録が無い → 未記録（実施していないとは別）');
eq(L.cellState(idx, M('FW三郎'), '2026-11-10', st.today), 'none', '自主トレの部員の記録が無い日 → 予定なし（未実施にしない）');
eq(L.cellState(idx, M('FW太郎'), '2026-11-12', st.today), 'none', 'メニューが無い日 → 予定なし（未実施にしない）');
eq(L.cellState(idx, M('FW太郎'), '2026-11-14', st.today), 'planned', '明日のメニュー → 予定（未記録に数えない）');
let wk = L.weekRange(st.today);
eq(wk, { from: '2026-11-09', to: '2026-11-15' }, '週は月曜始まり（11/9〜11/15）');
let ps = L.periodStats(st, idx, wk.from, wk.to, st.today);
const row = (name) => ps.rows.find((x) => x.name === name);
eq([row('FW太郎').done, row('FW太郎').targetDays, row('FW太郎').recT, row('FW太郎').rate], [2, 2, 2, 1], 'FW太郎：実施2回・対象2日・実施率100%');
eq([row('FW次郎').done, row('FW次郎').notDone, row('FW次郎').rate], [0, 2, 0], 'FW次郎：実施していない2回・実施率0%');
eq([row('BK一郎').done, row('BK一郎').targetDays, row('BK一郎').recT, row('BK一郎').pending, row('BK一郎').rate], [1, 2, 1, 1, 1], 'BK一郎：対象2日のうち1日が未記録 → 分母に入れず実施率100%（1/1）');
eq([row('FW三郎').done, row('FW三郎').targetDays, row('FW三郎').rate], [2, 0, null], '自主トレのFW三郎：実施2回・対象日0・実施率は出さない（－）');
eq(L.pct(row('FW三郎').rate), '－', '実施率を出せないときは「－」');
eq(ps.team.done, 9, '部全体の実施回数（今週）= 9');
eq([ps.team.targetDays, ps.team.recT, ps.team.pending], [8, 6, 2], '記録完了 6/8（未記録2）');
eq(Math.round(ps.team.rate * 100), 67, 'メニュー参加者の実施率 = 4/6 = 67%');
let ds = L.dayStatus(st, idx, '2026-11-10');
eq([ds.targets, ds.targetRecorded, ds.pending], [4, 2, 2], '11/10 の記録完了 2/4人・未記録2人');

section('指示書の計算例（対象10回・記録8回・実施6回 → 75%）');
(function () {
  const members = [{ id: 'x', name: 'X', player: true, group: 'FW', mode: 'leader', start: '', left: '' }];
  const menus = [], records = [];
  for (let i = 1; i <= 10; i++) {
    const d = L.ymd(2026, 10, i);
    menus.push({ id: 'w' + i, date: d, targets: ['x'] });
    if (i <= 6) records.push(['x', d, 1, 1, 'a']); else if (i <= 8) records.push(['x', d, 0, 1, 'a']);
  }
  const s = { members, menus, records };
  const p = L.periodStats(s, L.buildIndex(s), '2026-10-01', '2026-10-31', '2026-10-31').rows[0];
  eq([p.done, p.notDone, p.pending, p.recT, p.targetDays, L.pct(p.rate)], [6, 2, 2, 8, 10, '75%'], '実施6・実施していない2・未記録2・記録完了8/10・実施率75%');
  // 同じ日に複数メニューがあっても対象は1回
  const s2 = { members, menus: [{ id: 'a', date: '2026-10-01', targets: ['x'] }, { id: 'b', date: '2026-10-01', targets: ['x'] }], records: [] };
  eq(L.periodStats(s2, L.buildIndex(s2), '2026-10-01', '2026-10-31', '2026-10-31').rows[0].targetDays, 1, '同じ日に複数メニューがあっても対象は1回');
})();

section('ランキング');
let rk = L.rank(ps.rows, 'count');
eq(rk.filter((x) => x.rank === 1).map((x) => x.name).sort(), ['BK二郎', 'FW三郎', 'FW太郎'], '実施回数順：2回の3人が同順位1位');
ok(rk.find((x) => x.name === 'FW次郎').rank === null, '実施0回は順位なし');
ok(rk.findIndex((x) => x.name === 'FW太郎') < rk.findIndex((x) => x.name === 'FW三郎'), '同数なら実施率がある人が上に並ぶ');
rk = L.rank(ps.rows, 'rate');
eq(rk[0].name, 'FW太郎', '実施率順：同率100%なら実施回数の多いFW太郎が1位');
eq(rk.filter((x) => x.rate !== null).map((x) => x.rank), [1, 2, 2, 4], '実施率順の順位（同率・同回数は同順位）');
ok(rk.filter((x) => x.mode === 'self' && x.name !== '橋本 侑青').every((x) => x.rank === null && x.rate === null), '自主トレの部員に実施率・実施率順位を付けない');
eq(L.periodStats(st, idx, wk.from, wk.to, st.today, { group: 'FW' }).rows.map((x) => x.name).sort(), ['FW三郎', 'FW太郎', 'FW次郎'], 'FWだけに絞り込める');
eq(L.periodStats(st, idx, wk.from, wk.to, st.today, { group: 'BK' }).rows.length, 5, 'BKだけに絞り込める');

section('週間・月間・前の期間との比較');
let mo = L.monthRange(st.today);
eq(mo, { from: '2026-11-01', to: '2026-11-30' }, '月は月初から月末（11/1〜11/30）');
eq(L.monthRange('2028-02-10').to, '2028-02-29', 'うるう年の2月末');
let pm = L.prevPeriod('month', mo.from);
eq(pm, { from: '2026-10-01', to: '2026-10-31' }, '先月（10/1〜10/31）');
eq(L.prevPeriod('week', wk.from), { from: '2026-11-02', to: '2026-11-08' }, '先週（11/2〜11/8）');
eq(L.periodStats(st, idx, pm.from, pm.to, st.today).team.done, 1, '先月の実施回数 = 1（10/28 のFW三郎）');
eq(L.periodStats(st, idx, mo.from, mo.to, st.today).team.done, 9, '今月の実施回数 = 9');
eq(L.weekRange('2026-11-15'), { from: '2026-11-09', to: '2026-11-15' }, '日曜日は同じ週の最後の日');
eq(L.weekRange('2026-11-16').from, '2026-11-16', '月曜日から新しい週');
eq(L.todayJST(Date.UTC(2026, 10, 13, 15, 0, 0)), '2026-11-14', '日付は日本時間で切り替わる（UTC 15:00 = 日本の翌日0:00）');
eq(L.todayJST(Date.UTC(2026, 10, 13, 14, 59, 0)), '2026-11-13', '日本時間 23:59 はまだ当日');
eq(L.continuity(idx, M('FW太郎'), mo.from, mo.to, st.today), { weeks: 3, hit: 1, every: false, marks: [false, false, true] }, '継続状況：11月の3週のうち1週で実施');
eq(L.streakWeeks(idx, M('FW三郎'), st.today, '2026-08-01'), 1, '連続週数：今週のみ = 1');

// ---------------- 設定変更と過去の記録 ----------------
section('設定変更・メニュー変更で過去が変わらないこと');
const before = JSON.stringify(L.periodStats(st, idx, wk.from, wk.to, st.today).rows.map((x) => [x.name, x.done, x.notDone, x.targetDays, x.recT, x.rate]));
gas.shiftDays(1); // 11/14（土）
r = api({ op: 'saveMember', token: A, member: { id: id['FW次郎'], name: 'FW次郎', group: 'FW', mode: 'self', role: 'member' } });
ok(r.ok && r.member.mode === 'self', '管理者が取り組み方を「自主トレ」に変更できる');
r = api({ op: 'saveMember', token: A, member: { id: id['BK二郎'], name: 'BK二郎', group: 'FW', mode: 'leader', role: 'member' } });
ok(r.ok && r.member.mode === 'leader' && r.member.group === 'FW', '管理者が取り組み方を「メニュー参加」に、グループをFWに変更できる');
st = api({ op: 'state' });
idx = L.buildIndex(st);
const after = JSON.stringify(L.periodStats(st, idx, wk.from, wk.to, '2026-11-13').rows.map((x) => [x.name, x.done, x.notDone, x.targetDays, x.recT, x.rate]));
eq(after, before, '取り組み方・グループを変えても、昨日までの集計は1つも変わらない');
eq(st.menus.find((w) => w.id === wFW.id).targets.slice().sort(), [id['FW太郎'], id['FW次郎']].sort(), '過去のメニューの対象者は登録時点のまま');
eq(st.menus.find((w) => w.title === '管理者作成').targets.slice().sort(), [id['BK二郎'], id['FW太郎']].sort(), '今日以降のメニューの対象者は新しい設定に合わせて更新される');
// 過去のメニューを編集・削除
r = api({ op: 'saveMenu', token: LD, menu: Object.assign({}, st.menus.find((w) => w.id === wTue.id), { content: '内容だけ直す' }) });
eq(r.menu.targets.length, 4, '過去のメニューの文面を直しても、対象者は登録時点の4人のまま');
ok(api({ op: 'deleteMenu', token: LD, id: wTue.id }).ok, '過去のメニューを削除できる');
st = api({ op: 'state' });
idx = L.buildIndex(st);
ps = L.periodStats(st, idx, wk.from, wk.to, '2026-11-13');
eq([ps.rows.find((x) => x.name === 'FW太郎').done, ps.rows.find((x) => x.name === 'FW太郎').recT, ps.rows.find((x) => x.name === 'FW太郎').rate], [2, 2, 1], '過去のメニューを消しても、記録済みの実施回数・実施率は変わらない');
eq(ps.rows.find((x) => x.name === 'BK一郎').pending, 0, '消したメニューの未記録は数えなくなる（未実施にはならない）');
// 記録済みの日に後からメニューを登録
r = api({ op: 'saveMenu', token: LD, menu: menu({ date: '2026-10-28', group: 'FW', title: '後から登録' }) });
st = api({ op: 'state' });
idx = L.buildIndex(st);
eq(L.getRec(idx, id['FW太郎'], '2026-10-28').t, 1, '後からメニューを登録した日の記録は、対象として扱われる');
eq(L.getRec(idx, id['FW三郎'], '2026-10-28').t, 0, 'そのときも自主トレの部員は対象にならない');
ok(!r.menu.targets.includes(id['BK二郎']), '過去の日付のメニューは、その日の時点の設定で対象者を決める（当時は自主トレ・BK）');
ok(r.menu.targets.includes(id['FW次郎']), '過去の日付のメニューは、当時メニュー参加だった人を対象に含める');

section('部員の削除（退部）と復帰');
r = api({ op: 'setMemberActive', token: A, id: id['BK三郎'], active: false });
ok(r.ok && r.member.active === false && r.member.left === '2026-11-14', '管理者が部員を削除できる（退部日が入る）');
ok(api({ op: 'setMemberActive', token: A, id: adminId, active: false }).error === 'self', '自分自身は削除できない');
st = api({ op: 'state' });
idx = L.buildIndex(st);
ok(L.periodStats(st, idx, wk.from, wk.to, '2026-11-13').rows.find((x) => x.name === 'BK三郎').done === 1, '削除しても、在籍していた期間の記録と集計は残る');
ok(!L.periodStats(st, idx, '2026-11-16', '2026-11-22', '2026-11-22').rows.find((x) => x.name === 'BK三郎'), '退部後の期間の集計には出てこない');
ok(!st.menus.find((w) => w.title === '管理者作成').targets.includes(id['BK三郎']), '今日以降のメニューの対象から外れる');
ok(api({ op: 'saveRecords', token: M1, date: '2026-11-14', items: [{ memberId: id['BK三郎'], status: 'done' }] }).rejected[0].reason === 'not_in_roster', '退部後の日付には記録できない');
ok(api({ op: 'setMemberActive', token: A, id: id['BK三郎'], active: true }).member.active === true, '削除した部員を戻せる');

// ---------------- セキュリティ ----------------
section('ログインの保護');
for (let i = 0; i < 4; i++) api({ op: 'login', memberId: mgr2, pin: 'x' + i });
ok(api({ op: 'login', memberId: mgr2, pin: 'manager-2-pin' }).ok, '4回まちがえてもまだログインできる');
for (let i = 0; i < 5; i++) api({ op: 'login', memberId: mgr2, pin: 'x' + i });
ok(api({ op: 'login', memberId: mgr2, pin: 'manager-2-pin' }).error === 'locked', '5回続けてまちがえると15分ロックされる');
gas.clock.offset += 16 * 60000;
ok(api({ op: 'login', memberId: mgr2, pin: 'manager-2-pin' }).ok, '15分たつとログインできる');
r = api({ op: 'saveMember', token: A, member: { id: mgr1, name: 'マネ花子', player: false, role: 'member' } });
ok(api({ op: 'saveRecords', token: M1, date: '2026-11-14', items: [{ memberId: id['FW太郎'], status: 'done' }] }).error === 'auth', '権限を外された人のログインはその場で無効になる');
api({ op: 'saveMember', token: A, member: { id: mgr1, name: 'マネ花子', player: false, role: 'manager' } });
ok(api({ op: 'login', memberId: mgr1, pin: 'manager-1-pin' }).error === 'login_failed', '権限を外すと暗証番号も消える（戻すときは発行し直す）');
const M1b = staffLogin(mgr1, 'manager-1-new');
ok(api({ op: 'logout', token: M1b }).ok && api({ op: 'state', token: M1b }).me === null, 'ログアウトするとトークンは使えなくなる');
ok(!JSON.stringify(gas.dump()).includes('manager-2-pin') && !JSON.stringify(gas.dump()).includes('admin-pass-1'), '暗証番号はそのままの形では保存されない');
ok(!JSON.stringify(gas.dump()).includes(A), 'ログインのトークンもそのままの形では保存されない');

section('閲覧の合言葉（あとからONにできる）');
ok(api({ op: 'state' }).viewLock === false, '初期状態は合言葉なしで見られる');
ok(api({ op: 'saveSettings', token: A, viewPass: 'kurfc2026' }).viewLock === true, '管理者が合言葉を設定できる');
st = api({ op: 'state' });
ok(st.locked === true && st.members === undefined && st.records === undefined && st.staff.length >= 3, '合言葉ONのとき、ログインなしではデータを返さない（ログイン用の名前だけ返す）');
ok(api({ op: 'viewLogin', pass: 'wrong' }).error === 'login_failed', 'まちがった合言葉は拒否');
r = api({ op: 'viewLogin', pass: 'kurfc2026' });
ok(r.ok && api({ op: 'state', viewToken: r.viewToken }).members.length > 0, '正しい合言葉で見られる');
ok(api({ op: 'state', token: A }).members.length > 0, 'ログイン中の役職者は合言葉なしで見られる');
ok(api({ op: 'saveSettings', token: A, viewPass: '' }).viewLock === false && api({ op: 'state' }).members.length > 0, '合言葉を解除できる');

section('操作履歴');
r = api({ op: 'logs', token: A, limit: 500 });
const acts = r.logs.map((x) => x.action);
ok(['記録を追加', '記録を修正', '記録を削除', 'メニューを作成', 'メニューを編集', 'メニューを削除', '部員を追加', '部員を編集', '部員を削除', 'ログイン', '暗証番号を発行'].every((a) => acts.includes(a)), '記録・メニュー・部員・ログインの操作がすべて履歴に残る');
const fix = r.logs.find((x) => x.action === '記録を修正');
ok(fix && fix.name && fix.at && /実施した → 実施していない|実施していない → 実施した/.test(fix.detail), '記録の修正は「だれが・いつ・何を何に」まで残る');
ok(r.logs[0].at >= r.logs[r.logs.length - 1].at, '新しい順に並ぶ');

section('データの保存と読み込み');
const snapshot = JSON.parse(JSON.stringify(gas.dump()));
const gas2 = create();
gas2.setToday('2026-11-14');
gas2.load(snapshot);
const s1 = api({ op: 'state' }), s2 = gas2.api({ op: 'state' });
eq([s2.members.length, s2.menus.length, s2.records.length], [s1.members.length, s1.menus.length, s1.records.length], '保存された内容を別の実行でそのまま読み込める');
eq(s2.records.slice().sort(), s1.records.slice().sort(), '記録の中身も一致');
ok(gas2.api({ op: 'state', token: A }).me.role === 'admin', 'ログインも引き継がれる');
// 見出しの列を並べ替えても動く
(function () {
  const g3 = create(); g3.setToday('2026-11-14');
  const snap = JSON.parse(JSON.stringify(snapshot));
  snap['実施記録'] = snap['実施記録'].map((rw) => { const c = rw.slice(); while (c.length < 9) c.push(''); return [c[8], c[2], c[0], c[1], c[3], c[4], c[5], c[6], c[7], 'メモ列']; });
  g3.load(snap);
  const s3 = g3.api({ op: 'state' });
  eq(s3.records.slice().sort(), s1.records.slice().sort(), 'スプレッドシートの列を並べ替えたり足したりしても読める');
  const rr = g3.api({ op: 'saveRecords', token: A, date: '2026-11-14', items: [{ memberId: id['FW太郎'], status: 'done' }] });
  ok(rr.ok && rr.saved === 1, '列を並べ替えた状態でも保存できる');
})();
// 手入力で日付がDate型になっていても読める形（文字列以外）を想定：内部の値のままでも読める
(function () {
  const g4 = create(); g4.setToday('2026-11-14');
  const snap = JSON.parse(JSON.stringify(snapshot));
  snap['実施記録'][1][2] = 'done';
  g4.load(snap);
  ok(g4.api({ op: 'state' }).records.length === s1.records.length, '内部の値（done など）が直接入っていても読める');
})();

console.log('\n==============================');
console.log('合格 ' + pass + ' / 不合格 ' + fail);
if (fail) { console.log('不合格:\n - ' + failed.join('\n - ')); process.exit(1); }

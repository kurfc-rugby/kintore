// setlog（v3・テスト環境）の自動テスト：node dev/test-setlog.js
// 部員全員のログイン・自分で登録・見るだけの人・動画（撮る→自動で実施した→気になる→取り消し→撮り直しは確認待ち→1か月で消える）
const { create, seedMaster } = require('./mock-gas');
const L = require('../logic.js');

let pass = 0, fail = 0;
const failed = [];
function section(t) { console.log('\n■ ' + t); }
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; failed.push(label); console.log('  ✗ ' + label); }
}

const gas = create();
gas.setToday('2026-11-17'); // 火曜日
seedMaster(gas, [
  { name: '前田 剛', grade: '4年' }, { name: '石川 大地', grade: '4年' }, { name: '森 健太', grade: '3年' },
  { name: '橋本 侑青', grade: '4年' }, { name: '小川 陽向', grade: '3年' }, { name: 'マネ 花子', grade: '2年', role: 'マネージャー' }
]);
const api = gas.api;
const adminPin = gas.run('registerAdmin_', '橋本 侑青');
let st = api({ op: 'state' });
const id = {};
st.members.forEach((m) => { id[m.name] = m.id; });
let r = api({ op: 'login', memberId: id['橋本 侑青'], pin: adminPin });
api({ op: 'changePin', token: r.token, oldPin: adminPin, newPin: 'admin-pin-01' });
let A = api({ op: 'login', memberId: id['橋本 侑青'], pin: 'admin-pin-01' }).token;
// マネージャー
api({ op: 'saveMember', token: A, member: { id: id['マネ 花子'], perm: 'manager' } });
const mt = api({ op: 'resetPin', token: A, id: id['マネ 花子'] });
const ml = api({ op: 'login', memberId: id['マネ 花子'], pin: mt.tempPin });
api({ op: 'changePin', token: ml.token, oldPin: mt.tempPin, newPin: 'manager-pin-1' });
let MG = api({ op: 'login', memberId: id['マネ 花子'], pin: 'manager-pin-1' }).token;
if (process.env.DBG) console.log('MG', JSON.stringify(api({ op: 'state', token: MG }).me));

section('本番（setlog なし）は今までどおり');
ok(api({ op: 'state' }).members && !api({ op: 'state' }).needLogin, 'ログインしなくても見られる');
ok(api({ op: 'register', memberId: id['森 健太'], pin: 'mori-pin-1' }).error === 'forbidden', '部員の登録はできない');
ok(api({ op: 'login', memberId: id['森 健太'], pin: 'x' }).error === 'login_failed', '一般部員はログインできない');

section('テスト環境にする');
gas.run('withReq', (f) => f.setupTestEnv());
ok(gas.props.getProperty('ENV') === 'test' && gas.props.getProperty('SETLOG') === '1', 'ENV=test・SETLOG=1');
ok(api({ op: 'state', token: A }).needLogin, 'テスト環境にすると、ログインはいったん全部切れる');
A = api({ op: 'login', memberId: id['橋本 侑青'], pin: 'admin-pin-01' }).token;
MG = api({ op: 'login', memberId: id['マネ 花子'], pin: 'manager-pin-1' }).token;
ok(A && MG, 'スタッフは今までの暗証番号でログインできる');

section('ログインしていない人');
st = api({ op: 'state' });
ok(st.needLogin && !st.members && !st.records && st.people.length >= 5 && st.people.every((p) => 'reg' in p && !('pinHash' in p)), 'ログインの画面に出す名前の一覧だけ（記録などは出さない）');
ok(st.people.find((p) => p.id === id['橋本 侑青']).staff && st.people.find((p) => p.id === id['橋本 侑青']).reg, 'スタッフ・登録済みがわかる');
ok(api({ op: 'memberHistory', memberId: id['森 健太'] }).error === 'auth', 'ほかの読み取りもログインが必要');
ok(api({ op: 'stamp', target: id['森 健太'], event: 'g:2026-11-16', kind: 'clap', device: 'aaaaaaaaaaaaaaaa' }).error === 'auth', '応援もログインが必要');

section('部員が自分で登録');
r = api({ op: 'register', memberId: id['森 健太'], pin: '12345', deviceName: 'Android' });
ok(r.error === 'bad_pin', '暗証番号は6文字以上');
r = api({ op: 'register', memberId: id['森 健太'], pin: 'mori-pin-1', deviceName: 'Android' });
ok(r.ok && r.token && r.me.perm === 'member', '名前を選んで暗証番号を決めると、そのままログインする');
const MORI = r.token;
ok(api({ op: 'register', memberId: id['森 健太'], pin: 'other-pin-1' }).error === 'already', '登録済みの名前は登録できない（なりすまし防止）');
ok(api({ op: 'register', memberId: id['マネ 花子'], pin: 'other-pin-1' }).error === 'staff', 'スタッフは自分で登録できない');
ok(gas.sheet('操作履歴').data.some((row) => row.join('|').includes('部員の登録')), '登録は操作履歴に残る');
st = api({ op: 'state', token: MORI });
ok(st.me && st.me.perm === 'member' && st.members && st.records && st.clipCode >= 10 && st.clipCode <= 99 && Array.isArray(st.clips), 'ログインした部員は全部見られる（今日の数字・動画の一覧つき）');
ok(api({ op: 'saveRecords', token: MORI, date: '2026-11-17', items: [{ memberId: id['森 健太'], done: true }] }).error === 'forbidden', '部員は記録画面からは記録できない');
const ISHI = api({ op: 'register', memberId: id['石川 大地'], pin: 'ishi-pin-1' }).token;
ok(api({ op: 'login', memberId: id['森 健太'], pin: 'mori-pin-1' }).ok, '登録した暗証番号でほかの端末からもログインできる');

section('開くたびにログインの期限をのばす');
const ses = () => gas.sheet('ログイン').data.slice(1).filter((row) => row[1] === id['森 健太']).map((row) => row[4]);
const exp0 = ses()[0];
gas.shiftDays(100);
api({ op: 'state', token: MORI });
const exp1 = ses()[0];
ok(exp1 > exp0 && exp1.slice(0, 10) === L.addDays(gas.run('today_'), 180), '100日後に開くと、そこから180日にのびる（' + exp0.slice(0, 10) + ' → ' + exp1.slice(0, 10) + '）');
gas.shiftDays(170);
ok(api({ op: 'state', token: MORI }).me, '170日あいても、のびているのでログインしたまま');
gas.shiftDays(181);
ok(!api({ op: 'state', token: MORI }).me, '181日あくと切れる');
gas.shiftDays(-451);
const MORI2 = api({ op: 'login', memberId: id['森 健太'], pin: 'mori-pin-1' }).token;

section('管理者：登録を消す（なりすましのとき）');
const kon = api({ op: 'register', memberId: id['小川 陽向'], pin: 'fake-pin-1' }).token;
ok(api({ op: 'unregister', token: MG, memberId: id['小川 陽向'] }).error === 'forbidden', '登録を消せるのは管理者だけ');
ok(api({ op: 'unregister', token: A, memberId: id['小川 陽向'] }).ok, '管理者が登録を消せる');
ok(!api({ op: 'state', token: kon }).me, '消すとその人のログインは切れる');
ok(api({ op: 'register', memberId: id['小川 陽向'], pin: 'real-pin-1' }).ok, '本人がもう一度登録できる');

section('見るだけの人');
r = api({ op: 'guestSave', token: A, name: '山田 監督', note: '監督' });
ok(r.ok && /^G\d{3}$/.test(r.guest.id) && /^\d{6}$/.test(r.tempPin), '管理者が作ると仮の暗証番号が出る');
const gid = r.guest.id;
ok(api({ op: 'state' }).guests.some((g) => g.id === gid), 'ログインの画面の一覧に出る');
r = api({ op: 'login', memberId: gid, pin: r.tempPin });
ok(r.ok && r.me.perm === 'guest' && r.me.mustChange, '仮の暗証番号でログインすると、まず変更を求める');
const gtmp = r.token;
ok(api({ op: 'changePin', token: gtmp, oldPin: 'x', newPin: 'guest-pin-1' }).error === 'login_failed', '今の暗証番号が違うと変えられない');
const gpin = api({ op: 'guestSave', token: A, id: gid, name: '山田 監督', note: '監督', reissue: true }).tempPin;
const G0 = api({ op: 'login', memberId: gid, pin: gpin }).token;
ok(api({ op: 'changePin', token: G0, oldPin: gpin, newPin: 'guest-pin-1' }).ok, '暗証番号を変えられる');
const G = api({ op: 'login', memberId: gid, pin: 'guest-pin-1' }).token;
st = api({ op: 'state', token: G });
ok(st.me && st.me.perm === 'guest' && st.members && st.records, '見るだけの人も全部見られる');
ok(api({ op: 'clipFlag', token: G, id: 'x', on: true }).error === 'forbidden', '見るだけの人は「気になる」を押せない');

section('動画を出す → 自動で「実施した」');
const today = gas.run('today_');
const code = gas.run('withReq', (f) => f.clipCode_(today));
const vid = Buffer.from('fake-video-' + 'x'.repeat(2000)).toString('base64');
const thumb = Buffer.from('fake-jpeg').toString('base64');
const jst = (minAgo) => new Date(Date.now() + gas.clock.offset + 9 * 3600000 - minAgo * 60000).toISOString().replace('T', ' ').slice(0, 19);
const at = jst(5);
r = api({ op: 'clipUpload', token: MORI2, mime: 'video/mp4', data: vid, thumb, recordedAt: at, code: code + 1 });
ok(r.error === 'bad_code', '今日の数字が違うと受け取らない（アプリの中のカメラで撮ったものだけ）');
r = api({ op: 'clipUpload', token: MORI2, mime: 'video/mp4', data: vid, thumb, recordedAt: L.addDays(today, -2) + ' 18:40:00', code: gas.run('withReq', (f) => f.clipCode_(L.addDays(today, -2))) });
ok(r.error === 'too_late', '撮ってから24時間以上たったものは受け取らない');
r = api({ op: 'clipUpload', token: MORI2, mime: 'image/gif', data: vid, thumb, recordedAt: at, code });
ok(r.error === 'bad_type', '動画以外は受け取らない');
r = api({ op: 'clipUpload', token: MG, mime: 'video/mp4', data: vid, thumb, recordedAt: at, code });
ok(r.error === 'not_player', '選手以外（マネージャー）は出せない');
r = api({ op: 'clipUpload', token: MORI2, mime: 'video/mp4', data: vid, thumb, recordedAt: at, code });
ok(r.ok && r.clip.st === 'ok' && r.recorded && r.records.some((x) => x[0] === id['森 健太'] && x[1] === today && x[2] === 1), '出すと、撮った日が自動で「実施した」になる');
const clip1 = r.clip.id;
ok(Object.keys(gas.drive.files).length === 1 && gas.drive.folders[gas.props.getProperty('CLIP_FOLDER')].name.includes('テスト'), '動画はドライブの「テスト」のフォルダに入る');
r = api({ op: 'clipUpload', token: MORI2, mime: 'video/mp4', data: vid, thumb, recordedAt: at, code });
ok(r.ok && r.again && r.clip.id === clip1 && Object.keys(gas.drive.files).length === 1, '同じ動画を送り直しても二重にならない');
st = api({ op: 'state', token: ISHI });
ok(st.clips.some((c) => c.id === clip1 && c.m === id['森 健太'] && c.nf === undefined), 'ほかの部員の一覧に出る（「気になる」の数はスタッフだけ）');
r = api({ op: 'clips', token: ISHI });
ok(r.ok && r.clips[0].id === clip1 && r.clips[0].th === thumb, '一覧はサムネイルつき');
r = api({ op: 'clipVideo', token: G, id: clip1 });
ok(r.ok && r.mime === 'video/mp4' && r.data === vid, '動画を見られる（見るだけの人も）');

section('気になる → スタッフの確認');
ok(api({ op: 'clipFlag', token: MORI2, id: clip1, on: true }).error === 'own', '自分の動画には押せない');
r = api({ op: 'clipFlag', token: ISHI, id: clip1, on: true });
ok(r.ok && r.clip.mine, '部員が「気になる」を押せる');
st = api({ op: 'state', token: MG });
ok(st.clipQueue === 1 && st.clips.find((c) => c.id === clip1).nf === 1, 'スタッフには確認が要る数と「気になる」の数が出る');
ok(api({ op: 'clips', token: MG, queue: true }).clips.length === 1, '確認待ちの一覧');
ok(api({ op: 'clipCancel', token: ISHI, id: clip1 }).error === 'forbidden', '部員は取り消せない');
r = api({ op: 'clipCancel', token: MG, id: clip1, reason: 'ジムではない' });
ok(r.ok && r.removed && !r.records.some((x) => x[0] === id['森 健太']), 'マネージャーが取り消すと、その日の「実施した」が外れる（自分で入れた記録でなくても）');
ok(gas.sheet('取り消した記録') && gas.sheet('取り消した記録').data.length >= 2, '外した記録はゴミ箱（取り消した記録）に入る');
ok(!api({ op: 'state', token: ISHI }).clips.some((c) => c.id === clip1), '取り消した動画は、ほかの部員には見えない');
ok(api({ op: 'state', token: MORI2 }).clips.find((c) => c.id === clip1).why === 'ジムではない', '本人には理由が見える');

section('取り消された日に撮り直すと確認待ち');
const at2 = jst(2);
r = api({ op: 'clipUpload', token: MORI2, mime: 'video/mp4', data: vid, thumb, recordedAt: at2, code });
ok(r.ok && r.pending && r.clip.st === 'pending' && !r.records.some((x) => x[0] === id['森 健太']), '撮り直しは確認待ち（まだ「実施した」にならない）');
ok(api({ op: 'state', token: MG }).clipQueue === 1, 'スタッフの確認待ちに出る');
r = api({ op: 'clipApprove', token: MG, id: r.clip.id });
ok(r.ok && r.recorded && r.records.some((x) => x[0] === id['森 健太'] && x[2] === 1), 'スタッフが確認すると「実施した」になる');
ok(api({ op: 'state', token: MG }).clipQueue === 0, '確認待ちがなくなる');

section('1か月で消える');
gas.shiftDays(31);
gas.run('withReq', (f) => f.purgeClips_());
ok(Object.values(gas.drive.files).every((f) => f.trashed), 'ドライブの動画はゴミ箱へ');
ok(api({ op: 'clipVideo', token: G, id: clip1 }).error, '消えた動画は見られない');
ok(gas.sheet('動画のサムネイル').data.length === 1, 'サムネイルも消える');
gas.shiftDays(-31);

section('テスト環境の守り');
ok(api({ op: 'saveMember', token: A, member: { id: id['森 健太'], name: '森 健太', grade: '2年' } }).error === 'test_env', 'テスト環境からは会計アプリの名簿を書き換えられない');
ok(gas.run('withReq', (f) => f.weeklyBackup_()) === null, 'テスト環境ではバックアップを取らない');

console.log('\n==============================');
console.log('合格 ' + pass + ' / 不合格 ' + fail);
if (fail) { console.log('不合格：\n- ' + failed.join('\n- ')); process.exit(1); }

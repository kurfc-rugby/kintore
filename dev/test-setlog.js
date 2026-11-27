// setlog（v3・テスト環境）の自動テスト：node dev/test-setlog.js
// 部員全員のログイン・自分で登録・見るだけの人・動画（撮る→自動で実施した→審議→取り消し→撮り直しは確認待ち→3か月で消える）
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
// シートのキャッシュの確かめ：state を読むたびに、キャッシュを使わずにもう一度読んで、同じになるかを見る
const api0 = gas.api;
let tcChecks = 0;
const tcBad = [];
const tcStrip = (s) => JSON.stringify(s, (k, v) => (k === '_t' ? undefined : v));
const NO_AFTER_T = { ping: 1, state: 1, login: 1, logout: 1, register: 1, viewLogin: 1, changePin: 1, clipStart: 1, clipDraft: 1, clipDraftDrop: 1, clipUpload: 1, clipVideo: 1, clips: 1, clipThumbs: 1, icons: 1, logs: 1, sessions: 1, trash: 1, feedbackList: 1, memberHistory: 1, menuArchive: 1, pushInbox: 1, pushMove: 1, clientError: 1 };
let afChecks = 0;
const afBad = [];
const api = (req) => {
  // 書く操作には「書いたあとの最新の情報」も頼み、別に読み直したものと同じかを確かめる（返事からは外して、ほかのテストに影響させない）
  if (req && req.token && !NO_AFTER_T[req.op] && !req.after && !process.env.NOTC) {
    const r = api0(Object.assign({}, req, { after: {} }));
    if (r && r.ok !== false && r._state) {
      const s = r._state; delete r._state;
      const all = gas.cache._all;
      Object.keys(all).forEach((k) => { if (k.indexOf('t:') === 0 || k.indexOf('st:') === 0) delete all[k]; });
      const s2 = api0({ op: 'state', token: req.token, device: req.device });
      afChecks++;
      if (tcStrip(s) !== tcStrip(s2)) {
        const a = JSON.parse(tcStrip(s)), b = JSON.parse(tcStrip(s2));
        afBad.push(req.op + ':' + Object.keys(Object.assign({}, a, b)).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).join(','));
      }
    } else if (r && r.ok !== false && !r._state) afBad.push(req.op + ':なし');
    return r;
  }
  const r = api0(req);
  if (req && req.op === 'state' && r && r.ok && !process.env.NOTC) {
    const all = gas.cache._all;
    Object.keys(all).forEach((k) => { if (k.indexOf('t:') === 0 || k.indexOf('st:') === 0) delete all[k]; });
    const r2 = api0(req);
    tcChecks++;
    if (tcStrip(r) !== tcStrip(r2)) {
      const a = JSON.parse(tcStrip(r)), b = JSON.parse(tcStrip(r2));
      tcBad.push(Object.keys(Object.assign({}, a, b)).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).join(','));
    }
  }
  return r;
};
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
ok(A && MG, '幹部は今までの暗証番号でログインできる');

section('ログインしていない人');
st = api({ op: 'state' });
ok(st.needLogin && !st.members && !st.records && st.people.length >= 5 && st.people.every((p) => 'reg' in p && !('pinHash' in p)), 'ログインの画面に出す名前の一覧だけ（記録などは出さない）');
ok(st.people.find((p) => p.id === id['橋本 侑青']).staff && st.people.find((p) => p.id === id['橋本 侑青']).reg, '幹部・登録済みがわかる');
ok(api({ op: 'memberHistory', memberId: id['森 健太'] }).error === 'auth', 'ほかの読み取りもログインが必要');
ok(api({ op: 'stamp', target: id['森 健太'], event: 'g:2026-11-16', kind: 'clap', device: 'aaaaaaaaaaaaaaaa' }).error === 'auth', '応援もログインが必要');

section('部員が自分で登録');
r = api({ op: 'register', memberId: id['森 健太'], pin: '12345', deviceName: 'Android' });
ok(r.error === 'bad_pin', '暗証番号は6文字以上');
r = api({ op: 'register', memberId: id['森 健太'], pin: 'mori-pin-1', deviceName: 'Android' });
ok(r.ok && r.token && r.me.perm === 'member', '名前を選んで暗証番号を決めると、そのままログインする');
const MORI = r.token;
ok(api({ op: 'register', memberId: id['森 健太'], pin: 'other-pin-1' }).error === 'already', '登録済みの名前は登録できない（なりすまし防止）');
ok(api({ op: 'register', memberId: id['マネ 花子'], pin: 'other-pin-1' }).error === 'already', '登録済みの幹部の名前も登録できない');
{ // マネージャー・主将・副主将も、選手と同じく自分で暗証番号を決めて登録する。管理者だけは発行
  api({ op: 'saveMember', token: A, member: { id: id['前田 剛'], perm: 'admin' } });
  ok(api({ op: 'register', memberId: id['前田 剛'], pin: 'maeda-pin-1' }).error === 'staff', '管理者は自分で登録できない（ほかの管理者が暗証番号を出す）');
  const lg = api({ op: 'state' }).people.find((x) => x.id === id['前田 剛']);
  ok(lg && lg.admin === true && lg.staff === true, 'ログインの画面に、管理者かどうかが出る');
  const bp = api({ op: 'bulkPerms', token: A, rows: [{ id: id['前田 剛'], perm: 'manager' }] });
  ok(bp.ok && bp.pins.length === 0, '役職をマネージャーにしても、暗証番号は発行しない（本人が登録する）');
  const rg = api({ op: 'register', memberId: id['前田 剛'], pin: 'maeda-pin-1', deviceName: 'Android' });
  ok(rg.ok && rg.token && rg.me.perm === 'manager', 'マネージャーも名前を選んで暗証番号を決めると、そのままログインする');
  ok(gas.sheet('操作履歴').data.some((row) => row.join('|').includes('部員の登録') && row.join('|').includes('前田 剛')), '幹部の登録も操作履歴に残る');
  ok(api({ op: 'state', token: A }).regs[id['前田 剛']] === 1, '管理者の「部員の登録」に幹部も出る');
  ok(api({ op: 'unregister', token: A, memberId: id['前田 剛'] }).ok, '管理者は幹部の登録も消せる（なりすましのとき）');
  ok(api({ op: 'state', token: rg.token }).needLogin === true || api({ op: 'state', token: rg.token }).me == null, '登録を消すと、その端末はログアウトになる');
  ok(api({ op: 'register', memberId: id['前田 剛'], pin: 'maeda-pin-2' }).ok, '本人がもう一度登録できる');
  api({ op: 'bulkPerms', token: A, rows: [{ id: id['前田 剛'], perm: 'member' }] });
  const back = api({ op: 'login', memberId: id['前田 剛'], pin: 'maeda-pin-2' });
  ok(back.ok && back.me.perm === 'member', '役職を一般部員に戻しても、自分で決めた暗証番号はそのまま（ログインし直すだけ）');
  ok(api({ op: 'unregister', token: A, memberId: id['橋本 侑青'] }).error === 'staff', '管理者の登録は消せない（暗証番号の発行で出し直す）');
}
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
ok(api({ op: 'clipFlag', token: G, id: 'x', on: true }).error === 'forbidden', '見るだけの人は「審議」を押せない');
{ // 応援の「送った人」は、ログインした本人だけ（端末に残っていた名前や、ほかの人の名前を名乗れない）
  const tg = id['森 健太'], ev = 'g:2026-11-02';
  let rs = api({ op: 'stamp', token: G, target: tg, event: ev, kind: 'clap', device: 'a0a0a0a0a0a0a0a0', from: id['石川 大地'] });
  ok(rs.ok && !(rs.stamp.f || []).some((x) => x === id['石川 大地'] || (x && x.id === id['石川 大地'])), '見るだけの人の応援は、名前なし（選手の名前を名乗れない）');
  rs = api({ op: 'stamp', token: MG, target: tg, event: ev, kind: 'fire', device: 'b1b1b1b1b1b1b1b1', from: id['石川 大地'] });
  ok(rs.ok && JSON.stringify(rs.stamp.f || []).indexOf(id['マネ 花子']) >= 0 && JSON.stringify(rs.stamp.f || []).indexOf(id['石川 大地']) < 0, 'ログインした人の応援は、その人の名前（ほかの人を名乗れない）');
}

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
ok(st.clips.some((c) => c.id === clip1 && c.m === id['森 健太'] && c.nf === undefined), 'ほかの部員の一覧に出る（「審議」の数は幹部だけ）');
r = api({ op: 'clips', token: ISHI });
ok(r.ok && r.clips[0].id === clip1 && r.clips[0].th === thumb, '一覧はサムネイルつき');
{ // 一覧だけすぐ返す（nothumb）。サムネイルは clipThumbs で、見られるものの分だけ
  const r2 = api({ op: 'clips', token: MG, nothumb: true });
  ok(r2.ok && r2.clips.length === r.clips.length && r2.clips.every((c) => c.th === undefined), 'nothumb のときは一覧だけ（サムネイルなし）');
  const t = api({ op: 'clipThumbs', token: MG, ids: [clip1, 'nope'] });
  ok(t.ok && t.th[clip1] === thumb && t.th.nope === '', 'clipThumbs で、指定した動画のサムネイルだけ取れる（無いものは空）');
  ok(api({ op: 'clipThumbs', ids: [clip1] }).error, 'ログインしていないと、サムネイルは取れない');
}
r = api({ op: 'clipVideo', token: G, id: clip1 });
ok(r.ok && r.mime === 'video/mp4' && r.data === vid, '動画を見られる（見るだけの人も）');

section('審議 → 幹部の確認');
const MEP = 'https://fcm.googleapis.com/fcm/send/manager-device:APA91b-test', PEP = 'https://fcm.googleapis.com/fcm/send/player-device:APA91b-test';
r = api({ op: 'pushRegister', token: MG, sub: { endpoint: MEP }, memberId: '', kinds: ['clipq', 'goal'] });
ok(r.ok && r.push.kinds.join() === 'clipq', 'マネージャーは「動画の確認」の通知を受け取れる（選手でないので「今週あと○回」は無し）');
r = api({ op: 'pushRegister', token: ISHI, sub: { endpoint: PEP }, memberId: id['石川 大地'], kinds: ['clipq', 'goal'] });
ok(r.ok && r.push.kinds.join() === 'goal', '選手は「動画の確認」を受け取れない');
ok(api({ op: 'clipFlag', token: MORI2, id: clip1, on: true }).error === 'own', '自分の動画には押せない');
gas.push.sent.length = 0;
r = api({ op: 'clipFlag', token: ISHI, id: clip1, on: true });
ok(r.ok && r.clip.mine, '部員が「審議」を押せる');
ok(gas.push.sent.length === 1 && gas.push.sent[0].url === MEP && /審議/.test(api({ op: 'pushInbox', endpoint: MEP }).messages[0].title), '「審議」がつくと、マネージャー（動画の確認をオン）に通知が届く');
st = api({ op: 'state', token: MG });
ok(st.clipQueue === 1 && st.clips.find((c) => c.id === clip1).nf === 1, '幹部には確認が要る数と「審議」の数が出る');
ok(api({ op: 'clips', token: MG, queue: true }).clips.length === 1, '確認待ちの一覧');
{ const own = api({ op: 'state', token: MORI2 }).clips.find((c) => c.id === clip1); ok(own && own.nf === undefined && !own.mine && !gas.push.sent.some((x) => x.url === PEP), '審議は、動画を出した本人には伝わらない（数も通知も無い）'); }
ok(api({ op: 'clipCancel', token: ISHI, id: clip1 }).error === 'forbidden', '部員は取り消せない');
r = api({ op: 'clipCancel', token: MG, id: clip1, reason: 'ジムではない' });
ok(r.ok && r.removed && !r.records.some((x) => x[0] === id['森 健太']), 'マネージャーが取り消すと、その日の「実施した」が外れる（自分で入れた記録でなくても）');
ok(gas.sheet('取り消した記録') && gas.sheet('取り消した記録').data.length >= 2, '外した記録はゴミ箱（取り消した記録）に入る');
ok(!api({ op: 'state', token: ISHI }).clips.some((c) => c.id === clip1), '取り消した動画は、ほかの部員には見えない');
ok(api({ op: 'state', token: MORI2 }).clips.find((c) => c.id === clip1).why === 'ジムではない', '本人には理由が見える');

section('取り消された日に撮り直すと確認待ち');
const at2 = jst(2);
gas.push.sent.length = 0;
r = api({ op: 'clipUpload', token: MORI2, mime: 'video/mp4', data: vid, thumb, recordedAt: at2, code });
ok(r.ok && r.pending && r.clip.st === 'pending' && !r.records.some((x) => x[0] === id['森 健太']), '撮り直しは確認待ち（まだ「実施した」にならない）');
ok(gas.push.sent.length === 1 && gas.push.sent[0].url === MEP && /確認待ち/.test(api({ op: 'pushInbox', endpoint: MEP }).messages[0].title), '確認待ちの動画が届くと、幹部に通知が届く');
ok(api({ op: 'state', token: MG }).clipQueue === 1, '幹部の確認待ちに出る');
r = api({ op: 'clipApprove', token: MG, id: r.clip.id });
ok(r.ok && r.recorded && r.records.some((x) => x[0] === id['森 健太'] && x[2] === 1), '幹部が確認すると「実施した」になる');
ok(api({ op: 'state', token: MG }).clipQueue === 0, '確認待ちがなくなる');
ok(api({ op: 'saveRecords', token: A, date: r.clip.d, items: [{ memberId: id['森 健太'], done: false }] }).rejected[0].reason === 'from_video', '確認してついた「実施した」も動画の記録（記録の画面では外れない）');

section('動画でついた「実施した」は、記録の画面から外さない（動画を取り消して外す）');
{
  const IS = id['石川 大地'];
  const st0 = api({ op: 'state', token: MG });
  const cl = st0.clips.find((c) => c.st === 'ok' && !c.gone && st0.records.some((x) => x[0] === c.m && x[1] === c.d && x[2] === 1));
  const vd = cl && st0.records.find((x) => x[0] === cl.m && x[1] === cl.d);
  ok(!!vd, '動画でついた「実施した」がある（動画が取り消されていない・消えていない）');
  if (vd) {
    const VM = vd[0];
    let r = api({ op: 'saveRecords', token: MG, date: vd[1], items: [{ memberId: VM, done: false }] });
    ok(r.ok && r.rejected.length === 1 && r.rejected[0].reason === 'from_video', 'マネージャーが記録の画面で外そうとしても、外れない（動画から取り消すよう案内）');
    r = api({ op: 'saveRecords', token: A, date: vd[1], items: [{ memberId: VM, done: false }] });
    ok(r.ok && r.rejected.length === 1 && r.rejected[0].reason === 'from_video', '管理者でも記録の画面からは外れない');
    ok(api({ op: 'deleteRecord', token: A, date: vd[1], memberId: VM }).error === 'from_video', '管理者の「取り消す」（記録の削除）でも外れない');
    ok(api({ op: 'state', token: MG }).records.some((x) => x[0] === VM && x[1] === vd[1] && x[2] === 1), '「実施した」はそのまま');
  }
  // 動画のない日の記録は、これまでどおり記録の画面で外せる
  const MO = id['森 健太'], dx = st0.clips.filter((c) => c.m === MO).map((c) => c.d);
  const free = [3, 4, 5, 6].map((k) => jst(k * 1440).slice(0, 10)).find((d) => dx.indexOf(d) < 0);
  r = api({ op: 'saveRecords', token: MG, date: free, items: [{ memberId: MO, done: true }] });
  ok(r.ok && r.saved === 1, '動画を送れなかった日は、マネージャーが「実施した」をつけられる');
  r = api({ op: 'saveRecords', token: MG, date: free, items: [{ memberId: MO, done: false }] });
  ok(r.ok && r.removed === 1 && !r.rejected.length, 'その記録（動画なし）は、記録の画面で外せる');
  ok(api({ op: 'resetPin', token: A, id: IS }).message.indexOf('登録を消す') >= 0, '選手の暗証番号の発行は、「登録を消す」を案内する');
}

section('2段階：先に「実施した」、動画はあとから');
const at3 = jst(1);
const IS = id['石川 大地'];
// 「みんなの動画」：だれかが出すたびに通知（オンにした人だけ・自分の動画は来ない）
const NEP = 'https://fcm.googleapis.com/fcm/send/mori-device:APA91b-test', N2EP = 'https://fcm.googleapis.com/fcm/send/mg-new:APA91b-test', N3EP = 'https://fcm.googleapis.com/fcm/send/ishi-new:APA91b-test';
r = api({ op: 'pushRegister', token: MORI2, sub: { endpoint: NEP }, memberId: id['森 健太'], kinds: ['clipnew', 'goal'] });
ok(r.ok && r.push.kinds.join() === 'clipnew,goal', '選手は「みんなの動画」を受け取れる');
r = api({ op: 'pushRegister', token: MG, sub: { endpoint: N2EP }, memberId: '', kinds: ['clipnew'] });
ok(r.ok && r.push.kinds.join() === 'clipnew', 'マネージャー（選手でない）も「みんなの動画」を受け取れる');
ok(api({ op: 'pushRegister', token: ISHI, sub: { endpoint: N3EP }, memberId: IS, kinds: ['clipnew'] }).ok, '出す本人もオンにしている');
ok(api({ op: 'pushRegister', sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/anon:APA91b' }, memberId: '', kinds: ['clipnew'] }).error === 'auth', 'ログインしていなければ登録できない');
gas.push.sent.length = 0;
r = api({ op: 'clipStart', token: ISHI, mime: 'video/mp4', thumb, recordedAt: at3, code });
ok(r.ok && r.queued && r.recorded && r.clip.nv === 1 && r.clip.st === 'ok', 'まず小さいデータ（時刻・今日の数字・サムネイル）だけで「実施した」と返事（すぐ）');
const c3 = r.clip.id;
{
  const to = gas.push.sent.map((x) => x.url).sort();
  ok(to.length === 2 && to.join() === [N2EP, NEP].sort().join(), '「送る」と同時に、オンにした人へ通知（出した本人の端末には来ない）：' + to.length + '件');
}
const sentAt3 = gas.push.sent.slice();
gas.push.sent.length = 0;
ok(!gas.sheet('動画').data.some((row) => row.indexOf(at3) >= 0) && Object.keys(gas.props._all).some((k) => k === 'CS:' + IS + '|' + at3), '「送る」はメモに書くだけ（シートの書き込みと順番待ちをしない）');
{
  const m0 = api({ op: 'pushInbox', endpoint: N2EP }).messages || [];
  ok(m0.length === 1 && /石川 大地/.test(m0[0].title), '通知の中身を取りに来たら、すぐ返す');
  ok(Object.keys(gas.props._all).some((k) => k === 'CS:' + IS + '|' + at3), '中身を取りに来ただけでは「送る」のメモをシートに書かない（待たせない）');
}
ok(api({ op: 'clipStart', token: ISHI, mime: 'video/mp4', thumb, recordedAt: at3, code }).clip.id === c3, 'シートに書く前に送り直しても、同じ動画のまま');
{
  const m = api({ op: 'pushInbox', endpoint: NEP }).messages[0] || {};
  ok(/石川 大地 さんが動画を出しました/.test(m.title) && m.url === './#clips' && m.tag === 'clipnew-' + c3, '通知の中身：だれが出したか・押すと今日の動画（' + m.title + '）');
  ok(m.title === '🎥 石川 大地 さんが動画を出しました', 'アイコンを決めていない人の通知の頭は、通知の種類の絵文字（' + m.title + '）');
  const si = api({ op: 'setIcon', token: ISHI, kind: 'e', emoji: '🦁', color: '#1f3a68' });
  ok(si.ok && gas.run('withReq', (f) => f.pushEmoji_(IS, '🎥')) === '🦁' && gas.run('withReq', (f) => f.withEmoji_(f.pushEmoji_(IS, '🎥'), 'x')) === '🦁 x', '絵文字のアイコンの人の通知の頭は、その人の絵文字');
  ok(gas.run('withReq', (f) => f.pushEmoji_(id['森 健太'], '🎥')) === '🎥' && gas.run('withReq', (f) => f.pushEmoji_('', '⏰')) === '⏰', '写真・アイコンなし・人に関係ない通知は、種類の絵文字');
  api({ op: 'setIcon', token: ISHI, kind: '' });
  ok(!api({ op: 'pushInbox', endpoint: N3EP }).messages.length, '本人の端末の受け取り箱は空');
  ok(!gas.push.sent.length, 'シートに書く前の送り直しでは、通知はもう来ない');
}
st = api({ op: 'state', token: MORI2 });
ok(st.records.some((x) => x[0] === IS && x[1] === today && x[2] === 1) && st.clips.some((c) => c.id === c3), '次にだれかが使うと、先にシートに書く（ほかの人にも「実施した」と動画が見える）');
ok(!Object.keys(gas.props._all).some((k) => k.indexOf('CS:') === 0 || k.indexOf('CT:') === 0), 'シートに書いたらメモは消える');
{ const sh = gas.sheet('動画のサムネイル'); ok(sh.data.some((row) => row[0] === c3 && row[1] === thumb), 'サムネイルもシートに書かれる（メモに分けて置いておいた分）'); }
ok(api({ op: 'clipStart', token: ISHI, mime: 'video/mp4', thumb, recordedAt: at3, code }).again, '送り直しても二重にならない');
ok(!gas.push.sent.some((x) => x.url === NEP), '送り直しでは「みんなの動画」の通知はもう来ない');
ok(api({ op: 'clipStart', token: ISHI, mime: 'video/mp4', thumb, recordedAt: at3, code: code + 1 }).error === 'bad_code', '先に送るときも今日の数字を確かめる');
ok(api({ op: 'clipVideo', token: G, id: c3 }).error === 'not_yet', '動画が届くまでは「まだ届いていません」');
ok(api({ op: 'state', token: MORI2 }).clips.find((c) => c.id === c3).nv === 1, '一覧には「動画待ち」と分かる印がつく');
const nfiles = Object.keys(gas.drive.files).length;
r = api({ op: 'clipUpload', token: ISHI, mime: 'video/mp4', data: vid, thumb, recordedAt: at3, code });
ok(r.ok && r.attached && r.clip.id === c3 && r.clip.nv === 0 && Object.keys(gas.drive.files).length === nfiles + 1, 'あとから送った動画が同じ行につく（行は増えない）');
ok(api({ op: 'clipVideo', token: G, id: c3 }).data === vid, '届いたら見られる');
ok(api({ op: 'clipUpload', token: ISHI, mime: 'video/mp4', data: vid, thumb, recordedAt: at3, code }).again && Object.keys(gas.drive.files).length === nfiles + 1, '動画を送り直しても二重にならない');
ok(!gas.push.sent.some((x) => x.url === NEP), 'あとから動画がついても、通知は1回だけ');
ok(api({ op: 'pushRegister', token: ISHI, sub: { endpoint: N3EP }, memberId: IS, kinds: [] }).ok, '（本人の「みんなの動画」をオフに戻す）');

{ // 大きなサムネイル（9KBを超える）も、分けて置いておける
  const big = 'A'.repeat(30000), atb = jst(0.7);
  const rb = api({ op: 'clipStart', token: ISHI, mime: 'video/mp4', thumb: big, recordedAt: atb, code });
  api({ op: 'state', token: ISHI });
  ok(rb.ok && gas.sheet('動画のサムネイル').data.some((row) => row[0] === rb.clip.id && row[1] === big), '大きなサムネイル（30KB）も分けて置いて、そのままシートに書く');
  api({ op: 'clipUpload', token: ISHI, mime: 'video/mp4', data: vid, thumb: big, recordedAt: atb, code });
}

{ // メモがいっぱい（スクリプトのプロパティは全部で500KBまで。一斉に送られたとき）でも送れる：その1本はシートに直接書く
  api({ op: 'state', token: ISHI });
  const atf = jst(0.9), big = 'B'.repeat(20000);
  gas.props._quota = gas.props._size() + 4000;
  const rf = api({ op: 'clipStart', token: ISHI, mime: 'video/mp4', thumb: big, recordedAt: atf, code });
  gas.props._quota = 0;
  ok(rf.ok && rf.recorded && rf.clip && rf.clip.nv === 1 && gas.sheet('動画').data.some((row) => row.indexOf(atf) >= 0) && gas.sheet('動画のサムネイル').data.some((row) => row[0] === rf.clip.id && row[1] === big), 'メモがいっぱいでも「送る」は通る（その1本はシートに直接書く）');
  ok(!Object.keys(gas.props._all).some((k) => k.indexOf(IS + '|' + atf) >= 0), '途中まで書けたメモは残らない');
  const ru = api({ op: 'clipUpload', token: ISHI, mime: 'video/mp4', data: vid, thumb, recordedAt: atf, code });
  ok(ru.ok && ru.clip.id === rf.clip.id && ru.clip.nv === 0, 'あとから送った動画も、その行につく');
}

{ // 速さのため：下書きも「送る」も、動画のシート（一覧）を読まない
  api({ op: 'state', token: ISHI });
  const sh = gas.sheet('動画'), r0 = sh.reads || 0, atq = jst(0.65);
  const a1 = api({ op: 'clipDraft', token: ISHI, mime: 'video/mp4', data: vid, thumb, recordedAt: atq, code });
  const a2 = api({ op: 'clipStart', token: ISHI, mime: 'video/mp4', thumb, recordedAt: atq, code });
  ok(a1.saved && a2.queued && a2.clip.nv === 0 && (sh.reads || 0) === r0, '下書きも「送る」も、動画のシートを読まない（小さな索引を見る）');
  ok(api({ op: 'clipDraft', token: ISHI, mime: 'video/mp4', data: vid, thumb, recordedAt: atq, code }).again, '索引で、送り直しの下書きも二重にならない');
  api({ op: 'state', token: ISHI });
  ok(api({ op: 'clipDraft', token: ISHI, mime: 'video/mp4', data: vid, thumb, recordedAt: atq, code }).again && api({ op: 'clipStart', token: ISHI, mime: 'video/mp4', thumb, recordedAt: atq, code }).again, 'シートに書いたあとも（索引が作り直されて）二重にならない');
}

section('下書き：撮ってすぐ送っておく（「送る」の前）');
const MO = id['森 健太'];
const nf0 = Object.keys(gas.drive.files).length;
const at5 = jst(0.5);
r = api({ op: 'clipDraft', token: MORI2, mime: 'video/mp4', data: vid, thumb, recordedAt: at5, code });
ok(r.ok && r.saved && Object.keys(gas.drive.files).length === nf0 + 1, '下書きは動画をドライブに置いて、すぐ返事（シートには書かない＝順番待ちしない）');
const pendKeys = () => Object.keys(gas.props._all).filter((k) => k.indexOf('CP:') === 0);
ok(pendKeys().length === 1 && !gas.sheet('動画').data.some((row) => row.indexOf(at5) >= 0), '下書きの動画の場所はメモ（プロパティ）に書き、行はまだ作らない');
ok(!api({ op: 'state', token: ISHI }).clips.some((c) => c.at === at5) && !api({ op: 'state', token: MORI2 }).clips.some((c) => c.at === at5), '下書きはだれにも（本人にも）見えない');
ok(!api({ op: 'clips', token: MG }).clips.some((c) => c.at === at5), '下書きは一覧にも出ない');
ok(api({ op: 'clipDraft', token: MORI2, mime: 'video/mp4', data: vid, thumb, recordedAt: at5, code }).again && Object.keys(gas.drive.files).length === nf0 + 1, '下書きを送り直しても二重にならない');
r = api({ op: 'clipStart', token: MORI2, mime: 'video/mp4', thumb, recordedAt: at5, code });
ok(r.ok && !r.again && r.clip.nv === 0 && r.clip.st === 'pending', '「送る」で下書きが出る（動画はもう届いている。この日は取り消しがあったので確認待ち）');
ok(api({ op: 'state', token: ISHI }).clips.some((c) => c.at === at5), '出したら見える');
ok(api({ op: 'clipUpload', token: MORI2, mime: 'video/mp4', data: vid, thumb, recordedAt: at5, code }).again, '出したあと動画を送っても二重にならない');
const at6 = jst(0.4);
api({ op: 'clipDraft', token: MORI2, mime: 'video/mp4', data: vid, thumb, recordedAt: at6, code });
const trashed0 = Object.values(gas.drive.files).filter((f) => f.trashed).length;
r = api({ op: 'clipDraftDrop', token: MORI2, recordedAt: at6 });
ok(r.ok && !pendKeys().some((k) => k.indexOf(at6) >= 0) && !gas.sheet('動画').data.some((row) => row.indexOf(at6) >= 0), '撮り直すと下書きは消える（メモも行も残らない）');
ok(Object.values(gas.drive.files).filter((f) => f.trashed).length === trashed0 + 1, '撮り直した下書きの動画はドライブのゴミ箱へ');
ok(Object.values(gas.drive.files).filter((f) => f.trashed).length >= 1, '下書きの動画はドライブのゴミ箱へ');
ok(api({ op: 'clipDraftDrop', token: MORI2, recordedAt: at5 }).none, '出したものは「下書きを消す」で消えない');
const at7 = jst(0.3);
r = api({ op: 'clipStart', token: MORI2, mime: 'video/mp4', thumb, recordedAt: at7, code });
ok(r.ok && r.clip.nv === 1, '「送る」が下書きより先に着くと動画待ち');
r = api({ op: 'clipDraft', token: MORI2, mime: 'video/mp4', data: vid, thumb, recordedAt: at7, code });
ok(r.ok && r.saved, 'あとから着いた下書きも、すぐ返事（「送る」の書き込みを待たない）');
ok(api({ op: 'state', token: ISHI }).clips.find((c) => c.at === at7).nv === 0, 'シートの行につく前から、一覧では「動画あり」');
ok(api({ op: 'clipVideo', token: ISHI, id: api({ op: 'state', token: ISHI }).clips.find((c) => c.at === at7).id }).data === vid, 'シートの行につく前から、再生できる（メモを見る）');
gas.cache.remove('k:pend');
gas.run('withReq', (f) => f.attachPendingMaybe_());
{ const sh = gas.sheet('動画'), fi = sh.data[0].indexOf('ファイルID'); ok(sh.data.some((row) => row.indexOf(at7) >= 0 && row[fi]) && !pendKeys().some((k) => k.indexOf(at7) >= 0), 'あとでまとめて、シートの行に動画をつける（メモは消える）'); }
const at8 = jst(0.2);
api({ op: 'clipDraft', token: MORI2, mime: 'video/mp4', data: vid, thumb, recordedAt: at8, code });
gas.clock.offset += 61 * 60000;
gas.cache && gas.cache.removeAll && gas.cache.removeAll(['k:pend']);
gas.run('withReq', (f) => f.attachPendingMaybe_());
ok(!pendKeys().some((k) => k.indexOf(at8) >= 0) && !gas.sheet('動画').data.some((row) => row.indexOf(at8) >= 0), '出さないまま1時間たった下書きは、動画ごと消える');
gas.clock.offset -= 61 * 60000;

const at9 = jst(0.1);
api({ op: 'clipDraft', token: ISHI, mime: 'video/mp4', data: vid, thumb, recordedAt: at9, code });
r = api({ op: 'clipUpload', token: ISHI, mime: 'video/mp4', data: vid, thumb, recordedAt: at9, code });
ok(r.ok && r.clip.st === 'ok' && r.clip.nv === 0, '下書きのあとに動画を送ってきたら「出す」とみなす');

section('「送る」と下書きがほぼ同時に着いて、行が2つになったとき');
const atx = jst(0.05);
r = api({ op: 'clipStart', token: ISHI, mime: 'video/mp4', thumb, recordedAt: atx, code });
ok(r.ok && r.clip.nv === 1, '「送る」の行（動画待ち）');
api({ op: 'state', token: ISHI }); // シートに書く
{ // 本番で起きた形をそのまま作る：同じ撮影時刻の下書きの行（動画あり）がもう1つある
  const sh = gas.sheet('動画'), head = sh.data[0], row = head.map(() => '');
  const set = (name, v) => { row[head.indexOf(name)] = v; };
  const fid = Object.keys(gas.drive.files)[0];
  set('動画ID', 'Cdupdraft0001'); set('部員ID', IS); set('日付', atx.slice(0, 10)); set('撮影日時', atx); set('送信日時', atx); set('ファイルID', fid);
  set('形式', 'video/mp4'); set('大きさ', '100'); set('今日の数字', String(code)); set('状態', '下書き'); set('気になる（部員ID）', '[]');
  sh.data.push(row);
  gas.cache.remove('k:clipidx'); // シートを直接さわったので、索引を作り直させる（アプリ経由なら自動で作り直す）
  gas.run('onEdit', { range: { getSheet: () => ({ getName: () => '動画' }) } }); // 手で直したときと同じ（シートのキャッシュを忘れさせる）
}
const rowsOf = () => gas.sheet('動画').data.filter((x) => x.indexOf(atx) >= 0 && x.indexOf(IS) >= 0);
ok(rowsOf().length === 2, '（行が2つある状態）');
r = api({ op: 'clipStart', token: ISHI, mime: 'video/mp4', thumb, recordedAt: atx, code });
ok(r.ok && r.clip.nv === 0, '確かめ直しの「送る」で、下書きの動画を出した行にまとめる（動画が届いた扱い）');
ok(rowsOf().length === 1, '下書きの行は消えて、1つになる');
ok(api({ op: 'clipUpload', token: ISHI, mime: 'video/mp4', data: vid, thumb, recordedAt: atx, code }).again, 'そのあと動画が来ても二重にならない');

section('ログインを覚えておく（速くするため）');
const L1 = api({ op: 'login', memberId: MO, pin: 'mori-pin-1' }).token;
ok(api({ op: 'state', token: L1 }).me && api({ op: 'state', token: L1 }).me.id === MO, '覚えたログインで使える');
api({ op: 'logout', token: L1 });
ok(!api({ op: 'state', token: L1 }).me, 'ログアウトしたら、覚えていても使えない（すぐ効く）');
const L2 = api({ op: 'login', memberId: MO, pin: 'mori-pin-1' }).token;
api({ op: 'state', token: L2 });
api({ op: 'unregister', token: A, id: id['小川 陽向'] });
ok(api({ op: 'state', token: L2 }).me.id === MO, 'ほかの人のログインが消えても、自分は使える');

section('動画が24時間届かないと取り消す');
gas.shiftDays(1);
const d4 = gas.run('today_'), at4 = jst(1), code4 = gas.run('withReq', (f) => f.clipCode_(d4));
r = api({ op: 'clipStart', token: ISHI, mime: 'video/mp4', thumb, recordedAt: at4, code: code4 });
const c4 = r.clip.id;
ok(r.ok && r.recorded && api({ op: 'state', token: ISHI }).records.some((x) => x[0] === IS && x[1] === d4 && x[2] === 1), '次の日も先に「実施した」');
ok(gas.run('withReq', (f) => f.expireClips_()) === 0, '24時間たつまでは取り消さない');
gas.shiftDays(1); gas.clock.offset += 3 * 3600000; // 27時間後
ok(gas.run('withReq', (f) => f.expireClips_()) === 1, '24時間（＋余裕）たっても動画が届かないと取り消す');
st = api({ op: 'state', token: ISHI });
ok(st.clips.find((c) => c.id === c4).st === 'canceled' && /届きませんでした/.test(st.clips.find((c) => c.id === c4).why), '本人には「動画が24時間以内に届きませんでした」と出る');
ok(!gas.sheet('実施記録').data.some((row) => row.indexOf(IS) >= 0 && row.indexOf(d4) >= 0), 'その日の「実施した」も外れる');
ok(api({ op: 'clipUpload', token: ISHI, mime: 'video/mp4', data: vid, thumb, recordedAt: at4, code: code4 }).error === 'too_late', 'あとから動画が来ても受け付けない');
gas.clock.offset -= 3 * 3600000; gas.shiftDays(-2);

section('3か月で消える');
const trashed = () => Object.values(gas.drive.files).filter((f) => f.trashed).length;
const tr0 = trashed();
gas.shiftDays(60);
ok(gas.run('withReq', (f) => f.purgeClips_()) === 0 && trashed() === tr0, '2か月たっても、動画はまだ消えない');
gas.shiftDays(33);
gas.run('withReq', (f) => f.purgeClips_());
ok(Object.values(gas.drive.files).every((f) => f.trashed), '3か月たつと、ドライブの動画はゴミ箱へ');
ok(api({ op: 'clipVideo', token: G, id: clip1 }).error, '消えた動画は見られない');
ok(gas.sheet('動画のサムネイル').data.length === 1, 'サムネイルも消える');
gas.shiftDays(-93);

section('動画が消えたあとは、ふつうの記録にもどる');
{
  const st0 = api({ op: 'state', token: MG });
  const gone = st0.clips.find((c) => c.st === 'ok' && c.gone && st0.records.some((x) => x[0] === c.m && x[1] === c.d && x[2] === 1) && !st0.clips.some((y) => y.m === c.m && y.d === c.d && y.st === 'ok' && !y.gone));
  ok(!!gone, '消えた動画の日の「実施した」がある');
  if (gone) ok(api({ op: 'deleteRecord', token: A, date: gone.d, memberId: gone.m }).ok, '動画が消えたあと（3か月たったなど）は、ふつうの記録にもどり、管理者が外せる');
}

section('古い動画の行は「動画（古い）」へ移す（毎日の手入れ）');
{
  const before = gas.sheet('動画').data.length - 1;
  gas.shiftDays(121);
  const n = gas.run('withReq', (f) => f.archiveClips_());
  const old = gas.sheet('動画（古い）'), after = gas.sheet('動画').data.length - 1;
  const hd = old.data[0], dcol = hd.indexOf('削除日時'), scol = hd.indexOf('状態');
  ok(n > 0 && old.data.length - 1 === n && after === before - n, '120日より前の動画の行は「動画（古い）」へ移る（' + n + '行）');
  ok(old.data.slice(1).every((row) => row[dcol] || row[scol] === '取り消し' || row[scol] === '下書き'), '移すのは、動画のファイルを消した行（と、取り消し・下書き）だけ');
  ok(gas.run('withReq', (f) => f.archiveClips_()) === 0, 'もう一度しても、何も起きない');
  const st = api({ op: 'state', token: MG });
  ok(Array.isArray(st.clips), '移したあとも、画面はふつうに出る');
  gas.shiftDays(-121);
}

section('テスト環境の守り');
ok(api({ op: 'saveMember', token: A, member: { id: id['森 健太'], name: '森 健太', grade: '2年' } }).error === 'test_env', 'テスト環境からは会計アプリの名簿を書き換えられない');
ok(gas.run('withReq', (f) => f.weeklyBackup_()) === null, 'テスト環境ではバックアップを取らない');

section('免除の申し込み（選手が申し込み、主将・副主将が認める）');
{
  const IS = id['石川 大地'], MO = id['森 健太'], today = jst(0).slice(0, 10);
  const day = (k) => jst(-k * 1440).slice(0, 10); // k日後
  ok(api({ op: 'exemptDecide', token: MORI2, id: 'x', ok: true }).error === 'forbidden', '主将・副主将でない選手は、認められない');
  const setRole = (name, role) => gas.accountingEdit((sh) => { const k = sh.data.findIndex((x) => x[0] === name); sh.data[k][sh.data[0].indexOf('役割')] = role; });
  setRole('森 健太', '副主将'); // 名簿（会計アプリと共通）の役割
  let s0 = api({ op: 'state', token: A });
  const mo0 = s0.members.find((m) => m.id === MO);
  ok(mo0.clubRole === '副主将' && mo0.perm === 'leader' && mo0.autoL === 1, '名簿の役割が「副主将」の選手は、自動で FW・BKリーダー（部員設定の権限は一般部員のまま）');
  ok(gas.sheet('部員設定').data.some((row) => row[0] === MO && row.indexOf('一般部員') >= 0), '部員設定の権限は書き換えない');
  ok(api({ op: 'state', token: MORI2 }).me.perm === 'leader', '副主将はログインするとリーダー');
  const CEP = 'https://fcm.googleapis.com/fcm/send/captain-device:APA91b-test';
  r = api({ op: 'pushRegister', token: MORI2, sub: { endpoint: CEP }, memberId: MO, kinds: ['exreq', 'goal'] });
  ok(r.ok && r.push.kinds.indexOf('exreq') >= 0, '副主将は「免除の申し込み」の通知を受け取れる');
  ok(api({ op: 'pushRegister', token: ISHI, sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/ishi-ex:APA91b-test' }, memberId: IS, kinds: ['exreq', 'goal'] }).push.kinds.indexOf('exreq') < 0, '主将・副主将でない選手は受け取れない');
  ok(api({ op: 'exemptRequest', token: ISHI, from: today, to: day(6), reason: 'なまけ', note: '' }).error === 'bad_reason', '理由は決まったものから選ぶ');
  ok(api({ op: 'exemptRequest', token: ISHI, from: day(-20), to: today, reason: 'けが', note: '' }).error === 'bad_range', '2週間より前の分は申し込めない');
  ok(api({ op: 'exemptRequest', token: ISHI, from: day(3), to: day(1), reason: 'けが', note: '' }).error === 'bad_range', '終了日が開始日より前はだめ');
  ok(api({ op: 'exemptRequest', token: G, from: today, to: day(6), reason: 'けが', note: '' }).error === 'forbidden', '見るだけの人は申し込めない');
  ok(api({ op: 'exemptRequest', token: MG, from: today, to: day(6), reason: 'けが', note: '' }).error === 'not_player', '選手でない人（マネージャー）は申し込めない');
  gas.push.sent.length = 0;
  r = api({ op: 'exemptRequest', token: ISHI, from: today, to: day(6), reason: 'けが', note: '右足首の捻挫' });
  ok(r.ok && r.req.st === 'pending' && r.req.m === IS, '選手が自分で免除を申し込める');
  const q1 = r.req.id;
  ok(gas.push.sent.some((x) => x.url === CEP) && /免除の申し込み/.test(api({ op: 'pushInbox', endpoint: CEP }).messages[0].title), '副主将に通知が届く');
  ok(api({ op: 'exemptRequest', token: ISHI, from: day(2), to: day(3), reason: '試験', note: '' }).error === 'overlap', '同じ期間に重ねて申し込めない');
  let sc = api({ op: 'state', token: MORI2 });
  ok(sc.exJudge === 1 && sc.exReqs.some((x) => x.id === q1 && x.note === '右足首の捻挫'), '副主将の画面に、申し込み（理由・メモつき）が出る');
  let sm = api({ op: 'state', token: MG });
  ok(!sm.exJudge && !(sm.exReqs || []).some((x) => x.id === q1), 'マネージャー（主将・副主将でない）には出ない');
  ok(!(api({ op: 'state', token: G }).exReqs || []).length, '見るだけの人には出ない');
  ok(api({ op: 'state', token: ISHI }).exReqs.some((x) => x.id === q1 && x.st === 'pending'), '本人の画面に「申し込み中」が出る');
  gas.push.sent.length = 0;
  r = api({ op: 'exemptDecide', token: MORI2, id: q1, ok: true });
  ok(r.ok && r.req.st === 'ok', '副主将が認める');
  let si = api({ op: 'state', token: ISHI });
  const ex1 = si.exempts.find((e) => e.memberId === IS && e.from === today && e.to === day(6));
  ok(!!ex1 && si.exReqs.some((x) => x.id === q1 && x.st === 'ok'), '認めると、ふつうの免除になる');
  ok(gas.push.sent.some((x) => /ishi-ex/.test(x.url)), '本人に「認められました」の通知が届く');
  ok(api({ op: 'exemptDecide', token: MORI2, id: q1, ok: false }).error === 'decided', '決まったものは、もう変えられない');
  const exm = api({ op: 'state', token: MG }).exempts.find((e) => e.id === ex1.id);
  ok(exm && exm.req === 1 && exm.reason === 'けが', '幹部には、本人の申し込みから（副主将が認めた）とわかる');
  ok(api({ op: 'deleteExempt', token: MG, id: ex1.id }).ok, 'マネージャーも、申し込みから決まった免除を取り消せる（認めたのが自分でなくても）');
  r = api({ op: 'exemptRequest', token: ISHI, from: day(10), to: day(12), reason: '試験', note: '前期の試験' });
  ok(api({ op: 'exemptCancel', token: MORI2, id: r.req.id }).error === 'not_found', 'ほかの人の申し込みは取り消せない');
  ok(api({ op: 'exemptCancel', token: ISHI, id: r.req.id }).ok, '本人は、申し込み中なら取り消せる');
  ok(api({ op: 'exemptDecide', token: MORI2, id: r.req.id, ok: true }).error === 'decided', '取り消した申し込みは認められない');
  r = api({ op: 'exemptRequest', token: ISHI, from: day(20), to: day(21), reason: 'その他', note: '旅行' });
  gas.push.sent.length = 0;
  ok(api({ op: 'exemptDecide', token: MORI2, id: r.req.id, ok: false, answer: '旅行は免除になりません' }).req.st === 'no', '副主将が認めない（理由つき）');
  si = api({ op: 'state', token: ISHI });
  ok(si.exReqs.some((x) => x.id === r.req.id && x.st === 'no' && x.ans === '旅行は免除になりません') && !si.exempts.some((e) => e.memberId === IS && e.from === day(20)), '本人に理由が届き、免除にはならない');
  ok(gas.push.sent.some((x) => /ishi-ex/.test(x.url)), '本人に「認められませんでした」の通知が届く');
  r = api({ op: 'exemptRequest', token: MORI2, from: day(1), to: day(2), reason: '病気・体調不良', note: '' });
  ok(api({ op: 'exemptDecide', token: MORI2, id: r.req.id, ok: true }).error === 'own', '副主将自身の申し込みは、自分では認められない');
  ok(api({ op: 'exemptDecide', token: A, id: r.req.id, ok: true }).ok, '管理者が認められる');
  setRole('森 健太', '部員');
  const s9 = api({ op: 'state', token: MORI2 });
  ok(!s9.exJudge && s9.me.perm === 'member', '役割を「部員」に戻すと、認められなくなり、リーダーでもなくなる');
  setRole('石川 大地', '主将');
  const s8 = api({ op: 'state', token: ISHI });
  ok(s8.exJudge === 1 && s8.me.perm === 'captain', '名簿の役割が主将の選手は、自動で権限も主将（免除の申し込みを認められる）');
  setRole('石川 大地', '部員');
  ok(!api({ op: 'state', token: ISHI }).exJudge, '役割を戻すと、認められなくなる');
  { // アプリの権限で主将・副主将にしても認められる（名簿の役割は部員のまま）
    api({ op: 'saveMember', token: A, member: { id: id['小川 陽向'], perm: 'leader' } });
    const ogw = api({ op: 'state', token: A }).members.find((m) => m.id === id['小川 陽向']);
    ok(ogw.perm === 'leader' && !ogw.autoL, '権限を副主将にできる');
    const rp = api({ op: 'resetPin', token: A, id: id['小川 陽向'] });
    const lg0 = api({ op: 'login', memberId: id['小川 陽向'], pin: rp.tempPin });
    api({ op: 'changePin', token: lg0.token, oldPin: rp.tempPin, newPin: 'ogawa-lead-1' });
    const OGL = api({ op: 'login', memberId: id['小川 陽向'], pin: 'ogawa-lead-1' }).token;
    ok(api({ op: 'state', token: OGL }).exJudge === 1, '権限が副主将の人は、免除の申し込みを認められる');
    api({ op: 'saveMember', token: A, member: { id: id['小川 陽向'], perm: 'captain' } });
    const OGC = api({ op: 'login', memberId: id['小川 陽向'], pin: 'ogawa-lead-1' }).token; // 権限を変えるとログインし直し（暗証番号はそのまま）
    const sc = api({ op: 'state', token: OGC });
    ok(sc.me && sc.me.perm === 'captain' && sc.exJudge === 1, '権限が主将の人も、免除の申し込みを認められる');
    api({ op: 'saveMember', token: A, member: { id: id['小川 陽向'], perm: 'member' } });
  }
  const lg = api({ op: 'logs', token: A }).logs.map((x) => x.action).join(' ');
  ok(/免除を申し込み/.test(lg) && /免除の申し込みを認めた/.test(lg) && /免除の申し込みを認めなかった/.test(lg), '操作履歴に残る');
}

section('アイコン（一人一人が決める）');
{
  const IS = id['石川 大地'], MOi = id['森 健太'];
  const jpg = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(600, 7)]).toString('base64');
  let r = api({ op: 'setIcon', token: ISHI, kind: 'e', emoji: '🔥', color: '#8c1d2f' });
  ok(r.ok && r.ic === 'e:#8c1d2f:🔥', '絵文字と背景の色でアイコンを決められる');
  ok(api({ op: 'state', token: MORI2 }).members.find((m) => m.id === IS).ic === 'e:#8c1d2f:🔥', 'ほかの人の画面にもアイコンが出る（部員の一覧に入る）');
  ok(api({ op: 'setIcon', token: ISHI, kind: 'e', emoji: 'abc', color: '#8c1d2f' }).error === 'bad_icon', '絵文字でない文字はだめ');
  ok(api({ op: 'setIcon', token: ISHI, kind: 'e', emoji: '<b>', color: '#8c1d2f' }).error === 'bad_icon', 'タグのような文字はだめ');
  ok(api({ op: 'setIcon', token: ISHI, kind: 'e', emoji: '🔥', color: 'red' }).error === 'bad_icon', '決まった色のほかはだめ');
  r = api({ op: 'setIcon', token: ISHI, kind: 'p', data: jpg });
  ok(r.ok && /^p:/.test(r.ic) && r.data === jpg, '写真でもアイコンを決められる');
  const rows = gas.sheet('アイコン写真').data.filter((row) => row[0] === IS);
  ok(rows.length === 1, '写真は「アイコン写真」に1人1行');
  const ic = api({ op: 'icons', token: MORI2, ids: [IS, MOi] });
  ok(ic.ok && ic.icons[IS] === jpg && !ic.icons[MOi] && ic.vers[IS] === r.ic, 'ほかの人は写真をまとめて取れる（版も一緒に）');
  r = api({ op: 'setIcon', token: ISHI, kind: 'p', data: jpg });
  ok(gas.sheet('アイコン写真').data.filter((row) => row[0] === IS).length === 1, '写真を変えても行は増えない');
  ok(api({ op: 'setIcon', token: ISHI, kind: 'p', data: Buffer.from('not a jpeg, just text that is long enough to pass the size check '.repeat(5)).toString('base64') }).error === 'bad_icon', 'JPEG でないものはだめ');
  ok(api({ op: 'setIcon', token: ISHI, kind: 'p', data: Buffer.concat([Buffer.from([0xFF, 0xD8]), Buffer.alloc(40 * 1024)]).toString('base64') }).error === 'bad_icon', '大きすぎる写真はだめ');
  ok(api({ op: 'resetIcon', token: MORI2, memberId: IS }).error === 'forbidden', '選手はほかの人のアイコンを戻せない');
  r = api({ op: 'resetIcon', token: MG, memberId: IS });
  ok(r.ok && !api({ op: 'state', token: MORI2 }).members.find((m) => m.id === IS).ic && !gas.sheet('アイコン写真').data.some((row) => row[0] === IS), 'マネージャーはアイコンを元に戻せる（写真も消える）');
  api({ op: 'setIcon', token: MORI2, kind: 'e', emoji: '💪', color: '#1f3a68' });
  r = api({ op: 'setIcon', token: MORI2, kind: '' });
  ok(r.ok && r.ic === '' && !api({ op: 'state', token: ISHI }).members.find((m) => m.id === MOi).ic, '自分でアイコンを外せる');
  ok(api({ op: 'setIcon', token: G, kind: 'e', emoji: '🔥', color: '#8c1d2f' }).error === 'forbidden', '見るだけの人はアイコンを決めない');
}

section('ドライブに置いた動画が0バイトになったとき（本番で iPhone の動画が再生できなかった）');
{
  const atz = jst(0.2), nf0 = Object.keys(gas.drive.files).length;
  gas.drive.emptyNext = 1;
  let r2 = api({ op: 'clipDraft', token: ISHI, mime: 'video/mp4', data: vid, thumb, recordedAt: atz, code });
  const made = Object.values(gas.drive.files).slice(nf0);
  ok(r2.ok && made.length === 2 && made[0].trashed && !made[1].trashed, '0バイトになったら捨てて置き直す（' + made.length + '個）');
  gas.drive.emptyNext = 3;
  const atz2 = jst(0.15);
  r2 = api({ op: 'clipDraft', token: ISHI, mime: 'video/mp4', data: vid, thumb, recordedAt: atz2, code });
  ok(r2.error === 'drive_failed' && /スマホに残っています/.test(r2.message), '3回だめならエラー（スマホは動画をしまったまま送り直す）');
  ok(!Object.values(gas.drive.files).slice(nf0).some((f) => !f.trashed && f.getSize() === 0), '0バイトのファイルは残らない');
  gas.drive.emptyNext = 0;
  api({ op: 'clipDraftDrop', token: ISHI, recordedAt: atz });
}
section('動画のフォルダの名前');
{
  const fid = gas.props.getProperty('CLIP_FOLDER');
  const fo = gas.drive.folders[fid];
  ok(fo && /3か月/.test(fo.name), '新しく作るフォルダは「3か月で消えます」');
  fo.name = 'KURFC 筋トレ 動画（テスト）（1か月で消えます）';
  gas.run('renameClipFolder_');
  ok(/（3か月で消えます）$/.test(fo.name) && !/1か月/.test(fo.name), '前の「1か月で消えます」のフォルダは、1日1回の処理で「3か月」に直す');
}
section('シートのキャッシュ');
ok(afChecks > 10 && !afBad.length, '書いたあとに一緒に返す最新の情報は、読み直したものと同じ（' + afChecks + '回）' + (afBad.length ? '：違い ' + afBad.slice(0, 6).join(' / ') : ''));
ok(tcChecks > 20 && !tcBad.length, 'キャッシュから読んだ state は、シートから読んだものと同じ（' + tcChecks + '回）' + (tcBad.length ? '：違い ' + tcBad.slice(0, 5).join(' / ') : ''));
console.log('\n==============================');
console.log('合格 ' + pass + ' / 不合格 ' + fail);
if (fail) { console.log('不合格：\n- ' + failed.join('\n- ')); process.exit(1); }

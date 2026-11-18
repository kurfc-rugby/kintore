# 使い方動画（約40秒・720×1280・30fps・音なし）を組み立てる
#   python3 dev/howto-render.py <素材フォルダ(howto-capture.js の出力)> <出力フォルダ>
#   python3 dev/howto-render.py <素材フォルダ(howto-capture-login.js の出力)> <出力フォルダ> login … 全員ログイン版（howto-login.mp4）
# 場面ごとに1本ずつ書き出してから、つなぐ（-c copy）。
import json, os, subprocess, sys, math
from PIL import Image, ImageDraw, ImageFont

CAP, OUT = sys.argv[1], sys.argv[2]
LOGIN = len(sys.argv) > 3 and sys.argv[3] == 'login'
os.makedirs(OUT, exist_ok=True)
W, H, FPS = 720, 1280, 30
BG = (110, 47, 52)
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
f_cap = ImageFont.truetype(FONT, 46, index=0)
f_n = ImageFont.truetype(FONT, 24, index=0)
# 画面（375×812 を2倍で撮った 750×1624）を置く場所
SX, SY, SW = 128, 42, 464
SH = round(SW * 1624 / 750)  # 1005
R = 28

SCENES = {
    'title': (2.5, 'KURFC 筋トレ\n使い方（40秒）', ''),
    'home': (5.0, 'ホームで、部全体と\n自分の今週がわかる', '1/8'),
    'self': (5.0, '設定で自分の名前を選ぶと\n「わたし」が出る', '2/8'),
    'rank': (4.5, 'ランキングは\n横にはらうと前の週・月', '3/8'),
    'member': (5.5, '名前を押すと\n自己ベスト・称号・体重', '4/8'),
    'cheer': (4.5, '「＋応援」で\nスタンプを送れる', '5/8'),
    'form': (6.0, 'メニューの「フォーム」で\n動画とやり方がわかる', '6/8'),
    'feedback': (4.0, '要望・不具合は\n設定から送れる', '7/8'),
    'help': (4.0, 'わからないときは右上の「？」\n画面で案内も見られる', '8/8'),
}

# 全員ログイン版：ログイン・撮る・みんなの動画・カレンダーの動画・アイコン
SCENES_LOGIN = {
    'title': (2.5, 'KURFC 筋トレ\n使い方（40秒）', ''),
    'login': (5.0, '名前を選んで\n暗証番号を決めて登録', '1/8'),
    'home': (4.5, 'ホームで、部全体と\n自分の今週がわかる', '2/8'),
    'shoot': (7.5, '筋トレをしたら「撮る」\n2秒の動画で「実施した」', '3/8'),
    'clips': (4.5, 'みんなの動画を見て\n応援を送れる', '4/8'),
    'rank': (4.0, 'ランキングは\n横にはらうと前の月', '5/8'),
    'member': (5.0, '自分のページの\nカレンダーから動画', '6/8'),
    'icon': (4.5, 'アイコンも\n自分で決められる', '7/8'),
    'help': (3.5, 'わからないときは\n右上の「？」', '8/8'),
}
if LOGIN:
    SCENES = SCENES_LOGIN

mask = Image.new('L', (SW, SH), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, SW - 1, SH - 1), R, fill=255)
cache = {}
def screen(path):
    if path not in cache:
        cache[path] = Image.open(path).convert('RGB').resize((SW, SH), Image.LANCZOS)
    return cache[path]

def base(caption, num):
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((SX - 3, SY - 3, SX + SW + 2, SY + SH + 2), R + 3, fill=(232, 220, 222))
    lines = caption.split('\n')
    y = 1078 if len(lines) == 2 else 1110
    for ln in lines:
        w = d.textlength(ln, font=f_cap)
        d.text(((W - w) / 2, y), ln, font=f_cap, fill='white')
        y += 62
    if num:
        w = d.textlength(num, font=f_n)
        d.text((W - 26 - w, 1050), num, font=f_n, fill=(225, 190, 195))
    d.rectangle((0, 1250, W, 1253), fill=(240, 232, 233))
    d.rectangle((0, 1260, W, 1263), fill=(240, 232, 233))
    return im

def paste_screen(frame, scr):
    frame.paste(scr, (SX, SY), mask)

def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)

def scroll_frame(beat, t):
    s = beat['scroll']
    key = s['full']
    if key not in cache:
        full = Image.open(s['full']).convert('RGB')
        vp = Image.open(beat['img']).convert('RGB')
        cache[key] = (full, vp.crop((0, 0, 750, s['headH'])), vp.crop((0, s['navTop'], 750, 1624)))
    full, head, nav = cache[key]
    y = round(s['to'] * ease((t - 0.18) / 0.64))
    y = max(0, min(y, full.height - 1624))
    view = full.crop((0, y, 750, y + 1624))
    view.paste(head, (0, 0)); view.paste(nav, (0, s['navTop']))
    return view.resize((SW, SH), Image.LANCZOS)

def tap_overlay(frame, xy, p):
    # p: 0→1 押す動き（輪が少し縮んで消える）
    x = SX + xy[0] * SW / 750; y = SY + xy[1] * SH / 1624
    ov = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    r = 30 - 8 * ease(p); a = int(150 * (1 - max(0, p - 0.7) / 0.3))
    d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, a), outline=(110, 47, 52, min(255, a + 60)), width=4)
    frame.paste(Image.alpha_composite(frame.convert('RGBA'), ov).convert('RGB'))

def render_scene(idx, sc):
    dur, cap, num = SCENES[sc['id']]
    beats = sc['beats']; nf = round(dur * FPS); per = nf / len(beats)
    XF = 8  # 画面の切り替え（クロスフェード）のフレーム数
    tmp = os.path.join(OUT, 'scene%02d.tmp.mp4' % idx); dst = os.path.join(OUT, 'scene%02d.mp4' % idx)
    prev = os.environ.get('PREVIEW')
    p = None if prev else subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-',
                          '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', str(FPS), tmp], stdin=subprocess.PIPE)
    bg = base(cap, num)
    for f in range(nf):
        bi = min(len(beats) - 1, int(f / per)); b = beats[bi]
        lt = (f - bi * per) / per  # その画面の中での進み 0→1
        frame = bg.copy()
        scr = scroll_frame(b, lt) if 'scroll' in b else screen(b['img'])
        nxt = beats[bi + 1] if bi + 1 < len(beats) else None
        into = (bi + 1) * per - f  # 次の画面までのフレーム数
        if nxt and into <= XF:
            k = 1 - into / XF
            ns = screen(nxt['img']) if 'scroll' not in nxt else scroll_frame(nxt, 0)
            if b.get('swipe'):
                # 右にはらう：今の画面が右へ、前の週の画面が左から入る
                off = round(SW * ease(k))
                tmpimg = Image.new('RGB', (SW, SH), (238, 239, 241))
                tmpimg.paste(scr, (off, 0)); tmpimg.paste(ns, (off - SW, 0))
                scr = tmpimg
            else:
                scr = Image.blend(scr, ns, ease(k))
        paste_screen(frame, scr)
        if b.get('tap') and nxt is not None:
            # 切り替わる前の 0.6 秒で押す
            st = (bi + 1) * per - XF - 18
            if f >= st: tap_overlay(frame, b['tap'], min(1, (f - st) / 18))
        if b.get('swipe') and nxt is not None:
            st = (bi + 1) * per - XF - 16
            if f >= st:
                q = min(1, (f - st) / (16 + XF))
                ov = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
                x = SX + 90 + 280 * ease(q); y = SY + SH * 0.55
                d.ellipse((x - 24, y - 24, x + 24, y + 24), fill=(255, 255, 255, 160), outline=(110, 47, 52, 220), width=4)
                frame.paste(Image.alpha_composite(frame.convert('RGBA'), ov).convert('RGB'))
        if prev:
            # 確認用：場面の途中と、押す直前・スクロールの途中を画像で書き出す
            if f in (int(per * 0.5), int(per - XF - 6), int(nf - 3)): frame.save(os.path.join(OUT, 'pv%02d_%03d.png' % (idx, f)))
            continue
        p.stdin.write(frame.tobytes())
    if prev: return None
    p.stdin.close()
    if p.wait() != 0: raise SystemExit('ffmpeg failed: scene %d' % idx)
    os.replace(tmp, dst)
    return dst

scenes = json.load(open(os.path.join(CAP, 'beats.json')))
order = ['title', 'login', 'home', 'shoot', 'clips', 'rank', 'member', 'icon', 'help'] if LOGIN else ['title', 'home', 'self', 'rank', 'member', 'cheer', 'form', 'feedback', 'help']
NAME = 'howto-login' if LOGIN else 'howto'
byid = {s['id']: s for s in scenes}
files = []
for i, sid in enumerate(order):
    files.append(render_scene(i, byid[sid])); print('scene', i, sid, flush=True)
if os.environ.get('PREVIEW'): raise SystemExit(0)
lst = os.path.join(OUT, 'list.txt')
open(lst, 'w').write(''.join("file '%s'\n" % os.path.abspath(f) for f in files))
final = os.path.join(OUT, NAME + '.mp4'); tmp = os.path.join(OUT, NAME + '.tmp.mp4')
subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', tmp])
os.replace(tmp, final)
# 表紙（360×640）：ホームの場面の最初
poster = base(*SCENES['title'][1:]); paste_screen(poster, screen(byid['title']['beats'][0]['img']))
poster.resize((360, 640), Image.LANCZOS).save(os.path.join(OUT, NAME + '.jpg'), quality=88)
print('done', final)

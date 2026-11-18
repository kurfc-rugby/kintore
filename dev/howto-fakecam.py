# 使い方動画（全員ログイン版）用の偽のカメラ映像を作る：python3 dev/howto-fakecam.py <出力フォルダ>
#   fake.y4m … Chrome の --use-file-for-fake-video-capture に渡す（640×480・30fps・3秒をくり返す）
#   clip.mp4 … ほかの部員が送った動画のかわり（縦3:4・2秒）
#   thumb0〜4.jpg … そのサムネイル（180×240）
# 絵は自作の図形（ジムの壁の前で、バーベルを担いでスクワットする人の影）
import math, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
W, H, FPS, N = 640, 480, 30, 90


def frame(s, tint=(0, 0, 0)):
    """s：しゃがむ深さ 0（立つ）〜1（いちばん低い）。tint：壁の色を少し変える（部員ごとに見分けやすく）"""
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        k = y / H
        if y < 340:
            c = (58 + 30 * k + tint[0], 62 + 28 * k + tint[1], 70 + 24 * k + tint[2])
        else:
            q = (y - 340) / 140
            c = (92 - 20 * q, 84 - 18 * q, 76 - 16 * q)
        d.line([(0, y), (W, y)], fill=tuple(int(max(0, min(255, v))) for v in c))
    for x in range(40, W, 120):
        d.line([(x, 0), (x, 340)], fill=(70, 75, 84), width=2)
    for x in (150, 490):
        d.rectangle((x - 6, 90, x + 6, 340), fill=(34, 36, 40))
    cx, body = 320, (30, 32, 38)
    head_y = 120 + 80 * s
    hip_y = 225 + 70 * s
    for sgn in (-1, 1):
        knee = (cx + sgn * (24 + 22 * s), hip_y + (338 - hip_y) * 0.5 - 6 * s)
        d.line([(cx + sgn * 20, hip_y), knee, (cx + sgn * 34, 336)], fill=body, width=24, joint='curve')
        d.ellipse((cx + sgn * 34 - 16, 328, cx + sgn * 34 + 16, 344), fill=body)
    d.rounded_rectangle((cx - 34, head_y + 20, cx + 34, hip_y + 10), 18, fill=body)
    d.ellipse((cx - 23, head_y - 25, cx + 23, head_y + 21), fill=body)
    bar_y = head_y + 30
    d.rectangle((cx - 210, bar_y - 4, cx + 210, bar_y + 4), fill=(170, 172, 178))
    for sgn in (-1, 1):
        for k, (w, h) in enumerate(((18, 96), (14, 78))):
            x0 = cx + sgn * (150 + k * 20)
            d.rounded_rectangle((x0 - w // 2, bar_y - h // 2, x0 + w // 2, bar_y + h // 2), 4,
                                fill=(140, 28, 46) if k == 0 else (30, 30, 34))
    return im.filter(ImageFilter.GaussianBlur(0.6))


depth = lambda i: (1 - math.cos(i / N * 2 * math.pi)) / 2
frames = [frame(depth(i)) for i in range(N)]
with open(os.path.join(OUT, 'fake.y4m'), 'wb') as f:
    f.write(b'YUV4MPEG2 W%d H%d F%d:1 Ip A1:1 C420jpeg\n' % (W, H, FPS))
    for im in frames:
        f.write(b'FRAME\n')
        y, cb, cr = im.convert('YCbCr').split()
        f.write(y.tobytes())
        f.write(cb.resize((W // 2, H // 2), Image.BILINEAR).tobytes())
        f.write(cr.resize((W // 2, H // 2), Image.BILINEAR).tobytes())

# ほかの部員の動画（縦3:4に切り出し）。同じ動画を使い回す
crop = lambda im: im.crop((140, 0, 500, 480))
tmp = os.path.join(OUT, 'clip.tmp.mp4')
p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '360x480', '-r', str(FPS), '-i', '-',
                      '-t', '2', '-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp],
                     stdin=subprocess.PIPE)
for im in frames[:60]:
    p.stdin.write(crop(im).tobytes())
p.stdin.close()
if p.wait() != 0:
    raise SystemExit('ffmpeg failed')
os.replace(tmp, os.path.join(OUT, 'clip.mp4'))
tints = [(0, 0, 0), (18, 4, -6), (-6, 10, 14), (12, 12, -10), (-10, -4, 20)]
for i, t in enumerate(tints):
    crop(frame([0.15, 0.9, 0.5, 1.0, 0.3][i], t)).resize((180, 240), Image.LANCZOS).save(os.path.join(OUT, 'thumb%d.jpg' % i), quality=70)
print('ok', OUT)

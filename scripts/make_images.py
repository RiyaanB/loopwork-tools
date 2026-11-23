#!/usr/bin/env python3
"""Generate favicon.png (+ .ico) and og.png for Loopwork Tools. Run from the site root: python3 scripts/make_images.py"""
import math, os
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG, PANEL, ACC, ACC2, TXT, MUT = (15,17,21), (23,26,33), (255,181,71), (90,209,199), (230,232,238), (154,163,178)
F = '/usr/share/fonts/truetype/dejavu/'
def font(name, size): return ImageFont.truetype(F + name, size)

def logo(size):
    s = 4  # supersample
    im = Image.new('RGBA', (size*s, size*s), (0,0,0,0)); d = ImageDraw.Draw(im)
    S = size*s
    d.rounded_rectangle([0,0,S-1,S-1], radius=int(S*.22), fill=PANEL)
    w = max(2, int(S*3/32))
    d.ellipse([S*9/32, S*10.5/32, S*23/32, S*21.5/32], outline=ACC, width=w)
    r = S*3/32; d.ellipse([S*23/32-r, S/2-r, S*23/32+r, S/2+r], fill=ACC2)
    return im.resize((size,size), Image.LANCZOS)

logo(64).save(os.path.join(ROOT, 'favicon.png'))
logo(256).save(os.path.join(ROOT, 'favicon.ico'), sizes=[(16,16),(32,32),(48,48)])
logo(180).save(os.path.join(ROOT, 'apple-touch-icon.png'))

W, H = 1200, 630
og = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(og)
# waveform band (decorative, drawn from a decaying square/sine like the coin sound)
for x in range(0, W, 3):
    t = x / W
    a = (1-t)**1.2 * (0.55 + 0.45*math.sin(x*0.09)) * 70
    d.rectangle([x, 520-a, x+1, 520+a], fill=(60,48,30) if x % 2 else (70,55,32))
# sprite-grid motif
for i in range(6):
    for j in range(2):
        x0, y0 = 860 + i*48, 110 + j*48
        d.rectangle([x0, y0, x0+40, y0+40], outline=ACC2 if (i+j)%2==0 else (45,90,88), width=2)
og.paste(logo(120), (80, 80), logo(120))
d.text((80, 230), 'Loopwork Tools', font=font('DejaVuSans-Bold.ttf', 78), fill=TXT)
d.text((82, 330), 'Free browser tools for indie game devs', font=font('DejaVuSans.ttf', 36), fill=MUT)
x = 80
for label, col in [('SFX generator', ACC), ('Cover resizer', ACC2), ('Sprite slicer', TXT)]:
    f = font('DejaVuSans-Bold.ttf', 28); tw = d.textlength(label, font=f)
    d.rounded_rectangle([x, 410, x+tw+36, 462], radius=12, fill=PANEL, outline=(42,47,58), width=2)
    d.text((x+18, 420), label, font=f, fill=col); x += tw + 56
d.text((80, 570), 'No uploads · no signup · runs in your browser', font=font('DejaVuSans.ttf', 24), fill=MUT)
og.save(os.path.join(ROOT, 'og.png'), optimize=True)
print('ok')

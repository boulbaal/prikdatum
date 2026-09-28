#!/usr/bin/env python3
"""Genereert de Whenly-iconen, favicon en het deelkaartje (OG-afbeelding)."""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), '..', 'public')
GROEN = (47, 143, 91)       # #2F8F5B
LICHTGROEN = (232, 245, 238)
WIT = (255, 255, 255)
TEKST = (31, 41, 51)
GEDEMPT = (107, 117, 128)


def font(size, bold=True):
    kandidaten = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    ]
    for p in kandidaten:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def rounded(draw, box, r, fill):
    draw.rounded_rectangle(box, radius=r, fill=fill)


def kalender_glyph(img, cx, cy, s, kleur_body=WIT, kleur_accent=GROEN, rand=None):
    """Tekent een kalenderblaadje met een vinkje, gecentreerd op (cx,cy), breedte s."""
    d = ImageDraw.Draw(img)
    w = s
    h = int(s * 0.92)
    x0 = cx - w // 2
    y0 = cy - h // 2
    x1 = x0 + w
    y1 = y0 + h
    r = int(s * 0.14)
    # body
    rounded(d, [x0, y0, x1, y1], r, kleur_body)
    if rand:
        d.rounded_rectangle([x0, y0, x1, y1], radius=r, outline=rand, width=max(2, s // 60))
    # bovenbalk
    balk_h = int(h * 0.22)
    rounded(d, [x0, y0, x1, y0 + balk_h + r], r, kleur_accent)
    d.rectangle([x0, y0 + balk_h, x1, y0 + balk_h + 2], fill=kleur_accent)
    # ringetjes
    ring_w = max(3, s // 22)
    for fx in (0.30, 0.70):
        rx = x0 + int(w * fx)
        d.rounded_rectangle([rx - ring_w, y0 - int(balk_h * 0.35), rx + ring_w, y0 + int(balk_h * 0.55)],
                            radius=ring_w, fill=kleur_body)
    # vinkje
    vx = x0 + int(w * 0.24)
    vy = y0 + int(h * 0.66)
    lw = max(4, int(s * 0.09))
    d.line([(vx, vy), (vx + int(w * 0.16), vy + int(h * 0.16))], fill=kleur_accent, width=lw, joint='curve')
    d.line([(vx + int(w * 0.16), vy + int(h * 0.16)), (vx + int(w * 0.46), vy - int(h * 0.18))], fill=kleur_accent, width=lw, joint='curve')


def maak_icoon(maat, pad_frac=0.14, achtergrond=GROEN, glyph_body=WIT, glyph_accent=GROEN, opaque=True):
    img = Image.new('RGBA', (maat, maat), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(maat * 0.22)
    rounded(d, [0, 0, maat, maat], r, achtergrond + ((255,) if opaque else (255,)))
    kalender_glyph(img, maat // 2, maat // 2, int(maat * (1 - 2 * pad_frac)),
                   kleur_body=glyph_body, kleur_accent=glyph_accent)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    # maskable + gewone iconen (groene achtergrond, witte kalender met groen vinkje)
    for maat in (192, 512):
        maak_icoon(maat, pad_frac=0.20).save(os.path.join(OUT, f'icon-{maat}.png'))
    # apple-touch (geen transparantie, iets minder padding)
    maak_icoon(180, pad_frac=0.16).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'))
    # favicon 32 + 48 in één .png (browsers gebruiken de png)
    maak_icoon(64, pad_frac=0.10).save(os.path.join(OUT, 'favicon.png'))

    # OG-deelkaartje 1200x630
    og = Image.new('RGB', (1200, 630), WIT)
    d = ImageDraw.Draw(og)
    # zachte groene band links
    d.rectangle([0, 0, 380, 630], fill=LICHTGROEN)
    ic = maak_icoon(220, pad_frac=0.18)
    og.paste(ic, (80, 205), ic)
    f_title = font(96, bold=True)
    f_sub = font(40, bold=False)
    d.text((430, 210), 'Whenly', font=f_title, fill=GROEN)
    d.text((432, 330), 'Pick a date together.', font=f_sub, fill=TEKST)
    d.text((432, 386), 'No account, no fuss. Free.', font=f_sub, fill=GEDEMPT)
    d.text((432, 470), 'whenly.vanali.workers.dev', font=font(30, bold=True), fill=GROEN)
    og.save(os.path.join(OUT, 'og.png'))

    print('iconen geschreven naar', os.path.abspath(OUT))
    for n in ('icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon.png', 'og.png'):
        p = os.path.join(OUT, n)
        print(' ', n, os.path.getsize(p), 'bytes')


if __name__ == '__main__':
    main()

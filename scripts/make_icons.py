"""Lager app-ikoner for Safetly (svart rundet firkant med kremfarget måne).

Kjør: python3 scripts/make_icons.py   (krever Pillow)
Lager www/icons/*.png og assets/*.png (kilde for @capacitor/assets til Android og iOS).
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
INK = (28, 26, 22, 255)
CREAM = (246, 240, 228, 255)
YELLOW = (245, 226, 160, 255)
SS = 4  # supersampling for glatte kanter


def moon(draw, cx, cy, r, color, cut_color):
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    off = r * 0.55
    draw.ellipse([cx - r + off, cy - r - off * 0.55, cx + r + off, cy + r - off * 0.55], fill=cut_color)


def icon(size, rounded=True, pad=0.0, bg=INK, transparent=False, moon_scale=0.30):
    s = size * SS
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0) if transparent else (bg if not rounded else (0, 0, 0, 0)))
    d = ImageDraw.Draw(img)
    if not transparent:
        if rounded:
            m = int(s * pad)
            d.rounded_rectangle([m, m, s - m, s - m], radius=int((s - 2 * m) * 0.27), fill=bg)
    cut = (0, 0, 0, 0) if transparent else bg
    # månen tegnes på eget lag så "utsnittet" blir gjennomsiktig når bakgrunnen er det
    layer = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    moon(ld, s * 0.47, s * 0.53, s * moon_scale, CREAM, (0, 0, 0, 0))
    img = Image.alpha_composite(img, layer) if transparent else Image.alpha_composite(img, layer)
    if not transparent:
        d2 = ImageDraw.Draw(img)
        off = s * moon_scale * 0.55
        r = s * moon_scale
        cx, cy = s * 0.47, s * 0.53
        d2.ellipse([cx - r + off, cy - r - off * 0.55, cx + r + off, cy + r - off * 0.55], fill=cut)
        d2.ellipse([s * 0.70, s * 0.24, s * 0.70 + s * 0.06, s * 0.24 + s * 0.06], fill=YELLOW)
    return img.resize((size, size), Image.LANCZOS)


def splash(size, dark=False):
    bg = (22, 20, 15, 255) if dark else CREAM
    img = Image.new('RGBA', (size, size), bg)
    logo = icon(int(size * 0.22))
    img.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
    return img


def main():
    icons = ROOT / 'www' / 'icons'
    assets = ROOT / 'assets'
    icons.mkdir(parents=True, exist_ok=True)
    assets.mkdir(parents=True, exist_ok=True)
    icon(192).save(icons / 'icon-192.png')
    icon(512).save(icons / 'icon-512.png')
    icon(512, rounded=False).save(icons / 'maskable-512.png')
    flat = Image.new('RGBA', (180, 180), INK)
    flat.alpha_composite(icon(180, rounded=False))
    flat.convert('RGB').save(icons / 'apple-touch-icon.png')
    # Kilder for @capacitor/assets
    icon(1024, rounded=False).convert('RGB').save(assets / 'icon-only.png')
    Image.new('RGB', (1024, 1024), INK[:3]).save(assets / 'icon-background.png')
    fg = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    inner = icon(1024, rounded=False, moon_scale=0.20)
    # forgrunn: bare månen på gjennomsiktig bakgrunn (adaptive icons på Android)
    px = inner.load()
    for y in range(1024):
        for x in range(1024):
            r, g, b, a = px[x, y]
            if (r, g, b) == INK[:3]:
                px[x, y] = (0, 0, 0, 0)
    fg.alpha_composite(inner)
    fg.save(assets / 'icon-foreground.png')
    splash(2732).convert('RGB').save(assets / 'splash.png')
    splash(2732, dark=True).convert('RGB').save(assets / 'splash-dark.png')
    print('Ikoner laget i www/icons og assets/')


if __name__ == '__main__':
    main()

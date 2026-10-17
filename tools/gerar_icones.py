"""Gera favicon.svg, icons/*.png (app instalável) e img/og.png (cartão de compartilhamento).
Uso: python tools/gerar_icones.py   (precisa do Pillow; usa a fonte Segoe UI do Windows)"""
import os
from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AZUL_1, AZUL_2 = (96, 150, 255), (37, 87, 190)      # topo / base do degradê do ícone

SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6096ff"/><stop offset="1" stop-color="#2557be"/></linearGradient></defs>
<rect width="64" height="64" rx="15" fill="url(#g)"/>
<path d="M32 11 16 17.5v13.5c0 10.5 6.8 18.4 16 22 9.2-3.6 16-11.5 16-22V17.5z" fill="none" stroke="#fff" stroke-width="3.6" stroke-linejoin="round"/>
<path d="M24 32.5l5.6 5.6L40.5 26" fill="none" stroke="#fff" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
'''


def degrade(w, h, c1, c2):
    img = Image.new('RGB', (w, h))
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        cor = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = cor
    return img


def escudo(d, cx, cy, s, espessura, cor=(255, 255, 255)):
    """desenha o escudo com visto, centrado em (cx,cy), s = altura aproximada"""
    k = s / 42.0
    pts = [(0, -21), (-16, -14.5), (-16, 0), (-12, 10), (0, 21), (12, 10), (16, 0), (16, -14.5), (0, -21)]
    xy = [(cx + x * k, cy + y * k) for x, y in pts]
    d.line(xy, fill=cor, width=int(espessura), joint='curve')
    visto = [(cx - 8 * k, cy + 1.5 * k), (cx - 2.4 * k, cy + 7.2 * k), (cx + 8.5 * k, cy - 5.5 * k)]
    d.line(visto, fill=cor, width=int(espessura * 1.05), joint='curve')
    r = espessura * 0.5
    for (x, y) in xy[:1] + xy[-1:] + visto[:1] + visto[-1:]:
        d.ellipse((x - r, y - r, x + r, y + r), fill=cor)


def icone(tam, cheio=False):
    f = 4
    T = tam * f
    img = degrade(T, T, AZUL_1, AZUL_2).convert('RGBA')
    if not cheio:                                  # cantos arredondados (ícone "any")
        m = Image.new('L', (T, T), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, T - 1, T - 1), radius=int(T * 0.235), fill=255)
        img.putalpha(m)
    d = ImageDraw.Draw(img)
    s = T * (0.50 if cheio else 0.62)              # maskable precisa de margem de segurança
    escudo(d, T / 2, T / 2 + T * 0.01, s, T * 0.055)
    return img.resize((tam, tam), Image.LANCZOS)


def fonte(tam, negrito=True):
    for nome in ('segoeuib.ttf' if negrito else 'segoeui.ttf', 'arialbd.ttf', 'arial.ttf'):
        for pasta in (r'C:\Windows\Fonts', '/usr/share/fonts/truetype/dejavu'):
            caminho = os.path.join(pasta, nome)
            if os.path.exists(caminho):
                return ImageFont.truetype(caminho, tam)
    return ImageFont.load_default()


def og():
    W, H = 1200, 630
    img = degrade(W, H, (13, 20, 38), (6, 10, 22)).convert('RGBA')
    brilho = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(brilho)
    bd.ellipse((-200, -380, 900, 420), fill=(79, 141, 255, 60))
    img = Image.alpha_composite(img, brilho)
    d = ImageDraw.Draw(img)
    ic = icone(150)
    img.alpha_composite(ic, (90, 90))
    d.text((270, 104), 'Concurseiro Blindado', font=fonte(46), fill=(240, 244, 252))
    d.text((90, 290), 'Estude para a OAB', font=fonte(88), fill=(255, 255, 255))
    d.text((90, 392), 'com método.', font=fonte(88), fill=(157, 193, 255))
    d.text((90, 540), 'Cronômetro, revisão, leis com grifos e desempenho — comece grátis.', font=fonte(32, False), fill=(170, 184, 214))
    img.convert('RGB').save(os.path.join(RAIZ, 'img', 'og.png'), optimize=True)


if __name__ == '__main__':
    for pasta in ('icons', 'img'):
        os.makedirs(os.path.join(RAIZ, pasta), exist_ok=True)
    open(os.path.join(RAIZ, 'favicon.svg'), 'w', encoding='utf-8').write(SVG)
    icone(192).save(os.path.join(RAIZ, 'icons', 'icon-192.png'), optimize=True)
    icone(512).save(os.path.join(RAIZ, 'icons', 'icon-512.png'), optimize=True)
    icone(512, cheio=True).save(os.path.join(RAIZ, 'icons', 'maskable-512.png'), optimize=True)
    icone(180, cheio=True).save(os.path.join(RAIZ, 'icons', 'apple-touch-icon.png'), optimize=True)
    og()
    print('ok: favicon.svg, icons/*.png, img/og.png')

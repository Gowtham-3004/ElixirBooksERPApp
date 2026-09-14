"""Builds the Lixi brand assets in src/assets/lixi/ out of the source artwork.

Source (not checked in): the Lixi orb logo PNG and the 1920x1080 animated GIF. Both are far too big
for the web (2.4 MB / 18 MB), so this crops the orb, resizes it and re-encodes:

  logo-{32,64,128,256}.png   static orb, alpha kept        (header button, drawer header, palette row)
  orb.webp                   animated orb, 192px, 25 fps    (drawer welcome state, "thinking" avatar)
  orb.gif                    fallback, 128px, 12.5 fps      (browsers without animated WebP)

  python scripts/lixi-assets.py [--logo PATH] [--gif PATH]

Re-runnable; needs Pillow (python -m pip install --user pillow).
"""
from __future__ import annotations

import argparse
import os
import sys

from PIL import Image, ImageSequence

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Imported by LixiMark.tsx (not served from public/) so Vite prefixes the deploy base URL.
OUT = os.path.join(ROOT, 'src', 'assets', 'lixi')
DOWNLOADS = os.path.join(os.path.expanduser('~'), 'Downloads')

LOGO_SIZES = (32, 64, 128, 256)
WEBP_SIZE = 192
GIF_SIZE = 128
WEBP_LIMIT = 1_000_000


def kb(path: str) -> str:
    return f'{os.path.getsize(path) / 1024:.0f} KB'


def build_logo(src: str) -> None:
    im = Image.open(src).convert('RGBA')
    # trim transparent padding so every size is the orb edge-to-edge
    im = im.crop(im.getchannel('A').getbbox())
    for size in LOGO_SIZES:
        out = os.path.join(OUT, f'logo-{size}.png')
        im.resize((size, size), Image.LANCZOS).save(out, optimize=True)
        print(f'  {os.path.basename(out):14} {kb(out)}')


def orb_bbox(frames: list[Image.Image]) -> tuple[int, int, int, int]:
    """Union of the orb's alpha bounding box across frames, padded to a square."""
    l = t = 10**6
    r = b = 0
    for f in frames:
        box = f.getchannel('A').getbbox()
        if not box:
            continue
        l, t = min(l, box[0]), min(t, box[1])
        r, b = max(r, box[2]), max(b, box[3])
    w, h = r - l, b - t
    side = max(w, h)
    cx, cy = l + w // 2, t + h // 2
    return (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)


def build_orb(src: str) -> None:
    gif = Image.open(src)
    frames = [f.convert('RGBA') for f in ImageSequence.Iterator(gif)]
    durations = [f.info.get('duration', 40) for f in ImageSequence.Iterator(Image.open(src))]
    box = orb_bbox(frames)
    print(f'  source {gif.size[0]}x{gif.size[1]}, {len(frames)} frames, orb box {box}')

    webp_frames = [f.crop(box).resize((WEBP_SIZE, WEBP_SIZE), Image.LANCZOS) for f in frames]
    webp = os.path.join(OUT, 'orb.webp')
    webp_frames[0].save(webp, save_all=True, append_images=webp_frames[1:], duration=durations, loop=0,
                        quality=80, method=6, minimize_size=True)
    print(f'  orb.webp       {kb(webp)}')
    if os.path.getsize(webp) > WEBP_LIMIT:
        sys.exit(f'orb.webp is over {WEBP_LIMIT // 1000} KB — lower WEBP_SIZE or quality')

    # fallback GIF: half the frames, 128 colours, hard alpha edge
    gif_frames = []
    for f in webp_frames[::2]:
        small = f.resize((GIF_SIZE, GIF_SIZE), Image.LANCZOS)
        alpha = small.getchannel('A')
        pal = small.convert('RGB').quantize(colors=127, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
        # push fully/mostly transparent pixels to a reserved index
        pal.paste(255, mask=alpha.point(lambda a: 255 if a < 96 else 0))
        pal.info['transparency'] = 255
        gif_frames.append(pal)
    out = os.path.join(OUT, 'orb.gif')
    gif_frames[0].save(out, save_all=True, append_images=gif_frames[1:], duration=durations[0] * 2, loop=0,
                       disposal=2, transparency=255, optimize=False)
    print(f'  orb.gif        {kb(out)}')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--logo', default=os.path.join(DOWNLOADS, 'LIXI Logo.png'))
    ap.add_argument('--gif', default=os.path.join(DOWNLOADS, 'Lixi.gif'))
    args = ap.parse_args()
    for p in (args.logo, args.gif):
        if not os.path.exists(p):
            sys.exit(f'missing source artwork: {p}')
    os.makedirs(OUT, exist_ok=True)
    print('logo')
    build_logo(args.logo)
    print('orb')
    build_orb(args.gif)


if __name__ == '__main__':
    main()

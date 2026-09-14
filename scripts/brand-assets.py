"""Builds the Elixir Books brand assets out of the source logo (mark + wordmark on transparent).

Source (not checked in): the full Elixir Books logo PNG — the red/yellow/blue chevron mark on the left,
the navy "Elixir Books" wordmark on the right. The app renders the wordmark as text (theme-aware), so
only the mark is rasterised:

  src/assets/brand/mark.png       chevron mark, square, transparent, 256px   (Logomark: auth screens, brand rows)
  public/favicon.png              same mark, 128px                           (browser tab)
  public/apple-touch-icon.png     mark on a white tile, 180px                (iOS / Android home screen)

  python scripts/brand-assets.py [--logo PATH]

Re-runnable; needs Pillow (python -m pip install --user pillow). The favicon lives in public/ because
index.html references it and Vite prefixes the deploy base for HTML asset URLs at build time.
"""
from __future__ import annotations

import argparse
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOWNLOADS = os.path.join(os.path.expanduser('~'), 'Downloads')

MARK_SIZE = 256
FAVICON_SIZE = 128
TOUCH_SIZE = 180
TOUCH_PAD = 0.16  # fraction of the tile left clear around the mark


def kb(path: str) -> str:
    return f'{os.path.getsize(path) / 1024:.1f} KB'


def column_runs(im: Image.Image) -> list[tuple[int, int]]:
    """Contiguous column spans that contain any non-transparent pixel."""
    alpha = im.getchannel('A')
    w, h = im.size
    px = alpha.load()
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for x in range(w):
        filled = any(px[x, y] for y in range(h))
        if filled and start is None:
            start = x
        elif not filled and start is not None:
            runs.append((start, x))
            start = None
    if start is not None:
        runs.append((start, w))
    return runs


def extract_mark(src: str) -> Image.Image:
    """The mark is the first column run (the wordmark sits to its right after a clear gap). Returned on a
    transparent square canvas, centred, so every consumer can treat it as a 1:1 icon."""
    im = Image.open(src).convert('RGBA')
    runs = column_runs(im)
    if len(runs) < 2:
        sys.exit(f'{src}: expected the mark and the wordmark as separate column runs, got {runs}')
    left, right = runs[0]
    strip = im.crop((left, 0, right, im.size[1]))
    strip = strip.crop(strip.getchannel('A').getbbox())
    side = max(strip.size)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(strip, ((side - strip.size[0]) // 2, (side - strip.size[1]) // 2))
    return canvas


def save(im: Image.Image, rel: str) -> None:
    out = os.path.join(ROOT, *rel.split('/'))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.save(out, optimize=True)
    print(f'  {rel:32} {im.size[0]}px  {kb(out)}')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--logo', default=os.path.join(DOWNLOADS, 'logo.png'))
    args = ap.parse_args()
    if not os.path.exists(args.logo):
        sys.exit(f'missing source artwork: {args.logo}')

    mark = extract_mark(args.logo)
    print(f'mark {mark.size[0]}px from {os.path.basename(args.logo)}')
    save(mark.resize((MARK_SIZE, MARK_SIZE), Image.LANCZOS), 'src/assets/brand/mark.png')
    save(mark.resize((FAVICON_SIZE, FAVICON_SIZE), Image.LANCZOS), 'public/favicon.png')

    inner = round(TOUCH_SIZE * (1 - 2 * TOUCH_PAD))
    tile = Image.new('RGBA', (TOUCH_SIZE, TOUCH_SIZE), (255, 255, 255, 255))
    small = mark.resize((inner, inner), Image.LANCZOS)
    tile.alpha_composite(small, ((TOUCH_SIZE - inner) // 2, (TOUCH_SIZE - inner) // 2))
    save(tile.convert('RGB'), 'public/apple-touch-icon.png')


if __name__ == '__main__':
    main()

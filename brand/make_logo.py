"""Gitzilla brand marks, hand-drawn as pixel grids and emitted as crisp SVG.

    python3 brand/make_logo.py   # writes brand/*.svg

Mark: a kaiju roaring a </> beam; its dorsal plates are { brackets.
Wordmark: GIT (kaiju green) + ZILLA (bracket magenta) in a 5x7 pixel font.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
BG = "#0a0f14"
PAL = {
    "G": "#2fe39a",  # body
    "g": "#1a9e6a",  # body shade
    "b": "#a8ffd8",  # belly
    "M": "#ff3e9a",  # bracket plates / ZILLA
    "W": "#ffffff",  # eye, teeth
    "P": "#ff3e9a",  # pupil
    "C": "#3ee6ff",  # </> beam
    "K": "#06110c",  # outline
}

# 20x20 head, facing right, jaw open. Mouth interior is left empty and gets outlined dark.
HEAD = """
....................
.......GGGGGG.......
.....GGGGGGGGGG.....
....GGGGGGGKKKGG....
....GGGGGGWWGGGGG...
...GGGGGGGWPGGGGGG..
...GGGGGGGGGGGGGGGGG
...GgGGGGGGGGGGGGGGG
...GgGGGGGGGGGWGWGWG
...GgGGGGGGGGG......
...GgGGGGGGGG.......
...GgGGGGGGGGG......
...GgGGGGGGGGGWGWGWG
...GgGGGGGGGGGGGGGG.
...GgGbbbGGGGGGGGG..
...GgbbbbbGGGGGGG...
...Ggbbbbbbbb.......
...Ggbbbbbbb........
...GgGbbbbbG........
...GgGGGGGGG........
"""

GLYPHS = {  # 3x5 beam glyphs
    "<": ["..C", ".C.", "C..", ".C.", "..C"],
    "/": ["..C", "..C", ".C.", "C..", "C.."],
    ">": ["C..", ".C.", "..C", ".C.", "C.."],
}
BRACE = [".MM", ".M.", "M..", ".M.", ".MM"]  # a { plate

FONT = {  # 5x7 pixel font for the wordmark
    "G": [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
    "I": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "Z": ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
}


def blank(w, h):
    return [["."] * w for _ in range(h)]


def paste(canvas, rows, x0, y0, color=None):
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            if c not in ".":
                canvas[y0 + y][x0 + x] = color or c


def outline(canvas):
    h, w = len(canvas), len(canvas[0])
    out = [r[:] for r in canvas]
    for y in range(h):
        for x in range(w):
            if canvas[y][x] != ".":
                continue
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and canvas[yy][xx] not in ".K":
                    out[y][x] = "K"
                    break
    return out


def mark(roar=True):
    c = blank(38 if roar else 26, 24)
    paste(c, HEAD.strip("\n").split("\n"), 4, 2)
    for y in (3, 9, 15):                       # three { plates along the spine
        paste(c, BRACE, 3, y)
    if roar:
        for i, ch in enumerate("</>"):         # the roar, 1px apart so it reads at a glance
            paste(c, GLYPHS[ch], 25 + i * 4, 10)
    return outline(c)


def wordmark():
    word = "GITZILLA"
    c = blank(len(word) * 6 + 1, 9)
    for i, ch in enumerate(word):
        paste(c, FONT[ch], 1 + i * 6, 1, "G" if i < 3 else "M")
    return outline(c)


def lockup():
    m, w = mark(), wordmark()
    scale_w = [[ch for ch in row for _ in range(2)] for row in w for _ in range(2)]  # wordmark at 2x
    c = blank(len(m[0]) + 2 + len(scale_w[0]), len(m))
    paste(c, ["".join(r) for r in m], 0, 0)
    paste(c, ["".join(r) for r in scale_w], len(m[0]) + 2, (len(m) - len(scale_w)) // 2)
    return c


def svg(grid, px=1, bg=None, pad=0):
    h, w = len(grid), len(grid[0])
    W, H = (w + 2 * pad) * px, (h + 2 * pad) * px
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" shape-rendering="crispEdges">']
    if bg:
        s.append(f'<rect width="{W}" height="{H}" fill="{bg}"/>')
    for y, row in enumerate(grid):
        x = 0
        while x < w:
            ch = row[x]
            if ch == ".":
                x += 1
                continue
            run = 1
            while x + run < w and row[x + run] == ch:
                run += 1
            s.append(f'<rect x="{(x + pad) * px}" y="{(y + pad) * px}" width="{run * px}" height="{px}" fill="{PAL[ch]}"/>')
            x += run
    s.append("</svg>")
    return "\n".join(s)


if __name__ == "__main__":
    out = lambda name, text: open(os.path.join(HERE, name), "w").write(text)
    out("gitzilla-mark.svg", svg(mark()))                     # transparent mark
    out("gitzilla-icon.svg", svg(mark(), bg=BG, pad=2))       # app icon / social
    out("gitzilla-favicon.svg", svg(mark(roar=False), bg=BG, pad=1))  # tiny sizes: head + plates only
    out("gitzilla-wordmark.svg", svg(wordmark()))
    out("gitzilla-lockup.svg", svg(lockup(), bg=BG, pad=3))   # mark + wordmark, for README / social
    print("wrote brand/*.svg")

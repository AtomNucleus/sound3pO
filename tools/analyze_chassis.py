import numpy as np
from PIL import Image
from collections import deque

img = Image.open('/workspace/src/assets/mod-desk-chassis.png').convert('RGB')
W, H = img.size
a = np.asarray(img).astype(np.int32)
R, G, B = a[..., 0], a[..., 1], a[..., 2]
lum = (0.299 * R + 0.587 * G + 0.114 * B)

# Dark elements = knobs + buttons (black plastic)
dark = lum < 70

# Module color masks (to know which module a control belongs to)
def mask_color(rc, gc, bc, tol):
    return (np.abs(R - rc) < tol) & (np.abs(G - gc) < tol) & (np.abs(B - bc) < tol)

visited = np.zeros_like(dark, dtype=bool)
comps = []
H_, W_ = dark.shape
darkl = dark.tolist()

def bbox_component(sy, sx):
    q = deque()
    q.append((sy, sx))
    visited[sy, sx] = True
    minx = maxx = sx
    miny = maxy = sy
    count = 0
    while q:
        y, x = q.popleft()
        count += 1
        if x < minx: minx = x
        if x > maxx: maxx = x
        if y < miny: miny = y
        if y > maxy: maxy = y
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny, nx = y+dy, x+dx
            if 0 <= ny < H_ and 0 <= nx < W_ and not visited[ny, nx] and dark[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))
    return miny, minx, maxy, maxx, count

# scan with stride for speed then refine? Do full but it's 1.5M px, fine.
for y in range(H_):
    row = dark[y]
    for x in range(W_):
        if row[x] and not visited[y, x]:
            comp = bbox_component(y, x)
            miny, minx, maxy, maxx, count = comp
            w = maxx - minx + 1
            h = maxy - miny + 1
            area = w * h
            if count < 120:
                continue
            comps.append((minx, miny, w, h, count, area))

# Classify
def aspect(w, h):
    return w / h if h else 0

knobs = []
buttons = []
other = []
for (x, y, w, h, count, area) in comps:
    fill = count / area
    ar = aspect(w, h)
    # knobs: near-square, round-ish, decent fill
    if 26 <= w <= 130 and 26 <= h <= 130 and 0.7 <= ar <= 1.35 and fill > 0.5:
        knobs.append((x, y, w, h, count))
    elif 30 <= w <= 200 and 18 <= h <= 90 and ar >= 1.3 and fill > 0.35:
        buttons.append((x, y, w, h, count))
    else:
        other.append((x, y, w, h, count, round(fill, 2)))

def cx(c): return c[0] + c[2] // 2
def cy(c): return c[1] + c[3] // 2

print(f"IMAGE {W}x{H}")
print(f"\nKNOBS ({len(knobs)}): x,y,w,h  center")
for c in sorted(knobs, key=lambda c: (cy(c)//60, cx(c))):
    print(f"  {c[0]:4d},{c[1]:4d},{c[2]:3d},{c[3]:3d}   c=({cx(c):4d},{cy(c):4d})")

print(f"\nBUTTONS ({len(buttons)}): x,y,w,h  center")
for c in sorted(buttons, key=lambda c: (cy(c)//40, cx(c))):
    print(f"  {c[0]:4d},{c[1]:4d},{c[2]:3d},{c[3]:3d}   c=({cx(c):4d},{cy(c):4d})")

print(f"\nOTHER large ({len(other)}):")
for c in sorted(other, key=lambda c: -c[4])[:25]:
    print(f"  x={c[0]:4d} y={c[1]:4d} w={c[2]:4d} h={c[3]:4d} px={c[4]:6d} fill={c[5]}")

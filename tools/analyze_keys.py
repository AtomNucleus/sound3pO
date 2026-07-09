import numpy as np
from PIL import Image

img = Image.open('/workspace/src/assets/mod-desk-chassis.png').convert('RGB')
W, H = img.size
a = np.asarray(img).astype(np.int32)
R, G, B = a[..., 0], a[..., 1], a[..., 2]
lum = (0.299 * R + 0.587 * G + 0.114 * B)

# ---- Keyboard region analysis ----
# Black keys are dark; white keys are bright. Scan band.
y0, y1 = 820, 950
band = lum[y0:y1, :]
col_dark = (band < 70).mean(axis=0)  # fraction dark per column
# black key columns where col_dark high
black_cols = col_dark > 0.6
# find runs
runs = []
x = 0
while x < W:
    if black_cols[x]:
        s = x
        while x < W and black_cols[x]:
            x += 1
        runs.append((s, x - 1))
    else:
        x += 1
black_runs = [(s, e) for (s, e) in runs if (e - s) > 8 and 380 < s < 1050]
print("BLACK KEY runs (x_start,x_end,center,width):")
for s, e in black_runs:
    print(f"  {s:4d}-{e:4d}  c={(s+e)//2:4d} w={e-s+1:3d}")

# White key span: look at bright band a bit lower (white keys extend below black keys)
yw0, yw1 = 900, 985
wb = lum[yw0:yw1, :]
white = (wb > 170).mean(axis=0) > 0.5
xs = np.where(white)[0]
xs = xs[(xs > 380) & (xs < 1060)]
if len(xs):
    print(f"\nWHITE KEY span: x {xs.min()} .. {xs.max()}  width={xs.max()-xs.min()}")

# vertical extent of keyboard: scan rows for the white/black key block in x 420..1010
sub = lum[:, 430:1000]
row_has_key = ((sub < 70) | (sub > 190)).mean(axis=1)
rows = np.where(row_has_key > 0.85)[0]
rows = rows[(rows > 780) & (rows < 1000)]
if len(rows):
    print(f"KEYBED vertical: y {rows.min()} .. {rows.max()}")

# ---- Transport buttons (top center) ----
# scan y 100..150 for dark/icon clusters between x 600 and 1000
ty0, ty1 = 100, 150
tb = lum[ty0:ty1, :]
tdark = (tb < 90).mean(axis=0)
tcols = tdark > 0.25
runs = []
x = 0
while x < W:
    if tcols[x]:
        s = x
        while x < W and tcols[x]:
            x += 1
        runs.append((s, x - 1))
    else:
        x += 1
print("\nTRANSPORT-area dark column runs (x600-1040):")
for s, e in runs:
    if 600 < s < 1040 and (e - s) >= 3:
        print(f"  {s:4d}-{e:4d}  c={(s+e)//2:4d} w={e-s+1:3d}")

import sys
from PIL import Image, ImageChops
import numpy as np
# fraction of pixels in the scene band (y 270..740 at 2x => crop) that differ by > 24 in any channel
def diff(a, b, box=(0, 270, 780, 745)):
    A = np.asarray(Image.open(a).convert('RGB').crop(box)).astype(int)
    B = np.asarray(Image.open(b).convert('RGB').crop(box)).astype(int)
    d = np.abs(A - B).max(axis=2)
    return (d > 24).mean()
args = sys.argv[1:]
box = (0, 270, 780, 745)
if args and args[0] == '--full':
    box = (0, 0, 780, 1688); args = args[1:]
for i in range(len(args) - 1):
    print(f"{args[i].split('/')[-1]} -> {args[i+1].split('/')[-1]}: {diff(args[i], args[i+1], box)*100:.2f}% pixels changed")

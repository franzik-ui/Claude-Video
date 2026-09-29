# Build a labelled contact sheet from render/stills for quick visual QC.
import sys, glob, os
from PIL import Image, ImageDraw
files = sorted(glob.glob(sys.argv[1] + '/*.png'))
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 3
tw, th = 640, 360
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * (th + 24)), 'black')
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((tw, th), Image.LANCZOS)
    x, y = (i % cols) * tw, (i // cols) * (th + 24)
    sheet.paste(im, (x, y + 24)); d.text((x + 6, y + 5), os.path.basename(f), fill='white')
sheet.save(sys.argv[2], quality=88)

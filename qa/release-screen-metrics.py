"""Offline analysis of exact CDP compositor PNGs; leaves original evidence untouched."""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(sys.argv[1])
capture = json.loads((root / 'capture.json').read_text())
v, r = capture['viewport'], capture['rect']
rows = []
for frame in capture['frames']:
    image = Image.open(root / frame['file']).convert('RGB')
    rgb = np.asarray(image, dtype=np.float32) / 255
    linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
    y = linear @ np.array([.2126, .7152, .0722])
    sx, sy = image.width / v['width'], image.height / v['height']
    stage = y[max(0, round(r['y'] * sy)):min(image.height, round((r['y'] + r['height']) * sy)),
              max(0, round(r['x'] * sx)):min(image.width, round((r['x'] + r['width']) * sx))]
    row = {'file': frame['file'], 'timestamp': frame['timestamp']}
    for name, pixels in [('full', y), ('stage', stage)]:
        row[name] = {'mean': float(pixels.mean()), 'nearWhite': float((pixels >= .9).mean())}
    rows.append(row)

result = {}
for name in ['full', 'stage']:
    edges = [{'at': b['timestamp'], 'delta': abs(b[name]['mean'] - a[name]['mean']), 'before': a['file'], 'after': b['file']}
             for a, b in zip(rows, rows[1:])]
    large = [e for e in edges if e['delta'] > .10]
    result[name] = {'maxNearWhite': max(r[name]['nearWhite'] for r in rows),
                    'maxSwing': max(e['delta'] for e in edges),
                    'maxFlashEdgesPerSecond': max([sum(e['at'] <= x['at'] < e['at'] + 1 for x in large) for e in large] or [0]),
                    'largestTransition': max(edges, key=lambda e: e['delta'])}
(root / 'pixel-metrics.json').write_text(json.dumps({'rows': rows, 'result': result}, indent=2))
print(json.dumps(result))

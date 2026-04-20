import json

with open('dxf_dump.json', 'r') as f:
    texts = json.load(f)

# Y-clustering
texts.sort(key=lambda t: t['y'], reverse=True)
rows = []
cur_row = []
cur_y = None

for t in texts:
    if cur_y is None:
        cur_y = t['y']
        cur_row.append(t)
    else:
        if abs(t['y'] - cur_y) < 3.5:
            cur_row.append(t)
        else:
            rows.append(cur_row)
            cur_row = [t]
            cur_y = t['y']
if cur_row:
    rows.append(cur_row)

parsed = []
for r in rows:
    r.sort(key=lambda t: t['x'])
    if len(r) >= 3:
        idx = "".join(filter(str.isdigit, str(r[0]['text']).split('.')[0]))
        if idx.isdigit():
            parsed.append({'idx': idx, 'qty': r[1]['text'], 'name': r[2]['text']})

print("Parsed", len(parsed), "rows")
for p in parsed[:10]:
    print(p)

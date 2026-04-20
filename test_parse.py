import sys

def parse_dxf(filepath):
    texts = []
    with open(filepath, 'r', encoding='ISO-8859-9', errors='ignore') as f:
        lines = [l.strip() for l in f.readlines()]
        
    in_text = False
    current = {}
    
    for i in range(len(lines)):
        code = lines[i]
        val = lines[i+1] if i+1 < len(lines) else ''
        
        if code == '0' and val in ['TEXT', 'MTEXT']:
            in_text = True
            current = {}
        elif code == '0' and in_text:
            if 'text' in current and 'y' in current and 'x' in current:
                texts.append(current)
            in_text = False
            
        if in_text:
            if code == '10': current['x'] = float(val)
            if code == '20': current['y'] = float(val)
            if code == '1': current['text'] = val
            
    print(f"Extracted {len(texts)} texts")
    # print some row 1/2 from texts
    texts = sorted(texts, key=lambda t: t['y'], reverse=True)
    for t in texts[:20]:
        print(f"Y:{t['y']} X:{t['x']} Text:{t['text']}")

parse_dxf('test1.dxf')

import re
with open('app.js', 'r') as f:
    text = f.read()

# remove strings and comments
def clean_js(js_code):
    js_code = re.sub(r'//.*', '', js_code)
    js_code = re.sub(r'/\*[\s\S]*?\*/', '', js_code)
    js_code = re.sub(r'`[\s\S]*?`', '""', js_code)
    js_code = re.sub(r'"[^"\\]*(?:\\.[^"\\]*)*"', '""', js_code)
    js_code = re.sub(r"'[^'\\]*(?:\\.[^'\\]*)*'", "''", js_code)
    return js_code

cleaned = clean_js(text)

stack = []
for i, char in enumerate(cleaned):
    if char == '{':
        stack.append(i)
    elif char == '}':
        if not stack:
            print("Extra } found")
        else:
            stack.pop()

for i in stack:
    # count lines up to i in cleaned to find approx line number
    lines = cleaned[:i].count('\n') + 1
    print(f"Unclosed '{{' at index {i}, approx line {lines}")

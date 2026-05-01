import re
with open('app.js', 'r') as f:
    text = f.read()

# carefully remove only strings and single line comments, ignoring regex literals for now
def clean_js(js_code):
    js_code = re.sub(r'//.*', '', js_code)
    js_code = re.sub(r'/\*[\s\S]*?\*/', '', js_code)
    # remove template literals
    js_code = re.sub(r'`[\s\S]*?`', '""', js_code)
    # remove string literals
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
            print(f"Extra '}}' around index {i}")
            start = max(0, i-200)
            end = min(len(cleaned), i+200)
            print("Context:\n", cleaned[start:end])
            break
        else:
            stack.pop()

if stack:
    print(f"Unclosed '{{' around indices: {stack}")

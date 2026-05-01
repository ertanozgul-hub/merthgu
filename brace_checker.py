import re
with open('app.js', 'r') as f:
    text = f.read()

# remove string literals and single line comments for simple checking
text = re.sub(r'".*?"', '""', text)
text = re.sub(r"'.*?'", "''", text)
text = re.sub(r'//.*', '', text)
text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)

stack = []
for i, char in enumerate(text):
    if char == '{':
        stack.append(i)
    elif char == '}':
        if not stack:
            print(f"Extra '}}' around index {i}")
            # print surrounding text
            start = max(0, i-50)
            end = min(len(text), i+50)
            print("Context:", text[start:end])
        else:
            stack.pop()

if stack:
    print(f"Unclosed '{{' around indices: {stack}")

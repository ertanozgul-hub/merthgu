from playwright.sync_api import sync_playwright
import os

with open('app.js', 'r') as f:
    js_code = f.read()

html = f"""
<!DOCTYPE html>
<html>
<head>
<script>
window.onerror = function(msg, url, line, col, error) {{
    console.log("SYNTAX ERROR AT LINE: " + line);
    console.log("MESSAGE: " + msg);
}};
</script>
<script>
{js_code}
</script>
</head>
<body></body>
</html>
"""

with open('test_syntax_inline.html', 'w') as f:
    f.write(html)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
    page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))
    
    filepath = "file://" + os.path.abspath("test_syntax_inline.html")
    page.goto(filepath)
    browser.close()

from playwright.sync_api import sync_playwright
import os

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
    filepath = "file://" + os.path.abspath("test_pako.html")
    page.goto(filepath)
    page.wait_for_timeout(2000)
    browser.close()

from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))
        
        print("Navigating...")
        page.goto("http://localhost:8085/order.html")
        time.sleep(1)
        
        print("Simulating drop of DXF...")
        page.evaluate("""
            const dropZone = document.getElementById('dropDXF');
            const dataTransfer = new DataTransfer();
            const file = new File(['dummy dxf content'], 'test.dxf', { type: 'application/dxf' });
            dataTransfer.items.add(file);
            const dropEvent = new DragEvent('drop', {
                dataTransfer: dataTransfer,
                bubbles: true,
                cancelable: true
            });
            dropZone.dispatchEvent(dropEvent);
        """)
        time.sleep(1)
        print("Done DXF.")
        
        print("Simulating drop of Excel...")
        page.evaluate("""
            const dropZone = document.getElementById('dropExcel');
            const dataTransfer = new DataTransfer();
            const file = new File(['dummy excel content'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            dataTransfer.items.add(file);
            const dropEvent = new DragEvent('drop', {
                dataTransfer: dataTransfer,
                bubbles: true,
                cancelable: true
            });
            dropZone.dispatchEvent(dropEvent);
        """)
        time.sleep(1)
        print("Done Excel.")
        
        browser.close()

if __name__ == "__main__":
    run()

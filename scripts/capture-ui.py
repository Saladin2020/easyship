"""Screenshot the web editor (needs `easyship serve` running).

  python3 scripts/capture-ui.py [url] [out.png] [tab]

extra args: click=<css selector> …
"""
import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8978/"
out = sys.argv[2] if len(sys.argv) > 2 else "docs/assets/editor.png"
tab = sys.argv[3] if len(sys.argv) > 3 else ""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
    pg.goto(url)
    pg.wait_for_timeout(1200)
    if tab:
        pg.locator(tab).first.click()
    pg.wait_for_timeout(1000)
    for a in sys.argv[4:]:
        if a.startswith("click="):
            pg.locator(a[6:]).first.click()
            pg.wait_for_timeout(800)
    pg.wait_for_timeout(500)
    pg.screenshot(path=out)
    b.close()
    print("errors:", errors)
    print(out)

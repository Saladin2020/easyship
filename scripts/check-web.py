"""Headless Chrome check of a shipped web build (Godot or PixiJS), served like itch.io serves it (static files, no
COOP/COEP headers).

  python3 scripts/check-web.py <web-build-dir> [screenshot.png]

Godot builds: waits for the game's "FIREFLY READY" line (any line containing READY) on the console and a drawn canvas.
PixiJS builds: waits for window.__ready, then clicks a firefly and checks the score goes up.
Prints a JSON report; exit 1 on problems or page errors.
"""
import asyncio, json, os, subprocess, sys, time
from playwright.async_api import async_playwright

DIR = sys.argv[1]
SHOT = sys.argv[2] if len(sys.argv) > 2 else None
PORT = 8998
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME_PATH", "/usr/bin/google-chrome"), args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 960, "height": 540})
        errs, logs, problems = [], [], []
        pg.on("console", lambda m: (logs.append(m.text), errs.append(f"{m.type}: {m.text}") if m.type == "error" else None))
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("response", lambda r: errs.append(f"http {r.status}: {r.url}") if r.status >= 400 and not r.url.endswith("favicon.ico") else None)
        await pg.goto(f"http://127.0.0.1:{PORT}/index.html")
        kind = "pixi" if os.path.exists(os.path.join(DIR, "game.js")) or not os.path.exists(os.path.join(DIR, "index.wasm")) else "godot"
        report = {"kind": kind}
        if kind == "godot":
            t0 = time.time()
            while time.time() - t0 < 60 and not any("READY" in l for l in logs):
                await pg.wait_for_timeout(500)
            ready = [l for l in logs if "READY" in l]
            if not ready:
                problems.append("game never printed READY")
            report["ready"] = ready[:1]
            report["seconds"] = round(time.time() - t0, 1)
            await pg.wait_for_timeout(1500)
        else:
            await pg.wait_for_function("window.__ready === true", timeout=40000)
            await pg.evaluate("window.__game.app.ticker.stop()")
            f = await pg.evaluate("(() => { const f = window.__game.flies[0]; return { x: f.x, y: f.y }; })()")
            box = await pg.locator("canvas").bounding_box()
            k = box["width"] / 480
            before = await pg.evaluate("window.__game.state.score")
            await pg.mouse.click(box["x"] + f["x"] * k, box["y"] + f["y"] * k)
            after = await pg.evaluate("window.__game.state.score")
            if after != before + 1:
                problems.append(f"click on a firefly: score {before} → {after}")
            report["score"] = [before, after]
            report["pixi_local"] = any(r for r in [os.path.exists(os.path.join(DIR, "pixi.min.js"))])
            await pg.evaluate("window.__game.app.ticker.start()")
            await pg.wait_for_timeout(600)
        # the canvas must not be blank
        px = await pg.evaluate("""(() => { if (window.__game) window.__game.app.render(); const c = document.querySelector('canvas'); if (!c) return 0;
          const o = document.createElement('canvas'); o.width = 64; o.height = 36; const g = o.getContext('2d');
          g.drawImage(c, 0, 0, 64, 36); const d = g.getImageData(0, 0, 64, 36).data; const s = new Set();
          for (let i = 0; i < d.length; i += 4) s.add(d[i] >> 4 << 8 | d[i + 1] >> 4 << 4 | d[i + 2] >> 4); return s.size; })()""")
        report["colours"] = px
        if px < 4:
            problems.append(f"canvas looks blank ({px} colours)")
        if SHOT:
            await pg.screenshot(path=SHOT)
        real = [e for e in errs if "GL Driver Message" not in e and "Failed to load resource" not in e and "AudioContext" not in e]
        report["problems"] = problems
        report["errors"] = real
        print(json.dumps(report, ensure_ascii=False))
        await b.close()
        if problems or real:
            sys.exit(1)


try:
    asyncio.run(main())
finally:
    srv.terminate()

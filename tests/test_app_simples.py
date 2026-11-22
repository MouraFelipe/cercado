"""App instalável (manifest, service worker, sem internet), tela sem piscar e regras Simples (1 casa, sem derrubador),
inclusive no online com PeerJS simulado. Uso: python tests/test_app_simples.py"""
import os, subprocess, sys, time
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); DOCS = os.path.join(HERE, "..", "docs")
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8766", "--directory", DOCS], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = "http://localhost:8766/index.html"; errors = []
def page(ctx, url=URL):
    p = ctx.new_page(); p.on("pageerror", lambda e: errors.append(str(e))); p.goto(url); p.wait_for_selector(".opt"); return p
def place(p, cells):
    for r, c in cells: p.click(f'[data-cell="{r},{c}"]'); time.sleep(.15)
try:
  with sync_playwright() as pw:
    b = pw.chromium.launch(**({"executable_path": os.environ["CHROME"]} if os.environ.get("CHROME") else {}))
    # 1) app: manifest, service worker e abrir sem internet
    ctx = b.new_context(viewport={"width": 390, "height": 844}); p = page(ctx)
    p.evaluate("navigator.serviceWorker.ready.then(()=>1)"); time.sleep(1)
    assert p.evaluate("fetch('manifest.webmanifest').then(r=>r.json()).then(j=>j.short_name)") == "Cercado"
    p.click("#inst"); p.wait_for_selector(".steps"); print("tela Baixar o app ok")
    p.reload(); p.wait_for_selector(".opt"); time.sleep(.8)
    ctx.set_offline(True); p.reload(); p.wait_for_selector(".opt", timeout=8000)
    p.click("#ai"); p.click("#go"); p.wait_for_selector("#board"); print("sem internet: abre e joga contra o computador")
    ctx.set_offline(False); ctx.close()
    # 2) regras Simples na partida local
    ctx = b.new_context(viewport={"width": 390, "height": 844}); p = page(ctx)
    p.click('[data-r="simples"]'); assert "1 casa" in p.inner_text(".rulesel p")
    p.click("#local"); p.wait_for_selector("#board")
    p.evaluate("window.__scr=document.querySelector('.screen'); window.__base=document.querySelector('svg.board.base')")
    place(p, [(0, 0), (6, 6), (6, 0), (0, 6)])
    assert p.evaluate("window.__scr===document.querySelector('.screen') && window.__base===document.querySelector('svg.board.base')"), "a tela foi recriada"
    print("sem piscar: tela e madeira continuam as mesmas depois das jogadas")
    assert p.evaluate("G.steps") == 1 and p.query_selector(".hm") is None and p.query_selector("#brk") is None
    p.click('[data-cell="1,1"]'); time.sleep(.2)
    far = p.evaluate("Math.max(...C.destinations(G,sel).map(([r,c])=>Math.abs(r-1)+Math.abs(c-1)))")
    assert far == 1, far; print("Simples local: anda 1 casa, sem derrubador |", p.inner_text(".hint"))
    p.click("#menu"); assert "Simples" in p.inner_text("#cont"); p.click('[data-r="classico"]'); ctx.close()
    # 3) regras Simples no online (PeerJS simulado): quem cria a sala define
    ctx = b.new_context(); ctx.add_init_script(open(os.path.join(HERE, "mock_peer.js")).read())
    A = page(ctx, URL + "?peer"); A.click('[data-r="simples"]'); A.click("#online"); A.click("#create"); A.wait_for_selector(".code")
    code = A.inner_text(".code").strip()
    B = page(ctx, URL + "?peer"); B.click('[data-r="classico"]'); B.click("#online"); B.fill("#code", code); B.click("#join")
    A.wait_for_selector("#board"); B.wait_for_selector("#board")
    assert B.evaluate("G.rules") == "simples" and "SIMPLES" in B.inner_text(".gtop .t").upper()
    print("Simples online: o convidado recebe as regras da sala")
    b.close()
  print("erros:", errors); assert not errors
finally:
    srv.terminate()

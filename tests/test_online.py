import json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright
ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs"); MODE = sys.argv[1] if len(sys.argv) > 1 else "site"
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "--directory", ART], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
BASE = "http://localhost:8765/index.html" + ("?peer" if MODE=="site" else "")
MOCK = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "mock_room.js" if MODE=="claude" else "mock_peer.js")).read()
errors = []
def G(p): return p.evaluate("(()=>{ if(!G) return null; const x=JSON.parse(JSON.stringify(G)); delete x._celebrated; return JSON.stringify(x); })()")
def mk(ctx, url=BASE):
    p = ctx.new_page(); p.on("pageerror", lambda e: errors.append(str(e))); p.goto(url); return p
try:
  with sync_playwright() as pw:
    b = pw.chromium.launch(**({"executable_path": os.environ["CHROME"]} if os.environ.get("CHROME") else {}))
    ctx = b.new_context(); ctx.add_init_script(MOCK)
    A = mk(ctx); A.click("#online"); A.click("#create"); A.wait_for_selector(".code")
    code = A.inner_text(".code").strip(); print("code", code)
    B = mk(ctx); B.click("#online"); B.fill("#code", code.lower()); B.click("#join")
    A.wait_for_selector("#board"); B.wait_for_selector("#board")
    print("A hint:", A.inner_text(".hint"), "| B hint:", B.inner_text(".hint"))
    # colocação por clique
    for who, cell in [(A,"0,0"),(B,"6,6"),(B,"3,3"),(A,"0,6")]:
        who.click(f'[data-cell="{cell}"]'); time.sleep(0.3)
        assert G(A)==G(B), "estado diferente após colocação"
    print("fase:", A.evaluate("G.phase"), "vez:", A.evaluate("G.turn"))
    # uma jogada por clique no anfitrião (peça, destino, muro)
    A.evaluate("""(()=>{})()""")
    mv = A.evaluate("C.aiMove(G,'normal')")
    s = A.evaluate(f"G.stones[{mv['s']}]")
    A.click(f'[data-cell="{s["r"]},{s["c"]}"]'); time.sleep(.1)
    if [s["r"],s["c"]] != [mv["r"],mv["c"]]: A.click(f'[data-cell="{mv["r"]},{mv["c"]}"]'); time.sleep(.1)
    else: A.click(f'[data-cell="{mv["r"]},{mv["c"]}"]'); time.sleep(.1)
    w = mv["w"]; A.click(f'[data-edge="{w["k"]},{w["r"]},{w["c"]}"]', force=True); time.sleep(.4)
    assert G(A)==G(B) and A.evaluate("G.moves")==1, "clique de jogada não sincronizou"
    print("jogada por clique ok; vez agora:", B.evaluate("G.turn"), B.inner_text(".hint"))
    # 3º aparelho tenta entrar
    Cp = mk(ctx); Cp.click("#online"); Cp.fill("#code", code); Cp.click("#join"); Cp.wait_for_selector(".toast", timeout=8000)
    print("3º aparelho:", Cp.inner_text(".toast")); Cp.close(); time.sleep(.3)
    # convidado recarrega pelo link e volta
    n = 0
    while True:
        over = A.evaluate("G.over")
        if over: break
        turn = A.evaluate("G.turn"); P = A if turn==1 else B
        if n==6:
            if MODE=="claude":
                B.close(); time.sleep(.5); print("A banner:", A.inner_text(".banner") if A.query_selector(".banner") else None)
                B = mk(ctx, BASE+"#sala-"+code)
            else:
                B.goto("about:blank"); time.sleep(.5); print("A banner:", A.inner_text(".banner") if A.query_selector(".banner") else None)
                B.goto(BASE+"#sala-"+code)
            B.wait_for_selector("#board", timeout=8000); time.sleep(.5)
            assert G(A)==G(B), "estado diferente após reconexão"; print("reconexão ok; A banner:", A.query_selector(".banner"))
            P = A if A.evaluate("G.turn")==1 else B
        assert P.evaluate("myTurn()"), "não é a vez de quem deveria"
        other = B if P is A else A
        assert not other.evaluate("myTurn()")
        m = P.evaluate("C.aiMove(G,'normal')"); P.evaluate(f"act({json.dumps(m)})"); time.sleep(.25)
        assert G(A)==G(B), f"estado diferente na jogada {n}"; n += 1
    print("jogadas:", n, "resultado:", A.evaluate("G.result"))
    print("fim A:", A.inner_text(".sheet h2"), "| fim B:", B.inner_text(".sheet h2"), "| overlays A/B:", len(A.query_selector_all(".over")), len(B.query_selector_all(".over")))
    B.click("#again"); time.sleep(.5)
    print("jogar de novo -> fase A:", A.evaluate("G.phase"), "vez:", A.evaluate("G.turn"), "igual:", G(A)==G(B), "overlays:", len(A.query_selector_all(".over")))
    print("maior presença (bytes):", A.evaluate("window.__maxPres||0"), B.evaluate("window.__maxPres||0"))
    # sala inexistente
    D = mk(ctx); D.click("#online"); D.fill("#code", "ZZZZZ"); D.click("#join"); D.wait_for_selector(".toast", timeout=25000); print("sala inexistente:", D.inner_text(".toast"))
    if MODE=="site":
        print("link da sala (site):", A.evaluate(f"roomLink('{code}')"))
        b.close(); raise SystemExit
    # sem o recurso room (como num navegador comum)
    ctx2 = b.new_context(); E = ctx2.new_page(); E.on("pageerror", lambda e: errors.append(str(e))); E.goto(BASE); E.click("#online"); E.click("#create")
    E.wait_for_selector("text=Online indisponível", timeout=10000); print("sem room:", E.inner_text("h1"))
    
    A.click("#menu"); A.click("#menu")
    b.close()
finally:
    srv.terminate()
    print("erros de página:", errors)

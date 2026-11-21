import { useEffect, useRef, useState } from "react";
import { Action, Game, Player, RuleOptions, DEFAULT_OPTIONS, apply, cloneGame, newGame, legalActions, breakableWalls } from "./engine/rules";
(window as any).__engine = { legalActions, breakableWalls };
import { chooseAction, Level } from "./engine/ai";
import GameView from "./ui/GameView";
import { COLORS, Names, defaultNames } from "./ui/theme";
import { Link, joinRoom, newCode, openRoom, HostHandle } from "./net/link";

type Screen = "home" | "how" | "setup-local" | "setup-ai" | "online" | "lobby" | "game";
type Mode = "local" | "ai" | "online";
const SAVE = "cercado2-save";

function toast(msg: string) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2800); }
let actx: AudioContext | null = null;
function tone(fs: number[], vol = 0.1) { try { actx = actx || new AudioContext(); fs.forEach((f, i) => { const o = actx!.createOscillator(), gn = actx!.createGain(); o.type = "triangle"; o.frequency.value = f; const t = actx!.currentTime + i * 0.08; gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(vol, t + 0.015); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); o.connect(gn).connect(actx!.destination); o.start(t); o.stop(t + 0.2); }); } catch { /* sem som */ } }
const sound = (a: Action) => ({ place: () => tone([440, 660]), move: () => tone([330, 250]), break: () => tone([200, 150, 110], 0.12), resign: () => tone([300, 200]) })[a.t]();

/* ---------------- opções de regra (pontos sem confirmação) ---------------- */
function RulesOptions({ opts, set, fixedPlayers }: { opts: RuleOptions; set: (o: RuleOptions) => void; fixedPlayers?: boolean }) {
  const seg = <K extends keyof RuleOptions>(k: K, items: [RuleOptions[K], string][]) => (
    <div className="seg">{items.map(([v, l]) => <button key={String(v)} className={opts[k] === v ? "on" : ""} onClick={() => set({ ...opts, [k]: v })}>{l}</button>)}</div>
  );
  return (
    <div className="opts">
      {!fixedPlayers && <><b>Jogadores</b>{seg("players", [[2, "2 jogadores"], [3, "3 jogadores"]])}</>}
      <details>
        <summary>Regras ajustáveis <small>(pontos ainda sem confirmação oficial)</small></summary>
        <b>Movimento</b>{seg("minSteps", [[0, "0 a 2 casas (pode ficar parado)"], [1, "1 a 2 casas"]])}
        <b>Movimento de 2 casas</b>{seg("allowTurn", [[true, "Pode fazer curva"], [false, "Só em linha reta"]])}
        {opts.players === 2 && <><b>Peças (2 jogadores)</b>{seg("twoPlayerStones", [[2, "2 cada"], [4, "4 cada (2 já no tabuleiro)"]])}</>}
        {opts.players === 3 && <><b>Derrubar parede (3 jogadores)</b>{seg("wallBreak", [[true, "Ativado"], [false, "Desativado"]])}</>}
      </details>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [mode, setMode] = useState<Mode>("local");
  const [g, setG] = useState<Game | null>(null);
  const [opts, setOpts] = useState<RuleOptions>({ ...DEFAULT_OPTIONS });
  const [level, setLevel] = useState<Level>("normal");
  const [names, setNames] = useState<Names>(defaultNames());

  /* ---------------- online ---------------- */
  const [code, setCode] = useState("");
  const [role, setRole] = useState<"host" | "guest" | null>(null);
  const [seat, setSeat] = useState<Player>(1);
  const [seats, setSeats] = useState<Record<number, boolean>>({});
  const [lost, setLost] = useState(false);
  const hostRef = useRef<HostHandle | null>(null);
  const links = useRef<Record<number, Link | null>>({});
  const guestLink = useRef<Link | null>(null);
  const gRef = useRef<Game | null>(null); gRef.current = g;
  const optsRef = useRef(opts); optsRef.current = opts;

  /* usado pelos testes automáticos no navegador */
  useEffect(() => { const w = window as any; w.__g = g; w.__seat = seat; w.__mode = mode; }, [g, seat, mode]);

  /* salvar partida local / contra o computador */
  useEffect(() => {
    if (!g || mode === "online") return;
    try { if (g.phase !== "over") localStorage.setItem(SAVE, JSON.stringify({ g, mode, level, names })); else localStorage.removeItem(SAVE); } catch { /* sem armazenamento */ }
  }, [g, mode, level, names]);
  const saved = (() => { try { return JSON.parse(localStorage.getItem(SAVE) || "null"); } catch { return null; } })();

  /* vez do computador */
  useEffect(() => {
    if (mode !== "ai" || !g || g.phase === "over" || g.turn !== 2) return;
    const t = setTimeout(() => {
      const a = chooseAction(cloneGame(g), level); if (!a) return;
      const g2 = cloneGame(g); if (!apply(g2, a)) { sound(a); setG(g2); }
    }, 550);
    return () => clearTimeout(t);
  }, [g, mode, level]);

  /* abrir direto pelo link da sala */
  useEffect(() => {
    const m = location.hash.match(/^#sala-([A-Z0-9]{5})$/i);
    if (m) { history.replaceState(null, "", location.pathname + location.search); guestJoin(m[1].toUpperCase()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startLocal(m: Mode, o = opts) {
    leaveOnline();
    const o2 = m === "ai" ? { ...o, players: 2 as const } : o;
    setMode(m); setOpts(o2);
    setNames(m === "ai" ? { 1: "Você", 2: "Computador", 3: "" } : defaultNames());
    setG(newGame(o2)); setScreen("game");
  }
  function act(a: Action): string | null {
    if (!g) return "Sem partida.";
    if (mode === "online" && role === "guest") { guestLink.current?.send({ t: "act", a }); return null; }
    const g2 = cloneGame(g);
    const err = apply(g2, a, mode === "online" ? seat : undefined);
    if (err) return err;
    sound(a); setG(g2);
    if (mode === "online") broadcast({ t: "state", g: g2 });
    return null;
  }

  /* ---------- anfitrião ---------- */
  function broadcast(m: unknown) { Object.values(links.current).forEach(l => l?.send(m)); }
  function pushLobby(next?: Record<number, boolean>) {
    const s = next ?? { 1: true, 2: !!links.current[2], 3: !!links.current[3] };
    setSeats(s); broadcast({ t: "lobby", seats: s, players: optsRef.current.players });
  }
  async function hostCreate() {
    leaveOnline();
    const c = newCode();
    setRole("host"); setSeat(1); setMode("online"); setCode(c); setG(null); setLost(false);
    links.current = {}; setSeats({ 1: true }); setScreen("lobby");
    try {
      hostRef.current = await openRoom(c, link => {
        link.onData = (m: any) => {
          if (m.t === "hello") {
            const n = optsRef.current.players;
            let s: number | null = m.seat && m.seat >= 2 && m.seat <= n && !links.current[m.seat] ? m.seat : null;
            if (s === null) for (let i = 2; i <= n; i++) if (!links.current[i]) { s = i; break; }
            if (s === null) { link.send({ t: "full" }); setTimeout(() => link.close(), 400); return; }
            links.current[s] = link; const mySeat = s;
            link.closeHandler = () => { if (links.current[mySeat] === link) { links.current[mySeat] = null; pushLobby(); toast(`${COLORS[mySeat].name} saiu da sala`); } };
            link.send({ t: "welcome", seat: s, players: n, code: c });
            pushLobby();
            if (gRef.current) link.send({ t: "state", g: gRef.current });
            tone([520, 780]); toast(`${COLORS[s].name} entrou na sala`);
          }
          if (m.t === "act" && gRef.current) {
            const mySeat = Number(Object.keys(links.current).find(k => links.current[+k] === link));
            const g2 = cloneGame(gRef.current);
            const isResign = m.a?.t === "resign";
            const err = isResign ? (m.a.p === mySeat ? apply(g2, m.a) : "Jogador inválido.") : apply(g2, m.a, mySeat);
            if (err) { link.send({ t: "err", msg: err }); return; }
            sound(m.a); setG(g2); broadcast({ t: "state", g: g2 });
          }
        };
      }, msg => toast(msg));
    } catch (e: any) {
      if (e.message === "codigo-ocupado") return hostCreate();
      toast(e.message); setScreen("online");
    }
  }
  function hostStart() {
    const g2 = newGame(optsRef.current); setG(g2); setScreen("game"); broadcast({ t: "state", g: g2 });
  }

  /* ---------- convidado ---------- */
  async function guestJoin(c: string) {
    leaveOnline();
    setRole("guest"); setMode("online"); setCode(c); setG(null); setLost(false); setScreen("lobby");
    try {
      const l = await joinRoom(c); guestLink.current = l;
      const prev = Number(sessionStorage.getItem("cercado-seat-" + c)) || undefined;
      l.onData = (m: any) => {
        if (m.t === "welcome") { setSeat(m.seat); sessionStorage.setItem("cercado-seat-" + c, String(m.seat)); setOpts(o => ({ ...o, players: m.players })); }
        if (m.t === "lobby") { setSeats(m.seats); setOpts(o => ({ ...o, players: m.players })); }
        if (m.t === "state") { const prevG = gRef.current; setG(m.g); setOpts(m.g.opts); setScreen("game"); setLost(false);
          const last = m.g.history[m.g.history.length - 1]; if (prevG && last && m.g.history.length > prevG.history.length) sound({ t: last.t === "pass" ? "move" : last.t } as Action); }
        if (m.t === "err") toast(m.msg);
        if (m.t === "full") { toast("Essa sala já está cheia."); setScreen("online"); }
      };
      l.closeHandler = () => { setLost(true); };
      l.send({ t: "hello", seat: prev });
    } catch (e: any) { toast(e.message); setScreen("online"); }
  }
  function leaveOnline() {
    hostRef.current?.close(); hostRef.current = null;
    Object.values(links.current).forEach(l => l?.close()); links.current = {};
    guestLink.current?.close(); guestLink.current = null;
    setRole(null); setLost(false);
  }
  function toMenu() { if (mode === "online") leaveOnline(); setScreen("home"); }

  /* ---------------- telas ---------------- */
  if (screen === "game" && g) {
    const online = mode === "online";
    const nm: Names = online ? { 1: COLORS[1].name, 2: COLORS[2].name, 3: COLORS[3].name } : names;
    if (online) nm[seat] = "Você";
    const offline = online && role === "host" ? g.order.filter(q => q !== 1 && !seats[q]) : [];
    return (
      <GameView
        g={g} names={nm}
        title={online ? `Online · sala ${code}` : mode === "ai" ? "Contra o computador" : `Local · ${g.opts.players} jogadores`}
        canControl={q => mode === "local" || (mode === "ai" && q === 1) || (online && q === seat)}
        waitingText={mode === "ai" ? "O computador está pensando…" : online ? `Vez de ${nm[g.turn]}. Aguarde…` : undefined}
        onAction={act}
        onRestart={online ? (role === "host" ? hostStart : undefined) : () => startLocal(mode, g.opts)}
        onAbandon={() => { if (online) act({ t: "resign", p: seat }); else if (mode === "ai") act({ t: "resign", p: 1 }); else toMenu(); }}
        onMenu={toMenu}
        resultTitle={gg => { const r = gg.result!; if (mode === "ai" || online) { const me = mode === "ai" ? 1 : seat; if (r.winners.length === 1) return r.winners[0] === me ? "Você venceu!" : `${nm[r.winners[0]]} venceu`; }
          return r.winners.length === 1 ? `${nm[r.winners[0]]} venceu!` : r.winners.length ? "Empate!" : "Partida encerrada"; }}
        banner={<>
          {lost && <div className="banner">⚠️ Conexão perdida. <button className="btn ghost slim" onClick={() => guestJoin(code)}>Reconectar</button></div>}
          {offline.length > 0 && g.phase !== "over" && <div className="banner">⚠️ {offline.map(q => COLORS[q].name).join(" e ")} desconectou. A partida continua quando voltar pelo mesmo link.</div>}
          {online && role === "guest" && g.phase === "over" && <p className="muted center small">Só quem criou a sala pode começar uma nova partida.</p>}
        </>}
      />
    );
  }

  if (screen === "lobby") {
    const link = location.origin + location.pathname + location.search + "#sala-" + code;
    const n = opts.players, full = Array.from({ length: n }, (_, i) => i + 1).every(q => seats[q]);
    return (
      <div className="screen">
        <button className="back" onClick={toMenu}>← Sair</button>
        <h1 className="h1">{role === "host" ? "Sala criada" : "Sala"}</h1>
        {role === "host" ? <p className="muted">Mande o código ou o link para {n === 3 ? "os amigos" : "o amigo"}:</p> : <p className="muted">Conectando à sala…</p>}
        <div className="code">{code}</div>
        {role === "host" && <>
          <div className="linkbox" id="lk">{link}</div>
          <div className="stack">
            <button className="btn" onClick={async () => { try { if (navigator.share) { await navigator.share({ title: "Cercado", text: "Entra na minha sala do Cercado:", url: link }); return; } } catch { /* cancelado */ } try { await navigator.clipboard.writeText(link); toast("Link copiado!"); } catch { toast("Copie o link acima"); } }}>Compartilhar link</button>
            <a className="btn ghost" href={`https://wa.me/?text=${encodeURIComponent("Bora jogar Cercado? Entra na minha sala: " + link)}`} target="_blank" rel="noopener">Enviar pelo WhatsApp</a>
          </div>
        </>}
        <div className="seats">{Array.from({ length: n }, (_, i) => i + 1).map(q => (
          <div key={q} className={`seat ${seats[q] ? "in" : ""}`}><span className="st" style={{ background: COLORS[q].c }} />
            <b>{COLORS[q].name}{q === seat ? " (você)" : ""}</b><small>{seats[q] ? "na sala" : "aguardando…"}</small></div>))}</div>
        {role === "host"
          ? <button className="btn" disabled={!full} onClick={hostStart}>{full ? "Começar partida" : "Aguardando jogadores…"}</button>
          : <p className="muted center">Aguardando quem criou a sala começar a partida…</p>}
        <p className="muted small center">A ordem dos jogadores é sorteada no início.</p>
      </div>
    );
  }

  if (screen === "online") {
    return (
      <div className="screen">
        <button className="back" onClick={() => setScreen("home")}>← Voltar</button>
        <h1 className="h1">Online</h1>
        <p className="muted">Cada pessoa joga no seu celular. Quem cria a sala escolhe as regras e manda o código.</p>
        <RulesOptions opts={opts} set={setOpts} />
        <button className="btn" onClick={hostCreate}>Criar sala</button>
        <p className="center muted strong">ou entre numa sala</p>
        <input className="inp" id="code" maxLength={5} placeholder="CÓDIGO" autoComplete="off"
          onInput={e => { const t = e.currentTarget; t.value = t.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); }} />
        <button className="btn ghost" onClick={() => { const v = (document.getElementById("code") as HTMLInputElement).value; if (v.length !== 5) return toast("O código tem 5 letras/números"); guestJoin(v); }}>Entrar</button>
      </div>
    );
  }

  if (screen === "setup-local" || screen === "setup-ai") {
    const ai = screen === "setup-ai";
    return (
      <div className="screen">
        <button className="back" onClick={() => setScreen("home")}>← Voltar</button>
        <h1 className="h1">{ai ? "Contra o computador" : "Partida local"}</h1>
        <p className="muted">{ai ? <>Você joga com as peças <b style={{ color: COLORS[1].c }}>Coral</b>. A ordem é sorteada.</> : "Todos jogam neste aparelho, passando a vez. A ordem é sorteada."}</p>
        {ai && <><b>Nível</b><div className="seg">{(["easy", "normal"] as Level[]).map(l => <button key={l} className={level === l ? "on" : ""} onClick={() => setLevel(l)}>{l === "easy" ? "Fácil" : "Normal"}</button>)}</div></>}
        <RulesOptions opts={ai ? { ...opts, players: 2 } : opts} set={setOpts} fixedPlayers={ai} />
        <button className="btn" onClick={() => startLocal(ai ? "ai" : "local")}>Começar</button>
      </div>
    );
  }

  if (screen === "how") return <HowTo back={() => setScreen("home")} />;

  return (
    <div className="screen">
      <div className="hero"><h1>Cerca<span>d</span><i>o</i></h1><p>Mova, construa paredes e cerque o maior território.</p></div>
      <Mini />
      <div className="stack">
        {saved?.g && saved.g.phase !== "over" && <button className="opt" onClick={() => { leaveOnline(); setG(saved.g); setMode(saved.mode); setLevel(saved.level); setNames(saved.names); setOpts(saved.g.opts); setScreen("game"); }}>
          <span className="e">▶️</span><div><b>Continuar partida</b><span>{saved.mode === "ai" ? "Contra o computador" : `Local · ${saved.g.opts.players} jogadores`}</span></div></button>}
        <button className="opt" onClick={() => setScreen("online")}><span className="e">🌐</span><div><b>Online</b><span>2 ou 3 jogadores, cada um no seu celular</span></div></button>
        <button className="opt" onClick={() => setScreen("setup-ai")}><span className="e">🤖</span><div><b>Contra o computador</b><span>Você contra a IA</span></div></button>
        <button className="opt" onClick={() => setScreen("setup-local")}><span className="e">👥</span><div><b>Local</b><span>2 ou 3 jogadores no mesmo aparelho</span></div></button>
        <button className="opt" onClick={() => setScreen("how")}><span className="e">📖</span><div><b>Como jogar</b><span>Regras em 1 minuto</span></div></button>
      </div>
    </div>
  );
}

function Mini() {
  const c1 = COLORS[1], c2 = COLORS[2], c3 = COLORS[3];
  return (
    <svg className="mini" viewBox="0 0 140 140" aria-hidden>
      <rect x="2" y="2" width="136" height="136" rx="14" fill="#E8DCC6" />
      {[...Array(5)].map((_, r) => [...Array(5)].map((_, c) => <rect key={`${r}${c}`} x={10 + c * 24} y={10 + r * 24} width="22" height="22" rx="4" fill={r < 2 && c < 3 ? c1.l : r > 2 && c > 2 ? c2.l : r > 2 && c < 2 ? c3.l : "#F8F2E7"} />))}
      <rect x="9" y="57" width="74" height="5" rx="2.5" fill={c1.c} /><rect x="81" y="9" width="5" height="50" rx="2.5" fill={c1.c} />
      <rect x="81" y="81" width="50" height="5" rx="2.5" fill={c2.c} /><rect x="81" y="81" width="5" height="50" rx="2.5" fill={c2.c} />
      <rect x="9" y="81" width="50" height="5" rx="2.5" fill={c3.c} /><rect x="57" y="81" width="5" height="50" rx="2.5" fill={c3.c} />
      <circle cx="45" cy="21" r="8" fill={c1.c} /><circle cx="21" cy="45" r="8" fill={c1.c} />
      <circle cx="117" cy="117" r="8" fill={c2.c} /><circle cx="21" cy="117" r="8" fill={c3.c} />
    </svg>
  );
}

function HowTo({ back }: { back: () => void }) {
  return (
    <div className="screen rules">
      <button className="back" onClick={back}>← Voltar</button>
      <h1 className="h1">Como jogar</h1>
      <div className="box">🎯 <b>Objetivo:</b> no fim, ter mais casas cercadas só com peças suas.</div>
      <ol>
        <li><b>Preparação:</b> a ordem é sorteada. Cada jogador tem 2 peças: a 1ª é posicionada na ordem e a 2ª na ordem inversa.</li>
        <li><b>Na sua vez:</b> mova uma peça sua até 2 casas, na horizontal ou vertical. Não dá para atravessar paredes ou peças, nem parar em casa ocupada.</li>
        <li><b>Depois de mover, construa 1 parede</b> num dos lados livres da casa onde a peça parou (a borda do tabuleiro já é parede). Paredes não se sobrepõem.</li>
        <li><b>🔨 Derrubar parede (só com 3 jogadores):</b> uma vez por partida, na sua vez e antes de mover, derrube uma parede encostada numa peça sua.</li>
        <li><b>Fim:</b> quando todas as áreas fechadas tiverem peças de um jogador só. Cada área só com peças suas vale 1 ponto por casa; áreas vazias não contam.</li>
        <li><b>Empate:</b> vence quem tiver a maior área única.</li>
      </ol>
      <div className="box small">⚙️ Alguns detalhes não têm confirmação oficial (ficar parado, fazer curva, peças com 2 jogadores). Eles podem ser ajustados em <b>Regras ajustáveis</b> antes da partida.</div>
      <button className="btn" onClick={back}>Entendi!</button>
    </div>
  );
}

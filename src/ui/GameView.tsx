import { useEffect, useMemo, useState } from "react";
import { Action, Cell, Edge, Game, Player, breakableWalls, destinations, freeEdges, sameEdge, stoneAt, territory } from "../engine/rules";
import Board, { Marks } from "./Board";
import { COLORS, Names, describe, sameCell } from "./theme";

export interface GameViewProps {
  g: Game;
  names: Names;
  title: string;
  canControl: (p: Player) => boolean;        // quem pode jogar neste aparelho
  waitingText?: string;                       // texto quando não é a vez de quem está aqui
  onAction: (a: Action) => string | null;
  onRestart?: () => void;                     // undefined = não pode reiniciar (ex.: convidado online)
  onAbandon: () => void;
  onMenu: () => void;
  banner?: React.ReactNode;
  resultTitle?: (g: Game) => string;
}

type Step = { kind: "idle" } | { kind: "place"; cell: Cell } | { kind: "stone"; id: number } | { kind: "dest"; id: number; to: Cell }
  | { kind: "wall"; id: number; to: Cell; wall: Edge } | { kind: "breaking" } | { kind: "break"; e: Edge };

export default function GameView(props: GameViewProps) {
  const { g, names, canControl, onAction } = props;
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [err, setErr] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(true);
  const [armed, setArmed] = useState<"" | "restart" | "abandon">("");
  const mine = g.phase !== "over" && canControl(g.turn);
  const p = g.turn;

  // a cada mudança da partida, limpa a seleção
  useEffect(() => { setStep({ kind: "idle" }); setErr(null); }, [g.history.length, g.turn, g.phase, g.brokeThisTurn]);
  useEffect(() => { if (g.phase === "over") setShowResult(true); }, [g.phase]);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(""), 3000); return () => clearTimeout(t); }, [armed]);

  const ter = useMemo(() => territory(g), [g]);
  const breakables = mine && g.phase === "play" ? breakableWalls(g, p) : [];

  /* ---------------- cliques ---------------- */
  function clickCell(c: Cell) {
    if (!mine) return;
    setErr(null);
    if (g.phase === "place") { if (!stoneAt(g, c.r, c.c)) setStep({ kind: "place", cell: c }); else setErr("Essa casa já está ocupada."); return; }
    if (step.kind === "breaking" || step.kind === "break") { setStep({ kind: "idle" }); return; }
    const s = stoneAt(g, c.r, c.c);
    const selId = step.kind === "stone" || step.kind === "dest" || step.kind === "wall" ? step.id : null;
    if (selId !== null && destinations(g, selId).some(d => sameCell(d, c))) { setStep({ kind: "dest", id: selId, to: c }); return; }
    if (s && s.p === p) {
      if (!destinations(g, s.id).length) { setErr("Essa peça não tem para onde ir."); return; }
      setStep({ kind: "stone", id: s.id }); return;
    }
    setStep({ kind: "idle" });
  }
  function clickEdge(e: Edge) { if (step.kind === "dest" || step.kind === "wall") setStep({ kind: "wall", id: step.id, to: step.to, wall: e }); }
  function confirm() {
    let a: Action | null = null;
    if (step.kind === "place") a = { t: "place", r: step.cell.r, c: step.cell.c };
    if (step.kind === "wall") a = { t: "move", stone: step.id, to: step.to, wall: step.wall };
    if (step.kind === "break") a = { t: "break", e: step.e };
    if (!a) return;
    const e = onAction(a);
    if (e) setErr(e);
  }

  /* ---------------- marcas no tabuleiro ---------------- */
  const marks: Marks = {};
  if (mine) {
    if (step.kind === "place") marks.ghost = { cell: step.cell, p };
    if (step.kind === "stone") { marks.selected = step.id; marks.dests = destinations(g, step.id); }
    if (step.kind === "dest" || step.kind === "wall") {
      marks.selected = step.id; marks.ghost = { cell: step.to, p };
      marks.dests = destinations(g, step.id).filter(d => !sameCell(d, step.to));
      marks.slots = freeEdges(g, step.to.r, step.to.c).filter(e => !(step.kind === "wall" && sameEdge(e, step.wall)));
      if (step.kind === "wall") marks.wall = step.wall;
    }
    if (step.kind === "breaking") marks.breakables = breakables;
    if (step.kind === "break") { marks.breakables = breakables.filter(e => !sameEdge(e, step.e)); marks.breakSel = step.e; }
  }

  /* ---------------- textos ---------------- */
  const who = (q: Player) => names[q];
  let hint = "";
  if (g.phase === "over") hint = "Fim de partida";
  else if (!mine) hint = props.waitingText ?? `Vez de ${who(p)}…`;
  else {
    const pre = `${who(p)}: `;
    if (g.phase === "place") {
      const left = g.placeQueue.filter(x => x === p).length;
      hint = step.kind === "place" ? pre + "confirme a posição da peça" : pre + `toque numa casa vazia para posicionar uma peça (${left === 2 ? "1ª" : "2ª"})`;
    } else hint = {
      idle: g.brokeThisTurn ? pre + "parede derrubada! Agora escolha uma peça" : pre + "toque numa peça sua",
      stone: pre + "escolha a casa de destino (até 2 casas)",
      dest: pre + "escolha onde construir a parede",
      wall: pre + "confira e confirme a jogada",
      breaking: pre + "toque na parede que quer derrubar",
      break: pre + "confirme a parede a derrubar",
      place: "",
    }[step.kind];
  }
  const pending = step.kind === "place" || step.kind === "wall" || step.kind === "break";

  const playerCard = (q: Player) => {
    const onBoard = g.stones.filter(s => s.p === q).length;
    const toPlace = g.placeQueue.filter(x => x === q).length;
    return (
      <div key={q} className={`pc ${g.phase !== "over" && g.turn === q ? "on" : ""}`} style={{ ["--pc" as string]: COLORS[q].c, ["--pl" as string]: COLORS[q].l }}>
        <span className="st" style={{ background: COLORS[q].c }} />
        <div className="grow"><b>{who(q)}</b>
          <small>{"●".repeat(onBoard)}<span className="hollow">{"○".repeat(toPlace)}</span> · Área {g.phase === "place" ? 0 : ter.scores[q]}</small></div>
        {g.opts.players === 3 && g.opts.wallBreak && <span className={`hm ${g.breaksLeft[q] ? "" : "used"}`} title="Derrubar parede (1 vez)">🔨</span>}
      </div>
    );
  };

  const r = g.result;
  return (
    <div className="screen game">
      <div className="gtop">
        <button className="icon" onClick={props.onMenu} aria-label="Menu">☰</button>
        <div className="t">{props.title}</div>
      </div>
      <div className={`players n${g.order.length}`}>{g.order.map(playerCard)}</div>
      <div className="order">Ordem: {g.order.map((q, i) => <span key={q}><b style={{ color: COLORS[q].d }}>{who(q)}</b>{i < g.order.length - 1 ? " → " : ""}</span>)}</div>
      <div className="hint" style={{ ["--hc" as string]: g.phase === "over" ? "var(--ink)" : COLORS[p].d }}>{hint}</div>
      {err && <div className="err">{err}</div>}
      <div className="boardwrap">
        <Board g={g} marks={marks} onCell={mine ? clickCell : undefined} onEdge={clickEdge} onBreak={e => setStep({ kind: "break", e })} />
      </div>
      {props.banner}
      <div className="actions">
        {mine && pending && <button className="btn" style={{ background: COLORS[p].c, boxShadow: `0 4px 0 ${COLORS[p].d}` }} onClick={confirm}>Confirmar jogada</button>}
        {mine && step.kind !== "idle" && <button className="btn ghost" onClick={() => setStep({ kind: "idle" })}>Desfazer</button>}
        {mine && step.kind === "idle" && breakables.length > 0 && <button className="btn ghost" onClick={() => setStep({ kind: "breaking" })}>🔨 Derrubar parede (1 vez)</button>}
        {g.phase === "over" && <button className="btn" onClick={() => setShowResult(true)}>Ver resultado</button>}
      </div>
      <div className="sec">
        <div className="stitle">Histórico</div>
        <ol className="hist" reversed>
          {[...g.history].map((h, i) => ({ h, i })).reverse().map(({ h, i }) => <li key={i}><i style={{ background: COLORS[h.p].c }} />{describe(h, names)}</li>)}
          {!g.history.length && <li className="muted">Nenhuma jogada ainda.</li>}
        </ol>
      </div>
      <div className="row2">
        {props.onRestart && <button className="btn ghost" onClick={() => armed === "restart" ? (setArmed(""), props.onRestart!()) : setArmed("restart")}>{armed === "restart" ? "Toque de novo para reiniciar" : "↺ Reiniciar partida"}</button>}
        {g.phase !== "over" && <button className="btn ghost danger" onClick={() => armed === "abandon" ? (setArmed(""), props.onAbandon()) : setArmed("abandon")}>{armed === "abandon" ? "Toque de novo para abandonar" : "⚑ Abandonar partida"}</button>}
      </div>

      {g.phase === "over" && r && showResult && (
        <div className="over" onClick={e => { if (e.target === e.currentTarget) setShowResult(false); }}>
          <div className="sheet">
            <h2>{props.resultTitle ? props.resultTitle(g) : r.winners.length === 1 ? `${who(r.winners[0])} venceu!` : r.winners.length ? "Empate!" : "Partida encerrada"}</h2>
            {r.resigned && <p className="muted">{who(r.resigned)} abandonou a partida.</p>}
            <div className="rank">
              {r.ranking.map((q, i) => (
                <div key={q} className="rk"><span className="pos">{i + 1}º</span><span className="st" style={{ background: COLORS[q].c }} />
                  <b className="grow">{who(q)}</b><span><b>{r.scores[q]}</b> casas <small>(maior área {r.largest[q]})</small></span></div>
              ))}
            </div>
            <p className="muted small">{r.tieBreakUsed ? "Empate no total: decidiu a maior área única." : "Pontos = casas das áreas fechadas só com peças do jogador."}</p>
            <div className="stack">
              {props.onRestart && <button className="btn" onClick={props.onRestart}>Nova partida</button>}
              <button className="btn ghost" onClick={() => setShowResult(false)}>Ver tabuleiro</button>
              <button className="btn ghost" onClick={props.onMenu}>Menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

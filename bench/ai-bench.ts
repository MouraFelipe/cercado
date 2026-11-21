import { newGame, apply, cloneGame, legalActions, territory, regions, Game, Player, Action } from "../src/engine/rules";
import { control, evaluate, chooseAction } from "../src/engine/ai";
function seeded(seed: number) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
type Pol = (g: Game, rnd: () => number) => Action;
const greedy = (ev: (g: Game, p: Player) => number, noise = 0.3): Pol => (g, rnd) => {
  const me = g.turn; let best: Action = null as any, bv = -Infinity;
  for (const a of legalActions(g)) { const g2 = cloneGame(g); if (apply(g2, a)) continue; const v = ev(g2, me) + rnd() * noise; if (v > bv) { bv = v; best = a; } }
  return best;
};
// avaliação 2: controle + território + penalidade por peça isolada em área pequena + mobilidade
function ev2(g: Game, p: Player): number {
  if (g.phase === "over" && g.result) return g.result.winners.length === 1 && g.result.winners[0] === p ? 10000 : g.result.winners.includes(p) ? 5000 : -10000 + g.result.scores[p];
  const ctl = control(g), ter = territory(g).scores, rivals = g.order.filter(x => x !== p);
  let v = (ctl[p] - Math.max(...rivals.map(x => ctl[x]))) + 1.0 * (ter[p] - Math.max(...rivals.map(x => ter[x])));
  return v;
}
// busca de 2 níveis com feixe
const beam = (ev: (g: Game, p: Player) => number, K = 8): Pol => (g, rnd) => {
  const me = g.turn;
  const scored: [number, Action, Game][] = [];
  for (const a of legalActions(g)) { const g2 = cloneGame(g); if (apply(g2, a)) continue; scored.push([ev(g2, me) + rnd() * 0.01, a, g2]); }
  scored.sort((x, y) => y[0] - x[0]);
  let best = scored[0][1], bv = -Infinity;
  for (const [, a, g2] of scored.slice(0, K)) {
    let v: number;
    if (g2.phase !== "play" || g2.turn === me) v = ev(g2, me);
    else { // adversário responde com a melhor jogada para ele
      const opp = g2.turn; let ob = -Infinity, og: Game = g2;
      for (const r of legalActions(g2)) { const g3 = cloneGame(g2); if (apply(g3, r)) continue; const ov = ev(g3, opp); if (ov > ob) { ob = ov; og = g3; } }
      v = ev(og, me);
    }
    if (v > bv) { bv = v; best = a; }
  }
  return best;
};
const P: Record<string, Pol> = {
  easy: (g, r) => chooseAction(g, "easy", r)!,
  normal: (g, r) => chooseAction(g, "normal", r)!,
  ev2: greedy(ev2),
  beam: beam(evaluate),
  beamEv2: beam(ev2),
  beam16: beam(ev2, 16),
};
function match(a: string, b: string, games: number, players: 2 | 3 = 2) {
  let wa = 0, t0 = Date.now();
  for (let i = 0; i < games; i++) {
    const rnd = seeded(900 + i); const g = newGame({ players }, [1, 2], rnd); const A: Player = i % 2 ? 1 : 2;
    while (g.phase !== "over") apply(g, P[g.turn === A ? a : b](g, rnd));
    if (g.result!.winners.length === 1 && g.result!.winners[0] === A) wa++;
  }
  console.log(`${a} x ${b}: ${a} venceu ${wa}/${games}  (${((Date.now() - t0) / games).toFixed(0)} ms/partida)`);
}
const [, , a, b, n] = process.argv; match(a, b, +n || 20);

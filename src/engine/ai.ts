/* =========================================================
   IA do Cercado — busca de 1 jogada + avaliação de posição.
   Avalia: território garantido, casas que alcança antes dos
   adversários (controle), espaço livre das próprias peças
   (para não ficar isolada) e bloqueio dos caminhos adversários.
   ========================================================= */
import { Action, Game, N, Player, ALL_DIRS, canPass, apply, cloneGame, legalActions, territory, stoneAt } from "./rules";

const D: Record<string, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

/** Para cada casa, qual jogador chega primeiro (peças adversárias bloqueiam o caminho). */
export function control(g: Game): Record<Player, number> {
  const dist: Record<Player, number[]> = {};
  for (const p of g.order) {
    const d = Array(N * N).fill(99), q: [number, number][] = [];
    for (const s of g.stones) if (s.p === p) { d[s.r * N + s.c] = 0; q.push([s.r, s.c]); }
    while (q.length) {
      const [r, c] = q.shift()!, cur = d[r * N + c];
      for (const k of ALL_DIRS) {
        if (!canPass(g, r, c, k)) continue;
        const nr = r + D[k][0], nc = c + D[k][1];
        const st = stoneAt(g, nr, nc); if (st && st.p !== p) continue;
        if (d[nr * N + nc] > cur + 1) { d[nr * N + nc] = cur + 1; q.push([nr, nc]); }
      }
    }
    dist[p] = d;
  }
  const out: Record<Player, number> = {}; g.order.forEach(p => (out[p] = 0));
  for (let i = 0; i < N * N; i++) {
    let best = 99, who: Player | 0 = 0, tie = false;
    for (const p of g.order) { if (dist[p][i] < best) { best = dist[p][i]; who = p; tie = false; } else if (dist[p][i] === best) tie = true; }
    if (who && !tie && best < 99) out[who]++;
  }
  return out;
}

/** Nota da posição para o jogador p (quanto maior, melhor). */
export function evaluate(g: Game, p: Player): number {
  if (g.phase === "over" && g.result) {
    if (g.result.winners.length === 1 && g.result.winners[0] === p) return 10000;
    if (g.result.winners.includes(p)) return 5000;
    return -10000 + g.result.scores[p];
  }
  const ctl = control(g), ter = territory(g).scores;
  const rivals = g.order.filter(x => x !== p);
  return (ctl[p] - Math.max(...rivals.map(x => ctl[x]))) + (ter[p] - Math.max(...rivals.map(x => ter[x])));
}

export type Level = "easy" | "normal";
/**
 * Escolhe a jogada do jogador da vez.
 * Fácil: melhor jogada imediata, com bastante aleatoriedade.
 * Normal: busca de 2 níveis — pega as 8 melhores jogadas, imagina a melhor
 * resposta do próximo jogador para cada uma e fica com a que resiste melhor.
 */
export function chooseAction(g: Game, level: Level = "normal", rnd = Math.random): Action | null {
  const me = g.turn, acts = legalActions(g);
  if (!acts.length) return null;
  const scored: { v: number; a: Action; g2: Game }[] = [];
  for (const a of acts) {
    const g2 = cloneGame(g);
    if (apply(g2, a)) continue;
    scored.push({ v: evaluate(g2, me) + rnd() * (level === "easy" ? 8 : 0.01), a, g2 });
  }
  scored.sort((x, y) => y.v - x.v);
  if (level === "easy" || g.phase !== "play") return scored[0].a;
  let best = scored[0].a, bestV = -Infinity;
  for (const { a, g2 } of scored.slice(0, 8)) {
    let v: number;
    if (g2.phase !== "play" || g2.turn === me) v = evaluate(g2, me);
    else {
      const opp = g2.turn; let ob = -Infinity, reply: Game = g2;
      for (const r of legalActions(g2)) { const g3 = cloneGame(g2); if (apply(g3, r)) continue; const ov = evaluate(g3, opp); if (ov > ob) { ob = ov; reply = g3; } }
      v = evaluate(reply, me);
    }
    if (v > bestV) { bestV = v; best = a; }
  }
  return best;
}

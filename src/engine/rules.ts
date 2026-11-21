/* =========================================================
   CERCADO — motor de regras (independente da interface)
   Baseado nas regras do Wall Go (The Devil's Plan, temporada 2).
   Pontos sem confirmação oficial ficam em RuleOptions.
   ========================================================= */

export const N = 7;
export type Player = number;               // 1, 2 ou 3
export type Dir = "up" | "down" | "left" | "right";
export interface Edge { k: "h" | "v"; r: number; c: number }   // h: entre (r,c) e (r+1,c) · v: entre (r,c) e (r,c+1)
export interface Cell { r: number; c: number }
export interface Stone { id: number; p: Player; r: number; c: number }

export interface RuleOptions {
  players: 2 | 3;
  /** 2 jogadores: 2 peças cada (padrão) ou 4 peças com 2 já no tabuleiro. 3 jogadores: sempre 2. */
  twoPlayerStones: 2 | 4;
  /** ⚠️ a confirmar: menor distância permitida (0 = pode ficar parado). */
  minSteps: 0 | 1;
  /** ⚠️ a confirmar: no movimento de 2 casas, pode fazer curva. */
  allowTurn: boolean;
  /** Derrubar parede: só existe com 3 jogadores (confirmado). Pode ser desligado. */
  wallBreak: boolean;
}
export const DEFAULT_OPTIONS: RuleOptions = { players: 2, twoPlayerStones: 2, minSteps: 0, allowTurn: true, wallBreak: true };

export type Action =
  | { t: "place"; r: number; c: number }
  | { t: "break"; e: Edge }
  | { t: "move"; stone: number; to: Cell; wall: Edge }
  | { t: "resign"; p: Player };

export type HistoryEntry =
  | { t: "place"; p: Player; at: Cell }
  | { t: "break"; p: Player; e: Edge }
  | { t: "move"; p: Player; from: Cell; to: Cell; wall: Edge }
  | { t: "pass"; p: Player }
  | { t: "resign"; p: Player };

export interface Result {
  scores: Record<Player, number>;
  largest: Record<Player, number>;
  ranking: Player[];         // do melhor para o pior
  winners: Player[];         // mais de um = empate
  tieBreakUsed: boolean;
  resigned?: Player;
}

export interface Game {
  opts: RuleOptions;
  order: Player[];           // ordem sorteada dos jogadores
  stones: Stone[];
  h: number[][];            // (N-1) x N — 0 ou dono da parede
  v: number[][];            // N x (N-1)
  phase: "place" | "play" | "over";
  placeQueue: Player[];      // quem ainda vai posicionar, em ordem
  turn: Player;
  brokeThisTurn: boolean;
  breaksLeft: Record<Player, boolean>;
  history: HistoryEntry[];
  result: Result | null;
}

const DIRS: Record<Dir, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
export const ALL_DIRS = Object.keys(DIRS) as Dir[];

/* ------------------------------ criação ------------------------------ */
export function shuffledOrder(n: number, rnd = Math.random): Player[] {
  const a = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Cria uma partida. `order` = ordem sorteada (se omitida, sorteia). */
export function newGame(partial: Partial<RuleOptions> = {}, order?: Player[], rnd = Math.random): Game {
  const opts: RuleOptions = { ...DEFAULT_OPTIONS, ...partial };
  const n = opts.players;
  const ord = order ?? shuffledOrder(n, rnd);
  if (ord.length !== n || new Set(ord).size !== n) throw new Error("Ordem de jogadores inválida");
  const stones: Stone[] = [];
  let placeQueue: Player[];
  if (n === 2 && opts.twoPlayerStones === 4) {
    // ⚠️ posições iniciais simétricas (as posições exatas da série não foram confirmadas)
    const [a, b] = ord;
    [[a, 1, 1], [a, 5, 5], [b, 1, 5], [b, 5, 1]].forEach(([p, r, c], i) => stones.push({ id: i, p, r, c }));
    placeQueue = [a, b, b, a];
  } else {
    placeQueue = [...ord, ...[...ord].reverse()];     // 1ª peça na ordem, 2ª na ordem inversa
  }
  const breaksLeft: Record<Player, boolean> = {};
  ord.forEach(p => (breaksLeft[p] = n === 3 && opts.wallBreak));
  return {
    opts, order: ord, stones,
    h: Array.from({ length: N - 1 }, () => Array(N).fill(0)),
    v: Array.from({ length: N }, () => Array(N - 1).fill(0)),
    phase: "place", placeQueue, turn: placeQueue[0], brokeThisTurn: false, breaksLeft,
    history: [], result: null,
  };
}
export const cloneGame = (g: Game): Game => JSON.parse(JSON.stringify(g));

/* ------------------------------ consultas ------------------------------ */
export const inside = (r: number, c: number) => r >= 0 && c >= 0 && r < N && c < N;
/** Lado de uma casa numa direção. Borda do tabuleiro = null (não recebe parede). */
export function edgeOf(r: number, c: number, d: Dir): Edge | null {
  if (d === "up") return r > 0 ? { k: "h", r: r - 1, c } : null;
  if (d === "down") return r < N - 1 ? { k: "h", r, c } : null;
  if (d === "left") return c > 0 ? { k: "v", r, c: c - 1 } : null;
  return c < N - 1 ? { k: "v", r, c } : null;
}
export const sameEdge = (a: Edge, b: Edge) => a.k === b.k && a.r === b.r && a.c === b.c;
export const wallAt = (g: Game, e: Edge) => (e.k === "h" ? g.h[e.r][e.c] : g.v[e.r][e.c]);
function setWall(g: Game, e: Edge, val: number) { if (e.k === "h") g.h[e.r][e.c] = val; else g.v[e.r][e.c] = val; }
export function canPass(g: Game, r: number, c: number, d: Dir) { const e = edgeOf(r, c, d); return !!e && !wallAt(g, e); }
export const stoneAt = (g: Game, r: number, c: number) => g.stones.find(s => s.r === r && s.c === c);

/** Casas onde a peça pode terminar o movimento. */
export function destinations(g: Game, stoneId: number): Cell[] {
  const s = g.stones.find(x => x.id === stoneId); if (!s) return [];
  const out = new Map<string, Cell>();
  const add = (r: number, c: number) => out.set(r + "," + c, { r, c });
  if (g.opts.minSteps === 0) add(s.r, s.c);
  const free = (r: number, c: number) => !stoneAt(g, r, c);
  for (const d1 of ALL_DIRS) {
    if (!canPass(g, s.r, s.c, d1)) continue;
    const r1 = s.r + DIRS[d1][0], c1 = s.c + DIRS[d1][1];
    if (!free(r1, c1)) continue;
    add(r1, c1);
    for (const d2 of ALL_DIRS) {
      if (!g.opts.allowTurn && d2 !== d1) continue;
      if (!canPass(g, r1, c1, d2)) continue;
      const r2 = r1 + DIRS[d2][0], c2 = c1 + DIRS[d2][1];
      if (r2 === s.r && c2 === s.c) { if (g.opts.minSteps === 0) add(r2, c2); continue; }  // ir e voltar = ficar parado
      if (!free(r2, c2)) continue;
      add(r2, c2);
    }
  }
  // só vale terminar onde dá para construir a parede obrigatória
  return [...out.values()].filter(cell => freeEdges(g, cell.r, cell.c).length > 0);
}
/** Lados livres (sem parede e fora da borda) de uma casa. */
export function freeEdges(g: Game, r: number, c: number): Edge[] {
  return ALL_DIRS.map(d => edgeOf(r, c, d)).filter((e): e is Edge => !!e && !wallAt(g, e));
}
export function hasMove(g: Game, p: Player) { return g.stones.some(s => s.p === p && destinations(g, s.id).length > 0); }
/** Paredes que o jogador pode derrubar agora (encostadas numa peça dele). */
export function breakableWalls(g: Game, p: Player): Edge[] {
  if (g.phase !== "play" || g.opts.players !== 3 || !g.breaksLeft[p] || g.brokeThisTurn) return [];
  const out: Edge[] = [];
  for (const s of g.stones) if (s.p === p) for (const d of ALL_DIRS) {
    const e = edgeOf(s.r, s.c, d);
    if (e && wallAt(g, e) && !out.some(x => sameEdge(x, e))) out.push(e);
  }
  return out;
}

/** Regiões = casas ligadas sem parede entre si. */
export interface Region { cells: Cell[]; owners: Player[] }
export function regions(g: Game): Region[] {
  const id = Array.from({ length: N }, () => Array(N).fill(-1));
  const out: Region[] = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (id[r][c] >= 0) continue;
    const cells: Cell[] = [], owners = new Set<Player>(), q: Cell[] = [{ r, c }];
    id[r][c] = out.length;
    while (q.length) {
      const cur = q.pop()!; cells.push(cur);
      const s = stoneAt(g, cur.r, cur.c); if (s) owners.add(s.p);
      for (const d of ALL_DIRS) {
        if (!canPass(g, cur.r, cur.c, d)) continue;
        const nr = cur.r + DIRS[d][0], nc = cur.c + DIRS[d][1];
        if (id[nr][nc] < 0) { id[nr][nc] = out.length; q.push({ r: nr, c: nc }); }
      }
    }
    out.push({ cells, owners: [...owners] });
  }
  return out;
}
/** Território: casas das regiões que só têm peças de um jogador. */
export function territory(g: Game) {
  const scores: Record<Player, number> = {}, largest: Record<Player, number> = {};
  g.order.forEach(p => { scores[p] = 0; largest[p] = 0; });
  for (const reg of regions(g)) if (reg.owners.length === 1) {
    const p = reg.owners[0]; scores[p] += reg.cells.length; largest[p] = Math.max(largest[p], reg.cells.length);
  }
  return { scores, largest };
}
/** Fim: toda região tem peças de no máximo um jogador. */
export const allSeparated = (g: Game) => regions(g).every(reg => reg.owners.length <= 1);

export function computeResult(g: Game, resigned?: Player): Result {
  const { scores, largest } = territory(g);
  const ranking = [...g.order].sort((a, b) => scores[b] - scores[a] || largest[b] - largest[a]);
  let winners: Player[]; let tieBreakUsed = false;
  if (resigned !== undefined) {
    const rest = ranking.filter(p => p !== resigned);
    winners = g.opts.players === 2 ? rest : [];
    return { scores, largest, ranking: [...rest, resigned], winners, tieBreakUsed, resigned };
  }
  const top = ranking[0];
  const tiedTotal = ranking.filter(p => scores[p] === scores[top]);
  winners = tiedTotal.filter(p => largest[p] === largest[top]);
  tieBreakUsed = tiedTotal.length > 1 && winners.length < tiedTotal.length;
  return { scores, largest, ranking, winners, tieBreakUsed };
}

/* ------------------------------ ações ------------------------------ */
function nextInOrder(g: Game, p: Player): Player { const i = g.order.indexOf(p); return g.order[(i + 1) % g.order.length]; }
function finish(g: Game, resigned?: Player) { g.phase = "over"; g.result = computeResult(g, resigned); }
/** Passa a vez para o próximo que consegue jogar (quem não tem jogada passa). */
function advance(g: Game) {
  g.brokeThisTurn = false;
  if (allSeparated(g)) return finish(g);
  let p = g.turn;
  for (let i = 0; i < g.order.length; i++) {
    p = nextInOrder(g, p);
    if (hasMove(g, p)) { g.turn = p; return; }
    g.history.push({ t: "pass", p });
  }
  finish(g);   // ninguém consegue jogar
}

/** Aplica uma ação. Retorna null se deu certo ou a mensagem do erro (a partida não muda). */
export function apply(g: Game, a: Action, actor?: Player): string | null {
  if (g.phase === "over") return "A partida já terminou.";
  if (a.t === "resign") {
    if (!g.order.includes(a.p)) return "Jogador inválido.";
    g.history.push({ t: "resign", p: a.p }); finish(g, a.p); return null;
  }
  if (actor !== undefined && actor !== g.turn) return "Não é a sua vez.";
  const p = g.turn;

  if (a.t === "place") {
    if (g.phase !== "place") return "A fase de posicionar peças já acabou.";
    if (!inside(a.r, a.c)) return "Fora do tabuleiro.";
    if (stoneAt(g, a.r, a.c)) return "Essa casa já está ocupada.";
    g.stones.push({ id: g.stones.length, p, r: a.r, c: a.c });
    g.history.push({ t: "place", p, at: { r: a.r, c: a.c } });
    g.placeQueue.shift();
    if (g.placeQueue.length) { g.turn = g.placeQueue[0]; return null; }
    g.phase = "play"; g.turn = g.order[0];
    if (!hasMove(g, g.turn)) { g.history.push({ t: "pass", p: g.turn }); advance(g); }
    return null;
  }
  if (g.phase !== "play") return "Primeiro todos posicionam as peças.";

  if (a.t === "break") {
    if (g.opts.players !== 3 || !g.opts.wallBreak) return "Derrubar parede só existe no modo de 3 jogadores.";
    if (!g.breaksLeft[p]) return "Você já usou a sua chance de derrubar parede.";
    if (g.brokeThisTurn) return "Você já derrubou uma parede nesta vez.";
    if (!breakableWalls(g, p).some(e => sameEdge(e, a.e))) return "Só dá para derrubar uma parede encostada numa peça sua.";
    setWall(g, a.e, 0); g.breaksLeft[p] = false; g.brokeThisTurn = true;
    g.history.push({ t: "break", p, e: a.e });
    return null;     // a vez continua: ainda precisa mover e construir
  }

  if (a.t === "move") {
    const s = g.stones.find(x => x.id === a.stone);
    if (!s) return "Peça inexistente.";
    if (s.p !== p) return "Essa peça não é sua.";
    if (!destinations(g, s.id).some(d => d.r === a.to.r && d.c === a.to.c)) return "A peça não pode ir para essa casa.";
    if (!freeEdges(g, a.to.r, a.to.c).some(e => sameEdge(e, a.wall))) return "A parede precisa ficar num lado livre da casa onde a peça parou.";
    const from = { r: s.r, c: s.c };
    s.r = a.to.r; s.c = a.to.c; setWall(g, a.wall, p);
    g.history.push({ t: "move", p, from, to: { ...a.to }, wall: { ...a.wall } });
    advance(g);
    return null;
  }
  return "Ação desconhecida.";
}

/** Todas as jogadas possíveis do jogador da vez (sem derrubar parede). */
export function legalActions(g: Game): Action[] {
  if (g.phase === "over") return [];
  if (g.phase === "place") {
    const out: Action[] = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!stoneAt(g, r, c)) out.push({ t: "place", r, c });
    return out;
  }
  const out: Action[] = [];
  for (const s of g.stones) if (s.p === g.turn) for (const to of destinations(g, s.id))
    for (const wall of freeEdges(g, to.r, to.c)) out.push({ t: "move", stone: s.id, to, wall });
  return out;
}

/* nome das casas para o histórico: colunas A–G, linhas 1–7 */
export const cellName = (x: Cell) => "ABCDEFG"[x.c] + (x.r + 1);
export function edgeName(e: Edge) {
  return e.k === "h" ? `${cellName({ r: e.r, c: e.c })}↕${cellName({ r: e.r + 1, c: e.c })}` : `${cellName({ r: e.r, c: e.c })}↔${cellName({ r: e.r, c: e.c + 1 })}`;
}

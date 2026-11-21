import { describe, it, expect } from "vitest";
import { newGame, apply, destinations, freeEdges, breakableWalls, regions, territory, allSeparated, computeResult, legalActions, cloneGame, edgeOf, Game, Edge, N, Player } from "./rules";
import { chooseAction } from "./ai";

/* gerador aleatório com semente, para testes repetíveis */
function seeded(seed: number) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Monta uma partida já na fase de jogo com as peças indicadas. */
function playing(stones: [Player, number, number][], opts: Parameters<typeof newGame>[0] = {}, order?: Player[]): Game {
  const players = (opts.players ?? 2) as 2 | 3;
  const g = newGame({ ...opts, players }, order ?? (players === 2 ? [1, 2] : [1, 2, 3]));
  g.stones = stones.map(([p, r, c], id) => ({ id, p, r, c }));
  g.phase = "play"; g.placeQueue = []; g.turn = g.order[0];
  return g;
}
/** Monta paredes a partir de um mapa de letras: casas vizinhas com letras diferentes ficam separadas por parede. */
function fromMap(rows: string[], stones: [Player, number, number][], opts: Parameters<typeof newGame>[0] = {}): Game {
  const g = playing(stones, opts);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (r < N - 1 && rows[r][c] !== rows[r + 1][c]) g.h[r][c] = 1;
    if (c < N - 1 && rows[r][c] !== rows[r][c + 1]) g.v[r][c] = 1;
  }
  return g;
}
const wall = (g: Game, e: Edge, p = 1) => { if (e.k === "h") g.h[e.r][e.c] = p; else g.v[e.r][e.c] = p; };
const cells = (g: Game, id: number) => destinations(g, id).map(d => `${d.r},${d.c}`).sort();
/** fecha uma área retangular com paredes (r1..r2, c1..c2) */
function boxIn(g: Game, r1: number, c1: number, r2: number, c2: number, p = 1) {
  for (let c = c1; c <= c2; c++) { if (r1 > 0) wall(g, { k: "h", r: r1 - 1, c }, p); if (r2 < N - 1) wall(g, { k: "h", r: r2, c }, p); }
  for (let r = r1; r <= r2; r++) { if (c1 > 0) wall(g, { k: "v", r, c: c1 - 1 }, p); if (c2 < N - 1) wall(g, { k: "v", r, c: c2 }, p); }
}

describe("Posicionamento inicial", () => {
  it("2 jogadores: 2 peças cada, 1ª na ordem e 2ª na ordem inversa", () => {
    const g = newGame({ players: 2 }, [2, 1]);
    expect(g.placeQueue).toEqual([2, 1, 1, 2]); expect(g.turn).toBe(2); expect(g.stones).toHaveLength(0);
  });
  it("3 jogadores: ordem A B C C B A", () => {
    const g = newGame({ players: 3 }, [3, 1, 2]);
    expect(g.placeQueue).toEqual([3, 1, 2, 2, 1, 3]);
  });
  it("ordem sorteada contém todos os jogadores uma vez", () => {
    for (let i = 0; i < 20; i++) { const g = newGame({ players: 3 }); expect([...g.order].sort()).toEqual([1, 2, 3]); }
  });
  it("não permite casa ocupada e passa para a fase de jogo ao final", () => {
    const g = newGame({ players: 2 }, [1, 2]);
    expect(apply(g, { t: "place", r: 3, c: 3 })).toBeNull();
    const before = JSON.stringify(g);
    expect(apply(g, { t: "place", r: 3, c: 3 })).toMatch(/ocupada/);
    expect(JSON.stringify(g)).toBe(before);
    apply(g, { t: "place", r: 0, c: 0 }); apply(g, { t: "place", r: 6, c: 6 }); apply(g, { t: "place", r: 2, c: 5 });
    expect(g.phase).toBe("play"); expect(g.turn).toBe(1);
    expect(g.stones.filter(s => s.p === 1)).toHaveLength(2); expect(g.stones.filter(s => s.p === 2)).toHaveLength(2);
  });
  it("opção 4 peças (2 já no tabuleiro) para 2 jogadores", () => {
    const g = newGame({ players: 2, twoPlayerStones: 4 }, [1, 2]);
    expect(g.stones).toHaveLength(4); expect(g.placeQueue).toEqual([1, 2, 2, 1]);
  });
  it("não move antes de todos posicionarem", () => {
    const g = newGame({ players: 2 }, [1, 2]); apply(g, { t: "place", r: 3, c: 3 });
    expect(apply(g, { t: "move", stone: 0, to: { r: 3, c: 4 }, wall: { k: "v", r: 3, c: 4 } })).toMatch(/posicionam/);
  });
});

describe("Movimentação", () => {
  it("horizontal e vertical até 2 casas, com curva e ficando parado (padrão)", () => {
    const g = playing([[1, 3, 3], [2, 0, 0]]);
    expect(cells(g, 0)).toHaveLength(13);           // parado + 4 de 1 passo + 4 retas de 2 + 4 diagonais via curva
    expect(cells(g, 0)).toContain("3,5"); expect(cells(g, 0)).toContain("1,3"); expect(cells(g, 0)).toContain("4,4");
    expect(cells(g, 0)).not.toContain("3,6"); expect(cells(g, 0)).not.toContain("1,2"); // nada além de 2 passos
  });
  it("sem curva: só linhas retas", () => {
    const g = playing([[1, 3, 3], [2, 0, 0]], { allowTurn: false });
    expect(cells(g, 0)).toEqual(["1,3", "2,3", "3,1", "3,2", "3,3", "3,4", "3,5", "4,3", "5,3"].sort());
  });
  it("mínimo de 1 casa: não pode ficar parado", () => {
    const g = playing([[1, 3, 3], [2, 0, 0]], { minSteps: 1 });
    expect(cells(g, 0)).not.toContain("3,3"); expect(cells(g, 0)).toHaveLength(12);
  });
  it("limites do tabuleiro (canto)", () => {
    const g = playing([[1, 0, 0], [2, 6, 6]]);
    expect(cells(g, 0)).toEqual(["0,0", "0,1", "0,2", "1,0", "1,1", "2,0"].sort());
  });
  it("paredes bloqueiam a passagem", () => {
    const g = playing([[1, 3, 3], [2, 0, 0]]);
    wall(g, edgeOf(3, 3, "right")!);
    const d = cells(g, 0);
    expect(d).not.toContain("3,4"); expect(d).not.toContain("3,5");
    expect(d).toContain("2,4");                      // contornando por cima
  });
  it("peças bloqueiam: não atravessa e não termina em casa ocupada", () => {
    const g = playing([[1, 3, 3], [2, 3, 4], [1, 2, 3]]);
    const d = cells(g, 0);
    expect(d).not.toContain("3,4"); expect(d).not.toContain("3,5"); expect(d).not.toContain("2,3"); expect(d).not.toContain("1,3");
  });
  it("jogada inválida é recusada e não altera nada", () => {
    const g = playing([[1, 3, 3], [2, 0, 0]]); const before = JSON.stringify(g);
    expect(apply(g, { t: "move", stone: 0, to: { r: 3, c: 6 }, wall: { k: "v", r: 3, c: 5 } })).toBeTruthy();
    expect(apply(g, { t: "move", stone: 1, to: { r: 0, c: 1 }, wall: { k: "v", r: 0, c: 1 } })).toMatch(/não é sua/);
    expect(apply(g, { t: "move", stone: 0, to: { r: 3, c: 4 }, wall: { k: "v", r: 3, c: 4 } }, 2)).toMatch(/vez/);
    expect(JSON.stringify(g)).toBe(before);
  });
});

describe("Construção de paredes", () => {
  it("parede obrigatória num lado livre da casa final, e a vez passa", () => {
    const g = playing([[1, 3, 3], [2, 0, 0]]);
    expect(apply(g, { t: "move", stone: 0, to: { r: 3, c: 4 }, wall: { k: "v", r: 3, c: 4 } })).toBeNull();
    expect(g.v[3][4]).toBe(1); expect(g.turn).toBe(2);
  });
  it("não pode construir longe da peça", () => {
    const g = playing([[1, 3, 3], [2, 0, 0]]);
    expect(apply(g, { t: "move", stone: 0, to: { r: 3, c: 4 }, wall: { k: "v", r: 0, c: 4 } })).toMatch(/lado livre/);
  });
  it("não pode sobrepor parede nem construir na borda do tabuleiro", () => {
    const g = playing([[1, 0, 0], [2, 6, 6]]);
    wall(g, { k: "v", r: 0, c: 0 });
    expect(freeEdges(g, 0, 0)).toEqual([{ k: "h", r: 0, c: 0 }]);   // borda não conta, direita já tem parede
    expect(apply(g, { t: "move", stone: 0, to: { r: 0, c: 0 }, wall: { k: "v", r: 0, c: 0 } })).toMatch(/lado livre/);
  });
  it("não pode terminar numa casa sem lado livre", () => {
    const g = playing([[1, 0, 0], [2, 6, 6]]);
    wall(g, { k: "h", r: 0, c: 1 }); wall(g, { k: "v", r: 0, c: 1 });   // (0,1) fica só com o lado esquerdo livre
    wall(g, { k: "v", r: 0, c: 0 });                                    // agora (0,1) não tem lado livre e não se chega nele
    expect(cells(g, 0)).not.toContain("0,1");
  });
});

describe("Derrubar parede", () => {
  const three = () => playing([[1, 3, 3], [2, 0, 0], [3, 6, 6]], { players: 3 });
  it("não existe com 2 jogadores", () => {
    const g = playing([[1, 3, 3], [2, 0, 0]]); wall(g, edgeOf(3, 3, "up")!);
    expect(breakableWalls(g, 1)).toHaveLength(0);
    expect(apply(g, { t: "break", e: edgeOf(3, 3, "up")! })).toMatch(/3 jogadores/);
  });
  it("3 jogadores: só parede encostada na própria peça, uma vez por partida, e a vez continua", () => {
    const g = three(); wall(g, edgeOf(3, 3, "up")!, 2); wall(g, { k: "h", r: 4, c: 0 }, 2);
    expect(breakableWalls(g, 1)).toEqual([edgeOf(3, 3, "up")]);
    expect(apply(g, { t: "break", e: { k: "h", r: 4, c: 0 } })).toMatch(/encostada/);
    expect(apply(g, { t: "break", e: edgeOf(3, 3, "up")! })).toBeNull();
    expect(g.h[2][3]).toBe(0); expect(g.turn).toBe(1); expect(g.breaksLeft[1]).toBe(false);
    expect(cells(g, 0)).toContain("1,3");            // passa pelo buraco aberto
    expect(apply(g, { t: "move", stone: 0, to: { r: 1, c: 3 }, wall: { k: "h", r: 0, c: 3 } })).toBeNull();
    // na próxima vez dele, não pode mais
    g.turn = 1; wall(g, edgeOf(1, 3, "left")!, 2);
    expect(apply(g, { t: "break", e: edgeOf(1, 3, "left")! })).toMatch(/já usou/);
  });
  it("pode ser desligado nas opções", () => {
    const g = playing([[1, 3, 3], [2, 0, 0], [3, 6, 6]], { players: 3, wallBreak: false }); wall(g, edgeOf(3, 3, "up")!);
    expect(breakableWalls(g, 1)).toHaveLength(0);
  });
});

describe("Encerramento, territórios e vencedor", () => {
  it("regiões e território: áreas só com peças de um jogador; vazias não contam", () => {
    const g = playing([[1, 0, 0], [2, 6, 6], [2, 6, 5]]);
    boxIn(g, 0, 0, 1, 1);                            // 4 casas para o jogador 1
    boxIn(g, 0, 5, 1, 6);                            // área vazia (neutra)
    const t = territory(g);
    expect(t.scores[1]).toBe(4); expect(t.scores[2]).toBe(49 - 4 - 4); expect(t.largest[2]).toBe(41);
    expect(regions(g)).toHaveLength(3); expect(allSeparated(g)).toBe(true);
  });
  it("a partida acaba quando todos ficam separados", () => {
    const g = playing([[1, 0, 0], [2, 6, 6]]);
    wall(g, { k: "h", r: 0, c: 0 });                 // falta só a parede à direita de (0,0)
    expect(allSeparated(g)).toBe(false);
    expect(apply(g, { t: "move", stone: 0, to: { r: 0, c: 0 }, wall: { k: "v", r: 0, c: 0 } })).toBeNull();
    expect(g.phase).toBe("over"); expect(g.result!.scores).toEqual({ 1: 1, 2: 48 }); expect(g.result!.winners).toEqual([2]);
  });
  it("não acaba enquanto houver região com dois jogadores", () => {
    const g = playing([[1, 0, 0], [2, 0, 2]]);
    apply(g, { t: "move", stone: 0, to: { r: 0, c: 0 }, wall: { k: "h", r: 0, c: 0 } });
    expect(g.phase).toBe("play");
  });
  it("desempate pela maior área única; sem diferença = empate", () => {
    // J1: a(3) + b(9) = 12 · J2: c(6) + d(6) = 12 → vence J1 pela maior área (9)
    const g = fromMap(["aaacccx", "xxxcccx", "xxxxxxx", "xxxxxxx", "bbbxddd", "bbbxddd", "bbbxxxx"],
                      [[1, 0, 0], [1, 4, 0], [2, 0, 3], [2, 4, 4]]);
    const r = computeResult(g);
    expect(r.scores).toEqual({ 1: 12, 2: 12 }); expect(r.largest).toEqual({ 1: 9, 2: 6 });
    expect(r.winners).toEqual([1]); expect(r.tieBreakUsed).toBe(true); expect(r.ranking).toEqual([1, 2]);
    // empate total: mesmo total e mesma maior área
    const g2 = fromMap(["axxxxxb", "xxxxxxx", "xxxxxxx", "xxxxxxx", "xxxxxxx", "xxxxxxx", "xxxxxxx"], [[1, 0, 0], [2, 0, 6]]);
    const r2 = computeResult(g2); expect(r2.winners.sort()).toEqual([1, 2]); expect(r2.tieBreakUsed).toBe(false);
  });
  it("3 jogadores: pontuação e classificação", () => {
    const g = fromMap(["aaaaxbb", "aaaaxbb", "xxxxxbb", "ccxxxxx", "ccxxxxx", "ccxxxxx", "xxxxxxx"],
                      [[1, 0, 0], [1, 1, 3], [2, 0, 5], [2, 2, 6], [3, 3, 0], [3, 5, 1]], { players: 3 });
    const r = computeResult(g);
    expect(r.scores).toEqual({ 1: 8, 2: 6, 3: 6 }); expect(r.winners).toEqual([1]); expect(r.ranking[0]).toBe(1);
  });
  it("quem não tem jogada passa a vez", () => {
    const g = playing([[1, 0, 0], [2, 3, 3], [3, 6, 6]], { players: 3 });
    boxIn(g, 6, 6, 6, 6, 3);                         // peça do 3 sem nenhum lado livre: não tem jogada
    apply(g, { t: "move", stone: 0, to: { r: 0, c: 1 }, wall: { k: "h", r: 0, c: 1 } });
    expect(g.turn).toBe(2);
    apply(g, { t: "move", stone: 1, to: { r: 3, c: 4 }, wall: { k: "h", r: 3, c: 4 } });
    expect(g.turn).toBe(1); expect(g.history.some(h => h.t === "pass" && h.p === 3)).toBe(true);
  });
  it("abandonar: com 2 jogadores o outro vence", () => {
    const g = playing([[1, 0, 0], [2, 6, 6]]);
    expect(apply(g, { t: "resign", p: 1 })).toBeNull(); expect(g.phase).toBe("over"); expect(g.result!.winners).toEqual([2]);
  });
});

describe("Partidas completas", () => {
  function playOut(players: 2 | 3, seed: number, levels: ("easy" | "normal")[]) {
    const rnd = seeded(seed); const g = newGame({ players }, undefined, rnd); let n = 0;
    while (g.phase !== "over" && n < 600) {
      const a = chooseAction(g, levels[(g.turn - 1) % levels.length], rnd);
      expect(a).not.toBeNull();
      const before = cloneGame(g);
      expect(apply(g, a!)).toBeNull();
      // invariantes: peças em casas distintas, nenhuma parede some (sem derrubar)
      const pos = g.stones.map(s => s.r + "," + s.c); expect(new Set(pos).size).toBe(pos.length);
      for (let r = 0; r < N - 1; r++) for (let c = 0; c < N; c++) if (before.h[r][c]) expect(g.h[r][c]).toBe(before.h[r][c]);
      n++;
    }
    expect(g.phase).toBe("over");
    const total = Object.values(g.result!.scores).reduce((x, y) => x + y, 0);
    expect(total).toBeLessThanOrEqual(49);
    expect(allSeparated(g)).toBe(true);
    return g;
  }
  it("2 jogadores: 10 partidas IA x IA terminam sem jogada inválida", () => { for (let i = 0; i < 10; i++) playOut(2, 100 + i, ["normal", "easy"]); });
  it("3 jogadores: 10 partidas IA x IA x IA terminam sem jogada inválida", () => { for (let i = 0; i < 10; i++) playOut(3, 200 + i, ["normal", "easy", "normal"]); });
});

describe("IA", () => {
  it("só escolhe jogadas legais", () => {
    const g = newGame({ players: 2 }, [1, 2], seeded(7));
    for (let i = 0; i < 30 && g.phase !== "over"; i++) {
      const a = chooseAction(g, "normal", seeded(i))!;
      expect(legalActions(g).some(x => JSON.stringify(x) === JSON.stringify(a))).toBe(true);
      apply(g, a);
    }
  });
  it("fecha a área quando isso garante a vitória", () => {
    // colunas 0–3 (28 casas) x colunas 4–6 (21 casas), com uma passagem na linha 3
    const g = fromMap(["aaaabbb", "aaaabbb", "aaaabbb", "aaaabbb", "aaaabbb", "aaaabbb", "aaaabbb"], [[1, 3, 3], [1, 5, 1], [2, 0, 6], [2, 6, 5]]);
    g.v[3][3] = 0;
    const a = chooseAction(g, "normal", seeded(1))!;
    const g2 = cloneGame(g); apply(g2, a);
    expect(g2.phase).toBe("over"); expect(g2.result!.winners).toEqual([1]); expect(g2.result!.scores[1]).toBe(28);
  });
  it("não se isola numa casa sozinha quando há alternativa", () => {
    const g = playing([[1, 0, 0], [1, 6, 0], [2, 3, 3], [2, 3, 6]]);
    g.h[0][0] = 2;                                   // basta uma parede à direita para (0,0) ficar presa sozinha
    for (let i = 0; i < 5; i++) {
      const g2 = cloneGame(g); apply(g2, chooseAction(g2, "normal", seeded(i))!);
      const reg = regions(g2).find(r => r.cells.some(c => c.r === g2.stones[0].r && c.c === g2.stones[0].c))!;
      expect(reg.cells.length).toBeGreaterThan(1);
    }
  });
  it("Normal vence o Fácil na maioria das partidas", () => {
    let wins = 0;
    for (let i = 0; i < 16; i++) {
      const rnd = seeded(500 + i); const g = newGame({ players: 2 }, [1, 2], rnd);
      const normal: Player = i % 2 ? 1 : 2;
      while (g.phase !== "over") apply(g, chooseAction(g, g.turn === normal ? "normal" : "easy", rnd)!);
      if (g.result!.winners.length === 1 && g.result!.winners[0] === normal) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(10);
  });
});

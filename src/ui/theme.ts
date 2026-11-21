import { Cell, Edge, HistoryEntry, Player, cellName, edgeName } from "../engine/rules";

export const COLORS: Record<Player, { c: string; d: string; l: string; name: string }> = {
  1: { c: "#C9573A", d: "#94391F", l: "#F4D8CE", name: "Coral" },
  2: { c: "#3767A0", d: "#22466F", l: "#D5E2F2", name: "Azul" },
  3: { c: "#3E8A57", d: "#255D39", l: "#D6EBDD", name: "Verde" },
};
export type Names = Record<Player, string>;
export const defaultNames = (): Names => ({ 1: COLORS[1].name, 2: COLORS[2].name, 3: COLORS[3].name });

export function describe(h: HistoryEntry, names: Names): string {
  const n = names[h.p];
  switch (h.t) {
    case "place": return `${n} posicionou uma peça em ${cellName(h.at)}`;
    case "move": {
      const stay = h.from.r === h.to.r && h.from.c === h.to.c;
      return `${n}: ${stay ? `ficou em ${cellName(h.to)}` : `${cellName(h.from)} → ${cellName(h.to)}`} · parede ${edgeName(h.wall)}`;
    }
    case "break": return `${n} derrubou a parede ${edgeName(h.e)}`;
    case "pass": return `${n} não tinha jogada e passou a vez`;
    case "resign": return `${n} abandonou a partida`;
  }
}
export const sameCell = (a: Cell | null | undefined, b: Cell | null | undefined) => !!a && !!b && a.r === b.r && a.c === b.c;
export const edgeKey = (e: Edge) => `${e.k}${e.r},${e.c}`;

import { Game, N, Cell, Edge, regions, sameEdge } from "../engine/rules";
import { COLORS, edgeKey } from "./theme";

export interface Marks {
  selected?: number | null;        // id da peça selecionada
  dests?: Cell[];                  // casas possíveis
  ghost?: { cell: Cell; p: number; from?: Cell } | null;   // peça na posição escolhida
  slots?: Edge[];                  // lados onde a parede pode ir
  wall?: Edge | null;              // parede escolhida (prévia)
  breakables?: Edge[];             // paredes que podem ser derrubadas
  breakSel?: Edge | null;          // parede escolhida para derrubar
  placeable?: boolean;             // fase de posicionar: casas vazias clicáveis
}

const CELL = 56, PAD = 28, SIZE = PAD * 2 + CELL * N;
const X = (c: number) => PAD + c * CELL, Y = (r: number) => PAD + r * CELL;

function WallShape({ e, fill, cls, opacity }: { e: Edge; fill: string; cls?: string; opacity?: number }) {
  return e.k === "h"
    ? <rect className={cls} x={X(e.c) + 3} y={Y(e.r + 1) - 4.5} width={CELL - 6} height={9} rx={4.5} fill={fill} opacity={opacity} />
    : <rect className={cls} x={X(e.c + 1) - 4.5} y={Y(e.r) + 3} width={9} height={CELL - 6} rx={4.5} fill={fill} opacity={opacity} />;
}
function EdgeHit({ e, onClick }: { e: Edge; onClick: () => void }) {
  const p = { fill: "transparent", style: { cursor: "pointer" }, onClick, "data-edge": edgeKey(e) } as const;
  return e.k === "h"
    ? <rect {...p} x={X(e.c)} y={Y(e.r + 1) - 14} width={CELL} height={28} />
    : <rect {...p} x={X(e.c + 1) - 14} y={Y(e.r)} width={28} height={CELL} />;
}
function StoneShape({ cx, cy, p, cls, faded }: { cx: number; cy: number; p: number; cls?: string; faded?: boolean }) {
  return (
    <g className={cls} pointerEvents="none" opacity={faded ? 0.55 : 1}>
      <ellipse cx={cx} cy={cy + 15} rx={15} ry={4} fill="#000" opacity={0.12} />
      <circle cx={cx} cy={cy} r={18} fill={`url(#sg${p})`} stroke={COLORS[p].d} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={9} fill="none" stroke="#fff" strokeOpacity={0.5} strokeWidth={2} />
    </g>
  );
}

export default function Board({ g, marks = {}, onCell, onEdge, onBreak }: {
  g: Game; marks?: Marks;
  onCell?: (c: Cell) => void; onEdge?: (e: Edge) => void; onBreak?: (e: Edge) => void;
}) {
  const tint: (number | 0)[][] = Array.from({ length: N }, () => Array(N).fill(0));
  for (const reg of regions(g)) if (reg.owners.length === 1) reg.cells.forEach(c => (tint[c.r][c.c] = reg.owners[0]));
  const last = [...g.history].reverse().find(h => h.t === "move" || h.t === "place");
  const lastWall = last && last.t === "move" ? last.wall : null;
  const walls: { e: Edge; p: number }[] = [];
  for (let r = 0; r < N - 1; r++) for (let c = 0; c < N; c++) if (g.h[r][c]) walls.push({ e: { k: "h", r, c }, p: g.h[r][c] });
  for (let r = 0; r < N; r++) for (let c = 0; c < N - 1; c++) if (g.v[r][c]) walls.push({ e: { k: "v", r, c }, p: g.v[r][c] });

  return (
    <svg className="board" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Tabuleiro">
      <defs>
        {[1, 2, 3].map(p => (
          <radialGradient key={p} id={`sg${p}`} cx="38%" cy="32%" r="70%">
            <stop offset="0" stopColor="#fff" stopOpacity={0.55} /><stop offset=".35" stopColor={COLORS[p].c} /><stop offset="1" stopColor={COLORS[p].d} />
          </radialGradient>
        ))}
      </defs>
      <rect x={2} y={2} width={SIZE - 4} height={SIZE - 4} rx={20} fill="#E8DCC6" />
      {"ABCDEFG".split("").map((l, c) => <text key={l} className="coord" x={X(c) + CELL / 2} y={PAD - 9} textAnchor="middle">{l}</text>)}
      {[...Array(N)].map((_, r) => <text key={r} className="coord" x={PAD - 13} y={Y(r) + CELL / 2 + 4} textAnchor="middle">{r + 1}</text>)}
      {[...Array(N)].map((_, r) => [...Array(N)].map((_, c) => {
        const clickable = !!onCell;
        return <rect key={`${r},${c}`} data-cell={`${r},${c}`} className={clickable ? "cellhit" : ""} x={X(c) + 2} y={Y(r) + 2} width={CELL - 4} height={CELL - 4} rx={7}
          fill={tint[r][c] ? COLORS[tint[r][c]].l : "#F8F2E7"} onClick={() => onCell?.({ r, c })} />;
      }))}
      {[...Array(N - 1)].map((_, r) => [...Array(N - 1)].map((_, c) => <rect key={`p${r},${c}`} x={X(c + 1) - 3} y={Y(r + 1) - 3} width={6} height={6} rx={1.5} fill="#D6C8B0" pointerEvents="none" />))}
      {walls.map(({ e, p }) => {
        const breaking = marks.breakSel && sameEdge(marks.breakSel, e);
        return <WallShape key={edgeKey(e)} e={e} fill={breaking ? "#26241F" : COLORS[p].c} cls={lastWall && sameEdge(lastWall, e) ? "newwall" : breaking ? "pulse" : ""} opacity={breaking ? 0.35 : 1} />;
      })}
      {marks.breakables?.map(e => <g key={"b" + edgeKey(e)}><WallShape e={e} fill="#26241F" cls="pulse" /><EdgeHit e={e} onClick={() => onBreak?.(e)} /></g>)}
      {marks.dests?.map(d => <circle key={`d${d.r},${d.c}`} className="pulse" cx={X(d.c) + CELL / 2} cy={Y(d.r) + CELL / 2} r={8} fill="#26241F" opacity={0.35} pointerEvents="none" />)}
      {g.stones.map(s => {
        const moving = marks.ghost && marks.selected === s.id;
        const cx = X(s.c) + CELL / 2, cy = Y(s.r) + CELL / 2;
        const isLast = last && ((last.t === "move" && last.to.r === s.r && last.to.c === s.c) || (last.t === "place" && last.at.r === s.r && last.at.c === s.c));
        return (
          <g key={s.id}>
            {moving
              ? <circle cx={cx} cy={cy} r={18} fill="none" stroke={COLORS[s.p].c} strokeWidth={2.5} strokeDasharray="4 4" opacity={0.6} pointerEvents="none" />
              : <StoneShape cx={cx} cy={cy} p={s.p} cls={isLast ? "pop" : ""} />}
            {marks.selected === s.id && !moving && <circle cx={cx} cy={cy} r={24} fill="none" stroke={COLORS[s.p].c} strokeWidth={3} pointerEvents="none" />}
          </g>
        );
      })}
      {marks.ghost && <StoneShape cx={X(marks.ghost.cell.c) + CELL / 2} cy={Y(marks.ghost.cell.r) + CELL / 2} p={marks.ghost.p} faded={!marks.wall && marks.selected === undefined} />}
      {marks.slots?.map(e => <g key={"s" + edgeKey(e)}><WallShape e={e} fill={marks.ghost ? COLORS[marks.ghost.p].c : "#26241F"} cls="pulse" opacity={0.35} /><EdgeHit e={e} onClick={() => onEdge?.(e)} /></g>)}
      {marks.wall && marks.ghost && <WallShape e={marks.wall} fill={COLORS[marks.ghost.p].c} />}
    </svg>
  );
}

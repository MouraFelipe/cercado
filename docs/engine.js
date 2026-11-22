/* =========================================================
   CERCADO — regras do jogo (sem interface)
   Tabuleiro 7x7. Muros ficam nas bordas entre casas:
     h[r][c] = muro entre (r,c) e (r+1,c)   (r: 0..5, c: 0..6)
     v[r][c] = muro entre (r,c) e (r,c+1)   (r: 0..6, c: 0..5)
   Valor 0 = sem muro; 1 ou 2 = muro do jogador.
   ========================================================= */
(function(root){
const N = 7;
const DIRS = {up:[-1,0], down:[1,0], left:[0,-1], right:[0,1]};
const other = p => p===1?2:1;

function newGame(opts={}){
  return {
    v: 1, N,
    stones: [{p:1,r:1,c:1},{p:1,r:5,c:5},{p:2,r:1,c:5},{p:2,r:5,c:1}],   // peças que já começam no tabuleiro
    h: Array.from({length:N-1},()=>Array(N).fill(0)),
    vw: Array.from({length:N},()=>Array(N-1).fill(0)),
    first: opts.first||1, turn: opts.first||1, phase: "place",
    placeOrder: (opts.first===2)?[2,1,1,2]:[1,2,2,1], placeIdx: 0,
    breaker: {1:true, 2:true}, over: false, winner: 0, result: null,
    last: null, moves: 0, note: ""
  };
}
const clone = g => JSON.parse(JSON.stringify(g));
const inside = (r,c) => r>=0 && c>=0 && r<N && c<N;

function edgeOf(r,c,dir){            // borda de uma casa numa direção -> {k,r,c} ou null (borda do tabuleiro)
  if (dir==="up")    return r>0     ? {k:"h", r:r-1, c} : null;
  if (dir==="down")  return r<N-1   ? {k:"h", r, c}     : null;
  if (dir==="left")  return c>0     ? {k:"v", r, c:c-1} : null;
  if (dir==="right") return c<N-1   ? {k:"v", r, c}     : null;
}
const wallAt = (g,e) => e.k==="h" ? g.h[e.r][e.c] : g.vw[e.r][e.c];
function setWall(g,e,val){ if (e.k==="h") g.h[e.r][e.c]=val; else g.vw[e.r][e.c]=val; }
function open(g,r,c,dir){ const e=edgeOf(r,c,dir); return !!e && !wallAt(g,e); }
function stoneAt(g,r,c){ return g.stones.findIndex(s=>s.r===r && s.c===c); }

/* casas alcançáveis com até 2 passos (horizontal/vertical), sem atravessar muro nem peça */
function reachable(g, si){
  const s=g.stones[si], seen=new Map([[s.r+","+s.c,0]]), q=[[s.r,s.c,0]], out=[[s.r,s.c]];
  while(q.length){
    const [r,c,d]=q.shift(); if (d===2) continue;
    for (const dir in DIRS){
      if (!open(g,r,c,dir)) continue;
      const nr=r+DIRS[dir][0], nc=c+DIRS[dir][1], k=nr+","+nc;
      if (seen.has(k) || stoneAt(g,nr,nc)>=0) continue;
      seen.set(k,d+1); q.push([nr,nc,d+1]); out.push([nr,nc]);
    }
  }
  return out;
}
/* lados livres de uma casa (onde dá para pôr muro) */
function freeEdges(g,r,c){ return Object.keys(DIRS).filter(d=>{ const e=edgeOf(r,c,d); return e && !wallAt(g,e); }).map(d=>({dir:d, ...edgeOf(r,c,d)})); }
function destinations(g, si){ return reachable(g,si).filter(([r,c])=>freeEdges(g,r,c).length>0); }
function hasMove(g,p){ return g.stones.some((s,i)=>s.p===p && destinations(g,i).length>0); }

/* regiões: casas ligadas sem muro entre elas */
function regions(g){
  const id=Array.from({length:N},()=>Array(N).fill(-1)), out=[];
  for (let r=0;r<N;r++) for (let c=0;c<N;c++){
    if (id[r][c]>=0) continue;
    const reg={cells:[], owners:new Set()}, q=[[r,c]]; id[r][c]=out.length;
    while(q.length){
      const [a,b]=q.pop(); reg.cells.push([a,b]);
      const si=stoneAt(g,a,b); if (si>=0) reg.owners.add(g.stones[si].p);
      for (const d in DIRS){ if(!open(g,a,b,d)) continue; const na=a+DIRS[d][0], nb=b+DIRS[d][1]; if(id[na][nb]<0){ id[na][nb]=out.length; q.push([na,nb]); } }
    }
    out.push(reg);
  }
  return out;
}
/* território já garantido de cada jogador (regiões só com peças dele) */
function territory(g){
  const t={1:0,2:0,big:{1:0,2:0}};
  for (const reg of regions(g)) if (reg.owners.size===1){ const p=[...reg.owners][0]; t[p]+=reg.cells.length; t.big[p]=Math.max(t.big[p],reg.cells.length); }
  return t;
}
function separated(g){ return regions(g).every(reg=>reg.owners.size<=1); }

/* muros que encostam nas peças do jogador (alvos do derrubador) */
function breakable(g,p){
  const out=[], key=new Set();
  g.stones.forEach(s=>{ if(s.p!==p) return; for (const d in DIRS){ const e=edgeOf(s.r,s.c,d); if(e && wallAt(g,e)){ const k=e.k+e.r+","+e.c; if(!key.has(k)){ key.add(k); out.push(e); } } } });
  return out;
}

function finish(g){
  const t=territory(g);
  g.over=true; g.phase="over";
  g.winner = t[1]>t[2]?1 : t[2]>t[1]?2 : (t.big[1]>t.big[2]?1 : t.big[2]>t.big[1]?2 : 0);
  g.result = {1:t[1], 2:t[2], big:t.big, tiebreak: t[1]===t[2] && g.winner!==0};
}
function advance(g){
  if (separated(g)) return finish(g);
  const nx=other(g.turn);
  if (hasMove(g,nx)) { g.turn=nx; g.note=""; return; }
  if (hasMove(g,g.turn)) { g.note=`Jogador ${nx} não tem jogada possível e passa a vez.`; return; }
  finish(g);
}

/* aplica uma ação (mesma função usada no jogo local, contra o computador e online)
   {t:"place", r, c} | {t:"break", k, r, c} | {t:"move", s, r, c, w:{k,r,c}}            */
function apply(g, a, who){
  if (g.over) return "O jogo acabou.";
  if (who && who!==g.turn) return "Não é a sua vez.";
  const p=g.turn;
  if (a.t==="place"){
    if (g.phase!=="place") return "Fase de colocar peças já terminou.";
    if (!inside(a.r,a.c) || stoneAt(g,a.r,a.c)>=0) return "Casa ocupada.";
    g.stones.push({p, r:a.r, c:a.c}); g.last={t:"place", r:a.r, c:a.c};
    g.placeIdx++;
    if (g.placeIdx>=g.placeOrder.length){ g.phase="play"; g.turn=g.first||1; }
    else g.turn=g.placeOrder[g.placeIdx];
    return null;
  }
  if (g.phase!=="play") return "Ainda estamos colocando peças.";
  if (a.t==="break"){
    if (!g.breaker[p]) return "Você já usou o derrubador.";
    if (!breakable(g,p).some(e=>e.k===a.k && e.r===a.r && e.c===a.c)) return "Esse muro não encosta em uma peça sua.";
    setWall(g,{k:a.k,r:a.r,c:a.c},0); g.breaker[p]=false; g.last={t:"break", k:a.k, r:a.r, c:a.c};
    return null;   // a vez continua: depois de derrubar, ainda move e coloca muro
  }
  if (a.t==="move"){
    const s=g.stones[a.s];
    if (!s || s.p!==p) return "Essa peça não é sua.";
    if (!destinations(g,a.s).some(([r,c])=>r===a.r && c===a.c)) return "A peça não alcança essa casa.";
    const fr=s.r, fc=s.c; s.r=a.r; s.c=a.c;
    if (!freeEdges(g,a.r,a.c).some(e=>e.k===a.w.k && e.r===a.w.r && e.c===a.w.c)){ s.r=fr; s.c=fc; return "O muro precisa ficar num lado livre da casa onde a peça parou."; }
    setWall(g,a.w,p); g.moves++;
    g.last={t:"move", s:a.s, from:[fr,fc], to:[a.r,a.c], w:a.w};
    advance(g);
    return null;
  }
  return "Ação desconhecida.";
}

/* ----------------- computador ----------------- */
/* estimativa de controle: cada casa vai para quem chega primeiro (contando muros) */
function control(g){
  const dist={1:Array(N*N).fill(99),2:Array(N*N).fill(99)};
  for (const p of [1,2]){
    const q=[]; g.stones.forEach(s=>{ if(s.p===p){ dist[p][s.r*N+s.c]=0; q.push([s.r,s.c]); } });
    while(q.length){ const [r,c]=q.shift(), d=dist[p][r*N+c];
      for (const k in DIRS){ if(!open(g,r,c,k)) continue; const nr=r+DIRS[k][0], nc=c+DIRS[k][1];
        const si=stoneAt(g,nr,nc); if (si>=0 && g.stones[si].p!==p) continue;          // peça adversária bloqueia
        if(dist[p][nr*N+nc]>d+1){ dist[p][nr*N+nc]=d+1; q.push([nr,nc]); } } }
  }
  let s1=0,s2=0; for (let i=0;i<N*N;i++){ if(dist[1][i]<dist[2][i]) s1++; else if(dist[2][i]<dist[1][i]) s2++; }
  return {1:s1,2:s2};
}
function evalFor(g,p){
  if (g.over) return g.winner===p?1000:(g.winner===0?0:-1000);
  const c=control(g), t=territory(g);
  return (c[p]-c[other(p)]) + 0.5*(t[p]-t[other(p)]);
}
function allMoves(g){
  const out=[];
  if (g.phase==="place"){ for(let r=0;r<N;r++) for(let c=0;c<N;c++) if(stoneAt(g,r,c)<0) out.push({t:"place",r,c}); return out; }
  g.stones.forEach((s,si)=>{ if(s.p!==g.turn) return;
    for (const [r,c] of destinations(g,si)){
      const fr=s.r, fc=s.c; s.r=r; s.c=c; const fe=freeEdges(g,r,c); s.r=fr; s.c=fc;
      for (const e of fe) out.push({t:"move", s:si, r, c, w:{k:e.k,r:e.r,c:e.c}});
    } });
  return out;
}
function aiMove(g, level="normal"){
  const me=g.turn, moves=allMoves(g); if(!moves.length) return null;
  const noise = level==="easy" ? 8 : 0.3;            // fácil: escolhe quase ao acaso entre boas e más jogadas
  let best=null, bestV=-1e9;
  for (const m of moves){
    const g2=clone(g); if (apply(g2,m)) continue;
    const v=evalFor(g2,me) + Math.random()*noise;
    if (v>bestV){ bestV=v; best=m; }
  }
  return best;
}

const API = {N, DIRS, newGame, clone, apply, reachable, destinations, freeEdges, edgeOf, wallAt, stoneAt, regions, territory, separated, breakable, hasMove, aiMove, other};
if (typeof module!=="undefined") module.exports=API; else root.Cercado=API;
})(this);

/* =========================================================
   Conexão entre aparelhos.
   - PeerJS (WebRTC) em produção: conexão direta, sem servidor próprio.
   - BroadcastChannel quando a URL tem ?bc (testes automáticos em abas).
   ========================================================= */
export class Link {
  private queue: unknown[] = [];
  private handler: ((d: any) => void) | null = null;
  closeHandler: (() => void) | null = null;
  constructor(private sender: (d: unknown) => void, private closer: () => void) {}
  send(d: unknown) { try { this.sender(d); } catch { /* conexão caiu */ } }
  close() { try { this.closer(); } catch { /* ignora */ } }
  set onData(fn: (d: any) => void) { this.handler = fn; this.queue.splice(0).forEach(fn); }
  receive(d: unknown) { if (this.handler) this.handler(d); else this.queue.push(d); }
  closed() { this.closeHandler?.(); }
}

export const USE_BC = typeof location !== "undefined" && new URLSearchParams(location.search).has("bc");
const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newCode = () => Array.from({ length: 5 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join("");
const peerId = (code: string) => "cercado2-mf-" + code.toLowerCase();

export interface HostHandle { close(): void }

/** Abre uma sala. Chama onLink para cada aparelho que entrar. */
export async function openRoom(code: string, onLink: (l: Link) => void, onError: (msg: string, fatal: boolean) => void): Promise<HostHandle> {
  if (USE_BC) {
    const ch = new BroadcastChannel("cercado-" + code), links = new Map<string, Link>();
    ch.onmessage = e => {
      const m = e.data; if (m.to !== "host") return;
      if (m.kind === "join") { const l = new Link(d => ch.postMessage({ to: m.from, kind: "data", d }), () => ch.postMessage({ to: m.from, kind: "leave" })); links.set(m.from, l); onLink(l); }
      else if (m.kind === "data") links.get(m.from)?.receive(m.d);
      else if (m.kind === "leave") { links.get(m.from)?.closed(); links.delete(m.from); }
    };
    return { close: () => { links.forEach(l => l.close()); ch.close(); } };
  }
  const { Peer } = await import("peerjs");
  return new Promise((resolve, reject) => {
    const peer = new Peer(peerId(code), { debug: 0 });
    let ready = false;
    peer.on("open", () => { ready = true; resolve({ close: () => peer.destroy() }); });
    peer.on("connection", conn => {
      const l = new Link(d => conn.send(d), () => conn.close());
      conn.on("open", () => onLink(l));
      conn.on("data", d => l.receive(d));
      conn.on("close", () => l.closed());
      conn.on("error", () => l.closed());
    });
    peer.on("disconnected", () => { try { peer.reconnect(); } catch { /* ignora */ } });
    peer.on("error", (e: any) => {
      const msg = e?.type === "unavailable-id" ? "codigo-ocupado" : "Sem conexão com o servidor de salas. Verifique a internet.";
      if (!ready) reject(new Error(msg)); else onError(msg, false);
    });
  });
}

/** Entra numa sala pelo código. */
export async function joinRoom(code: string): Promise<Link> {
  if (USE_BC) {
    const ch = new BroadcastChannel("cercado-" + code), me = Math.random().toString(36).slice(2);
    const l = new Link(d => ch.postMessage({ from: me, to: "host", kind: "data", d }), () => { ch.postMessage({ from: me, to: "host", kind: "leave" }); ch.close(); });
    ch.onmessage = e => { const m = e.data; if (m.to !== me) return; if (m.kind === "data") l.receive(m.d); if (m.kind === "leave") l.closed(); };
    ch.postMessage({ from: me, to: "host", kind: "join" });
    return l;
  }
  const { Peer } = await import("peerjs");
  return new Promise((resolve, reject) => {
    const peer = new Peer({ debug: 0 });
    const timer = setTimeout(() => { peer.destroy(); reject(new Error("Não foi possível conectar. Confira o código e a internet.")); }, 15000);
    peer.on("open", () => {
      const conn = peer.connect(peerId(code), { reliable: true });
      const l = new Link(d => conn.send(d), () => { conn.close(); peer.destroy(); });
      conn.on("open", () => { clearTimeout(timer); resolve(l); });
      conn.on("data", d => l.receive(d));
      conn.on("close", () => l.closed());
    });
    peer.on("error", (e: any) => {
      clearTimeout(timer);
      reject(new Error(e?.type === "peer-unavailable" ? "Sala não encontrada. Confira o código." : "Sem conexão com o servidor de salas. Verifique a internet."));
    });
  });
}

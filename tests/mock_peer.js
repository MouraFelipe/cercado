(() => {
  const bus = new BroadcastChannel("mockpeer");
  const peers = new Map(); // ids desta aba
  class Emitter { constructor(){ this.h={}; } on(e,f){ (this.h[e]=this.h[e]||[]).push(f); return this; } emit(e,...a){ (this.h[e]||[]).forEach(f=>f(...a)); } }
  const conns = new Map();
  class Conn extends Emitter { constructor(id, local, remote){ super(); this.id=id; this.local=local; this.remote=remote; this.open=false; conns.set(id,this); }
    send(d){ if(!this.open) return; bus.postMessage({t:"data", id:this.id, to:this.remote, d: JSON.parse(JSON.stringify(d))}); }
    close(){ if(!this.open) return; this.open=false; bus.postMessage({t:"close", id:this.id, to:this.remote}); conns.delete(this.id); this.emit("close"); } }
  class Peer extends Emitter {
    constructor(id){ super(); if (typeof id!=="string") id="anon-"+Math.random().toString(36).slice(2); this.id=id;
      const q=Math.random().toString(36).slice(2); this.q=q;
      bus.postMessage({t:"claim", id, q});
      this._t=setTimeout(()=>{ peers.set(id,this); this.emit("open", id); }, 200); }
    connect(remote){ const c=new Conn(Math.random().toString(36).slice(2), this.id, remote); bus.postMessage({t:"conn", id:c.id, from:this.id, to:remote});
      c._fail=setTimeout(()=>{ if(!c.open) this.emit("error",{type:"peer-unavailable"}); }, 800); return c; }
    destroy(){ for (const c of [...conns.values()]) if (c.local===this.id) c.close(); peers.delete(this.id); bus.postMessage({t:"gone", id:this.id}); }
    reconnect(){}
  }
  bus.onmessage = e => { const m=e.data;
    if (m.t==="claim" && peers.has(m.id)) bus.postMessage({t:"taken", id:m.id, q:m.q});
    if (m.t==="conn" && peers.has(m.to)){ const p=peers.get(m.to); const c=new Conn(m.id, m.to, m.from); c.open=true; bus.postMessage({t:"ack", id:m.id}); p.emit("connection", c); setTimeout(()=>c.emit("open"),0); }
    if (m.t==="ack"){ const c=conns.get(m.id); if (c){ clearTimeout(c._fail); c.open=true; c.emit("open"); } }
    if (m.t==="data"){ const c=conns.get(m.id); if (c && c.local===m.to) c.emit("data", m.d); }
    if (m.t==="close"){ const c=conns.get(m.id); if (c && c.local===m.to){ c.open=false; conns.delete(m.id); c.emit("close"); } }
  };
  window.addEventListener("pagehide", ()=>{ for (const c of [...conns.values()]) c.close(); });
  window.Peer = Peer;
})();

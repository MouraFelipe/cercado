(() => {
  const ch = new BroadcastChannel("mockroom");
  const myPeer = Math.random().toString(36).slice(2,10);
  let myPres = {};
  const others = new Map();
  const handlers = [];
  const snap = () => Object.freeze([{peer:myPeer,sameTab:true,isMe:true,kind:"viewer",by:null,guest:false,presence:myPres,updatedAt:Date.now()},
    ...[...others].map(([p,pr])=>({peer:p,sameTab:false,isMe:false,kind:"viewer",by:null,guest:false,presence:pr,updatedAt:Date.now()}))]);
  const fire = () => { const s=snap(); handlers.forEach(h=>h({peers:s,joined:[],left:[],updated:[]})); };
  ch.onmessage = e => { const m=e.data;
    if (m.t==="pres"){ others.set(m.peer,m.pres); fire(); }
    if (m.t==="hello"){ ch.postMessage({t:"pres",peer:myPeer,pres:myPres}); if(!others.has(m.peer)){ others.set(m.peer,{}); fire(); } }
    if (m.t==="bye"){ others.delete(m.peer); fire(); } };
  ch.postMessage({t:"hello",peer:myPeer});
  window.addEventListener("pagehide",()=>ch.postMessage({t:"bye",peer:myPeer}));
  const room = {
    presence: async patch => { const n={...myPres}; for (const k in patch){ if(patch[k]===null) delete n[k]; else n[k]=patch[k]; }
      const sz=JSON.stringify(n).length; if (sz>4096) throw {code:"invalid_argument"}; window.__maxPres=Math.max(window.__maxPres||0,sz);
      myPres=n; ch.postMessage({t:"pres",peer:myPeer,pres:myPres}); setTimeout(fire,0); },
    peers: snap,
    onPeers: (h) => { handlers.push(h); setTimeout(fire,0); return ()=>{}; },
    emit: async()=>{}, on: ()=>()=>{}, connected: ()=>true, onConnection: h=>{ setTimeout(()=>h(true),0); return ()=>{}; }
  };
  setTimeout(()=>{ window.claude = { use: async n => n==="room" ? room : null }; }, 300);
})();

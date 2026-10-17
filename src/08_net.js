// ============================================================================
//  Networking. Host-authoritative world + owner-predicted avatars.
//   - The host's browser runs enemies/bosses/rooms/loot (same code as solo).
//   - Every client simulates its OWN avatar instantly (client prediction) and
//     judges hits against itself; others are shown 100 ms in the past via
//     snapshot interpolation so they move smoothly.
//   - Guests report their hits to the host, which applies them authoritatively.
// ============================================================================
const INTERP = 0.1;      // render remote things this far in the past
const SNAP_HZ = 20, PS_HZ = 30;
// public co-op server used by the GitHub Pages site (a free Render web service running server.js)
const ONLINE_SERVER = 'wss://hearthlight.onrender.com';

const Net = {
  ws: null, role: 'solo', pid: 0, code: null, token: null, url: null, roster: [], online: false,
  sources: new Map(), // pid -> {off, buf:[]}
  snaps: [], hostOff: null, lastSnapT: 0, sendAcc: 0, psAcc: 0, reconnecting: false, rcTries: 0, pingMs: 0,
  isAuth() { return this.role !== 'guest'; },
  partySize() { return G.world ? Math.max(1, G.world.players.size) : 1; },
  defaultUrl() {
    try { const s = localStorage.getItem('hl_server'); if (s) return s; } catch (e) { }
    // static hosting (GitHub Pages) has no game server of its own: use the public co-op server
    if (/\.github\.io$/i.test(location.hostname)) return ONLINE_SERVER;
    if (location.protocol === 'http:' || location.protocol === 'https:') return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    return 'ws://localhost:8080';
  },
  status: null, // optional callback(text) for connection progress
  // Free hosts put idle servers to sleep. Ping /health until it answers (up to ~75s) before opening the socket.
  async wake(url) {
    if (!/^wss:\/\//i.test(url)) return;
    const health = url.replace(/^wss:/i, 'https:').replace(/\/+$/, '') + '/health';
    const t0 = Date.now();
    while (Date.now() - t0 < 75000) {
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const kill = setTimeout(() => ac && ac.abort(), 15000);
      try { const r = await fetch(health, { cache: 'no-store', signal: ac ? ac.signal : undefined }); clearTimeout(kill); if (r.ok) return; } catch (e) { clearTimeout(kill); }
      this.status && this.status(`Waking the co-op server… ${Math.round((Date.now() - t0) / 1000)}s (free servers nap when idle; this takes up to a minute)`);
      await new Promise(r => setTimeout(r, 2000));
    }
  },
  async connect(url) {
    await this.wake(url);
    this.status && this.status('Connecting…');
    return new Promise((res, rej) => {
      let ws; try { ws = new WebSocket(url); } catch (e) { rej(new Error('Bad server address')); return; }
      const to = setTimeout(() => { try { ws.close(); } catch (e) { } rej(new Error('No server found at ' + url)); }, /^wss:/i.test(url) ? 15000 : 4000);
      ws.onopen = () => { clearTimeout(to); this.ws = ws; this.url = url; this.online = true; res(ws); };
      ws.onerror = () => { clearTimeout(to); rej(new Error('No server found at ' + url)); };
      ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } this.onServer(m); };
      ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.online = false; this.onDrop(); } };
    });
  },
  raw(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); },
  send(to, d) { if (this.role === 'solo') return; this.raw({ t: 'msg', to, d }); },
  broadcast(d) { if (this.role === 'solo') return; this.raw({ t: 'msg', to: 'all', d }); },
  async host(name, url) {
    await this.connect(url);
    return new Promise((res, rej) => { this._pending = { res, rej }; this.raw({ t: 'host', name }); });
  },
  async join(code, name, url) {
    await this.connect(url);
    let token = null; try { const s = JSON.parse(sessionStorage.getItem('hl_join') || 'null'); if (s && s.code === code) token = s.token; } catch (e) { }
    return new Promise((res, rej) => { this._pending = { res, rej }; this.raw({ t: 'join', code, name, token }); });
  },
  leave() {
    this.reconnecting = false;
    if (this.ws) { try { this.raw({ t: 'leave' }); this.ws.close(); } catch (e) { } }
    this.ws = null; this.role = 'solo'; this.pid = 0; this.code = null; this.online = false; this.sources.clear(); this.snaps = []; this.hostOff = null; this.roster = [];
    try { sessionStorage.removeItem('hl_join'); sessionStorage.removeItem('hl_host'); } catch (e) { }
    if (G.world) for (const [pid] of [...G.world.players]) if (G.me && pid !== G.me.pid) G.world.players.delete(pid);
    if (G.me) { G.world.players.delete(G.me.pid); G.me.pid = 0; G.world.players.set(0, G.me); }
    updateNetStatus();
  },
  onServer(m) {
    switch (m.t) {
      case 'hosted':
        this.role = 'host'; this.pid = 0; this.code = m.code; this.token = m.token; this.roster = m.roster;
        try { sessionStorage.setItem('hl_host', JSON.stringify({ code: m.code, token: m.token, url: this.url })); } catch (e) { }
        if (this._pending) { this._pending.res(m); this._pending = null; }
        if (m.resumed) { chatSys('Reconnected to the server.'); this.reconnecting = false; }
        updateNetStatus(); break;
      case 'joined':
        this.role = 'guest'; this.pid = m.pid; this.code = m.code; this.token = m.token; this.roster = m.roster;
        try { sessionStorage.setItem('hl_join', JSON.stringify({ code: m.code, token: m.token, url: this.url })); } catch (e) { }
        if (this._pending) { this._pending.res(m); this._pending = null; }
        this.reconnecting = false; this.snaps = []; this.hostOff = null;
        this.send('host', { k: 'hello', prof: myProfileMsg() });
        updateNetStatus(); break;
      case 'error':
        if (this._pending) { this._pending.rej(new Error(m.reason)); this._pending = null; } else toast(m.reason);
        break;
      case 'peerJoin':
        this.roster = m.roster; chatSys(`${m.name} joined the party.`); SFX.play('chat'); updateNetStatus(); break;
      case 'peerLeave':
        this.roster = m.roster; removeRemotePlayer(m.pid, true); updateNetStatus(); break;
      case 'hostLost': chatSys('Lost contact with the host… waiting for them to return.'); this.hostLost = true; updateNetStatus(); break;
      case 'hostBack': chatSys('The host is back.'); this.hostLost = false; this.roster = m.roster; this.send('host', { k: 'hello', prof: myProfileMsg() }); updateNetStatus(); break;
      case 'roomClosed': chatSys(m.reason || 'The game was closed.'); this.leave(); onSessionEnded(); break;
      case 'msg': this.onMsg(m.d, m.from); break;
    }
  },
  onDrop() {
    if (this.role === 'solo') return;
    chatSys('Connection lost. Trying to reconnect…');
    this.reconnecting = true; this.rcTries = 0; updateNetStatus();
    const attempt = async () => {
      if (!this.reconnecting) return;
      if (++this.rcTries > 12) { chatSys('Could not reconnect. Continuing solo.'); this.leave(); onSessionEnded(); return; }
      try {
        await this.connect(this.url);
        if (this.role === 'host') this.raw({ t: 'host', name: G.P.name, code: this.code, token: this.token });
        else this.raw({ t: 'join', code: this.code, name: G.P.name, token: this.token });
      } catch (e) { setTimeout(attempt, 2000); }
    };
    setTimeout(attempt, 1000);
  },
  // ---- clock sync per sender ----
  source(pid) { let s = this.sources.get(pid); if (!s) { s = { off: null, buf: [] }; this.sources.set(pid, s); } return s; },
  syncClock(s, senderT) {
    const sample = senderT - nowSec();
    if (s.off === null || sample > s.off) s.off = sample; else s.off -= 0.0008; // tracks min latency, adapts to drift
  },
  onMsg(d, from) {
    if (!d || !d.k) return;
    const h = NET_HANDLERS[d.k];
    if (h) try { h(d, from); } catch (e) { console.error('net handler', d.k, e); }
  },
  // ---- per tick ----
  tick(dt) {
    if (this.role === 'solo' || !this.ws) return;
    const me = G.me;
    this.psAcc += dt;
    if (me && this.psAcc >= 1 / PS_HZ) { this.psAcc = 0; this.broadcast(playerStateMsg(me)); }
    if (this.role === 'host' && G.world) {
      this.sendAcc += dt;
      if (this.sendAcc >= 1 / SNAP_HZ) { this.sendAcc = 0; if (!this.ws.bufferedAmount || this.ws.bufferedAmount < 200000) this.broadcast(makeSnapshot(G.world)); }
    }
  },
};

// ---------------------------------------------------------------------------
//  Messages
// ---------------------------------------------------------------------------
function myProfileMsg() { const P = G.P; return { name: P.name, color: P.color, lvl: P.level, w: G.me ? G.me.wtype : 'sword' }; }
function playerStateMsg(p) {
  return { k: 'ps', t: Math.round(nowSec() * 1000) / 1000, x: r1(p.x), y: r1(p.y), f: r1(p.face), a: r1(p.aim), s: p.state, st: r1(p.st), c: p.combo, hp: Math.round(p.hp), mh: p.maxHp, dn: p.downed ? 1 : 0, dd: p.dead ? 1 : 0, rv: r1(p.reviveP), sh: p.shield > 0 ? 1 : 0, sp: p.spinT > 0 ? 1 : 0, bl: p.bladesT > 0 ? 1 : 0, w: p.wtype, n: p.name, col: p.color, lvl: G.P.level, ra: r1(p.rollAng || 0), sc: G.scene, sid: G.world ? G.world.sid : '' };
}
function netFx(fx) { Net.broadcast({ k: 'fx', d: fx }); }

function makeSnapshot(w) {
  const e = [];
  for (const x of w.ents.values()) {
    if (x.type === 'enemy') e.push([x.id, 'e', x.sk, r1(x.x), r1(x.y), r1(x.face), r1(x.aim), x.boss ? (x.anim || x.state) : x.state, Math.max(0, Math.round(x.hp)), x.maxHp, x.flash > 0 ? 1 : 0, x.frozen > 0 ? 1 : 0, r1(x.z || 0), r1(x.alpha ?? 1), (x.elite ? 1 : 0) | (x.boss ? 2 : 0) | (x.minion ? 4 : 0) | (x.hidden ? 8 : 0) | (x.chill > 0 ? 16 : 0) | (x.poison > 0 ? 32 : 0) | (x.burn > 0 ? 64 : 0) | (x.invuln ? 128 : 0), x.r, x.kind, r1(x.st), x.lvl, x.phase || 0]);
    else if (x.type === 'coin') e.push([x.id, 'c', 0, r1(x.x), r1(x.y), r1(x.z)]);
    else e.push([x.id, x.type, x.item ? x.item.rarity : 0, r1(x.x), r1(x.y), r1(x.z)]);
  }
  return { k: 'snap', t: Math.round(w.time * 1000) / 1000, e, dk: [w.dun ? w.dun.keys : 0, w.dun && w.dun.bossKey ? 1 : 0] };
}
// guests: rebuild the enemy/pickup view from the two snapshots around render time
const _deadIds = new Set();
function guestInterpolate(w) {
  const S = Net.snaps; if (!S.length || Net.hostOff === null) return;
  const rt = nowSec() + Net.hostOff - INTERP;
  w.rtime = rt;
  while (S.length > 2 && S[1].t <= rt) S.shift();
  const a = S[0], b = S[1] || S[0];
  const u = b.t > a.t ? clamp((rt - a.t) / (b.t - a.t), 0, 1.2) : 0;
  const seen = new Set();
  const bm = b.map;
  for (const [id, A] of a.map) {
    if (_deadIds.has(id)) continue;
    const B = bm.get(id) || A;
    seen.add(id);
    let e = w.ents.get(id);
    if (A[1] === 'e') {
      if (!e) { e = { id, type: 'enemy', lflash: 0 }; w.ents.set(id, e); }
      e.sk = A[2]; e.x = lerp(A[3], B[3], u); e.y = lerp(A[4], B[4], u); e.face = lerpAng(A[5], B[5], u); e.aim = lerpAng(A[6], B[6], u);
      e.state = A[7]; e.anim = A[7]; e.hp = B[8]; e.maxHp = A[9]; e.flash = A[10] ? 0.05 : 0; e.frozen = A[11] ? 1 : 0; e.z = lerp(A[12], B[12], u); e.alpha = lerp(A[13], B[13], u);
      const fl = A[14]; e.elite = !!(fl & 1); e.boss = !!(fl & 2); e.minion = !!(fl & 4); e.hidden = !!(fl & 8); e.chill = fl & 16 ? 1 : 0; e.poison = fl & 32 ? 1 : 0; e.burn = fl & 64 ? 1 : 0; e.invuln = !!(fl & 128);
      e.r = A[15]; e.kind = A[16]; e.st = A[17]; e.lvl = A[18]; e.phase = A[19]; e.dead = false;
      if (e.boss) e.bk = e.sk;
    } else {
      if (!e) { e = { id, type: A[1] === 'c' ? 'coin' : A[1] }; w.ents.set(id, e); }
      e.x = lerp(A[3], B[3], u); e.y = lerp(A[4], B[4], u); e.z = lerp(A[5], B[5], u); e.rar = A[2];
      e.t = (e.t || 0) + 1 / 60;
    }
  }
  for (const [id] of b.map) if (!seen.has(id) && !_deadIds.has(id) && !w.ents.has(id) && b.map.get(id)[1] !== 'e') { /* appears next step */ }
  for (const id of [...w.ents.keys()]) if (!seen.has(id) && !(b.map.has(id) && u > 0.8)) w.ents.delete(id);
  if (_deadIds.size > 500) _deadIds.clear();
}
// remote players: interpolate their own state stream
function interpolateRemotePlayers(w) {
  for (const [pid, p] of w.players) {
    if (!p.remote) continue;
    const s = Net.sources.get(pid); if (!s || s.off === null) { p.away = true; continue; }
    // only use updates sent from the same world we're in (ignore stragglers from the previous scene)
    if (s.buf.length && s.buf[0].sid !== w.sid) s.buf = s.buf.filter(e => e.sid === w.sid);
    if (!s.buf.length) { p.away = true; continue; }
    p.away = false;
    const rt = nowSec() + s.off - INTERP;
    const B = s.buf;
    while (B.length > 2 && B[1].t <= rt) B.shift();
    const a = B[0], b = B[1] || B[0];
    const u = b.t > a.t ? clamp((rt - a.t) / (b.t - a.t), 0, 1.1) : 0;
    p.px = p.x; p.py = p.y;
    p.x = lerp(a.x, b.x, u); p.y = lerp(a.y, b.y, u);
    p.face = lerpAng(a.f, b.f, u); p.aim = lerpAng(a.a, b.a, u);
    const prevState = p.state;
    p.state = a.s; p.st = a.st + (rt - a.t); p.combo = a.c; p.hp = b.hp; p.maxHp = a.mh; p.downed = !!b.dn; p.dead = !!b.dd; p.reviveP = b.rv;
    p.shield = a.sh ? 1 : 0; p.spinT = a.sp ? 1 : 0; p.bladesT = a.bl ? 1 : 0; p.wtype = a.w; p.name = a.n; p.color = a.col; p.lvl = a.lvl; p.rollAng = a.ra; p.scene = a.sc;
    p.moving = dist(a.x, a.y, b.x, b.y) > 0.5; if (p.moving) p.walkT += 0.15;
    if (p.spinT) p.spin = (p.spin || 0) + 0.35; if (p.bladesT) p.blades = (p.blades || 0) + 0.08;
    if (prevState !== 'roll' && p.state === 'roll') spawnDust(p.x, p.y, 4);
  }
}
function ensureRemotePlayer(pid, info) {
  const w = G.world; if (!w || pid === Net.pid) return null;
  let p = w.players.get(pid);
  if (!p) {
    p = makePlayer(pid, info.n || info.name || 'Ally', info.col || info.color || '#ff8a3a', null);
    p.remote = true; p.maxHp = info.mh || 100; p.hp = info.hp || 100; w.players.set(pid, p);
    if (info.x != null) { p.x = info.x; p.y = info.y; }
  }
  return p;
}
function removeRemotePlayer(pid, announce) {
  const w = G.world; if (!w) return;
  const p = w.players.get(pid);
  if (p && p.remote) { w.players.delete(pid); if (announce) chatSys(`${p.name} left the party.`); }
  Net.sources.delete(pid);
  checkPartyWipe();
}

const NET_HANDLERS = {
  // ---------- state streams ----------
  ps(d, from) {
    const s = Net.source(from); Net.syncClock(s, d.t);
    s.buf.push(d); if (s.buf.length > 30) s.buf.shift();
    if (G.world && d.sid === G.world.sid) { const p = ensureRemotePlayer(from, d); if (p && p.away !== false) { p.x = d.x; p.y = d.y; } }
  },
  snap(d, from) {
    if (Net.role !== 'guest') return;
    const sample = d.t - nowSec();
    if (Net.hostOff === null || sample > Net.hostOff) Net.hostOff = sample; else Net.hostOff -= 0.0008;
    const map = new Map(); for (const a of d.e) map.set(a[0], a);
    Net.snaps.push({ t: d.t, map }); if (Net.snaps.length > 40) Net.snaps.shift();
    if (G.world && G.world.dun) { G.world.dun.keys = d.dk[0]; G.world.dun.bossKey = !!d.dk[1]; }
  },
  // ---------- session ----------
  hello(d, from) { // host: a guest (re)joined -> send them the world
    if (Net.role !== 'host') return;
    chatSys(`${d.prof.name} (Lv ${d.prof.lvl}) is here.`);
    const w = G.world;
    const ps = ensureRemotePlayer(from, { n: d.prof.name, col: d.prof.color });
    if (ps) { ps.x = G.me.x + rnd(-10, 10); ps.y = G.me.y + rnd(-10, 10); }
    Net.send(from, welcomeMsg(w, from));
    Net.send(from, playerStateMsg(G.me));
  },
  welcome(d) { onWelcome(d); },
  scene(d) { if (Net.role === 'guest') enterSceneFromHost(d); },
  gateBrowse(d) { if (Net.role === 'guest') toast(`${d.name} is choosing a dungeon at the gate…`); },
  // ---------- host-bound requests ----------
  hit(d) { if (Net.role === 'host' && G.world) applyHit(G.world, d); },
  pot(d) { if (Net.role === 'host') breakPot(G.world, d.i); else onPotBroken(d.i); },
  parried(d) { if (Net.role === 'host') staggerEnemy(G.world, d.id, 1.4); },
  interact(d, from) { if (Net.role === 'host') hostInteract(G.world, d, from); },
  epx(d) { const w = G.world; if (!w) return; const i = w.eprojs.findIndex(p => p.id === d.id); if (i >= 0) w.eprojs.splice(i, 1); if (Net.role === 'host') Net.broadcast({ k: 'epx', id: d.id }); },
  dropItem(d, from) { if (Net.role === 'host' && G.world) { const c = spawnPickup(G.world, 'gitem', d.x, d.y, { item: d.item, noPick: from ?? Net.pid, noPickT: G.world.time + 3 }); c.vx = c.vy = 0; } },
  // ---------- host -> everyone events ----------
  hz(d) { const w = G.world; if (w && Net.role === 'guest') w.hazards.push(d.h); },
  hzx(d) { const w = G.world; if (!w) return; const i = w.hazards.findIndex(h => h.id === d.id); if (i >= 0) w.hazards.splice(i, 1); },
  ep(d) { const w = G.world; if (w && Net.role === 'guest') w.eprojs.push(d.p); },
  kill(d) { _deadIds.add(d.id); if (G.world) G.world.ents.delete(d.id); onKill(d); },
  boss(d) { onBossEvent(d); },
  room(d) { onRoomEvent(d); },
  doors(d) { onDoors(d); },
  keys(d) { onKeys(d); },
  gold(d) { onGold(d.amt, d.x, d.y); },
  heal(d) { onHealMsg(d); },
  chest(d) { onChest(d); },
  tp(d) { onTeleport(d); },
  give(d) { onGive(d); },
  toast(d) { toast(d.msg); },
  num(d) { numFx(d.x, d.y, d.v, d.c, typeof d.v === 'string' ? 1 : 1); },
  leaving(d) { onLeaving(d); },
  wipe() { onPartyWipe(); },
  // ---------- from anyone ----------
  fx(d, from) { onRemoteFx(d.d, from); },
  chat(d, from) { const p = G.world && G.world.players.get(from); chatLine(`${esc(d.n || (p && p.name) || 'Ally')}: ${esc(d.text)}`, p ? p.color : '#fff'); if (p) p.bubble = { text: d.text, t: 4 }; SFX.play('chat'); },
  emote(d, from) { onEmote(d, from); },
};
function welcomeMsg(w, pid) {
  const msg = { k: 'welcome', scene: G.scene, time: w.time, party: [...w.players.values()].map(p => ({ pid: p.pid, n: p.name, col: p.color })) };
  if (G.scene === 'dungeon') {
    const m = w.map;
    Object.assign(msg, {
      did: w.dun.did, tier: w.dun.tier, seed: m.seed,
      rooms: m.rooms.map(r => (r.cleared ? 1 : 0) | (r.active ? 2 : 0) | (r.discovered ? 4 : 0)),
      doors: m.doors.map(d => (d.open ? 1 : 0) + (d.lock === 'key' ? 2 : d.lock === 'boss' ? 4 : 0)),
      pots: m.pots.filter(p => p.broken || p.hostBroken).map(p => p.i),
      chests: m.chests.map(c => (c.opened ? 1 : 0) | (c.hidden ? 2 : 0)),
      dun: { keys: w.dun.keys, bossKey: w.dun.bossKey, bossDead: w.dun.bossDead, portal: w.dun.portal },
      spawn: { x: G.me.x, y: G.me.y },
    });
  }
  return msg;
}

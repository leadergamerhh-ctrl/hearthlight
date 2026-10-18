// ============================================================================
//  Host-authoritative world: enemies, bosses, rooms, pickups, traps.
//  Hazards and enemy projectiles are replicated as one-shot events and
//  simulated identically on every client.
// ============================================================================
let _entId = 1;
function newId() { return _entId++; }

function hostTime(w) { return Net.isAuth() ? w.time : w.rtime; } // time used for shared effects

// ---------------------------------------------------------------------------
//  Hazards: telegraphed damage shapes (circle, arc, line, ring, rect)
// ---------------------------------------------------------------------------
function spawnHazard(w, hz) {
  hz.id = newId(); hz.t0 = w.time; hz.tele = hz.tele || 0; hz.act = hz.act ?? 0.12;
  w.hazards.push(hz);
  Net.broadcast({ k: 'hz', h: hz });
  if (hz.tele >= 0.45 && hz.dmg > 0 && !hz.quiet) sfxAt('telegraph', hz.x ?? 0, hz.y ?? 0, 0.35);
  return hz;
}
function hazardGeom(w, hz, now) {
  const el = now - hz.t0;
  let x = hz.x, y = hz.y, ang = hz.ang || 0;
  const o = hz.owner ? w.ents.get(hz.owner) : null;
  if (o && hz.attach) { x = o.x + (hz.ox || 0); y = o.y + (hz.oy || 0); if (hz.useAim) ang = o.aim; }
  if (hz.vx || hz.vy) { const tt = Math.max(0, el - hz.tele); x += (hz.vx || 0) * tt; y += (hz.vy || 0) * tt; }
  if (hz.spin) ang += hz.spin * Math.max(0, el - hz.tele);
  return { x, y, ang, el };
}
function pointInHazard(hz, g, px, py, pr) {
  const dx = px - g.x, dy = py - g.y, d = Math.hypot(dx, dy);
  switch (hz.shape) {
    case 'circle': return d < hz.r + pr;
    case 'arc': return d < hz.r + pr && (d < 6 || Math.abs(angDiff(g.ang, Math.atan2(dy, dx))) < hz.arc / 2);
    case 'line': {
      const c = Math.cos(g.ang), s = Math.sin(g.ang), along = dx * c + dy * s, perp = -dx * s + dy * c;
      return along > -pr && along < hz.len + pr && Math.abs(perp) < hz.w / 2 + pr;
    }
    case 'ring': {
      const u = clamp((g.el - hz.tele) / hz.act, 0, 1), rad = lerp(hz.r0, hz.r1, u);
      return Math.abs(d - rad) < hz.w / 2 + pr;
    }
    case 'rect': return px > g.x - pr && px < g.x + hz.w + pr && py > g.y - pr && py < g.y + hz.h + pr;
  }
  return false;
}
function updateHazards(w, dt) {
  const now = hostTime(w);
  for (let i = w.hazards.length - 1; i >= 0; i--) {
    const hz = w.hazards[i];
    if (now - hz.t0 > hz.tele + hz.act + 0.15) w.hazards.splice(i, 1);
  }
}
function localHazardChecks(p, w, dt) {
  if (G.scene !== 'dungeon' || p.downed || p.dead) return;
  const now = hostTime(w), py = p.y - 3;
  for (const hz of w.hazards) {
    if (!hz.dmg) continue;
    const el = now - hz.t0;
    if (el < hz.tele || el > hz.tele + hz.act) continue;
    if (hz.tick) { if (hz._next && now < hz._next) continue; }
    else if (hz.hitMe) continue;
    const g = hazardGeom(w, hz, now);
    if (!pointInHazard(hz, g, p.x, py, p.r)) continue;
    const src = hz.shape === 'line' || hz.shape === 'rect' ? { x: p.x - Math.cos(g.ang) * 10, y: p.y - Math.sin(g.ang) * 10 } : { x: g.x, y: g.y };
    const res = hurtLocal(p, hz.dmg, src.x, src.y, { src: hz.owner, melee: hz.melee, kb: hz.kb, unblockable: hz.unblockable, status: hz.status });
    if (res !== 'iframe') { hz.hitMe = true; if (hz.tick) hz._next = now + hz.tick; }
  }
  // enemy projectiles
  for (let i = w.eprojs.length - 1; i >= 0; i--) {
    const pr = w.eprojs[i], el = now - pr.t0;
    if (el < 0) continue;
    const x = pr.x0 + pr.vx * el, y = pr.y0 + pr.vy * el;
    if (dist(x, y, p.x, py) < pr.r + p.r) {
      const res = hurtLocal(p, pr.dmg, x - pr.vx * 0.05, y - pr.vy * 0.05, { kb: 70, status: pr.status });
      if (res === 'iframe') continue;
      if (res === 'parry') { // reflect!
        w.pprojs.push({ kind: 'fireball', x, y, vx: -pr.vx * 1.6, vy: -pr.vy * 1.6, r: 5, life: 1.2, local: true, dmg: pr.dmg * 2, pid: p.pid });
      }
      w.eprojs.splice(i, 1);
      if (Net.isAuth()) Net.broadcast({ k: 'epx', id: pr.id }); else Net.send('host', { k: 'epx', id: pr.id });
    }
  }
}
// enemy projectiles: deterministic straight lines, removed on walls
function spawnEProj(w, pr) {
  pr.id = newId(); pr.t0 = w.time; pr.x0 = pr.x; pr.y0 = pr.y; pr.life = pr.life || 3;
  w.eprojs.push(pr); Net.broadcast({ k: 'ep', p: pr });
  return pr;
}
function updateEProjs(w, dt) {
  const now = hostTime(w);
  for (let i = w.eprojs.length - 1; i >= 0; i--) {
    const pr = w.eprojs[i], el = now - pr.t0;
    if (el < 0) continue;
    const x = pr.x0 + pr.vx * el, y = pr.y0 + pr.vy * el;
    pr.x = x; pr.y = y;
    if (el > pr.life || (el > 0.05 && projSolidAt(w.map, x, y + 4))) {
      sparkFx(x, y, pr.kind === 'orb' ? '#c9a6ff' : pr.kind === 'bubble' ? '#7fe8ff' : '#d8d0b8', 4);
      w.eprojs.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
//  Enemies
// ---------------------------------------------------------------------------
function biomeOf(w) { return w.dun ? w.dun.did : 'crypt'; }
function scaleFor(w) {
  const T = TIERS[w.dun.tier], D = DUNGEONS[w.dun.did], ps = partyScale(Net.partySize());
  return { lvl: D.level + T.lvl, hp: T.hp * ps.hp, bossHp: T.hp * ps.bossHp, dmg: T.dmg * ps.dmg, luck: T.luck };
}
function spawnEnemy(w, kind, x, y, room, o = {}) {
  const B = ENEMIES[kind], sc = scaleFor(w), lvl = sc.lvl + (o.lvlAdd || 0);
  const hpMul = (1 + lvl * 0.16) * sc.hp;
  const e = {
    id: newId(), type: 'enemy', kind, sk: biomeOf(w) + '_' + kind, x, y, vx: 0, vy: 0, kx: 0, ky: 0, mvx: 0, mvy: 0, r: B.r,
    hp: Math.round(B.hp * hpMul), maxHp: Math.round(B.hp * hpMul), poise: B.poise, maxPoise: B.poise,
    dmg: Math.round(B.dmg * (1 + lvl * 0.11) * sc.dmg), speed: B.speed * rnd(0.92, 1.08), mass: B.mass,
    state: 'spawn', st: 0, face: 0, aim: 0, flash: 0, hitstop: 0, frozen: 0, chill: 0, poison: 0, burn: 0, room, lvl,
    cd: rnd(0.4, 1.2), elite: !!B.elite, xp: Math.round(B.xp * (1 + lvl * 0.12)), alpha: 1, z: 0, orbit: Math.random() < 0.5 ? 1 : -1,
  };
  if (o.minion) e.minion = true;
  w.ents.set(e.id, e);
  return e;
}
function spawnBoss(w, room) {
  const bk = DUNGEONS[w.dun.did].boss, B = BOSSES[bk], sc = scaleFor(w), lvl = sc.lvl + 1;
  const hp = Math.round(B.hp * (1 + lvl * 0.12) * sc.bossHp);
  const pos = w.map.bossPos;
  const e = {
    id: newId(), type: 'enemy', kind: 'boss', bk, sk: bk, boss: true, x: pos.x, y: pos.y, vx: 0, vy: 0, kx: 0, ky: 0, mvx: 0, mvy: 0, r: B.r,
    hp, maxHp: hp, poise: Math.round((260 + lvl * 20) * Math.sqrt(sc.bossHp / TIERS[w.dun.tier].hp)), maxPoise: Math.round((260 + lvl * 20) * Math.sqrt(sc.bossHp / TIERS[w.dun.tier].hp)), dmg: Math.round(B.dmg * (1 + lvl * 0.1) * sc.dmg), speed: B.speed, mass: 50,
    state: 'intro', st: 0, face: Math.PI / 2, aim: Math.PI / 2, flash: 0, hitstop: 0, frozen: 0, chill: 0, poison: 0, burn: 0, room, lvl,
    cd: 1.0, xp: Math.round(B.xp * (1 + lvl * 0.1)), alpha: 1, z: 0, phase: 0, move: null, mt: 0, pmt: 0, invuln: true, last: [],
  };
  w.ents.set(e.id, e); w.dun.bossId = e.id;
  Net.broadcast({ k: 'boss', ev: 'intro', id: e.id, bk }); onBossEvent({ ev: 'intro', id: e.id, bk });
  return e;
}
function playersIn(w) { const a = []; for (const p of w.players.values()) if (!p.downed && !p.dead && !p.away) a.push(p); return a; }
function nearestPlayer(w, e, maxD = 400) {
  let best = null, bd = maxD;
  for (const p of w.players.values()) { if (p.downed || p.dead || p.away) continue; const d = dist(e.x, e.y, p.x, p.y); if (d < bd) { bd = d; best = p; } }
  return best;
}
// BFS distance field from players: lets enemies path around pillars and through doors
function updateFlow(w, dt) {
  w.flowT = (w.flowT || 0) - dt; if (w.flowT > 0) return; w.flowT = 0.25;
  const m = w.map, W = m.w, H = m.h;
  if (!w.flow) w.flow = new Int16Array(W * H);
  const f = w.flow; f.fill(-1);
  const q = new Int32Array(W * H); let qh = 0, qt = 0;
  for (const p of playersIn(w)) { const tx = Math.floor(p.x / TS), ty = Math.floor(p.y / TS), i = ty * W + tx; if (i >= 0 && i < W * H && f[i] < 0) { f[i] = 0; q[qt++] = i; } }
  while (qh < qt) {
    const i = q[qh++], d = f[i]; if (d > 40) continue;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx; if (f[ni] >= 0 || solidTile(m, nx, ny)) continue;
      f[ni] = d + 1; q[qt++] = ni;
    }
  }
}
function steer(w, e, tx, ty, spd) {
  let dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d < 2) { e.mvx = e.mvy = 0; return; }
  if (!lineOfSight(w.map, e.x, e.y, tx, ty, false) && w.flow) {
    const m = w.map, ex = Math.floor(e.x / TS), ey = Math.floor(e.y / TS);
    let best = w.flow[ey * m.w + ex], bx = 0, by = 0;
    for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nx = ex + ddx, ny = ey + ddy; if (solidTile(m, nx, ny)) continue;
      if (ddx && ddy && (solidTile(m, ex + ddx, ey) || solidTile(m, ex, ey + ddy))) continue;
      const v = w.flow[ny * m.w + nx]; if (v >= 0 && (best < 0 || v < best)) { best = v; bx = ddx; by = ddy; }
    }
    if (bx || by) { dx = (ex + bx + 0.5) * TS - e.x; dy = (ey + by + 0.5) * TS - e.y; d = Math.hypot(dx, dy) || 1; }
  }
  e.mvx = dx / d * spd; e.mvy = dy / d * spd;
}
function faceTo(e, p, rate, dt) { const a = angTo(e.x, e.y, p.x, p.y); e.aim = rate ? rotToward(e.aim, a, rate * dt) : a; e.face = e.aim; }
function setState(e, s) { e.state = s; e.st = 0; }

function updateEnemy(w, e, dt) {
  e.flash = Math.max(0, e.flash - dt);
  if (e.hitstop > 0) { e.hitstop -= dt; return; }
  if (e.dead) return;
  e.st += dt;
  // status effects
  if (e.poison > 0) { e.poison -= dt; e.dotT = (e.dotT || 0) - dt; if (e.dotT <= 0) { e.dotT = 0.5; dotDamage(w, e, e.poisonDps * 0.5, '#9be86a'); } }
  if (e.burn > 0) { e.burn -= dt; e.dotB = (e.dotB || 0) - dt; if (e.dotB <= 0) { e.dotB = 0.5; dotDamage(w, e, e.burnDps * 0.5, '#ff8a3a'); } }
  if (e.dead) return;
  if (e.chill > 0) e.chill -= dt;
  if (e.frozen > 0) { e.frozen -= dt; e.mvx = e.mvy = 0; integrateEnemy(w, e, dt); return; }
  e.mvx = e.mvy = 0;
  if (e.state === 'spawn') { if (e.st > 0.9) { setState(e, 'idle'); } return; }
  if (e.state === 'stagger') { if (e.st > (e.stagDur || 0.6)) setState(e, 'idle'); integrateEnemy(w, e, dt); return; }
  e.cd -= dt;
  const tgt = nearestPlayer(w, e, e.boss ? 900 : 500);
  if (e.boss) updateBoss(w, e, tgt, dt);
  else if (tgt) AI[e.kind](w, e, tgt, dt);
  integrateEnemy(w, e, dt);
}
function integrateEnemy(w, e, dt) {
  const slow = e.chill > 0 ? 0.5 : 1;
  e.kx *= Math.exp(-9 * dt); e.ky *= Math.exp(-9 * dt);
  if (e.z > 0 && e.air) return;
  const hit = moveEntity(w.map, e, (e.mvx * slow + e.kx) * dt, (e.mvy * slow + e.ky) * dt, e.r);
  e.wallHit = hit;
}
function dotDamage(w, e, amt, col) {
  amt = Math.max(1, Math.round(amt)); e.hp -= amt;
  Net.broadcast({ k: 'num', x: r1(e.x), y: r1(e.y - 16), v: amt, c: col }); numFx(e.x, e.y - 16, amt, col, 1);
  if (e.hp <= 0) killEnemy(w, e, -1);
}

// melee swing helper: an arc hazard attached to the enemy, aim-locked
function swing(w, e, r, arc, dmgMul, tele, act = 0.12, o = {}) {
  return spawnHazard(w, { shape: 'arc', owner: e.id, attach: true, useAim: true, x: e.x, y: e.y, ang: e.aim, r, arc, dmg: Math.round(e.dmg * dmgMul), tele, act, melee: true, kb: o.kb ?? 140, subtle: o.subtle ?? true, quiet: true });
}

const AI = {
  none() { },
  grunt(w, e, p, dt) {
    const d = dist(e.x, e.y, p.x, p.y);
    switch (e.state) {
      case 'idle': case 'chase':
        e.state = 'chase'; faceTo(e, p, 8, dt);
        if (d > 22) steer(w, e, p.x, p.y, e.speed);
        if (d < 32 && e.cd <= 0) { setState(e, 'windup'); e.wind = rnd(0.5, 0.62); swing(w, e, 28, 2.1, 1, e.wind, 0.14); }
        break;
      case 'windup':
        if (e.st < e.wind * 0.6) faceTo(e, p, 5, dt);
        if (e.st >= e.wind - 0.12 && !e.glinted) { e.glinted = true; sfxAt('glint', e.x, e.y, 0.4); }
        if (e.st >= e.wind) { setState(e, 'attack'); e.glinted = false; e.kx += Math.cos(e.aim) * 170; e.ky += Math.sin(e.aim) * 170; sfxAt('swing', e.x, e.y, 0.6, 0.85); }
        break;
      case 'attack': if (e.st > 0.16) setState(e, 'recover'); break;
      case 'recover': if (e.st > 0.55) { setState(e, 'chase'); e.cd = rnd(0.5, 1.3); } break;
    }
  },
  archer(w, e, p, dt) {
    const d = dist(e.x, e.y, p.x, p.y), los = lineOfSight(w.map, e.x, e.y - 6, p.x, p.y - 6);
    switch (e.state) {
      case 'idle': case 'chase':
        e.state = 'chase'; faceTo(e, p, 6, dt);
        if (d < 75) { const a = angTo(p.x, p.y, e.x, e.y) + e.orbit * 0.5; steer(w, e, e.x + Math.cos(a) * 40, e.y + Math.sin(a) * 40, e.speed * 1.1); }
        else if (d > 160 || !los) steer(w, e, p.x, p.y, e.speed);
        else { const a = angTo(p.x, p.y, e.x, e.y) + e.orbit * 0.9; steer(w, e, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, e.speed * 0.5); if (Math.random() < 0.005) e.orbit *= -1; }
        if (e.cd <= 0 && los && d < 220) {
          setState(e, 'windup'); e.wind = 0.8;
          spawnHazard(w, { shape: 'line', owner: e.id, attach: true, useAim: true, oy: -8, x: e.x, y: e.y, ang: e.aim, len: 230, w: 2, dmg: 0, tele: e.wind, act: 0, aimline: true });
        }
        break;
      case 'windup':
        if (e.st < e.wind - 0.25) faceTo(e, p, 4, dt);
        if (e.st >= e.wind) {
          setState(e, 'recover'); sfxAt('arrow', e.x, e.y, 0.8);
          spawnEProj(w, { kind: 'arrow', x: e.x + Math.cos(e.aim) * 8, y: e.y - 8 + Math.sin(e.aim) * 6, vx: Math.cos(e.aim) * 215, vy: Math.sin(e.aim) * 215, r: 3, dmg: e.dmg, life: 1.6 });
        }
        break;
      case 'recover': if (e.st > 0.4) { setState(e, 'chase'); e.cd = rnd(1.6, 2.6); } break;
    }
  },
  shield(w, e, p, dt) {
    const d = dist(e.x, e.y, p.x, p.y);
    switch (e.state) {
      case 'idle': case 'chase':
        e.state = 'chase'; faceTo(e, p, 2.2, dt);
        if (d > 26) steer(w, e, p.x, p.y, e.speed);
        if (d < 85 && e.cd <= 0) {
          setState(e, 'windup'); e.wind = 0.7;
          spawnHazard(w, { shape: 'line', owner: e.id, attach: true, useAim: true, x: e.x, y: e.y, ang: e.aim, len: 80, w: 16, dmg: 0, tele: e.wind, act: 0, subtle: true });
        }
        break;
      case 'windup':
        if (e.st < e.wind - 0.2) faceTo(e, p, 4, dt);
        if (e.st >= e.wind) { setState(e, 'attack'); sfxAt('swingHeavy', e.x, e.y, 0.8, 0.7); spawnHazard(w, { shape: 'circle', owner: e.id, attach: true, x: e.x, y: e.y, r: 11, dmg: e.dmg, tele: 0, act: 0.42, melee: true, kb: 220, quiet: true }); }
        break;
      case 'attack':
        e.mvx = Math.cos(e.aim) * 175; e.mvy = Math.sin(e.aim) * 175;
        if (e.wallHit && e.st > 0.08) { setState(e, 'recover'); e.recDur = 1.3; shake(2); sfxAt('slam', e.x, e.y, 0.5); dustRing(e.x, e.y, 8); break; }
        if (e.st > 0.42) { setState(e, 'recover'); e.recDur = 0.8; }
        break;
      case 'recover': if (e.st > (e.recDur || 0.8)) { setState(e, 'chase'); e.cd = rnd(1.5, 2.5); } break;
    }
  },
  flanker(w, e, p, dt) {
    const d = dist(e.x, e.y, p.x, p.y);
    switch (e.state) {
      case 'idle': case 'chase': {
        e.state = 'chase';
        e.orbitA = (e.orbitA ?? angTo(p.x, p.y, e.x, e.y)) + e.orbit * 1.4 * dt;
        const R = 58; steer(w, e, p.x + Math.cos(e.orbitA) * R, p.y + Math.sin(e.orbitA) * R, e.speed);
        faceTo(e, p, 0, dt);
        if (Math.random() < 0.004) e.orbit *= -1;
        if (e.cd <= 0 && d < 95) { setState(e, 'windup'); e.wind = 0.42; spawnHazard(w, { shape: 'line', owner: e.id, attach: true, useAim: true, x: e.x, y: e.y, ang: e.aim, len: 70, w: 10, dmg: 0, tele: e.wind, act: 0, subtle: true }); }
        break;
      }
      case 'windup': if (e.st < 0.28) faceTo(e, p, 6, dt); if (e.st >= e.wind) { setState(e, 'attack'); sfxAt('swing', e.x, e.y, 0.5, 1.4); spawnHazard(w, { shape: 'circle', owner: e.id, attach: true, x: e.x, y: e.y, r: 8, dmg: e.dmg, tele: 0, act: 0.22, melee: true, kb: 90, quiet: true }); } break;
      case 'attack': e.mvx = Math.cos(e.aim) * 270; e.mvy = Math.sin(e.aim) * 270; if (e.st > 0.24) setState(e, 'recover'); break;
      case 'recover': { const a = angTo(p.x, p.y, e.x, e.y); e.mvx = Math.cos(a) * e.speed * 0.8; e.mvy = Math.sin(a) * e.speed * 0.8; if (e.st > 0.6) { setState(e, 'chase'); e.cd = rnd(1.4, 2.4); e.orbitA = angTo(p.x, p.y, e.x, e.y); } break; }
    }
  },
  caster(w, e, p, dt) {
    const d = dist(e.x, e.y, p.x, p.y);
    switch (e.state) {
      case 'idle': case 'chase':
        e.state = 'chase'; faceTo(e, p, 0, dt);
        if (d < 65 && e.cd < 1.5) { setState(e, 'blink'); break; }
        if (d > 170 || !lineOfSight(w.map, e.x, e.y, p.x, p.y)) steer(w, e, p.x, p.y, e.speed);
        else if (d < 110) { const a = angTo(p.x, p.y, e.x, e.y); steer(w, e, e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, e.speed); }
        if (e.cd <= 0 && d < 230) { setState(e, 'windup'); e.wind = 0.55; e.spell = Math.random() < 0.6 ? 'runes' : 'orbs'; }
        break;
      case 'windup':
        faceTo(e, p, 0, dt);
        if (e.st >= e.wind) {
          setState(e, 'recover');
          if (e.spell === 'runes') {
            sfxAt('cast', e.x, e.y, 0.7);
            const pts = [[p.x + p.vx * 0.4, p.y + p.vy * 0.4], [p.x + rnd(-45, 45), p.y + rnd(-45, 45)], [p.x + rnd(-45, 45), p.y + rnd(-45, 45)]];
            for (const [x, y] of pts) spawnHazard(w, { shape: 'circle', x, y, r: 19, dmg: e.dmg, tele: 1.0, act: 0.15, kb: 90, rune: true });
          } else {
            sfxAt('orb', e.x, e.y, 0.8);
            for (let i = -1; i <= 1; i++) { const a = e.aim + i * 0.32; spawnEProj(w, { kind: 'orb', x: e.x, y: e.y - 8, vx: Math.cos(a) * 95, vy: Math.sin(a) * 95, r: 4, dmg: Math.round(e.dmg * 0.8), life: 3.5 }); }
          }
        }
        break;
      case 'blink':
        e.alpha = 1 - e.st / 0.3;
        if (e.st >= 0.3 && !e.blinked) {
          e.blinked = true; const r = w.map.rooms[e.room];
          for (let k = 0; k < 20; k++) { const x = rnd(r.x0 + 1, r.x1) * TS, y = rnd(r.y0 + 1, r.y1) * TS; if (!solidAt(w.map, x, y) && dist(x, y, p.x, p.y) > 110) { e.x = x; e.y = y; break; } }
          Net.broadcast({ k: 'fx', d: { t: 'blink', x: e.x, y: e.y } }); shadowFx(e.x, e.y);
        }
        if (e.st >= 0.3) e.alpha = (e.st - 0.3) / 0.3;
        if (e.st >= 0.6) { e.alpha = 1; e.blinked = false; setState(e, 'chase'); e.cd = Math.max(e.cd, 0.6); }
        break;
      case 'recover': if (e.st > 0.5) { setState(e, 'chase'); e.cd = rnd(2.2, 3.2); } break;
    }
  },
  elite(w, e, p, dt) {
    const d = dist(e.x, e.y, p.x, p.y), enraged = e.hp < e.maxHp * 0.5, sp = enraged ? 1.2 : 1;
    if (enraged && !e.enraged) { e.enraged = true; sfxAt('roar', e.x, e.y, 0.8); shake(4); Net.broadcast({ k: 'num', x: r1(e.x), y: r1(e.y - 34), v: 'ENRAGED', c: '#ff5a4a' }); }
    switch (e.state) {
      case 'idle': case 'chase':
        e.state = 'chase'; faceTo(e, p, 4, dt);
        if (d > 30) steer(w, e, p.x, p.y, e.speed * sp);
        if (e.cd <= 0) {
          const r = Math.random();
          if (d < 50 && r < 0.55) { setState(e, 'combo'); e.ci = 0; e.cStart = null; e.swung = false; }
          else if (d > 70 && r < 0.6) { setState(e, 'leapwind'); }
          else if (d > 50) { setState(e, 'chargewind'); spawnHazard(w, { shape: 'line', owner: e.id, attach: true, useAim: true, x: e.x, y: e.y, ang: e.aim, len: 200, w: 24, dmg: 0, tele: 0.8 / sp, act: 0 }); }
          else { setState(e, 'combo'); e.ci = 0; e.cStart = null; e.swung = false; }
        }
        break;
      case 'combo': {
        const winds = [0.55, 0.38, 0.6].map(x => x / sp);
        if (e.st === dt || e.cStart == null) { e.cStart = 0; swing(w, e, e.ci === 2 ? 38 : 34, e.ci === 2 ? 3.4 : 2.4, e.ci === 2 ? 1.4 : 1, winds[e.ci], 0.14, { kb: 180, subtle: false }); }
        if (e.st < winds[e.ci] * 0.6) faceTo(e, p, 4, dt);
        if (e.st >= winds[e.ci] && !e.swung) { e.swung = true; e.kx += Math.cos(e.aim) * 200; e.ky += Math.sin(e.aim) * 200; sfxAt('swingHeavy', e.x, e.y, 0.9, 0.7); if (e.ci === 2) shake(3); }
        if (e.st >= winds[e.ci] + 0.3) { e.ci++; e.swung = false; e.cStart = null; e.st = 0; if (e.ci >= 3) { setState(e, 'recover'); e.recDur = 0.9; } }
        break;
      }
      case 'leapwind':
        faceTo(e, p, 6, dt);
        if (e.st >= 0.45 / sp) {
          setState(e, 'leap'); e.air = true; e.lx0 = e.x; e.ly0 = e.y; e.lx1 = p.x; e.ly1 = p.y; sfxAt('swingHeavy', e.x, e.y, 0.7, 0.6);
          spawnHazard(w, { shape: 'circle', x: p.x, y: p.y, r: 36, dmg: Math.round(e.dmg * 1.3), tele: 0.7, act: 0.12, kb: 220 });
        }
        break;
      case 'leap': {
        const u = clamp(e.st / 0.7, 0, 1); e.x = lerp(e.lx0, e.lx1, u); e.y = lerp(e.ly0, e.ly1, u); e.z = Math.sin(u * Math.PI) * 40;
        if (u >= 1) {
          e.air = false; e.z = 0; collideCircle(w.map, e, e.r); setState(e, 'recover'); e.recDur = 0.9; shake(6); sfxAt('slam', e.x, e.y, 1);
          Net.broadcast({ k: 'fx', d: { t: 'slam', x: r1(e.x), y: r1(e.y), r: 40 } }); slamFx(e.x, e.y, 40);
          spawnHazard(w, { shape: 'ring', x: e.x, y: e.y, r0: 20, r1: 95, w: 10, dmg: Math.round(e.dmg * 0.6), tele: 0, act: 0.5, kb: 120 });
        }
        break;
      }
      case 'chargewind': if (e.st < 0.55 / sp) faceTo(e, p, 5, dt); if (e.st >= 0.8 / sp) { setState(e, 'charge'); sfxAt('roar', e.x, e.y, 0.4); spawnHazard(w, { shape: 'circle', owner: e.id, attach: true, x: e.x, y: e.y, r: 14, dmg: Math.round(e.dmg * 1.2), tele: 0, act: 0.9, melee: true, kb: 260, quiet: true }); } break;
      case 'charge':
        e.mvx = Math.cos(e.aim) * 290; e.mvy = Math.sin(e.aim) * 290;
        if (Math.random() < 0.5) Net.isAuth() && spawnDust(e.x, e.y, 1);
        if (e.wallHit && e.st > 0.1) { setState(e, 'stagger'); e.stagDur = 1.6; shake(6); sfxAt('slam', e.x, e.y, 1); Net.broadcast({ k: 'num', x: r1(e.x), y: r1(e.y - 34), v: 'STUNNED', c: '#ffe96a' }); numFx(e.x, e.y - 34, 'STUNNED', '#ffe96a', 1); break; }
        if (e.st > 0.9) { setState(e, 'recover'); e.recDur = 0.7; }
        break;
      case 'recover': if (e.st > (e.recDur || 0.8)) { setState(e, 'chase'); e.cd = rnd(0.5, 1.2) / sp; } break;
    }
  },
};

// ---------------------------------------------------------------------------
//  Bosses: weighted move sets per phase, built from shared primitives
// ---------------------------------------------------------------------------
const at = (e, t) => e.pmt < t && e.mt >= t;
const BOSS_MOVES = {
  combo(w, e, p, sp) {
    const W = [0.6, 0.42, 0.75].map(x => x / sp), gap = 0.32 / sp;
    let t0 = 0;
    for (let i = 0; i < 3; i++) {
      if (at(e, t0 + 0.0001)) swing(w, e, i === 2 ? 50 : 44, i === 2 ? 3.6 : 2.6, i === 2 ? 1.5 : 1.1, W[i], 0.15, { kb: 200, subtle: false });
      if (e.mt > t0 && e.mt < t0 + W[i] * 0.65 && p) faceTo(e, p, 4, TICK);
      if (at(e, t0 + W[i])) { e.kx += Math.cos(e.aim) * 210; e.ky += Math.sin(e.aim) * 210; sfxAt('swingHeavy', e.x, e.y, 1, 0.6); if (i === 2) shake(4); }
      t0 += W[i] + gap;
    }
    e.anim = 'swing';
    return e.mt > t0 + 0.4;
  },
  slam(w, e, p, sp) {
    const wind = 0.85 / sp; e.anim = e.mt < wind ? 'windup' : 'slam';
    if (at(e, 0.0001)) spawnHazard(w, { shape: 'circle', owner: e.id, attach: true, x: e.x, y: e.y, r: 56, dmg: Math.round(e.dmg * 1.4), tele: wind, act: 0.14, kb: 260 });
    if (at(e, wind)) { shake(8); sfxAt('slam', e.x, e.y, 1.2); Net.broadcast({ k: 'fx', d: { t: 'slam', x: r1(e.x), y: r1(e.y), r: 56 } }); slamFx(e.x, e.y, 56); spawnHazard(w, { shape: 'ring', x: e.x, y: e.y, r0: 40, r1: 190, w: 12, dmg: Math.round(e.dmg * 0.7), tele: 0, act: 0.9, kb: 140 }); }
    return e.mt > wind + 1.0;
  },
  delayslam(w, e, p, sp) {
    const wind = 1.35; e.anim = e.mt < wind ? (e.mt > 0.45 && e.mt < 0.6 ? 'twitch' : 'windup') : 'slam';
    if (at(e, 0.0001)) spawnHazard(w, { shape: 'circle', owner: e.id, attach: true, x: e.x, y: e.y, r: 64, dmg: Math.round(e.dmg * 1.6), tele: wind, act: 0.14, kb: 280 });
    if (at(e, 0.5)) sfxAt('glint', e.x, e.y, 0.8);
    if (at(e, wind)) { shake(10); sfxAt('slam', e.x, e.y, 1.3); Net.broadcast({ k: 'fx', d: { t: 'slam', x: r1(e.x), y: r1(e.y), r: 64 } }); slamFx(e.x, e.y, 64); for (let k = 0; k < 2; k++) spawnHazard(w, { shape: 'ring', x: e.x, y: e.y, r0: 40, r1: 200, w: 12, dmg: Math.round(e.dmg * 0.7), tele: k * 0.35, act: 0.9, kb: 140 }); }
    return e.mt > wind + 1.1;
  },
  fan(w, e, p, sp) {
    e.anim = 'cast'; const vol = e.phase >= 1 ? 3 : 2, n = e.phase >= 2 ? 7 : 5;
    for (let v = 0; v < vol; v++) {
      const t = 0.55 / sp + v * 0.5 / sp;
      if (at(e, t - 0.3) && p) faceTo(e, p, 0, TICK);
      if (at(e, t)) {
        sfxAt(e.bk === 'tidewyrm' ? 'orb' : 'arrow', e.x, e.y, 1);
        const kind = e.bk === 'hollowking' ? 'blade' : e.bk === 'tidewyrm' ? 'bubble' : e.bk === 'sovereign' ? 'shard' : 'thorn';
        for (let i = 0; i < n; i++) { const a = e.aim + (i - (n - 1) / 2) * 0.2 + (v % 2 ? 0.1 : 0); spawnEProj(w, { kind, x: e.x, y: e.y - 16, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, r: 4, dmg: Math.round(e.dmg * 0.75), life: 3 }); }
      }
    }
    return e.mt > 0.55 / sp + vol * 0.5 / sp + 0.4;
  },
  ring(w, e, p, sp) {
    e.anim = 'cast'; const waves = e.phase >= 2 ? 3 : 2, n = 18;
    if (at(e, 0.0001)) spawnHazard(w, { shape: 'circle', owner: e.id, attach: true, x: e.x, y: e.y, r: 24, dmg: 0, tele: 0.6, act: 0, rune: true });
    for (let k = 0; k < waves; k++) {
      if (at(e, 0.6 + k * 0.55)) {
        sfxAt('orb', e.x, e.y, 1); const off = rnd(0, TAU), kind = e.bk === 'hollowking' ? 'blade' : e.bk === 'tidewyrm' ? 'bubble' : e.bk === 'sovereign' ? 'shard' : 'thorn';
        for (let i = 0; i < n; i++) { if (i % 6 === 0) continue; const a = off + i * TAU / n; spawnEProj(w, { kind, x: e.x, y: e.y - 12, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, r: 4, dmg: Math.round(e.dmg * 0.7), life: 3.5 }); }
      }
    }
    return e.mt > 0.6 + waves * 0.55 + 0.3;
  },
  summon(w, e, p, sp) {
    e.anim = 'cast';
    if (at(e, 0.0001)) { sfxAt('roar', e.x, e.y, 0.7); shake(3); }
    if (at(e, 0.7)) {
      const alive = [...w.ents.values()].filter(x => x.minion && !x.dead).length;
      const r = w.map.rooms[e.room], n = Math.min(3, 4 - alive);
      for (let i = 0; i < n; i++) { const x = rnd(r.x0 + 2, r.x1 - 1) * TS, y = rnd(r.y0 + 2, r.y1 - 1) * TS; if (!solidAt(w.map, x, y)) spawnEnemy(w, BOSSES[e.bk].summon, x, y, e.room, { minion: true }); }
    }
    return e.mt > 1.3;
  },
  leap(w, e, p, sp) {
    const wind = 0.5 / sp;
    if (e.mt < wind) { e.anim = 'windup'; if (p) faceTo(e, p, 6, TICK); }
    if (at(e, wind) && p) { e.air = true; e.lx0 = e.x; e.ly0 = e.y; e.lx1 = p.x; e.ly1 = p.y; spawnHazard(w, { shape: 'circle', x: p.x, y: p.y, r: 46, dmg: Math.round(e.dmg * 1.4), tele: 0.8, act: 0.12, kb: 260 }); sfxAt('swingHeavy', e.x, e.y, 1, 0.5); }
    if (e.air) {
      const u = clamp((e.mt - wind) / 0.8, 0, 1); e.x = lerp(e.lx0, e.lx1, u); e.y = lerp(e.ly0, e.ly1, u); e.z = Math.sin(u * Math.PI) * 60; e.anim = 'air';
      if (u >= 1) { e.air = false; e.z = 0; collideCircle(w.map, e, e.r); shake(9); sfxAt('slam', e.x, e.y, 1.2); Net.broadcast({ k: 'fx', d: { t: 'slam', x: r1(e.x), y: r1(e.y), r: 46 } }); slamFx(e.x, e.y, 46); spawnHazard(w, { shape: 'ring', x: e.x, y: e.y, r0: 30, r1: 150, w: 12, dmg: Math.round(e.dmg * 0.6), tele: 0, act: 0.7, kb: 140 }); }
    }
    return !e.air && e.mt > wind + 1.4;
  },
  roots(w, e, p, sp) {
    e.anim = 'cast';
    if (at(e, 0.3)) {
      sfxAt('cast', e.x, e.y, 1);
      for (const q of playersIn(w)) {
        const a = angTo(e.x, e.y, q.x, q.y);
        for (let i = 1; i <= 11; i++) spawnHazard(w, { shape: 'circle', x: e.x + Math.cos(a) * i * 19, y: e.y + Math.sin(a) * i * 19, r: 12, dmg: Math.round(e.dmg * 0.9), tele: 0.55 + i * 0.05, act: 0.25, kb: 150, root: true, quiet: i > 1 });
      }
    }
    return e.mt > 1.6;
  },
  spores(w, e, p, sp) {
    e.anim = 'cast';
    if (at(e, 0.35)) { sfxAt('cast', e.x, e.y, 1); for (const q of playersIn(w)) for (let i = 0; i < 2; i++) spawnHazard(w, { shape: 'circle', x: q.x + rnd(-30, 30), y: q.y + rnd(-30, 30), r: 22, dmg: Math.round(e.dmg * 0.35), tele: 1.0, act: 3.0, tick: 0.5, kb: 0, spore: true, status: 'poison' }); }
    return e.mt > 1.4;
  },
  sweep(w, e, p, sp) {
    const wind = 0.9 / sp; e.anim = e.mt < wind ? 'windup' : 'swing';
    if (at(e, 0.0001) && p) { faceTo(e, p, 0, TICK); spawnHazard(w, { shape: 'arc', owner: e.id, attach: true, x: e.x, y: e.y, ang: e.aim, useAim: true, r: 72, arc: 3.9, dmg: Math.round(e.dmg * 1.2), tele: wind, act: 0.18, kb: 240 }); }
    if (at(e, wind)) { sfxAt('swingHeavy', e.x, e.y, 1.2, 0.5); shake(5); }
    return e.mt > wind + 0.7;
  },
  rain(w, e, p, sp) {
    e.anim = 'cast'; const r = w.map.rooms[e.room];
    if (at(e, 0.3)) {
      sfxAt('cast', e.x, e.y, 1);
      for (let i = 0; i < 9; i++) spawnHazard(w, { shape: 'circle', x: rnd(r.x0 + 1, r.x1) * TS, y: rnd(r.y0 + 1, r.y1) * TS, r: 22, dmg: Math.round(e.dmg), tele: 1.0 + i * 0.07, act: 0.15, kb: 160, quiet: i > 0 });
      for (const q of playersIn(w)) spawnHazard(w, { shape: 'circle', x: q.x, y: q.y, r: 24, dmg: Math.round(e.dmg), tele: 1.25, act: 0.15, kb: 160 });
    }
    return e.mt > 2.0;
  },
  charge(w, e, p, sp) {
    const wind = 0.85 / sp;
    if (e.mt < wind) { e.anim = 'windup'; if (p && e.mt < wind - 0.25) faceTo(e, p, 5, TICK); }
    if (at(e, 0.0001)) spawnHazard(w, { shape: 'line', owner: e.id, attach: true, useAim: true, x: e.x, y: e.y, ang: e.aim, len: 260, w: 34, dmg: 0, tele: wind, act: 0 });
    if (at(e, wind)) { sfxAt('roar', e.x, e.y, 0.6); spawnHazard(w, { shape: 'circle', owner: e.id, attach: true, x: e.x, y: e.y, r: e.r + 4, dmg: Math.round(e.dmg * 1.3), tele: 0, act: 1.0, melee: true, kb: 280, quiet: true }); }
    if (e.mt >= wind && !e.stunned) {
      e.anim = 'charge'; e.mvx = Math.cos(e.aim) * 320; e.mvy = Math.sin(e.aim) * 320;
      if (e.wallHit && e.mt > wind + 0.1) { e.stunned = true; e.stunT = e.mt; shake(8); sfxAt('slam', e.x, e.y, 1.2); numFx(e.x, e.y - 40, 'STUNNED', '#ffe96a', 2); Net.broadcast({ k: 'num', x: r1(e.x), y: r1(e.y - 40), v: 'STUNNED', c: '#ffe96a' }); }
    }
    if (e.stunned) { e.anim = 'stun'; e.mvx = e.mvy = 0; if (e.mt > e.stunT + 1.8) { e.stunned = false; return true; } return false; }
    return e.mt > wind + 1.0;
  },
  dive(w, e, p, sp) {
    if (at(e, 0.0001)) { sfxAt('splash', e.x, e.y, 1); Net.broadcast({ k: 'fx', d: { t: 'splash', x: r1(e.x), y: r1(e.y) } }); splashFx(e.x, e.y); }
    if (e.mt < 0.4) { e.anim = 'dive'; e.alpha = 1 - e.mt / 0.4; }
    else if (e.mt < 1.6) {
      e.hidden = true; e.invuln = true; e.alpha = 0;
      if (p && e.mt < 1.1) { e.x = lerp(e.x, p.x, 0.12); e.y = lerp(e.y, p.y, 0.12); }
      if (at(e, 0.6)) spawnHazard(w, { shape: 'circle', owner: e.id, attach: true, x: e.x, y: e.y, r: 42, dmg: Math.round(e.dmg * 1.4), tele: 1.0, act: 0.15, kb: 260 });
    } else if (at(e, 1.6)) {
      e.hidden = false; e.invuln = false; e.alpha = 1; collideCircle(w.map, e, e.r); shake(8); sfxAt('splash', e.x, e.y, 1.3); sfxAt('slam', e.x, e.y, 0.8);
      Net.broadcast({ k: 'fx', d: { t: 'splash', x: r1(e.x), y: r1(e.y) } }); splashFx(e.x, e.y);
      for (let i = 0; i < 12; i++) { const a = i * TAU / 12; spawnEProj(w, { kind: 'bubble', x: e.x, y: e.y - 8, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110, r: 4, dmg: Math.round(e.dmg * 0.6), life: 2.5 }); }
    }
    if (e.mt > 1.6) e.anim = 'idle';
    return e.mt > 2.3;
  },
  wave(w, e, p, sp) {
    e.anim = 'cast'; const r = w.map.rooms[e.room];
    if (at(e, 0.3)) {
      sfxAt('splash', e.x, e.y, 1);
      const fromTop = Math.random() < 0.5, x0 = r.x0 * TS, wid = r.w * TS, gap = 52, gx = x0 + rnd(30, wid - 30 - gap);
      const y = fromTop ? r.y0 * TS - 8 : (r.y1 + 1) * TS - 8, vy = fromTop ? 120 : -120;
      spawnHazard(w, { shape: 'rect', x: x0, y, w: gx - x0, h: 16, vx: 0, vy, dmg: Math.round(e.dmg * 1.1), tele: 0.9, act: r.h * TS / 120 + 0.1, kb: 200, wave: true });
      spawnHazard(w, { shape: 'rect', x: gx + gap, y, w: x0 + wid - gx - gap, h: 16, vx: 0, vy, dmg: Math.round(e.dmg * 1.1), tele: 0.9, act: r.h * TS / 120 + 0.1, kb: 200, wave: true, quiet: true });
    }
    return e.mt > 0.3 + 0.9 + r.h * TS / 120;
  },
  beam(w, e, p, sp) {
    e.anim = 'cast';
    if (at(e, 0.0001) && p) {
      const dir = Math.random() < 0.5 ? 1 : -1, a0 = angTo(e.x, e.y, p.x, p.y) - dir * 1.0;
      spawnHazard(w, { shape: 'line', x: e.x, y: e.y - 10, ang: a0, len: 300, w: 16, dmg: Math.round(e.dmg * 0.6), tele: 0.9, act: 2.0, spin: dir * 1.0, tick: 0.35, kb: 120, beam: true, unblockable: false });
      sfxAt('zap', e.x, e.y, 1);
    }
    return e.mt > 3.1;
  },
};
function updateBoss(w, e, p, dt) {
  const B = BOSSES[e.bk], ph = B.phases[e.phase], sp = ph.speed;
  e.pmt = e.mt;
  if (e.state === 'intro') { e.anim = 'roar'; if (e.st > 2.2) { e.invuln = false; setState(e, 'idle'); e.cd = 0.6; } return; }
  if (e.state === 'phase') { e.anim = 'roar'; e.invuln = true; if (e.st > 1.7) { e.invuln = false; setState(e, 'idle'); e.cd = 0.3; } return; }
  if (e.state === 'dying') { e.anim = 'dying'; e.invuln = true; if (e.st > 2.4) finishBoss(w, e); return; }
  // phase change
  const nx = B.phases[e.phase + 1];
  if (nx && e.hp / e.maxHp <= nx.at && !e.move) {
    e.phase++; setState(e, 'phase'); e.air = false; e.z = 0; e.hidden = false; e.alpha = 1;
    sfxAt('roar', e.x, e.y, 1.2); shake(10);
    spawnHazard(w, { shape: 'ring', x: e.x, y: e.y, r0: 10, r1: 120, w: 14, dmg: 0, tele: 0, act: 0.5, kb: 0 });
    const ev = { ev: 'phase', id: e.id, phase: e.phase, msg: nx.msg }; Net.broadcast({ k: 'boss', ...ev }); onBossEvent(ev);
    return;
  }
  if (e.move) {
    e.mt += dt;
    const done = BOSS_MOVES[e.move](w, e, p, sp);
    if (done) { e.move = null; e.anim = 'idle'; e.cd = rnd(0.5, 1.1) / sp; e.alpha = 1; e.hidden = false; e.invuln = false; }
    e.state = 'move';
    return;
  }
  e.state = 'idle'; e.anim = 'walk';
  if (!p) return;
  const d = dist(e.x, e.y, p.x, p.y);
  faceTo(e, p, 3, dt);
  if (d > 55) steer(w, e, p.x, p.y, e.speed * sp);
  if (e.cd <= 0) {
    const moves = Object.entries(ph.moves).filter(([m]) => !(e.last.slice(-1).includes(m)));
    let tot = 0; for (const [m, wt] of moves) tot += wt * ((m === 'combo' || m === 'sweep') && d > 90 ? 0.2 : (m === 'combo' || m === 'sweep') && d < 60 ? 2.5 : 1);
    let r = Math.random() * tot, pickM = moves[0][0];
    for (const [m, wt] of moves) { r -= wt * ((m === 'combo' || m === 'sweep') && d > 90 ? 0.2 : (m === 'combo' || m === 'sweep') && d < 60 ? 2.5 : 1); if (r <= 0) { pickM = m; break; } }
    e.move = pickM; e.mt = 0; e.pmt = -1; e.last.push(pickM); if (e.last.length > 3) e.last.shift();
  }
}
function finishBoss(w, e) {
  e.dead = true; w.ents.delete(e.id);
  w.dun.bossDead = true;
  const r = w.map.rooms[e.room];
  const portal = { x: Math.round((r.x0 + r.x1) / 2) * TS + 8, y: (r.y0 + r.y1) / 2 * TS + 8 };
  w.dun.portal = portal;
  const ev = { ev: 'dead', id: e.id, bk: e.bk, x: r1(e.x), y: r1(e.y), portal, xp: e.xp, lvl: e.lvl, luck: scaleFor(w).luck };
  Net.broadcast({ k: 'boss', ...ev }); onBossEvent(ev);
  for (let i = 0; i < 30; i++) spawnCoin(w, e.x + rnd(-20, 20), e.y + rnd(-10, 10), Math.round(rnd(6, 14) * (1 + e.lvl * 0.15)));
  for (const m of w.ents.values()) if (m.minion && !m.dead) killEnemy(w, m, -1, true);
  roomCleared(w, r);
}

// ---------------------------------------------------------------------------
//  Damage application on the host
// ---------------------------------------------------------------------------
function applyHit(w, h) {
  const e = w.ents.get(h.id);
  if (!e || e.dead || e.type !== 'enemy') return;
  if (e.state === 'spawn' || e.invuln || e.hidden) return;
  if (e.kind === 'pot') return;
  const hit = { magic: !!h.mg, heavy: !!h.hv };
  if (shieldBlocks(e, h.ax, h.ay, hit)) { Net.broadcast({ k: 'fx', d: { t: 'spark', x: r1(e.x), y: r1(e.y - 8) } }); return; }
  if (e.kind === 'shield' && h.hv && Math.abs(angDiff(e.face, angTo(e.x, e.y, h.ax, h.ay))) < 1.15 && e.state !== 'stagger') {
    staggerEnemy(w, e.id, 1.1); Net.broadcast({ k: 'num', x: r1(e.x), y: r1(e.y - 26), v: 'GUARD BROKEN', c: '#ffe96a' });
  }
  let dmg = h.dmg * (e.frozen > 0 ? 1.3 : 1);
  e.hp -= dmg; e.flash = 0.1; e.hitstop = Math.max(e.hitstop, h.hv || h.cr ? 0.07 : 0.04);
  const kb = (h.kb || 0) / Math.max(0.6, e.mass) * (e.boss ? 0.08 : 1);
  if (!e.air) { e.kx += Math.cos(h.a) * kb; e.ky += Math.sin(h.a) * kb; }
  if (!(e.poiseLock > w.time)) e.poise -= h.po || 0;
  if (e.poise <= 0) {
    e.poiseLock = w.time + (e.boss ? 6 : e.elite ? 3 : 0); // can't be stance-broken again right away
    e.poise = e.maxPoise;
    if (e.boss) { if (!e.move || e.move !== 'dive') { e.move = null; e.air = false; e.z = 0; staggerEnemy(w, e.id, 2.2); Net.broadcast({ k: 'num', x: r1(e.x), y: r1(e.y - 44), v: 'STANCE BROKEN', c: '#ffe96a' }); } }
    else if (e.state !== 'leap') staggerEnemy(w, e.id, e.elite ? 1.0 : 0.45);
  }
  if (h.st === 'freeze') e.frozen = Math.max(e.frozen, (e.boss ? 0.4 : e.elite ? 1 : 1) * h.stT * (e.boss ? 0.3 : 1));
  if (h.st === 'chill') e.chill = Math.max(e.chill, h.stT);
  if (h.st === 'poison') { e.poison = h.stT; e.poisonDps = Math.max(e.poisonDps || 0, h.dmg * 0.35); }
  if (h.st === 'burn') { e.burn = h.stT; e.burnDps = Math.max(e.burnDps || 0, h.dmg * 0.25); }
  if (e.hp <= 0) killEnemy(w, e, h.pid);
}
function staggerEnemy(w, id, dur) {
  const e = w.ents.get(id); if (!e || e.dead) return;
  if (e.boss && e.state !== 'idle' && e.state !== 'move') return;
  e.move = null; e.air = false; e.z = 0; e.hidden = false; e.invuln = false; e.alpha = 1;
  setState(e, 'stagger'); e.stagDur = dur;
  // cancel this enemy's pending attacks
  for (let i = w.hazards.length - 1; i >= 0; i--) if (w.hazards[i].owner === id) { Net.broadcast({ k: 'hzx', id: w.hazards[i].id }); w.hazards.splice(i, 1); }
}
function killEnemy(w, e, pid, silent) {
  if (e.dead) return;
  if (e.boss) { e.hp = 1; if (e.state !== 'dying') { e.move = null; e.air = false; e.z = 0; e.hidden = false; e.alpha = 1; setState(e, 'dying'); sfxAt('bossDie', e.x, e.y, 1.2); Net.broadcast({ k: 'boss', ev: 'dying', id: e.id }); onBossEvent({ ev: 'dying', id: e.id }); } return; }
  e.dead = true; w.ents.delete(e.id);
  for (let i = w.hazards.length - 1; i >= 0; i--) if (w.hazards[i].owner === e.id && w.hazards[i].attach) { Net.broadcast({ k: 'hzx', id: w.hazards[i].id }); w.hazards.splice(i, 1); }
  const B = ENEMIES[e.kind], sc = scaleFor(w);
  const ev = { k: 'kill', id: e.id, kind: e.kind, sk: e.sk, x: r1(e.x), y: r1(e.y), xp: silent ? 0 : e.xp, lvl: e.lvl, elite: e.elite ? 1 : 0, luck: sc.luck, minion: e.minion ? 1 : 0, did: w.dun.did };
  Net.broadcast(ev); onKill(ev);
  if (!silent) {
    const n = rndi(B.gold[0], B.gold[1]);
    const coins = Math.min(6, Math.ceil(n / 3));
    for (let i = 0; i < coins; i++) spawnCoin(w, e.x, e.y, Math.max(1, Math.round(n / coins * (1 + e.lvl * 0.15))));
    if (Math.random() < (e.elite ? 1 : 0.1)) spawnPickup(w, 'orb', e.x, e.y);
    if (e.elite) spawnPickup(w, 'bosskey', e.x, e.y);
  }
}
function spawnCoin(w, x, y, val) {
  const a = rnd(0, TAU), s = rnd(40, 110);
  const c = { id: newId(), type: 'coin', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, val, t: 0, z: 0, vz: rnd(60, 110) };
  w.ents.set(c.id, c); return c;
}
function spawnPickup(w, kind, x, y, extra) {
  const a = rnd(0, TAU), s = rnd(20, 60);
  const c = { id: newId(), type: kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, z: 0, vz: 90, ...extra };
  w.ents.set(c.id, c); return c;
}
function updatePickup(w, c, dt) {
  c.t += dt;
  c.vz -= 400 * dt; c.z = Math.max(0, c.z + c.vz * dt); if (c.z === 0) c.vz = 0;
  c.vx *= Math.exp(-5 * dt); c.vy *= Math.exp(-5 * dt);
  // magnet toward the nearest living player
  if (c.t > 0.5 && c.type !== 'gitem') {
    const p = nearestPlayer(w, c, c.type === 'coin' ? 60 : 30);
    if (p) { const a = angTo(c.x, c.y, p.x, p.y), d = dist(c.x, c.y, p.x, p.y), s = 260 * (1 - d / 70); c.vx += Math.cos(a) * s * dt * 8; c.vy += Math.sin(a) * s * dt * 8; }
  }
  moveEntity(w.map, c, c.vx * dt, c.vy * dt, 3);
  if (c.t < 0.35) return;
  for (const p of w.players.values()) {
    if (p.dead || p.away || (p.downed && c.type !== 'coin')) continue;
    if (c.noPick === p.pid && w.time < c.noPickT) continue;
    if (dist(p.x, p.y, c.x, c.y) > 10) continue;
    w.ents.delete(c.id);
    if (c.type === 'coin') { Net.broadcast({ k: 'gold', amt: c.val, x: r1(c.x), y: r1(c.y) }); onGold(c.val, c.x, c.y); }
    else if (c.type === 'orb') { const m = { k: 'heal', pid: p.pid, amt: 0.15, x: r1(c.x), y: r1(c.y) }; Net.broadcast(m); onHealMsg(m); }
    else if (c.type === 'key') { w.dun.keys++; Net.broadcast({ k: 'keys', keys: w.dun.keys, boss: w.dun.bossKey, who: p.name, kind: 'key' }); onKeys({ keys: w.dun.keys, boss: w.dun.bossKey, who: p.name, kind: 'key' }); }
    else if (c.type === 'bosskey') { w.dun.bossKey = true; Net.broadcast({ k: 'keys', keys: w.dun.keys, boss: true, who: p.name, kind: 'boss' }); onKeys({ keys: w.dun.keys, boss: true, who: p.name, kind: 'boss' }); }
    else if (c.type === 'gitem') { const m = { k: 'give', item: c.item, from: 'ground' }; if (p.pid === Net.pid) onGive(m); else Net.send(p.pid, m); }
    break;
  }
}

// ---------------------------------------------------------------------------
//  Rooms, doors, waves, traps
// ---------------------------------------------------------------------------
function inRoomInterior(r, x, y) { return x > (r.x0) * TS + 2 && x < (r.x1 + 1) * TS - 2 && y > r.y0 * TS + 2 && y < (r.y1 + 1) * TS - 2; }
function updateRooms(w, dt) {
  const m = w.map;
  // locked doors open automatically when the party holds the right key
  for (const d of m.doors) {
    if (!d.lock) continue;
    const [tx, ty] = d.tiles[1], cx = tx * TS + 8, cy = ty * TS + 8;
    for (const p of playersIn(w)) {
      if (dist(p.x, p.y, cx, cy) > 26) continue;
      if (d.lock === 'key' && w.dun.keys > 0) { w.dun.keys--; d.lock = null; d.open = true; doorsChanged(w, 'unlock', d); Net.broadcast({ k: 'keys', keys: w.dun.keys, boss: w.dun.bossKey }); onKeys({ keys: w.dun.keys, boss: w.dun.bossKey, quiet: true }); }
      else if (d.lock === 'boss' && w.dun.bossKey) { d.lock = null; d.open = true; doorsChanged(w, 'unlock', d); }
      else if (!d._msgT || w.time - d._msgT > 3) { d._msgT = w.time; const msg = d.lock === 'boss' ? 'Sealed. The Boss Key is held by an elite champion.' : 'Locked. Find a key in another room.'; Net.broadcast({ k: 'toast', msg }); toast(msg); }
    }
  }
  for (const r of m.rooms) {
    if (r.cleared) continue;
    if (!r.active) {
      const inside = playersIn(w).filter(p => inRoomInterior(r, p.x, p.y) && dist(p.x, p.y, clamp(p.x, r.x0 * TS + 24, (r.x1 + 1) * TS - 24), clamp(p.y, r.y0 * TS + 24, (r.y1 + 1) * TS - 24)) < 1);
      if (inside.length) activateRoom(w, r, inside[0]);
      continue;
    }
    // active: waves
    const alive = [...w.ents.values()].some(e => e.type === 'enemy' && !e.dead && e.room === r.i && !e.minion) || [...w.ents.values()].some(e => e.boss && !e.dead && e.room === r.i);
    if (!alive && r.type !== 'boss') {
      r.waveT = (r.waveT || 0) + dt;
      if (r.waveT > 0.7) {
        r.waveT = 0;
        if (r.waves && r.waves.length) spawnWave(w, r, r.waves.shift());
        else roomCleared(w, r);
      }
    }
  }
  // arrow traps fire while their room is active
  for (const t of m.arrowTraps) {
    const r = m.rooms[t.room]; if (!r.active || r.cleared) continue;
    const cyc = Math.floor((w.time + t.phase) / t.period);
    if (t.last !== cyc) { t.last = cyc; sfxAt('arrow', t.x, t.y, 0.6); spawnEProj(w, { kind: 'arrow', x: t.x, y: t.y, vx: Math.cos(t.ang) * 190, vy: Math.sin(t.ang) * 190, r: 3, dmg: Math.round(10 * (1 + scaleFor(w).lvl * 0.1) * TIERS[w.dun.tier].dmg), life: 3 }); }
  }
}
function activateRoom(w, r, who) {
  r.active = true; r.discovered = true;
  for (const di of r.doors) { const d = w.map.doors[di]; if (!d.lock) d.open = false; }
  doorsChanged(w, 'close');
  // pull the rest of the party into the room so nobody is left outside the bars
  const entry = { x: clamp(who.x, r.x0 * TS + 28, (r.x1 + 1) * TS - 28), y: clamp(who.y, r.y0 * TS + 28, (r.y1 + 1) * TS - 28) };
  for (const p of w.players.values()) {
    if (p.away || inRoomInterior(r, p.x, p.y)) continue;
    const m = { k: 'tp', pid: p.pid, x: r1(entry.x + rnd(-8, 8)), y: r1(entry.y + rnd(-8, 8)) };
    if (p.pid === Net.pid) onTeleport(m); else Net.send(p.pid, m);
  }
  const ev = { k: 'room', i: r.i, s: 'active', type: r.type }; Net.broadcast(ev); onRoomEvent(ev);
  if (r.type === 'boss') { spawnBoss(w, r.i); return; }
  r.waves = planWaves(w, r);
  spawnWave(w, r, r.waves.shift());
}
function planWaves(w, r) {
  const D = DUNGEONS[w.dun.did], tier = w.dun.tier, party = Net.partySize();
  const area = r.w * r.h, waves = [];
  if (r.type === 'elite') { waves.push(['elite', rnd(0, 1) < 0.5 ? 'grunt' : 'archer', 'flanker']); if (tier > 0) waves.push(['shield', 'caster']); return waves; }
  const nW = r.type === 'trap' ? 1 : (area > 220 || tier > 0) ? 2 : rnd(0, 1) < 0.5 ? 2 : 1;
  for (let i = 0; i < nW; i++) {
    const n = Math.min(8, (r.type === 'trap' ? 2 : 2) + Math.floor(area / 150) + tier + (party - 1) + (i > 0 ? 1 : 0) + Math.floor(r.depth / 2));
    const pool = r.depth <= 1 && tier === 0 ? D.pool.filter(k => k !== 'caster' && k !== 'shield') : D.pool;
    const wave = []; for (let k = 0; k < n; k++) wave.push(pick(pool));
    waves.push(wave);
  }
  return waves;
}
function spawnWave(w, r, kinds) {
  const ps = playersIn(w);
  for (const kind of kinds) {
    let x = 0, y = 0;
    for (let tries = 0; tries < 40; tries++) {
      x = (rnd(r.x0 + 1, r.x1) + 0.5) * TS; y = (rnd(r.y0 + 1, r.y1) + 0.5) * TS;
      if (solidAt(w.map, x, y) || tileAt(w.map, Math.floor(x / TS), Math.floor(y / TS)) === T.SPIKE) continue;
      if (ps.every(p => dist(p.x, p.y, x, y) > 80)) break;
    }
    spawnEnemy(w, kind, x, y, r.i);
  }
  sfxAt('spawn', (r.x0 + r.x1) / 2 * TS, (r.y0 + r.y1) / 2 * TS, 0.8);
}
function roomCleared(w, r) {
  r.cleared = true; r.active = false;
  for (const di of r.doors) { const d = w.map.doors[di]; if (!d.lock) d.open = true; }
  doorsChanged(w, 'open');
  for (const c of w.map.chests) if (c.room === r.i && c.hidden) c.hidden = false;
  const ev = { k: 'room', i: r.i, s: 'clear', type: r.type }; Net.broadcast(ev); onRoomEvent(ev);
}
function doorsChanged(w, why, d) {
  const st = w.map.doors.map(d => (d.open ? 1 : 0) + (d.lock === 'key' ? 2 : d.lock === 'boss' ? 4 : 0));
  Net.broadcast({ k: 'doors', s: st, why }); onDoors({ s: st, why });
}
function breakPot(w, i) {
  const pot = w.map.pots[i]; if (!pot || pot.hostBroken) return;
  pot.hostBroken = true;
  Net.broadcast({ k: 'pot', i }); onPotBroken(i);
  if (Math.random() < 0.6) spawnCoin(w, pot.x, pot.y, Math.round(rnd(1, 4) * (1 + scaleFor(w).lvl * 0.15)));
  if (Math.random() < 0.08) spawnPickup(w, 'orb', pot.x, pot.y);
}
function openChest(w, i, pid) {
  const c = w.map.chests[i]; if (!c || c.opened || c.hidden) return;
  c.opened = true;
  const ev = { k: 'chest', i, big: c.big ? 1 : 0, lvl: scaleFor(w).lvl, luck: scaleFor(w).luck, card: c.card ? 1 : 0, did: w.dun.did };
  Net.broadcast(ev); onChest(ev);
  if (c.key) spawnPickup(w, 'key', c.x, c.y + 10);
  for (let k = 0; k < (c.big ? 12 : 5); k++) spawnCoin(w, c.x, c.y + 6, Math.round(rnd(3, 7) * (1 + scaleFor(w).lvl * 0.15)));
}

// host: a player asked to interact with something
function hostInteract(w, m, pid) {
  if (m.what === 'chest') openChest(w, m.i, pid);
  if (m.what === 'portal') {
    if (w.leaving) return;
    if (m.kind === 'exit' && pid !== Net.pid && Net.role === 'host') { Net.send(pid, { k: 'toast', msg: 'Only the host can lead the party out early.' }); return; }
    w.leaving = true;
    const msg = { k: 'leaving', victory: m.kind === 'boss' ? 1 : 0 };
    Net.broadcast(msg); onLeaving(msg);
    setTimeout(() => { if (G.world === w) hostReturnToVillage(m.kind === 'boss'); }, 1600);
  }
}

// ============================================================================
//  Rendering (reads world state, never mutates gameplay state)
// ============================================================================
const R = { cv: null, ctx: null, W: 480, H: 270, S: 4, light: null, lctx: null, vign: null, lightSpr: {} };

function initRender() {
  R.cv = $('cv'); R.ctx = R.cv.getContext('2d');
  [R.light, R.lctx] = mkCanvas(16, 16);
  resize(); window.addEventListener('resize', resize);
}
function resize() {
  const S = Math.max(2, Math.round(window.innerHeight / 260));
  // never let a canvas reach 0x0 (a tab can report a zero-size window while it opens)
  R.S = S; R.W = Math.max(64, Math.ceil(window.innerWidth / S)); R.H = Math.max(36, Math.ceil(window.innerHeight / S));
  R.cv.width = R.W; R.cv.height = R.H; R.cv.style.width = R.W * S + 'px'; R.cv.style.height = R.H * S + 'px';
  R.ctx.imageSmoothingEnabled = false;
  R.light.width = R.W; R.light.height = R.H;
  const [v, vx] = mkCanvas(R.W, R.H);
  const g = vx.createRadialGradient(R.W / 2, R.H / 2, Math.min(R.W, R.H) * 0.35, R.W / 2, R.H / 2, Math.max(R.W, R.H) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(5,0,12,0.65)'); vx.fillStyle = g; vx.fillRect(0, 0, R.W, R.H);
  R.vign = v;
}
function lightSprite(color) {
  let s = R.lightSpr[color]; if (s) return s;
  const [c, x] = mkCanvas(128, 128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, rgba(color, 1)); g.addColorStop(0.35, rgba(color, 0.55)); g.addColorStop(1, rgba(color, 0));
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  R.lightSpr[color] = c; return c;
}

// ---------------------------------------------------------------------------
//  Camera
// ---------------------------------------------------------------------------
function updateCamera(dt) {
  const w = G.world, me = G.me, cam = G.cam; if (!w || !me) return;
  let tx = me.x + Math.cos(me.aim) * 10, ty = me.y - 8 + Math.sin(me.aim) * 8;
  if (G.camTarget) { tx = G.camTarget.x; ty = G.camTarget.y; }
  if (w.map.kind === 'dungeon') {
    const ri = roomIndexAt(w.map, me.x, me.y);
    // boss fights: frame both the hero and the boss
    let boss = w.dun && w.dun.bossId ? w.ents.get(w.dun.bossId) : null; if (!boss && w.dun) for (const e of w.ents.values()) if (e.boss) { boss = e; break; }
    if (boss && !boss.hidden && roomIndexAt(w.map, boss.x, boss.y) === ri) { tx = lerp(tx, boss.x, 0.35); ty = lerp(ty, boss.y - 30, 0.4); }
    if (ri >= 0) {
      const r = w.map.rooms[ri], x0 = (r.x0 - 1) * TS, x1 = (r.x1 + 2) * TS, y0 = (r.y0 - 2.5) * TS, y1 = (r.y1 + 2) * TS;
      tx = (x1 - x0 < R.W) ? (x0 + x1) / 2 : clamp(tx, x0 + R.W / 2, x1 - R.W / 2);
      ty = (y1 - y0 < R.H) ? (y0 + y1) / 2 : clamp(ty, y0 + R.H / 2, y1 - R.H / 2);
    }
  } else {
    tx = clamp(tx, R.W / 2, w.map.w * TS - R.W / 2); ty = clamp(ty, R.H / 2 - 30, w.map.h * TS - R.H / 2);
  }
  if (cam.snap) { cam.x = tx; cam.y = ty; cam.snap = false; }
  const k = 1 - Math.exp(-dt * 7);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  cam.shake = Math.max(0, cam.shake - dt * 2.2);
}
function shake(amt) { G.cam.shake = Math.min(1, G.cam.shake + amt * 0.06 * (G.settings ? G.settings.shake : 1)); }

// ---------------------------------------------------------------------------
//  Main draw
// ---------------------------------------------------------------------------
function render(alpha) {
  const ctx = R.ctx, w = G.world;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05030a'; ctx.fillRect(0, 0, R.W, R.H);
  if (!w || !w.map || !w.map.canvas) return;
  const cam = G.cam, sh = cam.shake * cam.shake * 9;
  const ox = Math.round(cam.x - R.W / 2 + (Math.random() * 2 - 1) * sh), oy = Math.round(cam.y - R.H / 2 + (Math.random() * 2 - 1) * sh);
  R.ox = ox; R.oy = oy;
  const now = hostTime(w);
  ctx.save(); ctx.translate(-ox, -oy);
  // ground
  ctx.drawImage(w.map.canvas, ox, oy, R.W, R.H, ox, oy, R.W, R.H);
  drawDynamicTiles(ctx, w, now);
  for (const d of G.fx.decals) { ctx.globalAlpha = 0.5 * (1 - d.t / d.life); ctx.fillStyle = d.col; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.55, 0, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
  drawZonesGround(ctx, w);
  drawHazards(ctx, w, now, false);
  // collect drawables
  const list = [];
  const inView = (x, y, m = 40) => x > ox - m && x < ox + R.W + m && y > oy - m && y < oy + R.H + m * 2;
  for (const d of w.map.decor) if (!d.flat && !d.wall && inView(d.x, d.y)) list.push({ y: d.y, f: () => drawSpr(ctx, SPR[d.spr], 0, d.x, d.y) });
  if (w.map.pots) for (const p of w.map.pots) if (!p.broken && inView(p.x, p.y)) list.push({ y: p.y, f: () => { shadowAt(ctx, p.x, p.y, 5); drawSpr(ctx, SPR['pot_' + w.map.biome] || SPR.pot_crypt, 0, p.x, p.y); } });
  if (w.map.chests) for (const c of w.map.chests) if (!c.hidden && inView(c.x, c.y)) list.push({ y: c.y, f: () => drawChest(ctx, c, w) });
  if (w.map.stones) for (const s of w.map.stones) if (inView(s.x, s.y)) list.push({ y: s.y, f: () => { shadowAt(ctx, s.x, s.y, 7); drawSpr(ctx, SPR.memstone, s.read ? 0 : Math.floor(G.rt * 2.5) % 2, s.x, s.y); if (!s.read && Math.random() < 0.12) G.fx.parts.push(part(s.x + rnd(-4, 4), s.y - rnd(6, 18), 0, -14, '#bfe8ff', 0.8, 1, true)); } });
  for (const p of portalsOf(w)) if (inView(p.x, p.y, 60)) list.push({ y: p.y + 4, f: () => drawPortal(ctx, p) });
  if (w.npcs) for (const n of w.npcs) if (inView(n.x, n.y)) list.push({ y: n.y, f: () => drawNpc(ctx, n) });
  if (w.objects) for (const o of w.objects) if (inView(o.x, o.y, 60)) list.push({ y: o.y, f: () => { if (o.role === 'gate') drawGateSwirl(ctx, o); drawSpr(ctx, SPR[o.spr], 0, o.x, o.y); } });
  if (w.map.hearth) list.push({ y: w.map.hearth.y + 6, f: () => drawHearth(ctx, w) });
  for (const e of w.ents.values()) if (inView(e.x, e.y, 60)) list.push({ y: e.y, f: () => drawEnt(ctx, e, w, now) });
  for (const l of w.loot) if (inView(l.x, l.y)) list.push({ y: l.y, f: () => drawLoot(ctx, l) });
  for (const c of G.fx.corpses) list.push({ y: c.y, f: () => { const u = c.t / c.dur; drawSpr(ctx, SPR[c.sk], 0, c.x, c.y - u * 6, c.flip, true, (1 - u) * 0.85, 1 + u * 0.35, 1 - u * 0.7); } });
  for (const p of w.players.values()) if (!p.away || !p.remote) list.push({ y: p.y, f: () => drawPlayer(ctx, p, w) });
  list.sort((a, b) => a.y - b.y);
  for (const d of list) d.f();
  // projectiles + flames (base layer)
  for (const pr of w.eprojs) { const el = now - pr.t0; if (el >= 0) drawEProj(ctx, pr.x0 + pr.vx * el, pr.y0 + pr.vy * el, pr); }
  for (const pr of w.pprojs) drawPProj(ctx, pr);
  // particles (non-glow)
  for (const p of G.fx.parts) if (!p.glow) { ctx.globalAlpha = p.amb ? Math.sin(Math.PI * (1 - p.life / p.max)) * 0.45 : clamp(p.life / p.max * 1.5, 0, 1); ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x - p.s / 2), Math.round(p.y - p.s / 2), p.s, p.s); }
  ctx.globalAlpha = 1;
  // overhead layer (roofs, tree canopies)
  if (w.map.over) ctx.drawImage(w.map.over, ox, oy, R.W, R.H, ox, oy, R.W, R.H);
  ctx.restore();

  drawLighting(ctx, w, ox, oy, now);

  // glow pass
  ctx.save(); ctx.translate(-ox, -oy); ctx.globalCompositeOperation = 'lighter';
  drawHazards(ctx, w, now, true);
  for (const s of G.fx.slashes) drawSlash(ctx, s);
  for (const r of G.fx.rings) { const u = r.t / r.dur; ctx.globalAlpha = (1 - u) * 0.9; ctx.strokeStyle = r.c; ctx.lineWidth = Math.max(1, 4 * (1 - u)); ctx.beginPath(); ctx.ellipse(r.x, r.y, lerp(r.r0, r.r1, easeOut(u)), lerp(r.r0, r.r1, easeOut(u)) * 0.6, 0, 0, TAU); ctx.stroke(); }
  for (const p of G.fx.parts) if (p.glow) { ctx.globalAlpha = p.amb ? Math.sin(Math.PI * (1 - p.life / p.max)) * (0.5 + 0.5 * Math.sin(G.rt * 5 + p.x)) : clamp(p.life / p.max * 1.4, 0, 1); ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x - p.s / 2), Math.round(p.y - p.s / 2), p.s, p.s); }
  for (const pr of w.pprojs) drawPProjGlow(ctx, pr);
  for (const pr of w.eprojs) { const el = now - pr.t0; if (el >= 0) { const x = pr.x0 + pr.vx * el, y = pr.y0 + pr.vy * el; ctx.globalAlpha = 0.5; ctx.drawImage(lightSprite(pr.kind === 'orb' ? '#9b6cff' : pr.kind === 'bubble' ? '#3fd0e0' : pr.kind === 'blade' ? '#8ff3ff' : pr.kind === 'thorn' ? '#9be86a' : pr.kind === 'shard' ? '#a8d8ff' : '#ff9a5a'), x - 10, y - 10, 20, 20); } }
  if (G.fx.zaps) for (const z of G.fx.zaps) drawZap(ctx, z);
  drawFlames(ctx, w, ox, oy);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  // bloom: a blurred, dimmed copy of the frame screened back on top makes fire and magic glow
  if (!G.settings || G.settings.bloom !== false) {
    if (!R.bloom || R.bloom.width !== (R.W >> 1)) [R.bloom, R.bctx] = mkCanvas(R.W >> 1, R.H >> 1);
    const b = R.bctx; b.globalCompositeOperation = 'source-over'; b.filter = 'none';
    b.clearRect(0, 0, R.bloom.width, R.bloom.height);
    b.filter = 'brightness(0.55) contrast(1.9) blur(3px)'; b.drawImage(R.cv, 0, 0, R.bloom.width, R.bloom.height); b.filter = 'none';
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.55; ctx.imageSmoothingEnabled = true;
    ctx.drawImage(R.bloom, 0, 0, R.W, R.H); ctx.restore(); ctx.imageSmoothingEnabled = false;
  }
  ctx.save(); ctx.translate(-ox, -oy);
  // world-space UI
  drawWorldUI(ctx, w, now);
  ctx.restore();
  // screen space
  ctx.drawImage(R.vign, 0, 0);
  if (G.hurtFlash > 0) { ctx.fillStyle = `rgba(160,10,20,${G.hurtFlash * 0.45})`; ctx.fillRect(0, 0, R.W, R.H); }
  const me = G.me;
  if (me && G.scene === 'dungeon' && me.hp / me.maxHp < 0.3 && !me.dead) { ctx.globalAlpha = 0.25 + Math.sin(G.rt * 6) * 0.12; ctx.drawImage(R.vign, 0, 0); ctx.fillStyle = 'rgba(120,0,10,0.18)'; ctx.fillRect(0, 0, R.W, R.H); ctx.globalAlpha = 1; }
  drawAllyArrows(ctx, w, ox, oy);
  if (G.flashScreen > 0) { ctx.fillStyle = `rgba(255,255,255,${G.flashScreen})`; ctx.fillRect(0, 0, R.W, R.H); }
  if (G.cine > 0) { // letterbox bars for boss introductions
    const k = Math.min(1, G.cine / 0.4, (2.6 - G.cine) / 0.3 + 0.0001), bh = Math.round(R.H * 0.11 * clamp(k, 0, 1));
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, R.W, bh); ctx.fillRect(0, R.H - bh, R.W, bh);
  }
  drawCursor(ctx);
}

// arrows at the screen edge pointing to teammates who are out of view (red + pulsing when downed)
function drawAllyArrows(ctx, w, ox, oy) {
  const me = G.me; if (!me) return;
  for (const p of w.players.values()) {
    if (p === me || !p.remote || p.away || p.dead) continue;
    const sx = p.x - ox, sy = p.y - 8 - oy, m = 10;
    if (sx > m && sx < R.W - m && sy > m && sy < R.H - m) continue;
    const cx = R.W / 2, cy = R.H / 2, a = Math.atan2(sy - cy, sx - cx);
    const k = Math.min((R.W / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (R.H / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
    const x = cx + Math.cos(a) * k, y = clamp(cy + Math.sin(a) * k, 30, R.H - 28); // stay clear of the boss bar and hotbar
    const col = p.downed ? (Math.floor(G.rt * 6) % 2 ? '#ff5a4a' : '#ffffff') : (p.color || '#fff');
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(a);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-3, -4); ctx.lineTo(-3, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
    const label = p.downed ? `${p.name} DOWN` : p.name, d = Math.round(dist(me.x, me.y, p.x, p.y) / TS);
    drawPixelText(ctx, `${label} ${d}M`, clamp(x - Math.cos(a) * 14, 40, R.W - 40), clamp(y - Math.sin(a) * 12, 8, R.H - 8), col);
  }
}
function shadowAt(ctx, x, y, r) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), r, r * 0.42, 0, 0, TAU); ctx.fill(); }

function drawDynamicTiles(ctx, w, now) {
  const m = w.map;
  if (m.doors) for (const d of m.doors) {
    if (d.open) continue;
    for (const [tx, ty] of d.tiles) {
      const x = tx * TS, y = ty * TS;
      if (d.lock === 'boss') {
        ctx.fillStyle = '#2a103a'; ctx.fillRect(x, y - (d.horiz ? 6 : 0), TS, TS + (d.horiz ? 6 : 0));
        ctx.fillStyle = '#7a2ab0'; ctx.fillRect(x + 1, y + 2, TS - 2, 2); ctx.fillRect(x + 1, y + 10, TS - 2, 2);
        ctx.fillStyle = '#c86bff'; ctx.fillRect(x + 6, y + 5, 4, 4);
      } else if (d.lock === 'key') {
        ctx.fillStyle = '#5a3a20'; ctx.fillRect(x, y - (d.horiz ? 6 : 0), TS, TS + (d.horiz ? 6 : 0));
        ctx.fillStyle = '#3a2614'; ctx.fillRect(x + 3, y, 1, TS); ctx.fillRect(x + 9, y, 1, TS);
        ctx.fillStyle = '#8a8a9a'; ctx.fillRect(x, y + 3, TS, 2); ctx.fillRect(x, y + 11, TS, 2);
      } else {
        // portcullis bars
        ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(x, y + TS - 3, TS, 3);
        ctx.fillStyle = '#6a6478'; for (let i = 0; i < 4; i++) ctx.fillRect(x + 1 + i * 4, y - (d.horiz ? 8 : 2), 2, TS + (d.horiz ? 8 : 2));
        ctx.fillStyle = '#9a94b0'; for (let i = 0; i < 4; i++) ctx.fillRect(x + 1 + i * 4, y - (d.horiz ? 8 : 2), 1, TS + (d.horiz ? 8 : 2));
        ctx.fillStyle = '#4a4458'; ctx.fillRect(x, y + 4, TS, 2);
      }
    }
    if (d.lock) { const [tx, ty] = d.tiles[1]; drawSpr(ctx, SPR[d.lock === 'boss' ? 'bosskey' : 'key'], 0, tx * TS + 8, ty * TS + 12 + Math.sin(G.rt * 3) * 1.5, false, false, 0.85); }
  }
  // living water: drifting ripple highlights and occasional glints
  if (m.kind === 'dungeon') {
    const tx0 = Math.max(0, Math.floor(R.ox / TS)), ty0 = Math.max(0, Math.floor(R.oy / TS)), tx1 = Math.min(m.w - 1, tx0 + Math.ceil(R.W / TS) + 1), ty1 = Math.min(m.h - 1, ty0 + Math.ceil(R.H / TS) + 1);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const v = m.t[ty * m.w + tx]; if (v !== T.WATER && v !== T.DEEP) continue;
      const hh = hash2(tx, ty, 9), ph = G.rt * (v === T.DEEP ? 0.6 : 1) + hh * 10;
      const px = tx * TS, py = ty * TS;
      ctx.fillStyle = v === T.DEEP ? 'rgba(90,190,210,.18)' : 'rgba(150,230,240,.22)';
      const lx = (Math.floor(ph * 6) % 16 + 16) % 16;
      ctx.fillRect(px + (lx % 12), py + 4 + Math.floor(hh * 6), 4, 1);
      ctx.fillRect(px + ((lx + 7) % 12), py + 10 + Math.floor(hh * 3), 3, 1);
      if (Math.sin(ph * 2.3) > 0.97) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(px + Math.floor(hh * 13), py + Math.floor(hh * 97) % 13, 1, 1); }
    }
  }
  // spikes
  if (m.spikes) for (const s of m.spikes) {
    const r = m.rooms[s.room]; if (r.cleared) continue;
    const st = spikeState(s, now), x = s.tx * TS, y = s.ty * TS;
    if (st === 0) continue;
    ctx.fillStyle = st === 2 ? '#d8d0e8' : '#8a8498';
    const hgt = st === 2 ? 6 : 2;
    for (const [a, b] of [[3, 3], [10, 3], [3, 10], [10, 10], [6, 6]]) { ctx.fillRect(x + a + 1, y + b + 3 - hgt, 1, hgt); ctx.fillStyle = st === 2 ? '#ffffff' : '#8a8498'; ctx.fillRect(x + a + 1, y + b + 3 - hgt, 1, 1); ctx.fillStyle = st === 2 ? '#d8d0e8' : '#8a8498'; }
  }
  // arrow trap mouths
  if (m.arrowTraps) for (const t of m.arrowTraps) { ctx.fillStyle = '#0a0610'; ctx.fillRect(t.x - 3, t.y - 2, 6, 4); ctx.fillStyle = m.pal.accent; ctx.fillRect(t.x - 4, t.y - 4, 8, 1); }
}
// 0 = down, 1 = warning, 2 = up (deterministic in shared time)
function spikeState(s, time) { const c = ((time + s.phase) % 2.4 + 2.4) % 2.4; return c > 1.55 && c < 2.25 ? 2 : c > 1.1 && c <= 1.55 ? 1 : 0; }

function portalsOf(w) {
  const a = [];
  if (w.map.exitPortal && G.scene === 'dungeon') a.push(w.map.exitPortal);
  if (w.dun && w.dun.portal) a.push({ ...w.dun.portal, kind: 'boss' });
  return a;
}
function drawPortal(ctx, p) {
  const t = G.rt, col = p.kind === 'boss' ? '#f0b752' : '#46d6c8';
  ctx.save(); ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(0, 4, 18, 7, 0, 0, TAU); ctx.fill();
  for (let i = 0; i < 3; i++) { ctx.strokeStyle = rgba(col, 0.8 - i * 0.2); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, 14 - i * 4 + Math.sin(t * 3 + i) * 1.5, (14 - i * 4) * 0.45, 0, 0, TAU); ctx.stroke(); }
  ctx.fillStyle = rgba(col, 0.35); ctx.beginPath(); ctx.ellipse(0, 0, 12, 5, 0, 0, TAU); ctx.fill();
  ctx.restore();
  if (Math.random() < 0.3) G.fx.parts.push(part(p.x + rnd(-10, 10), p.y + rnd(-3, 3), 0, rnd(-30, -15), col, rnd(0.5, 1), 1, true));
}
function drawGateSwirl(ctx, o) {
  const cx = o.x, cy = o.y - 13, t = G.rt;
  ctx.save(); ctx.beginPath(); ctx.rect(cx - 9, cy - 13, 18, 26); ctx.clip();
  ctx.fillStyle = '#0a2a30'; ctx.fillRect(cx - 9, cy - 13, 18, 26);
  for (let i = 0; i < 4; i++) { ctx.strokeStyle = rgba(i % 2 ? '#46d6c8' : '#9ff8f0', 0.55 - i * 0.1); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, 8 - i * 2 + Math.sin(t * 2 + i) * 1.2, 12 - i * 2.5, Math.sin(t * 0.7 + i) * 0.3, t * (1 + i * 0.4), t * (1 + i * 0.4) + 4.5); ctx.stroke(); }
  ctx.restore();
  if (Math.random() < 0.25) G.fx.parts.push(part(cx + rnd(-7, 7), cy + rnd(-10, 10), rnd(-6, 6), rnd(-20, -6), '#9ff8f0', rnd(0.5, 1), 1, true));
}
function drawChest(ctx, c, w) {
  shadowAt(ctx, c.x, c.y, 8);
  drawSpr(ctx, SPR[c.big ? 'bigchest' : 'chest'], c.opened ? 1 : 0, c.x, c.y);
  if (!c.opened && Math.random() < 0.08) G.fx.parts.push(part(c.x + rnd(-6, 6), c.y - rnd(4, 10), 0, -10, c.big ? '#e05aff' : '#ffd76a', 0.7, 1, true));
}
function drawHearth(ctx, w) {
  const h = w.map.hearth;
  ctx.fillStyle = '#3a3448'; ctx.beginPath(); ctx.ellipse(h.x, h.y, 17, 8, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5a546a'; for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; ctx.fillRect(Math.round(h.x + Math.cos(a) * 15) - 2, Math.round(h.y + Math.sin(a) * 6) - 2, 4, 3); }
  ctx.fillStyle = '#4a2a1a'; ctx.fillRect(h.x - 9, h.y - 3, 18, 3); ctx.fillRect(h.x - 3, h.y - 6, 6, 6);
}
function drawNpc(ctx, n) {
  shadowAt(ctx, n.x, n.y, 7);
  const bob = n.walk ? Math.floor(n.walkT * 2) % 4 : 0;
  drawSpr(ctx, SPR[n.spr], bob, n.x, n.y, n.flip);
  if (n.role && n.role !== 'villager' && G.me && dist(G.me.x, G.me.y, n.x, n.y) < 90) {
    const y = n.y - 38 + Math.sin(G.rt * 3) * 1.5;
    if (n.hasNews) drawPixelText(ctx, '!', n.x, y, '#ffd23f');
  }
}
function drawEnt(ctx, e, w, now) {
  if (e.type === 'enemy') return drawEnemy(ctx, e, w, now);
  const z = e.z || 0, bob = Math.sin(G.rt * 4 + e.id) * 1.2;
  if (e.type === 'coin') { shadowAt(ctx, e.x, e.y, 2.5); const f = Math.floor(G.rt * 8 + e.id) % 4; ctx.fillStyle = '#c9902a'; ctx.fillRect(Math.round(e.x - (f === 1 || f === 3 ? 1 : 2)), Math.round(e.y - 5 - z), f === 1 || f === 3 ? 2 : 4, 4); ctx.fillStyle = '#ffe07a'; ctx.fillRect(Math.round(e.x - 1), Math.round(e.y - 5 - z), 1, 2); return; }
  if (e.type === 'orb') { shadowAt(ctx, e.x, e.y, 3); ctx.fillStyle = '#e2483c'; ctx.beginPath(); ctx.arc(e.x, e.y - 6 - z + bob, 3.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffb0a0'; ctx.fillRect(Math.round(e.x - 2), Math.round(e.y - 8 - z + bob), 2, 2); return; }
  if (e.type === 'key' || e.type === 'bosskey') { shadowAt(ctx, e.x, e.y, 4); drawSpr(ctx, SPR[e.type], 0, e.x, e.y - 4 - z + bob); return; }
  if (e.type === 'gitem') { shadowAt(ctx, e.x, e.y, 4); const col = RARITY[e.rar || (e.item && e.item.rarity) || 'common'].color; ctx.fillStyle = col; ctx.fillRect(Math.round(e.x - 3), Math.round(e.y - 9 - z + bob), 6, 6); ctx.fillStyle = INK; ctx.fillRect(Math.round(e.x - 1), Math.round(e.y - 7 - z + bob), 2, 2); return; }
}
function drawLoot(ctx, l) {
  const bob = Math.sin(G.rt * 4 + l.seed) * 1.5, col = l.item ? RARITY[l.item.rarity].color : l.card ? '#c9a6ff' : '#fff';
  shadowAt(ctx, l.x, l.y, 4);
  // beam of light for rare+
  if (l.item && RARITY[l.item.rarity].i >= 2) { ctx.fillStyle = rgba(col, 0.18); ctx.fillRect(Math.round(l.x - 2), Math.round(l.y - 40), 4, 36); }
  const icon = l.item ? lootIcon(l.item) : l.card ? ICONS_S['card_' + l.card] : null;
  if (icon) { ctx.save(); ctx.translate(Math.round(l.x), Math.round(l.y - 10 - l.z + bob)); ctx.drawImage(icon, -8, -8); ctx.restore(); }
}
function weaponSprite(t) { return SPR['w_' + (t || 'sword')] || SPR.w_sword; }
function drawPlayer(ctx, p, w) {
  if (p.dead && G.scene !== 'dungeon') return;
  const spr = playerSprite(p.color || '#3fc9c0');
  const up = Math.sin(p.aim) < -0.45 && p.state !== 'roll';
  const flip = Math.cos(p.state === 'roll' ? (p.rollAng || 0) : p.aim) < 0;
  let frame = up ? 4 : (p.moving && p.state !== 'roll' ? 1 + Math.floor(p.walkT / 1.6) % 4 : 0);
  if (frame === 4 && !up) frame = 0; if (!up && frame > 3) frame = 0;
  if (p.state === 'attack' || p.state === 'heavy') { const tm = p.tm || attackTiming(p, p.state === 'heavy', p.combo || 0); if (p.st >= tm.wind && p.st < tm.wind + tm.act + 0.1) frame = 5; }
  if (p.state === 'hurt') frame = 6;
  const blink = p.iframe > 0 && p.state !== 'roll' && !p.remote && Math.floor(G.rt * 20) % 2 === 0;
  shadowAt(ctx, p.x, p.y, 7);
  if (p.dead) { drawSpr(ctx, spr, 0, p.x, p.y - 2 + Math.sin(G.rt * 2) * 2, flip, true, 0.25); return; }
  if (p.downed) {
    ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y - 5)); ctx.rotate(Math.PI / 2); drawSpr(ctx, spr, 6, 0, 14); ctx.restore();
    return;
  }
  // aura for blades
  if (p.bladesT > 0) for (let i = 0; i < 3; i++) { const a = p.blades + i * TAU / 3; drawSpr(ctx, SPR.w_daggers, 0, p.x + Math.cos(a) * 26, p.y - 4 + Math.sin(a) * 26); }
  const weap = weaponSprite(p.wtype);
  const drawWeapon = (behind) => {
    let ang = p.aim, off = 0;
    const W = WEAPONS[p.wtype] || WEAPONS.sword;
    if (p.state === 'attack' || p.state === 'heavy') {
      const tm = p.tm || attackTiming(p, p.state === 'heavy', p.combo || 0), base = p.atkAng ?? p.aim, side = (p.combo || 0) % 2 ? -1 : 1;
      if (p.wtype === 'spear') { off = p.st < tm.wind ? -4 : p.st < tm.wind + tm.act ? 8 : 4; ang = base; }
      else if (p.st < tm.wind) ang = base - side * W.arc * 0.6 * (p.state === 'heavy' ? 1.3 : 1);
      else { const u = clamp((p.st - tm.wind) / tm.act, 0, 1); ang = base - side * W.arc * 0.6 + side * W.arc * 1.2 * easeOut(u); }
    } else if (p.state === 'block') { ang = p.aim - Math.PI / 2 * (Math.cos(p.aim) < 0 ? -1 : 1); off = 4; }
    else if (p.spinT > 0) ang = p.spin;
    else { ang = p.aim + (Math.cos(p.aim) < 0 ? -0.6 : 0.6) + Math.sin(G.rt * 2) * 0.05; off = -2; }
    const isBehind = Math.sin(ang) < -0.2;
    if (isBehind !== behind) return;
    ctx.save(); ctx.translate(Math.round(p.x + Math.cos(p.aim) * 4), Math.round(p.y - 13)); ctx.rotate(ang); ctx.translate(off, 0);
    if (p.state === 'heavy' && p.st < (p.tm ? p.tm.wind : 0.3)) { ctx.globalAlpha = 0.6 + Math.sin(G.rt * 40) * 0.4; drawSpr(ctx, weap, 0, 0, 0, false, true); ctx.globalAlpha = 1; }
    else drawSpr(ctx, weap, 0, 0, 0, false, false);
    ctx.restore();
  };
  if (p.state === 'roll') {
    const u = clamp(p.st / ROLL_DUR, 0, 1);
    // afterimages
    for (let k = 1; k <= 2; k++) drawSpr(ctx, spr, 0, p.x - Math.cos(p.rollAng || 0) * k * 6, p.y - Math.sin(p.rollAng || 0) * k * 6, flip, true, 0.15 / k);
    ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y - 13)); ctx.rotate((flip ? -1 : 1) * u * TAU); ctx.scale(1, 0.85);
    drawSpr(ctx, spr, 0, 0, 13, flip); ctx.restore();
    return;
  }
  // body lean into attacks: pull back on the wind-up, lunge on the strike
  let lx = 0, ly = 0;
  if ((p.state === 'attack' || p.state === 'heavy') && p.tm) {
    const tm = p.tm, a = p.atkAng ?? p.aim;
    const k = p.st < tm.wind ? -(p.st / tm.wind) * (p.state === 'heavy' ? 2 : 1) : p.st < tm.wind + tm.act ? 2.5 : 2.5 * Math.max(0, 1 - (p.st - tm.wind - tm.act) / tm.rec);
    lx = Math.cos(a) * k; ly = Math.sin(a) * k * 0.6;
    if (p.state === 'heavy' && p.st < tm.wind && Math.random() < 0.6) { const aa = rnd(0, TAU); G.fx.parts.push(part(p.x + Math.cos(aa) * 14, p.y - 8 + Math.sin(aa) * 10, -Math.cos(aa) * 50, -Math.sin(aa) * 40, pick(['#ffd9a0', '#fff2c0']), 0.25, 1, true)); }
  }
  ctx.save(); ctx.translate(Math.round(lx), Math.round(ly));
  drawWeapon(true);
  const sx = p.state === 'heavy' && p.st < 0.3 ? 1.08 : 1;
  drawSpr(ctx, spr, frame, p.x, p.y, flip, p.flash > 0, blink ? 0.35 : 1, sx, 1 / sx);
  drawWeapon(false);
  ctx.restore();
  if (p.state === 'block') { ctx.strokeStyle = rgba('#8fe6ff', 0.55 + (G.time - p.blockT < 0.18 ? 0.4 : 0)); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y - 12, 17, p.aim - 1.1, p.aim + 1.1); ctx.stroke(); }
  if (p.shield > 0 || p.shieldVis > 0) { ctx.strokeStyle = rgba('#6ad2ff', 0.45 + Math.sin(G.rt * 6) * 0.15); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(p.x, p.y - 14, 13, 17, 0, 0, TAU); ctx.stroke(); }
  if (p.buffs && p.buffs.warcry && Math.random() < 0.3) G.fx.parts.push(part(p.x + rnd(-5, 5), p.y - rnd(0, 14), 0, -20, '#ff6a5a', 0.5, 1, true));
}
function drawEnemy(ctx, e, w, now) {
  if (e.hidden && e.alpha <= 0.02) { // submerged boss: ripples only
    ctx.strokeStyle = 'rgba(127,232,255,.5)'; ctx.lineWidth = 1; for (let i = 0; i < 2; i++) { const r = ((G.rt * 20 + i * 10) % 20) + 6; ctx.beginPath(); ctx.ellipse(e.x, e.y, r, r * 0.45, 0, 0, TAU); ctx.stroke(); }
    return;
  }
  const spr = SPR[e.sk]; if (!spr) return;
  const z = e.z || 0;
  // walk animation
  const moved = e._lx != null ? dist(e._lx, e._ly, e.x, e.y) : 0; e._lx = e.x; e._ly = e.y;
  e._wt = (e._wt || 0) + moved * 0.18;
  let frame = moved > 0.05 ? Math.floor(e._wt) % 4 : 0;
  if (spr.frames.length < 4) frame = 0;
  if (spr.frames.length >= 7 && !e.boss) { if (e.state === 'attack' || e.state === 'charge' || (e.state === 'combo' && e.swung)) frame = 5; else if (e.state === 'stagger' || e.flash > 0.05 || e.lflash > 0.05) frame = 6; }
  const flip = Math.cos(e.boss ? e.face : e.aim) < 0;
  const wind = e.state === 'windup' || e.state === 'leapwind' || e.state === 'chargewind' || e.anim === 'windup' || e.anim === 'twitch';
  let shx = 0; if (wind) shx = Math.sin(G.rt * 60) * 0.8;
  if (e.state === 'stagger' || e.anim === 'stun') shx = Math.sin(G.rt * 30) * 0.5;
  // shadow (grows when airborne)
  shadowAt(ctx, e.x, e.y, (e.r * 0.9) * (1 - Math.min(0.5, z / 120)));
  if (e.state === 'spawn') {
    const u = clamp(e.st / 0.9, 0, 1);
    ctx.strokeStyle = rgba('#c86bff', 0.8); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(e.x, e.y, 12 * u + 3, (12 * u + 3) * 0.5, 0, 0, TAU); ctx.stroke();
    if (Math.random() < 0.5) G.fx.parts.push(part(e.x + rnd(-8, 8), e.y, 0, -40, '#c86bff', 0.5, 1, true));
    drawSpr(ctx, spr, 0, e.x, e.y + (1 - u) * 6, flip, true, u * 0.8);
    return;
  }
  const white = (e.flash > 0 || e.lflash > 0);
  let alpha = e.alpha ?? 1;
  const elite = e.elite;
  if (elite || e.boss) { // dark aura
    ctx.globalAlpha = 0.25 + Math.sin(G.rt * 4) * 0.08; ctx.fillStyle = e.boss ? '#5a1a8a' : '#a0702a';
    ctx.beginPath(); ctx.ellipse(e.x, e.y - 2, e.r + 6, (e.r + 6) * 0.5, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  }
  // held weapons (behind/in front)
  const hold = (front) => {
    const k = e.kind, a = e.aim;
    if (e.boss) {
      if (e.bk === 'hollowking' && front) {
        let ang = a + (flip ? -0.9 : 0.9);
        if (e.anim === 'windup') ang = a + (flip ? 2.2 : -2.2);
        if (e.anim === 'swing' || e.anim === 'slam') ang = a + Math.sin(G.rt * 20) * 0.4;
        ctx.save(); ctx.translate(Math.round(e.x + (flip ? -19 : 19)), Math.round(e.y - 25 - z)); ctx.rotate(ang); drawSpr(ctx, SPR.w_greatsword, 0, 0, 0); ctx.restore();
        if (e.phase >= 1) { ctx.save(); ctx.translate(Math.round(e.x + (flip ? 19 : -19)), Math.round(e.y - 25 - z)); ctx.rotate(a + (flip ? 0.8 : -0.8) + Math.PI); drawSpr(ctx, SPR.w_greatsword, 0, 0, 0, false, false, 0.8); ctx.restore(); }
      }
      return;
    }
    const behind = Math.sin(a) < -0.3; if (behind === front) return;
    if (k === 'grunt' || k === 'elite') {
      let ang = a + (flip ? -0.5 : 0.5);
      if (wind) ang = a + (flip ? 2.0 : -2.0); else if (e.state === 'attack' || e.state === 'combo' || e.state === 'charge') ang = a + (flip ? 0.9 : -0.9) * -1;
      const ws = k === 'elite' ? SPR.w_axe : (w.dun && w.dun.did === 'crypt') ? SPR.w_rusty : SPR.w_sword;
      ctx.save(); ctx.translate(Math.round(e.x + Math.cos(a) * (k === 'elite' ? 12 : 5)), Math.round(e.y - (k === 'elite' ? 14 : 12) - z)); ctx.rotate(ang); drawSpr(ctx, ws, 0, 0, 0, false, white); ctx.restore();
    } else if (k === 'archer') {
      ctx.save(); ctx.translate(Math.round(e.x + Math.cos(a) * 7), Math.round(e.y - 11 + Math.sin(a) * 4)); ctx.rotate(a); drawSpr(ctx, SPR.w_bow, 0, 0, 0);
      if (e.state === 'windup') { ctx.fillStyle = '#d8d0b8'; const pull = clamp(e.st / 0.6, 0, 1) * 4; ctx.fillRect(-pull, -0.5, 12, 1); ctx.fillStyle = '#e8e8f0'; ctx.fillRect(10 - pull, -1, 2, 2); }
      ctx.restore();
    } else if (k === 'shield') {
      const sa = e.face; ctx.save(); ctx.translate(Math.round(e.x + Math.cos(sa) * 9), Math.round(e.y - 11 + Math.sin(sa) * 4)); drawSpr(ctx, SPR.w_shield, 0, 0, 0, Math.cos(sa) < 0, white && e.flash > 0); ctx.restore();
    } else if (k === 'caster') {
      ctx.save(); ctx.translate(Math.round(e.x + (flip ? -8 : 8)), Math.round(e.y - 14)); ctx.rotate(-Math.PI / 2 + (flip ? -0.2 : 0.2)); drawSpr(ctx, SPR.w_staff, 0, 0, 0); ctx.restore();
    }
  };
  hold(false);
  let sx = 1, sy = 1;
  if (wind) { sx = 1.06; sy = 0.94; }
  if (e.state === 'attack' || e.anim === 'slam') { sx = 0.94; sy = 1.06; }
  if (e.anim === 'roar') { sx = 1 + Math.sin(G.rt * 30) * 0.03; sy = sx; }
  if (e.anim === 'dying') { alpha *= 0.6 + Math.sin(G.rt * 30) * 0.4; shx = rnd(-2, 2); }
  const fr = e.boss && Math.sin(e.face) < -0.5 && spr.frames.length > 4 ? 4 : frame;
  drawSpr(ctx, spr, fr, e.x + shx, e.y - z, flip, white, alpha, sx, sy);
  // wind-up tell: a red glow that builds toward the strike (plus a glint right before it)
  if (wind && !white) {
    const ramp = clamp((e.st || 0) / 0.5, 0, 1);
    drawSpr(ctx, spr, fr, e.x + shx, e.y - z, flip, 'red', (0.15 + 0.45 * ramp) * (0.75 + 0.25 * Math.sin(G.rt * 30)) * alpha, sx, sy);
  }
  if (e.frozen > 0) { drawSpr(ctx, spr, frame, e.x, e.y - z, flip, true, 0.35); ctx.globalCompositeOperation = 'source-atop'; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(143,230,255,.5)'; ctx.fillRect(Math.round(e.x - e.r - 2), Math.round(e.y - 2), e.r * 2 + 4, 3); }
  hold(true);
  // status particles
  if (e.poison && Math.random() < 0.2) G.fx.parts.push(part(e.x + rnd(-5, 5), e.y - rnd(4, 14), 0, -12, '#9be86a', 0.6, 1, true));
  if (e.burn && Math.random() < 0.3) G.fx.parts.push(part(e.x + rnd(-5, 5), e.y - rnd(4, 14), 0, -25, pick(['#ff8a3a', '#ffd76a']), 0.4, 1, true));
  if (e.chill && Math.random() < 0.15) G.fx.parts.push(part(e.x + rnd(-5, 5), e.y - rnd(4, 14), 0, -8, '#bff4ff', 0.5, 1, true));
  if (e.state === 'stagger' || e.anim === 'stun') { for (let i = 0; i < 3; i++) { const a = G.rt * 5 + i * TAU / 3; ctx.fillStyle = '#ffe96a'; ctx.fillRect(Math.round(e.x + Math.cos(a) * 6), Math.round(e.y - spr.h + 2 + Math.sin(a) * 2), 2, 2); } }
  if (e.lflash > 0) e.lflash -= 1 / 60;
}
function drawEProj(ctx, x, y, pr) {
  const a = Math.atan2(pr.vy, pr.vx);
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(a);
  if (pr.kind === 'arrow') { ctx.fillStyle = '#d8d0b8'; ctx.fillRect(-6, -0.5, 9, 1); ctx.fillStyle = '#e8e8f0'; ctx.fillRect(3, -1, 2, 2); ctx.fillStyle = '#c22'; ctx.fillRect(-7, -1, 2, 2); }
  else if (pr.kind === 'orb') { ctx.fillStyle = '#9b6cff'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill(); ctx.fillStyle = '#e0c8ff'; ctx.fillRect(-1, -1, 2, 2); }
  else if (pr.kind === 'bubble') { ctx.strokeStyle = '#9ff8f0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.stroke(); ctx.fillStyle = 'rgba(63,208,224,.5)'; ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-2, -2, 1, 1); }
  else if (pr.kind === 'blade') { ctx.fillStyle = '#8ff3ff'; ctx.fillRect(-5, -1, 10, 2); ctx.fillStyle = '#fff'; ctx.fillRect(1, -1, 4, 1); }
  else if (pr.kind === 'thorn') { ctx.fillStyle = '#6fae4f'; ctx.fillRect(-4, -1, 8, 2); ctx.fillStyle = '#c9d27a'; ctx.fillRect(3, -1, 2, 2); }
  else if (pr.kind === 'shard') { ctx.fillStyle = '#a8d8ff'; ctx.fillRect(-5, -1, 9, 3); ctx.fillStyle = '#ffffff'; ctx.fillRect(1, 0, 4, 1); ctx.fillStyle = '#5a7ac8'; ctx.fillRect(-5, 1, 6, 1); }
  ctx.restore();
}
function drawPProj(ctx, pr) {
  const a = Math.atan2(pr.vy, pr.vx);
  ctx.save(); ctx.translate(Math.round(pr.x), Math.round(pr.y)); ctx.rotate(a);
  if (pr.kind === 'fireball') { ctx.fillStyle = '#ff5a2a'; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffd76a'; ctx.beginPath(); ctx.arc(1, 0, 2.5, 0, TAU); ctx.fill(); }
  else if (pr.kind === 'icelance') { ctx.fillStyle = '#bff4ff'; ctx.fillRect(-8, -1, 14, 2); ctx.fillStyle = '#fff'; ctx.fillRect(4, -1, 4, 2); ctx.fillStyle = '#4ab0d0'; ctx.fillRect(-8, 0, 10, 1); }
  else if (pr.kind === 'knife') { ctx.fillStyle = '#c8ccd8'; ctx.fillRect(-3, -1, 6, 2); ctx.fillStyle = '#9be86a'; ctx.fillRect(2, -1, 2, 2); }
  ctx.restore();
}
function drawPProjGlow(ctx, pr) {
  const col = pr.kind === 'fireball' ? '#ff8a3a' : pr.kind === 'icelance' ? '#8fe6ff' : '#9be86a', r = pr.kind === 'fireball' ? 14 : 8;
  ctx.globalAlpha = 0.6; ctx.drawImage(lightSprite(col), pr.x - r, pr.y - r, r * 2, r * 2); ctx.globalAlpha = 1;
}
// slash trail: a sweeping crescent that is faint at its tail and white-hot at the leading edge
function drawSlash(ctx, s) {
  const u = s.t / s.dur, dir = s.side > 0 ? 1 : -1, from = s.a - dir * s.arc / 2;
  const sweep = easeOut(clamp(u * 1.7, 0, 1)), lead = from + dir * s.arc * sweep;
  const tail = from + dir * s.arc * Math.max(0, sweep - 0.85 + u * 0.4);
  const fade = 1 - u * u;
  ctx.save(); ctx.translate(s.x, s.y); ctx.scale(1, 0.78);
  const n = 12, inner = s.r * (s.heavy ? 0.5 : 0.6);
  for (let i = 0; i < n; i++) {
    const k0 = i / n, k1 = (i + 1) / n, a0 = lerp(tail, lead, k0), a1 = lerp(tail, lead, k1);
    const w = lerp(0.35, 1, k1); // band thickens toward the leading edge
    ctx.globalAlpha = fade * k1 * (s.heavy ? 0.95 : 0.85);
    ctx.fillStyle = k1 > 0.82 ? '#ffffff' : s.col;
    ctx.beginPath();
    ctx.arc(0, 0, s.r, Math.min(a0, a1), Math.max(a0, a1));
    ctx.arc(0, 0, s.r - (s.r - inner) * w, Math.max(a0, a1), Math.min(a0, a1), true);
    ctx.closePath(); ctx.fill();
  }
  // crisp edge line + tip glint
  ctx.globalAlpha = fade; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = s.heavy ? 2 : 1;
  ctx.beginPath(); ctx.arc(0, 0, s.r, Math.min(tail, lead), Math.max(tail, lead)); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.cos(lead) * s.r - 1.5, Math.sin(lead) * s.r - 1.5, 3, 3);
  ctx.restore();
}function drawZap(ctx, z) {
  ctx.globalAlpha = 1 - z.t / z.dur; ctx.strokeStyle = '#ffe96a'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < z.pts.length - 1; i++) {
    const [x0, y0] = z.pts[i], [x1, y1] = z.pts[i + 1];
    ctx.moveTo(x0, y0);
    for (let k = 1; k <= 5; k++) { const u = k / 5; ctx.lineTo(lerp(x0, x1, u) + (k < 5 ? rnd(-5, 5) : 0), lerp(y0, y1, u) + (k < 5 ? rnd(-5, 5) : 0)); }
  }
  ctx.stroke(); ctx.lineWidth = 1; ctx.strokeStyle = '#ffffff'; ctx.stroke();
}
function drawFlames(ctx, w, ox, oy) {
  for (const l of w.map.lights) {
    if (!l.flame) continue;
    if (l.x < ox - 20 || l.x > ox + R.W + 20 || l.y < oy - 20 || l.y > oy + R.H + 20) continue;
    const s = l.flame === 2 ? 1.4 : 1, f = Math.sin(G.rt * 13 + l.x) * 0.5 + Math.sin(G.rt * 7.3 + l.y) * 0.5;
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#ff7a2a'; ctx.beginPath(); ctx.ellipse(l.x, l.y, 2.5 * s, (4 + f) * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd76a'; ctx.beginPath(); ctx.ellipse(l.x, l.y + 1, 1.3 * s, (2.5 + f * 0.5) * s, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.35; ctx.drawImage(lightSprite(l.color), l.x - 10 * s, l.y - 10 * s, 20 * s, 20 * s);
    if (Math.random() < 0.06 * s) G.fx.parts.push(part(l.x + rnd(-2, 2), l.y - 3, rnd(-6, 6), rnd(-30, -15), '#ffb35a', rnd(0.5, 1), 1, true));
  }
  if (w.map.hearth) {
    const h = w.map.hearth, lvl = G.P ? villageRenown(G.P) : 0, s = 1 + lvl * 0.12;
    for (let i = 0; i < 3; i++) {
      const f = Math.sin(G.rt * (9 + i * 3) + i) * 1.5;
      ctx.globalAlpha = 0.85; ctx.fillStyle = ['#ff5a1a', '#ff9a3c', '#ffe07a'][i];
      ctx.beginPath(); ctx.ellipse(h.x + (i - 1) * 2 * s, h.y - 6 - i * 2, (6 - i * 1.5) * s, (10 - i * 2 + f) * s, 0, 0, TAU); ctx.fill();
    }
    if (Math.random() < 0.5) G.fx.parts.push(part(h.x + rnd(-5, 5) * s, h.y - 10, rnd(-10, 10), rnd(-50, -25), pick(['#ffb35a', '#ff7a2a', '#ffe07a']), rnd(0.8, 1.6), 1, true));
  }
  ctx.globalAlpha = 1;
}
function drawZonesGround(ctx, w) {
  for (const z of w.zones) {
    if (z.kind === 'heal') {
      const a = clamp(Math.min(z.t * 3, (z.life - z.t) * 2), 0, 1);
      ctx.globalAlpha = 0.25 * a; ctx.fillStyle = '#7cf0a0'; ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.55, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.7 * a; ctx.strokeStyle = '#d8ffe4'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.55, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r * (0.5 + 0.5 * ((z.t * 0.8) % 1)), z.r * 0.55 * (0.5 + 0.5 * ((z.t * 0.8) % 1)), 0, 0, TAU); ctx.stroke();
    }
    if (z.kind === 'meteor' && z.t < z.life) {
      const u = z.t / z.life;
      ctx.globalAlpha = 0.35; ctx.strokeStyle = '#ff5a2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r, z.r * 0.55, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ff5a2a'; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r * u, z.r * 0.55 * u, 0, 0, TAU); ctx.fill();
      // falling rock
      ctx.globalAlpha = 1; const my = z.y - (1 - u) * 160, mx = z.x - (1 - u) * 60;
      ctx.fillStyle = '#5a2a1a'; ctx.beginPath(); ctx.arc(mx, my, 6, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff8a3a'; ctx.beginPath(); ctx.arc(mx + 1, my + 1, 3.5, 0, TAU); ctx.fill();
      if (Math.random() < 0.9) G.fx.parts.push(part(mx, my, rnd(-20, 20), rnd(-40, -10), pick(['#ff5a2a', '#ffd76a']), 0.4, 2, true));
    }
  }
  ctx.globalAlpha = 1;
}
// telegraphs: outline + inner fill that grows to the edge exactly when the hit lands
function drawHazards(ctx, w, now, glow) {
  for (const hz of w.hazards) {
    const g = hazardGeom(w, hz, now), el = g.el;
    if (el < 0) continue;
    const tele = hz.tele, inTele = el < tele, u = tele > 0 ? clamp(el / tele, 0, 1) : 1, actU = clamp((el - tele) / Math.max(0.01, hz.act), 0, 1);
    if (!glow) {
      if (!inTele && !(hz.spore || hz.wave || hz.shape === 'ring' || hz.root)) continue;
      if (hz.aimline) {
        const lockSoon = tele - el < 0.2;
        ctx.globalAlpha = lockSoon ? 0.9 : 0.35 + u * 0.3; ctx.strokeStyle = lockSoon ? '#ffffff' : '#ff3a3a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(g.x, g.y + (hz.oy || 0)); ctx.lineTo(g.x + Math.cos(g.ang) * hz.len, g.y + (hz.oy || 0) + Math.sin(g.ang) * hz.len); ctx.stroke();
        continue;
      }
      if (hz.spore && !inTele) { // lingering poison cloud
        ctx.globalAlpha = 0.28 * (1 - Math.max(0, actU - 0.8) * 5); ctx.fillStyle = '#7ab04a'; ctx.beginPath(); ctx.ellipse(g.x, g.y, hz.r, hz.r * 0.6, 0, 0, TAU); ctx.fill();
        if (Math.random() < 0.3) G.fx.parts.push(part(g.x + rnd(-hz.r, hz.r), g.y + rnd(-hz.r, hz.r) * 0.5, 0, -10, '#9be86a', 0.9, 2, false));
        continue;
      }
      if (hz.wave && !inTele) {
        ctx.globalAlpha = 0.85; ctx.fillStyle = '#1d6f8f'; ctx.fillRect(g.x, g.y, hz.w, hz.h); ctx.fillStyle = '#9ff8f0'; ctx.fillRect(g.x, g.y + (hz.vy > 0 ? hz.h - 3 : 0), hz.w, 3);
        if (Math.random() < 0.6) G.fx.parts.push(part(g.x + rnd(0, hz.w), g.y + (hz.vy > 0 ? hz.h : 0), rnd(-20, 20), -rnd(20, 50), '#c9fff8', 0.4, 1, true));
        continue;
      }
      if (hz.root && !inTele) { if (el - tele < 0.05 && !hz._fx) { hz._fx = 1; for (let k = 0; k < 4; k++) G.fx.parts.push(part(g.x + rnd(-6, 6), g.y, rnd(-30, 30), rnd(-80, -40), pick(['#6a4a2a', '#4f8f3a']), 0.5, 2, false, 300)); } ctx.globalAlpha = 1 - actU; ctx.fillStyle = '#4e3a26'; for (let k = -1; k <= 1; k++) { ctx.fillRect(g.x + k * 5 - 1, g.y - 10 + Math.abs(k) * 4, 3, 10 - Math.abs(k) * 4); } ctx.fillStyle = '#c9d27a'; ctx.fillRect(g.x - 1, g.y - 11, 2, 2); continue; }
      if (hz.shape === 'ring') continue;
      const col = hz.rune ? '#c86bff' : '#ff3030';
      const baseA = hz.subtle ? 0.13 : 0.22;
      ctx.globalAlpha = baseA + 0.12 * u; ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1;
      if (hz.shape === 'circle') {
        ctx.beginPath(); ctx.ellipse(g.x, g.y, hz.r * u, hz.r * u * 0.6, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = (hz.subtle ? 0.35 : 0.65); ctx.beginPath(); ctx.ellipse(g.x, g.y, hz.r, hz.r * 0.6, 0, 0, TAU); ctx.stroke();
        if (hz.rune) { ctx.save(); ctx.translate(g.x, g.y); ctx.scale(1, 0.6); ctx.rotate(G.rt * 2); ctx.globalAlpha = 0.7; for (let k = 0; k < 6; k++) { ctx.rotate(TAU / 6); ctx.fillRect(hz.r * 0.55, -1, 3, 2); } ctx.restore(); }
      } else if (hz.shape === 'arc') {
        ctx.save(); ctx.translate(g.x, g.y); ctx.scale(1, 0.75);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, hz.r * u, g.ang - hz.arc / 2, g.ang + hz.arc / 2); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = hz.subtle ? 0.3 : 0.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, hz.r, g.ang - hz.arc / 2, g.ang + hz.arc / 2); ctx.closePath(); ctx.stroke();
        ctx.restore();
      } else if (hz.shape === 'line') {
        ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.ang);
        ctx.fillRect(0, -hz.w / 2, hz.len * u, hz.w); ctx.globalAlpha = hz.subtle ? 0.3 : 0.6; ctx.strokeRect(0, -hz.w / 2, hz.len, hz.w);
        ctx.restore();
      } else if (hz.shape === 'rect') {
        ctx.fillRect(g.x, g.y, hz.w, hz.h); ctx.globalAlpha = 0.6; ctx.strokeRect(g.x, g.y, hz.w, hz.h);
      }
    } else {
      // impact flashes / bright active parts (additive)
      if (hz.shape === 'ring' && !inTele) {
        const rad = lerp(hz.r0, hz.r1, actU);
        ctx.globalAlpha = (1 - actU) * (hz.dmg ? 0.9 : 0.5); ctx.strokeStyle = hz.dmg ? '#ffb070' : '#c9a6ff'; ctx.lineWidth = hz.w * 0.6;
        ctx.beginPath(); ctx.ellipse(g.x, g.y, rad, rad * 0.6, 0, 0, TAU); ctx.stroke();
        ctx.lineWidth = 1; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      }
      if (hz.beam && el >= tele - 0.9) {
        const active = !inTele;
        ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.ang);
        ctx.globalAlpha = active ? 0.8 : 0.25; ctx.fillStyle = active ? '#7fe8ff' : '#3a8fa0'; ctx.fillRect(0, -hz.w / 2 * (active ? 1 : 0.3), hz.len, hz.w * (active ? 1 : 0.3));
        if (active) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, -2, hz.len, 4); }
        ctx.restore();
      }
      if (!inTele && el - tele < 0.12 && (hz.shape === 'circle' || hz.shape === 'arc') && hz.dmg && !hz.spore && !hz.subtle) {
        const k = 1 - (el - tele) / 0.12; ctx.globalAlpha = k * 0.6; ctx.fillStyle = hz.rune ? '#e0b0ff' : '#ffd0a0';
        if (hz.shape === 'circle') { ctx.beginPath(); ctx.ellipse(g.x, g.y, hz.r, hz.r * 0.6, 0, 0, TAU); ctx.fill(); }
        else { ctx.save(); ctx.translate(g.x, g.y); ctx.scale(1, 0.75); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, hz.r, g.ang - hz.arc / 2, g.ang + hz.arc / 2); ctx.closePath(); ctx.fill(); ctx.restore(); }
      }
    }
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
//  Lighting: ambient darkness multiplied with additive light sprites
// ---------------------------------------------------------------------------
function drawLighting(ctx, w, ox, oy, now) {
  const L = R.lctx, village = w.map.kind === 'village';
  L.globalCompositeOperation = 'source-over';
  const amb = village ? (G.scene === 'title' ? '#463c6a' : '#5a5482') : mix(w.map.pal.ambient, '#7a72a0', 0.55);
  L.fillStyle = amb; L.fillRect(0, 0, R.W, R.H);
  L.globalCompositeOperation = 'lighter';
  const add = (x, y, r, col, a = 1) => {
    const sx = x - ox, sy = y - oy; if (sx < -r || sy < -r || sx > R.W + r || sy > R.H + r) return;
    L.globalAlpha = a; L.drawImage(lightSprite(col), sx - r, sy - r, r * 2, r * 2);
  };
  for (const l of w.map.lights) { const f = l.flicker ? 1 + (Math.sin(G.rt * 11 + l.x) * 0.5 + Math.sin(G.rt * 17.3 + l.y) * 0.5) * 0.06 * l.flicker : 1; add(l.x, l.y, l.r * f, l.color, 0.9); }
  if (w.map.hearth) { const lvl = G.P ? villageRenown(G.P) : 0; add(w.map.hearth.x, w.map.hearth.y - 8, (130 + lvl * 22) * (1 + Math.sin(G.rt * 9) * 0.03), '#ff9a3c', 1); }
  for (const p of w.players.values()) { if (p.dead && p.remote) continue; add(p.x, p.y - 8, p === G.me ? 115 : 80, p === G.me ? '#b8d8e0' : (p.color || '#888'), p === G.me ? 0.75 : 0.45); }
  for (const pr of w.pprojs) add(pr.x, pr.y, pr.kind === 'fireball' ? 60 : 30, pr.kind === 'fireball' ? '#ff8a3a' : '#8fe6ff', 0.9);
  for (const pr of w.eprojs) { const el = now - pr.t0; if (el >= 0) add(pr.x0 + pr.vx * el, pr.y0 + pr.vy * el, 26, pr.kind === 'orb' ? '#9b6cff' : pr.kind === 'bubble' ? '#3fd0e0' : '#ff9a5a', 0.6); }
  for (const z of w.zones) add(z.x, z.y, z.kind === 'heal' ? 70 : 60, z.kind === 'heal' ? '#7cf0a0' : '#ff5a2a', 0.7);
  for (const l of w.loot) if (l.item && RARITY[l.item.rarity].i >= 1) add(l.x, l.y - 6, 26, RARITY[l.item.rarity].color, 0.8);
  for (const p of portalsOf(w)) add(p.x, p.y, 70, p.kind === 'boss' ? '#f0b752' : '#46d6c8', 0.9);
  for (const e of w.ents.values()) {
    if (e.type === 'enemy' && (e.boss || e.elite)) add(e.x, e.y - 10, e.boss ? 70 : 40, e.boss ? '#9b6cff' : '#ffb35a', 0.4);
    if (e.type === 'enemy' && e.kind === 'caster') add(e.x, e.y - 10, 26, '#8ff3ff', 0.5);
    if (e.type === 'key' || e.type === 'bosskey') add(e.x, e.y - 6, 30, e.type === 'key' ? '#ffd34a' : '#e05aff', 0.8);
  }
  for (const r of G.fx.rings) add(r.x, r.y, r.r1, r.c, 0.4 * (1 - r.t / r.dur));
  if (w.map.chests) for (const c of w.map.chests) if (!c.hidden && !c.opened) add(c.x, c.y - 6, 30, c.big ? '#c86bff' : '#ffcf6a', 0.5);
  for (const hz of w.hazards) if (hz.beam) { const g = hazardGeom(w, hz, now); if (g.el > hz.tele) for (let k = 0; k < 6; k++) add(g.x + Math.cos(g.ang) * k * 50, g.y + Math.sin(g.ang) * k * 50, 40, '#7fe8ff', 0.6); }
  L.globalAlpha = 1; L.globalCompositeOperation = 'source-over';
  ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(R.light, 0, 0); ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------------------
//  In-world UI: damage numbers, names, health bars, prompts, pings
// ---------------------------------------------------------------------------
function drawWorldUI(ctx, w, now) {
  for (const e of w.ents.values()) {
    if (e.type !== 'enemy' || e.boss || e.state === 'spawn' || e.hidden) continue;
    if (e.hp < e.maxHp || e.elite) {
      const bw = e.elite ? 26 : 14, y = Math.round(e.y - (SPR[e.sk] ? SPR[e.sk].ay : 18) - 6 - (e.z || 0)), x = Math.round(e.x - bw / 2);
      ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 1, bw + 2, 4);
      ctx.fillStyle = '#3a0a10'; ctx.fillRect(x, y, bw, 2);
      ctx.fillStyle = e.elite ? '#ffb35a' : '#e2483c'; ctx.fillRect(x, y, Math.max(0, Math.round(bw * e.hp / e.maxHp)), 2);
      if (e.elite) { const bn = BIOME_ENEMIES[(e.sk || '').split('_')[0]]; drawPixelText(ctx, (bn && bn.elite) || 'ELITE', e.x, y - 5, '#ffd76a'); }
    }
  }
  for (const p of w.players.values()) {
    if (p.remote && !p.dead) {
      drawPixelText(ctx, p.name, p.x, p.y - 40, p.color || '#fff');
      const bw = 16, x = Math.round(p.x - 8), y = Math.round(p.y - 36);
      ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 1, bw + 2, 4); ctx.fillStyle = '#7cf0a0'; ctx.fillRect(x, y, Math.round(bw * clamp(p.hp / (p.maxHp || 1), 0, 1)), 2);
    }
    if (p.downed) {
      const r = 12, pr = p.reviveP || 0;
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y - 4, r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#7cf0a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y - 4, r, -Math.PI / 2, -Math.PI / 2 + TAU * pr); ctx.stroke();
      drawPixelText(ctx, p === G.me ? 'DOWN - WAIT FOR ALLY' : 'REVIVE', p.x, p.y - 30 + Math.sin(G.rt * 5), '#ff6b5e');
      if (p === G.me) drawPixelText(ctx, Math.ceil(p.downT) + 'S', p.x, p.y + 12, '#ffffff');
    }
    if (p.bubble && p.bubble.t > 0) {
      p.bubble.t -= 1 / 60;
      const txt = p.bubble.text.slice(0, 32).toUpperCase(); const c = pixelText(txt, '#ffffff', 1, null);
      const bx = Math.round(p.x - c.width / 2 - 3), by = Math.round(p.y - 58);
      ctx.fillStyle = 'rgba(12,7,20,.85)'; ctx.fillRect(bx, by, c.width + 6, c.height + 4); ctx.fillStyle = 'rgba(12,7,20,.85)'; ctx.fillRect(Math.round(p.x - 1), by + c.height + 4, 3, 2);
      ctx.drawImage(c, bx + 3, by + 2);
    }
    if (p.emote && p.emote.t > 0) {
      p.emote.t -= 1 / 60; const y = p.y - 48 - (1 - Math.min(1, (3 - p.emote.t) * 4)) * 4;
      drawPixelText(ctx, p.emote.text, p.x, y, p.emote.col || '#ffd23f', 1);
    }
  }
  for (const pg of G.fx.pings) {
    const u = pg.t / pg.dur; ctx.globalAlpha = 1 - u * u;
    ctx.strokeStyle = pg.col; ctx.lineWidth = 1;
    for (let k = 0; k < 2; k++) { const rr = ((G.rt * 18 + k * 8) % 16) + 3; ctx.beginPath(); ctx.ellipse(pg.x, pg.y, rr, rr * 0.5, 0, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = pg.col; ctx.beginPath(); ctx.moveTo(pg.x, pg.y - 4); ctx.lineTo(pg.x - 4, pg.y - 12); ctx.lineTo(pg.x + 4, pg.y - 12); ctx.closePath(); ctx.fill();
    drawPixelText(ctx, pg.name, pg.x, pg.y - 18, pg.col);
    ctx.globalAlpha = 1;
  }
  for (const n of G.fx.nums) {
    const u = n.t / n.dur, sc = n.s;
    ctx.globalAlpha = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
    const pop = u < 0.12 ? 1 + (1 - u / 0.12) * 0.6 : 1;
    const c = pixelText(String(n.v), n.c, sc);
    ctx.drawImage(c, Math.round(n.x - c.width * pop / 2), Math.round(n.y - c.height * pop / 2), Math.round(c.width * pop), Math.round(c.height * pop));
  }
  ctx.globalAlpha = 1;
  // interaction hint above the target
  if (G.interact && G.interact.x != null) {
    const it = G.interact, y = it.y - (it.h || 24) - 8 + Math.sin(G.rt * 4) * 1.5;
    drawPixelText(ctx, 'E', it.x, y, '#ffd23f');
  }
}
function drawCursor(ctx) {
  if (G.scene === 'title' || G.menu || !Input.moved) return;
  const x = Math.round(Input.mx / R.S), y = Math.round(Input.my / R.S);
  ctx.fillStyle = INK; ctx.fillRect(x - 4, y - 1, 9, 3); ctx.fillRect(x - 1, y - 4, 3, 9);
  ctx.fillStyle = '#ffe9c0'; ctx.fillRect(x - 3, y, 2, 1); ctx.fillRect(x + 2, y, 2, 1); ctx.fillRect(x, y - 3, 1, 2); ctx.fillRect(x, y + 2, 1, 2);
}

// ---------------------------------------------------------------------------
//  Effects (particles, numbers, slashes...) — purely cosmetic, frame-rate based
// ---------------------------------------------------------------------------
function part(x, y, vx, vy, c, life, s = 1, glow = false, g = 0) { return { x, y, vx, vy, c, life, max: life, s, glow, g }; }
function updateFx(dt) {
  const F = G.fx;
  for (let i = F.parts.length - 1; i >= 0; i--) { const p = F.parts[i]; p.life -= dt; if (p.life <= 0) { F.parts.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= 1 - 2 * dt; p.vy *= 1 - (p.g ? 0 : 2) * dt; }
  if (F.parts.length > 900) F.parts.splice(0, F.parts.length - 900);
  for (const k of ['nums', 'slashes', 'rings', 'decals', 'pings', 'corpses']) { const a = F[k]; for (let i = a.length - 1; i >= 0; i--) { const o = a[i]; o.t += dt; if (o.vy) { o.y += o.vy * dt; o.vy *= 1 - 4 * dt; } if (o.t >= (o.dur || o.life)) a.splice(i, 1); } }
  if (F.zaps) for (let i = F.zaps.length - 1; i >= 0; i--) { F.zaps[i].t += dt; if (F.zaps[i].t > F.zaps[i].dur) F.zaps.splice(i, 1); }
  G.hurtFlash = Math.max(0, G.hurtFlash - dt); G.flashScreen = Math.max(0, G.flashScreen - dt * 3);
}
// ambient life: drifting dust in dungeons, fireflies and embers in the village
function ambientFx(dt) {
  const w = G.world; if (!w || !w.map) return;
  const cx = G.cam.x, cy = G.cam.y;
  if (w.map.kind === 'dungeon') {
    if (Math.random() < dt * 14) G.fx.parts.push({ ...part(cx + rnd(-R.W / 2, R.W / 2), cy + rnd(-R.H / 2, R.H / 2), rnd(-4, 4), rnd(-6, 2), w.map.biome === 'cave' ? '#7fe8ff' : w.map.biome === 'forest' ? '#c9e88a' : '#b8a8d8', rnd(2, 4), 1, w.map.biome !== 'crypt'), amb: 1 });
  } else {
    if (Math.random() < dt * 6) G.fx.parts.push({ ...part(cx + rnd(-R.W / 2, R.W / 2), cy + rnd(-R.H / 2, R.H / 2), rnd(-8, 8), rnd(-8, 8), pick(['#e8ff8a', '#ffe9a0']), rnd(2, 4), 1, true), amb: 1 });
  }
}
function numFx(x, y, v, c = '#fff', s = 1) { if (G.settings && G.settings.nums === false && typeof v === 'number') return; G.fx.nums.push({ x: x + rnd(-3, 3), y, vy: -45, v, c, s, t: 0, dur: 0.9 }); }
function spawnSlash(f) {
  const W = WEAPONS[f.w] || WEAPONS.sword;
  const r = W.range * (f.h ? 1.2 : 1) + 2, col = f.h ? '#ffb36a' : f.c === 2 ? '#c9e6ff' : '#8fd0ff';
  const s = { x: f.x, y: f.y, a: f.a, arc: f.w === 'spear' ? 0.55 : W.arc * (f.h ? 1.15 : 1), r, t: 0, dur: f.h ? 0.24 : 0.16, col, side: (f.c || 0) % 2 ? -1 : 1, heavy: f.h };
  G.fx.slashes.push(s);
  if (f.h || f.c === 2) for (let i = 0; i < (f.h ? 10 : 5); i++) { const a = f.a + rnd(-s.arc / 2, s.arc / 2), rr = r * rnd(0.7, 1.05); G.fx.parts.push(part(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.78, Math.cos(a) * rnd(30, 80), Math.sin(a) * rnd(20, 60), pick([col, '#ffffff']), rnd(0.15, 0.3), 1, true)); }
}
function spawnDust(x, y, n) { for (let i = 0; i < n; i++) G.fx.parts.push(part(x + rnd(-3, 3), y - rnd(0, 2), rnd(-20, 20), rnd(-15, -2), pick(['#6a5a6a', '#8a7a8a', '#4a3a4a']), rnd(0.3, 0.5), rnd(1, 2))); }
function dustRing(x, y, n) { for (let i = 0; i < n; i++) { const a = i / n * TAU; G.fx.parts.push(part(x + Math.cos(a) * 6, y + Math.sin(a) * 3, Math.cos(a) * 90, Math.sin(a) * 45, pick(['#8a7a8a', '#6a5a6a', '#a09090']), rnd(0.4, 0.7), 2)); } }
function sparkFx(x, y, c, n) { for (let i = 0; i < n; i++) { const a = rnd(0, TAU), s = rnd(40, 140); G.fx.parts.push(part(x, y, Math.cos(a) * s, Math.sin(a) * s, i % 2 ? c : '#ffffff', rnd(0.15, 0.35), 1, true)); } }
function burstFx(x, y, cols, n, sp) { for (let i = 0; i < n; i++) { const a = rnd(0, TAU), s = rnd(sp * 0.3, sp); G.fx.parts.push(part(x, y, Math.cos(a) * s, Math.sin(a) * s * 0.7, pick(cols), rnd(0.3, 0.7), rnd(1, 3), true)); } }
function bloodFx(x, y, a, c, n) { for (let i = 0; i < n; i++) { const aa = a + rnd(-0.7, 0.7), s = rnd(40, 120); G.fx.parts.push(part(x, y, Math.cos(aa) * s, Math.sin(aa) * s - 30, c, rnd(0.3, 0.6), rnd(1, 2), false, 260)); } }
function ringFx(x, y, r0, r1, c, dur) { G.fx.rings.push({ x, y, r0, r1, c, t: 0, dur }); }
function shadowFx(x, y) { for (let i = 0; i < 18; i++) { const a = rnd(0, TAU), s = rnd(10, 60); G.fx.parts.push(part(x + rnd(-4, 4), y - rnd(0, 14), Math.cos(a) * s, Math.sin(a) * s - 10, pick(['#3a1d5a', '#9b6cff', '#1a0a2a']), rnd(0.3, 0.6), 2, i % 3 === 0)); } }
function spawnHealFx(x, y) { for (let i = 0; i < 16; i++) G.fx.parts.push(part(x + rnd(-8, 8), y - rnd(0, 16), 0, rnd(-40, -15), pick(['#7cf0a0', '#d8ffe4']), rnd(0.5, 0.9), 1, true)); }
function zapFx(pts) { (G.fx.zaps = G.fx.zaps || []).push({ pts, t: 0, dur: 0.22 }); for (const [x, y] of pts) sparkFx(x, y, '#ffe96a', 4); }
function slamFx(x, y, r) { dustRing(x, y, 24); ringFx(x, y, 6, r, '#ffb070', 0.3); G.fx.decals.push({ x, y, r: r * 0.6, t: 0, life: 6, col: '#0a0610' }); for (let i = 0; i < 10; i++) G.fx.parts.push(part(x + rnd(-r, r) * 0.5, y + rnd(-r, r) * 0.3, rnd(-20, 20), rnd(-120, -60), '#6a5a6a', 0.6, 2, false, 400)); }
function splashFx(x, y) { for (let i = 0; i < 26; i++) { const a = rnd(0, TAU); G.fx.parts.push(part(x + Math.cos(a) * 8, y + Math.sin(a) * 4, Math.cos(a) * rnd(20, 70), rnd(-140, -60), pick(['#9ff8f0', '#3fd0e0', '#ffffff']), rnd(0.4, 0.8), 2, false, 380)); } ringFx(x, y, 6, 40, '#7fe8ff', 0.4); }
function potFx(pot) { const c = '#8a7a9a'; for (let i = 0; i < 10; i++) { const a = rnd(0, TAU), s = rnd(30, 90); G.fx.parts.push(part(pot.x, pot.y - 5, Math.cos(a) * s, Math.sin(a) * s - 40, pick([c, shade(c, 0.7), '#5a4a3a']), rnd(0.4, 0.7), 2, false, 300)); } sfxAt('bone', pot.x, pot.y, 0.8, 0.7); }
function hitFx(x, y, a, e, h) {
  const bone = e.sk && e.sk.startsWith('crypt'), col = bone ? '#e4dcc4' : e.sk && e.sk.startsWith('forest') ? '#6fae4f' : e.sk && e.sk.startsWith('cave') ? '#5ac8d0' : '#c22a3a';
  bloodFx(x, y, a, col, h.heavy || h.crit ? 10 : 5);
  sparkFx(x, y, '#fff2c0', h.crit ? 10 : 4);
  if (h.heavy || h.crit) ringFx(x, y, 2, 16, '#ffffff', 0.15);
}
function deathFx(x, y, sk, big) {
  const col = sk && sk.startsWith('crypt') ? ['#e4dcc4', '#a89f86', '#5a4a6e'] : sk && sk.startsWith('forest') ? ['#6fae4f', '#4a6a2a', '#8a6a3a'] : ['#5ac8d0', '#2a4a5a', '#7aa0a8'];
  for (let i = 0; i < (big ? 50 : 18); i++) { const a = rnd(0, TAU), s = rnd(30, big ? 200 : 110); G.fx.parts.push(part(x, y - 6, Math.cos(a) * s, Math.sin(a) * s - 60, pick(col), rnd(0.5, 1.1), rnd(1, 3), false, 300)); }
  for (let i = 0; i < 8; i++) G.fx.parts.push(part(x + rnd(-5, 5), y - rnd(0, 10), rnd(-10, 10), rnd(-40, -20), '#c86bff', rnd(0.4, 0.8), 1, true));
  G.fx.decals.push({ x, y, r: big ? 14 : 7, t: 0, life: 10, col: '#0a0610' });
}

// ---------------------------------------------------------------------------
//  Minimap / full map
// ---------------------------------------------------------------------------
function drawMinimap(cv, full) {
  const ctx = cv.getContext('2d'), w = G.world; if (!w || !w.map) return;
  const W = cv.width, H = cv.height, m = w.map;
  ctx.clearRect(0, 0, W, H);
  if (m.kind === 'village') {
    if (!m.mini) { const [c, x] = mkCanvas(m.w, m.h); for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) { const v = tileAt(m, tx, ty); x.fillStyle = v === T.TREE ? '#12261e' : v === T.PATH ? '#5a4632' : v === T.COBBLE ? '#55506a' : v === T.BLDG ? '#7a5a40' : v === T.SOLID ? '#3a3448' : '#1e3a30'; x.fillRect(tx, ty, 1, 1); } m.mini = c; }
    const s = Math.min(W / m.w, H / m.h); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(m.mini, (W - m.w * s) / 2, (H - m.h * s) / 2, m.w * s, m.h * s);
    const tox = (W - m.w * s) / 2, toy = (H - m.h * s) / 2;
    if (w.npcs) for (const n of w.npcs) if (n.role !== 'villager') { ctx.fillStyle = '#ffd23f'; ctx.fillRect(tox + n.x / TS * s - 1, toy + n.y / TS * s - 1, 3, 3); }
    for (const p of w.players.values()) { ctx.fillStyle = p === G.me ? '#ffffff' : p.color; ctx.fillRect(tox + p.x / TS * s - 2, toy + p.y / TS * s - 2, 4, 4); }
    return;
  }
  // dungeon: rooms on a grid
  const rooms = m.rooms;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const r of rooms) { x0 = Math.min(x0, r.x0); y0 = Math.min(y0, r.y0); x1 = Math.max(x1, r.x1); y1 = Math.max(y1, r.y1); }
  const s = Math.min((W - 8) / (x1 - x0 + 1), (H - 8) / (y1 - y0 + 1));
  const ox = (W - (x1 - x0 + 1) * s) / 2 - x0 * s, oy = (H - (y1 - y0 + 1) * s) / 2 - y0 * s;
  const near = new Set();
  for (const r of rooms) if (r.discovered) for (const di of r.doors) { const d = m.doors[di]; for (const d2 of m.doors) if (d2 !== d && Math.abs(d2.tiles[0][0] - d.tiles[0][0]) + Math.abs(d2.tiles[0][1] - d.tiles[0][1]) < 14) near.add(d2.room); }
  // corridors
  ctx.fillStyle = '#3a3050';
  for (const d of m.doors) { const r = rooms[d.room]; if (!r.discovered && !near.has(d.room)) continue; const [tx, ty] = d.tiles[1]; ctx.fillRect(ox + tx * s - 1, oy + ty * s - 1, 3, 3); }
  const cur = roomIndexAt(m, G.me.x, G.me.y);
  for (const r of rooms) {
    const vis = r.discovered || full && false, hint = near.has(r.i);
    if (!vis && !hint) continue;
    ctx.fillStyle = !vis ? 'rgba(80,60,110,.35)' : r.i === cur ? '#7a5aa8' : r.cleared ? '#4a3a66' : '#5a2a3a';
    ctx.fillRect(ox + r.x0 * s, oy + r.y0 * s, r.w * s, r.h * s);
    if (vis) { ctx.strokeStyle = '#000'; ctx.strokeRect(ox + r.x0 * s + 0.5, oy + r.y0 * s + 0.5, r.w * s - 1, r.h * s - 1); }
    const cx = ox + (r.x0 + r.w / 2) * s, cy = oy + (r.y0 + r.h / 2) * s;
    if (vis || hint) {
      if (r.type === 'boss') { ctx.fillStyle = '#e05aff'; ctx.fillRect(cx - 3, cy - 3, 6, 6); ctx.fillStyle = '#000'; ctx.fillRect(cx - 1, cy - 2, 1, 1); ctx.fillRect(cx + 1, cy - 2, 1, 1); }
      if (r.type === 'treasure' && vis) { ctx.fillStyle = '#f0b752'; ctx.fillRect(cx - 2, cy - 2, 5, 4); }
      if (r.type === 'start') { ctx.fillStyle = '#46d6c8'; ctx.fillRect(cx - 2, cy - 2, 4, 4); }
      if (r.type === 'elite' && vis && !r.cleared) { ctx.fillStyle = '#ffb35a'; ctx.fillRect(cx - 2, cy - 2, 4, 4); }
    }
  }
  for (const d of m.doors) if (d.lock && (rooms[d.room].discovered || near.has(d.room))) { const [tx, ty] = d.tiles[1]; ctx.fillStyle = d.lock === 'boss' ? '#e05aff' : '#ffd34a'; ctx.fillRect(ox + tx * s - 2, oy + ty * s - 2, 4, 4); }
  for (const c of m.chests) if (!c.hidden && !c.opened && rooms[c.room].discovered) { ctx.fillStyle = '#ffcf6a'; ctx.fillRect(ox + c.x / TS * s - 1, oy + c.y / TS * s - 1, 2, 2); }
  for (const p of w.players.values()) { if (p.away) continue; ctx.fillStyle = p === G.me ? '#ffffff' : p.color; ctx.fillRect(ox + p.x / TS * s - 1.5, oy + p.y / TS * s - 1.5, 3, 3); }
  if (full) for (const pg of G.fx.pings) { ctx.fillStyle = pg.col; ctx.fillRect(ox + pg.x / TS * s - 2, oy + pg.y / TS * s - 2, 4, 4); }
}

// ============================================================================
//  Maps: dungeon generation, village layout, collision, pre-rendering
// ============================================================================
const T = { VOID: 0, FLOOR: 1, WALL: 2, DOOR: 3, PILLAR: 4, WATER: 5, SPIKE: 6, DEEP: 7, GRASS: 8, PATH: 9, COBBLE: 10, TREE: 11, BLDG: 12, SOLID: 13 };
const SOLID_T = new Uint8Array(16); [T.VOID, T.WALL, T.PILLAR, T.DEEP, T.TREE, T.BLDG, T.SOLID].forEach(t => SOLID_T[t] = 1);
const PROJ_SOLID_T = new Uint8Array(16); [T.VOID, T.WALL, T.PILLAR, T.TREE, T.BLDG].forEach(t => PROJ_SOLID_T[t] = 1);
const FLOORISH = t => t === T.FLOOR || t === T.DOOR || t === T.WATER || t === T.SPIKE || t === T.DEEP || t >= T.GRASS && t <= T.COBBLE;

function tileAt(map, tx, ty) { return (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) ? T.VOID : map.t[ty * map.w + tx]; }
function doorClosedAt(map, tx, ty) {
  const di = map.doorAt[ty * map.w + tx]; if (!di) return false;
  return !map.doors[di - 1].open;
}
function solidTile(map, tx, ty) {
  const t = tileAt(map, tx, ty);
  if (SOLID_T[t]) return true;
  if (t === T.DOOR) return doorClosedAt(map, tx, ty);
  return false;
}
function projSolidTile(map, tx, ty) {
  const t = tileAt(map, tx, ty);
  if (PROJ_SOLID_T[t]) return true;
  if (t === T.DOOR) return doorClosedAt(map, tx, ty);
  return false;
}
function solidAt(map, x, y) { return solidTile(map, Math.floor(x / TS), Math.floor(y / TS)); }
function projSolidAt(map, x, y) { return projSolidTile(map, Math.floor(x / TS), Math.floor(y / TS)); }

// push a circle out of solid tiles
function collideCircle(map, e, r) {
  const x0 = Math.floor((e.x - r) / TS), x1 = Math.floor((e.x + r) / TS), y0 = Math.floor((e.y - r) / TS), y1 = Math.floor((e.y + r) / TS);
  let hit = false;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (!solidTile(map, tx, ty)) continue;
    const rx = tx * TS, ry = ty * TS;
    const cx = clamp(e.x, rx, rx + TS), cy = clamp(e.y, ry, ry + TS);
    let dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.0001) { const d = Math.sqrt(d2); e.x += dx / d * (r - d); e.y += dy / d * (r - d); }
    else { // centre inside the tile: push out along the shallowest axis
      const l = e.x - rx, rr = rx + TS - e.x, u = e.y - ry, b = ry + TS - e.y, m = Math.min(l, rr, u, b);
      if (m === l) e.x = rx - r; else if (m === rr) e.x = rx + TS + r; else if (m === u) e.y = ry - r; else e.y = ry + TS + r;
    }
  }
  return hit;
}
function moveEntity(map, e, dx, dy, r) {
  let hit = false;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (r * 0.8)));
  for (let i = 0; i < steps; i++) {
    e.x += dx / steps; if (collideCircle(map, e, r)) hit = true;
    e.y += dy / steps; if (collideCircle(map, e, r)) hit = true;
  }
  return hit;
}
// line of sight on the tile grid (for AI + projectiles)
function lineOfSight(map, x0, y0, x1, y1, proj = true) {
  const d = dist(x0, y0, x1, y1), n = Math.ceil(d / 6);
  for (let i = 1; i < n; i++) {
    const x = lerp(x0, x1, i / n), y = lerp(y0, y1, i / n);
    if (proj ? projSolidAt(map, x, y) : solidAt(map, x, y)) return false;
  }
  return true;
}
function roomIndexAt(map, x, y) {
  if (!map.roomAt) return -1;
  const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return -1;
  return map.roomAt[ty * map.w + tx] - 1;
}

// ---------------------------------------------------------------------------
//  Dungeon generation (deterministic from seed so every client builds the
//  identical map; only the host spawns enemies into it)
// ---------------------------------------------------------------------------
function genDungeon(did, tier, seed) {
  const D = DUNGEONS[did], rng = new RNG(seed);
  const GW = 5, GH = 5, CW = 30, CH = 22, W = GW * CW, H = GH * CH;
  const t = new Uint8Array(W * H).fill(T.WALL);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) t[y * W + x] = v; };
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? T.VOID : t[y * W + x];

  // --- room graph (random tree grown from the start cell) ---
  const grid = new Map(), cells = [];
  const addCell = (cx, cy, parent) => { const c = { cx, cy, nb: [], i: cells.length }; cells.push(c); grid.set(cx + ',' + cy, c); if (parent) { parent.nb.push(c); c.nb.push(parent); } return c; };
  const start = addCell(rng.int(1, 3), GH - 1);
  const target = 9 + Math.min(tier, 2) + rng.int(0, 1);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let guard = 0;
  while (cells.length < target && guard++ < 2000) {
    const base = rng.chance(0.55) ? cells[Math.max(0, cells.length - 1 - rng.int(0, 2))] : rng.pick(cells);
    const [dx, dy] = rng.pick(dirs), nx = base.cx + dx, ny = base.cy + dy;
    if (nx < 0 || ny < 0 || nx >= GW || ny >= GH || grid.has(nx + ',' + ny)) continue;
    if (base.nb.length >= 3) continue;
    addCell(nx, ny, base);
  }
  // depth from start
  const depth = new Map([[start, 0]]), q = [start];
  while (q.length) { const c = q.shift(); for (const n of c.nb) if (!depth.has(n)) { depth.set(n, depth.get(c) + 1); q.push(n); } }
  let leaves = cells.filter(c => c !== start && c.nb.length === 1).sort((a, b) => depth.get(b) - depth.get(a));
  const ensureLeaf = (avoid) => { // add a fresh leaf somewhere
    for (const c of rng.shuffle(cells.slice())) {
      if (avoid.includes(c)) continue;
      for (const [dx, dy] of rng.shuffle(dirs.slice())) {
        const nx = c.cx + dx, ny = c.cy + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH || grid.has(nx + ',' + ny)) continue;
        const n = addCell(nx, ny, c); depth.set(n, depth.get(c) + 1); return n;
      }
    }
    return null;
  };
  const boss = leaves[0] || ensureLeaf([start]);
  leaves = leaves.filter(c => c !== boss);
  const treasure = leaves[0] || ensureLeaf([start, boss]);
  const middle = cells.filter(c => c !== start && c !== boss && c !== treasure).sort((a, b) => depth.get(b) - depth.get(a));
  const elite = middle[0];
  const rest = middle.slice(1);
  rng.shuffle(rest);
  const keyRoom = rest[0] || elite;
  const trapCount = rest.length > 4 ? 2 : rest.length > 2 ? 1 : 0;
  for (const c of cells) c.type = 'combat';
  start.type = 'start'; boss.type = 'boss'; treasure.type = 'treasure'; if (elite) elite.type = 'elite';
  for (let i = 1; i <= trapCount; i++) if (rest[i]) rest[i].type = 'trap';

  // --- carve rooms ---
  const rooms = cells.map((c, i) => {
    let w, h;
    if (c.type === 'boss') { w = 26; h = 17; }
    else if (c.type === 'start') { w = 15; h = 11; }
    else if (c.type === 'treasure') { w = 13; h = 9; }
    else if (c.type === 'elite') { w = rng.int(21, 24); h = rng.int(13, 15); }
    else { w = rng.int(15, 23); h = rng.int(10, 14); }
    const x0 = c.cx * CW + Math.floor((CW - w) / 2) + rng.int(-1, 1);
    const y0 = c.cy * CH + Math.floor((CH - h) / 2) + 1 + rng.int(-1, 0);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, T.FLOOR);
    // chamfered corners give rooms more interesting silhouettes
    const ch = c.type === 'boss' ? 3 : c.type === 'start' || c.type === 'treasure' ? 0 : rng.int(0, 3);
    if (ch >= 2) for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x0 + w - 1, y0, -1, 1], [x0, y0 + h - 1, 1, -1], [x0 + w - 1, y0 + h - 1, -1, -1]])
      for (let i = 0; i < ch; i++) for (let j = 0; j < ch - i; j++) set(cx + sx * i, cy + sy * j, T.WALL);
    return { i, ch, cx: c.cx, cy: c.cy, x0, y0, x1: x0 + w - 1, y1: y0 + h - 1, w, h, type: c.type, depth: depth.get(c), doors: [], cell: c, cleared: c.type === 'start' || c.type === 'treasure', discovered: c.type === 'start' };
  });
  const roomOf = c => rooms[c.i];
  // --- corridors + doors ---
  const doors = [];
  const addDoor = (room, tiles, horiz, lock) => { const d = { i: doors.length, room: room.i, tiles, horiz, lock, open: !lock }; doors.push(d); room.doors.push(d.i); for (const [x, y] of tiles) set(x, y, T.DOOR); return d; };
  const edges = new Set();
  for (const c of cells) for (const n of c.nb) {
    const k = Math.min(c.i, n.i) + '-' + Math.max(c.i, n.i); if (edges.has(k)) continue; edges.add(k);
    let a = roomOf(c), b = roomOf(n);
    if (a.cx > b.cx || a.cy > b.cy) [a, b] = [b, a];
    const lockFor = r => r.type === 'treasure' ? 'key' : r.type === 'boss' ? 'boss' : null;
    if (a.cy === b.cy) { // horizontal corridor a -> b
      const lo = Math.max(a.y0, b.y0) + 2, hi = Math.min(a.y1, b.y1) - 4;
      const y = hi >= lo ? Math.round(lerp(lo, hi, 0.5 + rng.range(-0.3, 0.3))) : Math.max(a.y0, b.y0) + 1;
      for (let x = a.x1 + 1; x <= b.x0 - 1; x++) for (let yy = y; yy < y + 3; yy++) set(x, yy, T.FLOOR);
      addDoor(a, [[a.x1 + 1, y], [a.x1 + 1, y + 1], [a.x1 + 1, y + 2]], false, lockFor(a));
      addDoor(b, [[b.x0 - 1, y], [b.x0 - 1, y + 1], [b.x0 - 1, y + 2]], false, lockFor(b));
    } else { // vertical corridor a (top) -> b (bottom)
      const lo = Math.max(a.x0, b.x0) + 2, hi = Math.min(a.x1, b.x1) - 4;
      const x = hi >= lo ? Math.round(lerp(lo, hi, 0.5 + rng.range(-0.3, 0.3))) : Math.max(a.x0, b.x0) + 1;
      for (let y = a.y1 + 1; y <= b.y0 - 1; y++) for (let xx = x; xx < x + 3; xx++) set(xx, y, T.FLOOR);
      addDoor(a, [[x, a.y1 + 1], [x + 1, a.y1 + 1], [x + 2, a.y1 + 1]], true, lockFor(a));
      addDoor(b, [[x, b.y0 - 1], [x + 1, b.y0 - 1], [x + 2, b.y0 - 1]], true, lockFor(b));
    }
  }
  // doors always open onto floor (chamfers may have walled the tiles right inside)
  for (const d of doors) {
    const r = rooms[d.room];
    for (const [x, y] of d.tiles) {
      const ix = d.horiz ? x : (x < r.x0 ? x + 1 : x - 1), iy = d.horiz ? (y < r.y0 ? y + 1 : y - 1) : y;
      set(ix, iy, T.FLOOR); if (d.horiz) set(ix, iy + (y < r.y0 ? 1 : -1), T.FLOOR); else set(ix + (x < r.x0 ? 1 : -1), iy, T.FLOOR);
    }
  }
  const map = { kind: 'dungeon', did, tier, seed, biome: did, w: W, h: H, t, rooms, doors, decor: [], lights: [], spikes: [], arrowTraps: [], pots: [], chests: [], pal: D.pal };

  // --- room interiors ---
  const clearMargin = 2;
  for (const r of rooms) {
    const inner = (x, y) => x >= r.x0 + clearMargin && x <= r.x1 - clearMargin && y >= r.y0 + clearMargin && y <= r.y1 - clearMargin;
    const cxm = (r.x0 + r.x1) / 2, cym = (r.y0 + r.y1) / 2;
    const mirror = (x, y, v) => { // 4-way symmetric placement
      const pts = [[x, y], [Math.round(2 * cxm - x), y], [x, Math.round(2 * cym - y)], [Math.round(2 * cxm - x), Math.round(2 * cym - y)]];
      for (const [px, py] of pts) if (inner(px, py)) set(px, py, v);
    };
    if (r.type === 'combat' || r.type === 'elite') {
      const style = rng.int(0, 4);
      if (style === 0) { const ox = Math.floor(r.w / 4), oy = Math.floor(r.h / 4); for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) mirror(r.x0 + ox + dx, r.y0 + oy + dy, T.PILLAR); }
      else if (style === 1) { for (let x = r.x0 + 4; x <= r.x1 - 4; x += 4) { mirror(x, r.y0 + 3, T.PILLAR); } }
      else if (style === 2 && r.w > 16) { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 0; dy++) set(Math.round(cxm) + dx, Math.round(cym) + dy, did === 'cave' ? T.DEEP : T.PILLAR); }
      else if (style === 3) { for (let k = 0; k < 3; k++) mirror(r.x0 + rng.int(3, Math.floor(r.w / 2) - 1), r.y0 + rng.int(3, Math.floor(r.h / 2) - 1), T.PILLAR); }
      // biome ground features
      if (did === 'cave' || (did === 'forest' && rng.chance(0.4))) {
        const n = rng.int(1, 3);
        for (let k = 0; k < n; k++) {
          const px = rng.int(r.x0 + 2, r.x1 - 2), py = rng.int(r.y0 + 2, r.y1 - 2), rad = rng.range(1.5, 3.2);
          for (let y = py - 4; y <= py + 4; y++) for (let x = px - 4; x <= px + 4; x++) if (dist(x, y, px, py) < rad && get(x, y) === T.FLOOR && x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) set(x, y, T.WATER);
        }
      }
    }
    if (r.type === 'trap') {
      // sweeping spike columns with staggered phase
      const vertical = rng.chance(0.5);
      if (vertical) { for (let x = r.x0 + 3; x <= r.x1 - 3; x += 2) for (let y = r.y0 + 1; y <= r.y1 - 1; y++) if (get(x, y) === T.FLOOR) { set(x, y, T.SPIKE); map.spikes.push({ tx: x, ty: y, phase: ((x - r.x0) * 0.22) % 3, room: r.i }); } }
      else { for (let y = r.y0 + 2; y <= r.y1 - 2; y += 2) for (let x = r.x0 + 1; x <= r.x1 - 1; x++) if (get(x, y) === T.FLOOR) { set(x, y, T.SPIKE); map.spikes.push({ tx: x, ty: y, phase: ((y - r.y0) * 0.3) % 3, room: r.i }); } }
      // wall-mounted arrow traps
      for (let k = 0; k < 2; k++) {
        const left = k === 0, yy = rng.int(r.y0 + 2, r.y1 - 2);
        map.arrowTraps.push({ x: (left ? r.x0 : r.x1 + 1) * TS + (left ? -2 : 2), y: yy * TS + 8, ang: left ? 0 : Math.PI, period: 2.6, phase: k * 1.3, room: r.i });
      }
    }
    // pots / props
    if (r.type !== 'boss' && r.type !== 'start') {
      const np = rng.int(2, 5);
      for (let k = 0; k < np; k++) {
        const corner = rng.int(0, 3);
        const px = corner % 2 ? r.x1 - rng.int(0, 1) : r.x0 + rng.int(0, 1), py = corner > 1 ? r.y1 - rng.int(0, 1) : r.y0 + rng.int(0, 1);
        if (get(px, py) === T.FLOOR && !map.pots.some(p => p.tx === px && p.ty === py)) map.pots.push({ i: map.pots.length, tx: px, ty: py, x: px * TS + 8, y: py * TS + 12, room: r.i, broken: false });
      }
    }
    // decorations (non-colliding)
    const nd = Math.floor(r.w * r.h / 28);
    for (let k = 0; k < nd; k++) {
      const x = rng.int(r.x0, r.x1), y = rng.int(r.y0, r.y1); if (get(x, y) !== T.FLOOR) continue;
      const choices = did === 'crypt' ? ['bones', 'bones', 'grave'] : did === 'forest' ? ['bush', 'mushroom', 'rock', 'bush'] : ['crystal', 'rock', 'mushroom'];
      const spr = rng.pick(choices);
      if (spr === 'grave' && (x === r.x0 || x === r.x1)) continue;
      map.decor.push({ spr, x: x * TS + 8 + rng.int(-3, 3), y: y * TS + 12, flat: spr === 'bones' });
    }
    // torches along the top wall (on the wall face) + braziers
    for (let x = r.x0 + 2; x <= r.x1 - 2; x += rng.int(4, 6)) {
      if (get(x, r.y0 - 1) !== T.WALL) continue;
      map.decor.push({ spr: 'sconce', x: x * TS + 8, y: (r.y0 - 1) * TS + 12, wall: true });
      map.lights.push({ x: x * TS + 8, y: (r.y0 - 1) * TS + 4, r: 96, color: D.pal.torch, flicker: 1, flame: 1 });
    }
    if (r.type === 'boss' || r.type === 'elite' || (r.w > 18 && rng.chance(0.5))) {
      const k = r.ch === 3 ? 2 : 1;
      for (const [bx, by] of [[r.x0 + k, r.y0 + k], [r.x1 - k, r.y0 + k], [r.x0 + k, r.y1 - k], [r.x1 - k, r.y1 - k]]) {
        if (get(bx, by) !== T.FLOOR) continue;
        set(bx, by, T.SOLID);
        map.decor.push({ spr: 'brazier', x: bx * TS + 8, y: by * TS + 14 });
        map.lights.push({ x: bx * TS + 8, y: by * TS + 2, r: 125, color: D.pal.torch, flicker: 1, flame: 2 });
      }
    }
    // chests: treasure room always; reward chests revealed after clears
    if (r.type === 'treasure') map.chests.push({ i: map.chests.length, x: Math.round(cxm) * TS + 8, y: Math.round(cym) * TS + 12, big: true, room: r.i, hidden: false, opened: false, card: true });
    else if (r === roomOf(keyRoom)) map.chests.push({ i: map.chests.length, x: Math.round(cxm) * TS + 8, y: (r.y0 + 1) * TS + 12, room: r.i, hidden: true, opened: false, key: true });
    else if (r.type === 'combat' && rng.chance(0.35)) map.chests.push({ i: map.chests.length, x: Math.round(cxm) * TS + 8, y: (r.y0 + 1) * TS + 12, room: r.i, hidden: true, opened: false });
    if (r.type === 'start') {
      map.spawn = { x: Math.round(cxm) * TS + 8, y: (r.y1 - 2) * TS + 8 };
      map.exitPortal = { x: Math.round(cxm) * TS + 8, y: (r.y0 + 3) * TS + 8, kind: 'exit' };
      map.lights.push({ x: map.exitPortal.x, y: map.exitPortal.y, r: 80, color: '#46d6c8', flicker: 0.3 });
    }
    if (r.type === 'boss') { map.bossPos = { x: Math.round(cxm) * TS + 8, y: (r.y0 + 7) * TS }; map.arena = { x: (cxm + 0.5) * TS, y: (cym + 0.5) * TS, r: Math.min(r.w, r.h) * TS * 0.42 }; }
    if (r.type === 'elite') (map.rugs = map.rugs || []).push({ x: (r.x0 + 3) * TS, y: (Math.round(cym) - 1) * TS, w: (r.w - 6) * TS, h: 3 * TS });
    // tile clear check guarantee: make sure pillars didn't seal a door (doors are on the perimeter, perimeter is clear)
  }
  map.decor = map.decor.filter(d => d.wall || d.spr === 'brazier' || !((map.rugs || []).some(rg => d.x > rg.x - 8 && d.x < rg.x + rg.w + 8 && d.y > rg.y - 4 && d.y < rg.y + rg.h + 12) || (map.arena && Math.hypot(d.x - map.arena.x, (d.y - map.arena.y) / 0.62) < map.arena.r + 10)));
  map.pots = map.pots.filter(p => get(p.tx, p.ty) === T.FLOOR);
  map.pots.forEach((p, i) => p.i = i);
  // keep walls next to floor; walls two above a floor become "upper faces"; everything else is void
  const t2 = new Uint8Array(t);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (t[y * W + x] !== T.WALL) continue;
    let near = false;
    for (let dy = -1; dy <= 2 && !near; dy++) for (let dx = -1; dx <= 1; dx++) { const v = get(x + dx, y + dy); if (v !== T.WALL && v !== T.VOID) { if (dy === 2 && dx !== 0) continue; near = true; break; } }
    if (!near) t2[y * W + x] = T.VOID;
  }
  map.t = t2;
  finishMap(map);
  return map;
}
function finishMap(map) {
  const W = map.w, H = map.h;
  map.doorAt = new Int16Array(W * H);
  for (const d of (map.doors || [])) for (const [x, y] of d.tiles) map.doorAt[y * W + x] = d.i + 1;
  map.roomAt = new Int16Array(W * H);
  for (const r of (map.rooms || [])) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) map.roomAt[y * W + x] = r.i + 1;
}

// ---------------------------------------------------------------------------
//  Village (hand-laid; buildings appear as the player's renown grows)
// ---------------------------------------------------------------------------
const VILLAGE_W = 60, VILLAGE_H = 46;
const VILLAGE_BUILDINGS = [
  { id: 'forge', x: 7, y: 13, w: 9, h: 5, style: 'forge', unlock: null, label: 'Forge' },
  { id: 'merchant', x: 44, y: 13, w: 9, h: 5, style: 'shop', unlock: 'merchant', label: 'Trading Post' },
  { id: 'arcanist', x: 46, y: 29, w: 6, h: 5, style: 'tower', unlock: 'arcanist', label: 'Arcane Tower' },
  { id: 'tavern', x: 6, y: 29, w: 11, h: 5, style: 'tavern', unlock: 'tavern', label: 'Tavern' },
  { id: 'house1', x: 17, y: 6, w: 7, h: 4, style: 'house', unlock: 'houses', label: 'House' },
  { id: 'house2', x: 37, y: 6, w: 7, h: 4, style: 'house', unlock: 'houses', label: 'House' },
  { id: 'home', x: 22, y: 34, w: 7, h: 4, style: 'house', unlock: null, label: 'Your Home' },
];
const VILLAGE_NPCS = [
  { id: 'brann', name: 'Brann the Smith', spr: 'npc_brann', x: 12, y: 19.6, role: 'smith', unlock: null },
  { id: 'mira', name: 'Mira the Trader', spr: 'npc_mira', x: 48, y: 19.6, role: 'shop', unlock: 'merchant' },
  { id: 'hessa', name: 'Elder Hessa', spr: 'npc_hessa', x: 26.5, y: 24.5, role: 'elder', unlock: null },
  { id: 'vesh', name: 'Vesh the Arcanist', spr: 'npc_vesh', x: 49, y: 35.5, role: 'arcanist', unlock: 'arcanist' },
  { id: 'bard', name: 'Lute the Bard', spr: 'npc_bard', x: 13, y: 35.5, role: 'bard', unlock: 'tavern' },
];
const VILLAGE_OBJECTS = [
  { id: 'board', name: 'Bounty Board', spr: 'board', x: 35, y: 19, role: 'board' },
  { id: 'altar', name: 'Card Altar', spr: 'altar', x: 24.5, y: 19, role: 'altar' },
  { id: 'stash', name: 'Stash', spr: 'stashchest', x: 31.5, y: 38.6, role: 'stash' },
  { id: 'gate', name: 'Dungeon Gate', spr: 'portalframe', x: 30, y: 4.2, role: 'gate' },
];
function genVillage(unlocked) {
  const W = VILLAGE_W, H = VILLAGE_H, t = new Uint8Array(W * H).fill(T.GRASS);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) t[y * W + x] = v; };
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? T.VOID : t[y * W + x];
  const rng = new RNG(777);
  const map = { kind: 'village', w: W, h: H, t, decor: [], lights: [], trees: [], over: [], biome: 'village', pal: { ambient: '#1a1430', torch: '#ffb35a' }, rooms: [], doors: [] };
  // paths
  const rect = (x0, y0, w, h, v) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, v); };
  rect(29, 4, 2, 16, T.PATH); rect(6, 22, 20, 2, T.PATH); rect(35, 22, 20, 2, T.PATH); rect(29, 27, 2, 13, T.PATH);
  rect(11, 18, 2, 4, T.PATH); rect(47, 18, 2, 4, T.PATH); rect(13, 24, 2, 5, T.PATH); rect(48, 24, 2, 5, T.PATH);
  rect(20, 10, 2, 12, T.PATH); rect(39, 10, 2, 12, T.PATH); rect(25, 37, 10, 3, T.PATH);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dist(x + 0.5, y + 0.5, 30, 23) < 6.5) set(x, y, T.COBBLE);
  // hearth
  rect(29, 22, 2, 2, T.SOLID);
  map.hearth = { x: 30 * TS, y: 23 * TS + 4 };
  // border forest
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (edge < 3 && !(x >= 27 && x <= 32 && y <= 5)) set(x, y, T.TREE);
  }
  // gate
  rect(27, 0, 1, 6, T.SOLID); rect(32, 0, 1, 6, T.SOLID); rect(28, 0, 4, 3, T.SOLID);
  map.lights.push({ x: 30 * TS, y: 2.5 * TS, r: 90, color: '#46d6c8', flicker: 0.3 });
  // buildings
  map.buildings = [];
  for (const b of VILLAGE_BUILDINGS) {
    const built = !b.unlock || unlocked.has(b.unlock);
    rect(b.x, b.y, b.w, b.h, T.BLDG);
    map.buildings.push({ ...b, built });
    if (built) {
      // windows glow
      const wy = (b.y + b.h - 2) * TS + 6;
      map.lights.push({ x: (b.x + 2) * TS, y: wy, r: 46, color: '#ffb35a', flicker: 0.15 });
      map.lights.push({ x: (b.x + b.w - 2) * TS, y: wy, r: 46, color: '#ffb35a', flicker: 0.15 });
      if (b.style === 'forge') map.lights.push({ x: (b.x + 3) * TS, y: (b.y + b.h) * TS + 4, r: 80, color: '#ff7a2a', flicker: 1 });
      if (b.style === 'tower') map.lights.push({ x: (b.x + 3) * TS, y: (b.y - 3) * TS, r: 90, color: '#9b6cff', flicker: 0.5 });
    }
  }
  // objects (solid at base)
  for (const o of VILLAGE_OBJECTS) if (o.role !== 'gate') set(Math.floor(o.x), Math.floor(o.y) - 1, T.SOLID);
  map.decor.push({ spr: 'anvil', x: 16 * TS + 8, y: 20 * TS + 6 }); set(16, 19, T.SOLID);
  if (unlocked.has('merchant')) { map.decor.push({ spr: 'stall', x: 42 * TS, y: 20 * TS + 10 }); set(41, 19, T.SOLID); set(42, 19, T.SOLID); }
  map.decor.push({ spr: 'well', x: 37 * TS, y: 31 * TS }); rect(36, 29, 2, 2, T.SOLID);
  if (unlocked.has('monument')) { map.decor.push({ spr: 'statue', x: 25 * TS, y: 13 * TS }); set(24, 12, T.SOLID); set(25, 12, T.SOLID); map.lights.push({ x: 25 * TS, y: 10 * TS, r: 110, color: '#ffd76a', flicker: 0.2 }); }
  // banners & lanterns
  const lanternSpots = [[27, 17], [33, 17], [26, 28], [34, 28], [23, 21], [37, 21]];
  if (unlocked.has('lanterns')) lanternSpots.push([18, 21], [42, 21], [28, 33], [32, 33], [10, 24], [50, 24], [28, 10], [32, 10]);
  for (const [x, y] of lanternSpots) { map.decor.push({ spr: 'lantern', x: x * TS + 8, y: y * TS + 14 }); set(x, y, T.SOLID); map.lights.push({ x: x * TS + 8, y: y * TS - 2, r: 60, color: '#ffcf6a', flicker: 0.25 }); }
  if (unlocked.has('tavern')) for (const [x, y] of [[25, 15], [35, 15]]) { map.decor.push({ spr: 'banner', x: x * TS + 8, y: y * TS + 14 }); set(x, y, T.SOLID); }
  // fences around the home garden
  for (let x = 20; x < 31; x++) { if (x === 25 || x === 26) continue; map.decor.push({ spr: 'fence', x: x * TS + 8, y: 40 * TS + 10 }); set(x, 40, T.SOLID); }
  // trees in the border + scattered
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (get(x, y) === T.TREE && (x + y * 3) % 2 === 0) map.trees.push({ x: x * TS + 8 + rng.int(-4, 4), y: y * TS + 14, v: rng.int(0, 2) });
  for (let k = 0; k < 26; k++) {
    const x = rng.int(4, W - 5), y = rng.int(4, H - 5);
    if (get(x, y) !== T.GRASS || get(x + 1, y) !== T.GRASS || get(x - 1, y) !== T.GRASS || get(x, y + 1) !== T.GRASS || get(x, y - 1) !== T.GRASS) continue;
    if (dist(x, y, 30, 23) < 9 || (x >= 26 && x <= 34 && y < 12)) continue;
    const kind = rng.int(0, 5);
    if (kind < 2) { set(x, y, T.TREE); map.trees.push({ x: x * TS + 8, y: y * TS + 14, v: rng.int(0, 2) }); }
    else map.decor.push({ spr: kind === 2 ? 'rock' : 'bush', x: x * TS + 8, y: y * TS + 12 });
  }
  map.trees.sort((a, b) => a.y - b.y);
  map.spawn = { x: 30 * TS, y: 29 * TS };
  map.gate = { x: 30 * TS, y: 5.5 * TS };
  finishMap(map);
  return map;
}

// ---------------------------------------------------------------------------
//  Pre-rendering: map -> big canvases (ground layer + overhead layer)
// ---------------------------------------------------------------------------
function prerenderMap(map) {
  const W = map.w * TS, H = map.h * TS;
  const [c, x] = mkCanvas(W, H);
  const [oc, ox] = mkCanvas(W, H);
  const pal = map.pal, tile = (tx, ty) => tileAt(map, tx, ty);
  const village = map.kind === 'village';
  x.fillStyle = '#05030a'; x.fillRect(0, 0, W, H);
  const pillars = [];
  for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
    const v = tile(tx, ty), px = tx * TS, py = ty * TS, hh = hash2(tx, ty, 3);
    if (v === T.VOID) continue;
    if (village) { drawVillageTile(x, v, tx, ty, px, py, hh, map); continue; }
    if (v === T.WALL || (v === T.SOLID && false)) { drawWallTile(x, map, tx, ty, px, py, hh); continue; }
    // floors: beveled flagstones (8px stones, offset rows) with per-stone tint
    const base = hh < 0.5 ? pal.floor : pal.floor2;
    drawFlagstones(x, map, px, py, base, pal);
    if (v === T.WATER || v === T.DEEP) {
      x.fillStyle = v === T.DEEP ? '#08202a' : (map.biome === 'forest' ? '#1f3a3a' : '#123848'); x.fillRect(px, py, TS, TS);
      x.fillStyle = v === T.DEEP ? '#0d2c38' : '#1d5060';
      if (hh > 0.5) x.fillRect(px + 2, py + 5, 6, 1); else x.fillRect(px + 8, py + 10, 5, 1);
      // edges
      x.fillStyle = shade(pal.floor, 0.6);
      if (!(tile(tx, ty - 1) === T.WATER || tile(tx, ty - 1) === T.DEEP)) x.fillRect(px, py, TS, 2);
    }
    if (v === T.SPIKE) {
      x.fillStyle = shade(base, 0.7); x.fillRect(px + 1, py + 1, 14, 14);
      x.fillStyle = '#0a0610'; for (const [a, b] of [[3, 3], [10, 3], [3, 10], [10, 10], [6, 6]]) x.fillRect(px + a, py + b, 3, 3);
    }
    if (v === T.PILLAR) pillars.push([px, py]);
    if (v === T.SOLID) { /* braziers sit on these; floor already drawn */ }
    // soft shadow under walls
    if (tile(tx, ty - 1) === T.WALL) { x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(px, py, TS, 4); x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(px, py + 4, TS, 3); }
    if (tile(tx - 1, ty) === T.WALL) { x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(px, py, 3, TS); }
    if (tile(tx + 1, ty) === T.WALL) { x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(px + TS - 3, py, 3, TS); }
  }
  // ceremonial floors: elite rugs and the boss arena seal
  for (const rg of map.rugs || []) {
    const col = map.biome === 'crypt' ? '#4a1424' : map.biome === 'forest' ? '#2f3f1a' : '#123a48';
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(rg.x + 2, rg.y + 2, rg.w, rg.h);
    x.fillStyle = col; x.fillRect(rg.x, rg.y, rg.w, rg.h);
    x.fillStyle = shade(col, 1.5); x.fillRect(rg.x, rg.y + 3, rg.w, 1); x.fillRect(rg.x, rg.y + rg.h - 4, rg.w, 1);
    x.fillStyle = '#c9a24a'; for (let k = 8; k < rg.w - 4; k += 16) { x.fillRect(rg.x + k, rg.y + rg.h / 2 - 1, 3, 3); }
    x.fillStyle = shade(col, 0.7); for (let k = 0; k < rg.w; k += 4) { x.fillRect(rg.x + k, rg.y - 1, 2, 1); x.fillRect(rg.x + k, rg.y + rg.h, 2, 1); }
  }
  if (map.arena) {
    const a = map.arena, acc = map.pal.accent;
    x.save(); x.translate(a.x, a.y); x.scale(1, 0.62);
    x.globalAlpha = 0.5; x.strokeStyle = acc; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, a.r, 0, TAU); x.stroke();
    x.lineWidth = 1; x.beginPath(); x.arc(0, 0, a.r - 7, 0, TAU); x.stroke(); x.beginPath(); x.arc(0, 0, a.r * 0.45, 0, TAU); x.stroke();
    x.globalAlpha = 0.35; for (let i = 0; i < 12; i++) { const an = i / 12 * TAU; x.save(); x.rotate(an); x.fillStyle = acc; x.fillRect(a.r * 0.5, -1.5, a.r * 0.42, 3); x.fillRect(a.r - 13, -4, 5, 8); x.restore(); }
    x.globalAlpha = 0.18; x.fillStyle = acc; x.beginPath(); x.arc(0, 0, a.r * 0.45, 0, TAU); x.fill();
    x.restore(); x.globalAlpha = 1;
  }
  for (const [px, py] of pillars) drawPillar(x, px, py, pal, map.biome);
  // static decor
  if (village) drawVillageBuildings(x, ox, map);
  for (const d of map.decor) if (d.flat || d.wall) drawSpr(x, SPR[d.spr], 0, d.x, d.y);
  if (village) for (const tr of map.trees) { drawTreeTrunk(x, tr); drawSpr(ox, SPR['tree' + tr.v], 0, tr.x, tr.y); }
  map.canvas = c; map.over = oc;
  return map;
}
function drawFlagstones(x, map, px, py, base, pal) {
  const biome = map.biome, sz = biome === 'cave' ? 8 : 16;
  x.fillStyle = pal.floorLine; x.fillRect(px, py, TS, TS);
  for (let sy = 0; sy < TS; sy += sz) {
    const row = Math.floor((py + sy) / sz), off = sz === 16 ? (row % 2 ? 8 : 0) : (hash2(0, row, 3) * 6 | 0);
    for (let sx = -off; sx < TS; sx += sz) {
      const gx = Math.floor((px + sx + off) / sz), id = hash2(gx, row, 21);
      const x0 = Math.max(0, sx), x1 = Math.min(TS, sx + sz), w = x1 - x0, h = sz;
      let col = shade(base, 0.9 + id * 0.2);
      if (biome === 'cave' && id > 0.8) col = mix(col, '#1f5560', 0.35);
      x.fillStyle = col; x.fillRect(px + x0, py + sy, w, h - 1);
      x.fillStyle = shade(col, 1.14); x.fillRect(px + x0, py + sy, w - (sx + sz <= TS ? 1 : 0), 1);      // top bevel
      if (sx >= 0) x.fillRect(px + x0, py + sy, 1, h - 1);                                                 // left bevel
      x.fillStyle = shade(col, 0.74); x.fillRect(px + x0, py + sy + h - 2, w, 1);                          // bottom bevel
      if (sx + sz <= TS) x.fillRect(px + x1 - 1, py + sy + 1, 1, h - 2);                                   // right bevel
      // character: cracks, chips, moss, wet sheen
      const k = hash2(gx, row, 7);
      if (k > 0.9 && w > 5) { // hairline crack with a random direction
        x.fillStyle = shade(col, 0.62); const dir = k > 0.95 ? 1 : -1, len = 3 + (k * 97 | 0) % 4; let cx = px + x0 + 2 + (k * 53 | 0) % Math.max(1, w - 6), cy = py + sy + 2 + (k * 31 | 0) % Math.max(1, h - 6);
        for (let i = 0; i < len; i++) { x.fillRect(cx, cy, 1, 1); cx += dir; if (hash2(gx + i, row, 11) > 0.5) cy++; }
      }
      if (biome === 'forest' && k < 0.3) { x.fillStyle = k < 0.12 ? '#4f8f3a' : '#3a6a2c'; x.fillRect(px + x0, py + sy + h - 4, Math.min(w, 5 + (k * 40 | 0) % 6), 3); x.fillRect(px + x0 + 1, py + sy + h - 5, 2, 1); }
      if (biome === 'cave' && k < 0.18) { x.fillStyle = 'rgba(159,248,240,.35)'; x.fillRect(px + x0 + 2, py + sy + 2, 2, 1); }
      if (biome === 'crypt' && k < 0.05) { x.fillStyle = pal.accent; x.fillRect(px + x0 + 3, py + sy + 3, 2, 2); }
    }
  }
}
function drawWallTile(x, map, tx, ty, px, py, hh) {
  const pal = map.pal, below = tileAt(map, tx, ty + 1), below2 = tileAt(map, tx, ty + 2);
  const isFloorish = v => v !== T.WALL && v !== T.VOID && v !== T.PILLAR;
  if (isFloorish(below) || (below === T.WALL && isFloorish(below2))) {
    // wall face: individually shaded bricks
    const lower = isFloorish(below), wb = lower ? pal.wall : shade(pal.wall, 0.86);
    x.fillStyle = pal.wallLine; x.fillRect(px, py, TS, TS);
    for (let r = 0; r < 4; r++) {
      const off = (r + ty * 4) % 2 ? 4 : 0;
      for (let bx = -off; bx < TS; bx += 8) {
        const x0 = Math.max(0, bx), x1 = Math.min(TS, bx + 8), id = hash2(Math.floor((px + bx + off) / 8), ty * 4 + r, 5);
        const col = shade(wb, 0.88 + id * 0.24);
        x.fillStyle = col; x.fillRect(px + x0, py + r * 4, x1 - x0 - (bx + 8 <= TS ? 1 : 0), 3);
        x.fillStyle = shade(col, 1.2); x.fillRect(px + x0, py + r * 4, x1 - x0 - (bx + 8 <= TS ? 1 : 0), 1);
        if (id > 0.93) { x.fillStyle = shade(col, 0.55); x.fillRect(px + x0 + 2, py + r * 4 + 1, 3, 1); }
      }
    }
    x.fillStyle = shade(pal.wall, 1.35); x.fillRect(px, py, TS, 1);
    if (hh > 0.8) { x.fillStyle = pal.accent; x.fillRect(px + 4 + (hh * 50 | 0) % 6, py + 5, 2, 2); }
    if (lower) { x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(px, py + TS - 2, TS, 2); x.fillStyle = 'rgba(0,0,0,.2)'; x.fillRect(px, py + TS - 4, TS, 2); }
    if (map.biome === 'forest' && hh < 0.35) { x.fillStyle = '#3f6f2a'; const vx = px + (hh * 90 | 0) % 12, vl = 6 + (hh * 20 | 0) % 9; x.fillRect(vx, py, 2, vl); x.fillStyle = '#6fae4f'; x.fillRect(vx - 1, py + vl - 2, 2, 2); x.fillRect(vx + 2, py + 3, 2, 2); }
    if (map.biome === 'cave' && hh < 0.25) { x.fillStyle = '#2a8f99'; x.fillRect(px + 5, py + 8, 4, 5); x.fillStyle = '#3fb7c1'; x.fillRect(px + 6, py + 7, 2, 5); x.fillStyle = '#c9fff8'; x.fillRect(px + 6, py + 7, 1, 2); }
    if (map.biome === 'crypt' && hh > 0.55 && hh < 0.6) { x.fillStyle = '#d8cfb4'; x.fillRect(px + 6, py + 6, 4, 3); x.fillStyle = '#140c1c'; x.fillRect(px + 7, py + 7, 1, 1); x.fillRect(px + 9, py + 7, 1, 1); }
  } else {
    x.fillStyle = pal.wallTop; x.fillRect(px, py, TS, TS);
    if (hh > 0.5) { x.fillStyle = shade(pal.wallTop, 1.15); x.fillRect(px + (hh * 37 | 0) % 12, py + (hh * 71 | 0) % 12, 3, 2); }
    x.fillStyle = shade(pal.wallTop, 1.6);
    const fl = v => v !== T.WALL && v !== T.VOID;
    if (fl(tileAt(map, tx - 1, ty))) x.fillRect(px, py, 2, TS);
    if (fl(tileAt(map, tx + 1, ty))) x.fillRect(px + TS - 2, py, 2, TS);
    if (fl(tileAt(map, tx, ty - 1))) x.fillRect(px, py, TS, 2);
  }
}
function drawPillar(x, px, py, pal, biome) {
  x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(px + 8, py + 13, 10, 4, 0, 0, TAU); x.fill();
  if (biome === 'forest') { // mossy stump with rings and roots
    x.fillStyle = '#33261a'; x.fillRect(px - 1, py + 9, 4, 4); x.fillRect(px + 13, py + 9, 4, 4);
    x.fillStyle = '#5a4028'; x.fillRect(px + 1, py - 3, 14, 15); x.fillStyle = '#3a2a1a'; x.fillRect(px + 12, py - 3, 3, 15); x.fillStyle = '#7a5a38'; x.fillRect(px + 2, py - 3, 2, 15);
    for (let i = 0; i < 3; i++) { x.fillStyle = '#4a3420'; x.fillRect(px + 5 + i * 3, py, 1, 11); }
    x.fillStyle = '#8a6a44'; x.beginPath(); x.ellipse(px + 8, py - 4, 7, 3, 0, 0, TAU); x.fill();
    x.strokeStyle = '#6a4a2a'; x.lineWidth = 1; x.beginPath(); x.ellipse(px + 8, py - 4, 4, 1.6, 0, 0, TAU); x.stroke();
    x.fillStyle = '#4f8f3a'; x.fillRect(px + 1, py + 6, 5, 3); x.fillStyle = '#6fae4f'; x.fillRect(px + 2, py + 6, 2, 1);
    return;
  }
  const w = pal.wall, wl = shade(w, 1.3), wd = shade(w, 0.7);
  x.fillStyle = w; x.fillRect(px + 2, py - 7, 12, 19);                       // shaft
  for (let i = 0; i < 3; i++) { x.fillStyle = wd; x.fillRect(px + 4 + i * 3, py - 6, 1, 17); x.fillStyle = wl; x.fillRect(px + 5 + i * 3, py - 6, 1, 17); }
  x.fillStyle = wd; x.fillRect(px + 12, py - 7, 2, 19);
  x.fillStyle = wl; x.fillRect(px, py - 11, 16, 4); x.fillStyle = shade(w, 1.5); x.fillRect(px, py - 11, 16, 1); x.fillStyle = wd; x.fillRect(px, py - 8, 16, 1); // capital
  x.fillStyle = w; x.fillRect(px, py + 10, 16, 4); x.fillStyle = wl; x.fillRect(px, py + 10, 16, 1); x.fillStyle = INK; x.fillRect(px, py + 13, 16, 1); // base
  if (biome === 'cave') { x.fillStyle = '#3fb7c1'; x.fillRect(px + 3, py - 14, 3, 4); x.fillStyle = '#9ff8f0'; x.fillRect(px + 3, py - 14, 1, 2); }
  else { x.fillStyle = pal.accent; x.fillRect(px + 7, py - 2, 2, 3); }
}function drawVillageTile(x, v, tx, ty, px, py, hh, map) {
  if (v === T.SOLID) { // props sit on whatever ground surrounds them
    const n = [tileAt(map, tx - 1, ty), tileAt(map, tx + 1, ty), tileAt(map, tx, ty - 1), tileAt(map, tx, ty + 1)];
    const cnt = t => n.filter(k => k === t).length;
    v = cnt(T.COBBLE) >= 2 ? T.COBBLE : cnt(T.PATH) >= 2 ? T.PATH : T.GRASS;
    if (v === T.COBBLE && dist(tx + 0.5, ty + 0.5, 30, 23) < 3) v = T.COBBLE;
  }
  const grass = hh < 0.5 ? '#1e3a30' : '#213f33';
  x.fillStyle = grass; x.fillRect(px, py, TS, TS);
  if (v === T.GRASS || v === T.TREE || v === T.SOLID || v === T.BLDG) {
    if (hh > 0.55) { x.fillStyle = '#2a5040'; for (let i = 0; i < 3; i++) x.fillRect(px + ((hh * (i + 3) * 37) | 0) % 14, py + ((hh * (i + 5) * 53) | 0) % 12, 1, 3); }
    if (hh < 0.06) { x.fillStyle = pick2(hh, ['#d84a7a', '#ffd34a', '#c9a6ff']); x.fillRect(px + 6, py + 7, 2, 2); x.fillStyle = '#fff2c0'; x.fillRect(px + 6, py + 7, 1, 1); }
  }
  if (v === T.PATH) {
    x.fillStyle = '#4a3a2a'; x.fillRect(px, py, TS, TS);
    x.fillStyle = '#56442f'; if (hh > 0.4) x.fillRect(px + (hh * 77 | 0) % 12, py + (hh * 31 | 0) % 12, 3, 2);
    x.fillStyle = '#3a2c20'; if (hh < 0.3) x.fillRect(px + 3, py + 10, 2, 1);
    // soft grass edge
    const g = (a, b) => { const n = tileAt(map, tx + a, ty + b); return n === T.GRASS || n === T.TREE; };
    x.fillStyle = '#2a4034';
    if (g(0, -1)) x.fillRect(px, py, TS, 2); if (g(0, 1)) x.fillRect(px, py + TS - 2, TS, 2); if (g(-1, 0)) x.fillRect(px, py, 2, TS); if (g(1, 0)) x.fillRect(px + TS - 2, py, 2, TS);
  }
  if (v === T.COBBLE) {
    x.fillStyle = '#4a4458'; x.fillRect(px, py, TS, TS);
    x.fillStyle = '#3a3448';
    x.fillRect(px, py + 7, TS, 1); x.fillRect(px, py + 15, TS, 1); x.fillRect(px + (ty % 2 ? 4 : 11), py, 1, 7); x.fillRect(px + (ty % 2 ? 11 : 4), py + 8, 1, 7);
    x.fillStyle = '#5a546a'; x.fillRect(px + 1, py + 1, 2, 1); x.fillRect(px + 6, py + 9, 2, 1);
  }
}
function pick2(h, arr) { return arr[Math.floor(h * 1000) % arr.length]; }
function drawTreeTrunk(x, tr) { x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(tr.x, tr.y, 11, 4, 0, 0, TAU); x.fill(); x.fillStyle = '#3a2618'; x.fillRect(tr.x - 3, tr.y - 12, 6, 12); x.fillStyle = '#2a1a10'; x.fillRect(tr.x + 1, tr.y - 12, 2, 12); }

// procedural buildings: facade on the ground layer, roof on the overhead layer
function drawVillageBuildings(x, ox, map) {
  for (const b of map.buildings) {
    const px = b.x * TS, py = b.y * TS, w = b.w * TS, h = b.h * TS;
    if (!b.built) {
      x.fillStyle = '#2e2a22'; x.fillRect(px, py, w, h);
      x.fillStyle = '#3a3428'; for (let i = 0; i < b.w; i++) x.fillRect(px + i * TS + 2, py + 2, TS - 4, h - 4);
      for (let i = 0; i < Math.max(1, Math.floor(b.w / 4)); i++) drawSpr(x, SPR.scaffold, 0, px + 24 + i * 40, py + h - 2);
      x.fillStyle = '#7a5a34'; x.fillRect(px + 4, py + h - 10, w - 8, 3);
      continue;
    }
    const st = b.style;
    const wallC = st === 'forge' ? '#4a4048' : st === 'tower' ? '#3c3456' : st === 'tavern' ? '#6a4a30' : st === 'shop' ? '#5a4030' : '#5a4636';
    const roofC = st === 'forge' ? '#3a2a2a' : st === 'tower' ? '#3a1d5a' : st === 'tavern' ? '#7a2a2a' : st === 'shop' ? '#2a4a5a' : '#2f3f5a';
    // facade
    x.fillStyle = 'rgba(0,0,0,.4)'; x.fillRect(px - 2, py + h - 2, w + 4, 6);
    x.fillStyle = wallC; x.fillRect(px, py, w, h);
    x.fillStyle = shade(wallC, 0.8);
    if (st === 'forge' || st === 'tower') { for (let r = 0; r < h / 6; r++) { x.fillRect(px, py + r * 6 + 5, w, 1); for (let k = 0; k < w / 10; k++) x.fillRect(px + k * 10 + (r % 2 ? 5 : 0), py + r * 6, 1, 5); } }
    else { for (let k = 0; k < w; k += 6) x.fillRect(px + k, py, 1, h); x.fillStyle = '#3a2618'; x.fillRect(px, py + 2, w, 3); x.fillRect(px, py + h - 4, w, 4); for (let k = 0; k <= w; k += Math.floor(w / 3)) x.fillRect(px + Math.min(k, w - 3), py, 3, h); }
    // door
    const dx = px + Math.floor(w / 2) - 8;
    x.fillStyle = '#2a1a10'; x.fillRect(dx, py + h - 26, 16, 26); x.fillStyle = '#5a3a20'; x.fillRect(dx + 2, py + h - 24, 12, 24); x.fillStyle = '#3a2614'; x.fillRect(dx + 7, py + h - 24, 1, 24); x.fillStyle = '#f0b752'; x.fillRect(dx + 11, py + h - 12, 2, 2);
    // windows
    for (const wx of [px + 10, px + w - 24]) {
      if (Math.abs(wx - dx) < 18) continue;
      x.fillStyle = '#2a1a10'; x.fillRect(wx - 1, py + h - 25, 16, 13); x.fillStyle = '#ffb35a'; x.fillRect(wx + 1, py + h - 23, 12, 9); x.fillStyle = '#ffe0a0'; x.fillRect(wx + 1, py + h - 23, 5, 4); x.fillStyle = '#2a1a10'; x.fillRect(wx + 6, py + h - 23, 2, 9); x.fillRect(wx + 1, py + h - 19, 12, 1);
    }
    // signs
    if (st === 'forge') { x.fillStyle = '#ff7a2a'; x.fillRect(px + 6, py + h - 14, 18, 8); x.fillStyle = '#ffd76a'; x.fillRect(px + 9, py + h - 12, 12, 3); }
    // roof (overhead layer, extends above the footprint)
    const rh = st === 'tower' ? 64 : 34, ry = py - rh + 8;
    ox.fillStyle = INK; ox.fillRect(px - 5, ry - 1, w + 10, rh + 2);
    if (st === 'tower') {
      ox.fillStyle = wallC; ox.fillRect(px + 8, ry + 14, w - 16, rh - 6);
      ox.fillStyle = '#ffb35a'; ox.fillRect(px + w / 2 - 4, ry + 26, 8, 10);
      ox.fillStyle = roofC; for (let i = 0; i < 16; i++) ox.fillRect(px + w / 2 - 2 - i * 2.6, ry - 16 + i * 2, 4 + i * 5.2, 2);
      ox.fillStyle = INK; ox.fillRect(px - 5, ry - 1, 0, 0);
      ox.fillStyle = '#c9a6ff'; ox.fillRect(px + w / 2 - 1, ry - 22, 3, 6);
    } else {
      for (let r = 0; r < rh; r += 4) { ox.fillStyle = r % 8 ? roofC : shade(roofC, 1.18); ox.fillRect(px - 4, ry + r, w + 8, 4); }
      ox.fillStyle = shade(roofC, 0.6); for (let k = 0; k < w + 8; k += 7) ox.fillRect(px - 4 + k, ry, 1, rh);
      ox.fillStyle = shade(roofC, 1.4); ox.fillRect(px - 4, ry, w + 8, 2);
      ox.fillStyle = shade(roofC, 0.5); ox.fillRect(px - 4, ry + rh - 3, w + 8, 3);
      // chimney
      ox.fillStyle = '#4a4048'; ox.fillRect(px + w - 22, ry - 10, 9, 14); ox.fillStyle = '#5a5058'; ox.fillRect(px + w - 23, ry - 12, 11, 3);
      if (st === 'tavern') { ox.fillStyle = '#f0b752'; ox.fillRect(px + 10, ry + rh - 1, 30, 10); ox.fillStyle = '#5a2a1a'; ox.font = '7px monospace'; }
    }
  }
}

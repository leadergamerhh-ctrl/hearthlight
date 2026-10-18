// ============================================================================
//  Global state, input, player profile + the local player controller
// ============================================================================
const G = {
  scene: 'title', world: null, me: null, P: null, slot: 0, time: 0, rt: 0,
  paused: false, menu: null, chatting: false, settings: null,
  cam: { x: 0, y: 0, tx: 0, ty: 0, shake: 0, zoom: 1 },
  hitstop: 0, slowmo: 0, flashScreen: 0, hurtFlash: 0,
  fx: { parts: [], nums: [], slashes: [], rings: [], decals: [], pings: [], bubbles: [], corpses: [] },
};

// ---------------------------------------------------------------------------
//  Input (actions are buffered so presses are never lost between ticks)
// ---------------------------------------------------------------------------
const Input = {
  keys: {}, buf: {}, mx: 0, my: 0, wx: 0, wy: 0, mouse: [false, false, false], kbAimT: -99, moved: false,
  init(cv) {
    const map = (e) => {
      const k = e.code;
      if (k === 'KeyJ') return 'light'; if (k === 'KeyK') return 'heavy'; if (k === 'Space') return 'roll';
      if (k === 'KeyQ') return 'potion'; if (k === 'KeyE') return 'interact';
      if (/^Digit[1-6]$/.test(k)) return 'card' + (Number(k.slice(5)) - 1);
      return null;
    };
    window.addEventListener('keydown', (e) => {
      if (G.chatting) return;
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) { this.keys[e.code] = true; return; }
      this.keys[e.code] = true;
      const a = map(e); if (a) { this.buf[a] = nowSec(); if (a === 'light' || a === 'heavy') this.kbAimT = nowSec(); }
      if (e.code === 'KeyL' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.buf.block = nowSec();
      onKeyCommand(e);
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.mouse = [false, false, false]; });
    cv.addEventListener('mousemove', (e) => { this.mx = e.clientX; this.my = e.clientY; this.moved = true; this.kbAimT = -99; this.mouseT = nowSec(); });
    cv.addEventListener('mousedown', (e) => {
      SFX.init();
      this.mouse[e.button] = true;
      if (G.cutscene) { Story.advance(); return; }
      if (G.scene === 'title' || G.menu || G.paused) return;
      if (e.button === 0) this.buf.light = nowSec();
      if (e.button === 2) this.buf.heavy = nowSec();
    });
    window.addEventListener('mouseup', (e) => { this.mouse[e.button] = false; });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointerdown', () => SFX.init(), { once: false });
  },
  // gamepad (standard mapping): left stick move, right stick aim, X light, Y heavy, A roll,
  // B interact, RB block, LB flask, d-pad cards 1-4, LT/RT cards 5-6, Start menu, Back map
  pad: null, padPrev: [], padMove: [0, 0], padAim: null, padAimT: -99,
  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find(p => p && p.connected); this.pad = gp || null;
    if (!gp) { this.padMove = [0, 0]; return; }
    // menus, dialogue and the title screen get focus navigation instead of gameplay input
    if (typeof PadNav !== 'undefined' && PadNav.active()) {
      SFX.init(); PadNav.update(gp); this.padPrev = PadNav.prev.slice();
      this.padMove = [0, 0]; this.padBlock = false; this.padUsedT = nowSec(); return;
    }
    const dz = (v) => Math.abs(v) < 0.22 ? 0 : v;
    let mx = dz(gp.axes[0] || 0), my = dz(gp.axes[1] || 0);
    const l = Math.hypot(mx, my); this.padMove = l > 0 ? [mx / Math.max(1, l), my / Math.max(1, l)] : [0, 0];
    const ax = gp.axes[2] || 0, ay = gp.axes[3] || 0;
    if (Math.hypot(ax, ay) > 0.35) { this.padAim = Math.atan2(ay, ax); this.padAimT = nowSec(); }
    if (l > 0 || this.padAimT === nowSec() || gp.buttons.some(b => b.pressed)) this.padUsedT = nowSec();
    const map = { 2: 'light', 3: 'heavy', 0: 'roll', 1: 'interact', 4: 'potion', 12: 'card0', 15: 'card1', 13: 'card2', 14: 'card3', 6: 'card4', 7: 'card5' };
    gp.buttons.forEach((b, i) => {
      const down = b.pressed || b.value > 0.5, was = this.padPrev[i];
      if (down && !was) {
        SFX.init();
        if (map[i] && !G.menu) this.buf[map[i]] = nowSec();
        if (i === 9) { if (G.menu) closeMenu(); else if (G.scene !== 'title') openPause('inv'); }
        if (i === 8 && G.scene !== 'title') { if (G.menu) closeMenu(); else openPause('map'); }
        if (i === 5) this.buf.block = nowSec();
      }
      this.padPrev[i] = down;
    });
    this.padBlock = !!(gp.buttons[5] && gp.buttons[5].pressed);
    if (typeof PadNav !== 'undefined') PadNav.prev = this.padPrev.slice();
  },
  // controller rumble, only while the pad is the device in use
  rumble(strong, weak, ms) {
    const gp = this.pad; if (!gp || nowSec() - (this.padUsedT || -99) > 8 || (G.settings && G.settings.rumble === false)) return;
    const va = gp.vibrationActuator; if (!va || !va.playEffect) return;
    try { va.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }); } catch (e) { }
  },
  take(a, win = 0.16) { const t = this.buf[a]; if (t && nowSec() - t <= win) { this.buf[a] = 0; return true; } return false; },
  peek(a, win = 0.16) { const t = this.buf[a]; return t && nowSec() - t <= win; },
  down(...codes) { return codes.some(c => this.keys[c]); },
  moveVec() {
    let x = 0, y = 0;
    if (this.down('KeyA', 'ArrowLeft')) x--; if (this.down('KeyD', 'ArrowRight')) x++;
    if (this.down('KeyW', 'ArrowUp')) y--; if (this.down('KeyS', 'ArrowDown')) y++;
    const l = Math.hypot(x, y); if (l) return [x / l, y / l];
    return this.padMove;
  },
  blocking() { return this.down('ShiftLeft', 'ShiftRight', 'KeyL') || !!this.padBlock; },
};

// ---------------------------------------------------------------------------
//  Profile (the saved character) and derived stats
// ---------------------------------------------------------------------------
function newProfile(name, color) {
  const P = {
    v: 1, name: name || 'Wanderer', color: color || PLAYER_COLORS[0], level: 1, xp: 0, pts: 0,
    attr: { vit: 0, end: 0, str: 0, mag: 0 }, gold: 60,
    mats: { iron: 3, bone: 0, wood: 0, pearl: 0, ember: 0 },
    inv: [], stash: [], equip: { weapon: null, armor: null, trinket: null },
    cards: { owned: STARTER_CARDS.slice(), loadout: STARTER_CARDS.slice() },
    potions: 3, maxPotions: 3, potionLvl: 0,
    quests: { active: [], progress: {}, claimedDaily: {} },
    ach: {}, flags: { clears: {}, tiers: { crypt: 0 }, seenIntro: false },
    stats: { kills: 0, epics: 0, maxUpg: 0, deaths: 0, bounties: 0, parry: 0, revives: 0, coopClears: 0, nightmare: 0, playtime: 0, runs: 0 },
    shopSeed: 1, created: Date.now(), story: { on: true, seen: {}, lore: [] },
  };
  P.equip.weapon = genItem(1, { slot: 'weapon', type: 'sword', rarity: 'common' }); P.equip.weapon.name = 'Traveler\'s Sword';
  P.equip.armor = genItem(1, { slot: 'armor', type: 'leather', rarity: 'common' }); P.equip.armor.name = 'Worn Leathers';
  return P;
}
function computeStats(P) {
  const s = { hp: 0, sta: 0, mana: 0, armor: 0, dmg: 0, crit: 0, critDmg: 0, staRegen: 0, cdr: 0, speed: 0, leech: 0, magic: 0 };
  let wdmg = 6, wtype = 'sword';
  for (const slot of ['weapon', 'armor', 'trinket']) {
    const it = P.equip[slot]; if (!it) continue;
    const st = itemStats(it);
    for (const k in st) s[k] = (s[k] || 0) + st[k];
    if (slot === 'weapon') { wdmg = st.atk || 6; wtype = it.type; }
  }
  const A = P.attr, W = WEAPONS[wtype];
  return {
    maxHp: Math.round(100 + A.vit * 12 + (P.level - 1) * 4 + s.hp),
    maxSta: Math.round(100 + A.end * 8 + s.sta),
    staRegen: 52 * (1 + A.end * 0.015 + s.staRegen / 100),
    maxMana: Math.round(50 + A.mag * 6 + s.mana),
    manaRegen: 2.2 + A.mag * 0.18,
    dmgMul: 1 + A.str * 0.05 + s.dmg / 100,
    magMul: 1 + A.mag * 0.06 + s.magic / 100,
    armor: s.armor, dr: s.armor / (s.armor + 60),
    crit: W.crit + s.crit / 100, critDmg: 1.75 + s.critDmg / 100,
    cdr: Math.min(0.4, s.cdr / 100), speed: 1 + s.speed / 100, leech: s.leech / 100,
    wdmg, wtype,
  };
}

// ---------------------------------------------------------------------------
//  Player entity
// ---------------------------------------------------------------------------
function makePlayer(pid, name, color, stats) {
  return {
    type: 'player', pid, name, color, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, kx: 0, ky: 0, r: 5,
    hp: stats ? stats.maxHp : 100, maxHp: stats ? stats.maxHp : 100, sta: stats ? stats.maxSta : 100, mana: stats ? stats.maxMana : 50,
    stats, face: 0, aim: 0, state: 'idle', st: 0, combo: 0, comboT: 0, hitSet: null, iframe: 0, staDelay: 0, exhausted: false,
    flash: 0, hitstop: 0, cds: {}, shield: 0, shieldT: 0, buffs: {}, blockT: 0, walkT: 0, downed: false, dead: false, downT: 0,
    reviveP: 0, lvl: 1, wtype: 'sword', castT: 0, emote: null, spin: 0, spinT: 0, blades: 0, bladesT: 0, moving: false, alpha: 1,
  };
}
const ROLL_DUR = 0.34, ROLL_IFRAME = 0.27, ROLL_COST = 20, ROLL_SPEED = 255;
const BLEEDOUT = 30, REVIVE_TIME = 2.6, REVIVE_RANGE = 24;

function attackTiming(p, heavy, combo) {
  const W = WEAPONS[p.wtype] || WEAPONS.sword, s = W.speed;
  if (heavy) return { wind: 0.30 / s, act: 0.11, rec: 0.32 / s };
  if (combo === 2) return { wind: 0.10 / s, act: 0.10, rec: 0.30 / s };
  return { wind: 0.06 / s, act: 0.085, rec: 0.19 / s };
}
function canAct(p) { return p.state === 'idle' || p.state === 'move'; }
function spend(p, amt) {
  if (p.sta <= 0) { if (!p._exT || G.time - p._exT > 0.6) { SFX.play('exhausted', 0.7); p._exT = G.time; flashStaminaBar(); } return false; }
  p.sta -= amt; p.staDelay = 0.5; if (p.sta < 0) { p.sta = 0; p.staDelay = 1.0; }
  return true;
}
function aimAngle(p) {
  if (Input.pad && (Input.padUsedT || 0) > (Input.mouseT || 0)) return nowSec() - Input.padAimT < 0.6 ? Input.padAim : p.face;
  if (nowSec() - Input.kbAimT < 1.5 || !Input.moved) return p.face;
  return angTo(p.x, p.y - 6, Input.wx, Input.wy);
}

// The local player's fixed-step update (prediction: runs instantly on this client)
function updateLocalPlayer(p, w, dt) {
  const S = p.stats;
  p.px = p.x; p.py = p.y;
  if (p.hitstop > 0) { p.hitstop -= dt; return; }
  p.st += dt; p.iframe = Math.max(0, p.iframe - dt); p.flash = Math.max(0, p.flash - dt);
  for (const k in p.cds) if (p.cds[k] > 0) p.cds[k] -= dt * (1 + S.cdr * 0);
  for (const k in p.buffs) { p.buffs[k] -= dt; if (p.buffs[k] <= 0) delete p.buffs[k]; }
  if (p.shieldT > 0) { p.shieldT -= dt; if (p.shieldT <= 0) p.shield = 0; }
  // regen
  if (p.staDelay > 0) p.staDelay -= dt;
  else if (p.state !== 'roll' && p.state !== 'attack' && p.state !== 'heavy') p.sta = Math.min(S.maxSta, p.sta + S.staRegen * (p.state === 'block' ? 0.35 : 1) * (p.buffs.warcry ? 1.5 : 1) * dt);
  p.mana = Math.min(S.maxMana, p.mana + S.manaRegen * dt);
  p.maxHp = S.maxHp;
  if (p.regenT > 0) { p.regenT -= dt; p.hp = Math.min(p.maxHp, p.hp + p.regenAmt * dt); }

  if (p.dead) { p.state = 'dead'; return; }
  if (p.downed) { updateDowned(p, w, dt); return; }

  const [mx, my] = (G.menu || G.chatting || G.cutscene) ? [0, 0] : Input.moveVec();
  const moving = mx || my;
  if (moving && (p.state === 'idle' || p.state === 'move')) p.face = Math.atan2(my, mx);
  p.aim = (G.menu || G.chatting || G.cutscene) ? p.aim : aimAngle(p);
  let spd = 92 * S.speed * (p.buffs.haste ? 1.2 : 1);
  if (w.map && tileAt(w.map, Math.floor(p.x / TS), Math.floor(p.y / TS)) === T.WATER) spd *= 0.7;
  let tvx = mx * spd, tvy = my * spd, ctrl = 22;
  const W = WEAPONS[p.wtype] || WEAPONS.sword;

  // ---- state machine ----
  switch (p.state) {
    case 'idle': case 'move':
      p.state = moving ? 'move' : 'idle';
      if (moving) {
        p.walkT += dt * 9;
        if (Math.floor(p.walkT / Math.PI) !== Math.floor((p.walkT - dt * 9) / Math.PI)) {
          const wet = w.map && tileAt(w.map, Math.floor(p.x / TS), Math.floor(p.y / TS)) === T.WATER;
          if (wet) { sfxAt('splash', p.x, p.y, 0.25, 1.6); for (let i = 0; i < 4; i++) G.fx.parts.push(part(p.x + rnd(-3, 3), p.y, rnd(-25, 25), rnd(-50, -20), pick(['#9ff8f0', '#ffffff']), 0.35, 1, false, 260)); }
          else sfxAt('step', p.x, p.y, 0.6);
        }
      }
      break;
    case 'attack': case 'heavy': {
      const tm = p.tm;
      tvx *= 0.12; tvy *= 0.12; ctrl = 8;
      if (p.st < tm.wind) {
        const want = p.assist && !p.assist.dead && w.ents.has(p.assist.id) ? angTo(p.x, p.y - 5, p.assist.x, p.assist.y - 4) : p.aim;
        p.atkAng = rotToward(p.atkAng, want, 14 * dt); p.face = p.atkAng;
      }
      if (p.st >= tm.wind && !p.swung) {
        p.swung = true; doSwing(p, w, p.state === 'heavy');
      }
      if (p.st >= tm.wind && p.st < tm.wind + tm.act) meleeHits(p, w, p.state === 'heavy');
      const done = tm.wind + tm.act + tm.rec;
      const cancelable = p.st >= tm.wind + tm.act;
      if (cancelable) {
        if (p.state === 'attack' && p.combo < 2 && Input.peek('light', 0.25) && p.st >= tm.wind + tm.act + 0.02) { Input.take('light', 1); startAttack(p, false, p.combo + 1); break; }
        if (Input.peek('roll')) { tryRoll(p, mx, my); break; }
        if (Input.blocking() && p.st > tm.wind + tm.act + 0.05) { startBlock(p); break; }
        if (tryCards(p, w)) break;
      }
      if (p.st >= done) { p.state = 'idle'; p.st = 0; p.comboT = 0.25; }
      break;
    }
    case 'roll': {
      const u = clamp(p.st / ROLL_DUR, 0, 1);
      const sp = ROLL_SPEED * Math.pow(1 - u, 0.65) * (p.buffs.haste ? 1.15 : 1);
      tvx = Math.cos(p.rollAng) * sp; tvy = Math.sin(p.rollAng) * sp; ctrl = 60;
      if (p.st < 0.18 && moving) p.rollAng = rotToward(p.rollAng, Math.atan2(my, mx), 6 * dt);
      if (Math.random() < 0.6) spawnDust(p.x, p.y, 1);
      if (p.st >= ROLL_DUR) { p.state = 'idle'; p.st = 0; }
      else if (p.st >= ROLL_DUR - 0.07) { // allow buffered follow-ups at the tail of the roll
        if (Input.peek('light')) { Input.take('light'); p.state = 'idle'; startAttack(p, false, 0, true); }
        else if (Input.peek('heavy')) { Input.take('heavy'); p.state = 'idle'; startAttack(p, true, 0); }
      }
      break;
    }
    case 'block':
      tvx *= 0.45; tvy *= 0.45;
      p.aim = aimAngle(p); p.face = p.aim;
      if (!Input.blocking()) { p.state = 'idle'; p.st = 0; }
      break;
    case 'cast':
      tvx *= 0.35; tvy *= 0.35;
      if (p.st >= (p.castDur || 0.18)) { p.state = 'idle'; p.st = 0; }
      break;
    case 'drink':
      tvx *= 0.4; tvy *= 0.4;
      if (p.st >= 0.45 && !p.drank) { p.drank = true; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.35); p.regenT = 3; p.regenAmt = p.maxHp * 0.04; spawnHealFx(p.x, p.y); SFX.play('heal', 0.8); }
      if (p.st >= 0.65) { p.state = 'idle'; p.st = 0; }
      break;
    case 'hurt':
      tvx = 0; tvy = 0; ctrl = 4;
      if (p.st >= p.hurtDur) { p.state = 'idle'; p.st = 0; }
      break;
    case 'whirl':
      tvx *= 0.75; tvy *= 0.75;
      break;
  }
  // whirlwind runs alongside other states
  if (p.spinT > 0) {
    p.spinT -= dt; p.spin += dt * 22;
    if ((p.spinTick = (p.spinTick || 0) - dt) <= 0) { p.spinTick = 0.18; areaHit(p, w, p.x, p.y - 4, 30, CARDS.whirlwind.dmg * S.magMul * 0.6 + S.wdmg * S.dmgMul * 0.6, { kb: 90, poise: 6, src: 'whirl' }); SFX.play('swing', 0.6, 1.3); }
  }
  if (p.bladesT > 0) {
    p.bladesT -= dt; p.blades += dt * 5;
    if ((p.bladeTick = (p.bladeTick || 0) - dt) <= 0) {
      p.bladeTick = 0.2;
      for (let i = 0; i < 3; i++) { const a = p.blades + i * TAU / 3; areaHit(p, w, p.x + Math.cos(a) * 26, p.y - 4 + Math.sin(a) * 26, 12, CARDS.spiritblades.dmg * S.magMul, { kb: 30, poise: 2, src: 'blade' + i, magic: true }); }
    }
  }
  // ---- start new actions from idle/move ----
  if (canAct(p) && !G.menu && !G.chatting && !G.cutscene) {
    if (Input.peek('roll')) tryRoll(p, mx, my);
    else if (Input.take('light')) startAttack(p, false, p.comboT > 0 ? (p.combo + 1) % 3 : 0);
    else if (Input.take('heavy')) startAttack(p, true, 0);
    else if (Input.blocking()) startBlock(p);
    else if (Input.take('potion')) drinkPotion(p);
    else tryCards(p, w);
  }
  if (p.comboT > 0) { p.comboT -= dt; if (p.comboT <= 0) p.combo = 0; }
  if ((p.state === 'attack' || p.state === 'heavy') && p.atkAng != null) p.aim = p.atkAng; // render + network the real swing direction

  // ---- integrate ----
  const k = 1 - Math.exp(-ctrl * dt);
  p.vx += (tvx - p.vx) * k; p.vy += (tvy - p.vy) * k;
  p.kx *= Math.exp(-10 * dt); p.ky *= Math.exp(-10 * dt);
  moveEntity(w.map, p, (p.vx + p.kx) * dt, (p.vy + p.ky) * dt, p.r);
  p.moving = Math.hypot(p.vx, p.vy) > 10;
  localHazardChecks(p, w, dt);
}
function tryRoll(p, mx, my) {
  if (p.state === 'roll' || p.state === 'hurt') return false;
  Input.take('roll');
  if (!spend(p, ROLL_COST)) return false;
  p.state = 'roll'; p.st = 0; p.rollAng = (mx || my) ? Math.atan2(my, mx) : p.aim; p.iframe = Math.max(p.iframe, ROLL_IFRAME);
  if (mx || my) p.face = p.rollAng;
  SFX.play('roll', 0.8); spawnDust(p.x, p.y, 5);
  netFx({ t: 'roll', pid: p.pid });
  return true;
}
function startAttack(p, heavy, combo, fromRoll) {
  const W = WEAPONS[p.wtype] || WEAPONS.sword;
  const cost = heavy ? W.sta * 2.2 : W.sta * (combo === 2 ? 1.3 : 1);
  if (!spend(p, cost)) return;
  p.state = heavy ? 'heavy' : 'attack'; p.st = 0; p.combo = combo; p.swung = false; p.hitSet = new Set();
  p.assist = assistTarget(p, G.world, p.aim, W.range + (heavy ? 34 : 26));
  p.atkAng = p.assist ? angTo(p.x, p.y - 5, p.assist.x, p.assist.y - 4) : p.aim; p.face = p.atkAng; p.tm = attackTiming(p, heavy, combo);
  if (fromRoll) p.tm = { ...p.tm, wind: p.tm.wind * 0.5 };
  if (heavy) { p.hyper = true; SFX.play('glint', 0.4); }
}
// melee aim assist: if an enemy sits close to where you're aiming, the swing turns to meet it
function assistTarget(p, w, aim, range) {
  if (!w || !w.ents) return null;
  let best = null, bs = 1e9;
  for (const e of w.ents.values()) {
    if (e.type !== 'enemy' || e.dead || e.state === 'spawn' || e.hidden) continue;
    const d = dist(p.x, p.y - 5, e.x, e.y - 4) - e.r; if (d > range) continue;
    const da = Math.abs(angDiff(aim, angTo(p.x, p.y - 5, e.x, e.y - 4))); if (da > 0.75) continue;
    const s = da * 40 + d; if (s < bs) { bs = s; best = e; }
  }
  return best;
}
function startBlock(p) { p.state = 'block'; p.st = 0; p.blockT = G.time; Input.take('block', 1); }
function drinkPotion(p) {
  if (G.P.potions <= 0) { toast('No potions left — they refill in the village'); SFX.play('exhausted'); return; }
  G.P.potions--; p.state = 'drink'; p.st = 0; p.drank = false; SFX.play('potion', 0.7);
}
function doSwing(p, w, heavy) {
  const W = WEAPONS[p.wtype] || WEAPONS.sword;
  const lunge = (heavy ? W.lunge * 1.6 : W.lunge * (p.combo === 2 ? 1.4 : 1));
  p.kx += Math.cos(p.atkAng) * lunge; p.ky += Math.sin(p.atkAng) * lunge;
  SFX.play(heavy ? 'swingHeavy' : 'swing', 0.8, heavy ? 0.8 : 1 + p.combo * 0.08);
  const fx = { t: 'slash', pid: p.pid, x: p.x, y: p.y - 11, a: p.atkAng, w: p.wtype, h: heavy ? 1 : 0, c: p.combo };
  spawnSlash(fx); netFx(fx);
}
// melee hit detection against enemies + pots (local, then reported to host)
function meleeHits(p, w, heavy) {
  const W = WEAPONS[p.wtype] || WEAPONS.sword, S = p.stats;
  const range = W.range * (heavy ? 1.2 : 1) + (p.combo === 2 ? 3 : 0), arc = W.arc * (heavy ? 1.15 : 1);
  const cx = p.x, cy = p.y - 5;
  for (const e of w.ents.values()) {
    if (e.type !== 'enemy' || e.dead || e.state === 'spawn' || p.hitSet.has(e.id) || e.hidden) continue;
    const d = dist(cx, cy, e.x, e.y - (e.boss ? 16 : 4)) - e.r;
    if (d > range) continue;
    const a = angTo(cx, cy, e.x, e.y - 4);
    if (Math.abs(angDiff(p.atkAng, a)) > arc / 2 && d > 6) continue;
    p.hitSet.add(e.id);
    let dmg = S.wdmg * S.dmgMul * (heavy ? W.heavyMul : p.combo === 2 ? 1.5 : 1) * (p.buffs.warcry ? 1.3 : 1);
    const crit = Math.random() < S.crit; if (crit) dmg *= S.critDmg;
    dmg *= rnd(0.92, 1.08);
    dealHit(p, w, e, { dmg, a, kb: heavy ? 230 : p.combo === 2 ? 160 : 70, poise: heavy ? dmg * 2.5 : dmg * (p.combo === 2 ? 1.2 : 0.7), crit, heavy, melee: true });
  }
  // pots
  if (w.map && w.map.pots) for (const pot of w.map.pots) {
    if (pot.broken || p.hitSet.has('pot' + pot.i)) continue;
    if (dist(cx, cy, pot.x, pot.y - 4) > range + 4) continue;
    if (Math.abs(angDiff(p.atkAng, angTo(cx, cy, pot.x, pot.y - 4))) > arc / 2) continue;
    p.hitSet.add('pot' + pot.i); hitPot(pot.i);
  }
}
// generic local area damage (cards, whirlwind, etc.)
function areaHit(p, w, x, y, r, dmg, o = {}) {
  let n = 0;
  for (const e of w.ents.values()) {
    if (e.type !== 'enemy' || e.dead || e.state === 'spawn' || e.hidden) continue;
    if (dist(x, y, e.x, e.y - 4) > r + e.r) continue;
    if (o.once) { if (o.once.has(e.id)) continue; o.once.add(e.id); }
    const crit = Math.random() < p.stats.crit * 0.5;
    dealHit(p, w, e, { dmg: dmg * (crit ? p.stats.critDmg : 1) * rnd(0.92, 1.08) * (p.buffs.warcry ? 1.3 : 1), a: angTo(x, y, e.x, e.y), kb: o.kb || 0, poise: o.poise || dmg * 0.5, crit, magic: o.magic !== false, status: o.status, statusT: o.statusT });
    n++;
  }
  if (w.map && w.map.pots) for (const pot of w.map.pots) if (!pot.broken && dist(x, y, pot.x, pot.y) < r + 4) hitPot(pot.i);
  return n;
}
// report/apply a hit on an enemy: instant local feedback, authoritative on host
function dealHit(p, w, e, h) {
  h.dmg = Math.max(1, Math.round(h.dmg));
  // predicted feedback
  const blocked = shieldBlocks(e, p.x, p.y, h);
  e.lflash = 0.1;
  if (!blocked) {
    const frozenBonus = e.frozen > 0 ? 1.3 : 1;
    numFx(e.x + rnd(-4, 4), e.y - 28 - (e.boss ? 14 : 0), Math.round(h.dmg * frozenBonus), h.crit ? '#ffd23f' : h.magic ? '#c9e8ff' : '#ffffff', h.crit ? 2 : 1);
    hitFx(e.x, e.y - 10, h.a, e, h);
    const big = h.heavy || h.crit;
    if (Net.role === 'solo') G.hitstop = Math.max(G.hitstop, big ? 0.07 : 0.035); // whole world freezes for a beat
    else p.hitstop = big ? 0.06 : 0.03; // co-op: only our own avatar pauses so the shared world never stutters
    shake(big ? 4 : 2); Input.rumble(big ? 0.45 : 0.12, big ? 0.6 : 0.3, big ? 90 : 45);
    if (h.melee) p.mana = Math.min(p.stats.maxMana, p.mana + 1.5);
    if (p.stats.leech > 0) p.hp = Math.min(p.maxHp, p.hp + h.dmg * p.stats.leech);
    sfxAt(h.crit ? 'crit' : h.heavy ? 'hitHeavy' : 'hit', e.x, e.y, 0.9);
    if (e.kind === 'grunt' && G.world.dun && G.world.dun.did === 'crypt') sfxAt('bone', e.x, e.y, 0.5);
  } else {
    numFx(e.x, e.y - 30, 'BLOCK', '#a0a8b8', 1); sparkFx(e.x, e.y - 10, '#ffe9a0', 8); SFX.play('block', 0.8);
    p.kx -= Math.cos(h.a) * 70; p.ky -= Math.sin(h.a) * 70; p.hitstop = 0.05;
  }
  const msg = { k: 'hit', id: e.id, dmg: h.dmg, a: r1(h.a), kb: h.kb | 0, po: Math.round(h.poise || 0), cr: h.crit ? 1 : 0, hv: h.heavy ? 1 : 0, mg: h.magic ? 1 : 0, st: h.status || 0, stT: h.statusT || 0, ax: r1(p.x), ay: r1(p.y), pid: p.pid };
  if (Net.isAuth()) applyHit(w, msg); else Net.send('host', msg);
}
function shieldBlocks(e, ax, ay, h) {
  if (e.kind !== 'shield' || h.magic || h.heavy) return false;
  if (e.state === 'recover' || e.state === 'stagger' || e.frozen > 0) return false;
  const a = angTo(e.x, e.y, ax, ay);
  return Math.abs(angDiff(e.face, a)) < 1.15;
}
function hitPot(i) {
  if (Net.isAuth()) breakPot(G.world, i); else Net.send('host', { k: 'pot', i });
  const pot = G.world.map.pots[i]; if (pot && !pot.broken) { pot.broken = true; potFx(pot); }
}

// ---------------------------------------------------------------------------
//  Damage to the local player (each client judges hits on its own avatar,
//  so a dodge that looks successful on your screen IS successful)
// ---------------------------------------------------------------------------
function hurtLocal(p, dmg, sx, sy, o = {}) {
  if (p.downed || p.dead || G.scene !== 'dungeon') return 'iframe';
  if (p.state === 'roll' && p.st < ROLL_IFRAME) { perfectDodge(p); return 'iframe'; }
  if (p.iframe > 0) return 'iframe';
  const a = angTo(p.x, p.y, sx, sy);
  // block / parry
  if (p.state === 'block' && !o.unblockable && Math.abs(angDiff(p.aim, a)) < 1.2) {
    const perfect = G.time - p.blockT < 0.18;
    if (perfect) {
      SFX.play('parry', 1); G.slowmo = 0.25; shake(3); Input.rumble(0.5, 0.9, 120); sparkFx(p.x + Math.cos(a) * 8, p.y - 6 + Math.sin(a) * 8, '#fff6c0', 18);
      numFx(p.x, p.y - 34, 'PARRY', '#ffe96a', 2); G.P.stats.parry = (G.P.stats.parry || 0) + 1; questEvent('parry', 1);
      p.sta = Math.min(p.stats.maxSta, p.sta + 15);
      if (o.src && o.melee) { const m = { k: 'parried', id: o.src }; if (Net.isAuth()) staggerEnemy(G.world, o.src, 1.4); else Net.send('host', m); }
      p.iframe = 0.2; return 'parry';
    }
    const cost = dmg * 1.1;
    SFX.play('block', 1); sparkFx(p.x + Math.cos(a) * 8, p.y - 6 + Math.sin(a) * 8, '#ffe9a0', 10);
    p.kx -= Math.cos(a) * 110; p.ky -= Math.sin(a) * 110;
    if (p.sta >= cost) { p.sta -= cost; p.staDelay = 0.6; p.iframe = 0.12; return 'block'; }
    // guard break
    p.sta = 0; p.staDelay = 1.2; dmg *= 0.5; numFx(p.x, p.y - 34, 'GUARD BREAK', '#ff6b5e', 1);
    p.state = 'hurt'; p.st = 0; p.hurtDur = 0.6;
  }
  dmg = dmg * (1 - p.stats.dr);
  if (p.shield > 0) { const ab = Math.min(p.shield, dmg); p.shield -= ab; dmg -= ab; sparkFx(p.x, p.y - 8, '#8fe6ff', 8); if (dmg <= 0) { SFX.play('block', 0.6, 1.4); p.iframe = 0.25; return true; } }
  dmg = Math.max(1, Math.round(dmg));
  p.hp -= dmg; p.flash = 0.12; p.iframe = 0.55;
  numFx(p.x, p.y - 34, dmg, '#ff5a4a', 1);
  SFX.play('hurt', 1); shake(5); G.hurtFlash = 0.35; G.hurtDir = a; Input.rumble(0.8, 0.5, 160);
  const kb = o.kb ?? 120; p.kx -= Math.cos(a) * kb; p.ky -= Math.sin(a) * kb;
  bloodFx(p.x, p.y - 6, a + Math.PI, '#c22a3a', 6);
  if (!(p.state === 'heavy' && p.st < p.tm.wind + p.tm.act) && p.state !== 'hurt') { if (p.state === 'drink' && !p.drank) G.P.potions++; p.state = 'hurt'; p.st = 0; p.hurtDur = 0.2; }
  if (o.status === 'poison') p.regenT = 0;
  if (p.hp <= 0) playerDown(p);
  return true;
}
// rolling through an attack refunds stamina and a little mana, with a crisp cue
function perfectDodge(p) {
  if (G.time - (p.lastDodgeT || -9) < 0.6) return;
  p.lastDodgeT = G.time;
  p.sta = Math.min(p.stats.maxSta, p.sta + 12); p.mana = Math.min(p.stats.maxMana, p.mana + 4);
  numFx(p.x, p.y - 36, 'DODGE', '#8fe6ff', 1);
  SFX.play('glint', 0.9, 1.3); Input.rumble(0, 0.35, 50);
  for (let i = 0; i < 10; i++) { const a = rnd(0, TAU); G.fx.parts.push(part(p.x, p.y - 7, Math.cos(a) * 60, Math.sin(a) * 40, pick(['#8fe6ff', '#ffffff']), 0.3, 1, true)); }
  if (Net.role === 'solo') G.slowmo = Math.max(G.slowmo, 0.12);
}
function playerDown(p) {
  p.hp = 0;
  const solo = Net.partySize() <= 1;
  if (solo) { p.dead = true; p.state = 'dead'; SFX.play('down', 1); onLocalDeath(); return; }
  p.downed = true; p.downT = BLEEDOUT; p.reviveP = 0; p.state = 'downed'; SFX.play('down', 1);
  chatSys(`${p.name} is down! Stand next to them to revive.`); netFx({ t: 'down', pid: p.pid });
  checkPartyWipe();
}
function updateDowned(p, w, dt) {
  p.downT -= dt;
  const [mx, my] = Input.moveVec();
  p.vx = mx * 14; p.vy = my * 14;
  moveEntity(w.map, p, p.vx * dt, p.vy * dt, p.r);
  // any living ally nearby revives us
  let helper = null;
  for (const o of w.players.values()) if (o !== p && !o.downed && !o.dead && !o.away && dist(o.x, o.y, p.x, p.y) < REVIVE_RANGE) helper = o;
  if (helper) { p.reviveP += dt / REVIVE_TIME; if (Math.random() < 0.3) G.fx.parts.push(part(p.x + rnd(-8, 8), p.y - rnd(0, 12), 0, -20, '#7cf0a0', 0.6, 2, true)); }
  else p.reviveP = Math.max(0, p.reviveP - dt * 0.25);
  if (p.reviveP >= 1) {
    p.downed = false; p.hp = Math.round(p.maxHp * 0.4); p.state = 'idle'; p.iframe = 2; p.reviveP = 0;
    SFX.play('revive', 1); spawnHealFx(p.x, p.y); chatSys(`${p.name} was revived by ${helper.name}!`);
    netFx({ t: 'revived', pid: p.pid, by: helper.pid });
  } else if (p.downT <= 0) { p.downed = false; p.dead = true; p.state = 'dead'; chatSys(`${p.name} has fallen. They will return when the room is cleared.`); netFx({ t: 'dead', pid: p.pid }); checkPartyWipe(); }
}
function respawnFallen(p) { // room cleared: fallen allies get back up
  if (!p.dead && !p.downed) return;
  p.dead = false; p.downed = false; p.hp = Math.round(p.maxHp * 0.3); p.state = 'idle'; p.iframe = 2; spawnHealFx(p.x, p.y);
  chatSys(`${p.name} rises again.`);
}
function checkPartyWipe() {
  if (!Net.isAuth()) return;
  const w = G.world; if (!w || G.scene !== 'dungeon') return;
  let alive = 0; for (const p of w.players.values()) if (!p.downed && !p.dead && !p.away) alive++;
  if (alive === 0 && !w.wiped) { w.wiped = true; setTimeout(() => { Net.broadcast({ k: 'wipe' }); onPartyWipe(); }, 1800); }
}

// ---------------------------------------------------------------------------
//  Cards
// ---------------------------------------------------------------------------
function tryCards(p, w) {
  for (let i = 0; i < 6; i++) {
    if (!Input.peek('card' + i)) continue;
    Input.take('card' + i);
    const id = G.P.cards.loadout[i]; if (!id) return false;
    const C = CARDS[id];
    if ((p.cds[id] || 0) > 0) { SFX.play('exhausted', 0.5); return false; }
    if (p.mana < C.mana) { SFX.play('exhausted', 0.5); flashHotbar(i, 'mana'); return false; }
    if (p.state === 'roll' || p.state === 'hurt' || p.state === 'drink') return false;
    p.mana -= C.mana; p.cds[id] = C.cd * (1 - p.stats.cdr);
    p.state = 'cast'; p.st = 0; p.castDur = id === 'meteor' ? 0.3 : 0.16; p.face = p.aim;
    const tx = clamp(Input.wx - p.x, -160, 160) + p.x, ty = clamp(Input.wy - p.y, -120, 120) + p.y;
    const params = { t: 'card', id, pid: p.pid, x: r1(p.x), y: r1(p.y), a: r1(p.aim), tx: r1(nowSec() - Input.kbAimT < 1.5 ? p.x + Math.cos(p.aim) * 90 : tx), ty: r1(nowSec() - Input.kbAimT < 1.5 ? p.y + Math.sin(p.aim) * 90 : ty), mag: r1(p.stats.magMul) };
    castCard(params, true);
    netFx(params);
    flashHotbar(i);
    return true;
  }
  return false;
}
// cast a card effect. local=true -> this client owns it and deals the damage;
// local=false -> remote player's cast, visuals only (plus buffs/heals that touch us)
function castCard(c, local) {
  const w = G.world, me = G.me, p = w.players.get(c.pid) || me;
  const mag = c.mag || 1, C = CARDS[c.id];
  switch (c.id) {
    case 'fireball': {
      sfxAt('fireball', c.x, c.y);
      w.pprojs.push({ kind: 'fireball', x: c.x + Math.cos(c.a) * 8, y: c.y - 6 + Math.sin(c.a) * 8, vx: Math.cos(c.a) * 250, vy: Math.sin(c.a) * 250, r: 5, life: 1.4, local, dmg: C.dmg * mag, pid: c.pid });
      break;
    }
    case 'icelance': {
      sfxAt('frost', c.x, c.y, 0.6);
      w.pprojs.push({ kind: 'icelance', x: c.x + Math.cos(c.a) * 8, y: c.y - 6 + Math.sin(c.a) * 8, vx: Math.cos(c.a) * 420, vy: Math.sin(c.a) * 420, r: 4, life: 0.7, local, dmg: C.dmg * mag, pid: c.pid, pierce: new Set() });
      break;
    }
    case 'venomfan': {
      sfxAt('swing', c.x, c.y, 0.8, 1.5);
      for (let i = -2; i <= 2; i++) { const a = c.a + i * 0.2; w.pprojs.push({ kind: 'knife', x: c.x, y: c.y - 6, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, r: 3, life: 0.6, local, dmg: C.dmg * mag, pid: c.pid }); }
      break;
    }
    case 'groundslam': {
      sfxAt('slam', c.x, c.y); shake(local ? 7 : 3);
      ringFx(c.x, c.y, 8, 62, '#d6a35a', 0.35); dustRing(c.x, c.y, 18);
      if (local) { G.hitstop = 0.06; areaHit(p, w, c.x, c.y, 54, C.dmg * mag, { kb: 260, poise: 60, magic: false }); }
      break;
    }
    case 'shadowstep': {
      sfxAt('shadow', c.x, c.y);
      const d = Math.min(95, dist(c.x, c.y, c.tx, c.ty) || 95), a = c.a;
      shadowFx(c.x, c.y);
      if (local) {
        // step in increments so we never pass through walls
        const steps = 12; let lx = me.x, ly = me.y;
        for (let i = 1; i <= steps; i++) { const nx = c.x + Math.cos(a) * d * i / steps, ny = c.y + Math.sin(a) * d * i / steps; if (solidAt(w.map, nx, ny)) break; lx = nx; ly = ny; }
        me.x = lx; me.y = ly; me.iframe = Math.max(me.iframe, 0.35);
        areaHit(me, w, c.x, c.y - 4, 26, C.dmg * mag, { kb: 60, poise: 10 });
        areaHit(me, w, me.x, me.y - 4, 26, C.dmg * mag, { kb: 60, poise: 10 });
        shadowFx(me.x, me.y);
      }
      break;
    }
    case 'frostnova': {
      sfxAt('frost', c.x, c.y); ringFx(c.x, c.y, 6, 70, '#8fe6ff', 0.4); for (let i = 0; i < 30; i++) { const a = rnd(0, TAU), s = rnd(40, 160); G.fx.parts.push(part(c.x, c.y - 4, Math.cos(a) * s, Math.sin(a) * s, pick(['#bff4ff', '#8fe6ff', '#fff']), rnd(0.4, 0.8), rnd(1, 3), true)); }
      if (local) areaHit(p, w, c.x, c.y, 64, C.dmg * mag, { kb: 40, poise: 20, status: 'freeze', statusT: 2.5 });
      break;
    }
    case 'healaura': {
      sfxAt('heal', c.x, c.y);
      w.zones.push({ kind: 'heal', x: c.x, y: c.y, r: 52, t: 0, life: 5, amt: C.heal });
      break;
    }
    case 'chainzap': {
      sfxAt('zap', c.x, c.y);
      if (local) {
        let from = { x: c.x, y: c.y - 8 }, hit = new Set(), pts = [[from.x, from.y]];
        for (let n = 0; n < 5; n++) {
          let best = null, bd = n === 0 ? 150 : 100;
          for (const e of w.ents.values()) { if (e.type !== 'enemy' || e.dead || hit.has(e.id) || e.state === 'spawn' || e.hidden) continue; const d = dist(from.x, from.y, e.x, e.y - 6); if (d < bd && (n > 0 || Math.abs(angDiff(c.a, angTo(from.x, from.y, e.x, e.y))) < 1.2)) { bd = d; best = e; } }
          if (!best) break;
          hit.add(best.id); pts.push([best.x, best.y - 6]);
          dealHit(me, w, best, { dmg: C.dmg * mag * (1 - n * 0.1), a: angTo(from.x, from.y, best.x, best.y), kb: 30, poise: 8, magic: true, crit: false });
          from = { x: best.x, y: best.y - 6 };
        }
        if (pts.length === 1) pts.push([c.x + Math.cos(c.a) * 60, c.y - 8 + Math.sin(c.a) * 60]);
        const fx = { t: 'zap', pts: pts.map(q => [r1(q[0]), r1(q[1])]) }; zapFx(fx.pts); netFx(fx);
      }
      break;
    }
    case 'whirlwind': {
      sfxAt('whirl', c.x, c.y);
      if (p) { p.spinT = 1.1; p.spin = 0; }
      break;
    }
    case 'barrier': {
      sfxAt('shieldUp', c.x, c.y);
      if (local) { me.shield = me.maxHp * 0.35; me.shieldT = 6; }
      if (p) { p.shieldVis = 6; }
      ringFx(c.x, c.y - 6, 20, 6, '#6ad2ff', 0.3);
      break;
    }
    case 'meteor': {
      sfxAt('cast', c.x, c.y);
      w.zones.push({ kind: 'meteor', x: c.tx, y: c.ty, r: 46, t: 0, life: 0.9, local, dmg: C.dmg * mag, pid: c.pid });
      break;
    }
    case 'warcry': {
      sfxAt('warcry', c.x, c.y); ringFx(c.x, c.y, 10, 90, '#ff6a5a', 0.45); shake(3);
      if (me && !me.dead && dist(me.x, me.y, c.x, c.y) < 110) { me.buffs.warcry = 8; if (!local) toast(`${p ? p.name : 'Ally'}'s War Cry empowers you!`); }
      break;
    }
    case 'spiritblades': {
      sfxAt('cast', c.x, c.y);
      if (p) { p.bladesT = 7; p.blades = 0; }
      break;
    }
  }
}

// player projectiles (fireball, ice lance, knives). Remote ones are visual only.
function updatePlayerProjectiles(w, dt) {
  for (let i = w.pprojs.length - 1; i >= 0; i--) {
    const pr = w.pprojs[i];
    pr.life -= dt; pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    let dead = pr.life <= 0;
    if (pr.kind === 'fireball' && Math.random() < 0.8) G.fx.parts.push(part(pr.x, pr.y, rnd(-20, 20), rnd(-30, 0), pick(['#ff8a3a', '#ffd76a', '#ff5a2a']), 0.35, rnd(1, 3), true));
    if (pr.kind === 'icelance' && Math.random() < 0.6) G.fx.parts.push(part(pr.x, pr.y, rnd(-10, 10), rnd(-10, 10), '#bff4ff', 0.25, 1, true));
    if (projSolidAt(w.map, pr.x, pr.y + 6)) dead = true;
    if (!dead) for (const e of w.ents.values()) {
      if (e.type !== 'enemy' || e.dead || e.state === 'spawn' || e.hidden) continue;
      if (dist(pr.x, pr.y, e.x, e.y - 6 - (e.boss ? 14 : 0)) > pr.r + e.r + 2) continue;
      if (pr.pierce) { if (pr.pierce.has(e.id)) continue; pr.pierce.add(e.id); }
      if (pr.local) {
        const me = G.me;
        if (pr.kind === 'fireball') { /* explosion handles damage */ }
        else dealHit(me, w, e, { dmg: pr.dmg, a: Math.atan2(pr.vy, pr.vx), kb: pr.kind === 'icelance' ? 50 : 20, poise: pr.dmg * 0.5, magic: true, status: pr.kind === 'icelance' ? 'chill' : pr.kind === 'knife' ? 'poison' : 0, statusT: pr.kind === 'knife' ? 4 : 2 });
      }
      if (!pr.pierce) { dead = true; break; }
    }
    if (dead) {
      if (pr.kind === 'fireball') {
        sfxAt('explode', pr.x, pr.y, 0.8); ringFx(pr.x, pr.y, 4, 34, '#ff8a3a', 0.25); burstFx(pr.x, pr.y, ['#ff8a3a', '#ffd76a', '#ff5a2a', '#fff'], 22, 140);
        if (pr.local) { shake(3); areaHit(G.me, w, pr.x, pr.y, 32, pr.dmg, { kb: 120, poise: 25, status: 'burn', statusT: 3 }); }
      } else sparkFx(pr.x, pr.y, pr.kind === 'icelance' ? '#bff4ff' : '#9be86a', 5);
      w.pprojs.splice(i, 1);
    }
  }
  // zones (heal aura, meteor)
  for (let i = w.zones.length - 1; i >= 0; i--) {
    const z = w.zones[i]; z.t += dt;
    if (z.kind === 'heal') {
      const me = G.me;
      if (me && !me.dead && !me.downed && dist(me.x, me.y, z.x, z.y) < z.r) me.hp = Math.min(me.maxHp, me.hp + me.maxHp * z.amt * dt);
      if (Math.random() < 0.5) { const a = rnd(0, TAU), rr = rnd(0, z.r); G.fx.parts.push(part(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * 0.6, 0, -25, pick(['#7cf0a0', '#d8ffe4']), 0.8, rnd(1, 2), true)); }
    }
    if (z.kind === 'meteor' && z.t >= z.life && !z.done) {
      z.done = true; sfxAt('explode', z.x, z.y, 1.2, 0.7); shake(z.local ? 9 : 4); ringFx(z.x, z.y, 6, 70, '#ff5a2a', 0.4); burstFx(z.x, z.y, ['#ff5a2a', '#ffd76a', '#ff8a3a', '#fff', '#5a2a1a'], 50, 200); dustRing(z.x, z.y, 20);
      G.fx.decals.push({ x: z.x, y: z.y, r: 30, t: 0, life: 8, col: '#1a0a06' });
      if (z.local) { G.hitstop = 0.08; areaHit(G.me, w, z.x, z.y, z.r, z.dmg, { kb: 220, poise: 80, status: 'burn', statusT: 3 }); }
    }
    if (z.t >= z.life + (z.kind === 'meteor' ? 0.05 : 0)) w.zones.splice(i, 1);
  }
}

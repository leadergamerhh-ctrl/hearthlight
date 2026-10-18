// ============================================================================
//  Game flow: scenes, main loop, saving, progression, event handlers
// ============================================================================
const INV_SIZE = 32, STASH_SIZE = 48;

// ---------------------------------------------------------------------------
//  Saving
// ---------------------------------------------------------------------------
// localStorage can be unavailable (private modes, sandboxed pages): fall back to memory so the game still runs
const _memStore = new Map(); let _lsWarned = false;
function lsGet(k) { try { const v = localStorage.getItem(k); return v != null ? v : (_memStore.has(k) ? _memStore.get(k) : null); } catch (e) { return _memStore.has(k) ? _memStore.get(k) : null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { _memStore.set(k, v); if (!_lsWarned && G.scene !== 'title') { _lsWarned = true; toast('This browser blocks saving here — progress lasts until you close the tab.', '', 6); } return false; } }
function slotKey(s) { return 'hl_save_' + s; }
function peekSave(s) { try { const d = JSON.parse(lsGet(slotKey(s)) || 'null'); return d && d.name ? d : null; } catch (e) { return null; } }
function writeSave(s, P) { lsSet(slotKey(s), JSON.stringify(P)); lsSet('hl_last', String(s)); }
function deleteSave(s) { _memStore.delete(slotKey(s)); if (_memStore.get('hl_last') === String(s)) _memStore.delete('hl_last'); try { localStorage.removeItem(slotKey(s)); if (lsGet('hl_last') === String(s)) localStorage.removeItem('hl_last'); } catch (e) { } }
function lastSlot() { const s = lsGet('hl_last'); if (s == null) return null; const d = peekSave(Number(s)); return d ? { slot: Number(s), name: d.name, level: d.level } : null; }
function saveGame() { if (G.P && G.slot != null) writeSave(G.slot, G.P); }
function saveSettings() { lsSet('hl_settings', JSON.stringify({ audio: SFX.settings, game: G.settings })); }
function loadSettings() {
  G.settings = { shake: 1 };
  try { const s = JSON.parse(lsGet('hl_settings') || 'null'); if (s) { Object.assign(SFX.settings, s.audio || {}); Object.assign(G.settings, s.game || {}); } } catch (e) { }
}
function migrate(P) { // keep older saves loadable
  if (!P.story) P.story = { on: false, seen: {}, lore: [] }; // saves from before story mode start in free play
  P.story.seen = P.story.seen || {}; P.story.lore = P.story.lore || [];
  const base = newProfile(P.name, P.color);
  for (const k in base) if (P[k] === undefined) P[k] = base[k];
  for (const k in base.stats) if (P.stats[k] === undefined) P.stats[k] = 0;
  for (const k in base.mats) if (P.mats[k] === undefined) P.mats[k] = 0;
  P.flags.clears = P.flags.clears || {}; P.flags.tiers = P.flags.tiers || { crypt: 0 };
  for (const it of [...P.inv, ...P.stash, ...Object.values(P.equip)]) if (it) it.unbanked = false;
  return P;
}
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }

// ---------------------------------------------------------------------------
//  World + scenes
// ---------------------------------------------------------------------------
function makeWorld(kind, map) {
  return { kind, map, sid: map.seed != null ? String(map.seed) : 'village', time: 0, rtime: 0, players: new Map(), ents: new Map(), hazards: [], eprojs: [], pprojs: [], zones: [], loot: [], npcs: [], objects: [], dun: null };
}
function applyStats() {
  const me = G.me, P = G.P; if (!me) return;
  const S = computeStats(P), wasMax = me.hp >= me.maxHp;
  me.stats = S; me.maxHp = S.maxHp; me.wtype = S.wtype; me.lvl = P.level; me.name = P.name; me.color = P.color;
  if (wasMax) me.hp = S.maxHp; me.hp = Math.min(me.hp, S.maxHp);
}
function unlockedSet(P) { return new Set(VILLAGE_UNLOCKS.filter(u => u.req(P)).map(u => u.id)); }
function placeMe(w, x, y) {
  const me = G.me; me.x = x; me.y = y; me.px = x; me.py = y; me.vx = me.vy = me.kx = me.ky = 0; me.state = 'idle'; me.st = 0;
  me.downed = false; me.dead = false; w.players.set(me.pid, me); G.cam.snap = true;
}
function fadeSwap(fn) {
  $('fade').classList.add('on');
  setTimeout(() => { fn(); setTimeout(() => $('fade').classList.remove('on'), 60); }, 380);
}
function startGame(slot, mode) {
  const d = peekSave(slot); if (!d) return;
  G.slot = slot; G.P = migrate(d); lsSet('hl_last', String(slot));
  G.me = makePlayer(Net.pid, G.P.name, G.P.color, computeStats(G.P));
  applyStats(); G.me.hp = G.me.maxHp; G.me.sta = G.me.stats.maxSta; G.me.mana = G.me.stats.maxMana;
  $('menu-root').innerHTML = '';
  fadeSwap(() => {
    enterVillage(true);
    if (mode === 'coop') setTimeout(() => openPause('party'), 300);
  });
}
function quitToTitle() {
  if (G.scene === 'dungeon') { deathPenalty(true); }
  if (Net.role === 'host') Net.broadcast({ k: 'hostQuit' });
  Net.leave(); saveGame(); closeMenu();
  fadeSwap(() => { G.world = makeWorld('village', prerenderMap(genVillage(new Set()))); G.me = null; showTitle(); setupTitleWorld(); });
}
function enterVillage(first, victory) {
  const P = G.P;
  const before = P._seenUnlocks || [];
  const unl = unlockedSet(P);
  const map = prerenderMap(genVillage(unl));
  const w = makeWorld('village', map);
  const oldPlayers = G.world ? [...G.world.players.values()].filter(p => p.remote) : [];
  G.world = w; G.scene = 'village';
  for (const p of oldPlayers) { p.downed = false; p.dead = false; w.players.set(p.pid, p); }
  for (const n of VILLAGE_NPCS) if (!n.unlock || unl.has(n.unlock)) w.npcs.push({ ...n, x: n.x * TS, y: n.y * TS, flip: false });
  for (const o of VILLAGE_OBJECTS) w.objects.push({ ...o, x: o.x * TS, y: o.y * TS });
  const nv = 2 + unl.size;
  const vNames = ['Old Tam', 'Pella', 'Garrick', 'Nim', 'Odessa', 'Bram', 'Little Fen', 'Sorrel'];
  for (let i = 0; i < nv; i++) { const x = rnd(20, 40) * TS, y = rnd(20, 32) * TS; w.npcs.push({ id: 'v' + i, name: vNames[i % vNames.length], spr: 'villager' + (i % 4), x, y, role: 'villager', walk: false, walkT: 0, tx: x, ty: y, wait: rnd(0, 3) }); }
  const sp = map.spawn; placeMe(w, sp.x + (Net.pid % 2 ? 14 : -14) * (Net.pid ? 1 : 0), sp.y + (Net.pid > 1 ? 12 : 0));
  showHUD(true); buildHotbar();
  Music.play('village');
  if (P.story && P.story.on) { P.flags.seenIntro = true; if (first && P.story.seen.prologue) banner('Hearthlight', 'Welcome back, ' + P.name, '', 2.2); storyOnVillage(); }
  else if (first && !P.flags.seenIntro) {
    P.flags.seenIntro = true;
    setTimeout(() => { banner('Hearthlight', 'The last fire in a darkening land', '', 3.5); }, 400);
    setTimeout(() => toast('Talk to <b>Elder Hessa</b> by the fire, then take the <b>Dungeon Gate</b> to the north.', '', 7), 3800);
  } else if (first) banner('Hearthlight', 'Welcome back, ' + P.name, '', 2.5);
  // new buildings?
  const now = [...unl];
  const fresh = now.filter(id => !before.includes(id));
  if (P._seenUnlocks && fresh.length) {
    for (const id of fresh) { const u = VILLAGE_UNLOCKS.find(x => x.id === id); setTimeout(() => { toast(`<div class="tt" style="color:var(--gold)">The village grows</div><div style="font-family:var(--serif);font-size:17px">${u.name}</div>`, 'ach', 5); SFX.play('achieve'); }, 1500); }
  }
  P._seenUnlocks = now;
  checkAchievements(); saveGame();
}
function enterDungeon(did, tier, seed) {
  const P = G.P, D = DUNGEONS[did];
  _entId = 1 + (Net.role === 'guest' ? 0 : 0);
  const map = prerenderMap(genDungeon(did, tier, seed));
  const w = makeWorld('dungeon', map);
  const oldPlayers = G.world ? [...G.world.players.values()].filter(p => p.remote) : [];
  G.world = w; G.scene = 'dungeon';
  for (const p of oldPlayers) { p.downed = false; p.dead = false; p.x = map.spawn.x; p.y = map.spawn.y; w.players.set(p.pid, p); }
  w.dun = { did, tier, keys: 0, bossKey: false, bossId: 0, bossDead: false, portal: null };
  Net.snaps = []; _deadIds.clear();
  placeMe(w, map.spawn.x + (Net.pid - 1.5) * 10, map.spawn.y);
  G.me.hp = G.me.maxHp; G.me.cds = {}; G.me.mana = G.me.stats.maxMana; G.me.sta = G.me.stats.maxSta;
  P.runGold = 0; P.stats.runs++;
  showHUD(true); buildHotbar();
  Music.play(D.music);
  banner(D.name, TIERS[tier].name + (Net.partySize() > 1 ? ` · Party of ${Net.partySize()}` : ''), '', 3);
  storyOnDungeon(did);
  if (!P.flags.tutDone) {
    P.flags.tutDone = true;
    const tips = ['Enemies <b style="color:#ff6b5e">glow red</b> before they strike. <b>Space</b> rolls — you are invulnerable for most of the roll.',
      'Red zones fill from the centre. The hit lands the instant the fill reaches the edge.',
      'Hold <b>Shift</b> to block. Block just as a blow lands to <b>parry</b>. <b>Right-click</b> heavies shatter shields.',
      '<b>1–4</b> cast your ability cards (mana regenerates, melee hits restore it). <b>Q</b> drinks a flask.'];
    tips.forEach((t, i) => setTimeout(() => { if (G.scene === 'dungeon') toast(t, '', 6); }, 3500 + i * 6500));
  }
  saveGame();
}
function hostStartDungeon(did, tier) {
  const seed = (Math.random() * 1e9) | 0;
  Net.broadcast({ k: 'scene', scene: 'dungeon', did, tier, seed });
  fadeSwap(() => enterDungeon(did, tier, seed));
}
function enterSceneFromHost(d) {
  if (d.scene === 'dungeon') fadeSwap(() => enterDungeon(d.did, d.tier, d.seed));
  else fadeSwap(() => returnToVillage(!!d.victory, !!d.wipe));
}
function hostReturnToVillage(victory, wipe) {
  Net.broadcast({ k: 'scene', scene: 'village', victory: victory ? 1 : 0, wipe: wipe ? 1 : 0 });
  fadeSwap(() => returnToVillage(victory, wipe));
}
function returnToVillage(victory, wipe) {
  const P = G.P;
  if (!wipe && G.scene === 'dungeon') bankLoot();
  P.potions = P.maxPotions; P.shopSeed = (P.shopSeed || 1) + 1; P.shopBought = {};
  G.me.hp = G.me.maxHp; G.me.dead = false; G.me.downed = false; G.me.buffs = {}; G.me.shield = 0;
  enterVillage(false, victory);
  if (victory) setTimeout(() => banner('Victory', 'The Hearth burns brighter', '', 3), 300);
  else if (!wipe) setTimeout(() => banner('Hearthlight', 'Home, safe — your loot is banked', '', 2.5), 300);
}
function bankLoot() {
  const P = G.P; let n = 0;
  for (const it of [...P.inv, ...Object.values(P.equip)]) if (it && it.unbanked) { it.unbanked = false; n++; }
  if (n) setTimeout(() => toast(`${n} item${n > 1 ? 's' : ''} banked safely.`), 900);
  P.runGold = 0;
}
// dying: lose roughly half of unbanked items and half the gold found this run
function deathPenalty(quiet) {
  const P = G.P, lostItems = [];
  P.inv = P.inv.filter(it => { if (it.unbanked && Math.random() < 0.5) { lostItems.push(it); return false; } it.unbanked = false; return true; });
  const goldLost = Math.min(P.gold, Math.floor((P.runGold || 0) * 0.5));
  P.gold -= goldLost; P.runGold = 0; P.stats.deaths++;
  saveGame();
  const parts = [];
  if (lostItems.length) parts.push(`${lostItems.length} unbanked item${lostItems.length > 1 ? 's' : ''} lost`);
  if (goldLost) parts.push(`${goldLost} gold dropped`);
  return parts.join(' · ') || 'Nothing was lost';
}
function onLocalDeath() {
  shake(10); G.slowmo = 1.2; Music.play('');
  const msg = deathPenalty();
  showDeathScreen(msg, () => fadeSwap(() => { returnToVillage(false, true); }));
}
function onPartyWipe() {
  if (G.scene !== 'dungeon' || G._wiping) return;
  G._wiping = true; Music.play('');
  const msg = deathPenalty();
  showDeathScreen('The whole party has fallen · ' + msg, () => { G._wiping = false; if (Net.isAuth()) hostReturnToVillage(false, true); });
}
function onLeaving(d) { banner(d.victory ? 'Victory!' : 'Leaving the dungeon', 'Returning to Hearthlight…', '', 2); SFX.play('portal'); }

// ---------------------------------------------------------------------------
//  Co-op session plumbing
// ---------------------------------------------------------------------------
async function startHosting(url) {
  await Net.host(G.P.name, url);
  const w = G.world; w.players.delete(G.me.pid); G.me.pid = 0; w.players.set(0, G.me);
  chatSys(`Hosting! Room code ${Net.code}. Share it with friends.`);
  banner('Room ' + Net.code, 'Friends can join with this code', '', 4);
  updateNetStatus();
}
async function startJoining(code, url) {
  const w = G.world;
  await Net.join(code, G.P.name, url);
  w.players.delete(G.me.pid); G.me.pid = Net.pid; w.players.set(Net.pid, G.me);
  if (G.scene === 'village') { G.me.x += (Net.pid % 2 ? 1 : -1) * 18; G.me.y += Net.pid > 1 ? 14 : 0; }
  chatSys(`Joined room ${code}.`);
  updateNetStatus();
}
function leaveParty() {
  if (Net.role === 'host') Net.broadcast({ k: 'hostQuit' });
  const wasDungeon = G.scene === 'dungeon';
  Net.leave();
  if (wasDungeon) fadeSwap(() => returnToVillage(false));
  chatSys('You left the party.');
}
function onSessionEnded() {
  if (Net.role !== 'solo') Net.leave();
  if (G.scene === 'dungeon') fadeSwap(() => returnToVillage(false));
  else if (G.world) { for (const [pid, p] of [...G.world.players]) if (p.remote) G.world.players.delete(pid); }
  updateNetStatus();
}
NET_HANDLERS.hostQuit = () => { if (Net.role === 'guest') { chatSys('The host ended the session.'); onSessionEnded(); } };
function onWelcome(d) {
  const apply = () => {
    const w = G.world;
    if (d.scene === 'dungeon') {
      const m = w.map;
      d.rooms.forEach((f, i) => { const r = m.rooms[i]; r.cleared = !!(f & 1); r.active = !!(f & 2); r.discovered = r.discovered || !!(f & 4); });
      onDoors({ s: d.doors, quiet: true });
      for (const i of d.pots) if (m.pots[i]) m.pots[i].broken = true;
      d.chests.forEach((f, i) => { const c = m.chests[i]; if (c) { c.opened = !!(f & 1); c.hidden = !!(f & 2); } });
      Object.assign(w.dun, d.dun);
      placeMe(w, d.spawn.x + rnd(-8, 8), d.spawn.y + rnd(-8, 8));
    }
    chatSys(`Party: ${d.party.map(p => p.n).join(', ')}`);
  };
  if (d.scene === 'dungeon' && !(G.scene === 'dungeon' && G.world.map.seed === d.seed)) fadeSwap(() => { enterDungeon(d.did, d.tier, d.seed); apply(); });
  else if (d.scene === 'village' && G.scene !== 'village') fadeSwap(() => { returnToVillage(false); apply(); });
  else apply();
}

// ---------------------------------------------------------------------------
//  Progression
// ---------------------------------------------------------------------------
function gainXP(x) {
  const P = G.P; if (P.level >= MAX_LEVEL) return;
  P.xp += Math.round(x);
  let leveled = false;
  while (P.level < MAX_LEVEL && P.xp >= XP_FOR(P.level)) { P.xp -= XP_FOR(P.level); P.level++; P.pts += 2; leveled = true; }
  if (leveled) {
    const oldN = G.me ? G.me.lvl : 1;
    applyStats(); G.me.hp = G.me.maxHp; G.me.lvl = P.level;
    SFX.play('levelup'); banner('Level ' + P.level, '+2 stat points — press C to spend', '', 2.6);
    for (let i = 0; i < 40; i++) { const a = rnd(0, TAU); G.fx.parts.push(part(G.me.x + Math.cos(a) * rnd(4, 16), G.me.y - rnd(0, 20), 0, rnd(-60, -20), pick(['#ffd23f', '#fff2c0', '#46d6c8']), rnd(0.6, 1.2), 1, true)); }
    ringFx(G.me.x, G.me.y, 4, 40, '#ffd23f', 0.5);
    if (loadoutSize(P) > (oldN >= 8 ? 6 : oldN >= 4 ? 5 : 4)) toast('A new card slot has opened in your loadout!');
    buildHotbar(); checkAchievements(); saveGame();
  }
}
function addItem(it, quiet) {
  const P = G.P;
  if (P.inv.length >= INV_SIZE) { if (!quiet && !(UI.fullT > nowSec())) { UI.fullT = nowSec() + 8; toast('Backpack full! Sell, salvage or stash items.'); } return false; }
  it.unbanked = G.scene === 'dungeon';
  P.inv.push(it);
  if (it.rarity === 'epic') P.stats.epics++;
  const R0 = RARITY[it.rarity];
  pickupLog(it.name, R0.color);
  SFX.play(R0.i >= 3 ? 'lootEpic' : R0.i >= 2 ? 'lootRare' : 'loot', 0.8);
  // auto-equip if the slot is empty
  if (!P.equip[it.slot]) { equipItem(P.inv.length - 1, true); }
  return true;
}
function equipItem(i, quiet) {
  const P = G.P, it = P.inv[i]; if (!it) return;
  const old = P.equip[it.slot];
  it.unbanked = false;
  P.equip[it.slot] = it; P.inv.splice(i, 1);
  if (old) P.inv.splice(i, 0, old);
  applyStats(); if (!quiet) SFX.play('ui'); saveGame();
  if (Net.role !== 'solo') Net.broadcast(playerStateMsg(G.me));
}
function dropItem(i) {
  const P = G.P, it = P.inv.splice(i, 1)[0]; if (!it) return;
  it.unbanked = false;
  const m = { k: 'dropItem', item: it, x: r1(G.me.x + rnd(-8, 8)), y: r1(G.me.y + 10) };
  if (Net.isAuth()) NET_HANDLERS.dropItem(m, Net.pid); else Net.send('host', m);
  toast(`Dropped ${esc(it.name)} for the party`);
}
function giveItem(i, pid) {
  const P = G.P, it = P.inv.splice(i, 1)[0]; if (!it) return;
  const p = G.world.players.get(pid);
  Net.send(pid, { k: 'give', item: it, from: P.name });
  toast(`Gave ${esc(it.name)} to ${esc(p ? p.name : 'ally')}`); saveGame();
}
function onGive(m) {
  const it = m.item; it.uid = it.uid || uid();
  if (!addItem(it)) { // full: drop it at our feet so it isn't lost
    const d = { k: 'dropItem', item: it, x: r1(G.me.x), y: r1(G.me.y + 10) };
    if (Net.isAuth()) NET_HANDLERS.dropItem(d); else Net.send('host', d);
  } else if (m.from && m.from !== 'ground') toast(`${esc(m.from)} gave you <span class="c-${it.rarity}">${esc(it.name)}</span>`);
  saveGame();
}
function unlockCard(id) {
  const P = G.P; if (P.cards.owned.includes(id)) return false;
  P.cards.owned.push(id);
  if (P.cards.loadout.length < loadoutSize(P)) P.cards.loadout.push(id);
  SFX.play('lootEpic'); banner('New Card', CARDS[id].name, '', 2.8);
  toast(`<b style="color:${CARDS[id].color}">${CARDS[id].name}</b> added to your collection. Arrange cards at the Card Altar.`, '', 5);
  buildHotbar(); checkAchievements(); saveGame();
  return true;
}
function questEvent(key, n = 1) {
  const P = G.P; if (!P) return;
  for (const q of P.quests.active) {
    const T = BOUNTY_TEMPLATES.find(b => b.id === q.tid); if (!T || T.key !== key) continue;
    const before = q.prog || 0; if (before >= q.n) continue;
    q.prog = Math.min(q.n, before + n);
    if (q.prog >= q.n) { toast(`Bounty complete: <b>${T.t(q.n)}</b> — claim it at the board`); SFX.play('achieve'); }
  }
}
function claimBounty(q) {
  const P = G.P, T = BOUNTY_TEMPLATES.find(b => b.id === q.tid), r = T.rew(q.n);
  for (const [k, v] of Object.entries(r)) { if (k === 'gold') P.gold += v; else if (k === 'xp') gainXP(v); else P.mats[k] = (P.mats[k] || 0) + v; }
  P.quests.active.splice(P.quests.active.indexOf(q), 1);
  if (q.daily) P.quests.claimedDaily[q.id] = 1;
  P.stats.bounties++;
  SFX.play('lootRare'); toast(`Bounty reward: ${rewardText(r)}`);
  checkAchievements(); saveGame();
}
function checkAchievements() {
  const P = G.P; if (!P) return;
  for (const a of ACHIEVEMENTS) if (!P.ach[a.id] && a.test(P)) { P.ach[a.id] = Date.now(); achievementToast(a); }
}

// ---------------------------------------------------------------------------
//  Local loot (instanced: every player rolls and sees their own drops)
// ---------------------------------------------------------------------------
function spawnLoot(x, y, o) {
  const a = rnd(0, TAU), s = rnd(30, 70);
  G.world.loot.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: 0, vz: 120, t: 0, seed: Math.random() * 10, ...o });
}
function rollDrops(x, y, lvl, luck, o = {}) {
  const n = o.count || 1;
  for (let i = 0; i < n; i++) spawnLoot(x, y, { item: genItem(lvl, { luck: luck + (o.luck || 0), minRarity: o.minRarity }) });
}
function updateLoot(w, dt) {
  const me = G.me;
  for (let i = w.loot.length - 1; i >= 0; i--) {
    const l = w.loot[i]; l.t += dt;
    l.vz -= 400 * dt; l.z = Math.max(0, l.z + l.vz * dt); if (l.z === 0) l.vz = 0;
    l.vx *= Math.exp(-4 * dt); l.vy *= Math.exp(-4 * dt);
    moveEntity(w.map, l, l.vx * dt, l.vy * dt, 3);
    if (!me || me.dead || me.downed || l.t < 0.5) continue;
    const d = dist(me.x, me.y, l.x, l.y);
    if (d < 34 && d > 8) { const a = angTo(l.x, l.y, me.x, me.y); l.x += Math.cos(a) * 120 * dt; l.y += Math.sin(a) * 120 * dt; }
    if (d < 9) {
      if (l.card) { if (!unlockCard(l.card)) { G.P.gold += 150; pickupLog('+150 gold (duplicate card)', '#f0c050'); } w.loot.splice(i, 1); continue; }
      if (addItem(l.item)) w.loot.splice(i, 1);
      else l.t = -1.5; // retry later
    }
  }
}
function randomUnownedCard() { const a = Object.keys(CARDS).filter(id => !G.P.cards.owned.includes(id)); return a.length ? pick(a) : null; }
function giveMats(x, y, did, n = 1, elite) {
  const P = G.P;
  if (Math.random() < (elite ? 1 : 0.22)) { const k = elite ? 3 : 1; P.mats.iron += k; pickupLog(`+${k} ${MATERIALS.iron.name}`, MATERIALS.iron.color); }
  const m = DUNGEONS[did].mat;
  if (Math.random() < (elite ? 1 : 0.12)) { const k = elite ? 2 : 1; P.mats[m] += k; pickupLog(`+${k} ${MATERIALS[m].name}`, MATERIALS[m].color); }
}

// ---------------------------------------------------------------------------
//  Event handlers (run on every client)
// ---------------------------------------------------------------------------
function onKill(d) {
  const P = G.P;
  deathFx(d.x, d.y, d.sk, d.elite);
  G.fx.corpses.push({ sk: d.sk, x: d.x, y: d.y, t: 0, dur: 0.4, flip: Math.random() < 0.5 });
  sfxAt('enemyDie', d.x, d.y, 0.8, d.elite ? 0.7 : 1);
  if (d.elite) { shake(6); G.flashScreen = 0.25; }
  if (!d.xp) return;
  gainXP(d.xp);
  P.stats.kills++;
  questEvent('kill'); questEvent(d.elite ? 'kill_elite' : 'kill_' + d.kind);
  if (G.scene !== 'dungeon') return;
  if (d.elite) rollDrops(d.x, d.y, d.lvl + 1, d.luck, { minRarity: 'uncommon', luck: 0.08 });
  else if (Math.random() < 0.09 + d.luck * 0.5) rollDrops(d.x, d.y, d.lvl, d.luck);
  giveMats(d.x, d.y, d.did, 1, d.elite);
}
function onGold(amt, x, y) {
  const P = G.P; P.gold += amt; P.runGold = (P.runGold || 0) + amt;
  UI.goldAcc = (UI.goldAcc || 0) + amt; clearTimeout(UI.goldT);
  UI.goldT = setTimeout(() => { pickupLog(`+${UI.goldAcc} gold`, '#f0c050'); UI.goldAcc = 0; }, 350);
  sfxAt('gold', x ?? G.me.x, y ?? G.me.y, 0.7);
}
function onHealMsg(m) {
  if (m.pid === Net.pid && G.me) { G.me.hp = Math.min(G.me.maxHp, G.me.hp + G.me.maxHp * m.amt); spawnHealFx(G.me.x, G.me.y); SFX.play('heal', 0.5); }
  else spawnHealFx(m.x, m.y);
}
function onKeys(d) {
  const w = G.world; if (!w || !w.dun) return;
  w.dun.keys = d.keys; w.dun.bossKey = d.boss;
  if (d.kind === 'key') { SFX.play('key'); toast(`🗝 ${esc(d.who)} found a key! Locked doors open on touch.`); }
  if (d.kind === 'boss') { SFX.play('key'); banner('Boss Key', `${d.who} claimed it — the sealed door awaits`, '', 3); }
}
function onDoors(d) {
  const w = G.world; if (!w || !w.map.doors) return;
  let opened = 0, closed = 0;
  d.s.forEach((v, i) => { const door = w.map.doors[i]; if (!door) return; const open = !!(v & 1), lock = v & 2 ? 'key' : v & 4 ? 'boss' : null; if (open !== door.open) open ? opened++ : closed++; door.open = open; door.lock = lock; });
  if (d.quiet) return;
  if (closed) SFX.play('lock'); else if (opened) SFX.play('door');
  if (closed) shake(2);
}
function onRoomEvent(d) {
  const w = G.world; if (!w || !w.map.rooms) return;
  const r = w.map.rooms[d.i]; if (!r) return;
  if (d.s === 'active') {
    r.active = true; r.discovered = true;
    if (d.type !== 'boss') { Music.play('combat'); if (d.type === 'elite') banner('A champion awaits', 'Defeat it to claim the Boss Key', '', 2.5); }
  } else {
    r.active = false; r.cleared = true;
    for (const c of w.map.chests) if (c.room === r.i) c.hidden = false;
    if (d.type !== 'boss') { Music.play(DUNGEONS[w.dun.did].music); SFX.play('door'); banner('Cleared', '', '', 1.2); }
    if (G.me && (G.me.dead || G.me.downed)) respawnFallen(G.me);
  }
}
function onChest(d) {
  const w = G.world, c = w.map.chests[d.i]; if (!c) return;
  c.opened = true; c.hidden = false;
  SFX.play('chest'); burstFx(c.x, c.y - 6, ['#ffd76a', '#fff2c0', '#f0b752'], 24, 90); ringFx(c.x, c.y, 4, 30, '#ffd76a', 0.4);
  G.P.stats.chests = (G.P.stats.chests || 0) + 1; questEvent('chest');
  if (d.big) {
    rollDrops(c.x, c.y + 4, d.lvl + 1, d.luck, { minRarity: 'rare', luck: 0.1 });
    rollDrops(c.x, c.y + 4, d.lvl, d.luck, { minRarity: 'uncommon' });
    const card = randomUnownedCard(); if (card) spawnLoot(c.x, c.y + 4, { card }); else onGold(200, c.x, c.y);
  } else {
    if (Math.random() < 0.75) rollDrops(c.x, c.y + 4, d.lvl, d.luck, { minRarity: 'uncommon' });
    giveMats(c.x, c.y, d.did, 1, false);
  }
}
function onPotBroken(i) {
  const w = G.world; if (!w || !w.map.pots) return; const pot = w.map.pots[i]; if (!pot) return;
  if (!pot.broken) { pot.broken = true; potFx(pot); }
  questEvent('pot');
}
function onTeleport(m) {
  if (m.pid !== Net.pid || !G.me) return;
  G.me.x = m.x; G.me.y = m.y; G.me.kx = G.me.ky = 0; shadowFx(m.x, m.y); SFX.play('shadow', 0.5);
}
function onBossEvent(d) {
  const w = G.world, P = G.P;
  if (d.ev === 'intro') { const B = BOSSES[d.bk]; Music.play('boss'); G.cine = 2.6; setTimeout(() => banner(B.name, B.sub, '', 3), 200); shake(6); SFX.play('roar', 1); setTimeout(() => storyOnBoss('intro', d.bk), 1400); }
  if (d.ev === 'phase') { shake(10); G.flashScreen = 0.4; if (d.msg) banner(d.msg, '', '', 2.2); SFX.play('roar', 1); }
  if (d.ev === 'dying') { G.slowmo = 1.4; G.flashScreen = 0.6; shake(12); }
  if (d.ev === 'dead') {
    w.dun.bossDead = true; w.dun.portal = d.portal; w.dun.bossId = 0;
    storyOnBoss('dead', d.bk);
    Music.play('victory'); shake(14); G.flashScreen = 0.8;
    deathFx(d.x, d.y, w.dun.did, true); burstFx(d.x, d.y - 10, ['#ffd76a', '#fff', '#c86bff'], 80, 220);
    const did = w.dun.did, tier = w.dun.tier, D = DUNGEONS[did], first = !P.flags.clears[did];
    gainXP(d.xp);
    rollDrops(d.x, d.y, d.lvl + 2, d.luck, { minRarity: 'rare', count: 2, luck: 0.1 });
    if (Math.random() < 0.3 + tier * 0.15) rollDrops(d.x, d.y, d.lvl + 2, d.luck, { minRarity: 'epic' });
    P.mats[D.mat] += 4 + tier * 2; P.mats.ember += 1 + tier; pickupLog(`+${4 + tier * 2} ${MATERIALS[D.mat].name}, +${1 + tier} Ember Shard`, MATERIALS[D.mat].color);
    if (first) {
      P.flags.clears[did] = true;
      const bonus = 250 * Math.max(1, D.level);
      P.gold += bonus; setTimeout(() => toast(`<div class="tt" style="color:var(--gold)">First clear!</div>+${bonus} gold · New tier unlocked`, 'ach', 5), 2600);
      if (!P.cards.owned.includes(D.card)) spawnLoot(d.x, d.y, { card: D.card });
    } else if (Math.random() < 0.4) { const c = randomUnownedCard(); if (c) spawnLoot(d.x, d.y, { card: c }); }
    P.flags.tiers[did] = Math.max(P.flags.tiers[did] || 0, Math.min(2, tier + 1));
    const nxt = Object.keys(DUNGEONS).find(k => DUNGEONS[k].unlockAfter === did); if (nxt && P.flags.tiers[nxt] == null) P.flags.tiers[nxt] = 0;
    if (tier === 2) P.stats.nightmare++;
    if (Net.partySize() > 1) P.stats.coopClears++;
    questEvent('boss');
    setTimeout(() => banner('Victory', `${BOSSES[d.bk].name} has fallen — step into the golden portal`, '', 4), 1200);
    if (G.me.dead || G.me.downed) respawnFallen(G.me);
    checkAchievements(); saveGame();
  }
}
function onRemoteFx(fx, from) {
  if (!fx || !G.world) return;
  const w = G.world;
  switch (fx.t) {
    case 'slash': spawnSlash(fx); sfxAt(fx.h ? 'swingHeavy' : 'swing', fx.x, fx.y, 0.5); break;
    case 'roll': { const p = w.players.get(fx.pid); if (p) sfxAt('roll', p.x, p.y, 0.5); break; }
    case 'card': castCard(fx, false); break;
    case 'zap': zapFx(fx.pts); sfxAt('zap', fx.pts[0][0], fx.pts[0][1], 0.6); break;
    case 'down': { const p = w.players.get(fx.pid); chatSys(`${p ? p.name : 'An ally'} is down! Stand next to them to revive.`); SFX.play('down', 0.6); if (p) { p.downed = true; } break; }
    case 'revived': { const p = w.players.get(fx.pid), b = w.players.get(fx.by); chatSys(`${p ? p.name : 'Ally'} was revived${b ? ' by ' + b.name : ''}!`); SFX.play('revive', 0.8); if (p) spawnHealFx(p.x, p.y); if (fx.by === Net.pid) { G.P.stats.revives++; checkAchievements(); } break; }
    case 'dead': { const p = w.players.get(fx.pid); chatSys(`${p ? p.name : 'Ally'} has fallen.`); checkPartyWipe(); break; }
    case 'slam': slamFx(fx.x, fx.y, fx.r); break;
    case 'splash': splashFx(fx.x, fx.y); break;
    case 'blink': shadowFx(fx.x, fx.y); break;
    case 'spark': sparkFx(fx.x, fx.y, '#ffe9a0', 8); sfxAt('block', fx.x, fx.y, 0.6); break;
  }
}
function emote(kind) {
  const me = G.me; if (!me || G.scene === 'title') return;
  const d = { e: kind };
  if (kind === 'ping') { d.x = r1(Input.wx); d.y = r1(Input.wy); }
  onEmote(d, Net.pid); Net.broadcast({ k: 'emote', ...d });
}
function onEmote(d, from) {
  const w = G.world; const p = w && (from === Net.pid ? G.me : w.players.get(from)); if (!p) return;
  if (d.e === 'ping') { G.fx.pings.push({ x: d.x, y: d.y, t: 0, dur: 4, col: p.color || '#ffd23f', name: p.name }); SFX.play('ping', 0.7); }
  else { const txt = { help: 'HELP!', thanks: 'THANKS!', follow: 'FOLLOW ME' }[d.e] || '!'; p.emote = { text: txt, t: 3, col: d.e === 'help' ? '#ff6b5e' : '#7cf0a0' }; SFX.play('chat'); }
}

// ---------------------------------------------------------------------------
//  Interaction
// ---------------------------------------------------------------------------
function computeInteract() {
  const w = G.world, me = G.me; G.interact = null;
  if (!w || !me || me.dead || me.downed || G.menu || G.cutscene) { $('prompt').classList.add('hidden'); return; }
  let best = null, bd = 1e9;
  const consider = (x, y, r, label, act, hgt) => { const d = dist(me.x, me.y, x, y); if (d < r && d < bd) { bd = d; best = { x, y, label, act, h: hgt }; } };
  if (G.scene === 'village') {
    for (const n of w.npcs) if (n.role !== 'villager') consider(n.x, n.y, 26, `Talk to ${n.name}`, () => openNpc(n), 32);
    for (const o of w.objects) consider(o.x, o.y + (o.role === 'gate' ? 18 : 0), o.role === 'gate' ? 34 : 26, o.role === 'gate' ? (Net.role === 'guest' ? 'Dungeon Gate (host chooses)' : 'Open the Dungeon Gate') : `Use ${o.name}`, () => openNpc(o), o.role === 'gate' ? 36 : 22);
    for (const n of w.npcs) if (n.role === 'villager') consider(n.x, n.y, 18, `Chat with ${n.name}`, () => { n.bubble = pick(['The Hearth burns warmer lately.', 'Careful in those crypts, dear.', 'Brann\'s been humming at the forge again.', 'Did you see the lights by the gate?', 'My cousin went into the grotto once. Once.', 'Bless you, hero.']); toast(`<b>${n.name}:</b> “${n.bubble}”`); }, 18);
  } else if (G.scene === 'dungeon') {
    for (const s of w.map.stones || []) if (!s.read) consider(s.x, s.y, 22, 'Read the memory stone', () => readStone(s), 26);
    for (const c of w.map.chests) if (!c.hidden && !c.opened) consider(c.x, c.y, 24, c.big ? 'Open the treasure chest' : 'Open chest', () => { const m = { k: 'interact', what: 'chest', i: c.i }; if (Net.isAuth()) hostInteract(w, m, Net.pid); else Net.send('host', m); }, 14);
    for (const p of portalsOf(w)) consider(p.x, p.y, 26, p.kind === 'boss' ? 'Return to Hearthlight (victory)' : (Net.role === 'guest' ? 'Exit portal (host leads)' : 'Leave the dungeon (keep your loot)'), () => { const m = { k: 'interact', what: 'portal', kind: p.kind }; if (Net.isAuth()) hostInteract(w, m, Net.pid); else Net.send('host', m); }, 22);
  }
  const pr = $('prompt');
  if (best) { G.interact = best; pr.innerHTML = `<b>E</b>${esc(best.label)}`; pr.classList.remove('hidden'); if (Input.take('interact')) best.act(); }
  else { pr.classList.add('hidden'); Input.take('interact'); }
}

// ---------------------------------------------------------------------------
//  Village ambience: townsfolk wander, NPCs face you
// ---------------------------------------------------------------------------
function updateVillage(w, dt) {
  for (const n of w.npcs) {
    if (n.role !== 'villager') { if (G.me) n.flip = G.me.x < n.x; continue; }
    if (n.wait > 0) { n.wait -= dt; n.walk = false; continue; }
    const d = dist(n.x, n.y, n.tx, n.ty);
    if (d < 2) { n.wait = rnd(2, 6); for (let k = 0; k < 10; k++) { const tx = n.x + rnd(-90, 90), ty = n.y + rnd(-70, 70); if (!solidAt(w.map, tx, ty) && tileAt(w.map, Math.floor(tx / TS), Math.floor(ty / TS)) !== T.TREE) { n.tx = tx; n.ty = ty; break; } } continue; }
    const a = angTo(n.x, n.y, n.tx, n.ty); n.walk = true; n.walkT += dt * 4; n.flip = Math.cos(a) < 0;
    const bx = n.x, by = n.y; moveEntity(w.map, n, Math.cos(a) * 26 * dt, Math.sin(a) * 26 * dt, 4);
    if (dist(bx, by, n.x, n.y) < 0.1) { n.tx = n.x; n.ty = n.y; }
  }
}
function separateEnemies(w) {
  const arr = []; for (const e of w.ents.values()) if (e.type === 'enemy' && !e.dead && !e.air && !e.hidden) arr.push(e);
  for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
    const a = arr[i], b = arr[j], d = dist(a.x, a.y, b.x, b.y), m = a.r + b.r;
    if (d < m && d > 0.01) { const push = (m - d) / 2, nx = (b.x - a.x) / d, ny = (b.y - a.y) / d, wa = b.mass / (a.mass + b.mass), wb = 1 - wa; a.x -= nx * push * wa * 2; a.y -= ny * push * wa * 2; b.x += nx * push * wb * 2; b.y += ny * push * wb * 2; }
  }
  // enemies gently push players apart from them (only our own avatar moves locally)
  const me = G.me; if (me && !me.dead && me.state !== 'roll') for (const e of arr) { const d = dist(e.x, e.y, me.x, me.y), m = e.r + me.r - 1; if (d < m && d > 0.01) { me.x += (me.x - e.x) / d * (m - d) * 0.5; me.y += (me.y - e.y) / d * (m - d) * 0.5; } }
}
function spikeCheck(w) {
  const me = G.me; if (!me || me.dead || me.downed || !w.map.spikes || !w.map.spikes.length) return;
  const tx = Math.floor(me.x / TS), ty = Math.floor(me.y / TS);
  if (tileAt(w.map, tx, ty) !== T.SPIKE) return;
  const s = w.map.spikes.find(s => s.tx === tx && s.ty === ty); if (!s || w.map.rooms[s.room].cleared) return;
  if (spikeState(s, hostTime(w)) === 2) { const res = hurtLocal(me, Math.round(9 + DUNGEONS[w.dun.did].level * 1.6), tx * TS + 8, ty * TS + 8, { kb: 60, unblockable: true }); if (res === true) sfxAt('spike', me.x, me.y); }
}
function discoverRooms(w) {
  const me = G.me; if (!me) return;
  const ri = roomIndexAt(w.map, me.x, me.y);
  if (ri >= 0 && !w.map.rooms[ri].discovered) w.map.rooms[ri].discovered = true;
}

// ---------------------------------------------------------------------------
//  Keys that open menus / chat / emotes
// ---------------------------------------------------------------------------
function onKeyCommand(e) {
  if (G.scene === 'title') { if (e.code === 'Escape' && G.menu) closeMenu(); return; }
  const k = e.code;
  if (Story.active && Story.modal) { e.preventDefault(); if (k === 'Escape') Story.skip(); else if (k === 'Space' || k === 'KeyE' || k === 'Enter' || k === 'NumpadEnter') Story.advance(); return; }
  if (k === 'Escape') { if (G.menu) closeMenu(); else openPause('game'); return; }
  if (k === 'Tab' || k === 'KeyI') { e.preventDefault(); if (G.menu === 'pause' && UI.pauseTab === 'inv') closeMenu(); else openPause('inv'); return; }
  if (k === 'KeyC') { if (G.menu === 'pause' && UI.pauseTab === 'char') closeMenu(); else openPause('char'); return; }
  if (k === 'KeyM') { if (G.menu === 'pause' && UI.pauseTab === 'map') closeMenu(); else openPause('map'); return; }
  if (k === 'KeyN') { SFX.settings.muted = !SFX.settings.muted; SFX.apply(); saveSettings(); toast(SFX.settings.muted ? 'Sound muted (N)' : 'Sound on'); return; }
  if (G.menu) return;
  if (k === 'Enter') { e.preventDefault(); openChat(); return; }
  if (k === 'KeyG') emote('ping');
  if (k === 'KeyH') emote('help');
  if (k === 'KeyT') emote('thanks');
}

// ---------------------------------------------------------------------------
//  Main loop: fixed 60 Hz simulation, render every frame
// ---------------------------------------------------------------------------
let _last = performance.now(), _acc = 0, _achT = 0;
function step(dt) {
  const w = G.world; if (!w) return;
  G.time += dt;
  if (Net.role === 'guest') guestInterpolate(w);
  interpolateRemotePlayers(w);
  if (G.me && G.scene !== 'title') updateLocalPlayer(G.me, w, dt);
  updatePlayerProjectiles(w, dt);
  if (Net.isAuth()) {
    w.time += dt;
    if (G.scene === 'dungeon') updateFlow(w, dt);
    for (const e of [...w.ents.values()]) { if (e.type === 'enemy') updateEnemy(w, e, dt); else updatePickup(w, e, dt); }
    if (G.scene === 'dungeon') { separateEnemies(w); updateRooms(w, dt); }
  } else if (G.scene === 'dungeon') separateEnemies(w);
  if (G.scene === 'dungeon') { updateHazards(w, dt); updateEProjs(w, dt); spikeCheck(w); discoverRooms(w); }
  updateLoot(w, dt);
  if (G.scene === 'village') updateVillage(w, dt);
  if (G.scene !== 'title') computeInteract();
  Net.tick(dt);
}
function tickSim(dt) {
  try { Input.pollPad(); } catch (e) { }
  let simDt = dt;
  if (Net.role === 'solo') {
    if (G.paused || G.cutscene) simDt = 0;
    else if (G.hitstop > 0) { G.hitstop -= dt; simDt = 0; }
    else if (G.slowmo > 0) { G.slowmo -= dt; simDt *= 0.35; }
  } else { G.hitstop = 0; if (G.slowmo > 0) G.slowmo -= dt; }
  _acc += simDt; let n = 0;
  while (_acc >= TICK && n < 8) { step(TICK); _acc -= TICK; n++; }
  if (n >= 8) _acc = 0;
  if (G.P && G.scene !== 'title') { G.P.stats.playtime += dt; _achT += dt; if (_achT > 1) { _achT = 0; checkAchievements(); } }
}
let _frameErrT = 0;
function frame(t) {
  requestAnimationFrame(frame); // queue first: one bad frame must never stop the game loop
  try { frameBody(); } catch (e) { if (performance.now() - _frameErrT > 5000) { _frameErrT = performance.now(); console.error('frame error', e); } }
}
function frameBody() {
  const pn = performance.now(), dt = Math.min(0.1, Math.max(0, (pn - _last) / 1000)); _last = pn; _lastFrameAt = pn;
  G.rt += dt;
  tickSim(dt);
  if (G.scene === 'title') updateTitleCam(dt); else updateCamera(dt);
  updateFx(G.paused ? 0 : (Net.role === 'solo' && G.hitstop > 0 ? dt * 0.15 : dt));
  if (G.cine > 0) G.cine -= dt;
  Story.update(dt);
  if (!G.paused) ambientFx(dt);
  // mouse -> world
  Input.wx = Input.mx / R.S + G.cam.x - R.W / 2; Input.wy = Input.my / R.S + G.cam.y - R.H / 2;
  render();
  if (G.scene !== 'title') updateHUD(dt);
  if (G.scene === 'dungeon' && G.me && !G.me.dead && !G.me.downed && G.me.hp < G.me.maxHp * 0.3) { G._hb = (G._hb || 0) - dt; if (G._hb <= 0) { G._hb = 0.5 + 0.6 * G.me.hp / (G.me.maxHp * 0.3); SFX.play('heartbeat', 0.9); } }
}
// keep simulating (and networking) while the tab is hidden: rAF stops in background tabs
// Watchdog: browsers stop requestAnimationFrame for hidden or fully covered windows (sometimes
// without even flagging the page hidden). A Worker timer isn't throttled, so whenever frames
// stop arriving it keeps the fixed-step simulation and networking running.
let _lastFrameAt = performance.now();
function startBackgroundTicker() {
  const fallback = () => {
    const n = performance.now();
    if (n - _lastFrameAt < 120) return; // rAF is alive, nothing to do
    const dt = Math.min(0.1, (n - _last) / 1000); _last = n; tickSim(dt);
    updateFx(dt); // keep effects expiring so nothing piles up while hidden
  };
  try {
    const src = 'setInterval(()=>postMessage(0),20)';
    const wk = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    wk.onmessage = fallback;
  } catch (e) { setInterval(fallback, 20); }
}

// title backdrop: the village at night with a slow drifting camera
function setupTitleWorld() {
  const P = { flags: { clears: {} }, level: 1, stats: {} };
  const map = prerenderMap(genVillage(new Set(['merchant', 'houses', 'lanterns'])));
  const w = makeWorld('village', map); G.world = w;
  for (const n of VILLAGE_NPCS.slice(0, 3)) w.npcs.push({ ...n, x: n.x * TS, y: n.y * TS });
  for (const o of VILLAGE_OBJECTS) w.objects.push({ ...o, x: o.x * TS, y: o.y * TS });
  for (let i = 0; i < 4; i++) { const x = rnd(22, 38) * TS, y = rnd(20, 30) * TS; w.npcs.push({ id: 't' + i, name: '', spr: 'villager' + i, x, y, role: 'villager', walk: false, walkT: 0, tx: x, ty: y, wait: rnd(0, 3) }); }
  G.cam.x = 30 * TS; G.cam.y = 21 * TS;
}
function updateTitleCam(dt) {
  G.cam.x = 30 * TS - R.W * 0.2 + Math.sin(G.rt * 0.08) * 18; G.cam.y = 22.5 * TS + Math.sin(G.rt * 0.05) * 10;
  if (G.world) updateVillage(G.world, dt);
}

function boot() {
  loadSettings();
  Sprites.init();
  Story.init();
  initRender();
  Input.init(R.cv);
  $('chatin').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); closeChat(true); } else if (e.key === 'Escape') { e.preventDefault(); closeChat(false); } e.stopPropagation(); });
  setupTitleWorld();
  showTitle();
  startBackgroundTicker();
  window.addEventListener('beforeunload', () => { saveGame(); });
  // first click anywhere starts audio (browsers block autoplay)
  const unlock = () => { SFX.init(); SFX.apply(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
  _last = performance.now(); requestAnimationFrame(frame);
  window.HL = { G, Net, SFX, Music }; // handy for debugging in the console
}
window.addEventListener('load', boot);

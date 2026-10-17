// ============================================================================
//  Game data: items, cards, enemies, bosses, dungeons, quests, achievements
// ============================================================================
const RARITY = {
  common:   { i: 0, name: 'Common',   color: '#d0d0d0', affixes: 0, mult: 1.0,  value: 1 },
  uncommon: { i: 1, name: 'Uncommon', color: '#6ee070', affixes: 1, mult: 1.12, value: 2.2 },
  rare:     { i: 2, name: 'Rare',     color: '#5aaeff', affixes: 2, mult: 1.25, value: 5 },
  epic:     { i: 3, name: 'Epic',     color: '#d48aff', affixes: 3, mult: 1.45, value: 12 },
};
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic'];

// weapon archetypes: change reach, arc, speed and damage of the light/heavy attacks
const WEAPONS = {
  sword:  { name: 'Sword',  dmg: 10, speed: 1.0,  range: 25, arc: 2.1, heavyMul: 2.5, lunge: 70,  sta: 11, crit: 0.05, names: ['Rusted Blade', 'Iron Sword', 'Knight Sword', 'Runed Blade', 'Dusksteel Sword'] },
  axe:    { name: 'Axe',    dmg: 14, speed: 0.82, range: 24, arc: 2.4, heavyMul: 2.8, lunge: 60,  sta: 14, crit: 0.04, names: ['Hatchet', 'War Axe', 'Bearded Axe', 'Runed Cleaver', 'Grave Splitter'] },
  spear:  { name: 'Spear',  dmg: 11, speed: 0.92, range: 34, arc: 0.9, heavyMul: 2.5, lunge: 90,  sta: 12, crit: 0.06, names: ['Pike', 'Iron Spear', 'Glaive', 'Runed Partisan', 'Moonlance'] },
  daggers:{ name: 'Daggers',dmg: 7,  speed: 1.35, range: 20, arc: 1.9, heavyMul: 2.1, lunge: 85,  sta: 8,  crit: 0.14, names: ['Shivs', 'Twin Knives', 'Fangs', 'Runed Kris', 'Night Talons'] },
};
const ARMORS = {
  leather: { name: 'Leather', armor: 8,  hp: 10, mana: 0,  speed: 0.03, names: ['Padded Jerkin', 'Leather Coat', 'Ranger Garb', 'Shadow Leathers'] },
  chain:   { name: 'Chain',   armor: 14, hp: 20, mana: 0,  speed: 0,    names: ['Ring Shirt', 'Chain Hauberk', 'Scale Coat', 'Wardensteel Mail'] },
  plate:   { name: 'Plate',   armor: 22, hp: 30, mana: 0,  speed: -0.04,names: ['Rusty Plate', 'Plate Cuirass', 'Templar Plate', 'Bulwark of Ash'] },
  robe:    { name: 'Robe',    armor: 5,  hp: 5,  mana: 20, speed: 0.02, names: ['Acolyte Robe', 'Mystic Robe', 'Starwoven Robe', 'Vestments of Dusk'] },
};
const TRINKETS = {
  ring:   { name: 'Ring',   imp: 'crit',  impV: 4,  names: ['Copper Band', 'Silver Ring', 'Signet', 'Ring of Embers'] },
  amulet: { name: 'Amulet', imp: 'mana',  impV: 15, names: ['Bone Charm', 'Moon Amulet', 'Saint\'s Locket', 'Heart of Ash'] },
  idol:   { name: 'Idol',   imp: 'hp',    impV: 20, names: ['Clay Idol', 'Totem', 'Warding Idol', 'Effigy of Kings'] },
};
// random stat bonuses
const AFFIXES = {
  dmg:     { label: v => `+${v}% Damage`, min: 4, max: 10, per: 0.5, pre: 'Brutal', suf: 'of Ruin' },
  hp:      { label: v => `+${v} Health`, min: 8, max: 18, per: 2.2, pre: 'Hale', suf: 'of the Bear' },
  sta:     { label: v => `+${v} Stamina`, min: 6, max: 14, per: 1.2, pre: 'Tireless', suf: 'of the Ox' },
  staRegen:{ label: v => `+${v}% Stamina Regen`, min: 6, max: 15, per: 0.6, pre: 'Breathing', suf: 'of Wind' },
  crit:    { label: v => `+${v}% Crit Chance`, min: 2, max: 5, per: 0.25, pre: 'Keen', suf: 'of Precision' },
  critDmg: { label: v => `+${v}% Crit Damage`, min: 10, max: 25, per: 1.2, pre: 'Savage', suf: 'of Slaughter' },
  mana:    { label: v => `+${v} Mana`, min: 6, max: 14, per: 1.2, pre: 'Arcane', suf: 'of the Owl' },
  cdr:     { label: v => `+${v}% Cooldown Speed`, min: 4, max: 9, per: 0.35, pre: 'Swift-Minded', suf: 'of Haste' },
  speed:   { label: v => `+${v}% Move Speed`, min: 3, max: 7, per: 0.2, pre: 'Fleet', suf: 'of the Hare' },
  leech:   { label: v => `+${v}% Life Steal`, min: 1, max: 3, per: 0.12, pre: 'Vampiric', suf: 'of the Leech' },
  armor:   { label: v => `+${v} Armor`, min: 3, max: 8, per: 0.7, pre: 'Sturdy', suf: 'of Stone' },
  magic:   { label: v => `+${v}% Spell Damage`, min: 5, max: 12, per: 0.6, pre: 'Mystic', suf: 'of Sorcery' },
};
const EPIC_NAMES = ['Duskfang', 'Ember Oath', 'Hearthwarden', 'Sorrowmend', 'Gloamcutter', 'Ashen Vow', 'Night\'s Mercy', 'Lantern of Ruin', 'Kingsbane', 'Tidebreaker', 'Thornheart', 'Grave Whisper'];
const MATERIALS = {
  iron:  { name: 'Iron Scrap',   color: '#9aa3ad' },
  bone:  { name: 'Grave Dust',   color: '#d8cfb4' },
  wood:  { name: 'Heartwood',    color: '#6fae4f' },
  pearl: { name: 'Tide Pearl',   color: '#7fe0e6' },
  ember: { name: 'Ember Shard',  color: '#ff8a3a' },
};

function rollRarity(rng, luck = 0, minR = 'common') {
  const r = rng();
  let k = r < 0.03 + luck * 0.6 ? 'epic' : r < 0.14 + luck ? 'rare' : r < 0.42 + luck ? 'uncommon' : 'common';
  if (RARITY[k].i < RARITY[minR].i) k = minR;
  return k;
}
// Generate a random item. opts: {slot, rarity, minRarity, luck, rng}
function genItem(ilvl, opts = {}) {
  const rng = opts.rng || Math.random;
  const R = a => a[Math.floor(rng() * a.length)];
  const slot = opts.slot || (rng() < 0.45 ? 'weapon' : rng() < 0.55 ? 'armor' : 'trinket');
  const rarity = opts.rarity || rollRarity(rng, opts.luck || 0, opts.minRarity);
  const rr = RARITY[rarity];
  const tierIdx = clamp(Math.floor(ilvl / 4), 0, 4);
  const it = { uid: uid(), slot, rarity, ilvl, upg: 0, affixes: [] };
  if (slot === 'weapon') {
    it.type = opts.type || R(Object.keys(WEAPONS));
    const W = WEAPONS[it.type];
    it.base = { atk: Math.round(W.dmg * (1 + ilvl * 0.13) * rr.mult * (0.92 + rng() * 0.16)) };
    it.baseName = W.names[clamp(tierIdx, 0, W.names.length - 1)];
  } else if (slot === 'armor') {
    it.type = opts.type || R(Object.keys(ARMORS));
    const A = ARMORS[it.type];
    const m = (1 + ilvl * 0.12) * rr.mult;
    it.base = { armor: Math.round(A.armor * m), hp: Math.round(A.hp * m) };
    if (A.mana) it.base.mana = Math.round(A.mana * m);
    if (A.speed) it.base.speed = Math.round(A.speed * 100);
    it.baseName = A.names[clamp(tierIdx, 0, A.names.length - 1)];
  } else {
    it.type = opts.type || R(Object.keys(TRINKETS));
    const T = TRINKETS[it.type];
    it.base = { [T.imp]: Math.round(T.impV * (1 + ilvl * 0.08) * rr.mult) };
    it.baseName = T.names[clamp(tierIdx, 0, T.names.length - 1)];
  }
  const pool = Object.keys(AFFIXES).filter(k => !(it.base[k]));
  for (let i = 0; i < rr.affixes && pool.length; i++) {
    const k = pool.splice(Math.floor(rng() * pool.length), 1)[0], A = AFFIXES[k];
    const v = Math.max(1, Math.round(A.min + (A.max - A.min) * rng() + A.per * ilvl));
    it.affixes.push({ k, v });
  }
  if (rarity === 'epic') it.name = R(EPIC_NAMES);
  else if (it.affixes.length === 1) it.name = AFFIXES[it.affixes[0].k].pre + ' ' + it.baseName;
  else if (it.affixes.length === 2) it.name = AFFIXES[it.affixes[0].k].pre + ' ' + it.baseName + ' ' + AFFIXES[it.affixes[1].k].suf;
  else it.name = it.baseName;
  return it;
}
// total stats an item grants (upgrade level boosts base stats 10% per level)
function itemStats(it) {
  const s = {}, um = 1 + (it.upg || 0) * 0.1;
  for (const k in it.base) s[k] = (s[k] || 0) + (k === 'speed' ? it.base[k] : Math.round(it.base[k] * um));
  for (const a of it.affixes) s[a.k] = (s[a.k] || 0) + a.v;
  return s;
}
const STAT_LABEL = {
  atk: 'Attack', dmg: 'Damage %', armor: 'Armor', hp: 'Health', mana: 'Mana', speed: 'Move Speed %', crit: 'Crit %', sta: 'Stamina',
  staRegen: 'Stamina Regen %', critDmg: 'Crit Damage %', cdr: 'Cooldown %', leech: 'Life Steal %', magic: 'Spell Damage %',
};
const POWER_W = { atk: 3, armor: 1.5, hp: 0.5, mana: 0.4, dmg: 2, crit: 3, critDmg: 0.8, sta: 0.6, staRegen: 0.8, cdr: 2.5, speed: 3, leech: 6, magic: 1.6 };
function itemPower(it) { const s = itemStats(it); let p = 0; for (const k in s) p += (POWER_W[k] || 0) * s[k]; return p; }
function itemDisplayName(it) { return (it.upg ? `+${it.upg} ` : '') + it.name; }
function itemKind(it) {
  if (it.slot === 'weapon') return `${RARITY[it.rarity].name} ${WEAPONS[it.type].name}`;
  if (it.slot === 'armor') return `${RARITY[it.rarity].name} ${ARMORS[it.type].name} Armor`;
  return `${RARITY[it.rarity].name} ${TRINKETS[it.type].name}`;
}
function itemValue(it) { return Math.round((8 + it.ilvl * 4) * RARITY[it.rarity].value * (1 + (it.upg || 0) * 0.3)); }
const MAX_UPG = 10;
function upgradeCost(it) {
  const u = it.upg || 0, r = RARITY[it.rarity].i;
  const c = { gold: Math.round((30 + it.ilvl * 6) * (1 + u * 0.6) * (1 + r * 0.25)), iron: 2 + u * 2 };
  const special = u >= 3 ? (it.ilvl < 6 ? 'bone' : it.ilvl < 11 ? 'wood' : 'pearl') : null;
  if (special) c[special] = u - 1;
  if (u >= 7) c.ember = u - 5;
  return c;
}
function salvageYield(it) { const r = RARITY[it.rarity].i; const y = { iron: 1 + r + Math.floor(it.ilvl / 5) }; if (r >= 2) y.ember = r - 1; return y; }

// ---------------------------------------------------------------------------
//  Ability cards. dmg scales with Magic. All effects live in castCard().
// ---------------------------------------------------------------------------
const CARDS = {
  fireball:   { name: 'Fireball',      color: '#ff8a3a', mana: 14, cd: 2.2, rarity: 'common', desc: 'Hurl a blazing orb that explodes on impact, burning foes in a small area.', dmg: 26 },
  groundslam: { name: 'Ground Slam',   color: '#d6a35a', mana: 18, cd: 6,   rarity: 'common', desc: 'Smash the earth, damaging and hurling back everything around you.', dmg: 30 },
  shadowstep: { name: 'Shadow Step',   color: '#9b6cff', mana: 10, cd: 3.5, rarity: 'common', desc: 'Vanish and reappear toward your aim. Invulnerable in transit; leaves a damaging shade.', dmg: 14 },
  healaura:   { name: 'Healing Aura',  color: '#7cf0a0', mana: 26, cd: 15,  rarity: 'common', desc: 'Kindle a sanctuary that heals you and nearby allies over 5 seconds.', heal: 0.07 },
  frostnova:  { name: 'Frost Nova',    color: '#8fe6ff', mana: 22, cd: 9,   rarity: 'uncommon', desc: 'Freeze nearby enemies in place for 2.5s. Frozen foes take 30% more damage.', dmg: 14 },
  chainzap:   { name: 'Chain Lightning', color: '#ffe96a', mana: 18, cd: 4, rarity: 'uncommon', desc: 'Lightning arcs from your hand and leaps between up to 5 enemies.', dmg: 20 },
  whirlwind:  { name: 'Whirlwind',     color: '#e0e0f0', mana: 16, cd: 7,   rarity: 'uncommon', desc: 'Spin with your weapon for 1.1s, cutting everything around you. Move while spinning.', dmg: 12 },
  barrier:    { name: 'Arcane Barrier', color: '#6ad2ff', mana: 20, cd: 14, rarity: 'rare', desc: 'Conjure a shield that absorbs damage equal to 35% of your max health for 6s.' },
  meteor:     { name: 'Meteor',        color: '#ff5a2a', mana: 34, cd: 12,  rarity: 'rare', desc: 'Call a meteor down at your aim. Massive damage after a short delay.', dmg: 70 },
  icelance:   { name: 'Ice Lance',     color: '#bff4ff', mana: 13, cd: 2.8, rarity: 'uncommon', desc: 'A fast lance of ice that pierces through every enemy in a line, chilling them.', dmg: 22 },
  warcry:     { name: 'War Cry',       color: '#ff6a5a', mana: 15, cd: 16,  rarity: 'rare', desc: 'Rally! You and nearby allies deal +30% damage and regain stamina 50% faster for 8s.' },
  venomfan:   { name: 'Venom Fan',     color: '#9be86a', mana: 12, cd: 3.2, rarity: 'uncommon', desc: 'Throw five poisoned knives in a fan. Poison deals damage over 4s.', dmg: 9 },
  spiritblades:{ name: 'Spirit Blades', color: '#c9a6ff', mana: 24, cd: 10, rarity: 'epic', desc: 'Summon three orbiting spectral blades that shred nearby enemies for 7s.', dmg: 8 },
};
const STARTER_CARDS = ['fireball', 'groundslam', 'shadowstep', 'healaura'];

// ---------------------------------------------------------------------------
//  Enemies. Attack timings are in seconds. 'tele' = telegraph (wind-up).
// ---------------------------------------------------------------------------
const ENEMIES = {
  grunt:   { name: 'Grunt', hp: 42, dmg: 13, speed: 50, r: 6, poise: 18, xp: 10, gold: [2, 6], ai: 'grunt', mass: 1 },
  archer:  { name: 'Archer', hp: 28, dmg: 11, speed: 46, r: 6, poise: 10, xp: 11, gold: [2, 6], ai: 'archer', mass: 0.8 },
  shield:  { name: 'Shieldbearer', hp: 70, dmg: 15, speed: 34, r: 7, poise: 40, xp: 16, gold: [3, 8], ai: 'shield', mass: 2 },
  flanker: { name: 'Flanker', hp: 24, dmg: 9, speed: 100, r: 5, poise: 6, xp: 9, gold: [1, 4], ai: 'flanker', mass: 0.6 },
  caster:  { name: 'Caster', hp: 34, dmg: 17, speed: 40, r: 6, poise: 10, xp: 14, gold: [3, 8], ai: 'caster', mass: 0.8 },
  elite:   { name: 'Elite', hp: 360, dmg: 20, speed: 46, r: 11, poise: 140, xp: 90, gold: [25, 45], ai: 'elite', mass: 6, elite: true },
  pot:     { name: 'Pot', hp: 1, r: 5, ai: 'none', mass: 99, prop: true },
};
// biome-specific skins/names for the generic archetypes
const BIOME_ENEMIES = {
  crypt:  { grunt: 'Restless Bones', archer: 'Bone Archer', shield: 'Crypt Warden', flanker: 'Grave Rat', caster: 'Hollow Acolyte', elite: 'The Gravewarden' },
  forest: { grunt: 'Thornling', archer: 'Bramble Stalker', shield: 'Bark Golem', flanker: 'Feral Wolf', caster: 'Spore Witch', elite: 'Old Rootbeast' },
  cave:   { grunt: 'Drowned Thrall', archer: 'Reef Spitter', shield: 'Shellguard', flanker: 'Reef Crawler', caster: 'Tide Priest', elite: 'The Deep Brute' },
};

const BOSSES = {
  hollowking: {
    name: 'The Hollow King', sub: 'Lord of the Sunken Crypt', hp: 1500, r: 16, speed: 44, dmg: 26, poise: 9999, xp: 600,
    phases: [
      { at: 1.0, moves: { combo: 3, slam: 2, fan: 2 }, speed: 1 },
      { at: 0.6, moves: { combo: 3, slam: 2, fan: 2, summon: 1, leap: 2 }, speed: 1.12, msg: 'The Hollow King draws his second blade!' },
      { at: 0.3, moves: { combo: 3, leap: 2, ring: 2, delayslam: 2, summon: 1 }, speed: 1.25, msg: 'The crown burns with cold fire!' },
    ], summon: 'grunt',
  },
  thornmother: {
    name: 'Thornmother', sub: 'Heart of the Overgrown Ruins', hp: 1900, r: 20, speed: 30, dmg: 28, poise: 9999, xp: 900,
    phases: [
      { at: 1.0, moves: { roots: 3, spores: 2, sweep: 2 }, speed: 1 },
      { at: 0.6, moves: { roots: 3, spores: 2, sweep: 2, summon: 1, rain: 2 }, speed: 1.1, msg: 'The Thornmother uproots herself!' },
      { at: 0.3, moves: { roots: 2, rain: 2, ring: 2, charge: 2, sweep: 1 }, speed: 1.25, msg: 'Thorns erupt across the ruins!' },
    ], summon: 'flanker',
  },
  tidewyrm: {
    name: 'The Tidewyrm', sub: 'Terror of the Flooded Grotto', hp: 2300, r: 18, speed: 50, dmg: 30, poise: 9999, xp: 1300,
    phases: [
      { at: 1.0, moves: { dive: 2, fan: 2, charge: 2, ring: 1 }, speed: 1 },
      { at: 0.6, moves: { dive: 2, fan: 2, wave: 2, charge: 2, ring: 1 }, speed: 1.12, msg: 'The waters churn and rise!' },
      { at: 0.3, moves: { dive: 2, wave: 2, beam: 2, ring: 2, summon: 1 }, speed: 1.25, msg: 'Lightning crackles across the Tidewyrm!' },
    ], summon: 'flanker',
  },
};

const DUNGEONS = {
  crypt: {
    name: 'The Sunken Crypt', short: 'Crypt', blurb: 'Bone-choked halls beneath the old chapel. The dead do not rest here.', level: 1, boss: 'hollowking', mat: 'bone', music: 'crypt',
    pool: ['grunt', 'grunt', 'archer', 'flanker', 'shield', 'caster'], card: 'frostnova', unlockAfter: null,
    pal: { floor: '#2a2135', floor2: '#30263d', floorLine: '#1c1526', wall: '#3b2f4d', wallTop: '#191222', wallLine: '#271d34', accent: '#5d4a78', ambient: '#1a1028', fog: '#2b1840', torch: '#ff9a3c' },
  },
  forest: {
    name: 'The Overgrown Ruins', short: 'Ruins', blurb: 'A drowned temple swallowed by a hungry forest. Something old stirs at its heart.', level: 5, boss: 'thornmother', mat: 'wood', music: 'forest',
    pool: ['grunt', 'archer', 'flanker', 'flanker', 'shield', 'caster'], card: 'chainzap', unlockAfter: 'crypt',
    pal: { floor: '#24301f', floor2: '#2b3a24', floorLine: '#192216', wall: '#3d4a33', wallTop: '#141c12', wallLine: '#29331f', accent: '#6b8f4a', ambient: '#122016', fog: '#1d3320', torch: '#ffb35a' },
  },
  cave: {
    name: 'The Flooded Grotto', short: 'Grotto', blurb: 'Black water and glowing pearls. The tide here answers to something vast.', level: 10, boss: 'tidewyrm', mat: 'pearl', music: 'cave',
    pool: ['grunt', 'archer', 'archer', 'flanker', 'shield', 'caster'], card: 'meteor', unlockAfter: 'forest',
    pal: { floor: '#1d2a33', floor2: '#22323d', floorLine: '#141e25', wall: '#2c3f4c', wallTop: '#0e161c', wallLine: '#1d2b35', accent: '#3fb7c1', ambient: '#0c1824', fog: '#123040', torch: '#7fe8ff' },
  },
};
const TIERS = [
  { name: 'Normal', lvl: 0, hp: 1, dmg: 1, luck: 0 },
  { name: 'Veteran', lvl: 4, hp: 1.6, dmg: 1.35, luck: 0.05 },
  { name: 'Nightmare', lvl: 9, hp: 2.6, dmg: 1.8, luck: 0.12 },
];
function partyScale(n) { return { hp: 1 + 0.65 * (n - 1), bossHp: 1 + 0.8 * (n - 1), dmg: 1 + 0.08 * (n - 1) }; }

// ---------------------------------------------------------------------------
//  Village progression
// ---------------------------------------------------------------------------
const VILLAGE_UNLOCKS = [
  { id: 'merchant', name: "Mira's Trading Post", req: p => p.flags.clears.crypt || p.level >= 3, hint: 'Clear the Sunken Crypt or reach level 3' },
  { id: 'arcanist', name: "Vesh's Arcane Tower", req: p => p.flags.clears.crypt, hint: 'Defeat the Hollow King' },
  { id: 'houses', name: 'Rebuilt Homes', req: p => p.flags.clears.crypt && p.level >= 4, hint: 'Clear the Crypt and reach level 4' },
  { id: 'tavern', name: 'The Ember Mug Tavern', req: p => p.flags.clears.forest, hint: 'Defeat the Thornmother' },
  { id: 'lanterns', name: 'Lantern Road', req: p => (p.stats.bounties || 0) >= 3, hint: 'Complete 3 bounties' },
  { id: 'monument', name: 'Monument of the Hearth', req: p => p.flags.clears.cave, hint: 'Defeat the Tidewyrm' },
];
function villageRenown(p) { return VILLAGE_UNLOCKS.filter(u => u.req(p)).length; }

// bounties for the quest board
const BOUNTY_TEMPLATES = [
  { id: 'kill_any', t: n => `Thin the Horde`, d: n => `Slay ${n} enemies in any dungeon.`, n: [20, 35], key: 'kill', rew: n => ({ gold: n * 6, xp: n * 6 }) },
  { id: 'kill_grunt', t: n => `Bone Collector`, d: n => `Slay ${n} grunts.`, n: [10, 16], key: 'kill_grunt', rew: n => ({ gold: n * 8, iron: 4 }) },
  { id: 'kill_archer', t: n => `Silence the Bows`, d: n => `Slay ${n} archers.`, n: [6, 10], key: 'kill_archer', rew: n => ({ gold: n * 12, iron: 3 }) },
  { id: 'kill_shield', t: n => `Shield Breaker`, d: n => `Slay ${n} shieldbearers.`, n: [4, 7], key: 'kill_shield', rew: n => ({ gold: n * 16, ember: 1 }) },
  { id: 'kill_caster', t: n => `Hex Hunter`, d: n => `Slay ${n} casters.`, n: [4, 8], key: 'kill_caster', rew: n => ({ gold: n * 14, xp: n * 15 }) },
  { id: 'kill_elite', t: n => `Champion's Bane`, d: n => `Defeat ${n} elite champion${n > 1 ? 's' : ''}.`, n: [1, 2], key: 'kill_elite', rew: n => ({ gold: n * 90, ember: n }) },
  { id: 'chests', t: n => `Treasure Hunter`, d: n => `Open ${n} chests.`, n: [3, 6], key: 'chest', rew: n => ({ gold: n * 25 }) },
  { id: 'boss', t: n => `Kingslayer`, d: n => `Defeat any dungeon boss.`, n: [1, 1], key: 'boss', rew: n => ({ gold: 250, ember: 2, xp: 200 }) },
  { id: 'pots', t: n => `Pot Smasher`, d: n => `Smash ${n} pots and urns.`, n: [10, 20], key: 'pot', rew: n => ({ gold: n * 4, xp: n * 3 }) },
  { id: 'parry', t: n => `Perfect Guard`, d: n => `Parry ${n} attacks with a perfect block.`, n: [3, 6], key: 'parry', rew: n => ({ gold: n * 25, ember: 1 }) },
];
function dailyBounties(dateStr) {
  const rng = new RNG(strHash('bounty' + dateStr));
  const ids = rng.shuffle(BOUNTY_TEMPLATES.map(b => b.id)).slice(0, 4);
  return ids.map(id => { const T = BOUNTY_TEMPLATES.find(b => b.id === id); const n = rng.int(T.n[0], T.n[1]); return { id: id + '_' + dateStr, tid: id, n, daily: true, date: dateStr }; });
}

const ACHIEVEMENTS = [
  { id: 'firstblood', name: 'First Blood', desc: 'Slay your first enemy.', test: p => p.stats.kills >= 1 },
  { id: 'slayer100', name: 'Slayer', desc: 'Slay 100 enemies.', test: p => p.stats.kills >= 100 },
  { id: 'slayer500', name: 'Legend of the Hearth', desc: 'Slay 500 enemies.', test: p => p.stats.kills >= 500 },
  { id: 'crypt', name: 'Crownbreaker', desc: 'Defeat the Hollow King.', test: p => p.flags.clears.crypt },
  { id: 'forest', name: 'Weedkiller', desc: 'Defeat the Thornmother.', test: p => p.flags.clears.forest },
  { id: 'cave', name: 'Tidebreaker', desc: 'Defeat the Tidewyrm.', test: p => p.flags.clears.cave },
  { id: 'lvl5', name: 'Seasoned', desc: 'Reach level 5.', test: p => p.level >= 5 },
  { id: 'lvl10', name: 'Veteran', desc: 'Reach level 10.', test: p => p.level >= 10 },
  { id: 'lvl20', name: 'Hero of Hearthlight', desc: 'Reach level 20.', test: p => p.level >= 20 },
  { id: 'epic', name: 'Purple Haze', desc: 'Find an Epic item.', test: p => p.stats.epics >= 1 },
  { id: 'upgrade5', name: 'Master Smith', desc: 'Upgrade an item to +5.', test: p => p.stats.maxUpg >= 5 },
  { id: 'cards8', name: 'Card Sharp', desc: 'Own 8 ability cards.', test: p => p.cards.owned.length >= 8 },
  { id: 'parry10', name: 'Unbreakable', desc: 'Perform 10 perfect parries.', test: p => (p.stats.parry || 0) >= 10 },
  { id: 'bounty5', name: 'Bounty Hunter', desc: 'Complete 5 bounties.', test: p => (p.stats.bounties || 0) >= 5 },
  { id: 'rich', name: 'Gold Hoarder', desc: 'Hold 2,000 gold at once.', test: p => p.gold >= 2000 },
  { id: 'revive', name: 'Not Today', desc: 'Revive a fallen ally.', test: p => (p.stats.revives || 0) >= 1 },
  { id: 'coop', name: 'Fellowship', desc: 'Clear a dungeon with a friend.', test: p => (p.stats.coopClears || 0) >= 1 },
  { id: 'nightmare', name: 'Into the Nightmare', desc: 'Clear any dungeon on Nightmare.', test: p => (p.stats.nightmare || 0) >= 1 },
  { id: 'village', name: 'The Hearth Burns Bright', desc: 'Unlock every village building.', test: p => villageRenown(p) >= VILLAGE_UNLOCKS.length },
];

const PLAYER_COLORS = ['#3fc9c0', '#ff8a3a', '#c56cff', '#ffd23f', '#5aa0ff', '#ff5a7a'];
const XP_FOR = lvl => Math.round(60 * Math.pow(lvl, 1.55));
const MAX_LEVEL = 30;

const NPC_LINES = {
  brann: ['Bring me iron and I\'ll make that blade sing.', 'Steel remembers every strike. So should you.', 'The crypt\'s bones make fine flux, oddly enough.', 'Upgrades are permanent. The rust on your armor, sadly, is too.'],
  mira: ['Gold for goods, goods for gold. Simple as sunrise.', 'Found something shiny? I\'ll take it off your hands.', 'Potions! Get your potions! Dying is bad for business.', 'Bigger flasks, longer life. That\'s my motto this week.'],
  hessa: ['The Hearth is all that keeps the dark at bay. Feed it with deeds.', 'Every champion you fell, the village breathes a little easier.', 'Take a bounty. The board never empties.', 'Rest here, child. The dungeons will still be hungry tomorrow.'],
  vesh: ['Cards are memories of power. I simply... borrow them.', 'Mana is patience made visible.', 'The Tidewyrm guards something I would very much like to study.'],
  bard: ['♪ Oh the Hollow King had a crown of frost... ♪', 'Buy a drink! Or don\'t. I play either way.', 'Every hero gets a song. Most of them are short.'],
};

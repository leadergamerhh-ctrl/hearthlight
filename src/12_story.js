// ============================================================================
//  Story mode: the campaign of the Ember Heart.
//  Three fallen guardians each hold a shard of the Ember Heart that keeps the
//  Hearth alive. Free them, bring the shards home, then descend into the Hollow
//  Below to end the Pale Sovereign, the cold that eats light.
// ============================================================================

// who can speak, and how to cut a portrait from their sprite
const SPEAKERS = {
  hessa: { name: 'Elder Hessa', spr: () => SPR.npc_hessa, crop: [4, 0, 16, 18], color: '#f0d8a8' },
  brann: { name: 'Brann', spr: () => SPR.npc_brann, crop: [4, 1, 16, 18], color: '#ffb36a' },
  mira: { name: 'Mira', spr: () => SPR.npc_mira, crop: [4, 0, 16, 18], color: '#f0b752' },
  vesh: { name: 'Vesh', spr: () => SPR.npc_vesh, crop: [4, 0, 16, 18], color: '#c9a6ff' },
  hero: { name: null, spr: () => playerSprite(G.P ? G.P.color : '#3fc9c0'), crop: [4, 0, 16, 18], color: null },
  king: { name: 'The Hollow King', spr: () => SPR.hollowking, crop: [13, 0, 32, 30], color: '#8ff3ff' },
  thorn: { name: 'Thornmother', spr: () => SPR.thornmother, crop: [16, 4, 44, 40], color: '#ff8ab8' },
  wyrm: { name: 'The Tidewyrm', spr: () => SPR.tidewyrm, crop: [12, 0, 46, 34], color: '#7fe8ff' },
  sov: { name: 'The Pale Sovereign', spr: () => SPR.sovereign, crop: [12, 0, 34, 32], color: '#d8e8ff' },
  narr: { name: null },
};

// a scene is a list of steps: [speaker, text] or {cam|fx|sfx|banner}
const STORY = {
  prologue: [
    { cam: 'hearth' },
    ['narr', 'Night has teeth in the valley now. Only one light still burns.'],
    ['hessa', 'So the road brought you here after all. Few walk it anymore.'],
    ['hessa', 'This is Hearthlight. That fire is the last true flame in the valley. When it dies, the dark finishes what it started.'],
    ['hero', 'It looks strong enough to me.'],
    ['hessa', 'Look closer. It burns lower, and colder, every night. Something beneath the old places is drinking its light.'],
    ['hessa', 'Long ago the Ember Heart was split into three shards. Three guardians swore to hide them from the thing below: a king, a forest warden, and the sea\'s own beast.'],
    ['hessa', 'They have been alone in the dark too long. Whatever they are now, they still hold the shards. Bring them home, and the Hearth may wake.'],
    ['hessa', 'Start with the Sunken Crypt beneath the old chapel. The Dungeon Gate to the north will take you. Brann at the forge can keep your steel sharp.'],
  ],
  crypt_enter: [
    ['narr', 'The air smells of cold stone and old candle wax. Somewhere below, armour scrapes against bone.'],
    ['hero', 'Hessa said the first guardian was a king. Kings don\'t give things back easily.'],
  ],
  hollowking_intro: [
    { cam: 'boss' },
    ['king', 'Another thief, come for my crown.'],
    ['king', 'I have kept it through ten thousand nights. I will keep it through ten thousand more.'],
    ['hero', 'Your people need what you\'re guarding. Hearthlight is dying.'],
    ['king', 'Hearthlight... I remember warmth. I no longer remember why it mattered. Come, then. Let steel decide.'],
  ],
  hollowking_dead: [
    ['king', 'Ah... the cold... it lets go of me.'],
    ['king', 'Take the shard, child. Tell them Aldric kept his oath... longer than he should have.'],
    { banner: ['Shard of the Crown', 'The first piece of the Ember Heart'] },
  ],
  crypt_return: [
    { cam: 'hearth' }, { fx: 'flare' },
    ['hessa', 'Look! The Hearth remembers its shard. It hasn\'t burned this bright in a generation.'],
    ['brann', 'Felt it from the forge. Even the iron sings warmer. Whatever you did down there, do it twice more.'],
    ['hessa', 'The second guardian is Sylwen, warden of the old grove. The forest swallowed her temple, and maybe her with it. The Gate can take you to the Overgrown Ruins now.'],
  ],
  forest_enter: [
    ['narr', 'The ruins breathe. Roots shift whenever you look away.'],
    ['narr', 'Pale flowers turn to follow you, like faces.'],
  ],
  thornmother_intro: [
    { cam: 'boss' },
    ['thorn', 'Little ember. Little spark. You smell of ash and fire.'],
    ['thorn', 'Fire is what he wants. Fire is what I hide. Every root in this place is a wall around it.'],
    ['hero', 'Sylwen? Hessa sent me. The shard belongs to the Hearth now.'],
    ['thorn', 'Sylwen was a name. Now I am only the forest\'s teeth. Come closer, and be planted.'],
  ],
  thornmother_dead: [
    ['thorn', 'The roots... loosen. I can hear the wind again.'],
    ['thorn', 'Carry the Shard of the Root home. And when the war is done, let this grove rest. It has earned it.'],
    { banner: ['Shard of the Root', 'The second piece of the Ember Heart'] },
  ],
  forest_return: [
    { cam: 'hearth' }, { fx: 'flare' },
    ['mira', 'Customers are back! Farm folk saw the light from the hills. Business is warming up, in more ways than one.'],
    ['hessa', 'Two shards. The Hearth\'s song is almost whole.'],
    ['hessa', 'The last guardian never had a name. The fishers called it the Tidewyrm. It carried the Shard of the Tide into the drowned grotto under the cliffs.'],
    ['vesh', 'Mind the deep pools down there. The things in that grotto have been listening to something beneath them.'],
  ],
  cave_enter: [
    ['narr', 'Black water laps at the stones. Every drip echoes like a footstep.'],
    ['narr', 'Far below, something vast turns over in its sleep.'],
  ],
  tidewyrm_intro: [
    { cam: 'boss' },
    ['narr', 'The water heaves. Two lamps of yellow light open in the dark.'],
    ['wyrm', 'It does not speak. It only bares its teeth, and behind them glows a faint ember light.'],
    ['hero', 'Easy. I\'m not here to hurt you. I need that light.'],
    ['narr', 'The Tidewyrm roars, and the whole grotto roars with it.'],
  ],
  tidewyrm_dead: [
    ['narr', 'The great body sinks, almost gently. As the water settles, the shard drifts up into your hands, warm as a heartbeat.'],
    ['narr', 'Beneath where the wyrm lay, a crack in the sea floor breathes out freezing air.'],
    { banner: ['Shard of the Tide', 'The Ember Heart is whole again'] },
  ],
  cave_return: [
    { cam: 'hearth' },
    ['hessa', 'All three. Set them in the fire.'],
    { fx: 'flare' },
    ['narr', 'The shards sink into the Hearth. For a heartbeat the whole valley is bright as noon.'],
    ['hessa', 'There. The Ember Heart is whole, and now it can see what we couldn\'t.'],
    ['vesh', 'The Gate is humming. It has found a new road, deeper than any map. Down into the Hollow Below.'],
    ['hessa', 'That is where it waits. The Pale Sovereign, the cold that eats light. The guardians held it back for centuries. Now it\'s your turn.'],
    ['brann', 'Here. I sharpened everything you own. Twice. Come back so I can do it again.'],
  ],
  abyss_enter: [
    ['narr', 'There is no sound here. Even the torches burn pale and blue.'],
    ['narr', 'Frost covers the walls in the shape of reaching hands.'],
  ],
  sovereign_intro: [
    { cam: 'boss' },
    ['sov', 'So. The little fire sends its last spark.'],
    ['sov', 'I wore down a king. I rotted a forest. I drowned the sea\'s own god. What are you?'],
    ['hero', 'Someone who keeps coming home.'],
    ['sov', 'Then let us see how long you burn.'],
  ],
  sovereign_dead: [
    ['sov', 'Impossible... so small... so warm...'],
    ['narr', 'The Pale Sovereign shatters like a winter lake. For the first time in a thousand years, the Hollow Below is silent, and warm.'],
    ['narr', 'Far above, faint as a dream, you can hear a village cheering.'],
  ],
  epilogue: [
    { cam: 'hearth' }, { fx: 'flare' },
    ['hessa', 'You came back. Of course you did.'],
    ['hessa', 'Look at it. The Hearth doesn\'t flicker anymore. Children are sleeping without candles for the first time in my life.'],
    ['brann', 'Drinks are on Mira.'],
    ['mira', 'Drinks are absolutely not on Mira.'],
    ['vesh', 'Aldric, Sylwen, the wyrm. I\'ll carve their names on the monument. Yours too, if you\'ll let me.'],
    ['hessa', 'The long night is over. But the dark is patient, and the old places are still full of trouble. Hearthlight will always need a keeper.'],
    { credits: true },
  ],
};
// boss key -> scene ids
const BOSS_SCENES = { hollowking: 'hollowking', thornmother: 'thornmother', tidewyrm: 'tidewyrm', sovereign: 'sovereign' };
const RETURN_SCENES = [['abyss', 'epilogue'], ['cave', 'cave_return'], ['forest', 'forest_return'], ['crypt', 'crypt_return']];

// lore carved into memory stones, four per dungeon
const LORE = {
  crypt: [
    ['The Oath', 'King Aldric took the Shard of the Crown into the earth so the light could never be stolen. His knights followed him down. None came back up.'],
    ['Day Four Hundred', 'The candles will not stay lit. The King says the cold is only the stone. The King no longer eats.'],
    ['A Shaking Hand', 'Scratched deep into the wall: HE WHISPERS THROUGH THE SHARD. HE SAYS THE FIRE ABOVE IS A LIE.'],
    ['The Roll of Knights', 'A list of names, each one struck through. The last line reads: "Only I remain to keep it. Only I."'],
  ],
  forest: [
    ['The Planting', 'Sylwen set the Shard of the Root in the heart of the oldest tree, so the forest itself would guard it.'],
    ['Hunger', 'The trees grew too fast after that, and grew hungry. Sylwen said they were only protecting her.'],
    ['Carved in Bark', 'SHE DOES NOT SLEEP. SHE DOES NOT LEAVE. SHE HAS BECOME THE TREE.'],
    ['A Child\'s Drawing', 'A woman with flowers in her hair, smiling. Someone has carved thorns over her face.'],
  ],
  cave: [
    ['The Fishers\' Song', 'The fishers sang that the wyrm guarded the bay long before the village. It took the Shard of the Tide without being asked.'],
    ['Pearls', 'Pearls grow here around tiny splinters of light. The shard is bleeding into the water.'],
    ['The Priests\' Warning', 'THE COLD ONE SPEAKS FROM UNDER THE SEA FLOOR. THE WYRM IS ALL THAT HOLDS THE DOOR.'],
    ['Claw Marks', 'Deep gouges in the stone, as if something enormous was dragged downward and fought every inch.'],
  ],
  abyss: [
    ['The Fallen Star', 'Before the valley had a name, a star fell and did not burn. It only grew cold, and hungry for every light it could reach.'],
    ['The First Fire', 'The first villagers built the Hearth to hide their fire from it. The Ember Heart is the warmth of every home, gathered into one flame.'],
    ['Frost-Script', 'GIVE ME THE LAST FIRE AND I WILL LET YOU SLEEP.'],
    ['Four Shadows', 'Three shapes are etched into the ice: a crowned king, a woman wreathed in roots, a great coiled beast. Beneath them, a fourth shape, unfinished. Yours.'],
  ],
};
const LORE_TOTAL = Object.values(LORE).reduce((a, l) => a + l.length, 0);

// chapter-aware village chatter
const NPC_STORY = {
  hessa: [['The Hearth is fading. The Sunken Crypt waits beyond the Gate.'], ['One shard home. Sylwen\'s grove is next, in the Overgrown Ruins.'], ['Two shards. Only the Tidewyrm\'s remains, deep in the Flooded Grotto.'], ['The Heart is whole. The Hollow Below is open. Be careful, child.'], ['The fire is safe. Rest, then go and make the old places quiet again.']],
  brann: [['Bring me iron and I\'ll make that blade sing. You\'ll need it down there.'], ['Aldric\'s crypt steel was good once. Bring me scraps, I\'ll make it good again.'], ['The forge hasn\'t been this hot in years. Must be your shards.'], ['Everything you own, sharpened twice. Go end it.'], ['Heard they\'re carving your name on the monument. Spell it right, Vesh.']],
  mira: [['Gold for goods, goods for gold. Times are hard; prices are fair-ish.'], ['A shard of the Ember Heart! I don\'t suppose it\'s for sale.'], ['More travellers every night. They come for the light. They stay for my prices.'], ['If you don\'t come back, can I have your stash?'], ['Business has never been better. The valley owes you. I don\'t, technically.']],
  vesh: [['The cards remember power. The Hearth remembers warmth. Both are fading.'], ['The shard sings in a key I\'ve never heard. Fascinating.'], ['Two shards, and the Gate has started whispering. I don\'t like what it says.'], ['The Hollow Below is older than the valley. Trust nothing there that speaks.'], ['I\'m writing it all down. Someone should remember how the long night ended.']],
};
function storyChapter(P) { const c = P.flags.clears; return c.abyss ? 4 : c.cave ? 3 : c.forest ? 2 : c.crypt ? 1 : 0; }
function npcLine(id) {
  const P = G.P;
  if (P && P.story && P.story.on && NPC_STORY[id]) return pick(NPC_STORY[id][storyChapter(P)]);
  return NPC_LINES[id] ? pick(NPC_LINES[id]) : '';
}
function storyObjective(P) {
  if (!P || !P.story || !P.story.on) return '';
  const c = P.flags.clears;
  if (!P.story.seen.prologue) return 'Speak with Elder Hessa by the Hearth';
  if (!c.crypt) return 'Free the guardian of the Sunken Crypt';
  if (!c.forest) return 'Free the guardian of the Overgrown Ruins';
  if (!c.cave) return 'Free the guardian of the Flooded Grotto';
  if (!c.abyss) return 'Descend into the Hollow Below and face the Pale Sovereign';
  return 'The Hearth endures. Veteran and Nightmare tiers await.';
}

// ---------------------------------------------------------------------------
//  Dialogue / cutscene runner
//  modal: full dialogue box, advances on E/Space/Enter/click (solo also pauses the world)
//  bark: subtitle-style, auto-advances, never blocks (used in co-op dungeons)
// ---------------------------------------------------------------------------
const Story = {
  el: null, steps: null, i: 0, chars: 0, line: null, modal: false, onEnd: null, wait: 0, blipT: 0, queue: [],
  init() {
    const css = document.createElement('style');
    css.textContent = `
#dlg{position:absolute;left:50%;bottom:86px;transform:translateX(-50%);width:min(760px,92vw);display:flex;gap:14px;align-items:flex-start;padding:14px 16px;pointer-events:auto;
  background:linear-gradient(rgba(33,20,47,.96),rgba(18,11,28,.96));border:2px solid #000;box-shadow:0 0 0 1px var(--border2) inset,0 0 0 3px #000,0 16px 50px #000c;z-index:40;cursor:pointer;user-select:none}
#dlg.bark{bottom:auto;top:96px;width:min(620px,88vw);padding:8px 12px;background:rgba(12,7,20,.82);box-shadow:0 0 0 1px var(--border) inset;pointer-events:none;cursor:default}
#dlg canvas{width:84px;height:84px;image-rendering:pixelated;flex:none;border:1px solid #000;box-shadow:0 0 0 1px var(--border2) inset;background:#120a1c}
#dlg.bark canvas{width:48px;height:48px}
#dlg .dn{font-family:var(--serif);font-size:18px;margin-bottom:4px;letter-spacing:.5px}
#dlg .dt{font-family:var(--serif);font-size:17px;line-height:1.45;color:var(--text);min-height:50px}
#dlg.bark .dt{font-size:15px;min-height:0}
#dlg .dt.narr{font-style:italic;color:#cbb9de}
#dlg .dh{position:absolute;right:12px;bottom:6px;font-size:11px;color:var(--dim);letter-spacing:1px}
#dlg.bark .dh{display:none}
#dlg .dw{flex:1;min-width:0}
#cine-top,#cine-bot{position:absolute;left:0;right:0;height:0;background:#000;transition:height .35s;z-index:39;pointer-events:none}
#cine-top{top:0}#cine-bot{bottom:0}
.cine #cine-top,.cine #cine-bot{height:7vh}
#objective{margin-top:4px;font-size:12px;color:#f0d8a8;text-shadow:0 1px 0 #000;max-width:240px;margin-left:auto;line-height:1.35}
#objective b{color:var(--gold);font-weight:normal;font-family:var(--serif);letter-spacing:1px;font-size:11px;text-transform:uppercase;display:block;opacity:.8}
.endroll{text-align:center;min-width:min(560px,90vw)}
.endroll .t1{font-family:var(--serif);font-size:44px;color:#f7e2bb;text-shadow:0 0 30px rgba(255,150,60,.4);letter-spacing:3px}
.endroll .t2{color:var(--dim);letter-spacing:6px;text-transform:uppercase;font-size:12px;margin:6px 0 18px}
.endroll .roll{height:220px;overflow:hidden;position:relative;mask-image:linear-gradient(transparent,#000 15%,#000 85%,transparent)}
.endroll .roll div{position:absolute;left:0;right:0;animation:roll 26s linear forwards}
.endroll p{margin:10px 0;line-height:1.5}
@keyframes roll{from{transform:translateY(220px)}to{transform:translateY(-100%)}}
@media (prefers-reduced-motion: reduce){.endroll .roll div{animation:none;position:static}.endroll .roll{height:auto;mask-image:none}}
.lore{border-left:2px solid var(--border2);padding:4px 10px;margin:6px 0}
.lore .lt{font-family:var(--serif);color:var(--gold)}
.chap{display:flex;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid #ffffff10}
.chap .cs{width:22px;text-align:center;color:var(--gold)}
.chap.todo{opacity:.45}
`;
    document.head.appendChild(css);
    const hud = $('hud');
    const obj = h('div', { id: 'objective' }); $('minimap-wrap').appendChild(obj);
    $('game').appendChild(h('div', { id: 'cine-top' })); $('game').appendChild(h('div', { id: 'cine-bot' }));
    this.el = h('div', { id: 'dlg', class: 'hidden' }, h('canvas', { width: 32, height: 32 }), h('div', { class: 'dw' }, h('div', { class: 'dn' }), h('div', { class: 'dt' })), h('div', { class: 'dh' }, 'E / SPACE ▸   ESC skip'));
    this.el.addEventListener('mousedown', (e) => { e.stopPropagation(); this.advance(); });
    $('game').appendChild(this.el);
  },
  get active() { return !!this.steps; },
  // play a scene once per save (id), or always when id is null
  play(id, opts = {}) {
    const P = G.P; if (!P || !P.story || !P.story.on) { opts.onEnd && opts.onEnd(); return false; }
    if (id && P.story.seen[id]) return false;
    if (id) { P.story.seen[id] = true; saveGame(); }
    const steps = STORY[id]; if (!steps) return false;
    const bark = opts.bark ?? (Net.role !== 'solo' && G.scene === 'dungeon');
    if (this.steps) { this.queue.push([steps, { ...opts, bark }]); return true; }
    this.start(steps, { ...opts, bark });
    return true;
  },
  start(steps, opts) {
    this.steps = steps; this.i = -1; this.modal = !opts.bark; this.onEnd = opts.onEnd || null;
    G.cutscene = this.modal;
    this.el.classList.toggle('bark', !this.modal); this.el.classList.remove('hidden');
    $('game').classList.toggle('cine', this.modal);
    if (this.modal) { closeMenu(); hideTip(); Input.buf = {}; }
    this.next();
  },
  next() {
    this.i++;
    while (this.steps && this.i < this.steps.length && !Array.isArray(this.steps[this.i])) { this.doStep(this.steps[this.i]); this.i++; if (!this.steps) return; }
    if (!this.steps || this.i >= this.steps.length) { this.end(); return; }
    const [who, text] = this.steps[this.i], S = SPEAKERS[who] || SPEAKERS.narr;
    this.line = { who, text, S }; this.chars = 0; this.wait = 0;
    const name = who === 'hero' ? (G.P ? G.P.name : 'You') : S.name;
    const dn = this.el.querySelector('.dn'), dt = this.el.querySelector('.dt'), cv = this.el.querySelector('canvas');
    dn.textContent = name || ''; dn.style.color = who === 'hero' ? (G.P ? G.P.color : '#fff') : (S.color || '#fff');
    dt.textContent = ''; dt.classList.toggle('narr', who === 'narr' || (who === 'wyrm' && !text.startsWith('"')));
    cv.style.display = S.spr ? '' : 'none';
    if (S.spr) drawPortrait(cv, S);
  },
  doStep(s) {
    if (s.cam === 'hearth' && G.world && G.world.map.hearth) G.camTarget = { x: G.world.map.hearth.x, y: G.world.map.hearth.y - 20 };
    if (s.cam === 'boss' && G.world) { for (const e of G.world.ents.values()) if (e.boss) G.camTarget = { x: (e.x + G.me.x) / 2, y: Math.min(e.y - 30, (e.y + G.me.y) / 2 - 10) }; }
    if (s.cam === 'me') G.camTarget = null;
    if (s.fx === 'flare' && G.world && G.world.map.hearth) {
      const hx = G.world.map.hearth.x, hy = G.world.map.hearth.y; G.flashScreen = 0.5; SFX.play('lootEpic', 0.9); shake(4);
      for (let i = 0; i < 70; i++) { const a = rnd(0, TAU), sp = rnd(30, 160); G.fx.parts.push(part(hx, hy - 10, Math.cos(a) * sp, Math.sin(a) * sp - 60, pick(['#ffd76a', '#ff9a3c', '#fff2c0']), rnd(0.6, 1.4), rnd(1, 3), true, 60)); }
      ringFx(hx, hy, 6, 120, '#ffb35a', 0.6);
    }
    if (s.banner) banner(s.banner[0], s.banner[1], '', 3);
    if (s.credits) this.pendingCredits = true;
  },
  update(dt) {
    if (!this.steps || !this.line) return;
    const L = this.line.text.length;
    if (this.chars < L) {
      this.chars = Math.min(L, this.chars + dt * 48);
      this.el.querySelector('.dt').textContent = this.line.text.slice(0, Math.floor(this.chars));
      this.blipT -= dt; if (this.blipT <= 0 && this.line.who !== 'narr') { this.blipT = 0.07; SFX.play('ui', 0.18, 0.7 + (this.line.who.length % 4) * 0.12); }
    } else if (!this.modal) {
      this.wait += dt; if (this.wait > 1.6 + L * 0.035) this.next();
    }
  },
  advance() {
    if (!this.steps || !this.modal) return;
    if (this.chars < this.line.text.length) { this.chars = this.line.text.length; this.el.querySelector('.dt').textContent = this.line.text; return; }
    SFX.play('ui', 0.4); this.next();
  },
  skip() { if (!this.steps) return; for (let k = this.i + 1; k < this.steps.length; k++) if (!Array.isArray(this.steps[k])) this.doStep(this.steps[k]); this.end(); },
  end() {
    this.steps = null; this.line = null; G.cutscene = false; G.camTarget = null;
    this.el.classList.add('hidden'); $('game').classList.remove('cine');
    Input.buf = {};
    const cb = this.onEnd; this.onEnd = null; cb && cb();
    (UI.heldToasts || []).splice(0).forEach((a, k) => setTimeout(() => toast(...a), 400 + k * 900));
    if (this.pendingCredits) { this.pendingCredits = false; showEndCredits(); return; }
    if (this.queue.length) { const [s, o] = this.queue.shift(); this.start(s, o); }
  },
};
function drawPortrait(cv, S) {
  const s = S.spr(); if (!s) return;
  const [cx, cy, cw, ch] = S.crop, n = Math.max(cw, ch);
  cv.width = n; cv.height = n;
  const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
  const g = x.createRadialGradient(n / 2, n * 0.45, 1, n / 2, n / 2, n * 0.7); g.addColorStop(0, '#3a2654'); g.addColorStop(1, '#120a1c'); x.fillStyle = g; x.fillRect(0, 0, n, n);
  x.drawImage(s.frames[0], cx, cy, cw, ch, Math.floor((n - cw) / 2), Math.floor((n - ch) / 2) + 2, cw, ch);
}

// ---------------------------------------------------------------------------
//  Story hooks called from the game
// ---------------------------------------------------------------------------
function storyOnVillage() {
  const P = G.P; if (!P || !P.story || !P.story.on) return;
  setTimeout(() => {
    if (G.scene !== 'village') return;
    if (!P.story.seen.prologue) { Story.play('prologue'); return; }
    for (const [did, id] of RETURN_SCENES) if (P.flags.clears[did] && !P.story.seen[id]) { setTimeout(() => { if (G.scene === 'village') Story.play(id); }, 2300); return; }
  }, 900);
}
function storyOnDungeon(did) { setTimeout(() => { if (G.scene === 'dungeon') Story.play(did + '_enter'); }, 2600); }
function storyOnBoss(ev, bk) {
  const base = BOSS_SCENES[bk]; if (!base) return;
  if (ev === 'intro') Story.play(base + '_intro');
  if (ev === 'dead') setTimeout(() => Story.play(base + '_dead'), 1600);
}
// turning story on for an older save: skip beats already lived through
function enableStory(P) {
  P.story = P.story || { on: false, seen: {}, lore: [] };
  P.story.on = true;
  const c = P.flags.clears;
  if (c.crypt || c.forest || c.cave || c.abyss) P.story.seen.prologue = true;
  for (const [did, id] of RETURN_SCENES) if (c[did]) { P.story.seen[id] = true; P.story.seen[did + '_enter'] = true; }
  for (const [bk, base] of Object.entries(BOSS_SCENES)) { const did = Object.keys(DUNGEONS).find(k => DUNGEONS[k].boss === bk); if (c[did]) { P.story.seen[base + '_intro'] = true; P.story.seen[base + '_dead'] = true; } }
}
// memory stones (placed by the dungeon generator; read locally by each player)
function readStone(stone) {
  const P = G.P, did = G.world.dun.did, list = LORE[did] || [];
  P.story = P.story || { on: false, seen: {}, lore: [] };
  const idx = list.findIndex((_, i) => !P.story.lore.includes(did + i));
  stone.read = true; SFX.play('portal', 0.5); sparkFx(stone.x, stone.y - 14, '#a8d8ff', 12);
  if (idx < 0) { toast('The stone\'s words have worn away. You have read all it can tell.'); return; }
  P.story.lore.push(did + idx); saveGame(); checkAchievements();
  const [title, text] = list[idx];
  const bark = Net.role !== 'solo';
  Story.start([['narr', text]], { bark });
  toast(`<div class="tt" style="color:var(--gold)">Lore found</div>${esc(title)} · ${P.story.lore.length}/${LORE_TOTAL}`, 'ach', 3.5);
}

// ---------------------------------------------------------------------------
//  Story tab (pause menu) and end credits
// ---------------------------------------------------------------------------
function tabStory(body) {
  const P = G.P, st = P.story || { on: false, seen: {}, lore: [] };
  if (!st.on) {
    body.appendChild(h('h3', {}, 'Story mode is off'));
    body.appendChild(h('div', { class: 'note', style: { maxWidth: '560px', marginBottom: '10px', lineHeight: 1.5 } }, 'Story mode adds the tale of the Ember Heart: cutscenes, guardian dialogue, a fourth dungeon and a final boss. Turning it on keeps all your progress; chapters you already finished count as done.'));
    body.appendChild(btn('Turn on story mode', () => { enableStory(P); saveGame(); toast('Story mode on. Return to the village to continue the tale.'); refreshMenu(); }, 'primary'));
    return;
  }
  const c = P.flags.clears;
  body.appendChild(h('div', { class: 'statrow' }, h('span', {}, 'Current objective'), h('b', {}, storyObjective(P))));
  body.appendChild(h('h3', {}, 'Chapters'));
  const chapters = [['Prologue', 'The Last Fire', st.seen.prologue], ['I', 'The Hollow King', c.crypt], ['II', 'The Thornmother', c.forest], ['III', 'The Tidewyrm', c.cave], ['IV', 'The Pale Sovereign', c.abyss]];
  let current = chapters.findIndex(x => !x[2]);
  chapters.forEach(([num, name, done], i) => body.appendChild(h('div', { class: 'chap' + (done || i === current ? '' : ' todo') }, h('span', { class: 'cs' }, done ? '✓' : i === current ? '▸' : '·'), h('span', { style: { fontFamily: 'var(--serif)', width: '74px', color: 'var(--dim)' } }, num), h('span', {}, name))));
  body.appendChild(h('h3', {}, `Lore (${st.lore.length}/${LORE_TOTAL})`));
  if (!st.lore.length) body.appendChild(h('div', { class: 'note' }, 'Memory stones glow pale blue in the dungeons. Press E beside one to read it.'));
  for (const did of Object.keys(LORE)) for (let i = 0; i < LORE[did].length; i++) if (st.lore.includes(did + i)) body.appendChild(h('div', { class: 'lore' }, h('div', { class: 'lt' }, `${LORE[did][i][0]} · ${DUNGEONS[did].short}`), h('div', { class: 'note', style: { lineHeight: 1.5 } }, LORE[did][i][1])));
  body.appendChild(h('div', { style: { marginTop: '12px' } }, btn('Turn off cutscenes', () => { st.on = false; saveGame(); refreshMenu(); }, 'small')));
}
function showEndCredits() {
  const P = G.P, s = P.stats;
  Music.play('victory');
  openMenu('endroll', (p) => {
    p.classList.add('endroll');
    p.appendChild(h('div', { class: 't1' }, 'The Long Night Ends'));
    p.appendChild(h('div', { class: 't2' }, `${P.name} · Keeper of the Hearth`));
    const roll = h('div', { class: 'roll' }, h('div', {},
      h('p', { html: `<b style="color:var(--gold)">Your journey</b><br>Level ${P.level} · ${fmt(s.kills)} foes defeated · ${s.deaths} falls · ${Math.floor(s.playtime / 60)} minutes` }),
      h('p', { html: 'King Aldric of the Sunken Crypt<br>Sylwen, Warden of the Grove<br>The Tidewyrm of the Flooded Grotto<br><i>who kept the Ember Heart through the long night</i>' }),
      h('p', { html: 'Elder Hessa · Brann the Smith · Mira the Trader<br>Vesh the Arcanist · Lute the Bard<br>and everyone in Hearthlight' }),
      h('p', { html: 'Everything you saw and heard was drawn,<br>written and composed in code for this game.' }),
      h('p', { html: '<b style="color:var(--gold)">Thank you for keeping the fire.</b><br>Veteran and Nightmare tiers await in every dungeon.' })));
    p.appendChild(roll);
    p.appendChild(h('div', { style: { marginTop: '16px' } }, btn('Continue playing', () => { closeMenu(); Music.play('village'); }, 'primary')));
  }, { noClose: true });
}

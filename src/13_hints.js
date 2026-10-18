// ============================================================================
//  Contextual hints: each control is taught once, at the moment it matters,
//  instead of a wall of text up front.
// ============================================================================
const HINTS = {
  roll: '<kbd>Space</kbd> Roll through the red zone. You\'re invulnerable for most of the roll.',
  block: '<kbd>Shift</kbd> Block. Tap it just as a blow lands to <b>parry</b> and stagger the attacker.',
  heavy: '<kbd>Right-click</kbd> Heavy attacks smash through shields. Or circle behind them.',
  cards: '<kbd>1</kbd>–<kbd>4</kbd> Cast your ability cards. Melee hits refill mana.',
  flask: '<kbd>Q</kbd> Drink a healing flask. Flasks refill at the Hearth.',
  stamina: 'Out of stamina. Ease off for a moment to recover.',
  loot: 'Walk over loot to pick it up. <kbd>Tab</kbd> opens your inventory; ▲ marks upgrades.',
  stats: '<kbd>C</kbd> You have stat points to spend.',
  key: 'Locked doors open on their own when your party carries a key.',
};
const Hints = {
  el: null, lastAt: -99, hideT: 0,
  init() {
    const css = document.createElement('style');
    css.textContent = `#hint{position:absolute;left:50%;bottom:92px;transform:translate(-50%,8px);opacity:0;transition:opacity .3s,transform .3s;pointer-events:none;
  background:rgba(14,8,22,.92);border:1px solid var(--border2);box-shadow:0 6px 24px #000a;padding:7px 14px;font-size:14px;max-width:min(620px,90vw);text-align:center;z-index:30}
#hint.on{opacity:1;transform:translate(-50%,0)}
#hint kbd{font-family:var(--sans);font-size:12px;color:var(--gold);border:1px solid var(--gold2);border-bottom-width:2px;border-radius:3px;padding:0 5px;margin:0 2px;background:#1a1028}
@media (prefers-reduced-motion: reduce){#hint{transition:none}}`;
    document.head.appendChild(css);
    this.el = h('div', { id: 'hint' }); $('hud').appendChild(this.el);
  },
  // show hint `id` once per save; returns true if it was shown now
  show(id) {
    const P = G.P; if (!P || G.cutscene || G.menu) return false;
    P.hints = P.hints || {};
    if (P.hints[id] || G.rt - this.lastAt < 7) return false;
    P.hints[id] = 1; this.lastAt = G.rt; saveGame();
    this.el.innerHTML = HINTS[id]; this.el.classList.add('on'); this.hideT = 6.5;
    SFX.play('ui', 0.5, 1.3);
    return true;
  },
  // watch the situation each frame and teach what's relevant
  update(dt) {
    if (this.hideT > 0) { this.hideT -= dt; if (this.hideT <= 0) this.el.classList.remove('on'); }
    const P = G.P, me = G.me, w = G.world; if (!P || !me || !w || G.scene !== 'dungeon' || me.dead || me.downed) return;
    const H = P.hints || {};
    const now = hostTime(w);
    if (!H.roll) for (const hz of w.hazards) { if (!hz.dmg || hz.tele < 0.4) continue; const el = now - hz.t0; if (el < 0 || el > hz.tele) continue; const g = hazardGeom(w, hz, now); if (dist(g.x, g.y, me.x, me.y) < 90) { this.show('roll'); return; } }
    if (!H.block) for (const e of w.ents.values()) if (e.type === 'enemy' && !e.boss && e.kind === 'grunt' && e.state === 'windup' && dist(e.x, e.y, me.x, me.y) < 45) { this.show('block'); return; }
    if (!H.heavy) for (const e of w.ents.values()) if (e.type === 'enemy' && e.kind === 'shield' && e.state !== 'spawn' && dist(e.x, e.y, me.x, me.y) < 140) { this.show('heavy'); return; }
    if (!H.flask && me.hp < me.maxHp * 0.45 && P.potions > 0) { this.show('flask'); return; }
    if (!H.stamina && me.sta <= 0.5) { this.show('stamina'); return; }
    if (!H.loot && w.loot.length) { this.show('loot'); return; }
    if (!H.key && w.dun && w.dun.keys > 0) { this.show('key'); return; }
    if (!H.cards && me.mana >= me.stats.maxMana && [...w.ents.values()].some(e => e.type === 'enemy' && e.state !== 'spawn')) { this._cardT = (this._cardT || 0) + dt; if (this._cardT > 8) this.show('cards'); }
    if (!H.stats && P.pts > 0) this.show('stats');
  },
};

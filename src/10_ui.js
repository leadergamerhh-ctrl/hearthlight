// ============================================================================
//  UI: HUD, toasts, chat, menus, NPC screens
// ============================================================================
const UI = { hudT: 0, lastHp: 1, slots: [], tipFor: null };

// ---------------------------------------------------------------------------
//  HUD
// ---------------------------------------------------------------------------
function showHUD(on) { $('hud').classList.toggle('hidden', !on); }
function buildHotbar() {
  const hb = $('hotbar'); hb.innerHTML = ''; UI.slots = [];
  const n = loadoutSize(G.P);
  for (let i = 0; i < 6; i++) {
    const id = G.P.cards.loadout[i], locked = i >= n;
    const s = h('div', { class: 'slot' + (id ? '' : ' empty') + (locked ? ' empty' : '') });
    if (id) { s.appendChild(iconCanvas(ICONS['card_' + id], 48, '#120a1c', CARDS[id].color)); s.appendChild(h('div', { class: 'mc' }, CARDS[id].mana)); }
    s.appendChild(h('div', { class: 'key' }, locked ? '🔒' : String(i + 1)));
    const cd = h('div', { class: 'cd' }), cdt = h('div', { class: 'cdt' });
    s.appendChild(cd); s.appendChild(cdt);
    s.addEventListener('mouseenter', (e) => id && showTip(cardTipHtml(id), e)); s.addEventListener('mouseleave', hideTip);
    hb.appendChild(s); UI.slots.push({ s, cd, cdt, id });
  }
  const pot = h('div', { class: 'slot potion' }); pot.appendChild(iconCanvas(ICONS.potion, 48)); pot.appendChild(h('div', { class: 'key' }, 'Q')); const cnt = h('div', { class: 'cnt' }); pot.appendChild(cnt);
  pot.addEventListener('mouseenter', (e) => showTip(`<div class="tn">Healing Flask</div><div class="tk">Q to drink</div>Restores 35% health plus a little more over 3s. Drinking takes a moment — pick your window. Refills in the village.`, e)); pot.addEventListener('mouseleave', hideTip);
  hb.appendChild(pot); UI.potCnt = cnt;
  $('keyhelp').innerHTML = '<b>WASD</b> move · <b>LMB/J</b> attack · <b>RMB/K</b> heavy · <b>Space</b> roll · <b>Shift/L</b> block<br><b>1-6</b> cards · <b>Q</b> flask · <b>E</b> interact · <b>Tab</b> menu · <b>M</b> map · <b>Enter</b> chat · <b>G/H/T</b> emotes';
}
function loadoutSize(P) { return P.level >= 8 ? 6 : P.level >= 4 ? 5 : 4; }
function updateHUD(dt) {
  const me = G.me, P = G.P; if (!me || !P) return;
  const S = me.stats;
  const hpP = clamp(me.hp / me.maxHp, 0, 1);
  $('h-hp').style.width = hpP * 100 + '%'; $('h-hplag').style.width = hpP * 100 + '%';
  $('h-hpt').textContent = `${Math.ceil(Math.max(0, me.hp))} / ${me.maxHp}`;
  $('h-shield').style.width = clamp(me.shield / me.maxHp, 0, 1) * 100 + '%'; $('h-shield').style.left = 0;
  $('h-sta').style.width = clamp(me.sta / S.maxSta, 0, 1) * 100 + '%';
  $('h-stabar').classList.toggle('exhausted', me.sta <= 1);
  $('h-mana').style.width = clamp(me.mana / S.maxMana, 0, 1) * 100 + '%'; $('h-manat').textContent = `${Math.floor(me.mana)} / ${S.maxMana}`;
  $('xpfill').style.width = (P.level >= MAX_LEVEL ? 100 : clamp(P.xp / XP_FOR(P.level), 0, 1) * 100) + '%';
  for (const sl of UI.slots) {
    if (!sl.id) continue;
    const C = CARDS[sl.id], cd = me.cds[sl.id] || 0, tot = C.cd * (1 - S.cdr);
    sl.cd.style.setProperty('--p', (cd > 0 ? cd / tot * 100 : 0) + '%');
    sl.cdt.textContent = cd > 0.05 ? (cd < 1 ? cd.toFixed(1) : Math.ceil(cd)) : '';
    sl.s.classList.toggle('nomana', me.mana < C.mana);
  }
  if (UI.potCnt) UI.potCnt.textContent = P.potions;
  UI.hudT -= dt;
  if (UI.hudT <= 0) {
    UI.hudT = 0.2;
    $('h-name').textContent = P.name; $('h-lvl').textContent = 'Level ' + P.level;
    $('h-gold').innerHTML = `<span style="color:#f0c050">●</span> <b>${fmt(P.gold)}</b>`;
    const w = G.world;
    $('h-keys').innerHTML = w && w.dun ? `${w.dun.keys ? `<span style="color:#ffd34a">⚷</span> ×${w.dun.keys}` : ''} ${w.dun.bossKey ? '<span style="color:#e05aff">⚷ Boss Key</span>' : ''}` : '';
    $('h-pts').innerHTML = P.pts ? `<span style="color:var(--teal)">+${P.pts} stat point${P.pts > 1 ? 's' : ''} (C)</span>` : '';
    updateParty(); drawMinimap($('minimap'), false);
    { const ob = storyObjective(P); $('objective').innerHTML = ob ? `<b>Objective</b>${esc(ob)}` : ''; }
    $('area-name').textContent = G.scene === 'village' ? 'Hearthlight Village' : w && w.dun ? `${DUNGEONS[w.dun.did].name} · ${TIERS[w.dun.tier].name}` : '';
  }
  // boss bar
  const w = G.world; let boss = null;
  if (w && w.dun && w.dun.bossId) boss = w.ents.get(w.dun.bossId);
  if (!boss && w) for (const e of w.ents.values()) if (e.boss) boss = e;
  $('bossbar').classList.toggle('hidden', !boss);
  if (boss) {
    const B = BOSSES[boss.bk || boss.sk];
    $('b-name').textContent = B.name; $('b-sub').textContent = B.sub;
    const p = clamp(boss.hp / boss.maxHp, 0, 1) * 100; $('b-fill').style.width = p + '%'; $('b-delay').style.width = p + '%';
    $('b-m1').style.left = B.phases[1].at * 100 + '%'; $('b-m2').style.left = B.phases[2].at * 100 + '%';
  }
}
function updateParty() {
  const w = G.world, el = $('party'); if (!w) return;
  const others = [...w.players.values()].filter(p => p !== G.me);
  const offline = Net.roster.filter(r => !r.online && r.pid !== Net.pid);
  el.innerHTML = '';
  for (const p of others) {
    el.appendChild(h('div', { class: 'pm' + (p.downed || p.dead ? ' down' : '') },
      h('div', { class: 'nm' }, h('span', { style: { color: p.color } }, p.name), h('span', {}, p.dead ? 'Fallen' : p.downed ? 'DOWN!' : 'Lv ' + (p.lvl || 1))),
      h('div', { class: 'bar' }, h('div', { class: 'fill', style: { width: clamp(p.hp / (p.maxHp || 1), 0, 1) * 100 + '%', background: p.downed ? '#c22' : 'linear-gradient(#7cf0a0,#2f9a52)' } }))));
  }
  for (const r of offline) el.appendChild(h('div', { class: 'pm off' }, h('div', { class: 'nm' }, h('span', {}, r.name), h('span', {}, 'reconnecting…'))));
}
function updateNetStatus() {
  const el = $('netstatus'); if (!el) return;
  if (Net.role === 'solo') { el.innerHTML = ''; return; }
  el.innerHTML = `${Net.role === 'host' ? 'Hosting' : 'In party'} · Code <b style="color:#fff;letter-spacing:2px">${Net.code}</b>${Net.reconnecting ? ' · <span style="color:#ff6b5e">reconnecting…</span>' : Net.hostLost ? ' · <span style="color:#ff6b5e">host lost</span>' : ''}`;
}
function flashStaminaBar() { const b = $('h-stabar'); b.style.boxShadow = '0 0 0 2px #ff5a4a'; setTimeout(() => b.style.boxShadow = '', 250); }
function flashHotbar(i, kind) { const s = UI.slots[i]; if (!s) return; s.s.classList.add('flash'); setTimeout(() => s.s.classList.remove('flash'), 160); }

// ---------------------------------------------------------------------------
//  Toasts, banners, chat, pickups
// ---------------------------------------------------------------------------
function toast(msg, cls = '', dur = 3) {
  if (G.cutscene) { (UI.heldToasts = UI.heldToasts || []).push([msg, cls, dur]); return; } // shown after the scene
  const t = h('div', { class: 'toast ' + cls, html: msg }); $('toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), dur * 1000); setTimeout(() => t.remove(), dur * 1000 + 450);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
}
function achievementToast(a) { SFX.play('achieve'); toast(`<div class="tt">Achievement unlocked</div><div style="font-family:var(--serif);font-size:17px">${esc(a.name)}</div><div class="note">${esc(a.desc)}</div>`, 'ach', 4.5); }
function banner(t1, t2 = '', cls = '', dur = 2.5) {
  const b = $('banner'); b.className = 'on ' + cls; b.querySelector('.b1').textContent = t1; b.querySelector('.b2').textContent = t2;
  clearTimeout(UI.bannerT); UI.bannerT = setTimeout(() => b.className = '', dur * 1000);
}
function pickupLog(text, color = '#ddd') {
  const p = h('div', { class: 'pick', style: { borderRightColor: color } }, h('span', { style: { color } }, text)); $('pickups').appendChild(p);
  setTimeout(() => p.remove(), 3500); while ($('pickups').children.length > 6) $('pickups').firstChild.remove();
}
function chatLine(html, color) {
  const l = h('div', { class: 'cl', html: color ? `<span style="color:${color}">${html}</span>` : html }); $('chatlog').appendChild(l);
  setTimeout(() => l.classList.add('old'), 9000); setTimeout(() => l.remove(), 10500);
  while ($('chatlog').children.length > 8) $('chatlog').firstChild.remove();
}
function chatSys(text) { const l = h('div', { class: 'cl sys' }, text); $('chatlog').appendChild(l); setTimeout(() => l.classList.add('old'), 9000); setTimeout(() => l.remove(), 10500); while ($('chatlog').children.length > 8) $('chatlog').firstChild.remove(); }
function openChat() {
  const ci = $('chatin'); G.chatting = true; ci.classList.remove('hidden'); ci.value = ''; setTimeout(() => ci.focus(), 0);
  document.querySelectorAll('#chatlog .cl').forEach(c => c.classList.remove('old'));
}
function closeChat(send) {
  const ci = $('chatin'), text = ci.value.trim();
  ci.classList.add('hidden'); ci.blur(); G.chatting = false; Input.keys = {};
  if (send && text) {
    chatLine(`${esc(G.P.name)}: ${esc(text)}`, G.P.color);
    if (G.me) G.me.bubble = { text, t: 4 };
    Net.broadcast({ k: 'chat', text: text.slice(0, 120), n: G.P.name });
  }
}

// ---------------------------------------------------------------------------
//  Tooltips
// ---------------------------------------------------------------------------
function showTip(html, ev) {
  const t = $('tooltip'); t.innerHTML = html; t.classList.remove('hidden');
  const x = ev.clientX + 16, y = ev.clientY + 12, r = t.getBoundingClientRect();
  t.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px'; t.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
}
function hideTip() { $('tooltip').classList.add('hidden'); }
function itemTipHtml(it, compare = true) {
  const st = itemStats(it), R0 = RARITY[it.rarity];
  let html = `<div class="tn c-${it.rarity}">${esc(itemDisplayName(it))}</div><div class="tk">${itemKind(it)} · iLvl ${it.ilvl}${it.unbanked ? ' · <span style="color:var(--orange)">unbanked</span>' : ''}</div>`;
  const eq = G.P.equip[it.slot], cst = eq && eq !== it && compare ? itemStats(eq) : null;
  const keys = new Set([...Object.keys(it.base)]);
  for (const k of keys) {
    const v = st[k] || 0, d = cst ? v - (cst[k] || 0) : 0;
    html += `<div class="st"><span>${STAT_LABEL[k] || k}</span><span>${v}${cst && d ? ` <span class="${d > 0 ? 'up' : 'dn'}">(${d > 0 ? '+' : ''}${d})</span>` : ''}</span></div>`;
  }
  for (const a of it.affixes) html += `<div class="af">${AFFIXES[a.k].label(a.v)}</div>`;
  if (it.slot === 'weapon') { const W = WEAPONS[it.type]; html += `<div class="note" style="margin-top:4px">${W.name}: ${it.type === 'spear' ? 'long reach, narrow thrust' : it.type === 'axe' ? 'slow, wide, brutal' : it.type === 'daggers' ? 'very fast, high crit' : 'balanced'}</div>`; }
  if (cst) {
    const all = new Set([...Object.keys(st), ...Object.keys(cst)]); const diffs = [];
    for (const k of all) { if (keys.has(k)) continue; const d = (st[k] || 0) - (cst[k] || 0); if (d) diffs.push(`<span class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '+' : ''}${d} ${STAT_LABEL[k] || k}</span>`); }
    if (diffs.length) html += `<div class="hint">vs equipped: ${diffs.join(', ')}</div>`;
  }
  html += `<div class="hint">Value ${itemValue(it)}g${it.upg ? ` · Upgraded +${it.upg}` : ''}</div>`;
  return html;
}
function cardTipHtml(id) { const C = CARDS[id]; return `<div class="tn" style="color:${C.color}">${C.name}</div><div class="tk">${RARITY[C.rarity].name} card · ${C.mana} mana · ${C.cd}s cooldown</div>${C.desc}`; }

// ---------------------------------------------------------------------------
//  Menu framework
// ---------------------------------------------------------------------------
function openMenu(name, build, opts = {}) {
  hideTip();
  const root = $('menu-root'); root.innerHTML = '';
  const scr = h('div', { class: 'screen' + (opts.clear ? ' clear' : '') });
  const panel = h('div', { class: 'panel', style: opts.width ? { width: opts.width } : null });
  if (!opts.noClose) panel.appendChild(h('div', { class: 'close' }, h('button', { class: 'btn small', onclick: () => { SFX.play('uiBack'); closeMenu(); } }, 'Close [Esc]')));
  build(panel);
  scr.appendChild(panel); root.appendChild(scr);
  scr.addEventListener('mousedown', (e) => { if (e.target === scr && !opts.noClose) closeMenu(); });
  G.menu = name; G.menuRebuild = () => openMenu(name, build, opts);
  if (Net.role === 'solo' && G.scene !== 'title' && opts.pause !== false) G.paused = true;
}
function closeMenu() { $('menu-root').innerHTML = ''; hideTip(); G.menu = null; G.paused = false; G.menuRebuild = null; Input.buf = {}; }
function refreshMenu() { if (G.menuRebuild) { const sc = document.querySelector('#menu-root .panel'); const top = sc ? sc.scrollTop : 0; G.menuRebuild(); const s2 = document.querySelector('#menu-root .panel'); if (s2) s2.scrollTop = top; } }
function btn(label, fn, cls = '', attrs = {}) { return h('button', { class: 'btn ' + cls, onclick: (e) => { SFX.play('ui'); fn(e); }, ...attrs }, label); }
function npcHeader(panel, title, sub, line) {
  panel.appendChild(h('h2', {}, title)); if (sub) panel.appendChild(h('div', { class: 'sub' }, sub));
  if (line) panel.appendChild(h('div', { class: 'npc-talk' }, '“' + line + '”'));
}
function matsLine(P) { return h('div', { class: 'row', style: { flexWrap: 'wrap', margin: '4px 0 10px' } }, ...Object.keys(MATERIALS).map(k => h('span', { class: 'mat' }, h('i', { style: { background: MATERIALS[k].color } }), `${MATERIALS[k].name} `, h('b', {}, P.mats[k] || 0))), h('span', { class: 'mat' }, h('i', { style: { background: '#f0c050', borderRadius: '50%' } }), 'Gold ', h('b', {}, fmt(P.gold)))); }
function costLine(cost, P) { return Object.entries(cost).map(([k, v]) => { const have = k === 'gold' ? P.gold : (P.mats[k] || 0); return `<span style="color:${have >= v ? '#eadfcf' : '#ff6b5e'}">${v} ${k === 'gold' ? 'gold' : MATERIALS[k].name}</span>`; }).join(' · '); }
function canPay(cost, P) { return Object.entries(cost).every(([k, v]) => (k === 'gold' ? P.gold : (P.mats[k] || 0)) >= v); }
function pay(cost, P) { for (const [k, v] of Object.entries(cost)) { if (k === 'gold') P.gold -= v; else P.mats[k] -= v; } }

// item cell
function itemCell(it, onClick, sel) {
  const c = h('div', { class: `cell r-${it.rarity}` + (sel ? ' sel' : '') });
  c.appendChild(iconCanvas(itemIcon(it), 48, '#0e0818', RARITY[it.rarity].i >= 1 ? RARITY[it.rarity].color : null));
  if (it.upg) c.appendChild(h('div', { class: 'up' }, '+' + it.upg));
  if (it.unbanked) c.appendChild(h('div', { class: 'ub' }, '•'));
  const eq = G.P && G.P.equip[it.slot];
  if (eq && eq !== it && itemPower(it) > itemPower(eq) * 1.05) c.appendChild(h('div', { class: 'better', title: 'Upgrade over what you wear' }, '▲'));
  c.addEventListener('mouseenter', (e) => showTip(itemTipHtml(it), e)); c.addEventListener('mousemove', (e) => showTip(itemTipHtml(it), e)); c.addEventListener('mouseleave', hideTip);
  c.addEventListener('click', (e) => { SFX.play('ui'); onClick && onClick(e); });
  return c;
}
function emptyCell(label) { return h('div', { class: 'cell', style: { opacity: .45, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'var(--dim)', textAlign: 'center' } }, label || ''); }

// ---------------------------------------------------------------------------
//  Pause menu (tabs)
// ---------------------------------------------------------------------------
const PAUSE_TABS = [['inv', 'Inventory'], ['char', 'Character'], ['cards', 'Cards'], ['story', 'Story'], ['quests', 'Bounties'], ['ach', 'Achievements'], ['map', 'Map'], ['party', 'Co-op'], ['settings', 'Settings'], ['game', 'Game']];
function openPause(tab = 'inv') {
  UI.pauseTab = tab;
  openMenu('pause', (panel) => {
    panel.style.width = 'min(860px,94vw)';
    const tabs = h('div', { class: 'tabs' });
    for (const [id, label] of PAUSE_TABS) tabs.appendChild(h('div', { class: 'tab' + (UI.pauseTab === id ? ' on' : ''), onclick: () => { SFX.play('ui'); UI.pauseTab = id; refreshMenu(); } }, label));
    panel.appendChild(tabs);
    const body = h('div'); panel.appendChild(body);
    ({ inv: tabInventory, char: tabCharacter, cards: tabCards, story: tabStory, quests: tabQuests, ach: tabAchievements, map: tabMap, party: tabParty, settings: tabSettings, game: tabGame })[UI.pauseTab](body);
    if (Net.role !== 'solo') panel.appendChild(h('div', { class: 'note', style: { marginTop: '10px' } }, 'Co-op: the world keeps running while this menu is open.'));
  });
}
function tabInventory(body, ctx = {}) {
  const P = G.P;
  const wrap = h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '22px' } });
  const left = h('div', { style: { minWidth: '250px' } });
  left.appendChild(h('h3', {}, 'Equipped'));
  for (const [slot, label] of [['weapon', 'Weapon'], ['armor', 'Armor'], ['trinket', 'Trinket']]) {
    const it = P.equip[slot];
    left.appendChild(h('div', { class: 'eqslot' }, h('div', { class: 'lbl' }, label), it ? itemCell(it, () => { UI.sel = { where: 'equip', slot }; refreshMenu(); }, UI.sel && UI.sel.where === 'equip' && UI.sel.slot === slot) : emptyCell('empty'), it ? h('div', { class: `c-${it.rarity}`, style: { fontSize: '13px' } }, itemDisplayName(it)) : h('span', { class: 'note' }, '—')));
  }
  left.appendChild(h('h3', {}, 'Materials')); left.appendChild(matsLine(P));
  left.appendChild(h('div', { class: 'note' }, `Flasks: ${P.potions}/${P.maxPotions}`));
  left.appendChild(h('div', { class: 'note', style: { marginTop: '8px', maxWidth: '240px' } }, 'Items marked • are unbanked: return to the village alive to keep them. Dying may cost you some of them.'));
  const right = h('div');
  right.appendChild(h('h3', {}, `Backpack (${P.inv.length}/${INV_SIZE})`));
  const grid = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(8,52px)' } });
  for (let i = 0; i < INV_SIZE; i++) {
    const it = P.inv[i];
    grid.appendChild(it ? itemCell(it, () => { UI.sel = { where: 'inv', i }; refreshMenu(); }, UI.sel && UI.sel.where === 'inv' && UI.sel.i === i) : emptyCell());
  }
  right.appendChild(grid);
  // selected item actions
  const selIt = UI.sel ? (UI.sel.where === 'inv' ? P.inv[UI.sel.i] : P.equip[UI.sel.slot]) : null;
  const act = h('div', { style: { marginTop: '12px', minHeight: '60px' } });
  if (selIt) {
    act.appendChild(h('div', { class: `c-${selIt.rarity}`, style: { fontFamily: 'var(--serif)', fontSize: '16px', marginBottom: '4px' } }, itemDisplayName(selIt)));
    if (UI.sel.where === 'inv') {
      act.appendChild(btn('Equip', () => { equipItem(UI.sel.i); UI.sel = null; refreshMenu(); }, 'primary'));
      if (Net.role !== 'solo') {
        act.appendChild(btn('Drop for party', () => { dropItem(UI.sel.i); UI.sel = null; refreshMenu(); }));
        for (const p of G.world.players.values()) if (p !== G.me) act.appendChild(btn('Give to ' + p.name, () => { giveItem(UI.sel.i, p.pid); UI.sel = null; refreshMenu(); }));
      }
      act.appendChild(btn('Discard', () => { const i = UI.sel.i, it = P.inv[i]; const go = () => { P.inv.splice(P.inv.indexOf(it), 1); UI.sel = null; refreshMenu(); }; if (RARITY[it.rarity].i >= 2) confirmBox(`Discard ${it.name}? It will be gone for good.`, 'Discard', go); else go(); }, 'danger'));
    } else {
      act.appendChild(btn('Unequip', () => { if (P.inv.length >= INV_SIZE) { toast('Backpack full'); return; } if (UI.sel.slot === 'weapon') { toast('You need a weapon equipped'); return; } P.inv.push(P.equip[UI.sel.slot]); P.equip[UI.sel.slot] = null; applyStats(); UI.sel = null; refreshMenu(); }));
    }
  } else act.appendChild(h('div', { class: 'note' }, 'Click an item to equip, give or drop it. Hover to compare with what you wear.'));
  right.appendChild(act);
  wrap.appendChild(left); wrap.appendChild(right); body.appendChild(wrap);
}
function tabCharacter(body) {
  const P = G.P, S = computeStats(P);
  const wrap = h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '28px' } });
  const a = h('div', { style: { width: '320px' } });
  a.appendChild(h('h3', {}, `${P.name} — Level ${P.level}`));
  a.appendChild(h('div', { class: 'note' }, P.level >= MAX_LEVEL ? 'Max level' : `XP ${fmt(P.xp)} / ${fmt(XP_FOR(P.level))}`));
  a.appendChild(h('div', { class: 'prog', style: { marginBottom: '12px' } }, h('i', { style: { width: clamp(P.xp / XP_FOR(P.level), 0, 1) * 100 + '%' } })));
  a.appendChild(h('div', { style: { margin: '6px 0', color: P.pts ? 'var(--teal)' : 'var(--dim)' } }, `Unspent stat points: ${P.pts}`));
  const attrs = [['vit', 'Health', '+12 max health'], ['end', 'Stamina', '+8 stamina, faster recovery'], ['str', 'Strength', '+5% weapon damage'], ['mag', 'Magic', '+6% spell damage, +6 mana, mana regen']];
  for (const [k, label, desc] of attrs) {
    a.appendChild(h('div', { class: 'statrow', style: { alignItems: 'center' } }, h('span', {}, h('b', {}, label), h('span', { class: 'note' }, '  ' + desc)), h('span', { class: 'row' }, h('b', {}, P.attr[k]), P.pts > 0 ? btn('+', () => { P.attr[k]++; P.pts--; applyStats(); SFX.play('levelup', 0.3); refreshMenu(); }, 'small') : null)));
  }
  const b = h('div', { style: { width: '320px' } });
  b.appendChild(h('h3', {}, 'Stats'));
  const rows = [['Max Health', S.maxHp], ['Max Stamina', S.maxSta], ['Stamina Regen', S.staRegen.toFixed(0) + '/s'], ['Max Mana', S.maxMana], ['Mana Regen', S.manaRegen.toFixed(1) + '/s'], ['Weapon Attack', S.wdmg + ' (' + WEAPONS[S.wtype].name + ')'], ['Physical Damage', Math.round(S.dmgMul * 100) + '%'], ['Spell Damage', Math.round(S.magMul * 100) + '%'], ['Armor', `${S.armor} (${Math.round(S.dr * 100)}% reduction)`], ['Crit Chance', Math.round(S.crit * 100) + '%'], ['Crit Damage', Math.round(S.critDmg * 100) + '%'], ['Cooldown Speed', Math.round(S.cdr * 100) + '%'], ['Move Speed', Math.round(S.speed * 100) + '%'], ['Life Steal', Math.round(S.leech * 100) + '%']];
  for (const [k, v] of rows) b.appendChild(h('div', { class: 'statrow' }, h('span', {}, k), h('b', {}, v)));
  b.appendChild(h('h3', {}, 'Record'));
  const st = P.stats;
  for (const [k, v] of [['Enemies slain', st.kills], ['Dungeons cleared', Object.keys(P.flags.clears).length + ' / 3'], ['Deaths', st.deaths], ['Bounties completed', st.bounties], ['Perfect parries', st.parry], ['Time played', Math.floor(st.playtime / 60) + ' min']]) b.appendChild(h('div', { class: 'statrow' }, h('span', {}, k), h('b', {}, v)));
  wrap.appendChild(a); wrap.appendChild(b); body.appendChild(wrap);
}
function tabCards(body, atAltar) {
  const P = G.P, n = loadoutSize(P), editable = G.scene === 'village';
  body.appendChild(h('div', { class: 'note', style: { marginBottom: '8px' } }, editable ? 'Click a card in your collection to slot it; click a slotted card to remove it. Loadout slots unlock at levels 4 and 8.' : 'You can only change your loadout in the village (Card Altar or this menu).'));
  body.appendChild(h('h3', {}, `Loadout (${n} slots)`));
  const lo = h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } });
  for (let i = 0; i < 6; i++) {
    const id = P.cards.loadout[i];
    if (i >= n) { lo.appendChild(h('div', { class: 'card locked', style: { display: 'flex', alignItems: 'center', justifyContent: 'center' } }, `Unlocks at level ${i === 4 ? 4 : 8}`)); continue; }
    lo.appendChild(cardEl(id, i + 1, () => { if (!editable || !id) return; P.cards.loadout[i] = null; compactLoadout(P); buildHotbar(); refreshMenu(); }, true));
  }
  body.appendChild(lo);
  body.appendChild(h('h3', {}, `Collection (${P.cards.owned.length}/${Object.keys(CARDS).length})`));
  const col = h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } });
  for (const id of Object.keys(CARDS)) {
    const owned = P.cards.owned.includes(id), inLo = P.cards.loadout.includes(id);
    const el = cardEl(owned ? id : null, null, () => {
      if (!editable || !owned) return;
      if (inLo) { P.cards.loadout[P.cards.loadout.indexOf(id)] = null; compactLoadout(P); }
      else { const lo2 = P.cards.loadout.slice(0, n); const free = lo2.findIndex(x => !x); if (free >= 0 || lo2.length < n) { P.cards.loadout[free >= 0 ? free : lo2.length] = id; } else toast('Loadout is full — remove a card first'); }
      buildHotbar(); refreshMenu();
    }, false, id);
    if (inLo) el.classList.add('in');
    col.appendChild(el);
  }
  body.appendChild(col);
}
function compactLoadout(P) { P.cards.loadout = P.cards.loadout.filter(Boolean); }
function cardEl(id, key, onClick, slot, lockedId) {
  if (!id) {
    const C = lockedId ? CARDS[lockedId] : null;
    const e = h('div', { class: 'card locked' }, h('div', { class: 'cn' }, C ? '???' : 'Empty'), h('div', { class: 'cdsc' }, C ? `Find this ${RARITY[C.rarity].name.toLowerCase()} card in chests, from bosses, or at the Arcanist.` : 'Pick a card below'));
    if (key) e.appendChild(h('div', { class: 'ck' }, key)); return e;
  }
  const C = CARDS[id];
  const e = h('div', { class: 'card', onclick: () => { SFX.play('ui'); onClick && onClick(); } },
    key ? h('div', { class: 'ck' }, key) : null,
    iconCanvas(ICONS['card_' + id], 72, '#120a1c', C.color),
    h('div', { class: 'cn', style: { color: C.color } }, C.name), h('div', { class: 'cm' }, `${C.mana} mana · ${C.cd}s`), h('div', { class: 'cdsc' }, C.desc));
  return e;
}
function tabQuests(body) {
  const P = G.P;
  body.appendChild(h('div', { class: 'note', style: { marginBottom: '8px' } }, 'Take bounties at the Bounty Board in the village. Up to 3 can be active. Return to the board to claim rewards.'));
  if (!P.quests.active.length) body.appendChild(h('div', { class: 'note' }, 'No active bounties.'));
  for (const q of P.quests.active) body.appendChild(questEl(q));
}
function questEl(q, extra) {
  const T = BOUNTY_TEMPLATES.find(b => b.id === q.tid), prog = Math.min(q.n, q.prog || 0), done = prog >= q.n, rew = T.rew(q.n);
  return h('div', { class: 'quest' + (done ? ' done' : '') },
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('div', { class: 'qt' }, T.t(q.n) + (q.daily ? '  ' : ''), q.daily ? h('span', { class: 'pill' }, 'daily') : null), extra || null),
    h('div', { class: 'qd' }, T.d(q.n)), h('div', { class: 'qr' }, 'Reward: ' + rewardText(rew)),
    h('div', { class: 'prog' }, h('i', { style: { width: prog / q.n * 100 + '%' } })), h('div', { class: 'note' }, `${prog} / ${q.n}`));
}
function rewardText(r) { return Object.entries(r).map(([k, v]) => k === 'gold' ? `${v} gold` : k === 'xp' ? `${v} XP` : `${v} ${MATERIALS[k].name}`).join(', '); }
function tabAchievements(body) {
  const P = G.P;
  body.appendChild(h('div', { class: 'note', style: { marginBottom: '8px' } }, `${Object.keys(P.ach).length} / ${ACHIEVEMENTS.length} unlocked`));
  const g = h('div', { style: { columns: 2, columnGap: '20px' } });
  for (const a of ACHIEVEMENTS) g.appendChild(h('div', { class: 'ach' + (P.ach[a.id] ? '' : ' no'), style: { breakInside: 'avoid' } }, h('div', { class: 'ai' }, P.ach[a.id] ? '★' : '?'), h('div', {}, h('div', {}, a.name), h('div', { class: 'note' }, a.desc))));
  body.appendChild(g);
}
function tabMap(body) {
  const c = h('canvas', { width: 760, height: 460, style: { width: '760px', maxWidth: '100%', background: '#0a0612', border: '1px solid var(--border)', imageRendering: 'pixelated' } });
  body.appendChild(c); drawMinimap(c, true);
  body.appendChild(h('div', { class: 'note', style: { marginTop: '6px' } }, G.scene === 'dungeon' ? 'Purple = current room · Red = uncleared · Gold square = key door · Magenta = boss · Teal = exit portal. Press G to ping a location for your party.' : 'The Hearthlight village. Yellow dots are townsfolk you can talk to.'));
}
function tabSettings(body) {
  const s = SFX.settings;
  const slider = (label, key, min, max, step, obj = s, after = () => SFX.apply()) => h('div', { class: 'statrow', style: { alignItems: 'center' } }, h('span', {}, label), h('input', { type: 'range', min, max, step, value: obj[key], oninput: (e) => { obj[key] = Number(e.target.value); after(); saveSettings(); } }));
  body.appendChild(h('h3', {}, 'Audio'));
  body.appendChild(slider('Master volume', 'master', 0, 1, 0.05));
  body.appendChild(slider('Music', 'music', 0, 1, 0.05));
  body.appendChild(slider('Sound effects', 'sfx', 0, 1, 0.05));
  body.appendChild(h('div', { class: 'statrow' }, h('span', {}, 'Mute all (N)'), btn(s.muted ? 'Unmute' : 'Mute', () => { s.muted = !s.muted; SFX.apply(); saveSettings(); refreshMenu(); })));
  body.appendChild(h('h3', {}, 'Display'));
  body.appendChild(slider('Screen shake', 'shake', 0, 1.5, 0.1, G.settings, () => { }));
  body.appendChild(h('div', { class: 'statrow' }, h('span', {}, 'Glow (bloom)'), btn(G.settings.bloom === false ? 'Off' : 'On', () => { G.settings.bloom = G.settings.bloom === false; saveSettings(); refreshMenu(); })));
  body.appendChild(h('div', { class: 'statrow' }, h('span', {}, 'Damage numbers'), btn(G.settings.nums === false ? 'Off' : 'On', () => { G.settings.nums = G.settings.nums === false; saveSettings(); refreshMenu(); })));
  body.appendChild(h('h3', {}, 'Controls'));
  const keys = [['Move', 'W A S D / Arrows'], ['Aim', 'Mouse (or last move direction when using J/K)'], ['Light attack (3-hit combo)', 'Left click / J'], ['Heavy attack (breaks guards & poise)', 'Right click / K'], ['Block (perfect block = parry)', 'Hold Shift / L'], ['Dodge roll (invulnerable)', 'Space'], ['Ability cards', '1 – 6'], ['Healing flask', 'Q'], ['Interact / talk', 'E'], ['Menu / inventory', 'Tab or I · C character · M map · Esc pause'], ['Chat', 'Enter'], ['Emotes', 'G ping · H help! · T thanks'], ['Mute', 'N']];
  for (const [a, k] of keys) body.appendChild(h('div', { class: 'statrow' }, h('span', {}, a), h('span', { class: 'kbd' }, k)));
}
function tabGame(body) {
  body.appendChild(h('h3', {}, 'Game'));
  body.appendChild(h('div', { class: 'note', style: { marginBottom: '10px' } }, 'Progress autosaves whenever you return to the village, buy, upgrade or level up.'));
  body.appendChild(btn('Save now', () => { saveGame(); toast('Game saved'); }, 'primary'));
  body.appendChild(btn('Quit to title', () => { if (G.scene === 'dungeon') confirmBox('Leave the dungeon now? Unbanked loot is treated as if you died: you may lose some of it.', 'Leave', quitToTitle); else quitToTitle(); }, 'danger'));
  body.appendChild(h('h3', {}, 'Credits'));
  body.appendChild(h('div', { class: 'note', style: { lineHeight: 1.6, maxWidth: '620px' }, html: creditsHtml() }));
}
function creditsHtml() {
  return `<b style="color:var(--gold)">Hearthlight</b> — design, code, pixel art, sound effects and music are all generated procedurally in code for this project. No external images, sounds or fonts are used.<br>
  Fonts: your system's serif and sans-serif fonts (no font files bundled).<br>
  Server: Node.js with the <b>ws</b> WebSocket library (MIT License, © Einar Otto Stangvik and contributors).<br>
  Design inspirations: Hades (dash i-frames, readable telegraphs), Zelda: A Link to the Past (rooms, keys, doors), Elden Ring (stamina, poise, phased bosses, flasks), Skyrim (the go-out-and-come-home loop).`;
}
function tabParty(body) {
  if (Net.role === 'solo') {
    body.appendChild(h('h3', {}, 'Play with friends'));
    body.appendChild(h('div', { class: 'note', style: { marginBottom: '10px', maxWidth: '600px' } }, 'Run the included server (node server.js), then host here to get a room code, or join a friend\'s code. Up to 4 players. Your character, loot and progress stay yours.'));
    coopForm(body);
    return;
  }
  body.appendChild(h('h3', {}, Net.role === 'host' ? 'You are hosting' : 'You are in a party'));
  body.appendChild(h('div', { class: 'row' }, h('span', { class: 'note' }, 'Room code'), h('span', { class: 'code' }, Net.code)));
  body.appendChild(h('div', { class: 'note', style: { margin: '6px 0 10px' } }, 'Friends join from the title screen or this tab with that code. ' + (Net.role === 'host' ? 'You choose dungeons at the gate; the party travels with you.' : 'The host picks dungeons at the gate.')));
  for (const r of Net.roster) body.appendChild(h('div', { class: 'statrow' }, h('span', {}, r.name + (r.pid === Net.pid ? ' (you)' : '') + (r.pid === 0 ? ' — host' : '')), h('b', { style: { color: r.online ? 'var(--green)' : 'var(--red)' } }, r.online ? 'online' : 'offline')));
  body.appendChild(h('div', { style: { marginTop: '12px' } }, btn('Leave party', () => { leaveParty(); closeMenu(); }, 'danger')));
}
function coopForm(body, after) {
  const err = h('div', { class: 'err' });
  const url = h('input', { type: 'text', value: Net.defaultUrl(), style: { width: '260px' } });
  const code = h('input', { type: 'text', placeholder: 'CODE', maxlength: 4, style: { width: '110px', textTransform: 'uppercase', letterSpacing: '4px', fontSize: '18px' } });
  const busy = (b) => { body.querySelectorAll('button').forEach(x => x.disabled = b); };
  Net.status = (t) => { err.textContent = t; };
  body.appendChild(h('div', { class: 'statrow', style: { alignItems: 'center' } }, h('span', {}, 'Server address'), url));
  body.appendChild(h('div', { class: 'row', style: { margin: '12px 0' } },
    btn('Host a game', async () => { busy(true); err.textContent = 'Connecting…'; try { try { localStorage.setItem('hl_server', url.value.trim()); } catch (e) { } await startHosting(url.value.trim()); err.textContent = ''; closeMenu(); after && after(); } catch (e) { err.textContent = e.message + ' — you can keep playing solo.'; Net.leave(); } busy(false); }, 'primary'),
    h('span', { class: 'note', style: { margin: '0 8px' } }, 'or'), code,
    btn('Join', async () => { const c = code.value.trim().toUpperCase(); if (c.length !== 4) { err.textContent = 'Enter the 4-letter room code.'; return; } busy(true); err.textContent = 'Connecting…'; try { try { localStorage.setItem('hl_server', url.value.trim()); } catch (e) { } await startJoining(c, url.value.trim()); err.textContent = ''; closeMenu(); after && after(); } catch (e) { err.textContent = e.message; Net.leave(); } busy(false); })));
  body.appendChild(err);
  body.appendChild(h('div', { class: 'note', style: { maxWidth: '600px', lineHeight: 1.5 } }, /\.github\.io$/i.test(location.hostname) ? 'Co-op runs through the free Hearthlight server online. If nobody has played for a while it takes up to a minute to wake up. You can also run your own server (see the README) and open the game from its address.' : 'No server running? Everything works offline in solo mode.'));
}

// ---------------------------------------------------------------------------
//  NPC & object screens
// ---------------------------------------------------------------------------
function openNpc(n) {
  SFX.play('ui');
  const P = G.P;
  if (n.role === 'smith') return openSmith();
  if (n.role === 'shop') return openShop();
  if (n.role === 'stash') return openStash();
  if (n.role === 'board') return openBoard();
  if (n.role === 'altar') return openMenu('altar', (p) => { npcHeader(p, 'Card Altar', 'Arrange the ability cards you carry into the dark.'); tabCards(p, true); }, { width: 'min(860px,94vw)' });
  if (n.role === 'arcanist') return openArcanist();
  if (n.role === 'gate') return openGate();
  if (n.role === 'elder') return openElder();
  if (n.role === 'bard') { openMenu('bard', (p) => { npcHeader(p, 'Lute the Bard', 'Plays for coin. Or for free. Mostly for free.', pick(NPC_LINES.bard)); p.appendChild(btn(Music.current === 'village2' ? 'Something calmer' : 'Play something lively!', () => { Music.play(Music.current === 'village2' ? 'village' : 'village2'); closeMenu(); }, 'primary')); }); }
}
function openElder() {
  const P = G.P, ren = villageRenown(P);
  openMenu('elder', (p) => {
    npcHeader(p, 'Elder Hessa', `Keeper of the Hearth · Village renown ${ren}/${VILLAGE_UNLOCKS.length}`, npcLine('hessa'));
    p.appendChild(h('h3', {}, 'The village'));
    for (const u of VILLAGE_UNLOCKS) p.appendChild(h('div', { class: 'statrow' }, h('span', {}, u.name), u.req(P) ? h('b', { style: { color: 'var(--green)' } }, 'Built') : h('span', { class: 'note' }, u.hint)));
    p.appendChild(h('h3', {}, 'Advice'));
    const tips = ['Roll through attacks: you are untouchable for the first part of a roll.', 'Red zones fill up — the hit lands the moment the fill reaches the edge.', 'Block just as a melee blow lands to parry: the attacker staggers and you regain stamina.', 'Heavy attacks shatter shields and break the stance of elites and bosses.', 'Unbanked loot is only yours once you walk back through the portal alive.', 'Flasks refill every time you return to the Hearth.', 'Clear a dungeon to unlock its Veteran and Nightmare tiers for better loot.'];
    p.appendChild(h('div', { class: 'note', style: { maxWidth: '560px', lineHeight: 1.6 } }, pick(tips)));
  });
}
function openSmith() {
  const P = G.P; UI.smithTab = UI.smithTab || 'upgrade';
  openMenu('smith', (p) => {
    p.style.width = 'min(780px,94vw)';
    npcHeader(p, 'Brann the Smith', 'Upgrades are permanent: +10% base stats per level, up to +' + MAX_UPG, npcLine('brann'));
    p.appendChild(matsLine(P));
    const tabs = h('div', { class: 'tabs' }); for (const [id, l] of [['upgrade', 'Upgrade'], ['salvage', 'Salvage']]) tabs.appendChild(h('div', { class: 'tab' + (UI.smithTab === id ? ' on' : ''), onclick: () => { UI.smithTab = id; refreshMenu(); } }, l)); p.appendChild(tabs);
    const list = h('div', { class: 'list' });
    const items = [...Object.values(P.equip).filter(Boolean).map(it => ({ it, eq: true })), ...P.inv.map(it => ({ it, eq: false }))];
    if (UI.smithTab === 'upgrade') {
      for (const { it, eq } of items) {
        const maxed = (it.upg || 0) >= MAX_UPG, cost = upgradeCost(it);
        list.appendChild(h('div', { class: 'li' }, itemCell(it), h('div', { style: { flex: 1 } }, h('div', { class: `c-${it.rarity}` }, itemDisplayName(it) + (eq ? '  (equipped)' : '')), h('div', { class: 'note', html: maxed ? 'Fully upgraded' : 'Cost: ' + costLine(cost, P) })),
          maxed ? null : btn(`Upgrade to +${(it.upg || 0) + 1}`, () => { if (!canPay(cost, P)) { toast('Not enough materials'); SFX.play('exhausted'); return; } pay(cost, P); it.upg = (it.upg || 0) + 1; P.stats.maxUpg = Math.max(P.stats.maxUpg, it.upg); SFX.play('anvil'); applyStats(); checkAchievements(); saveGame(); refreshMenu(); }, canPay(cost, P) ? 'primary' : '')));
      }
    } else {
      p.appendChild(h('div', { class: 'note', style: { marginBottom: '6px' } }, 'Break down backpack items into Iron Scrap (and Ember Shards from rare+ items).'));
      if (!P.inv.length) list.appendChild(h('div', { class: 'note' }, 'Your backpack is empty.'));
      P.inv.forEach((it, i) => { const y = salvageYield(it); list.appendChild(h('div', { class: 'li' }, itemCell(it), h('div', { style: { flex: 1 } }, h('div', { class: `c-${it.rarity}` }, itemDisplayName(it)), h('div', { class: 'note' }, 'Yields ' + rewardText(y))), btn('Salvage', () => { const go = () => { for (const k in y) P.mats[k] = (P.mats[k] || 0) + y[k]; P.inv.splice(P.inv.indexOf(it), 1); SFX.play('anvil', 0.6); saveGame(); refreshMenu(); }; if (RARITY[it.rarity].i >= 3) confirmBox(`Salvage ${it.name}? Epic items can't be recovered.`, 'Salvage', go); else go(); }))); });
    }
    p.appendChild(list);
  });
}
function shopStock(P) {
  const rng = mulberry32(P.shopSeed * 7919 + 13), lvl = Math.max(1, P.level);
  const stock = [];
  for (let i = 0; i < 6; i++) { const it = genItem(lvl + Math.floor(rng() * 3), { rng, minRarity: i < 2 ? 'uncommon' : 'common', luck: 0.06 }); it.uid = 'shop' + P.shopSeed + '_' + i; stock.push(it); }
  return stock;
}
function openShop() {
  const P = G.P; UI.shopTab = UI.shopTab || 'buy';
  openMenu('shop', (p) => {
    p.style.width = 'min(780px,94vw)';
    npcHeader(p, 'Mira the Trader', 'New stock after every expedition.', npcLine('mira'));
    p.appendChild(matsLine(P));
    const tabs = h('div', { class: 'tabs' }); for (const [id, l] of [['buy', 'Buy'], ['sell', 'Sell']]) tabs.appendChild(h('div', { class: 'tab' + (UI.shopTab === id ? ' on' : ''), onclick: () => { UI.shopTab = id; refreshMenu(); } }, l)); p.appendChild(tabs);
    const list = h('div', { class: 'list' });
    if (UI.shopTab === 'buy') {
      const flaskCost = 150 + P.potionLvl * 175;
      const goods = [
        { name: `Flask upgrade (+1 charge, now ${P.maxPotions})`, icon: ICONS.flask, price: flaskCost, ok: P.maxPotions < 8, buy: () => { P.maxPotions++; P.potions++; P.potionLvl++; } },
        { name: 'Iron Scrap ×3', icon: ICONS.mat_iron, price: 45, ok: true, buy: () => { P.mats.iron += 3; } },
        { name: 'Ember Shard', icon: ICONS.mat_ember, price: 160, ok: true, buy: () => { P.mats.ember++; } },
      ];
      for (const g of goods) list.appendChild(h('div', { class: 'li' }, iconCanvas(g.icon, 48), h('div', { style: { flex: 1 } }, g.name), h('div', { class: 'price' }, g.price + 'g'), btn('Buy', () => { if (!g.ok) { toast('Already at maximum'); return; } if (P.gold < g.price) { toast('Not enough gold'); SFX.play('exhausted'); return; } P.gold -= g.price; g.buy(); SFX.play('buy'); saveGame(); refreshMenu(); }, P.gold >= g.price && g.ok ? 'primary' : '')));
      const bought = P.shopBought || (P.shopBought = {});
      for (const it of shopStock(P)) {
        if (bought[it.uid]) continue;
        const price = itemValue(it) * 3;
        list.appendChild(h('div', { class: 'li' }, itemCell(it), h('div', { style: { flex: 1 } }, h('div', { class: `c-${it.rarity}` }, it.name), h('div', { class: 'note' }, itemKind(it))), h('div', { class: 'price' }, price + 'g'),
          btn('Buy', () => { if (P.gold < price) { toast('Not enough gold'); SFX.play('exhausted'); return; } if (P.inv.length >= INV_SIZE) { toast('Backpack full'); return; } P.gold -= price; bought[it.uid] = 1; const c = JSON.parse(JSON.stringify(it)); c.uid = uid(); P.inv.push(c); SFX.play('buy'); saveGame(); refreshMenu(); }, P.gold >= price ? 'primary' : '')));
      }
    } else {
      const commons = P.inv.filter(i => i.rarity === 'common');
      if (commons.length) list.appendChild(h('div', { class: 'li' }, h('div', { style: { flex: 1 } }, `Sell all ${commons.length} common items`), h('div', { class: 'price' }, commons.reduce((s, i) => s + itemValue(i), 0) + 'g'), btn('Sell all', () => { for (const it of commons) { P.gold += itemValue(it); P.inv.splice(P.inv.indexOf(it), 1); } SFX.play('gold'); saveGame(); refreshMenu(); })));
      if (!P.inv.length) list.appendChild(h('div', { class: 'note' }, 'Nothing to sell.'));
      P.inv.forEach((it, i) => list.appendChild(h('div', { class: 'li' }, itemCell(it), h('div', { style: { flex: 1 } }, h('div', { class: `c-${it.rarity}` }, itemDisplayName(it)), h('div', { class: 'note' }, itemKind(it))), h('div', { class: 'price' }, itemValue(it) + 'g'), btn('Sell', () => { const go = () => { P.gold += itemValue(it); P.inv.splice(P.inv.indexOf(it), 1); SFX.play('gold'); saveGame(); refreshMenu(); }; if (RARITY[it.rarity].i >= 3) confirmBox(`Sell ${it.name} for ${itemValue(it)} gold?`, 'Sell', go); else go(); }))));
    }
    p.appendChild(list);
  });
}
function openStash() {
  const P = G.P;
  openMenu('stash', (p) => {
    p.style.width = 'min(900px,96vw)';
    npcHeader(p, 'Stash', 'Items stored here are always safe. Click an item to move it.');
    const row = h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '24px' } });
    const g1 = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(6,52px)' } }), g2 = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(8,52px)' } });
    for (let i = 0; i < INV_SIZE; i++) { const it = P.inv[i]; g1.appendChild(it ? itemCell(it, () => { if (P.stash.length >= STASH_SIZE) { toast('Stash full'); return; } P.stash.push(P.inv.splice(i, 1)[0]); saveGame(); refreshMenu(); }) : emptyCell()); }
    for (let i = 0; i < STASH_SIZE; i++) { const it = P.stash[i]; g2.appendChild(it ? itemCell(it, () => { if (P.inv.length >= INV_SIZE) { toast('Backpack full'); return; } P.inv.push(P.stash.splice(i, 1)[0]); saveGame(); refreshMenu(); }) : emptyCell()); }
    row.appendChild(h('div', {}, h('h3', {}, `Backpack ${P.inv.length}/${INV_SIZE}`), g1));
    row.appendChild(h('div', {}, h('h3', {}, `Stash ${P.stash.length}/${STASH_SIZE}`), g2));
    p.appendChild(row);
  });
}
function openBoard() {
  const P = G.P;
  openMenu('board', (p) => {
    p.style.width = 'min(720px,94vw)';
    npcHeader(p, 'Bounty Board', 'New daily bounties every day. Up to 3 active at once.');
    const today = todayStr();
    p.appendChild(h('h3', {}, 'Active'));
    if (!P.quests.active.length) p.appendChild(h('div', { class: 'note' }, 'None yet. Take one below.'));
    for (const q of P.quests.active.slice()) {
      const done = (q.prog || 0) >= q.n;
      p.appendChild(questEl(q, done ? btn('Claim reward', () => { claimBounty(q); refreshMenu(); }, 'primary') : btn('Abandon', () => { P.quests.active.splice(P.quests.active.indexOf(q), 1); refreshMenu(); }, 'small')));
    }
    p.appendChild(h('h3', {}, `Today's bounties`));
    for (const q of dailyBounties(today)) {
      const taken = P.quests.active.some(a => a.id === q.id), claimed = P.quests.claimedDaily[q.id];
      p.appendChild(questEl(q, claimed ? h('span', { class: 'pill ok' }, 'completed') : taken ? h('span', { class: 'pill' }, 'active') : btn('Accept', () => { if (P.quests.active.length >= 3) { toast('You already have 3 bounties'); return; } P.quests.active.push({ ...q, prog: 0 }); SFX.play('ui'); saveGame(); refreshMenu(); }, 'primary')));
    }
  });
}
function openArcanist() {
  const P = G.P;
  openMenu('arcanist', (p) => {
    p.style.width = 'min(820px,94vw)';
    npcHeader(p, 'Vesh the Arcanist', 'Sells copies of cards she has studied.', npcLine('vesh'));
    p.appendChild(matsLine(P));
    const notOwned = Object.keys(CARDS).filter(id => !P.cards.owned.includes(id));
    if (!notOwned.length) p.appendChild(h('div', { class: 'note' }, 'You own every card she knows. Impressive.'));
    const row = h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap' } });
    for (const id of notOwned) {
      const C = CARDS[id], price = { common: 200, uncommon: 450, rare: 900, epic: 1800 }[C.rarity], ember = RARITY[C.rarity].i;
      const cost = { gold: price }; if (ember) cost.ember = ember;
      row.appendChild(h('div', { class: 'col', style: { alignItems: 'center' } }, cardEl(id, null, null), h('div', { class: 'note', html: costLine(cost, P) }), btn('Buy', () => { if (!canPay(cost, P)) { toast('Not enough gold or Ember Shards'); SFX.play('exhausted'); return; } pay(cost, P); unlockCard(id); saveGame(); refreshMenu(); }, canPay(cost, P) ? 'primary' : 'small')));
    }
    p.appendChild(row);
  });
}
function openGate() {
  const P = G.P;
  if (Net.role === 'guest') { toast('The host chooses the dungeon. Ask them to open the gate!'); return; }
  Net.broadcast({ k: 'gateBrowse', name: P.name });
  UI.gateTier = UI.gateTier || {};
  openMenu('gate', (p) => {
    p.style.width = 'min(720px,94vw)';
    npcHeader(p, 'The Dungeon Gate', Net.role === 'host' ? `Your party (${Net.partySize()}) will travel with you. Enemies grow tougher with more heroes.` : 'Choose where the portal leads.');
    for (const [id, D] of Object.entries(DUNGEONS)) {
      const unlocked = D.unlockReq ? D.unlockReq(P) : (!D.unlockAfter || P.flags.clears[D.unlockAfter]);
      const maxTier = P.flags.tiers[id] || 0, tier = Math.min(UI.gateTier[id] ?? 0, maxTier);
      const sw = h('canvas', { width: 16, height: 16, class: 'sw' });
      const x = sw.getContext('2d'); x.fillStyle = D.pal.floor; x.fillRect(0, 0, 16, 16); x.fillStyle = D.pal.wall; x.fillRect(0, 0, 16, 6); x.fillStyle = D.pal.accent; x.fillRect(6, 9, 4, 4); x.fillStyle = D.pal.torch; x.fillRect(3, 2, 2, 2);
      const tiers = h('div', { class: 'row', style: { marginTop: '6px' } }, ...TIERS.map((T, i) => h('button', { class: 'btn small' + (i === tier ? ' primary' : ''), disabled: i > maxTier ? 'disabled' : null, onclick: (e) => { e.stopPropagation(); UI.gateTier[id] = i; refreshMenu(); } }, T.name + (i > maxTier ? ' 🔒' : ''))));
      const el = h('div', { class: 'dun' + (unlocked ? '' : ' lock') }, sw,
        h('div', { style: { flex: 1 } }, h('div', { class: 'dn' }, D.name, P.flags.clears[id] ? h('span', { class: 'pill ok' }, 'cleared') : null), h('div', { class: 'dd' }, unlocked ? D.blurb : (D.lockText || `Locked: defeat the boss of ${DUNGEONS[D.unlockAfter].name} first.`)), h('div', { class: 'note' }, `Recommended level ${D.level + TIERS[tier].lvl} · Drops ${MATERIALS[D.mat].name}`), unlocked ? tiers : null),
        unlocked ? btn('Enter', () => { closeMenu(); hostStartDungeon(id, tier); }, 'primary') : null);
      p.appendChild(el);
    }
  });
}
// death / results screen
function showDeathScreen(lost, cb) {
  banner('THE LIGHT FADES', lost, 'death', 3.6);
  setTimeout(cb, 3200);
}

// ---------------------------------------------------------------------------
//  Title & save slots
// ---------------------------------------------------------------------------
function showTitle() {
  G.scene = 'title'; showHUD(false); closeMenu();
  const root = $('menu-root'); root.innerHTML = '';
  const last = lastSlot();
  const wrap = h('div', { id: 'title-wrap' },
    h('div', { class: 'logo' }, 'HEARTHLIGHT'), h('div', { class: 'logo-sub' }, 'Keep the fire burning'),
    h('div', { class: 'tmenu' },
      last != null ? btn(`Continue — ${last.name} (Lv ${last.level})`, () => { startGame(last.slot); }, 'primary') : null,
      btn('Play', () => openSlots('play')), btn('Co-op', () => openSlots('coop')), btn('Settings', () => openMenu('settings', (p) => { p.appendChild(h('h2', {}, 'Settings')); tabSettings(p); }, { pause: false })), btn('Credits', () => openMenu('credits', (p) => { p.appendChild(h('h2', {}, 'Credits')); p.appendChild(h('div', { class: 'note', style: { lineHeight: 1.7, maxWidth: '560px' }, html: creditsHtml() })); }, { pause: false }))),
    h('div', { class: 'foot' }, 'Solo works offline · Co-op for 2–4 players needs the included Node server'));
  root.appendChild(wrap);
  G.menu = null;
  Music.play('title');
}
function openSlots(mode) {
  openMenu('slots', (p) => {
    p.appendChild(h('h2', {}, mode === 'coop' ? 'Choose a hero for co-op' : 'Choose your hero'));
    p.appendChild(h('div', { class: 'sub' }, 'Three save slots. Saves live in this browser.'));
    for (let s = 0; s < 3; s++) {
      const d = peekSave(s);
      if (d) p.appendChild(h('div', { class: 'slotcard' }, h('div', {}, h('div', { class: 'sn', style: { color: d.color } }, d.name), h('div', { class: 'si' }, `Level ${d.level} · ${fmt(d.gold)} gold · ${Object.keys(d.flags.clears).length}/3 dungeons · ${Math.floor((d.stats.playtime || 0) / 60)} min`)),
        h('div', {}, btn('Play', () => { closeMenu(); startGame(s, mode); }, 'primary'), btn('Delete', () => confirmBox(`Delete ${d.name} (level ${d.level}) forever? This can't be undone.`, 'Delete', () => { deleteSave(s); refreshMenu(); }), 'danger small'))));
      else p.appendChild(h('div', { class: 'slotcard' }, h('div', {}, h('div', { class: 'sn', style: { color: 'var(--dim)' } }, 'Empty slot'), h('div', { class: 'si' }, 'Begin a new journey')), btn('New game', () => newGameDialog(s, mode), 'primary')));
    }
  }, { pause: false });
}
function newGameDialog(slot, mode) {
  let color = PLAYER_COLORS[0];
  openMenu('newgame', (p) => {
    p.appendChild(h('h2', {}, 'A new hero'));
    p.appendChild(h('div', { class: 'sub' }, 'The village of Hearthlight huddles around its last fire. Will you keep it burning?'));
    const name = h('input', { type: 'text', maxlength: 14, value: pick(['Wren', 'Ash', 'Rook', 'Ember', 'Sable', 'Lark', 'Thorne', 'Ivy']), style: { width: '220px' } });
    const cols = h('div', { class: 'colors' });
    for (const c of PLAYER_COLORS) { const d = h('div', { style: { background: c }, class: c === color ? 'on' : '' }); d.onclick = () => { color = c; cols.querySelectorAll('div').forEach(x => x.classList.remove('on')); d.classList.add('on'); prev(); }; cols.appendChild(d); }
    const pv = h('canvas', { width: 24, height: 32, style: { width: '72px', height: '96px', imageRendering: 'pixelated' } });
    const prev = () => { const x = pv.getContext('2d'); x.clearRect(0, 0, 24, 32); x.drawImage(playerSprite(color).frames[0], 0, 0); };
    let storyOn = true;
    const modeRow = h('div', { class: 'row' });
    const drawMode = () => { modeRow.innerHTML = ''; modeRow.appendChild(btn('Story', () => { storyOn = true; drawMode(); }, storyOn ? 'primary small' : 'small')); modeRow.appendChild(btn('Free play', () => { storyOn = false; drawMode(); }, storyOn ? 'small' : 'primary small')); };
    drawMode();
    p.appendChild(h('div', { class: 'row', style: { gap: '20px' } }, pv, h('div', { class: 'col' }, h('div', { class: 'note' }, 'Name'), name, h('div', { class: 'note' }, 'Colour'), cols, h('div', { class: 'note' }, 'Mode'), modeRow, h('div', { class: 'note', style: { maxWidth: '300px' } }, 'Story adds cutscenes, guardian dialogue and the tale of the Ember Heart. Free play skips them. You can switch later in the Story tab.'))));
    prev();
    p.appendChild(h('div', { style: { marginTop: '16px' } }, btn('Begin', () => { const n = name.value.trim().slice(0, 14) || 'Wanderer'; const P = newProfile(n, color); P.story.on = storyOn; writeSave(slot, P); closeMenu(); startGame(slot, mode); }, 'primary'), btn('Back', () => openSlots(mode))));
    setTimeout(() => name.focus(), 50);
  }, { pause: false });
}

// in-game confirmation (browser confirm() dialogs are unavailable in some embeds)
function confirmBox(text, yesLabel, onYes) {
  const old = document.getElementById('confirm-box'); if (old) old.remove();
  const close = () => { wrap.remove(); };
  const wrap = h('div', { id: 'confirm-box', class: 'screen', style: { zIndex: 60, background: 'rgba(5,2,10,.7)' } },
    h('div', { class: 'panel', style: { maxWidth: '420px' } },
      h('div', { style: { fontSize: '15px', lineHeight: 1.5, marginBottom: '14px' } }, text),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, btn('Cancel', close), btn(yesLabel, () => { close(); onYes(); }, 'danger'))));
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  $('game').appendChild(wrap);
}
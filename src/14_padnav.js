// ============================================================================
//  Gamepad menu navigation: d-pad / left stick move a highlighted focus between
//  buttons, tabs, item cells and cards; A selects, B goes back, Start closes.
// ============================================================================
const PadNav = {
  focus: null, prev: [], repeatT: 0, held: null,
  active() { return G.scene === 'title' || !!G.menu || !!document.getElementById('confirm-box') || (Story.active && Story.modal); },
  root() { return document.getElementById('confirm-box') || document.querySelector('#menu-root .panel') || document.getElementById('title-wrap'); },
  items() {
    const r = this.root(); if (!r) return [];
    return [...r.querySelectorAll('button:not([disabled]), .tab, .cell, .card, .dun:not(.lock), .colors div, input[type=range]')].filter(el => el.offsetParent !== null && !el.closest('.hidden'));
  },
  // where focus starts: the first piece of content, not the tab strip or the Close button
  first(items) {
    return items.find(el => el.matches('.cell, .card, .dun')) || items.find(el => !el.matches('.tab') && !/Close|Back/.test(el.textContent)) || items[0] || null;
  },
  setFocus(el) {
    if (this.focus) this.focus.classList.remove('padfocus');
    this.focus = el; if (!el) return;
    el.classList.add('padfocus'); el.scrollIntoView({ block: 'nearest' });
    if (el.classList.contains('cell')) { const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('mouseenter', { clientX: r.right, clientY: r.top })); } else hideTip();
  },
  move(dx, dy) {
    const items = this.items(); if (!items.length) return;
    if (!this.focus || !items.includes(this.focus)) { this.setFocus(this.first(items)); return; }
    const c = this.focus.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    // prefer targets inside a cone around the pressed direction; anything else only as a fallback
    let best = null, bs = 1e9;
    for (const el of items) {
      if (el === this.focus) continue;
      const r = el.getBoundingClientRect(), ex = r.left + r.width / 2 - cx, ey = r.top + r.height / 2 - cy;
      const along = ex * dx + ey * dy; if (along <= 4) continue;
      const side = Math.abs(ex * dy - ey * dx), s = along + side * 2.5 + (side > along * 0.8 ? 5000 : 0);
      if (s < bs) { bs = s; best = el; }
    }
    if (best) { this.setFocus(best); SFX.play('ui', 0.3, 1.2); }
  },
  activate() {
    if (Story.active && Story.modal) { Story.advance(); return; }
    const el = this.focus; if (!el || !el.isConnected) { this.move(1, 0); return; }
    if (el.tagName === 'INPUT') return;
    el.click();
    // menus rebuild themselves after most clicks: re-find a sensible focus next frame
    setTimeout(() => { if (!this.focus || !this.focus.isConnected) this.setFocus(this.first(this.items())); }, 30);
  },
  back() {
    const cb = document.getElementById('confirm-box');
    if (cb) { const c = [...cb.querySelectorAll('button')].find(b => b.textContent === 'Cancel'); c && c.click(); return; }
    if (Story.active && Story.modal) { Story.skip(); return; }
    if (G.menu && G.menu !== 'endroll' && G.menu !== 'newgame') { closeMenu(); SFX.play('uiBack'); return; }
    if (G.menu === 'newgame') { openSlots('play'); }
  },
  adjust(dir) { const el = this.focus; if (el && el.tagName === 'INPUT') { el.value = Number(el.value) + dir * Number(el.step || 0.05); el.dispatchEvent(new Event('input')); return true; } return false; },
  // called from Input.pollPad while a menu or dialogue is open
  update(gp) {
    const pressed = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
    const edge = (i) => pressed(i) && !this.prev[i];
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    let dir = null;
    if (pressed(12) || ay < -0.6) dir = [0, -1]; else if (pressed(13) || ay > 0.6) dir = [0, 1];
    else if (pressed(14) || ax < -0.6) dir = [-1, 0]; else if (pressed(15) || ax > 0.6) dir = [1, 0];
    const key = dir ? dir.join() : null, now = performance.now();
    if (key && (key !== this.held || now > this.repeatT)) {
      if (!(dir[0] && this.adjust(dir[0]))) this.move(dir[0], dir[1]);
      this.repeatT = now + (key !== this.held ? 380 : 140);
    }
    this.held = key;
    if (edge(0)) this.activate();
    if (edge(1)) this.back();
    if (edge(9) && G.menu && G.menu !== 'endroll') closeMenu();
    // shoulder buttons flip pause-menu tabs
    if ((edge(4) || edge(5)) && G.menu === 'pause') { const ids = PAUSE_TABS.map(t => t[0]); const i = ids.indexOf(UI.pauseTab); UI.pauseTab = ids[(i + (edge(5) ? 1 : ids.length - 1)) % ids.length]; refreshMenu(); this.setFocus(null); }
    for (let i = 0; i < gp.buttons.length; i++) this.prev[i] = pressed(i);
    if (this.focus && !this.focus.isConnected) this.focus = null;
  },
};

// ============================================================================
//  Procedural pixel-art sprites. Everything is painted with rects at load
//  time, then crisped and auto-outlined so it reads as hand-made pixel art.
// ============================================================================
const SPR = {};
const ICONS = {};

function crispOutline(c, col = INK) {
  const x = c.getContext('2d'), w = c.width, h = c.height;
  const d = x.getImageData(0, 0, w, h), a = d.data;
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { if (a[i * 4 + 3] >= 110) { solid[i] = 1; a[i * 4 + 3] = 255; } else a[i * 4 + 3] = 0; }
  const [r, g, b] = hexRgb(col);
  if (col) for (let y = 0; y < h; y++) for (let X = 0; X < w; X++) {
    const i = y * w + X; if (solid[i]) continue;
    if ((X > 0 && solid[i - 1]) || (X < w - 1 && solid[i + 1]) || (y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w])) {
      a[i * 4] = r; a[i * 4 + 1] = g; a[i * 4 + 2] = b; a[i * 4 + 3] = 255;
    }
  }
  x.putImageData(d, 0, 0);
}
// The "polish" pass every sprite goes through:
//  - crisp alpha, top-left key light: rim highlights on top/left edges, shade on bottom/right
//  - contact shadow where one part overlaps another (under heads, belts, arms)
//  - selective outline: each outline pixel is a deep shade of the colour it borders
//    (pure ink only along the bottom, which grounds the sprite)
function polishSprite(c, opt = {}) {
  const x = c.getContext('2d'), w = c.width, h = c.height;
  const d = x.getImageData(0, 0, w, h), a = d.data, src = new Uint8ClampedArray(a);
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = src[i * 4 + 3] >= 110 ? 1 : 0;
  const S = (X, Y) => X >= 0 && Y >= 0 && X < w && Y < h && solid[Y * w + X];
  const lum = (i) => src[i * 4] * 0.3 + src[i * 4 + 1] * 0.55 + src[i * 4 + 2] * 0.15;
  const same = (i, j) => Math.abs(src[i * 4] - src[j * 4]) + Math.abs(src[i * 4 + 1] - src[j * 4 + 1]) + Math.abs(src[i * 4 + 2] - src[j * 4 + 2]) < 24;
  const set = (i, f) => { for (let k = 0; k < 3; k++) { const v = src[i * 4 + k]; a[i * 4 + k] = f >= 1 ? v + (255 - v) * (f - 1) : v * f; } };
  const shadeOn = opt.shade !== false;
  for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) {
    const i = Y * w + X;
    if (!solid[i]) { a[i * 4 + 3] = 0; continue; }
    a[i * 4 + 3] = 255;
    if (!shadeOn) continue;
    const L = lum(i); if (L < 28 || L > 238) continue; // keep inks, eyes and glints crisp
    const up = Y > 0 ? i - w : -1, dn = Y < h - 1 ? i + w : -1, lf = X > 0 ? i - 1 : -1, rt = X < w - 1 ? i + 1 : -1;
    if (!S(X, Y - 1)) set(i, 1.22);
    else if (!S(X - 1, Y)) set(i, 1.1);
    else if (!S(X, Y + 1)) set(i, 0.7);
    else if (!S(X + 1, Y)) set(i, 0.8);
    else if (up >= 0 && !same(i, up) && lum(up) + 30 < L) set(i, 0.84);      // occlusion under a darker overlapping part
    else if (up >= 0 && !same(i, up) && lum(up) > L + 30 && opt.inner !== false) set(i, 1.08);
  }
  if (opt.outline !== false) {
    const ink = hexRgb(INK);
    for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) {
      const i = Y * w + X; if (solid[i]) continue;
      let n = -1;
      if (S(X, Y + 1)) n = i + w; else if (S(X - 1, Y)) n = i - 1; else if (S(X + 1, Y)) n = i + 1; else if (S(X, Y - 1)) n = i - w;
      if (n < 0) continue;
      const below = S(X, Y - 1) && !S(X, Y + 1) && n === i - w; // outline under the sprite
      for (let k = 0; k < 3; k++) a[i * 4 + k] = below ? ink[k] : Math.round(src[n * 4 + k] * 0.22 + ink[k] * 0.62);
      a[i * 4 + 3] = 255;
    }
  }
  x.putImageData(d, 0, 0);
}
function silhouette(c, col = '#ffffff') {
  const [s, x] = mkCanvas(c.width, c.height);
  x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
  return s;
}
// make a sprite with n frames; draw(P, frame, ctx) where P(x,y,w,h,col) paints a rect
function makeSpr(name, w, h, n, draw, opt = {}) {
  const s = { frames: [], white: [], red: [], w, h, ax: opt.ax ?? Math.floor(w / 2), ay: opt.ay ?? h - 2 };
  for (let f = 0; f < n; f++) {
    const [c, x] = mkCanvas(w, h);
    const P = (px, py, pw, ph, col) => { if (col === 'clear') { x.clearRect(px, py, pw, ph); return; } x.fillStyle = col; x.fillRect(px, py, pw, ph); };
    draw(P, f, x);
    if (opt.polish === false) { if (opt.outline !== false) crispOutline(c, opt.oc || INK); }
    else polishSprite(c, opt);
    s.frames.push(c); s.white.push(silhouette(c, '#fff')); s.red.push(silhouette(c, '#ff3a2a'));
  }
  if (name) SPR[name] = s;
  return s;
}
function drawSpr(ctx, s, frame, x, y, flip = false, white = false, alpha = 1, sx = 1, sy = 1) {
  if (!s) return;
  const c = (white === 'red' ? s.red : white ? s.white : s.frames)[((frame | 0) % s.frames.length + s.frames.length) % s.frames.length];
  if (alpha !== 1) ctx.globalAlpha = alpha;
  if (!flip && sx === 1 && sy === 1) ctx.drawImage(c, Math.round(x - s.ax), Math.round(y - s.ay));
  else {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(flip ? -sx : sx, sy);
    ctx.drawImage(c, -s.ax, -s.ay); ctx.restore();
  }
  if (alpha !== 1) ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
//  Humanoid generator (24x32). frames: 0-3 walk cycle (0 = idle), 4 = back view,
//  5 = strike pose, 6 = hurt pose. o = palette / costume options.
//  Every frame then goes through polishSprite() for lighting + outlines.
// ---------------------------------------------------------------------------
function paintHumanoid(P, f, o) {
  const back = f === 4, strike = f === 5, hurt = f === 6;
  const wf = f <= 3 ? f : 0;
  const by = (wf === 1 || wf === 3) ? 1 : 0;           // body dips on the contact frames
  const sx = strike ? 1 : hurt ? -1 : 0, sy = hurt ? -1 : 0;
  const Q = (x, y, w, h, c) => { if (c && w > 0 && h > 0) P(x + sx, y + by + sy, w, h, c); };
  const skin = o.skin || '#e8b48c', body = o.body, body2 = o.body2 || shade(body, 0.7), trim = o.trim || shade(body, 0.55);
  const legC = o.skel ? skin : (o.legs || shade(body, 0.55)), boots = o.boots || '#3a2a22', glove = o.glove || skin;
  const sleeve = o.skel ? skin : (o.sleeve || body2);
  const sway = [0, 1, 0, -1][wf];

  // ---- cape behind the body (front view) ----
  if (o.cape && !back) {
    const c1 = shade(o.cape, 0.72), c2 = shade(o.cape, 0.55);
    Q(6, 11, 12, 13, c1); Q(5 + sway, 22, 14, 4, c1); Q(5 + sway, 25, 14, 1, c2);
    Q(6, 13, 1, 11, c2); Q(17, 13, 1, 11, c2);
  }
  // ---- legs ----
  if (o.robe) {
    const rb = o.robeC || body;
    Q(7, 18, 10, 4, rb); Q(6, 22, 12, 4, rb); Q(5 + (sway > 0 ? 1 : 0), 26, 14, 3, rb);
    Q(11, 18, 2, 11, shade(rb, 0.8)); Q(16, 20, 2, 8, shade(rb, 0.75));
    Q(5 + (sway > 0 ? 1 : 0), 28, 14, 1, trim);
    P(8 + (wf === 1 ? -1 : 0) + sx, 29, 3, 1, boots); P(13 + (wf === 3 ? 1 : 0) + sx, 29, 3, 1, boots);
  } else {
    const lift = [[0, 0], [2, 0], [0, 0], [0, 2]][wf];
    const lw = o.skel ? 2 : 3, pos = strike ? [7, 14] : [8, 13];
    [[pos[0], lift[0]], [pos[1], lift[1]]].forEach(([lx, up], k) => {
      const bot = 30 - up + (strike && k === 1 ? 0 : 0), top = 21 + by;
      P(lx + sx, top, lw, bot - 3 - top, legC);
      if (!o.skel) { P(lx + sx, top + 2, 1, 2, shade(legC, 1.25)); P(lx + lw - 1 + sx, top, 1, bot - 3 - top, shade(legC, 0.8)); }
      else P(lx + sx, top + 3, lw, 1, shade(skin, 1.15)); // knee joint
      P(lx + sx, bot - 3, lw + 1, 3, boots);
      P(lx + sx, bot - 3, lw + 1, 1, shade(boots, 1.4));
      P(lx + sx, bot, lw + 1, 1, shade(boots, 0.55));
    });
  }
  // ---- torso ----
  if (back) {
    if (o.cape) { Q(6, 11, 12, 13, o.cape); Q(5 + sway, 22, 14, 4, o.cape); Q(5 + sway, 25, 14, 1, shade(o.cape, 0.7)); Q(9, 13, 1, 11, shade(o.cape, 0.8)); Q(14, 13, 1, 11, shade(o.cape, 0.8)); Q(6, 11, 12, 1, shade(o.cape, 1.25)); }
    else if (o.robe) { Q(7, 11, 10, 8, o.robeC || body); }
    else { Q(7, 11, 10, 9, body); Q(7, 18, 10, 2, o.belt || '#3a2418'); Q(7, 20, 10, 2, body); Q(11, 12, 2, 6, shade(body, 0.85)); }
  } else if (o.skel) {
    Q(8, 12, 8, 7, '#241a2c');
    Q(11, 11, 2, 9, shade(skin, 0.82));
    for (let i = 0; i < 4; i++) { Q(8, 12 + i * 2, 3, 1, skin); Q(13, 12 + i * 2, 3, 1, skin); }
    Q(8, 19, 8, 2, shade(skin, 0.88)); Q(9, 18, 6, 1, shade(skin, 0.7));
    if (o.body) { Q(8, 20, 8, 3, o.body); Q(8, 23, 2, 1, o.body); Q(11, 23, 2, 2, o.body); Q(14, 23, 2, 1, o.body); Q(8, 20, 8, 1, shade(o.body, 0.7)); }
  } else if (o.robe) {
    const rb = o.robeC || body;
    Q(7, 11, 10, 8, rb); Q(15, 12, 2, 7, shade(rb, 0.75));
    Q(10, 11, 4, 2, skin); Q(11, 13, 2, 6, trim); Q(7, 18, 10, 1, o.belt || trim);
    if (o.chest) Q(10, 14, 4, 3, o.chest);
  } else {
    Q(8, 11, 8, 1, body); Q(7, 12, 10, 6, body); Q(8, 17, 8, 1, body); Q(15, 12, 2, 6, body2);
    Q(11, 13, 2, 5, shade(body, 0.86));
    Q(8, 11, 8, 1, trim); Q(10, 11, 4, 2, o.collar || shade(skin, 0.85)); Q(11, 12, 2, 1, shade(skin, 0.7));
    if (o.apron) { Q(9, 13, 6, 9, o.apron); Q(9, 13, 6, 1, shade(o.apron, 1.25)); Q(9, 13, 1, 9, shade(o.apron, 1.1)); Q(11, 16, 2, 2, shade(o.apron, 0.7)); }
    if (o.chest) { Q(10, 14, 4, 3, o.chest); Q(11, 15, 2, 1, shade(o.chest, 0.6)); }
    if (o.strap) for (let i = 0; i < 6; i++) Q(8 + i, 12 + i, 2, 1, o.strap);
    Q(7, 18, 10, 2, o.belt || '#3a2418'); Q(11, 18, 2, 2, o.buckle || '#e8b04a'); Q(11, 18, 1, 1, '#fff2c0');
    Q(7, 20, 10, 2, body); Q(6, 21, 2, 1, body); Q(16, 21, 2, 1, body2); Q(15, 20, 2, 2, body2);
    if (o.pouch) { Q(14, 19, 2, 3, o.pouch); Q(14, 19, 2, 1, shade(o.pouch, 1.3)); }
  }
  // ---- arms ----
  const aw = [0, 1, 0, -1][wf];
  if (strike) {
    Q(17, 12, 4, 2, sleeve); Q(21, 12, 2, 2, glove);
    Q(5, 13, 2, 4, sleeve); Q(6, 17, 2, 2, glove);
  } else if (hurt) {
    Q(4, 7, 2, 5, sleeve); Q(4, 5, 2, 2, glove); Q(18, 7, 2, 5, sleeve); Q(18, 5, 2, 2, glove);
  } else {
    Q(5, 12 + aw, 2, 6, sleeve); Q(5, 18 + aw, 2, 2, glove);
    Q(17, 12 - aw, 2, 6, sleeve); Q(17, 18 - aw, 2, 2, glove);
    if (!o.skel) { Q(5, 12 + aw, 1, 5, shade(sleeve, 1.15)); Q(17, 16 - aw, 2, 1, shade(sleeve, 0.75)); }
  }
  if (o.pauldron) { for (const px of [4, 16]) { Q(px, 11, 4, 3, o.pauldron); Q(px, 11, 4, 1, shade(o.pauldron, 1.35)); Q(px + 1, 13, 2, 1, shade(o.pauldron, 0.7)); } }
  // ---- head ----
  const eyeC = o.eyes || '#1a1020';
  const eyes = () => {
    if (hurt) { Q(9, 8, 2, 1, '#1a1020'); Q(13, 8, 2, 1, '#1a1020'); return; }
    Q(10, 7, 1, 2, eyeC); Q(13, 7, 1, 2, eyeC);
    if (!o.eyes) { Q(10, 7, 1, 1, '#f4f0ff'); Q(13, 7, 1, 1, '#f4f0ff'); }
  };
  if (o.helm) {
    const hm = o.helm;
    Q(9, 1, 6, 1, hm); Q(8, 2, 8, 1, hm); Q(7, 3, 10, 8, hm); Q(15, 3, 2, 7, shade(hm, 0.75)); Q(9, 1, 6, 1, shade(hm, 1.3)); Q(8, 2, 1, 1, shade(hm, 1.3));
    if (!back) {
      Q(9, 6, 6, 2, '#0a0610'); Q(11, 6, 2, 4, shade(hm, 0.82));
      if (o.eyes) { Q(9, 6, 1, 1, o.eyes); Q(14, 6, 1, 1, o.eyes); }
      Q(8, 9, 1, 1, shade(hm, 1.5)); Q(15, 9, 1, 1, shade(hm, 1.5));
    }
    Q(7, 10, 10, 1, shade(hm, 0.6));
    if (o.plume) { Q(11, 0, 3, 2, o.plume); Q(13, 1, 3, 2, o.plume); Q(15, 2, 2, 3, shade(o.plume, 0.8)); }
    if (o.horns) { Q(5, 3, 2, 2, o.horns); Q(4, 1, 2, 2, o.horns); Q(17, 3, 2, 2, o.horns); Q(18, 1, 2, 2, o.horns); }
  } else if (o.hood) {
    const hd = o.hood;
    Q(10, 0, 4, 1, hd); Q(9, 1, 6, 1, hd); Q(8, 2, 8, 1, hd); Q(7, 3, 10, 8, hd); Q(16, 4, 1, 7, shade(hd, 0.75)); Q(10, 0, 4, 1, shade(hd, 1.3)); Q(9, 1, 2, 1, shade(hd, 1.25));
    Q(7, 11, 10, 1, shade(hd, 0.85));
    if (!back) {
      Q(9, 5, 6, 6, o.faceDark ? '#0a0610' : skin);
      Q(9, 5, 6, 1, shade(hd, 0.45)); Q(8, 5, 1, 6, shade(hd, 1.18)); Q(15, 5, 1, 6, shade(hd, 0.7));
      if (o.faceDark) { if (o.eyes) { Q(10, 7, 1, 1, o.eyes); Q(13, 7, 1, 1, o.eyes); } }
      else { eyes(); Q(11, 9, 2, 1, shade(skin, 0.75)); Q(14, 6, 1, 4, shade(skin, 0.85)); }
    } else Q(11, 3, 2, 8, shade(hd, 0.85));
  } else if (o.skel) {
    Q(8, 3, 8, 7, skin); Q(9, 2, 6, 1, skin); Q(15, 4, 1, 5, shade(skin, 0.8));
    if (!back) {
      Q(9, 5, 2, 2, '#0a0610'); Q(13, 5, 2, 2, '#0a0610');
      if (o.eyes && !hurt) { Q(10, 6, 1, 1, o.eyes); Q(13, 6, 1, 1, o.eyes); }
      Q(11, 7, 2, 1, shade(skin, 0.5));
      Q(9, 9, 6, 1, shade(skin, 0.6)); Q(9, 10, 6, 1, skin); Q(10, 10, 1, 1, shade(skin, 0.5)); Q(13, 10, 1, 1, shade(skin, 0.5));
    }
    if (o.helmet) { Q(9, 1, 6, 1, o.helmet); Q(8, 2, 8, 2, o.helmet); Q(8, 4, 8, 1, shade(o.helmet, 0.7)); Q(11, 1, 2, 1, shade(o.helmet, 1.4)); Q(9, 3, 1, 1, shade(o.helmet, 0.6)); Q(14, 2, 1, 1, shade(o.helmet, 0.5)); }
  } else {
    Q(9, 3, 6, 1, skin); Q(8, 4, 8, 6, skin); Q(9, 10, 6, 1, shade(skin, 0.82)); Q(15, 4, 1, 6, shade(skin, 0.86));
    Q(7, 6, 1, 2, skin); Q(16, 6, 1, 2, shade(skin, 0.85));
    const hair = o.hair;
    if (back) { if (hair) { Q(7, 2, 10, 8, hair); Q(8, 1, 8, 1, hair); if (o.longHair) Q(7, 10, 10, 3, hair); } }
    else {
      if (hair) {
        Q(8, 2, 8, 3, hair); Q(7, 3, 1, 4, hair); Q(16, 3, 1, 4, hair); Q(8, 1, 7, 1, hair);
        Q(8, 5, 2, 1, hair); Q(12, 5, 1, 1, hair); Q(14, 5, 2, 1, hair); Q(9, 2, 4, 1, shade(hair, 1.3));
        if (o.longHair) { Q(7, 7, 1, 6, hair); Q(16, 7, 1, 6, hair); }
      } else { Q(9, 3, 4, 1, shade(skin, 1.15)); }
      eyes(); Q(11, 9, 2, 1, shade(skin, 0.7));
      if (o.beard) { Q(8, 8, 8, 4, o.beard); Q(9, 12, 6, 1, o.beard); Q(10, 13, 4, 1, shade(o.beard, 0.8)); Q(10, 9, 4, 1, shade(o.beard, 0.65)); Q(7, 6, 1, 3, o.beard); Q(16, 6, 1, 3, o.beard); }
    }
    if (o.hat) { Q(5, 3, 14, 2, o.hat); Q(8, 0, 8, 3, o.hat); Q(8, 2, 8, 1, shade(o.hat, 0.6)); Q(5, 3, 14, 1, shade(o.hat, 1.25)); if (o.feather) { Q(15, 0, 1, 3, o.feather); Q(16, 0, 2, 1, o.feather); } }
    if (o.crown) { Q(8, 1, 8, 2, o.crown); Q(8, 0, 1, 1, o.crown); Q(11, 0, 2, 1, o.crown); Q(15, 0, 1, 1, o.crown); Q(11, 1, 2, 1, '#d8304a'); }
    if (o.scarf) { Q(7, 1, 10, 4, o.scarf); Q(7, 5, 1, 5, o.scarf); Q(16, 4, 2, 3, shade(o.scarf, 0.8)); Q(7, 1, 10, 1, shade(o.scarf, 1.25)); for (let i = 0; i < 4; i++) Q(8 + i * 2, 3, 1, 1, shade(o.scarf, 0.7)); }
  }
  if (o.collarScarf && !back) { Q(8, 10, 8, 2, o.collarScarf); Q(14, 12, 2, 4, o.collarScarf); Q(8, 10, 8, 1, shade(o.collarScarf, 1.25)); }
}
function humanoid(name, o) { return makeSpr(name, 24, 32, 7, (P, f) => paintHumanoid(P, f, o), { ax: 12, ay: 30 }); }

// quadruped (rat / wolf) or crab, 30x20, 4 gallop frames
function quad(name, o) {
  return makeSpr(name, 32, 22, 4, (P, f) => {
    const b = o.body, b2 = shade(b, 0.7), b3 = shade(b, 0.5), up = [0, -1, 0, -1][f], Y = 2 + up;
    if (o.crab) {
      const sh = o.body, sh2 = shade(sh, 0.7);
      // legs (3 per side), skittering
      for (let i = 0; i < 3; i++) { const k = (f + i) % 2; P(7 + i * 4, 13 + Y - k, 2, 4 + k, b3); P(5 + i * 4, 16 + Y, 3, 1, b3); P(17 + i * 4, 13 + Y - (1 - k), 2, 4 + (1 - k), b3); P(18 + i * 4, 16 + Y, 3, 1, b3); }
      // shell
      P(6, 6 + Y, 20, 8, sh); P(8, 4 + Y, 16, 2, sh); P(5, 9 + Y, 22, 4, sh2); P(10, 5 + Y, 12, 1, shade(sh, 1.35));
      for (let i = 0; i < 4; i++) P(9 + i * 4, 7 + Y, 2, 1, shade(sh, 1.2));
      // eye stalks
      P(13, 1 + Y, 1, 4, sh2); P(18, 1 + Y, 1, 4, sh2); P(12, 0 + Y, 3, 2, '#f4f0e0'); P(17, 0 + Y, 3, 2, '#f4f0e0'); P(13, 0 + Y, 1, 1, INK); P(18, 0 + Y, 1, 1, INK);
      // claws
      const c = o.claw, open = f % 2;
      P(1, 5 + Y, 6, 5, c); P(0, 4 + Y - open, 3, 2, c); P(1, 9 + Y + open, 3, 2, c); P(2, 6 + Y, 3, 1, shade(c, 1.3));
      P(25, 5 + Y, 6, 5, c); P(29, 4 + Y - open, 3, 2, c); P(28, 9 + Y + open, 3, 2, c); P(27, 6 + Y, 3, 1, shade(c, 1.3));
      return;
    }
    const leg = (x, ph, far) => {
      const s = Math.sin((f + ph) * Math.PI / 2), off = Math.round(s * 2), lift = s > 0.5 ? 1 : 0;
      const c = far ? b3 : b2;
      P(x + off, 12 + Y, 2, 5 - lift, c); P(x + off, 16 + Y - lift, 3, 1, far ? shade(b, 0.4) : shade(b, 0.55));
    };
    leg(8, 1, true); leg(20, 3, true);
    if (o.tail) { P(1, 7 + Y, 6, 2, o.tail); P(0, 5 + Y, 2, 3, o.tail); P(1, 7 + Y, 6, 1, shade(o.tail, 1.2)); }
    // body
    P(5, 6 + Y, 18, 7, b); P(7, 5 + Y, 14, 1, b); P(6, 12 + Y, 16, 1, b2);
    P(9, 11 + Y, 11, 1, shade(o.belly || b, 1.18));
    for (let i = 0; i < 5; i++) P(7 + i * 3, 5 + Y + (i % 2), 2, 1, shade(b, 1.3)); // fur tufts
    P(18, 6 + Y, 4, 5, shade(b, 1.08)); // shoulder mass
    if (o.spikes) for (let i = 0; i < 5; i++) { P(7 + i * 3, 3 + Y, 1, 2, o.spikes); P(8 + i * 3, 4 + Y, 1, 1, shade(o.spikes, 0.8)); }
    // head
    P(21, 3 + Y, 7, 7, b); P(26, 6 + Y, 5, 3, o.snout || b2); P(30, 6 + Y, 1, 1, INK);
    P(21, 1 + Y, 2, 3, o.ear || b2); P(24, 1 + Y, 2, 2, o.ear || b2); P(22, 2 + Y, 1, 1, shade(o.ear || b2, 1.4));
    P(24, 5 + Y, 2, 1, o.eye || '#ff3b2f'); P(24, 5 + Y, 1, 1, '#fff8e0');
    P(26, 9 + Y, 4, 1, shade(b, 0.45)); P(27, 9 + Y, 1, 1, '#f4f0e0'); P(29, 9 + Y, 1, 1, '#f4f0e0');
    leg(10, 0, false); leg(19, 2, false);
  }, { ax: 16, ay: 19 });
}

// armoured horned champion (elite), 36x40, 4 walk frames + back
function brute(name, o) {
  return makeSpr(name, 38, 42, 5, (P, f) => {
    const back = f === 4, wf = back ? 0 : f, by = (wf === 1 || wf === 3) ? 1 : 0;
    const b = o.body, b2 = shade(b, 0.7), m = o.metal, m2 = shade(m, 0.65), m3 = shade(m, 1.3);
    const Q = (x, y, w, h, c) => P(x, y + by, w, h, c);
    // cape / tabard behind
    Q(9, 14, 20, 18, shade(o.belt || b, 0.6));
    // legs + greaves
    const lift = [[0, 0], [2, 0], [0, 0], [0, 2]][wf];
    [[11, lift[0]], [21, lift[1]]].forEach(([lx, up]) => {
      P(lx, 28 + by, 6, 7 - up - by, b2); P(lx, 31, 6, 1, m3);
      P(lx - 1, 34 - up, 8, 4, m); P(lx - 1, 34 - up, 8, 1, m3); P(lx - 1, 38 - up, 8, 1, m2); P(lx + 2, 35 - up, 2, 2, shade(m, 0.8));
    });
    // torso
    Q(8, 13, 22, 15, b); Q(25, 14, 5, 14, b2);
    if (!back) {
      Q(11, 15, 16, 10, m); Q(11, 15, 16, 1, m3); Q(24, 16, 3, 9, m2); Q(18, 16, 2, 9, shade(m, 0.85));
      Q(13, 17, 1, 1, m3); Q(24, 17, 1, 1, m3); Q(13, 23, 1, 1, m3); Q(24, 23, 1, 1, m3);
      Q(17, 18, 4, 4, o.emblem || '#c9a24a'); Q(18, 19, 2, 2, shade(o.emblem || '#c9a24a', 0.6));
    } else { Q(11, 15, 16, 10, b2); Q(18, 15, 2, 12, shade(b, 0.55)); }
    Q(8, 26, 22, 3, o.belt || '#4a2a1a'); Q(17, 26, 4, 3, '#e8b04a'); Q(18, 27, 2, 1, '#fff2c0');
    Q(15, 29, 8, 6, o.belt || '#4a2a1a'); Q(15, 34, 2, 1, o.belt || '#4a2a1a'); Q(21, 34, 2, 1, o.belt || '#4a2a1a');
    // arms + gauntlets
    const aw = [0, 1, 0, -1][wf];
    Q(3, 15 + aw, 6, 11, b2); Q(29, 15 - aw, 6, 11, b2);
    Q(2, 25 + aw, 7, 5, m); Q(29, 25 - aw, 7, 5, m); Q(2, 25 + aw, 7, 1, m3); Q(29, 25 - aw, 7, 1, m3);
    Q(3, 20 + aw, 6, 1, m2); Q(29, 20 - aw, 6, 1, m2);
    // pauldrons with spikes
    for (const [px, sp] of [[1, 2], [27, 34]]) { Q(px, 10, 10, 6, m); Q(px, 10, 10, 2, m3); Q(px + 1, 15, 8, 1, m2); Q(sp, 7, 2, 3, o.horn); Q(sp, 6, 1, 1, shade(o.horn, 1.3)); }
    // helm
    Q(13, 2, 12, 12, m); Q(14, 1, 10, 1, m3); Q(13, 2, 12, 1, m3); Q(22, 3, 3, 10, m2);
    if (!back) { Q(15, 7, 8, 2, '#0a0610'); Q(16, 7, 2, 1, o.eyes); Q(20, 7, 2, 1, o.eyes); Q(18, 7, 2, 6, shade(m, 0.85)); Q(15, 10, 1, 3, m2); Q(22, 10, 1, 3, m2); }
    // horns
    Q(10, 3, 3, 2, o.horn); Q(8, 0, 3, 4, o.horn); Q(8, 0, 1, 1, shade(o.horn, 1.3));
    Q(25, 3, 3, 2, o.horn); Q(27, 0, 3, 4, o.horn); Q(29, 0, 1, 1, shade(o.horn, 1.3));
  }, { ax: 19, ay: 39 });
}
// robed caster floating above the ground, 26x36, 4 hover frames
function caster(name, o) {
  return makeSpr(name, 26, 36, 4, (P, f) => {
    const fl = [2, 1, 0, 1][f];
    const R2 = (x, y, w, h, c) => P(x, y + fl, w, h, c);
    const r = o.robe, r2 = shade(r, 0.7), r3 = shade(r, 0.5);
    // robe with tattered hem
    R2(8, 14, 10, 6, r); R2(7, 20, 12, 5, r); R2(6, 25, 14, 4, r);
    for (let i = 0; i < 7; i++) R2(6 + i * 2, 29, 1, 1 + ((i + f) % 2), r2);
    R2(16, 15, 2, 14, r2); R2(6, 27, 14, 1, r3);
    R2(12, 14, 2, 15, o.trim); R2(8, 14, 10, 1, o.trim); R2(12, 20, 2, 1, shade(o.trim, 1.4)); R2(12, 25, 2, 1, shade(o.trim, 1.4));
    // sleeves + glowing hands
    R2(4, 15, 4, 6, r2); R2(18, 15, 4, 6, r2); R2(4, 15, 4, 1, shade(r, 1.2)); R2(18, 15, 4, 1, shade(r, 1.2));
    R2(4, 21, 3, 2, o.hand); R2(19, 21, 3, 2, o.hand); R2(4, 21, 1, 1, '#ffffff'); R2(21, 21, 1, 1, '#ffffff');
    // hood with a void for a face
    R2(7, 4, 12, 11, o.hood); R2(9, 3, 8, 1, o.hood); R2(11, 2, 4, 1, o.hood); R2(7, 4, 12, 1, shade(o.hood, 1.3)); R2(17, 5, 2, 9, shade(o.hood, 0.7));
    R2(9, 7, 8, 7, '#0a0610'); R2(9, 7, 8, 1, shade(o.hood, 0.4));
    R2(10, 9, 2, 1, o.eyes); R2(14, 9, 2, 1, o.eyes); R2(10, 9, 1, 1, '#ffffff'); R2(14, 9, 1, 1, '#ffffff');
    R2(8, 14, 10, 1, shade(o.hood, 0.6));
    if (o.horns) { R2(6, 2, 2, 3, o.horns); R2(5, 0, 1, 3, o.horns); R2(18, 2, 2, 3, o.horns); R2(20, 0, 1, 3, o.horns); }
    // rune sigils on the robe
    R2(9, 22, 1, 2, o.trim); R2(16, 23, 1, 2, o.trim);
  }, { ax: 13, ay: 33 });
}

// --------------------------- bosses ----------------------------------------
// shape helpers for the big sprites
function bossKit(P) {
  const E = (cx, cy, rx, ry, c) => { for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.01)))); if (w > 0) P(Math.round(cx - w), Math.round(cy + y), w * 2, 1, c); } };
  const L = (x0, y0, x1, y1, c, t = 1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) P(Math.round(x0 + (x1 - x0) * i / n - t / 2 + 0.5), Math.round(y0 + (y1 - y0) * i / n - t / 2 + 0.5), t, t, c); };
  return { E, L };
}
// The Hollow King: a towering skeletal monarch in rotted royal armour (56x66)
function bossHollowKing() {
  return makeSpr('hollowking', 58, 68, 5, (P, f) => {
    const { E, L } = bossKit(P);
    const back = f === 4, wf = back ? 0 : f, by = (wf === 1 || wf === 3) ? 1 : 0, sway = [0, 1, 0, -1][wf];
    const bone = '#e4dcc4', bone2 = '#a89f86', cape = '#3a1d5a', cape2 = '#25113d', gold = '#e0b04a', goldL = '#ffe08a', ice = '#8ff3ff', iron = '#4a4458', iron2 = '#6a6488';
    const Q = (x, y, w, h, c) => P(x, y + by, w, h, c);
    // tattered royal cape
    Q(12, 20, 34, 30, cape2); P(10 + sway, 48, 38, 10, cape2);
    for (let i = 0; i < 9; i++) P(10 + sway + i * 4, 58, 3, 2 + (i % 3), cape2);
    Q(12, 20, 34, 2, cape); P(11, 30, 2, 26, cape); P(45, 30, 2, 26, cape);
    // legs: bone with iron greaves
    const lift = [[0, 0], [2, 0], [0, 0], [0, 2]][wf];
    [[20, lift[0]], [32, lift[1]]].forEach(([lx, up]) => {
      P(lx, 44 + by, 5, 10 - up - by, bone2); P(lx + 1, 47 + by, 3, 1, bone);
      P(lx - 1, 54 - up, 7, 7, iron); P(lx - 1, 54 - up, 7, 1, iron2); P(lx - 2, 60 - up, 9, 3, iron); P(lx - 2, 63 - up, 9, 1, '#2a2438'); P(lx + 1, 56 - up, 3, 3, gold);
    });
    if (!back) {
      // armoured skirt (tassets)
      for (let i = 0; i < 5; i++) { Q(17 + i * 5, 39, 5, 8 + (i % 2), iron); Q(17 + i * 5, 39, 5, 1, iron2); Q(19 + i * 5, 44, 1, 1, gold); }
      // ribcage under a cracked breastplate
      Q(18, 21, 22, 18, '#241a2c');
      for (let i = 0; i < 5; i++) { Q(19, 23 + i * 3, 8, 2, bone); Q(31, 23 + i * 3, 8, 2, bone); }
      Q(27, 21, 4, 18, bone2); Q(28, 21, 2, 18, bone);
      Q(20, 21, 18, 6, iron); Q(20, 21, 18, 1, iron2); Q(27, 22, 4, 4, gold); Q(28, 23, 2, 2, '#d8304a');
      Q(18, 36, 22, 3, '#3a2a1a'); Q(26, 36, 6, 3, gold); Q(27, 37, 4, 1, goldL);
    } else { Q(16, 21, 26, 18, cape); Q(28, 21, 2, 18, cape2); }
    // arms with gauntlets
    const aw = [0, 1, 0, -1][wf];
    Q(10, 24 + aw, 5, 14, bone2); Q(43, 24 - aw, 5, 14, bone2); Q(11, 26 + aw, 2, 10, bone); Q(44, 26 - aw, 2, 10, bone);
    Q(8, 37 + aw, 8, 6, iron); Q(42, 37 - aw, 8, 6, iron); Q(8, 37 + aw, 8, 1, iron2); Q(42, 37 - aw, 8, 1, iron2);
    // skull pauldrons
    for (const px of [5, 39]) { Q(px, 17, 14, 8, iron); Q(px, 17, 14, 2, iron2); Q(px + 4, 19, 6, 5, bone); Q(px + 5, 20, 2, 2, '#140c1c'); Q(px + 8, 20, 2, 2, '#140c1c'); Q(px, 24, 14, 1, '#2a2438'); }
    // skull
    Q(21, 4, 16, 15, bone); Q(23, 3, 12, 1, bone); Q(35, 5, 2, 13, bone2); Q(23, 4, 10, 2, '#fff8e8');
    if (!back) {
      Q(23, 9, 5, 4, '#0a0610'); Q(31, 9, 5, 4, '#0a0610'); Q(24, 10, 2, 2, ice); Q(32, 10, 2, 2, ice); Q(25, 10, 1, 1, '#ffffff'); Q(33, 10, 1, 1, '#ffffff');
      Q(28, 13, 2, 2, '#3a3040'); Q(23, 16, 12, 3, bone2); for (let i = 0; i < 6; i++) Q(23 + i * 2, 16, 1, 2, bone); Q(22, 18, 14, 1, '#6a6050');
      Q(21, 7, 1, 4, bone2); Q(36, 7, 1, 4, bone2);
    }
    // crown
    Q(20, 0, 18, 5, gold); Q(20, 0, 18, 1, goldL); Q(20, -2 + 2, 2, 1, gold);
    for (const cx of [20, 25, 30, 35]) { Q(cx, -1 + 1, 3, 1, gold); }
    Q(23, 2, 3, 2, ice); Q(28, 2, 2, 2, '#d8304a'); Q(32, 2, 3, 2, ice); Q(20, 4, 18, 1, '#a07020');
  }, { ax: 29, ay: 64 });
}
// Thornmother: a walking tree-flower with root legs and thorned vine arms (72x66)
function bossThornmother() {
  return makeSpr('thornmother', 76, 68, 4, (P, f) => {
    const { E, L } = bossKit(P);
    const s = [0, 1, 0, -1][f];
    const bark = '#5a4028', bark2 = '#3a2a1a', bark3 = '#7a5a38', leaf = '#4f8f3a', leaf2 = '#2f5f26', leafL = '#8fd06a', petal = '#e05a8a', petal2 = '#8f2a55', glow = '#ffe96a';
    // roots spreading on the ground
    for (let i = 0; i < 7; i++) { const rx = 8 + i * 10, k = (i + f) % 2; L(rx + 4, 50, rx - 2 + k * 3, 63, bark2, 4); L(rx + 4, 50, rx + 1 + k, 64, bark, 2); }
    // trunk body
    E(38, 42, 18, 16, bark); E(38, 30, 15, 12, bark);
    for (let i = 0; i < 6; i++) L(26 + i * 5, 28 + (i % 2) * 4, 27 + i * 5, 54, bark2, 1);
    E(32, 34, 4, 9, bark3); P(46, 30, 4, 22, bark2);
    // glowing heart cracks
    L(36, 38, 40, 48, '#ff9a3c'); L(40, 48, 38, 54, '#ffcf6a'); P(37, 40, 2, 2, '#fff2c0');
    // vine arms with thorns and leaves
    const arm = (dir, ph) => {
      const x0 = 38 + dir * 14, y0 = 32, x1 = 38 + dir * 32, y1 = 22 + ph;
      L(x0, y0, x1, y1, leaf2, 4); L(x0, y0 - 1, x1, y1 - 1, leaf, 2);
      for (let i = 1; i < 5; i++) { const t = i / 5, tx = Math.round(x0 + (x1 - x0) * t), ty = Math.round(y0 + (y1 - y0) * t); P(tx, ty - 3, 1, 2, '#e8e0a0'); P(tx + dir, ty + 2, 1, 2, '#e8e0a0'); }
      E(x1, y1 - 2, 5, 4, leaf); E(x1 + dir * 2, y1 - 3, 3, 2, leafL); P(x1 + dir * 4, y1 + 1, 3, 3, '#e8e0a0');
    };
    arm(-1, s); arm(1, -s);
    // crown of leaves
    E(38, 12, 24, 10, leaf2); E(38, 9, 20, 7, leaf); E(22, 14, 7, 5, leaf); E(54, 14, 7, 5, leaf);
    for (let i = 0; i < 8; i++) { E(18 + i * 6, 5 + (i % 2) * 2, 3, 2, i % 2 ? leafL : leaf); }
    E(30, 6, 4, 2, leafL);
    // flower face
    E(38, 22 + s, 13, 10, petal2); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; E(38 + Math.cos(a) * 10, 22 + s + Math.sin(a) * 7, 4, 3, i % 2 ? petal : shade(petal, 1.2)); }
    E(38, 22 + s, 7, 6, '#2a0f1e'); E(38, 22 + s, 4, 4, glow); E(37, 21 + s, 2, 2, '#fff7c2');
    for (let i = 0; i < 5; i++) P(33 + i * 2, 27 + s, 1, 2, '#f4f0e0');
  }, { ax: 38, ay: 63 });
}
// The Tidewyrm: a sea serpent rising from black water (68x66)
function bossTidewyrm() {
  return makeSpr('tidewyrm', 70, 68, 4, (P, f) => {
    const { E, L } = bossKit(P);
    const s = [0, 1, 2, 1][f];
    const sc = '#2f7f8f', sc2 = '#1d4f5c', sc3 = '#4fa8b8', belly = '#a8e8d0', belly2 = '#78b8a0', fin = '#7fe8ff', fin2 = '#3fb8c8', eye = '#ffef6a';
    // coils breaking the surface
    E(12, 58, 11, 7, sc2); E(12, 56, 9, 4, sc); E(58, 59, 10, 6, sc2); E(58, 57, 8, 3, sc);
    for (let i = 0; i < 4; i++) { P(6 + i * 4, 52, 2, 3, fin2); P(52 + i * 4, 53, 2, 3, fin2); }
    // neck rising in an S curve
    for (let i = 0; i < 16; i++) {
      const t = i / 15, cx = 35 + Math.sin(t * 3 + s * 0.3) * 6, cy = 60 - t * 36 - s, r = 9 - t * 2;
      E(cx, cy, r, 3, sc); E(cx - 2, cy, r - 4, 2, belly);
      if (i % 2 === 0) { P(Math.round(cx + r - 2), Math.round(cy - 1), 2, 2, sc3); P(Math.round(cx - r + 3), Math.round(cy), 2, 1, belly2); }
    }
    // spine fins down the neck
    for (let i = 0; i < 6; i++) { const t = i / 6, cx = 35 + Math.sin(t * 3 + s * 0.3) * 6 + 7 - t * 2, cy = 58 - t * 34 - s; P(Math.round(cx), Math.round(cy) - 3, 3, 4, fin); P(Math.round(cx) + 1, Math.round(cy) - 4, 2, 1, '#c9fff8'); }
    // head
    const hx = 33, hy = 12 - s;
    E(hx, hy + 2, 15, 9, sc); E(hx, hy - 1, 13, 5, sc3); E(hx - 2, hy + 8, 13, 4, sc2);
    P(hx - 13, hy + 7, 26, 3, '#140c1c'); for (let i = 0; i < 9; i++) { P(hx - 12 + i * 3, hy + 7, 1, 2, '#f4f4e8'); P(hx - 11 + i * 3, hy + 9, 1, 1, '#f4f4e8'); }
    E(hx - 7, hy + 1, 3, 2, '#0a0610'); E(hx + 7, hy + 1, 3, 2, '#0a0610'); P(hx - 8, hy, 2, 2, eye); P(hx + 6, hy, 2, 2, eye); P(hx - 8, hy, 1, 1, '#ffffff'); P(hx + 6, hy, 1, 1, '#ffffff');
    // frills / crest
    L(hx - 14, hy, hx - 21, hy - 6, fin, 2); L(hx - 14, hy + 3, hx - 22, hy + 2, fin2, 2); L(hx + 14, hy, hx + 21, hy - 6, fin, 2); L(hx + 14, hy + 3, hx + 22, hy + 2, fin2, 2);
    for (let i = 0; i < 4; i++) { P(hx - 7 + i * 4, hy - 9 + (i % 2), 2, 4, fin); P(hx - 7 + i * 4, hy - 9 + (i % 2), 1, 1, '#c9fff8'); }
    P(hx - 1, hy - 4, 2, 2, '#c9fff8');
  }, { ax: 35, ay: 63 });
}

// The Pale Sovereign: a fallen star in a ragged robe of frost, crowned in icicles (58x70)
function bossSovereign() {
  return makeSpr('sovereign', 60, 72, 5, (P, f) => {
    const { E, L } = bossKit(P);
    const back = f === 4, wf = back ? 0 : f, by = [0, -1, -2, -1][wf], sway = [0, 1, 0, -1][wf];
    const robe = '#d8e0f0', robe2 = '#9aa8c8', robe3 = '#5a6488', void_ = '#0a0814', ice = '#bfe8ff', iceL = '#ffffff', glow = '#a8d8ff';
    const Q = (x, y, w, h, c) => P(x, y + by, w, h, c);
    // floating ice fragments around it
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + wf * 0.4, rx = 30 + Math.cos(a) * 26, ry = 40 + Math.sin(a) * 10; P(Math.round(rx), Math.round(ry + by), 2, 3, i % 2 ? ice : robe2); }
    // long ragged robe, hovering (no feet)
    Q(17, 22, 26, 22, robe2); Q(14, 34, 32, 16, robe2); Q(11, 46, 38, 12, robe3);
    for (let i = 0; i < 10; i++) Q(11 + i * 4 + (i % 2 ? sway : 0), 58, 3, 3 + ((i + wf) % 3), robe3);
    Q(19, 22, 22, 30, robe); Q(26, 22, 8, 34, robe2); Q(19, 22, 22, 2, '#ffffff');
    if (!back) { Q(27, 26, 6, 26, void_); for (let i = 0; i < 5; i++) Q(29, 28 + i * 5, 2, 2, glow); } // a rift of starless dark down its chest
    // long arms ending in claws
    const aw = [0, 1, 0, -1][wf];
    L(17, 25, 6, 40 + aw, robe2, 5); L(43, 25, 54, 40 - aw, robe2, 5);
    for (const [hx, hy, dir] of [[6, 41 + aw, -1], [54, 41 - aw, 1]]) { for (let k = 0; k < 3; k++) L(hx, hy, hx + dir * (2 + k), hy + 6 + k, ice, 1); P(hx - 2, hy - 1, 4, 3, robe); }
    // shoulders
    E(18, 22, 6, 4, robe); E(42, 22, 6, 4, robe);
    // hooded head with a single cold light
    E(30, 13, 9, 10, robe); Q(21, 12, 18, 12, robe); Q(22, 5, 16, 2, robe2);
    if (!back) { E(30, 15, 6, 7, void_); P(29, 13 + by, 3, 3, glow); P(30, 14 + by, 1, 1, iceL); }
    // crown of icicles
    for (let i = 0; i < 7; i++) { const x = 20 + i * 3.3, hgt = 4 + (i === 3 ? 6 : i % 2 ? 2 : 4); L(Math.round(x), 6 + by, Math.round(x), 6 + by - hgt, i === 3 ? iceL : ice, 2); }
  }, { ax: 30, ay: 64 });
}

// --------------------------- props -----------------------------------------
function buildProps() {
  // memory stone: a standing stone with pale glowing runes (lore)
  makeSpr('memstone', 14, 24, 2, (P, f) => {
    const s = '#5a6078', s2 = '#3a3e54', g = f ? '#d8f0ff' : '#8fc8ff';
    P(3, 2, 8, 20, s); P(2, 5, 10, 17, s); P(4, 1, 6, 1, s); P(10, 5, 2, 17, s2); P(2, 20, 11, 3, s2);
    P(6, 5, 2, 1, g); P(5, 7, 1, 3, g); P(8, 8, 1, 2, g); P(6, 11, 3, 1, g); P(6, 14, 1, 3, g); P(8, 15, 1, 1, g); P(5, 18, 4, 1, g);
  }, { ax: 7, ay: 22 });  makeSpr('chest', 16, 14, 2, (P, f) => {
    const w = '#7a4a26', w2 = '#4f2e17', g = '#f0b752';
    if (f === 0) { P(1, 4, 14, 9, w); P(1, 4, 14, 3, shade(w, 1.2)); P(1, 7, 14, 1, w2); P(1, 4, 2, 9, g); P(13, 4, 2, 9, g); P(7, 6, 2, 3, g); P(7, 8, 2, 1, INK); }
    else { P(1, 7, 14, 6, w); P(1, 2, 14, 4, w2); P(2, 6, 12, 2, '#ffe9a0'); P(1, 7, 2, 6, g); P(13, 7, 2, 6, g); P(1, 2, 14, 1, shade(w, 1.2)); }
  }, { ax: 8, ay: 12 });
  makeSpr('bigchest', 22, 18, 2, (P, f) => {
    const w = '#4a2a66', w2 = '#2c1740', g = '#f0b752';
    if (f === 0) { P(1, 5, 20, 12, w); P(1, 5, 20, 4, shade(w, 1.25)); P(1, 9, 20, 1, w2); P(1, 5, 2, 12, g); P(19, 5, 2, 12, g); P(9, 7, 4, 5, g); P(10, 9, 2, 2, INK); P(1, 15, 20, 1, g); }
    else { P(1, 9, 20, 8, w); P(1, 2, 20, 6, w2); P(2, 8, 18, 2, '#fff2c0'); P(1, 9, 2, 8, g); P(19, 9, 2, 8, g); }
  }, { ax: 11, ay: 16 });
  makeSpr('key', 9, 13, 1, (P) => { const g = '#ffd34a'; P(2, 0, 5, 5, g); P(3, 1, 3, 3, INK); P(4, 5, 1, 7, g); P(5, 8, 2, 1, g); P(5, 10, 2, 1, g); P(3, 0, 3, 1, '#fff2a0'); }, { ax: 4, ay: 12 });
  makeSpr('bosskey', 11, 15, 1, (P) => { const g = '#e05aff'; P(2, 0, 7, 7, g); P(4, 2, 3, 3, INK); P(5, 7, 1, 7, g); P(6, 10, 3, 1, g); P(6, 12, 3, 1, g); P(3, 0, 5, 1, '#ffc2ff'); P(5, 3, 1, 1, '#ffef6a'); }, { ax: 5, ay: 14 });
  for (const [k, c] of [['crypt', '#8a7a9a'], ['forest', '#8a6a3a'], ['cave', '#4a8a9a'], ['village', '#b0703a'], ['abyss', '#8a94b0']]) {
    makeSpr('pot_' + k, 12, 13, 1, (P) => { P(3, 0, 6, 2, shade(c, 0.7)); P(2, 2, 8, 2, c); P(1, 4, 10, 7, c); P(2, 11, 8, 1, shade(c, 0.7)); P(2, 5, 8, 1, shade(c, 1.3)); P(8, 4, 2, 6, shade(c, 0.75)); P(3, 7, 6, 1, shade(c, 0.8)); }, { ax: 6, ay: 12 });
  }
  makeSpr('barrel', 12, 14, 1, (P) => { const w = '#7a4f2a'; P(1, 1, 10, 12, w); P(1, 1, 10, 2, shade(w, 1.25)); P(1, 4, 10, 1, '#3a3a44'); P(1, 10, 10, 1, '#3a3a44'); P(8, 2, 2, 10, shade(w, 0.75)); }, { ax: 6, ay: 13 });
  makeSpr('crate', 14, 14, 1, (P) => { const w = '#8a5f34'; P(1, 1, 12, 12, w); P(1, 1, 12, 1, shade(w, 1.3)); P(1, 6, 12, 1, shade(w, 0.7)); P(2, 2, 1, 10, shade(w, 0.7)); P(11, 2, 1, 10, shade(w, 0.7)); }, { ax: 7, ay: 13 });
  makeSpr('bones', 14, 7, 1, (P) => { const b = '#cfc6ad'; P(1, 3, 8, 1, b); P(0, 2, 2, 3, b); P(8, 2, 2, 3, b); P(9, 1, 4, 4, b); P(10, 2, 1, 1, INK); P(12, 2, 1, 1, INK); }, { ax: 7, ay: 6 });
  makeSpr('sconce', 8, 10, 1, (P) => { P(2, 4, 4, 2, '#4a3a3a'); P(3, 6, 2, 4, '#3a2a2a'); P(1, 2, 6, 2, '#6a5a5a'); }, { ax: 4, ay: 9 });
  makeSpr('brazier', 14, 14, 1, (P) => { const m = '#5a4a5a'; P(1, 3, 12, 4, m); P(1, 3, 12, 1, shade(m, 1.4)); P(3, 7, 8, 2, shade(m, 0.7)); P(5, 9, 4, 4, m); P(3, 12, 8, 2, shade(m, 0.7)); P(3, 2, 8, 1, '#ff9a3c'); }, { ax: 7, ay: 13 });
  makeSpr('anvil', 18, 12, 1, (P) => { const m = '#4a4e58'; P(1, 1, 16, 4, m); P(1, 1, 16, 1, '#8a909e'); P(0, 2, 3, 2, m); P(6, 5, 6, 3, shade(m, 0.7)); P(3, 8, 12, 3, m); P(4, 7, 1, 1, '#ff8a3a'); }, { ax: 9, ay: 11 });
  makeSpr('board', 22, 24, 1, (P) => {
    const w = '#6a4528'; P(2, 8, 2, 16, shade(w, .7)); P(18, 8, 2, 16, shade(w, .7)); P(0, 2, 22, 14, w); P(0, 2, 22, 2, shade(w, 1.3)); P(1, 4, 20, 11, '#3a2616');
    P(3, 5, 6, 7, '#e8dcbc'); P(10, 6, 5, 6, '#d8c89c'); P(16, 5, 4, 8, '#e8dcbc'); P(5, 5, 1, 1, '#c22'); P(12, 6, 1, 1, '#c22'); P(18, 5, 1, 1, '#c22');
    P(4, 7, 4, 1, '#8a7a5a'); P(4, 9, 3, 1, '#8a7a5a'); P(11, 8, 3, 1, '#8a7a5a'); P(17, 8, 2, 1, '#8a7a5a'); P(17, 10, 2, 1, '#8a7a5a');
    P(2, 0, 18, 2, '#3a5a6a');
  }, { ax: 11, ay: 23 });
  makeSpr('altar', 20, 18, 1, (P) => {
    const s = '#5a4a78'; P(2, 8, 16, 9, s); P(2, 8, 16, 2, shade(s, 1.3)); P(14, 10, 4, 7, shade(s, 0.7)); P(0, 15, 20, 3, shade(s, 0.8));
    P(5, 2, 10, 7, '#2a1a3d'); P(6, 3, 3, 5, '#c9a6ff'); P(11, 3, 3, 5, '#46d6c8'); P(8, 1, 4, 6, '#f0b752'); P(9, 2, 2, 4, '#fff2c0');
  }, { ax: 10, ay: 17 });
  makeSpr('grave', 12, 16, 1, (P) => { const s = '#6a6478'; P(2, 2, 8, 13, s); P(3, 1, 6, 1, s); P(2, 2, 8, 1, shade(s, 1.3)); P(8, 3, 2, 12, shade(s, .75)); P(5, 4, 2, 6, shade(s, .6)); P(4, 6, 4, 1, shade(s, .6)); P(1, 14, 10, 2, '#3a3448'); }, { ax: 6, ay: 15 });
  makeSpr('statue', 20, 34, 1, (P) => {
    const s = '#7a7490', s2 = '#55506a'; P(2, 26, 16, 7, s2); P(2, 26, 16, 1, s); P(6, 8, 8, 18, s); P(12, 9, 2, 17, s2); P(7, 2, 6, 7, s); P(4, 9, 3, 10, s); P(13, 9, 3, 10, s2);
    P(15, 0, 2, 22, '#9a94b0'); P(14, 0, 4, 2, '#f0b752'); P(7, 2, 6, 1, '#9a94b0');
  }, { ax: 10, ay: 33 });
  makeSpr('lantern', 8, 22, 1, (P) => { P(3, 6, 2, 16, '#3a2c2c'); P(1, 0, 6, 7, '#2a2020'); P(2, 1, 4, 5, '#ffcf6a'); P(1, 20, 6, 2, '#2a2020'); P(3, 2, 2, 3, '#fff2c0'); }, { ax: 4, ay: 21 });
  makeSpr('stashchest', 22, 17, 1, (P) => { const w = '#5a3a20', g = '#c9c9d9'; P(1, 3, 20, 13, w); P(1, 3, 20, 4, shade(w, 1.25)); P(1, 7, 20, 1, INK); P(1, 3, 2, 13, g); P(19, 3, 2, 13, g); P(9, 5, 4, 5, g); P(10, 7, 2, 2, INK); P(1, 14, 20, 1, g); }, { ax: 11, ay: 16 });
  makeSpr('well', 22, 22, 1, (P) => { const s = '#6a6478'; P(2, 12, 18, 9, s); P(2, 12, 18, 2, shade(s, 1.3)); P(4, 13, 14, 2, '#0a1a2a'); P(3, 2, 2, 11, '#5a3a20'); P(17, 2, 2, 11, '#5a3a20'); P(1, 0, 20, 3, '#7a3a2a'); P(10, 3, 1, 6, '#8a8a8a'); P(9, 8, 3, 3, '#5a3a20'); }, { ax: 11, ay: 21 });
  makeSpr('stall', 34, 28, 1, (P) => {
    P(2, 10, 2, 18, '#5a3a20'); P(30, 10, 2, 18, '#5a3a20');
    for (let i = 0; i < 8; i++) P(i * 4 + 1, 4, 4, 7, i % 2 ? '#c9302a' : '#f2e4c4'); P(0, 3, 34, 2, '#7a2a1a'); P(1, 10, 32, 1, '#7a2a1a');
    P(2, 18, 30, 7, '#7a4f2a'); P(2, 18, 30, 1, '#a07040'); P(5, 15, 4, 3, '#d84a4a'); P(11, 15, 3, 3, '#46d6c8'); P(16, 14, 5, 4, '#e8b04a'); P(23, 15, 4, 3, '#9b6cff');
  }, { ax: 17, ay: 27 });
  makeSpr('fence', 16, 12, 1, (P) => { const w = '#6a4a2a'; P(1, 2, 2, 10, w); P(13, 2, 2, 10, w); P(0, 4, 16, 2, shade(w, 1.2)); P(0, 8, 16, 2, w); }, { ax: 8, ay: 11 });
  makeSpr('banner', 10, 26, 1, (P) => { P(4, 0, 2, 26, '#4a3a2a'); P(0, 2, 10, 2, '#4a3a2a'); P(1, 4, 8, 14, '#7a1f3a'); P(1, 18, 3, 3, '#7a1f3a'); P(6, 18, 3, 3, '#7a1f3a'); P(3, 8, 4, 4, '#f0b752'); P(4, 9, 2, 2, '#ff9a3c'); }, { ax: 5, ay: 25 });
  makeSpr('scaffold', 30, 30, 1, (P) => {
    const w = '#7a5a34'; P(2, 4, 2, 26, w); P(14, 4, 2, 26, w); P(26, 4, 2, 26, w); P(0, 6, 30, 2, w); P(0, 16, 30, 2, w); P(0, 26, 30, 2, shade(w, .8));
    for (let i = 0; i < 4; i++) P(4 + i * 6, 8 + i * 2, 2, 2, shade(w, .7)); P(18, 20, 8, 6, '#8a5f34'); P(18, 20, 8, 1, '#b08050'); P(6, 22, 6, 4, '#9aa3ad');
  }, { ax: 15, ay: 29 });
  makeSpr('portalframe', 30, 34, 1, (P) => {
    const s = '#4a3e60', s2 = '#2e2640'; P(0, 6, 6, 28, s); P(24, 6, 6, 28, s); P(0, 0, 30, 7, s); P(4, 2, 22, 3, s2); P(5, 6, 1, 28, shade(s, 1.3)); P(0, 0, 30, 1, shade(s, 1.4));
    for (let i = 0; i < 4; i++) { P(1, 10 + i * 6, 4, 1, s2); P(25, 10 + i * 6, 4, 1, s2); } P(13, 1, 4, 4, '#46d6c8'); P(14, 2, 2, 2, '#c9fff8');
  }, { ax: 15, ay: 33 });
  // trees & foliage (village + forest)
  for (let v = 0; v < 3; v++) makeSpr('tree' + v, 30, 40, 1, (P) => {
    const tr = '#4a3020', l1 = ['#1f4a3a', '#24503a', '#2a4430'][v], l2 = shade(l1, 1.35), l3 = shade(l1, 0.7);
    P(13, 26, 5, 13, tr); P(11, 36, 9, 3, tr); P(16, 27, 2, 12, shade(tr, .7));
    P(4, 10, 22, 16, l1); P(7, 4, 16, 8, l1); P(2, 14, 26, 9, l1); P(10, 1, 10, 5, l1);
    P(6, 6, 8, 5, l2); P(4, 13, 6, 4, l2); P(11, 2, 6, 3, l2); P(20, 20, 7, 4, l3); P(6, 22, 18, 4, l3); P(22, 10, 4, 8, l3);
    if (v === 2) { P(8, 12, 2, 2, '#d84a7a'); P(18, 8, 2, 2, '#d84a7a'); P(14, 18, 2, 2, '#ffd34a'); }
  }, { ax: 15, ay: 38 });
  makeSpr('bush', 14, 10, 1, (P) => { const l = '#2a5a3a'; P(1, 3, 12, 7, l); P(3, 1, 8, 3, l); P(3, 2, 4, 3, shade(l, 1.35)); P(9, 6, 3, 3, shade(l, .7)); }, { ax: 7, ay: 9 });
  makeSpr('rock', 12, 9, 1, (P) => { const s = '#5a5668'; P(1, 2, 10, 7, s); P(3, 0, 6, 3, s); P(3, 1, 4, 2, shade(s, 1.3)); P(8, 4, 3, 5, shade(s, .7)); }, { ax: 6, ay: 8 });
  makeSpr('mushroom', 8, 8, 1, (P) => { P(1, 1, 6, 3, '#3fd0c9'); P(2, 0, 4, 1, '#9ff8f0'); P(3, 4, 2, 4, '#d8cfb4'); P(2, 2, 1, 1, '#c9fff8'); }, { ax: 4, ay: 7 });
  makeSpr('crystal', 10, 14, 1, (P) => { P(3, 2, 4, 12, '#3fb7c1'); P(4, 0, 2, 3, '#9ff8f0'); P(0, 6, 3, 8, '#2a8f99'); P(7, 5, 3, 9, '#2a8f99'); P(4, 3, 1, 9, '#c9fff8'); }, { ax: 5, ay: 13 });
  makeSpr('pillarFallen', 26, 10, 1, (P) => { const s = '#6a6478'; P(1, 2, 24, 7, s); P(1, 2, 24, 2, shade(s, 1.3)); P(0, 1, 4, 9, shade(s, .8)); P(22, 1, 4, 9, shade(s, .8)); P(8, 4, 1, 4, shade(s, .6)); P(15, 4, 1, 4, shade(s, .6)); }, { ax: 13, ay: 9 });
  makeSpr('coffin', 12, 22, 1, (P) => { const w = '#4a3a3a'; P(2, 1, 8, 20, w); P(1, 4, 10, 8, w); P(2, 1, 8, 1, shade(w, 1.4)); P(5, 5, 2, 9, '#8a7a5a'); P(3, 8, 6, 2, '#8a7a5a'); }, { ax: 6, ay: 21 });
}

// --------------------------- weapons (pointing right, pivot at left) --------
// --------------------------- characters ------------------------------------
function buildCharacters() {
  // player sprite is built per colour on demand
  // crypt enemies
  humanoid('crypt_grunt', { skin: '#e4dcc4', skel: true, body: '#5a4a6e', boots: '#4a3a5e', eyes: '#ff4a3a', helmet: '#7a6a5a' });
  humanoid('crypt_archer', { skin: '#e4dcc4', skel: true, body: '#3a3a2a', hood: '#4a3a2e', faceDark: true, eyes: '#ff4a3a', boots: '#2a2a1e', collarScarf: '#5a2a2a' });
  humanoid('crypt_shield', { skin: '#cfc6ad', body: '#4a4e5e', body2: '#33364a', helm: '#6a7088', eyes: '#ff4a3a', pauldron: '#7a8098', legs: '#3a3e4e', boots: '#22242e', plume: '#9a2a4a', chest: '#5a2a3a', belt: '#2a2030', buckle: '#a8a8b8', glove: '#6a7088' });
  quad('crypt_flanker', { body: '#6a5a6a', eye: '#ff3b2f', tail: '#c89aa0', snout: '#c89aa0', ear: '#c89aa0' });
  caster('crypt_caster', { robe: '#3a1d5a', hood: '#2a143f', trim: '#c9a24a', eyes: '#8ff3ff', hand: '#e4dcc4' });
  brute('crypt_elite', { body: '#3a3448', metal: '#6a6488', skin: '#e4dcc4', eyes: '#8ff3ff', horn: '#e4dcc4', belt: '#2a1a3d' });
  // forest
  humanoid('forest_grunt', { skin: '#7a9a4a', body: '#4a6a2a', body2: '#34501e', hair: '#2f5f26', eyes: '#ffe96a', legs: '#5a3a20', boots: '#3a2a1a', longHair: true, strap: '#6a4a2a', belt: '#4a3018', buckle: '#9fd86a' });
  humanoid('forest_archer', { skin: '#8aa45a', body: '#3a5a2a', hood: '#2a4a20', eyes: '#ffe96a', legs: '#4a3a20', boots: '#2a1e12', cape: '#2a4a20', strap: '#6a4a2a', pouch: '#5a3a1a' });
  humanoid('forest_shield', { skin: '#6a5030', body: '#5a4228', body2: '#3e2c1a', helm: '#4a3a24', eyes: '#9fff6a', pauldron: '#3a6a2a', legs: '#4a3420', boots: '#2a1e12', horns: '#8a6a3a', chest: '#3a6a2a', glove: '#4a3a24' });
  quad('forest_flanker', { body: '#6a6a72', eye: '#ffd34a', tail: '#4a4a52', snout: '#3a3a42', ear: '#4a4a52', spikes: '#8a8a92' });
  caster('forest_caster', { robe: '#3a4a2a', hood: '#5a2a4a', trim: '#d84a7a', eyes: '#9fff6a', hand: '#8aa45a', horns: '#6a4a2a' });
  brute('forest_elite', { body: '#4a3a26', metal: '#5a7a3a', skin: '#6a5030', eyes: '#ffe96a', horn: '#8a6a3a', belt: '#2f5f26' });
  // cave
  humanoid('cave_grunt', { skin: '#7aa0a8', body: '#2a4a5a', body2: '#1d3540', hair: '#2f6f5f', eyes: '#ffef6a', legs: '#3a5a6a', boots: '#1a2a32', longHair: true, collarScarf: '#2f6f5f', buckle: '#7fe8ff' });
  humanoid('cave_archer', { skin: '#7aa0a8', body: '#1d3a4a', hood: '#2a5a6a', faceDark: true, eyes: '#7fe8ff', legs: '#2a4a5a', boots: '#12222a', strap: '#c86a5a', cape: '#1d3a4a' });
  humanoid('cave_shield', { skin: '#5a8088', body: '#3a5a6a', body2: '#2a4050', helm: '#4a8a9a', eyes: '#ffef6a', pauldron: '#e08a6a', legs: '#2a4050', boots: '#1a2a32', plume: '#ff8a6a', chest: '#c86a5a', glove: '#3a6a7a' });
  quad('cave_flanker', { body: '#c8604a', eye: '#000', tail: '#a04a3a', snout: '#a04a3a', ear: '#a04a3a', crab: true, claw: '#ff8a6a' });
  caster('cave_caster', { robe: '#1d4a5a', hood: '#123440', trim: '#7fe8ff', eyes: '#ffef6a', hand: '#7aa0a8' });
  brute('cave_elite', { body: '#2a4a5a', metal: '#3f8f9f', skin: '#7aa0a8', eyes: '#ffef6a', horn: '#e0e8d8', belt: '#123440' });
  // villagers / NPCs
  humanoid('npc_brann', { skin: '#d8a07a', body: '#5a4a3a', beard: '#7a4a2a', apron: '#4a3022', legs: '#3a3030', boots: '#2a1e18', sleeve: '#d8a07a', glove: '#3a2a22', belt: '#2a1a12' });
  humanoid('npc_mira', { skin: '#c88a6a', body: '#7a2a4a', scarf: '#e8b04a', legs: '#4a2a3a', boots: '#2a1a1a', trim: '#e8b04a', pouch: '#8a5a2a', collarScarf: '#c9a24a', hair: '#2a1a1a' });
  humanoid('npc_hessa', { skin: '#e0b89a', body: '#6a6a7a', robeC: '#5a5a72', hood: '#d8d0c0', robe: true, trim: '#f0b752', boots: '#4a4a5a', chest: '#f0b752' });
  humanoid('npc_vesh', { skin: '#a8b8d8', body: '#3a1d5a', hood: '#5a2a8a', eyes: '#c9fff8', robe: true, trim: '#46d6c8', boots: '#2a143f', chest: '#46d6c8', pauldron: '#5a2a8a' });
  humanoid('npc_bard', { skin: '#e0b089', body: '#2a6a4a', hair: '#c86a2a', hat: '#2a4a3a', feather: '#e84a4a', legs: '#5a4a3a', boots: '#3a2a1a', strap: '#8a5a2a', collarScarf: '#d8b04a' });
  const vc = [['#7a5a3a', '#4a3a2a', '#d8a07a'], ['#3a5a7a', '#2a2a3a', '#c88a6a'], ['#7a3a3a', '#6a4a2a', '#e0b89a'], ['#5a6a3a', '#2a1e18', '#a07050']];
  vc.forEach(([b, hair, s], i) => humanoid('villager' + i, { skin: s, body: b, hair, legs: shade(b, .6), boots: '#2a1e18', longHair: i % 2 === 1, apron: i === 2 ? '#d8c8a8' : null, pouch: i === 0 ? '#6a4a2a' : null, collarScarf: i === 3 ? '#c86a2a' : null }));
  // the Hollow Below: pale, frost-bitten things
  humanoid('abyss_grunt', { skin: '#c8d4e8', skel: true, body: '#3a4058', boots: '#2a3048', eyes: '#a8d8ff', helmet: '#8a98b8' });
  humanoid('abyss_archer', { skin: '#b8c8e0', body: '#2a3048', hood: '#d8e0f0', faceDark: true, eyes: '#a8d8ff', legs: '#3a4058', boots: '#1a1e30', cape: '#8a98b8' });
  humanoid('abyss_shield', { skin: '#a8b8d0', body: '#4a5470', body2: '#343c58', helm: '#c8d4e8', eyes: '#a8d8ff', pauldron: '#e0e8f8', legs: '#343c58', boots: '#1a1e30', plume: '#a8d8ff', chest: '#7a8ab0', glove: '#c8d4e8' });
  quad('abyss_flanker', { body: '#3a3a58', eye: '#a8d8ff', tail: '#5a5a80', snout: '#2a2a40', ear: '#5a5a80', spikes: '#c8e0ff' });
  caster('abyss_caster', { robe: '#c8d0e8', hood: '#e0e8f8', trim: '#5a7ac8', eyes: '#a8d8ff', hand: '#a8d8ff' });
  brute('abyss_elite', { body: '#3a4058', metal: '#a8b4d0', skin: '#c8d4e8', eyes: '#a8d8ff', horn: '#e0f0ff', belt: '#2a3048', emblem: '#a8d8ff' });
  bossHollowKing(); bossThornmother(); bossTidewyrm(); bossSovereign();}
const _playerSprCache = {};
function playerSprite(color) {
  if (_playerSprCache[color]) return _playerSprCache[color];
  const s = humanoid(null, { skin: '#e8b48c', body: shade(color, 0.75), body2: shade(color, 0.55), trim: '#c9a24a', hood: shade(color, 0.92), cape: shade(color, 0.6), legs: '#3a2e40', boots: '#3a2620', glove: '#5a3a26', strap: '#6a4628', belt: '#3a2418', pouch: '#7a5232', collar: '#e8d8b8' });
  _playerSprCache[color] = s; return s;
}

function buildIcons() {
  icon('sword', P => { P(2, 12, 3, 3, '#5a3a20'); P(4, 10, 3, 3, '#c9a24a'); P(6, 3, 2, 9, '#d8dde8'); for (let i = 0; i < 8; i++) P(6 + i, 9 - i, 2, 2, '#d8dde8'); P(13, 1, 2, 2, '#fff'); P(3, 9, 5, 1, '#c9a24a'); });
  icon('axe', P => { for (let i = 0; i < 10; i++) P(3 + i, 13 - i, 2, 2, '#7a4f2a'); P(8, 1, 7, 7, '#b8bfcc'); P(13, 0, 2, 9, '#eef'); P(9, 2, 2, 5, '#8a909e'); });
  icon('spear', P => { for (let i = 0; i < 12; i++) P(1 + i, 14 - i, 1, 1, '#7a4f2a'), P(2 + i, 14 - i, 1, 1, '#5a3a20'); P(11, 1, 4, 4, '#d8dde8'); P(13, 0, 3, 2, '#fff'); P(10, 4, 2, 2, '#c9a24a'); });
  icon('daggers', P => { for (let i = 0; i < 6; i++) { P(3 + i, 11 - i, 2, 2, '#d8dde8'); P(11 - i, 11 - i, 2, 2, '#c8ccd8'); } P(2, 12, 3, 3, '#3a2a3a'); P(11, 12, 3, 3, '#3a2a3a'); });
  const arm = (k, c, c2, tr) => icon(k, P => { P(3, 3, 10, 11, c); P(1, 3, 3, 5, c2); P(12, 3, 3, 5, c2); P(6, 2, 4, 2, INK); P(6, 3, 4, 1, c2); P(3, 11, 10, 1, tr); P(7, 5, 2, 5, shade(c, 1.2)); });
  arm('leather', '#8a5a34', '#6a4024', '#c9a24a'); arm('chain', '#8a909e', '#6a707e', '#5a5a6a'); arm('plate', '#b8bfcc', '#8a909e', '#c9a24a'); arm('robe', '#5a2a8a', '#3a1d5a', '#46d6c8');
  icon('ring', P => { P(4, 5, 8, 8, '#e8b04a'); P(6, 7, 4, 4, INK); P(6, 2, 4, 4, '#5aaeff'); P(7, 3, 1, 1, '#fff'); });
  icon('amulet', P => { P(3, 1, 1, 6, '#c9a24a'); P(12, 1, 1, 6, '#c9a24a'); P(4, 6, 2, 2, '#c9a24a'); P(10, 6, 2, 2, '#c9a24a'); P(5, 8, 6, 6, '#e8b04a'); P(6, 9, 4, 4, '#d84a7a'); P(7, 10, 1, 1, '#fff'); });
  icon('idol', P => { P(5, 2, 6, 5, '#8a7a5a'); P(4, 7, 8, 7, '#7a6a4a'); P(6, 4, 1, 1, '#ff9a3c'); P(9, 4, 1, 1, '#ff9a3c'); P(3, 13, 10, 2, '#5a4a3a'); P(7, 9, 2, 3, '#e8b04a'); });
  icon('potion', P => { P(6, 1, 4, 2, '#8a6a4a'); P(6, 3, 4, 2, '#c8d8e8'); P(3, 5, 10, 9, '#c8d8e8'); P(4, 7, 8, 6, '#e2483c'); P(5, 7, 2, 3, '#ff9a8a'); P(4, 13, 8, 1, '#a02020'); });
  icon('gold', P => { P(2, 8, 7, 6, '#c9902a'); P(3, 9, 5, 4, '#f0c050'); P(7, 4, 7, 6, '#c9902a'); P(8, 5, 5, 4, '#ffd76a'); P(9, 6, 1, 1, '#fff'); });
  icon('key', P => { P(2, 2, 6, 6, '#ffd34a'); P(4, 4, 2, 2, INK); P(7, 7, 2, 2, '#ffd34a'); for (let i = 0; i < 5; i++) P(8 + i, 8 + i, 2, 2, '#ffd34a'); P(11, 13, 2, 2, '#ffd34a'); });
  icon('flask', P => { P(6, 1, 4, 3, '#8a6a4a'); P(4, 4, 8, 10, '#c8d8e8'); P(5, 7, 6, 6, '#ff9a3c'); P(6, 7, 2, 2, '#ffe0a0'); });
  for (const m in MATERIALS) icon('mat_' + m, P => { const c = MATERIALS[m].color; P(4, 5, 8, 7, c); P(5, 4, 6, 9, c); P(5, 5, 3, 2, shade(c, 1.4)); P(9, 9, 2, 3, shade(c, .7)); });
}
// card art: 16x16 symbolic pictures
function buildCardIcons() {
  const C = (id, draw) => icon('card_' + id, draw);
  C('fireball', P => { P(5, 5, 7, 7, '#ff8a3a'); P(6, 6, 4, 4, '#ffd76a'); P(7, 7, 2, 2, '#fff'); P(1, 9, 4, 2, '#ff5a2a'); P(2, 5, 3, 2, '#ff5a2a'); P(0, 7, 3, 1, '#c22'); P(12, 4, 2, 2, '#ffd76a'); });
  C('groundslam', P => { P(6, 1, 4, 7, '#a0a8b8'); P(5, 0, 6, 3, '#d8dde8'); P(7, 8, 2, 3, '#6a4528'); P(1, 12, 14, 2, '#8a6a3a'); P(0, 11, 3, 1, '#d6a35a'); P(13, 11, 3, 1, '#d6a35a'); P(3, 9, 2, 2, '#d6a35a'); P(11, 9, 2, 2, '#d6a35a'); P(6, 11, 4, 1, '#fff2c0'); });
  C('shadowstep', P => { P(2, 4, 4, 9, '#3a1d5a'); P(3, 2, 3, 3, '#3a1d5a'); P(9, 4, 4, 9, '#9b6cff'); P(10, 2, 3, 3, '#9b6cff'); P(11, 3, 1, 1, '#fff'); P(6, 7, 3, 1, '#c9a6ff'); P(6, 9, 2, 1, '#c9a6ff'); });
  C('healaura', P => { P(2, 2, 12, 12, '#1d4a30'); P(6, 3, 4, 10, '#7cf0a0'); P(3, 6, 10, 4, '#7cf0a0'); P(7, 4, 2, 8, '#d8ffe4'); P(4, 7, 8, 2, '#d8ffe4'); });
  C('frostnova', P => { P(7, 0, 2, 16, '#8fe6ff'); P(0, 7, 16, 2, '#8fe6ff'); for (let i = 0; i < 5; i++) { P(2 + i * 2, 2 + i * 2, 2, 2, '#bff4ff'); P(12 - i * 2, 2 + i * 2, 2, 2, '#bff4ff'); } P(6, 6, 4, 4, '#fff'); });
  C('chainzap', P => { const y = '#ffe96a'; P(9, 0, 3, 2, y); P(7, 2, 3, 3, y); P(5, 5, 6, 2, y); P(8, 7, 3, 2, y); P(6, 9, 3, 3, y); P(4, 12, 3, 3, y); P(7, 5, 2, 1, '#fff'); P(1, 3, 2, 2, '#fff8b0'); P(13, 10, 2, 2, '#fff8b0'); });
  C('whirlwind', P => { P(2, 7, 12, 2, '#e0e0f0'); P(7, 2, 2, 12, '#e0e0f0'); P(3, 3, 3, 2, '#a0a0c0'); P(10, 11, 3, 2, '#a0a0c0'); P(11, 3, 2, 3, '#a0a0c0'); P(3, 10, 2, 3, '#a0a0c0'); P(6, 6, 4, 4, '#fff'); });
  C('barrier', P => { P(3, 2, 10, 9, '#6ad2ff'); P(4, 11, 8, 2, '#6ad2ff'); P(6, 13, 4, 2, '#6ad2ff'); P(5, 4, 6, 7, '#1d4a6a'); P(7, 5, 2, 5, '#bff4ff'); P(6, 7, 4, 1, '#bff4ff'); });
  C('meteor', P => { P(8, 7, 7, 7, '#ff5a2a'); P(9, 8, 4, 4, '#ffd76a'); for (let i = 0; i < 6; i++) P(1 + i, 1 + i, 3, 2, i % 2 ? '#ff8a3a' : '#c22'); P(10, 9, 2, 2, '#fff'); });
  C('icelance', P => { for (let i = 0; i < 11; i++) P(2 + i, 13 - i, 2, 2, '#bff4ff'); P(12, 1, 3, 3, '#fff'); P(3, 11, 2, 2, '#4ab0d0'); P(1, 13, 3, 2, '#4ab0d0'); });
  C('warcry', P => { P(5, 3, 6, 7, '#d8a07a'); P(6, 7, 4, 3, INK); P(7, 8, 2, 1, '#c22'); P(1, 4, 2, 1, '#ff6a5a'); P(0, 7, 3, 1, '#ff6a5a'); P(1, 10, 2, 1, '#ff6a5a'); P(13, 4, 2, 1, '#ff6a5a'); P(13, 7, 3, 1, '#ff6a5a'); P(13, 10, 2, 1, '#ff6a5a'); P(5, 2, 6, 2, '#6a4528'); });
  C('venomfan', P => { for (let k = -2; k <= 2; k++) for (let i = 0; i < 5; i++) P(7 + k * (i * 0.6) | 0, 12 - i * 2, 2, 2, i > 3 ? '#9be86a' : '#c8ccd8'); P(6, 12, 4, 3, '#3a2a3a'); });
  C('spiritblades', P => { P(7, 6, 2, 4, '#fff'); for (const [x, y] of [[2, 2], [12, 3], [3, 12], [12, 12]]) { P(x, y, 2, 2, '#c9a6ff'); P(x + (x < 8 ? 1 : -1), y + (y < 8 ? 1 : -1), 2, 2, '#9b6cff'); } P(5, 5, 6, 6, '#3a1d5a'); P(7, 7, 2, 2, '#e0c8ff'); });
}
// --------------------------- weapons (pointing right, pivot at the grip) ----
function buildWeapons() {
  const steel = '#c8d0de', steelL = '#f4f8ff', steelD = '#7a8498', gold = '#d8a83a', goldL = '#ffe08a', leather = '#5a3a20';
  makeSpr('w_sword', 24, 9, 1, (P) => {
    P(0, 3, 2, 3, gold); P(0, 3, 1, 1, goldL);                 // pommel
    P(2, 3, 4, 3, leather); P(3, 3, 1, 3, '#7a5232'); P(5, 3, 1, 3, '#7a5232'); // wrapped grip
    P(6, 0, 2, 9, gold); P(6, 0, 1, 9, goldL); P(6, 4, 2, 1, '#d8304a');        // crossguard + gem
    P(8, 2, 13, 5, steel); P(8, 2, 13, 1, steelL); P(8, 6, 13, 1, steelD);       // blade
    P(9, 4, 10, 1, steelD); P(21, 3, 2, 3, steel); P(23, 4, 1, 1, steelL);       // fuller + tip
  }, { ax: 3, ay: 4 });
  makeSpr('w_axe', 22, 17, 1, (P) => {
    P(0, 7, 17, 3, '#7a4f2a'); P(0, 7, 17, 1, '#a07040'); P(2, 7, 2, 3, leather); P(13, 6, 3, 5, '#4a3a2a');
    const rows = [[12, 2, 6], [11, 1, 8], [11, 0, 9], [11, 0, 10], [11, 0, 10], [12, 0, 9], [12, 0, 9], [11, 0, 10], [11, 0, 10], [11, 0, 9], [11, 1, 8], [12, 2, 6]];
    rows.forEach(([x, , w], i) => { P(x + 3, i + 2, w, 1, steel); P(x + 3 + w - 1, i + 2, 1, 1, steelL); });
    P(14, 2, 2, 12, steelD); P(9, 6, 3, 2, steelD); P(8, 6, 1, 1, steel);
  }, { ax: 2, ay: 8 });
  makeSpr('w_spear', 34, 9, 1, (P) => {
    P(0, 4, 25, 2, '#8a6038'); P(0, 4, 25, 1, '#b08050'); P(6, 3, 3, 4, leather); P(22, 2, 3, 6, gold); P(22, 2, 1, 6, goldL);
    P(25, 2, 5, 5, steel); P(25, 2, 5, 1, steelL); P(30, 3, 2, 3, steel); P(32, 4, 2, 1, steelL); P(25, 6, 5, 1, steelD);
    P(21, 6, 2, 3, '#c22a3a'); P(20, 7, 1, 2, '#c22a3a');
  }, { ax: 4, ay: 4 });
  makeSpr('w_daggers', 15, 7, 1, (P) => {
    P(0, 2, 3, 3, '#3a2a3a'); P(1, 2, 1, 3, '#5a4a5a'); P(3, 0, 2, 7, gold); P(3, 0, 1, 7, goldL);
    P(5, 2, 8, 3, steel); P(5, 2, 8, 1, steelL); P(5, 4, 8, 1, steelD); P(13, 3, 2, 1, steelL);
  }, { ax: 1, ay: 3 });
  makeSpr('w_rusty', 20, 8, 1, (P) => {
    P(0, 3, 4, 2, '#4a3a2a'); P(4, 1, 1, 6, '#6a5a4a'); P(5, 2, 13, 4, '#9a7a5a'); P(5, 2, 13, 1, '#c8a078'); P(18, 3, 2, 2, '#9a7a5a');
    P(8, 3, 2, 2, '#6a4a2a'); P(13, 4, 2, 1, '#6a4a2a'); P(10, 5, 1, 1, '#5a3a20');
  }, { ax: 2, ay: 4 });
  makeSpr('w_staff', 26, 9, 1, (P) => {
    P(0, 3, 19, 3, '#4a2a3a'); P(0, 3, 19, 1, '#6a4a5a'); P(4, 3, 2, 3, '#c9a24a'); P(12, 3, 2, 3, '#c9a24a');
    P(18, 1, 2, 7, '#c9a24a'); P(20, 1, 5, 7, '#9b6cff'); P(21, 2, 3, 5, '#e0c8ff'); P(21, 2, 1, 1, '#ffffff');
  }, { ax: 3, ay: 4 });
  makeSpr('w_bow', 11, 26, 1, (P) => {
    P(1, 0, 3, 3, '#6a4528'); P(3, 3, 3, 6, '#7a5232'); P(5, 9, 3, 8, '#8a6038'); P(3, 17, 3, 6, '#7a5232'); P(1, 23, 3, 3, '#6a4528');
    P(5, 11, 3, 4, leather); P(1, 1, 1, 24, '#e8e0c8'); P(6, 4, 1, 4, '#a07040');
  }, { ax: 5, ay: 13 });
  makeSpr('w_shield', 13, 19, 1, (P) => {
    P(0, 0, 13, 15, '#5a6070'); P(1, 15, 11, 2, '#5a6070'); P(3, 17, 7, 1, '#5a6070'); P(5, 18, 3, 1, '#5a6070');
    P(1, 1, 11, 13, '#7a8090'); P(2, 14, 9, 2, '#7a8090'); P(0, 0, 13, 1, '#a8b0c0');
    P(5, 3, 3, 10, '#c9a24a'); P(3, 6, 7, 3, '#c9a24a'); P(6, 7, 1, 1, '#fff2c0');
    P(1, 1, 1, 13, '#9aa0b0'); P(11, 1, 1, 13, '#5a6070');
  }, { ax: 6, ay: 9 });
  makeSpr('w_greatsword', 38, 12, 1, (P) => {
    P(0, 4, 3, 4, '#3a2a3a'); P(3, 4, 6, 4, '#5d4a78'); P(4, 4, 1, 4, '#7d6a98'); P(7, 4, 1, 4, '#7d6a98');
    P(9, 0, 3, 12, '#5d4a78'); P(9, 0, 1, 12, '#9a84c0'); P(10, 5, 2, 2, '#8ff3ff');
    P(12, 2, 22, 8, '#b8f0ff'); P(12, 2, 22, 1, '#ffffff'); P(12, 9, 22, 1, '#5fb0d0'); P(14, 5, 18, 2, '#6fc8e0');
    P(34, 3, 2, 6, '#b8f0ff'); P(36, 5, 2, 2, '#ffffff');
  }, { ax: 3, ay: 6 });
}

// --------------------------- icons ----------------------------------------
// ICONS: 24px art for the UI (inventory, hotbar, cards).  ICONS_S: 16px art for loot on the ground.
const ICONS_S = {};
function icon(key, draw) { const s = makeSpr(null, 16, 16, 1, (P) => draw(P), { ax: 8, ay: 8 }); ICONS_S[key] = s.frames[0]; return s.frames[0]; }
function iconHD(key, draw) {
  const s = makeSpr(null, 24, 24, 1, (P, f, x) => {
    const L = (x0, y0, x1, y1, c, t = 1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) P(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), t, t, c); };
    const C = (cx, cy, r, c) => { for (let y = -r; y <= r; y++) for (let xx = -r; xx <= r; xx++) if (xx * xx + y * y <= r * r + r * 0.6) P(cx + xx, cy + y, 1, 1, c); };
    draw(P, L, C, x);
  }, { ax: 12, ay: 12 });
  ICONS[key] = s.frames[0]; return s.frames[0];
}
function buildIconsHD() {
  const st = '#c8d0de', stL = '#f4f8ff', stD = '#7a8498', gd = '#d8a83a', gdL = '#ffe08a';
  iconHD('sword', (P, L) => { L(8, 15, 20, 3, st, 2); L(9, 15, 20, 4, stL); L(10, 15, 19, 6, stD); L(5, 13, 10, 18, gd, 2); P(7, 15, 2, 2, '#d8304a'); L(3, 20, 6, 17, '#5a3a20', 2); P(4, 19, 1, 1, '#8a6038'); P(1, 20, 3, 3, gd); P(1, 20, 1, 1, gdL); });
  iconHD('axe', (P, L) => { L(4, 21, 16, 6, '#7a4f2a', 2); L(5, 21, 16, 7, '#a07040'); const rows = [[13, 5], [12, 7], [11, 9], [11, 10], [11, 10], [12, 9], [13, 7]]; rows.forEach(([x, w], i) => { P(x, 2 + i, w, 1, st); P(x + w - 1, 2 + i, 1, 1, stL); }); P(12, 4, 3, 4, stD); P(9, 9, 4, 3, '#4a3a2a'); P(7, 6, 3, 2, stD); });
  iconHD('spear', (P, L) => { L(2, 22, 16, 8, '#8a6038', 2); L(3, 22, 16, 9, '#b08050'); L(14, 10, 15, 11, gd, 2); P(17, 3, 4, 4, st); P(19, 1, 3, 3, st); P(21, 0, 2, 2, stL); P(17, 6, 2, 2, st); P(18, 4, 2, 1, stL); P(12, 11, 2, 4, '#c22a3a'); P(11, 13, 1, 3, '#c22a3a'); });
  iconHD('daggers', (P, L) => { L(4, 16, 13, 4, st, 2); L(5, 15, 13, 5, stL); L(19, 16, 10, 4, st, 2); L(19, 15, 11, 5, stL); L(3, 15, 7, 19, gd); L(16, 15, 20, 19, gd); P(2, 18, 3, 4, '#3a2a3a'); P(19, 18, 3, 4, '#3a2a3a'); P(2, 21, 3, 2, gd); P(19, 21, 3, 2, gd); });
  const armor = (k, c, c2, tr, extra) => iconHD(k, (P, L) => {
    P(5, 4, 14, 16, c); P(2, 4, 4, 7, c2); P(18, 4, 4, 7, c2); P(4, 19, 16, 2, c2);
    P(9, 3, 6, 3, '#140c1c'); P(9, 5, 6, 1, c2); P(5, 4, 14, 1, shade(c, 1.3)); P(11, 7, 2, 11, shade(c, 0.8)); P(5, 15, 14, 2, tr); P(11, 15, 2, 2, gdL);
    extra && extra(P, L);
  });
  armor('leather', '#8a5a34', '#6a4024', '#4a2a18', (P) => { for (let i = 0; i < 4; i++) P(10, 7 + i * 2, 4, 1, '#d8b080'); });
  armor('chain', '#8a909e', '#6a707e', '#4a4a5a', (P) => { for (let y = 7; y < 15; y += 2) for (let x = 6 + (y % 4 ? 1 : 0); x < 18; x += 2) P(x, y, 1, 1, '#c8ccd8'); });
  armor('plate', '#b8bfcc', '#8a909e', '#c9a24a', (P) => { P(6, 6, 4, 6, '#e8eef8'); P(14, 6, 3, 6, '#7a8090'); P(2, 4, 4, 2, '#e8eef8'); P(18, 4, 4, 2, '#e8eef8'); });
  armor('robe', '#5a2a8a', '#3a1d5a', '#46d6c8', (P) => { P(7, 8, 1, 1, '#c9a6ff'); P(16, 10, 1, 1, '#c9a6ff'); P(8, 12, 2, 1, '#46d6c8'); P(4, 20, 16, 2, '#5a2a8a'); });
  iconHD('ring', (P, L, C) => { C(12, 14, 7, gd); C(12, 14, 4, 'clear'); P(8, 11, 8, 7, 'clear'); C(12, 14, 4, '#140c1c'); C(12, 14, 3, 'clear'); P(9, 3, 6, 6, '#3a7ed0'); P(10, 2, 4, 1, '#5aaeff'); P(10, 4, 2, 2, '#bfe4ff'); P(11, 4, 1, 1, '#ffffff'); P(8, 8, 8, 2, gd); P(4, 14, 2, 1, gdL); P(20, 2, 1, 3, '#ffffff'); P(19, 3, 3, 1, '#ffffff'); });
  iconHD('amulet', (P, L) => { L(4, 2, 9, 11, gd); L(19, 2, 14, 11, gd); P(10, 10, 4, 3, gd); P(8, 13, 8, 7, '#a02a5a'); P(9, 12, 6, 1, '#a02a5a'); P(9, 20, 6, 1, '#a02a5a'); P(11, 21, 2, 1, '#a02a5a'); P(9, 13, 3, 3, '#ff8ab8'); P(10, 14, 1, 1, '#ffffff'); P(8, 13, 8, 1, gdL); });
  iconHD('idol', (P) => { P(8, 2, 8, 7, '#8a7a5a'); P(6, 9, 12, 10, '#7a6a4a'); P(4, 19, 16, 3, '#5a4a3a'); P(9, 5, 2, 2, '#ff9a3c'); P(13, 5, 2, 2, '#ff9a3c'); P(10, 11, 4, 5, '#c9a24a'); P(11, 12, 2, 2, '#ffe08a'); P(8, 2, 8, 1, '#b8a888'); P(10, 8, 4, 1, '#5a4a3a'); });
  iconHD('potion', (P, L, C) => { P(10, 1, 4, 3, '#8a6a4a'); P(10, 1, 4, 1, '#b08a60'); P(9, 4, 6, 3, '#c8d8e8'); C(12, 14, 7, '#c8d8e8'); C(12, 15, 6, '#c22a3a'); P(6, 11, 12, 2, '#e2483c'); P(8, 10, 2, 4, '#ffb0a0'); P(8, 10, 1, 1, '#ffffff'); P(13, 17, 3, 1, '#8a1020'); });
  iconHD('gold', (P, L, C) => { C(8, 16, 5, '#a8781a'); C(8, 15, 5, '#f0c050'); C(16, 14, 5, '#a8781a'); C(16, 13, 5, '#ffd76a'); C(12, 9, 5, '#a8781a'); C(12, 8, 5, '#ffe08a'); P(11, 6, 2, 4, '#c8901a'); P(15, 11, 2, 4, '#c8901a'); P(10, 6, 1, 1, '#ffffff'); });
  iconHD('key', (P, L, C) => { C(7, 7, 5, '#ffd34a'); C(7, 7, 2, '#140c1c'); L(10, 10, 19, 19, '#ffd34a', 2); P(16, 18, 3, 2, '#ffd34a'); P(19, 15, 2, 3, '#ffd34a'); P(4, 4, 2, 1, '#fff2a0'); });
  iconHD('flask', (P, L, C) => { P(10, 1, 4, 3, '#8a6a4a'); P(9, 4, 6, 3, '#c8d8e8'); C(12, 15, 7, '#c8d8e8'); C(12, 16, 6, '#e8781a'); P(6, 12, 12, 2, '#ff9a3c'); P(8, 11, 2, 4, '#ffe0a0'); P(8, 11, 1, 1, '#ffffff'); });
  const mat = (m, draw) => iconHD('mat_' + m, draw);
  mat('iron', (P) => { P(4, 10, 8, 8, '#7a8090'); P(10, 6, 9, 8, '#9aa3ad'); P(8, 15, 10, 5, '#5a6070'); P(11, 7, 5, 1, '#d8dde8'); P(5, 11, 4, 1, '#c8ccd8'); P(14, 10, 2, 2, '#6a3a2a'); });
  mat('bone', (P) => { P(4, 14, 16, 4, '#d8cfb4'); P(2, 12, 4, 4, '#e8e0c8'); P(2, 16, 4, 4, '#e8e0c8'); P(18, 12, 4, 4, '#e8e0c8'); P(18, 16, 4, 4, '#e8e0c8'); for (let i = 0; i < 6; i++) P(5 + i * 3, 6 + (i % 2) * 3, 1, 1, '#c8bfa6'); P(4, 14, 16, 1, '#fff8e8'); });
  mat('wood', (P, L, C) => { C(12, 12, 9, '#6a4a2a'); C(12, 12, 7, '#a07a4a'); C(12, 12, 5, '#c89a5a'); C(12, 12, 3, '#a07a4a'); C(12, 12, 1, '#6fae4f'); P(18, 3, 3, 4, '#6fae4f'); P(19, 1, 2, 2, '#9fd86a'); });
  mat('pearl', (P, L, C) => { C(12, 14, 9, '#3a8a9a'); P(3, 14, 18, 7, 'clear'); C(12, 15, 8, '#5ac0c8'); C(12, 13, 4, '#e8fcff'); P(10, 11, 2, 2, '#ffffff'); P(3, 15, 18, 2, '#2a6a7a'); });
  mat('ember', (P) => { P(9, 2, 6, 20, '#ff6a1a'); P(6, 7, 3, 11, '#c8401a'); P(15, 6, 3, 12, '#c8401a'); P(10, 4, 3, 14, '#ffb03a'); P(11, 6, 1, 8, '#fff2c0'); P(9, 2, 6, 1, '#ffd76a'); });
}
function buildCardIconsHD() {
  const C = (id, draw) => iconHD('card_' + id, draw);
  C('fireball', (P, L, Ci) => { for (let i = 0; i < 6; i++) L(2 + i, 18 - i * 2, 9, 14, i % 2 ? '#ff5a2a' : '#ff8a3a', 2); Ci(14, 10, 7, '#c8301a'); Ci(14, 10, 6, '#ff6a1a'); Ci(15, 9, 4, '#ffb03a'); Ci(16, 8, 2, '#fff2c0'); P(20, 3, 2, 2, '#ffd76a'); P(5, 6, 1, 1, '#ffd76a'); });
  C('groundslam', (P, L) => { P(9, 1, 6, 9, '#a0a8b8'); P(7, 1, 10, 4, '#d8dde8'); P(7, 1, 10, 1, '#ffffff'); P(11, 10, 2, 5, '#6a4528'); P(1, 18, 22, 4, '#6a4a2a'); P(1, 18, 22, 1, '#d6a35a'); L(3, 17, 7, 13, '#d6a35a'); L(20, 17, 16, 13, '#d6a35a'); P(10, 16, 4, 2, '#fff2c0'); P(4, 20, 2, 1, '#3a2a1a'); P(17, 20, 3, 1, '#3a2a1a'); P(11, 19, 1, 3, '#3a2a1a'); });
  C('shadowstep', (P) => { P(2, 7, 6, 13, '#2a1440'); P(3, 4, 4, 4, '#2a1440'); P(13, 7, 6, 13, '#9b6cff'); P(14, 4, 4, 4, '#9b6cff'); P(15, 5, 1, 1, '#ffffff'); P(17, 5, 1, 1, '#ffffff'); P(13, 7, 6, 1, '#c9a6ff'); for (let i = 0; i < 3; i++) P(8 + i * 2, 10 + i * 3, 3, 1, '#c9a6ff'); P(20, 2, 1, 1, '#e0c8ff'); });
  C('healaura', (P, L, Ci) => { Ci(12, 12, 10, '#1d4a30'); Ci(12, 12, 8, '#2f7a4a'); P(9, 4, 6, 16, '#7cf0a0'); P(4, 9, 16, 6, '#7cf0a0'); P(10, 5, 4, 14, '#d8ffe4'); P(5, 10, 14, 4, '#d8ffe4'); P(11, 6, 2, 2, '#ffffff'); });
  C('frostnova', (P, L) => { L(12, 1, 12, 23, '#8fe6ff', 2); L(1, 12, 23, 12, '#8fe6ff', 2); L(4, 4, 20, 20, '#bff4ff'); L(20, 4, 4, 20, '#bff4ff'); for (const [x, y] of [[12, 3], [12, 20], [3, 12], [20, 12]]) { P(x - 2, y, 1, 1, '#ffffff'); P(x + 2, y, 1, 1, '#ffffff'); } P(9, 9, 6, 6, '#ffffff'); P(10, 10, 4, 4, '#8fe6ff'); });
  C('chainzap', (P, L) => { const y = '#ffe96a'; L(15, 1, 10, 9, y, 2); L(10, 9, 15, 11, y, 2); L(15, 11, 8, 22, y, 2); L(15, 2, 11, 8, '#ffffff'); L(14, 12, 9, 20, '#ffffff'); P(2, 4, 3, 3, '#fff8b0'); P(19, 16, 3, 3, '#fff8b0'); L(5, 6, 9, 8, '#fff8b0'); L(18, 17, 14, 14, '#fff8b0'); });
  C('whirlwind', (P, L, Ci) => { Ci(12, 12, 10, '#3a3a5a'); Ci(12, 12, 8, 'clear'); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; L(12 + Math.cos(a) * 3, 12 + Math.sin(a) * 3, 12 + Math.cos(a + 0.6) * 10, 12 + Math.sin(a + 0.6) * 10, '#e0e0f0', 2); } Ci(12, 12, 3, '#ffffff'); Ci(12, 12, 1, '#a0a0c0'); });
  C('barrier', (P) => { P(4, 2, 16, 13, '#6ad2ff'); P(5, 15, 14, 3, '#6ad2ff'); P(7, 18, 10, 2, '#6ad2ff'); P(9, 20, 6, 2, '#6ad2ff'); P(11, 22, 2, 1, '#6ad2ff'); P(6, 4, 12, 11, '#1d4a6a'); P(8, 15, 8, 2, '#1d4a6a'); P(11, 5, 2, 12, '#bff4ff'); P(8, 8, 8, 2, '#bff4ff'); P(4, 2, 16, 1, '#ffffff'); });
  C('meteor', (P, L, Ci) => { for (let i = 0; i < 8; i++) L(1 + i, 1 + i, 4 + i, 1 + i, i % 2 ? '#ff8a3a' : '#c8301a', 2); Ci(15, 15, 7, '#5a2a1a'); Ci(14, 14, 6, '#ff5a2a'); Ci(14, 14, 4, '#ffb03a'); Ci(13, 13, 2, '#fff2c0'); P(18, 18, 2, 2, '#3a1a0a'); });
  C('icelance', (P, L) => { L(3, 21, 19, 5, '#8fe6ff', 3); L(4, 20, 19, 5, '#ffffff'); P(18, 2, 4, 4, '#ffffff'); P(21, 1, 2, 2, '#ffffff'); L(2, 22, 6, 18, '#3a8ab0', 2); P(6, 15, 2, 2, '#bff4ff'); P(12, 7, 1, 1, '#ffffff'); });
  C('warcry', (P, L, Ci) => { for (let i = 0; i < 12; i++) { const t = i / 11, x = 3 + t * 13, y = 19 - t * 11 - Math.sin(t * Math.PI) * 3, w = 2 + Math.round(t * 3); P(Math.round(x), Math.round(y) - (w >> 1), w, w, i % 4 === 3 ? '#e8b04a' : '#e8dcc0'); } P(2, 18, 3, 3, '#8a6a3a'); P(16, 3, 4, 7, '#d8c8a0'); P(17, 4, 2, 5, '#3a2a1a'); for (let k = 0; k < 3; k++) { P(20 + k, 2 + k * 2, 1, 2, '#ff6a5a'); P(21 + k, 6 + k, 1, 2, '#ff6a5a'); } P(20, 12, 3, 1, '#ff6a5a'); P(19, 15, 2, 1, '#ff6a5a'); });
  C('venomfan', (P, L) => { for (let k = -2; k <= 2; k++) { const a = -Math.PI / 2 + k * 0.32, x1 = 12 + Math.cos(a) * 11, y1 = 19 + Math.sin(a) * 11; L(12, 19, x1, y1, '#c8ccd8'); P(Math.round(x1), Math.round(y1), 2, 2, '#9be86a'); } P(9, 18, 6, 5, '#3a2a3a'); P(10, 19, 4, 1, '#9be86a'); P(5, 3, 1, 1, '#9be86a'); P(18, 2, 1, 1, '#9be86a'); });
  C('spiritblades', (P, L, Ci) => { Ci(12, 12, 5, '#3a1d5a'); Ci(12, 12, 3, '#9b6cff'); Ci(12, 12, 1, '#ffffff'); for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 - 0.5, cx = 12 + Math.cos(a) * 9, cy = 12 + Math.sin(a) * 9; L(cx - Math.cos(a + 1.6) * 3, cy - Math.sin(a + 1.6) * 3, cx + Math.cos(a + 1.6) * 3, cy + Math.sin(a + 1.6) * 3, '#e0c8ff', 2); P(Math.round(cx), Math.round(cy), 1, 1, '#ffffff'); } });
}
function itemIcon(it) { return ICONS[it.type] || ICONS.sword; }
function lootIcon(it) { return ICONS_S[it.type] || ICONS_S.sword; }
// draw an icon into a small canvas element for the DOM, at an integer scale
function iconCanvas(src, size = 48, bg = null, glow = null) {
  const n = src ? src.width : 24;
  const c = document.createElement('canvas'); c.width = n; c.height = n; c.className = 'icon';
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  if (bg) { const g = x.createLinearGradient(0, 0, 0, n); g.addColorStop(0, shade(bg, 1.6)); g.addColorStop(1, bg); x.fillStyle = g; x.fillRect(0, 0, n, n); }
  if (glow) { const g = x.createRadialGradient(n / 2, n / 2, 1, n / 2, n / 2, n * 0.62); g.addColorStop(0, rgba(glow, .5)); g.addColorStop(1, rgba(glow, 0)); x.fillStyle = g; x.fillRect(0, 0, n, n); }
  if (src) x.drawImage(src, 0, 0);
  c.style.width = size + 'px'; c.style.height = size + 'px';
  return c;
}

const Sprites = { init() { buildProps(); buildWeapons(); buildCharacters(); buildIcons(); buildCardIcons(); buildIconsHD(); buildCardIconsHD(); } };

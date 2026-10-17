'use strict';
// ============================================================================
//  HEARTHLIGHT — core utilities
// ============================================================================
const TS = 16;            // tile size in world pixels
const TICK = 1 / 60;      // fixed simulation timestep
const TAU = Math.PI * 2;
const INK = '#140c1c';    // outline / darkest colour

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const angTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function lerpAng(a, b, t) { return a + angDiff(a, b) * t; }
function rotToward(a, b, maxStep) { const d = angDiff(a, b); return a + clamp(d, -maxStep, maxStep); }
const rnd = (a, b) => a + Math.random() * (b - a);
const rndi = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;
const easeOut = t => 1 - (1 - t) * (1 - t);
const easeIn = t => t * t;
const easeInOut = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const nowSec = () => performance.now() / 1000;
const r1 = v => Math.round(v * 10) / 10;
const fmt = n => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.floor(n));

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
class RNG {
  constructor(seed) { this.f = mulberry32((seed >>> 0) || 1); }
  next() { return this.f(); }
  range(a, b) { return a + (b - a) * this.f(); }
  int(a, b) { return a + Math.floor(this.f() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
  chance(p) { return this.f() < p; }
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.f() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
}
function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
let _uidN = 0;
function uid() { return Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7) + (_uidN++).toString(36); }

// ---- colours ----
function hexRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; }
function shade(h, f) { // f<1 darker, f>1 lighter
  const [r, g, b] = hexRgb(h);
  const m = c => clamp(Math.round(f >= 1 ? c + (255 - c) * (f - 1) : c * f), 0, 255);
  return '#' + [m(r), m(g), m(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}
function mix(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join(''); }

// ---- canvas helpers ----
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; }

// ---- tiny 3x5 pixel font for in-world text (damage numbers, labels) ----
const FONT = (() => {
  const g = {
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
    '5': '111100111001111', '6': '111100111101111', '7': '111001001010010', '8': '111101111101111', '9': '111101111001111',
    'A': '010101111101101', 'B': '110101110101110', 'C': '011100100100011', 'D': '110101101101110', 'E': '111100110100111',
    'F': '111100110100100', 'G': '011100101101011', 'H': '101101111101101', 'I': '111010010010111', 'J': '001001001101010',
    'K': '101101110101101', 'L': '100100100100111', 'M': '101111111101101', 'N': '110101101101101', 'O': '010101101101010',
    'P': '110101110100100', 'Q': '010101101110011', 'R': '110101110101101', 'S': '011100010001110', 'T': '111010010010010',
    'U': '101101101101111', 'V': '101101101101010', 'W': '101101111111101', 'X': '101101010101101', 'Y': '101101010010010',
    'Z': '111001010100111', '+': '000010111010000', '-': '000000111000000', '!': '010010010000010', '.': '000000000000010',
    ' ': '000000000000000', '?': '111001011000010', ':': '000010000010000', '/': '001001010100100', "'": '010010000000000',
    '%': '101001010100101', ',': '000000000010100', 'x': '000101010101000', '(': '010100100100010', ')': '010001001001010',
  };
  return g;
})();
const _textCache = new Map();
// returns a canvas with the string drawn in the pixel font (with 1px dark outline)
function pixelText(str, color, scale = 1, outline = INK) {
  str = String(str).toUpperCase();
  const key = str + '|' + color + '|' + scale + '|' + outline;
  let c = _textCache.get(key);
  if (c) return c;
  const cw = 4 * scale, w = str.length * cw + 2 * scale, h = 7 * scale;
  const [cv, x] = mkCanvas(w, h);
  const draw = (col, ox, oy) => {
    x.fillStyle = col;
    for (let i = 0; i < str.length; i++) {
      const gl = FONT[str[i]] || FONT['?'];
      for (let p = 0; p < 15; p++) if (gl[p] === '1') x.fillRect((1 + i * 4 + (p % 3)) * scale + ox, (1 + Math.floor(p / 3)) * scale + oy, scale, scale);
    }
  };
  if (outline) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) draw(outline, dx * scale, dy * scale);
  draw(color, 0, 0);
  if (_textCache.size > 400) _textCache.delete(_textCache.keys().next().value);
  _textCache.set(key, cv);
  return cv;
}
function drawPixelText(ctx, str, x, y, color, scale = 1, align = 'center', outline = INK) {
  const c = pixelText(str, color, scale, outline);
  const ox = align === 'center' ? c.width / 2 : align === 'right' ? c.width : 0;
  ctx.drawImage(c, Math.round(x - ox), Math.round(y - c.height / 2));
}

// ---- DOM helpers ----
const $ = (id) => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

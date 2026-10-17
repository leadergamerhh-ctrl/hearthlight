// ============================================================================
//  Audio — every sound and all music is synthesised live with WebAudio
// ============================================================================
const SFX = (() => {
  let ctx = null, master, sfxBus, musBus, comp, noiseBuf, verb;
  const settings = { master: 0.8, music: 0.5, sfx: 0.8, muted: false };
  const last = {};

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain(); master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musBus = ctx.createGain(); musBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // generated reverb impulse (shared by music + some sfx)
    verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const b = ir.getChannelData(ch); for (let i = 0; i < len; i++) b[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb.buffer = ir;
    const vg = ctx.createGain(); vg.gain.value = 0.35; verb.connect(vg); vg.connect(musBus);
    apply();
    setTimeout(() => Music.kick(), 0);
  }
  function apply() {
    if (!ctx) return;
    master.gain.setTargetAtTime(settings.muted ? 0 : settings.master, ctx.currentTime, 0.02);
    sfxBus.gain.setTargetAtTime(settings.sfx, ctx.currentTime, 0.02);
    musBus.gain.setTargetAtTime(settings.music * 0.55, ctx.currentTime, 0.05);
  }
  // --- primitives ---
  function osc(t, type, f, dur, vol, f2, dest, attack = 0.004) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function noise(t, dur, vol, ftype, f, f2, q = 1, dest, attack = 0.002) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = ftype; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(dest || sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  const N = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const defs = {
    swing(t, v, p) { noise(t, 0.13, 0.32 * v, 'bandpass', 900 * p, 3200 * p, 1.2); },
    swingHeavy(t, v, p) { noise(t, 0.26, 0.45 * v, 'bandpass', 400 * p, 1800 * p, 1.0); osc(t, 'sine', 120 * p, 0.2, 0.1 * v, 60); },
    hit(t, v, p) { noise(t, 0.09, 0.5 * v, 'lowpass', 2600 * p, 500, 0.8); osc(t, 'square', 180 * p, 0.07, 0.12 * v, 70); osc(t, 'sine', 90 * p, 0.12, 0.35 * v, 45); },
    hitHeavy(t, v, p) { noise(t, 0.18, 0.7 * v, 'lowpass', 1800 * p, 200, 0.7); osc(t, 'sine', 70 * p, 0.25, 0.6 * v, 35); osc(t, 'square', 140 * p, 0.1, 0.12 * v, 50); },
    crit(t, v, p) { defs.hit(t, v, p); osc(t, 'triangle', 1400 * p, 0.12, 0.12 * v, 2400); osc(t + 0.02, 'sine', 2100 * p, 0.2, 0.08 * v); },
    bone(t, v, p) { noise(t, 0.06, 0.4 * v, 'highpass', 2500 * p, 4000, 2); osc(t, 'square', 600 * p, 0.04, 0.08 * v, 300); },
    block(t, v, p) { osc(t, 'square', 1250 * p, 0.09, 0.12 * v, 900); osc(t, 'triangle', 2400 * p, 0.25, 0.1 * v); noise(t, 0.05, 0.25 * v, 'highpass', 3000, 6000, 1); },
    parry(t, v) { osc(t, 'triangle', 1800, 0.5, 0.18 * v); osc(t, 'sine', 2700, 0.6, 0.12 * v); osc(t, 'square', 900, 0.08, 0.1 * v, 600); noise(t, 0.08, 0.3 * v, 'highpass', 4000, 8000, 1); },
    roll(t, v, p) { noise(t, 0.22, 0.22 * v, 'bandpass', 500 * p, 1400 * p, 0.8, null, 0.03); },
    hurt(t, v) { noise(t, 0.15, 0.55 * v, 'lowpass', 1500, 300, 1); osc(t, 'sawtooth', 220, 0.18, 0.14 * v, 90); osc(t, 'sine', 80, 0.2, 0.4 * v, 40); },
    enemyDie(t, v, p) { noise(t, 0.35, 0.35 * v, 'lowpass', 1600 * p, 120, 0.7); osc(t, 'sawtooth', 300 * p, 0.3, 0.08 * v, 60); },
    down(t, v) { osc(t, 'sawtooth', 300, 0.9, 0.15 * v, 50); noise(t, 0.6, 0.3 * v, 'lowpass', 900, 100, 1); },
    revive(t, v) { [0, 4, 7, 12].forEach((s, i) => osc(t + i * 0.07, 'triangle', N(67 + s), 0.5, 0.12 * v)); },
    fireball(t, v) { noise(t, 0.35, 0.4 * v, 'bandpass', 600, 2400, 0.7, null, 0.03); osc(t, 'sawtooth', 160, 0.25, 0.08 * v, 320); },
    explode(t, v, p) { noise(t, 0.6, 0.8 * v, 'lowpass', 1400 * p, 80, 0.6); osc(t, 'sine', 90 * p, 0.45, 0.6 * v, 30); },
    frost(t, v) { noise(t, 0.5, 0.35 * v, 'highpass', 3000, 7000, 3, null, 0.01); [0, 3, 7].forEach((s, i) => osc(t + i * 0.04, 'sine', N(88 + s), 0.5, 0.06 * v)); },
    heal(t, v) { [0, 4, 7, 11, 14].forEach((s, i) => osc(t + i * 0.06, 'sine', N(72 + s), 0.7, 0.08 * v)); },
    slam(t, v) { osc(t, 'sine', 70, 0.5, 0.8 * v, 25); noise(t, 0.45, 0.6 * v, 'lowpass', 700, 60, 0.8); },
    shadow(t, v) { noise(t, 0.25, 0.3 * v, 'bandpass', 2000, 300, 3); osc(t, 'sine', 600, 0.2, 0.08 * v, 150); },
    zap(t, v) { for (let i = 0; i < 4; i++) noise(t + i * 0.03, 0.06, 0.3 * v, 'bandpass', 2000 + Math.random() * 3000, null, 4); osc(t, 'sawtooth', 900, 0.15, 0.06 * v, 200); },
    cast(t, v) { osc(t, 'triangle', 500, 0.25, 0.08 * v, 1200); noise(t, 0.2, 0.15 * v, 'bandpass', 1500, 4000, 2, null, 0.05); },
    whirl(t, v) { for (let i = 0; i < 4; i++) noise(t + i * 0.12, 0.14, 0.3 * v, 'bandpass', 700, 2600, 1.2); },
    shieldUp(t, v) { osc(t, 'sine', 300, 0.5, 0.1 * v, 900); osc(t, 'triangle', 1200, 0.5, 0.06 * v); },
    warcry(t, v) { osc(t, 'sawtooth', 110, 0.6, 0.15 * v, 160); osc(t, 'sawtooth', 165, 0.6, 0.1 * v, 240); noise(t, 0.5, 0.2 * v, 'bandpass', 600, 900, 1); },
    loot(t, v) { [0, 7, 12].forEach((s, i) => osc(t + i * 0.05, 'triangle', N(79 + s), 0.25, 0.08 * v)); },
    lootRare(t, v) { [0, 4, 7, 12, 16, 19].forEach((s, i) => osc(t + i * 0.055, 'triangle', N(76 + s), 0.5, 0.09 * v)); osc(t, 'sine', N(52), 0.8, 0.1 * v); },
    lootEpic(t, v) { [0, 3, 7, 10, 12, 15, 19, 24].forEach((s, i) => osc(t + i * 0.06, 'triangle', N(72 + s), 0.7, 0.09 * v)); osc(t, 'sawtooth', N(48), 1.2, 0.05 * v); },
    gold(t, v) { osc(t, 'square', 1975, 0.07, 0.05 * v); osc(t + 0.06, 'square', 2637, 0.16, 0.05 * v); },
    levelup(t, v) { [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((s, i) => osc(t + i * 0.075, i % 2 ? 'square' : 'triangle', N(64 + s), 0.35, 0.07 * v)); osc(t, 'sine', N(40), 1.2, 0.2 * v); },
    door(t, v) { osc(t, 'square', 90, 0.35, 0.12 * v, 60); noise(t, 0.4, 0.3 * v, 'lowpass', 500, 120, 1); },
    lock(t, v) { osc(t, 'square', 220, 0.08, 0.1 * v); osc(t + 0.09, 'square', 160, 0.12, 0.1 * v); noise(t, 0.3, 0.35 * v, 'lowpass', 600, 100, 1); },
    key(t, v) { [0, 5, 9, 12].forEach((s, i) => osc(t + i * 0.06, 'square', N(84 + s), 0.15, 0.05 * v)); },
    chest(t, v) { noise(t, 0.2, 0.3 * v, 'lowpass', 900, 200, 1); [0, 4, 7, 11, 14].forEach((s, i) => osc(t + 0.15 + i * 0.07, 'triangle', N(72 + s), 0.5, 0.08 * v)); },
    ui(t, v) { osc(t, 'triangle', 880, 0.06, 0.06 * v, 1100); },
    uiBack(t, v) { osc(t, 'triangle', 700, 0.06, 0.06 * v, 500); },
    buy(t, v) { osc(t, 'square', 1500, 0.06, 0.05 * v); osc(t + 0.05, 'square', 2200, 0.12, 0.05 * v); },
    anvil(t, v) { osc(t, 'square', 1700, 0.25, 0.08 * v); osc(t, 'triangle', 2550, 0.6, 0.08 * v); osc(t, 'sine', 3400, 0.8, 0.04 * v); noise(t, 0.05, 0.4 * v, 'highpass', 2500, 5000, 1); },
    telegraph(t, v) { osc(t, 'triangle', 1100, 0.18, 0.1 * v, 1500); },
    glint(t, v) { osc(t, 'sine', 2600, 0.15, 0.08 * v, 3400); osc(t + 0.03, 'sine', 3900, 0.12, 0.05 * v); },
    arrow(t, v) { noise(t, 0.12, 0.25 * v, 'bandpass', 3000, 1200, 2); osc(t, 'triangle', 300, 0.05, 0.05 * v); },
    orb(t, v) { osc(t, 'sine', 300, 0.3, 0.12 * v, 600); osc(t, 'triangle', 450, 0.2, 0.05 * v, 900); },
    spawn(t, v) { osc(t, 'sawtooth', 80, 0.6, 0.08 * v, 200); noise(t, 0.6, 0.15 * v, 'bandpass', 300, 1200, 2, null, 0.2); },
    roar(t, v) { osc(t, 'sawtooth', 90, 1.4, 0.25 * v, 55); osc(t, 'sawtooth', 93, 1.4, 0.2 * v, 50); noise(t, 1.3, 0.4 * v, 'lowpass', 900, 200, 1, null, 0.1); },
    bossDie(t, v) { osc(t, 'sawtooth', 160, 2.5, 0.2 * v, 30); noise(t, 2.5, 0.6 * v, 'lowpass', 2000, 60, 0.6); [0, 7, 12, 19, 24].forEach((s, i) => osc(t + 0.8 + i * 0.12, 'triangle', N(60 + s), 1.5, 0.08 * v)); },
    achieve(t, v) { [0, 7, 12, 16].forEach((s, i) => osc(t + i * 0.09, 'triangle', N(72 + s), 0.6, 0.08 * v)); },
    ping(t, v) { osc(t, 'sine', 1320, 0.25, 0.12 * v); osc(t + 0.1, 'sine', 1760, 0.3, 0.1 * v); },
    chat(t, v) { osc(t, 'sine', 990, 0.08, 0.06 * v); },
    portal(t, v) { osc(t, 'sine', 200, 1.2, 0.12 * v, 800); noise(t, 1.2, 0.2 * v, 'bandpass', 400, 3000, 3, null, 0.3); },
    spike(t, v) { noise(t, 0.08, 0.25 * v, 'highpass', 3000, 5000, 1); osc(t, 'square', 400, 0.05, 0.05 * v, 200); },
    step(t, v) { noise(t, 0.04, 0.05 * v, 'lowpass', 600, 200, 1); },
    potion(t, v) { for (let i = 0; i < 4; i++) osc(t + i * 0.07, 'sine', 400 + i * 120, 0.08, 0.08 * v, 700 + i * 100); defs.heal(t + 0.25, v * 0.6); },
    exhausted(t, v) { osc(t, 'triangle', 300, 0.12, 0.06 * v, 200); },
    heartbeat(t, v) { osc(t, 'sine', 62, 0.16, 0.5 * v, 40); osc(t + 0.18, 'sine', 55, 0.18, 0.35 * v, 38); },
    splash(t, v) { noise(t, 0.3, 0.3 * v, 'bandpass', 1200, 400, 1); },
  };

  // per-sound mix levels (balanced from an offline render of every effect)
  const MIX = { swing: 2.2, swingHeavy: 1.6, roll: 2.2, cast: 2, whirl: 2, gold: 2, key: 2, zap: 1.8, telegraph: 1.8, glint: 2.2, arrow: 1.6, spawn: 2, shadow: 1.6, step: 3, ui: 1.5, uiBack: 1.5, buy: 1.6, chat: 1.5, exhausted: 2, loot: 1.6, orb: 1.4, fireball: 1.5, splash: 1.6 };
  function play(name, vol = 1, pitch = 1) {
    if (!ctx || settings.muted || vol <= 0.01) return;
    const t = ctx.currentTime;
    if (last[name] && t - last[name] < 0.035) return; // de-dupe stacked identical sounds
    last[name] = t;
    const f = defs[name]; if (f) try { f(t, Math.min(vol * (MIX[name] || 1), 2.5), pitch * rnd(0.96, 1.04)); } catch (e) { }
  }
  // diagnostics: render every sound offline and report its peak/RMS level (HL.SFX.audit() in the console)
  async function audit() {
    const out = {};
    for (const name of Object.keys(defs)) {
      const saved = [ctx, sfxBus, noiseBuf];
      const oc = new OfflineAudioContext(1, 44100 * 3, 44100);
      ctx = oc; sfxBus = oc.createGain(); sfxBus.connect(oc.destination);
      noiseBuf = oc.createBuffer(1, oc.sampleRate, oc.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      try { defs[name](0.01, 1, 1); } catch (e) { out[name] = 'ERR ' + e.message; }
      [ctx, sfxBus, noiseBuf] = saved;
      const b = (await oc.startRendering()).getChannelData(0);
      let peak = 0, sum = 0; for (const v of b) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
      if (!out[name]) out[name] = { peak: +peak.toFixed(2), rms: +Math.sqrt(sum / b.length).toFixed(3) };
    }
    return out;
  }
  return { init, play, apply, audit, settings, N, osc, noise, get ctx() { return ctx; }, get musBus() { return musBus; }, get verb() { return verb; } };
})();

// spatialised sfx relative to the local player
function sfxAt(name, x, y, vol = 1, pitch = 1) {
  const me = G.me;
  let v = vol;
  if (me) { const d = dist(me.x, me.y, x, y); v *= clamp(1.25 - d / 260, 0, 1); }
  SFX.play(name, v, pitch);
}

// ---------------------------------------------------------------------------
//  Generative music: each track is a mode + chord progression + layer mix.
// ---------------------------------------------------------------------------
const Music = (() => {
  const TR = {
    title: { bpm: 64, root: 45, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 4], pad: .9, arp: .6, bell: .5, bass: .6, drum: 0, arpPat: [0, 2, 4, 2, 1, 2, 4, 2] },
    village: { bpm: 80, root: 50, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 3, 6, 4], pad: .6, arp: .9, bell: .35, bass: .7, drum: .25, arpPat: [0, 2, 4, 6, 4, 2, 1, 2] },
    village2: { bpm: 92, root: 50, scale: [0, 2, 4, 5, 7, 9, 10], prog: [0, 3, 4, 0, 5, 3, 4, 4], pad: .5, arp: 1, bell: .4, bass: .8, drum: .45, arpPat: [0, 2, 4, 2, 5, 4, 2, 4] },
    crypt: { bpm: 60, root: 38, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 1, 0, 6], pad: 1, arp: .25, bell: .6, bass: .7, drum: .15, arpPat: [0, 4, 2, 4] },
    forest: { bpm: 70, root: 43, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 6, 5, 3], pad: .8, arp: .55, bell: .5, bass: .6, drum: .2, arpPat: [0, 4, 2, 5, 4, 2] },
    cave: { bpm: 56, root: 40, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 6, 4], pad: 1, arp: .2, bell: .75, bass: .6, drum: .1, arpPat: [0, 4, 7, 4] },
    combat: { bpm: 112, root: 40, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 0, 5, 6], pad: .5, arp: .7, bell: .1, bass: 1, drum: .8, arpPat: [0, 0, 4, 0, 2, 0, 4, 6] },
    boss: { bpm: 136, root: 38, scale: [0, 2, 3, 5, 7, 8, 11], prog: [0, 0, 5, 4, 0, 0, 1, 4], pad: .6, arp: .9, bell: .1, bass: 1.1, drum: 1, arpPat: [0, 2, 4, 2, 0, 2, 5, 4], boss: true },
    victory: { bpm: 90, root: 48, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 3, 4, 0], pad: .8, arp: 1, bell: .6, bass: .6, drum: .3, arpPat: [0, 2, 4, 7, 4, 2, 4, 7] },
  };
  let cur = null, curName = '', gain = null, nextT = 0, step = 0, timer = null;

  function chordTone(tr, deg, idx, oct = 0) {
    const sc = tr.scale, n = deg + idx;
    return tr.root + sc[((n % 7) + 7) % 7] + 12 * (Math.floor(n / 7) + oct);
  }
  function note(t, m, dur, type, vol, dest, cutoff = 2400, attack = 0.01) {
    const c = SFX.ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = type; o.frequency.value = SFX.N(m);
    f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.1);
  }
  function schedule() {
    const c = SFX.ctx; if (!c || !cur) return;
    const tr = cur, spb = 60 / tr.bpm / 4; // 16th notes
    while (nextT < c.currentTime + 0.2) {
      const t = nextT, s = step % 16, bar = Math.floor(step / 16), deg = tr.prog[bar % tr.prog.length];
      const dest = gain, wet = gain._wet;
      if (s === 0 && tr.pad) for (const i of [0, 2, 4]) {
        note(t, chordTone(tr, deg, i), spb * 16 + 0.6, 'sawtooth', 0.035 * tr.pad, wet, 700, 0.6);
        note(t, chordTone(tr, deg, i) + 0.08, spb * 16 + 0.6, 'sawtooth', 0.025 * tr.pad, wet, 600, 0.7);
      }
      if (tr.bass) {
        const bp = tr.boss ? [0, 3, 6, 8, 10, 12, 14] : [0, 8, 10];
        if (bp.includes(s)) note(t, chordTone(tr, deg, 0, -1), spb * (tr.boss ? 1.6 : 3.5), 'triangle', 0.16 * tr.bass, dest, 900);
      }
      if (tr.arp && s % 2 === 0) {
        const pat = tr.arpPat, i = pat[(s / 2 + bar * 3) % pat.length];
        if (Math.random() < 0.75 + 0.25 * tr.arp) note(t, chordTone(tr, deg, i, 1), spb * 2.6, 'triangle', 0.045 * tr.arp, wet, 2600);
      }
      if (tr.bell && s % 4 === 2 && Math.random() < 0.28 * tr.bell) {
        const m = chordTone(tr, deg, Math.floor(Math.random() * 7), 2);
        note(t, m, 2.2, 'sine', 0.05 * tr.bell, wet, 5000, 0.005); note(t, m + 12, 1.2, 'sine', 0.012 * tr.bell, wet, 6000, 0.005);
      }
      if (tr.drum) {
        const kick = tr.boss ? [0, 6, 8, 11] : [0, 10];
        if (kick.includes(s)) { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18); g.gain.setValueAtTime(0.35 * tr.drum, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.35); }
        if ((s === 4 || s === 12) && tr.drum > 0.3) SFX.noise(t, 0.16, 0.12 * tr.drum, 'bandpass', 1800, 900, 0.8, dest);
        if (s % 2 === 0 && tr.drum > 0.5) SFX.noise(t, 0.04, 0.035 * tr.drum, 'highpass', 7000, null, 1, dest);
        if (!tr.boss && s === 8 && tr.drum < 0.3 && Math.random() < 0.5) SFX.noise(t, 0.3, 0.05, 'lowpass', 300, 100, 1, wet);
      }
      nextT += spb; step++;
    }
  }
  let pending = null;
  function play(name) {
    const c = SFX.ctx; if (!c) { pending = name; return; }
    if (name === curName) return;
    curName = name;
    if (gain) { const old = gain; old.gain.setTargetAtTime(0.0001, c.currentTime, 0.6); setTimeout(() => { try { old.disconnect(); old._wet.disconnect(); } catch (e) { } }, 4000); }
    cur = TR[name] || null;
    if (!cur) { gain = null; return; }
    gain = c.createGain(); gain.gain.setValueAtTime(0.0001, c.currentTime); gain.gain.setTargetAtTime(1, c.currentTime + 0.3, 0.5); gain.connect(SFX.musBus);
    const wet = c.createGain(); wet.gain.value = 1; wet.connect(gain); wet.connect(SFX.verb); gain._wet = wet;
    nextT = c.currentTime + 0.1; step = 0;
    if (!timer) timer = setInterval(schedule, 40);
  }
  function kick() { if (pending != null) { const p = pending; pending = null; curName = '__'; play(p); } }
  return { play, kick, get current() { return curName; } };
})();

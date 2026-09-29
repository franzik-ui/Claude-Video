/*
 * PAYBACK AI Enablement — "The Dot"
 * Deterministic canvas animation. renderFrame(t) draws the frame at time t (seconds).
 * Scenes are driven by one shared beat grid (120 BPM, bars start on odd seconds),
 * mirrored in audio/soundtrack.py.
 */
(() => {
const W = 1920, H = 1080;
const FILM = { width: W, height: H, fps: 30, duration: 29 };
window.FILM = FILM;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// ---------- Palette: PAYBACK CD Guideline (Stand 09/2025), RGB values are master ----------
const C = {
  // primary
  blue: '#003EB0',      // PAYBACK Blue  0|62|176
  lightBlue: '#CCE6FF', // PAYBACK Light Blue  204|230|255
  red: '#C80A0A',       // PAYBACK Red  200|10|10
  white: '#FFFFFF',
  // accents (BFSG-checked for white type)
  berry: '#AD3966',     // Berry Red
  ruby: '#EC0640',      // Ruby
  sunset: '#D83D00',    // Sunset
  ivy: '#048A04',       // Ivy
  royal: '#0068E3',     // Royal
  midnight: '#080F5B',  // Midnight
  // shades of blue (background use only)
  shade3: '#ECF6FD',
  shade4: '#DFF0FC',
};
const SANS = '"Jakarta"', MONO = '"JBMono"';

// ---------- Math / easing ----------
const cl = x => x < 0 ? 0 : x > 1 ? 1 : x;
const P = (t, a, b) => cl((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const eOC = k => 1 - Math.pow(1 - k, 3);
const eIC = k => k * k * k;
const eIOC = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const eOE = k => k >= 1 ? 1 : 1 - Math.pow(2, -10 * k);
const eIE = k => k <= 0 ? 0 : Math.pow(2, 10 * k - 10);
const eIOQ = k => k < .5 ? 8 * k ** 4 : 1 - Math.pow(-2 * k + 2, 4) / 2;
const eOB = (k, s = 1.70158) => { const c3 = s + 1; return 1 + c3 * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2); };
// damped spring impulse starting at t0: 0 before, decays to 0
const spring = (t, t0, freq = 16, decay = 7) => t < t0 ? 0 : Math.exp(-decay * (t - t0)) * Math.sin(freq * (t - t0));
const TAU = Math.PI * 2;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// deterministic per-index jitter shared with the soundtrack script
const jit = i => Math.sin(i * 12.9898) * 0.012;

// ---------- Assets ----------
const IMG = {};
const imgList = {
  logo: '../assets/brand/payback-logo.webp',
  cap: '../assets/brand/pointee-cap.webp',
  laptop: '../assets/brand/pointee-laptop.png',
  wizard: '../assets/brand/pointee-wizard.png',
};
// Measured body circles of the Pointee artwork (image pixel space): cx, cy, r
const BODY = {
  cap: [591, 501, 312],
  laptop: [265, 362, 138],
  wizard: [424, 482, 146],
};
// Measured logo geometry (image pixel space, 2000 x 760)
const LOGO = {
  w: 2000, h: 760,
  rect: [39, 40, 1960, 720], rectR: 86,
  circles: [[1557, 278.5], [1759, 278.5], [1557, 480.5], [1759, 480.5]],
  ringR: 86, ringW: 17,
};

window.filmReady = (async () => {
  const fonts = [
    new FontFace('Jakarta', 'url(../assets/fonts/PlusJakartaSans-latin.woff2)', { weight: '200 800' }),
    new FontFace('JBMono', 'url(../assets/fonts/JetBrainsMono-latin.woff2)', { weight: '100 800' }),
  ];
  for (const f of fonts) { await f.load(); document.fonts.add(f); }
  await Promise.all(Object.entries(imgList).map(([k, src]) => new Promise((res, rej) => {
    const im = new Image(); im.onload = () => { IMG[k] = im; res(); }; im.onerror = rej; im.src = src;
  })));
  buildGrain();
  buildNetwork();
  buildConfetti();
  return true;
})();

// ---------- Drawing helpers ----------
function font(w, size, fam = SANS) { return `${w} ${size}px ${fam}`; }

function circle(x, y, r, fill) {
  if (r <= 0) return;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = fill; ctx.fill();
}
function ring(x, y, r, w, stroke, alpha = 1) {
  if (r <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.lineWidth = w; ctx.strokeStyle = stroke; ctx.stroke();
  ctx.restore();
}
function rrect(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
// Draw an image so that image-space point (ax, ay) lands on (x, y); uniform scale only (no distortion).
function drawImg(im, ax, ay, x, y, s, rot = 0, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  ctx.drawImage(im, -ax, -ay);
  ctx.restore();
}
function shadow(x, y, w, h, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, w);
  g.addColorStop(0, `rgba(11,29,90,${a})`); g.addColorStop(1, 'rgba(11,29,90,0)');
  ctx.save(); ctx.translate(x, y); ctx.scale(1, h / w); ctx.translate(-x, -y);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, w, 0, TAU); ctx.fill(); ctx.restore();
}

/*
 * Big keyword with a coloured "dot" as its full stop (the film's motif).
 * Letters rise out of a mask one by one.
 */
function keyword(word, x, y, size, color, dotColor, t, t0, opt = {}) {
  const { weight = 800, stagger = 0.035, dur = 0.6, align = 'left', ls = -0.035, out = null, alpha = 1 } = opt;
  if (t < t0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = font(weight, size);
  ctx.letterSpacing = `${ls * size}px`;
  ctx.textBaseline = 'alphabetic';
  const wWord = ctx.measureText(word).width;
  const r = size * 0.088;
  const total = wWord + size * 0.05 + 2 * r;
  let x0 = align === 'center' ? x - total / 2 : x;
  // mask
  ctx.beginPath(); ctx.rect(x0 - size, y - size * 1.05, total + size * 2, size * 1.35); ctx.clip();
  const n = word.length;
  for (let i = 0; i < n; i++) {
    let k = eOE(P(t, t0 + i * stagger, t0 + i * stagger + dur));
    let dy = (1 - k) * size * 1.05;
    if (out) { const ko = eIC(P(t, out + i * 0.02, out + i * 0.02 + 0.35)); dy -= ko * size * 1.45; }
    const px = ctx.measureText(word.slice(0, i)).width;
    ctx.fillStyle = color;
    ctx.fillText(word[i], x0 + px, y + dy);
  }
  ctx.restore();
  // dot (outside mask so it can overshoot)
  const td = t0 + n * stagger + dur * 0.35;
  let kd = P(t, td, td + 0.45);
  if (kd > 0) {
    let s = eOB(kd, 3);
    if (out) s *= 1 - eIC(P(t, out + 0.1, out + 0.4));
    ctx.save(); ctx.globalAlpha *= alpha;
    circle(x0 + wWord + size * 0.05 + r, y - r, r * Math.max(0, s), dotColor);
    ctx.restore();
  }
}

function textAt(str, x, y, f, color, align = 'left', ls = 0, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.font = f; ctx.letterSpacing = `${ls}px`; ctx.textAlign = align; ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, y);
  ctx.restore();
}
// Fade + rise line of copy
function copyLine(str, x, y, f, color, t, t0, opt = {}) {
  const { align = 'left', ls = 0, out = null, dur = 0.55 } = opt;
  const k = eOC(P(t, t0, t0 + dur));
  if (k <= 0) return;
  let a = k, dy = (1 - k) * 26;
  if (out != null) { const ko = eIC(P(t, out, out + 0.3)); a *= 1 - ko; dy -= ko * 16; }
  textAt(str, x, y + dy, f, color, align, ls, a);
}

// ---------- Grain + vignette (premium finish) ----------
let grains = [];
function buildGrain() {
  const rnd = mulberry32(99);
  for (let n = 0; n < 4; n++) {
    const g = document.createElement('canvas'); g.width = g.height = 256;
    const gx = g.getContext('2d'); const id = gx.createImageData(256, 256);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = 128 + (rnd() - 0.5) * 255;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255;
    }
    gx.putImageData(id, 0, 0); grains.push(g);
  }
}
function finish(t) {
  const f = Math.floor(t * FILM.fps);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.045;
  const g = grains[f % grains.length];
  const ox = (f * 97) % 256, oy = (f * 57) % 256;
  ctx.translate(-ox, -oy);
  ctx.fillStyle = ctx.createPattern(g, 'repeat');
  ctx.fillRect(0, 0, W + 256, H + 256);
  ctx.restore();
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
  v.addColorStop(0, 'rgba(5,15,50,0)'); v.addColorStop(1, 'rgba(5,15,50,0.10)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

function bg(color) { ctx.fillStyle = color; ctx.fillRect(0, 0, W, H); }

function kicker(label, t, t0, color, out = null) {
  copyLine(label, 116, 128, font(500, 24, MONO), color, t, t0, { ls: 3, out });
}

// =====================================================================
// S1 · HOOK (0 – 3 s): "AI sounds interesting." — the full stop becomes Pointee
// =====================================================================
const HOOK = 'AI sounds interesting';
const HOOK_T0 = 0.25, HOOK_DT = 0.056;
const hookCharT = i => HOOK_T0 + i * HOOK_DT + jit(i);
const DOT_T = 1.75;
const SPHERE = { x: 960, y: 470, r: 200 };

function sphere(x, y, r, shade) {
  circle(x, y, r, C.blue);
  if (shade > 0) {
    ctx.save(); ctx.globalAlpha *= shade;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
    g.addColorStop(0, '#5AAAF0'); g.addColorStop(0.45, '#1C5FD0'); g.addColorStop(1, '#0A2B8A');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function S1(t) {
  bg(C.lightBlue);
  const size = 120;
  ctx.font = font(800, size); ctx.letterSpacing = `${-0.03 * size}px`;
  const wText = ctx.measureText(HOOK).width;
  const r0 = size * 0.088;
  const total = wText + size * 0.05 + 2 * r0;
  const x0 = 960 - total / 2, base = 590;
  const dotX = x0 + wText + size * 0.05 + r0, dotY = base - r0;

  // letters: typed, then fall away
  for (let i = 0; i < HOOK.length; i++) {
    const ti = hookCharT(i);
    if (t < ti) continue;
    const kf = eIC(P(t, 2.0 + (HOOK.length - i) * 0.012, 2.42 + (HOOK.length - i) * 0.012));
    if (kf >= 1) continue;
    const pop = eOB(P(t, ti, ti + 0.12), 2.2);
    const px = ctx.measureText(HOOK.slice(0, i)).width;
    ctx.save();
    ctx.globalAlpha = 1 - kf;
    ctx.translate(x0 + px + size * 0.28, base + kf * 240 - (1 - pop) * 14);
    ctx.rotate(kf * (i % 2 ? 0.25 : -0.2));
    ctx.font = font(800, size); ctx.letterSpacing = `${-0.03 * size}px`;
    ctx.fillStyle = C.blue;
    ctx.fillText(HOOK[i], -size * 0.28, 0);
    ctx.restore();
  }
  // caret
  const typingEnd = hookCharT(HOOK.length - 1);
  if (t < DOT_T) {
    const typed = HOOK.split('').filter((_, i) => t >= hookCharT(i)).length;
    const cx = x0 + ctx.measureText(HOOK.slice(0, typed)).width + 10;
    const blink = t < typingEnd + 0.05 || Math.floor((t - typingEnd) * 3.2) % 2 === 0;
    if (blink) { ctx.fillStyle = C.blue; ctx.fillRect(cx, base - size * 0.78, 7, size * 0.92); }
  }
  // the dot
  if (t >= DOT_T) {
    const kPop = eOB(P(t, DOT_T, DOT_T + 0.2), 3);
    const kGrow = eIOQ(P(t, 2.0, 2.8));
    const x = lerp(dotX, SPHERE.x, kGrow), y = lerp(dotY, SPHERE.y, kGrow);
    const anticip = 1 - 0.25 * Math.sin(Math.PI * P(t, 1.88, 2.05));
    let r = r0 * kPop * anticip * Math.pow(SPHERE.r / r0, kGrow);
    const shade = P(t, 2.25, 2.8);
    const fadeOut = 1 - P(t, 2.84, 2.98);
    if (fadeOut > 0) { ctx.save(); ctx.globalAlpha = fadeOut; sphere(x, y, r, shade); ctx.restore(); }
  }
  // Pointee arrives
  if (t >= 2.76) pointeeCap(t);
}

// Pointee with the AI cap: pops out of the sphere, then walks left for the LEARN scene
function capState(t) {
  const [bx, by, br] = BODY.cap;
  const s0 = SPHERE.r / br;
  const km = eIOC(P(t, 3.05, 3.75));
  const x = lerp(SPHERE.x, 520, km), y = lerp(SPHERE.y, 505, km);
  const s = lerp(s0, 0.6, km) * (1 + 0.07 * spring(t, 2.8, 17, 6));
  return { x, y, s, bx, by, br };
}
function pointeeCap(t) {
  const st = capState(t);
  const a = P(t, 2.76, 2.9);
  // ground shadow
  const feetY = st.y + (1147 - st.by) * st.s;
  shadow(st.x + 10 * st.s, feetY + 4, 250 * st.s, 34 * st.s, 0.18 * a * P(t, 3.0, 3.6));
  const sway = Math.sin(t * 2.2) * 0.012 * P(t, 3.6, 4.2);
  // rotate around the feet so the character stays grounded
  ctx.save();
  ctx.translate(st.x, feetY); ctx.rotate(sway); ctx.translate(-st.x, -feetY);
  drawImg(IMG.cap, st.bx, st.by, st.x, st.y, st.s, 0, a);
  ctx.restore();
  // pop shockwave
  if (t > 2.8 && t < 3.5) {
    const k = eOC(P(t, 2.8, 3.4));
    ring(st.x, st.y, SPHERE.r * (1 + k * 0.9), 10 * (1 - k) + 1, C.red, 1 - k);
  }
}

// =====================================================================
// S2 · LEARN (3 – 7 s)
// =====================================================================
function pill(x, y, label, suffix, dotColor, k, onDark = false) {
  if (k <= 0) return;
  const h = 72;
  ctx.save();
  ctx.font = font(700, 32); ctx.letterSpacing = '0px';
  const wl = ctx.measureText(label).width;
  ctx.font = font(500, 28);
  const ws = suffix ? ctx.measureText(suffix).width + 18 : 0;
  const w = 28 + 22 + 16 + wl + ws + 30;
  const s = lerp(0.85, 1, eOB(k, 2));
  ctx.globalAlpha *= cl(k * 2.5);
  ctx.translate(x + (1 - eOC(k)) * 50, y + h / 2); ctx.scale(s, s); ctx.translate(0, -h / 2);
  ctx.shadowColor = 'rgba(11,29,90,0.14)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
  rrect(0, 0, w, h, h / 2); ctx.fillStyle = onDark ? C.white : C.white; ctx.fill();
  ctx.shadowColor = 'transparent';
  circle(28 + 11, h / 2, 11, dotColor);
  ctx.textBaseline = 'middle';
  ctx.font = font(700, 32); ctx.fillStyle = C.blue; ctx.fillText(label, 28 + 22 + 16, h / 2 + 2);
  if (suffix) { ctx.font = font(500, 28); ctx.fillStyle = C.blue; ctx.fillText(suffix, 28 + 22 + 16 + wl + 18, h / 2 + 2); }
  ctx.restore();
}

function questionMark(t) {
  const t0 = 3.6, flip = 5.5;
  if (t < t0) return;
  const k = eOB(P(t, t0, t0 + 0.45), 2.5);
  const kf = P(t, flip, flip + 0.22);
  const sx = Math.abs(Math.cos(kf * Math.PI));
  const glyph = kf < 0.5 ? '?' : '!';
  const x = 830, y = 300;
  const wob = Math.sin(t * 3.1) * 0.06;
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 2.4) * 6);
  ctx.rotate(lerp(-0.5, 0, k) + wob * (glyph === '?' ? 1 : 0.3));
  ctx.scale(Math.max(0.001, k) * Math.max(0.02, sx) * (1 + 0.15 * spring(t, flip + 0.22, 20, 8)), Math.max(0.001, k));
  ctx.font = font(800, 190); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = glyph === '?' ? C.red : C.blue;
  ctx.fillText(glyph, 0, 0);
  ctx.restore();
  // burst lines when it turns into "!"
  if (t > flip + 0.15 && t < flip + 0.8) {
    const kb = eOC(P(t, flip + 0.15, flip + 0.7));
    ctx.save(); ctx.strokeStyle = C.red; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.globalAlpha = 1 - P(t, flip + 0.45, flip + 0.8);
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.42;
      const r1 = 95 + kb * 40, r2 = 95 + kb * 85;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2); ctx.stroke();
    }
    ctx.restore();
  }
}

function S2(t) {
  bg(C.lightBlue);
  kicker('01 / 04', t, 3.3, C.blue);
  pointeeCap(t);
  questionMark(t);
  keyword('Learn', 930, 420, 190, C.blue, C.red, t, 3.35);
  pill(934, 490, 'AI Q&A Session', 'weekly', C.blue, P(t, 3.85, 4.35));
  pill(974, 578, 'Best Practice Session', 'every 6 weeks', C.red, P(t, 4.25, 4.75));
  pill(934, 666, 'What\u2019s New', 'quarterly', C.royal, P(t, 4.65, 5.15));
  pill(934, 754, 'AI Hub: Trainings & Learning Content', 'on demand', C.berry, P(t, 5.05, 5.55));
  // exit: dive into Pointee's blue body
  if (t > 6.5) {
    const st = capState(t);
    // the body inflates (shaded sphere) until it fills the frame
    const k = P(t, 6.5, 7.0);
    const r = st.br * st.s * 0.98 * Math.pow(2400 / (st.br * st.s), eIC(k));
    ctx.save(); ctx.globalAlpha = cl(k * 6); sphere(st.x, st.y + 4, r, 1 - 0.5 * eIC(k)); ctx.restore();
  }
}

// =====================================================================
// S3 · TRY (7 – 11 s): hands-on; people build their own agent
// =====================================================================
const LAP = { x: 60, y: 480, s: 0.95 };
const CARD = { x: 1010, y: 170, w: 790, h: 590 };
const PROMPT_LINES = ['Turn my partner notes', 'into a weekly update.'];
const PROMPT_T0 = 7.95, PROMPT_DT = 0.024;

function promptCharT(i) { return PROMPT_T0 + i * PROMPT_DT + jit(i + 40) * 0.5; }

function S3(t) {
  bg(C.blue);
  kicker('02 / 04', t, 7.2, C.lightBlue);
  keyword('Try', 110, 300, 190, C.white, C.lightBlue, t, 7.25);

  // laptop Pointee slides in
  const kl = eOC(P(t, 7.0, 7.7));
  const lx = lerp(-1150, LAP.x, kl);
  // soft light pool under the laptop so its baked shadow sits naturally on blue
  const pool = ctx.createRadialGradient(lx + 560, LAP.y + 520, 0, lx + 560, LAP.y + 520, 620);
  pool.addColorStop(0, 'rgba(255,255,255,0.20)'); pool.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save(); ctx.translate(0, LAP.y + 520); ctx.scale(1, 0.16); ctx.translate(0, -(LAP.y + 520));
  ctx.fillStyle = pool; ctx.fillRect(0, 0, W, H * 8); ctx.restore();
  drawImg(IMG.laptop, 0, 0, lx, LAP.y, LAP.s, 0, 1);

  // idea particles streaming from the screen toward the card
  const src = { x: LAP.x + 790 * LAP.s, y: LAP.y + 150 * LAP.s };
  const rnd = mulberry32(5);
  const cols = [C.red, C.lightBlue, C.white, C.ruby];
  for (let i = 0; i < 70; i++) {
    const born = 7.55 + rnd() * 2.6, life = 0.9 + rnd() * 0.6;
    const a = -0.9 + rnd() * 1.1, sp = 240 + rnd() * 360;
    const col = cols[i % 4], r = 3 + rnd() * 6;
    const u = (t - born) / life;
    if (u < 0 || u > 1) continue;
    const x = src.x + Math.cos(a) * sp * u * life + 60 * u * u;
    const y = src.y + Math.sin(a) * sp * u * life - 40 * u;
    ctx.save(); ctx.globalAlpha = Math.sin(Math.PI * u) * 0.9; circle(x, y, r * (1 - u * 0.4), col); ctx.restore();
  }

  // prompt card
  const kc = P(t, 7.55, 8.15);
  if (kc > 0) {
    const s = lerp(0.15, 1, eOB(kc, 1.6));
    const cx = lerp(src.x, CARD.x + CARD.w / 2, eOC(kc)), cy = lerp(src.y, CARD.y + CARD.h / 2, eOC(kc));
    ctx.save();
    ctx.globalAlpha = cl(kc * 3);
    ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-CARD.w / 2, -CARD.h / 2);
    ctx.shadowColor = 'rgba(0,8,40,0.35)'; ctx.shadowBlur = 70; ctx.shadowOffsetY = 30;
    rrect(0, 0, CARD.w, CARD.h, 30); ctx.fillStyle = C.white; ctx.fill();
    ctx.shadowColor = 'transparent';
    // header
    ctx.font = font(600, 22, MONO); ctx.letterSpacing = '3px'; ctx.fillStyle = C.blue; ctx.textBaseline = 'alphabetic';
    ctx.fillText('MY PROMPT', 50, 70);
    circle(CARD.w - 60, 62, 9, C.red); circle(CARD.w - 88, 62, 9, C.lightBlue);
    // typed prompt
    ctx.font = font(500, 36, MONO); ctx.letterSpacing = '-0.5px'; ctx.fillStyle = C.blue;
    let idx = 0, caretX = 50, caretY = 140;
    PROMPT_LINES.forEach((line, li) => {
      let shown = '';
      for (const ch of line) { if (t >= promptCharT(idx)) shown += ch; idx++; }
      const y = 140 + li * 54;
      ctx.fillText(shown, 50, y);
      if (shown.length) { caretX = 50 + ctx.measureText(shown).width + 4; caretY = y; }
    });
    const promptEnd = promptCharT(idx - 1);
    if (t > PROMPT_T0 - 0.2 && (t < promptEnd || Math.floor((t - promptEnd) * 3) % 2 === 0) && t < 9.1) {
      ctx.fillStyle = C.blue; ctx.fillRect(caretX, caretY - 30, 4, 38);
    }
    // divider
    ctx.fillStyle = C.shade4; ctx.fillRect(50, 238, CARD.w - 100, 2);
    // building blocks snap in
    const blocks = [
      { label: 'Context', tag: 'my notes', t0: 9.0 },
      { label: 'Instructions', tag: 'tone & format', t0: 9.25 },
      { label: 'My agent', tag: 'ready', t0: 9.5, hero: true },
    ];
    blocks.forEach((b, i) => {
      const kb = P(t, b.t0, b.t0 + 0.4);
      if (kb <= 0) return;
      const y = 272 + i * 96;
      ctx.save();
      ctx.globalAlpha *= cl(kb * 3);
      ctx.translate((1 - eOB(kb, 2)) * 90, 0);
      rrect(50, y, CARD.w - 100, 80, 20);
      ctx.fillStyle = b.hero ? C.blue : C.shade3; ctx.fill();
      // icon
      if (b.hero) { circle(94, y + 40, 16, C.white); circle(94, y + 40, 8, C.blue); }
      else { ring(94, y + 40, 13, 4, C.blue); }
      ctx.font = font(700, 32); ctx.letterSpacing = '0px'; ctx.textBaseline = 'middle';
      ctx.fillStyle = b.hero ? C.white : C.blue; ctx.fillText(b.label, 130, y + 42);
      ctx.font = font(500, 22, MONO); ctx.textAlign = 'right';
      ctx.fillStyle = b.hero ? C.lightBlue : C.blue; ctx.fillText(b.tag, CARD.w - 120, y + 42);
      // check
      const kk = eOB(P(t, b.t0 + 0.2, b.t0 + 0.5), 2.5);
      if (kk > 0) {
        const cx = CARD.w - 84, cy = y + 40;
        circle(cx, cy, 17 * kk, b.hero ? C.ivy : C.blue);
        ctx.strokeStyle = C.white; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(cx - 7 * kk, cy); ctx.lineTo(cx - 2 * kk, cy + 6 * kk); ctx.lineTo(cx + 8 * kk, cy - 6 * kk); ctx.stroke();
      }
      ctx.restore();
    });
    ctx.restore();
  }
  // caption: enablement, not a service desk
  copyLine('You build it. We help.', CARD.x + 4, 850, font(700, 46), C.white, t, 9.8);
  copyLine('WORKING SESSION · WEEKLY', CARD.x + 6, 900, font(500, 22, MONO), C.lightBlue, t, 10.0, { ls: 3 });
}

// =====================================================================
// S4 · SHARE (11 – 15 s): the Ambassador network lights up
// =====================================================================
const ORIGIN = { x: 960, y: 540 };
const CLUSTERS = [
  { name: 'MARKETING', x: 300, y: 690 },
  { name: 'PARTNER MANAGEMENT', x: 640, y: 930 },
  { name: 'DATA', x: 1150, y: 200 },
  { name: 'TECH', x: 1620, y: 250 },
  { name: 'FINANCE', x: 1640, y: 790 },
  { name: 'AUSTRIA', x: 1190, y: 900 },
];
const TEAMS = [250, 610, 970, 1330, 1690].map(x => ({ x, y: 895 }));
let NODES = [];

function buildNetwork() {
  const rnd = mulberry32(7);
  NODES = [{ x: ORIGIN.x, y: ORIGIN.y, origin: true }];
  for (let tries = 0; tries < 9000; tries++) {
    const x = 70 + rnd() * 1780, y = 80 + rnd() * 930;
    if (x < 930 && y < 480) continue; // keep the headline area clear
    let ok = true;
    for (const n of NODES) { const dx = n.x - x, dy = n.y - y; if (dx * dx + dy * dy < 60 * 60) { ok = false; break; } }
    if (ok) NODES.push({ x, y });
  }
  // keep cluster labels readable
  NODES = NODES.filter(n => n.origin || CLUSTERS.every(c => Math.abs(n.x - c.x) > (c.name.length * 9 + 20) || Math.abs(n.y - (c.y - 4)) > 34));
  NODES.forEach((n, i) => {
    n.d = Math.hypot(n.x - ORIGIN.x, n.y - ORIGIN.y);
    n.appear = 11.0 + (n.d / 1100) * 0.75 + rnd() * 0.08;
  });
  // ambassadors: farthest point sampling for an even spread
  const amb = [NODES[0]];
  NODES[0].amb = true; NODES[0].tA = 11.35;
  while (amb.length < 29) {
    let best = null, bd = -1;
    for (const n of NODES) {
      if (n.amb) continue;
      let md = Infinity; for (const a of amb) md = Math.min(md, Math.hypot(n.x - a.x, n.y - a.y));
      md *= 0.85 + rnd() * 0.3;
      if (md > bd) { bd = md; best = n; }
    }
    best.amb = true; amb.push(best);
  }
  const ordered = amb.slice(1).sort((a, b) => a.d - b.d);
  ordered.forEach((n, rank) => {
    n.tA = 11.6 + rank * 0.062;
    const prev = [NODES[0], ...ordered.slice(0, rank)];
    let src = prev[0], sd = Infinity;
    for (const p of prev) { const d = Math.hypot(p.x - n.x, p.y - n.y); if (d < sd) { sd = d; src = p; } }
    n.src = src;
  });
  // everyone else is reached by the nearest ambassador
  for (const n of NODES) {
    if (n.amb) continue;
    let bt = Infinity, bs = null;
    for (const a of amb) {
      const d = Math.hypot(a.x - n.x, a.y - n.y);
      const tt = a.tA + 0.22 + d / 480;
      if (tt < bt) { bt = tt; bs = a; }
    }
    n.tA = bt; n.src = bs;
  }
  // team slots for the Promptathon (phyllotaxis inside 5 teams)
  const counts = [0, 0, 0, 0, 0];
  NODES.forEach((n, i) => {
    n.team = i % 5; n.slot = counts[n.team]++;
  });
}

function teamPos(n, t) {
  const tm = TEAMS[n.team];
  const dir = n.team % 2 ? -1 : 1;
  const beat = Math.max(0, 1 - ((t - 15) % 0.5) / 0.25);
  const pulse = t >= 15 ? 1 + 0.06 * beat * beat : 1;
  const a = n.slot * 2.39996 + dir * (t - 15) * (0.9 + (n.slot % 3) * 0.15);
  const rad = (6 + 10.2 * Math.sqrt(n.slot)) * pulse;
  return { x: tm.x + Math.cos(a) * rad, y: tm.y + Math.sin(a) * rad * 0.92 };
}

function nodeState(n, t) {
  const on = t >= n.tA;
  const k = P(t, n.tA, n.tA + 0.35);
  return { on, k };
}

function S4(t) {
  bg(C.lightBlue);
  // camera pulls back from the origin dot
  const cam = 1 + 0.75 * (1 - eOC(P(t, 10.55, 12.1)));
  const conv = t > 14.3;
  ctx.save();
  ctx.translate(ORIGIN.x, ORIGIN.y); ctx.scale(cam, cam); ctx.translate(-ORIGIN.x, -ORIGIN.y);

  // cluster labels
  if (!conv || t < 14.6) CLUSTERS.forEach((c, i) => {
    const k = eOC(P(t, 11.9 + i * 0.09, 12.4 + i * 0.09)) * (1 - P(t, 14.25, 14.5));
    if (k <= 0) return;
    textAt(c.name, c.x, c.y + (1 - k) * 12, font(600, 20, MONO), C.blue, 'center', 3, k);
  });

  // connection threads (spark travels from source to ambassador)
  ctx.lineCap = 'round';
  for (const n of NODES) {
    if (!n.src || n === n.src) continue;
    const travel = n.amb ? 0.3 : 0.22;
    const ks = P(t, n.tA - travel, n.tA);
    if (ks <= 0) continue;
    const fade = n.amb ? 1 - P(t, 14.1, 14.45) : 1 - P(t, n.tA + 0.1, n.tA + 0.6);
    if (fade <= 0) continue;
    const s = n.src;
    const mx = (s.x + n.x) / 2 + (n.y - s.y) * 0.18, my = (s.y + n.y) / 2 - (n.x - s.x) * 0.18;
    const e = eIOC(ks);
    ctx.save();
    ctx.globalAlpha = (n.amb ? 0.55 : 0.35) * fade;
    ctx.strokeStyle = n.amb ? C.blue : C.royal; ctx.lineWidth = n.amb ? 2.5 : 2;
    ctx.beginPath();
    const steps = 18; ctx.moveTo(s.x, s.y);
    for (let i = 1; i <= steps; i++) {
      const u = (i / steps) * e;
      const x = (1 - u) ** 2 * s.x + 2 * (1 - u) * u * mx + u * u * n.x;
      const y = (1 - u) ** 2 * s.y + 2 * (1 - u) * u * my + u * u * n.y;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (n.amb && ks < 1) {
      const u = e;
      const x = (1 - u) ** 2 * s.x + 2 * (1 - u) * u * mx + u * u * n.x;
      const y = (1 - u) ** 2 * s.y + 2 * (1 - u) * u * my + u * u * n.y;
      ctx.globalAlpha = 1; circle(x, y, 6, C.red);
    }
    ctx.restore();
  }

  // nodes
  for (const n of NODES) {
    const ka = eOB(P(t, n.appear, n.appear + 0.35), 2);
    if (ka <= 0 && !n.origin) continue;
    let x = n.x, y = n.y;
    if (conv) {
      const kc = eIOC(P(t, 14.3 + (n.slot % 12) * 0.012, 14.97));
      const tp = teamPos(n, 15);
      x = lerp(n.x, tp.x, kc); y = lerp(n.y, tp.y, kc);
    }
    const { on, k } = nodeState(n, t);
    if (n.origin) {
      circle(x, y, 11 * (1 + 0.25 * spring(t, 11.3, 14, 5)), C.blue);
      continue;
    }
    if (!on) { ring(x, y, 8 * ka, 2.2, C.blue, 0.3); continue; }
    const r = (n.amb ? 11 : 8.5) * (1 + 0.35 * spring(t, n.tA, 16, 7));
    if (n.amb) circle(x, y, r + 3, C.white);
    circle(x, y, r, n.amb ? C.blue : C.royal);
    if (n.amb && k < 1) ring(x, y, 11 + 30 * eOC(k), 3 * (1 - k) + 0.5, C.red, 1 - k);
  }
  ctx.restore();

  // headline
  const out = 14.15;
  kicker('03 / 04', t, 11.3, C.blue, out);
  keyword('Share', 110, 300, 190, C.blue, C.red, t, 11.3, { out });
  // counting headline
  const kn = P(t, 11.9, 13.1);
  if (kn > 0) {
    const num = Math.round(80 * eOC(kn));
    const label = `${num}${kn >= 1 ? '+' : ''} AI Ambassadors`;
    copyLine(label, 114, 392, font(800, 56), C.blue, t, 11.85, { out });
  }
  copyLine('across 1,400+ colleagues', 116, 448, font(500, 36), C.blue, t, 12.5, { out });
}

// =====================================================================
// S5 · BUILD — PROMPTATHON (15 – 21 s): the peak
// =====================================================================
const PCARDS = [
  { n: '01', label: 'Idea', icon: 'idea' },
  { n: '02', label: 'Prompt', icon: 'prompt' },
  { n: '03', label: 'Prototype', icon: 'proto' },
  { n: '04', label: 'Pitch', icon: 'star' },
];
const PC = { x: 375, y: 545, w: 270, h: 225, gap: 30 };
const ROW = [480, 800, 1120, 1440].map(x => ({ x, y: 450 }));
const ROW_R = 78;

function starPath(x, y, r1, r2, n = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1, a = rot + i * Math.PI / n;
    i ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

function cardIcon(kind, x, y, t) {
  ctx.save();
  ctx.strokeStyle = C.blue; ctx.fillStyle = C.blue; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (kind === 'idea') {
    ring(x, y - 4, 15, 5, C.blue);
    ctx.beginPath(); ctx.moveTo(x - 7, y + 20); ctx.lineTo(x + 7, y + 20); ctx.stroke();
  } else if (kind === 'prompt') {
    ctx.beginPath(); ctx.moveTo(x - 16, y - 12); ctx.lineTo(x - 4, y); ctx.lineTo(x - 16, y + 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 2, y + 13); ctx.lineTo(x + 18, y + 13); ctx.stroke();
  } else if (kind === 'proto') {
    ctx.fillRect(x - 18, y + 2, 16, 16); ctx.fillRect(x + 2, y + 2, 16, 16);
    ctx.fillStyle = C.red; ctx.fillRect(x - 8, y - 18, 16, 16);
  } else if (kind === 'star') {
    starPath(x, y, 20, 9); ctx.fillStyle = C.ruby; ctx.fill();
  }
  ctx.restore();
}

// card rectangle during the morph into the Learn/Try/Share/Build circles
function cardGeom(i, t) {
  const x0 = PC.x + i * (PC.w + PC.gap), y0 = PC.y;
  const km = eIOQ(P(t, 20.5 + i * 0.05, 21.15 + i * 0.05));
  const c0x = x0 + PC.w / 2, c0y = y0 + PC.h / 2;
  const cx = lerp(c0x, ROW[i].x, km), cy = lerp(c0y, ROW[i].y, km) - Math.sin(km * Math.PI) * 60;
  const w = lerp(PC.w, ROW_R * 2, km), h = lerp(PC.h, ROW_R * 2, km);
  const r = lerp(28, ROW_R, km);
  return { cx, cy, w, h, r, km };
}

function wizardPos(t) {
  const u = eIOC(P(t, 18.55, 20.45));
  const p0 = [2300, 380], p1 = [1500, 720], p2 = [600, 660], p3 = [-450, 430];
  const b = (a, bb, c, d) => (1 - u) ** 3 * a + 3 * (1 - u) ** 2 * u * bb + 3 * (1 - u) * u * u * c + u ** 3 * d;
  return { x: b(p0[0], p1[0], p2[0], p3[0]), y: b(p0[1], p1[1], p2[1], p3[1]), u };
}

function S5(t) {
  bg(C.berry);
  const out = 20.45;
  // flash on the drop
  // teams of colleagues orbit — the energy of the day
  const fall = eIC(P(t, 20.4, 20.9));
  for (const n of NODES) {
    const p = teamPos(n, t);
    const y = p.y + fall * (300 + (n.slot % 7) * 40);
    circle(p.x, y, n.amb ? 10 : 8, n.amb ? C.blue : (n.slot % 4 === 0 ? C.white : C.lightBlue));
  }

  kicker('04 / 04', t, 15.05, 'rgba(255,255,255,0.8)', out);
  // "Build." slams in
  const ks = P(t, 15.0, 15.35);
  if (ks > 0) {
    const s = lerp(1.35, 1, eOE(ks));
    ctx.save();
    ctx.translate(110, 300); ctx.scale(s, s); ctx.translate(-110, -300);
    keyword('Build', 110, 300, 190, C.white, C.lightBlue, t, 14.98, { stagger: 0.02, dur: 0.3, out });
    ctx.restore();
  }
  // PROMPTATHON tag
  const kp = P(t, 15.3, 15.7);
  if (kp > 0) {
    const a = 1 - P(t, out, out + 0.3);
    ctx.save(); ctx.globalAlpha = a * cl(kp * 3);
    ctx.font = font(700, 30, MONO); ctx.letterSpacing = '6px';
    const w = ctx.measureText('PROMPTATHON').width + 50;
    const sx = eOB(kp, 2);
    ctx.translate(114, 348); ctx.scale(sx, 1);
    rrect(0, 0, w, 60, 30); ctx.fillStyle = C.midnight; ctx.fill();
    ctx.fillStyle = C.white; ctx.textBaseline = 'middle'; ctx.fillText('PROMPTATHON', 25, 32);
    ctx.restore();
  }
  copyLine('One day. Real teams. Real use cases.', 116, 470, font(600, 36), C.white, t, 15.6, { out });

  // clock 09:00 → 16:00
  const kt = P(t, 15.5, 16.0);
  if (kt > 0) {
    const kk = eIOC(P(t, 15.7, 19.6));
    const mins = Math.floor(lerp(9 * 60, 16 * 60, kk) / 5) * 5;
    const hh = String(Math.floor(mins / 60)).padStart(2, '0'), mm = String(mins % 60).padStart(2, '0');
    const a = eOC(kt) * (1 - P(t, out, out + 0.3));
    textAt(`${hh}:${mm}`, 1800, 200, font(600, 84, MONO), C.white, 'right', -2, a);
    ctx.save(); ctx.globalAlpha = a * 0.35; ctx.fillStyle = C.white; ctx.fillRect(1800 - 300, 232, 300, 6); ctx.restore();
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = C.lightBlue; ctx.fillRect(1800 - 300, 232, 300 * kk, 6); ctx.restore();
    textAt(kk >= 1 ? 'PITCH TO THE JURY' : 'BUILD TIME', 1800, 280, font(500, 20, MONO), C.white, 'right', 3, a * 0.85);
  }

  // cards pop on the beat, then morph into circles
  PCARDS.forEach((c, i) => {
    const t0 = 16.0 + i * 0.5;
    const kc = P(t, t0, t0 + 0.45);
    if (kc <= 0) return;
    const g = cardGeom(i, t);
    const s = lerp(0.55, 1, eOB(kc, 2.2)) * (1 + 0.05 * spring(t, 18.0 + i * 0.25, 20, 9));
    const rot = lerp(-0.12, 0, eOC(kc)) * (1 - g.km);
    const dy = (1 - eOC(kc)) * 70;
    ctx.save();
    ctx.globalAlpha = cl(kc * 3);
    ctx.translate(g.cx, g.cy + dy); ctx.rotate(rot); ctx.scale(s, s);
    ctx.shadowColor = `rgba(90,10,40,${0.28 * (1 - g.km)})`; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
    rrect(-g.w / 2, -g.h / 2, g.w, g.h, g.r); ctx.fillStyle = C.white; ctx.fill();
    ctx.shadowColor = 'transparent';
    const ca = 1 - P(t, 20.4, 20.6);
    if (ca > 0) {
      ctx.globalAlpha *= ca;
      ctx.font = font(600, 22, MONO); ctx.letterSpacing = '2px'; ctx.fillStyle = C.berry; ctx.textBaseline = 'alphabetic';
      ctx.fillText(c.n, -PC.w / 2 + 26, -PC.h / 2 + 46);
      cardIcon(c.icon, PC.w / 2 - 50, -PC.h / 2 + 46, t);
      ctx.font = font(800, 42); ctx.letterSpacing = '-1px'; ctx.fillStyle = C.blue;
      ctx.fillText(c.label, -PC.w / 2 + 26, PC.h / 2 - 32);
      // check on the beat as the teams progress
      const kk = eOB(P(t, 18.0 + i * 0.25, 18.3 + i * 0.25), 2.5);
      if (kk > 0) {
        const bx = PC.w / 2 - 10, by = -PC.h / 2 + 10; // corner badge
        circle(bx, by, 24 * kk, C.white); circle(bx, by, 19 * kk, i === 3 ? C.ivy : C.blue);
        ctx.strokeStyle = C.white; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(bx - 7 * kk, by); ctx.lineTo(bx - 2 * kk, by + 6 * kk); ctx.lineTo(bx + 8 * kk, by - 6 * kk); ctx.stroke();
      }
    }
    ctx.restore();
  });

  // wizard Pointee flies across, leaving a star trail
  if (t > 18.5 && t < 20.6) {
    for (let j = 18; j >= 1; j--) {
      const tt = t - j * 0.035;
      if (tt < 18.55) continue;
      const w = wizardPos(tt);
      const s = 0.6;
      const sx = w.x + (85 - BODY.wizard[0]) * s, sy = w.y + (70 - BODY.wizard[1]) * s;
      const a = (1 - j / 18);
      ctx.save(); ctx.globalAlpha = a * 0.9;
      starPath(sx + Math.sin(j * 7.1) * 16, sy + Math.cos(j * 5.3) * 16, 12 * a + 3, 5 * a + 1.5, 4, j * 0.4);
      ctx.fillStyle = j % 3 ? C.lightBlue : C.white; ctx.fill(); ctx.restore();
    }
    const w = wizardPos(t);
    const tilt = -0.12 + Math.sin(w.u * Math.PI) * 0.08;
    drawImg(IMG.wizard, BODY.wizard[0], BODY.wizard[1], w.x, w.y, 0.6, tilt, 1);
  }



  // exit: blue floods from the centre, cards become circles on top
  if (t > 20.55) {
    const k = eIC(P(t, 20.55, 21.05));
    circle(960, 600, k * 1250, C.blue);
    PCARDS.forEach((c, i) => {
      const g = cardGeom(i, t);
      if (g.km <= 0) return;
      rrect(g.cx - g.w / 2, g.cy - g.h / 2, g.w, g.h, g.r); ctx.fillStyle = C.white; ctx.fill();
    });
  }
}

// ---------- Confetti (the pitch lands) ----------
let CONF = [];
function buildConfetti() {
  const rnd = mulberry32(21);
  const cols = [C.white, C.lightBlue, C.royal, C.midnight, C.sunset, C.white];
  for (let i = 0; i < 170; i++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 2.4;
    const sp = 700 + rnd() * 1100;
    CONF.push({
      x: PC.x + 3 * (PC.w + PC.gap) + PC.w / 2 + (rnd() - 0.5) * 60, y: PC.y + 40,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: 10 + rnd() * 10, h: 6 + rnd() * 6,
      rot: rnd() * TAU, vr: (rnd() - 0.5) * 14, flip: rnd() * TAU, vf: 6 + rnd() * 10,
      col: cols[i % cols.length], t0: 19.5 + rnd() * 0.06, drag: 1.6 + rnd() * 0.8,
    });
  }
}
function confetti(t) {
  if (t < 19.5 || t > 22.2) return;
  for (const p of CONF) {
    const dt = t - p.t0; if (dt < 0) continue;
    // analytic drag + gravity
    const d = p.drag, g = 1400;
    const ex = (1 - Math.exp(-d * dt)) / d;
    const x = p.x + p.vx * ex;
    const y = p.y + p.vy * ex + (g / d) * (dt - ex);
    if (y > H + 40) continue;
    ctx.save();
    ctx.globalAlpha = 1 - P(t, 21.6, 22.2);
    ctx.translate(x, y); ctx.rotate(p.rot + p.vr * dt); ctx.scale(1, Math.cos(p.flip + p.vf * dt));
    ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }
}

// =====================================================================
// S6 · RESOLVE (21 – 29 s): Learn. Try. Share. Build. → the PAYBACK logo
// =====================================================================
const LOGO_S = 0.5;
const LOGO_X = 960 - LOGO.w * LOGO_S / 2, LOGO_Y = 430 - LOGO.h * LOGO_S / 2;
const lx = x => LOGO_X + x * LOGO_S, ly = y => LOGO_Y + y * LOGO_S;
// which row circle goes to which logo circle: Learn→TL, Try→BL, Share→BR, Build→TR (the filled one)
const TARGET = [0, 2, 3, 1];
const WORDS = ['Learn', 'Try', 'Share', 'Build'];
const WORD_T = [21.5, 22.0, 22.5, 23.0];
const FINAL_LINE = 'AI is part of my everyday work';
const FINAL_T0 = 26.05, FINAL_DT = 0.034;
const finalCharT = i => FINAL_T0 + i * FINAL_DT + jit(i + 80) * 0.6;
const FINAL_DOT = 27.25;

function S6(t) {
  const km = eIOQ(P(t, 24.2, 24.85));   // frame closes around the mark
  const kw = P(t, 24.88, 25.0);          // hand-over to the real logo artwork
  // background: blue frame shrinks into the logo's rounded rectangle
  bg(C.lightBlue);
  const [rx0, ry0, rx1, ry1] = LOGO.rect;
  const X0 = lerp(-20, lx(rx0), km), Y0 = lerp(-20, ly(ry0), km);
  const X1 = lerp(W + 20, lx(rx1), km), Y1 = lerp(H + 20, ly(ry1), km);
  const settle = 1 + 0.035 * spring(t, 25.0, 15, 6);
  ctx.save();
  ctx.translate(960, 430); ctx.scale(settle, settle); ctx.translate(-960, -430);
  if (kw < 1) {
    // white border like the supplied logo
    if (km > 0.5) { rrect(X0 - 19.5, Y0 - 19.5, X1 - X0 + 39, Y1 - Y0 + 39, lerp(0, LOGO.rectR * LOGO_S + 19.5, km)); ctx.fillStyle = C.white; ctx.fill(); }
    rrect(X0, Y0, X1 - X0, Y1 - Y0, lerp(0, LOGO.rectR * LOGO_S, km)); ctx.fillStyle = C.blue; ctx.fill();

    // circles
    ROW.forEach((p, i) => {
      const [tx, ty] = LOGO.circles[TARGET[i]];
      const kmi = eIOQ(P(t, 23.7 + (3 - i) * 0.04, 24.4 + (3 - i) * 0.04));
      const x = lerp(p.x, lx(tx), kmi);
      const y = lerp(p.y, ly(ty), kmi);
      const R = lerp(ROW_R, LOGO.ringR * LOGO_S, eIOC(P(t, 23.55, 24.0)));
      const bump = 1 + 0.16 * spring(t, WORD_T[i], 18, 7);
      circle(x, y, R * bump, C.white);
      if (TARGET[i] !== 1) {
        const inner = lerp(0, LOGO.ringR * LOGO_S - LOGO.ringW * LOGO_S, eIOC(P(t, 23.55, 24.1)));
        circle(x, y, inner * bump, C.blue);
      }
    });
    // words
    WORDS.forEach((w, i) => {
      keyword(w, ROW[i].x, 640, 62, C.white, C.lightBlue, t, WORD_T[i] - 0.12, { align: 'center', stagger: 0.025, dur: 0.45, out: 23.55 });
    });
    // wordmark wipes in from the artwork
    const kr = eIOC(P(t, 24.5, 24.95));
    if (kr > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(lx(150), ly(250), (lx(1400) - lx(150)) * kr, 260 * LOGO_S); ctx.clip();
      ctx.drawImage(IMG.logo, LOGO_X, LOGO_Y, LOGO.w * LOGO_S, LOGO.h * LOGO_S);
      ctx.restore();
    }
  }
  if (kw > 0) drawImg(IMG.logo, 0, 0, LOGO_X, LOGO_Y, LOGO_S, 0, kw);
  ctx.restore();

  // shockwave on the logo hit
  if (t > 25.0 && t < 25.8) {
    const k = eOC(P(t, 25.0, 25.8));
    const [cx, cy] = LOGO.circles[1];
    ring(lx(cx), ly(cy), 43 + k * 260, 6 * (1 - k) + 0.5, C.blue, (1 - k) * 0.5);
  }

  // AI Enablement
  keyword('AI Enablement', 960, 760, 96, C.blue, C.red, t, 25.2, { align: 'center', stagger: 0.028, dur: 0.55, ls: -0.03 });
  // typed bookend line — the full stop returns as the dot
  if (t >= FINAL_T0 - 0.35) {
    const size = 40;
    ctx.save();
    ctx.font = font(500, size); ctx.letterSpacing = '0px';
    const wAll = ctx.measureText(FINAL_LINE).width;
    const r = size * 0.1;
    const total = wAll + 4 + 2 * r;
    const x0 = 960 - total / 2, base = 850;
    let shown = '';
    for (let i = 0; i < FINAL_LINE.length; i++) if (t >= finalCharT(i)) shown += FINAL_LINE[i];
    ctx.fillStyle = C.blue; ctx.textBaseline = 'alphabetic';
    ctx.fillText(shown, x0, base);
    const endT = finalCharT(FINAL_LINE.length - 1);
    if (t < FINAL_DOT) {
      const cx = x0 + ctx.measureText(shown).width + 5;
      if (t < endT + 0.05 || Math.floor((t - endT) * 3.2) % 2 === 0) { ctx.fillStyle = C.blue; ctx.fillRect(cx, base - size * 0.8, 4, size * 0.95); }
    } else {
      const k = eOB(P(t, FINAL_DOT, FINAL_DOT + 0.3), 3.5);
      circle(x0 + wAll + 4 + r, base - r, r * k, C.blue);
    }
    ctx.restore();
  }
}

// =====================================================================
function renderFrame(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.letterSpacing = '0px'; ctx.textAlign = 'left';
  if (t < 3.05) S1(t);
  else if (t < 7.0) S2(t);
  else if (t < 10.35) S3(t);
  else if (t < 11.1) {
    // S3 collapses into a single dot of the network
    S4(t);
    const k = eIOQ(P(t, 10.35, 11.1));
    const r = lerp(2300, 11, k);
    ctx.save(); ctx.beginPath(); ctx.arc(ORIGIN.x, ORIGIN.y, r, 0, TAU); ctx.clip();
    S3(t);
    ctx.fillStyle = C.blue; ctx.globalAlpha = eIC(P(t, 10.55, 10.95)); ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  else if (t < 15.0) S4(t);
  else if (t < 21.32) S5(t);
  else S6(t);
  confetti(t);
  finish(t);
  // closing fade
  const f = P(t, 28.45, 29.0);
  if (f > 0) { ctx.save(); ctx.globalAlpha = f; bg(C.lightBlue); ctx.restore(); }
}
window.renderFrame = renderFrame;
})();

// Engraver core: constants, layer ids, seeded random numbers, noise, and the
// small math, stroke and pixel helpers the other parts share.
(function (root) {
'use strict';

// Shared namespace for the engraver parts. W and H are the current plate size;
// makeScene switches to a tall plate for about 4 seeds in 10.
const B = { W: 1500, H: 1000 };

const MARGIN = 40;
const INK = '#1c140d', PAPER = '#ebe1c9', GRAPHITE = 'rgba(70,64,58,0.24)';
// Layer ids live in the red channel of the mask canvas, spaced so antialiased
// edge pixels snap back to a neighbouring layer.
const SKY = 10, FAR = 35, CRAG = 60, CASTLE = 85, VALLEY = 110, WATER = 135, GROUND = 160, ROCK = 185, TREE = 210, LEAF = 235;
const IDS = [SKY, FAR, CRAG, CASTLE, VALLEY, WATER, GROUND, ROCK, TREE, LEAF];
// Replay time per phase and how many hands draw at once: about 60 s of
// drawing, hatching built up light to dark in three passes, then the print.
const PHASES = [
  ['pencil', 12000, 2], ['outline', 6000, 2], ['pass1', 18000, 4], ['pass2', 11000, 4],
  ['pass3', 5000, 4], ['detail', 7000, 3], ['print', 1600, 1],
];
// Pause between strokes, as pixels of travel.
const LIFT = 5;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeNoise(rand) {
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const grad = (h, x, y) => {
    switch (h & 7) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
      case 4: return x; case 5: return -x; case 6: return y; default: return -y;
    }
  };
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  function n2(x, y) {
    const X = Math.floor(x), Y = Math.floor(y);
    x -= X; y -= Y;
    const xi = X & 255, yi = Y & 255, u = fade(x), v = fade(y);
    const a = p[xi] + yi, b = p[xi + 1] + yi;
    const g00 = grad(p[a], x, y), g10 = grad(p[b], x - 1, y);
    const g01 = grad(p[a + 1], x, y - 1), g11 = grad(p[b + 1], x - 1, y - 1);
    const l1 = g00 + u * (g10 - g00), l2 = g01 + u * (g11 - g01);
    return (l1 + v * (l2 - l1)) * 0.7;
  }
  function fbm(x, y, oct = 5) {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += amp * n2(x * f, y * f); norm += amp; amp *= 0.5; f *= 2.03; }
    return s / norm;
  }

  // 2D Simplex Noise (free from grid-axial alignment artifacts)
  const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
  const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
  function s2(x, y) {
    let n0 = 0, n1 = 0, n2_ = 0;
    const s = (x + y) * F2;
    const i = Math.floor(x + s), j = Math.floor(y + s);
    const t = (i + j) * G2;
    const X0 = i - t, Y0 = j - t;
    const x0 = x - X0, y0 = y - Y0;
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2, y2 = y0 - 1.0 + 2.0 * G2;
    const ii = i & 255, jj = j & 255;
    const gi0 = p[ii + p[jj]] % 8;
    const gi1 = p[ii + i1 + p[jj + j1]] % 8;
    const gi2 = p[ii + 1 + p[jj + 1]] % 8;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { t0 *= t0; n0 = t0 * t0 * grad(gi0, x0, y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { t1 *= t1; n1 = t1 * t1 * grad(gi1, x1, y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { t2 *= t2; n2_ = t2 * t2 * grad(gi2, x2, y2); }
    return 70.0 * (n0 + n1 + n2_);
  }
  function fbmS(x, y, oct = 4) {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += amp * s2(x * f, y * f); norm += amp; amp *= 0.5; f *= 2.02; }
    return s / norm;
  }
  // Divergence-Free 2D Curl Noise: preserves fluid streamline continuity without sinks
  function curl(x, y, scale = 0.003, eps = 1.0) {
    const psi_y1 = fbmS(x * scale, (y + eps) * scale);
    const psi_y0 = fbmS(x * scale, (y - eps) * scale);
    const psi_x1 = fbmS((x + eps) * scale, y * scale);
    const psi_x0 = fbmS((x - eps) * scale, y * scale);
    const vx = (psi_y1 - psi_y0) / (2 * eps);
    const vy = -(psi_x1 - psi_x0) / (2 * eps);
    const l = Math.hypot(vx, vy) || 1;
    return [vx / l, vy / l];
  }
  return { n2, fbm, s2, fbmS, curl };
}

const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
// Flat burin held at 45°. Along the blade the cut stays a hairline. Across it, the cut is heavy.
// The two weights average near the old uniform width when strokes point every way.
function burinBite(dx, dy) {
  const across = Math.abs(Math.sin(Math.atan2(dy, dx) - Math.PI / 4));
  return 0.45 + 0.86 * across;
}
// u is 0 at the landing and 1 at the lift. Head and tail are fractions of the stroke.
function taperAt(u, head, tail, headThin, tailThin) {
  const grow = headThin + (1 - headThin) * Math.min(1, head > 0 ? u / head : 1);
  const lift = tailThin + (1 - tailThin) * Math.min(1, tail > 0 ? (1 - u) / tail : 1);
  return grow * lift;
}
// Hands share the end of a phase. Until then, later hands lag so they are not on one clock.
function handLag(i, count, roll) {
  if (count <= 1) return 0;
  return Math.min(0.28, (i / (count - 1)) * 0.16 + roll * 0.08);
}
function handTravel(f, lag) {
  if (f >= 1) return 1;
  if (f <= lag) return 0;
  return (f - lag) / (1 - lag);
}
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const noiseFor = seed => makeNoise(mulberry32((seed ^ 0x9e3779b9) >>> 0));

function freehandStroke(points, opts) {
  const fn = globalThis.getStroke;
  if (typeof fn !== 'function') throw new Error('perfect-freehand is not loaded');
  return fn(points, opts);
}

function fillOutline(c, outline, color) {
  if (!outline || outline.length < 3) return;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) c.lineTo(outline[i][0], outline[i][1]);
  c.closePath();
  c.fill();
}

// Curve smoother: fits cubic Bézier curves (Schneider's method) or Catmull-Rom splines
function smoothPolyline(pts, tension = 0.35, segmentsPerSpan = 4) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let t = 1; t <= segmentsPerSpan; t++) {
      const u = t / segmentsPerSpan, u2 = u * u, u3 = u2 * u;
      const b0 = -tension * u3 + 2 * tension * u2 - tension * u;
      const b1 = (2 - tension) * u3 + (tension - 3) * u2 + 1;
      const b2 = (tension - 2) * u3 + (3 - 2 * tension) * u2 + tension * u;
      const b3 = tension * u3 - tension * u2;
      out.push([b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0], b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1]]);
    }
  }
  return out;
}

// Linear lookup of y on an x-sorted polyline.
function yAt(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] >= x) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

// Road centre and width at s (0 = bottom edge of the plate, 1 = far end).
function roadAt(rd, s) {
  const { H } = B;
  return {
    x: rd.x0 + (rd.x1 - rd.x0) * s + Math.sin(s * Math.PI * rd.k + rd.ph) * rd.amp * (1 - s),
    y: H + 10 + (rd.yEnd - H - 10) * s,
    w: 110 * Math.pow(Math.max(0, 1 - s), 1.3) + 5,
  };
}

const BANDS = [[0.04, 0.5], [0.55, 0.9], [0.75, 1]];
// Pass 0 stays with the form. Pass 1 cuts straight across it. Pass 2 cuts
// across as well, a little off the square, and only in the deepest shadow.
function hatchTurn(pass) {
  if (pass <= 0) return 0;
  return pass === 1 ? Math.PI / 2 : Math.PI / 2 + 0.45;
}

const tick = () => new Promise(res => setTimeout(res, 0));

function facet(x, y, sx, sy, salt) {
  const gx = Math.floor(x / sx), gy = Math.floor(y / sy);
  let d1 = 1e9, d2 = 1e9, id = 0, px = 0, py = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = gx + i, cy = gy + j, h = hash(cx * 1.7 + salt, cy * 3.1);
    const d = Math.hypot(x / sx - cx - hash(cx + salt, cy + 0.5), y / sy - cy - h);
    if (d < d1) { d2 = d1; d1 = d; id = h; px = (cx + hash(cx + salt, cy + 0.5)) * sx; py = (cy + h) * sy; } else if (d < d2) d2 = d;
  }
  return [id, d1, d2, px, py];
}

// Box blur of radius r run twice (close to a gaussian), clamped at the edges.
function blur(src, r) {
  const { W, H } = B;
  let a = Float32Array.from(src), b = new Float32Array(src.length);
  for (let pass = 0; pass < 4; pass++) {
    const horiz = pass % 2 === 0, len = horiz ? W : H, lines = horiz ? H : W;
    for (let l = 0; l < lines; l++) {
      const at = k => (horiz ? l * W + clamp(k, 0, W - 1) : clamp(k, 0, H - 1) * W + l);
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += a[at(k)];
      for (let k = 0; k < len; k++) { b[at(k)] = sum / (2 * r + 1); sum += a[at(k + r + 1)] - a[at(k - r)]; }
    }
    [a, b] = [b, a];
  }
  return a;
}

// Cheap per-pixel hash in [0, 1) for paper grain and ink speckle.
function hash(x, y) { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); }

// Ink darkness is read against the blank grained paper; a 3x3 blur finds nearly
// solid areas, where wet ink runs together. Open hatching keeps its lines.
function inkPrint(d, p) {
  const { W, H } = B;
  const n = W * H, D = new Float32Array(n), ink = [0x1c, 0x14, 0x0d];
  for (let i = 0; i < n; i++) D[i] = clamp((p[i * 4] - d[i * 4]) / Math.max(1, p[i * 4] - ink[0]));
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    // 3x3 weighted convolution for dense area detection
    const b = (4 * D[i] + 2 * (D[i - 1] + D[i + 1] + D[i - W] + D[i + W]) + D[i - W - 1] + D[i - W + 1] + D[i + W - 1] + D[i + W + 1]) / 16;
    const v = Math.max(D[i], smooth(0.6, 0.95, b));
    for (let ch = 0; ch < 3; ch++) d[i * 4 + ch] = p[i * 4 + ch] * (1 - v) + ink[ch] * v;
  }
}

function leafOp(marks, w = 0.7) {
  return c => {
    c.strokeStyle = INK; c.lineWidth = w; c.beginPath();
    for (const [x, y, rr, a] of marks) {
      // Organic calligraphic leaf arc with subtle flare
      c.moveTo(x + Math.cos(a - 1.25) * rr, y + Math.sin(a - 1.25) * rr);
      c.arc(x, y, rr, a - 1.25, a + 1.25);
    }
    c.stroke();
  };
}

function quad(m, [x1, y1, x2, y2, wa, wb]) {
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, px = -dy / l, py = dx / l;
  m.beginPath();
  m.moveTo(x1 + px * wa / 2, y1 + py * wa / 2); m.lineTo(x2 + px * wb / 2, y2 + py * wb / 2);
  m.lineTo(x2 - px * wb / 2, y2 - py * wb / 2); m.lineTo(x1 - px * wa / 2, y1 - py * wa / 2);
  m.closePath();
}

Object.assign(B, {
  MARGIN, INK, PAPER, GRAPHITE, SKY, FAR, CRAG, CASTLE, VALLEY, WATER, GROUND, ROCK, TREE, LEAF,
  IDS, PHASES, LIFT, mulberry32, clamp, burinBite, taperAt, handLag, handTravel, smooth,
  noiseFor, freehandStroke, fillOutline, smoothPolyline, yAt, roadAt, BANDS, hatchTurn, tick,
  facet, blur, hash, inkPrint, leafOp, quad
});
if (typeof module !== 'undefined') module.exports = B; else root.EngraverParts = B;
})(this);

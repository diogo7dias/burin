// Seeded landscape engraver. makeScene(seed) builds plain data; render() paints it
// as hatched ink lines whose width follows a hidden tone map, like a Doré plate.
(function (root) {
'use strict';

const W = 1500, H = 1000, MARGIN = 40;
const INK = '#1c140d', PAPER = '#ebe1c9';
// Layer ids live in the red channel of the mask canvas, spaced so antialiased
// edge pixels snap back to a neighbouring layer.
const SKY = 10, FAR = 35, CRAG = 60, CASTLE = 85, VALLEY = 110, WATER = 135, GROUND = 160, TREE = 190, LEAF = 220;
const IDS = [SKY, FAR, CRAG, CASTLE, VALLEY, WATER, GROUND, TREE, LEAF];

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
  return { n2, fbm };
}

const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const noiseFor = seed => makeNoise(mulberry32((seed ^ 0x9e3779b9) >>> 0));

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

function makeScene(seed) {
  const R = mulberry32(seed >>> 0);
  const r = (a, b) => a + (b - a) * R();
  const chance = p => R() < p;
  const N = noiseFor(seed);
  const off = () => r(0, 1000);
  const line = (x0, x1, step, f) => { const pts = []; for (let x = x0; x <= x1 + 1e-6; x += step) pts.push([x, f(x)]); return pts; };

  const sun = { x: W * r(0.12, 0.88), y: H * r(0.06, 0.3) };
  const waterY = H * r(0.6, 0.7);
  const hasWater = chance(0.75);
  const sky = { dark: r(0.25, 0.55), cloud: r(-0.12, 0.18), stretch: r(2.2, 4), rays: chance(0.7), rayFreq: r(5, 12), rayOff: off(), cloudOff: off() };

  const far = [];
  const nFar = 1 + Math.floor(R() * 3);
  for (let i = 0; i < nFar; i++) {
    const base = waterY - H * r(0.05, 0.16) + i * H * 0.03, amp = H * r(0.03, 0.12), fq = r(0.002, 0.005), o = off();
    far.push({ tone: 0.86 - i * 0.07, pts: line(-20, W + 20, 6, x => Math.min(waterY - 2, base - amp * (0.5 + N.fbm(x * fq, o, 5)))) });
  }

  const crags = [];
  const nCrag = chance(0.35) ? 2 : 1;
  for (let i = 0; i < nCrag; i++) {
    const cx = W * (nCrag === 1 ? r(0.25, 0.75) : i ? r(0.58, 0.85) : r(0.15, 0.42));
    const peak = H * r(0.1, 0.34) + i * H * 0.08;
    const wl = W * r(0.1, 0.26), wr = W * r(0.1, 0.26), k = r(0.5, 1.2), o = off(), jag = H * r(0.025, 0.06);
    const pts = line(cx - wl * 1.15, cx + wr * 1.15, 4, x => {
      const t = (x - cx) / (x < cx ? wl : wr);
      const h = Math.pow(Math.max(0, 1 - Math.abs(t)), k) * (0.75 + 0.5 * N.fbm(x * 0.006, o + 20, 3));
      const j = Math.abs(N.fbm(x * 0.012, o, 4)) * jag * 2 + N.fbm(x * 0.06, o + 50, 2) * jag * 0.4;
      return Math.min(waterY + 4, waterY - (waterY - peak) * h + j * (0.3 + h));
    });
    crags.push({ cx, wl, wr, pts, lit: r(0.72, 0.88), shade: r(0.12, 0.3), castle: null });
  }
  if (chance(0.75)) {
    const crag = crags.reduce((a, b) => (Math.min(...b.pts.map(p => p[1])) < Math.min(...a.pts.map(p => p[1])) ? b : a));
    crag.castle = makeCastle(crag, r, chance, sun.x < crag.cx);
  }

  const gBase = H * r(0.8, 0.9);
  const bankL = chance(0.6) ? H * r(0.08, 0.3) : 0, bankR = chance(0.6) ? H * r(0.08, 0.3) : 0, go = off();
  const ground = line(-20, W + 20, 5, x => {
    const u = x / W;
    const bank = bankL * Math.pow(Math.max(0, 1 - u / 0.4), 2) + bankR * Math.pow(Math.max(0, (u - 0.6) / 0.4), 2);
    return Math.max(waterY + 25, gBase - bank + N.fbm(x * 0.004, go, 5) * H * 0.05);
  });

  const trees = [];
  const roll = R(), nTrees = roll < 0.15 ? 0 : roll < 0.55 ? 1 : roll < 0.9 ? 2 : 3;
  let side = bankL > bankR ? -1 : 1;
  for (let i = 0; i < nTrees; i++) {
    const x = side < 0 ? W * r(0.02, 0.22) : W * r(0.78, 0.98);
    trees.push(makeTree(x, yAt(ground, x), H * r(0.35, 0.72), -side * r(0.05, 0.3), chance(0.55), R, r, N));
    side = -side;
  }

  const birds = [];
  if (chance(0.45)) {
    const bx = W * r(0.2, 0.8), by = H * r(0.12, 0.4), n = 4 + Math.floor(R() * 11);
    for (let i = 0; i < n; i++) birds.push([bx + r(-120, 120), by + r(-50, 50), r(4, 9)]);
  }

  return { seed, W, H, sun, waterY, hasWater, sky, far, crags, ground, trees, birds };
}

// Keep, towers and curtain wall standing on the crag's highest point; ruins get broken tops.
function makeCastle(crag, r, chance, sunLeft) {
  const near = crag.pts.filter(p => Math.abs(p[0] - crag.cx) < Math.min(crag.wl, crag.wr) * 0.5);
  const [px, py] = near.reduce((a, b) => (b[1] < a[1] ? b : a));
  const cw = W * r(0.06, 0.13), ruin = chance(0.3);
  const x0 = px - cw / 2, x1 = px + cw / 2;
  const wallTop = py - H * r(0.015, 0.04);
  const base = (a, b) => { const pts = []; for (let x = b; x > a; x -= 4) pts.push([x, yAt(crag.pts, x) + 14]); pts.push([a, yAt(crag.pts, a) + 14]); return pts; };
  const parts = [];
  const top = (a, b, y, mw) => {
    const pts = [];
    if (ruin) { for (let x = a; x <= b; x += mw) pts.push([x, y + r(0, mw * 2.5)]); pts.push([b, y + r(0, mw * 2)]); return pts; }
    for (let x = a, up = true; x < b; x += mw, up = !up) { const e = Math.min(b, x + mw), yy = up ? y - mw : y; pts.push([x, yy], [e, yy]); }
    return pts;
  };
  const block = (a, b, y, cyl) => {
    const mw = Math.max(3, (b - a) / 7);
    parts.push({ pts: [...top(a, b, y, mw), ...base(a, b)], cyl, tone: cyl ? 0 : r(0.45, 0.7) });
  };
  block(x0, x1, wallTop, false);
  const towers = [];
  const n = 2 + Math.floor(r(0, 4));
  for (let i = 0; i < n; i++) towers.push({ x: px + r(-0.5, 0.5) * cw, w: cw * r(0.1, 0.2), top: wallTop - H * r(0.02, 0.09) });
  towers.push({ x: px + r(-0.15, 0.15) * cw, w: cw * r(0.2, 0.3), top: wallTop - H * r(0.07, 0.14) });
  for (const t of towers) {
    const a = t.x - t.w / 2, b = t.x + t.w / 2;
    const roof = !ruin && chance(0.55);
    if (roof) {
      parts.push({ pts: [[a, t.top], [b, t.top], ...base(a, b)], cyl: true });
      parts.push({ pts: [[a - t.w * 0.12, t.top], [t.x, t.top - t.w * r(0.9, 1.7)], [b + t.w * 0.12, t.top]], cyl: false, tone: 0.22 });
    } else block(a, b, t.top, true);
    const slits = 1 + Math.floor(r(0, 3));
    for (let s = 0; s < slits; s++) {
      const wx = t.x + r(-0.25, 0.25) * t.w, wy = r(t.top + 10, wallTop - 4);
      const ww = ruin ? r(3, 7) : r(2.5, 4), wh = ruin ? r(8, 16) : r(7, 13);
      if (wy + wh < wallTop) parts.push({ pts: [[wx, wy + wh], [wx, wy], [wx + ww, wy], [wx + ww, wy + wh]], cyl: false, tone: 0, window: true });
    }
  }
  return { parts, sunLeft };
}

// Gnarled tree: each branch is a crooked three-part limb that forks until thin.
function makeTree(x, y, height, lean, leafy, R, r, N) {
  const segs = [], clumps = [];
  const blob = (cx, cy, rad) => {
    const o = r(0, 500), pts = [];
    for (let i = 0; i < 64; i++) {
      const a = i / 64 * Math.PI * 2;
      const k = 1 + 0.35 * N.n2(Math.cos(a) * 1.4 + o, Math.sin(a) * 1.4 + o);
      pts.push([cx + Math.cos(a) * rad * k, cy + Math.sin(a) * rad * k * 0.8]);
    }
    return pts;
  };
  function grow(x, y, ang, len, w, depth) {
    let a = ang;
    for (let k = 0; k < 3; k++) {
      a = clamp(a + r(-0.35, 0.35), -Math.PI - 0.3, 0.3);
      const nx = x + Math.cos(a) * len / 3, ny = y + Math.sin(a) * len / 3;
      segs.push([x, y, nx, ny, w * (1 - 0.08 * k), w * (1 - 0.08 * (k + 1))]);
      x = nx; y = ny;
    }
    w *= 0.76;
    if (leafy && depth <= 2) clumps.push(blob(x, y, height * r(0.05, 0.1)));
    if (depth === 0 || w < 1) return;
    const n = R() < 0.35 ? 3 : 2;
    for (let i = 0; i < n; i++) grow(x, y, a + r(-0.9, 0.9) * (i ? 1 : 0.5), len * r(0.62, 0.82), w * r(0.6, 0.8), depth - 1);
  }
  grow(x, y + 8, -Math.PI / 2 + lean, height * r(0.28, 0.38), height * r(0.05, 0.08), leafy ? 5 : 7);
  return { segs, clumps };
}

// Hatch families per layer: angle, spacing, wobble amplitude and frequency.
function hatchGroups(sc) {
  const sunLeft = sc.sun.x < W / 2;
  const cragA = sunLeft ? 1.1 : Math.PI - 1.1;
  return [
    { id: SKY, sp: 4.2, wob: 1.4, wf: 0.004, fams: [0, -0.5, 0.35] },
    { id: FAR, sp: 3.4, wob: 0.6, wf: 0.01, fams: [0.03, 0.6, -0.6] },
    { id: CRAG, sp: 3.6, wob: 2.2, wf: 0.012, fams: [cragA, cragA - 1.2, 0.05] },
    { id: CASTLE, sp: 3, wob: 0.3, wf: 0.02, fams: [Math.PI / 2, 0.35, -0.35] },
    { id: VALLEY, sp: 3.6, wob: 0.8, wf: 0.006, fams: [0, 0.4, -0.4] },
    { id: WATER, sp: 3.2, wob: 0.9, wf: 0.03, fams: [0, 0.06, -0.08] },
    { id: GROUND, sp: 4.4, wob: 3, wf: 0.008, fams: [-0.22, 0.75, -1.1] },
    { id: TREE, sp: 3.2, wob: 1, wf: 0.02, fams: [1.45, 0.5, -0.6] },
    { id: LEAF, sp: 3.8, wob: 3.5, wf: 0.05, fams: [0.7, -0.6, 1.9] },
  ];
}
// Darkness bands: family i starts at d0, reaches full width at d1.
const BANDS = [[0.05, 0.6, 0.6], [0.45, 0.85, 0.45], [0.75, 1, 0.4]];

const tick = () => new Promise(res => setTimeout(res, 0));

async function render(canvas, seed, { onProgress = () => {}, token = {} } = {}) {
  const sc = makeScene(seed), N = noiseFor(seed), R2 = mulberry32((seed + 7919) >>> 0);
  const { sun, waterY, sky } = sc;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const step = async (p) => { onProgress(p); await tick(); return token.cancelled; };

  // 1. Mask: layer id in red, base tone in green.
  const mask = document.createElement('canvas');
  mask.width = W; mask.height = H;
  const m = mask.getContext('2d', { willReadFrequently: true });
  const col = (id, g) => `rgb(${id},${Math.round(clamp(g) * 255)},0)`;
  const poly = (pts, close = true) => { m.beginPath(); pts.forEach(([x, y], i) => (i ? m.lineTo(x, y) : m.moveTo(x, y))); if (close) m.closePath(); m.fill(); };
  const sideGrad = (id, xa, xb, litLeft, lit, shade) => {
    const g = m.createLinearGradient(xa, 0, xb, 0);
    g.addColorStop(0, col(id, litLeft ? lit : shade)); g.addColorStop(1, col(id, litLeft ? shade : lit));
    return g;
  };
  m.fillStyle = col(SKY, 0); m.fillRect(0, 0, W, H);
  for (const f of sc.far) { m.fillStyle = col(FAR, f.tone); poly([...f.pts, [W + 20, waterY + 6], [-20, waterY + 6]]); }
  for (const c of sc.crags) {
    const litLeft = sun.x < c.cx;
    m.fillStyle = sideGrad(CRAG, c.cx - c.wl * 0.25, c.cx + c.wr * 0.25, litLeft, c.lit, c.shade);
    poly([...c.pts, [c.pts[c.pts.length - 1][0], waterY + 6], [c.pts[0][0], waterY + 6]]);
    if (!c.castle) continue;
    for (const p of c.castle.parts) {
      const xs = p.pts.map(q => q[0]), a = Math.min(...xs), b = Math.max(...xs);
      m.fillStyle = p.cyl ? sideGrad(CASTLE, a, b, c.castle.sunLeft, 0.85, 0.3) : col(CASTLE, c.castle.sunLeft === (a + b) / 2 < c.cx ? p.tone + 0.1 : p.tone);
      poly(p.pts);
    }
  }
  m.fillStyle = col(sc.hasWater ? WATER : VALLEY, 0.5); m.fillRect(0, waterY, W, H - waterY);
  m.fillStyle = col(GROUND, 0.42); poly([...sc.ground, [W + 20, H + 20], [-20, H + 20]]);
  for (const t of sc.trees) {
    m.fillStyle = col(TREE, 0.3);
    for (const s of t.segs) if (s[4] >= 4) { quad(m, s); m.fill(); m.beginPath(); m.arc(s[2], s[3], s[5] / 2, 0, 7); m.fill(); }
    m.fillStyle = col(LEAF, 0.2);
    for (const c of t.clumps) poly(c);
  }
  if (await step(0.05)) return false;

  // 2. Tone map: 0 = solid ink, 1 = bare paper.
  const img = m.getImageData(0, 0, W, H).data;
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) lut[v] = IDS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const ids = new Uint8Array(W * H), tone = new Float32Array(W * H);
  const box = {};
  IDS.forEach(id => (box[id] = [W, H, 0, 0]));
  const rays = (x, y) => {
    if (!sky.rays) return 0;
    const dx = x - sun.x, dy = y - sun.y, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx), F = sky.rayFreq;
    const b = smooth(0.0, 0.3, N.n2(Math.cos(a) * F + sky.rayOff, Math.sin(a) * F));
    return (b - 0.4) * 0.5 * smooth(20, 160, d) * Math.exp(-d / (W * 0.9)) * (dy > 0 ? 1 : 0.35);
  };
  const crest = new Float32Array(W);
  for (let x = 0; x < W; x++) crest[x] = yAt(sc.ground, x);
  const cloud = (x, y) => N.fbm(x * 0.0022 + sky.cloudOff, y * 0.0022 * sky.stretch, 5) + sky.cloud + 0.25 * (1 - y / waterY);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, id = lut[img[i * 4]], g = img[i * 4 + 1] / 255;
      ids[i] = id;
      const bx = box[id];
      if (x < bx[0]) bx[0] = x; if (y < bx[1]) bx[1] = y; if (x > bx[2]) bx[2] = x; if (y > bx[3]) bx[3] = y;
      let t;
      const sd = Math.hypot(x - sun.x, y - sun.y), glow = Math.exp(-sd / (W * 0.2));
      switch (id) {
        case SKY: {
          t = sky.dark + (0.97 - sky.dark) * Math.pow(clamp(y / waterY), 0.8) + glow * 0.5;
          const c = cloud(x, y), cover = smooth(0.05, 0.25, c);
          if (cover > 0) {
            const ux = (sun.x - x) / (sd + 1), uy = (sun.y - y) / (sd + 1);
            const edge = c - cloud(x + ux * 10, y + uy * 10);
            t = t * (1 - cover) + cover * clamp(0.28 + edge * 9 + glow * 0.6);
          }
          t += rays(x, y);
          break;
        }
        case FAR: t = g + 0.07 * N.fbm(x * 0.01, y * 0.02, 3) + glow * 0.15 + rays(x, y) * 0.6; break;
        case CRAG: {
          const n = N.fbm(x * 0.008, y * 0.02, 4);
          const relief = n - N.fbm((x + Math.sign(sun.x - x) * 4) * 0.008, (y - 3) * 0.02, 4);
          t = g + relief * 5 + N.n2(x * 0.05, y * 0.004) * 0.12 + 0.25 * smooth(waterY - H * 0.14, waterY, y) + rays(x, y) * 0.35;
          break;
        }
        case CASTLE: t = g + 0.05 * N.n2(x * 0.2, y * 0.2); break;
        case VALLEY: t = 0.8 - 0.3 * (y - waterY) / (H - waterY) + 0.1 * N.fbm(x * 0.005, y * 0.02, 3); break;
        case WATER: t = 0; break;
        case GROUND: t = g + 0.35 * N.fbm(x * 0.006, y * 0.014, 4) + 0.3 * (1 - smooth(0, 40, y - crest[x])) - 0.3 * smooth(H * 0.72, H, y); break;
        case TREE: t = g + 0.15 * N.n2(x * 0.1, y * 0.02); break;
        default: t = g + 0.4 * smooth(0.05, 0.35, N.fbm(x * 0.03, y * 0.03, 3)) * (0.5 + glow);
      }
      tone[i] = clamp(t);
    }
    if (y % 100 === 99 && await step(0.05 + 0.25 * y / H)) return false;
  }
  // Water mirrors everything above the shore line, broken by ripples and glints.
  if (sc.hasWater) {
    for (let y = Math.floor(waterY); y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (ids[i] !== WATER) continue;
        const depth = (y - waterY) / (H - waterY);
        const xs = clamp(Math.round(x + N.n2(x * 0.01, y * 0.08) * 6 * (1 + depth * 4)), 0, W - 1);
        const ys = clamp(Math.round(2 * waterY - y), 0, H - 1);
        const glint = N.n2(x * 0.004, y * 0.06);
        let t = 0.1 + 0.72 * tone[ys * W + xs];
        t += smooth(0.3, 0.5, glint) * 0.35 + Math.exp(-(((x - sun.x) / (W * 0.05)) ** 2)) * clamp(glint) * 0.6;
        tone[i] = clamp(t * (1 - 0.3 * depth));
      }
    }
  }
  if (await step(0.32)) return false;

  // 3. Paper, then hatching: line width swells with darkness.
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = INK;
  const groups = hatchGroups(sc);
  let done = 0;
  for (const gr of groups) {
    const bx = box[gr.id];
    if (bx[2] < bx[0]) { done++; continue; }
    const cx = (bx[0] + bx[2]) / 2, cy = (bx[1] + bx[3]) / 2, hd = Math.hypot(bx[2] - bx[0], bx[3] - bx[1]) / 2 + 4;
    for (let f = 0; f < 3; f++) {
      const a = gr.fams[f], [d0, d1, wmax] = BANDS[f];
      const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca, fo = f * 97 + gr.id;
      const path = new Path2D();
      const flush = run => {
        if (run.length < 6) { run.length = 0; return; }
        path.moveTo(run[0] + nx * run[2] / 2, run[1] + ny * run[2] / 2);
        for (let k = 3; k < run.length; k += 3) path.lineTo(run[k] + nx * run[k + 2] / 2, run[k + 1] + ny * run[k + 2] / 2);
        for (let k = run.length - 3; k >= 0; k -= 3) path.lineTo(run[k] - nx * run[k + 2] / 2, run[k + 1] - ny * run[k + 2] / 2);
        path.closePath();
        run.length = 0;
      };
      for (let o = -hd; o <= hd; o += gr.sp * (0.85 + 0.3 * R2())) {
        const run = [];
        for (let t = -hd; t <= hd; t += 1.6) {
          const wob = gr.wob * N.n2(t * gr.wf + fo, o * 0.05);
          const px = cx + nx * (o + wob) + ca * t, py = cy + ny * (o + wob) + sa * t;
          const ix = px | 0, iy = py | 0;
          let w = 0;
          if (ix >= 0 && iy >= 0 && ix < W && iy < H && ids[iy * W + ix] === gr.id) {
            const d = 1 - tone[iy * W + ix];
            w = gr.sp * wmax * Math.pow(clamp((d - d0) / (d1 - d0)), 0.9);
          }
          if (w >= 0.3) run.push(px, py, w); else flush(run);
        }
        flush(run);
      }
      ctx.fill(path);
    }
    if (await step(0.32 + 0.55 * ++done / groups.length)) return false;
  }

  // 4. Ink outlines and details drawn freehand on top.
  ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let jo = 0;
  const ink = (pts, w, jit = 0.6) => {
    ctx.lineWidth = w; ctx.beginPath(); jo += 13.7;
    pts.forEach(([x, y], i) => {
      const jx = x + N.n2(i * 0.3, jo) * jit, jy = y + N.n2(jo, i * 0.3) * jit;
      i ? ctx.lineTo(jx, jy) : ctx.moveTo(jx, jy);
    });
    ctx.stroke();
  };
  const inkWhere = (pts, w, jit, ok) => {
    let run = [];
    for (const p of pts) {
      const ix = clamp(p[0] | 0, 0, W - 1), iy = clamp(p[1] | 0, 0, H - 1);
      if (ok(ids[iy * W + ix])) run.push(p); else { if (run.length > 1) ink(run, w, jit); run = []; }
    }
    if (run.length > 1) ink(run, w, jit);
  };
  for (const f of sc.far) inkWhere(f.pts.filter(p => p[1] < waterY - 1), 0.8, 0.4, id => id === FAR || id === SKY);
  for (const c of sc.crags) {
    inkWhere(c.pts.filter(p => p[1] < waterY), 1.7, 0.6, id => id === CRAG || id === SKY || id === FAR);
    // Fissures run down from the skyline while they stay on rock.
    const n = 10 + Math.floor(R2() * 16);
    for (let k = 0; k < n; k++) {
      const [sx, sy] = c.pts[Math.floor(R2() * c.pts.length)];
      let x = sx, y = sy + 3, a = Math.PI / 2 + (R2() - 0.5) * 1.2;
      const pts = [[x, y]], len = H * (0.04 + R2() * 0.16);
      for (let s = 0; s < len; s += 4) {
        a += (R2() - 0.5) * 0.5; x += Math.cos(a) * 4; y += Math.sin(a) * 4;
        const ix = x | 0, iy = y | 0;
        if (ix < 0 || iy < 0 || ix >= W || iy >= H || ids[iy * W + ix] !== CRAG) break;
        pts.push([x, y]);
      }
      if (pts.length > 2) ink(pts, 0.6 + R2() * 0.9, 0.3);
    }
    if (c.castle) for (const p of c.castle.parts) {
      if (p.window) { ctx.beginPath(); p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.fill(); }
      else inkWhere(p.pts.filter(q => q[1] <= yAt(c.pts, q[0]) + 2), 1.1, 0.25, id => id === CASTLE || id === SKY || id === CRAG);
    }
  }
  // Shore strokes along the far waterline.
  for (let x = MARGIN; x < W - MARGIN; x += 6 + R2() * 30) {
    const len = 10 + R2() * 60;
    ink([[x, waterY + 1 + R2() * 3], [x + len, waterY + 1 + R2() * 3]], 0.5 + R2() * 0.8, 0.3);
  }
  ink(sc.ground, 1.8);
  // Grass tufts on the near ground's crest.
  for (let x = 0; x < W; x += 2 + R2() * 5) {
    const y = yAt(sc.ground, x) + 2, h = 3 + R2() * 11, a = -Math.PI / 2 + (R2() - 0.5) * 0.9;
    ink([[x, y], [x + Math.cos(a) * h * 0.5 + (R2() - 0.5) * 2, y + Math.sin(a) * h * 0.5], [x + Math.cos(a) * h, y + Math.sin(a) * h]], 0.5 + R2() * 0.6, 0.2);
  }
  for (const t of sc.trees) {
    for (const s of t.segs) {
      if (s[4] < 4) { ink([[s[0], s[1]], [s[2], s[3]]], Math.max(0.7, s[4]), 0.2); continue; }
      const dx = s[2] - s[0], dy = s[3] - s[1], l = Math.hypot(dx, dy) || 1, px = -dy / l, py = dx / l;
      for (const sg of [1, -1]) ink([[s[0] + px * sg * s[4] / 2, s[1] + py * sg * s[4] / 2], [s[2] + px * sg * s[5] / 2, s[3] + py * sg * s[5] / 2]], 1.3, 0.3);
    }
    // Leaf flicks only on the foliage's outer edge.
    for (const c of t.clumps) {
      const cx = c.reduce((a, p) => a + p[0], 0) / c.length, cy = c.reduce((a, p) => a + p[1], 0) / c.length;
      for (const [x, y] of c) {
        const ox = x + (x - cx) * 0.08, oy = y + (y - cy) * 0.08, ix = ox | 0, iy = oy | 0;
        if (ix >= 0 && iy >= 0 && ix < W && iy < H && ids[iy * W + ix] === LEAF) continue;
        const a = Math.atan2(y - cy, x - cx), rr = 3 + R2() * 4;
        ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(x, y, rr, a - 1.3, a + 1.3); ctx.stroke();
      }
    }
  }
  for (const [x, y, s] of sc.birds) {
    ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - s, y);
    ctx.quadraticCurveTo(x - s / 2, y - s / 2, x, y); ctx.quadraticCurveTo(x + s / 2, y - s / 2, x + s, y); ctx.stroke();
  }

  // 5. Plate margin and double rule.
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, MARGIN); ctx.fillRect(0, H - MARGIN, W, MARGIN); ctx.fillRect(0, 0, MARGIN, H); ctx.fillRect(W - MARGIN, 0, MARGIN, H);
  ctx.lineWidth = 1.6; ctx.strokeRect(MARGIN, MARGIN, W - 2 * MARGIN, H - 2 * MARGIN);
  ctx.lineWidth = 0.7; ctx.strokeRect(MARGIN - 8, MARGIN - 8, W - 2 * MARGIN + 16, H - 2 * MARGIN + 16);
  const fox = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.75);
  fox.addColorStop(0, 'rgba(120,85,40,0)'); fox.addColorStop(1, 'rgba(120,85,40,0.16)');
  ctx.fillStyle = fox; ctx.fillRect(0, 0, W, H);
  onProgress(1);
  return true;
}

function quad(m, [x1, y1, x2, y2, wa, wb]) {
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, px = -dy / l, py = dx / l;
  m.beginPath();
  m.moveTo(x1 + px * wa / 2, y1 + py * wa / 2); m.lineTo(x2 + px * wb / 2, y2 + py * wb / 2);
  m.lineTo(x2 - px * wb / 2, y2 - py * wb / 2); m.lineTo(x1 - px * wa / 2, y1 - py * wa / 2);
  m.closePath();
}

const api = { makeScene, render, W, H };
if (typeof module !== 'undefined') module.exports = api; else root.Engraver = api;
})(this);

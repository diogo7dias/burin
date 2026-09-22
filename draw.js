// Seeded landscape engraver. makeScene(seed) builds plain data; render() turns it
// into stroke lists (pencil, ink outline, hatching, details) and replays them
// slowly, so the plate appears the way an engraver would work it.
(function (root) {
'use strict';

const W = 1500, H = 1000, MARGIN = 40;
const INK = '#1c140d', PAPER = '#ebe1c9', GRAPHITE = 'rgba(70,64,58,0.38)';
// Layer ids live in the red channel of the mask canvas, spaced so antialiased
// edge pixels snap back to a neighbouring layer.
const SKY = 10, FAR = 35, CRAG = 60, CASTLE = 85, VALLEY = 110, WATER = 135, GROUND = 160, ROCK = 185, TREE = 210, LEAF = 235;
const IDS = [SKY, FAR, CRAG, CASTLE, VALLEY, WATER, GROUND, ROCK, TREE, LEAF];
// Replay time per phase: about 60 s of drawing, then the print is pulled.
const TIMING = { pencil: 14000, outline: 6000, hatch: 34000, detail: 6000, print: 1600 };

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

// Road centre and width at s (0 = bottom edge of the plate, 1 = far end).
function roadAt(rd, s) {
  return {
    x: rd.x0 + (rd.x1 - rd.x0) * s + Math.sin(s * Math.PI * rd.k + rd.ph) * rd.amp * (1 - s),
    y: H + 10 + (rd.yEnd - H - 10) * s,
    w: 110 * Math.pow(1 - s, 1.3) + 5,
  };
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
    far.push({ tone: 0.8 - i * 0.08, pts: line(-20, W + 20, 6, x => Math.min(waterY - 2, base - amp * (0.5 + N.fbm(x * fq, o, 5)))) });
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

  // A road winding up to the crest, sometimes walked by a pilgrim or two.
  let road = null;
  const rx1 = W * r(0.3, 0.7), ryEnd = yAt(ground, rx1) + 3;
  if (chance(0.5) && H - ryEnd > 60) {
    road = { x0: W * r(0.25, 0.75), x1: rx1, yEnd: ryEnd, amp: W * r(0.03, 0.1), k: r(1, 2.5), ph: off(), walkers: [] };
    if (chance(0.7)) {
      const s = r(0.4, 0.75), n = chance(0.4) ? 2 : 1;
      for (let i = 0; i < n; i++) road.walkers.push({ s: s + i * 0.04, dx: r(-0.2, 0.2) });
    }
  }

  const rocks = [];
  const nRocks = Math.floor(r(2, 9));
  for (let i = 0; i < nRocks; i++) {
    const x = W * r(0.04, 0.96), top = yAt(ground, x);
    if (H - top < 50) continue;
    const y = r(top + 12, H - 15), depth = (y - waterY) / (H - waterY);
    const size = (14 + 60 * depth) * r(0.7, 1.3), flat = r(0.5, 0.75), o = off(), pts = [];
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2, m = 1 + 0.3 * N.n2(Math.cos(a) * 1.2 + o, Math.sin(a) * 1.2 + o);
      pts.push([x + Math.cos(a) * size * m, y + Math.min(Math.sin(a) * size * flat * m, size * 0.25)]);
    }
    rocks.push({ pts, x, y, size });
  }

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

  return { seed, W, H, sun, waterY, hasWater, sky, far, crags, ground, road, rocks, trees, birds };
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
    parts.push({ pts: [...top(a, b, y, mw), ...base(a, b)], cyl, tone: cyl ? 0 : r(0.45, 0.7), masonry: true });
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
      parts.push({ pts: [[a, t.top], [b, t.top], ...base(a, b)], cyl: true, masonry: true });
      const apex = t.top - t.w * r(0.9, 1.7);
      parts.push({ pts: [[a - t.w * 0.12, t.top], [t.x, apex], [b + t.w * 0.12, t.top]], cyl: false, tone: 0.22, flag: chance(0.5) ? [t.x, apex] : null });
    } else block(a, b, t.top, true);
    // Arched windows and slits.
    const slits = 1 + Math.floor(r(0, 3));
    for (let s = 0; s < slits; s++) {
      const wx = t.x + r(-0.25, 0.25) * t.w, wy = r(t.top + 10, wallTop - 4);
      const ww = ruin ? r(3, 7) : r(2.5, 4.5), wh = ruin ? r(8, 16) : r(7, 14);
      if (wy + wh >= wallTop) continue;
      const pts = [[wx, wy + wh]];
      for (let k = 0; k <= 6; k++) { const a = Math.PI + k / 6 * Math.PI; pts.push([wx + ww / 2 + Math.cos(a) * ww / 2, wy + ww / 2 + Math.sin(a) * ww / 2]); }
      pts.push([wx + ww, wy + wh]);
      parts.push({ pts, cyl: false, tone: 0, window: true });
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

// Darkness bands: family i starts at d0, reaches full width at d1.
const BANDS = [[0.04, 0.55, 0.6], [0.42, 0.82, 0.45], [0.72, 1, 0.4]];

const tick = () => new Promise(res => setTimeout(res, 0));

// Replays each phase's ops spread evenly over its time. Waits for a phase the
// producer has not finished; token.skip draws the rest as fast as possible.
function play(ctx, phases, token, onProgress) {
  const total = phases.reduce((a, p) => a + p.ms, 0);
  return new Promise(resolve => {
    let pi = 0, idx = 0, t0 = null, before = 0;
    function frame(now) {
      if (token.cancelled) return resolve(false);
      const started = performance.now();
      while (pi < phases.length) {
        const ph = phases[pi];
        if (!ph.ready) break;
        if (t0 === null) t0 = now;
        const n = ph.ops.length;
        const target = token.skip ? n : Math.min(n, Math.ceil(n * (now - t0) / ph.ms));
        while (idx < target) {
          ph.ops[idx++](ctx);
          if (token.skip && (idx & 63) === 0 && performance.now() - started > 40) break;
        }
        onProgress((before + ph.ms * (n ? idx / n : 1)) / total);
        if (idx < n) break;
        before += ph.ms; pi++; idx = 0; t0 = now;
      }
      if (pi >= phases.length) return resolve(true);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

async function render(canvas, seed, { onProgress = () => {}, token = {} } = {}) {
  const sc = makeScene(seed), N = noiseFor(seed), R2 = mulberry32((seed + 7919) >>> 0);
  const { sun, waterY, sky } = sc;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  const fox = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.75);
  fox.addColorStop(0, 'rgba(120,85,40,0)'); fox.addColorStop(1, 'rgba(120,85,40,0.16)');
  ctx.fillStyle = fox; ctx.fillRect(0, 0, W, H);
  const paper = ctx.getImageData(0, 0, W, H);
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i += 4) {
    const k = 1 - 0.035 * hash(x, y) - 0.025 * (N.n2(x * 0.35, y * 0.02) + 0.5);
    paper.data[i] *= k; paper.data[i + 1] *= k; paper.data[i + 2] *= k;
  }
  ctx.putImageData(paper, 0, 0);
  ctx.save(); ctx.beginPath(); ctx.rect(MARGIN, MARGIN, W - 2 * MARGIN, H - 2 * MARGIN); ctx.clip();

  const [pencilOps, outlineOps, hatchOps, detailOps] = ['pencil', 'outline', 'hatch', 'detail'].map(() => []);
  const printOps = [];
  const phases = [pencilOps, outlineOps, hatchOps, detailOps, printOps].map((ops, i) => ({ ops, ms: Object.values(TIMING)[i], ready: false }));
  const player = play(ctx, phases, token, onProgress);

  // Op builders. Long lines are cut into short pieces so they draw progressively.
  let jo = 0;
  const jitter = (pts, jit) => { jo += 13.7; return pts.map(([x, y], i) => [x + N.n2(i * 0.3, jo) * jit, y + N.n2(jo, i * 0.3) * jit]); };
  const strokeOp = (pts, w, color) => c => {
    c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
  };
  const lineOps = (list, pts, w, color, jit, chunk = 8) => {
    if (pts.length < 2) return;
    const j = jitter(pts, jit);
    for (let i = 0; i < j.length - 1; i += chunk) list.push(strokeOp(j.slice(i, i + chunk + 1), w, color));
  };
  const segsOp = (segs, w) => c => {
    c.strokeStyle = INK; c.lineWidth = w; c.lineCap = 'round'; c.beginPath();
    for (const s of segs) { c.moveTo(s[0], s[1]); for (let k = 2; k < s.length; k += 2) c.lineTo(s[k], s[k + 1]); }
    c.stroke();
  };
  const fillOp = pts => c => { c.fillStyle = INK; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); };
  const closed = pts => [...pts, pts[0]];
  const every = (pts, n) => pts.filter((_, i) => i % n === 0 || i === pts.length - 1);

  // 1. Pencil underdrawing straight from the scene geometry.
  const pencil = (pts, chunk = 5) => lineOps(pencilOps, pts, 0.9, GRAPHITE, 1.2, chunk);
  pencil([[MARGIN, waterY], [W / 2, waterY + 1], [W - MARGIN, waterY]], 1);
  for (const f of sc.far) pencil(every(f.pts, 2));
  for (const c of sc.crags) {
    pencil(every(c.pts, 2));
    if (c.castle) for (const p of c.castle.parts) if (!p.window) pencil(closed(p.pts), 3);
  }
  pencil(every(sc.ground, 2));
  if (sc.road) for (const side of [-0.5, 0.5]) {
    const pts = [];
    for (let s = 0; s <= 1.0001; s += 0.04) { const q = roadAt(sc.road, s); pts.push([q.x + side * q.w, q.y]); }
    pencil(pts, 3);
  }
  for (const rk of sc.rocks) pencil(closed(every(rk.pts, 2)), 3);
  for (const t of sc.trees) {
    for (const s of t.segs) if (s[4] > 2) pencil([[s[0], s[1]], [s[2], s[3]]], 1);
    for (const c of t.clumps) pencil(closed(every(c, 4)), 4);
  }
  phases[0].ready = true;
  await tick();
  if (token.cancelled) return player;

  // 2. Mask: layer id in red, base tone in green.
  const mask = document.createElement('canvas');
  mask.width = W; mask.height = H;
  const m = mask.getContext('2d', { willReadFrequently: true });
  const col = (id, g, b = 0) => `rgb(${id},${Math.round(clamp(g) * 255)},${b})`;
  const poly = pts => { m.beginPath(); pts.forEach(([x, y], i) => (i ? m.lineTo(x, y) : m.moveTo(x, y))); m.closePath(); m.fill(); };
  const sideGrad = (id, xa, xb, litLeft, lit, shade) => {
    const g = m.createLinearGradient(xa, 0, xb, 0);
    g.addColorStop(0, col(id, litLeft ? lit : shade)); g.addColorStop(1, col(id, litLeft ? shade : lit));
    return g;
  };
  m.fillStyle = col(SKY, 0); m.fillRect(0, 0, W, H);
  for (const f of sc.far) { m.fillStyle = col(FAR, f.tone); poly([...f.pts, [W + 20, waterY + 6], [-20, waterY + 6]]); }
  for (const c of sc.crags) {
    m.fillStyle = sideGrad(CRAG, c.cx - c.wl * 0.25, c.cx + c.wr * 0.25, sun.x < c.cx, c.lit, c.shade);
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
  for (const rk of sc.rocks) {
    const g = m.createLinearGradient(0, rk.y - rk.size * 0.7, 0, rk.y + rk.size * 0.3);
    g.addColorStop(0, col(ROCK, 0.85)); g.addColorStop(1, col(ROCK, 0.12));
    m.fillStyle = g; poly(rk.pts);
  }
  for (const t of sc.trees) {
    for (const s of t.segs) if (s[4] >= 4) {
      let a = Math.atan2(s[3] - s[1], s[2] - s[0]);
      if (a < 0) a += Math.PI;
      m.fillStyle = col(TREE, 0.28, Math.round(a / Math.PI * 255));
      quad(m, s); m.fill(); m.beginPath(); m.arc(s[2], s[3], s[5] / 2, 0, 7); m.fill(); }
    m.fillStyle = col(LEAF, 0.2);
    for (const c of t.clumps) poly(c);
  }
  const img = m.getImageData(0, 0, W, H).data;
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) lut[v] = IDS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const ids = new Uint8Array(W * H), tone = new Float32Array(W * H), box = {};
  IDS.forEach(id => (box[id] = [W, H, 0, 0]));
  for (let i = 0, n = W * H; i < n; i++) ids[i] = lut[img[i * 4]];
  const idAt = (x, y) => ids[clamp(y | 0, 0, H - 1) * W + clamp(x | 0, 0, W - 1)];

  // 3. Ink outlines of the main forms, split wherever a nearer layer covers them.
  const inkWhere = (list, pts, w, jit, ok) => {
    let run = [];
    for (const p of pts) {
      if (ok(idAt(p[0], p[1]))) run.push(p); else { lineOps(list, run, w, INK, jit); run = []; }
    }
    lineOps(list, run, w, INK, jit);
  };
  for (const f of sc.far) inkWhere(outlineOps, f.pts.filter(p => p[1] < waterY - 1), 0.7, 0.4, id => id === FAR || id === SKY);
  for (const c of sc.crags) {
    inkWhere(outlineOps, c.pts.filter(p => p[1] < waterY), 1.7, 0.6, id => id === CRAG || id === SKY || id === FAR);
    if (c.castle) for (const p of c.castle.parts) {
      if (!p.window) inkWhere(outlineOps, p.pts.filter(q => q[1] <= yAt(c.pts, q[0]) + 2), 1.1, 0.25, id => id === CASTLE || id === SKY || id === CRAG);
    }
  }
  inkWhere(outlineOps, sc.ground, 1.8, 0.6, id => id !== TREE && id !== LEAF);
  for (const rk of sc.rocks) inkWhere(outlineOps, closed(rk.pts), 1.4, 0.5, id => id !== TREE && id !== LEAF);
  for (const t of sc.trees) {
    for (const s of t.segs) {
      if (s[4] < 4) { lineOps(outlineOps, [[s[0], s[1]], [s[2], s[3]]], Math.max(0.7, s[4]), INK, 0.2); continue; }
      const dx = s[2] - s[0], dy = s[3] - s[1], l = Math.hypot(dx, dy) || 1, px = -dy / l, py = dx / l;
      for (const sg of [1, -1]) lineOps(outlineOps, [[s[0] + px * sg * s[4] / 2, s[1] + py * sg * s[4] / 2], [s[2] + px * sg * s[5] / 2, s[3] + py * sg * s[5] / 2]], 1.3, INK, 0.3);
    }
  }
  phases[1].ready = true;
  await tick();
  if (token.cancelled) return player;

  // 4. Tone map: 0 = solid ink, 1 = bare paper.
  const rays = (x, y) => {
    if (!sky.rays) return 0;
    const dx = x - sun.x, dy = y - sun.y, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx), F = sky.rayFreq;
    const b = smooth(0.0, 0.3, N.n2(Math.cos(a) * F + sky.rayOff, Math.sin(a) * F));
    return (b - 0.4) * 0.5 * smooth(20, 160, d) * Math.exp(-d / (W * 0.9)) * (dy > 0 ? 1 : 0.35);
  };
  const crest = new Float32Array(W);
  for (let x = 0; x < W; x++) crest[x] = yAt(sc.ground, x);
  const roadX = new Float32Array(H).fill(-1e4), roadW = new Float32Array(H);
  if (sc.road) for (let s = 0; s <= 1; s += 0.0005) { const q = roadAt(sc.road, s), y = q.y | 0; if (y >= 0 && y < H) { roadX[y] = q.x; roadW[y] = q.w; } }
  const cloud = (x, y) => N.fbm(x * 0.0022 + sky.cloudOff, y * 0.0022 * sky.stretch, 5) + sky.cloud + 0.25 * (1 - y / waterY);
  const mist = y => smooth(waterY - H * 0.12, waterY, y);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, id = ids[i], g = img[i * 4 + 1] / 255;
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
        case FAR: t = g + 0.07 * N.fbm(x * 0.01, y * 0.02, 3) + glow * 0.15 + rays(x, y) * 0.6 + 0.15 * mist(y); break;
        case CRAG: {
          const n = N.fbm(x * 0.008, y * 0.02, 4);
          const relief = n - N.fbm((x + Math.sign(sun.x - x) * 4) * 0.008, (y - 3) * 0.02, 4);
          // Bedding planes: tilted dark bands that read as layered rock.
          const strata = smooth(0.2, 0.45, N.n2(x * 0.01, y * 0.05 + N.n2(x * 0.004, y * 0.004) * 3));
          t = g + relief * 4 + N.n2(x * 0.05, y * 0.004) * 0.12 - strata * 0.28 + 0.35 * mist(y) + rays(x, y) * 0.35;
          break;
        }
        case CASTLE: t = g + 0.05 * N.n2(x * 0.2, y * 0.2) + 0.15 * mist(y); break;
        case VALLEY: t = 0.8 - 0.3 * (y - waterY) / (H - waterY) + 0.1 * N.fbm(x * 0.005, y * 0.02, 3); break;
        case WATER: t = 0; break;
        case GROUND: {
          t = g + 0.35 * N.fbm(x * 0.006, y * 0.014, 4) + 0.3 * (1 - smooth(0, 40, y - crest[x])) - 0.35 * smooth(H * 0.72, H, y);
          const dx = Math.abs(x - roadX[y]), w = roadW[y];
          if (dx < w / 2) t = 0.78 + 0.12 * N.n2(x * 0.05, y * 0.05) - 0.45 * smooth(w * 0.3, w * 0.5, dx);
          break;
        }
        case ROCK: t = g + 1.2 * (N.fbm(x * 0.03, y * 0.03, 3) - N.fbm((x + Math.sign(sun.x - x) * 3) * 0.03, (y - 3) * 0.03, 3)); break;
        case TREE: t = g + 0.15 * N.n2(x * 0.1, y * 0.02); break;
        default: t = g + 0.4 * smooth(0.05, 0.35, N.fbm(x * 0.03, y * 0.03, 3)) * (0.5 + glow);
      }
      tone[i] = clamp(t);
    }
    if (y % 60 === 59) { await tick(); if (token.cancelled) return player; }
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
  await tick();
  if (token.cancelled) return player;

  // 5. Hatching along evenly spaced streamlines (Jobard-Lefer, via @anvaka/streamlines).
  // Each layer has a direction field that follows its form, the way a burin
  // follows a surface: fall lines down rock, lines curling round cloud bellies,
  // along trunks, round boulders. Width swells with darkness; crosshatch
  // families only run where the tone is dark enough to need them.
  const G4 = 4, GW = Math.ceil(W / G4) + 2, GH = Math.ceil(H / G4) + 2, cg = new Float32Array(GW * GH);
  // Smoothed cloud field: only the big cloud forms steer the sky lines.
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const x = gx * G4, y = gy * G4;
    cg[gy * GW + gx] = N.fbm(x * 0.0022 + sky.cloudOff, y * 0.0022 * sky.stretch, 3) + sky.cloud + 0.25 * (1 - y / waterY);
  }
  const cloudS = (x, y) => {
    const fx = clamp(x / G4, 0, GW - 1.001), fy = clamp(y / G4, 0, GH - 1.001), ix = fx | 0, iy = fy | 0, u = fx - ix, v = fy - iy, i = iy * GW + ix;
    return (cg[i] * (1 - u) + cg[i + 1] * u) * (1 - v) + (cg[i + GW] * (1 - u) + cg[i + GW + 1] * u) * v;
  };
  const nearest = (list, x, y) => list.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a));
  const cragC = sc.crags.map(c => ({ x: c.cx, y: 0 }));
  const dirs = {
    [SKY]: (x, y) => {
      let tx = cloudS(x, y + 16) - cloudS(x, y - 16), ty = cloudS(x - 16, y) - cloudS(x + 16, y);
      if (tx < 0) { tx = -tx; ty = -ty; }
      const l = Math.hypot(tx, ty) || 1, k = 0.35 * smooth(0, 0.3, cloudS(x, y));
      return [1 - k + k * tx / l, k * ty / l];
    },
    [FAR]: (x, y) => [1, 0.15 * N.n2(x * 0.005, y * 0.01)],
    [CRAG]: (x, y) => [Math.tanh((x - nearest(cragC, x, y).x) / 40) * 0.6 + 0.6 * N.n2(x * 0.008, y * 0.008), 1],
    [CASTLE]: () => [0, 1],
    [VALLEY]: (x, y) => [1, 0.1 * N.n2(x * 0.004, y * 0.02)],
    [WATER]: (x, y) => [1, 0.08 * N.n2(x * 0.02, y * 0.1)],
    [GROUND]: (x, y) => {
      const xi = clamp(x | 0, 6, W - 7), slope = (crest[xi + 6] - crest[xi - 6]) / 12;
      return [1, slope * Math.exp(-Math.max(0, y - crest[xi]) / 120) + 0.25 * N.n2(x * 0.004, y * 0.01)];
    },
    [ROCK]: (x, y) => { const rk = nearest(sc.rocks, x, y); return [(x - rk.x) / rk.size * 0.9, 1]; },
    [TREE]: (x, y) => { const a = img[((y | 0) * W + (x | 0)) * 4 + 2] / 255 * Math.PI; return [Math.cos(a), Math.sin(a)]; },
    [LEAF]: (x, y) => { const a = N.fbm(x * 0.008, y * 0.008, 2) * 6; return [Math.cos(a), Math.sin(a)]; },
  };
  const groups = [
    { id: SKY, sp: 3.4, wk: 1, rot: [0, 0.3, -0.25] },
    { id: FAR, sp: 2.6, wk: 0.7, rot: [0, 0.6, -0.6] },
    { id: CRAG, sp: 2.9, wk: 1, rot: [0, Math.PI / 2, -0.5] },
    { id: CASTLE, sp: 2.3, wk: 0.9, rot: [0, Math.PI / 2, 0.6] },
    { id: VALLEY, sp: 3, wk: 0.9, rot: [0, 0.4, -0.4] },
    { id: WATER, sp: 2.7, wk: 1, rot: [0, 0.12, -0.12] },
    { id: GROUND, sp: 3.6, wk: 0.9, rot: [0, 0.35, -0.3] },
    { id: ROCK, sp: 2.6, wk: 1, rot: [0, Math.PI / 2, 0.6] },
    { id: TREE, sp: 2.6, wk: 1, rot: [0, Math.PI / 2, 0.6] },
    { id: LEAF, sp: 3, wk: 1, rot: [0, 1.2, -1] },
  ];
  const runOp = poly => c => {
    c.fillStyle = INK; c.beginPath(); c.moveTo(poly[0], poly[1]);
    for (let k = 2; k < poly.length; k += 2) c.lineTo(poly[k], poly[k + 1]);
    c.closePath(); c.fill();
  };
  // Run = flat [x, y, width, ...]; outline both sides, tapering the ends like a burin cut.
  const runPoly = run => {
    const n = run.length / 3, poly = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) {
      const a = Math.max(0, k - 1) * 3, b = Math.min(n - 1, k + 1) * 3;
      const dx = run[b] - run[a], dy = run[b + 1] - run[a + 1], l = Math.hypot(dx, dy) || 1;
      const taper = Math.min(1, (k + 1) / 4, (n - k) / 4);
      const hw = run[k * 3 + 2] * taper / 2, nx = -dy / l * hw, ny = dx / l * hw;
      poly[k * 2] = run[k * 3] + nx; poly[k * 2 + 1] = run[k * 3 + 1] + ny;
      poly[(2 * n - 1 - k) * 2] = run[k * 3] - nx; poly[(2 * n - 1 - k) * 2 + 1] = run[k * 3 + 1] - ny;
    }
    return poly;
  };
  const SL = root.streamlines && root.streamlines.default;
  if (!SL) throw new Error('Streamline library failed to load.');
  for (const gr of groups) {
    const bx = box[gr.id], dir = dirs[gr.id];
    if (bx[2] < bx[0] || (gr.id === ROCK && !sc.rocks.length)) continue;
    for (let f = 0; f < 3; f++) {
      const [d0, d1, wmax] = BANDS[f], cr = Math.cos(gr.rot[f]), sr = Math.sin(gr.rot[f]);
      const ok = (x, y) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return -1;
        const i = (y | 0) * W + (x | 0);
        return ids[i] === gr.id && 1 - tone[i] >= d0 ? i : -1;
      };
      const seeds = [];
      for (let y = bx[1]; y <= bx[3]; y += 9) for (let x = bx[0]; x <= bx[2]; x += 9) {
        const sx = x + R2() * 8, sy = y + R2() * 8;
        if (ok(sx, sy) >= 0) seeds.push({ x: sx, y: sy });
      }
      if (!seeds.length) continue;
      // The library stops once no line offers a free neighbour, even with seeds
      // left; restart it on the leftover seeds with every earlier point
      // pre-loaded into its spacing grid.
      const lines = [], placed = [];
      let pending = seeds;
      while (pending.length && !token.cancelled) {
        const job = SL({
          vectorField: p => {
            if (ok(p.x, p.y) < 0) return;
            const [dx, dy] = dir(p.x, p.y);
            return { x: dx * cr - dy * sr, y: dx * sr + dy * cr };
          },
          boundingBox: { left: bx[0] - 2, top: bx[1] - 2, width: bx[2] - bx[0] + 4, height: bx[3] - bx[1] + 4 },
          seed: pending, dSep: gr.sp, dTest: gr.sp * 0.55, timeStep: 1.6,
          stepsPerIteration: 400, maxTimePerIteration: 14,
          onStreamlineAdded: pts => { if (token.cancelled) job.dispose(); else { lines.push(pts.map(p => [p.x, p.y])); placed.push(...pts); } },
        });
        const grid = job.getGrid();
        for (const q of placed) grid.occupyCoordinates(q);
        await job.run();
        pending = pending.filter(q => !grid.isTaken(q.x, q.y, d => d < gr.sp));
      }
      if (token.cancelled) return player;
      // Split each streamline where the tone is too light to cut, then queue top to bottom.
      const ops = [];
      for (const pts of lines) {
        let run = [];
        const cut = () => { if (run.length >= 6) ops.push([run[1], runOp(runPoly(run))]); run = []; };
        for (const [x, y] of pts) {
          const i = ok(x, y);
          const w = i < 0 ? 0 : gr.sp * gr.wk * wmax * Math.pow(clamp((1 - tone[i] - d0) / (d1 - d0)), 0.9);
          if (w >= 0.25) run.push(x, y, w); else cut();
        }
        cut();
      }
      ops.sort((a, b) => a[0] - b[0]);
      for (const [, op] of ops) hatchOps.push(op);
    }
  }
  phases[2].ready = true;

  // 6. Details: fissures, masonry, leaves, grass, figures, birds, plate rule.
  for (const c of sc.crags) {
    const n = 20 + Math.floor(R2() * 26);
    for (let k = 0; k < n; k++) {
      const [sx, sy] = c.pts[Math.floor(R2() * c.pts.length)];
      let x = sx, y = sy + 3, a = Math.PI / 2 + (R2() - 0.5) * 1.2;
      const pts = [[x, y]], len = H * (0.04 + R2() * 0.2);
      for (let s = 0; s < len; s += 4) {
        a += (R2() - 0.5) * 0.5; x += Math.cos(a) * 4; y += Math.sin(a) * 4;
        if (idAt(x, y) !== CRAG) break;
        pts.push([x, y]);
      }
      lineOps(detailOps, pts, 0.5 + R2() * 1.0, INK, 0.3, 6);
    }
    if (!c.castle) continue;
    for (const p of c.castle.parts) {
      if (p.window) { detailOps.push(fillOp(p.pts)); continue; }
      if (p.flag) {
        const [fx, fy] = p.flag, dir = sun.x < fx ? 1 : -1;
        detailOps.push(segsOp([[fx, fy, fx, fy - 14]], 0.9), fillOp([[fx, fy - 14], [fx + dir * 11, fy - 11 + R2() * 2], [fx, fy - 8]]));
      }
      if (!p.masonry) continue;
      // Stone courses show only on the lit face.
      const xs = p.pts.map(q => q[0]), ys = p.pts.map(q => q[1]);
      const a = Math.min(...xs), b = Math.max(...xs), segs = [];
      for (let y = Math.min(...ys) + 4; y < Math.max(...ys); y += 5 + R2()) {
        for (let x = a + R2() * 6; x < b; x += 6 + R2() * 10) {
          const e = Math.min(b, x + 4 + R2() * 8), mx = (x + e) / 2;
          if (R2() < 0.7 && idAt(mx, y) === CASTLE && tone[(y | 0) * W + (mx | 0)] > 0.45) segs.push([x, y, e, y + R2() - 0.5]);
        }
      }
      if (segs.length) detailOps.push(segsOp(segs, 0.45));
    }
  }
  for (const rk of sc.rocks) {
    const [sx, sy] = rk.pts[Math.floor(R2() * 12)];
    lineOps(detailOps, [[sx, sy], [sx + (rk.x - sx) * 0.4, sy + rk.size * 0.3], [sx + (rk.x - sx) * 0.6, sy + rk.size * 0.5]], 0.8, INK, 0.3);
  }
  // Leaves: small open loops on lit foliage, scallops along the outer edge.
  for (const t of sc.trees) {
    for (const cl of t.clumps) {
      const xs = cl.map(p => p[0]), ys = cl.map(p => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      let batch = [];
      for (let y = y0; y < y1; y += 6) for (let x = x0; x < x1; x += 6) {
        const lx = x + R2() * 5, ly = y + R2() * 5;
        if (lx < 0 || ly < 0 || lx >= W || ly >= H || idAt(lx, ly) !== LEAF || tone[(ly | 0) * W + (lx | 0)] < 0.3) continue;
        batch.push([lx, ly, 1.8 + R2() * 1.6, Math.atan2(ly - sun.y, lx - sun.x)]);
        if (batch.length === 25) { detailOps.push(leafOp(batch)); batch = []; }
      }
      if (batch.length) detailOps.push(leafOp(batch));
      const cx = xs.reduce((a, v) => a + v, 0) / xs.length, cy = ys.reduce((a, v) => a + v, 0) / ys.length, edge = [];
      for (const [x, y] of cl) {
        if (idAt(x + (x - cx) * 0.08, y + (y - cy) * 0.08) === LEAF) continue;
        edge.push([x, y, 3 + R2() * 4, Math.atan2(y - cy, x - cx)]);
      }
      if (edge.length) detailOps.push(leafOp(edge, 0.9));
    }
  }
  // Grass: tufts of curved blades along the crest.
  for (let x = 0; x < W; x += 3 + R2() * 6) {
    const y = yAt(sc.ground, x) + 2;
    if (idAt(x, y + 3) !== GROUND) continue;
    const blades = [];
    for (let b = 0, nb = 2 + Math.floor(R2() * 3); b < nb; b++) {
      const h = 4 + R2() * 13, a = -Math.PI / 2 + (R2() - 0.5) * 1.1, bx = x + (R2() - 0.5) * 4;
      blades.push([bx, y, bx + Math.cos(a) * h * 0.5, y + Math.sin(a) * h * 0.5, bx + Math.cos(a + 0.3) * h, y + Math.sin(a + 0.3) * h]);
    }
    detailOps.push(segsOp(blades, 0.6));
  }
  // Pilgrims on the road: cloak, head, staff and a short cast shadow.
  if (sc.road) for (const wk of sc.road.walkers) {
    const q = roadAt(sc.road, wk.s), fx = q.x + wk.dx * q.w, fy = q.y, h = 46 * (1 - wk.s) + 10, sd = sun.x < fx ? 1 : -1;
    detailOps.push(c => {
      c.fillStyle = INK; c.beginPath();
      c.moveTo(fx - h * 0.11, fy - h * 0.78);
      c.quadraticCurveTo(fx - h * 0.2, fy - h * 0.3, fx - h * 0.19, fy);
      c.lineTo(fx + h * 0.17, fy);
      c.quadraticCurveTo(fx + h * 0.16, fy - h * 0.4, fx + h * 0.1, fy - h * 0.78);
      c.closePath(); c.fill();
      c.beginPath(); c.arc(fx, fy - h * 0.88, h * 0.09, 0, 7); c.fill();
      c.strokeStyle = INK; c.lineWidth = Math.max(0.8, h * 0.025);
      c.beginPath(); c.moveTo(fx + h * 0.26, fy + 1); c.lineTo(fx + h * 0.21, fy - h * 1.05); c.stroke();
      c.lineWidth = 0.7; c.beginPath();
      for (let k = 0; k < 4; k++) { c.moveTo(fx + sd * h * 0.05, fy + k * 1.6); c.lineTo(fx + sd * h * (0.55 - k * 0.08), fy + k * 1.6); }
      c.stroke();
    });
  }
  for (const [x, y, s] of sc.birds) {
    detailOps.push(c => {
      c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x - s, y);
      c.quadraticCurveTo(x - s / 2, y - s / 2, x, y); c.quadraticCurveTo(x + s / 2, y - s / 2, x + s, y); c.stroke();
    });
  }
  detailOps.push(c => {
    c.restore();
    c.strokeStyle = INK;
    c.lineWidth = 1.6; c.strokeRect(MARGIN, MARGIN, W - 2 * MARGIN, H - 2 * MARGIN);
    c.lineWidth = 0.7; c.strokeRect(MARGIN - 8, MARGIN - 8, W - 2 * MARGIN + 16, H - 2 * MARGIN + 16);
    c.fillStyle = INK; c.font = 'italic 17px "IM Fell English", Georgia, serif'; c.textAlign = 'right';
    c.fillText(`Pl. ${seed}`, W - MARGIN, H - 12);
  });
  phases[3].ready = true;

  // 7. Pull the print: ink spreads into the paper, filling hairline gaps in
  // dense shading, and solid blacks pick up tiny paper speckles. Fades in.
  let before, after;
  printOps.push(c => {
    before = document.createElement('canvas'); before.width = W; before.height = H;
    before.getContext('2d').drawImage(canvas, 0, 0);
    after = document.createElement('canvas'); after.width = W; after.height = H;
    const out = c.getImageData(0, 0, W, H);
    inkPrint(out.data, paper.data);
    after.getContext('2d').putImageData(out, 0, 0);
  });
  for (let k = 1; k <= 30; k++) printOps.push(c => { c.globalAlpha = 1; c.drawImage(before, 0, 0); c.globalAlpha = k / 30; c.drawImage(after, 0, 0); c.globalAlpha = 1; });
  phases[4].ready = true;
  return player;
}

// Cheap per-pixel hash in [0, 1) for paper grain and ink speckle.
function hash(x, y) { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); }

// Ink darkness is read against the blank grained paper; a 3x3 blur finds dense
// areas, where ink is allowed to spread. Thin isolated lines keep their weight.
function inkPrint(d, p) {
  const n = W * H, D = new Float32Array(n), ink = [0x1c, 0x14, 0x0d];
  for (let i = 0; i < n; i++) D[i] = clamp((p[i * 4] - d[i * 4]) / Math.max(1, p[i * 4] - ink[0]));
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const b = (4 * D[i] + 2 * (D[i - 1] + D[i + 1] + D[i - W] + D[i + W]) + D[i - W - 1] + D[i - W + 1] + D[i + W - 1] + D[i + W + 1]) / 16;
    let v = Math.max(D[i], smooth(0.4, 0.8, b));
    if (v > 0.9 && hash(x * 0.5, y * 0.5) > 0.93) v *= 0.55;
    for (let ch = 0; ch < 3; ch++) d[i * 4 + ch] = p[i * 4 + ch] * (1 - v) + ink[ch] * v;
  }
}

// Leaf marks: open loops facing away from the light.
function leafOp(marks, w = 0.7) {
  return c => {
    c.strokeStyle = INK; c.lineWidth = w; c.beginPath();
    for (const [x, y, rr, a] of marks) { c.moveTo(x + Math.cos(a - 1.3) * rr, y + Math.sin(a - 1.3) * rr); c.arc(x, y, rr, a - 1.3, a + 1.3); }
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

const api = { makeScene, render, W, H };
if (typeof module !== 'undefined') module.exports = api; else root.Engraver = api;
})(this);

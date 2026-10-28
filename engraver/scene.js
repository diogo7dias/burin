// Scene data: the seed picks a scene type, then its geometry. Plain data only.
(function (root) {
'use strict';

const node = typeof module !== 'undefined';
const B = node ? require('./core.js') : root.EngraverParts;
if (node) { require('./shapes.js'); }
const {
  mulberry32, noiseFor, yAt, roadAt, makeCastle, blobPts, makeTree, hash
} = B;

const KINDS = ['lake', 'forest', 'gorge', 'abbey', 'sea'];
const TITLES = { lake: 'The Tower by the Lake', forest: 'The Dark Wood', gorge: 'The Bridge over the Gorge', abbey: 'The Ruined Abbey', sea: 'The Headland in the Storm' };

// The seed picks a scene type, then its geometry. Everything is plain data.
function makeScene(seed) {
  const R = mulberry32(seed >>> 0);
  const r = (a, b) => a + (b - a) * R();
  const chance = p => R() < p;
  const N = noiseFor(seed);
  const off = () => r(0, 1000);
  const line = (x0, x1, step, f) => { const pts = []; for (let x = x0; x <= x1 + 1e-6; x += step) pts.push([x, f(x)]); return pts; };

  const [W, H] = hash(seed * 0.37, 9.1) < 0.4 ? [1000, 1400] : [1500, 1000];
  B.W = W; B.H = H;
  const kind = KINDS[Math.floor(R() * KINDS.length)];
  const night = chance(0.25);
  const sun = { x: W * r(0.12, 0.88), y: H * r(0.06, 0.3) };
  const sky = {
    dark: night ? r(0.05, 0.16) : r(0.25, 0.55), cloud: r(-0.12, 0.18), stretch: r(2.2, 4),
    rays: !night && (kind === 'forest' || chance(0.7)), rayFreq: r(5, 12), rayOff: off(), cloudOff: off(),
  };
  const sc = {
    seed, W, H, kind, night, title: TITLES[kind] + (night ? ' by Moonlight' : ''), sun, sky,
    waterY: H * r(0.6, 0.7), hasWater: false, sea: false, fall: null,
    far: [], crags: [], ground: null, road: null, rocks: [], trees: [], birds: [], structures: [], figures: [],
  };

  const farRidges = (n, bottom, span) => {
    for (let i = 0; i < n; i++) {
      const base = bottom - H * r(0.05, 0.16) + i * H * 0.03, amp = H * r(0.03, 0.12), fq = r(0.002, 0.005), o = off();
      const [a, b] = span || [-20, W + 20];
      sc.far.push({ tone: 0.8 - i * 0.08, pts: line(-20, W + 20, 6, x => {
        const win = x < a || x > b ? 0 : span ? Math.sin(Math.PI * (x - a) / (b - a)) : 1;
        return Math.min(bottom - 2, bottom - (bottom - base + amp * (0.5 + N.fbm(x * fq, o, 5))) * win);
      }) });
    }
  };
  const addCrag = (cx, peak, wl, wr, base) => {
    const k = r(0.5, 1.2), o = off(), jag = H * r(0.025, 0.06);
    const pts = line(cx - wl * 1.15, cx + wr * 1.15, 4, x => {
      const t = (x - cx) / (x < cx ? wl : wr);
      const h = Math.pow(Math.max(0, 1 - Math.abs(t)), k) * (0.75 + 0.5 * N.fbm(x * 0.006, o + 20, 3));
      const j = Math.abs(N.fbm(x * 0.012, o, 4)) * jag * 2 + N.fbm(x * 0.06, o + 50, 2) * jag * 0.4;
      return Math.min(base + 4, base - (base - peak) * h + j * (0.3 + h));
    });
    const c = { cx, wl, wr, pts, base, ga: cx - wl * 0.25, gb: cx + wr * 0.25, lit: r(0.72, 0.88), shade: r(0.12, 0.3), castle: null };
    sc.crags.push(c);
    return c;
  };
  const addGround = (gBase, bankL, bankR, minY) => {
    const go = off();
    sc.ground = line(-20, W + 20, 5, x => {
      const u = x / W;
      const bank = bankL * Math.pow(Math.max(0, 1 - u / 0.4), 2) + bankR * Math.pow(Math.max(0, (u - 0.6) / 0.4), 2);
      return Math.max(minY, gBase - bank + N.fbm(x * 0.004, go, 5) * H * 0.05);
    });
  };
  const addRock = (x, y, size, flat = r(0.5, 0.75)) => {
    const o = off(), pts = [];
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2, m = 1 + 0.3 * N.n2(Math.cos(a) * 1.2 + o, Math.sin(a) * 1.2 + o);
      pts.push([x + Math.cos(a) * size * m, y + Math.min(Math.sin(a) * size * flat * m, size * 0.25)]);
    }
    sc.rocks.push({ pts, x, y, size });
  };
  const scatterRocks = n => {
    for (let i = 0; i < n; i++) {
      const x = W * r(0.04, 0.96), top = yAt(sc.ground, x);
      if (H - top < 50) continue;
      const y = r(top + 12, H - 15);
      addRock(x, y, (14 + 60 * (y - sc.waterY) / (H - sc.waterY)) * r(0.7, 1.3));
    }
  };
  // A road winding up to the crest, sometimes walked by a pilgrim or two.
  const addRoad = (x1, p) => {
    const yEnd = yAt(sc.ground, x1) + 3;
    if (!chance(p) || H - yEnd < 60) return;
    sc.road = { x0: W * r(0.25, 0.75), x1, yEnd, amp: W * r(0.03, 0.1), k: r(1, 2.5), ph: off() };
    if (!chance(0.7)) return;
    const s = r(0.4, 0.75), n = chance(0.4) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const q = roadAt(sc.road, s + i * 0.04);
      sc.figures.push({ x: q.x + r(-0.2, 0.2) * q.w, y: q.y, h: 46 * (1 - s) + 10, kind: chance(0.4) ? 'rider' : 'pilgrim' });
    }
  };
  const framingTrees = (leafy) => {
    const roll = R(), n = roll < 0.15 ? 0 : roll < 0.55 ? 1 : roll < 0.9 ? 2 : 3;
    let side = chance(0.5) ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const x = side < 0 ? W * r(0.02, 0.22) : W * r(0.78, 0.98);
      sc.trees.push(makeTree(x, yAt(sc.ground, x), H * r(0.35, 0.72), -side * r(0.05, 0.3), leafy ?? chance(0.55), R, r, N));
      side = -side;
    }
  };
  const addBirds = (p, n0 = 4) => {
    if (night || !chance(p)) return;
    const bx = W * r(0.2, 0.8), by = H * r(0.12, 0.4), n = n0 + Math.floor(R() * 11);
    for (let i = 0; i < n; i++) sc.birds.push([bx + r(-120, 120), by + r(-50, 50), r(4, 9)]);
  };
  const tallest = () => sc.crags.reduce((a, b) => (Math.min(...b.pts.map(p => p[1])) < Math.min(...a.pts.map(p => p[1])) ? b : a));
  const lancet = (x, yb, w, h) => {
    const ys = yb - h + w * 0.87, pts = [[x - w / 2, yb]];
    for (let k = 0; k <= 8; k++) { const a = Math.PI + k / 8 * Math.PI / 3; pts.push([x + w / 2 + w * Math.cos(a), ys + w * Math.sin(a)]); }
    for (let k = 0; k <= 8; k++) { const a = -Math.PI / 3 + k / 8 * Math.PI / 3; pts.push([x - w / 2 + w * Math.cos(a), ys + w * Math.sin(a)]); }
    pts.push([x + w / 2, yb]);
    return pts;
  };
  const brokenTop = (a, b, y, depth) => {
    const pts = [];
    for (let x = a; x < b; x += r(6, 16)) pts.push([x, y + r(0, depth)]);
    pts.push([b, y + r(0, depth)]);
    return pts;
  };

  const wy = sc.waterY;
  sc.focus = { x: W / 2, y: H * 0.45 };
  switch (kind) {
    case 'lake': {
      sc.hasWater = chance(0.75);
      farRidges(1 + Math.floor(R() * 3), wy);
      const n = chance(0.35) ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const cx = W * (n === 1 ? r(0.25, 0.75) : i ? r(0.58, 0.85) : r(0.15, 0.42));
        addCrag(cx, H * r(0.1, 0.34) + i * H * 0.08, W * r(0.1, 0.26), W * r(0.1, 0.26), wy);
      }
      if (chance(0.75)) { const c = tallest(); c.castle = makeCastle(c, r, chance, sun.x < c.cx); }
      addGround(H * r(0.8, 0.9), chance(0.6) ? H * r(0.08, 0.3) : 0, chance(0.6) ? H * r(0.08, 0.3) : 0, wy + 25);
      addRoad(W * r(0.3, 0.7), 0.5);
      if (!sc.road && chance(0.6)) {
        const x = chance(0.5) ? W * r(0.08, 0.3) : W * r(0.7, 0.92);
        sc.figures.push({ x, y: yAt(sc.ground, x) + 3, h: H * r(0.08, 0.12), kind: 'rider' });
      }
      scatterRocks(Math.floor(r(2, 9)));
      framingTrees();
      addBirds(0.45);
      break;
    }
    case 'forest': {
      sc.waterY = H * r(0.7, 0.78);
      sun.y = H * r(0.02, 0.15);
      addGround(sc.waterY + H * r(0.08, 0.14), H * r(0, 0.08), H * r(0, 0.08), sc.waterY + 15);
      const rows = [[r(8, 14), 0.25, 0.8], [r(5, 8), 0.5, 0.55], [r(2, 4), 1, 0.28]];
      rows.forEach(([n, wk, tone], row) => {
        for (let i = 0; i < n; i++) {
          const x = W * r(-0.02, 1.02), y = row < 2 ? sc.waterY + row * H * 0.04 + r(0, H * 0.04) : yAt(sc.ground, x);
          sc.trees.push(makeTree(x, y, H * r(1.0, 1.3), r(-0.08, 0.08), row === 2 && chance(0.5), R, r, N, { wk, tone, depth: row + 2 }));
        }
      });
      const canopy = [];
      for (let x = -40; x < W + 60; x += r(70, 130)) canopy.push(blobPts(x, H * r(-0.04, 0.12), r(70, 140), off(), N));
      sc.trees.push({ segs: [], clumps: canopy, tone: 0.28, leafTone: 0.18 });
      addRoad(W * r(0.35, 0.65), 0.6);
      scatterRocks(Math.floor(r(0, 4)));
      break;
    }
    case 'gorge': {
      sc.hasWater = true;
      sc.waterY = H * r(0.78, 0.86);
      farRidges(1 + Math.floor(R() * 2), H * r(0.5, 0.6));
      const gapL = W * r(0.2, 0.3), gapR = W * r(0.7, 0.8), oL = off(), oR = off();
      const edgeL = y => gapL + N.fbm(y * 0.006, oL, 4) * W * 0.06 - (y / H) * W * 0.03;
      const edgeR = y => gapR + N.fbm(y * 0.006, oR, 4) * W * 0.06 + (y / H) * W * 0.03;
      for (const [side, edge] of [[-1, edgeL], [1, edgeR]]) {
        const top = H * r(-0.05, 0.18), o = off(), x0 = side < 0 ? -20 : W + 20, xe = edge(top);
        const topEdge = [];
        for (let k = 0; k <= 20; k++) { const x = x0 + (xe - x0) * k / 20; topEdge.push([x, top + Math.abs(N.fbm(x * 0.01, o, 3)) * H * 0.05 + (k / 20) * H * 0.02]); }
        const face = [];
        for (let y = topEdge[20][1]; y <= H + 20; y += 5) face.push([edge(y), y]);
        const mid = edge(H / 2), cx = side < 0 ? mid / 2 : (mid + W) / 2;
        sc.crags.push({
          cx, wl: 0, wr: 0, vertical: true, base: H + 20, pts: [...topEdge, ...face], edge: [...topEdge, ...face],
          poly: [...topEdge, ...face, [x0, H + 20]], ga: side < 0 ? 0 : mid, gb: side < 0 ? mid : W,
          lit: r(0.7, 0.85), shade: r(0.12, 0.25), castle: null,
        });
      }
      const yb = H * r(0.3, 0.48), xa = edgeL(yb) - 25, xb = edgeR(yb) + 25, thick = r(16, 26), depth = r(50, 90);
      const bridge = [[xa, yb], ...brokenTop(xa, xb, yb - 8, 0).map(([x]) => [x, yb - (Math.floor(x / 9) % 2 ? 8 : 0)]), [xb, yb], [xb, yb + depth]];
      for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI; bridge.push([(xa + xb) / 2 + Math.cos(a) * (xb - xa) / 2, yb + depth - Math.sin(a) * (depth - thick)]); }
      sc.structures.push({ pts: bridge, tone: 0.55, masonry: true, z: 'back' });
      if (chance(0.6)) sc.figures.push({ x: r(xa + 60, xb - 60), y: yb - 9, h: 24, kind: chance(0.5) ? 'rider' : 'pilgrim' });
      const fx = (edgeL(sc.waterY) + edgeR(sc.waterY)) / 2 + r(-40, 40), fw = r(30, 70), fy = yb + depth - 10, fo = off();
      const fall = [];
      for (let y = fy; y <= sc.waterY + 4; y += 8) fall.push([fx - fw / 2 - (y - fy) * 0.08 + N.n2(y * 0.02, fo) * 6, y]);
      for (let y = sc.waterY + 4; y >= fy; y -= 8) fall.push([fx + fw / 2 + (y - fy) * 0.08 + N.n2(y * 0.02, fo + 9) * 6, y]);
      sc.fall = { pts: fall, x: fx, y0: fy };
      sc.focus = { x: fx, y: (yb + sc.waterY) / 2 };
      addGround(H + 40, 0, 0, H + 40);
      for (let i = 0, n = Math.floor(r(1, 5)); i < n; i++) addRock(W * r(0.15, 0.85), r(sc.waterY + 30, H - 10), r(25, 70));
      addBirds(0.5);
      break;
    }
    case 'abbey': {
      sc.hasWater = chance(0.35);
      farRidges(1 + Math.floor(R() * 3), wy);
      if (chance(0.4)) addCrag(W * r(0.15, 0.85), H * r(0.3, 0.45), W * r(0.1, 0.2), W * r(0.1, 0.2), wy);
      addGround(H * r(0.74, 0.84), chance(0.5) ? H * r(0.05, 0.2) : 0, chance(0.5) ? H * r(0.05, 0.2) : 0, wy + 25);
      const cx = W * r(0.32, 0.68), base = yAt(sc.ground, cx) + 12, fw = W * r(0.17, 0.26), fh = H * r(0.28, 0.42), gh = fw * r(0.35, 0.5);
      const left = cx - fw / 2, right = cx + fw / 2, breakY = base - fh * r(0.45, 0.8), brokeRight = chance(0.5);
      const facade = [[left, base + 30], [left, base - fh], [cx, base - fh - gh], [right, base - fh], [right, base + 30]];
      if (brokeRight) facade.splice(3, 1, ...brokenTop(cx + fw * 0.1, right, base - fh - gh * 0.6, fh - (base - breakY) + gh * 0.4).map(([x, y]) => [x, y + (x - cx) * 0.6]));
      else facade.splice(1, 2, [left, breakY], ...brokenTop(left, cx - fw * 0.1, base - fh - gh * 0.5, gh).map(([x, y]) => [x, Math.min(y + (cx - x) * 0.6, breakY)]), [cx, base - fh - gh]);
      const holes = [lancet(cx, base - fh * 0.12, fw * 0.2, fh * 0.6)];
      for (const s of [-1, 1]) holes.push(lancet(cx + s * fw * 0.3, base - fh * 0.2, fw * 0.1, fh * 0.42));
      if (chance(0.6)) { const rr = fw * 0.08, ry = base - fh - gh * 0.25, rose = []; for (let k = 0; k < 20; k++) rose.push([cx + Math.cos(k / 20 * 6.283) * rr, ry + Math.sin(k / 20 * 6.283) * rr]); holes.push(rose); }
      sc.structures.push({ pts: facade, holes, tone: 0.6, masonry: true, z: 'mid' });
      sc.focus = { x: cx, y: base - fh * 0.5 };
      if (chance(0.7)) {
        const gx = cx + (chance(0.5) ? -1 : 1) * fw * r(0.6, 0.9);
        for (let k = 0, n = 2 + Math.floor(r(0, 3)); k < n; k++) {
          const x = gx + r(-40, 40);
          sc.figures.push({ x, y: yAt(sc.ground, x) + 4 + r(0, 10), h: H * r(0.045, 0.06), kind: 'pilgrim' });
        }
      }
      const s = chance(0.5) ? -1 : 1, wl = fw * r(0.7, 1.1), wh = fh * r(0.35, 0.55), x0 = s < 0 ? left - wl : right, x1 = x0 + wl;
      const wall = [[x0, base + 30], ...brokenTop(x0, x1, base - wh, wh * 0.4), [x1, base + 30]];
      const wholes = [];
      for (let k = 0, n = 2 + Math.floor(r(0, 2)); k < n; k++) wholes.push(lancet(x0 + wl * (k + 0.5) / n, base - wh * 0.15, wl * 0.12, wh * 0.55));
      sc.structures.push({ pts: wall, holes: wholes, tone: 0.5, masonry: true, z: 'mid' });
      for (let k = 0, n = Math.floor(r(0, 3)); k < n; k++) {
        const px = cx + s * (fw / 2 + wl + r(30, 120)), pw = r(10, 18), ph = fh * r(0.2, 0.6), pb = yAt(sc.ground, px) + 10;
        sc.structures.push({ pts: [[px - pw / 2, pb + 20], ...brokenTop(px - pw / 2, px + pw / 2, pb - ph, pw), [px + pw / 2, pb + 20]], tone: 0.55, z: 'mid' });
      }
      for (let k = 0, n = Math.floor(r(4, 10)); k < n; k++) {
        const gx = W * r(0.08, 0.92), top = yAt(sc.ground, gx);
        if (H - top < 40) continue;
        const gy = r(top + 20, H - 10), sz = 10 + 30 * (gy - top) / (H - top), lean = r(-0.15, 0.15);
        const shape = chance(0.5)
          ? [[-0.12, 0], [-0.12, -0.6], [-0.4, -0.6], [-0.4, -0.78], [-0.12, -0.78], [-0.12, -1], [0.12, -1], [0.12, -0.78], [0.4, -0.78], [0.4, -0.6], [0.12, -0.6], [0.12, 0]]
          : [[-0.3, 0], [-0.3, -0.75], [-0.2, -0.9], [0, -0.96], [0.2, -0.9], [0.3, -0.75], [0.3, 0]];
        sc.structures.push({ pts: shape.map(([u, v]) => [gx + (u - v * lean) * sz * 1.6, gy + v * sz * 1.6]), tone: r(0.4, 0.7), z: 'front' });
      }
      sc.vines = [];
      for (let k = 0, n = Math.floor(r(3, 7)); k < n; k++) {
        const x0 = chance(0.5) ? left + r(-6, fw * 0.25) : right - r(-6, fw * 0.25), top = base - fh * r(0.3, 0.95), o = off();
        const stem = [];
        for (let y = base + 5, x = x0; y > top; y -= 6) { x += N.n2(y * 0.03, o) * 3; stem.push([x, y]); }
        sc.vines.push(stem);
        for (let b = 0; b < stem.length; b += 4 + Math.floor(r(0, 5))) {
          const [bx, by] = stem[b], dir = chance(0.5) ? -1 : 1, shoot = [[bx, by]];
          for (let j = 1, len = r(3, 8); j < len; j++) shoot.push([bx + dir * j * 6, by - j * r(1, 4)]);
          sc.vines.push(shoot);
        }
      }
      addRoad(cx, 0.4);
      framingTrees(false);
      addBirds(0.75, 8);
      break;
    }
    case 'sea': {
      sc.hasWater = true; sc.sea = true;
      sc.waterY = H * r(0.5, 0.6);
      sky.cloud = r(0.05, 0.25); sky.dark = night ? sky.dark : r(0.2, 0.4);
      const side = chance(0.5) ? -1 : 1;
      if (chance(0.5)) farRidges(1, sc.waterY, side < 0 ? [W * 0.5, W * 1.1] : [-W * 0.1, W * 0.5]);
      const cx = side < 0 ? W * r(0.08, 0.2) : W * r(0.8, 0.92), base = H * r(0.72, 0.85);
      const c = addCrag(cx, H * r(0.12, 0.3), side < 0 ? W * 0.3 : W * r(0.15, 0.25), side < 0 ? W * r(0.15, 0.25) : W * 0.3, base);
      c.foot = base;
      if (chance(0.7)) c.castle = makeCastle(c, r, chance, sun.x < c.cx);
      for (let i = 0, n = Math.floor(r(1, 4)); i < n; i++) {
        const sx = cx - side * W * r(0.2, 0.35), sy = r(sc.waterY + 20, base), sz = 12 + 50 * (sy - sc.waterY) / (base - sc.waterY);
        addRock(sx + r(-60, 60), sy, sz, r(1.2, 2));
      }
      const bank = chance(0.6);
      addGround(H + 60, side > 0 && bank ? H * r(0.2, 0.35) : 0, side < 0 && bank ? H * r(0.2, 0.35) : 0, sc.waterY + 25);
      if (bank) {
        const bx = side > 0 ? W * r(0.08, 0.2) : W * r(0.8, 0.92);
        sc.figures.push({ x: bx, y: yAt(sc.ground, bx) + 4, h: 44, kind: 'pilgrim' });
        scatterRocks(Math.floor(r(1, 4)));
      }
      addBirds(0.8);
      break;
    }
  }
  const held = sc.crags.find(c => c.castle);
  if (held) { const top = held.pts.reduce((a, b) => (b[1] < a[1] ? b : a)); sc.focus = { x: top[0], y: top[1] }; }
  if (kind === 'forest') sc.focus = { x: sun.x, y: H * 0.55 };
  for (const f of sc.figures) f.face = f.face || (sc.focus.x < f.x ? -1 : 1);
  return sc;
}

Object.assign(B, {
  makeScene
});
})(this);

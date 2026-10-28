// Render stages 2 to 4: layer mask, per-pixel tone map and pen pressure.
(function (root) {
'use strict';

const node = typeof module !== 'undefined';
const B = node ? require('./core.js') : root.EngraverParts;
const {
  SKY, FAR, CRAG, CASTLE, VALLEY, WATER, GROUND, ROCK, TREE, LEAF, IDS, clamp, smooth, yAt,
  roadAt, tick, facet, blur, hash, quad
} = B;

// Returns false when the drawing was cancelled part way.
async function renderTone(s) {
  const { W, H } = B;
  const {
    token, sc, N, sun, waterY, sky
  } = s;
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
  m.fillStyle = col(sc.hasWater ? WATER : VALLEY, 0.5); m.fillRect(0, waterY, W, H - waterY);
  if (sc.fall) { m.fillStyle = col(WATER, 0.7); poly(sc.fall.pts); }
  const structures = z => {
    for (const st of sc.structures) {
      if (st.z !== z) continue;
      const xs = st.pts.map(q => q[0]);
      m.fillStyle = sideGrad(CASTLE, Math.min(...xs), Math.max(...xs), sun.x < W / 2, st.tone + 0.2, st.tone - 0.2);
      poly(st.pts);
      m.fillStyle = col(SKY, 0);
      for (const h of st.holes || []) poly(h);
    }
  };
  structures('back');
  for (const c of sc.crags) {
    m.fillStyle = sideGrad(CRAG, c.ga, c.gb, sun.x < c.cx, c.lit, c.shade);
    poly(c.poly || [...c.pts, [c.pts[c.pts.length - 1][0], c.base + 6], [c.pts[0][0], c.base + 6]]);
    if (!c.castle) continue;
    for (const p of c.castle.parts) {
      const xs = p.pts.map(q => q[0]), a = Math.min(...xs), b = Math.max(...xs);
      m.fillStyle = p.cyl ? sideGrad(CASTLE, a, b, c.castle.sunLeft, 0.85, 0.3) : col(CASTLE, c.castle.sunLeft === (a + b) / 2 < c.cx ? p.tone + 0.1 : p.tone);
      poly(p.pts);
    }
  }
  structures('mid');
  m.fillStyle = col(GROUND, 0.42); poly([...sc.ground, [W + 20, H + 20], [-20, H + 20]]);
  for (const rk of sc.rocks) {
    const g = m.createLinearGradient(0, rk.y - rk.size * 0.7, 0, rk.y + rk.size * 0.3);
    g.addColorStop(0, col(ROCK, 0.85)); g.addColorStop(1, col(ROCK, 0.12));
    m.fillStyle = g; poly(rk.pts);
  }
  structures('front');
  for (const t of sc.trees) {
    for (const s of t.segs) if (s[4] >= 4) {
      let a = Math.atan2(s[3] - s[1], s[2] - s[0]);
      if (a < 0) a += Math.PI;
      m.fillStyle = col(TREE, t.tone, Math.round(a / Math.PI * 255));
      quad(m, s); m.fill(); m.beginPath(); m.arc(s[2], s[3], s[5] / 2, 0, 7); m.fill(); }
    m.fillStyle = col(LEAF, t.leafTone);
    for (const c of t.clumps) poly(c);
  }
  const img = m.getImageData(0, 0, W, H).data;
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) lut[v] = IDS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const ids = new Uint8Array(W * H), tone = new Float32Array(W * H), box = {};
  IDS.forEach(id => (box[id] = [W, H, 0, 0]));
  for (let i = 0, n = W * H; i < n; i++) ids[i] = lut[img[i * 4]];
  const idAt = (x, y) => ids[clamp(y | 0, 0, H - 1) * W + clamp(x | 0, 0, W - 1)];

  // 4. Tone map: 0 = solid ink, 1 = bare paper.
  const rays = (x, y) => {
    if (!sky.rays) return 0;
    const dx = x - sun.x, dy = y - sun.y, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx), F = sky.rayFreq;
    const b = smooth(0.0, 0.3, N.s2(Math.cos(a) * F + sky.rayOff, Math.sin(a) * F));
    return (b - 0.4) * 0.5 * smooth(20, 160, d) * Math.exp(-d / (W * 0.9)) * (dy > 0 ? 1 : 0.35);
  };
  const crest = new Float32Array(W);
  for (let x = 0; x < W; x++) crest[x] = yAt(sc.ground, x);
  const roadX = new Float32Array(H).fill(-1e4), roadW = new Float32Array(H);
  if (sc.road) for (let s = 0; s <= 1; s += 0.0005) { const q = roadAt(sc.road, s), y = q.y | 0; if (y >= 0 && y < H) { roadX[y] = q.x; roadW[y] = q.w; } }
  const cloud = (x, y) => N.fbmS(x * 0.0022 + sky.cloudOff, y * 0.0022 * sky.stretch, 4) + sky.cloud + 0.25 * (1 - y / waterY);
  const G4 = 4, GW = Math.ceil(W / G4) + 2, GH = Math.ceil(H / G4) + 2, cg = new Float32Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const x = gx * G4, y = gy * G4;
    cg[gy * GW + gx] = N.fbmS(x * 0.0022 + sky.cloudOff, y * 0.0022 * sky.stretch, 3) + sky.cloud + 0.25 * (1 - y / waterY);
  }
  const cloudS = (x, y) => {
    const fx = clamp(x / G4, 0, GW - 1.001), fy = clamp(y / G4, 0, GH - 1.001), ix = fx | 0, iy = fy | 0, u = fx - ix, v = fy - iy, i = iy * GW + ix;
    return (cg[i] * (1 - u) + cg[i + 1] * u) * (1 - v) + (cg[i + GW] * (1 - u) + cg[i + GW + 1] * u) * v;
  };
  const mist = y => smooth(waterY - H * 0.12, waterY, y);
  const cragMist = sc.kind === 'lake' || sc.kind === 'abbey';
  const focus = sc.focus;
  const forest = sc.kind === 'forest';
  const moonR = H * 0.035;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, id = ids[i], g = img[i * 4 + 1] / 255;
      const bx = box[id];
      if (x < bx[0]) bx[0] = x; if (y < bx[1]) bx[1] = y; if (x > bx[2]) bx[2] = x; if (y > bx[3]) bx[3] = y;
      let t;
      const sd = Math.hypot(x - sun.x, y - sun.y), glow = Math.exp(-sd / (W * 0.2));
      switch (id) {
        case SKY: {
          if (sc.night && sd < moonR) { t = 1; break; }
          t = sky.dark + (0.97 - sky.dark) * Math.pow(clamp(y / waterY), 0.8) + glow * 0.5;
          const c = 0.6 * cloudS(x, y) + 0.4 * cloud(x, y), cover = smooth(0.0, 0.3, c);
          if (cover > 0) {
            const ux = (sun.x - x) / (sd + 1), uy = (sun.y - y) / (sd + 1);
            const edge = cloudS(x, y) - cloudS(x + ux * 18, y + uy * 18);
            t = t * (1 - cover) + cover * clamp(0.3 + edge * 7 + glow * 0.6);
          }
          t += rays(x, y);
          break;
        }
        case FAR: t = g + 0.07 * N.fbmS(x * 0.01, y * 0.02, 3) + glow * 0.15 + rays(x, y) * 0.6 + 0.15 * mist(y); break;
        case CRAG: {
          const [fid, d1, d2] = facet(x, y, 80, 130, 3.3);
          const strata = smooth(0.25, 0.5, N.s2(x * 0.01, y * 0.05 + N.s2(x * 0.004, y * 0.004) * 3));
          t = g * 0.75 + (hash(fid * 91.7, 1.3) - 0.5) * 0.36 + 0.1 - 0.28 * (1 - smooth(0, 0.06, d2 - d1)) - strata * 0.12
            + (cragMist ? 0.35 * mist(y) : 0) + rays(x, y) * 0.35;
          break;
        }
        case CASTLE: t = g + 0.05 * N.n2(x * 0.2, y * 0.2) + 0.15 * mist(y); break;
        case VALLEY: t = 0.8 - 0.3 * (y - waterY) / (H - waterY) + 0.1 * N.fbm(x * 0.005, y * 0.02, 3); break;
        case WATER: t = y < waterY ? 0.66 + 0.3 * N.n2(x * 0.09, y * 0.004) + 0.2 * smooth(waterY - 60, waterY, y) : 0; break;
        case GROUND: {
          t = g + 0.2 * N.fbmS(x * 0.003, y * 0.008, 3) + 0.3 * (1 - smooth(0, 40, y - crest[x])) - 0.35 * smooth(H * 0.72, H, y);
          const dx = Math.abs(x - roadX[y]), w = roadW[y];
          if (dx < w / 2) t = 0.78 + 0.12 * N.s2(x * 0.05, y * 0.05) - 0.45 * smooth(w * 0.3, w * 0.5, dx);
          break;
        }
        case ROCK: {
          const [fid, d1, d2] = facet(x, y, 26, 34, 7.7);
          t = g * 0.8 + (hash(fid * 53.1, 2.9) - 0.5) * 0.4 - 0.35 * (1 - smooth(0, 0.08, d2 - d1));
          break;
        }
        case TREE: t = g + 0.15 * N.s2(x * 0.1, y * 0.02) + (forest ? rays(x, y) * 0.8 + 0.2 * (1 - y / H) * g : 0); break;
        default: {
          const [, d1, d2, px, py] = facet(x, y, 16, 13, 5.5);
          const nx = (x - px) / 16, ny = (y - py) / 13, ux = (sun.x - x) / (sd + 1), uy = (sun.y - y) / (sd + 1);
          t = g + 0.25 * smooth(0.05, 0.35, N.fbmS(x * 0.02, y * 0.02, 2)) * (0.5 + glow) + 0.4 * clamp(nx * ux + ny * uy + 0.15)
            - 0.25 * (1 - smooth(0, 0.1, d2 - d1)) + (forest ? rays(x, y) * 0.6 : 0);
        }
      }
      if (forest && id === GROUND) t += rays(x, y) * 0.5;
      const fd = Math.hypot((x - focus.x) / W, (y - focus.y) / H);
      t = t * (1 - 0.4 * smooth(0.25, 0.95, fd)) + (id === SKY ? 0 : 0.08 * Math.exp(-fd * fd / 0.02));
      // Moonlight: the darks sink harder than the lights, and the sky pales in
      // a halo round the moon, so the plate keeps its contrast.
      if (sc.night && !(id === SKY && sd < moonR)) t = Math.pow(clamp(t), 1.5) * 0.9 + (id === SKY ? 0.55 * Math.exp(-(sd - moonR) / (moonR * 2.5)) : 0);
      tone[i] = clamp(t);
    }
    if (y % 60 === 59) { await tick(); if (token.cancelled) return false; }
  }
  if (sc.hasWater) {
    for (let y = Math.floor(waterY); y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (ids[i] !== WATER) continue;
        const depth = (y - waterY) / (H - waterY);
        const xs = clamp(Math.round(x + N.s2(x * 0.01, y * 0.08) * 6 * (1 + depth * 4)), 0, W - 1);
        const ys = clamp(Math.round(2 * waterY - y), 0, H - 1);
        const glint = N.s2(x * 0.004, y * 0.06);
        let t;
        if (sc.sea) {
          const k = 0.15 + depth, wave = N.fbmS(x * 0.004 / k, y * 0.035 / k, 4);
          t = 0.55 + 0.4 * smooth(0.02, 0.25, wave) - 0.25 * smooth(0.05, 0.3, -wave) + 0.15 * (1 - depth);
          for (const c of sc.crags) if (c.foot && Math.abs(y - c.foot) < 50 && x > c.pts[0][0] - 60 && x < c.pts[c.pts.length - 1][0] + 60) t += 0.5 * (1 - Math.abs(y - c.foot) / 50) * clamp(N.s2(x * 0.03, y * 0.05) + 0.5);
          t += Math.exp(-(((x - sun.x) / (W * 0.06)) ** 2)) * clamp(glint) * 0.5;
        } else {
          t = 0.1 + 0.72 * tone[ys * W + xs];
          t += smooth(0.3, 0.5, glint) * 0.35 + Math.exp(-(((x - sun.x) / (W * 0.05)) ** 2)) * clamp(glint) * 0.6;
          if (sc.fall) t += 0.6 * Math.exp(-Math.hypot(x - sc.fall.x, (y - waterY) * 2) / 70);
        }
        tone[i] = clamp(t * (1 - 0.3 * depth));
      }
    }
  }
  // Pen darkness: the tone softened over a few pixels so strokes start and
  // stop along clean shapes rather than every speck of noise, and the light
  // end of the scale left as bare paper, as a pen draughtsman would.
  const pen = blur(tone, 4);
  for (let i = 0; i < pen.length; i++) pen[i] = clamp((0.88 - pen[i]) / 0.84);
  await tick();
  if (token.cancelled) return false;
  Object.assign(s, {
    img, tone, ids, box, idAt, crest, cloudS, moonR, pen
  });
  return true;
}

Object.assign(B, {
  renderTone
});
})(this);

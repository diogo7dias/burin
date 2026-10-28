// Scene shapes: castles, rocks and trees as plain data for makeScene.
(function (root) {
'use strict';

const node = typeof module !== 'undefined';
const B = node ? require('./core.js') : root.EngraverParts;
const {
  clamp, yAt
} = B;

function makeCastle(crag, r, chance, sunLeft) {
  const { W, H } = B;
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
  const side = chance(0.5) ? -1 : 1, wing = cw * r(0.3, 0.6), wx0 = side < 0 ? x0 - wing : x1, wx1 = side < 0 ? x0 : x1 + wing;
  block(wx0, wx1, wallTop + H * r(0.02, 0.05), false);
  towers.push({ x: side < 0 ? wx0 : wx1, w: cw * r(0.1, 0.14), top: wallTop - H * r(0, 0.02) });
  const n = 3 + Math.floor(r(0, 5));
  for (let i = 0; i < n; i++) towers.push({ x: px + r(-0.5, 0.5) * cw, w: cw * r(0.1, 0.2), top: wallTop - H * r(0.02, 0.09) });
  towers.push({ x: px + r(-0.15, 0.15) * cw, w: cw * r(0.2, 0.3), top: wallTop - H * r(0.07, 0.14) });
  for (const t of towers) {
    const a = t.x - t.w / 2, b = t.x + t.w / 2;
    const roof = !ruin && chance(0.7);
    if (roof) {
      parts.push({ pts: [[a, t.top], [b, t.top], ...base(a, b)], cyl: true, masonry: true });
      const apex = t.top - t.w * r(0.9, 1.7);
      parts.push({ pts: [[a - t.w * 0.12, t.top], [t.x, apex], [b + t.w * 0.12, t.top]], cyl: false, tone: 0.22, flag: chance(0.5) ? [t.x, apex] : null });
    } else block(a, b, t.top, true);
    const slits = 2 + Math.floor(r(0, 4));
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

function blobPts(cx, cy, rad, o, N) {
  const pts = [];
  for (let i = 0; i < 64; i++) {
    const a = i / 64 * Math.PI * 2;
    const k = 1 + 0.35 * N.n2(Math.cos(a) * 1.4 + o, Math.sin(a) * 1.4 + o);
    pts.push([cx + Math.cos(a) * rad * k, cy + Math.sin(a) * rad * k * 0.8]);
  }
  return pts;
}

function makeTree(x, y, height, lean, leafy, R, r, N, { wk = 1, tone = 0.28, depth } = {}) {
  const segs = [], clumps = [];
  const blob = (cx, cy, rad) => blobPts(cx, cy, rad, r(0, 500), N);
  function grow(x, y, ang, len, w, depth) {
    let a = ang;
    for (let k = 0; k < 3; k++) {
      // Organic gravity droop along branch limb
      const sag = Math.cos(a) * 0.05;
      a = clamp(a + r(-0.32, 0.32) + sag, -Math.PI - 0.3, 0.3);
      const nx = x + Math.cos(a) * len / 3, ny = y + Math.sin(a) * len / 3;
      segs.push([x, y, nx, ny, w * (1 - 0.08 * k), w * (1 - 0.08 * (k + 1))]);
      x = nx; y = ny;
    }
    // Leonardo da Vinci branch thinning ratio
    w *= 0.74;
    if (leafy && depth <= 2) clumps.push(blob(x, y, height * r(0.05, 0.1)));
    if (depth === 0 || w < 1) return;
    const n = R() < 0.35 ? 3 : 2;
    for (let i = 0; i < n; i++) grow(x, y, a + r(-0.85, 0.85) * (i ? 1 : 0.5), len * r(0.62, 0.82), w * r(0.6, 0.8), depth - 1);
  }
  grow(x, y + 8, -Math.PI / 2 + lean, height * r(0.28, 0.38), height * r(0.05, 0.08) * wk, depth ?? (leafy ? 5 : 7));
  return { segs, clumps, tone, leafTone: 0.2 };
}

// Darkness bands: family i starts at d0, reaches full pen pressure at d1.
// Pass 0 follows the form from the lights. The later passes wait for shadow.

Object.assign(B, {
  makeCastle, blobPts, makeTree
});
})(this);

// Render stage 5a: hatching directions, stroke helpers and the inked outlines.
(function (root) {
'use strict';

const node = typeof module !== 'undefined';
const B = node ? require('./core.js') : root.EngraverParts;
const {
  SKY, FAR, CRAG, CASTLE, VALLEY, WATER, GROUND, ROCK, TREE, LEAF, clamp, burinBite, taperAt,
  smooth, yAt, tick, facet
} = B;

// Returns false when the drawing was cancelled part way.
async function renderInk(s) {
  const { W, H } = B;
  const {
    token, sc, N, R2, Rtap, waterY, outlineOps, ready, jitter, closed, img, idAt, crest, cloudS,
    pen
  } = s;
  // 5. Curvature-Adaptive Hatching Streamlines (powered by @anvaka/streamlines & curl field dynamics)
  const nearest = (list, x, y) => list.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a));
  const cragC = sc.crags.map(c => ({ x: c.cx, y: 0, vertical: c.vertical }));
  const dirs = {
    // Dynamic atmospheric sky: curl noise vortex field blended with cloud contours
    [SKY]: (x, y) => {
      let tx = cloudS(x, y + 16) - cloudS(x, y - 16), ty = cloudS(x - 16, y) - cloudS(x + 16, y);
      if (tx < 0) { tx = -tx; ty = -ty; }
      const l = Math.hypot(tx, ty) || 1;
      const k = 0.16 * smooth(0, 0.35, cloudS(x, y));
      const [cx, cy] = N.curl(x, y, 0.002, 2.0);
      const swirl = 0.24 * smooth(0.04, 0.38, cloudS(x, y));
      let dx = (1 - k) + k * (tx / l) + swirl * cx;
      let dy = k * (ty / l) + swirl * cy;
      const dl = Math.hypot(dx, dy) || 1;
      return [dx / dl, dy / dl];
    },
    [FAR]: (x, y) => [1, 0.15 * N.s2(x * 0.005, y * 0.01)],
    // Crags: fall line down facet, adapted to local geological slope
    [CRAG]: (x, y) => {
      const c = nearest(cragC, x, y), turn = (facet(x, y, 80, 130, 3.3)[0] - 0.5) * 1.3;
      const dx = c.vertical ? 0 : Math.tanh((x - c.x) / 40) * 0.6, ct = Math.cos(turn), st = Math.sin(turn);
      return [dx * ct - st, dx * st + ct];
    },
    [CASTLE]: () => [0, 1],
    [VALLEY]: (x, y) => [1, 0.1 * N.s2(x * 0.004, y * 0.02)],
    // Water: dynamic wave surge in seas, gentle perspective ripples in lakes
    [WATER]: (x, y) => {
      if (y < waterY) return [0.1 * N.s2(x * 0.05, y * 0.01), 1];
      if (sc.sea) {
        const [wx, wy] = N.curl(x, y * 2.5, 0.004, 1.5);
        const swell = 0.85, curlAmt = 0.28;
        const dx = swell + curlAmt * wx, dy = 0.18 * N.s2(x * 0.02, y * 0.08) + curlAmt * wy;
        const l = Math.hypot(dx, dy) || 1;
        return [dx / l, dy / l];
      }
      return [1, 0.08 * N.s2(x * 0.02, y * 0.1)];
    },
    [GROUND]: (x, y) => {
      const xi = clamp(x | 0, 6, W - 7), slope = (crest[xi + 6] - crest[xi - 6]) / 12;
      return [1, slope * Math.exp(-Math.max(0, y - crest[xi]) / 120) + 0.25 * N.s2(x * 0.004, y * 0.01)];
    },
    [ROCK]: (x, y) => {
      const rk = nearest(sc.rocks, x, y), turn = (facet(x, y, 26, 34, 7.7)[0] - 0.5) * 1.6, dx = (x - rk.x) / rk.size * 0.9;
      return [dx * Math.cos(turn) - Math.sin(turn), dx * Math.sin(turn) + Math.cos(turn)];
    },
    [TREE]: (x, y) => { const a = img[((y | 0) * W + (x | 0)) * 4 + 2] / 255 * Math.PI; return [Math.cos(a), Math.sin(a)]; },
    // Leaves: streamlines wrap around the organic perimeter of each leaf mass
    [LEAF]: (x, y) => {
      const [, , , px, py] = facet(x, y, 16, 13, 5.5), dx = x - px, dy = y - py;
      return Math.hypot(dx, dy) < 2 ? [1, 0.3] : [-dy / 13, dx / 16];
    },
  };
  // sp: line spacing, wk: nib width, pen: stroke length range before the hand lifts.
  const groups = [
    { id: SKY, sp: 4.2, wk: 0.75, pen: [50, 140] },
    { id: FAR, sp: 3.6, wk: 0.55, pen: [30, 80] },
    { id: CRAG, sp: 3.8, wk: 1, pen: [25, 70] },
    { id: CASTLE, sp: 3.4, wk: 0.85, pen: [60, 160] },
    { id: VALLEY, sp: 4.2, wk: 0.8, pen: [35, 90] },
    { id: WATER, sp: 3.8, wk: 0.85, pen: [40, 120] },
    { id: GROUND, sp: 4.4, wk: 1.1, pen: [25, 70] },
    { id: ROCK, sp: 3.6, wk: 1.25, pen: [15, 40] },
    { id: TREE, sp: 3.6, wk: 1.2, pen: [40, 110] },
    { id: LEAF, sp: 4, wk: 1.1, pen: [8, 22] },
  ];
  // A hatch line as a growable filled stroke; key orders neighbours side by side.
  // Ink load: a fresh dip lays down near-black, a pen running dry goes browner.
  const inkLoad = () => { const k = R2() * R2() * 0.9; return `rgb(${28 + 50 * k | 0},${20 + 38 * k | 0},${13 + 26 * k | 0})`; };
  const fillStroke = (run, layer) => {
    const n = run.length / 3;
    const poly = runPoly(run, 0.02 + Rtap() * 0.2, 0.15 + Rtap() * 0.5, 0.35 + Rtap() * 0.5, 0.12 + Rtap() * 0.45);
    let len = 0;
    for (let k = 1; k < n; k++) len += Math.hypot(run[k * 3] - run[k * 3 - 3], run[k * 3 + 1] - run[k * 3 - 2]);
    let dx = run[run.length - 3] - run[0], dy = run[run.length - 2] - run[1];
    const l = Math.hypot(dx, dy) || 1;
    if (dx < 0 || (dx === 0 && dy < 0)) { dx = -dx; dy = -dy; }
    const mx = run[(n >> 1) * 3], my = run[(n >> 1) * 3 + 1], color = inkLoad();
    return {
      n, len: Math.max(1, len), layer, mx, my, key: (-dy * mx + dx * my) / l, tip: k => [run[k * 3], run[k * 3 + 1]],
      draw: (c, a, b) => {
        a = Math.max(0, a - 1);
        c.fillStyle = color; c.beginPath(); c.moveTo(poly[a * 2], poly[a * 2 + 1]);
        for (let k = a + 1; k <= b; k++) c.lineTo(poly[k * 2], poly[k * 2 + 1]);
        for (let k = b; k >= a; k--) c.lineTo(poly[(2 * n - 1 - k) * 2], poly[(2 * n - 1 - k) * 2 + 1]);
        c.closePath(); c.fill();
      },
    };
  };

  const tour = strokes => {
    const C = 140, cells = new Map(), out = [];
    for (const st of strokes) {
      const key = ((st.my / C) | 0) * 100 + ((st.mx / C) | 0);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(st);
    }
    const keys = [...cells.keys()];
    let cx = 0, cy = 0;
    while (keys.length) {
      let bi = 0, bd = Infinity;
      keys.forEach((k, i) => { const d = (k % 100 - cx) ** 2 + (((k / 100) | 0) - cy) ** 2; if (d < bd) { bd = d; bi = i; } });
      const k = keys.splice(bi, 1)[0];
      cx = k % 100; cy = (k / 100) | 0;
      out.push(...cells.get(k).sort((a, b) => a.layer - b.layer || a.key - b.key));
    }
    return out;
  };
  const passes = [[], [], []];
  // Run = flat [x, y, width, ...]; outline both sides. Each stroke brings its own attack and lift.
  const runPoly = (run, head, tail, headThin, tailThin) => {
    const n = run.length / 3, poly = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) {
      const a = Math.max(0, k - 1) * 3, b = Math.min(n - 1, k + 1) * 3;
      const dx = run[b] - run[a], dy = run[b + 1] - run[a + 1], l = Math.hypot(dx, dy) || 1;
      const taper = taperAt(n <= 1 ? 0 : k / (n - 1), head, tail, headThin, tailThin);
      const hw = run[k * 3 + 2] * taper * burinBite(dx, dy) / 2, nx = -dy / l * hw, ny = dx / l * hw;
      poly[k * 2] = run[k * 3] + nx; poly[k * 2 + 1] = run[k * 3 + 1] + ny;
      poly[(2 * n - 1 - k) * 2] = run[k * 3] - nx; poly[(2 * n - 1 - k) * 2 + 1] = run[k * 3 + 1] - ny;
    }
    return poly;
  };
  // Contours as pen strokes: resampled, broken every hand's length with a
  // small overlap, heavy where the form turns into shadow, thin in the light.
  const contour = (list, pts, w, jit) => {
    if (pts.length < 2) return;
    const dense = [pts[0]];
    for (let k = 1; k < pts.length; k++) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], m = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
      for (let j = 1; j <= m; j++) dense.push([x0 + (x1 - x0) * j / m, y0 + (y1 - y0) * j / m]);
    }
    let run = [], len = 0, reach = 60 + R2() * 120;
    const q = jitter(dense, jit);
    for (let k = 0; k < q.length; k++) {
      const [x, y] = q[k];
      if (run.length) len += Math.hypot(x - run[run.length - 3], y - run[run.length - 2]);
      run.push(x, y, w * (0.7 + 0.8 * pen[clamp(y | 0, 0, H - 1) * W + clamp(x | 0, 0, W - 1)]));
      if (len >= reach && k < q.length - 3) { list.push(fillStroke(run, 0)); run = run.slice(-6); len = 0; reach = 60 + R2() * 120; }
    }
    if (run.length >= 6) list.push(fillStroke(run, 0));
  };
  // 3. Ink outlines of the main forms, split wherever a nearer layer covers them.
  const inkWhere = (list, pts, w, jit, ok) => {
    let run = [];
    for (const p of pts) {
      if (ok(idAt(p[0], p[1]))) run.push(p); else { contour(list, run, w, jit); run = []; }
    }
    contour(list, run, w, jit);
  };
  for (const f of sc.far) inkWhere(outlineOps, f.pts.filter(p => p[1] < waterY - 1), 0.7, 0.4, id => id === FAR || id === SKY);
  for (const c of sc.crags) {
    inkWhere(outlineOps, c.edge || c.pts.filter(p => p[1] < c.base), 1.7, 0.6, id => id === CRAG || id === SKY || id === FAR || id === WATER);
    if (c.castle) for (const p of c.castle.parts) {
      if (!p.window) inkWhere(outlineOps, p.pts.filter(q => q[1] <= yAt(c.pts, q[0]) + 2), 1.1, 0.25, id => id === CASTLE || id === SKY || id === CRAG);
    }
  }
  const bare = id => id !== TREE && id !== LEAF && id !== ROCK;
  for (const st of sc.structures) {
    inkWhere(outlineOps, closed(st.pts), 1.2, 0.3, bare);
    for (const h of st.holes || []) inkWhere(outlineOps, closed(h), 0.9, 0.2, bare);
  }
  if (sc.fall) inkWhere(outlineOps, sc.fall.pts.filter(q => q[1] < waterY), 0.6, 0.5, id => id === WATER || id === FAR || id === SKY);
  inkWhere(outlineOps, sc.ground, 1.8, 0.6, id => id !== TREE && id !== LEAF);
  for (const rk of sc.rocks) inkWhere(outlineOps, closed(rk.pts), 1.4, 0.5, id => id !== TREE && id !== LEAF);
  for (const t of sc.trees) {
    for (const s of t.segs) {
      if (s[4] < 4) { contour(outlineOps, [[s[0], s[1]], [s[2], s[3]]], Math.max(0.7, s[4]), 0.2); continue; }
      const dx = s[2] - s[0], dy = s[3] - s[1], l = Math.hypot(dx, dy) || 1, px = -dy / l, py = dx / l;
      for (const sg of [1, -1]) contour(outlineOps, [[s[0] + px * sg * s[4] / 2, s[1] + py * sg * s[4] / 2], [s[2] + px * sg * s[5] / 2, s[3] + py * sg * s[5] / 2]], 1.3, 0.3);
    }
  }
  ready(1, outlineOps);
  await tick();
  if (token.cancelled) return false;
  Object.assign(s, {
    dirs, groups, fillStroke, tour, passes
  });
  return true;
}

Object.assign(B, {
  renderInk
});
})(this);

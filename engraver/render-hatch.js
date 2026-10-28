// Render stage 5b: streamline hatching in three passes per layer.
(function (root) {
'use strict';

const node = typeof module !== 'undefined';
const B = node ? require('./core.js') : root.EngraverParts;
const {
  FAR, CRAG, CASTLE, WATER, ROCK, clamp, BANDS, hatchTurn
} = B;

// Returns false when the drawing was cancelled part way.
async function renderHatch(s) {
  const { W, H } = B;
  const {
    token, sc, N, R2, ready, ids, box, pen, dirs, groups, fillStroke, tour, passes
  } = s;
  const SL = (typeof window !== 'undefined' ? window.streamlines : typeof globalThis !== 'undefined' ? globalThis.streamlines : root.streamlines)?.default || root?.streamlines?.default || (typeof streamlines !== 'undefined' ? streamlines.default : null);
  if (!SL) throw new Error('Streamline library failed to load.');
  for (const gr of groups) {
    const bx = box[gr.id], dir = dirs[gr.id];
    if (bx[2] < bx[0] || (gr.id === ROCK && !sc.rocks.length) || (gr.id === CRAG && !sc.crags.length)) continue;
    for (let f = 0; f < 3; f++) {
      const [d0, d1] = BANDS[f];
      const ok = (x, y) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return -1;
        const i = (y | 0) * W + (x | 0);
        return ids[i] === gr.id && pen[i] >= d0 ? i : -1;
      };
      const seeds = [];
      for (let y = bx[1]; y <= bx[3]; y += 9) for (let x = bx[0]; x <= bx[2]; x += 9) {
        const sx = x + R2() * 8, sy = y + R2() * 8;
        if (ok(sx, sy) >= 0 && ok(sx - 3, sy) >= 0 && ok(sx + 3, sy) >= 0 && ok(sx, sy - 3) >= 0 && ok(sx, sy + 3) >= 0) seeds.push({ x: sx, y: sy });
      }
      if (!seeds.length) continue;
      // One flow, then each line leaves it. Direction wanders, the line sits
      // off the even gap, and the nib swells through the stroke.
      const lines = [], placed = [];
      let pending = seeds, runs = 0, idle = 0;
      while (pending.length && !token.cancelled && runs++ < 60 && idle < 15) {
        const before = lines.length;
        const job = SL({
          vectorField: p => {
            if (ok(p.x, p.y) < 0) return;
            const [dx, dy] = dir(p.x, p.y);
            const loosen = gr.id === CASTLE || gr.id === FAR ? 0.16 : 0.5;
            // Water stays a ripple. A square cross would turn the lake into a net.
            const turn = gr.id === WATER ? [0, 0.2, -0.2][f] : hatchTurn(f);
            const a = turn + N.n2(p.x * 0.007, p.y * 0.007 + f * 17) * loosen;
            const cr = Math.cos(a), sr = Math.sin(a);
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
        idle = lines.length > before ? 0 : idle + 1;
      }
      if (token.cancelled) return false;
      for (const pts of lines) {
        // The whole line sits off the ruler. A sine that dies at both ends would
        // snap every stroke back onto the comb.
        const shift = (R2() - 0.5) * gr.sp * 1.35;
        let run = [], len = 0, gap = R2() * 6, reach = gr.pen[0] + R2() * (gr.pen[1] - gr.pen[0]);
        const cut = (lift = true) => {
          const n = run.length / 3;
          if (len >= Math.min(8, gr.pen[0])) {
            const bow = (R2() - 0.5) * gr.sp * 0.45, o = R2() * 1000;
            const ex = run[run.length - 3] - run[0], ey = run[run.length - 2] - run[1], el = Math.hypot(ex, ey) || 1;
            for (let k = 0; k < n; k++) {
              const t = n <= 1 ? 0 : k / (n - 1);
              const off = shift + bow * Math.sin(Math.PI * t) + N.n2(k * 0.07, o) * gr.sp * 0.12;
              run[k * 3] += -ey / el * off;
              run[k * 3 + 1] += ex / el * off;
              run[k * 3 + 2] *= 0.55 + 0.8 * Math.sin(Math.PI * t);
            }
            passes[f].push(fillStroke(run, gr.id));
          }
          if (run.length && lift) gap = 1.5 + R2() * 3.5;
          run = []; len = 0;
          reach = gr.pen[0] + R2() * (gr.pen[1] - gr.pen[0]);
        };
        for (let k = 0; k < pts.length; k++) {
          const [x, y] = pts[k], step = k ? Math.hypot(x - pts[k - 1][0], y - pts[k - 1][1]) : 0;
          if (gap > 0) { gap -= step; continue; }
          const i = ok(x, y), lv = i < 0 ? -1 : (pen[i] - d0) / (d1 - d0);
          if (lv < (run.length ? 0 : 0.1)) { cut(); continue; }
          if (run.length && len >= reach) { const last = run.slice(-6); cut(false); run.push(...last); len = 0; }
          if (run.length) len += step;
          run.push(x, y, gr.wk * (0.5 + 1.6 * Math.pow(clamp(lv), 1.3)));
        }
        cut();
      }
    }
  }
  passes.forEach((list, f) => ready(2 + f, tour(list)));
  return true;
}

Object.assign(B, {
  renderHatch
});
})(this);

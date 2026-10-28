// render(canvas, seed, opts): builds the stroke lists stage by stage and replays
// them. Stage 1 (pencil underdrawing) lives here; later stages are render-*.js.
(function (root) {
'use strict';

const node = typeof module !== 'undefined';
const B = node ? require('./core.js') : root.EngraverParts;
if (node) { require('./scene.js'); require('./player.js'); require('./render-tone.js'); require('./render-ink.js'); require('./render-hatch.js'); require('./render-details.js'); }
const {
  MARGIN, INK, PAPER, GRAPHITE, PHASES, mulberry32, noiseFor, freehandStroke, fillOutline,
  smoothPolyline, roadAt, makeScene, tick, play, hash
} = B;

async function render(canvas, seed, { onProgress = () => {}, token = {}, overlay = null } = {}) {
  const sc = makeScene(seed), N = noiseFor(seed), R2 = mulberry32((seed + 7919) >>> 0);
  // Own stream. Taper picks must not shift the stroke breaks on R2.
  const Rtap = mulberry32((seed + 0x51A9) >>> 0);
  const { sun, waterY, sky } = sc;
  // makeScene above has set the plate size for this seed.
  const { W, H } = B;
  canvas.width = W; canvas.height = H;
  if (overlay) { overlay.width = W; overlay.height = H; }
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);

  // Subtle antique paper patina & plate wiping tone
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

  const phases = PHASES.map(([name, ms, hands]) => ({ name, ms, handCount: hands, hands: null, ready: false }));
  const player = play(ctx, phases, token, onProgress, overlay, seed);
  const [pencilOps, outlineOps, , , , detailOps, printOps] = phases.map(() => []);

  const ready = (i, list) => {
    const strokes = list.map(o => (typeof o === 'function' ? { n: 1, len: 12, draw: o } : o));
    const k = phases[i].handCount, sum = strokes.reduce((a, st) => a + st.len, 0), hands = Array.from({ length: k }, () => []);
    let acc = 0;
    for (const st of strokes) { hands[Math.min(k - 1, Math.floor(acc / (sum || 1) * k))].push(st); acc += st.len; }
    phases[i].hands = hands; phases[i].ready = true;
  };

  // Hand tremor micro-displacement: removes mechanical straightness from lines
  let jo = 0;
  const jitter = (pts, jit = 0.5) => {
    jo += 11.3;
    return pts.map(([x, y], i) => {
      const tremorX = N.n2(i * 0.25, jo) * jit * 0.6 + N.s2(x * 0.005, y * 0.005) * jit * 0.4;
      const tremorY = N.n2(jo, i * 0.25) * jit * 0.6 + N.s2(y * 0.005, x * 0.005) * jit * 0.4;
      return [x + tremorX, y + tremorY];
    });
  };

  // Pencil and detail marks. The hatch stays on runPoly. A growing mark is drawn on the
  // overlay, then filled once, so graphite alpha is not stamped on every frame.
  const lineStroke = (pts, w, color, isPencil = false) => {
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    const smoothed = isPencil ? smoothPolyline(pts, 0.3, 3) : pts;
    const taper = Math.max(2, Math.min(14, len * 0.16));
    const opts = {
      size: w, thinning: isPencil ? 0.35 : 0.55, smoothing: 0.5, streamline: 0.5, simulatePressure: true,
      start: { taper, cap: true }, end: { taper, cap: true },
    };
    const stroke = {
      n: smoothed.length, len: Math.max(1, len), ink: color, partial: null,
      tip: k => smoothed[Math.min(k, smoothed.length - 1)],
      draw: (c, a, b) => {
        const end = Math.max(1, b);
        const outline = freehandStroke(smoothed.slice(0, end + 1), opts);
        if (end < smoothed.length - 1) { stroke.partial = outline; return; }
        stroke.partial = null;
        fillOutline(c, outline, color);
      },
    };
    return stroke;
  };

  const lineOps = (list, pts, w, color, jit, isPencil = false) => {
    if (pts.length >= 2) list.push(lineStroke(jitter(pts, jit), w, color, isPencil));
  };
  const segsOp = (segs, w) => c => {
    c.strokeStyle = INK; c.lineWidth = w; c.lineCap = 'round'; c.beginPath();
    for (const s of segs) { c.moveTo(s[0], s[1]); for (let k = 2; k < s.length; k += 2) c.lineTo(s[k], s[k + 1]); }
    c.stroke();
  };
  const fillOp = pts => c => { c.fillStyle = INK; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); };
  const closed = pts => [...pts, pts[0]];
  const every = (pts, n) => pts.filter((_, i) => i % n === 0 || i === pts.length - 1);

  // 1. Pencil underdrawing: light, searching attempts with hand tremor and organic bowing
  const pencil = pts => {
    if (pts.length < 2) return;
    const ext = (p, q, d) => { const l = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1; return [p[0] + (p[0] - q[0]) / l * d, p[1] + (p[1] - q[1]) / l * d]; };
    for (let a = 0, n = 2 + (R2() < 0.4 ? 1 : 0); a < n; a++) {
      const cut = Math.floor(R2() * pts.length * 0.12);
      const body = a ? pts.slice(a === 1 ? cut : 0, pts.length - (a === 1 ? 0 : cut)) : pts;
      if (body.length < 2) continue;
      const line = [ext(body[0], body[1], 4 + R2() * 12), ...body, ext(body[body.length - 1], body[body.length - 2], 4 + R2() * 12)];
      lineOps(pencilOps, line, 0.8, GRAPHITE, 1.2 + a * 1.4, true);
    }
  };
  pencil([[MARGIN, waterY], [W / 2, waterY + 1], [W - MARGIN, waterY]]);
  for (const f of sc.far) pencil(every(f.pts, 2));
  if (sc.fall) pencil(closed(sc.fall.pts));
  for (const st of sc.structures) { pencil(closed(st.pts)); for (const h of st.holes || []) pencil(closed(h)); }
  for (const c of sc.crags) {
    pencil(every(c.edge || c.pts, 2));
    if (c.castle) for (const p of c.castle.parts) if (!p.window) pencil(closed(p.pts));
  }
  pencil(every(sc.ground, 2));
  if (sc.road) for (const side of [-0.5, 0.5]) {
    const pts = [];
    for (let s = 0; s <= 1.0001; s += 0.04) { const q = roadAt(sc.road, s); pts.push([q.x + side * q.w, q.y]); }
    pencil(pts);
  }
  for (const rk of sc.rocks) pencil(closed(every(rk.pts, 2)));
  for (const t of sc.trees) {
    for (const s of t.segs) if (s[4] > 2) pencil([[s[0], s[1]], [s[2], s[3]]]);
    for (const c of t.clumps) pencil(closed(every(c, 4)));
  }
  ready(0, pencilOps);
  await tick();
  if (token.cancelled) return player;

  // The later stages share these locals through one state object.
  const s = {
    canvas, seed, token, sc, N, R2, Rtap, sun, waterY, sky, paper, detailOps, printOps, outlineOps,
    ready, jitter, lineOps, segsOp, fillOp, closed
  };
  if (!(await B.renderTone(s))) return player;
  if (!(await B.renderInk(s))) return player;
  if (!(await B.renderHatch(s))) return player;
  B.renderDetails(s);
  return player;
}

Object.assign(B, {
  render
});
})(this);

// Render stages 6 and 7: masonry, foliage, figures and other details, then the
// ink settling into the printed plate.
(function (root) {
'use strict';

const node = typeof module !== 'undefined';
const B = node ? require('./core.js') : root.EngraverParts;
if (node) { require('./figures.js'); }
const {
  MARGIN, INK, CRAG, CASTLE, GROUND, LEAF, clamp, yAt, riderShape, pilgrimShape, hatchedFigure,
  inkPrint, leafOp
} = B;

function renderDetails(s) {
  const { W, H } = B;
  const {
    canvas, seed, sc, N, R2, sun, paper, detailOps, printOps, ready, lineOps, segsOp, fillOp, tone,
    idAt, moonR
  } = s;
  // 6. Architectural masonry, fissures, organic foliage, figures with drapery
  const masonry = pts => {
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const a = Math.min(...xs), b = Math.max(...xs), segs = [];
    for (let y = Math.min(...ys) + 4; y < Math.max(...ys); y += 5 + R2()) {
      for (let x = a + R2() * 6; x < b; x += 6 + R2() * 10) {
        const e = Math.min(b, x + 4 + R2() * 8), mx = (x + e) / 2;
        if (R2() < 0.7 && idAt(mx, y) === CASTLE && tone[clamp(y | 0, 0, H - 1) * W + clamp(mx | 0, 0, W - 1)] > 0.45) {
          // Subtle hand tremor and weathered stone displacement
          const tremorY = N.s2(x * 0.05, y * 0.05) * 0.8;
          segs.push([x, y + tremorY, e, y + tremorY + R2() - 0.5]);
        }
      }
    }
    if (segs.length) detailOps.push(segsOp(segs, 0.45));
  };
  for (const c of sc.crags) {
    const n = 20 + Math.floor(R2() * 26);
    for (let k = 0; k < n; k++) {
      const src = c.edge || c.pts, [sx, sy] = src[Math.floor(R2() * src.length)];
      let x = sx, y = sy + 3, a = Math.PI / 2 + (R2() - 0.5) * 1.2;
      const pts = [[x, y]], len = H * (0.04 + R2() * 0.2);
      for (let s = 0; s < len; s += 4) {
        a += (R2() - 0.5) * 0.5; x += Math.cos(a) * 4; y += Math.sin(a) * 4;
        if (idAt(x, y) !== CRAG) break;
        pts.push([x, y]);
      }
      lineOps(detailOps, pts, 0.5 + R2() * 1.0, INK, 0.3);
    }
    if (!c.castle) continue;
    for (const p of c.castle.parts) {
      if (p.window) { detailOps.push(fillOp(p.pts)); continue; }
      if (p.flag) {
        const [fx, fy] = p.flag, dir = sun.x < fx ? 1 : -1;
        detailOps.push(segsOp([[fx, fy, fx, fy - 14]], 0.9), fillOp([[fx, fy - 14], [fx + dir * 11, fy - 11 + R2() * 2], [fx, fy - 8]]));
      }
      if (p.masonry) masonry(p.pts);
    }
  }
  for (const st of sc.structures) if (st.masonry) masonry(st.pts);
  for (const rk of sc.rocks) {
    const [sx, sy] = rk.pts[Math.floor(R2() * 12)];
    lineOps(detailOps, [[sx, sy], [sx + (rk.x - sx) * 0.4, sy + rk.size * 0.3], [sx + (rk.x - sx) * 0.6, sy + rk.size * 0.5]], 0.8, INK, 0.3);
  }
  for (const v of sc.vines || []) {
    lineOps(detailOps, v, 1, INK, 0.4);
    const dark = [], open = [];
    for (const [x, y] of v) for (let k = 0; k < 2; k++) {
      const lx = x + (R2() - 0.5) * 9, ly = y + (R2() - 0.5) * 7, rr = 1.6 + R2() * 1.8, a = R2() * 6.28;
      (R2() < 0.6 ? dark : open).push([lx, ly, rr, a]);
    }
    detailOps.push(c => { c.fillStyle = INK; c.beginPath(); for (const [x, y, rr, a] of dark) { c.moveTo(x + rr, y); c.ellipse(x, y, rr, rr * 0.6, a, 0, 6.29); } c.fill(); });
    detailOps.push(leafOp(open));
  }
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
  for (const { x: fx, y: fy, h, kind, face } of sc.figures) {
    const sd = sun.x < fx ? 1 : -1;
    const shape = kind === 'rider' ? o => riderShape(o, fx, fy, h, face, N) : o => pilgrimShape(o, fx, fy, h, N);
    const reach = kind === 'rider' ? 0.75 : 0.5;
    detailOps.push(c => {
      hatchedFigure(c, fx, fy, h, sd, shape);
      c.strokeStyle = INK; c.lineWidth = 0.7; c.beginPath();
      for (let k = 0; k < 4; k++) { c.moveTo(fx + sd * h * 0.05, fy + k * 1.6); c.lineTo(fx + sd * h * (reach - k * 0.08), fy + k * 1.6); }
      c.stroke();
    });
  }
  if (sc.night) {
    const ring = [];
    for (let k = 0; k <= 40; k++) ring.push([sun.x + Math.cos(k / 40 * 6.283) * moonR, sun.y + Math.sin(k / 40 * 6.283) * moonR]);
    lineOps(detailOps, ring, 0.8, INK, 0.2);
  }
  for (const [x, y, s] of sc.birds) {
    detailOps.push(c => {
      c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x - s, y);
      c.quadraticCurveTo(x - s / 2, y - s / 2, x, y); c.quadraticCurveTo(x + s / 2, y - s / 2, x + s, y); c.stroke();
    });
  }

  // Intaglio plate deboss & bevel impression (the physical imprint of the copper plate)
  printOps.push(c => {
    c.restore();
    // Outer margin unpressed rag paper
    c.save();
    // Top & left deboss shadow
    c.strokeStyle = 'rgba(45, 32, 18, 0.22)'; c.lineWidth = 2.0;
    c.beginPath();
    c.moveTo(MARGIN - 2, H - MARGIN + 2); c.lineTo(MARGIN - 2, MARGIN - 2); c.lineTo(W - MARGIN + 2, MARGIN - 2);
    c.stroke();
    // Bottom & right deboss highlight
    c.strokeStyle = 'rgba(255, 252, 240, 0.32)'; c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(W - MARGIN + 2, MARGIN - 2); c.lineTo(W - MARGIN + 2, H - MARGIN + 2); c.lineTo(MARGIN - 2, H - MARGIN + 2);
    c.stroke();

    // Classical engraved plate borders
    c.strokeStyle = INK;
    c.lineWidth = 1.6; c.strokeRect(MARGIN, MARGIN, W - 2 * MARGIN, H - 2 * MARGIN);
    c.lineWidth = 0.7; c.strokeRect(MARGIN - 8, MARGIN - 8, W - 2 * MARGIN + 16, H - 2 * MARGIN + 16);
    c.fillStyle = INK; c.font = 'italic 17px "IM Fell English", Georgia, serif'; c.textAlign = 'right';
    c.fillText(`Pl. ${seed}`, W - MARGIN, H - 12);
    c.restore();
  });
  ready(5, detailOps);

  // 7. Let the ink settle: where hatching is nearly solid, the wet lines run
  // together into a black. Fades in.
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
  ready(6, printOps);
}

Object.assign(B, {
  renderDetails
});
})(this);

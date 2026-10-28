// Small figures: horse and rider, pilgrim, and the hatched silhouette helper.
(function (root) {
'use strict';

const node = typeof module !== 'undefined';
const B = node ? require('./core.js') : root.EngraverParts;
const {
  INK, smooth
} = B;

const HORSE = [[-0.46, -0.64], [-0.3, -0.66], [0, -0.62], [0.22, -0.66], [0.36, -0.8], [0.46, -0.97], [0.47, -1.04], [0.51, -0.98],
  [0.66, -0.8], [0.7, -0.72], [0.62, -0.69], [0.52, -0.74], [0.4, -0.58], [0.38, -0.46], [0.2, -0.38], [-0.3, -0.38], [-0.46, -0.44], [-0.52, -0.56]];
const HORSE_LIMBS = [
  [[0.34, -0.44], [0.4, -0.2], [0.38, 0], 0.06], [[0.26, -0.42], [0.2, -0.2], [0.24, -0.02], 0.055],
  [[-0.4, -0.46], [-0.36, -0.22], [-0.44, 0], 0.07], [[-0.3, -0.44], [-0.24, -0.22], [-0.28, 0], 0.06],
  [[-0.48, -0.6], [-0.6, -0.4], [-0.58, -0.2], 0.06], [[0.02, -0.64], [0.1, -0.5], [0.08, -0.4], 0.07],
];
const RIDER = [[-0.06, -0.64], [0.09, -0.64], [0.08, -0.95], [-0.04, -0.97]];
const CLOAK = [[-0.05, -0.95], [-0.36, -0.6], [-0.18, -0.58], [0, -0.66]];

function riderShape(c, x, y, h, face, N) {
  const s = h / 1.2, P = ([u, v]) => [x + u * s * face, y + v * s];
  const fill = pts => { c.beginPath(); pts.map(P).forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.closePath(); c.fill(); };
  c.fillStyle = INK; c.strokeStyle = INK; c.lineCap = 'round'; c.lineJoin = 'round';
  fill(HORSE); fill(RIDER);
  // Billowing organic cloak with wind flutter
  const windFlutter = N ? N.s2(x * 0.05, y * 0.05) * 0.06 : 0;
  const dynamicCloak = [[-0.05, -0.95], [-0.38 - windFlutter, -0.62], [-0.18, -0.58], [0, -0.66]];
  fill(dynamicCloak);
  for (const [a, b, e, w] of HORSE_LIMBS) {
    c.lineWidth = Math.max(0.8, w * s); c.beginPath();
    c.moveTo(...P(a)); c.quadraticCurveTo(...P(b), ...P(e)); c.stroke();
  }
  c.beginPath(); c.arc(...P([0.02, -1.04]), 0.075 * s, 0, 7); c.fill();
  c.lineWidth = Math.max(0.7, 0.02 * s); c.beginPath(); c.moveTo(...P([-0.25, -0.45])); c.lineTo(...P([0.5, -1.6])); c.stroke();
  fill([[0.5, -1.6], [0.72, -1.52], [0.48, -1.47]]);
}

function pilgrimShape(c, x, y, h, N) {
  c.fillStyle = INK; c.strokeStyle = INK; c.lineCap = 'round';
  const windFlutter = N ? N.s2(x * 0.04, y * 0.04) * 0.04 : 0;
  c.beginPath();
  c.moveTo(x - h * 0.11, y - h * 0.78);
  c.quadraticCurveTo(x - h * (0.2 + windFlutter), y - h * 0.3, x - h * 0.19, y);
  c.lineTo(x + h * 0.17, y);
  c.quadraticCurveTo(x + h * 0.16, y - h * 0.4, x + h * 0.1, y - h * 0.78);
  c.closePath(); c.fill();
  c.beginPath(); c.arc(x, y - h * 0.88, h * 0.09, 0, 7); c.fill();
  c.lineWidth = Math.max(0.8, h * 0.025);
  c.beginPath(); c.moveTo(x + h * 0.26, y + 1); c.lineTo(x + h * 0.21, y - h * 1.05); c.stroke();
}

function hatchedFigure(c, x, y, h, sd, shape) {
  if (h < 22) { shape(c); return; }
  const x0 = Math.floor(x - h * 0.85), y0 = Math.floor(y - h * 1.45), bw = Math.ceil(h * 1.7) + 2, bh = Math.ceil(h * 1.47) + 4;
  const off = document.createElement('canvas');
  off.width = bw; off.height = bh;
  const o = off.getContext('2d', { willReadFrequently: true });
  o.translate(-x0, -y0); shape(o); o.setTransform(1, 0, 0, 1, 0, 0);
  const mask = o.getImageData(0, 0, bw, bh).data;
  o.clearRect(0, 0, bw, bh);
  o.strokeStyle = INK; o.lineCap = 'round';
  for (let k = -bh; k < bw; k += 2.2) {
    for (let t = 0; t < bh; t += 3) {
      const px = k + t * 0.55, u = (px - (x - x0)) / (h * 0.35);
      o.lineWidth = 0.35 + 1.5 * smooth(-0.8, 0.6, sd * u);
      o.beginPath(); o.moveTo(px, t); o.lineTo(px + 1.65, t + 3); o.stroke();
    }
  }
  const img = o.getImageData(0, 0, bw, bh), d = img.data, A = i => mask[i * 4 + 3];
  for (let i = 0, n = bw * bh; i < n; i++) {
    const a = A(i), px = i % bw;
    if (!a) { d[i * 4 + 3] = 0; continue; }
    const edge = px === 0 || px === bw - 1 || i < bw || i >= n - bw || !A(i - 1) || !A(i + 1) || !A(i - bw) || !A(i + bw);
    d[i * 4] = 0x1c; d[i * 4 + 1] = 0x14; d[i * 4 + 2] = 0x0d;
    d[i * 4 + 3] = edge ? a : Math.min(a, d[i * 4 + 3]);
  }
  o.putImageData(img, 0, 0);
  c.drawImage(off, x0, y0);
}

Object.assign(B, {
  riderShape, pilgrimShape, hatchedFigure
});
})(this);

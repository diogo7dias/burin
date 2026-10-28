// Replays stroke lists slowly with a moving nib, so the plate appears the way
// an engraver would work it.
(function (root) {
'use strict';

const node = typeof module !== 'undefined';
const B = node ? require('./core.js') : root.EngraverParts;
const {
  LIFT, mulberry32, handLag, handTravel, smooth, fillOutline
} = B;

function play(ctx, phases, token, onProgress, overlay, seed) {
  const total = phases.reduce((a, p) => a + p.ms, 0);
  const oc = overlay && overlay.getContext('2d');
  const roll = mulberry32((seed + 0xBEE) >>> 0);
  return new Promise(resolve => {
    let pi = 0, t0 = null, before = 0, hs = null, clock = 0;
    const finish = ok => { if (oc) oc.clearRect(0, 0, B.W, B.H); resolve(ok); };
    function frame(now) {
      if (token.cancelled) return finish(false);
      const started = performance.now();
      let out = false;
      while (pi < phases.length && !out) {
        const ph = phases[pi];
        if (!ph.ready) break;
        if (t0 === null) t0 = now;
        if (!hs) hs = ph.hands.map((list, hi) => ({
          list, i: 0, at: 0, done: 0, total: list.reduce((a, st) => a + st.len + LIFT, 0),
          lag: handLag(hi, ph.hands.length, roll()),
        }));
        const f = token.skip ? 1 : Math.min(1, (now - t0) / ph.ms);
        clock = f;
        let left = 0;
        for (const h of hs) {
          const target = f >= 1 ? Infinity : handTravel(f, h.lag) * h.total;
          while (h.i < h.list.length) {
            const st = h.list[h.i], into = target - h.done;
            if (into <= 0) break;
            const frac = Math.min(1, into / st.len);
            if (st.n === 1) { if (!h.at) { st.draw(ctx); h.at = 1; } }
            else {
              const k = Math.round(smooth(0, 1, frac) * (st.n - 1));
              if (k > h.at) { st.draw(ctx, h.at, k); h.at = k; }
            }
            if (target < h.done + st.len + LIFT) break;
            h.done += st.len + LIFT; h.i++; h.at = 0;
            if (token.skip && (h.i & 31) === 0 && performance.now() - started > 40) { out = true; break; }
          }
          left += h.list.length - h.i;
          if (out) break;
        }
        onProgress((before + ph.ms * f) / total, ph.name);
        if (out || left) break;
        before += ph.ms; pi++; t0 = now; hs = null;
      }
      if (oc) {
        oc.clearRect(0, 0, B.W, B.H);
        if (hs && !token.skip) for (const h of hs) {
          const st = h.list[h.i];
          if (st && st.partial) fillOutline(oc, st.partial, st.ink);
          if (handTravel(clock, h.lag) <= 0) continue;
          const tip = st && st.tip && st.tip(h.at);
          if (tip) drawNib(oc, tip[0], tip[1], phases[pi].name === 'pencil');
        }
      }
      if (pi >= phases.length) return finish(true);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

function drawNib(c, x, y, pencil) {
  c.save();
  c.translate(x, y); c.rotate(-1.0);
  for (const shadow of [true, false]) {
    c.save();
    if (shadow) { c.translate(10, 14); c.globalAlpha = 0.18; }
    const tone = (a, b) => (shadow ? '#000' : pencil ? a : b);
    c.fillStyle = tone('#7b5a36', '#4a3222');
    c.fillRect(pencil ? 24 : 30, -6, 150, 12);
    c.fillStyle = tone('#d8bb8c', '#8c8a86');
    c.beginPath();
    if (pencil) { c.moveTo(0, 0); c.lineTo(24, -6); c.lineTo(24, 6); }
    else { c.moveTo(0, 0); c.lineTo(18, -5); c.lineTo(30, -5); c.lineTo(30, 5); c.lineTo(18, 5); }
    c.closePath(); c.fill();
    if (!shadow) {
      c.fillStyle = pencil ? '#3a3632' : '#2a2724';
      c.beginPath(); c.moveTo(0, 0); c.lineTo(pencil ? 7 : 12, -2); c.lineTo(pencil ? 7 : 12, 2); c.closePath(); c.fill();
      if (!pencil) { c.strokeStyle = '#2a2724'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(4, 0); c.lineTo(20, 0); c.stroke(); }
    }
    c.restore();
  }
  c.restore();
}

Object.assign(B, {
  play
});
})(this);

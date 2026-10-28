// Same seed must give the same scene; different seeds must differ.
const assert = require('assert');
const { makeScene } = require('./draw.js');
for (const seed of [1, 42, 999999]) {
  assert.strictEqual(JSON.stringify(makeScene(seed)), JSON.stringify(makeScene(seed)));
}
assert.notStrictEqual(JSON.stringify(makeScene(1)), JSON.stringify(makeScene(2)));
const kinds = new Set();
for (let s = 1; s <= 200; s++) { const sc = makeScene(s); kinds.add(`${sc.hasWater}-${!!sc.crags.find(c => c.castle)}-${sc.trees.length}`); }
assert.ok(kinds.size > 10, 'seeds should vary composition');
console.log('ok', kinds.size, 'compositions');
const seen = new Set();
for (let s = 1; s <= 100; s++) seen.add(makeScene(s).kind);
assert.strictEqual(seen.size, 5, 'all five scene types should appear');
console.log('ok', [...seen].join(', '));
// Road width must stay finite at and just past its far end (float drift).
const { roadAtForTest } = require('./draw.js');
if (roadAtForTest) for (const s of [0, 0.5, 1, 1.0000000000000002]) assert.ok(isFinite(roadAtForTest({ x0: 0, x1: 1, yEnd: 0, amp: 1, k: 1, ph: 0 }, s).w));

// A 45° burin cuts thin along the blade and wide across it.
const { burinBite } = require('./draw.js');
const along = burinBite(1, 1), across = burinBite(-1, 1);
assert.ok(Math.abs(along - 0.45) < 1e-9, `along-nib width ${along}`);
assert.ok(Math.abs(across - 1.31) < 1e-9, `across-nib width ${across}`);
console.log('ok burin', along, across);
const { taperAt } = require('./draw.js');
assert.strictEqual(taperAt(0, 0.2, 0.4, 0.35, 0.3), 0.35);
assert.strictEqual(taperAt(1, 0.2, 0.4, 0.35, 0.3), 0.3);
assert.strictEqual(taperAt(0.5, 0.2, 0.4, 0.35, 0.3), 1);
assert.ok(Math.abs(taperAt(0.8, 0.2, 0.4, 0.35, 0.3) - 0.65) < 1e-9);
console.log('ok taper');
const { handLag, handTravel } = require('./draw.js');
assert.strictEqual(handLag(0, 1, 1), 0);
assert.strictEqual(handLag(0, 2, 0), 0);
assert.strictEqual(handLag(1, 2, 0), 0.16);
assert.strictEqual(handLag(3, 4, 1), 0.24);
assert.strictEqual(handTravel(0.2, 0), 0.2);
assert.strictEqual(handTravel(0.1, 0.16), 0);
assert.strictEqual(handTravel(1, 0.16), 1);
assert.ok(handTravel(0.2, handLag(0, 2, 0)) > handTravel(0.2, handLag(1, 2, 0)) * 3);
console.log('ok hands', handTravel(0.2, 0.16));
const { hatchTurn } = require('./draw.js');
assert.strictEqual(hatchTurn(0), 0);
assert.ok(Math.abs(hatchTurn(1) - Math.PI / 2) < 1e-9);
assert.ok(Math.abs(hatchTurn(2) - (Math.PI / 2 + 0.45)) < 1e-9);
console.log('ok turn', hatchTurn(1));

// Validate index.html inline scripts syntax
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const scripts = html.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi) || [];
for (const s of scripts) {
  if (/<script[^>]*type=["']module["']/.test(s)) continue;
  const code = s.replace(/<script[^>]*>|<\/script>/gi, '');
  assert.doesNotThrow(() => new Function(code), 'index.html inline script syntax error');
}
assert.ok(html.includes('perfect-freehand@1.2.3'), 'page should load perfect-freehand');
const engraverSrc = ['draw.js', ...fs.readdirSync('engraver').map(f => 'engraver/' + f)].map(f => fs.readFileSync(f, 'utf8')).join('\n');
assert.ok(!engraverSrc.includes('function getOrganicStroke'), 'local stroke copy should be gone');
console.log('ok index.html inline scripts syntax valid');

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

// Seeded landscape engraver. makeScene(seed) builds plain data; render() turns it
// into stroke lists (pencil, ink outline, hatching, details) and replays them
// slowly, so the plate appears the way an engraver would work it.
//
// The code lives in engraver/*.js. In the browser, index.html loads those parts
// before this file; under Node, this file requires them. Either way the public
// API is the same Engraver object.
(function (root) {
'use strict';

const node = typeof module !== 'undefined';
if (node) require('./engraver/render.js');
const B = node ? require('./engraver/core.js') : root.EngraverParts;
const { makeScene, render, roadAt, burinBite, taperAt, handLag, handTravel, hatchTurn } = B;

const api = { makeScene, render, W: B.W, H: B.H, roadAtForTest: roadAt, burinBite, taperAt, handLag, handTravel, hatchTurn };
if (node) module.exports = api; else root.Engraver = api;
})(this);

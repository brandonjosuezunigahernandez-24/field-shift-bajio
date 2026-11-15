import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectRegion, simplifyRing, traceOutline } from './detect.js';

// Synthetic "satellite photo": paint(x, y) -> [r, g, b], with a little seeded noise like real fields.
function image(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  let seed = 7;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed / 0x7fffffff - 0.5) * 10;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = r + noise();
      data[i + 1] = g + noise();
      data[i + 2] = b + noise();
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

const bbox = (ring) => {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const GREEN = [70, 130, 60];
const BROWN = [140, 110, 80];

test('a green field among brown ones: the outline follows the field', () => {
  const inField = (x, y) => x >= 60 && x < 150 && y >= 40 && y < 140;
  const img = image(220, 200, (x, y) => (inField(x, y) ? GREEN : BROWN));
  const res = detectRegion({ ...img, seedX: 100, seedY: 90 });
  assert.equal(res.ok, true);
  assert.equal(res.leaked, false);
  const [x0, y0, x1, y1] = bbox(res.ring);
  assert.ok(near(x0, 60, 6) && near(y0, 40, 6) && near(x1, 149, 6) && near(y1, 139, 6), `bbox ${[x0, y0, x1, y1]}`);
  assert.ok(res.ring.length >= 4 && res.ring.length <= 10, `${res.ring.length} corners`);
  assert.ok(near(res.pixels, 90 * 100, 1400), `${res.pixels} px`);
});

test('roads are limits: two fields of the SAME color split by a road stay separate', () => {
  // The whole image is one green; only a vertical road at x = 110 and a horizontal one at y = 100.
  const img = image(220, 200, () => GREEN);
  const roads = new Uint8Array(220 * 200);
  for (let y = 0; y < 200; y++) for (let x = 109; x <= 111; x++) roads[y * 220 + x] = 1;
  for (let x = 0; x < 220; x++) for (let y = 99; y <= 101; y++) roads[y * 220 + x] = 1;
  // closed block: fence the image border too, as the surrounding roads would
  for (let x = 0; x < 220; x++) roads[5 * 220 + x] = 1;
  for (let y = 0; y < 200; y++) roads[y * 220 + 5] = 1;

  const res = detectRegion({ ...img, roads, seedX: 50, seedY: 50 });
  assert.equal(res.ok, true);
  const [x0, y0, x1, y1] = bbox(res.ring);
  assert.ok(x1 < 110 && y1 < 100, `the parcel must stop at the roads, got ${[x0, y0, x1, y1]}`);
  assert.ok(x0 > 5 && y0 > 5);
  assert.equal(res.leaked, false);

  // Without the road mask the same tap takes the whole image: that is what the roads prevent.
  const open = detectRegion({ ...img, seedX: 50, seedY: 50 });
  assert.equal(open.leaked, true);
});

test('a thin track seen in the photo also stops the parcel', () => {
  // Same crop on both sides, a 4 px light dirt track between them.
  const img = image(220, 160, (x) => (x >= 108 && x < 112 ? [215, 200, 170] : GREEN));
  const fence = new Uint8Array(220 * 160);
  for (let x = 0; x < 220; x++) fence[4 * 220 + x] = fence[155 * 220 + x] = 1;
  for (let y = 0; y < 160; y++) fence[y * 220 + 4] = fence[y * 220 + 215] = 1;
  const res = detectRegion({ ...img, roads: fence, seedX: 50, seedY: 80 });
  assert.equal(res.ok, true);
  assert.ok(bbox(res.ring)[2] < 110, `stopped at ${bbox(res.ring)[2]}`);
});

test('a bigger tolerance grows the parcel across a soft change of shade', () => {
  // Left half a bit darker than the right half, as when part of a field is wetter.
  const img = image(200, 120, (x) => (x < 100 ? [70, 130, 60] : [92, 150, 78]));
  const fence = new Uint8Array(200 * 120);
  for (let x = 0; x < 200; x++) fence[4 * 200 + x] = fence[115 * 200 + x] = 1;
  for (let y = 0; y < 120; y++) fence[y * 200 + 4] = fence[y * 200 + 195] = 1;
  const strict = detectRegion({ ...img, roads: fence, seedX: 40, seedY: 60, tolerance: 14, edge: 100 });
  const loose = detectRegion({ ...img, roads: fence, seedX: 40, seedY: 60, tolerance: 60, edge: 100 });
  assert.ok(strict.pixels < loose.pixels, `${strict.pixels} < ${loose.pixels}`);
  assert.ok(bbox(loose.ring)[2] > 150);
});

test('tapping on a road, or out of the image, is refused with a reason', () => {
  const img = image(100, 100, () => GREEN);
  const roads = new Uint8Array(100 * 100).fill(0);
  roads[50 * 100 + 50] = 1;
  assert.deepEqual(detectRegion({ ...img, roads, seedX: 50, seedY: 50 }), { ok: false, reason: 'camino' });
  assert.deepEqual(detectRegion({ ...img, seedX: 0, seedY: 50 }), { ok: false, reason: 'fuera' });
});

test('traceOutline + simplifyRing: a filled rectangle becomes its 4 corners', () => {
  const w = 40;
  const h = 30;
  const mask = new Uint8Array(w * h);
  for (let y = 5; y <= 20; y++) for (let x = 8; x <= 30; x++) mask[y * w + x] = 1;
  const ring = simplifyRing(traceOutline(mask, w, h), 1.5);
  assert.equal(ring.length, 4);
  assert.deepEqual(bbox(ring), [8, 5, 30, 20]);
});

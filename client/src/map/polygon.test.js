import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areaHectares, bounds, outlineGeoJSON, pointInPolygon, polygonCenter, toDiorama } from './polygon.js';

// ~200 m x ~200 m square south of Celaya (0.0018 deg lat ~ 200 m).
const lat0 = 20.47;
const dLon = 200 / (111320 * Math.cos((lat0 * Math.PI) / 180));
const dLat = 200 / 111320;
const square = [
  [-100.81, lat0],
  [-100.81 + dLon, lat0],
  [-100.81 + dLon, lat0 + dLat],
  [-100.81, lat0 + dLat],
];

test('polygonCenter is the average of the corners', () => {
  const c = polygonCenter(square);
  assert.ok(Math.abs(c.lat - (lat0 + dLat / 2)) < 1e-12);
  assert.ok(Math.abs(c.lon - (-100.81 + dLon / 2)) < 1e-12);
});

test('areaHectares: a 200 m square is 4 ha, whatever the corner order', () => {
  assert.ok(Math.abs(areaHectares(square) - 4) < 0.01);
  assert.ok(Math.abs(areaHectares([...square].reverse()) - 4) < 0.01);
  assert.equal(areaHectares(square.slice(0, 2)), 0);
});

test('bounds gives [[west, south], [east, north]]', () => {
  const [[w, s], [e, n]] = bounds(square);
  assert.equal(w, -100.81);
  assert.equal(s, lat0);
  assert.ok(e > w && n > s);
});

test('pointInPolygon', () => {
  const box = [[0, 0], [2, 0], [2, 2], [0, 2]];
  assert.equal(pointInPolygon([1, 1], box), true);
  assert.equal(pointInPolygon([3, 1], box), false);
  const ell = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]];
  assert.equal(pointInPolygon([1.5, 1.5], ell), false);
});

test('toDiorama: east is +x, north is -z, 1 unit = 1 km', () => {
  const [sw, se, ne] = toDiorama(square, lat0, -100.81);
  assert.ok(Math.abs(sw[0]) < 1e-9 && Math.abs(sw[1]) < 1e-9);
  assert.ok(Math.abs(se[0] - 0.2) < 1e-3);
  assert.ok(Math.abs(ne[1] + 0.2) < 1e-3);
});

test('outlineGeoJSON closes the ring and keeps corners as points', () => {
  const fc = outlineGeoJSON(square);
  const polygon = fc.features.find((f) => f.geometry.type === 'Polygon');
  assert.deepEqual(polygon.geometry.coordinates[0][0], polygon.geometry.coordinates[0][4]);
  assert.equal(fc.features.filter((f) => f.geometry.type === 'Point').length, 4);
  assert.equal(outlineGeoJSON(square.slice(0, 2)).features.at(-1).geometry.type, 'LineString');
});

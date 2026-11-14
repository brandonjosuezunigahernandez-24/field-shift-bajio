import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALL_SECTIONS,
  PARCEL_COLORS,
  createParcel,
  farmPoint,
  fitsOneBlock,
  nextParcelId,
  parcelColor,
  parcelLabel,
  parcelsGeoJSON,
  sectionCenter,
  sectionParcels,
} from './parcels.js';

// Two ~200 m squares side by side (~4 ha each).
const lat0 = 20.47;
const dLon = 200 / (111320 * Math.cos((lat0 * Math.PI) / 180));
const dLat = 200 / 111320;
const square = (lon0) => [
  [lon0, lat0],
  [lon0 + dLon, lat0],
  [lon0 + dLon, lat0 + dLat],
  [lon0, lat0 + dLat],
];
const west = createParcel(1, square(-100.81), 'trigo');
const east = createParcel(2, square(-100.81 + dLon));

test('createParcel computes hectares and defaults to maize', () => {
  assert.equal(west.hectareas, 4);
  assert.equal(west.cultivo, 'trigo');
  assert.equal(east.cultivo, 'maiz');
});

test('nextParcelId never reuses an id after a parcel is deleted', () => {
  assert.equal(nextParcelId([]), 1);
  assert.equal(nextParcelId([west, east]), 3);
  assert.equal(nextParcelId([east]), 3);
});

test('farmPoint: center of every corner, and a name with the total area', () => {
  const one = farmPoint([west]);
  assert.match(one.nombre, /^Tu parcela \(4 ha\)$/);
  const both = farmPoint([west, east]);
  assert.match(both.nombre, /^Tus 2 parcelas \(8 ha en total\)$/);
  assert.ok(Math.abs(both.lon - (-100.81 + dLon)) < 1e-9, 'center is on the shared edge');
  assert.ok(Math.abs(both.lat - (lat0 + dLat / 2)) < 1e-9);
});

test('parcelLabel and colors', () => {
  assert.equal(parcelLabel(west, 0), 'Parcela 1 · Trigo · 4 ha');
  assert.equal(parcelColor(1), PARCEL_COLORS[0]);
  assert.equal(parcelColor(PARCEL_COLORS.length + 1), PARCEL_COLORS[0]);
});

test('parcelsGeoJSON closes each ring and carries the color', () => {
  const fc = parcelsGeoJSON([west, east]);
  assert.equal(fc.features.length, 2);
  const ring = fc.features[1].geometry.coordinates[0];
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  assert.equal(fc.features[1].properties.color, parcelColor(2));
});

test('sections: one parcel or all, centered like /api/terreno (3 decimals)', () => {
  assert.deepEqual(sectionParcels([west, east], ALL_SECTIONS), [west, east]);
  assert.deepEqual(sectionParcels([west, east], 2), [east]);
  assert.deepEqual(sectionParcels([west, east], 99), [west, east], 'a deleted parcel falls back to all');
  const c = sectionCenter([east]);
  assert.equal(c.lat, Math.round((lat0 + dLat / 2) * 1000) / 1000);
  assert.equal(String(c.lon).split('.')[1].length <= 3, true);
});

test('fitsOneBlock: neighbors fit, parcels 3 km apart do not', () => {
  assert.equal(fitsOneBlock([west, east]), true);
  const far = createParcel(3, square(-100.81 + 0.03)); // ~3 km east
  assert.equal(fitsOneBlock([west, far]), false);
  assert.equal(fitsOneBlock([far]), true);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALL_SECTIONS,
  MAP_MAX_PLANTS,
  PARCEL_COLORS,
  createParcel,
  cropColorForYear,
  farmPoint,
  farmSummary,
  mapPlantSpots,
  fitsOneBlock,
  nextParcelId,
  parcelColor,
  parcelLabel,
  parcelsGeoJSON,
  raiseHeight,
  raisedParcelsGeoJSON,
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

test('raiseHeight grows with the parcel and stays between 6 and 40 m', () => {
  assert.equal(raiseHeight(0.2), 6);
  assert.equal(raiseHeight(4), 12);
  assert.equal(raiseHeight(5000), 40);
});

test('raisedParcelsGeoJSON: soil block with the crop on top, scaled by the rise animation', () => {
  const fc = raisedParcelsGeoJSON([west, east], new Map([[2, 0.5]]), [0.4, 0.3, 0.2], { trigo: '#d9b44a' });
  const [a, b] = fc.features.map((f) => f.properties);
  assert.equal(a.tierra, '#664d33');
  assert.equal(a.cultivo, '#d9b44a');
  assert.equal(a.suelo_m, 12);
  assert.equal(a.tope_m, 15);
  assert.equal(b.suelo_m, (12 + 1.5) * 0.5, 'newer parcel 1.5 m higher, half way up');
  assert.equal(raisedParcelsGeoJSON([west]).features[0].properties.tierra, '#6b4f3a', 'brown without soil data');
  // A small parcel drawn inside a big one is not hidden: it shares the big height, plus a step.
  const small = createParcel(3, square(-100.81).map(([x, y]) => [x + dLon / 4, y + dLat / 4]).map(([x, y], i) => [x - (i === 1 || i === 2 ? dLon / 2 : 0), y - (i >= 2 ? dLat / 2 : 0)]));
  const [big, inner] = raisedParcelsGeoJSON([west, small]).features.map((f) => f.properties);
  assert.ok(inner.suelo_m > big.suelo_m, 'the newer, smaller parcel stands above the bigger one');
});

test('raisedParcelsGeoJSON evens out the ground height so tops line up (3D relief on)', () => {
  // Parcel 1 stands on ground 5 m higher than parcel 2.
  const ground = new Map([[1, 1755], [2, 1750]]);
  const [a, b] = raisedParcelsGeoJSON([west, east], new Map(), null, {}, ground).features.map((f) => f.properties);
  assert.equal(1755 + a.suelo_m, 1755 + 12);
  assert.equal(1750 + b.suelo_m, 1755 + 12 + 1.5, 'the newer top still ends 1.5 m above, despite lower ground');
  // Missing heights (terrain not loaded yet): no correction at all.
  const partial = raisedParcelsGeoJSON([west, east], new Map(), null, {}, new Map([[1, 1755]]));
  assert.deepEqual(partial.features.map((f) => f.properties.suelo_m), [12, 13.5]);
});

test('farmSummary: side by side parcels add up exactly, by crop', () => {
  const s = farmSummary([west, east]);
  assert.equal(s.estimated, false);
  assert.ok(Math.abs(s.totalHa - 8) < 0.01);
  assert.deepEqual(s.byCrop.map((c) => c.cultivo), ['trigo', 'maiz'].sort((a, b) => (a === 'trigo' ? -1 : 1)));
  assert.equal(s.overlapHa, 0);
  assert.deepEqual(farmSummary([]), { totalHa: 0, byCrop: [], overlapHa: 0, estimated: false });
});

test('farmSummary: a section inside a parcel is not counted twice, and the newest crop wins there', () => {
  // 1 ha of beans (100 x 100 m) drawn inside the 4 ha wheat parcel.
  const d100Lon = 100 / (111320 * Math.cos((lat0 * Math.PI) / 180));
  const d100Lat = 100 / 111320;
  const inner = createParcel(2, [
    [-100.81 + d100Lon / 2, lat0 + d100Lat / 2],
    [-100.81 + d100Lon * 1.5, lat0 + d100Lat / 2],
    [-100.81 + d100Lon * 1.5, lat0 + d100Lat * 1.5],
    [-100.81 + d100Lon / 2, lat0 + d100Lat * 1.5],
  ], 'frijol');
  const s = farmSummary([west, inner]);
  assert.equal(s.estimated, true);
  assert.ok(Math.abs(s.totalHa - 4) < 0.04, `total ${s.totalHa}`);
  const ha = Object.fromEntries(s.byCrop.map((c) => [c.cultivo, c.ha]));
  assert.ok(Math.abs(ha.trigo - 3) < 0.04, `trigo ${ha.trigo}`);
  assert.ok(Math.abs(ha.frijol - 1) < 0.02, `frijol ${ha.frijol}`);
  assert.ok(Math.abs(s.overlapHa - 1) < 0.04);
});

test('the map follows the year: a dry year turns the crop to straw and makes it thinner', () => {
  assert.equal(cropColorForYear('#2f7a3a', 1), '#2f7a3a');
  assert.equal(cropColorForYear('#2f7a3a', 0), '#c7a361');
  const good = raisedParcelsGeoJSON([west], new Map(), null, {}, null, { wet: 1, growth: 1 }).features[0].properties;
  const dry = raisedParcelsGeoJSON([west], new Map(), null, {}, null, { wet: 0, growth: 0.6 }).features[0].properties;
  assert.equal(good.tope_m - good.suelo_m, 3);
  assert.ok(Math.abs(dry.tope_m - dry.suelo_m - 1.8) < 1e-9);
  assert.equal(dry.cultivo, '#c7a361');
});

test('mapPlantSpots: plants inside the outline, capped, with the same result every time', () => {
  const { spots, spacing } = mapPlantSpots(west.contorno, lat0, -100.81, 7);
  assert.ok(spots.length > 100 && spots.length <= MAP_MAX_PLANTS, `${spots.length} plants`);
  assert.ok(spacing >= 6);
  // the 200 m square starts at (0, 0) and goes east (+x) and north (-z)
  assert.ok(spots.every((p) => p.x >= -1 && p.x <= 201 && p.z <= 1 && p.z >= -201));
  assert.deepEqual(mapPlantSpots(west.contorno, lat0, -100.81, 7).spots[3], spots[3]);
});

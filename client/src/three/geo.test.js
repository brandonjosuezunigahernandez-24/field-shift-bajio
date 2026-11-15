import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latLonToXYZ, round2, surfaceFrame, wrapLon, xyzToLatLon } from './geo.js';
import { reliefExaggeration, soilColors, yearState } from './parcelState.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

test('latLonToXYZ matches three.js SphereGeometry texture layout', () => {
  // Texture left edge (u = 0) is lon -180 and sits on -X; the north pole is +Y.
  const [x, y, z] = latLonToXYZ(0, -180);
  assert.ok(close(x, -1) && close(y, 0) && close(z, 0));
  assert.ok(close(latLonToXYZ(90, 0)[1], 1));
  assert.ok(close(latLonToXYZ(0, 0)[0], 1));
});

test('xyzToLatLon is the inverse of latLonToXYZ', () => {
  for (const [lat, lon] of [[20.47, -100.81], [-33.9, 151.2], [0, 0], [60, 179.5], [-10, -179.5]]) {
    const back = xyzToLatLon(latLonToXYZ(lat, lon, 1.7));
    assert.ok(close(back.lat, lat, 1e-9) && close(back.lon, lon, 1e-9), `${lat}, ${lon} -> ${back.lat}, ${back.lon}`);
  }
});

test('wrapLon and round2', () => {
  assert.equal(wrapLon(190), -170);
  assert.equal(wrapLon(-181), 179);
  assert.ok(Object.is(round2(-0.001), 0));
});

test('surfaceFrame is orthonormal, right-handed, and north points to the pole', () => {
  const { east, up, south } = surfaceFrame(20.47, -100.81);
  for (const v of [east, up, south]) assert.ok(close(Math.hypot(...v), 1));
  assert.ok(close(dot(east, up), 0, 1e-4) && close(dot(east, south), 0, 1e-4) && close(dot(up, south), 0, 1e-4));
  const c = cross(east, up); // x * y = z
  assert.ok(close(c[0], south[0], 1e-4) && close(c[1], south[1], 1e-4) && close(c[2], south[2], 1e-4));
  assert.ok(south[1] < 0, 'south must point away from the north pole');
});

const clima = {
  lluvia_pv_mediana_mm: 500,
  lluvia_pv_anual: [
    { anio: 2011, lluvia_mm: 250, seco: true },
    { anio: 2015, lluvia_mm: 600, seco: false },
  ],
};

test('yearState: a dry year is brown with short yellow plants; a wet year is green', () => {
  const dry = yearState(clima, 2011);
  const wet = yearState(clima, 2015);
  assert.equal(dry.seco, true);
  assert.equal(dry.ratio, 0.5);
  assert.equal(dry.growth, 0.7);
  assert.ok(dry.ground[0] > dry.ground[1], 'dry ground is more red than green');
  assert.ok(wet.ground[1] > wet.ground[0], 'wet ground is more green than red');
  assert.ok(dry.tint[2] < 1 && wet.tint[2] === 1);
  assert.ok(wet.rain > dry.rain);
});

test('yearState without data is neutral, never invented', () => {
  const s = yearState(null, 2011);
  assert.equal(s.lluvia_mm, null);
  assert.equal(s.rain, 0);
  assert.equal(s.growth, 1);
});

test('soilColors: clay soils are darker, and urban points show as no data', () => {
  const clay = soilColors({ arcilla_pct: 45, carbono_organico_g_kg: 12, sin_datos: false });
  const sandy = soilColors({ arcilla_pct: 10, carbono_organico_g_kg: 12, sin_datos: false });
  const sum = (c) => c[0] + c[1] + c[2];
  assert.ok(sum(clay.top) < sum(sandy.top));
  assert.equal(soilColors({ sin_datos: true, arcilla_pct: null }).sinDatos, true);
});

test('reliefExaggeration stays between x1 and x10', () => {
  assert.equal(reliefExaggeration(19.4), 4);
  assert.equal(reliefExaggeration(1), 10);
  assert.equal(reliefExaggeration(300), 1);
  assert.equal(reliefExaggeration(0), 1);
});

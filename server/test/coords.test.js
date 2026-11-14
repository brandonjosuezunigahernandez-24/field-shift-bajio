import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cacheKey, parseCoords, round2 } from '../lib/coords.js';
import { HttpError } from '../lib/errors.js';

test('parseCoords rounds to 2 decimals and accepts strings or numbers', () => {
  assert.deepEqual(parseCoords({ lat: '20.4712', lon: '-100.8149' }), { lat: 20.47, lon: -100.81 });
  assert.deepEqual(parseCoords({ lat: 20.475, lon: -100.8 }), { lat: 20.48, lon: -100.8 });
});

test('parseCoords rejects missing, non numeric or out of range values with a 400', () => {
  const bad = [{}, { lat: 'abc', lon: '1' }, { lat: '', lon: '1' }, { lat: '91', lon: '0' }, { lat: '0', lon: '181' }];
  for (const input of bad) {
    assert.throws(
      () => parseCoords(input),
      (err) => err instanceof HttpError && err.status === 400
    );
  }
});

test('cacheKey follows <source>_<lat2>_<lon2>', () => {
  assert.equal(cacheKey('power', 20.47, -100.81), 'power_20.47_-100.81');
  assert.equal(cacheKey('soilgrids', 20.5, -100.8), 'soilgrids_20.50_-100.80');
  assert.equal(cacheKey('power', 20.4712, -100.8149), 'power_20.47_-100.81');
});

test('round2 never returns negative zero', () => {
  assert.ok(Object.is(round2(-0.001), 0));
});

test('terrain uses 3 decimals: cache key and parsed coordinates', () => {
  assert.equal(cacheKey('terrain', 20.4712, -100.8149, 3), 'terrain_20.471_-100.815');
  assert.deepEqual(parseCoords({ lat: '20.4712', lon: '-100.8149' }, { decimals: 3 }), { lat: 20.471, lon: -100.815 });
});

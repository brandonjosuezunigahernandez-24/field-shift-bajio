import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cacheKey, parseCoords, roundTo } from '../lib/coords.js';
import { HttpError } from '../lib/errors.js';

test('parseCoords accepts strings or numbers and does not round (each source does)', () => {
  assert.deepEqual(parseCoords({ lat: '20.4749', lon: '-100.8149' }), { lat: 20.4749, lon: -100.8149 });
  assert.deepEqual(parseCoords({ lat: 20.47, lon: -100.8 }), { lat: 20.47, lon: -100.8 });
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

test('cacheKey follows <source>_<lat>_<lon> with 2 decimals by default', () => {
  assert.equal(cacheKey('power', 20.47, -100.81), 'power_20.47_-100.81');
  assert.equal(cacheKey('soilgrids', 20.5, -100.8), 'soilgrids_20.50_-100.80');
  assert.equal(cacheKey('power', 20.4712, -100.8149), 'power_20.47_-100.81');
  assert.equal(cacheKey('soilgrids', 20.4749, -100.8149, 3), 'soilgrids_20.475_-100.815');
  assert.equal(cacheKey('soilgrids', 20.47, -100.81, 3), 'soilgrids_20.470_-100.810');
});

test('roundTo never returns negative zero', () => {
  assert.ok(Object.is(roundTo(-0.001, 2), 0));
});

test('soil uses 3 decimals in its cache key', () => {
  assert.equal(cacheKey('soilgrids', 20.4712, -100.8149, 3), 'soilgrids_20.471_-100.815');
});

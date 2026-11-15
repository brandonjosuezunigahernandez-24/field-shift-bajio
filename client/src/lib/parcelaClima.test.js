import assert from 'node:assert/strict';
import { test } from 'node:test';
import { climatePeriod, lastCompleteYear } from './parcelaClima.js';

test('lastCompleteYear moves forward every April, like the NASA POWER query', () => {
  assert.equal(lastCompleteYear(new Date(2026, 10, 15)), 2025);
  assert.equal(lastCompleteYear(new Date(2027, 1, 10)), 2025);
  assert.equal(lastCompleteYear(new Date(2027, 3, 2)), 2026);
});

test('climatePeriod shows the years really analyzed, or the expected ones while loading', () => {
  assert.equal(climatePeriod({ periodo: { inicio: 2000, fin: 2024 } }), '2000–2024');
  assert.equal(climatePeriod(null, new Date(2026, 10, 15)), '2000–2025');
});

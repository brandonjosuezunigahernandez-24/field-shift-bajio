import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIXTURE_POINTS } from '../lib/seasons.js';
import { stateAt } from '../lib/state.js';

test('every example and fixture plot falls in the state its name says', () => {
  for (const { nombre, lat, lon } of FIXTURE_POINTS) {
    assert.equal(stateAt(lat, lon), nombre.endsWith('Qro.') ? 'Querétaro' : 'Guanajuato', nombre);
  }
});

test('the state comes from the boundary, not from the longitude', () => {
  // East of -100.45, where the old guess said Querétaro.
  assert.equal(stateAt(21.1006, -100.1564), 'Guanajuato'); // Tierra Blanca, Gto.
  assert.equal(stateAt(21.2177, -99.4734), 'Querétaro'); // Jalpan de Serra, Qro.
});

test('points outside Guanajuato and Querétaro give null', () => {
  const outside = [
    [21.356, -101.93], // Lagos de Moreno, Jal. (inside the old rectangle)
    [20.375, -99.65], // Huichapan, Hgo. (inside the old rectangle)
    [20.67, -103.35], // Guadalajara
    [19.43, -99.13], // Ciudad de México
    [22.15, -100.98], // San Luis Potosí
  ];
  for (const [lat, lon] of outside) assert.equal(stateAt(lat, lon), null, `${lat}, ${lon}`);
});

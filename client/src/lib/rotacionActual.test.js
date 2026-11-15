import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rotacionActualDe } from './rotacionActual.js';

test('rotacionActualDe: last crop then the one sown now, oldest first', () => {
  assert.deepEqual(rotacionActualDe({ ultimo_cultivo: 'frijol', cultivo_actual: 'maiz' }), ['frijol', 'maiz']);
  assert.deepEqual(rotacionActualDe({ cultivo_actual: 'sorgo' }), ['sorgo']);
  assert.deepEqual(rotacionActualDe({ ultimo_cultivo: 'maiz', cultivo_actual: 'maiz' }), ['maiz'], 'the same crop twice is one crop');
});

test('rotacionActualDe: answers that are not a crop are left out', () => {
  assert.deepEqual(rotacionActualDe({ ultimo_cultivo: 'otro', cultivo_actual: 'ninguno' }), []);
  assert.deepEqual(rotacionActualDe({ ultimo_cultivo: 'no_se', cultivo_actual: 'frijol' }), ['frijol']);
  assert.deepEqual(rotacionActualDe({}), []);
  assert.deepEqual(rotacionActualDe(), []);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { predictBadYear, similarMunicipalities } from '../llm/modelo2.js';

test('año seco da mas probabilidad de año malo que año lluvioso', () => {
  const seco = predictBadYear({ estado: 'Guanajuato', cultivo: 'Maíz grano', lluviaPV: 300, medianaPV: 550, tempPV: 21 });
  const humedo = predictBadYear({ estado: 'Guanajuato', cultivo: 'maiz', lluviaPV: 700, medianaPV: 550, tempPV: 21 });
  assert.ok(seco.disponible && humedo.disponible);
  assert.ok(seco.probabilidad > humedo.probabilidad);
  assert.ok(seco.probabilidad <= 1 && humedo.probabilidad >= 0);
});

test('predictBadYear no inventa con datos faltantes o estado sin modelo', () => {
  assert.equal(predictBadYear({ estado: 'Jalisco', cultivo: 'maiz', lluviaPV: 500, medianaPV: 600, tempPV: 20 }).disponible, false);
  assert.equal(predictBadYear({ estado: 'Guanajuato', cultivo: 'maiz', lluviaPV: 500 }).disponible, false);
  assert.equal(predictBadYear().disponible, false);
});

test('similarMunicipalities devuelve k vecinos ordenados y [] sin datos', () => {
  const r = similarMunicipalities({ lluvia_pv: 500, t_anual: 18, solar: 21, suelo_pv: 0.5 }, 3);
  assert.equal(r.length, 3);
  assert.ok(r[0].distancia <= r[2].distancia);
  assert.deepEqual(similarMunicipalities({}), []);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { predictRisk } from '../llm/modelo.js';

test('mas lluvia relativa baja el riesgo de siniestro (maiz, Queretaro)', () => {
  const seco = predictRisk({ estado: 'Querétaro', cultivo: 'maíz', lluviaPV: 300, medianaPV: 600, tempPV: 22 });
  const humedo = predictRisk({ estado: 'Querétaro', cultivo: 'maíz', lluviaPV: 700, medianaPV: 600, tempPV: 22 });
  assert.ok(seco.disponible && humedo.disponible);
  assert.ok(seco.siniestro_pct > humedo.siniestro_pct);
  assert.ok(seco.siniestro_pct <= 100 && humedo.siniestro_pct >= 0);
});

test('no inventa: cultivo sin modelo o datos faltantes -> disponible false', () => {
  assert.equal(predictRisk({ estado: 'Guanajuato', cultivo: 'frijol', lluviaPV: 500, medianaPV: 600 }).disponible, false);
  assert.equal(predictRisk({ estado: 'Jalisco', cultivo: 'maiz', lluviaPV: 500, medianaPV: 600 }).disponible, false);
  assert.equal(predictRisk({ estado: 'Guanajuato', cultivo: 'maiz' }).disponible, false);
  assert.equal(predictRisk().disponible, false);
});

test('el modelo exportado trae metricas contra la linea base', () => {
  const r = predictRisk({ estado: 'Guanajuato', cultivo: 'Maíz grano', lluviaPV: 400, medianaPV: 550, tempPV: 21 });
  assert.equal(r.disponible, true);
  assert.equal(typeof r.validacion.mejora_mae_pct_holdout_2023_2024, 'number');
});

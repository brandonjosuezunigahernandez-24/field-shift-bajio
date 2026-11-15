import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { cropFacts, detectCrop, topCropBySeason } from '../llm/siap.js';

const hasData = existsSync(new URL('../data/siap_resumen.json', import.meta.url));

test('detectCrop reconoce el cultivo aunque venga en plural o con sinónimo', () => {
  assert.equal(detectCrop('¿Cómo le va al maíz de temporal?'), 'maiz');
  assert.equal(detectCrop('precio de los frijoles'), 'frijol');
  assert.equal(detectCrop('cuánto rinde el tomate'), 'jitomate');
  assert.equal(detectCrop('¿Quién ganó el futbol?'), null);
  assert.equal(detectCrop('¿Cuánto rinden las papas?'), 'papa');
  assert.equal(detectCrop('precio del aguacate'), 'aguacate');
});

test('cropFacts devuelve null si la pregunta no habla de un cultivo', () => {
  assert.equal(cropFacts('hola'), null);
});

test('cropFacts trae datos de Guanajuato y Querétaro con pérdida y precio', { skip: !hasData }, () => {
  const f = cropFacts('maíz');
  assert.equal(f.fuente, 'SIAP');
  const estados = new Set(f.grupos.map((g) => g.estado));
  assert.ok(estados.has('Guanajuato') && estados.has('Querétaro'));
  const g = f.grupos[0];
  assert.ok(g.perdida_promedio_pct >= 0 && g.precio_pesos_por_tonelada_ultimo_anio > 0);
  assert.ok(Array.isArray(g.anios_con_perdida_mayor_10_pct));
});

const MOTOR = ['maiz', 'sorgo', 'frijol', 'trigo', 'cebada', 'garbanzo', 'brocoli'];

test('topCropBySeason: lo más sembrado por temporada entre los cultivos del motor, con su % real', { skip: !hasData }, () => {
  assert.deepEqual(topCropBySeason('Guanajuato', 'temporal', MOTOR), [{ cultivo: 'maiz', temporada: 'PV', pct: 58 }]);
  assert.deepEqual(topCropBySeason('Querétaro', 'temporal', MOTOR), [{ cultivo: 'maiz', temporada: 'PV', pct: 91 }]);
  assert.deepEqual(
    topCropBySeason('Guanajuato', 'riego', MOTOR).map((d) => [d.cultivo, d.temporada]),
    [['maiz', 'PV'], ['trigo', 'OI']]
  );
  // En Querétaro la avena es la primera de OI de riego, pero no está en el motor: sale la cebada con su propio %.
  const qro = topCropBySeason('Querétaro', 'riego', MOTOR).find((d) => d.temporada === 'OI');
  assert.equal(qro.cultivo, 'cebada');
  assert.ok(qro.pct > 30 && qro.pct < 50);
  assert.deepEqual(topCropBySeason('Jalisco', 'temporal', MOTOR), []);
});

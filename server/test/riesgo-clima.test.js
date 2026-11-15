import assert from 'node:assert/strict';
import { test } from 'node:test';
import { riesgoPorEscenarios } from '../llm/riesgo-clima.js';

// Clima inventado (solo para la lógica): 25 años de lluvia de verano y temperaturas mensuales.
const lluvias = Array.from({ length: 25 }, (_, i) => 300 + i * 20); // 300 a 780 mm
const clima = {
  lluvia_pv_anual: lluvias.map((lluvia_mm, i) => ({ anio: 2000 + i, lluvia_mm })),
  lluvia_pv_mediana_mm: 540,
  temp_media_mensual: Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, t_media_c: 18 })),
};

test('maíz: da tres escenarios y llueve más = menos daño', () => {
  for (const estado of ['Querétaro', 'Guanajuato']) {
    const r = riesgoPorEscenarios({ estado, cultivo: 'maiz', clima });
    assert.equal(r.escenarios.length, 3);
    const [seco, normal, lluvioso] = r.escenarios;
    assert.ok(seco.lluvia_mm < normal.lluvia_mm && normal.lluvia_mm < lluvioso.lluvia_mm);
    assert.ok(seco.siniestro_pct >= normal.siniestro_pct && normal.siniestro_pct >= lluvioso.siniestro_pct, estado);
    assert.ok(r.escenarios.every((e) => e.siniestro_pct >= 0 && e.siniestro_pct <= 100));
  }
});

test('siempre dice que es riesgo estimado y no un pronóstico', () => {
  const r = riesgoPorEscenarios({ estado: 'Querétaro', cultivo: 'maiz', clima });
  assert.match(r.lectura, /no un pronóstico/);
  assert.match(r.lectura, /Modelo entrenado/);
});

test('la confianza sale de la validación: Querétaro media, Guanajuato baja y con aviso', () => {
  assert.equal(riesgoPorEscenarios({ estado: 'Querétaro', cultivo: 'maiz', clima }).confianza, 'media');
  const g = riesgoPorEscenarios({ estado: 'Guanajuato', cultivo: 'maiz', clima });
  assert.equal(g.confianza, 'baja');
  assert.match(g.lectura, /solo como una referencia/);
});

test('solo maíz: frijol, sorgo y otros devuelven null', () => {
  for (const cultivo of ['frijol', 'sorgo', 'fresa']) assert.equal(riesgoPorEscenarios({ estado: 'Querétaro', cultivo, clima }), null);
});

test('sin clima suficiente o con estado desconocido devuelve null', () => {
  assert.equal(riesgoPorEscenarios({ estado: 'Querétaro', cultivo: 'maiz', clima: { lluvia_pv_anual: [] } }), null);
  assert.equal(riesgoPorEscenarios({ estado: 'Jalisco', cultivo: 'maiz', clima }), null);
});

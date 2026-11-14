import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { explainRecommendation, inferEstado, recommend, simulate } from '../llm/recomendador.js';

// Datos inventados (solo para probar la lógica): 6 años por cultivo, de 2019 a 2024.
function fila(cultivo, ciclo, modalidad, anio, { ha = 1000, rend = 2, precio = 5000, perdida = 0 } = {}) {
  return {
    estado: 'Guanajuato', cultivo, ciclo, modalidad, anio,
    sembrada_ha: ha, cosechada_ha: ha - perdida, siniestrada_ha: perdida,
    volumen_t: (ha - perdida) * rend, rendimiento_t_ha: rend, precio_medio_rural: precio,
  };
}
const years = [2019, 2020, 2021, 2022, 2023, 2024];
const serie = (c, ci, m, opts, perdidas = []) => years.map((y, i) => fila(c, ci, m, y, { ...opts, perdida: perdidas[i] ?? 0 }));
const PV = 'Primavera-Verano';
const filas = [
  ...serie('maiz', PV, 'Temporal', { rend: 3, precio: 7000 }, [0, 400, 0, 0, 500, 0]), // rinde mucho pero tiene años malos
  ...serie('sorgo', PV, 'Temporal', { rend: 2, precio: 6000 }),
  ...serie('frijol', PV, 'Temporal', { rend: 1, precio: 15000 }),
  ...serie('trigo', PV, 'Temporal', { ha: 100, rend: 1, precio: 5000 }), // casi sin superficie: se ignora
  ...serie('maiz', PV, 'Riego', { rend: 9, precio: 6000 }),
  ...serie('frijol', PV, 'Riego', { rend: 2, precio: 15000 }),
  ...serie('trigo', 'Otoño-Invierno', 'Riego', { rend: 6, precio: 6000 }),
  ...serie('garbanzo', 'Otoño-Invierno', 'Riego', { rend: 2, precio: 14000 }),
];

test('temporal: 3 filas de rotación, al menos una leguminosa y sin repetir cultivo seguido', () => {
  const r = recommend({ estado: 'Guanajuato', agua: 'temporal', prioridad: 'riesgo', filas });
  assert.equal(r.rotacion.length, 3);
  assert.ok(r.rotacion.some((x) => ['frijol', 'garbanzo'].includes(x.cultivo)));
  for (let i = 1; i < 3; i++) assert.notEqual(r.rotacion[i].cultivo, r.rotacion[i - 1].cultivo);
  assert.ok(!r.cultivos.some((c) => c.id === 'trigo'), 'un cultivo con 100 ha no debe recomendarse');
});

test('riego: hay filas de primavera-verano y de otoño-invierno cada año', () => {
  const r = recommend({ estado: 'Guanajuato', agua: 'riego', prioridad: 'ganar', filas });
  assert.equal(r.rotacion.length, 6);
  assert.deepEqual(r.rotacion.map((x) => x.temporada), ['PV', 'OI', 'PV', 'OI', 'PV', 'OI']);
});

test('la prioridad cambia el orden: arriesgar menos baja al maíz con años malos', () => {
  const ganar = recommend({ estado: 'Guanajuato', agua: 'temporal', prioridad: 'ganar', filas });
  const riesgo = recommend({ estado: 'Guanajuato', agua: 'temporal', prioridad: 'riesgo', filas });
  const pos = (r, id) => r.cultivos.findIndex((c) => c.id === id);
  assert.ok(pos(riesgo, 'maiz') > pos(ganar, 'maiz'));
});

test('la simulación es repetible y sus rangos tienen sentido', () => {
  const r = recommend({ estado: 'Guanajuato', agua: 'temporal', prioridad: 'riesgo', filas });
  const p = r.prediccion;
  assert.ok(p.ingreso_bruto_3_anios_peor_10_pct_por_ha <= p.ingreso_bruto_3_anios_esperado_por_ha);
  assert.ok(p.ingreso_bruto_3_anios_esperado_por_ha <= p.ingreso_bruto_3_anios_mejor_10_pct_por_ha);
  assert.ok(p.probabilidad_al_menos_un_anio_con_perdida_pct >= 0 && p.probabilidad_al_menos_un_anio_con_perdida_pct <= 100);
  assert.equal(p.ganancia_3_anios_esperada_por_ha, undefined, 'sin costos no hay ganancia');
});

test('con costos de todos los cultivos de la rotación calcula ganancia', () => {
  const base = recommend({ estado: 'Guanajuato', agua: 'temporal', prioridad: 'riesgo', filas });
  const ids = [...new Set(base.rotacion.map((x) => x.cultivo))];
  const costos = Object.fromEntries(ids.map((id) => [id, 3000]));
  const r = recommend({ estado: 'Guanajuato', agua: 'temporal', prioridad: 'riesgo', filas, costos });
  assert.ok(r.prediccion.ganancia_3_anios_esperada_por_ha < r.prediccion.ingreso_bruto_3_anios_esperado_por_ha);
  assert.ok('probabilidad_de_perder_dinero_pct' in r.prediccion);
});

test('entradas inválidas o sin datos devuelven null', () => {
  assert.equal(recommend({ estado: 'Jalisco', agua: 'temporal', prioridad: 'riesgo', filas }), null);
  assert.equal(recommend({ estado: 'Querétaro', agua: 'temporal', prioridad: 'riesgo', filas }), null);
  assert.equal(simulate([], {}), null);
});

test('el texto para el agricultor cita SIAP y avisa los límites', () => {
  const r = recommend({ estado: 'Guanajuato', agua: 'temporal', prioridad: 'ganar', filas });
  const t = explainRecommendation(r, true);
  assert.match(t, /\[SIAP\]/);
  assert.match(t, /sin costos ni inflación/);
  assert.match(t, /confírmalo/);
});

test('inferEstado separa por longitud', () => {
  assert.equal(inferEstado(-100.81), 'Guanajuato');
  assert.equal(inferEstado(-100.39), 'Querétaro');
});

test('con los datos reales del SIAP da una recomendación para Guanajuato y Querétaro', { skip: !existsSync(new URL('../data/siap_resumen.json', import.meta.url)) }, () => {
  for (const estado of ['Guanajuato', 'Querétaro']) {
    const r = recommend({ estado, agua: 'temporal', prioridad: 'riesgo' });
    assert.equal(r.rotacion.length, 3);
    assert.ok(r.rotacion.some((x) => ['frijol', 'garbanzo'].includes(x.cultivo)));
  }
});

test('las hortalizas no se recomiendan por defecto y se avisa', () => {
  const conHortaliza = [...filas, ...serie('jitomate', PV, 'Riego', { rend: 100, precio: 8000 })];
  const base = recommend({ estado: 'Guanajuato', agua: 'riego', prioridad: 'ganar', filas: conHortaliza });
  assert.ok(!base.cultivos.some((c) => c.id === 'jitomate'));
  assert.match(base.notas[0], /No se incluyeron hortalizas/);
  const con = recommend({ estado: 'Guanajuato', agua: 'riego', prioridad: 'ganar', filas: conHortaliza, incluirHortalizas: true });
  assert.ok(con.cultivos.some((c) => c.id === 'jitomate'));
});

test('con riego no se repite el mismo cultivo en la misma temporada dos años seguidos', () => {
  for (const prioridad of ['ganar', 'riesgo', 'suelo', 'agua']) {
    const r = recommend({ estado: 'Guanajuato', agua: 'riego', prioridad, filas });
    for (const temporada of ['PV', 'OI']) {
      const seq = r.rotacion.filter((x) => x.temporada === temporada).map((x) => x.cultivo);
      for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1], `${prioridad} ${temporada}: ${seq.join(',')}`);
    }
  }
});

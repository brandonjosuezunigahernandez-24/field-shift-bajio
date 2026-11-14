import assert from 'node:assert/strict';
import { test } from 'node:test';
import { corroborate } from '../llm/corroboracion.js';
import { explainFarm, recommendFarm } from '../llm/recomendador.js';

// Datos inventados (solo para probar la lógica).
const PV = 'Primavera-Verano';
const years = [2019, 2020, 2021, 2022, 2023, 2024];
const fila = (cultivo, anio, { ha = 5000, rend = 2, precio = 5000, perdida = 0 } = {}) => ({
  estado: 'Guanajuato', cultivo, ciclo: PV, modalidad: 'Temporal', anio,
  sembrada_ha: ha, cosechada_ha: ha - perdida, siniestrada_ha: perdida, volumen_t: (ha - perdida) * rend, rendimiento_t_ha: rend, precio_medio_rural: precio,
});
const serie = (c, o, perdidas = []) => years.map((y, i) => fila(c, y, { ...o, perdida: perdidas[i] ?? 0 }));
const filas = [
  ...serie('maiz', { rend: 3, precio: 7000 }, [0, 800, 0, 0, 900, 0]),
  ...serie('sorgo', { rend: 2, precio: 6000 }),
  ...serie('frijol', { rend: 1, precio: 15000 }),
  ...serie('cebada', { rend: 2, precio: 5500 }),
];

test('corroborate cuenta los años en que NASA y el SIAP coinciden', () => {
  const clima = { lluvia_pv_anual: years.map((anio) => ({ anio, lluvia_mm: anio === 2020 || anio === 2023 ? 300 : 600, seco: anio === 2020 || anio === 2023 || anio === 2021 })) };
  const c = corroborate({ clima, filas, estado: 'Guanajuato', cultivo: 'maiz' });
  assert.deepEqual(c.coinciden, [2020, 2023]); // secos en NASA y con pérdida > 10 % (800 y 900 de 5000 = 16 y 18 %)
  assert.deepEqual(c.solo_nasa, [2021]);
  assert.deepEqual(c.solo_siap, []);
  assert.ok(c.correlacion_lluvia_perdida < 0, 'menos lluvia, más pérdida');
  assert.match(c.lectura, /pista, no una prueba/);
});

test('corroborate devuelve null si hay pocos años en común o no hay clima', () => {
  assert.equal(corroborate({ clima: { lluvia_pv_anual: [{ anio: 2019, lluvia_mm: 500, seco: false }] }, filas, estado: 'Guanajuato', cultivo: 'maiz' }), null);
  assert.equal(corroborate({ clima: null, filas, estado: 'Guanajuato', cultivo: 'maiz' }), null);
});

test('varias parcelas: cada una trae su rotación y no empiezan todas con el mismo cultivo', () => {
  const r = recommendFarm({
    parcelas: [{ id: 1, hectareas: 2 }, { id: 2, hectareas: 3 }, { id: 3, hectareas: 1 }],
    estado: 'Guanajuato', agua: 'temporal', prioridad: 'ganar', filas,
  });
  assert.equal(r.parcelas.length, 3);
  assert.equal(r.hectareas_total, 6);
  const primeros = r.parcelas.map((p) => p.rotacion[0].cultivo);
  assert.equal(new Set(primeros).size, 3, `primer año repartido: ${primeros.join(',')}`);
  for (const p of r.parcelas) assert.ok(p.rotacion.some((x) => ['frijol', 'garbanzo'].includes(x.cultivo)), 'cada parcela lleva una leguminosa');
});

test('varias parcelas: simula la finca completa y la compara con sembrar todo igual', () => {
  const r = recommendFarm({ parcelas: [{ id: 1, hectareas: 2 }, { id: 2, hectareas: 3 }], estado: 'Guanajuato', agua: 'temporal', prioridad: 'riesgo', filas });
  for (const s of [r.repartido, r.igual]) {
    assert.ok(s.ingreso_bruto_3_anios_peor_10_pct_total <= s.ingreso_bruto_3_anios_esperado_total);
    assert.ok(s.ingreso_bruto_3_anios_esperado_total <= s.ingreso_bruto_3_anios_mejor_10_pct_total);
  }
  assert.match(explainFarm(r), /Analicé tus 2 parcelas juntas/);
  assert.match(explainFarm(r), /sembraras en todas lo mismo/);
});

test('el último cultivo de cada parcela se respeta', () => {
  const r = recommendFarm({ parcelas: [{ id: 1, hectareas: 1, ultimo_cultivo: 'maiz' }, { id: 2, hectareas: 1 }], estado: 'Guanajuato', agua: 'temporal', prioridad: 'ganar', filas });
  assert.notEqual(r.parcelas[0].rotacion[0].cultivo, 'maiz');
  assert.notEqual(r.parcelas[0].rotacion[0].cultivo, 'sorgo', 'misma familia que el maíz');
});

test('sin datos o con entradas inválidas devuelve null', () => {
  assert.equal(recommendFarm({ parcelas: [], estado: 'Guanajuato', agua: 'temporal', prioridad: 'ganar', filas }), null);
  assert.equal(recommendFarm({ parcelas: [{ id: 1, hectareas: 1 }], estado: 'Jalisco', agua: 'temporal', prioridad: 'ganar', filas }), null);
});

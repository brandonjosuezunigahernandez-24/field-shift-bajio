import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compararRotaciones } from './comparacion.js';

// The real summaries of Celaya, rain-fed, "arriesgar menos" (POST /api/recomendar).
const resumen = (riesgo, rango, leguminosas, familia_repetida, lluvia_necesaria_mm, ingreso_bruto_mxn_ha) => ({
  riesgo, riesgo_rango: rango, leguminosas, familia_repetida, lluvia_necesaria_mm, ingreso_bruto_mxn_ha,
});
const CELAYA = [
  { id: 'actual', nombre: 'Seguir como siembras hoy', resumen: resumen(0.48, [0.33, 0.64], 0, 2, 1560, 27131) },
  { id: 'recomendada', nombre: 'La que mejor te queda', resumen: resumen(0.12, [0.05, 0.27], 2, 0, 1000, 27104) },
  { id: 'alternativa', nombre: 'La mejor para ganar más', resumen: resumen(0.24, [0.13, 0.4], 1, 0, 1220, 28579) },
];
const medida = (m, id) => m.find((x) => x.id === id);
const mejores = (m) => m.filas.filter((f) => f.esMejor).map((f) => f.id);

test('compararRotaciones: one measure at a time, each with the 3 rotations and the best one named', () => {
  const m = compararRotaciones(CELAYA);
  assert.deepEqual(m.map((x) => x.id), ['riesgo', 'leguminosas', 'familia', 'agua', 'ingreso']);
  const riesgo = medida(m, 'riesgo');
  assert.deepEqual(riesgo.filas.map((f) => f.texto), ['48 % (33–64 %)', '12 % (5–27 %)', '24 % (13–40 %)']);
  assert.deepEqual(riesgo.filas.map((f) => f.nombre), ['Seguir igual', 'Recomendada', 'Otra opción']);
  assert.deepEqual(mejores(riesgo), ['recomendada']);
  assert.equal(riesgo.filas[0].ancho, 1, 'the largest value fills the bar');
  assert.equal(riesgo.filas[1].ancho, 0.25);
  assert.deepEqual(mejores(medida(m, 'leguminosas')), ['recomendada']);
  assert.deepEqual(mejores(medida(m, 'familia')), ['recomendada', 'alternativa'], 'a tie marks both');
  assert.deepEqual(mejores(medida(m, 'agua')), ['recomendada']);
  assert.equal(medida(m, 'agua').filas[0].texto, '1,560 mm');
});

test('compararRotaciones: income closer than 5 % is a tie, and a measure equal for all marks none', () => {
  const ingreso = medida(compararRotaciones(CELAYA), 'ingreso');
  assert.deepEqual(mejores(ingreso), ['alternativa'], '27,131 is 5.1 % below 28,579');
  const parecidos = CELAYA.map((e, i) => ({ ...e, resumen: { ...e.resumen, ingreso_bruto_mxn_ha: 28000 + i * 300 } }));
  assert.deepEqual(mejores(medida(compararRotaciones(parecidos), 'ingreso')), [], 'all within 5 %: nobody is better');
  const iguales = CELAYA.map((e) => ({ ...e, resumen: { ...e.resumen, leguminosas: 1 } }));
  assert.deepEqual(mejores(medida(compararRotaciones(iguales), 'leguminosas')), []);
});

test('compararRotaciones: with irrigation there is no rain risk to compare, and one rotation is no comparison', () => {
  const riego = CELAYA.map((e) => ({ ...e, resumen: { ...e.resumen, riesgo: null, riesgo_rango: null } }));
  assert.ok(!compararRotaciones(riego).some((x) => x.id === 'riesgo'));
  assert.deepEqual(compararRotaciones(CELAYA.slice(0, 1)), []);
  assert.deepEqual(compararRotaciones(), []);
  const sinCero = medida(compararRotaciones(CELAYA), 'familia');
  assert.equal(sinCero.filas[1].ancho, 0, 'a zero draws no bar');
});

test('compararRotaciones: frost and heat are compared when the engine sends them, also with irrigation', () => {
  const extremos = [[0, 0.12], [0, 0.05], [0, 0.07]];
  const conExtremos = CELAYA.map((e, i) => ({
    ...e,
    resumen: { ...e.resumen, riesgo: null, riesgo_rango: null, riesgo_helada: extremos[i][0], riesgo_calor: extremos[i][1] },
  }));
  const m = compararRotaciones(conExtremos);
  assert.deepEqual(m.map((x) => x.id), ['helada', 'calor', 'leguminosas', 'familia', 'agua', 'ingreso']);
  assert.deepEqual(medida(m, 'calor').filas.map((f) => f.texto), ['12 %', '5 %', '7 %']);
  assert.deepEqual(mejores(medida(m, 'calor')), ['recomendada']);
  assert.deepEqual(mejores(medida(m, 'helada')), [], 'no frost in any rotation: nobody is better');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildProceso } from '../llm/proceso.js';

test('el recomendador dice que lo redactó el código, no el modelo de lenguaje', () => {
  const p = buildProceso({ origen: 'motor', fuentes: ['SIAP'], verificado: true });
  assert.ok(p.some((x) => /Recomendador/.test(x.titulo)));
  assert.ok(p.at(-1).detalle.includes('no el modelo'));
});

test('con el modelo de lenguaje explica que revisó los números', () => {
  const p = buildProceso({ origen: 'llm', base: 'conocimiento', fuentes: ['Base local'] });
  assert.ok(p.some((x) => /modelo de lenguaje/i.test(x.titulo)));
  assert.ok(p.some((x) => x.titulo === 'Qué información usó'));
  assert.match(p.at(-1).detalle, /Comprobó que cada número/);
});

test('con corroboración incluye el paso de NASA contra SIAP y sus años reales', () => {
  const p = buildProceso({ origen: 'motor', fuentes: ['SIAP', 'NASA POWER'], corroboracion: { anios_comparados: 7 } });
  assert.ok(p.some((x) => x.titulo === 'Cruzó NASA con el SIAP' && x.detalle.includes('7')));
});

test('si le falta un dato, lo dice y no inventa más pasos', () => {
  const p = buildProceso({ origen: 'motor', preguntar: { campo: 'agua' } });
  assert.equal(p.length, 2);
  assert.match(p[1].detalle, /agua/);
});

test('no trae tiempos inventados', () => {
  for (const o of ['motor', 'modelo', 'llm', 'plantilla']) {
    assert.ok(buildProceso({ origen: o, fuentes: ['SIAP'] }).every((x) => !('tiempo_s' in x)));
  }
});

test('una plantilla con tema no se presenta como "respaldo por falla"', () => {
  const p = buildProceso({ origen: 'plantilla', tema: 'maiz-produccion', fuentes: ['SIAP'] });
  assert.ok(p.some((x) => x.titulo === 'Respuesta armada por el código con tus datos'));
  assert.ok(!p.some((x) => /respaldo/i.test(x.titulo)));
  const respaldo = buildProceso({ origen: 'plantilla', fuentes: ['SIAP'] });
  assert.ok(respaldo.some((x) => /respaldo/i.test(x.titulo)), 'sin tema sí es un respaldo');
});

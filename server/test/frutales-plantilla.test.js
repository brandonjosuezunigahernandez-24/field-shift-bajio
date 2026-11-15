import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectarTema, redactar } from '../llm/respuestas.js';
import { verifyNumbers } from '../llm/verificador.js';
import { TEMAS } from '../llm/temas.js';

test('frutales: se detecta el tema por la palabra o por el nombre del frutal', () => {
  for (const q of ['¿Qué frutales hay en mi estado?', '¿Cuánto rinde el espárrago?', '¿Qué se sabe de la uva?', '¿Qué hay de la tuna?', '¿Qué frutas puedo sembrar?']) {
    assert.equal(detectarTema(q), 'frutales', q);
  }
});

test('frutales: fresa y aguacate siguen en el resumen de cultivos (precio, rendimiento)', () => {
  assert.equal(detectarTema('¿A cuánto se vende el aguacate?'), 'siap');
  assert.equal(detectarTema('¿Cuánto rinde la fresa?'), 'siap');
});

test('frutales: la lista general dice que son perennes, que falta verificar y cita el SIAP', () => {
  const r = redactar('frutales', '¿qué frutales hay?', {});
  assert.match(r.respuesta, /Guanajuato:.*espárrago/i);
  assert.match(r.respuesta, /Querétaro:/);
  assert.match(r.respuesta, /no los tengo verificados/);
  assert.match(r.respuesta, /\[SIAP\]/);
  assert.equal(verifyNumbers(r.respuesta, r.datos).ok, true);
});

test('frutales: la ficha de uno trae sus datos por estado y la aclaración de que no entra en la rotación', () => {
  const r = redactar('frutales', '¿cuanto rinde el esparrago?', {});
  assert.match(r.respuesta, /Espárrago \(hortaliza perenne\)/);
  assert.match(r.respuesta, /rotación de 3 años/);
  assert.equal(verifyNumbers(r.respuesta, r.datos).ok, true);
});

test('frutales: la guía de temas lo incluye y la nota de lo que no contesta lo menciona', () => {
  assert.ok(TEMAS.some((t) => t.id === 'frutales' && t.preguntas.length >= 3));
});

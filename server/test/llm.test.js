import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFicha } from '../llm/ficha.js';
import { templateAnswer } from '../llm/plantilla.js';
import { verifyNumbers } from '../llm/verificador.js';

const clima = {
  periodo: { inicio: 2000, fin: 2024 },
  lluvia_pv_mediana_mm: 528.9,
  umbral_seco_mm: 423.2,
  anios_secos: [2000, 2005, 2011, 2020, 2022, 2023],
};
const suelo = { ph: 7.4, arcilla_pct: 42.4, arena_pct: 37.2, carbono_organico_g_kg: 12.1, sin_datos: false };
const ficha = buildFicha({ clima, suelo });

test('la ficha trae los números reales', () => {
  assert.equal(ficha.lluvia_verano.total_anios_secos, 6);
  assert.equal(ficha.suelo.ph, 7.4);
});

test('suelo sin datos queda marcado', () => {
  assert.deepEqual(buildFicha({ clima, suelo: { sin_datos: true } }).suelo, { sin_datos: true });
});

test('verificador acepta números de la ficha y rechaza inventados', () => {
  assert.equal(verifyNumbers('Hubo 6 años secos, como 2011 y 2020.', ficha).ok, true);
  const mal = verifyNumbers('El maíz falló 15 años.', ficha);
  assert.equal(mal.ok, false);
  assert.deepEqual(mal.desconocidos, [15]);
});

test('la plantilla pasa su propio verificador', () => {
  assert.equal(verifyNumbers(templateAnswer(ficha), ficha).ok, true);
});

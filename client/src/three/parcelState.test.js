import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cropYearState, soilLayerColors, yearState } from './parcelState.js';

const capa = (desde, hasta, arcilla, carbono, piedras = 5) => ({
  desde_cm: desde, hasta_cm: hasta, arcilla_pct: arcilla, carbono_organico_g_kg: carbono, piedras_pct: piedras,
});

test('soilLayerColors: one band per SoilGrids layer, the topsoil darker when it has more carbon', () => {
  const bands = soilLayerColors({ capas: [capa(0, 5, 42, 20), capa(5, 15, 42, 15), capa(60, 100, 44, 4)] });
  assert.deepEqual(bands.map((b) => [b.desde, b.hasta]), [[0, 5], [5, 15], [60, 100]]);
  const lum = (c) => c[0] + c[1] + c[2];
  assert.ok(lum(bands[0].color) < lum(bands[2].color), 'topsoil with organic matter is darker');
});

test('soilLayerColors: nothing to paint without layers (old answer, city, no data)', () => {
  assert.deepEqual(soilLayerColors(null), []);
  assert.deepEqual(soilLayerColors({ sin_datos: true, capas: [capa(0, 5, 40, 10)] }), []);
  assert.deepEqual(soilLayerColors({ ph: 7 }), []);
  assert.deepEqual(soilLayerColors({ capas: [{ desde_cm: 0, hasta_cm: 5, arcilla_pct: null }] }), []);
});

const clima = { lluvia_pv_mediana_mm: 500, lluvia_pv_anual: [{ anio: 2020, lluvia_mm: 400, seco: false }] };
const base = yearState(clima, 2020);
const entry = (minimo_mm, junio, julio) => ({ minimo_mm, siembras: [
  { mes_siembra: 6, riesgo: 0.4, anios: [{ anio: 2020, lluvia_mm: junio, alcanzo: junio >= minimo_mm }] },
  { mes_siembra: 7, riesgo: 0.2, anios: [{ anio: 2020, lluvia_mm: julio, alcanzo: julio >= minimo_mm }] },
] });

test('the same year is good for a thrifty crop and bad for a thirsty one', () => {
  const frijol = cropYearState(base, entry(300, 380, 390), 2020, 'temporal');
  const maiz = cropYearState(base, entry(520, 400, 380), 2020, 'temporal', 7);
  assert.ok(frijol.growth > 1 && frijol.alcanzo === true);
  assert.ok(maiz.growth < 0.9 && maiz.alcanzo === false);
  assert.deepEqual(frijol.tint, [1, 1, 1]);
  assert.equal(maiz.mes_siembra, 7, 'uses the sowing month the engine chose');
});

test('irrigated crops do not dry out in a dry year; crops without backtest keep the general state', () => {
  const dry = yearState({ ...clima, lluvia_pv_anual: [{ anio: 2020, lluvia_mm: 250, seco: true }] }, 2020);
  const riego = cropYearState(dry, entry(520, 250, 240), 2020, 'riego');
  assert.equal(riego.growth, 1);
  assert.deepEqual(riego.tint, [1, 1, 1]);
  assert.equal(cropYearState(dry, undefined, 2020, 'temporal'), dry);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { soilLayerColors } from './parcelState.js';

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

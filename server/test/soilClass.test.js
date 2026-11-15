import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSoilClassUrl, summarizeSoilClass } from '../sources/soilClass.js';

test('buildSoilClassUrl asks SoilGrids for the 3 most likely WRB groups', () => {
  const url = new URL(buildSoilClassUrl(20.47, -100.81));
  assert.equal(url.pathname, '/soilgrids/v2.0/classification/query');
  assert.equal(url.searchParams.get('number_classes'), '3');
});

test('summarizeSoilClass: real Celaya answer -> Vertisol with its probability and alternatives', () => {
  // Real response of SoilGrids for 20.47, -100.81 (November 2026).
  const raw = { wrb_class_name: 'Vertisols', wrb_class_value: 29, wrb_class_probability: [['Vertisols', 30], ['Phaeozems', 13], ['Cambisols', 9]] };
  const tipo = summarizeSoilClass(raw);
  assert.equal(tipo.nombre, 'Vertisol');
  assert.equal(tipo.probabilidad_pct, 30);
  assert.match(tipo.descripcion, /arcilla/);
  assert.deepEqual(tipo.alternativas.map((a) => [a.nombre, a.probabilidad_pct]), [['Feozem', 13], ['Cambisol', 9]]);
});

test('summarizeSoilClass: no soil there (city, water) -> null; unknown group keeps its WRB name', () => {
  assert.equal(summarizeSoilClass({ wrb_class_name: null, wrb_class_probability: [] }), null);
  assert.equal(summarizeSoilClass({ wrb_class_name: 'Xsols', wrb_class_probability: [['Xsols', 50]] }).nombre, 'Xsols');
  assert.throws(() => summarizeSoilClass({}), /classification/);
});

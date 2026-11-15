import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { buildSoilGridsUrl, parseSoilGrids, summarizeSoil } from '../sources/soilGrids.js';

const readJson = async (relativePath) =>
  JSON.parse(await readFile(new URL(relativePath, import.meta.url), 'utf8'));

const depth = (top, bottom, mean) => ({
  label: `${top}-${bottom}cm`,
  range: { top_depth: top, bottom_depth: bottom, unit_depth: 'cm' },
  values: { mean },
});

const layer = (name, d_factor, target_units, means) => ({
  name,
  unit_measure: { d_factor, target_units },
  depths: [depth(0, 5, means[0]), depth(5, 15, means[1]), depth(15, 30, means[2])],
});

test('parseSoilGrids divides by d_factor and weights 0-30 cm by layer thickness', () => {
  const raw = {
    properties: {
      layers: [layer('clay', 10, '%', [100, 200, 300]), layer('phh2o', 10, '-', [70, 70, 76])],
    },
  };
  const soil = parseSoilGrids(raw);
  // (10*5 + 20*10 + 30*15) / 30 = 23.33
  assert.ok(Math.abs(soil.clay.value - 23.3333) < 0.001);
  assert.equal(soil.clay.units, '%');
  // (7.0*5 + 7.0*10 + 7.6*15) / 30 = 7.3
  assert.ok(Math.abs(soil.phh2o.value - 7.3) < 0.001);
});

test('parseSoilGrids skips null layers and anything deeper than 30 cm', () => {
  const raw = {
    properties: {
      layers: [
        { ...layer('sand', 10, '%', [400, null, 200]), depths: [depth(0, 5, 400), depth(5, 15, null), depth(15, 30, 200), depth(30, 60, 900)] },
        layer('silt', 10, '%', [null, null, null]),
      ],
    },
  };
  const soil = parseSoilGrids(raw);
  // Only 0-5 (40) and 15-30 (20): (40*5 + 20*15) / 20 = 25
  assert.equal(soil.sand.value, 25);
  assert.equal(soil.silt, null);
});

test('parseSoilGrids fails loudly on a wrong payload', () => {
  assert.throws(() => parseSoilGrids({ detail: 'error' }), /Unexpected SoilGrids response/);
});

test('buildSoilGridsUrl repeats property and depth and asks for the mean', () => {
  const url = new URL(buildSoilGridsUrl(20.47, -100.81));
  assert.equal(url.searchParams.get('lat'), '20.47');
  assert.equal(url.searchParams.get('lon'), '-100.81');
  assert.deepEqual(url.searchParams.getAll('property'), ['clay', 'sand', 'silt', 'phh2o', 'soc', 'nitrogen']);
  assert.deepEqual(url.searchParams.getAll('depth'), ['0-5cm', '5-15cm', '15-30cm']);
  assert.equal(url.searchParams.get('value'), 'mean');
});

test('real Celaya fixture: plausible pH and a texture that adds up to 100%', async () => {
  const summary = summarizeSoil(parseSoilGrids(await readJson('../fixtures/soilgrids_20.470_-100.810.json')));
  assert.equal(summary.sin_datos, false);
  assert.ok(summary.ph > 4 && summary.ph < 10);
  const texture = summary.arcilla_pct + summary.arena_pct + summary.limo_pct;
  assert.ok(Math.abs(texture - 100) < 3, `clay + sand + silt = ${texture}`);
  assert.ok(summary.carbono_organico_g_kg > 0);
  assert.ok(summary.nitrogeno_g_kg > 0);
});

test('real urban response (downtown Celaya) is reported as "sin_datos", not as zeros', async () => {
  const summary = summarizeSoil(parseSoilGrids(await readJson('./data/soilgrids_urban_no_data.json')));
  assert.equal(summary.sin_datos, true);
  assert.equal(summary.ph, null);
  assert.equal(summary.arcilla_pct, null);
});

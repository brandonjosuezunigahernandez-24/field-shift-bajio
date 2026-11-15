import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { backtest, buildRotation, cycleMonths, dryYearRisk, recommend } from '../engine/index.js';
import { parsePower } from '../sources/nasaPower.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const crops = json('../data/cultivos.json');
const rows = parsePower(json('../fixtures/power_20.47_-100.81.json')); // real Celaya climate, 2000-2024
const soil = { ph: 7.4, arcilla_pct: 42.4, arena_pct: 37.2 };
const crop = (id) => crops.find((c) => c.id === id);
const family = (id) => crop(id).familia;

function assertRotationRules(rotacion) {
  rotacion.forEach((step, i) => {
    if (i > 0) assert.notEqual(family(step.cultivo), family(rotacion[i - 1].cultivo), `familia repetida en el paso ${i}`);
  });
  assert.ok(rotacion.some((step) => crop(step.cultivo).leguminosa), 'falta una leguminosa');
}

test('cycleMonths starts in June for PV and wraps the year for OI', () => {
  assert.deepEqual(cycleMonths(crop('maiz'), 'PV'), [6, 7, 8, 9]);
  assert.deepEqual(cycleMonths(crop('trigo'), 'OI'), [11, 12, 1, 2]);
});

test('dryYearRisk counts the real years below the crop minimum in Celaya', () => {
  const maiz = dryYearRisk(crop('maiz'), rows); // needs 520 mm from June to September
  assert.equal(maiz.anios_total, 25);
  assert.equal(maiz.anios_bajo_minimo.length, 12);
  assert.equal(maiz.riesgo, 12 / 25);
  assert.equal(dryYearRisk(crop('sorgo'), rows).anios_bajo_minimo.length, 3); // needs 400 mm
});

test('rain-fed plot: 3 PV years, no family twice in a row, one legume, reasons with real numbers', () => {
  const { cultivos, rotacion } = recommend({ rows, soil, crops, agua: 'temporal', prioridad: 'riesgo' });
  assert.deepEqual(rotacion.map((s) => [s.anio, s.temporada]), [[1, 'PV'], [2, 'PV'], [3, 'PV']]);
  assertRotationRules(rotacion);
  assert.ok(cultivos.every((c) => crop(c.id).agua.includes('temporal') && c.temporada === 'PV'));
  assert.deepEqual(cultivos.map((c) => c.puntaje), cultivos.map((c) => c.puntaje).sort((a, b) => b - a));
  const maiz = cultivos.find((c) => c.id === 'maiz');
  assert.equal(maiz.riesgo, 0.48);
  assert.match(maiz.razones[0], /En 12 de 25 años llovió menos .* \(520 mm de junio a septiembre\)/);
});

test('irrigated plot: PV and OI every year, same rotation rules, no dry-year risk', () => {
  const { cultivos, rotacion } = recommend({ rows, soil, crops, agua: 'riego', prioridad: 'ganar' });
  assert.deepEqual(rotacion.map((s) => s.temporada), ['PV', 'OI', 'PV', 'OI', 'PV', 'OI']);
  assertRotationRules(rotacion);
  assert.ok(rotacion.every((s) => crop(s.cultivo).temporadas.includes(s.temporada)));
  assert.ok(cultivos.every((c) => c.riesgo === 0));
});

test('the priority changes the ranking', () => {
  const ingresos = { 'maiz|PV': 50000, 'sorgo|PV': 10000, 'frijol|PV': 5000 };
  const top = (prioridad) => recommend({ rows, soil, crops, agua: 'temporal', prioridad, ingresos, estado: 'Guanajuato' }).cultivos[0];
  assert.equal(top('suelo').id, 'frijol');
  const maiz = top('ganar');
  assert.equal(maiz.id, 'maiz');
  assert.match(maiz.razones.at(-1), /50,000 pesos por hectárea/);
});

test('a plot without soil data still gets a recommendation, and says so', () => {
  const { cultivos, rotacion } = recommend({ rows, soil: { ph: null, arcilla_pct: null }, crops, agua: 'temporal', prioridad: 'agua' });
  assert.equal(rotacion.length, 3);
  assert.ok(cultivos[0].razones.some((r) => /No hay dato de pH/.test(r)));
});

test('buildRotation swaps in a legume where it costs the fewest points', () => {
  const cand = (id, familia, puntaje, leguminosa = false) => ({ crop: { id, familia, leguminosa }, temporada: 'PV', puntaje });
  const plan = buildRotation([cand('a', 'x', 90), cand('b', 'y', 80), cand('c', 'z', 70), cand('l', 'leguminosa', 10, true)], { agua: 'temporal' });
  assert.deepEqual(plan.map((s) => s.cand.crop.id), ['a', 'b', 'l']);
});

test('backtest gives every real year and agrees with dryYearRisk; July sowing moves the cycle', () => {
  const june = backtest(crop('maiz'), rows);
  assert.equal(june.anios.length, 25);
  assert.deepEqual(june.anios_bajo_minimo, dryYearRisk(crop('maiz'), rows).anios_bajo_minimo);
  assert.equal(june.anios.filter((y) => !y.alcanzo).length, 12);
  assert.ok(june.anios.every((y) => y.alcanzo === !june.anios_bajo_minimo.includes(y.anio)));
  const july = backtest(crop('maiz'), rows, 7);
  assert.deepEqual(july.meses, [7, 8, 9, 10]);
  assert.equal(july.mes_siembra, 7);
});

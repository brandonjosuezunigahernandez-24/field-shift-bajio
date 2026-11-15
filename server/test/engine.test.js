import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  backtest,
  buildRotation,
  cycleMonths,
  dryYearRisk,
  existingRotation,
  recommend,
  riskInterval,
  thresholdSensitivity,
} from '../engine/index.js';
import { parsePower } from '../sources/nasaPower.js';
import { incomeByCrop } from '../llm/siap.js';

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

test('the crop sown now counts as the previous season: year 1 does not repeat its family', () => {
  const base = recommend({ rows, soil, crops, agua: 'temporal', prioridad: 'ganar' });
  const first = crops.find((c) => c.id === base.rotacion[0].cultivo);
  const same = crops.find((c) => c.familia === first.familia && c.agua.includes('temporal'));
  const r = recommend({ rows, soil, crops, agua: 'temporal', prioridad: 'ganar', previo: same.id });
  assert.notEqual(crops.find((c) => c.id === r.rotacion[0].cultivo).familia, first.familia);
  assert.match(r.rotacion[0].porque, new RegExp(`después de tu ${same.nombre.toLowerCase()}`));
  assert.deepEqual(recommend({ rows, soil, crops, agua: 'temporal', prioridad: 'ganar', previo: 'otro' }).rotacion, base.rotacion);
});

test('"agua" compares only the crops of this water mode: the thriftiest rain-fed crop gets the full component', () => {
  // With the range taken over all crops (irrigated garbanzo 250, brócoli 600) frijol got 0.86 instead of 1.
  const r = recommend({ rows, soil: { ph: null }, crops: crops.map((c) => ({ ...c, temp_opt_min_c: -50, temp_opt_max_c: 60, lluvia_ciclo_max_mm: 5000 })), agua: 'temporal', prioridad: 'agua' });
  const frijol = r.cultivos.find((c) => c.id === 'frijol');
  // ajuste (temp 1, suelo 0.5, lluvia ~1) * .3 + agua 1 * .4 + seguridad*.2 + suelo 1*.05 + ingreso .5*.05: above 85 only with agua = 1
  assert.ok(frijol.puntaje >= 85, `frijol ${frijol.puntaje}`);
});

test('rain-fed crops keep the sowing month (June or July) that scores higher, and the risk is the one of that month', () => {
  for (const prioridad of ['riesgo', 'ganar']) {
    const r = recommend({ rows, soil, crops, agua: 'temporal', prioridad });
    assert.equal(r.cultivos.length, 3, 'one row per crop');
    for (const c of r.cultivos) {
      const crop = crops.find((x) => x.id === c.id);
      assert.ok([6, 7].includes(c.mes_siembra));
      assert.equal(c.riesgo, Math.round(backtest(crop, rows, c.mes_siembra).riesgo * 100) / 100);
    }
    assert.equal(r.cultivos.find((c) => c.id === 'maiz').mes_siembra, 6);
  }
});

test('backtest compares the rounded rain the farmer reads', () => {
  const fake = [6, 7, 8, 9].map((month) => ({ year: 2020, month, rain_mm: 519.6 / 4, t_mean_c: 20 }));
  const y = backtest(crop('maiz'), fake).anios[0];
  assert.equal(y.lluvia_mm, 520);
  assert.equal(y.alcanzo, true);
});

// ---- 3 rotations (the farmer's of today, the best for their goal and one more) and uncertainty ----
const MAIZ_GTO = [{ cultivo: 'maiz', temporada: 'PV', pct: 58 }];
// Real SIAP gross income of rain-fed Guanajuato: with it, "ganar más" gives another plan than "arriesgar menos".
const INGRESOS = incomeByCrop('Guanajuato', 'temporal');
const seq = (e) => e.rotacion.map((s) => s.cultivo ?? '-').join('-');

test('riskInterval: with 25 years, 12 failed years means a real risk between 33 % and 64 %', () => {
  assert.deepEqual(riskInterval(12, 25), [0.33, 0.64]);
  assert.equal(riskInterval(0, 25)[0], 0);
  assert.ok(riskInterval(0, 25)[1] > 0, 'no failure in 25 years is not a zero risk');
  assert.deepEqual(riskInterval(0, 0), [0, 0]);
});

test('thresholdSensitivity: maize would fail in 9 to 17 of 25 years if it needed 10 % less or more rain', () => {
  assert.deepEqual(thresholdSensitivity(crop('maiz'), rows), { menos10: 9, mas10: 17 });
});

test('existingRotation keeps what the farmer sows: one crop repeats, two alternate, irrigated adds OI', () => {
  const ids = (r) => r.slots.map((s) => s.crop?.id ?? null);
  assert.deepEqual(ids(existingRotation(['maiz'], crops, 'temporal')), ['maiz', 'maiz', 'maiz']);
  assert.deepEqual(ids(existingRotation(['frijol', 'maiz'], crops, 'temporal')), ['frijol', 'maiz', 'frijol']);
  assert.deepEqual(ids(existingRotation(['maiz', 'maiz'], crops, 'temporal')), ['maiz', 'maiz', 'maiz']);
  const riego = existingRotation(['maiz', 'trigo'], crops, 'riego');
  assert.deepEqual(ids(riego), ['maiz', 'trigo', 'maiz', 'trigo', 'maiz', 'trigo']);
  assert.deepEqual(riego.slots.map((s) => s.temporada), ['PV', 'OI', 'PV', 'OI', 'PV', 'OI']);
  const soloPV = existingRotation(['maiz'], crops, 'riego');
  assert.deepEqual(ids(soloPV), ['maiz', null, 'maiz', null, 'maiz', null]);
  assert.match(soloPV.notas[0], /otoño-invierno/);
  assert.equal(soloPV.supuesto, false);
});

test('existingRotation without a usable answer compares against the most sown crop (SIAP) and says so', () => {
  const r = existingRotation(['trigo'], crops, 'temporal', MAIZ_GTO, 'Guanajuato');
  assert.equal(r.supuesto, true);
  assert.deepEqual(r.slots.map((s) => s.crop.id), ['maiz', 'maiz', 'maiz']);
  assert.match(r.notas[0], /Trigo no se siembra de temporal/);
  assert.match(r.notas[1], /maíz en primavera-verano \(58 % de la superficie\).*SIAP/);
  assert.match(existingRotation([], crops, 'temporal', MAIZ_GTO).notas[0], /^No nos dijiste qué siembras/);
  assert.equal(existingRotation([], crops, 'temporal'), null, 'without SIAP there is nothing to compare against');
});

test('recommend compares 3 rotations: today, the best for the goal and the best for another goal', () => {
  const r = recommend({ rows, soil, crops, agua: 'temporal', prioridad: 'riesgo', ingresos: INGRESOS, estado: 'Guanajuato', porDefecto: MAIZ_GTO });
  assert.deepEqual(r.estrategias.map((e) => e.id), ['actual', 'recomendada', 'alternativa']);
  assert.equal(new Set(r.estrategias.map(seq)).size, 3, 'three different rotations');
  const [hoy, mejor, otra] = r.estrategias;
  assert.deepEqual(mejor.rotacion, r.rotacion, '`rotacion` is still the recommended plan');
  assertRotationRules(mejor.rotacion);
  assertRotationRules(otra.rotacion);
  assert.equal(seq(hoy), 'maiz-maiz-maiz');
  assert.equal(hoy.supuesto, true);
  assert.deepEqual(
    [hoy.resumen.leguminosas, hoy.resumen.familia_repetida, hoy.resumen.riesgo, hoy.resumen.riesgo_rango],
    [0, 2, 0.48, [0.33, 0.64]]
  );
  assert.ok(mejor.resumen.riesgo < hoy.resumen.riesgo);
  assert.notEqual(otra.prioridad, 'riesgo');
  for (const e of r.estrategias) {
    assert.ok(e.nombre && e.porque, e.id);
    for (const key of ['evidencia', 'beneficios', 'huecos', 'revisar']) assert.ok(e[key].length > 0, `${e.id}.${key}`);
    assert.match(e.evidencia[0], /lluvia real de 2000 a 2024/);
  }
  assert.ok(mejor.beneficios.some((b) => /12 % contra 48 % de seguir igual/.test(b)));
  assert.ok(mejor.huecos.some((h) => /FAO Ecocrop/.test(h)));
  assert.ok(hoy.revisar.some((x) => /gramíneas en temporadas seguidas/.test(x)));
});

test('the rotation the farmer gave is compared as given; without it or SIAP only 2 rotations remain', () => {
  const dicho = recommend({ rows, soil, crops, agua: 'temporal', prioridad: 'suelo', actual: ['frijol', 'maiz'], previo: 'maiz' });
  assert.equal(seq(dicho.estrategias[0]), 'frijol-maiz-frijol');
  assert.equal(dicho.estrategias[0].supuesto, false);
  // After maíz, rain-fed, only frijol may come first: the third option has to break that rule, and says so.
  const otra = dicho.estrategias[2];
  assert.equal(new Set(dicho.estrategias.map(seq)).size, 3);
  assert.equal(seq(otra), 'sorgo-frijol-maiz');
  assert.match(otra.revisar[0], /justo después de tu maíz, de la misma familia \(gramíneas\)/);
  // The uncertainty uses the riskiest crop the farmer sows (maíz, 12 of 25), not the first one.
  assert.match(dicho.incertidumbre.find((u) => u.tema === 'años').texto, /al maíz le faltó lluvia en 12 de 25/);
  const sin = recommend({ rows, soil, crops, agua: 'temporal', prioridad: 'riesgo' });
  assert.deepEqual(sin.estrategias.map((e) => e.id), ['recomendada', 'alternativa']);
});

test('when every goal gives the same plan, the third rotation starts with another family (a full 3-year plan)', () => {
  const r = recommend({ rows, soil, crops, agua: 'temporal', prioridad: 'riesgo' }); // without SIAP income every goal agrees
  const otra = r.estrategias.find((e) => e.id === 'alternativa');
  assert.equal(otra.rotacion.length, 3);
  assert.notEqual(family(otra.rotacion[0].cultivo), family(r.rotacion[0].cultivo));
  assertRotationRules(otra.rotacion);
  assert.match(otra.nombre, /^Otra opción: empezar con /);
  assert.match(otra.rotacion[0].porque, /si no empiezas con frijol/);
});

test('irrigated: the rotation of today has PV and OI, no rain risk, and the uncertainty mentions irrigation water', () => {
  const r = recommend({
    rows,
    soil,
    crops,
    agua: 'riego',
    prioridad: 'ganar',
    estado: 'Guanajuato',
    porDefecto: [{ cultivo: 'maiz', temporada: 'PV', pct: 55 }, { cultivo: 'trigo', temporada: 'OI', pct: 40 }],
  });
  assert.equal(seq(r.estrategias[0]), 'maiz-trigo-maiz-trigo-maiz-trigo');
  assert.ok(r.estrategias.every((e) => e.resumen.riesgo === null && e.resumen.riesgo_rango === null));
  assert.ok(r.incertidumbre.some((u) => u.tema === 'riego'));
  assert.ok(r.cultivos.every((c) => c.riesgo_rango === null && c.sensibilidad === null));
});

test('incertidumbre explains the data limits with the plot numbers', () => {
  const r = recommend({ rows, soil, crops, agua: 'temporal', prioridad: 'riesgo', estado: 'Guanajuato', porDefecto: MAIZ_GTO });
  const tema = (t) => r.incertidumbre.find((u) => u.tema === t)?.texto ?? '';
  assert.deepEqual(r.incertidumbre.map((u) => u.tema), ['clima', 'años', 'cultivos', 'suelo', 'ingreso', 'técnico']);
  assert.match(tema('clima'), /NASA POWER.*50 km/);
  assert.match(tema('años'), /al maíz le faltó lluvia en 12 de 25 años.*entre 33 % y 64 %/);
  assert.match(tema('cultivos'), /en 9 a 17 de 25 años, no en 12/);
  assert.match(tema('técnico'), /no sustituye/);
  const maiz = r.cultivos.find((c) => c.id === 'maiz');
  assert.deepEqual([maiz.riesgo_rango, maiz.sensibilidad], [[0.33, 0.64], { menos10: 9, mas10: 17, anios_total: 25 }]);
  const sinSuelo = recommend({ rows, soil: { ph: null }, crops, agua: 'temporal', prioridad: 'riesgo' });
  assert.match(sinSuelo.incertidumbre.find((u) => u.tema === 'suelo').texto, /No hay dato de suelo/);
});

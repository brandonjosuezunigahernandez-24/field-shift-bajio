import assert from 'node:assert/strict';
import { test } from 'node:test';
import { yearState } from './three/parcelState.js';
import { WEATHER_OPTIONS, sceneForCode, sceneForYear, weatherScene } from './weather.js';

const clima = {
  lluvia_pv_mediana_mm: 500,
  lluvia_pv_anual: [
    { anio: 2011, lluvia_mm: 350, seco: true }, // 70 %
    { anio: 2012, lluvia_mm: 420, seco: false }, // 84 %
    { anio: 2013, lluvia_mm: 500, seco: false }, // 100 %
    { anio: 2014, lluvia_mm: 600, seco: false }, // 120 %
    { anio: 2015, lluvia_mm: 750, seco: false }, // 150 %
  ],
};
const year = (anio) => yearState(clima, anio);

test('"Según el año" follows the real rain: dry, sunny, normal, rainy, stormy', () => {
  assert.equal(sceneForYear(year(2011)), 'sequia');
  assert.equal(sceneForYear(year(2012)), 'soleado');
  assert.equal(sceneForYear(year(2013)), 'normal');
  assert.equal(sceneForYear(year(2014)), 'lluvia');
  assert.equal(sceneForYear(year(2015)), 'tormenta');
  assert.equal(sceneForYear(year(1990)), 'normal', 'no data: a neutral scene, nothing invented');
});

test('weatherScene: real scenes keep the year look; hand-picked ones are marked as examples', () => {
  const auto = weatherScene('auto', year(2015));
  assert.equal(auto.id, 'tormenta');
  assert.equal(auto.example, false);
  assert.equal(auto.plant, null);
  assert.equal(auto.lightning, true);

  const manual = weatherScene('sequia', year(2015));
  assert.equal(manual.example, true);
  assert.equal(manual.dust, 1);
  assert.equal(manual.rain, 0);
  assert.deepEqual(manual.plant, { wet: 0, growth: 0.6 });

  const off = weatherScene('apagado', year(2015));
  assert.equal(off.rain + off.dust + off.clouds, 0);
});

test('"hoy" draws the real sky right now (Open-Meteo WMO code), not an example', () => {
  assert.equal(sceneForCode(0), 'soleado');
  assert.equal(sceneForCode(2), 'normal');
  assert.equal(sceneForCode(45), 'nublado');
  assert.equal(sceneForCode(63), 'lluvia');
  assert.equal(sceneForCode(81), 'lluvia');
  assert.equal(sceneForCode(96), 'tormenta');
  assert.equal(sceneForCode(null), 'normal');
  const hoy = weatherScene('hoy', year(2011), 95);
  assert.equal(hoy.id, 'tormenta', 'the sky of today, not the dry year');
  assert.equal(hoy.example, false);
  assert.equal(hoy.plant, null);
});

test('every option has a label and an icon', () => {
  assert.ok(WEATHER_OPTIONS.every((o) => o.id && o.label && o.icon));
  for (const o of WEATHER_OPTIONS) assert.ok(weatherScene(o.id, year(2013)).label);
});

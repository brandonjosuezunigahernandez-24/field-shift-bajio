import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFicha } from '../llm/ficha.js';
import { verifyNumbers } from '../llm/verificador.js';
import { buildForecastUrl, getForecast, parseCurrent, parseForecast } from '../sources/openMeteo.js';

const raw = {
  daily: {
    time: ['2026-11-14', '2026-11-15'],
    precipitation_sum: [0, 1.1],
    precipitation_probability_max: [18, 31],
    temperature_2m_max: [23.2, 24.5],
    temperature_2m_min: [12.3, 11.3],
    weather_code: [1, 61],
  },
};

test('parseForecast arma un elemento por día', () => {
  const dias = parseForecast(raw);
  assert.equal(dias.length, 2);
  assert.deepEqual(dias[1], { fecha: '2026-11-15', lluvia_mm: 1.1, prob_lluvia_pct: 31, t_max_c: 24.5, t_min_c: 11.3, codigo_clima: 61 });
});

test('parseCurrent da el clima de este momento, o null si no viene', () => {
  const current = { time: '2026-11-15T13:00', temperature_2m: 24.1, precipitation: 0, weather_code: 2 };
  assert.deepEqual(parseCurrent({ ...raw, current }), { hora: '2026-11-15T13:00', temp_c: 24.1, lluvia_mm: 0, codigo_clima: 2 });
  assert.equal(parseCurrent(raw), null);
  assert.match(buildForecastUrl(20.47, -100.81), /current=temperature_2m%2Cprecipitation%2Cweather_code/);
});

test('parseForecast rechaza una respuesta rara', () => {
  assert.throws(() => parseForecast({ error: true }));
});

test('sin internet ni caché, getForecast devuelve null y no lanza', async () => {
  process.env.OFFLINE = '1';
  assert.equal(await getForecast(-33.33, 55.55), null);
});

test('la ficha incluye el pronóstico y el verificador acepta sus números', () => {
  const clima = { periodo: { inicio: 2000, fin: 2024 }, lluvia_pv_mediana_mm: 528.9, umbral_seco_mm: 423.2, anios_secos: [2011] };
  const suelo = { sin_datos: true };
  const pronostico = { obtenido: '2026-11-14T18:00:00.000Z', dias: parseForecast(raw) };
  const ficha = buildFicha({ clima, suelo, pronostico });
  assert.equal(ficha.pronostico_7_dias.dias.length, 2);
  const { resumen } = ficha.pronostico_7_dias;
  assert.equal(resumen.lluvia_total_mm, 1.1);
  assert.deepEqual(resumen.temperatura_minima_mas_baja, { fecha: '2026-11-15', c: 11.3 });
  assert.equal(resumen.dia_con_mas_lluvia.fecha, '2026-11-15');
  assert.equal(verifyNumbers('Mañana hay 31% de lluvia y 1.1 mm.', ficha).ok, true);
  assert.equal('pronostico_7_dias' in buildFicha({ clima, suelo }), false);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  buildPowerUrl,
  daysInMonth,
  median,
  parsePower,
  seasonRainByYear,
  summarizeClimate,
  validatePower,
} from '../sources/nasaPower.js';

// Small hand-made response to check the parsing rules one by one.
function makeRaw({ rainUnits = 'mm/day' } = {}) {
  const months = (year, values) =>
    Object.fromEntries(values.map((v, i) => [`${year}${String(i + 1).padStart(2, '0')}`, v]));
  const flat = (year, value) => months(year, Array(13).fill(value));
  return {
    header: { fill_value: -999 },
    parameters: { PRECTOTCORR: { units: rainUnits }, T2M: { units: 'C' } },
    properties: {
      parameter: {
        T2M: { ...flat(2000, 20), ...flat(2001, 22) },
        T2M_MAX: { ...flat(2000, 28), ...flat(2001, 30) },
        T2M_MIN: { ...flat(2000, 12), ...flat(2001, 14) },
        ALLSKY_SFC_SW_DWN: { ...flat(2000, 6), ...flat(2001, 6) },
        GWETROOT: { ...flat(2000, 0.5), ...flat(2001, 0.5) },
        // 13th value is the annual summary and must be ignored.
        PRECTOTCORR: {
          ...months(2000, [0, 1, 0, 0, 0, 2, 3, 4, 1, 0, 0, 0, 99]),
          ...months(2001, [0, 1, 0, 0, 0, 2, -999, 4, 1, 0, 0, 0, 99]),
        },
      },
    },
  };
}

test('daysInMonth handles leap years', () => {
  assert.equal(daysInMonth(2000, 2), 29);
  assert.equal(daysInMonth(2001, 2), 28);
  assert.equal(daysInMonth(2024, 7), 31);
});

test('parsePower skips month 13 and keeps 12 rows per year in order', () => {
  const rows = parsePower(makeRaw());
  assert.equal(rows.length, 24);
  assert.deepEqual(
    rows.slice(0, 3).map((r) => [r.year, r.month]),
    [[2000, 1], [2000, 2], [2000, 3]]
  );
  assert.ok(rows.every((r) => r.month >= 1 && r.month <= 12));
});

test('parsePower converts mm/day to mm using the days of each month', () => {
  const rows = parsePower(makeRaw());
  const at = (year, month) => rows.find((r) => r.year === year && r.month === month);
  assert.equal(at(2000, 2).rain_mm, 29); // 1 mm/day x 29 days (leap year)
  assert.equal(at(2001, 2).rain_mm, 28);
  assert.equal(at(2000, 6).rain_mm, 60); // 2 mm/day x 30 days
  assert.equal(at(2000, 7).rain_mm, 93); // 3 mm/day x 31 days
});

test('parsePower keeps monthly totals as they are when units are already mm', () => {
  const rows = parsePower(makeRaw({ rainUnits: 'mm' }));
  assert.equal(rows.find((r) => r.year === 2000 && r.month === 7).rain_mm, 3);
});

test('parsePower turns the fill value -999 into null', () => {
  const rows = parsePower(makeRaw());
  assert.equal(rows.find((r) => r.year === 2001 && r.month === 7).rain_mm, null);
});

test('parsePower fails loudly on unknown rain units or a wrong payload', () => {
  assert.throws(() => parsePower(makeRaw({ rainUnits: 'kg/m^2/s' })), /units/);
  assert.throws(() => parsePower({ messages: ['error'] }), /Unexpected NASA POWER response/);
});

test('validatePower rejects a response missing any requested parameter', () => {
  const raw = makeRaw();
  delete raw.properties.parameter.GWETROOT;
  assert.throws(() => validatePower(raw), /missing GWETROOT/);
  assert.doesNotThrow(() => validatePower(makeRaw()));
});

test('seasonRainByYear sums the PV months and drops years with a missing month', () => {
  const pv = seasonRainByYear(parsePower(makeRaw()), [6, 7, 8, 9]);
  // 2000: 2*30 + 3*31 + 4*31 + 1*30 = 307. 2001 has July missing, so it is left out.
  assert.deepEqual(pv, [{ year: 2000, rain_mm: 307 }]);
});

test('median works for odd and even lengths', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});

test('summarizeClimate marks as dry the years below 80% of the median', () => {
  const rows = [];
  const pvTotals = { 2000: 400, 2001: 500, 2002: 600, 2003: 350, 2004: 520 };
  for (const [year, total] of Object.entries(pvTotals)) {
    for (let month = 1; month <= 12; month++) {
      rows.push({
        year: Number(year),
        month,
        t_mean_c: 20,
        t_max_c: 28,
        t_min_c: 12,
        rain_mm: [6, 7, 8, 9].includes(month) ? total / 4 : 0,
      });
    }
  }
  const summary = summarizeClimate(rows);
  assert.equal(summary.lluvia_pv_mediana_mm, 500);
  assert.equal(summary.umbral_seco_mm, 400);
  assert.deepEqual(summary.anios_secos, [2003]); // 400 is not below the threshold, 350 is
  assert.deepEqual(summary.periodo, { inicio: 2000, fin: 2004 });
  assert.equal(summary.temp_media_mensual.length, 12);
  assert.equal(summary.temp_media_mensual[0].t_media_c, 20);
});

test('buildPowerUrl asks for the monthly AG series 2000-2024', () => {
  const url = new URL(buildPowerUrl(20.47, -100.81));
  assert.equal(url.pathname, '/api/temporal/monthly/point');
  assert.equal(url.searchParams.get('latitude'), '20.47');
  assert.equal(url.searchParams.get('longitude'), '-100.81');
  assert.equal(url.searchParams.get('community'), 'AG');
  assert.equal(url.searchParams.get('start'), '2000');
  assert.equal(url.searchParams.get('end'), '2024');
  assert.match(url.searchParams.get('parameters'), /PRECTOTCORR/);
});

test('real Celaya fixture: 25 full years with plausible Bajío values', async () => {
  const raw = JSON.parse(
    await readFile(new URL('../fixtures/power_20.47_-100.81.json', import.meta.url), 'utf8')
  );
  const rows = parsePower(raw);
  assert.equal(rows.length, 25 * 12);

  const summary = summarizeClimate(rows);
  assert.equal(summary.lluvia_pv_anual.length, 25);
  assert.deepEqual(summary.periodo, { inicio: 2000, fin: 2024 });
  for (const year of summary.lluvia_pv_anual) {
    assert.ok(year.lluvia_mm > 100 && year.lluvia_mm < 1500, `PV rain out of range in ${year.anio}`);
  }
  for (const month of summary.temp_media_mensual) {
    assert.ok(month.t_media_c > 5 && month.t_media_c < 35, `mean temp out of range in month ${month.mes}`);
    assert.ok(month.t_min_c < month.t_media_c && month.t_media_c < month.t_max_c);
  }
  // The rainy season must be wetter than the dry season.
  const rain = (mes) => summary.lluvia_media_mensual[mes - 1].lluvia_mm;
  assert.ok(rain(7) > rain(2) * 5);
});

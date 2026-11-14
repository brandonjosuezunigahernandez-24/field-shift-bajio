import { loadRaw } from '../lib/loadRaw.js';
import { DRY_YEAR_RATIO, PV_MONTHS } from '../lib/seasons.js';

export const POWER_SOURCE = 'power';
export const POWER_START_YEAR = 2000;
export const POWER_END_YEAR = 2024;
export const POWER_CREDIT =
  'NASA POWER (Prediction Of Worldwide Energy Resources), NASA Langley Research Center, comunidad AG';

const PARAMETERS = ['T2M', 'T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'ALLSKY_SFC_SW_DWN', 'GWETROOT'];
const DEFAULT_FILL_VALUE = -999;

export function buildPowerUrl(lat, lon) {
  const params = new URLSearchParams({
    parameters: PARAMETERS.join(','),
    community: 'AG',
    latitude: String(lat),
    longitude: String(lon),
    start: String(POWER_START_YEAR),
    end: String(POWER_END_YEAR),
    format: 'JSON',
  });
  return `https://power.larc.nasa.gov/api/temporal/monthly/point?${params}`;
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Throws when the payload is not a usable POWER monthly response.
export function validatePower(raw) {
  const parameter = raw?.properties?.parameter;
  if (!parameter?.T2M || !parameter?.PRECTOTCORR) {
    throw new Error('Unexpected NASA POWER response (missing T2M or PRECTOTCORR)');
  }
}

function rainToMonthlyMm(value, units, year, month) {
  if (value === null) return null;
  const normalized = String(units).toLowerCase().replace(/\s+/g, '');
  if (normalized === 'mm/day') return value * daysInMonth(year, month);
  if (normalized === 'mm' || normalized === 'mm/month') return value;
  throw new Error(`Unexpected PRECTOTCORR units: ${units}`);
}

// Raw POWER response -> one row per real month, sorted by date.
// Month "13" (annual summary) is skipped and fill values (-999) become null.
// Careful: in the monthly API, T2M_MAX and T2M_MIN are the hottest and coldest HOUR of the
// month (POWER definition: "maximum/minimum hourly air temperature in the period of interest"),
// not the average of the daily highs and lows. Use t_mean_c for crop temperature fit.
export function parsePower(raw) {
  validatePower(raw);
  const parameter = raw.properties.parameter;
  const fill = raw.header?.fill_value ?? DEFAULT_FILL_VALUE;
  const rainUnits = raw.parameters?.PRECTOTCORR?.units ?? 'mm/day';

  const clean = (name, key) => {
    const value = parameter[name]?.[key];
    return typeof value === 'number' && Number.isFinite(value) && value !== fill && value !== DEFAULT_FILL_VALUE
      ? value
      : null;
  };

  const rows = [];
  for (const key of Object.keys(parameter.T2M)) {
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(4, 6));
    if (!Number.isInteger(year) || month < 1 || month > 12) continue;
    rows.push({
      year,
      month,
      t_mean_c: clean('T2M', key),
      t_max_c: clean('T2M_MAX', key),
      t_min_c: clean('T2M_MIN', key),
      rain_mm: rainToMonthlyMm(clean('PRECTOTCORR', key), rainUnits, year, month),
      solar: clean('ALLSKY_SFC_SW_DWN', key),
      root_wetness: clean('GWETROOT', key),
    });
  }
  return rows.sort((a, b) => a.year - b.year || a.month - b.month);
}

function mean(values) {
  const valid = values.filter((v) => v !== null);
  return valid.length ? valid.reduce((sum, v) => sum + v, 0) / valid.length : null;
}

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const round1 = (value) => (value === null ? null : Math.round(value * 10) / 10);

// Total rainfall of the given months for each year.
// A year with any of those months missing is left out instead of being summed incomplete.
export function seasonRainByYear(rows, months = PV_MONTHS) {
  const byYear = new Map();
  for (const row of rows) {
    if (!months.includes(row.month)) continue;
    if (!byYear.has(row.year)) byYear.set(row.year, []);
    byYear.get(row.year).push(row.rain_mm);
  }
  const result = [];
  for (const [year, values] of byYear) {
    if (values.length !== months.length || values.includes(null)) continue;
    result.push({ year, rain_mm: values.reduce((sum, v) => sum + v, 0) });
  }
  return result.sort((a, b) => a.year - b.year);
}

// Monthly rows -> the summary served by GET /api/clima (Spanish keys, see docs/api-contract.md).
export function summarizeClimate(rows, { pvMonths = PV_MONTHS, dryRatio = DRY_YEAR_RATIO } = {}) {
  const pvRain = seasonRainByYear(rows, pvMonths);
  const pvMedian = median(pvRain.map((y) => y.rain_mm));
  const dryThreshold = pvMedian === null ? null : pvMedian * dryRatio;

  const lluvia_pv_anual = pvRain.map(({ year, rain_mm }) => ({
    anio: year,
    lluvia_mm: round1(rain_mm),
    seco: dryThreshold !== null && rain_mm < dryThreshold,
  }));

  const monthsOfYear = Array.from({ length: 12 }, (_, i) => i + 1);
  const ofMonth = (month, field) => rows.filter((r) => r.month === month).map((r) => r[field]);

  const years = rows.map((r) => r.year);
  return {
    periodo: years.length ? { inicio: Math.min(...years), fin: Math.max(...years) } : null,
    meses_pv: pvMonths,
    lluvia_pv_anual,
    lluvia_pv_mediana_mm: round1(pvMedian),
    umbral_seco_mm: round1(dryThreshold),
    anios_secos: lluvia_pv_anual.filter((y) => y.seco).map((y) => y.anio),
    temp_media_mensual: monthsOfYear.map((mes) => ({
      mes,
      t_media_c: round1(mean(ofMonth(mes, 't_mean_c'))),
      t_max_c: round1(mean(ofMonth(mes, 't_max_c'))),
      t_min_c: round1(mean(ofMonth(mes, 't_min_c'))),
    })),
    lluvia_media_mensual: monthsOfYear.map((mes) => ({
      mes,
      lluvia_mm: round1(mean(ofMonth(mes, 'rain_mm'))),
    })),
  };
}

// Monthly climate rows for one point, from cache, API or fixture.
export async function getClimate(lat, lon) {
  const { raw, origen } = await loadRaw({
    source: POWER_SOURCE,
    label: 'el clima de la NASA',
    lat,
    lon,
    url: buildPowerUrl(lat, lon),
    timeoutMs: 20000,
    validate: validatePower,
  });
  return { rows: parsePower(raw), origen };
}

import FS_DATOS from '../data/datosDemo.js';

// Turns the real API payloads (GET /api/clima, GET /api/suelo) into the numbers the screens need.
// Where a value is missing (no soil data, API error) the design's demo value is used and the
// result says so in `fuentes`, so the UI can show the "ilustrativo" note.

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const round1 = (v) => Math.round(v * 10) / 10;

// Last year NASA POWER has complete (same rule as the server): until April, the year before last.
export function lastCompleteYear(now = new Date()) {
  return now.getFullYear() - (now.getMonth() >= 3 ? 1 : 2);
}

// "2000–2025": the years really analyzed, or the expected ones while the climate loads.
export function climatePeriod(clima, now = new Date()) {
  return clima?.periodo ? `${clima.periodo.inicio}–${clima.periodo.fin}` : `2000–${lastCompleteYear(now)}`;
}

// How many years of rain are analyzed: those of the answer, or the expected ones while loading.
export function yearsAnalyzed(clima, now = new Date()) {
  return clima?.lluvia_pv_anual?.length || lastCompleteYear(now) - 1999;
}

// Card titles may say "{n}": the number of years analyzed.
export const withYears = (text, clima) => text.replace('{n}', yearsAnalyzed(clima));

// Cards of the rotation screen. Returns [{ etiqueta, valor }] like FS_DATOS.kpis.
export function kpisFrom(clima, suelo) {
  if (!clima?.lluvia_pv_anual?.length) return FS_DATOS.kpis;
  const temps = clima.temp_media_mensual.filter((m) => m.t_media_c != null).map((m) => m.t_media_c);
  return [
    { etiqueta: 'LLUVIA JUN–SEP', valor: `${Math.round(clima.lluvia_pv_mediana_mm)} mm` },
    { etiqueta: 'AÑOS SECOS', valor: `${clima.anios_secos.length} / ${clima.lluvia_pv_anual.length}` },
    { etiqueta: 'TEMP. MEDIA', valor: `${round1(mean(temps))} °C` },
    { etiqueta: 'pH SOILGRIDS', valor: suelo && !suelo.sin_datos && suelo.ph != null ? String(round1(suelo.ph)) : '—' },
  ];
}

// Yearly rain series for the Chart.js bar chart: { anios, valores, umbral, real }.
export function rainSeriesFrom(clima) {
  if (!clima?.lluvia_pv_anual?.length) {
    const d = FS_DATOS.lluvia;
    return { anios: d.valores.map((_, i) => d.desde + i), valores: d.valores, umbral: d.umbral, real: false };
  }
  return {
    anios: clima.lluvia_pv_anual.map((y) => y.anio),
    valores: clima.lluvia_pv_anual.map((y) => Math.round(y.lluvia_mm)),
    umbral: Math.round(clima.umbral_seco_mm),
    real: true,
  };
}

// Short soil legend for the 3D stage (0–30 cm average from SoilGrids).
export function soilLegendFrom(suelo) {
  if (!suelo || suelo.sin_datos || suelo.ph == null) {
    return [
      { color: '#3B8F4F', texto: '0–5 cm · pH 6.8' },
      { color: '#1B6B3A', texto: '5–15 cm · arcilla 38%' },
      { color: '#0F3D24', texto: '15–30 cm · carbono 1.9%' },
    ];
  }
  return [
    { color: '#3B8F4F', texto: `0–30 cm · pH ${round1(suelo.ph)}` },
    { color: '#1B6B3A', texto: `arcilla ${Math.round(suelo.arcilla_pct)}%` },
    { color: '#0F3D24', texto: `carbono ${round1(suelo.carbono_organico_g_kg / 10)}%` },
  ];
}

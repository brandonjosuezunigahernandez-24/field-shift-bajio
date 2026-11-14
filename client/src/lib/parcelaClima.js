import FS_DATOS from '../data/datosDemo.js';

// Turns the real API payloads (GET /api/clima, GET /api/suelo) into the numbers the screens need.
// Where a value is missing (no soil data, API error) the design's demo value is used and the
// result says so in `fuentes`, so the UI can show the "ilustrativo" note.

export const VENTANA_DIAS_TEMPORAL = 125; // useful rain-fed days (Jun–Oct); not in the API yet

const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const round1 = (v) => Math.round(v * 10) / 10;

// Context for the rule engine (lib/cropEngine.js). `demoId` picks the fallback plot from the design.
export function engineContextFrom(clima, suelo, demoId = 'celaya') {
  const demo = FS_DATOS.clima[demoId] || FS_DATOS.clima.personalizada;
  const fuentes = { clima: false, suelo: false };
  const ctx = { ...demo, total_anios: 25, umbral_mm: FS_DATOS.lluvia.umbral, desde: FS_DATOS.lluvia.desde, secos_idx: demo.secos_idx.slice() };

  if (clima?.lluvia_pv_anual?.length) {
    const temps = clima.temp_media_mensual.filter((m) => m.mes >= 6 && m.mes <= 10 && m.t_media_c != null).map((m) => m.t_media_c);
    const monthly = clima.lluvia_media_mensual.filter((m) => m.lluvia_mm != null).map((m) => m.lluvia_mm);
    ctx.lluvia_ciclo = Math.round(clima.lluvia_pv_mediana_mm);
    ctx.lluvia_anual = Math.round(monthly.reduce((a, b) => a + b, 0));
    ctx.temp_ciclo = round1(mean(temps) ?? demo.temp_ciclo);
    ctx.desde = clima.periodo.inicio;
    ctx.total_anios = clima.lluvia_pv_anual.length;
    ctx.umbral_mm = clima.umbral_seco_mm;
    ctx.secos_idx = clima.anios_secos.map((a) => a - clima.periodo.inicio);
    ctx.anios = clima.lluvia_pv_anual.map((y) => y.anio);
    fuentes.clima = true;
  }

  if (suelo && !suelo.sin_datos && suelo.ph != null) {
    ctx.ph = round1(suelo.ph);
    ctx.arcilla = Math.round(suelo.arcilla_pct);
    ctx.carbono = round1(suelo.carbono_organico_g_kg / 10); // g/kg -> %
    fuentes.suelo = true;
  }

  ctx.ventana_dias = VENTANA_DIAS_TEMPORAL;
  ctx.fuentes = fuentes;
  return ctx;
}

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

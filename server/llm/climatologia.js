// Datos de NASA POWER ya calculados por el código (el modelo no busca nada). Entrada: las filas de parsePower().
// T2M_MAX / T2M_MIN mensuales son la hora más calurosa / fría del mes (no promedios diarios): sirven para heladas y calor, no para ajustar cultivos.
import { median, seasonRainByYear } from '../sources/nasaPower.js';
import { DRY_YEAR_RATIO, PV_MONTHS } from '../lib/seasons.js';

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const r1 = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);
const r2 = (n) => Math.round(n * 100) / 100;
const vals = (xs) => xs.filter((v) => v !== null && v !== undefined);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
// t de Student 95% de dos colas; solo se usa con 5-40 años, así que una tabla corta basta.
const T95 = { 3: 3.182, 4: 2.776, 5: 2.571, 8: 2.306, 10: 2.228, 15: 2.131, 20: 2.086, 23: 2.069, 25: 2.06, 30: 2.042, 38: 2.024 };
const t95 = (df) => T95[Object.keys(T95).map(Number).filter((k) => k <= df).at(-1) ?? 3];

// Regresión lineal de la lluvia de verano contra el año, con intervalo de confianza del 95 %.
// shortcut: mínimos cuadrados con 25 puntos; la lluvia no es normal, así que el intervalo es una guía, no una prueba.
export function tendenciaLluvia(porAnio) {
  const n = porAnio.length;
  if (n < 8) return null;
  const x = porAnio.map((y) => y.anio), y = porAnio.map((v) => v.lluvia_mm);
  const mx = mean(x), my = mean(y);
  const sxx = x.reduce((s, v) => s + (v - mx) ** 2, 0);
  const b = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / sxx;
  const sse = x.reduce((s, v, i) => s + (y[i] - my - b * (v - mx)) ** 2, 0);
  const se = Math.sqrt(sse / (n - 2) / sxx);
  const ic = t95(n - 2) * se;
  return {
    anios: n, desde: x[0], hasta: x.at(-1),
    mm_por_decada: Math.round(b * 10), margen_95_mm_por_decada: Math.round(ic * 10),
    distinguible_de_cero: Math.abs(b) > ic,
    variacion_entre_anios_mm: Math.round(Math.sqrt(sse / (n - 2))),
  };
}

export function climatologia(rows) {
  const ofMonth = (m) => rows.filter((r) => r.month === m);
  const porMes = MESES.map((_, i) => {
    const mes = i + 1, rs = ofMonth(mes);
    const lluvia = vals(rs.map((r) => r.rain_mm)), tmin = rs.filter((r) => r.t_min_c !== null), tmax = rs.filter((r) => r.t_max_c !== null);
    const frio = tmin.reduce((a, r) => (r.t_min_c < a.t_min_c ? r : a), tmin[0]);
    const calor = tmax.reduce((a, r) => (r.t_max_c > a.t_max_c ? r : a), tmax[0]);
    return {
      mes,
      lluvia_mm: r1(mean(lluvia)), lluvia_min_mm: r1(Math.min(...lluvia)), lluvia_max_mm: r1(Math.max(...lluvia)),
      t_media_c: r1(mean(vals(rs.map((r) => r.t_mean_c)))),
      hora_mas_fria_promedio_c: r1(mean(tmin.map((r) => r.t_min_c))),
      hora_mas_fria_record_c: r1(frio.t_min_c), hora_mas_fria_record_anio: frio.year,
      anios_con_helada: tmin.filter((r) => r.t_min_c <= 0).length, anios_medidos: tmin.length,
      hora_mas_calurosa_promedio_c: r1(mean(tmax.map((r) => r.t_max_c))),
      hora_mas_calurosa_record_c: r1(calor.t_max_c), hora_mas_calurosa_record_anio: calor.year,
      radiacion_mj_m2_dia: r1(mean(vals(rs.map((r) => r.solar)))),
      humedad_raiz: r2(mean(vals(rs.map((r) => r.root_wetness)))),
    };
  });
  const anual = seasonRainByYear(rows, PV_MONTHS).map((y) => ({ anio: y.year, lluvia_mm: r1(y.rain_mm) }));
  const mediana = median(anual.map((y) => y.lluvia_mm));
  const totalAnual = porMes.reduce((s, m) => s + m.lluvia_mm, 0);
  const pvTotal = PV_MONTHS.reduce((s, m) => s + porMes[m - 1].lluvia_mm, 0);
  const porLluvia = [...porMes].sort((a, b) => b.lluvia_mm - a.lluvia_mm);
  const fuertes = porMes.filter((m) => m.lluvia_mm >= porLluvia[0].lluvia_mm / 2).map((m) => m.mes);
  const anios = rows.map((r) => r.year);
  return {
    periodo: { inicio: Math.min(...anios), fin: Math.max(...anios), anios: Math.max(...anios) - Math.min(...anios) + 1 },
    por_mes: porMes,
    verano: { mediana_mm: r1(mediana), umbral_seco_mm: r1(mediana * DRY_YEAR_RATIO), pct_del_anio: Math.round((100 * pvTotal) / totalAnual), por_anio: anual },
    mes_mas_lluvioso: porLluvia[0].mes, mes_mas_seco: porLluvia.at(-1).mes,
    meses_lluvia_fuerte: fuertes,
    mes_mas_calido: [...porMes].sort((a, b) => b.t_media_c - a.t_media_c)[0].mes,
    mes_mas_frio: [...porMes].sort((a, b) => a.t_media_c - b.t_media_c)[0].mes,
    tendencia_lluvia_verano: tendenciaLluvia(anual),
  };
}

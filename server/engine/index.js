// Rule engine: crop scores, dry-year risk and a 3-year rotation for one plot.
// Pure functions, no network or disk. Every number in a reason comes from the inputs:
// NASA POWER monthly rows, the SoilGrids summary and server/data/cultivos.json.
import { median, seasonRainByYear } from '../sources/nasaPower.js';

export const PRIORIDADES = ['ganar', 'suelo', 'agua', 'riesgo'];

// Sowing month of each Bajío season: June (the rains) and November (irrigated winter crop).
const SEASON_START = { PV: 6, OI: 11 };
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// 30 % is how well the crop fits the plot, 40 to 50 % is what the farmer asked for, the rest is shared.
const WEIGHTS = {
  ganar: { ajuste: 0.3, ingreso: 0.4, seguridad: 0.2, suelo: 0.05, agua: 0.05 },
  riesgo: { ajuste: 0.3, seguridad: 0.5, ingreso: 0.1, suelo: 0.05, agua: 0.05 },
  suelo: { ajuste: 0.3, suelo: 0.4, seguridad: 0.2, ingreso: 0.05, agua: 0.05 },
  agua: { ajuste: 0.3, agua: 0.4, seguridad: 0.2, ingreso: 0.05, suelo: 0.05 },
};

const mean = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);
const monthRange = (months) => `de ${MONTHS[months[0] - 1]} a ${MONTHS[months.at(-1) - 1]}`;

// Months of the crop's cycle, e.g. a 4-month PV crop -> [6, 7, 8, 9]. `inicio` is the sowing month.
export function cycleMonths(crop, temporada, inicio = SEASON_START[temporada]) {
  return Array.from({ length: crop.ciclo_meses }, (_, i) => ((inicio - 1 + i) % 12) + 1);
}

// The crop against every real year: the rain of its cycle (sown in month `inicio`) and whether it reached
// the crop's minimum. Only the rain changes with the sowing month, not the temperature fit.
// shortcut: a cycle that crosses December would mix two calendar years; fine for June and July sowings.
export function backtest(crop, rows, inicio = SEASON_START.PV) {
  const meses = cycleMonths(crop, 'PV', inicio);
  const anios = seasonRainByYear(rows, meses).map((y) => ({
    anio: y.year,
    lluvia_mm: Math.round(y.rain_mm),
    alcanzo: y.rain_mm >= crop.lluvia_ciclo_min_mm,
  }));
  const low = anios.filter((y) => !y.alcanzo).map((y) => y.anio);
  return { mes_siembra: inicio, meses, anios, anios_bajo_minimo: low, riesgo: anios.length ? low.length / anios.length : 0 };
}

// Share of years in which the rain of the crop's cycle (sown in June) stayed below its minimum.
export function dryYearRisk(crop, rows) {
  const { riesgo, anios_bajo_minimo, anios } = backtest(crop, rows);
  return { riesgo, anios_bajo_minimo, anios_total: anios.length };
}

// Each fit goes from 0 (bad) to 1 (ideal). `lluvia` is null with irrigation: rain does not limit the crop.
export function scoreCrop(crop, temporada, { rows, soil, agua }) {
  const meses = cycleMonths(crop, temporada);
  const temps = meses.map((m) => mean(rows.filter((r) => r.month === m && r.t_mean_c !== null).map((r) => r.t_mean_c)));
  const meses_en_rango = temps.filter((t) => t !== null && t >= crop.temp_opt_min_c && t <= crop.temp_opt_max_c).length;

  let lluvia = null;
  let lluvia_mediana_mm = null;
  if (agua === 'temporal') {
    lluvia_mediana_mm = median(seasonRainByYear(rows, meses).map((y) => y.rain_mm));
    if (lluvia_mediana_mm === null) lluvia = 0;
    else if (lluvia_mediana_mm < crop.lluvia_ciclo_min_mm) lluvia = lluvia_mediana_mm / crop.lluvia_ciclo_min_mm;
    else if (lluvia_mediana_mm > crop.lluvia_ciclo_max_mm) lluvia = crop.lluvia_ciclo_max_mm / lluvia_mediana_mm;
    else lluvia = 1;
  }

  // One pH unit outside the range takes the fit to 0. Without soil data the fit is neutral.
  const ph = soil?.ph ?? null;
  const suelo = ph === null ? 0.5 : Math.max(0, 1 - Math.max(crop.ph_min - ph, ph - crop.ph_max, 0));

  return { temp: meses_en_rango / meses.length, lluvia, suelo, meses, meses_en_rango, lluvia_mediana_mm, ph };
}

// components: { ajuste, seguridad, suelo, agua, ingreso }, each 0..1 -> score 0..100.
export function totalScore(components, prioridad) {
  const weights = WEIGHTS[prioridad];
  return 100 * Object.keys(weights).reduce((sum, key) => sum + weights[key] * components[key], 0);
}

// candidates: sorted by score, best first, each { crop, temporada, puntaje }.
// 3 years, PV every year and OI too with irrigation. Never the same family in back-to-back seasons;
// a crop not used yet goes first (diversity); at least one legume in the plan.
export function buildRotation(candidates, { agua }) {
  const seasons = agua === 'riego' ? ['PV', 'OI'] : ['PV'];
  const plan = [];
  const used = new Set();
  for (let anio = 1; anio <= 3; anio++) {
    for (const temporada of seasons) {
      const previous = plan.at(-1)?.cand.crop.familia;
      const pool = candidates.filter((c) => c.temporada === temporada && c.crop.familia !== previous);
      const cand = pool.find((c) => !used.has(c.crop.id)) ?? pool[0];
      if (!cand) continue;
      plan.push({ anio, temporada, cand });
      used.add(cand.crop.id);
    }
  }

  if (!plan.some((slot) => slot.cand.crop.leguminosa)) {
    // Put the best legume where it costs the fewest points and still changes family with its neighbors.
    let best = null;
    plan.forEach((slot, i) => {
      const neighbors = [plan[i - 1], plan[i + 1]].map((s) => s?.cand.crop.familia);
      const legume = candidates.find(
        (c) => c.crop.leguminosa && c.temporada === slot.temporada && !neighbors.includes(c.crop.familia)
      );
      if (legume && (!best || slot.cand.puntaje - legume.puntaje < best.loss)) {
        best = { i, legume, loss: slot.cand.puntaje - legume.puntaje };
      }
    });
    if (best) plan[best.i].cand = best.legume;
  }
  return plan;
}

const riskSentence = (risk, crop, meses) =>
  `En ${risk.anios_bajo_minimo.length} de ${risk.anios_total} años llovió menos de lo que este cultivo necesita aquí ` +
  `(${crop.lluvia_ciclo_min_mm} mm ${monthRange(meses)}).`;

// Reasons in plain Spanish, with the real numbers of the plot.
export function buildReasons({ crop, parts, risk, ingreso_mxn_ha }, { agua, soil, estado }) {
  const reasons = [];
  if (agua === 'temporal') {
    reasons.push(riskSentence(risk, crop, parts.meses));
    reasons.push(
      `En un año normal llueven ${Math.round(parts.lluvia_mediana_mm)} mm en su ciclo; ` +
        `necesita entre ${crop.lluvia_ciclo_min_mm} y ${crop.lluvia_ciclo_max_mm} mm.`
    );
  } else {
    reasons.push('Con riego, la lluvia no lo limita: no se calculó riesgo por años secos.');
  }
  reasons.push(
    `La temperatura media está en su rango (${crop.temp_opt_min_c} a ${crop.temp_opt_max_c} °C) en ` +
      `${parts.meses_en_rango} de ${parts.meses.length} meses de su ciclo (${monthRange(parts.meses)}).`
  );
  if (parts.ph === null) {
    reasons.push('No hay dato de pH para este punto, así que el suelo no cambió el puntaje.');
  } else {
    const inside = parts.ph >= crop.ph_min && parts.ph <= crop.ph_max;
    reasons.push(
      `El pH de tu suelo (${parts.ph}) ${inside ? 'está dentro de' : 'queda fuera de'} lo que prefiere (${crop.ph_min} a ${crop.ph_max}).`
    );
  }
  if (soil?.arcilla_pct != null) {
    reasons.push(`Textura: ${soil.arcilla_pct} % de arcilla y ${soil.arena_pct} % de arena (solo como referencia, no cambia el puntaje).`);
  }
  if (crop.leguminosa) reasons.push('Es leguminosa: deja algo de nitrógeno en el suelo para el siguiente cultivo.');
  if (ingreso_mxn_ha != null) {
    reasons.push(
      `En ${estado} dejó en promedio ${Math.round(ingreso_mxn_ha).toLocaleString('es-MX')} pesos por hectárea ` +
        'de ingreso bruto (SIAP 2018 a 2024, sin descontar costos).'
    );
  }
  return reasons;
}

function why(slot, previous, agua) {
  const { crop, puntaje, risk, parts } = slot.cand;
  const bits = [];
  if (!previous) bits.push(`Es el que mejor queda en tu parcela para lo que pediste (${Math.round(puntaje)} de 100).`);
  else bits.push(`Va después de ${previous.cand.crop.nombre.toLowerCase()}: cambiar de familia ayuda a cortar plagas y enfermedades.`);
  if (crop.leguminosa) bits.push('Es leguminosa: deja algo de nitrógeno para el siguiente cultivo.');
  if (agua === 'temporal') bits.push(riskSentence(risk, crop, parts.meses));
  return bits.join(' ');
}

// rows: monthly climate (getClimate). soil: /api/suelo summary (may be all null). crops: cultivos.json.
// ingresos: optional { "<id>|<temporada>": pesos per hectare } (SIAP average), used by the "ganar" priority.
export function recommend({ rows, soil, crops, agua, prioridad, ingresos = {}, estado = null }) {
  const minimums = crops.map((c) => c.lluvia_ciclo_min_mm);
  const [low, high] = [Math.min(...minimums), Math.max(...minimums)];

  const candidates = [];
  for (const crop of crops) {
    if (!crop.agua.includes(agua)) continue;
    for (const temporada of crop.temporadas) {
      if (temporada === 'OI' && agua !== 'riego') continue; // OI only with irrigation
      candidates.push({
        crop,
        temporada,
        parts: scoreCrop(crop, temporada, { rows, soil, agua }),
        risk: agua === 'temporal' ? dryYearRisk(crop, rows) : { riesgo: 0, anios_bajo_minimo: [], anios_total: 0 },
        ingreso_mxn_ha: ingresos[`${crop.id}|${temporada}`] ?? null,
      });
    }
  }

  const maxIncome = Math.max(0, ...candidates.map((c) => c.ingreso_mxn_ha ?? 0));
  for (const c of candidates) {
    const fits = [c.parts.temp, c.parts.suelo, ...(c.parts.lluvia === null ? [] : [c.parts.lluvia])];
    c.puntaje = totalScore(
      {
        ajuste: mean(fits),
        seguridad: 1 - c.risk.riesgo,
        suelo: c.crop.leguminosa ? 1 : 0.3,
        agua: high > low ? 1 - (c.crop.lluvia_ciclo_min_mm - low) / (high - low) : 0.5,
        ingreso: c.ingreso_mxn_ha !== null && maxIncome > 0 ? c.ingreso_mxn_ha / maxIncome : 0.5,
      },
      prioridad
    );
  }
  candidates.sort((a, b) => b.puntaje - a.puntaje);

  const plan = buildRotation(candidates, { agua });
  // One row per crop: its best season.
  const best = candidates.filter((c, i) => candidates.findIndex((other) => other.crop.id === c.crop.id) === i);

  return {
    cultivos: best.map((c) => ({
      id: c.crop.id,
      nombre: c.crop.nombre,
      temporada: c.temporada,
      puntaje: Math.round(c.puntaje),
      riesgo: Math.round(c.risk.riesgo * 100) / 100,
      razones: buildReasons(c, { agua, soil, estado }),
    })),
    rotacion: plan.map((slot, i) => ({
      anio: slot.anio,
      temporada: slot.temporada,
      cultivo: slot.cand.crop.id,
      porque: why(slot, plan[i - 1], agua),
    })),
  };
}

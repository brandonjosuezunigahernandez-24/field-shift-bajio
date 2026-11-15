// Rule engine: crop scores, dry-year risk and a 3-year rotation for one plot.
// Pure functions, no network or disk. Every number in a reason comes from the inputs:
// NASA POWER monthly rows, the SoilGrids summary and server/data/cultivos.json.
import { median, seasonRainByYear } from '../sources/nasaPower.js';

export const PRIORIDADES = ['ganar', 'suelo', 'agua', 'riesgo'];
// The farmer's words for each goal: the screens and the assistant use these same words.
export const ETIQUETAS = { ganar: 'ganar más', suelo: 'cuidar el suelo', agua: 'gastar menos agua', riesgo: 'arriesgar menos' };
// Order in which another goal is tried for the third rotation: soil health first (the heart of the challenge).
const OTRAS_METAS = ['suelo', 'riesgo', 'ganar', 'agua'];
const NOMBRE_TEMPORADA = { PV: 'primavera-verano', OI: 'otoño-invierno' };

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
  const anios = seasonRainByYear(rows, meses).map((y) => {
    const lluvia_mm = Math.round(y.rain_mm); // compared rounded: the same number the farmer reads
    return { anio: y.year, lluvia_mm, alcanzo: lluvia_mm >= crop.lluvia_ciclo_min_mm };
  });
  const low = anios.filter((y) => !y.alcanzo).map((y) => y.anio);
  return { mes_siembra: inicio, meses, anios, anios_bajo_minimo: low, riesgo: anios.length ? low.length / anios.length : 0 };
}

// Share of years in which the rain of the crop's cycle (sown in month `inicio`) stayed below its minimum.
export function dryYearRisk(crop, rows, inicio = SEASON_START.PV) {
  const { riesgo, anios_bajo_minimo, anios } = backtest(crop, rows, inicio);
  return { riesgo, anios_bajo_minimo, anios_total: anios.length };
}

// With only ~25 real years a risk is an estimate. Wilson score interval at 90 % for k years out of n, as [lo, hi]
// (0..1, 2 decimals). k may be fractional: a pooled share of several seasons times n.
export function riskInterval(k, n, z = 1.645) {
  if (!n) return [0, 0];
  const p = k / n;
  const den = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  const r2 = (v) => Math.round(v * 100) / 100;
  return [r2(Math.max(0, center - half)), r2(Math.min(1, center + half))];
}

// The crop requirements are not verified yet: how many years would fall short if the crop needed 10 % less
// or 10 % more rain than cultivos.json says.
export function thresholdSensitivity(crop, rows, inicio = SEASON_START.PV) {
  const below = (factor) =>
    backtest({ ...crop, lluvia_ciclo_min_mm: Math.round(crop.lluvia_ciclo_min_mm * factor) }, rows, inicio).anios_bajo_minimo.length;
  return { menos10: below(0.9), mas10: below(1.1) };
}

const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;

// The rows of each season of a cycle, as [{ anio, filas }]; `anio` is the sowing year. Months before the sowing
// month belong to the season sown the year before (OI: November to February). Incomplete seasons are left out.
function seasonRows(rows, meses) {
  const bySeason = new Map();
  for (const row of rows) {
    if (!meses.includes(row.month)) continue;
    const anio = row.month >= meses[0] ? row.year : row.year - 1;
    if (!bySeason.has(anio)) bySeason.set(anio, []);
    bySeason.get(anio).push(row);
  }
  return [...bySeason]
    .filter(([, filas]) => filas.length === meses.length)
    .map(([anio, filas]) => ({ anio, filas }))
    .sort((a, b) => a.anio - b.anio);
}

// Frost and heat against every real season. In the monthly POWER data t_min_c and t_max_c are the coldest and the
// hottest HOUR of the month, so "did it get to X °C that month" has a yes or no answer for each year.
// A season counts when any month of the cycle reached the crop's damage threshold (helada_dano_c, calor_dano_c).
// Irrigation does not protect from either, so this runs for rain-fed and irrigated plots alike.
// Compared rounded to one decimal: the same number the farmer reads. A crop without a threshold has no risk.
export function extremeTempRisk(crop, rows, temporada, inicio = SEASON_START[temporada]) {
  const meses = cycleMonths(crop, temporada, inicio);
  const seasons = seasonRows(rows, meses).filter((s) => s.filas.every((r) => r.t_min_c !== null && r.t_max_c !== null));
  const side = (field, umbral, reached, worse) => {
    const anios = umbral == null ? [] : seasons.filter((s) => s.filas.some((r) => reached(round1(r[field]), umbral))).map((s) => s.anio);
    let record = null;
    for (const s of seasons) {
      for (const r of s.filas) {
        if (!record || worse(r[field], record.c)) record = { c: r[field], mes: r.month, anio: r.year };
      }
    }
    return {
      umbral_c: umbral ?? null,
      anios,
      anios_total: seasons.length,
      riesgo: seasons.length ? anios.length / seasons.length : 0,
      record: record && { ...record, c: round1(record.c) },
    };
  };
  return {
    meses,
    helada: side('t_min_c', crop.helada_dano_c, (v, u) => v <= u, (a, b) => a < b),
    calor: side('t_max_c', crop.calor_dano_c, (v, u) => v >= u, (a, b) => a > b),
  };
}

// Seasons in which something went wrong: short of rain (rain-fed only), frost or heat. A year with two problems
// counts once. This is what the `seguridad` component of the score uses.
export function badYears(risk, extremos) {
  const anios = [...new Set([...risk.anios_bajo_minimo, ...extremos.helada.anios, ...extremos.calor.anios])].sort((a, b) => a - b);
  const total = Math.max(risk.anios_total, extremos.helada.anios_total);
  return { anios, total, riesgo: total ? anios.length / total : 0 };
}

// PV sowing months tried by the engine (INIFAP Bajío sows beans from late June to mid July).
// Each one is scored whole (rain fit, temperature and years with a problem); the crop keeps the month with the higher score.
export const SOWING_MONTHS = [6, 7];

// Each fit goes from 0 (bad) to 1 (ideal). `lluvia` is null with irrigation: rain does not limit the crop.
export function scoreCrop(crop, temporada, { rows, soil, agua, inicio = SEASON_START[temporada] }) {
  const meses = cycleMonths(crop, temporada, inicio);
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
export function buildRotation(candidates, { agua, familiaPrevia = null }) {
  const seasons = agua === 'riego' ? ['PV', 'OI'] : ['PV'];
  const plan = [];
  const used = new Set();
  for (let anio = 1; anio <= 3; anio++) {
    for (const temporada of seasons) {
      const previous = plan.at(-1)?.cand.crop.familia ?? familiaPrevia;
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
      const neighbors = [plan[i - 1]?.cand.crop.familia ?? (i === 0 ? familiaPrevia : undefined), plan[i + 1]?.cand.crop.familia];
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

const FRIO = { hubo: (u) => `la temperatura bajó a ${u} °C o menos`, record: 'Lo más frío' };
const CALOR = { hubo: (u) => `el calor llegó a ${u} °C o más`, record: 'Lo más caliente' };
const recordSentence = (side, words) => `${words.record} fue ${side.record.c} °C en ${MONTHS[side.record.mes - 1]} de ${side.record.anio}.`;

// One sentence for frost and one for heat, with the real years and the record of the cycle.
function extremeSentences(extremos) {
  const out = [];
  for (const [side, words] of [[extremos.helada, FRIO], [extremos.calor, CALOR]]) {
    if (side.umbral_c === null || !side.anios_total) continue;
    const cuando = `en su ciclo (${monthRange(extremos.meses)})`;
    out.push(
      side.anios.length
        ? `En ${side.anios.length} de ${side.anios_total} años ${words.hubo(side.umbral_c)} ${cuando}: eso lo puede dañar. ${recordSentence(side, words)}`
        : `En ninguno de ${side.anios_total} años ${words.hubo(side.umbral_c)} ${cuando}. ${recordSentence(side, words)}`
    );
  }
  return out;
}

// Short version for the rotation cards: only the problems that did happen.
function extremeShort(extremos) {
  const out = [];
  for (const [side, words] of [[extremos.helada, FRIO], [extremos.calor, CALOR]]) {
    if (side.anios.length) out.push(`En ${side.anios.length} de ${side.anios_total} años ${words.hubo(side.umbral_c)} en su ciclo.`);
  }
  return out;
}

// Reasons in plain Spanish, with the real numbers of the plot.
export function buildReasons({ crop, parts, risk, ingreso_mxn_ha, extremos, malos }, { agua, soil, estado }) {
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
  if (extremos) {
    reasons.push(...extremeSentences(extremos));
    if (malos?.total && (extremos.helada.anios.length || extremos.calor.anios.length)) {
      reasons.push(
        `Juntando ${agua === 'temporal' ? 'falta de lluvia, ' : ''}helada y calor, tuvo algún problema en ${malos.anios.length} de ${malos.total} años: eso baja su puntaje.`
      );
    }
  }
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

// meta: what the plan was made for ("para lo que pediste", or another goal in the third rotation).
function why(slot, previous, agua, previo, esMejor, meta = 'para lo que pediste') {
  const { crop, puntaje, risk, parts, extremos } = slot.cand;
  const bits = [];
  if (!previous && previo && !esMejor) bits.push(`Va después de tu ${previo.nombre.toLowerCase()}: cambiar de familia ayuda a cortar plagas y enfermedades (${Math.round(puntaje)} de 100).`);
  else if (!previous) bits.push(`Es el que mejor queda en tu parcela ${meta} (${Math.round(puntaje)} de 100).`);
  else bits.push(`Va después de ${previous.cand.crop.nombre.toLowerCase()}: cambiar de familia ayuda a cortar plagas y enfermedades.`);
  if (crop.leguminosa) bits.push('Es leguminosa: deja algo de nitrógeno para el siguiente cultivo.');
  if (agua === 'temporal') bits.push(riskSentence(risk, crop, parts.meses));
  if (extremos) bits.push(...extremeShort(extremos));
  return bits.join(' ');
}

const corto = (crop) => crop.nombre.split(' ')[0].toLowerCase(); // "Maíz grano" -> "maíz"
const conArticulo = (crop) => `${crop.id === 'cebada' ? 'la' : 'el'} ${corto(crop)}`;
const aCultivo = (crop) => (crop.id === 'cebada' ? `a la ${corto(crop)}` : `al ${corto(crop)}`);
// Income differences under 5 % are noise for a 3-year average: they are not mentioned.
const ingresoDistinto = (a, b) => a != null && b != null && Math.abs(a - b) >= 0.05 * Math.max(a, b);
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (p) => Math.round(p * 100);
const pesos = (n) => Math.round(n).toLocaleString('es-MX');
const lista = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} y ${words.at(-1)}`);
const vez = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;
const seqKey = (rotacion) => rotacion.map((s) => `${s.temporada}:${s.cultivo}`).join('>');

const extremeSummary = (side) => ({ riesgo: round2(side.riesgo), anios: side.anios, anios_total: side.anios_total, umbral_c: side.umbral_c });

// Scores every candidate for one goal, best first, and keeps one sowing month per crop and season (June wins a tie).
// The components do not depend on the goal, so the same candidates serve the three rotations.
function rank(candidates, prioridad) {
  const ranked = candidates.map((c) => ({ ...c, puntaje: totalScore(c.componentes, prioridad) }));
  ranked.sort((a, b) => b.puntaje - a.puntaje || a.inicio - b.inicio);
  return ranked.filter((c, i) => ranked.findIndex((o) => o.crop.id === c.crop.id && o.temporada === c.temporada) === i);
}

const toRotation = (plan, ranked, agua, previoCrop, meta) =>
  plan.map((slot, i) => ({
    anio: slot.anio,
    temporada: slot.temporada,
    cultivo: slot.cand.crop.id,
    porque: why(slot, plan[i - 1], agua, previoCrop, slot.cand === ranked.find((c) => c.temporada === slot.temporada), meta),
  }));

// The rotation the farmer has today, kept 3 more years: one crop repeats, two different crops alternate
// (frijol then maíz -> frijol, maíz, frijol). ids: oldest first, e.g. [ultimo_cultivo, cultivo_actual].
// Without a usable answer it compares against porDefecto ([{ cultivo, temporada, pct }]: the most sown crop of
// the state in each season, SIAP) and says so. null when there is nothing to compare against.
export function existingRotation(ids, crops, agua, porDefecto = [], estado = null) {
  const seasons = agua === 'riego' ? ['PV', 'OI'] : ['PV'];
  const seasonOf = (crop) => (crop.temporadas.includes('PV') ? 'PV' : 'OI');
  const notas = [];
  const known = [];
  for (const id of ids) {
    const crop = crops.find((c) => c.id === id);
    if (!crop) continue;
    if (!crop.agua.includes(agua) || !seasons.includes(seasonOf(crop))) {
      notas.push(`${capital(corto(crop))} no se siembra ${agua === 'temporal' ? 'de temporal' : 'con riego'} aquí, así que no lo contamos.`);
      continue;
    }
    if (known.at(-1)?.id !== crop.id) known.push(crop);
  }

  let porTemporada;
  let supuesto = false;
  if (known.length) {
    porTemporada = Object.fromEntries(seasons.map((t) => [t, known.filter((c) => seasonOf(c) === t)]));
    const vacias = seasons.filter((t) => !porTemporada[t].length);
    if (vacias.length) notas.push(`No nos dijiste qué siembras en ${vacias.map((t) => NOMBRE_TEMPORADA[t]).join(' ni en ')}: ahí la tierra queda sin cultivo.`);
  } else {
    const defaults = porDefecto
      .map((d) => ({ ...d, crop: crops.find((c) => c.id === d.cultivo) }))
      .filter((d) => d.crop && seasons.includes(d.temporada) && d.crop.agua.includes(agua) && d.crop.temporadas.includes(d.temporada));
    if (!defaults.length) return null;
    supuesto = true;
    porTemporada = Object.fromEntries(seasons.map((t) => [t, defaults.filter((d) => d.temporada === t).map((d) => d.crop)]));
    const cuales = defaults.map((d) => `${corto(d.crop)} en ${NOMBRE_TEMPORADA[d.temporada]} (${d.pct} % de la superficie)`);
    notas.push(
      `${notas.length ? 'Comparamos' : 'No nos dijiste qué siembras, así que comparamos'} contra lo más sembrado ` +
        `${agua === 'temporal' ? 'de temporal' : 'con riego'}${estado ? ` en ${estado}` : ''}: ${lista(cuales)}, según el SIAP 2018 a 2024.`
    );
  }

  const slots = [];
  for (let anio = 1; anio <= 3; anio++) {
    for (const temporada of seasons) {
      const list = porTemporada[temporada];
      slots.push({ anio, temporada, crop: list.length ? list[(anio - 1) % list.length] : null });
    }
  }
  return { slots, supuesto, notas };
}

// Numbers that let the farmer compare rotations. slots: [{ anio, temporada, cand | null }] (null = nothing sown).
// riesgo pools the PV seasons: years short of rain over all of them; its range uses n = the real years.
function summarize(slots, agua, anios) {
  const planted = slots.filter((s) => s.cand);
  const crops = planted.map((s) => s.cand.crop);
  let repetida = 0;
  for (let i = 1; i < crops.length; i++) if (crops[i].familia === crops[i - 1].familia) repetida++;
  const pv = agua === 'temporal' ? planted.filter((s) => s.temporada === 'PV') : [];
  const fallas = pv.reduce((sum, s) => sum + s.cand.risk.anios_bajo_minimo.length, 0);
  const riesgo = pv.length && anios ? fallas / (pv.length * anios) : null;
  const ingresos = planted.map((s) => s.cand.ingreso_mxn_ha);
  const conIngreso = ingresos.filter((v) => v != null);
  // Frost and heat pool every sown season (PV and OI, rain-fed or irrigated): seasons hit over seasons measured.
  const extremo = (lado) => {
    const sides = planted.filter((s) => s.cand.extremos).map((s) => s.cand.extremos[lado]);
    const total = sides.reduce((sum, x) => sum + x.anios_total, 0);
    return total ? round2(sides.reduce((sum, x) => sum + x.anios.length, 0) / total) : null;
  };
  return {
    riesgo_helada: extremo('helada'),
    riesgo_calor: extremo('calor'),
    temporadas_sembradas: planted.length,
    leguminosas: crops.filter((c) => c.leguminosa).length,
    familias: new Set(crops.map((c) => c.familia)).size,
    familia_repetida: repetida,
    riesgo: riesgo === null ? null : Math.round(riesgo * 100) / 100,
    riesgo_rango: riesgo === null ? null : riskInterval(riesgo * anios, anios),
    lluvia_necesaria_mm: crops.reduce((sum, c) => sum + c.lluvia_ciclo_min_mm, 0),
    ingreso_bruto_mxn_ha: conIngreso.length ? Math.round(conIngreso.reduce((a, b) => a + b, 0)) : null,
    ingreso_parcial: conIngreso.length > 0 && conIngreso.length < ingresos.length,
  };
}

// Why, evidence, benefits, information gaps and what to check locally: what the challenge asks for each rotation.
// base: the farmer's rotation of today (the benefits are measured against it).
function strategyTexts(e, base, { agua, rows, estado, anios, desde, hasta }) {
  const r = e.resumen;
  const planted = e.slots.filter((s) => s.cand);
  const crops = [...new Map(planted.map((s) => [s.cand.crop.id, s.cand.crop])).values()];

  const evidencia = [];
  if (agua === 'temporal' && r.riesgo !== null) {
    evidencia.push(
      `Con la lluvia real de ${desde} a ${hasta}, a este plan le hubiera faltado lluvia en ${Math.round(r.riesgo * 10)} de cada 10 temporadas ` +
        `(${pct(r.riesgo)} %; con solo ${anios} años puede ser de ${pct(r.riesgo_rango[0])} a ${pct(r.riesgo_rango[1])} %).`
    );
    for (const crop of crops) {
      const s = planted.find((x) => x.cand.crop.id === crop.id);
      const frase = riskSentence(s.cand.risk, crop, s.cand.parts.meses);
      evidencia.push(`${capital(corto(crop))}: ${frase.charAt(0).toLowerCase()}${frase.slice(1)}`);
    }
  } else if (agua === 'riego') {
    evidencia.push('Con riego, la lluvia no limita estos cultivos: no se calculó riesgo por años secos.');
  }
  if (r.riesgo_helada !== null && r.riesgo_calor !== null) {
    evidencia.push(
      `Con la temperatura real de ${desde} a ${hasta}, a este plan le hubiera tocado una helada que daña en ${pct(r.riesgo_helada)} % de las temporadas ` +
        `y un calor que daña en ${pct(r.riesgo_calor)} %.`
    );
    for (const crop of crops) {
      const s = planted.find((x) => x.cand.crop.id === crop.id);
      for (const frase of s.cand.extremos ? extremeShort(s.cand.extremos) : []) {
        evidencia.push(`${capital(corto(crop))}: ${frase.charAt(0).toLowerCase()}${frase.slice(1)}`);
      }
    }
  }
  if (r.ingreso_bruto_mxn_ha != null) {
    evidencia.push(
      `En 3 años dejaría unos ${pesos(r.ingreso_bruto_mxn_ha)} pesos por hectárea de ingreso bruto (promedio del SIAP 2018 a 2024` +
        `${estado ? ` en ${estado}` : ''}, sin descontar costos${r.ingreso_parcial ? '; no cuenta los cultivos sin precio' : ''}).`
    );
  }

  const beneficios = [];
  const b = base?.resumen;
  if (!b || e.id === 'actual') {
    beneficios.push('No cambias nada: ya conoces el cultivo, la semilla y a quién venderle.');
    if (r.leguminosas) beneficios.push(`Lleva ${vez(r.leguminosas, 'temporada', 'temporadas')} de leguminosa: deja algo de nitrógeno en el suelo.`);
  } else {
    const legs = crops.filter((c) => c.leguminosa).map(corto);
    if (r.leguminosas > b.leguminosas) {
      beneficios.push(`Lleva ${vez(r.leguminosas, 'temporada', 'temporadas')} de leguminosa (${lista(legs)}): deja algo de nitrógeno en el suelo. Seguir igual lleva ${b.leguminosas}.`);
    }
    if (r.familia_repetida < b.familia_repetida) {
      beneficios.push(`Cambia más de familia de cultivo, y eso corta el ciclo de plagas y enfermedades: repite familia ${vez(r.familia_repetida, 'vez', 'veces')}; seguir igual, ${vez(b.familia_repetida, 'vez', 'veces')}.`);
    }
    if (r.riesgo !== null && b.riesgo !== null && r.riesgo < b.riesgo) {
      beneficios.push(`Le falta lluvia en menos temporadas: ${pct(r.riesgo)} % contra ${pct(b.riesgo)} % de seguir igual.`);
    }
    if (r.riesgo_helada !== null && b.riesgo_helada !== null && r.riesgo_helada < b.riesgo_helada) {
      beneficios.push(`Le toca helada que daña en menos temporadas: ${pct(r.riesgo_helada)} % contra ${pct(b.riesgo_helada)} % de seguir igual.`);
    }
    if (r.riesgo_calor !== null && b.riesgo_calor !== null && r.riesgo_calor < b.riesgo_calor) {
      beneficios.push(`Le toca calor que daña en menos temporadas: ${pct(r.riesgo_calor)} % contra ${pct(b.riesgo_calor)} % de seguir igual.`);
    }
    if (r.lluvia_necesaria_mm < b.lluvia_necesaria_mm) {
      beneficios.push(`Sus cultivos necesitan ${b.lluvia_necesaria_mm - r.lluvia_necesaria_mm} mm menos de agua en 3 años que seguir igual.`);
    }
    if (ingresoDistinto(r.ingreso_bruto_mxn_ha, b.ingreso_bruto_mxn_ha) && r.ingreso_bruto_mxn_ha > b.ingreso_bruto_mxn_ha) {
      beneficios.push(
        `Deja unos ${pesos(r.ingreso_bruto_mxn_ha - b.ingreso_bruto_mxn_ha)} pesos más por hectárea en 3 años que seguir igual (ingreso bruto del SIAP` +
          `${r.temporadas_sembradas > b.temporadas_sembradas ? '; ojo: también siembra en temporadas en que hoy no siembras' : ''}).`
      );
    }
    if (!beneficios.length) beneficios.push('Frente a seguir igual no mejora el riesgo, el suelo, el agua ni el ingreso.');
  }

  const huecos = [...e.notas];
  const sinVerificar = crops.filter((c) => !c.verificado).map(corto);
  if (sinVerificar.length) {
    huecos.push(`Lo que necesita${sinVerificar.length > 1 ? 'n' : ''} ${lista(sinVerificar)} (lluvia, temperatura y pH) es aproximado: falta verificarlo contra FAO Ecocrop.`);
  }
  if (agua === 'temporal') {
    const pv = planted.filter((s) => s.temporada === 'PV');
    const peor = pv.reduce((w, s) => (!w || s.cand.risk.anios_bajo_minimo.length > w.cand.risk.anios_bajo_minimo.length ? s : w), null);
    if (peor) {
      const k = peor.cand.risk.anios_bajo_minimo.length;
      const sens = thresholdSensitivity(peor.cand.crop, rows, peor.cand.inicio);
      huecos.push(`Si ${conArticulo(peor.cand.crop)} necesitara 10 % menos o más lluvia, le hubiera faltado en ${sens.menos10} a ${sens.mas10} de ${anios} años, no en ${k}.`);
    }
  }
  const sinPrecio = crops.filter((c) => planted.some((s) => s.cand.crop.id === c.id && s.cand.ingreso_mxn_ha == null)).map(corto);
  if (sinPrecio.length) huecos.push(`No hay precio del SIAP para ${lista(sinPrecio)}${estado ? ` en ${estado}` : ''}: el ingreso no lo cuenta.`);

  const revisar = [];
  const familias = new Set();
  planted.forEach((s, i) => {
    if (i > 0 && planted[i - 1].cand.crop.familia === s.cand.crop.familia) familias.add(`${s.cand.crop.familia}s`);
  });
  if (familias.size) revisar.push(`Repite ${lista([...familias])} en temporadas seguidas: eso junta plagas y enfermedades en la tierra.`);
  const legs = crops.filter((c) => c.leguminosa).map(corto);
  if (legs.length && e.id !== 'actual') revisar.push(`Confirma que consigues semilla de ${lista(legs)} y a quién venderlo en tu zona.`);
  if (planted.some((s) => s.temporada === 'OI')) revisar.push('Lo de otoño-invierno depende de tener agua de riego segura todo el ciclo.');
  if (crops.some((c) => c.id === 'brocoli')) revisar.push('El brócoli pide más trabajo, plántula y un comprador seguro antes de sembrar.');
  if (b && e.id !== 'actual' && ingresoDistinto(r.ingreso_bruto_mxn_ha, b.ingreso_bruto_mxn_ha) && r.ingreso_bruto_mxn_ha < b.ingreso_bruto_mxn_ha) {
    revisar.push(`Deja unos ${pesos(b.ingreso_bruto_mxn_ha - r.ingreso_bruto_mxn_ha)} pesos menos por hectárea en 3 años que seguir igual (ingreso bruto del SIAP): revisa si te conviene.`);
  }
  revisar.push('Confirma fechas de siembra y variedades con un técnico de tu zona (por ejemplo, del INIFAP).');

  return { evidencia, beneficios, huecos, revisar };
}

// What the tool does not know, in plain words (the challenge asks to explain the uncertainty).
// ejemplo: a rain-fed candidate whose risk illustrates it (the farmer's crop when there is one).
function uncertainty({ agua, soil, estado, anios, desde, hasta, rows, ejemplo }) {
  const out = [
    {
      tema: 'clima',
      texto: 'La lluvia y la temperatura vienen de NASA POWER: son el promedio de un cuadro de unos 50 km alrededor de tu parcela, no una medición en tu parcela.',
    },
    {
      tema: 'extremos',
      texto:
        'La helada y el calor salen de la hora más fría y la más caliente de cada mes en ese mismo cuadro de 50 km: una parcela en un bajo ' +
        'hiela más que eso. Los grados que dañan a cada cultivo son aproximados y cuentan igual en todo el ciclo, no solo en la floración.',
    },
  ];
  if (agua === 'temporal' && ejemplo) {
    const k = ejemplo.risk.anios_bajo_minimo.length;
    const [lo, hi] = riskInterval(k, anios);
    const sens = thresholdSensitivity(ejemplo.crop, rows, ejemplo.inicio);
    out.push({
      tema: 'años',
      texto:
        `Son ${anios} años (${desde} a ${hasta}). Con tan pocos años el riesgo es una estimación: ${aCultivo(ejemplo.crop)} le faltó lluvia ` +
        `en ${k} de ${anios} años, pero su riesgo real puede estar entre ${pct(lo)} % y ${pct(hi)} %.`,
    });
    out.push({
      tema: 'cultivos',
      texto:
        'Lo que necesita cada cultivo es aproximado y falta verificarlo contra FAO Ecocrop. Por ejemplo, si ' +
        `${conArticulo(ejemplo.crop)} necesitara 10 % menos o más lluvia, le hubiera faltado en ${sens.menos10} a ${sens.mas10} de ${anios} años, no en ${k}.`,
    });
  } else {
    out.push({ tema: 'cultivos', texto: 'Lo que necesita cada cultivo es aproximado y falta verificarlo contra FAO Ecocrop.' });
  }
  out.push({
    tema: 'suelo',
    texto:
      soil?.ph == null
        ? 'No hay dato de suelo para este punto, así que el pH no cambió nada.'
        : 'El suelo es una estimación de SoilGrids (cuadros de 250 m), no un análisis de tu tierra; un análisis de laboratorio lo confirma.',
  });
  out.push({ tema: 'ingreso', texto: `El ingreso es el promedio ${estado ? `de ${estado}` : 'del estado'} en el SIAP 2018 a 2024, sin costos ni el precio de este año.` });
  if (agua === 'riego') out.push({ tema: 'riego', texto: 'No sabemos cuánta agua de riego tienes: revisa que te alcance para cada ciclo.' });
  out.push({ tema: 'técnico', texto: 'Esto te ayuda a comparar opciones; no sustituye tu experiencia ni a un técnico de tu zona.' });
  return out;
}

// rows: monthly climate (getClimate). soil: /api/suelo summary (may be all null). crops: cultivos.json.
// ingresos: optional { "<id>|<temporada>": pesos per hectare } (SIAP average), used by the "ganar" priority.
// previo: optional id of the crop the farmer has now or had last; the plan does not repeat its family in year 1.
// actual: ids of what the farmer sows today, oldest first; porDefecto: what to compare against without it (SIAP).
export function recommend({ rows, soil, crops, agua, prioridad, ingresos = {}, estado = null, previo = null, actual = [], porDefecto = [] }) {
  const all = [];
  for (const crop of crops) {
    if (!crop.agua.includes(agua)) continue;
    for (const temporada of crop.temporadas) {
      if (temporada === 'OI' && agua !== 'riego') continue; // OI only with irrigation
      // Irrigated PV crops try both months too: rain does not matter to them, but June heat does.
      for (const inicio of temporada === 'PV' ? SOWING_MONTHS : [SEASON_START[temporada]]) {
        const risk = agua === 'temporal' ? dryYearRisk(crop, rows, inicio) : { riesgo: 0, anios_bajo_minimo: [], anios_total: 0 };
        const extremos = extremeTempRisk(crop, rows, temporada, inicio);
        all.push({
          crop,
          temporada,
          inicio,
          parts: scoreCrop(crop, temporada, { rows, soil, agua, inicio }),
          risk,
          extremos,
          malos: badYears(risk, extremos),
          ingreso_mxn_ha: ingresos[`${crop.id}|${temporada}`] ?? null,
        });
      }
    }
  }

  const minimums = all.map((c) => c.crop.lluvia_ciclo_min_mm);
  const [low, high] = [Math.min(...minimums), Math.max(...minimums)];
  const maxIncome = Math.max(0, ...all.map((c) => c.ingreso_mxn_ha ?? 0));
  for (const c of all) {
    const fits = [c.parts.temp, c.parts.suelo, ...(c.parts.lluvia === null ? [] : [c.parts.lluvia])];
    c.componentes = {
      ajuste: mean(fits),
      seguridad: 1 - c.malos.riesgo, // years without a problem: short of rain (rain-fed), frost or heat
      suelo: c.crop.leguminosa ? 1 : 0.3,
      agua: high > low ? 1 - (c.crop.lluvia_ciclo_min_mm - low) / (high - low) : 0.5,
      ingreso: c.ingreso_mxn_ha !== null && maxIncome > 0 ? c.ingreso_mxn_ha / maxIncome : 0.5,
    };
  }
  const candidates = rank(all, prioridad);

  const previoCrop = crops.find((c) => c.id === previo) ?? null;
  const familiaPrevia = previoCrop?.familia ?? null;
  const plan = buildRotation(candidates, { agua, familiaPrevia });
  const rotacion = toRotation(plan, candidates, agua, previoCrop);
  // One row per crop: its best season.
  const best = candidates.filter((c, i) => candidates.findIndex((other) => other.crop.id === c.crop.id) === i);

  const years = rows.map((r) => r.year);
  const anios = candidates.find((c) => c.risk.anios_total)?.risk.anios_total ?? new Set(years).size;
  const ctx = { agua, rows, estado, anios, desde: Math.min(...years), hasta: Math.max(...years) };
  const slotsOf = (p) => p.map((s) => ({ anio: s.anio, temporada: s.temporada, cand: s.cand }));
  const estrategia = (fields) => ({ ...fields, notas: fields.notas ?? [], resumen: summarize(fields.slots, agua, anios) });

  // 1) What the farmer sows today (or the most sown crop of the state, marked as an assumption).
  let hoy = null;
  const existing = existingRotation(actual, crops, agua, porDefecto, estado);
  if (existing) {
    const slots = existing.slots.map((s) => ({
      anio: s.anio,
      temporada: s.temporada,
      cand: s.crop ? candidates.find((c) => c.crop.id === s.crop.id && c.temporada === s.temporada) ?? null : null,
    }));
    const rot = slots.map((s, i) => {
      if (!s.cand) return { anio: s.anio, temporada: s.temporada, cultivo: null, porque: `En ${NOMBRE_TEMPORADA[s.temporada]} la tierra queda sin cultivo.` };
      const anterior = slots.slice(0, i).reverse().find((x) => x.cand);
      const bits = [existing.supuesto ? 'Es lo más sembrado aquí (SIAP).' : 'Es lo que nos dijiste que siembras.'];
      if (anterior?.cand.crop.familia === s.cand.crop.familia) bits.push('Repite la familia de la temporada anterior: así se juntan plagas y enfermedades.');
      if (agua === 'temporal') bits.push(riskSentence(s.cand.risk, s.cand.crop, s.cand.parts.meses));
      bits.push(...extremeShort(s.cand.extremos));
      return { anio: s.anio, temporada: s.temporada, cultivo: s.cand.crop.id, porque: bits.join(' ') };
    });
    hoy = estrategia({
      id: 'actual',
      nombre: 'Seguir como siembras hoy',
      prioridad: null,
      supuesto: existing.supuesto,
      porque: existing.supuesto
        ? 'Es lo que más se siembra aquí; lo usamos como tu rotación de hoy porque no tenemos la tuya.'
        : 'Es lo que nos dijiste que siembras, siguiendo igual 3 años.',
      slots,
      rotacion: rot,
      notas: existing.notas,
    });
  }

  // 2) The best plan for the farmer's goal: the same `rotacion` as always.
  const recomendada = estrategia({
    id: 'recomendada',
    nombre: 'La que mejor te queda',
    prioridad,
    supuesto: false,
    porque: `Es la que mejor sale en tu parcela para ${ETIQUETAS[prioridad]}, que es lo que pediste.`,
    slots: slotsOf(plan),
    rotacion,
  });

  // 3) The best plan for another goal that gives a different rotation; else the best one without year 1's crop.
  const taken = new Set([seqKey(rotacion), ...(hoy ? [seqKey(hoy.rotacion)] : [])]);
  let alternativa = null;
  for (const otra of OTRAS_METAS.filter((m) => m !== prioridad)) {
    const ranked = rank(all, otra);
    const altPlan = buildRotation(ranked, { agua, familiaPrevia });
    const rot = toRotation(altPlan, ranked, agua, previoCrop, `para ${ETIQUETAS[otra]}`);
    if (rot.length && !taken.has(seqKey(rot))) {
      alternativa = estrategia({
        id: 'alternativa',
        nombre: `La mejor para ${ETIQUETAS[otra]}`,
        prioridad: otra,
        supuesto: false,
        porque: `Si lo que más te importara fuera ${ETIQUETAS[otra]}, esta es la que mejor sale en tu parcela.`,
        slots: slotsOf(altPlan),
        rotacion: rot,
      });
      break;
    }
  }
  if (!alternativa && plan.length) {
    // Every goal gives the same plan: the best full plan that does not start with the same family.
    const sin = plan[0].cand.crop;
    const altPlan = buildRotation(candidates, { agua, familiaPrevia: sin.familia });
    const rot = toRotation(altPlan, candidates, agua, null, `si no empiezas con ${corto(sin)}`);
    if (rot.length && !taken.has(seqKey(rot))) {
      const primero = altPlan[0].cand.crop;
      alternativa = estrategia({
        id: 'alternativa',
        nombre: `Otra opción: empezar con ${corto(primero)}`,
        prioridad,
        supuesto: false,
        porque: `Es la mejor que no empieza con ${corto(sin)}, por si ese año no puedes sembrarlo o no consigues semilla.`,
        slots: slotsOf(altPlan),
        rotacion: rot,
        // With few crops there may be no other plan that follows every rule: say which one it breaks.
        avisos:
          previoCrop?.familia === primero.familia
            ? [`Empieza con ${corto(primero)} justo después de tu ${corto(previoCrop)}, de la misma familia (${primero.familia}s): eso junta plagas y enfermedades.`]
            : [],
      });
    }
  }

  const estrategias = [hoy, recomendada, alternativa].filter(Boolean).map((e) => {
    const { slots, notas, avisos = [], ...visible } = e;
    const textos = strategyTexts(e, hoy, ctx);
    return { ...visible, ...textos, revisar: [...avisos, ...textos.revisar] };
  });
  // The uncertainty is told with the riskiest rain-fed crop the farmer sows today (else the best ranked one).
  const pvHoy = (hoy?.slots ?? []).filter((s) => s.cand && s.temporada === 'PV').map((s) => s.cand);
  const ejemplo =
    agua === 'temporal'
      ? pvHoy.reduce((w, c) => (!w || c.risk.anios_bajo_minimo.length > w.risk.anios_bajo_minimo.length ? c : w), null) ??
        candidates.find((c) => c.temporada === 'PV')
      : null;

  return {
    cultivos: best.map((c) => ({
      id: c.crop.id,
      nombre: c.crop.nombre,
      temporada: c.temporada,
      mes_siembra: c.inicio,
      puntaje: Math.round(c.puntaje),
      riesgo: Math.round(c.risk.riesgo * 100) / 100,
      riesgo_rango: agua === 'temporal' ? riskInterval(c.risk.anios_bajo_minimo.length, c.risk.anios_total) : null,
      sensibilidad: agua === 'temporal' ? { ...thresholdSensitivity(c.crop, rows, c.inicio), anios_total: c.risk.anios_total } : null,
      helada: extremeSummary(c.extremos.helada),
      calor: extremeSummary(c.extremos.calor),
      // Share of years with any problem (rain, frost or heat): what the score's safety part uses.
      riesgo_total: round2(c.malos.riesgo),
      razones: buildReasons(c, { agua, soil, estado }),
    })),
    rotacion,
    estrategias,
    incertidumbre: uncertainty({ ...ctx, soil, ejemplo }),
  };
}

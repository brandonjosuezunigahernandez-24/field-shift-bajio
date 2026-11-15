import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { HttpError } from '../lib/errors.js';
import { parseCoords } from '../lib/coords.js';
import { POWER_CREDIT, getClimate, summarizeClimate } from '../sources/nasaPower.js';
import { SOILCLASS_CREDIT, getSoilClass } from '../sources/soilClass.js';
import { SOILGRIDS_CREDIT, getSoil, summarizeSoil } from '../sources/soilGrids.js';
import { ETIQUETAS, PRIORIDADES, backtest, recommend } from '../engine/index.js';
import { incomeByCrop, topCropBySeason } from '../llm/siap.js';
import { ESTADOS, predictionSentences } from '../llm/recomendador.js';
import { stateAt } from '../lib/state.js';

const router = Router();
const CROPS = JSON.parse(readFileSync(new URL('../data/cultivos.json', import.meta.url), 'utf8'));
const CROP_IDS = CROPS.map((c) => c.id);
// What the farmer sows today, oldest first: only crops the engine knows, at most the last 3.
const cropIds = (list) => (Array.isArray(list) ? list : []).filter((id) => typeof id === 'string' && CROP_IDS.includes(id)).slice(-3);
const pct = (p) => Math.round(p * 100);
const NO_SOIL = 'No hay dato de suelo para este punto; la recomendación no toma en cuenta el pH.';
const OUTSIDE_REGION =
  'Tu parcela está fuera de Guanajuato y Querétaro. El clima y el suelo de NASA y SoilGrids sí son de tu parcela, ' +
  'pero los cultivos, las temporadas y los precios del SIAP están calibrados solo para esos dos estados, así que no te recomendamos rotación aquí.';
const FUENTES = [
  POWER_CREDIT,
  SOILGRIDS_CREDIT,
  'SIAP, Cierre de la producción agrícola 2018-2024 (ingreso bruto promedio por estado)',
  'Requerimientos de los cultivos: FAO Ecocrop (temperatura y pH óptimos) y FAO, Irrigation Water Management Training Manual No. 3, tabla 14 (agua por ciclo); el agua del garbanzo y del brócoli sigue aproximada',
];

// SoilGrids fails or has no data for some points: the plot still gets a recommendation, without pH.
// Same soil as GET /api/suelo (layers to 1 m and soil type included): the screens replace their soil
// with this one, so it must not lose anything. The soil type is extra and never blocks the answer.
async function soilSummary(lat, lon) {
  let soil = {};
  let layers = null;
  let origen = null;
  const [, tipo] = await Promise.all([
    getSoil(lat, lon).then(
      (r) => ({ soil, layers, origen } = r),
      (err) => {
        if (!(err instanceof HttpError)) throw err;
      }
    ),
    getSoilClass(lat, lon).then((r) => r.tipo, () => null),
  ]);
  const summary = summarizeSoil(soil, layers);
  return {
    lat,
    lon,
    origen,
    ...summary,
    aviso: summary.sin_datos ? NO_SOIL : null,
    tipo,
    fuente: SOILGRIDS_CREDIT,
    fuente_tipo: tipo ? SOILCLASS_CREDIT : null,
  };
}

// The recommendation of one plot, for POST /api/recomendar and for the assistant: both must say the same.
// Outside Guanajuato and Querétaro it throws a 422 with `fuera_de_region: true` before calling any API:
// the SIAP data, the crop list and the season calendar are only for those two states.
// previo: id of the crop the farmer has now or had last (optional); year 1 of the plan does not repeat its family.
// actual: what the farmer sows today, oldest first (e.g. [ultimo_cultivo, cultivo_actual]); it is the first of the
// 3 rotations compared. Without it, the most sown crop of the state (SIAP) stands in, marked as an assumption.
export async function recommendPlot({ lat, lon, agua, prioridad, estado, previo = null, actual = [] }) {
  const state = ESTADOS.includes(estado) ? estado : stateAt(lat, lon);
  if (!state) throw new HttpError(422, OUTSIDE_REGION, { fuera_de_region: true });
  const [{ rows, origen }, suelo] = await Promise.all([getClimate(lat, lon), soilSummary(lat, lon)]);
  const hoy = cropIds(actual);
  const result = recommend({
    rows,
    soil: suelo,
    crops: CROPS,
    agua,
    prioridad,
    ingresos: incomeByCrop(state, agua),
    estado: state,
    previo: previo ?? hoy.at(-1) ?? null,
    actual: hoy,
    porDefecto: topCropBySeason(state, agua, CROP_IDS),
  });
  return {
    clima: { lat, lon, origen, ...summarizeClimate(rows), fuente: POWER_CREDIT },
    suelo,
    estado: state,
    agua,
    prioridad,
    ...result,
    fuentes: FUENTES,
  };
}

// The recommended rotation against the farmer's rotation of today, with the engine's numbers.
function compareSentence(r, name) {
  const hoy = r.estrategias?.find((e) => e.id === 'actual');
  const mejor = r.estrategias?.find((e) => e.id === 'recomendada');
  if (!hoy || !mejor) return '';
  const seq = hoy.rotacion.map((s) => (s.cultivo ? name(s.cultivo) : 'sin sembrar')).join(', ');
  const [a, b] = [hoy.resumen, mejor.resumen];
  const riesgo =
    a.riesgo != null && b.riesgo != null
      ? ` A tu rotación de hoy le hubiera faltado lluvia en ${pct(a.riesgo)} % de las temporadas (puede ser de ${pct(a.riesgo_rango[0])} a ${pct(a.riesgo_rango[1])} %); a esta, en ${pct(b.riesgo)} %.`
      : '';
  return (
    `Comparada con seguir igual (${seq}${hoy.supuesto ? ', lo más sembrado aquí' : ''}):${riesgo} ` +
    `Lleva ${b.leguminosas} temporadas de leguminosa contra ${a.leguminosas}. `
  );
}

// Text for the chat, put together by code so the numbers are the engine's.
export function explainPlot(r) {
  const name = (id) => r.cultivos.find((c) => c.id === id).nombre.toLowerCase();
  const [first] = r.cultivos;
  const top = r.cultivos.slice(0, 3).map((c, i) => `${i + 1}) ${c.nombre} (${c.puntaje} de 100)`).join('; ');
  const rotation = r.rotacion.map((x) => `año ${x.anio} ${x.temporada}: ${name(x.cultivo)}`).join('; ');
  return (
    `Para sembrar de ${r.agua} y con la meta de ${ETIQUETAS[r.prioridad]}, en tu parcela te salen mejor: ${top}. ` +
    `Rotación de 3 años: ${rotation}. ${compareSentence(r, name)}Sobre ${first.nombre.toLowerCase()}: ${first.razones[0]} ` +
    predictionSentences(r.prediccion).map((s) => `${s} `).join('') +
    'Lo que necesita cada cultivo sale de la FAO (rangos generales de la especie, no de una variedad del Bajío); esto no sustituye a un técnico.'
  );
}

// Short version for the model's fact sheet (little context).
export const compactPlot = (r) => ({
  agua: r.agua,
  prioridad: r.prioridad,
  mejores: r.cultivos.slice(0, 3).map(({ nombre, temporada, puntaje, razones }) => ({ cultivo: nombre, temporada, puntaje, razones })),
  rotacion: r.rotacion,
  // The 3 rotations compared on screen (today, recommended, another goal), so the chat can talk about them.
  estrategias: (r.estrategias ?? []).map((e) => ({
    id: e.id,
    nombre: e.nombre,
    cultivos: e.rotacion.map((s) => s.cultivo ?? 'sin sembrar').join('-'),
    riesgo_pct: e.resumen.riesgo == null ? null : pct(e.resumen.riesgo),
    riesgo_rango_pct: e.resumen.riesgo_rango?.map(pct) ?? null,
    leguminosas: e.resumen.leguminosas,
    ingreso_bruto_3_anios_mxn_ha: e.resumen.ingreso_bruto_mxn_ha,
  })),
  ...(r.prediccion && { prediccion: r.prediccion }),
  fuente: 'NASA POWER, SoilGrids y SIAP',
});

// POST /api/recomendar { lat, lon, agua, prioridad, estado?, cultivo_previo?, rotacion_actual? }
//   -> { clima, suelo, cultivos, rotacion, estrategias, incertidumbre, fuentes }
router.post('/', async (req, res) => {
  const { lat, lon } = parseCoords(req.body);
  const { agua, prioridad, estado, cultivo_previo, rotacion_actual } = req.body;
  if (!['temporal', 'riego'].includes(agua)) throw new HttpError(400, 'Dinos si tu parcela es de temporal o de riego.');
  if (!PRIORIDADES.includes(prioridad)) {
    throw new HttpError(400, 'Elige qué te importa más: ganar más, cuidar el suelo, gastar menos agua o arriesgar menos.');
  }
  const previo = typeof cultivo_previo === 'string' ? cultivo_previo : null;
  const actual = Array.isArray(rotacion_actual) ? rotacion_actual : previo ? [previo] : [];
  res.json(await recommendPlot({ lat, lon, agua, prioridad, estado, previo, actual }));
});

// GET /api/recomendar/prueba?lat&lon -> each rain-fed crop against every real year, sown in June and in July.
// One call feeds the whole "Probar cultivo" screen: crop, comparison and sowing month change without new requests.
const SOWING_MONTHS = [6, 7];
router.get('/prueba', async (req, res) => {
  const { lat, lon } = parseCoords(req.query);
  const { rows } = await getClimate(lat, lon);
  res.json({
    cultivos: CROPS.filter((c) => c.agua.includes('temporal') && c.temporadas.includes('PV')).map((crop) => ({
      id: crop.id,
      nombre: crop.nombre,
      minimo_mm: crop.lluvia_ciclo_min_mm,
      siembras: SOWING_MONTHS.map((mes) => backtest(crop, rows, mes)),
    })),
    fuente: POWER_CREDIT,
  });
});

export default router;

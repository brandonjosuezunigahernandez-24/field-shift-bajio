import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { HttpError } from '../lib/errors.js';
import { parseCoords } from '../lib/coords.js';
import { POWER_CREDIT, getClimate, summarizeClimate } from '../sources/nasaPower.js';
import { SOILGRIDS_CREDIT, getSoil, summarizeSoil } from '../sources/soilGrids.js';
import { PRIORIDADES, recommend } from '../engine/index.js';
import { incomeByCrop } from '../llm/siap.js';
import { ESTADOS, ETIQUETA, predictionSentences } from '../llm/recomendador.js';
import { stateAt } from '../lib/state.js';

const router = Router();
const CROPS = JSON.parse(readFileSync(new URL('../data/cultivos.json', import.meta.url), 'utf8'));
const NO_SOIL = 'No hay dato de suelo para este punto; la recomendación no toma en cuenta el pH.';
const OUTSIDE_REGION =
  'Tu parcela está fuera de Guanajuato y Querétaro. El clima y el suelo de NASA y SoilGrids sí son de tu parcela, ' +
  'pero los cultivos, las temporadas y los precios del SIAP están calibrados solo para esos dos estados, así que no te recomendamos rotación aquí.';
const FUENTES = [
  POWER_CREDIT,
  SOILGRIDS_CREDIT,
  'SIAP, Cierre de la producción agrícola 2018-2024 (ingreso bruto promedio por estado)',
  'Requerimientos de los cultivos: valores aproximados (estilo FAO Ecocrop), sin verificar',
];

// SoilGrids fails or has no data for some points: the plot still gets a recommendation, without pH.
async function soilSummary(lat, lon) {
  let soil = {};
  let origen = null;
  try {
    ({ soil, origen } = await getSoil(lat, lon));
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
  }
  const summary = summarizeSoil(soil);
  return { lat, lon, origen, ...summary, aviso: summary.sin_datos ? NO_SOIL : null, fuente: SOILGRIDS_CREDIT };
}

// The recommendation of one plot, for POST /api/recomendar and for the assistant: both must say the same.
// Outside Guanajuato and Querétaro it throws a 422 with `fuera_de_region: true` before calling any API:
// the SIAP data, the crop list and the season calendar are only for those two states.
export async function recommendPlot({ lat, lon, agua, prioridad, estado }) {
  const state = ESTADOS.includes(estado) ? estado : stateAt(lat, lon);
  if (!state) throw new HttpError(422, OUTSIDE_REGION, { fuera_de_region: true });
  const [{ rows, origen }, suelo] = await Promise.all([getClimate(lat, lon), soilSummary(lat, lon)]);
  const result = recommend({ rows, soil: suelo, crops: CROPS, agua, prioridad, ingresos: incomeByCrop(state, agua), estado: state });
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

// Text for the chat, put together by code so the numbers are the engine's.
export function explainPlot(r) {
  const name = (id) => r.cultivos.find((c) => c.id === id).nombre.toLowerCase();
  const [first] = r.cultivos;
  const top = r.cultivos.slice(0, 3).map((c, i) => `${i + 1}) ${c.nombre} (${c.puntaje} de 100)`).join('; ');
  const rotation = r.rotacion.map((x) => `año ${x.anio} ${x.temporada}: ${name(x.cultivo)}`).join('; ');
  return (
    `Para sembrar de ${r.agua} y con la meta de ${ETIQUETA[r.prioridad]}, en tu parcela te salen mejor: ${top}. ` +
    `Rotación de 3 años: ${rotation}. Sobre ${first.nombre.toLowerCase()}: ${first.razones[0]} ` +
    predictionSentences(r.prediccion).map((s) => `${s} `).join('') +
    'Los requerimientos de cada cultivo son aproximados y falta confirmarlos; esto no sustituye a un técnico.'
  );
}

// Short version for the model's fact sheet (little context).
export const compactPlot = (r) => ({
  agua: r.agua,
  prioridad: r.prioridad,
  mejores: r.cultivos.slice(0, 3).map(({ nombre, temporada, puntaje, razones }) => ({ cultivo: nombre, temporada, puntaje, razones })),
  rotacion: r.rotacion,
  ...(r.prediccion && { prediccion: r.prediccion }),
  fuente: 'NASA POWER, SoilGrids y SIAP',
});

// POST /api/recomendar { lat, lon, agua, prioridad, estado? } -> { clima, suelo, cultivos, rotacion, fuentes }
router.post('/', async (req, res) => {
  const { lat, lon } = parseCoords(req.body);
  const { agua, prioridad, estado } = req.body;
  if (!['temporal', 'riego'].includes(agua)) throw new HttpError(400, 'Dinos si tu parcela es de temporal o de riego.');
  if (!PRIORIDADES.includes(prioridad)) {
    throw new HttpError(400, 'Elige qué te importa más: ganar más, cuidar el suelo, gastar menos agua o arriesgar menos.');
  }
  res.json(await recommendPlot({ lat, lon, agua, prioridad, estado }));
});

export default router;

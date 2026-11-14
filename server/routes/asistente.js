import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { parseCoords } from '../lib/coords.js';
import { getClimate, summarizeClimate } from '../sources/nasaPower.js';
import { getSoil, summarizeSoil } from '../sources/soilGrids.js';
import { getForecast } from '../sources/openMeteo.js';
import { findContext } from '../llm/contexto.js';
import { buildFicha } from '../llm/ficha.js';
import { answer } from '../llm/responder.js';

const router = Router();
const MAX_QUESTION = 300;

// POST /api/asistente { lat, lon, pregunta? } -> { respuesta, acciones, fuentes, verificado, origen }
// Sin pregunta devuelve el resumen inicial de la parcela.
router.post('/', async (req, res) => {
  const { lat, lon } = parseCoords(req.body);
  const { pregunta } = req.body;
  if (pregunta != null && (typeof pregunta !== 'string' || pregunta.length > MAX_QUESTION)) {
    throw new HttpError(400, `La pregunta debe ser texto de máximo ${MAX_QUESTION} letras.`);
  }
  const [{ rows }, { soil }, pronostico, contexto] = await Promise.all([
    getClimate(lat, lon),
    getSoil(lat, lon),
    getForecast(lat, lon),
    findContext(pregunta),
  ]);
  const ficha = buildFicha({
    clima: summarizeClimate(rows),
    suelo: summarizeSoil(soil),
    pronostico,
    conocimiento: contexto.items,
  });
  const result = await answer({ ficha, pregunta });
  // `base` dice de dónde sacó el modelo lo que dijo. Con la plantilla o con un "No tengo ese dato" no usó nada extra.
  const usedExtra = result.origen === 'llm' && !/^no tengo ese dato[^.]*.?$/i.test(result.respuesta);
  res.json({ ...result, base: usedExtra ? contexto.base : 'ficha', enlaces: usedExtra ? contexto.enlaces : [] });
});

export default router;

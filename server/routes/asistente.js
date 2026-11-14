import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { parseCoords } from '../lib/coords.js';
import { getClimate, summarizeClimate } from '../sources/nasaPower.js';
import { getSoil, summarizeSoil } from '../sources/soilGrids.js';
import { getForecast } from '../sources/openMeteo.js';
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
  const [{ rows }, { soil }, pronostico] = await Promise.all([getClimate(lat, lon), getSoil(lat, lon), getForecast(lat, lon)]);
  const ficha = buildFicha({ clima: summarizeClimate(rows), suelo: summarizeSoil(soil), pronostico });
  res.json(await answer({ ficha, pregunta }));
});

export default router;

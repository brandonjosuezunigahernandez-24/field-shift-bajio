import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { parseCoords } from '../lib/coords.js';
import { POWER_CREDIT, getClimate, summarizeClimate } from '../sources/nasaPower.js';
import { SOILGRIDS_CREDIT, getSoil, summarizeSoil } from '../sources/soilGrids.js';
import { ESTADOS, PRIORIDADES, inferEstado, recommend } from '../llm/recomendador.js';

const router = Router();

// PRUEBA DE INTEGRACIÓN (no está en la rama del asistente): mientras el motor del equipo no exista,
// /api/recomendar responde con el recomendador provisional (datos del SIAP), con la forma del contrato.
router.post('/', async (req, res) => {
  const { lat, lon } = parseCoords(req.body);
  const { agua, prioridad } = req.body;
  if (!['temporal', 'riego'].includes(agua)) throw new HttpError(400, 'agua debe ser "temporal" o "riego".');
  if (!PRIORIDADES.includes(prioridad)) throw new HttpError(400, `prioridad debe ser una de: ${PRIORIDADES.join(', ')}.`);
  const estado = ESTADOS.includes(req.body.estado) ? req.body.estado : inferEstado(lon);
  const reco = recommend({ estado, agua, prioridad, costos: req.body.costos });
  if (!reco) throw new HttpError(502, 'No hay datos del SIAP para esa combinación.');
  const [{ rows, origen: oc }, { soil, origen: os }] = await Promise.all([getClimate(lat, lon), getSoil(lat, lon)]);
  res.json({ clima: { lat, lon, origen: oc, ...summarizeClimate(rows), fuente: POWER_CREDIT }, suelo: { lat, lon, origen: os, ...summarizeSoil(soil), fuente: SOILGRIDS_CREDIT }, ...reco });
});

export default router;

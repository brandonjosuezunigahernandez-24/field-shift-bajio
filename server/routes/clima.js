import { Router } from 'express';
import { parseCoords } from '../lib/coords.js';
import { stateAt } from '../lib/state.js';
import { POWER_CREDIT, getClimate, summarizeClimate } from '../sources/nasaPower.js';

const router = Router();

// GET /api/clima?lat&lon -> PV rainfall per year, dry years and monthly climatology.
router.get('/', async (req, res) => {
  const { lat, lon } = parseCoords(req.query);
  const { rows, origen } = await getClimate(lat, lon);
  // estado: Guanajuato o Querétaro según los límites del INEGI, null fuera de ellos. El perfil lo llena solo.
  res.json({ lat, lon, estado: stateAt(lat, lon), origen, ...summarizeClimate(rows), fuente: POWER_CREDIT });
});

export default router;

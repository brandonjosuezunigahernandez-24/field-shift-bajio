import { Router } from 'express';
import { parseCoords } from '../lib/coords.js';
import { POWER_CREDIT, getClimate, summarizeClimate } from '../sources/nasaPower.js';

const router = Router();

// GET /api/clima?lat&lon -> PV rainfall per year, dry years and monthly climatology.
router.get('/', async (req, res) => {
  const { lat, lon } = parseCoords(req.query);
  const { rows, origen } = await getClimate(lat, lon);
  res.json({ lat, lon, origen, ...summarizeClimate(rows), fuente: POWER_CREDIT });
});

export default router;

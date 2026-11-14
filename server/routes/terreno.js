import { Router } from 'express';
import { parseCoords } from '../lib/coords.js';
import { TERRAIN_CREDIT, getTerrain, summarizeTerrain } from '../sources/terrain.js';

const router = Router();

// GET /api/terreno?lat&lon -> 65 x 65 elevation grid of the 1 km square around the plot (3D view).
router.get('/', async (req, res) => {
  const { lat, lon } = parseCoords(req.query);
  const { terrain, origen } = await getTerrain(lat, lon);
  res.json({ lat, lon, origen, ...summarizeTerrain(terrain), fuente: TERRAIN_CREDIT });
});

export default router;

import { Router } from 'express';
import { parseCoords, roundTo } from '../lib/coords.js';
import { TERRAIN_CREDIT, TERRAIN_DECIMALS, getTerrain, summarizeTerrain, terrainSide } from '../sources/terrain.js';

const router = Router();

// GET /api/terreno?lat&lon[&lado] -> 65 x 65 elevation grid of the square around the plot (3D view).
// lado: side in meters, rounded up to 250, 500, 1000, 2000 or 4000 (default 1000), so the block fits the parcel.
// Centered to 3 decimals (~110 m) so each parcel sits in the middle of its own block;
// the answer carries that rounded center, which is where the grid really is.
router.get('/', async (req, res) => {
  const point = parseCoords(req.query);
  const lat = roundTo(point.lat, TERRAIN_DECIMALS);
  const lon = roundTo(point.lon, TERRAIN_DECIMALS);
  const { terrain, origen } = await getTerrain(lat, lon, terrainSide(req.query.lado));
  res.json({ lat, lon, origen, ...summarizeTerrain(terrain), fuente: TERRAIN_CREDIT });
});

export default router;

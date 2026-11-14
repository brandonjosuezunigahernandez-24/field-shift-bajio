import { Router } from 'express';
import { parseCoords } from '../lib/coords.js';
import { SOILGRIDS_CREDIT, getSoil, summarizeSoil } from '../sources/soilGrids.js';

const router = Router();

// GET /api/suelo?lat&lon -> pH, texture and organic carbon averaged over 0-30 cm.
router.get('/', async (req, res) => {
  const { lat, lon } = parseCoords(req.query);
  const { soil, origen } = await getSoil(lat, lon);
  const summary = summarizeSoil(soil);
  res.json({
    lat,
    lon,
    origen,
    ...summary,
    aviso: summary.sin_datos
      ? 'SoilGrids no tiene datos de suelo en este punto (suele pasar en ciudades y cuerpos de agua). Marca un punto dentro de la parcela.'
      : null,
    fuente: SOILGRIDS_CREDIT,
  });
});

export default router;

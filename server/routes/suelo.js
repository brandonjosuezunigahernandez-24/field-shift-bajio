import { Router } from 'express';
import { parseCoords } from '../lib/coords.js';
import { SOILCLASS_CREDIT, getSoilClass } from '../sources/soilClass.js';
import { SOILGRIDS_CREDIT, getSoil, summarizeSoil } from '../sources/soilGrids.js';

const router = Router();

// GET /api/suelo?lat&lon -> pH, texture and organic carbon averaged over 0-30 cm, the layers down
// to 1 m and the soil type (WRB). The soil type is extra: if it fails, the rest still answers.
router.get('/', async (req, res) => {
  const { lat, lon } = parseCoords(req.query);
  const [{ soil, layers, origen }, tipo] = await Promise.all([
    getSoil(lat, lon),
    getSoilClass(lat, lon).then((r) => r.tipo, () => null),
  ]);
  const summary = summarizeSoil(soil, layers);
  res.json({
    lat,
    lon,
    origen,
    ...summary,
    aviso: summary.sin_datos
      ? 'SoilGrids no tiene datos de suelo en este punto (suele pasar en ciudades y cuerpos de agua). Marca un punto dentro de la parcela.'
      : null,
    tipo,
    fuente: SOILGRIDS_CREDIT,
    fuente_tipo: tipo ? SOILCLASS_CREDIT : null,
  });
});

export default router;

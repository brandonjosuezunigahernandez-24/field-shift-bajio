import { Router } from 'express';
import { parseCoords } from '../lib/coords.js';
import { FORECAST_CREDIT, getForecast } from '../sources/openMeteo.js';

const router = Router();

// GET /api/pronostico?lat&lon -> próximos 7 días. Sin internet ni caché: disponible=false (no es error).
router.get('/', async (req, res) => {
  const { lat, lon } = parseCoords(req.query);
  const forecast = await getForecast(lat, lon);
  if (!forecast) {
    return res.json({ lat, lon, disponible: false, aviso: 'No hay pronóstico guardado y no hay internet.' });
  }
  res.json({ lat, lon, disponible: true, ...forecast, fuente: FORECAST_CREDIT });
});

export default router;

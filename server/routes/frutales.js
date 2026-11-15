import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { NO_ES, NO_VERIFICADO, topFrutales } from '../llm/frutales.js';

const router = Router();

// GET /api/frutales?estado=Guanajuato -> frutales del SIAP (solo lectura). Sin estado: Guanajuato y Querétaro.
router.get('/', (req, res) => {
  const estados = req.query.estado ? [String(req.query.estado)] : ['Guanajuato', 'Querétaro'];
  const frutales = estados.flatMap((e) => {
    const l = topFrutales(e, 50);
    if (!l) throw new HttpError(404, 'No tengo datos de frutales de ese estado (solo Guanajuato y Querétaro) o falta generar server/data/frutales_resumen.json.');
    return l;
  });
  res.json({ frutales, no_es: NO_ES, no_verificado: NO_VERIFICADO, fuente: 'SIAP, ciclo Perennes, 2018-2024' });
});

export default router;

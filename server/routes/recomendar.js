import { Router } from 'express';

const router = Router();

// Fase 2: aquí va el motor de reglas (ver docs/api-contract.md).
router.post('/', (req, res) => {
  res.status(501).json({ error: 'Las recomendaciones todavía no están listas (llegan en la fase 2).' });
});

export default router;

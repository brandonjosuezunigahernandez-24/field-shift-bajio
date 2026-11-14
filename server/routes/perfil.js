import { Router } from 'express';
import { PREGUNTAS } from '../llm/perfil.js';

const router = Router();

// GET /api/perfil/preguntas -> las preguntas del perfil de parcela, en orden, para que el front las muestre una por una.
// Todas llevan "No sé" (valor "no_se"); solo agua y prioridad son obligatorias.
router.get('/preguntas', (req, res) => res.json({ preguntas: PREGUNTAS }));

export default router;

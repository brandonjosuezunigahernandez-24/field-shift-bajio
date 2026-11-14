import express from 'express';
import climaRouter from './routes/clima.js';
import sueloRouter from './routes/suelo.js';
import recomendarRouter from './routes/recomendar.js';
import { HttpError } from './lib/errors.js';
import { FIXTURE_POINTS } from './lib/seasons.js';

// All routes are mounted here so nobody else needs to edit this file.
export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  // Quick-button plots: only points with committed fixtures, so every button works offline.
  app.get('/api/ejemplos', (req, res) => res.json(FIXTURE_POINTS));
  app.use('/api/clima', climaRouter);
  app.use('/api/suelo', sueloRouter);
  app.use('/api/recomendar', recomendarRouter);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Esa ruta no existe.' });
  });

  // Express 5 forwards errors thrown in async handlers to this middleware.
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Algo falló en el servidor. Intenta de nuevo.' });
  });

  return app;
}

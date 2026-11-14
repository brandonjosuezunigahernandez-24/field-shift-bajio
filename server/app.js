import express from 'express';
import { fileURLToPath } from 'node:url';
import climaRouter from './routes/clima.js';
import sueloRouter from './routes/suelo.js';
import recomendarRouter from './routes/recomendar.js';
import asistenteRouter from './routes/asistente.js';
import pronosticoRouter from './routes/pronostico.js';
import vozRouter from './routes/voz.js';
import { HttpError } from './lib/errors.js';

// All routes are mounted here so nobody else needs to edit this file.
export function createApp() {
  const app = express();
  app.use(express.json());

  // Página de prueba del asistente (herramienta de desarrollo, no es la app final).
  app.get('/probar', (req, res) => res.sendFile(fileURLToPath(new URL('./public/probar.html', import.meta.url))));

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/clima', climaRouter);
  app.use('/api/suelo', sueloRouter);
  app.use('/api/recomendar', recomendarRouter);
  app.use('/api/pronostico', pronosticoRouter);
  app.use('/api/asistente', asistenteRouter);
  app.use('/api/voz', vozRouter);

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

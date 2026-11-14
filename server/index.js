import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3001;

createApp().listen(PORT, () => {
  const mode = process.env.OFFLINE === '1' ? ' (modo sin internet: solo caché y fixtures)' : '';
  console.log(`Field Shift Bajío API en http://localhost:${PORT}${mode}`);
});

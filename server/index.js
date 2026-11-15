import { createApp } from './app.js';
import { precalentar } from './llm/ollama.js';

const PORT = Number(process.env.PORT) || 3001;

createApp().listen(PORT, () => {
  const mode = process.env.OFFLINE === '1' ? ' (modo sin internet: solo caché y fixtures)' : '';
  console.log(`Field Shift Bajío API en http://localhost:${PORT}${mode}`);
  // Carga el modelo en segundo plano para que la primera pregunta no espere la carga (OLLAMA_PRECALENTAR=0 lo apaga).
  if (process.env.OLLAMA_PRECALENTAR !== '0') {
    precalentar().then((ok) => console.log(ok ? 'Modelo local listo.' : 'Ollama no respondió; el asistente usará plantillas hasta que esté.'));
  }
});

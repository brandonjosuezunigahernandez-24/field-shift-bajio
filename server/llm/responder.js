import { actionsFor } from './acciones.js';
import { askModel } from './ollama.js';
import { templateAnswer } from './plantilla.js';
import { verifyNumbers } from './verificador.js';

const SOURCES = ['NASA POWER', 'SoilGrids'];
const SUMMARY_QUESTION = 'Explícame cómo es mi parcela: lluvia, años secos y suelo.';

// Nunca lanza: si el modelo falla o inventa un número, responde con la plantilla.
export async function answer({ ficha, pregunta, ask = askModel }) {
  const q = pregunta?.trim() || SUMMARY_QUESTION;
  try {
    const r = await ask(ficha, q);
    // Gemma a veces deja corchetes vacíos "[ ]" al citar fuentes.
    const texto = (r.respuesta ?? '').replace(/\[\s*\]/g, '').replace(/\s+/g, ' ').trim();
    if (texto && verifyNumbers(texto, ficha).ok) {
      return {
        respuesta: texto,
        acciones: actionsFor(texto),
        fuentes: (r.fuentes ?? []).filter((f) => SOURCES.includes(f)),
        verificado: true,
        origen: 'llm',
      };
    }
  } catch (err) {
    console.error('Asistente: el modelo falló, uso la plantilla.', err.message);
  }
  return { respuesta: templateAnswer(ficha), acciones: [], fuentes: SOURCES, verificado: true, origen: 'plantilla' };
}

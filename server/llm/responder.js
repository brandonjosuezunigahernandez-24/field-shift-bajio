import { actionsFor } from './acciones.js';
import { askModel } from './ollama.js';
import { recortarFicha } from './prompt.js';
import { templateAnswer } from './plantilla.js';
import { verifyNumbers } from './verificador.js';

const SOURCES = ['NASA POWER', 'SoilGrids', 'Open-Meteo', 'Base local', 'Wikipedia', 'SIAP'];
export const REFUSAL = /^(no tengo ese dato|no lo s[eé] con mis datos)/i;
const SUMMARY_QUESTION = 'Explícame cómo es mi parcela: lluvia, años secos y suelo.';

// Nunca lanza: si el modelo falla o inventa un número, responde con la plantilla.
export async function answer({ ficha, pregunta, historial = [], ask = askModel }) {
  const q = pregunta?.trim() || SUMMARY_QUESTION;
  // El modelo solo ve lo que la pregunta pide; el verificador revisa contra eso mismo.
  const vista = recortarFicha(ficha, q);
  try {
    const r = await ask(vista, q, { historial });
    // Gemma a veces deja corchetes vacíos "[ ]" al citar fuentes.
    // También quita corchetes que no son una fuente conocida ("[suelo]", "[pronostico_7_dias]").
    const texto = (r.respuesta ?? '')
      .replace(/\[\s*\]/g, '')
      .replace(/\[([^\]]*)\]/g, (m, name) => (SOURCES.includes(name) ? m : ''))
      .replace(/\s+/g, ' ')
      .trim();
    if (texto && verifyNumbers(texto, vista).ok) {
      return {
        respuesta: texto,
        // Si el modelo se niega, no hay nada que mostrar en el mapa.
        acciones: REFUSAL.test(texto) ? [] : actionsFor(texto),
        fuentes: (r.fuentes ?? []).filter((f) => SOURCES.includes(f)),
        verificado: true,
        origen: 'llm',
      };
    }
  } catch (err) {
    console.error('Asistente: el modelo falló, uso la plantilla.', err.message);
  }
  // Si el modelo falló pero hay un texto de apoyo con fuente, mostrarlo es mejor que el resumen de la parcela.
  const apoyo = vista.conocimiento?.[0] ?? ficha.conocimiento?.[0];
  if (apoyo) {
    return { respuesta: `${apoyo.texto} [${apoyo.fuente}]`, acciones: [], fuentes: [apoyo.fuente], verificado: true, origen: 'plantilla' };
  }
  return { respuesta: templateAnswer(ficha), acciones: [], fuentes: SOURCES, verificado: true, origen: 'plantilla' };
}

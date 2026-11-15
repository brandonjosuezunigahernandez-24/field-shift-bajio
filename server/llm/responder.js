import { actionsFor } from './acciones.js';
import { askModel } from './ollama.js';
import { recortarFicha } from './prompt.js';
import { templateAnswer } from './plantilla.js';
import { verifyNumbers } from './verificador.js';

const SOURCES = ['NASA POWER', 'SoilGrids', 'Open-Meteo', 'Base local', 'Wikipedia', 'SIAP'];
export const REFUSAL = /^(no tengo ese dato|no lo s[eé] con mis datos)/i;
// Respuesta floja: una frase que se muerde la cola ("La erosión frena la erosión") o que solo repite la pregunta.
// shortcut: raíces de 5 letras, no un análisis real del español; si marca de más, subir el mínimo de palabras.
const raices = (t) => (t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z]{5,}/g) ?? []).map((w) => w.slice(0, 5));
export function floja(texto, pregunta = '') {
  const limpio = texto.replace(/\[[^\]]*\]/g, '');
  const tautologia = limpio.split(/[.;:!?]+/).some((f) => {
    const r = raices(f);
    return f.trim().split(/\s+/).length <= 8 && new Set(r).size < r.length;
  });
  const q = new Set(raices(pregunta));
  const nuevas = new Set(raices(limpio).filter((r) => !q.has(r)));
  return tautologia || (!/\d/.test(limpio) && nuevas.size < 3); // con números es un dato, no un eco
}

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
    // Si se niega, se respeta (la tarjeta pudo no venir al caso); si contesta flojo, mejor la tarjeta tal cual (abajo).
    if (texto && verifyNumbers(texto, vista).ok && (REFUSAL.test(texto) || !floja(texto, q))) {
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

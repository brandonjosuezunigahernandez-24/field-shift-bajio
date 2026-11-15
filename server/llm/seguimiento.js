// Completa la pregunta con lo que ya se sabe de la plática y del perfil, ANTES de decidir qué contestar:
//  1) Seguimiento corto ("¿y el frijol?", "¿y en 2023?", "¿y en marzo?") -> la pregunta anterior con ese cambio.
//  2) Pregunta sobre "mi cultivo" / "lo que tengo sembrado" / "¿cuánto voy a cosechar?" sin decir cuál, con cultivo_actual maíz
//     -> se le agrega "(maíz)" para que la conteste el módulo del maíz y no el tema de lluvia o el modelo de lenguaje.
// Solo cambia el texto con que se enruta; si no aplica, devuelve la pregunta igual.
import { MESES } from './climatologia.js';
import { detectCrop } from './siap.js';
import { esMaiz, intencionMaiz, rendPropio } from './maiz.js';
import { detectarTema } from './respuestas.js';
import { esConcepto, wantsRecommendation } from './intencion.js';

const strip = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const CULTIVO_RE = /\b(maiz|sorgo|frijol(es)?|trigo|cebada|garbanzos?|brocoli|jitomates?|avena|girasol|cacahuates?|calabazas?|papas?|cebollas?|chiles?|fresas?|alfalfa|agave|nopal(es)?|aguacates?)\b/;
const ANIO_RE = /\b(19|20)\d\d\b|(el )?ano pasado|este ano/;
const MES_RE = new RegExp(`\\b(${MESES.join('|')})\\b`);
const quita = (s) => s.replace(/^[\s¿¡]*y\s+/, '').replace(/[?¿!¡.]/g, '').trim();

// 1) "¿y el frijol?" después de "¿A cuánto se paga el maíz?" -> "a cuanto se paga el frijol".
export function seguimiento(pregunta, historial = []) {
  const q = strip(pregunta ?? '');
  const prev = historial.at(-1)?.pregunta;
  // "en 3 hectáreas" / "por hectárea" después de "me salieron 2 toneladas": la respuesta corta completa la anterior.
  // "de maíz" después de "Coseché 5 toneladas en 4 hectáreas" (el asistente preguntó de qué cultivo).
  if (prev && rendPropio(strip(prev)) && !detectCrop(strip(prev)) && !esMaiz(prev) && (CULTIVO_RE.test(q) || esMaiz(q)) && q.split(/\s+/).length <= 4) return `${strip(prev).replace(/[?¿!¡.]/g, '')} ${q}`;
  if (prev && rendPropio(strip(prev))?.falta_ha &&/\b(ha|hect\w*)\b/.test(q) && q.split(/\s+/).length <= 6) return `${strip(prev).replace(/[?¿!¡.]/g, '')} ${q}`;
  if (!prev ||!/^[\s¿¡]*y\s/.test(q) || q.split(/\s+/).length > 7) return pregunta;
  const p = strip(prev);
  const resto = quita(q);
  for (const re of [CULTIVO_RE, ANIO_RE, MES_RE]) {
    const nuevo = resto.match(re)?.[0];
    if (nuevo && re.test(p)) return p.replace(re, nuevo);
  }
  if (CULTIVO_RE.test(resto)) return resto; // "¿y el sorgo cuánto rinde?" ya se entiende sola
  return `${p.replace(/[?¿!¡.]/g, '').trim()} ${resto}`; // "¿y en marzo?" tras "¿hay heladas?" -> "hay heladas en mi parcela en marzo"
}

// 2) Habla de su propio cultivo sin nombrarlo.
// Primera persona sobre su propia cosecha ("saco", "voy a cosechar", "pierdo") también cuenta.
const PROPIO = /(mi cultivo|mis cultivos|mi siembra|mi cosecha|lo que (tengo|sembre|siembro|plante)|lo cosecho|lo levanto|me lo (van a )?(pagan|pagar)|me (lo )?(deja|dejaria)|voy a (cosechar|sacar|levantar)|me (salen|sale|va a dar|van a salir)|\b(saco|sacaria|levanto|cosecho|pierdo|saque|levante|coseche)\b|me (dieron|dio|salio|salieron)|me queda)/;
const DEL_CULTIVO = ['produccion', 'precio', 'ciclo', 'decision', 'riesgo', 'riego'];
export function conCultivoActual(pregunta, cultivoActual) {
  // "Coseché 5 toneladas" de otro cultivo del perfil (frijol, sorgo...): se le agrega cuál para compararlo con el SIAP.
  if (cultivoActual && cultivoActual !== 'maiz' && pregunta && rendPropio(strip(pregunta)) && !detectCrop(strip(pregunta)) && !esMaiz(pregunta)) return `${pregunta} (${cultivoActual})`;
  if (cultivoActual !== 'maiz' || !pregunta || esMaiz(pregunta) || wantsRecommendation(pregunta) || esConcepto(pregunta)) return pregunta;
  const q = strip(pregunta);
  if (/(guard|capt|junt|cosech)\w* (el |la )?agua/.test(q)) return pregunta; // "¿cómo guardo el agua de lluvia?" no es del maíz
  const propio = PROPIO.test(q);
  if (!propio && (detectCrop(q) || detectarTema(q))) return pregunta; // "¿cuánto llueve en julio?" sigue siendo de lluvia
  if (detectCrop(q) && !/lo que (tengo|sembre|siembro)/.test(q)) return pregunta; // "¿cuánto saco de sorgo?" es del sorgo
  const con = `${pregunta} (maíz)`;
  return propio || DEL_CULTIVO.includes(intencionMaiz(con)) ? con : pregunta;
}

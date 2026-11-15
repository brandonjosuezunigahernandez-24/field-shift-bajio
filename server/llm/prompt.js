// Lo que se le manda al modelo: prompt de sistema corto, ficha recortada a la pregunta y tarjetas por parecido.
// Menos texto = gemma3:4b más rápido y con menos ganas de soltar números que no vienen al caso (ver docs/cambios/34).
import { readFileSync } from 'node:fs';

export const SYSTEM = `Eres un técnico de campo del Bajío que platica con un agricultor de temporal. Español de México, sencillo, de tú.
Contesta en 2 a 4 frases cortas: primero la respuesta a lo que preguntó; luego una cosa concreta que puede hacer, sacada de los DATOS.
Usa SOLO los DATOS. No agregues causas, consejos, productos, dosis ni marcas que no estén ahí. Si un texto habla del tema aunque no conteste exacto, di lo que sí dice. Ignora los textos de otro tema o de otro cultivo.
Pon la fuente entre corchetes tal como viene en los DATOS: [Base local], [NASA POWER], [SoilGrids], [Open-Meteo], [SIAP] o [Wikipedia]. Copia los números tal cual.
Si ningún texto de los DATOS habla del tema, responde solo: "No lo sé con mis datos. Pregúntale a un técnico del INIFAP o de la SADER de tu zona."`;

const NO_SE = 'No lo sé con mis datos. Pregúntale a un técnico del INIFAP o de la SADER de tu zona.';
// Ejemplos pocos-disparos: formato (respuesta + qué hacer + cita), negarse sin rellenar y no usar un texto que no viene al caso.
export const EJEMPLOS = [
  {
    datos: { conocimiento: [{ texto: 'Dejar rastrojo sobre el suelo lo cubre, reduce la evaporación del agua y frena la erosión.', fuente: 'Base local' }] },
    pregunta: '¿Sirve dejar el rastrojo?',
    respuesta: 'Sí: el rastrojo cubre el suelo, reduce la evaporación del agua y frena la erosión [Base local]. Después de cosechar, déjalo encima del suelo en lugar de quemarlo.',
  },
  {
    datos: { conocimiento: [{ texto: 'El sorgo suele aguantar mejor la falta de agua que el maíz.', fuente: 'Base local' }] },
    pregunta: '¿Cuándo cosecho el sorgo?',
    respuesta: NO_SE,
  },
  {
    datos: { lluvia_verano: { mediana_mm: 500, fuente: 'NASA POWER' } },
    pregunta: '¿Cuándo le pongo cal a mi tierra?',
    respuesta: NO_SE,
  },
];

// --- Tarjetas de conocimiento por parecido (tf-idf + coseno; findLocal de contexto.js solo cuenta palabras clave) ---
const KNOWLEDGE = JSON.parse(readFileSync(new URL('./conocimiento.json', import.meta.url), 'utf8'));
// Términos: palabras de 4+ letras sin relleno, cortadas a 5 letras ("orgánico" y "orgánica" -> "organ").
const STOP = new Set(['para','sirve','como','cual','cuando','donde','porque','pasa','hago','hace','tiene','tenga','debo','puedo','quiero','sobre','este','esta','esto','estos','estas','mucho','poco','mejor','bueno','buena','vale','pena','conviene','meter','necesita','darse','bien','entre','otro','otra','otros','sola','solo','todo','cada','menos','tambien','pero','sino','unos','unas','seguido','parcela','sembrar','siembro','siembra','sembrado','cultivo','cultivos','cultivar']);
const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const terms = (t) => (plain(t).match(/[a-z0-9ñ]+/g) ?? []).filter((w) => (w.length >= 4 || w === 'ph') && !STOP.has(w)).map((w) => w.slice(0, 5));
const docs = KNOWLEDGE.map((k) => terms(`${k.palabras.join(' ')} ${k.texto}`));
const df = new Map();
docs.flat().forEach((r) => df.set(r, (df.get(r) ?? 0) + 1));
const idf = (r) => Math.log((1 + docs.length) / (1 + (df.get(r) ?? 0)));
const vec = (rs) => {
  const v = new Map();
  rs.forEach((r) => v.set(r, (v.get(r) ?? 0) + idf(r)));
  const n = Math.hypot(...v.values()) || 1;
  for (const [k, x] of v) v.set(k, x / n);
  return v;
};
const index = docs.map(vec);
const cos = (a, b) => [...a].reduce((s, [k, x]) => s + x * (b.get(k) ?? 0), 0);

// shortcut: el umbral 0.1 salió de probar con test/eval/modelo-abierto.json; con más tarjetas habrá que recalibrarlo.
export function tarjetas(pregunta, k = 2, umbral = 0.1) {
  const q = vec(terms(pregunta));
  return index.map((d, i) => ({ i, s: cos(q, d) }))
    .filter((x) => x.s >= umbral)
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map(({ i }) => ({ texto: KNOWLEDGE[i].texto, fuente: 'Base local' }));
}

// --- Ficha recortada: solo lo que la pregunta pide ---
const PIDE_LLUVIA = /(lluv|llov|llue|seco|sequi|temporal|clima|agua)/;
const PIDE_SUELO = /(\bph\b|arcill|arena|textura|carbono|encharc|drena|mi suelo)/;
const PIDE_DIA = /(hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|que dia)/;
const PIDE_SIAP = /(precio|vend|paga|cuest|rind|rendim|produc|perd|siniestr|riesg|superficie|hectar|cuant)/;

export function recortarFicha(ficha, pregunta) {
  const q = plain(pregunta);
  const { lluvia_verano, suelo, pronostico_7_dias: pron, siap, conocimiento = [], ...resto } = ficha;
  // Las tarjetas locales se eligen por parecido; los textos de Wikipedia (ya filtrados por contexto.js) se quedan.
  const cards = [...tarjetas(pregunta), ...conocimiento.filter((c) => c.fuente !== 'Base local')];
  const out = { ...(cards.length && { conocimiento: cards }), ...resto };
  if (siap && (PIDE_SIAP.test(q) || !cards.length)) out.siap = siap;
  if (pron) out.pronostico_7_dias = PIDE_DIA.test(q) ? pron : { ...pron, dias: undefined };
  // "Dime todo sobre mi parcela": la lluvia y el suelo son la respuesta. Sin eso no se mandan (el modelo los soltaba de relleno).
  const parcela = /(todo|resumen|como es|como esta)/.test(q) && /(parcela|terreno|rancho)/.test(q);
  if (lluvia_verano && (PIDE_LLUVIA.test(q) || parcela)) out.lluvia_verano = lluvia_verano;
  if (suelo && (PIDE_SUELO.test(q) || parcela)) out.suelo = suelo;
  return out;
}

// Mensajes para /api/chat de Ollama (u otro modelo con el mismo formato de chat).
export function mensajes(ficha, pregunta, historial = []) {
  const user = (datos, p) => ({ role: 'user', content: `DATOS: ${JSON.stringify(datos)}\nPREGUNTA: ${p}` });
  return [
    { role: 'system', content: SYSTEM },
    ...EJEMPLOS.flatMap((e) => [user(e.datos, e.pregunta), { role: 'assistant', content: e.respuesta }]),
    // Memoria corta: las últimas vueltas (los datos van en la pregunta actual).
    ...historial.flatMap((t) => [{ role: 'user', content: t.pregunta }, { role: 'assistant', content: t.respuesta }]),
    user(ficha, pregunta),
  ];
}

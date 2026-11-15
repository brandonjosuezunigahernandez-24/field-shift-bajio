// Entender qué quiere el agricultor con aprendizaje automático, como RESPALDO del enrutado por palabras clave.
// Clasificador: pedazos de letras (3 a 5) y palabras sueltas y en pares -> regresión logística de varias clases. JS puro, sin dependencias.
// Se entrena con scripts/entrenar-intencion.js (test/eval/intenciones.json) y se guarda en data/modelo_intencion.json.
// Uso: rutaPalabras(pregunta) -> a dónde la manda hoy el código; respaldo(pregunta) -> qué hacer cuando el código no sabe.
import { readFileSync } from 'node:fs';
import { detectarTema } from './respuestas.js';
import { esMaiz, intencionMaiz } from './maiz.js';
import { esConcepto, isFollowUp, wantsRecommendation } from './intencion.js';
import { detectCrop } from './siap.js';
import { findLocal } from './contexto.js';

const plano = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Rasgos de una pregunta: palabras, pares de palabras y pedazos de 3 a 5 letras de cada palabra (así "sembarr" se parece a "sembrar").
export function rasgos(texto) {
  const ws = plano(texto).split(' ').filter(Boolean);
  const out = new Set();
  ws.forEach((w, i) => {
    out.add(`w:${w}`);
    if (i) out.add(`b:${ws[i - 1]}_${w}`);
    const p = `<${w}>`;
    for (let n = 3; n <= 5; n++) for (let k = 0; k + n <= p.length; k++) out.add(`c:${p.slice(k, k + n)}`);
  });
  return [...out];
}

// Entrena la regresión logística (descenso de gradiente de a una pregunta, con castigo L2). ejemplos: [{ pregunta, intencion }].
export function entrenar(ejemplos, { epocas = 30, paso = 1, l2 = 1e-4, minimo = 2 } = {}) {
  const clases = [...new Set(ejemplos.map((e) => e.intencion))].sort();
  const cuenta = new Map();
  const docs = ejemplos.map((e) => rasgos(e.pregunta));
  for (const d of docs) for (const f of d) cuenta.set(f, (cuenta.get(f) ?? 0) + 1);
  const vocab = [...cuenta].filter(([, n]) => n >= minimo).map(([f]) => f).sort();
  const idx = new Map(vocab.map((f, i) => [f, i]));
  const X = docs.map((d) => d.map((f) => idx.get(f)).filter((i) => i !== undefined));
  const y = ejemplos.map((e) => clases.indexOf(e.intencion));
  const K = clases.length, V = vocab.length;
  const W = new Float64Array(K * V), b = new Float64Array(K);
  let s = 12345; const azar = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); // orden fijo: mismo modelo cada vez
  const orden = X.map((_, n) => n);
  for (let ep = 0; ep < epocas; ep++) {
    for (let n = orden.length - 1; n > 0; n--) { const j = Math.floor(azar() * (n + 1)); [orden[n], orden[j]] = [orden[j], orden[n]]; }
    const lr = paso / (1 + ep / 10);
    for (const n of orden) { // descenso de gradiente de a una pregunta
      const xs = X[n], p = softmax(puntajes(xs, W, b, K, V));
      const v = 1 / Math.sqrt(xs.length || 1); // rasgos binarios con norma 1
      for (let k = 0; k < K; k++) {
        const g = p[k] - (k === y[n] ? 1 : 0);
        b[k] -= lr * g;
        for (const i of xs) W[k * V + i] -= lr * (g * v + l2 * W[k * V + i]);
      }
    }
  }
  // Se guardan solo los pesos que pesan (el archivo queda chico).
  const pesos = {};
  vocab.forEach((f, i) => {
    const fila = clases.map((_, k) => (Math.abs(W[k * V + i]) < 0.05 ? 0 : Math.round(W[k * V + i] * 100) / 100));
    if (fila.some((w) => w !== 0)) pesos[f] = fila;
  });
  return { clases, sesgo: [...b].map((x) => Math.round(x * 1000) / 1000), pesos };
}

function puntajes(xs, W, b, K, V) {
  const s = [...b], v = 1 / Math.sqrt(xs.length || 1);
  for (const i of xs) for (let k = 0; k < K; k++) s[k] += W[k * V + i] * v;
  return s;
}
const softmax = (s) => { const m = Math.max(...s); const e = s.map((x) => Math.exp(x - m)); const t = e.reduce((a, c) => a + c, 0); return e.map((x) => x / t); };

// -> { intencion, confianza (0 a 1), top: [[intencion, prob], ...] }
export function predecir(modelo, pregunta) {
  const fs = rasgos(pregunta);
  const v = 1 / Math.sqrt(fs.length || 1);
  const s = [...modelo.sesgo];
  for (const f of fs) { const w = modelo.pesos[f]; if (w) for (let k = 0; k < s.length; k++) s[k] += w[k] * v; }
  const p = softmax(s);
  const top = modelo.clases.map((c, k) => [c, p[k]]).sort((a, b) => b[1] - a[1]);
  return { intencion: top[0][0], confianza: top[0][1], top: top.slice(0, 3) };
}

// Intenciones que se contestan con el modelo de lenguaje y la base de textos (no hay plantilla).
const AL_MODELO = ['concepto', 'general'];
export const destino = (intencion) => (AL_MODELO.includes(intencion) ? 'modelo' : intencion);

// Ids de maiz.js -> intención del conjunto etiquetado.
export const MAIZ = {
  produccion: 'maiz_produccion', decision: 'maiz_decision', ciclo: 'maiz_ciclo', dosciclos: 'maiz_ciclo', precio: 'maiz_precio', precio_mes: 'maiz_precio',
  riesgo: 'maiz_riesgo', riego: 'maiz_riego', agua: 'maiz_riego', suelo: 'maiz_suelo', comparar: 'maiz_comparar', donde: 'maiz_donde',
  rotacion: 'maiz_rotacion', despues: 'recomendar', helada: 'heladas', plaga: 'peligro', siembra: 'siembra', semilla: 'sin_dato', seguro: 'sin_dato', costo: 'sin_dato',
};
// Intención -> id de maiz.js para redactarla (inverso de MAIZ, solo las que son del maíz).
export const ID_MAIZ = { maiz_produccion: 'produccion', maiz_decision: 'decision', maiz_ciclo: 'ciclo', maiz_precio: 'precio', maiz_riesgo: 'riesgo', maiz_riego: 'agua', maiz_suelo: 'suelo', maiz_comparar: 'comparar', maiz_donde: 'donde', maiz_rotacion: 'rotacion' };
const RIESGO = /(riesg|perdid|siniestr|sequi|seco|llue|llov|lluvia)/;
const CONCEPTO = /(para que sirve|que es|que son|como funciona)/;

// A dónde manda hoy routes/asistente.js la pregunta, solo por palabras (mismo orden que resolver()).
// 'modelo' = la contesta el modelo de lenguaje; 'maiz_?' = pregunta de maíz que no entiende (responde "no tengo ese dato del maíz").
export function rutaPalabras(pregunta) {
  const q = plano(pregunta);
  const tema = detectarTema(pregunta);
  if (esMaiz(pregunta) && !['peligro', 'insumos'].includes(tema)) {
    const id = intencionMaiz(pregunta);
    if (id === 'helada') return 'heladas';
    if (id) return MAIZ[id];
    if (!tema && !CONCEPTO.test(q)) return 'maiz_?';
  }
  if (wantsRecommendation(pregunta)) return 'recomendar';
  if (detectCrop(pregunta) === 'maiz' && RIESGO.test(q) && !/helad|hiela|fri[oa]/.test(q)) return 'maiz_riesgo';
  if (tema === 'fuera' && findLocal(pregunta).length) return 'modelo';
  return tema ?? 'modelo';
}

// El código "no sabe" cuando la manda al modelo, a "fuera de tema" o a "no tengo ese dato del maíz".
export const noSabe = (ruta) => ['modelo', 'fuera', 'maiz_?'].includes(ruta);

let MODELO;
const cargar = () => (MODELO ??= JSON.parse(readFileSync(new URL('../data/modelo_intencion.json', import.meta.url), 'utf8')));

// Qué hacer cuando el enrutado por palabras no sabe. Devuelve:
//   null -> no se toca nada (el código sí sabe, o no hay nada mejor que hacer);
//   { intencion, confianza } -> el clasificador está seguro: contestar esa intención;
//   { intencion: null, confianza, sugerencias } -> iba al modelo de lenguaje sin nada que lo respalde: decir "No tengo ese dato" y sugerir 3 preguntas.
export function respaldo(pregunta, ruta = rutaPalabras(pregunta), modelo = cargar()) {
  // Un seguimiento ("¿por qué sorgo?") o una pregunta para entender ("¿qué es la rotación?") los contesta el modelo de lenguaje.
  if (!noSabe(ruta) || isFollowUp(pregunta) || esConcepto(pregunta)) return null;
  const p = predecir(modelo, pregunta);
  // Sin ninguna palabra del campo (ruta "fuera"), cambiarla a un tema del campo pide más confianza ("como bajo de peso" -> precios).
  const ok = p.confianza >= (ruta === 'fuera' ? Math.max(modelo.umbral, 0.7) : modelo.umbral) && !(ID_MAIZ[p.intencion] && !esMaiz(pregunta)); // las respuestas del maíz solo si la pregunta habla del maíz
  if (ok) {
    // "sin dato" no tiene respuesta propia, y "fuera de tema" no se dice si la base de conocimiento sí sabe del tema.
    if (destino(p.intencion) === ruta || p.intencion === 'sin_dato' || (p.intencion === 'fuera' && findLocal(pregunta).length)) return null;
    return { intencion: p.intencion, confianza: p.confianza };
  }
  // Negarse solo si la validación lo aprobó (modelo.negar). "Fuera de tema" y "no tengo ese dato del maíz" ya contestan así;
  // si parece pregunta para entender o hay texto en la base de conocimiento, que conteste el modelo de lenguaje.
  if (!modelo.negar || ruta !== 'modelo' || AL_MODELO.includes(p.intencion) || findLocal(pregunta).length) return null;
  return { intencion: null, confianza: p.confianza, sugerencias: sugerencias(p.top.map(([c]) => c)) };
}

// Tres preguntas que sí sabe contestar, de los temas que el clasificador vio más probables.
const EJEMPLOS = {
  recomendar: '¿Qué me conviene sembrar?', siembra: '¿Cuándo siembro?', lluvia: '¿Cuánto llueve en verano?', secos: '¿Cuáles fueron los años secos?',
  anio: '¿Cuánto llovió en 2023?', pronostico: '¿Va a llover esta semana?', tendencia: '¿Está llegando menos lluvia que antes?',
  heladas: '¿Hay riesgo de heladas?', calor: '¿Cuál es el mes más caluroso?', radiacion: '¿Cuánta radiación solar hay?',
  humedad: '¿Qué tan húmeda está la tierra en septiembre?', suelo: '¿Cómo está mi suelo?', siap: '¿A cuánto se vende el sorgo?',
  cultivo: '¿Puedo sembrar brócoli?', frutales: '¿Qué frutales hay en mi estado?', maiz_produccion: '¿Cuánto maíz voy a cosechar en mi parcela?',
  maiz_decision: '¿Es buen año para sembrar maíz?', maiz_ciclo: '¿Cuánto tarda el maíz en estar listo?', maiz_precio: '¿A cómo se paga la tonelada de maíz?',
  maiz_riesgo: '¿Qué tan riesgoso es el maíz de temporal?', maiz_riego: '¿Cuánta agua necesita el maíz?', maiz_suelo: '¿Mi suelo sirve para maíz?',
  maiz_comparar: '¿Maíz o sorgo, cuál me conviene?', maiz_donde: '¿Dónde se siembra más maíz en Guanajuato?', maiz_rotacion: 'Sembré frijol el año pasado, ¿puedo sembrar maíz?',
};
export function sugerencias(probables = []) {
  const base = ['recomendar', 'lluvia', 'heladas', 'maiz_produccion', 'suelo'];
  return [...new Set([...probables, ...base].filter((c) => EJEMPLOS[c]))].slice(0, 3).map((c) => EJEMPLOS[c]);
}

// Intenciones que se contestan con una plantilla de respuestas.js (el nombre es el mismo tema).
export const TEMAS_PLANTILLA = ['siembra', 'lluvia', 'secos', 'anio', 'pronostico', 'tendencia', 'heladas', 'calor', 'radiacion', 'humedad', 'suelo', 'siap', 'cultivo', 'frutales', 'peligro', 'insumos', 'fuera', 'apoyos', 'credito'];

// Para la ruta: como respaldo(), pero si falta el modelo o algo falla, no cambia nada.
export function respaldoSeguro(pregunta) {
  try { return pregunta ? respaldo(pregunta) : null; } catch { return null; }
}

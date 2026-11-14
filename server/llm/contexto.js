// Contexto extra para preguntas generales de agricultura.
// Capa 1: base local (sirve sin internet). Capa 2: Wikipedia en español (solo con internet).
import { readFileSync } from 'node:fs';
import { fetchJson } from '../lib/fetchJson.js';

const KNOWLEDGE = JSON.parse(readFileSync(new URL('./conocimiento.json', import.meta.url), 'utf8'));
// Los textos de la base local los escribimos nosotros de conocimiento general: falta confirmarlos con FAO/INIFAP.
const LOCAL_SOURCE = 'Base local';

const strip = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const words = (s) => strip(s).match(/[a-z0-9]+/g) ?? [];

export function findLocal(question, limit = 3) {
  const q = new Set(words(question));
  return KNOWLEDGE.map((e) => ({ e, score: e.palabras.filter((p) => q.has(p)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ e }) => ({ texto: e.texto, fuente: LOCAL_SOURCE }));
}

// Palabras de relleno que no sirven para buscar.
const STOP = new Set(['como','cual','cuales','cuando','donde','para','porque','puede','pueden','aqui','sirve','hace','tiene','tienen','debo','puedo','quiero','sobre','entre','estos','estas','esto','esta','este','mucho','poco','mejor','usar','uso','cuanto','cuanta','quien','quienes','verdad','hay','seria','sera','habra','cultivar','sembrar','siembra']);
// Las palabras más largas suelen ser las más específicas (amaranto, brocoli), así que se buscan primero.
const keywords = (q) => [...new Set(words(q).filter((w) => w.length >= 5 && !STOP.has(w)))].sort((a, b) => b.length - a.length).slice(0, 3);
// La página debe hablar de plantas o cultivos (Wikipedia a veces devuelve homónimos que no tienen que ver).
const PLANT = /(planta|cereal|hortaliza|legumbre|cultivo|agricol|semilla|verdura|grano)/;

export function parseWikipedia(raw) {
  const page = Object.values(raw?.query?.pages ?? {})[0];
  if (!page?.extract) return null;
  return { titulo: page.title, texto: page.extract.replace(/​/g, '').trim(), fuente: 'Wikipedia', enlace: page.fullurl };
}

async function findInternet(question) {
  if (process.env.OFFLINE === '1') return null;
  const keys = keywords(question);
  if (!keys.length) return null;
  const url = 'https://es.wikipedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: keys[0], gsrlimit: '1',
    prop: 'extracts|info', inprop: 'url', exintro: '1', explaintext: '1', exsentences: '3', format: 'json', origin: '*',
  });
  try {
    const page = parseWikipedia(await fetchJson(url, { timeoutMs: 6000 }));
    // Solo sirve si la página habla de plantas y menciona (por su raíz) una palabra de la pregunta.
    const text = strip(`${page?.titulo} ${page?.texto}`);
    return page && PLANT.test(text) && keys.some((k) => text.includes(k.slice(0, 6))) ? page : null;
  } catch (err) {
    console.warn(`[wikipedia] no se pudo consultar: ${err.message}`);
    return null;
  }
}

// -> { base: 'ficha'|'conocimiento'|'internet', items: [{texto, fuente}], enlaces: [] }
export async function findContext(question) {
  if (!question?.trim()) return { base: 'ficha', items: [], enlaces: [] };
  const local = findLocal(question);
  if (local.length) return { base: 'conocimiento', items: local, enlaces: [] };
  const web = await findInternet(question);
  if (web) return { base: 'internet', items: [{ texto: web.texto, fuente: web.fuente }], enlaces: [web.enlace] };
  return { base: 'ficha', items: [], enlaces: [] };
}

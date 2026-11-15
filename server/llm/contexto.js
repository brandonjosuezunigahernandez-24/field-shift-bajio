// Contexto extra para preguntas generales de agricultura.
// Capa 1: base local (sirve sin internet). Capa 2: Wikipedia en español (con internet; lo consultado se guarda).
import { readFileSync } from 'node:fs';
import { readCache, writeCache } from '../lib/cache.js';
import { fetchJson } from '../lib/fetchJson.js';

const KNOWLEDGE = JSON.parse(readFileSync(new URL('./conocimiento.json', import.meta.url), 'utf8'));
// Los textos de la base local los escribimos nosotros de conocimiento general: falta confirmarlos con FAO/INIFAP.
const LOCAL_SOURCE = 'Base local';

const strip = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const words = (s) => strip(s).match(/[a-z0-9]+/g) ?? [];

// Raíz muy simple para que "frijoles", "cultivan" y "cultivar" coincidan con "frijol" y "cultivo".
// shortcut: no es un lematizador real; puede juntar palabras distintas con el mismo comienzo.
const stem = (w) => (w.length > 6 ? w.slice(0, 6) : w.replace(/(es|s)$/, '') || w);

export function findLocal(question, limit = 3) {
  const q = new Set(words(question).map(stem));
  return KNOWLEDGE.map((e) => ({ e, score: e.palabras.filter((p) => q.has(stem(p))).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ e }) => ({ texto: e.texto, fuente: LOCAL_SOURCE }));
}

// Palabras de relleno que no sirven para buscar.
const STOP = new Set(['como','cual','cuales','cuando','donde','para','porque','puede','pueden','aqui','sirve','hace','tiene','tienen','debo','puedo','quiero','sobre','entre','estos','estas','esto','esta','este','mucho','poco','mejor','usar','uso','cuanto','cuanta','quien','quienes','verdad','hay','seria','sera','habra','cultivar','sembrar','siembra','cultivan','plantan','plantar','siembran','sembrado','cultivo','cultivos','planta','plantas']);
// Singular simple: jitomates -> jitomate, frijoles -> frijol.
const singular = (w) => (w.length > 6 && w.endsWith('es') && !w.endsWith('ones') ? w.slice(0, -2) : w.length > 5 && w.endsWith('s') ? w.slice(0, -1) : w);
// Las palabras más largas suelen ser las más específicas (amaranto, brocoli), así que se buscan primero.
const keywords = (q) => [...new Set(words(q).filter((w) => w.length >= 5 && !STOP.has(w)).map(singular))].sort((a, b) => b.length - a.length).slice(0, 3);
// La página debe hablar de plantas o cultivos (Wikipedia a veces devuelve homónimos que no tienen que ver).
const PLANT = /(planta|cereal|hortaliza|legumbre|cultivo|agricol|semilla|verdura|grano)/;
// Si preguntan "cómo", se pide el artículo completo y se eligen los párrafos de manejo del cultivo.
const HOWTO = /(cultiv|sembr|siembr|plant|riego|regar|plaga|enfermedad|fertiliz|abon|cosech|clima|temperatura|cuidar|cuidado|suelo)/;
const TOPIC = /(cultiv|siembr|riego|suelo|clima|temperatura|plaga|enfermedad|fertiliz|cosech|humedad|trasplant|germin|densidad)/g;
const MAX_CHARS = 1400;

export function parseWikipedia(raw) {
  const page = Object.values(raw?.query?.pages ?? {})[0];
  if (!page?.extract) return null;
  return { titulo: page.title, texto: page.extract.replace(/​/g, '').trim(), fuente: 'Wikipedia', enlace: page.fullurl };
}

// De un artículo largo deja los párrafos que hablan de cultivo, en su orden, hasta MAX_CHARS.
export function pickParagraphs(text) {
  const paras = text.split(/\n+/).map((p) => p.trim()).filter((p) => p.length > 60);
  const ranked = paras.map((p, i) => ({ p, i, score: (strip(p).match(TOPIC) ?? []).length }))
    .filter((x) => x.score > 0 || x.i === 0)
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const chosen = [];
  let used = 0;
  for (const x of ranked) {
    if (used + x.p.length > MAX_CHARS && chosen.length) continue;
    chosen.push(x);
    used += x.p.length;
  }
  return chosen.sort((a, b) => a.i - b.i).map((x) => x.p).join('\n').slice(0, MAX_CHARS + 200);
}

async function findInternet(question) {
  const keys = keywords(question);
  if (!keys.length) return null;
  const howto = HOWTO.test(strip(question));
  const cacheKey = `wiki-${keys[0].replace(/[^a-z0-9]/g, '')}-${howto ? 'manejo' : 'intro'}`;

  let page = await readCache(cacheKey);
  if (!page && process.env.OFFLINE !== '1') {
    const url = 'https://es.wikipedia.org/w/api.php?' + new URLSearchParams({
      action: 'query', generator: 'search', gsrsearch: keys[0], gsrlimit: '1', prop: 'extracts|info', inprop: 'url',
      explaintext: '1', format: 'json', origin: '*',
      ...(howto ? {} : { exintro: '1', exsentences: '3' }),
    });
    try {
      page = parseWikipedia(await fetchJson(url, { timeoutMs: 10000 }));
      // Se revisa el artículo completo (el título puede decir "Tomate" y la pregunta "jitomate") y luego se recorta.
      const text = strip(`${page?.titulo} ${page?.texto}`);
      // Solo sirve si la página habla de plantas y menciona (por su raíz) una palabra de la pregunta.
      page = page && PLANT.test(text) && keys.some((k) => text.includes(k.slice(0, 6))) ? page : null;
      if (page && howto) page.texto = pickParagraphs(page.texto);
      if (page) await writeCache(cacheKey, page);
    } catch (err) {
      console.warn(`[wikipedia] no se pudo consultar: ${err.message}`);
      page = null;
    }
  }
  return page;
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

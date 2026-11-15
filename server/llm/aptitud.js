// "¿Se da aquí?": compara los rangos de clima de FAO EcoCrop (server/data/aptitud_cultivos.json) con el clima NASA POWER de la parcela.
// Es una regla simple y explicada, no un modelo: tres niveles (se da bien / se da con cuidados / es difícil) y la razón en una frase.
import { existsSync, readFileSync } from 'node:fs';
import { MESES } from './climatologia.js';

const FILE = new URL('../data/aptitud_cultivos.json', import.meta.url);
let datos;
const load = () => (datos ??= existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { cultivos: {} });
const strip = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const r1 = (n) => Math.round(n * 10) / 10;
const PESO = { bien: 0, cuidados: 1, dificil: 2 };
// Frutales de hoja caduca: EcoCrop no trae las horas de frío de invierno que necesitan; se dice que no está verificado.
const HORAS_FRIO = new Set(['manzana', 'durazno', 'uva', 'nuez', 'arandano', 'frambuesa']);

// Cómo se le dice a cada cultivo en una pregunta (sin acentos).
export const NOMBRES = {
  fresa: /\bfresas?\b/, aguacate: /\baguacates?\b/, uva: /\buvas?\b|\bvid(es)?\b/, durazno: /\bduraznos?\b/, guayaba: /\bguayabas?\b/,
  tuna: /\btunas?\b|\bnopal(es)?\b|\bnopalitos?\b/, limon: /\blimon(es)?\b/, naranja: /\bnaranjas?\b|\bnaranjos?\b/, manzana: /\bmanzanas?\b|\bmanzanos?\b/,
  arandano: /\barandanos?\b/, frambuesa: /\bframbuesas?\b/, nuez: /\bnuez\b|\bnueces\b|\bnogal(es)?\b/, esparrago: /\besparragos?\b/,
  jitomate: /\bjitomates?\b|\btomates?\b/, chile: /\bchiles?\b/, cebolla: /\bcebollas?\b/, papa: /\bpapas?\b/, brocoli: /\bbrocolis?\b/,
};
export const detectarCultivos = (q) => Object.keys(NOMBRES).filter((id) => NOMBRES[id].test(strip(q)));

// Resumen del clima de la parcela con lo que EcoCrop compara. clim = salida de climatologia().
export function resumenClima(clim) {
  const m = clim.por_mes;
  const sum = (k) => m.reduce((s, x) => s + x[k], 0);
  return {
    t_media_anual: r1(sum('t_media_c') / 12), lluvia_anual_mm: Math.round(sum('lluvia_mm')),
    t_media_por_mes: m.map((x) => x.t_media_c), helada_record_c: Math.min(...m.map((x) => x.hora_mas_fria_record_c)),
    hora_fria_promedio_c: Math.min(...m.map((x) => x.hora_mas_fria_promedio_c)),
    meses_con_helada: m.filter((x) => x.anios_con_helada > 0).map((x) => x.mes),
  };
}

const rango = (v, [a, b]) => (v < a ? -1 : v > b ? 1 : 0);
const lista = (ms) => ms.map((x) => MESES[x - 1]).join(', ');
// Meses seguidos como "marzo a octubre" (el año da la vuelta: si diciembre y enero están, se juntan).
function tramos(ms) {
  if (!ms.length) return '';
  if (ms.length === 12) return 'todo el año';
  const s = new Set(ms), sig = (x) => (x === 12 ? 1 : x + 1);
  return ms.filter((x) => !s.has(x === 1 ? 12 : x - 1)).map((i) => {
    let f = i;
    while (s.has(sig(f))) f = sig(f);
    return i === f ? MESES[i - 1] : `${MESES[i - 1]} a ${MESES[f - 1]}`;
  }).join(' y ');
}

// aptitud('fresa', climatologia, { ph }) -> { nivel, razon, notas[], datos, fuente } (función pura; lo que falta se dice "no verificado")
export function aptitud(cultivo, clim, { ph } = {}) {
  const c = load().cultivos[cultivo];
  if (!c) return { cultivo, nivel: 'sin_dato', razon: 'No tengo los requisitos de clima de este cultivo: no verificado.', notas: [], verificado: false, fuente: null };
  const base = { cultivo, nombre: c.nombre, verificado: c.verificado, fuente: { nombre: 'FAO EcoCrop', url: c.url, especie: c.especie_ecocrop } };
  if (!c.verificado) return { ...base, nivel: 'sin_dato', razon: `Los rangos de ${c.nombre.toLowerCase()} están incompletos: no verificado.`, notas: [] };
  const z = resumenClima(clim), perenne = c.ciclo_vida?.includes('perennial'), notas = [];
  const hallazgos = []; // { nivel, texto }

  // Temperatura media de cada mes contra el rango óptimo y el absoluto.
  const optimos = z.t_media_por_mes.map((t, i) => (rango(t, c.temp_optima) === 0 ? i + 1 : null)).filter(Boolean);
  const calor = z.t_media_por_mes.map((t, i) => (t > c.temp_absoluta[1] ? i + 1 : null)).filter(Boolean);
  const frio = z.t_media_por_mes.map((t, i) => (t < c.temp_absoluta[0] ? i + 1 : null)).filter(Boolean);
  const [oMin, oMax] = c.temp_optima;
  if (calor.length + frio.length >= 3) hallazgos.push({ nivel: 'dificil', texto: `${calor.length >= frio.length ? 'hace más calor' : 'hace más frío'} de lo que aguanta en ${calor.length + frio.length} meses (${lista(calor.length >= frio.length ? calor : frio)})` });
  else if (calor.length + frio.length) hallazgos.push({ nivel: 'cuidados', texto: `en ${lista([...calor, ...frio])} la temperatura media sale del rango que aguanta (${c.temp_absoluta[0]} a ${c.temp_absoluta[1]} °C)` });
  // perennes: tienen que vivir todo el año aquí (6 meses ideales o más); anuales: basta una temporada (3 meses ideales)
  const minOpt = perenne ? 6 : 3, textoOpt = `solo ${optimos.length} meses tienen temperatura media ideal (${oMin} a ${oMax} °C)`;
  if (optimos.length < minOpt - (perenne ? 3 : 1)) hallazgos.push({ nivel: 'dificil', texto: textoOpt });
  else if (optimos.length < minOpt) hallazgos.push({ nivel: 'cuidados', texto: textoOpt });
  else if (!perenne) notas.push(`Temperatura ideal (${oMin} a ${oMax} °C) en ${tramos(optimos)}.`);

  // Helada: solo si EcoCrop trae la temperatura que mata a la planta en reposo.
  if (c.helada_mortal_reposo !== null) {
    if (z.hora_fria_promedio_c < c.helada_mortal_reposo) hallazgos.push({ nivel: 'dificil', texto: `la hora más fría del año llega en promedio a ${z.hora_fria_promedio_c} °C y la planta muere con ${c.helada_mortal_reposo} °C` });
    else if (z.helada_record_c < c.helada_mortal_reposo) hallazgos.push({ nivel: 'cuidados', texto: `la helada más fuerte registrada (${z.helada_record_c} °C) pasó de lo que aguanta (${c.helada_mortal_reposo} °C)` });
    else notas.push(`La helada más fuerte registrada (${z.helada_record_c} °C) no pasa de lo que aguanta (${c.helada_mortal_reposo} °C).`);
  } else if (z.meses_con_helada.length) notas.push(`Hay heladas en ${lista(z.meses_con_helada)}; cuánto frío aguanta este cultivo: no verificado.`);
  if (HORAS_FRIO.has(cultivo)) notas.push('Las horas de frío de invierno que necesita: no verificado.');

  // Lluvia anual (con riego esto se arregla; por eso la falta de lluvia solo pide cuidados).
  const [lA, lB] = c.lluvia_absoluta_mm, [oA] = c.lluvia_optima_mm;
  if (z.lluvia_anual_mm > lB) hallazgos.push({ nivel: 'dificil', texto: `llueve ${z.lluvia_anual_mm} mm al año y aguanta hasta ${lB} mm` });
  else if (z.lluvia_anual_mm < lA) hallazgos.push({ nivel: 'cuidados', texto: `llueve ${z.lluvia_anual_mm} mm al año, menos de los ${lA} mm mínimos: necesita riego` });
  else if (z.lluvia_anual_mm < oA) notas.push(`Llueve ${z.lluvia_anual_mm} mm al año, un poco menos de lo ideal (${oA} mm): el riego ayuda.`);

  // pH del suelo, si se tiene (SoilGrids).
  if (Number.isFinite(ph)) {
    const d = ph < c.ph_absoluto[0] ? c.ph_absoluto[0] - ph : ph > c.ph_absoluto[1] ? ph - c.ph_absoluto[1] : 0;
    if (d > 1) hallazgos.push({ nivel: 'dificil', texto: `tu suelo tiene pH ${ph} y aguanta de ${c.ph_absoluto[0]} a ${c.ph_absoluto[1]}` });
    else if (d > 0) hallazgos.push({ nivel: 'cuidados', texto: `tu suelo tiene pH ${ph}, algo fuera de lo que aguanta (${c.ph_absoluto[0]} a ${c.ph_absoluto[1]})` });
    else if (rango(ph, c.ph_optimo) !== 0) notas.push(`El pH de tu suelo (${ph}) no es el ideal (${c.ph_optimo[0]} a ${c.ph_optimo[1]}) pero sí lo que aguanta.`);
  } else notas.push(`pH ideal: ${c.ph_optimo[0]} a ${c.ph_optimo[1]}; no comparé con tu suelo.`);

  const peor = hallazgos.reduce((a, h) => (PESO[h.nivel] > PESO[a] ? h.nivel : a), 'bien');
  const razon = peor === 'bien' ? 'la temperatura y la lluvia de tu parcela caen dentro de lo que pide' : hallazgos.filter((h) => h.nivel === peor).map((h) => h.texto).join('; ');
  const { t_media_por_mes, ...clima } = z;
  return { ...base, nivel: peor, razon, notas, datos: { clima, rangos: { temp_optima: c.temp_optima, temp_absoluta: c.temp_absoluta, lluvia_optima_mm: c.lluvia_optima_mm, lluvia_absoluta_mm: c.lluvia_absoluta_mm, ph_optimo: c.ph_optimo, ph_absoluto: c.ph_absoluto, helada_mortal_reposo: c.helada_mortal_reposo }, meses_ideales: optimos.length } };
}

// Días del ciclo según EcoCrop, solo para cultivos de un año (en frutales no es el tiempo para dar fruta).
export const cicloDias = (id) => { const c = load().cultivos[id]; return c && !c.ciclo_vida.includes('perennial') ? c.ciclo_dias : null; };
export const todosLosCultivos = () => Object.keys(load().cultivos);

// ---------- Detección y redacción para el asistente ----------
const PLURAL = /\b(frutas|frutales|verduras|hortalizas|cultivos|plantas)\b/;
const SE_DA = /(se da\b|se dan\b|se puede[n]? (sembrar|plantar|cultivar|tener|dar)|puedo (sembrar|plantar|cultivar|tener|meter|poner)|podria (sembrar|plantar|cultivar)|crece[n]?\b|aguanta|resiste|aptitud|apto|aptos|prospera|da bien|dan bien|funciona|conviene (sembrar|plantar|cultivar)|vale la pena (sembrar|plantar|cultivar)|es dificil|es facil|se adapta|adapta)/;
const AQUI = /(aqui|mi parcela|mi terreno|mi tierra|mi zona|por aca|mi rancho|mi lote|queretaro|guanajuato|el bajio|mi region|mi estado)/;
const OTRO_TEMA = /(precio|se paga|se vende|vende|rinde|rendimiento|cuanto saca|riesgo|perdida|dosis|pesticid|plaga|fertiliz)/;
// Cultivos que el asistente conoce de nombre pero de los que NO hay requisitos verificados: se dice "no verificado" en vez de inventar.
const SIN_DATOS = /\b(mango|papaya|platano|banano|cafe|cacao|pina|coco|sandia|melon|mamey|pitahaya|granada|zarzamora|pera|ciruela|cereza|higo|toronja|mandarina|lima|zanahoria|lechuga|ajo|pepino)\b/;
export function detectarAptitud(q) {
  q = strip(q);
  const cs = detectarCultivos(q);
  if (!cs.length && SIN_DATOS.test(q) && /(se da\b|se dan\b|crece|puedo (sembrar|plantar|cultivar)|se puede (sembrar|plantar|cultivar))/.test(q)) return true;
  const explicito = /(se da\b|se dan\b|crece|puedo sembrar|se puede sembrar|se puede plantar)/.test(q);
  if (OTRO_TEMA.test(q) && !explicito) return false;
  if (SE_DA.test(q) && (cs.length || PLURAL.test(q))) return true;
  return cs.length > 0 && AQUI.test(q) && /(sembrar|plantar|cultivar|tener)/.test(q);
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const ENCABEZADO = { bien: 'Sí, se da bien', cuidados: 'Se da, pero con cuidados', dificil: 'Es difícil' };
const NOTA = ' Son rangos generales de FAO, no una garantía.';

export function redactarAptitud(q, { clim, suelo } = {}) {
  if (!clim) return null;
  const ph = Number.isFinite(suelo?.ph) ? suelo.ph : undefined;
  const cs = detectarCultivos(q);
  const otro = strip(q).match(SIN_DATOS)?.[0];
  if (!cs.length && otro) return { respuesta: `No tengo verificados los requisitos de clima de ese cultivo (${otro}): no verificado. Sí puedo comparar con tu parcela fresa, aguacate, uva, durazno, guayaba, tuna, limón, naranja, manzana, arándano, frambuesa, nuez, espárrago, jitomate, chile, cebolla, papa y brócoli [FAO EcoCrop].`, fuentes: ['FAO EcoCrop'], datos: {} };
  if (!cs.length) { // "¿qué frutas se dan en mi parcela?": los tres niveles
    const rs = todosLosCultivos().map((id) => aptitud(id, clim, { ph })).filter((a) => a.nivel !== 'sin_dato');
    const por = (n) => rs.filter((a) => a.nivel === n).map((a) => a.nombre.toLowerCase());
    const [b, cu, d] = [por('bien'), por('cuidados'), por('dificil')], z = resumenClima(clim);
    const frases = [b.length && `Se dan bien: ${b.join(', ')}.`, cu.length && `Con cuidados: ${cu.join(', ')}.`, d.length && `Difíciles: ${d.join(', ')}.`].filter(Boolean).join(' ');
    return {
      respuesta: `Con ${z.t_media_anual} °C de media y ${z.lluvia_anual_mm} mm de lluvia al año en tu parcela: ${frases} Pregúntame por uno para ver la razón. [FAO EcoCrop, NASA POWER]${NOTA}`,
      fuentes: ['FAO EcoCrop', 'NASA POWER'], datos: { z, ph, bien: b, cuidados: cu, dificil: d },
    };
  }
  const as = cs.slice(0, 2).map((id) => aptitud(id, clim, { ph }));
  const qs = strip(q), pedidos = [/queretaro|\bqro\b/.test(qs) && 'Querétaro', /guanajuato|\bgto\b/.test(qs) && 'Guanajuato'].filter(Boolean);
  const siap = as.map((a) => siapEstados(a.cultivo));
  const partes = as.map((a, i) => {
    if (a.nivel === 'sin_dato') return `${cap(a.nombre ?? a.cultivo)}: no verificado, no tengo sus requisitos de clima.`;
    const donde = Object.entries(siap[i]).filter(([e]) => !pedidos.length || pedidos.includes(e)).map(([e, ha]) => `${ha} ha en ${e}`);
    const sembrado = donde.length ? `El SIAP reporta ${donde.join(' y ')} en 2024.` : `El SIAP no registra ${a.nombre.toLowerCase()} en ${pedidos.join(' ni ') || 'estos estados'} en 2024.`;
    return `${ENCABEZADO[a.nivel]} (${a.nombre.toLowerCase()}): ${a.razon}. ${a.notas.slice(0, as.length === 1 ? 2 : 1).join(' ')} ${sembrado}`;
  });
  return { respuesta: `${partes.join(' ')} [FAO EcoCrop, NASA POWER, SIAP]${NOTA}`, fuentes: ['FAO EcoCrop', 'NASA POWER', 'SIAP'], datos: { aptitud: as, ph, siap, anio: 2024 } };
}

// Hectáreas sembradas en 2024 por estado (SIAP), para decir si ahí de verdad se siembra.
let desg;
function siapEstados(id) {
  const f = new URL('../data/desglose_cultivos.json', import.meta.url);
  desg ??= existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { cultivos: {} };
  return Object.fromEntries(Object.entries(desg.cultivos[id]?.estados ?? {}).map(([e, x]) => [e, Math.round(x.sembrada_ha_2024)]));
}

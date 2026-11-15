// Respuestas específicas y con desglose sobre el MAÍZ (grano, primavera-verano), calculadas por el código con datos del SIAP,
// el modelo entrenado (modelo.js, modelo2.js) y NASA POWER. Sin modelo de lenguaje: cada número sale de los datos.
// Forma de uso: intencionMaiz(pregunta) -> id | null; necesitaClima(id); redactarMaiz(id, pregunta, ctx) -> { respuesta, fuentes, datos, ... } | null.
// Para otro cultivo del SIAP basta con cambiar CULTIVO (los datos del SIAP ya traen los 20 cultivos); los modelos entrenados solo existen para maíz.
import { readFileSync } from 'node:fs';
import { loadSiap } from './siap.js';
import { riesgoPorEscenarios } from './riesgo-clima.js';
import { predictBadYear, similarMunicipalities } from './modelo2.js';
import { verifyNumbers } from './verificador.js';
import { MESES, climatologia, lluviaDicha, mesesDe, mmDe } from './climatologia.js';

const CULTIVO = 'maiz';
const CARTAS = Object.fromEntries(JSON.parse(readFileSync(new URL('./conocimiento.json', import.meta.url), 'utf8')).map((e) => [e.id, e.texto]));
const MUNIS = JSON.parse(readFileSync(new URL('../data/maiz_municipios.json', import.meta.url), 'utf8')).municipios;
const GEO = JSON.parse(readFileSync(new URL('../data/municipios.json', import.meta.url), 'utf8')).municipios;
export const FAO_URL = 'https://www.fao.org/4/x0490e/x0490e0b.htm';
const ESTADOS = ['Guanajuato', 'Querétaro'];

const strip = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const palabras = (q) => q.match(/[a-z0-9]+/g) ?? [];
const lev1 = (a, b) => { // ¿difieren en a lo más una letra (cambiada, sobrante o faltante)?
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i) || a.slice(i) === b.slice(i + 1);
};
// Una palabra de la pregunta empieza con la raíz (o se parece: una letra mal escrita). Raíces de 5+ letras se toleran con un error.
const raiz = (ws, r) => ws.some((w) => w.startsWith(r) || (r.length >= 5 && w.length >= r.length && lev1(w.slice(0, r.length), r)));
const alguna = (ws, rs) => rs.some((r) => raiz(ws, r));

export const esMaiz = (pregunta = '') => palabras(strip(pregunta)).some((w) => /^(cogollero|mazorcas?|elotes?|milpa|jilote)$/.test(w) || w === 'maiz' || w === 'mais' || (w !== 'raiz' && w.length >= 4 && lev1(w, 'maiz')));

const OTROS = { sorgo: 'sorgo', frijol: 'frijol', trigo: 'trigo', cebada: 'cebada', garbanzo: 'garbanzo', avena: 'avena', cacahuate: 'cacahuate', girasol: 'girasol', alfalfa: 'alfalfa' };

// Orden importa: lo más específico primero.
export function intencionMaiz(pregunta = '') {
  const q = strip(pregunta), ws = palabras(q);
  if (!esMaiz(q)) return null;
  const otro = Object.keys(OTROS).some((c) => raiz(ws, c));
  if (/despues del maiz|tras el maiz|siguiente cultivo|que siembro despues/.test(q)) return 'despues';
  if (/helad|\belada|hiela|congel|\bfri[oa]/.test(q)) return 'helada';
  // Lo que dice el agricultor manda: su cosecha, la lluvia en mm, el mes de siembra, un precio ofrecido.
  if (rendPropio(q) && !precioDicho(q)) return 'produccion'; // con cosecha Y precio dichos pregunta cuánto gana: precio
  if (mmDe(q) != null) return 'riesgo';
  if (mesesDe(q).length && /(siembr|sembr|plant|\becho\b)/.test(q) && !/levant|cosech/.test(q)) return 'siembra';
  if (precioDicho(q)) return 'precio';
  if (/cogollero|gusano|plaga|enfermedad|hongo|insecto|fertiliz|abono|urea|herbicid|fumig/.test(q)) return 'plaga';
  if (/semilla|variedad|hibrido|densidad/.test(q)) return 'semilla';
  if (/asegur|(el|un|del|al|algun|hay) seguro|seguro (agricola|catastrof|de|para|contra)/.test(q)) return 'seguro'; // \"¿qué tan seguro es?\" es riesgo
  if (/cuanto (me )?(cuesta|gasto|invierto)|costo|inversion|cuanto cuesta/.test(q)) return 'costo';
  if (/dos veces|segundo ciclo|otono.invierno|dos cosechas|doble cosecha/.test(q)) return 'dosciclos';
  if (/(cuanta|cuanto|que cantidad de) (lluvia|agua)|(necesita|ocupa|requiere|pide|lleva) (de )?((mucha|poca|tanta|cuanta|cuantos) )?(agua|lluvia|milimetros|mm)|cuant[oa]s? (milimetros|mm)\b|requiere|cada cuanto (riego|rego|se riega)|cuantas veces (riego|se riega)|frecuencia de riego/.test(q)) return 'agua';
  if (/(mi )?(suelo|tierra)|\bph\b/.test(q) && /(sirve|sirva|bueno|buena|apto|adecuad|sembrar|para maiz|pal maiz|aguanta|se da)/.test(q)) return 'suelo';
  if (/(sembre|siembre|sembraba|tenia|antes tuve|\btuve\b|ano pasado|ciclo pasado|despues del? (frijol|sorgo|trigo|cebada|garbanzo|avena)|vengo de|venia de)/.test(q) && (otro || /ahorita|ahora|este ano|puedo|se puede/.test(q))) return 'rotacion';
  if (/riego|regar/.test(q) && (/temporal/.test(q) || /conviene|vale la pena|meter|poner|instalar/.test(q)) && !/saco|sacar|cosech|queda/.test(q)) return 'riego';
  if (!otro && /dinero|ganancia|ingreso|pesos|cuanto (gano|voy a ganar)|cuanto (me )?(deja|dejaria)/.test(q)) return 'precio';
  if (/cuant[oa]s? (?!(dias|meses|semanas|tiempo|anos)\b)(maiz |cosecha |toneladas )?(\w+ ){0,3}(saco|sacar|saca|cosech|levant|produc|rinde|rendira|queda|dara|salen|sale)|cuanto puedo (sacar|producir|cosechar)|mal ano.*(queda|saco|cosech)/.test(q) || alguna(ws, ['produc']) || (alguna(ws, ['rend', 'rind']) && !otro)) return 'produccion';
  if (otro && (alguna(ws, ['compar', 'mejor', 'contra', 'conviene', 'recomiend', 'vs']) || /(o|que|en vez de|en lugar de) (el )?(sorgo|frijol|trigo|cebada|garbanzo|avena)/.test(q))) return 'comparar';
  if (alguna(ws, ['recomiend', 'conviene', 'aconsej', 'espero', 'esperar', 'siguiente']) || /ano (bueno|malo)|bueno o malo|vale la pena|ano que viene|proximo ano|este ano o|le entro|me animo|me aviento|buen (ano|momento)|(ira|va a ir) bien/.test(q)) return 'decision';
  if (/cuando (esta|sube|baja|se paga|esta mas)|mas caro|mejor precio|por mes|que mes/.test(q) && alguna(ws, ['caro', 'precio', 'pagan', 'paga', 'barato', 'sube', 'baja'])) return 'precio_mes';
  if (municipioDicho(q) && !/(precio|pagan|se paga|vende)/.test(q)) return 'produccion';
  if (alguna(ws, ['pierd', 'perdid', 'siniestr']) || /\bseca\b/.test(q)) return 'riesgo';
  if (alguna(ws, ['rapid', 'tarda', 'tardan', 'demor', 'crece', 'crecer', 'crecimiento', 'madur', 'ciclo', 'dias', 'meses', 'semanas']) || /cuanto tiempo|cuando (se |lo )?cosech|cuando (esta|queda|llega) list|en cuanto|cuando se coseche/.test(q)) return 'ciclo';
  if (/cuando (se )?(siembr|plant|debo sembrar|puedo sembrar)|mejor (mes|fecha|epoca)|fecha de siembra/.test(q)) return 'siembra';
  if (/llueve poco|poca lluvia|llueve menos|sin lluvia|no llueve|sequia|ano seco/.test(q)) return 'riesgo';
  if (/peor ano|ano mas (malo|seco)|mal ano/.test(q)) return 'riesgo';
  if (alguna(ws, ['precio', 'tonelada', 'pagan', 'paga', 'vende', 'vender', 'venden', 'ingreso', 'ganancia', 'gana', 'ganar', 'vale', 'dinero', 'pesos'])) return 'precio';
  if (alguna(ws, ['riesg', 'perdid', 'siniestr', 'pierd', 'granizo']) || /ano (malo|seco)|que tan seguro|es seguro/.test(q)) return 'riesgo';
  if (alguna(ws, ['riego', 'regar', 'regado']) || /\btemporal(es)?\b|de lluvia|de agua/.test(q)) return 'riego';
  if (otro) return 'comparar';
  if (/donde|que municipio|municipios|que (partes|zonas|lugares|regiones)|maicer|se siembra mas|mas maiz|\bsiembran\b|\bsiembra\b.*\bmas\b/.test(q)) return 'donde';
  if (alguna(ws, ['plantar', 'sembrar', 'siembro', 'planto', 'cultivar'])) return 'decision';
  return null;
}
export const necesitaClima = (id) => ['decision', 'riesgo', 'produccion', 'siembra', 'agua'].includes(id);
export const necesitaSuelo = (id) => id === 'suelo';
// Intenciones que NO redacta este módulo (las contesta otra parte del servidor).
export const DELEGADAS = ['despues', 'helada'];

// ---------- datos del SIAP ----------
const r1 = (n) => Math.round(n * 10) / 10, r2 = (n) => Math.round(n * 100) / 100;
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
// Serie 2018-2024 de un cultivo en primavera-verano: por año, toneladas por hectárea SEMBRADA (cuenta las pérdidas), % dañado y precio.
export function serie(estado, modalidad, cultivo = CULTIVO) {
  const filas = (loadSiap()?.filas ?? []).filter((f) => f.cultivo === cultivo && f.estado === estado && f.ciclo === 'Primavera-Verano' && f.modalidad === modalidad && f.sembrada_ha > 0);
  if (!filas.length) return null;
  const anios = filas.sort((a, b) => a.anio - b.anio).map((f) => ({
    anio: f.anio, sembrada_ha: Math.round(f.sembrada_ha), t_ha: f.volumen_t / f.sembrada_ha, rend_cosechada: f.rendimiento_t_ha,
    dano_pct: (100 * f.siniestrada_ha) / f.sembrada_ha, precio: f.precio_medio_rural,
  }));
  const peor = anios.reduce((a, b) => (b.t_ha < a.t_ha ? b : a)), mejor = anios.reduce((a, b) => (b.t_ha > a.t_ha ? b : a));
  return {
    estado, modalidad, anios, n: anios.length, desde: anios[0].anio, hasta: anios.at(-1).anio,
    t_ha: r2(avg(anios.map((a) => a.t_ha))), peor: { anio: peor.anio, t_ha: r2(peor.t_ha) }, mejor: { anio: mejor.anio, t_ha: r2(mejor.t_ha) },
    anios_danos_altos: anios.filter((a) => a.dano_pct > 10).map((a) => a.anio), dano_prom_pct: r1(avg(anios.map((a) => a.dano_pct))),
    precio: anios.at(-1).precio, anio_precio: anios.at(-1).anio, sembrada_ultimo: anios.at(-1).sembrada_ha,
  };
}

const km = (a, b, c, d) => Math.hypot((a - c) * 111, (b - d) * 111 * Math.cos((a * Math.PI) / 180));
// Municipio de Guanajuato/Querétaro más cercano al punto (a menos de 40 km) con su maíz de temporal o riego.
export function municipioCercano(lat, lon, modalidad) {
  const m = GEO.map((g) => ({ g, d: km(lat, lon, g.lat, g.lon) })).sort((a, b) => a.d - b.d)[0];
  if (!m || m.d > 40) return null;
  const s = MUNIS.find((x) => x.estado === m.g.estado && x.municipio.toLowerCase() === m.g.nombre.toLowerCase());
  return statsMuni(s, m.g.nombre, modalidad);
}
function statsMuni(s, nombre, modalidad) {
  const filas = (s?.[modalidad === 'Riego' ? 'riego' : 'temporal'] ?? []).filter((x) => x.rend_t_ha > 0);
  if (filas.length < 3) return null;
  const v = filas.map((x) => x.rend_t_ha);
  return { municipio: nombre, estado: s.estado, n: filas.length, desde: filas[0].anio, hasta: filas.at(-1).anio, min: Math.min(...v), max: Math.max(...v), prom: r2(avg(v)), ha_ultimo: filas.at(-1).sembrada_ha };
}
// Municipio que nombra la pregunta ("en Dolores Hidalgo", "San Juan del Río"). Guanajuato y Querétaro no cuentan: también son estados.
const corto = (n) => strip(n).replace(/ cuna de la independencia nacional| de bonfil| de la victoria| de juventino rosas| de montes| de matamoros| de serra| de amoles/, '');
export function municipioDicho(q) {
  const s = MUNIS.find((m) => !ESTADOS.includes(m.municipio) && new RegExp(`\\b${corto(m.municipio)}\\b`).test(q));
  return s ? { s, nombre: s.municipio.replace(/ Cuna.*/, '') } : null;
}

// Normales climáticas de la parcela con el mismo formato que usó el entrenamiento de los municipios parecidos.
export function normalesDe(rows) {
  const m = (xs) => (xs.length ? avg(xs) : NaN);
  const pv = rows.filter((r) => r.month >= 6 && r.month <= 9);
  const lluviaAnual = [...new Set(pv.map((r) => r.year))].map((y) => pv.filter((r) => r.year === y).reduce((s, r) => s + r.rain_mm, 0));
  return {
    lluvia_pv: m(lluviaAnual), t_anual: m(rows.map((r) => r.t_mean_c).filter(Number.isFinite)),
    solar: m(rows.map((r) => r.solar).filter(Number.isFinite)), suelo_pv: m(pv.map((r) => r.root_wetness).filter(Number.isFinite)),
  };
}

// ---------- redacción ----------
const NUM = /\d+(?:[.,]\d+)?/g;
const mil = (n) => Math.round(n).toLocaleString('es-MX');
const tons = (n) => (n < 100 ? String(r1(n)) : mil(n));
const money = (n) => `$${mil(n)}`;
const SUGERENCIAS = ['¿Cuánto maíz puedo producir en mi parcela?', '¿Recomiendas plantar maíz este año o espero?', '¿Qué tan riesgoso es el maíz de temporal?'];

// Arma la respuesta: titular de una frase + frases cortas. `datos` junta todos los números escritos (para el verificador).
function salida(titular, frases, fuentes, datos, extra = {}) {
  const respuesta = `${titular}\n${frases.filter(Boolean).join(' ')}`.trim();
  const nums = (respuesta.match(NUM) ?? []).map((s) => Number(s.replace(',', '.')));
  const r = { respuesta, fuentes, datos: { ...datos, escritos: nums }, ...extra };
  return verifyNumbers(respuesta, r.datos).ok ? r : null;
}
const sinDato = (que) => salida(`No tengo ${que}.`, [`Lo que sí te puedo contestar: ${SUGERENCIAS.join(' ')}`], [], {});

function escoge(perfil, estado, q = '') {
  // "maíz de riego" pide solo riego; "¿y con riego?" con parcela de temporal compara los dos.
  const agua = /de riego/.test(q) && !/temporal/.test(q) ? ['Riego'] : /riego/.test(q) && perfil.agua === 'temporal' ? ['Temporal', 'Riego'] : perfil.agua === 'riego' ? ['Riego'] : perfil.agua === 'temporal' ? ['Temporal'] : ['Temporal', 'Riego'];
  return agua.map((m) => serie(estado, m)).filter(Boolean);
}
// "con 25 hectáreas" en la pregunta gana sobre las del perfil (pregunta por otra superficie).
const haDelTexto = (q) => { const m = q.match(/(\d+(?:[.,]\d+)?)\s*(?:ha\b|hect|ect)/); const n = m && Number(m[1].replace(',', '.')); return n >= 0.1 && n <= 5000 ? n : undefined; };
// "me dieron 1.2 toneladas" en "3.5 hectáreas", o "4 t por ha": lo que sacó el agricultor, en t/ha.
export function rendPropio(q) {
  if (!/(me dieron|me dio|\bdio\b|saque|\bsaco\b|sacamos|levante|\blevanto\b|levantamos|coseche|\bcosecho\b|cosechamos|me salieron|me salio|me salen|junte)/.test(q)) return null;
  const m = q.match(/(\d+(?:[.,]\d+)?)\s*(?:t\b|ton)/);
  if (!m) return null;
  const t = Number(m[1].replace(',', '.'));
  if (/^\S*(\s+(de|del|el)?\s*\S+){0,2}?\s*(por|x|\/|cada|la)\s*(ha\b|hect)/.test(q.slice(m.index + m[1].length).trim())) return { t_ha: t };
  const ha = haDelTexto(q);
  if (ha) return { t, ha, t_ha: r2(t / ha) };
  // shortcut: sin hectáreas dichas y con 15 t o menos se supone que es por hectárea (la respuesta lo dice); si confunde, preguntar.
  return t > 0 && t <= 15 ? { t_ha: t, supuesto: true } : null;
}
// "me ofrecen 4,500 la tonelada", "a 18 mil": el precio que le dan, en pesos por tonelada.
export function precioDicho(q) {
  if (!/(tonelada|ofrece|pagan|pagar|precio|coyote)/.test(q)) return null;
  const m = q.match(/\$?\s*(\d{1,2})(?:[,.](\d{3})|\s*mil\b)/) ?? q.match(/\b(\d{4,5})\b(?!\s*(mm|ha|hect))/);
  if (!m) return null;
  const n = m[2] ? Number(m[1] + m[2]) : /mil/.test(m[0]) ? Number(m[1]) * 1000 : Number(m[1]);
  return n >= 1000 && n <= 60000 && !(n >= 1990 && n <= 2030) ? n : null; // un año no es precio
}
const nom = (s) => (s.modalidad === 'Riego' ? 'de riego' : 'de temporal');

// "Lo sembré en junio": con el ciclo de la FAO (125 a 180 días) sale el mes en que estaría listo para cosechar.
const MESES_Q = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function cosechaDesde(q = '') {
  const i = MESES_Q.findIndex((m) => new RegExp(`\\ben ${m}\\b`).test(q));
  if (i < 0 || !/sembr|siembr|plant/.test(q)) return null;
  const a = MESES_Q[(i + 4) % 12], b = MESES_Q[(i + 6) % 12]; // ~125 días = 4 meses; 180 días = 6 meses
  return `Si lo sembraste en ${MESES_Q[i]}, estaría listo para cosechar entre ${a} y ${b}.`;
}

const REDACTORES = {
  produccion: (q, { estado, perfil = {}, rows, lat, lon }) => {
    const ss = escoge(perfil, estado, q);
    if (!ss.length) return null;
    const ha = haDelTexto(q) ?? perfil.hectareas;
    const [a] = ss;
    const dicho = municipioDicho(q);
    const mu = dicho ? statsMuni(dicho.s, dicho.nombre, a.modalidad) : municipioCercano(lat, lon, a.modalidad);
    const enMuni = mu && `En ${mu.municipio}${dicho ? '' : ' (el municipio más cercano)'} el maíz ${nom(a)} rindió de ${mu.min} a ${mu.max} t/ha (${mu.desde}-${mu.hasta})${dicho ? `; en ${mu.hasta} se sembraron ${mil(mu.ha_ultimo)} ha` : ''}.`;
    // "Me dieron 1.2 t en 3.5 ha": su rendimiento contra el del estado y el del municipio.
    const p = rendPropio(q);
    if (p) {
      const como = p.t_ha >= a.t_ha * 1.1 ? 'arriba del' : p.t_ha <= a.t_ha * 0.9 ? 'abajo del' : 'cerca del';
      return salida(`${p.supuesto ? `Si son ${p.t_ha} toneladas por hectárea, quedaste` : `Sacaste ${p.t_ha} toneladas por hectárea${p.ha ? ` (${p.t} t en ${p.ha} ha)` : ''}: quedaste`} ${como} promedio de ${estado}.`, [
        `El maíz ${nom(a)} de ${estado} promedia ${a.t_ha} t/ha, contando lo que se pierde.`,
        enMuni,
        'Son promedios oficiales, no tu parcela: tu año, tu semilla y tu suelo cuentan. [SIAP]',
      ], ['SIAP'], { a, p, mu });
    }
    if (dicho && !mu) return sinDato(`rendimientos de maíz ${nom(a)} de ${dicho.nombre}`);
    if (dicho) {
      return salida(`En ${mu.municipio} el maíz ${nom(a)} rinde en promedio ${mu.prom} t/ha (${mu.desde}-${mu.hasta}).`, [
        `Según el año fue de ${mu.min} a ${mu.max} t/ha; en ${mu.hasta} se sembraron ${mil(mu.ha_ultimo)} ha. En todo ${estado}, ${a.t_ha} t/ha contando pérdidas.`,
        'Son datos oficiales del municipio, no de tu parcela. [SIAP]',
      ], ['SIAP'], { a, mu });
    }
    const malo = /mal ano|peor|me queda|llueve poco|ano seco/.test(q) && ha;
    const titular = malo
      ? `En un mal año, con tus ${ha} ha te quedarían unas ${tons(ha * a.peor.t_ha)} t de maíz ${nom(a)}.`
      : ha && ss.length === 1 ? `Con tus ${ha} ha sacarías unas ${tons(ha * a.t_ha)} toneladas de maíz ${nom(a)} en un año normal.`
      : `El maíz ${ss.map((s) => `${nom(s)} rinde en promedio ${s.t_ha} t por hectárea`).join(' y el ')} en ${estado}.`;
    const uno = ss.length === 1, pre = (x) => (uno ? '' : `${nom(x)}: `);
    const rango = ss.map((x) => `${pre(x)}entre ${x.peor.t_ha} t/ha (${x.peor.anio}) y ${x.mejor.t_ha} t/ha (${x.mejor.anio})`).join('; ');
    const totales = ha ? ss.map((x) => `${pre(x)}unas ${tons(ha * x.t_ha)} t (entre ${tons(ha * x.peor.t_ha)} t en un año malo y ${tons(ha * x.mejor.t_ha)} t en uno bueno)`).join('; ') : null;
    const cercano = municipioCercano(lat, lon, a.modalidad);
    let parecidos = [];
    if (rows?.length && a.modalidad === 'Temporal') parecidos = similarMunicipalities(normalesDe(rows), 5).map((m) => m.rendimiento_temporal_t_ha?.['Maiz grano']).filter((x) => x > 0);
    if (!uno) {
      return salida(titular, [ha ? `Con tus ${ha} ha sacarías ${totales}.` : `Años ${a.desde}-${a.hasta}: ${rango}.`, 'Es por hectárea sembrada, contando pérdidas; son promedios del estado, no de tu parcela. [SIAP]'], ['SIAP'], { ss, ha, tot: ha ? ss.map((s) => [ha * s.t_ha, ha * s.peor.t_ha, ha * s.mejor.t_ha]) : null });
    }
    // Primero su parcela (sus hectáreas), luego el estado y el municipio cercano. Los municipios parecidos van a la gráfica.
    const frases = ha && !malo ? [
      `En un año malo serían unas ${tons(ha * a.peor.t_ha)} toneladas y en uno bueno unas ${tons(ha * a.mejor.t_ha)}.`,
      `Lo saqué del promedio de ${estado}: ${a.t_ha} t/ha, contando lo que se pierde.`,
      cercano ? `En ${cercano.municipio}, el municipio más cercano, rindió de ${cercano.min} a ${cercano.max} t/ha.` : null,
      'Son promedios oficiales, no de tu parcela. [SIAP]',
    ] : [
      `De ${a.desde} a ${a.hasta} rindió ${rango}, contando lo que se pierde.`,
      malo ? null : 'Dime cuántas hectáreas son y te calculo el total de tu parcela.',
      cercano ? `En ${cercano.municipio}, el municipio más cercano, rindió de ${cercano.min} a ${cercano.max} t/ha.` : null,
      'Son promedios del estado y de municipios, no de tu parcela. [SIAP]',
    ];
    return salida(titular, frases, ['SIAP'], { ss, ha, cercano, parecidos, tot: ha ? ss.map((s) => [ha * s.t_ha, ha * s.peor.t_ha, ha * s.mejor.t_ha]) : null });
  },

  decision: (q, { estado, perfil = {}, rows, clima }) => {
    if (!perfil.agua) return { preguntar: 'agua' };
    const ss = escoge(perfil, estado);
    if (!ss.length) return null;
    const s = ss[0];
    if (perfil.agua === 'riego') {
      return salida('Con riego el maíz depende menos de la lluvia; lo que decide es el agua y el costo.', [
        `En ${estado} el maíz de riego rindió entre ${s.peor.t_ha} y ${s.mejor.t_ha} t/ha (${s.desde}-${s.hasta}) y tuvo pérdidas altas en ${s.anios_danos_altos.length} de ${s.n} años.`,
        'No tengo costos de riego ni de semilla para decirte si conviene este año. [SIAP]'], ['SIAP'], { s });
    }
    const riesgo = clima ? riesgoPorEscenarios({ estado, cultivo: CULTIVO, clima }) : null;
    const badY = riesgo ? riesgo.escenarios.map((e) => predictBadYear({ estado, cultivo: CULTIVO, lluviaPV: e.lluvia_mm, medianaPV: riesgo.mediana, tempPV: riesgo.tempPV })).filter((x) => x.disponible) : [];
    const frases = [
      riesgo ? `Si el año viene seco, se pierde cerca de ${riesgo.escenarios[0].siniestro_pct} % del maíz; si viene normal, ${riesgo.escenarios[1].siniestro_pct} %.` : 'No pude consultar la lluvia de tu parcela para calcular el riesgo.',
      badY.length === 3 ? `La probabilidad de un año malo va de ${Math.round(badY[2].probabilidad * 100)} % a ${Math.round(badY[0].probabilidad * 100)} %, según llueva.` : null,
      `En ${estado} hubo pérdidas altas en ${s.anios_danos_altos.length} de ${s.n} años.`,
      'Es un cálculo con la lluvia de NASA y las cosechas del SIAP, no un pronóstico. [SIAP, NASA POWER]',
    ];
    return salida('No te puedo decir sí o no: nadie sabe aún cómo lloverá esta temporada.', frases, ['SIAP', 'NASA POWER'], { s, riesgo: riesgo?.escenarios, badY: badY.map((b) => Math.round(b.probabilidad * 100)), pct: badY.map((b) => b.probabilidad) }, { origen: 'modelo' });
  },

  riesgo: (q, ctx) => {
    const { estado, perfil = {}, clima } = ctx;
    const ss = escoge({ ...perfil, agua: perfil.agua ?? 'temporal' }, estado);
    if (!ss.length) return null;
    const s = ss[0];
    const riesgo = s.modalidad === 'Temporal' && clima ? riesgoPorEscenarios({ estado, cultivo: CULTIVO, clima }) : null;
    // "¿Con 400 mm alcanza?": esa lluvia contra la de su parcela, y el daño del escenario del modelo más parecido.
    const dicha = lluviaDicha(mmDe(q), clima);
    if (dicha) {
      const esc = riesgo && riesgo.escenarios.reduce((x, e) => (Math.abs(e.lluvia_mm - mmDe(q)) < Math.abs(x.lluvia_mm - mmDe(q)) ? e : x));
      return salida(dicha, [
        esc ? `Con unos ${esc.lluvia_mm} mm se perdería cerca de ${esc.siniestro_pct} % del maíz de temporal${mmDe(q) < esc.lluvia_mm - 50 ? '; con menos lluvia, se pierde más' : ''}. Es un cálculo, no un pronóstico. [SIAP, NASA POWER]` : null,
        'Abajo, en «Qué hacer», está qué hacer si el año viene seco.',
      ], ['NASA POWER', ...(esc ? ['SIAP'] : [])], { s, riesgo: riesgo?.escenarios, mm: mmDe(q) }, esc ? { origen: 'modelo' } : {});
    }
    const poca = /llueve poco|poca lluvia|llueve menos|sin lluvia|no llueve|sequia|seco/.test(q) && riesgo;
    const peor = s.anios.reduce((a, b) => (b.dano_pct > a.dano_pct ? b : a));
    if (/peor|mal ano/.test(q)) return salida(`El peor año para el maíz ${nom(s)} en ${estado} fue ${peor.anio}: se dañó ${r1(peor.dano_pct)} % de la superficie.`, [`En ${s.anios_danos_altos.length} de ${s.n} años (${s.desde}-${s.hasta}) la pérdida pasó de 10 %.`, '"Pérdida" incluye sequía, heladas, plagas y otras causas. [SIAP]'], ['SIAP'], { s, peor });
    return salida(poca ? `Si llueve poco, el modelo estima que se daña cerca de ${riesgo.escenarios[0].siniestro_pct} % del maíz de temporal.` : `Tu maíz ${nom(s)} tiene pérdidas altas (más de 10 %) en ${s.anios_danos_altos.length} de cada ${s.n} años en ${estado}.`, [
      `En promedio se pierde ${s.dano_prom_pct} % de lo sembrado${s.anios_danos_altos.length ? `; los años malos fueron ${s.anios_danos_altos.join(', ')}` : ''}.`,
      riesgo ? `Con la lluvia de tu parcela, un año seco pierde cerca de ${riesgo.escenarios[0].siniestro_pct} % y uno lluvioso ${riesgo.escenarios[2].siniestro_pct} %.` : null,
      !perfil.agua ? 'Los números son de temporal; si tu parcela tiene riego, dímelo.' : null,
      'Cuenta sequía, heladas y plagas; es un cálculo, no un pronóstico. [SIAP]',
    ], ['SIAP', ...(riesgo ? ['NASA POWER'] : [])], { s, riesgo: riesgo?.escenarios }, riesgo ? { origen: 'modelo' } : {});
  },

  precio: (q, { estado, perfil = {} }) => {
    const ss = escoge(perfil, estado, q);
    if (!ss.length) return null;
    const ha = haDelTexto(q) ?? perfil.hectareas;
    const f = ss.map((s) => `${nom(s)} se pagó a ${money(s.precio)} la tonelada en ${s.anio_precio}`).join(' y el ');
    const ing = ss.map((s) => ({ s, ha_: Math.round(s.t_ha * s.precio) }));
    // "El coyote me ofrece 4,500": ese precio contra el precio medio rural del SIAP.
    const ofrecido = precioDicho(q), [s0] = ss;
    if (ofrecido) {
      const dif = Math.round((100 * (ofrecido - s0.precio)) / s0.precio);
      return salida(`Te ofrecen ${money(ofrecido)} por tonelada: ${Math.abs(dif) < 5 ? 'es casi el' : dif < 0 ? `es ${-dif} % menos que el` : `es ${dif} % más que el`} precio medio de ${estado} en ${s0.anio_precio} (${money(s0.precio)}). [SIAP]`, [
        ha ? `Con el rendimiento promedio (${s0.t_ha} t/ha) y tus ${ha} ha, a ese precio serían unos ${money(ha * s0.t_ha * ofrecido)} brutos.` : null,
        'El precio medio es de todo el año; el del día cambia. Abajo, en «Qué hacer», está el precio de acopio del gobierno.',
      ], ['SIAP'], { s0, ofrecido, dif, ha, tot: ha ? ha * s0.t_ha * ofrecido : null });
    }
    return salida(`En ${estado} el maíz ${f}.`, [
      `Con el rendimiento promedio, el ingreso bruto es de unos ${ing.map((x) => `${money(x.ha_)} por hectárea ${nom(x.s)}`).join(' y ')}.`,
      ha ? `Con tus ${ha} ha serían ${ing.map((x) => `${money(ha * x.ha_)} ${nom(x.s)}`).join(' o ')}.` : null,
      'Es ingreso bruto, sin costos de semilla, fertilizante ni diésel (no tengo precios de insumos). [SIAP]',
    ], ['SIAP'], { ss, ing, ha, tot: ha ? ing.map((x) => ha * x.ha_) : null });
  },

  riego: (q, { estado, perfil = {} }) => {
    const t = serie(estado, 'Temporal'), r = serie(estado, 'Riego');
    if (!t || !r) return null;
    const veces = Math.round(r.t_ha / t.t_ha);
    const pctRiego = Math.round((100 * r.sembrada_ultimo) / (r.sembrada_ultimo + t.sembrada_ultimo));
    return salida(`En ${estado} el maíz de riego rinde unas ${veces} veces lo que el de temporal.`, [
      `Riego: ${r.t_ha} t/ha en promedio (de ${r.peor.t_ha} a ${r.mejor.t_ha}). Temporal: ${t.t_ha} t/ha (de ${t.peor.t_ha} a ${t.mejor.t_ha}).`,
      `El temporal tuvo pérdidas altas en ${t.anios_danos_altos.length} de ${t.n} años y el riego en ${r.anios_danos_altos.length}.`,
      `En ${r.hasta}, ${pctRiego} % de la superficie de maíz de ${estado} fue de riego. No tengo el costo del agua. [SIAP]`,
    ], ['SIAP'], { t, r, veces, pctRiego });
  },

  comparar: (q, { estado, perfil = {} }) => {
    const ws = palabras(q), id = Object.keys(OTROS).find((c) => raiz(ws, c));
    if (!id) return null;
    const mod = perfil.agua === 'riego' ? 'Riego' : 'Temporal';
    const a = serie(estado, mod), b = serie(estado, mod, id);
    if (!a || !b || !(b.t_ha > 0)) return sinDato(`datos de ${id} de ${mod === 'Riego' ? 'riego' : 'temporal'} en ${estado} para comparar`);
    const ia = Math.round(a.t_ha * a.precio), ib = Math.round(b.t_ha * b.precio);
    const mas = ia >= ib ? 'maíz' : id;
    return salida(`Por hectárea ${mod === 'Riego' ? 'de riego' : 'de temporal'} en ${estado}, el ingreso bruto es mayor con ${mas}.`, [
      `Maíz: ${a.t_ha} t/ha, ${money(a.precio)} por tonelada, ${money(ia)} por hectárea y pérdidas altas en ${a.anios_danos_altos.length} de ${a.n} años.`,
      `${id[0].toUpperCase() + id.slice(1)}: ${b.t_ha} t/ha, ${money(b.precio)} por tonelada, ${money(ib)} por hectárea y pérdidas altas en ${b.anios_danos_altos.length} de ${b.n} años.`,
      'Ingreso bruto con promedios 2018-2024, sin costos. [SIAP]',
    ], ['SIAP'], { a, b, ia, ib });
  },

  donde: (q, { estado }) => {
    const top = (e) => MUNIS.filter((m) => m.estado === e).map((m) => ({ m: m.municipio, ha: m.temporal.find((x) => x.anio === 2024)?.sembrada_ha ?? 0 })).sort((x, y) => y.ha - x.ha).slice(0, 3);
    const lista = (e) => `${e}: ${top(e).map((x) => `${x.m} (${mil(x.ha)} ha)`).join(', ')}`;
    const orden = [estado, ...ESTADOS.filter((e) => e !== estado)];
    const t = serie(estado, 'Temporal'), r = serie(estado, 'Riego');
    return salida(`El maíz de temporal se siembra más en ${top(estado).map((x) => x.m.replace(/ Cuna.*/, '')).join(', ')}.`, [`${orden.map(lista).join('. ')}.`,
      t && r ? `En ${estado} el maíz de riego rinde ${r.t_ha} t/ha y el de temporal ${t.t_ha} t/ha: lo que más cambia el rendimiento es tener riego. [SIAP]` : '[SIAP]'], ['SIAP'], { orden: orden.map(top), t: t?.t_ha, r: r?.t_ha });
  },

  precio_mes: (q, { estado, perfil = {} }) => {
    const s = serie(estado, perfil.agua === 'riego' ? 'Riego' : 'Temporal');
    if (!s) return null;
    const alto = s.anios.reduce((a, b) => (b.precio > a.precio ? b : a)), bajo = s.anios.reduce((a, b) => (b.precio < a.precio ? b : a));
    return salida('No tengo precios por mes: el SIAP solo da un precio medio por año.', [
      `En ${estado} (${perfil.agua === 'riego' ? 'riego' : 'temporal'}) el precio más alto fue ${money(alto.precio)} por tonelada en ${alto.anio} y el más bajo ${money(bajo.precio)} en ${bajo.anio}.`,
      'Para saber cuándo conviene vender, revisa el precio del día con tu comprador. [SIAP]'], ['SIAP'], { alto, bajo });
  },

  agua: (q, { estado, clima }) => {
    const med = clima?.lluvia_pv_mediana_mm, t = serie(estado, 'Temporal');
    const riego = /cada cuanto|cuantas veces|frecuencia/.test(q);
    return salida(riego ? 'No tengo verificado cada cuánto se riega el maíz.' : 'No tengo verificada la cantidad de agua que necesita el maíz.', [
      `Lo que sí tengo: ${CARTAS['maiz-agua']} [Base local]`,
      med && t ? `En tu parcela llueve ${med} mm de junio a septiembre y el maíz de temporal rinde ${t.t_ha} t/ha en ${estado}. [NASA POWER, SIAP]` : null,
      'Para la cantidad y la frecuencia del riego pregunta a INIFAP o a tu técnico.',
    ], ['Base local', ...(med ? ['NASA POWER', 'SIAP'] : [])], { med, t: t?.t_ha });
  },

  suelo: (q, { suelo }) => {
    const sk = !suelo || suelo.sin_datos;
    return salida('No tengo los rangos de suelo que necesita el maíz, así que no te puedo decir si sirve.', [
      sk ? 'Tampoco tengo datos de suelo de este punto.' : `Tu suelo tiene pH ${suelo.ph}, ${suelo.arcilla_pct} % de arcilla y ${suelo.arena_pct} % de arena. [SoilGrids]`,
      `${CARTAS.textura} [Base local]`, 'Para saber si tu suelo es bueno para maíz pregunta a INIFAP o haz un análisis de suelo.',
    ], [...(sk ? [] : ['SoilGrids']), 'Base local'], { suelo: sk ? {} : suelo });
  },

  rotacion: (q, { perfil = {} }) => {
    const ws = palabras(q), previo = Object.keys(OTROS).find((c) => raiz(ws, c)) ?? (/(sembre|tuve|tenia|puse) (puro )?maiz|maiz \d+ anos/.test(q) ? 'maiz' : perfil.ultimo_cultivo);
    if (previo === 'maiz') return salida('Maíz después de maíz no es lo mejor: conviene rotar.', [`${CARTAS.rotacion} [Base local]`, 'No tengo la regla exacta por cultivo; pregunta a tu técnico.'], ['Base local'], {});
    if (['frijol', 'garbanzo'].includes(previo)) return salida(`Sí, después de ${previo} puedes sembrar maíz.`, [`${CARTAS.leguminosas} [Base local]`, `${CARTAS.rotacion} [Base local]`], ['Base local'], {});
    return salida('Rotar el cultivo ayuda; no tengo la regla exacta para tu caso.', [`${CARTAS.rotacion} [Base local]`, 'Pregunta a tu técnico qué te conviene después de ese cultivo.'], ['Base local'], {});
  },

  plaga: () => salida('No doy productos ni dosis para plagas ni abonos: una dosis mala daña el cultivo y la salud.', [
    `${CARTAS.plagas} [Base local]`, 'También puedes preguntar al Comité Estatal de Sanidad Vegetal de tu estado.'], ['Base local'], {}),

  semilla: (q) => /cuant|por hectarea|densidad/.test(q) ? salida('La Mesa Técnica Agroclimática (SMN, INIFAP, CIMMYT) recomienda en temporal de 60 a 70 mil semillas de maíz por hectárea. [Mesa Técnica Agroclimática]', [
    haDelTexto(q) ? `Para ${haDelTexto(q)} ha serían de ${mil(haDelTexto(q) * 60)} a ${mil(haDelTexto(q) * 70)} mil semillas.` : null,
    'El detalle y la fuente van abajo, en «Qué hacer». Qué variedad te conviene no lo tengo verificado: pregunta a INIFAP o al técnico de tu zona.'], ['Mesa Técnica Agroclimática'], {}) : salida('No tengo datos de qué semilla o variedad de maíz te conviene.', [
    'Eso depende de tu altura, tu lluvia y tu suelo, y yo no tengo variedades verificadas.', 'Pregunta a INIFAP o al técnico de tu zona.'], [], {}),

  seguro: (q, { estado, perfil = {} }) => {
    const s = serie(estado, perfil.agua === 'riego' ? 'Riego' : 'Temporal');
    return salida('No tengo información de seguros agrícolas, así que no te puedo decir si conviene.', [
      s ? `Lo que sí sé: el maíz ${nom(s)} de ${estado} tuvo pérdidas altas (más de 10 %) en ${s.anios_danos_altos.length} de ${s.n} años. [SIAP]` : null,
      'Pregunta en tu oficina de agricultura o a una aseguradora cuánto cuesta y qué cubre.'], s ? ['SIAP'] : [], { s });
  },

  costo: () => salida('No tengo costos de sembrar una hectárea de maíz: no hay una fuente confirmada.', [
    'Lo que sí tengo es lo que se gana: pregúntame cuánto dinero saca el maíz por hectárea.', 'Para los costos pregunta a tu técnico o a tu proveedor.'], [], {}),

  dosciclos: (q, { estado }) => {
    const f = (loadSiap()?.filas ?? []).filter((x) => x.cultivo === CULTIVO && x.estado === estado && x.anio === 2024);
    const suma = (pre) => Math.round(f.filter((x) => x.ciclo.startsWith(pre)).reduce((t, x) => t + x.sembrada_ha, 0));
    const oi = suma('Oto'), pv = suma('Prim');
    return salida('Con solo lluvia hay un ciclo de maíz al año; un segundo ciclo solo se puede con riego.', [
      `Y casi nadie lo hace: en ${estado}, en 2024 hubo ${mil(oi)} ha de maíz en otoño-invierno contra ${mil(pv)} ha en primavera-verano. [SIAP]`,
      'No tengo qué variedades ni fechas sirven para dos ciclos; pregunta a INIFAP.'], ['SIAP'], { oi, pv });
  },

  ciclo: (q) => salida(cosechaDesde(q) ?? 'El maíz de grano tarda entre 125 y 180 días de la siembra a la madurez, según el clima.', [
    cosechaDesde(q) ? 'Son de 125 a 180 días según la FAO; depende de la variedad y del clima.' : 'Así lo da la FAO (Tabla 11 de FAO-56): 125 días en Nigeria y la India, 150 en siembras de abril en España y California, 180 en África oriental. La primera etapa dura 20 a 30 días.',
    'No tengo el ciclo de las variedades del Bajío ni de tu parcela: pregunta a INIFAP o a un técnico. [FAO-56]',
  ], ['FAO-56'], { dias: [125, 180, 150, 20, 30, 56] }, { enlaces: [FAO_URL] }),

  siembra: (q, { clima, rows }) => {
    const med = clima?.lluvia_pv_mediana_mm;
    // "¿Siembro en julio o ya es tarde?": la lluvia de ese mes y cuántos meses de lluvia fuerte le quedan.
    const mes = mesesDe(q)[0];
    if (mes && rows?.length) {
      const c = climatologia(rows), f = c.meses_lluvia_fuerte, m = c.por_mes[mes - 1], M = (i) => MESES[i - 1];
      const quedan = f.filter((x) => x >= mes).length, tarde = mes - f[0];
      return salida('No tengo fechas de siembra del maíz verificadas para el Bajío, pero sí la lluvia de tu parcela.', [
        `En ${M(mes)} llueven en promedio ${m.lluvia_mm} mm y la lluvia fuerte va de ${M(f[0])} a ${M(f.at(-1))}. [NASA POWER]`,
        !quedan ? `En ${M(mes)} ya pasó la lluvia fuerte: el maíz de temporal se quedaría casi sin agua.`
          : `Sembrando en ${M(mes)} te ${quedan === 1 ? 'queda 1 mes' : `quedan ${quedan} meses`} de lluvia fuerte${tarde > 0 ? `, ${tarde === 1 ? '1 mes' : `${tarde} meses`} menos que sembrando en ${M(f[0])}` : ''}.`,
        tarde > 0 ? 'Si la lluvia se atrasó, abajo en «Qué hacer» está la opción de un cultivo de ciclo corto.' : 'Siembra con la tierra ya húmeda, no en seco (detalle abajo, en «Qué hacer»).',
      ], ['NASA POWER'], { m, f, quedan, tarde, mes });
    }
    return salida('No tengo fechas de siembra del maíz verificadas para el Bajío.', [
      med ? `Lo que sí sé: en tu parcela llueve más de junio a septiembre (${med} mm). [NASA POWER]` : 'Pregunta a INIFAP o a un técnico de tu zona.',
    ], med ? ['NASA POWER'] : [], { med });
  },
};

// ctx: { estado, perfil, rows, lat, lon, clima (summarizeClimate) }.
// -> { respuesta, fuentes, datos, enlaces?, origen? } | { preguntar: 'agua' } | null
export function redactarMaiz(id, pregunta, ctx) {
  const q = strip(pregunta);
  // "¿Qué rendimiento da el maíz en Querétaro?" habla de ese estado aunque la parcela esté en el otro.
  const dicho = ESTADOS.find((e) => q.includes(strip(e)));
  const muni = municipioDicho(q); // "en San Juan del Río" es de Querétaro aunque la parcela esté en Guanajuato
  if (dicho || muni) ctx = { ...ctx, estado: dicho ?? muni.s.estado };
  const r = REDACTORES[id]?.(q, ctx) ?? null;
  if (!r || r.preguntar) return r;
  // Trampa de número: "¿verdad que rinde 15 t/ha?". Si dicen una cantidad que no aparece en los datos, se corrige antes.
  const pedido = /(verdad|cierto|dicen|dijeron|me dijo|acaso|seguro)/.test(q) && (q.match(/\b\d+(?:[.,]\d+)?\b/g) ?? []).map((n) => Number(n.replace(',', '.'))).find((n) => n > 3 && !r.datos.escritos.includes(n));
  return pedido ? { ...r, respuesta: `No: según el SIAP no es ${pedido}. ${r.respuesta}`, datos: { ...r.datos, escritos: [...r.datos.escritos, pedido] } } : r;
}

export const sugerenciasMaiz = () => sinDato('ese dato del maíz');

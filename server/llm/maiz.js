// Respuestas específicas y con desglose sobre el MAÍZ (grano, primavera-verano), calculadas por el código con datos del SIAP,
// el modelo entrenado (modelo.js, modelo2.js) y NASA POWER. Sin modelo de lenguaje: cada número sale de los datos.
// Forma de uso: intencionMaiz(pregunta) -> id | null; necesitaClima(id); redactarMaiz(id, pregunta, ctx) -> { respuesta, fuentes, datos, ... } | null.
// Para otro cultivo del SIAP basta con cambiar CULTIVO (los datos del SIAP ya traen los 20 cultivos); los modelos entrenados solo existen para maíz.
import { readFileSync } from 'node:fs';
import { loadSiap } from './siap.js';
import { riesgoPorEscenarios } from './riesgo-clima.js';
import { predictBadYear, similarMunicipalities } from './modelo2.js';
import { verifyNumbers } from './verificador.js';

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
  if (/helad|hiela|congel|\bfri[oa]/.test(q)) return 'helada';
  if (/cogollero|gusano|plaga|enfermedad|hongo|insecto|fertiliz|abono|urea|herbicid|fumig/.test(q)) return 'plaga';
  if (/semilla|variedad|hibrido|densidad/.test(q)) return 'semilla';
  if (/asegur|seguro/.test(q)) return 'seguro';
  if (/cuanto (me )?(cuesta|gasto|invierto)|costo|inversion|cuanto cuesta/.test(q)) return 'costo';
  if (/dos veces|segundo ciclo|otono.invierno|dos cosechas|doble cosecha/.test(q)) return 'dosciclos';
  if (/(cuanta|cuanto|que cantidad de) (lluvia|agua)|necesita (de )?(agua|lluvia)|requiere|cada cuanto (riego|rego|se riega)|cuantas veces (riego|se riega)|frecuencia de riego/.test(q)) return 'agua';
  if (/(mi )?(suelo|tierra)|\bph\b/.test(q) && /(sirve|sirva|bueno|buena|apto|adecuad|sembrar|para maiz)/.test(q)) return 'suelo';
  if (/(sembre|siembre|sembraba|tenia|antes tuve|ano pasado)/.test(q) && (otro || /ahorita|ahora|este ano|puedo|se puede/.test(q))) return 'rotacion';
  if (/riego/.test(q) && /temporal/.test(q) && !/saco|sacar|cosech|queda/.test(q)) return 'riego';
  if (!otro && /dinero|ganancia|ingreso|pesos|cuanto (gano|voy a ganar)|cuanto (me )?(deja|dejaria)/.test(q)) return 'precio';
  if (/cuant[oa]s? (maiz |cosecha |toneladas )?(\w+ ){0,3}(saco|sacar|saca|cosech|levant|produc|rinde|rendira|queda|dara)|cuanto puedo (sacar|producir|cosechar)|mal ano.*(queda|saco|cosech)/.test(q) || alguna(ws, ['produc']) || (alguna(ws, ['rend', 'rind']) && !otro)) return 'produccion';
  if (otro && (alguna(ws, ['compar', 'mejor', 'contra', 'conviene', 'recomiend', 'vs']) || /(o|que|en vez de|en lugar de) (el )?(sorgo|frijol|trigo|cebada|garbanzo|avena)/.test(q))) return 'comparar';
  if (alguna(ws, ['recomiend', 'conviene', 'aconsej', 'espero', 'esperar', 'siguiente']) || /ano (bueno|malo)|bueno o malo|vale la pena|ano que viene|proximo ano|este ano o|le entro|me animo|me aviento|buen (ano|momento)|(ira|va a ir) bien/.test(q)) return 'decision';
  if (/cuando (esta|sube|baja|se paga|esta mas)|mas caro|mejor precio|por mes|que mes/.test(q) && alguna(ws, ['caro', 'precio', 'pagan', 'paga', 'barato', 'sube', 'baja'])) return 'precio_mes';
  if (alguna(ws, ['rapid', 'tarda', 'tardan', 'demor', 'crece', 'crecer', 'crecimiento', 'madur', 'ciclo', 'dias', 'meses', 'semanas']) || /cuanto tiempo|cuando (se |lo )?cosech|cuando (esta|queda|llega) list|en cuanto|cuando se coseche/.test(q)) return 'ciclo';
  if (/cuando (se )?(siembr|plant|debo sembrar|puedo sembrar)|mejor (mes|fecha|epoca)|fecha de siembra/.test(q)) return 'siembra';
  if (/llueve poco|poca lluvia|llueve menos|sin lluvia|no llueve|sequia|ano seco/.test(q)) return 'riesgo';
  if (/peor ano|ano mas (malo|seco)|mal ano/.test(q)) return 'riesgo';
  if (alguna(ws, ['precio', 'tonelada', 'pagan', 'paga', 'vende', 'vender', 'venden', 'ingreso', 'ganancia', 'gana', 'ganar', 'vale', 'dinero', 'pesos'])) return 'precio';
  if (alguna(ws, ['riesg', 'perdid', 'siniestr', 'pierd', 'granizo']) || /ano (malo|seco)/.test(q)) return 'riesgo';
  if (alguna(ws, ['riego', 'regar', 'regado']) || /\btemporal(es)?\b|de lluvia|de agua/.test(q)) return 'riego';
  if (otro) return 'comparar';
  if (/donde|que municipio|municipios|se siembra mas|mas maiz|\bsiembran\b|\bsiembra\b.*\bmas\b/.test(q)) return 'donde';
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
  const filas = (s?.[modalidad === 'Riego' ? 'riego' : 'temporal'] ?? []).filter((x) => x.rend_t_ha > 0);
  if (filas.length < 3) return null;
  const v = filas.map((x) => x.rend_t_ha);
  return { municipio: m.g.nombre, estado: m.g.estado, n: filas.length, desde: filas[0].anio, hasta: filas.at(-1).anio, min: Math.min(...v), max: Math.max(...v), prom: r2(avg(v)) };
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
const haDelTexto = (q) => { const m = q.match(/(\d+(?:[.,]\d+)?)\s*(?:ha\b|hect)/); const n = m && Number(m[1].replace(',', '.')); return n >= 0.1 && n <= 5000 ? n : undefined; };
const nom = (s) => (s.modalidad === 'Riego' ? 'de riego' : 'de temporal');

const REDACTORES = {
  produccion: (q, { estado, perfil = {}, rows, lat, lon }) => {
    const ss = escoge(perfil, estado, q);
    if (!ss.length) return null;
    const ha = haDelTexto(q) ?? perfil.hectareas;
    const [a] = ss;
    const malo = /mal ano|peor|me queda|llueve poco|ano seco/.test(q) && ha;
    const titular = malo
      ? `En un mal año, con tus ${ha} ha te quedarían unas ${tons(ha * a.peor.t_ha)} t de maíz ${nom(a)}.`
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
    const frases = [
      `De ${a.desde} a ${a.hasta} rindió ${rango}, por hectárea sembrada y contando las pérdidas.`,
      totales && !malo ? `Con tus ${ha} ha sacarías ${totales}.` : malo ? null : 'Dime cuántas hectáreas son y te calculo el total de tu parcela.',
      cercano ? `En ${cercano.municipio} (el municipio más cercano) rindió de ${cercano.min} a ${cercano.max} t/ha (${cercano.desde}-${cercano.hasta}).` : null,
      parecidos.length ? `En ${parecidos.length} municipios con clima como el tuyo, ${r1(avg(parecidos))} t/ha en promedio.` : null,
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
      riesgo ? `Daño estimado a la superficie en año seco, normal y lluvioso: ${riesgo.escenarios.map((e) => `${e.siniestro_pct} %`).join(', ')} (con ${riesgo.escenarios.map((e) => e.lluvia_mm).join(', ')} mm de lluvia).` : 'No pude consultar la lluvia de tu parcela para calcular el riesgo.',
      badY.length === 3 ? `Probabilidad de año malo (más de 10 % dañado): ${badY.map((b) => `${Math.round(b.probabilidad * 100)} %`).join(', ')}.` : null,
      `De ${s.desde} a ${s.hasta}, ${s.anios_danos_altos.length} de ${s.n} años ${s.anios_danos_altos.length === 1 ? 'tuvo' : 'tuvieron'} pérdidas altas en ${estado}.`,
      'Observa las primeras lluvias de la temporada y el pronóstico de la semana; es riesgo estimado, no pronóstico (modelo entrenado con SIAP y NASA POWER). [SIAP, NASA POWER]',
    ];
    return salida('No te puedo decir sí o no: la lluvia de esta temporada no se puede pronosticar con estos datos.', frases, ['SIAP', 'NASA POWER'], { s, riesgo: riesgo?.escenarios, badY: badY.map((b) => Math.round(b.probabilidad * 100)), pct: badY.map((b) => b.probabilidad) }, { origen: 'modelo' });
  },

  riesgo: (q, ctx) => {
    const { estado, perfil = {}, clima } = ctx;
    const ss = escoge({ ...perfil, agua: perfil.agua ?? 'temporal' }, estado);
    if (!ss.length) return null;
    const s = ss[0];
    const riesgo = s.modalidad === 'Temporal' && clima ? riesgoPorEscenarios({ estado, cultivo: CULTIVO, clima }) : null;
    const poca = /llueve poco|poca lluvia|llueve menos|sin lluvia|no llueve|sequia|seco/.test(q) && riesgo;
    const peor = s.anios.reduce((a, b) => (b.dano_pct > a.dano_pct ? b : a));
    if (/peor|mal ano/.test(q)) return salida(`El peor año para el maíz ${nom(s)} en ${estado} fue ${peor.anio}: se dañó ${r1(peor.dano_pct)} % de la superficie.`, [`En ${s.anios_danos_altos.length} de ${s.n} años (${s.desde}-${s.hasta}) la pérdida pasó de 10 %.`, '"Pérdida" incluye sequía, heladas, plagas y otras causas. [SIAP]'], ['SIAP'], { s, peor });
    return salida(poca ? `Si llueve poco, el modelo estima que se daña cerca de ${riesgo.escenarios[0].siniestro_pct} % del maíz de temporal.` : `El maíz ${nom(s)} en ${estado} tuvo pérdidas altas en ${s.anios_danos_altos.length} de ${s.n} años.`, [
      `Perdió en promedio ${s.dano_prom_pct} % de la superficie sembrada (${s.desde}-${s.hasta}); pérdida alta es más de 10 %${s.anios_danos_altos.length ? `, y pasó en ${s.anios_danos_altos.join(', ')}` : ''}.`,
      riesgo ? `Según el modelo, en un año seco se daña cerca de ${riesgo.escenarios[0].siniestro_pct} % y en uno lluvioso ${riesgo.escenarios[2].siniestro_pct} %. Es riesgo estimado, no pronóstico.` : null,
      !perfil.agua ? 'Los números son de temporal; si tu parcela tiene riego, dímelo.' : null,
      '"Pérdida" incluye sequía, heladas, plagas y otras causas. [SIAP]',
    ], ['SIAP', ...(riesgo ? ['NASA POWER'] : [])], { s, riesgo: riesgo?.escenarios }, riesgo ? { origen: 'modelo' } : {});
  },

  precio: (q, { estado, perfil = {} }) => {
    const ss = escoge(perfil, estado, q);
    if (!ss.length) return null;
    const ha = haDelTexto(q) ?? perfil.hectareas;
    const f = ss.map((s) => `${nom(s)} se pagó a ${money(s.precio)} la tonelada en ${s.anio_precio}`).join(' y el ');
    const ing = ss.map((s) => ({ s, ha_: Math.round(s.t_ha * s.precio) }));
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
    const ws = palabras(q), previo = Object.keys(OTROS).find((c) => raiz(ws, c)) ?? perfil.ultimo_cultivo;
    if (previo === 'maiz') return salida('Maíz después de maíz no es lo mejor: conviene rotar.', [`${CARTAS.rotacion} [Base local]`, 'No tengo la regla exacta por cultivo; pregunta a tu técnico.'], ['Base local'], {});
    if (['frijol', 'garbanzo'].includes(previo)) return salida(`Sí, después de ${previo} puedes sembrar maíz.`, [`${CARTAS.leguminosas} [Base local]`, `${CARTAS.rotacion} [Base local]`], ['Base local'], {});
    return salida('Rotar el cultivo ayuda; no tengo la regla exacta para tu caso.', [`${CARTAS.rotacion} [Base local]`, 'Pregunta a tu técnico qué te conviene después de ese cultivo.'], ['Base local'], {});
  },

  plaga: () => salida('No doy productos ni dosis para plagas ni abonos: una dosis mala daña el cultivo y la salud.', [
    `${CARTAS.plagas} [Base local]`, 'También puedes preguntar al Comité Estatal de Sanidad Vegetal de tu estado.'], ['Base local'], {}),

  semilla: () => salida('No tengo datos de qué semilla o variedad de maíz te conviene.', [
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

  ciclo: () => salida('El maíz de grano tarda entre 125 y 180 días de la siembra a la madurez, según el clima.', [
    'Así lo da la FAO (Tabla 11 de FAO-56): 125 días en Nigeria y la India, 150 en siembras de abril en España y California, 180 en África oriental. La primera etapa dura 20 a 30 días.',
    'No tengo el ciclo de las variedades del Bajío ni de tu parcela: pregunta a INIFAP o a un técnico. [FAO-56]',
  ], ['FAO-56'], { dias: [125, 180, 150, 20, 30, 56] }, { enlaces: [FAO_URL] }),

  siembra: (q, { clima }) => {
    const med = clima?.lluvia_pv_mediana_mm;
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
  if (dicho) ctx = { ...ctx, estado: dicho };
  const r = REDACTORES[id]?.(q, ctx) ?? null;
  if (!r || r.preguntar) return r;
  // Trampa de número: "¿verdad que rinde 15 t/ha?". Si dicen una cantidad que no aparece en los datos, se corrige antes.
  const pedido = /(verdad|cierto|dicen|dijeron|me dijo|acaso|seguro)/.test(q) && (q.match(/\b\d+(?:[.,]\d+)?\b/g) ?? []).map((n) => Number(n.replace(',', '.'))).find((n) => n > 3 && !r.datos.escritos.includes(n));
  return pedido ? { ...r, respuesta: `No: según el SIAP no es ${pedido}. ${r.respuesta}`, datos: { ...r.datos, escritos: [...r.datos.escritos, pedido] } } : r;
}

export const sugerenciasMaiz = () => sinDato('ese dato del maíz');

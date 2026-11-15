// Desglose por fruta o verdura con datos del SIAP 2018-2024 (server/data/desglose_cultivos.json, lo genera scripts/desglose-generar.js).
// Una respuesta corta por tema (superficie, riego, municipios, pérdidas, precio, tiempo para dar fruta) o la ficha completa. Todo con cita [SIAP].
import { existsSync, readFileSync } from 'node:fs';
import { cicloDias, detectarCultivos } from './aptitud.js';

const FILE = new URL('../data/desglose_cultivos.json', import.meta.url);
let datos;
const load = () => (datos ??= existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : null);
const strip = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const ha = (n) => (n >= 100 ? Math.round(n) : n);

const TEMAS = {
  superficie: /(superficie|hectarea|cuant[oa]s?.*se (siembra|planta|cultiva)|cuantas has?\b|cuanta tierra|cuanto hay sembrado)/,
  riego: /(riego|temporal|regad|de agua)/,
  municipios: /(municipio|donde se (siembra|da|planta|cultiva|produce)|en que parte|que zonas|en donde)/,
  perdidas: /(perdida|pierde|pierden|siniestr|se echa a perder)/,
  precio: /(tendencia del precio|precio.*(sub|baj|cambi|tendencia|ha ido|antes)|(sub|baj|cambi)(io|e|ido|ado|ieron|en).*precio|cuanto ha (subido|bajado))/,
  tiempo: /(cuanto (tarda|tiempo|demora)|en dar fruta|cuando (da|dan|produce|empieza a dar)|primera cosecha|anos (en|para) (dar|producir)|tarda en producir)/,
  ficha: /(desglose|detalle|a fondo|completo|todos los datos|mas datos|dame los datos|ficha|resumen de)/,
};
const SIAP_PROPIO = /(riesgo|riesgos|riesgoso|rinde|rendimiento|cuanto saca|a cuanto se vende|se paga|precio de)/;

export function detectarDesglose(q) {
  q = strip(q);
  if (!detectarCultivos(q).length || !load()) return null;
  const t = Object.keys(TEMAS).find((k) => TEMAS[k].test(q));
  if (!t) return null;
  if (SIAP_PROPIO.test(q) && t !== 'tiempo' && t !== 'precio') return null; // precio de venta, rendimiento y riesgo ya los contesta el resumen de cultivos
  return t;
}

const estadosPedidos = (q) => [/queretaro|\bqro\b/.test(q) && 'Querétaro', /guanajuato|\bgto\b/.test(q) && 'Guanajuato'].filter(Boolean);

// Una frase por estado para el tema pedido; devuelve [frase, datos].
const FRASES = {
  superficie: (e, x) => `${e}: ${ha(x.sembrada_ha_2024)} ha en 2024 (en 2018 eran ${ha(x.sembrada_ha_2018)}, ${cambio(x.sembrada_ha_2024, x.sembrada_ha_2018)})`,
  riego: (e, x) => `${e}: ${x.riego_pct_2024} % de la superficie es de riego${x.riego_pct_2024 === 100 ? ' (nada de temporal)' : ''}`,
  municipios: (e, x) => `${e}: ${x.municipios_2024.map((m) => `${m.nombre} (${m.pct_sembrada} %)`).join(', ')}, de ${x.n_municipios_2024} municipios que lo siembran`,
  perdidas: (e, x) => `${e}: ${x.perdida_pct_2018_2024} % de la superficie sembrada 2018-2024 se reportó como pérdida (${x.perdida_pct_2024} % en 2024)`,
  precio: (e, x) => (x.precio_cambio_pct == null ? `${e}: no hay precio comparable` : `${e}: pasó de unos $${x.precio_2018_2019} a $${x.precio_2023_2024} por tonelada (${x.precio_cambio_pct > 0 ? '+' : ''}${x.precio_cambio_pct} %, sin quitar inflación)`),
  tiempo: (e, x) => `${e}: de lo sembrado en 2024, ${Math.round((100 * x.cosechada_ha_2024) / x.sembrada_ha_2024)} % ya produce`,
};
const cambio = (a, b) => (b ? `${a >= b ? 'subió' : 'bajó'} ${Math.abs(Math.round((100 * (a - b)) / b))} %` : 'sin dato');
const TITULOS = {
  superficie: (n) => `${n}: superficie sembrada.`, riego: (n) => `${n}: cuánto es de riego.`, municipios: (n) => `${n}: dónde más se siembra.`,
  perdidas: (n) => `${n}: pérdidas reportadas.`, precio: (n) => `${n}: cómo cambió el precio.`, tiempo: (n) => `${n}: tiempo para dar fruta, no verificado.`,
};
const NOTAS_CULTIVO = {
  jitomate: 'El SIAP no separa campo abierto de invernadero.', chile: 'El SIAP no separa campo abierto de invernadero.',
  tuna: 'La tuna y los nopalitos se reportan aparte.',
};

export function redactarDesglose(q, tema) {
  const d = load();
  if (!d) return null;
  const id = /nopal/.test(strip(q)) ? 'nopalitos' : detectarCultivos(q)[0], c = d.cultivos[id];
  if (!c) return null;
  const pedidos = estadosPedidos(strip(q)), estados = Object.keys(c.estados).filter((e) => !pedidos.length || pedidos.includes(e));
  const nombre = cap(c.nombre.toLowerCase());
  if (!estados.length) {
    const hay = Object.keys(c.estados);
    return { respuesta: `${nombre}: en ${pedidos.join(' y ')} el SIAP no registra siembra en 2024${hay.length ? `; sí aparece en ${hay.join(' y ')}` : ''} [SIAP]. Eso no dice que no pueda darse, solo que no se siembra ahí hoy.`, fuentes: ['SIAP'], datos: { c: c.estados, anio: 2024, anios: d.anios, calc: calc(c.estados) } };
  }
  const nota = NOTAS_CULTIVO[id] ?? '';
  if (tema === 'ficha') {
    const lineas = estados.map((e) => {
      const x = c.estados[e];
      return `${e}: ${ha(x.sembrada_ha_2024)} ha, rinde ${x.rendimiento_2024} t/ha, ${x.riego_pct_2024} % riego, $${x.precio_2024} por tonelada (${x.precio_cambio_pct > 0 ? '+' : ''}${x.precio_cambio_pct} % desde 2018-2019), pérdidas ${x.perdida_pct_2018_2024} %; más en ${x.municipios_2024[0].nombre}`;
    });
    return { respuesta: `${nombre}: así está en el SIAP 2024. ${lineas.join('. ')}. ${nota} [SIAP]`.replace(/\s+\[/, ' ['), fuentes: ['SIAP'], datos: { c: c.estados, anio: 2024, anios: d.anios, calc: calc(c.estados) } };
  }
  const frases = estados.map((e) => FRASES[tema](e, c.estados[e]));
  const ciclo = tema === 'tiempo' ? cicloDias(c.aptitud) : null; // verdura de un año: EcoCrop sí trae los días del ciclo (no es el tiempo para dar fruta de un frutal)
  if (ciclo) return { respuesta: `${nombre}: ciclo del cultivo. Según FAO EcoCrop dura de ${ciclo[0]} a ${ciclo[1]} días, según la variedad [FAO EcoCrop]. El tiempo exacto en tu parcela: no verificado.`, fuentes: ['FAO EcoCrop'], datos: { ciclo } };
  const extra = {
    perdidas: '0 % no quiere decir que nunca se pierda: el SIAP solo cuenta lo que se reporta.',
    tiempo: 'Cuántos años tarda un árbol o planta nueva en dar fruta no lo tengo verificado en una fuente (no verificado); pregunta a INIFAP o a un técnico. Lo anterior solo dice cuánta superficie ya produce.',
    superficie: c.tipo === 'fruta' ? 'La superficie incluye árboles que aún no producen.' : '',
  }[tema] ?? '';
  return { respuesta: `${TITULOS[tema](nombre)} ${frases.join('. ')} [SIAP]. ${[extra, tema === 'superficie' && nota].filter(Boolean).join(' ')}`.trim(), fuentes: ['SIAP'], datos: { c: c.estados, anio: 2024, anios: d.anios, calc: calc(c.estados) } };
}

// Números que el texto calcula (cambio de superficie, % que ya produce): van en los datos para que el verificador los reconozca.
const calc = (estados) => Object.fromEntries(Object.entries(estados).map(([e, x]) => [e, {
  cambio_sup_pct: x.sembrada_ha_2018 ? Math.abs(Math.round((100 * (x.sembrada_ha_2024 - x.sembrada_ha_2018)) / x.sembrada_ha_2018)) : null,
  produce_pct: Math.round((100 * x.cosechada_ha_2024) / x.sembrada_ha_2024),
}]));

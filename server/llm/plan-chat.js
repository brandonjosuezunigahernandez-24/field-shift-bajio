// Lo que el chat dice del plan del motor (recommendPlot): versión corta de la recomendación y respuestas a
// "¿por qué no el maíz?", "¿y si sigo igual?" y "¿qué tan seguro es?". Todos los números salen del motor.
import { ETIQUETA } from './recomendador.js';

const strip = (s = '') => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const pct = (p) => Math.round(p * 100);
const peso = (n) => `$${Math.round(n).toLocaleString('es-MX')}`; // igual que llm/recomendador.js (y la gráfica)
const FUENTES = '[NASA POWER, SoilGrids, SIAP]';

// "si quiero ganar más", "con riego": lo que dice la pregunta gana sobre el perfil (pregunta por otro caso).
export function metaDicha(q) {
  const s = strip(q);
  if (/(ganar|dinero|me deje mas|deja mas|mas ingreso|mas ganancia|mejor pagad)/.test(s)) return 'ganar';
  if (/(cuidar|mejorar|recuperar|descansar)\w* (el |la |mi )?(suelo|tierra)|que no se canse/.test(s)) return 'suelo';
  if (/(menos agua|ahorrar agua|poca agua)/.test(s)) return 'agua';
  if (/(aguante|resista|arriesg|riesgo|seguro|sequia|seca)/.test(s)) return 'riesgo';
  return null;
}
export function aguaDicha(q) {
  const s = strip(q);
  if (/sin riego|de temporal|\bal temporal\b/.test(s)) return 'temporal';
  if (/(con|tengo|si tuviera|meto|meterle|de) riego|\bregar\b|pozo/.test(s)) return 'riego';
  return null;
}
// Sin cultivo nombrado: "¿le sigo con el maíz?" es la decisión del maíz, no la rotación de hoy.
const CULTIVO = /maiz|frijol|sorgo|trigo|cebada|garbanzo|brocoli/;
export const pideSeguirIgual = (q) => !CULTIVO.test(strip(q)) && /(sigo|seguir|sigue|continuo|continuar)\w* (sembrando |con |igual|lo mismo|como (siempre|ahorita|hoy))|lo mismo de siempre|no cambio (nada|de cultivo)/.test(strip(q));
// Del cálculo o del plan, no "¿qué tan seguro es sembrar maíz?" (eso es el riesgo del maíz).
export const pideIncertidumbre = (q) => {
  const s = strip(q);
  if (/sembr|siembr|plant|maiz|frijol|sorgo|trigo|cebada|garbanzo|brocoli/.test(s)) return false;
  return /(que tan|que tanto) (seguro|confiable|exacto|cierto|preciso)|(seguro|confiable|exacto) es (ese|el|este) (calculo|plan|resultado|dato)|incertidumbre|margen de error|(le )?puedo creer|me puedo fiar/.test(s);
};
// "¿Puedo sembrar maíz?" / "¿se me da el maíz aquí?": un solo cultivo, sin fecha, sin rotación y sin comparar con otro.
export const pidePuedoSembrar = (q) => {
  const s = strip(q);
  if (/\d/.test(s) || /(cuando|riego|regar|agua|lluvia|sembre|ano pasado|anos|seguir|despues|antes|tras|rotar|en vez|o mejor|\bo (el |la )?(maiz|frijol|sorgo|trigo|cebada|garbanzo)|este ano|ahorita|ahora|todavia|espero|ya puedo|ya es|tiempo|mes|mayo|junio|julio|agosto)/.test(s)) return false;
  return /(puedo|podria|se puede|conviene|convendria|deberia|debo|es buena idea) (sembrar|plantar|poner|meter|echar|cultivar)|se (me )?da (el|la|bien el|bien la)\b/.test(s)
    // "¿mi tierra es buena para el frijol?": su lugar en el plan (el motor ya mira el pH). El maíz tiene su respuesta de suelo (maiz.js).
    || (!/maiz/.test(s) && /(tierra|suelo|parcela|terreno) .{0,20}(buena|buen|sirve|apta|apto) para/.test(s));
};

const nombre = (r, id) => (r.cultivos.find((c) => c.id === id)?.nombre ?? id).toLowerCase();
const lista = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : xs[0] ?? '');

// Versión del chat: 4 o 5 frases. El detalle (razones, ingreso) se pide con "¿por qué?" o está en la pantalla 2.
export function respuestaPlan(r) {
  const top = r.cultivos.slice(0, 3).map((c) => `${c.nombre.toLowerCase()} (${c.puntaje} de 100)`);
  // Con riego hay 2 temporadas por año: se agrupan ("año 1: frijol y en otoño-invierno cebada grano").
  const anios = [...new Set(r.rotacion.map((x) => x.anio))];
  const plan = r.rotacion.some((x) => x.temporada === 'OI')
    ? anios.map((a) => `año ${a}: ${r.rotacion.filter((x) => x.anio === a).map((x) => (x.temporada === 'OI' ? `en otoño-invierno ${nombre(r, x.cultivo)}` : nombre(r, x.cultivo))).join(' y ')}`)
    : r.rotacion.map((x) => nombre(r, x.cultivo));
  const hoy = r.estrategias?.find((e) => e.id === 'actual');
  const mejor = r.estrategias?.find((e) => e.id === 'recomendada');
  const compara = hoy && mejor && hoy.resumen.riesgo != null && mejor.resumen.riesgo != null
    ? ` Comparada con seguir igual (${hoy.rotacion.map((s) => (s.cultivo ? nombre(r, s.cultivo) : 'sin sembrar')).join(', ')}${hoy.supuesto ? ', lo más sembrado aquí' : ''}), a tu rotación de hoy le hubiera faltado lluvia en ${pct(hoy.resumen.riesgo)} % de las temporadas (puede ser de ${pct(hoy.resumen.riesgo_rango[0])} a ${pct(hoy.resumen.riesgo_rango[1])} %); a esta, en ${pct(mejor.resumen.riesgo)} %.`
    : '';
  const p = r.prediccion;
  const ingreso = p ? ` Ingreso sin restar gastos en 3 años: unos ${peso(p.ingreso_bruto_3_anios_esperado_por_ha)} por hectárea (de ${peso(p.ingreso_bruto_3_anios_peor_10_pct_por_ha)} en un caso malo a ${peso(p.ingreso_bruto_3_anios_mejor_10_pct_por_ha)} en uno bueno) [SIAP].` : '';
  return `Para sembrar de ${r.agua} y ${ETIQUETA[r.prioridad]}, en tu parcela salen mejor ${lista(top)}. Rotación de 3 años: ${plan[0]?.startsWith('año') ? plan.join('; ') : lista(plan)}.${compara} ${FUENTES}${ingreso} Es una estimación; no sustituye a un técnico. Pregúntame «¿por qué?» para ver las razones.`;
}

// "¿Me conviene más el frijol o el sorgo?": el lugar de cada uno en el mismo plan.
export function respuestaComparar(r, ids) {
  const cs = ids.map((id) => ({ id, i: r.cultivos.findIndex((c) => c.id === id) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i);
  if (cs.length < 2) return null;
  const [a, b] = cs.map((x) => r.cultivos[x.i]);
  const razon = (a.razones ?? []).filter((x) => !/^Puntaje/.test(x))[0] ?? '';
  return `Te conviene más ${a.nombre.toLowerCase()} (lugar ${cs[0].i + 1}, puntaje ${a.puntaje} de 100) que ${b.nombre.toLowerCase()} (lugar ${cs[1].i + 1}, puntaje ${b.puntaje}) si quieres ${ETIQUETA[r.prioridad]}. ${razon} ${FUENTES}`.replace(/\s+/g, ' ').trim();
}

// "¿Por qué no el maíz?": su lugar y sus razones, del mismo cálculo.
export function respuestaPorQueNo(r, id) {
  const i = r.cultivos.findIndex((c) => c.id === id);
  if (i < 0) return `${id[0].toUpperCase()}${id.slice(1)} no está entre los cultivos que el motor revisa para ${r.agua === 'riego' ? 'riego' : 'temporal'} en tu parcela, por eso no sale en el plan.`;
  const c = r.cultivos[i];
  const razones = (c.razones ?? []).filter((x) => !/^Puntaje/.test(x)).slice(0, 2).join(' ');
  const primero = r.cultivos[0];
  return `${c.nombre} quedó en el lugar ${i + 1} de ${r.cultivos.length} (puntaje ${c.puntaje} de 100)${i ? `, abajo de ${primero.nombre.toLowerCase()} (${primero.puntaje})` : ''}. ${razones} ${FUENTES}`.replace(/\s+/g, ' ').trim();
}

// "¿Y si sigo igual?": la rotación de hoy contra la recomendada (mismos datos que la pantalla 2).
export function respuestaSeguirIgual(r) {
  const hoy = r.estrategias?.find((e) => e.id === 'actual');
  const mejor = r.estrategias?.find((e) => e.id === 'recomendada');
  if (!hoy || !mejor) return null;
  const seq = (e) => e.rotacion.map((s) => (s.cultivo ? nombre(r, s.cultivo) : 'sin sembrar')).join(', ');
  const [a, b] = [hoy.resumen, mejor.resumen];
  const frases = [`Si sigues igual (${seq(hoy)}${hoy.supuesto ? ', que es lo más sembrado aquí; dime qué siembras para compararlo con lo tuyo' : ''}):`];
  if (a.riesgo != null) frases.push(`le hubiera faltado lluvia en ${pct(a.riesgo)} % de las temporadas desde 2000 (puede ser de ${pct(a.riesgo_rango[0])} a ${pct(a.riesgo_rango[1])} %).`);
  if (b.riesgo != null) frases.push(`Con el plan recomendado (${seq(mejor)}), en ${pct(b.riesgo)} %.`);
  frases.push(`Leguminosas en 3 años: ${a.leguminosas} contra ${b.leguminosas}.`);
  if (a.ingreso_bruto_mxn_ha && b.ingreso_bruto_mxn_ha) frases.push(`Ingreso sin restar gastos en 3 años: unos $${a.ingreso_bruto_mxn_ha.toLocaleString('en-US')} contra $${b.ingreso_bruto_mxn_ha.toLocaleString('en-US')} por hectárea.`);
  return `${frases.join(' ')} ${FUENTES}`;
}

// "¿Qué tan seguro es?": lo que el motor dice que no sabe (incertidumbre), en 3 frases.
export function respuestaIncertidumbre(r) {
  const inc = r.incertidumbre ?? [];
  const de = (t) => inc.find((x) => x.tema === t)?.texto;
  // 3 cosas, la primera frase de cada una (el detalle está en la pantalla 2, «Lo que no sabemos»).
  const primera = (t) => t?.split(/(?<=\.)\s+/)[0];
  const partes = [de('años'), de('cultivos'), de('clima')].map(primera).filter(Boolean);
  if (!partes.length) return null;
  return `Es una estimación, no una certeza. ${partes.join(' ')} No sustituye a un técnico de tu zona. ${FUENTES}`.replace(/\s+/g, ' ').trim();
}

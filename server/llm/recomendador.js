// Recomendador PROVISIONAL de cultivos y rotación + simulación de ingresos, con datos reales del SIAP.
// Vive aquí (no en server/engine/) para no pisar el motor del equipo; la respuesta de recommend()
// sigue la forma de POST /api/recomendar de docs/api-contract.md para poder cambiarlo después.
import { loadSiap } from './siap.js';

export const ESTADOS = ['Guanajuato', 'Querétaro'];
export const PRIORIDADES = ['ganar', 'suelo', 'agua', 'riesgo'];

const NOMBRE = { maiz: 'maíz', sorgo: 'sorgo', frijol: 'frijol', trigo: 'trigo', cebada: 'cebada', garbanzo: 'garbanzo', brocoli: 'brócoli', jitomate: 'jitomate' };
const FAMILIA = { maiz: 'gramínea', sorgo: 'gramínea', trigo: 'gramínea', cebada: 'gramínea', frijol: 'leguminosa', garbanzo: 'leguminosa', brocoli: 'crucífera', jitomate: 'solanácea' };
// Solo lo que quedó verificado en las tarjetas: el sorgo aguanta mejor la sequía que el maíz y el garbanzo es relativamente tolerante.
const SEQUIA = { sorgo: 1, garbanzo: 0.8, maiz: 0.2 };
const PESOS = {
  ganar: { ingreso: 0.7, riesgo: 0.2, suelo: 0.05, agua: 0.05 },
  riesgo: { ingreso: 0.2, riesgo: 0.6, suelo: 0.1, agua: 0.1 },
  suelo: { ingreso: 0.2, riesgo: 0.2, suelo: 0.5, agua: 0.1 },
  agua: { ingreso: 0.2, riesgo: 0.25, suelo: 0.05, agua: 0.5 },
};
// Hortalizas: su ingreso bruto por hectárea es mucho mayor, pero también su inversión (jitomate suele ser agricultura protegida).
// Sin costos verificados no se pueden comparar con los granos, así que por defecto no se recomiendan.
const HORTALIZAS = new Set(['jitomate', 'brocoli']);
const CODIGO = { 'Primavera-Verano': 'PV', 'Otoño-Invierno': 'OI' };
const MIN_ANIOS = 5; // menos años que esto no dan para hablar de riesgo
const MIN_HA = 500; // cultivos casi sin superficie en el estado se ignoran
const MIN_SHARE = 0.02; // y también los que son menos del 2 % de la superficie de los cultivos del proyecto en ese ciclo
const PERDIDA_ALTA = 10; // % de superficie siniestrada que se considera un mal año

export const ETIQUETA = { ganar: 'ganar más', suelo: 'cuidar el suelo', agua: 'gastar menos agua', riesgo: 'arriesgar menos' };

// shortcut: corte por longitud, solo para Guanajuato/Querétaro. Cerca del límite puede fallar:
// lo correcto es que el front mande el estado (se lo preguntamos al agricultor).
export const inferEstado = (lon) => (lon >= -100.45 ? 'Querétaro' : 'Guanajuato');

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const money = (n) => Math.round(n / 100) * 100;
const seasonsFor = (agua) => (agua === 'riego' ? [['Primavera-Verano', 'Riego'], ['Otoño-Invierno', 'Riego']] : [['Primavera-Verano', 'Temporal']]);

function candidates(filas, estado, agua) {
  const out = [];
  for (const [ciclo, modalidad] of seasonsFor(agua)) {
    const porCultivo = new Map();
    for (const f of filas) {
      if (f.estado === estado && f.ciclo === ciclo && f.modalidad === modalidad) {
        porCultivo.set(f.cultivo, [...(porCultivo.get(f.cultivo) ?? []), f]);
      }
    }
    for (const [cultivo, rows] of porCultivo) {
      if (!FAMILIA[cultivo]) continue; // el resumen trae más cultivos (solo informativos)
      rows.sort((a, b) => a.anio - b.anio);
      if (rows.length < MIN_ANIOS || rows.at(-1).sembrada_ha < MIN_HA) continue;
      // Ingreso bruto por hectárea sembrada del año: lo que se produjo (ya con pérdidas) por el precio medio rural.
      const anios = rows.map((r) => ({
        anio: r.anio,
        ingreso: r.sembrada_ha ? (r.volumen_t * (r.precio_medio_rural ?? 0)) / r.sembrada_ha : 0,
        perdida: (100 * r.siniestrada_ha) / Math.max(r.sembrada_ha, 1),
      }));
      out.push({
        cultivo, ciclo, modalidad, anios,
        ingresoMedio: mean(anios.map((a) => a.ingreso)),
        peor: Math.min(...anios.map((a) => a.ingreso)),
        malos: anios.filter((a) => a.perdida > PERDIDA_ALTA),
        rend: mean(rows.map((r) => r.rendimiento_t_ha ?? 0)),
        precio: rows.at(-1).precio_medio_rural,
        ha: rows.at(-1).sembrada_ha,
      });
    }
  }
  // Un cultivo con muy poca superficie (p. ej. garbanzo de temporal) no representa a los productores del estado.
  return out.filter((c) => c.ha / out.filter((o) => o.ciclo === c.ciclo).reduce((t, o) => t + o.ha, 0) >= MIN_SHARE);
}

function score(cands, prioridad) {
  const w = PESOS[prioridad];
  for (const ciclo of new Set(cands.map((c) => c.ciclo))) {
    const group = cands.filter((c) => c.ciclo === ciclo);
    const maxIng = Math.max(...group.map((c) => c.ingresoMedio)) || 1;
    const maxPeor = Math.max(...group.map((c) => c.peor)) || 1;
    for (const c of group) {
      const ingreso = c.ingresoMedio / maxIng;
      const riesgo = 0.5 * (1 - c.malos.length / c.anios.length) + 0.5 * (c.peor / maxPeor);
      const suelo = FAMILIA[c.cultivo] === 'leguminosa' ? 1 : 0.3;
      const agua = SEQUIA[c.cultivo] ?? 0.5;
      c.puntaje = Math.round(100 * (w.ingreso * ingreso + w.riesgo * riesgo + w.suelo * suelo + w.agua * agua));
      c.riesgo = Math.round((c.malos.length / c.anios.length) * 100) / 100;
    }
  }
  return cands.sort((a, b) => b.puntaje - a.puntaje);
}

function razones(c, estado) {
  const n = c.anios.length;
  const [desde, hasta] = [c.anios[0].anio, c.anios.at(-1).anio];
  const malos = c.malos.length
    ? `En ${c.malos.length} de ${n} años (${desde}-${hasta}) se perdió más del ${PERDIDA_ALTA} % de la superficie sembrada en ${estado}.`
    : `En ${estado}, de ${desde} a ${hasta} no hubo años con pérdidas mayores al ${PERDIDA_ALTA} % de la superficie.`;
  return [
    ...(c.nota ? [c.nota] : []),
    malos,
    `Rinde en promedio ${Math.round(c.rend * 10) / 10} toneladas por hectárea y el precio medio rural fue de ${c.precio} pesos por tonelada.`,
    `Ingreso bruto promedio: unos ${money(c.ingresoMedio)} pesos por hectárea (sin costos).`,
  ];
}

// Rotación de 3 años: no repetir cultivo ni familia en temporadas seguidas y al menos una leguminosa.
function buildPlan(ranked, agua, ultimoCultivo, evitar = null) {
  const ciclos = seasonsFor(agua).map(([ciclo]) => ciclo);
  const plan = [];
  // Lo último que sembró el agricultor cuenta como la temporada anterior (no repetir cultivo ni familia).
  let prev = ultimoCultivo && FAMILIA[ultimoCultivo] ? { cultivo: ultimoCultivo } : null;
  const lastSeason = {}; // ciclo -> lo que se sembró en esa misma temporada el año anterior
  const differs = (c, o) => !o || (c.cultivo !== o.cultivo && FAMILIA[c.cultivo] !== FAMILIA[o.cultivo]);
  for (let anio = 1; anio <= 3; anio++) {
    for (const ciclo of ciclos) {
      const pool = ranked.filter((c) => c.ciclo === ciclo);
      if (!pool.length) continue;
      // Primero: distinto cultivo y familia que la temporada anterior Y que el mismo ciclo del año pasado.
      // En el primer año se prefiere un cultivo que las otras parcelas no usen (repartir el riesgo).
      const libre = (c) => anio !== 1 || !evitar || !evitar.has(`${ciclo}:${c.cultivo}`);
      const choice =
        pool.find((c) => differs(c, prev) && differs(c, lastSeason[ciclo]) && libre(c)) ??
        pool.find((c) => differs(c, prev) && differs(c, lastSeason[ciclo])) ??
        pool.find((c) => c.cultivo !== lastSeason[ciclo]?.cultivo && c.cultivo !== prev?.cultivo) ??
        pool.find((c) => c.cultivo !== lastSeason[ciclo]?.cultivo) ??
        pool[0];
      plan.push({ anio, ciclo, cand: choice });
      prev = choice;
      lastSeason[ciclo] = choice;
    }
  }
  if (plan.length && !plan.some((p) => FAMILIA[p.cand.cultivo] === 'leguminosa')) {
    const slot = plan[Math.min(1, plan.length - 1)];
    const legume = ranked.find((c) => c.ciclo === slot.ciclo && FAMILIA[c.cultivo] === 'leguminosa');
    if (legume) slot.cand = legume;
  }
  return plan;
}

function rng(seed) { // mulberry32: mismo resultado en cada corrida
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

// Simula 3 años de la rotación eligiendo al azar años reales del SIAP (el mismo año para todos los cultivos de ese año).
// Es estadística de 7 años por estado, no una predicción del clima. Los precios están en pesos de cada año (sin inflación).
export function simulate(plan, { nSim = 2000, seed = 1, costos = null } = {}) {
  let years = null;
  for (const p of plan) {
    const ys = new Set(p.cand.anios.map((a) => a.anio));
    years = years ? years.filter((y) => ys.has(y)) : [...ys];
  }
  if (!years || years.length < 3) return null;
  const lookup = plan.map((p) => ({ anio: p.anio, byYear: new Map(p.cand.anios.map((a) => [a.anio, a])) }));
  const costoTotal = costos && plan.every((p) => typeof costos[p.cand.cultivo] === 'number')
    ? plan.reduce((s, p) => s + costos[p.cand.cultivo], 0) : null;
  const random = rng(seed);
  const totals = [];
  let withLoss = 0;
  for (let s = 0; s < nSim; s++) {
    const pick = { 1: years[Math.floor(random() * years.length)], 2: years[Math.floor(random() * years.length)], 3: years[Math.floor(random() * years.length)] };
    let total = 0;
    let loss = false;
    for (const l of lookup) {
      const a = l.byYear.get(pick[l.anio]);
      total += a.ingreso;
      if (a.perdida > PERDIDA_ALTA) loss = true;
    }
    totals.push(total);
    if (loss) withLoss++;
  }
  totals.sort((a, b) => a - b);
  const out = {
    anios_base: years.length,
    ingreso_bruto_3_anios_esperado_por_ha: money(mean(totals)),
    ingreso_bruto_3_anios_peor_10_pct_por_ha: money(pct(totals, 0.1)),
    ingreso_bruto_3_anios_mejor_10_pct_por_ha: money(pct(totals, 0.9)),
    probabilidad_al_menos_un_anio_con_perdida_pct: Math.round((100 * withLoss) / nSim),
  };
  if (costoTotal != null) {
    out.ganancia_3_anios_esperada_por_ha = money(mean(totals) - costoTotal);
    out.probabilidad_de_perder_dinero_pct = Math.round((100 * totals.filter((t) => t < costoTotal).length) / nSim);
  }
  return out;
}

// Si el agricultor dijo cuántas hectáreas son, se agrega el total de su parcela.
function withHectares(p, ha) {
  if (!p || !ha) return p;
  const out = {
    ...p, hectareas: ha,
    ingreso_bruto_3_anios_esperado_total: money(p.ingreso_bruto_3_anios_esperado_por_ha * ha),
    ingreso_bruto_3_anios_peor_10_pct_total: money(p.ingreso_bruto_3_anios_peor_10_pct_por_ha * ha),
    ingreso_bruto_3_anios_mejor_10_pct_total: money(p.ingreso_bruto_3_anios_mejor_10_pct_por_ha * ha),
  };
  if (p.ganancia_3_anios_esperada_por_ha != null) out.ganancia_3_anios_esperada_total = money(p.ganancia_3_anios_esperada_por_ha * ha);
  return out;
}

function planFor({ estado, agua, prioridad, incluirHortalizas, ultimoCultivo, encharca, evitar, filas }) {
  if (!filas || !ESTADOS.includes(estado) || !['temporal', 'riego'].includes(agua) || !PRIORIDADES.includes(prioridad)) return null;
  const ranked = score(candidates(filas, estado, agua).filter((c) => incluirHortalizas || !HORTALIZAS.has(c.cultivo)), prioridad);
  if (!ranked.length) return null;
  if (encharca === 'si') {
    // Tarjeta verificada: el garbanzo es sensible al encharcamiento.
    for (const c of ranked) {
      if (c.cultivo === 'garbanzo') { c.puntaje = Math.round(c.puntaje * 0.7); c.nota = 'Dijiste que tu parcela se encharca y el garbanzo es sensible al encharcamiento.'; }
    }
    ranked.sort((a, b) => b.puntaje - a.puntaje);
  }
  return { ranked, plan: buildPlan(ranked, agua, ultimoCultivo, evitar) };
}

// cultivoActual: lo que tiene sembrado ahorita; si es uno de los cultivos, la rotación sigue después de él (no de ultimoCultivo).
export function recommend({ estado, agua, prioridad, costos = null, incluirHortalizas = false, ultimoCultivo = null, cultivoActual = null, hectareas = null, encharca = null, filas = loadSiap()?.filas }) {
  const actual = FAMILIA[cultivoActual] ? cultivoActual : null;
  const base = planFor({ estado, agua, prioridad, incluirHortalizas, ultimoCultivo: actual ?? ultimoCultivo, encharca, evitar: null, filas });
  if (!base) return null;
  const { ranked, plan } = base;
  return {
    estado, agua, prioridad,
    cultivos: ranked.map((c) => ({
      id: c.cultivo, nombre: NOMBRE[c.cultivo][0].toUpperCase() + NOMBRE[c.cultivo].slice(1), temporada: CODIGO[c.ciclo], puntaje: c.puntaje, riesgo: c.riesgo, razones: razones(c, estado),
    })),
    rotacion: plan.map((p) => ({
      anio: p.anio, temporada: CODIGO[p.ciclo], cultivo: p.cand.cultivo,
      porque: `Puntaje ${p.cand.puntaje}.${FAMILIA[p.cand.cultivo] === 'leguminosa' ? ' Es leguminosa: deja algo de nitrógeno para el siguiente cultivo.' : ''}`,
    })),
    prediccion: withHectares(simulate(plan, { costos }), hectareas),
    perfil_usado: { ultimo_cultivo: ultimoCultivo, cultivo_actual: actual, hectareas, encharca },
    fuentes: ['SIAP, Cierre de la producción agrícola (datos abiertos), 2018-2024'],
    notas: [
      ...(incluirHortalizas ? ['Las hortalizas (jitomate, brócoli) necesitan mucha más inversión: sus ingresos brutos no son comparables con los de los granos sin conocer los costos.'] : ['No se incluyeron hortalizas (jitomate, brócoli): necesitan mucha más inversión y no tenemos sus costos.']),
      'Es una estimación con 7 años de datos por estado, no de tu parcela ni una predicción del clima.',
      'Ingreso bruto por hectárea con precios de cada año (sin inflación) y sin costos.',
    ],
  };
}

// ---- Varias parcelas: se analizan juntas y se reparten los cultivos del primer año ----
function simulateFarm(parcels, { nSim = 2000, seed = 1 } = {}) {
  let years = null;
  for (const { plan } of parcels) {
    for (const p of plan) {
      const ys = new Set(p.cand.anios.map((a) => a.anio));
      years = years ? years.filter((y) => ys.has(y)) : [...ys];
    }
  }
  if (!years || years.length < 3) return null;
  const maps = parcels.map(({ plan, ha }) => ({ ha, rows: plan.map((p) => ({ anio: p.anio, byYear: new Map(p.cand.anios.map((a) => [a.anio, a])) })) }));
  const totalHa = parcels.reduce((t, p) => t + p.ha, 0);
  const random = rng(seed);
  const totals = [];
  let anyLoss = 0;
  let widespread = 0;
  for (let s = 0; s < nSim; s++) {
    const pick = [1, 2, 3].map(() => years[Math.floor(random() * years.length)]); // el mismo año de clima para todas las parcelas
    let total = 0;
    let any = false;
    const lossHa = [0, 0, 0];
    for (const m of maps) {
      for (const r of m.rows) {
        const a = r.byYear.get(pick[r.anio - 1]);
        total += a.ingreso * m.ha;
        if (a.perdida > PERDIDA_ALTA) { any = true; lossHa[r.anio - 1] += m.ha; }
      }
    }
    totals.push(total);
    if (any) anyLoss++;
    if (lossHa.some((h) => h >= totalHa * 0.5)) widespread++;
  }
  totals.sort((a, b) => a - b);
  return {
    anios_base: years.length,
    ingreso_bruto_3_anios_esperado_total: money(mean(totals)),
    ingreso_bruto_3_anios_peor_10_pct_total: money(pct(totals, 0.1)),
    ingreso_bruto_3_anios_mejor_10_pct_total: money(pct(totals, 0.9)),
    probabilidad_al_menos_una_parcela_con_perdida_pct: Math.round((100 * anyLoss) / nSim),
    probabilidad_perdida_en_la_mitad_o_mas_del_terreno_pct: Math.round((100 * widespread) / nSim),
  };
}

// parcelas: [{ id, hectareas, ultimo_cultivo? }]. Cada parcela recibe su rotación; las siguientes evitan empezar con los
// mismos cultivos que las anteriores. Se compara contra sembrar todo igual que la primera parcela.
export function recommendFarm({ parcelas, estado, agua, prioridad, incluirHortalizas = false, encharca = null, filas = loadSiap()?.filas }) {
  if (!Array.isArray(parcelas) || parcelas.length < 1) return null;
  const used = new Set();
  const items = [];
  for (const p of parcelas) {
    const base = planFor({ estado, agua, prioridad, incluirHortalizas, ultimoCultivo: p.ultimo_cultivo ?? null, encharca, evitar: used, filas });
    if (!base) return null;
    for (const x of base.plan.filter((q) => q.anio === 1)) used.add(`${x.ciclo}:${x.cand.cultivo}`);
    items.push({ p, ...base });
  }
  const ha = (it) => it.p.hectareas ?? 1;
  return {
    estado, agua, prioridad,
    hectareas_total: Math.round(items.reduce((t, it) => t + ha(it), 0) * 10) / 10,
    parcelas: items.map((it) => ({
      id: it.p.id, hectareas: it.p.hectareas ?? null,
      rotacion: it.plan.map((x) => ({ anio: x.anio, temporada: CODIGO[x.ciclo], cultivo: x.cand.cultivo })),
    })),
    repartido: simulateFarm(items.map((it) => ({ plan: it.plan, ha: ha(it) }))),
    igual: simulateFarm(items.map((it) => ({ plan: items[0].plan, ha: ha(it) }))),
    fuentes: ['SIAP, Cierre de la producción agrícola (datos abiertos), 2018-2024'],
    notas: [
      'Es una estimación con 7 años de datos del estado, sin costos ni inflación; no sustituye a un técnico.',
      'Repartir los cultivos del primer año no siempre baja el riesgo: depende de los años que hay en los datos.',
    ],
  };
}

export function explainFarm(r, estadoInferido = false) {
  const parc = r.parcelas.map((p, i) => {
    const rot = p.rotacion.map((x) => `año ${x.anio} ${x.temporada}: ${NOMBRE[x.cultivo]}`).join('; ');
    return `Parcela ${i + 1}${p.hectareas ? ` (${p.hectareas} ha)` : ''}: ${rot}.`;
  });
  const a = r.repartido;
  const partes = [`Analicé tus ${r.parcelas.length} parcelas juntas (${r.hectareas_total} ha) para sembrar de ${r.agua} y con la meta de ${ETIQUETA[r.prioridad]}, en ${r.estado}${estadoInferido ? ' (lo supuse por tu ubicación; confírmalo)' : ''}. [SIAP]`, ...parc];
  if (a) {
    partes.push(`Con eso, el ingreso bruto esperado de todo tu terreno en 3 años es de unos ${peso(a.ingreso_bruto_3_anios_esperado_total)} (de ${peso(a.ingreso_bruto_3_anios_peor_10_pct_total)} en un caso malo a ${peso(a.ingreso_bruto_3_anios_mejor_10_pct_total)} en uno bueno). En ${a.probabilidad_al_menos_una_parcela_con_perdida_pct} de cada 100 casos alguna parcela tiene un año con pérdidas mayores al ${PERDIDA_ALTA} %, y en ${a.probabilidad_perdida_en_la_mitad_o_mas_del_terreno_pct} de cada 100 la mitad o más del terreno pierde el mismo año. [SIAP]`);
    const b = r.igual;
    if (b && r.parcelas.length > 1) {
      partes.push(`Si sembraras en todas lo mismo que en la parcela 1, el caso malo sería de ${peso(b.ingreso_bruto_3_anios_peor_10_pct_total)} y la mitad o más del terreno perdería el mismo año en ${b.probabilidad_perdida_en_la_mitad_o_mas_del_terreno_pct} de cada 100 casos.`);
    }
  }
  partes.push(r.notas.join(' '));
  return partes.join(' ');
}

const peso = (n) => `$${Math.round(n).toLocaleString('es-MX')}`;

// Texto para el agricultor armado por el código (el modelo no lo redacta, así no se equivoca).
export function explainRecommendation(r, estadoInferido = false) {
  // Después de un cultivo no se ponen arriba los de su misma familia (tras el maíz, el sorgo no va primero).
  const prev = r.perfil_usado?.cultivo_actual ?? r.perfil_usado?.ultimo_cultivo;
  const unicos = r.cultivos.filter((c, i, all) => all.findIndex((x) => x.id === c.id && x.temporada === c.temporada) === i);
  const otraFamilia = unicos.filter((c) => !FAMILIA[prev] || FAMILIA[c.id] !== FAMILIA[prev]);
  const top = (otraFamilia.length ? otraFamilia : unicos).slice(0, 3);
  const lista = top.map((c, i) => `${i + 1}) ${c.nombre} (${c.temporada}, puntaje ${c.puntaje})`).join('; ');
  const rot = r.rotacion.map((x) => `año ${x.anio} ${x.temporada}: ${NOMBRE[x.cultivo]}`).join('; ');
  const p = r.prediccion;
  const u = r.perfil_usado ?? {};
  const tomado = u.cultivo_actual ? ` (tomé en cuenta que ahorita tienes ${NOMBRE[u.cultivo_actual]}, para no repetir el mismo tipo)`
    : u.ultimo_cultivo ? ` (tomé en cuenta que lo último que sembraste fue ${NOMBRE[u.ultimo_cultivo] ?? u.ultimo_cultivo}, para no repetir el mismo tipo)` : '';
  const partes = [
    `Para sembrar de ${r.agua} y con la meta de ${ETIQUETA[r.prioridad]}, en ${r.estado}${estadoInferido ? ' (lo supuse por tu ubicación; confírmalo)' : ''} te salen mejor: ${lista}. [SIAP]`,
    `Rotación de 3 años${tomado}: ${rot}.`,
  ];
  if (p) {
    partes.push(
      `Si la sigues, el ingreso bruto esperado en 3 años es de unos ${peso(p.ingreso_bruto_3_anios_esperado_por_ha)} por hectárea (de ${peso(p.ingreso_bruto_3_anios_peor_10_pct_por_ha)} en un caso malo a ${peso(p.ingreso_bruto_3_anios_mejor_10_pct_por_ha)} en uno bueno)${p.hectareas ? `, unos ${peso(p.ingreso_bruto_3_anios_esperado_total)} en tus ${p.hectareas} hectáreas (de ${peso(p.ingreso_bruto_3_anios_peor_10_pct_total)} a ${peso(p.ingreso_bruto_3_anios_mejor_10_pct_total)})` : ''}, ${p.probabilidad_al_menos_un_anio_con_perdida_pct === 0 ? `y en los ${p.anios_base} años de datos no se vio ninguno con pérdidas mayores al ${PERDIDA_ALTA} %, aunque eso no garantiza que no pase` : `y en ${p.probabilidad_al_menos_un_anio_con_perdida_pct} de cada 100 casos hay al menos un año con pérdidas mayores al ${PERDIDA_ALTA} %`}. [SIAP]`,
    );
    if (p.ganancia_3_anios_esperada_por_ha != null) {
      partes.push(`Con los costos que diste, la ganancia esperada es de ${peso(p.ganancia_3_anios_esperada_por_ha)} por hectárea y hay ${p.probabilidad_de_perder_dinero_pct} de cada 100 casos de perder dinero.`);
    }
  }
  // La nota de hortalizas sigue en r.notas (la pantalla la muestra); el texto se queda en 6 frases o menos.
  partes.push('Es una estimación con datos de 7 años del estado, sin costos ni inflación; no sustituye a un técnico.');
  return partes.join(' ');
}

// Versión corta para la ficha del modelo (ocupa poco contexto).
export function compactReco(r) {
  return {
    estado: r.estado, agua: r.agua, prioridad: r.prioridad,
    mejores: r.cultivos.slice(0, 3).map((c) => ({ cultivo: c.nombre, temporada: c.temporada, puntaje: c.puntaje, razones: c.razones })),
    rotacion: r.rotacion.map((x) => ({ anio: x.anio, temporada: x.temporada, cultivo: NOMBRE[x.cultivo], porque: x.porque })),
    prediccion: r.prediccion,
    fuente: 'SIAP',
  };
}

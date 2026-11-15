// Gráficas que acompañan a cada respuesta (campo `graficas`, máximo 3). Funciones puras: reciben los `datos` que ya generó la
// plantilla (o los datos fuente) y devuelven el esquema fijo { tipo: 'barras'|'linea'|'tabla', titulo, ..., fuente }.
// Nunca inventan: si falta el dato, no hay gráfica. Los números salen de las mismas funciones que usa el texto.
import { loadSiap } from './siap.js';
import { MESES } from './climatologia.js';
import { DRY_YEAR_RATIO } from '../lib/seasons.js';

const MAX = 3;
const r1 = (n) => Math.round(n * 10) / 10, r2 = (n) => Math.round(n * 100) / 100;
const strip = (s = '') => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const barras = (titulo, unidad, etiquetas, series, fuente, nota) => ({ tipo: 'barras', titulo, unidad, etiquetas, series, ...(nota && { nota }), fuente });
const linea = (titulo, unidad, etiquetas, series, fuente, nota) => ({ ...barras(titulo, unidad, etiquetas, series, fuente, nota), tipo: 'linea' });
const tabla = (titulo, columnas, filas, fuente, nota) => ({ tipo: 'tabla', titulo, columnas, filas, ...(nota && { nota }), fuente });
const final = (gs) => gs.filter(Boolean).slice(0, MAX);
const mesesCorto = MESES.map((m) => m[0].toUpperCase() + m.slice(1, 3));
const NASA = 'NASA POWER';
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const OTROS = ['sorgo', 'frijol', 'trigo', 'cebada', 'garbanzo', 'avena', 'cacahuate', 'girasol', 'alfalfa'];

// ---------- SIAP: lista de { nombre, anios: [{ anio, rend, dano, precio }] } ----------
// De una serie de maiz.js (la que usa el texto del maíz: toneladas por hectárea sembrada).
export const itemDeSerie = (s) => s && { nombre: s.modalidad === 'Riego' ? 'Riego' : 'Temporal', anios: s.anios.map((a) => ({ anio: a.anio, rend: a.t_ha, dano: a.dano_pct, precio: a.precio })) };
// De un grupo de cropFacts (la que usa el texto de la plantilla SIAP: rendimiento del SIAP por hectárea cosechada).
export function itemDeGrupo(g, cultivo) {
  const filas = (loadSiap()?.filas ?? []).filter((f) => f.cultivo === cultivo && f.estado === g.estado && f.ciclo === g.ciclo && f.modalidad === g.modalidad).sort((a, b) => a.anio - b.anio);
  return filas.length ? { nombre: `${g.estado}, ${g.ciclo}, ${g.modalidad}`, anios: filas.map((f) => ({ anio: f.anio, rend: f.rendimiento_t_ha ?? 0, dano: (100 * f.siniestrada_ha) / Math.max(f.sembrada_ha, 1), precio: f.precio_medio_rural })) } : null;
}
const porAnio = (items, campo, dec) => {
  const etiquetas = [...new Set(items.flatMap((i) => i.anios.map((a) => a.anio)))].sort();
  return [etiquetas.map(String), items.map((i) => ({ nombre: i.nombre, valores: etiquetas.map((y) => { const v = i.anios.find((a) => a.anio === y)?.[campo]; return v == null ? null : dec === 1 ? r1(v) : dec === 0 ? Math.round(v) : r2(v); }) }))];
};
// foco: 'rend' | 'dano' | 'precio' pone esa gráfica primero.
export function graficasSiap(items, { foco = 'rend', cultivo = 'maíz', extra = [] } = {}) {
  items = items.filter(Boolean);
  if (!items.length) return [];
  const c = cultivo[0].toUpperCase() + cultivo.slice(1);
  const g = {
    rend: () => barras(`${c}: rendimiento por año`, 't/ha', ...porAnio(items, 'rend', 2), 'SIAP'),
    dano: () => barras(`${c}: superficie dañada por año`, '% de la superficie sembrada', ...porAnio(items, 'dano', 1), 'SIAP', 'Incluye sequía, heladas, plagas y otras causas.'),
    precio: () => barras(`${c}: precio medio rural por año`, 'pesos por tonelada', ...porAnio(items, 'precio', 0), 'SIAP'),
  };
  const orden = [foco, ...['rend', 'dano', 'precio'].filter((k) => k !== foco)];
  const [primero, ...resto] = orden.map((k) => g[k]());
  return final([primero, ...extra, ...resto]);
}

// Tus X ha: año malo / promedio / mejor año (toneladas). tot: [[promedio, peor, mejor], ...] como lo calcula maiz.js.
const tons = (n) => (n < 100 ? r1(n) : Math.round(n));
const tablaHa = (ha, ss, tot) => ha && tot?.length === ss.length && tabla(`Tus ${ha} ha: toneladas de maíz`, ['', 'Año malo', 'Promedio', 'Año bueno'],
  ss.map((s, i) => [s.modalidad === 'Riego' ? 'De riego' : 'De temporal', tons(tot[i][1]), tons(tot[i][0]), tons(tot[i][2])]), 'SIAP',
  'Promedios del estado por hectárea sembrada, no de tu parcela.');

const grafEscenarios = (esc) => esc?.length === 3 && barras('Maíz de temporal: daño estimado según la lluvia', '% de la superficie dañada',
  esc.map((e) => `${e.nombre.replace('un año ', 'Año ')} (${e.lluvia_mm} mm)`), [{ nombre: 'Daño estimado', valores: esc.map((e) => e.siniestro_pct) }],
  'Modelo entrenado', 'Riesgo estimado según la lluvia de verano, no un pronóstico.');
const grafProb = (badY) => badY?.length === 3 && barras('Probabilidad de año malo (más de 10 % dañado)', '%', ['Año seco', 'Año normal', 'Año lluvioso'],
  [{ nombre: 'Probabilidad', valores: badY }], 'Modelo entrenado', 'Estimada según la lluvia, no es un pronóstico.');

// ---------- maíz (maiz.js): id de intención + datos ----------
export function graficasMaiz(id, d = {}, { estado, pregunta = '' } = {}) {
  const otro = cap(OTROS.find((c) => strip(pregunta).includes(c)) ?? 'otro cultivo');
  const ss = [d.ss, d.s && [d.s], d.t && d.r && [d.r, d.t]].find(Boolean)?.filter((s) => s?.anios);
  const items = (ss ?? []).map(itemDeSerie);
  switch (id) {
    case 'produccion': return graficasSiap(items, { extra: [tablaHa(d.ha, d.ss ?? [], d.tot)] });
    case 'precio': return graficasSiap(items, { foco: 'precio', extra: [d.ing && barras('Maíz: ingreso bruto por hectárea', 'pesos por hectárea', d.ing.map((x) => (x.s.modalidad === 'Riego' ? 'De riego' : 'De temporal')), [{ nombre: 'Ingreso bruto', valores: d.ing.map((x) => x.ha_) }], 'SIAP', 'Rendimiento promedio por el precio más reciente, sin costos.')] });
    case 'precio_mes': return graficasSiap(items, { foco: 'precio' });
    case 'riesgo': return final([grafEscenarios(d.riesgo), ...graficasSiap(items, { foco: 'dano' })]);
    case 'decision': return final([grafEscenarios(d.riesgo), grafProb(d.badY), ...graficasSiap(items, { foco: 'dano' })]);
    case 'riego': return graficasSiap([itemDeSerie(d.r), itemDeSerie(d.t)]);
    case 'comparar': return d.a && d.b ? final([
      barras('Ingreso bruto por hectárea', 'pesos por hectárea', ['Maíz', otro], [{ nombre: 'Ingreso bruto', valores: [d.ia, d.ib] }], 'SIAP', 'Promedio 2018-2024 por precio medio, sin costos.'),
      ...graficasSiap([{ ...itemDeSerie(d.a), nombre: 'Maíz' }, { ...itemDeSerie(d.b), nombre: otro }], { cultivo: `maíz y ${otro.toLowerCase()}` }).slice(0, 1),
    ]) : [];
    case 'dosciclos': return d.oi != null ? [barras('Maíz: superficie sembrada en 2024', 'hectáreas', ['Primavera-verano', 'Otoño-invierno'], [{ nombre: estado ?? 'Superficie', valores: [d.pv, d.oi] }], 'SIAP')] : [];
    case 'donde': { const estados = estado ? [estado, ...['Guanajuato', 'Querétaro'].filter((e) => e !== estado)] : []; return d.orden?.length ? final(d.orden.map((top, i) => tabla(`Maíz de temporal en 2024: municipios con más superficie${estados[i] ? ` (${estados[i]})` : ''}`, ['Municipio', 'Hectáreas'], top.map((x) => [x.m, Math.round(x.ha)]), 'SIAP'))) : []; }
    default: return [];
  }
}

// ---------- plantillas de respuestas.js ----------
const porMes = (clim, campo, titulo, unidad, nombre, nota) => barras(titulo, unidad, mesesCorto, [{ nombre, valores: clim.por_mes.map((m) => m[campo]) }], NASA, nota);
// Usa el resumen de summarizeClimate (el mismo que el texto: umbral y lluvia por año) y, si no está, la climatología.
const lluviaVerano = ({ clim, resumen }, tipo = 'barras') => {
  const v = resumen?.lluvia_pv_anual ?? clim.verano.por_anio, umbral = resumen?.umbral_seco_mm ?? clim.verano.umbral_seco_mm;
  return (tipo === 'linea' ? linea : barras)('Lluvia de junio a septiembre por año', 'mm', v.map((y) => String(y.anio)),
    [{ nombre: 'Lluvia de verano', valores: v.map((y) => y.lluvia_mm) }, { nombre: 'Año seco si es menos de', valores: v.map(() => umbral) }], NASA,
    `Un año es seco si llovió menos del ${Math.round(DRY_YEAR_RATIO * 100)} % de lo normal (la mediana).`);
};
const grafPronostico = (p) => p?.dias?.length ? [
  barras('Lluvia esperada en los próximos 7 días', 'mm', p.dias.map((d) => d.fecha), [{ nombre: 'Lluvia', valores: p.dias.map((d) => d.lluvia_mm) }], 'Open-Meteo'),
  linea('Temperaturas de los próximos 7 días', '°C', p.dias.map((d) => d.fecha), [{ nombre: 'Máxima', valores: p.dias.map((d) => d.t_max_c) }, { nombre: 'Mínima', valores: p.dias.map((d) => d.t_min_c) }], 'Open-Meteo'),
] : [];

const tablaFrutales = (lista) => tabla('Frutales y perennes en 2024', ['Cultivo', 'Estado', 'Hectáreas', 'Rendimiento (t/ha)', '% con riego', 'Precio rural ($/t)'],
  lista.map((f) => [f.cultivo, f.estado, f.sembrada_ha_2024, f.rendimiento_2024, f.riego_pct_2024, f.precio_rural_2024]), 'SIAP', 'Datos del estado, no de tu parcela.');

// ctx: { clim, pronostico, perfil }. d = `datos` de la plantilla. -> lista de gráficas (puede ser []).
export function graficasPlantilla(tema, pregunta, ctx = {}, d = {}) {
  const q = strip(pregunta), { clim } = ctx;
  switch (tema) {
    case 'siap': case 'cultivo': {
      const cultivo = d.siap?.cultivo;
      if (!cultivo) return [];
      const foco = /(se paga|vende|vender|venden|precio|pagan|pago por|valor de la tonelada)/.test(q) ? 'precio' : /(riesgo|le va|riesgoso|pierde|perdida|siniestr|que tan seguro)/.test(q) ? 'dano' : 'rend';
      return graficasSiap(d.siap.grupos.map((g) => itemDeGrupo(g, cultivo)), { foco, cultivo: cultivo === 'maiz' ? 'maíz' : cultivo === 'brocoli' ? 'brócoli' : cultivo });
    }
    case 'frutales': {
      if (d.f) return final([tablaFrutales(d.f), tabla('Municipios con más superficie', ['Estado', 'Municipio', '% de la superficie'], d.f.flatMap((x) => x.municipios_2024.map((m) => [x.estado, m.nombre, m.pct_sembrada])), 'SIAP')]);
      if (d.todos) return [tablaFrutales(['Guanajuato', 'Querétaro'].flatMap((e) => d.todos.filter((f) => f.estado === e).slice(0, 4)))];
      return [];
    }
    case 'pronostico': return grafPronostico(ctx.pronostico);
    case 'lluvia': return clim ? final([porMes(clim, 'lluvia_mm', 'Lluvia media por mes', 'mm', 'Lluvia', `Promedio de ${clim.periodo.anios} años.`), lluviaVerano(ctx)]) : [];
    case 'secos': case 'anio': return clim ? [lluviaVerano(ctx)] : [];
    case 'tendencia': return clim ? [lluviaVerano(ctx, 'linea')] : [];
    case 'heladas': return clim ? final([
      porMes(clim, 'anios_con_helada', `Años con helada en cada mes (de ${clim.periodo.anios})`, 'años', 'Años con helada', 'Helada: la hora más fría del mes bajó de 0 °C. Dato de satélite, no un pronóstico.'),
      porMes(clim, 'hora_mas_fria_promedio_c', 'Hora más fría de cada mes, en promedio', '°C', 'Hora más fría'),
    ]) : [];
    case 'calor': return clim ? [linea('Temperatura por mes', '°C', mesesCorto, [{ nombre: 'Media', valores: clim.por_mes.map((m) => m.t_media_c) }, { nombre: 'Hora más calurosa (promedio)', valores: clim.por_mes.map((m) => m.hora_mas_calurosa_promedio_c) }], NASA)] : [];
    case 'radiacion': return clim ? [porMes(clim, 'radiacion_mj_m2_dia', 'Radiación solar por mes', 'MJ/m² al día', 'Radiación')] : [];
    case 'humedad': return clim ? [porMes(clim, 'humedad_raiz', 'Humedad de la zona de raíces por mes', 'índice de 0 a 1', 'Humedad', 'Índice estimado por NASA, no medido en tu parcela.')] : [];
    case 'siembra': return clim ? [porMes(clim, 'lluvia_mm', 'Lluvia media por mes', 'mm', 'Lluvia')] : [];
    default: return [];
  }
}

// ---------- recomendador ----------
export function graficasReco(reco) {
  if (!reco?.cultivos?.length) return [];
  const top = reco.cultivos.filter((c, i, all) => all.findIndex((x) => x.id === c.id && x.temporada === c.temporada) === i).slice(0, 6);
  const p = reco.prediccion;
  return final([
    barras('Puntaje de cada cultivo', 'puntos', top.map((c) => `${c.nombre} (${c.temporada})`), [{ nombre: 'Puntaje', valores: top.map((c) => c.puntaje) }], 'SIAP', 'Entre más alto, mejor para lo que elegiste.'),
    p && barras('Ingreso bruto esperado en 3 años, por hectárea', 'pesos por hectárea', ['Caso malo', 'Esperado', 'Caso bueno'],
      [{ nombre: 'Ingreso bruto', valores: [p.ingreso_bruto_3_anios_peor_10_pct_por_ha, p.ingreso_bruto_3_anios_esperado_por_ha, p.ingreso_bruto_3_anios_mejor_10_pct_por_ha] }], 'SIAP', 'Sin costos ni inflación.'),
  ]);
}
export function graficasFinca(f) {
  const a = f?.repartido, b = f?.igual;
  if (!a) return [];
  return [barras('Ingreso bruto de todo tu terreno en 3 años', 'pesos', ['Caso malo', 'Esperado', 'Caso bueno'], [
    { nombre: 'Cultivos repartidos', valores: [a.ingreso_bruto_3_anios_peor_10_pct_total, a.ingreso_bruto_3_anios_esperado_total, a.ingreso_bruto_3_anios_mejor_10_pct_total] },
    ...(b && f.parcelas.length > 1 ? [{ nombre: 'Lo mismo en todas', valores: [b.ingreso_bruto_3_anios_peor_10_pct_total, b.ingreso_bruto_3_anios_esperado_total, b.ingreso_bruto_3_anios_mejor_10_pct_total] }] : []),
  ], 'SIAP', 'Sin costos ni inflación.')];
}

// Camino del modelo de lenguaje: solo si la pregunta es de un cultivo con datos SIAP (usa los mismos grupos que la ficha).
export function graficasCultivoPregunta(pregunta, siap) {
  return siap ? graficasPlantilla('siap', pregunta, {}, { siap: { ...siap, grupos: siap.grupos.filter((g) => g.superficie_sembrada_ha_ultimo_anio >= 20) } }) : [];
}

// Para el router: { graficas } solo si hay algo que mostrar.
export const conGraficas = (lista) => (lista?.length ? { graficas: lista } : {});

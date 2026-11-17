import { readFileSync } from 'node:fs';
import { predictLogit } from '../lib/logistic.js';

// Segunda ronda de ML (la entrena scripts/ml2-explorar.js). Funciones puras sobre JSON entrenado.
const leer = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const AM = leer('modelo_ano_malo.json');
const CL = leer('municipios_clusters.json');
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[^a-zA-Z ]/g, '').toLowerCase().trim();

// Probabilidad de "año malo" (siniestrada > 10 %) dada la lluvia y temperatura de la temporada jun-sep.
// Es riesgo estimado, no pronostico. lluviaPV y medianaPV en mm, tempPV en C.
export function predictBadYear({ estado, cultivo, lluviaPV, medianaPV, tempPV } = {}) {
  const c = AM.cultivos.find((k) => norm(k).split(' ')[0] === norm(cultivo).split(' ')[0]);
  const e = norm(estado);
  if (!c || !['guanajuato', 'queretaro'].includes(e)) return { disponible: false, motivo: 'Sin modelo para ese estado o cultivo.' };
  if (!(lluviaPV >= 0) || !(medianaPV > 0) || !Number.isFinite(tempPV)) return { disponible: false, motivo: 'Faltan lluviaPV, medianaPV o tempPV.' };
  const x = [lluviaPV / medianaPV, tempPV, e === 'queretaro' ? 1 : 0, ...AM.cultivos.slice(1).map((k) => (k === c ? 1 : 0))];
  const p = predictLogit(AM.modelo, x);
  return {
    disponible: true,
    probabilidad: Math.round(p * 100) / 100,
    nivel: p < 0.15 ? 'bajo' : p < 0.4 ? 'medio' : 'alto',
    validacion: AM.validacion_loyo,
    aviso: 'Probabilidad estimada de que la temporada termine con más de 10 % de la superficie siniestrada, dado el clima. No es un pronóstico del clima.',
  };
}

// Los k municipios con clima normal (2000-2024) mas parecido, con su rendimiento medio de temporal. normales: { lluvia_pv, t_anual, solar, suelo_pv }.
export function similarMunicipalities(normales = {}, k = 5) {
  if (!CL.variables.every((v) => Number.isFinite(normales[v]))) return [];
  const z = (n) => CL.variables.map((v, i) => (n[v] - CL.estandarizacion.media[i]) / CL.estandarizacion.sd[i]);
  const t = z(normales);
  return CL.municipios
    .map((m) => ({ estado: m.estado, municipio: m.nombre, cluster: m.cluster, rendimiento_temporal_t_ha: m.rend_pv_temporal, distancia: Math.sqrt(z(m.normal).reduce((s, v, i) => s + (v - t[i]) ** 2, 0)) }))
    .sort((a, b) => a.distancia - b.distancia).slice(0, k)
    .map((m) => ({ ...m, distancia: Math.round(m.distancia * 100) / 100 }));
}

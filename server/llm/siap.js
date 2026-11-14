// Datos oficiales del SIAP por estado (server/data/siap_resumen.json, lo genera scripts/siap-descargar.js).
// Si el archivo no existe, el asistente sigue funcionando sin estos datos.
import { existsSync, readFileSync } from 'node:fs';

const FILE = new URL('../data/siap_resumen.json', import.meta.url);
let data;
export const loadSiap = () => (data ??= existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : null);

const strip = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ALIASES = {
  maiz: ['maiz'], sorgo: ['sorgo'], frijol: ['frijol', 'frijoles'], trigo: ['trigo'], cebada: ['cebada'],
  garbanzo: ['garbanzo', 'garbanzos'], brocoli: ['brocoli'], jitomate: ['jitomate', 'jitomates', 'tomate', 'tomates'],
};

export function detectCrop(question) {
  const words = new Set(strip(question).match(/[a-z0-9]+/g) ?? []);
  return Object.keys(ALIASES).find((id) => ALIASES[id].some((w) => words.has(w))) ?? null;
}

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r1 = (n) => Math.round(n * 10) / 10;

// Para el cultivo de la pregunta: por estado, los dos ciclo/modalidad con más superficie.
export function cropFacts(question) {
  const d = loadSiap();
  const id = detectCrop(question);
  if (!d || !id) return null;
  const groups = new Map();
  for (const f of d.filas.filter((x) => x.cultivo === id)) {
    const key = `${f.estado}|${f.ciclo}|${f.modalidad}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const stats = [...groups.values()].map((rows) => {
    rows.sort((a, b) => a.anio - b.anio);
    const last = rows.at(-1);
    const loss = rows.map((r) => ({ anio: r.anio, pct: (100 * r.siniestrada_ha) / Math.max(r.sembrada_ha, 1) }));
    return {
      estado: last.estado, ciclo: last.ciclo, modalidad: last.modalidad,
      superficie_sembrada_ha_ultimo_anio: Math.round(last.sembrada_ha),
      rendimiento_t_ha_promedio: Math.round(avg(rows.map((r) => r.rendimiento_t_ha ?? 0)) * 100) / 100,
      perdida_promedio_pct: r1(avg(loss.map((l) => l.pct))),
      cantidad_de_anios_con_perdida_mayor_10_pct: loss.filter((l) => l.pct > 10).length,
      anios_con_perdida_mayor_10_pct: loss.filter((l) => l.pct > 10).map((l) => l.anio),
      precio_pesos_por_tonelada_ultimo_anio: last.precio_medio_rural,
      anio_ultimo: last.anio,
    };
  });
  const top = ['Guanajuato', 'Querétaro'].flatMap((estado) =>
    stats.filter((s) => s.estado === estado).sort((a, b) => b.superficie_sembrada_ha_ultimo_anio - a.superficie_sembrada_ha_ultimo_anio).slice(0, 2));
  if (!top.length) return null;
  return {
    cultivo: id,
    periodo: `${d.anios_incluidos[0]}-${d.anios_incluidos.at(-1)}`,
    nota: 'Datos oficiales por estado, no de la parcela. "perdida" es la superficie siniestrada (dañada por clima u otras causas).',
    grupos: top,
    fuente: 'SIAP',
  };
}

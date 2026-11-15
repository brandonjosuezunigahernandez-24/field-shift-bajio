// Aprendizaje automático con honestidad para frutas y hortalizas (continúa ml2-explorar.js). Guarda server/data/frutas_ml_resultados.json.
// Uso: node scripts/frutas-ml.js   (necesita la caché de NASA POWER por municipio: node scripts/clima-municipios.js, y SIAP_RAW_DIR)
// Preguntas (las tres se fijaron antes de ver resultados; se reportan todas):
//  A. ¿La regla de aptitud (EcoCrop contra el clima del municipio) separa los municipios donde SÍ se siembra un cultivo de donde no? (AUC; 0.5 = azar)
//  B. Municipio nuevo: ¿los 5 municipios de clima más parecido predicen mejor si ahí se siembra el cultivo que la frecuencia general? (dejando un municipio fuera)
//  C. Municipio nuevo: ¿los 5 vecinos predicen mejor el rendimiento que el promedio del estado? (dejando un municipio fuera)
import fs from 'node:fs';
import { cargarPanel } from '../lib/ml2Datos.js';
import { auc } from '../lib/logistic.js';
import { getClimate } from '../sources/nasaPower.js';
import { climatologia } from '../llm/climatologia.js';
import { aptitud } from '../llm/aptitud.js';
import { CATALOGO } from './desglose-generar.js';

const r3 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 1000) / 1000);
const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const { municipios } = JSON.parse(fs.readFileSync(new URL('../data/municipios.json', import.meta.url), 'utf8'));
const NIVEL = { bien: 0, cuidados: 1, dificil: 2 };

// Clima normal de cada municipio (variables estandarizadas para la distancia) y su resumen de aptitud.
const info = [];
for (const m of municipios) {
  const { rows } = await getClimate(m.lat, m.lon);
  const clim = climatologia(rows), pm = clim.por_mes;
  info.push({ ...m, key: `${m.estado}|${m.id}`, clim, x: [clim.verano.mediana_mm, avg(pm.map((x) => x.t_media_c)), Math.min(...pm.map((x) => x.hora_mas_fria_promedio_c)), avg(pm.map((x) => x.radiacion_mj_m2_dia)), pm.reduce((s, x) => s + x.lluvia_mm, 0)] });
}
const mu = info[0].x.map((_, j) => avg(info.map((m) => m.x[j]))), sd = info[0].x.map((_, j) => Math.sqrt(avg(info.map((m) => (m.x[j] - mu[j]) ** 2))) || 1);
info.forEach((m) => (m.z = m.x.map((v, j) => (v - mu[j]) / sd[j])));
const dist = (a, b) => Math.sqrt(a.z.reduce((s, v, j) => s + (v - b.z[j]) ** 2, 0));
const vecinos = (m, pool, k = 5) => pool.filter((o) => o !== m).map((o) => ({ o, d: dist(m, o) })).sort((a, b) => a.d - b.d).slice(0, k).map((v) => v.o);

// Panel SIAP: por municipio y cultivo del catálogo, hectáreas sembradas y rendimiento en 2024 (todos los ciclos y modalidades).
const panel = cargarPanel();
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const datosMun = (id) => {
  const nombres = CATALOGO[id][1].map(norm), out = new Map();
  for (const g of panel) {
    if (!nombres.includes(norm(g.cultivo))) continue;
    const a = g.años[2024];
    if (!a) continue;
    const k = `${g.estado}|${g.id}`, o = out.get(k) ?? { sem: 0, cos: 0, vol: 0 };
    o.sem += a.sem; o.cos += a.cos; o.vol += a.vol; out.set(k, o);
  }
  return out;
};

const R = { fecha: new Date().toISOString().slice(0, 10), municipios: info.length, nota: 'Presente = al menos 5 ha sembradas en 2024 en el municipio (SIAP). Validación: dejar un municipio fuera.', A: {}, B: {}, C: {} };
const pooledA = { p: [], y: [] }, pooledB = { base: [], knn: [], y: [] };
for (const id of Object.keys(CATALOGO)) {
  const d = datosMun(id);
  const y = info.map((m) => ((d.get(m.key)?.sem ?? 0) >= 5 ? 1 : 0));
  const pos = y.reduce((s, v) => s + v, 0);
  if (pos < 4 || info.length - pos < 4) { R.A[id] = { n_presentes: pos, nota: 'muy pocos casos para evaluar' }; continue; }
  // A. regla de aptitud (sin ajustar nada con los datos de siembra)
  const ap = info.map((m) => NIVEL[aptitud(CATALOGO[id][2], m.clim).nivel] ?? 1);
  const pA = ap.map((v) => 1 - v / 2);
  R.A[id] = { n_presentes: pos, n_municipios: info.length, auc_regla: r3(auc(pA, y)), nivel_en_presentes: r3(avg(ap.filter((_, i) => y[i]))), nivel_en_ausentes: r3(avg(ap.filter((_, i) => !y[i]))) };
  pooledA.p.push(...pA.map((v, i) => v - 0)); pooledA.y.push(...y);
  // B. vecinos por clima vs frecuencia general (dejando un municipio fuera)
  const base = info.map((m, i) => avg(y.filter((_, j) => j !== i))), baseEstado = info.map((m, i) => { const mis = info.map((o, j) => (o.estado === m.estado && j !== i ? y[j] : null)).filter((v) => v !== null); return avg(mis); });
  const knn = info.map((m) => avg(vecinos(m, info).map((o) => y[info.indexOf(o)])));
  const brier = (p) => avg(p.map((v, i) => (v - y[i]) ** 2));
  R.B[id] = { brier_frecuencia: r3(brier(base)), brier_frecuencia_estado: r3(brier(baseEstado)), brier_vecinos5: r3(brier(knn)), auc_vecinos5: r3(auc(knn, y)), auc_frecuencia_estado: r3(auc(baseEstado, y)) };
  pooledB.base.push(...baseEstado); pooledB.knn.push(...knn); pooledB.y.push(...y);
  // C. rendimiento en municipio nuevo (solo municipios con >= 5 ha y cosecha)
  const con = info.filter((m) => { const v = d.get(m.key); return v && v.sem >= 5 && v.cos > 0 && v.vol > 0; });
  if (con.length >= 8) {
    const rend = (m) => { const v = d.get(m.key); return v.vol / v.cos; };
    const eBase = [], eKnn = [];
    for (const m of con) {
      const mismo = con.filter((o) => o !== m && o.estado === m.estado), pool = mismo.length >= 3 ? mismo : con.filter((o) => o !== m);
      const t = rend(m);
      eBase.push(Math.abs(avg(pool.map(rend)) - t) / t);
      eKnn.push(Math.abs(avg(vecinos(m, con.filter((o) => o !== m).concat([m])).map(rend)) - t) / t);
    }
    const med = (a) => [...a].sort((x, y2) => x - y2)[Math.floor(a.length / 2)];
    R.C[id] = { municipios: con.length, error_mediano_pct_promedio_estado: r3(100 * med(eBase)), error_mediano_pct_vecinos5: r3(100 * med(eKnn)), gana_vecinos: med(eKnn) < med(eBase) };
  }
}
R.A_agrupado = { auc_regla: r3(auc(pooledA.p, pooledA.y)), nota: 'Mezcla cultivos; sube si el cultivo común está en más municipios.' };
const brierP = (p) => avg(p.map((v, i) => (v - pooledB.y[i]) ** 2));
R.B_agrupado = { brier_frecuencia_estado: r3(brierP(pooledB.base)), brier_vecinos5: r3(brierP(pooledB.knn)), auc_frecuencia_estado: r3(auc(pooledB.base, pooledB.y)), auc_vecinos5: r3(auc(pooledB.knn, pooledB.y)) };
const cs = Object.values(R.C);
R.C_resumen = { cultivos: cs.length, gana_vecinos: cs.filter((c) => c.gana_vecinos).length };
fs.writeFileSync(new URL('../data/frutas_ml_resultados.json', import.meta.url), JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1));

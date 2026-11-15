// Segunda ronda de ML: prueba ideas con validacion honesta y guarda server/data/ml2_resultados.json.
// Uso: node scripts/ml2-explorar.js   (SIAP_RAW_DIR=... si los CSV estan en otro lado)
import fs from 'node:fs';
import { AÑOS, avg, cargarClima, cargarPanel, rend, precio } from '../lib/ml2Datos.js';
import { fitRidge, predictRidge } from '../lib/ridge.js';
import { fitLogit, predictLogit, auc } from '../lib/logistic.js';

const r3 = (v) => (v == null || Number.isNaN(v) ? v : Math.round(v * 1000) / 1000);
const clima = await cargarClima();
const panel = cargarPanel();
const R = {}; // resultados

// ---------- dataset de siniestro: temporal PV, superficie >= 50 ha ----------
const CULT = ['Maiz grano', 'Sorgo grano', 'Frijol', 'Avena forrajera en verde', 'Garbanzo grano'];
const D = [];
for (const g of panel.filter((p) => p.ciclo === 'PV' && p.modalidad === 'Temporal' && CULT.includes(p.cultivo)))
  for (const [y, a] of Object.entries(g.años)) {
    const c = clima.get(`${g.estado}|${g.id}`)?.porAño.get(Number(y));
    if (!c || a.sem < 50 || Object.values(c).some((v) => v == null)) continue;
    D.push({ estado: g.estado, id: g.id, cultivo: g.cultivo, anio: Number(y), sin: (100 * a.sin) / a.sem, malo: a.sin / a.sem > 0.1 ? 1 : 0, ...c });
  }
R.filas_siniestro = D.length;
const part = {
  sep: (d) => d.estado + d.cultivo, // un modelo por estado y cultivo
  cultivo: (d) => d.cultivo, // por cultivo, con efecto de estado
  estado: (d) => d.estado, // por estado, con efecto de cultivo
  todo: () => 'todo', // uno solo, con efecto de estado y cultivo
};
const dummies = { sep: [], cultivo: ['estado'], estado: ['cultivo'], todo: ['estado', 'cultivo'] };
const dumVals = (d, kinds) => kinds.flatMap((k) => (k === 'estado' ? [d.estado === 'Querétaro' ? 1 : 0] : CULT.slice(1).map((c) => (d.cultivo === c ? 1 : 0))));
const FS = {
  ratio: ['ratio'], ratio_t: ['ratio', 't_pv'], ratio_julago: ['ratio', 'lluvia_jul', 'lluvia_ago'], ratio_suelo: ['ratio', 'suelo_pv'],
  ratio_solar: ['ratio', 'solar_pv'], ratio_tmaxmin: ['ratio', 'tmax_pv', 'tmin_pv'],
  todo: ['ratio', 't_pv', 'lluvia_jul', 'lluvia_ago', 'suelo_pv', 'solar_pv', 'tmax_pv', 'tmin_pv'],
};

// leave-one-year-out; fit(trainRows) -> predictor(row)
function loyo(rows, fit) {
  const pred = new Map();
  for (const y of AÑOS) {
    const tr = rows.filter((d) => d.anio !== y), te = rows.filter((d) => d.anio === y);
    if (te.length) { const f = fit(tr); for (const d of te) pred.set(d, f(d)); }
  }
  return pred;
}
const logitFit = (feats, pk) => (tr) => {
  const models = new Map(), prev = avg(tr.map((d) => d.malo));
  const groups = new Map();
  for (const d of tr) (groups.get(part[pk](d)) ?? groups.set(part[pk](d), []).get(part[pk](d))).push(d);
  const x = (d) => [...feats.map((f) => d[f]), ...dumVals(d, dummies[pk])];
  for (const [k, rows] of groups) {
    const pos = rows.reduce((s, d) => s + d.malo, 0);
    models.set(k, pos < 3 || rows.length - pos < 3 ? { p: pos / rows.length } : { m: fitLogit(rows.map(x), rows.map((d) => d.malo), 5) });
  }
  return (d) => { const o = models.get(part[pk](d)); return o ? (o.m ? predictLogit(o.m, x(d)) : o.p) : prev; };
};
const baseFit = (kind) => (tr) => { // prevalencia por estado x cultivo, o por municipio (con respaldo)
  const by = (kf) => { const m = new Map(); for (const d of tr) (m.get(kf(d)) ?? m.set(kf(d), []).get(kf(d))).push(d.malo); return m; };
  const e = by(part.sep), mu = by((d) => d.estado + d.cultivo + d.id);
  return (d) => (kind === 'muni' && mu.has(d.estado + d.cultivo + d.id) ? avg(mu.get(d.estado + d.cultivo + d.id)) : avg(e.get(part.sep(d)) ?? [0]));
};
function cls(rows, pred, sel = () => true) {
  const s = rows.filter(sel), p = s.map((d) => pred.get(d)), y = s.map((d) => d.malo);
  const tp = p.filter((v, i) => v >= 0.5 && y[i]).length, fp = p.filter((v, i) => v >= 0.5 && !y[i]).length, fn = p.filter((v, i) => v < 0.5 && y[i]).length;
  return { n: s.length, prevalencia: r3(avg(y)), acc: r3(avg(p.map((v, i) => ((v >= 0.5 ? 1 : 0) === y[i] ? 1 : 0)))), precision: r3(tp / (tp + fp || NaN)), recall: r3(tp / (tp + fn || NaN)), brier: r3(avg(p.map((v, i) => (v - y[i]) ** 2))), auc: r3(auc(p, y)) };
}
const slices = { todo: () => true, 'Gto maiz': (d) => d.estado === 'Guanajuato' && d.cultivo === 'Maiz grano', 'Qro maiz': (d) => d.estado === 'Querétaro' && d.cultivo === 'Maiz grano', 'Gto frijol': (d) => d.estado === 'Guanajuato' && d.cultivo === 'Frijol', 'Gto sorgo': (d) => d.estado === 'Guanajuato' && d.cultivo === 'Sorgo grano' };
const tabla = (pred) => Object.fromEntries(Object.entries(slices).map(([k, f]) => [k, cls(D, pred, f)]));

// 1. clasificacion "año malo" (siniestro > 10 %): base (prevalencia estado x cultivo y municipal) vs logistica ratio+t
const pBase = loyo(D, baseFit('sc')), pBaseMuni = loyo(D, baseFit('muni'));
R.e1_clasificacion = { baseline_prevalencia_estado_cultivo: tabla(pBase), baseline_prevalencia_municipio: tabla(pBaseMuni), logistica_ratio_t_sep: tabla(loyo(D, logitFit(FS.ratio_t, 'sep'))) };

// 2. ablacion: conjuntos de variables FIJADOS antes de mirar resultados (se reportan todos), modelo conjunto
R.e2_ablacion = {};
for (const [n, f] of Object.entries(FS)) R.e2_ablacion[n] = tabla(loyo(D, logitFit(f, 'todo'))).todo;
R.e2_ablacion_separado = {};
for (const [n, f] of Object.entries(FS)) R.e2_ablacion_separado[n] = tabla(loyo(D, logitFit(f, 'sep'))).todo;
// Dejar una fuera partiendo del conjunto completo
R.e2_quitar_una = {};
for (const q of FS.todo) R.e2_quitar_una[q] = tabla(loyo(D, logitFit(FS.todo.filter((f) => f !== q), 'todo'))).todo.brier;

// 3. conjunto vs separado (variables fijas: ratio, t_pv)
R.e3_conjunto_vs_separado = {};
for (const pk of Object.keys(part)) R.e3_conjunto_vs_separado[pk] = tabla(loyo(D, logitFit(FS.ratio_t, pk)));

// 4. incertidumbre: regresion de siniestro (%), intervalo 80 % con residuos de LOYO interno (anidado) vs intervalo ingenuo
const ridgeFit = (feats) => (tr) => {
  const groups = new Map();
  for (const d of tr) (groups.get(part.sep(d)) ?? groups.set(part.sep(d), []).get(part.sep(d))).push(d);
  const ms = new Map([...groups].map(([k, rows]) => [k, rows.length < 20 ? { c: avg(rows.map((d) => d.sin)) } : { m: fitRidge(rows.map((d) => feats.map((f) => d[f])), rows.map((d) => d.sin), 10) }]));
  const glob = avg(tr.map((d) => d.sin));
  return (d) => { const o = ms.get(part.sep(d)); return Math.min(100, Math.max(0, o ? (o.m ? predictRidge(o.m, feats.map((f) => d[f])) : o.c) : glob)); };
};
const quant = (a, q) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(q * a.length))];
const cov = { modelo: [], ingenuo: [] }, ancho = { modelo: [], ingenuo: [] }, err = { modelo: [], base: [] };
for (const y of AÑOS) {
  const tr = D.filter((d) => d.anio !== y), te = D.filter((d) => d.anio === y);
  const f = ridgeFit(FS.ratio_t)(tr);
  const inner = loyo(tr, ridgeFit(FS.ratio_t)); // predicciones fuera de muestra DENTRO del entrenamiento
  const res = new Map();
  for (const d of tr) (res.get(part.sep(d)) ?? res.set(part.sep(d), []).get(part.sep(d))).push(d.sin - inner.get(d));
  const sinPorGrupo = new Map();
  for (const d of tr) (sinPorGrupo.get(part.sep(d)) ?? sinPorGrupo.set(part.sep(d), []).get(part.sep(d))).push(d.sin);
  for (const d of te) {
    const rs = res.get(part.sep(d)) ?? [0], p = f(d);
    const lo = Math.max(0, p + quant(rs, 0.1)), hi = Math.min(100, p + quant(rs, 0.9));
    const ss = sinPorGrupo.get(part.sep(d)) ?? [0], lo2 = quant(ss, 0.1), hi2 = quant(ss, 0.9);
    cov.modelo.push(d.sin >= lo && d.sin <= hi ? 1 : 0); ancho.modelo.push(hi - lo);
    cov.ingenuo.push(d.sin >= lo2 && d.sin <= hi2 ? 1 : 0); ancho.ingenuo.push(hi2 - lo2);
    err.modelo.push(Math.abs(p - d.sin)); err.base.push(Math.abs(avg(ss) - d.sin));
  }
}
R.e4_intervalos_80 = { nominal: 0.8, modelo_residuos_loyo: { cobertura: r3(avg(cov.modelo)), ancho_medio_pts: r3(avg(ancho.modelo)) }, ingenuo_cuantiles_del_objetivo: { cobertura: r3(avg(cov.ingenuo)), ancho_medio_pts: r3(avg(ancho.ingenuo)) }, mae_modelo: r3(avg(err.modelo)), mae_media_grupo: r3(avg(err.base)) };
// calibracion de la logistica conjunta (LOYO): prob predicha vs frecuencia observada
{
  const p = loyo(D, logitFit(FS.ratio_t, 'todo')), bins = [[0, 0.1], [0.1, 0.25], [0.25, 0.5], [0.5, 1.01]];
  R.e4_calibracion_logistica = bins.map(([a, b]) => { const s = D.filter((d) => p.get(d) >= a && p.get(d) < b); return { rango: `${a}-${Math.min(b, 1)}`, n: s.length, prob_media: r3(avg(s.map((d) => p.get(d)))), frecuencia_obs: r3(avg(s.map((d) => d.malo))) }; });
}

// ---------- 5 y 7: rendimiento y precio, ventana creciente (entrena con años anteriores, prueba 2021-2024) ----------
const FC = ['ratio', 't_pv', 'tmin_inv', 't_anual'];
const filas = []; // una por municipio-grupo-año con rend y precio
for (const g of panel) for (const [y, a] of Object.entries(g.años)) {
  const c = clima.get(`${g.estado}|${g.id}`)?.porAño.get(Number(y));
  if (rend(a) && c && FC.every((f) => c[f] != null)) filas.push({ g, key: `${g.estado}|${g.id}|${g.cultivo}|${g.ciclo}|${g.modalidad}`, grupo: `${g.cultivo}|${g.ciclo}|${g.modalidad}`, anio: Number(y), rend: rend(a), precio: precio(a), sem: a.sem, ...c });
}
const porKey = new Map();
for (const f of filas) (porKey.get(f.key) ?? porKey.set(f.key, []).get(f.key)).push(f);
const grupos = new Map();
for (const f of filas) (grupos.get(f.grupo) ?? grupos.set(f.grupo, []).get(f.grupo)).push(f);
const mape = (e) => r3(quant(e, 0.5)); // mediana del error porcentual (robusta a rendimientos casi cero)
function rolling(sel, target) {
  const e = { media: [], lag1: [], clima: [], lag1_mas_media: [] };
  for (const [grp, rows] of grupos) {
    if (!sel(grp)) continue;
    for (const y of [2021, 2022, 2023, 2024]) {
      const tr = rows.filter((f) => f.anio < y && f[target] != null), te = rows.filter((f) => f.anio === y && f[target] != null);
      const mm = new Map(); // media por municipio en el entrenamiento
      for (const f of tr) (mm.get(f.key) ?? mm.set(f.key, []).get(f.key)).push(f[target]);
      const dev = tr.filter((f) => mm.get(f.key).length >= 2).map((f) => ({ f, d: Math.log(f[target] / avg(mm.get(f.key))) }));
      const ridge = target === 'rend' && dev.length >= 30 ? fitRidge(dev.map((o) => FC.map((k) => o.f[k])), dev.map((o) => o.d), 10) : null;
      for (const t of te) {
        const h = mm.get(t.key); if (!h || h.length < 2) continue;
        const lag = tr.find((f) => f.key === t.key && f.anio === y - 1)?.[target]; if (lag == null) continue;
        const base = avg(h), ape = (p) => Math.abs(p - t[target]) / t[target];
        e.media.push(ape(base)); e.lag1.push(ape(lag)); e.lag1_mas_media.push(ape((lag + base) / 2));
        e.clima.push(ape(ridge ? base * Math.exp(predictRidge(ridge, FC.map((k) => t[k]))) : base));
      }
    }
  }
  return e.media.length < 20 ? null : { n: e.media.length, mediana_error_pct: Object.fromEntries(Object.entries(e).map(([k, v]) => [k, r3(100 * quant(v, 0.5))])) };
}
R.e5_rendimiento_todos = rolling(() => true, 'rend');
R.e5_precio_todos = rolling(() => true, 'precio');
R.e5_rendimiento_granos_temporal = rolling((g) => /Maiz grano|Sorgo grano|Frijol/.test(g) && g.endsWith('Temporal'), 'rend');
const HORT = ['Fresa', 'Tomate rojo (jitomate)', 'Chile verde', 'Cebolla', 'Aguacate', 'Uva', 'Brócoli', 'Lechuga', 'Zanahoria', 'Ajo', 'Espárrago', 'Alfalfa verde', 'Agave', 'Tuna', 'Nopalitos', 'Cebada grano', 'Trigo grano', 'Maiz grano', 'Frijol', 'Sorgo grano', 'Tomate verde', 'Cebolla', 'Coliflor', 'Papa', 'Manzana'];
R.e7_por_cultivo = {};
for (const c of [...new Set(HORT)]) {
  const rr = rolling((g) => g.startsWith(c + '|') && g.endsWith('Riego'), 'rend'), pp = rolling((g) => g.startsWith(c + '|') && g.endsWith('Riego'), 'precio');
  const tt = c === 'Maiz grano' || c === 'Frijol' || c === 'Sorgo grano' ? rolling((g) => g.startsWith(c + '|') && g.endsWith('Temporal'), 'rend') : null;
  if (rr || pp || tt) R.e7_por_cultivo[c] = { riego_rendimiento: rr, riego_precio: pp, temporal_rendimiento: tt };
}
// serie estatal agregada (7 puntos por cultivo): rendimiento = volumen/cosechada de todos los municipios
R.e7_serie_estatal = {};
for (const c of ['Fresa', 'Tomate rojo (jitomate)', 'Chile verde', 'Cebolla', 'Aguacate', 'Uva', 'Brócoli', 'Espárrago']) {
  for (const estado of ['Guanajuato', 'Querétaro']) {
    const s = AÑOS.map((y) => { let vol = 0, cos = 0, val = 0; for (const g of panel) if (g.cultivo === c && g.estado === estado && g.años[y]) { vol += g.años[y].vol; cos += g.años[y].cos; val += g.años[y].valor; } return { y, rend: cos ? vol / cos : null, precio: vol ? val / vol : null }; });
    if (s.filter((v) => v.rend).length < 6) continue;
    const ev = (k) => { const e = { media: [], lag1: [] }; for (let i = 3; i < 7; i++) { const t = s[i][k], h = s.slice(0, i).map((v) => v[k]).filter((v) => v); if (!t || !h.length || !s[i - 1][k]) continue; e.media.push(Math.abs(avg(h) - t) / t); e.lag1.push(Math.abs(s[i - 1][k] - t) / t); } return { media_pct: r3(100 * avg(e.media)), lag1_pct: r3(100 * avg(e.lag1)), cv_serie_pct: r3((100 * Math.sqrt(avg(s.map((v) => (v[k] - avg(s.map((w) => w[k]))) ** 2)))) / avg(s.map((w) => w[k]))) }; };
    R.e7_serie_estatal[`${c} ${estado}`] = { rendimiento: ev('rend'), precio: ev('precio'), hectareas_2024: Math.round(panel.filter((g) => g.cultivo === c && g.estado === estado).reduce((a, g) => a + (g.años[2024]?.sem ?? 0), 0)) };
  }
}

// ---------- 6: municipios parecidos (k-means sobre normales climaticas) y prueba "municipio nuevo" ----------
const munis = [...clima.values()];
const vars = ['lluvia_pv', 't_anual', 'solar', 'suelo_pv'];
const sd = vars.map((v) => Math.sqrt(avg(munis.map((m) => (m.normal[v] - avg(munis.map((x) => x.normal[v]))) ** 2))) || 1), mu = vars.map((v) => avg(munis.map((m) => m.normal[v])));
const vec = (m) => vars.map((v, i) => (m.normal[v] - mu[i]) / sd[i]);
const dist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
const K = 4;
let cent = [vec(munis[0])]; // farthest-first (determinista)
while (cent.length < K) cent.push(vec(munis.reduce((b, m) => (Math.min(...cent.map((c) => dist(vec(m), c))) > Math.min(...cent.map((c) => dist(vec(b), c))) ? m : b))));
let asign = [];
for (let it = 0; it < 50; it++) {
  asign = munis.map((m) => cent.map((c) => dist(vec(m), c)).reduce((b, v, i, a) => (v < a[b] ? i : b), 0));
  cent = cent.map((c, k) => { const mem = munis.filter((_, i) => asign[i] === k); return mem.length ? vars.map((_, j) => avg(mem.map((m) => vec(m)[j]))) : c; });
}
munis.forEach((m, i) => (m.cluster = asign[i]));
const clusterInfo = cent.map((c, k) => ({ cluster: k, municipios: munis.filter((m) => m.cluster === k).length, ...Object.fromEntries(vars.map((v, j) => [v, r3(c[j] * sd[j] + mu[j])])) }));
fs.writeFileSync(new URL('../data/municipios_clusters.json', import.meta.url), JSON.stringify({ variables: vars, nota: 'k-means (k=4) sobre normales NASA POWER 2000-2024 estandarizadas; asignar una parcela nueva al centroide mas cercano', clusters: clusterInfo, municipios: munis.map((m) => ({ estado: m.estado, id: m.id, nombre: m.nombre, cluster: m.cluster })) }));
R.e6_clusters = clusterInfo;
const e6 = {};
for (const cult of ['Maiz grano', 'Frijol', 'Sorgo grano']) for (const target of ['rend', 'sin']) {
  const rows = filas.filter((f) => f.grupo === `${cult}|PV|Temporal` && f.sem >= 50).map((f) => ({ ...f, sin: D.find((d) => d.id === f.g.id && d.estado === f.g.estado && d.cultivo === cult && d.anio === f.anio)?.sin })).filter((f) => f[target] != null);
  const mm = (f) => clima.get(`${f.g.estado}|${f.g.id}`);
  const e = { estado_cultivo: [], cluster: [], vecinos5: [], municipio_propio: [] };
  for (const t of rows) {
    const otros = rows.filter((f) => f.g.id !== t.g.id || f.g.estado !== t.g.estado);
    const mt = mm(t);
    const mesmo = otros.filter((f) => f.g.estado === t.g.estado);
    e.estado_cultivo.push(Math.abs(avg((mesmo.length ? mesmo : otros).map((f) => f[target])) - t[target]));
    const cl = otros.filter((f) => mm(f).cluster === mt.cluster);
    e.cluster.push(Math.abs(avg((cl.length ? cl : otros).map((f) => f[target])) - t[target]));
    const ids = [...new Set(otros.map((f) => `${f.g.estado}|${f.g.id}`))].map((k) => [k, dist(vec(mt), vec(clima.get(k)))]).sort((a, b) => a[1] - b[1]).slice(0, 5).map((a) => a[0]);
    e.vecinos5.push(Math.abs(avg(otros.filter((f) => ids.includes(`${f.g.estado}|${f.g.id}`)).map((f) => f[target])) - t[target]));
    const own = rows.filter((f) => f.key === t.key && f.anio !== t.anio);
    if (own.length) e.municipio_propio.push(Math.abs(avg(own.map((f) => f[target])) - t[target]));
  }
  e6[`${cult} ${target === 'rend' ? 'rendimiento t/ha' : 'siniestro pts'}`] = { n: rows.length, mae: Object.fromEntries(Object.entries(e).map(([k, v]) => [k, r3(avg(v))])) };
}
R.e6_municipio_nuevo_mae = e6; // leave-one-municipality-out: el municipio probado no entra al entrenamiento (municipio_propio SI usa su historial)

// 8. rendimiento temporal: efecto del clima sobre el rendimiento del PV con variable de clima mas simple (correlacion cruda por municipio-año, desviacion vs media municipal)
{
  const out = {};
  for (const cult of ['Maiz grano', 'Frijol', 'Sorgo grano']) {
    const rows = filas.filter((f) => f.grupo === `${cult}|PV|Temporal` && f.sem >= 50);
    const dev = rows.map((f) => { const h = rows.filter((x) => x.key === f.key); return { f, d: f.rend / avg(h.map((x) => x.rend)) - 1 }; });
    const cor = (k) => { const x = dev.map((o) => o.f[k]), y = dev.map((o) => o.d), mx = avg(x), my = avg(y); return r3(x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0) * y.reduce((s, v) => s + (v - my) ** 2, 0))); };
    out[cult] = { n: dev.length, corr_desviacion_rend_vs: Object.fromEntries(['ratio', 't_pv', 'lluvia_jul', 'lluvia_ago', 'suelo_pv', 'solar_pv', 'tmax_pv', 'tmin_pv'].map((k) => [k, cor(k)])) };
  }
  R.e8_corr_rendimiento_clima = out;
}

fs.writeFileSync(new URL('../data/ml2_resultados.json', import.meta.url), JSON.stringify({ fecha: new Date().toISOString().slice(0, 10), ...R }, null, 1));
console.log(JSON.stringify(R, null, 1));

// ---------- exportables para Node ----------
{
  const x = (d) => [d.ratio, d.t_pv, ...dumVals(d, ['estado', 'cultivo'])];
  const m = fitLogit(D.map(x), D.map((d) => d.malo), 5);
  const ant = loyo(D, logitFit(['ratio', 't_pv'], 'todo'));
  fs.writeFileSync(new URL('../data/modelo_ano_malo.json', import.meta.url), JSON.stringify({
    fecha: new Date().toISOString().slice(0, 10), definicion: 'ano malo = siniestrada > 10 % de la superficie sembrada (temporal, primavera-verano)',
    features: ['ratio', 't_pv', 'estado_queretaro', ...CULT.slice(1).map((c) => `cultivo_${c}`)], cultivos: CULT,
    modelo: { mean: m.mean.map(r3), sd: m.sd.map(r3), w: m.w.map((v) => Math.round(v * 1e4) / 1e4) }, filas: D.length,
    validacion_loyo: { brier: cls(D, ant).brier, brier_linea_base: cls(D, pBase).brier, auc: cls(D, ant).auc, calibracion: R.e4_calibracion_logistica },
  }, null, 1));
  const cl = JSON.parse(fs.readFileSync(new URL('../data/municipios_clusters.json', import.meta.url), 'utf8'));
  for (const mm of cl.municipios) {
    const cm = clima.get(`${mm.estado}|${mm.id}`);
    mm.normal = Object.fromEntries(vars.map((v) => [v, r3(cm.normal[v])]));
    mm.rend_pv_temporal = {};
    for (const cult of ['Maiz grano', 'Frijol', 'Sorgo grano']) {
      const h = filas.filter((f) => f.grupo === `${cult}|PV|Temporal` && f.g.id === mm.id && f.g.estado === mm.estado && f.sem >= 50);
      if (h.length >= 2) mm.rend_pv_temporal[cult] = r3(avg(h.map((f) => f.rend)));
    }
  }
  cl.estandarizacion = { media: mu.map(r3), sd: sd.map(r3) };
  fs.writeFileSync(new URL('../data/municipios_clusters.json', import.meta.url), JSON.stringify(cl));
}

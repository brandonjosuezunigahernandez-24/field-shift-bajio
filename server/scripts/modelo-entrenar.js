// Entrena (ridge, JS puro) el riesgo de siniestro y el rendimiento por estado y cultivo de temporal PV.
// Uso: node scripts/modelo-entrenar.js   (SIAP_RAW_DIR=... si los CSV estan en otro lado)
// Lee data/municipios.json, clima NASA POWER (cache) y los CSV del SIAP; escribe data/modelo_<estado>.json y data/dataset_modelo.csv.
import fs from 'node:fs';
import { getClimate, seasonRainByYear, median } from '../sources/nasaPower.js';
import { readSiapRows, isTemporalPV } from '../lib/siapMunicipal.js';
import { fitRidge, predictRidge } from '../lib/ridge.js';

const DATA = new URL('../data/', import.meta.url);
const CULTIVOS = { maiz: /^Ma.{1,3}z grano$/, frijol: /^Frijol$/, sorgo: /^Sorgo grano$/ };
const MIN_SEMBRADA = 50; // ha: municipios con muy poca superficie dan porcentajes ruidosos
const LAMBDA = 10;
const AÑOS = [2018, 2019, 2020, 2021, 2022, 2023, 2024];
// Variables que la app puede dar: lluvia PV, mediana local PV (-> ratio), temperatura PV.
const FEATURE_SETS = {
  ratio: ['ratio'],
  ratio_t: ['ratio', 't_pv'],
  ratio_t_mm: ['ratio', 't_pv', 'lluvia_pv'],
  meses: ['ratio', 't_pv', 'lluvia_jun', 'lluvia_jul', 'lluvia_ago', 'lluvia_sep', 'suelo_pv'],
};
const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const r3 = (v) => Math.round(v * 1000) / 1000;

const { municipios } = JSON.parse(fs.readFileSync(new URL('municipios.json', DATA), 'utf8'));
const siap = readSiapRows().filter(isTemporalPV);

// clima por municipio-año
const clima = new Map();
for (const m of municipios) {
  const { rows } = await getClimate(m.lat, m.lon);
  const pv = new Map(seasonRainByYear(rows).map((y) => [y.year, y.rain_mm]));
  const med = median([...pv.values()]);
  const mes = (y, mm, f) => rows.find((r) => r.year === y && r.month === mm)?.[f];
  for (const y of AÑOS) {
    if (!pv.has(y)) continue;
    const t = [6, 7, 8, 9].map((mm) => mes(y, mm, 't_mean_c'));
    const w = [6, 7, 8, 9].map((mm) => mes(y, mm, 'root_wetness'));
    if (t.some((v) => v == null) || w.some((v) => v == null)) continue;
    clima.set(`${m.estado}|${m.id}|${y}`, {
      lluvia_pv: pv.get(y), mediana_pv: med, ratio: pv.get(y) / med, t_pv: avg(t), suelo_pv: avg(w),
      lluvia_jun: mes(y, 6, 'rain_mm'), lluvia_jul: mes(y, 7, 'rain_mm'), lluvia_ago: mes(y, 8, 'rain_mm'), lluvia_sep: mes(y, 9, 'rain_mm'),
    });
  }
}

// dataset municipio x año x cultivo
const data = [];
for (const r of siap) {
  const cultivo = Object.keys(CULTIVOS).find((c) => CULTIVOS[c].test(r.Nomcultivo));
  const c = cultivo && clima.get(`${r.Nomestado}|${r.Idmunicipio}|${r.Anio}`);
  if (!c || r.Sembrada < MIN_SEMBRADA) continue;
  data.push({
    estado: r.Nomestado, id: Number(r.Idmunicipio), municipio: r.Nommunicipio, anio: r.Anio, cultivo, sembrada: r.Sembrada,
    siniestro: (100 * r.Siniestrada) / r.Sembrada, rendimiento: r.Cosechada > 0 ? r.Rendimiento : null, ...c,
  });
}
const cols = ['estado', 'id', 'municipio', 'anio', 'cultivo', 'sembrada', 'siniestro', 'rendimiento', 'lluvia_pv', 'mediana_pv', 'ratio', 't_pv', 'suelo_pv', 'lluvia_jun', 'lluvia_jul', 'lluvia_ago', 'lluvia_sep'];
fs.writeFileSync(
  new URL('dataset_modelo.csv', DATA),
  [cols.join(','), ...data.map((d) => cols.map((k) => (typeof d[k] === 'number' ? r3(d[k]) : d[k] ?? '')).join(','))].join('\n') + '\n'
);

// ---- evaluacion ----
function baseMeans(train, target) { // promedio por municipio, con respaldo al del estado
  const g = {};
  for (const d of train) (g[d.id] ??= []).push(d[target]);
  return { mun: Object.fromEntries(Object.entries(g).map(([k, v]) => [k, avg(v)])), estado: avg(train.map((d) => d[target])) };
}
const basePred = (b, d) => b.mun[d.id] ?? b.estado;

function fitModel(train, target, feats, modo = 'municipio') { // base (municipal o estatal) + ridge sobre la desviacion explicada por el clima
  const base = baseMeans(train, target);
  if (modo === 'estado') base.mun = {};
  const ridge = fitRidge(train.map((d) => feats.map((f) => d[f])), train.map((d) => d[target] - basePred(base, d)), LAMBDA);
  return { base, ridge, feats, modo };
}
const modelPred = (m, d) => basePred(m.base, d) + predictRidge(m.ridge, m.feats.map((f) => d[f]));

function metrics(preds, actual) {
  const mu = avg(actual);
  const sse = preds.reduce((s, p, i) => s + (p - actual[i]) ** 2, 0);
  return { mae: r3(avg(preds.map((p, i) => Math.abs(p - actual[i])))), r2: r3(1 - sse / actual.reduce((s, a) => s + (a - mu) ** 2, 0)), n: actual.length };
}
function evaluate(target, feats, splits, modo) { // splits: [{train, test}]
  const pb = [], pm = [], act = [];
  for (const { train, test } of splits) {
    if (!train.length || !test.length) continue;
    const m = fitModel(train, target, feats, modo), b = baseMeans(train, target);
    for (const d of test) { pb.push(basePred(b, d)); pm.push(modelPred(m, d)); act.push(d[target]); }
  }
  const base = metrics(pb, act), modelo = metrics(pm, act);
  return { linea_base: base, modelo, mejora_mae_pct: r3((100 * (base.mae - modelo.mae)) / base.mae) };
}
const holdout = (rows) => [{ train: rows.filter((d) => d.anio <= 2022), test: rows.filter((d) => d.anio >= 2023) }];
const loyo = (rows) => AÑOS.map((y) => ({ train: rows.filter((d) => d.anio !== y), test: rows.filter((d) => d.anio === y) }));

// ---- por estado y cultivo ----
const reporte = [];
for (const estado of [...new Set(data.map((d) => d.estado))]) {
  const out = { estado, fecha: new Date().toISOString().slice(0, 10), fuente: 'SIAP municipal 2018-2024 (temporal, primavera-verano) + NASA POWER mensual', lambda: LAMBDA, minSembradaHa: MIN_SEMBRADA, cultivos: {} };
  for (const cultivo of Object.keys(CULTIVOS)) {
    const rows = data.filter((d) => d.estado === estado && d.cultivo === cultivo);
    if (rows.length < 60) continue;
    const c = { filas: rows.length, municipios: new Set(rows.map((d) => d.id)).size, objetivos: {} };
    for (const target of ['siniestro', 'rendimiento']) {
      const tr = rows.filter((d) => d[target] !== null);
      const candidatos = Object.entries(FEATURE_SETS).flatMap(([nombre, feats]) => ['municipio', 'estado'].map((modo) => ({ nombre: `${nombre}/${modo}`, modo, feats, loyo: evaluate(target, feats, loyo(tr), modo) })));
      const mejor = candidatos.reduce((a, b) => (b.loyo.modelo.mae < a.loyo.modelo.mae ? b : a)); // elegido por leave-one-year-out
      const final = fitModel(tr, target, mejor.feats, mejor.modo);
      const ys = tr.map((d) => d[target]).sort((a, b) => a - b);
      const rx = tr.map((d) => d.ratio), ry = tr.map((d) => d[target]), mx = avg(rx), my = avg(ry);
      const o = {
        features: mejor.feats, conjunto: mejor.nombre, modo: mejor.modo,
        ridge: { mean: final.ridge.mean.map(r3), sd: final.ridge.sd.map(r3), coef: final.ridge.coef.map(r3) },
        baseEstado: r3(final.base.estado),
        baseMunicipio: Object.fromEntries(Object.entries(final.base.mun).map(([k, v]) => [k, r3(v)])),
        terciles: [ys[Math.floor(tr.length / 3)], ys[Math.floor((2 * tr.length) / 3)]].map(r3),
        corr_ratio_objetivo: r3(rx.reduce((s, x, i) => s + (x - mx) * (ry[i] - my), 0) / Math.sqrt(rx.reduce((s, x) => s + (x - mx) ** 2, 0) * ry.reduce((s, y) => s + (y - my) ** 2, 0))),
        validacion: {
          holdout_2023_2024: evaluate(target, mejor.feats, holdout(tr), mejor.modo),
          leave_one_year_out: mejor.loyo,
          mejora_mae_pct_loyo_por_conjunto: Object.fromEntries(candidatos.map((k) => [k.nombre, k.loyo.mejora_mae_pct])),
        },
      };
      o.supera_linea_base = o.validacion.leave_one_year_out.mejora_mae_pct > 0 && o.validacion.holdout_2023_2024.mejora_mae_pct > 0;
      c.objetivos[target] = o;
      reporte.push({ estado, cultivo, target, n: tr.length, set: mejor.nombre, corr: o.corr_ratio_objetivo, holdout: o.validacion.holdout_2023_2024, loyo: mejor.loyo });
    }
    out.cultivos[cultivo] = c;
  }
  fs.writeFileSync(new URL(`modelo_${estado.normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase()}.json`, DATA), JSON.stringify(out, null, 1));
}
console.log(`${data.length} filas, ${new Set(data.map((d) => d.estado + d.id)).size} municipios`);
for (const r of reporte) {
  console.log(r.estado, r.cultivo, r.target, `n=${r.n}`, r.set, `corr=${r.corr}`);
  console.log('  holdout', JSON.stringify(r.holdout));
  console.log('  loyo   ', JSON.stringify(r.loyo));
}

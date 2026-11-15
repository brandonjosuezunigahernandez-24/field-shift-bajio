import fs from 'node:fs';
import { getClimate, seasonRainByYear, median } from '../sources/nasaPower.js';
import { readSiapRows } from './siapMunicipal.js';

export const AÑOS = [2018, 2019, 2020, 2021, 2022, 2023, 2024];
export const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const nn = (a) => a.filter((v) => v != null);
const mean = (a) => (nn(a).length ? avg(nn(a)) : null);

// Clima por municipio: normales 2000-2024 y variables por año (temporada PV = jun-sep).
export async function cargarClima() {
  const { municipios } = JSON.parse(fs.readFileSync(new URL('../data/municipios.json', import.meta.url), 'utf8'));
  const out = new Map();
  for (const m of municipios) {
    const { rows } = await getClimate(m.lat, m.lon);
    const pv = new Map(seasonRainByYear(rows).map((y) => [y.year, y.rain_mm]));
    const med = median([...pv.values()]);
    const f = (y, ms, k) => mean(ms.map((mm) => rows.find((r) => r.year === y && r.month === mm)?.[k]));
    const porAño = new Map();
    for (const y of AÑOS) {
      if (!pv.has(y)) continue;
      const lluviaAnual = rows.filter((r) => r.year === y).reduce((s, r) => s + (r.rain_mm ?? 0), 0);
      porAño.set(y, {
        lluvia_pv: pv.get(y), ratio: pv.get(y) / med,
        lluvia_jul: f(y, [7], 'rain_mm'), lluvia_ago: f(y, [8], 'rain_mm'),
        t_pv: f(y, [6, 7, 8, 9], 't_mean_c'), tmax_pv: f(y, [6, 7, 8, 9], 't_max_c'), tmin_pv: f(y, [6, 7, 8, 9], 't_min_c'),
        solar_pv: f(y, [6, 7, 8, 9], 'solar'), suelo_pv: f(y, [6, 7, 8, 9], 'root_wetness'),
        t_anual: f(y, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 't_mean_c'),
        tmin_inv: mean([f(y, [1, 2], 't_min_c'), f(y - 1, [12], 't_min_c')]), lluvia_anual: lluviaAnual,
      });
    }
    const normal = {
      lluvia_pv: avg([...pv.values()]),
      t_anual: mean(rows.map((r) => r.t_mean_c)), solar: mean(rows.map((r) => r.solar)),
      suelo_pv: mean(rows.filter((r) => [6, 7, 8, 9].includes(r.month)).map((r) => r.root_wetness)),
    };
    out.set(`${m.estado}|${m.id}`, { ...m, porAño, normal });
  }
  return out;
}

const ESTADOS = new Set(['Guanajuato', 'Querétaro']);
// Panel por (municipio, cultivo, ciclo, modalidad) con una entrada por año (suma si el SIAP repite la fila).
export function cargarPanel() {
  const g = new Map();
  for (const r of readSiapRows().filter((x) => ESTADOS.has(x.Nomestado))) {
    const k = [r.Nomestado, r.Idmunicipio, r.Nomcultivo, r.Nomcicloproductivo, r.Nommodalidad].join('|');
    const o = g.get(k) ?? { estado: r.Nomestado, id: Number(r.Idmunicipio), municipio: r.Nommunicipio, cultivo: r.Nomcultivo.replace(/Ma.{1,3}z/, 'Maiz'), ciclo: r.Nomcicloproductivo.startsWith('Prim') ? 'PV' : r.Nomcicloproductivo.startsWith('Per') ? 'Per' : 'OI', modalidad: r.Nommodalidad === 'Temporal' ? 'Temporal' : 'Riego', años: {} };
    const a = (o.años[r.Anio] ??= { sem: 0, cos: 0, sin: 0, vol: 0, valor: 0 });
    a.sem += r.Sembrada; a.cos += r.Cosechada; a.sin += r.Siniestrada; a.vol += r.Volumenproduccion;
    a.valor += Number(r.Valorproduccion) || 0;
    g.set(k, o);
  }
  return [...g.values()];
}
export const rend = (a) => (a && a.cos > 0 && a.vol > 0 ? a.vol / a.cos : null);
export const precio = (a) => (a && a.vol > 0 && a.valor > 0 ? a.valor / a.vol : null);

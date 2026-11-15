// Desglose por cultivo (frutas y hortalizas) y estado desde los CSV municipales del SIAP -> server/data/desglose_cultivos.json.
// Uso: node scripts/desglose-generar.js   (SIAP_RAW_DIR=... si los CSV están en otro lado)
import { writeFileSync } from 'node:fs';
import { readSiapRows } from '../lib/siapMunicipal.js';

// id -> nombre para el agricultor, nombres exactos del SIAP, id de aptitud_cultivos.json y tipo.
export const CATALOGO = {
  fresa: ['Fresa', ['Fresa'], 'fresa', 'fruta'], aguacate: ['Aguacate', ['Aguacate'], 'aguacate', 'fruta'], uva: ['Uva', ['Uva'], 'uva', 'fruta'],
  durazno: ['Durazno', ['Durazno'], 'durazno', 'fruta'], guayaba: ['Guayaba', ['Guayaba'], 'guayaba', 'fruta'], tuna: ['Tuna', ['Tuna'], 'tuna', 'fruta'],
  nopalitos: ['Nopalitos', ['Nopalitos'], 'tuna', 'verdura'], limon: ['Limón', ['Limón'], 'limon', 'fruta'], naranja: ['Naranja', ['Naranja'], 'naranja', 'fruta'],
  manzana: ['Manzana', ['Manzana'], 'manzana', 'fruta'], arandano: ['Arándano', ['Arándano'], 'arandano', 'fruta'], frambuesa: ['Frambuesa', ['Frambuesa'], 'frambuesa', 'fruta'],
  nuez: ['Nuez', ['Nuez'], 'nuez', 'fruta'], esparrago: ['Espárrago', ['Espárrago'], 'esparrago', 'verdura'], jitomate: ['Jitomate', ['Tomate rojo (jitomate)'], 'jitomate', 'verdura'],
  chile: ['Chile verde', ['Chile verde'], 'chile', 'verdura'], cebolla: ['Cebolla', ['Cebolla'], 'cebolla', 'verdura'], papa: ['Papa', ['Papa'], 'papa', 'verdura'],
  brocoli: ['Brócoli', ['Brócoli'], 'brocoli', 'verdura'],
};
const YS = [2018, 2019, 2020, 2021, 2022, 2023, 2024];
const r = (n, d = 1) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);
const sum = (xs, k) => xs.reduce((a, x) => a + x[k], 0);
const pr = (rs) => { const v = sum(rs, 'Volumenproduccion'); return v > 0 ? sum(rs, 'Valorproduccion') / v : null; };

if (process.argv[1].endsWith('desglose-generar.js')) {
  const rows = readSiapRows().filter((x) => ['Guanajuato', 'Querétaro'].includes(x.Nomestado)).map((x) => ({ ...x, Valorproduccion: Number(x.Valorproduccion) || 0 }));
  const out = { fuente: 'SIAP, cierre agrícola municipal 2018-2024 (datos.gob.mx)', anios: YS, nota: 'Sembrada = superficie establecida; en frutales incluye árboles que aún no producen. Precio en pesos por tonelada, sin quitar inflación.', cultivos: {} };
  for (const [id, [nombre, siap, aptitud, tipo]] of Object.entries(CATALOGO)) {
    const estados = {};
    for (const estado of ['Guanajuato', 'Querétaro']) {
      const rs = rows.filter((x) => x.Nomestado === estado && siap.includes(x.Nomcultivo));
      const a24 = rs.filter((x) => x.Anio === 2024);
      if (!rs.length || !sum(a24, 'Sembrada')) continue; // sin siembra en 2024: no se reporta
      const mun = new Map();
      for (const x of a24) mun.set(x.Nommunicipio, (mun.get(x.Nommunicipio) ?? 0) + x.Sembrada);
      const sem = sum(a24, 'Sembrada'), cos = sum(a24, 'Cosechada');
      const p0 = pr(rs.filter((x) => x.Anio <= 2019)), p1 = pr(rs.filter((x) => x.Anio >= 2023));
      estados[estado] = {
        sembrada_ha_2024: r(sem), cosechada_ha_2024: r(cos), rendimiento_2024: cos ? r(sum(a24, 'Volumenproduccion') / cos, 2) : null,
        rendimiento_prom_2018_2024: sum(rs, 'Cosechada') ? r(sum(rs, 'Volumenproduccion') / sum(rs, 'Cosechada'), 2) : null,
        riego_pct_2024: r((100 * sum(a24.filter((x) => x.Nommodalidad === 'Riego'), 'Sembrada')) / sem, 0),
        perdida_pct_2018_2024: r((100 * sum(rs, 'Siniestrada')) / sum(rs, 'Sembrada')), perdida_pct_2024: r((100 * sum(a24, 'Siniestrada')) / sem),
        precio_2024: r(pr(a24), 0), precio_2018_2019: r(p0, 0), precio_2023_2024: r(p1, 0), precio_cambio_pct: p0 && p1 ? r((100 * (p1 - p0)) / p0, 0) : null,
        valor_millones_2024: r(sum(a24, 'Valorproduccion') / 1e6),
        sembrada_ha_2018: r(sum(rs.filter((x) => x.Anio === 2018), 'Sembrada')),
        anios_con_datos: new Set(rs.map((x) => x.Anio)).size,
        municipios_2024: [...mun].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, ha]) => ({ nombre: n, ha: r(ha), pct_sembrada: r((100 * ha) / sem, 0) })),
        n_municipios_2024: mun.size,
      };
    }
    out.cultivos[id] = { nombre, tipo, aptitud, estados };
  }
  writeFileSync(new URL('../data/desglose_cultivos.json', import.meta.url), JSON.stringify(out, null, 1));
  console.log(Object.entries(out.cultivos).map(([k, c]) => `${k}: ${Object.entries(c.estados).map(([e, x]) => `${e.slice(0, 3)} ${x.sembrada_ha_2024} ha ${x.rendimiento_2024} t/ha riego ${x.riego_pct_2024}% perd ${x.perdida_pct_2018_2024}% precio ${x.precio_2024} (${x.precio_cambio_pct}%)`).join(' | ')}`).join('\n'));
}

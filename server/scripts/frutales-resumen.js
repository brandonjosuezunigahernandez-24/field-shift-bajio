// Resume los frutales/perennes de Guanajuato y Querétaro desde los CSV del SIAP (ya bajados con siap-descargar.js)
// y deja server/data/frutales_resumen.json. Uso: node scripts/frutales-resumen.js [carpeta_con_csv]
// Solo el ciclo "Perennes" del SIAP. Sembrada = superficie establecida (incluye árboles que aún no producen); cosechada = la que ya produce.
import { readFileSync, writeFileSync } from 'node:fs';

const RAW = process.argv[2] ?? new URL('../data/siap_raw/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const OUT = new URL('../data/frutales_resumen.json', import.meta.url);
const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024];
const MIN_VALOR = 10e6; // descarta lo marginal: menos de 10 millones de pesos de producción en 7 años

// Qué cultivos del SIAP cuentan (Nomcultivo exacto). Se quedan fuera forrajes, agave, flores, magueyes, árbol de navidad, etc.
const TIPO = {
  Fresa: 'fruta', Frambuesa: 'fruta', Arándano: 'fruta', Zarzamora: 'fruta', Uva: 'fruta', Aguacate: 'fruta', Granada: 'fruta',
  Nuez: 'fruta', Guayaba: 'fruta', Durazno: 'fruta', Limón: 'fruta', Manzana: 'fruta', Naranja: 'fruta', Mango: 'fruta',
  Pera: 'fruta', Membrillo: 'fruta', Pitahaya: 'fruta', Tuna: 'nopal', Nopalitos: 'nopal', Espárrago: 'hortaliza perenne', Alcachofa: 'hortaliza perenne',
};
const ESTADOS = { Guanajuato: 'Guanajuato', Querétaro: 'Querétaro' };

const r = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const filas = [];
for (const y of YEARS) {
  for (const l of readFileSync(`${RAW}/${y}.csv`, 'latin1').split(/\r?\n/).slice(1)) {
    const c = l.split(',');
    if (c.length < 24 || c[10] !== 'Perennes' || !ESTADOS[c[2]] || !TIPO[c[16]]) continue;
    filas.push({ y, estado: c[2], mun: c[8], modal: c[12], unidad: c[14], cultivo: c[16], sem: +c[17], cos: +c[18], sin: +c[19], vol: +c[20], valor: +c[23] });
  }
}

const sum = (xs, k) => xs.reduce((a, x) => a + x[k], 0);
const porAnio = (rows, y) => rows.filter((x) => x.y === y);
// Precio medio rural ponderado por volumen (valor / volumen) de los años dados.
const precio = (rows, ys) => { const s = rows.filter((x) => ys.includes(x.y)); const v = sum(s, 'vol'); return v ? sum(s, 'valor') / v : null; };

const out = { Guanajuato: [], Querétaro: [] };
for (const estado of Object.keys(out)) {
  const delEstado = filas.filter((x) => x.estado === estado);
  for (const cultivo of new Set(delEstado.map((x) => x.cultivo))) {
    const rows = delEstado.filter((x) => x.cultivo === cultivo);
    if (sum(rows, 'valor') < MIN_VALOR) continue;
    const a24 = porAnio(rows, 2024);
    const p0 = precio(rows, [2018, 2019]);
    const p1 = precio(rows, [2023, 2024]);
    const sem24 = sum(a24, 'sem');
    const mun = new Map();
    for (const x of a24) mun.set(x.mun, (mun.get(x.mun) ?? 0) + x.sem);
    const riego = sum(a24.filter((x) => x.modal === 'Riego'), 'sem');
    out[estado].push({
      cultivo,
      tipo: TIPO[cultivo],
      unidad: rows[0].unidad,
      anios_con_datos: new Set(rows.map((x) => x.y)).size,
      sembrada_ha_2024: r(sem24),
      cosechada_ha_2024: r(sum(a24, 'cos')),
      rendimiento_2024: sum(a24, 'cos') ? r(sum(a24, 'vol') / sum(a24, 'cos'), 2) : null,
      rendimiento_prom_2018_2024: sum(rows, 'cos') ? r(sum(rows, 'vol') / sum(rows, 'cos'), 2) : null,
      siniestrada_pct_2018_2024: sum(rows, 'sem') ? r((100 * sum(rows, 'sin')) / sum(rows, 'sem')) : null,
      precio_rural_2024: precio(rows, [2024]) && r(precio(rows, [2024]), 0),
      precio_rural_2018_2019: p0 && r(p0, 0),
      precio_rural_2023_2024: p1 && r(p1, 0),
      precio_cambio_pct: p0 && p1 ? r((100 * (p1 - p0)) / p0, 0) : null,
      valor_millones_2024: r(sum(a24, 'valor') / 1e6),
      valor_millones_total_2018_2024: r(sum(rows, 'valor') / 1e6),
      riego_pct_2024: sem24 ? r((100 * riego) / sem24, 0) : null,
      municipios_2024: [...mun].sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, s]) => s > 0).map(([nombre, s]) => ({ nombre, pct_sembrada: r((100 * s) / sem24, 0) })),
    });
  }
  out[estado].sort((a, b) => b.valor_millones_total_2018_2024 - a.valor_millones_total_2018_2024);
}

writeFileSync(OUT, JSON.stringify({
  fuente: 'SIAP, Cierre de la producción agrícola por municipio (datos abiertos), ciclo Perennes',
  anios: [YEARS[0], YEARS.at(-1)],
  nota: 'Precios en pesos por unidad (tonelada salvo que diga otra); valor en millones de pesos corrientes. Ordenado por valor de la producción 2018-2024.',
  estados: out,
}, null, 1));
console.log(`${OUT.pathname}: ${Object.entries(out).map(([e, l]) => `${e} ${l.length}`).join(', ')}`);

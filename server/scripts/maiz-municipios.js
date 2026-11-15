// Resume el maíz grano (Primavera-Verano) por municipio de Guanajuato y Querétaro desde los CSV crudos del SIAP.
// Uso: node scripts/maiz-municipios.js [carpeta_con_2018.csv..2024.csv]   -> escribe data/maiz_municipios.json
import { readFileSync, writeFileSync } from 'node:fs';

const dir = process.argv[2] ?? new URL('../data/siap_raw/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const acc = new Map();
for (let y = 2018; y <= 2024; y++) {
  const [head, ...lines] = readFileSync(`${dir}/${y}.csv`, 'latin1').split(/\r?\n/);
  const col = Object.fromEntries(head.split(',').map((h, i) => [h, i]));
  for (const l of lines) {
    const c = l.split(',');
    if (!l || !['Guanajuato', 'Querétaro'].includes(c[col.Nomestado]) || c[col.Nomcultivo] !== 'Maíz grano') continue;
    if (!c[col.Nomcicloproductivo].startsWith('Primavera')) continue;
    const estado = c[col.Nomestado];
    const key = `${estado}|${c[col.Nommunicipio]}|${c[col.Nommodalidad]}|${y}`;
    const a = acc.get(key) ?? { sem: 0, vol: 0, cos: 0 };
    a.sem += +c[col.Sembrada]; a.cos += +c[col.Cosechada]; a.vol += +c[col.Volumenproduccion];
    acc.set(key, a);
  }
}
const munis = {};
for (const [k, a] of acc) {
  const [estado, nombre, mod, y] = k.split('|');
  const id = `${estado}|${nombre}`;
  ((munis[id] ??= { estado, municipio: nombre, temporal: [], riego: [] })[mod === 'Riego' ? 'riego' : 'temporal']).push({ anio: +y, sembrada_ha: Math.round(a.sem), rend_t_ha: a.cos > 0 ? Math.round((100 * a.vol) / a.cos) / 100 : null });
}
writeFileSync(new URL('../data/maiz_municipios.json', import.meta.url), JSON.stringify({ fuente: 'SIAP, cierre de la producción agrícola por municipio, maíz grano, Primavera-Verano, 2018-2024', municipios: Object.values(munis) }));
console.log(Object.keys(munis).length, 'municipios');

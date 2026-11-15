// Downloads the official boundaries of Guanajuato and Querétaro (INEGI, Marco Geoestadístico) into
// server/data/estados_bajio.json, used by lib/state.js to tell whether a plot is in the Bajío.
// Run with: node scripts/fetch-states.js
import { writeFile } from 'node:fs/promises';
import { fetchJson } from '../lib/fetchJson.js';

const STATES = [
  { cve: '11', nombre: 'Guanajuato' },
  { cve: '22', nombre: 'Querétaro' },
];
const url = (cve) => `https://gaia.inegi.org.mx/wscatgeo/v2/geo/mgee/${cve}`;
// 4 decimals is about 11 m: plenty to tell two states apart, and the file stays small.
const round = (v) => Math.round(v * 1e4) / 1e4;

const estados = [];
let fuente = null;
for (const { cve, nombre } of STATES) {
  const json = await fetchJson(url(cve), { timeoutMs: 60000 });
  const geometry = json.features?.[0]?.geometry;
  if (!['Polygon', 'MultiPolygon'].includes(geometry?.type)) throw new Error(`${nombre}: INEGI no devolvió un polígono`);
  fuente = json.metadatos?.Fuente_informacion_vectorial ?? fuente;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const poligonos = polygons.map((rings) =>
    rings.map((ring) =>
      ring.map(([lon, lat]) => [round(lon), round(lat)]).filter((p, i, all) => i === 0 || p[0] !== all[i - 1][0] || p[1] !== all[i - 1][1])
    )
  );
  estados.push({ nombre, cve_ent: cve, poligonos });
  console.log(`OK   ${nombre}: ${poligonos.flat().reduce((n, ring) => n + ring.length, 0)} puntos`);
}

const out = { fuente: `${fuente} (${url('{cve_ent}')})`, coordenadas: '[lon, lat], 4 decimales', estados };
await writeFile(new URL('../data/estados_bajio.json', import.meta.url), JSON.stringify(out) + '\n');

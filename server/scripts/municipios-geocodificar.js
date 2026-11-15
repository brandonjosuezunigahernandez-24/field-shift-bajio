// Genera server/data/municipios.json: coordenadas de los municipios con temporal PV en el SIAP.
// Fuente: Nominatim (OpenStreetMap), 1 peticion cada 1.2 s. Uso: node scripts/municipios-geocodificar.js [estado...]
import fs from 'node:fs';
import { readSiapRows, isTemporalPV } from '../lib/siapMunicipal.js';

const OUT = new URL('../data/municipios.json', import.meta.url);
const estados = process.argv.slice(2).length ? process.argv.slice(2) : ['Guanajuato', 'Querétaro'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { municipios: [] };
const done = new Map(prev.municipios.map((m) => [`${m.estado}|${m.id}`, m]));

const names = new Map();
for (const r of readSiapRows().filter(isTemporalPV)) {
  const est = r.Nomestado.normalize('NFC');
  if (estados.includes(est)) names.set(`${est}|${r.Idmunicipio}`, { estado: est, id: Number(r.Idmunicipio), nombre: r.Nommunicipio });
}

async function geocode(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mx&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'user-agent': 'field-shift-bajio-nasa-space-apps/1.0 (proyecto academico)' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return j[0] ? { lat: Math.round(Number(j[0].lat) * 100) / 100, lon: Math.round(Number(j[0].lon) * 100) / 100 } : null;
}

const fallos = [];
for (const [k, m] of names) {
  if (done.has(k)) continue;
  let p = null;
  for (const q of [`${m.nombre}, ${m.estado}, México`, `Municipio de ${m.nombre}, ${m.estado}, México`]) {
    try { p = await geocode(q); } catch (e) { console.warn(q, e.message); }
    await sleep(1200);
    if (p) break;
  }
  if (p) done.set(k, { ...m, ...p }); else fallos.push(k);
  console.log(k, p ?? 'FALLO');
}
const municipios = [...done.values()].sort((a, b) => a.estado.localeCompare(b.estado) || a.id - b.id);
fs.writeFileSync(OUT, JSON.stringify({ fuente: 'Nominatim (OpenStreetMap contributors), geocodificando "Municipio, Estado, México"; centro del municipio, redondeado a 2 decimales', fecha: new Date().toISOString().slice(0, 10), municipios, fallos }, null, 1));
console.log(`${municipios.length} municipios, ${fallos.length} fallos`, fallos);

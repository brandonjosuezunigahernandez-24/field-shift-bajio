// Baja (o lee de cache) el clima NASA POWER de cada municipio. Pausa 1.5 s entre llamadas a la red.
import fs from 'node:fs';
import { getClimate } from '../sources/nasaPower.js';

const { municipios } = JSON.parse(fs.readFileSync(new URL('../data/municipios.json', import.meta.url), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fallos = [];
for (const m of municipios) {
  try {
    const { origen } = await getClimate(m.lat, m.lon);
    if (origen === 'api') await sleep(1500);
  } catch (e) { fallos.push(`${m.estado} ${m.nombre}: ${e.message}`); await sleep(1500); }
}
console.log(`${municipios.length - fallos.length}/${municipios.length} ok`, fallos);

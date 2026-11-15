// Baja los CSV municipales del SIAP (datos abiertos agrícolas), valida que lleguen completos
// y deja un resumen chico de Guanajuato y Querétaro en server/data/siap_resumen.json.
// Uso: node scripts/siap-descargar.js [añoInicio] [añoFin]     (por defecto 2012 2024)
// Se puede correr varias veces: los años ya completos se saltan.
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';

const RAW_DIR = new URL('../data/siap_raw/', import.meta.url);
const OUT_FILE = new URL('../data/siap_resumen.json', import.meta.url);
const BASE = 'https://nube.agricultura.gob.mx/index.php?view=10AE434F-A2158368-A120BC5A-EDF4AFAA&ANIO=';
const START = Number(process.argv[2]) || 2012;
const END = Number(process.argv[3]) || 2024;
const MAX_TRIES = 20;
const STALL_MS = 90 * 1000;
const EXPECTED_COLUMNS = 24;

// Cultivos del proyecto (nombres tal como vienen en el SIAP).
const CROPS = {
  'Maíz grano': 'maiz', 'Sorgo grano': 'sorgo', Frijol: 'frijol', 'Trigo grano': 'trigo',
  'Cebada grano': 'cebada', 'Garbanzo grano': 'garbanzo', Brócoli: 'brocoli', 'Tomate rojo (jitomate)': 'jitomate',
  // Los demás cultivos de la pantalla "Probar cultivo" (solo informativos: el recomendador usa los 8 de arriba).
  // Amaranto y arroz no aparecen en el SIAP de Guanajuato ni Querétaro.
  'Avena forrajera en verde': 'avena', Girasol: 'girasol', Cacahuate: 'cacahuate', Calabaza: 'calabaza', Papa: 'papa',
  Cebolla: 'cebolla', 'Chile verde': 'chile', Fresa: 'fresa', 'Alfalfa verde': 'alfalfa', Agave: 'agave',
  Nopalitos: 'nopal', Aguacate: 'aguacate',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function downloadYear(year) {
  const file = new URL(`${year}.csv`, RAW_DIR);
  try {
    await stat(file);
    return file; // ya estaba completo
  } catch { /* hay que bajarlo */ }

  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const ctrl = new AbortController();
      let stall = setTimeout(() => ctrl.abort(), STALL_MS);
      const res = await fetch(BASE + year, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const expected = Number(res.headers.get('content-length'));
      const chunks = [];
      let got = 0;
      let nextLog = 0;
      // Se corta si pasan STALL_MS sin recibir bytes; el servidor del SIAP a veces se queda colgado.
      for await (const chunk of res.body) {
        chunks.push(chunk);
        got += chunk.length;
        clearTimeout(stall);
        stall = setTimeout(() => ctrl.abort(), STALL_MS);
        if (got >= nextLog) { console.log(`${year}: ${(got / 1e6).toFixed(1)} de ${(expected / 1e6).toFixed(1)} MB`); nextLog = got + 1e6; }
      }
      clearTimeout(stall);
      const buf = Buffer.concat(chunks);
      // El servidor a veces corta la descarga: solo se acepta si llegó todo.
      if (expected && buf.length !== expected) throw new Error(`incompleto: ${buf.length} de ${expected} bytes`);
      const states = new Set(buf.toString('latin1').split(/\r?\n/).slice(1).map((l) => l.split(',')[1]));
      if (states.size < 30) throw new Error(`solo ${states.size} estados`);
      const tmp = new URL(`${year}.csv.tmp`, RAW_DIR);
      await writeFile(tmp, buf);
      await rename(tmp, file);
      console.log(`${year}: ok (${(buf.length / 1e6).toFixed(1)} MB, intento ${attempt})`);
      return file;
    } catch (err) {
      console.warn(`${year}: intento ${attempt}/${MAX_TRIES} falló: ${err.message}`);
      await sleep(3000 * attempt);
    }
  }
  console.error(`${year}: NO se pudo bajar; vuelve a correr el script.`);
  return null;
}

export function summarize(csv, year, acc) {
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const c = line.split(',');
    if (c.length !== EXPECTED_COLUMNS) continue;
    const [, , estado, , , , , , , , ciclo, , modalidad, , , , cultivo, sembrada, cosechada, siniestrada, volumen, , precio] = c;
    const id = CROPS[cultivo];
    if (!id || !/^(Guanajuato|Quer)/.test(estado)) continue;
    const key = [estado.startsWith('Quer') ? 'Querétaro' : 'Guanajuato', id, ciclo, modalidad, year].join('|');
    const a = (acc[key] ??= { sembrada: 0, cosechada: 0, siniestrada: 0, volumen: 0, valor: 0 });
    a.sembrada += Number(sembrada);
    a.cosechada += Number(cosechada);
    a.siniestrada += Number(siniestrada);
    a.volumen += Number(volumen);
    a.valor += Number(volumen) * Number(precio);
  }
  return acc;
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  const acc = {};
  const missing = [];
  for (let year = END; year >= START; year--) {
    const file = await downloadYear(year);
    if (!file) { missing.push(year); continue; }
    summarize(await readFile(file, 'latin1'), year, acc);
    await writeSummary(acc, missing, year); // así ya hay datos aunque falten años
  }
  await writeSummary(acc, missing);
}

async function writeSummary(acc, missing) {
  const r2 = (n) => Math.round(n * 100) / 100;
  const filas = Object.entries(acc).map(([key, a]) => {
    const [estado, cultivo, ciclo, modalidad, anio] = key.split('|');
    return {
      estado, cultivo, ciclo, modalidad, anio: Number(anio),
      sembrada_ha: r2(a.sembrada), cosechada_ha: r2(a.cosechada), siniestrada_ha: r2(a.siniestrada),
      volumen_t: r2(a.volumen),
      rendimiento_t_ha: a.cosechada ? r2(a.volumen / a.cosechada) : null,
      precio_medio_rural: a.volumen ? Math.round(a.valor / a.volumen) : null,
    };
  }).sort((x, y) => x.estado.localeCompare(y.estado) || x.cultivo.localeCompare(y.cultivo) || x.anio - y.anio);
  await writeFile(OUT_FILE, JSON.stringify({
    fuente: 'SIAP, Cierre de la producción agrícola por municipio (datos abiertos), agregado por estado',
    unidades: 'sembrada/cosechada/siniestrada en hectáreas; volumen en toneladas; precio en pesos por tonelada',
    anios_faltantes: missing,
    anios_incluidos: [...new Set(filas.map((f) => f.anio))].sort(),
    filas,
  }, null, 1));
  console.log(`Resumen: ${filas.length} filas en server/data/siap_resumen.json. Años no bajados: ${missing.join(', ') || 'ninguno'}`);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) await main();

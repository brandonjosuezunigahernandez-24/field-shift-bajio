// Genera server/data/aptitud_cultivos.json con los rangos de clima de FAO EcoCrop de cada cultivo.
// La web de FAO (ecocrop.fao.org) respondió 503 al verificarla; se usa una copia pública del scrape de EcoCrop (GitHub: supersistence/EcoCrop-ScrapeR).
// Uso: node scripts/aptitud-generar.js [archivo.csv]   (sin argumento, lo baja de GitHub)
import { readFileSync, writeFileSync } from 'node:fs';

const COPIA = 'https://raw.githubusercontent.com/supersistence/EcoCrop-ScrapeR/HEAD/cropbasics_scrape.csv';
// id de EcoCrop por cultivo (cada uno se comprueba contra el nombre científico del CSV).
const CULTIVOS = [
  ['fresa', 'Fresa', 1112, 'Fragaria x ananassa'], ['aguacate', 'Aguacate', 1659, 'Persea americana'], ['uva', 'Uva', 2160, 'Vitis vinifera'],
  ['durazno', 'Durazno', 1796, 'Prunus persica'], ['guayaba', 'Guayaba', 1804, 'Psidium guajava'], ['tuna', 'Tuna y nopalitos', 8094, 'Opuntia ficus-indica'],
  ['limon', 'Limón', 714, 'Citrus limon'], ['naranja', 'Naranja', 720, 'Citrus sinensis'], ['manzana', 'Manzana', 1407, 'Malus domestica'],
  ['arandano', 'Arándano', 10704, 'Vaccinium corymbosum'], ['frambuesa', 'Frambuesa', 1877, 'Rubus idaeus'], ['nuez', 'Nuez', 2231, 'Carya illinoensis'],
  ['esparrago', 'Espárrago', 468, 'Asparagus officinalis'], ['jitomate', 'Jitomate', 1379, 'Lycopersicon esculentum'], ['chile', 'Chile', 618, 'Capsicum annuum'],
  ['cebolla', 'Cebolla', 364, 'Allium cepa'], ['papa', 'Papa', 1971, 'Solanum tuberosum'], ['brocoli', 'Brócoli', 556, 'Brassica oleracea var. italica'],
];

function csv(t) { // CSV con comillas y saltos de línea dentro de campos
  const rows = []; let cur = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { cur.push(f); f = ''; } else if (c === '\n') { cur.push(f.replace(/\r$/, '')); rows.push(cur); cur = []; f = ''; } else f += c;
  }
  return rows;
}
const texto = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : await (await fetch(COPIA)).text();
const [h, ...filas] = csv(texto);
const col = (r, n) => r[h.indexOf(n)];
const num = (v) => (v !== undefined && v !== '' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null);
const par = (r, a, b) => { const x = [num(col(r, a)), num(col(r, b))]; return x[0] !== null && x[1] !== null ? x : null; };

const out = {
  fuente: 'FAO EcoCrop (Ecocrop database, FAO). Copia pública del scrape: ' + COPIA,
  nota: 'Rangos de la planta en general (no de una variedad ni de México). La página de FAO respondió 503 al verificarla; los valores salen de la copia y cada cultivo trae el enlace a su ficha en FAO. temp_*: °C; lluvia_*: mm por ciclo de cultivo (EcoCrop); helada_mortal_reposo: °C que mata a la planta en reposo (null = EcoCrop no lo trae).',
  generado: new Date().toISOString().slice(0, 10),
  cultivos: {},
};
for (const [id, nombre, ecoId, especie] of CULTIVOS) {
  const r = filas.find((x) => x[0] === String(ecoId));
  if (!r || !col(r, 'species').startsWith(especie)) throw new Error(`EcoCrop ${ecoId} no es ${especie}`);
  const c = {
    nombre, especie_ecocrop: col(r, 'species'), ciclo_vida: col(r, 'Life.span'),
    temp_optima: par(r, 'temp_opt_min', 'Temp_Opt_Max'), temp_absoluta: par(r, 'Temp_Abs_Min', 'Temp_Abs_Max'),
    lluvia_optima_mm: par(r, 'Rain_Opt_Min', 'Rain_Opt_Max'), lluvia_absoluta_mm: par(r, 'Rain_Abs_Min', 'Rain_Abs_Max'),
    ph_optimo: par(r, 'pH_Opt_Min', 'pH_Opt_Max'), ph_absoluto: par(r, 'pH_Abs_Min', 'pH_Abs_Max'),
    helada_mortal_reposo: num(col(r, 'Killing.temp..during.rest')),
    ciclo_dias: num(col(r, 'cycle_min')) > 0 ? par(r, 'cycle_min', 'cycle_max') : null, // días del ciclo del cultivo (solo se usa en las anuales)
    url: col(r, 'datasheet_url').replace('http:', 'https:'),
  };
  c.verificado = !!(c.temp_optima && c.temp_absoluta && c.lluvia_absoluta_mm);
  out.cultivos[id] = c;
}
writeFileSync(new URL('../data/aptitud_cultivos.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(Object.entries(out.cultivos).map(([k, c]) => `${k} ${c.especie_ecocrop} verif=${c.verificado} helada=${c.helada_mortal_reposo}`).join('\n'));

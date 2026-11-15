import { loadRaw } from '../lib/loadRaw.js';
import { readFile, readdir } from 'node:fs/promises';
import { fetchJson } from '../lib/fetchJson.js';
import { CACHE_DIR } from '../lib/cache.js';

export const SOILGRIDS_SOURCE = 'soilgrids';
export const SOILGRIDS_CREDIT = 'SoilGrids 2.0, ISRIC World Soil Information (CC BY 4.0)';
// 3 decimals (~110 m): SoilGrids cells are 250 m, so 2 decimals (~1 km) could read a neighbor's soil.
export const SOILGRIDS_DECIMALS = 3;

// The first 6 feed the rule engine (0-30 cm). bdod (bulk density), cec (cation exchange capacity)
// and cfvo (coarse fragments, i.e. stones) are shown to the farmer with the layers down to 1 m.
const PROPERTIES = ['clay', 'sand', 'silt', 'phh2o', 'soc', 'nitrogen', 'bdod', 'cec', 'cfvo'];
const DEPTHS = ['0-5cm', '5-15cm', '15-30cm', '30-60cm', '60-100cm'];
const MAX_DEPTH_CM = 30;

// ligero: only what the rule engine uses (6 properties, 0-30 cm). SoilGrids answers it much faster when it is slow.
export function buildSoilGridsUrl(lat, lon, { ligero = false } = {}) {
  const params = new URLSearchParams();
  params.append('lat', String(lat));
  params.append('lon', String(lon));
  for (const property of ligero ? PROPERTIES.slice(0, 6) : PROPERTIES) params.append('property', property);
  for (const depth of ligero ? DEPTHS.slice(0, 3) : DEPTHS) params.append('depth', depth);
  params.append('value', 'mean');
  return `https://rest.isric.org/soilgrids/v2.0/properties/query?${params}`;
}

// Throws when the payload is not a usable SoilGrids response.
export function validateSoilGrids(raw) {
  if (!Array.isArray(raw?.properties?.layers)) {
    throw new Error('Unexpected SoilGrids response (missing properties.layers)');
  }
}

// A cache saved before the extra properties and depths were asked for: download it again
// (loadRaw keeps it if there is no internet).
export function soilGridsStaleReason(raw) {
  // A light answer (see getSoil) is kept as is: asking for the heavy one again would make the plot wait every time.
  if (raw?.ligero) return null;
  const layers = raw?.properties?.layers ?? [];
  const missing = PROPERTIES.filter((name) => !layers.some((l) => l.name === name));
  if (missing.length) return `le falta ${missing.join(', ')}`;
  const deepest = Math.max(...layers.flatMap((l) => (l.depths ?? []).map((d) => d.range?.bottom_depth ?? 0)));
  return deepest >= 100 ? null : 'le faltan las capas de 30 a 100 cm';
}

// Raw SoilGrids response -> { clay, sand, silt, phh2o, soc, nitrogen, ... }, each one
// { value, units } averaged over 0-30 cm (weighted by layer thickness), or null when
// SoilGrids has no data for the point (cities, water).
// Values are divided by unit_measure.d_factor to get conventional units (e.g. pH comes x10).
// Note: pH is averaged arithmetically across layers, which is good enough for a crop-fit check.
export function parseSoilGrids(raw) {
  validateSoilGrids(raw);
  const result = {};
  for (const layer of raw.properties.layers) {
    const factor = layer.unit_measure?.d_factor || 1;
    let weightedSum = 0;
    let thickness = 0;
    for (const depth of layer.depths ?? []) {
      const value = depth.values?.mean;
      const top = depth.range?.top_depth;
      const bottom = depth.range?.bottom_depth;
      if (typeof value !== 'number' || !(bottom > top) || bottom > MAX_DEPTH_CM) continue;
      weightedSum += (value / factor) * (bottom - top);
      thickness += bottom - top;
    }
    result[layer.name] =
      thickness > 0
        ? { value: weightedSum / thickness, units: layer.unit_measure?.target_units ?? null }
        : null;
  }
  return result;
}

const round1 = (entry) => (entry ? Math.round(entry.value * 10) / 10 : null);
const round2 = (entry) => (entry ? Math.round(entry.value * 100) / 100 : null);
const r1 = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : null);
const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : null);

// Raw SoilGrids response -> one entry per depth layer (0-5 ... 60-100 cm), in conventional units.
// Layers SoilGrids leaves empty (cities, water) are skipped.
export function parseSoilLayers(raw) {
  validateSoilGrids(raw);
  const byDepth = new Map();
  for (const layer of raw.properties.layers) {
    const factor = layer.unit_measure?.d_factor || 1;
    for (const depth of layer.depths ?? []) {
      const value = depth.values?.mean;
      const top = depth.range?.top_depth;
      const bottom = depth.range?.bottom_depth;
      if (typeof value !== 'number' || !(bottom > top)) continue;
      const key = `${top}-${bottom}`;
      if (!byDepth.has(key)) byDepth.set(key, { desde_cm: top, hasta_cm: bottom });
      byDepth.get(key)[layer.name] = value / factor;
    }
  }
  return [...byDepth.values()]
    .sort((a, b) => a.desde_cm - b.desde_cm)
    .map((d) => ({
      profundidad_cm: `${d.desde_cm}-${d.hasta_cm}`,
      desde_cm: d.desde_cm,
      hasta_cm: d.hasta_cm,
      ph: r1(d.phh2o),
      arcilla_pct: r1(d.clay),
      arena_pct: r1(d.sand),
      limo_pct: r1(d.silt),
      carbono_organico_g_kg: r1(d.soc),
      nitrogeno_g_kg: r2(d.nitrogen),
      densidad_aparente_g_cm3: r2(d.bdod), // kg/dm3 is the same as g/cm3
      cic_cmol_kg: r1(d.cec),
      piedras_pct: r1(d.cfvo), // cm3 of stones per 100 cm3 of soil
    }));
}

// Parsed soil -> the summary served by GET /api/suelo (Spanish keys, see docs/api-contract.md).
// layers (optional, parseSoilLayers): the profile down to 1 m, for the 3D block and the soil card.
export function summarizeSoil(soil, layers = null) {
  const summary = {
    profundidad_cm: '0-30',
    ph: round1(soil.phh2o),
    arcilla_pct: round1(soil.clay),
    arena_pct: round1(soil.sand),
    limo_pct: round1(soil.silt),
    carbono_organico_g_kg: round1(soil.soc),
    nitrogeno_g_kg: round2(soil.nitrogen),
    densidad_aparente_g_cm3: round2(soil.bdod),
    cic_cmol_kg: round1(soil.cec),
    piedras_pct: round1(soil.cfvo),
  };
  if (layers) summary.capas = layers;
  // True when SoilGrids answered but has no values for this point (cities, water).
  summary.sin_datos = [summary.ph, summary.arcilla_pct, summary.arena_pct, summary.limo_pct].every(
    (v) => v === null
  );
  return summary;
}

// When SoilGrids does not answer: the closest soil already saved (cache or fixture) within MAX_CERCA_M, so a plot
// next to a known point still has its soil. The route says how far it is (origen 'cercano').
// 250 m = one SoilGrids cell: farther than that it would be another soil (a plot 760 m away never borrows it).
const MAX_CERCA_M = 250;
const FIXTURE_DIR = new URL('../fixtures/', import.meta.url);
async function nearestSaved(lat, lon) {
  let best = null;
  for (const dir of [CACHE_DIR, FIXTURE_DIR]) {
    let names = [];
    try { names = await readdir(dir); } catch { continue; }
    for (const name of names) {
      const m = name.match(/^soilgrids_(-?\d+\.\d+)_(-?\d+\.\d+)\.json$/);
      if (!m) continue;
      const [la, lo] = [Number(m[1]), Number(m[2])];
      const d = Math.hypot((la - lat) * 111320, (lo - lon) * 111320 * Math.cos((lat * Math.PI) / 180));
      if (d <= MAX_CERCA_M && (!best || d < best.m)) best = { lat: la, lon: lo, m: Math.round(d), url: new URL(name, dir) };
    }
  }
  if (!best) return null;
  try {
    const raw = JSON.parse(await readFile(best.url, 'utf8'));
    validateSoilGrids(raw);
    return { raw, cercano: { lat: best.lat, lon: best.lon, m: best.m } };
  } catch { return null; }
}

// Parsed soil for one point, from cache, API or fixture (or the closest saved one, see nearestSaved).
export async function getSoil(lat, lon) {
  let loaded;
  try {
    loaded = await loadRawSoil(lat, lon);
  } catch (err) {
    const near = await nearestSaved(lat, lon);
    if (!near) throw err;
    return { soil: parseSoilGrids(near.raw), layers: parseSoilLayers(near.raw), origen: 'cercano', cercano: near.cercano };
  }
  const { raw, origen } = loaded;
  return { soil: parseSoilGrids(raw), layers: parseSoilLayers(raw), origen };
}

function loadRawSoil(lat, lon) {
  return loadRaw({
    source: SOILGRIDS_SOURCE,
    label: 'los datos de suelo (SoilGrids)',
    lat,
    lon,
    decimals: SOILGRIDS_DECIMALS,
    // Full query first (down to 1 m); if SoilGrids is slow, the light one (0-30 cm) so a new plot still gets its soil.
    fetcher: async (la, lo) => {
      try {
        return await fetchJson(buildSoilGridsUrl(la, lo), { timeoutMs: 15000 });
      } catch (err) {
        if (err.name !== 'TimeoutError') throw err;
        console.warn(`[soilgrids] la consulta completa tardó; pido la ligera (0-30 cm) para ${la}, ${lo}`);
        return { ...(await fetchJson(buildSoilGridsUrl(la, lo, { ligero: true }), { timeoutMs: 30000 })), ligero: true };
      }
    },
    pauseOnTimeoutMs: 3 * 60 * 1000, // the plan and the screens work without soil: do not make every plot wait
    validate: validateSoilGrids,
    isStale: soilGridsStaleReason,
  });
}

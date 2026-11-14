import { loadRaw } from '../lib/loadRaw.js';

export const SOILGRIDS_SOURCE = 'soilgrids';
export const SOILGRIDS_CREDIT = 'SoilGrids 2.0, ISRIC World Soil Information (CC BY 4.0)';

const PROPERTIES = ['clay', 'sand', 'silt', 'phh2o', 'soc', 'nitrogen'];
const DEPTHS = ['0-5cm', '5-15cm', '15-30cm'];
const MAX_DEPTH_CM = 30;

export function buildSoilGridsUrl(lat, lon) {
  const params = new URLSearchParams();
  params.append('lat', String(lat));
  params.append('lon', String(lon));
  for (const property of PROPERTIES) params.append('property', property);
  for (const depth of DEPTHS) params.append('depth', depth);
  params.append('value', 'mean');
  return `https://rest.isric.org/soilgrids/v2.0/properties/query?${params}`;
}

// Throws when the payload is not a usable SoilGrids response.
export function validateSoilGrids(raw) {
  if (!Array.isArray(raw?.properties?.layers)) {
    throw new Error('Unexpected SoilGrids response (missing properties.layers)');
  }
}

// Raw SoilGrids response -> { clay, sand, silt, phh2o, soc, nitrogen }, each one
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

// Parsed soil -> the summary served by GET /api/suelo (Spanish keys, see docs/api-contract.md).
export function summarizeSoil(soil) {
  const summary = {
    profundidad_cm: '0-30',
    ph: round1(soil.phh2o),
    arcilla_pct: round1(soil.clay),
    arena_pct: round1(soil.sand),
    limo_pct: round1(soil.silt),
    carbono_organico_g_kg: round1(soil.soc),
    nitrogeno_g_kg: round2(soil.nitrogen),
  };
  // True when SoilGrids answered but has no values for this point (cities, water).
  summary.sin_datos = [summary.ph, summary.arcilla_pct, summary.arena_pct, summary.limo_pct].every(
    (v) => v === null
  );
  return summary;
}

// Parsed soil for one point, from cache, API or fixture.
export async function getSoil(lat, lon) {
  const { raw, origen } = await loadRaw({
    source: SOILGRIDS_SOURCE,
    label: 'los datos de suelo (SoilGrids)',
    lat,
    lon,
    url: buildSoilGridsUrl(lat, lon),
    timeoutMs: 15000,
    validate: validateSoilGrids,
  });
  return { soil: parseSoilGrids(raw), origen };
}

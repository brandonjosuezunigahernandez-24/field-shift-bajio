import { loadRaw } from '../lib/loadRaw.js';
import { SOILGRIDS_DECIMALS } from './soilGrids.js';

// Soil type of the point: the World Reference Base (WRB) reference soil group that SoilGrids
// predicts, with its probability. A model's prediction from 250 m maps, not a field survey.
export const SOILCLASS_SOURCE = 'soilclass';
export const SOILCLASS_CREDIT =
  'SoilGrids 2.0 (ISRIC), clasificación WRB; nombres y descripciones generales según la Base Referencial Mundial del Recurso Suelo (IUSS/FAO)';

export function buildSoilClassUrl(lat, lon) {
  return `https://rest.isric.org/soilgrids/v2.0/classification/query?lat=${lat}&lon=${lon}&number_classes=3`;
}

export function validateSoilClass(raw) {
  if (!raw || !('wrb_class_name' in raw)) throw new Error('Unexpected SoilGrids classification response');
}

// Spanish names of the 32 WRB reference soil groups, and a plain description of the ones found
// in the Bajío and nearby (general WRB definitions, not measured at the parcel).
const WRB = {
  Acrisols: ['Acrisol'], Albeluvisols: ['Albeluvisol'], Alisols: ['Alisol'], Anthrosols: ['Antrosol'],
  Arenosols: ['Arenosol', 'Suelo arenoso: deja pasar el agua y guarda pocos nutrientes.'],
  Andosols: ['Andosol', 'Suelo de ceniza volcánica, suelto y ligero; guarda mucha agua, pero retiene el fósforo.'],
  Calcisols: ['Calcisol', 'Suelo con mucha cal (carbonatos); el pH alto puede limitar algunos nutrientes.'],
  Cambisols: ['Cambisol', 'Suelo joven, de fertilidad media; responde bien al abono y al buen manejo.'],
  Chernozems: ['Chernozem', 'Suelo negro muy rico en materia orgánica; de los más fértiles.'],
  Cryosols: ['Criosol'],
  Durisols: ['Durisol', 'Suelo con una capa endurecida (tepetate) que frena las raíces y el agua.'],
  Ferralsols: ['Ferralsol'],
  Fluvisols: ['Fluvisol', 'Suelo de vega, hecho de lo que acarrean los ríos; suele ser fértil.'],
  Gleysols: ['Gleysol', 'Suelo que pasa mucho tiempo saturado de agua.'],
  Gypsisols: ['Gipsisol', 'Suelo con yeso; algunos cultivos no lo aguantan.'],
  Histosols: ['Histosol'],
  Kastanozems: ['Kastanozem', 'Suelo de zonas semisecas, café oscuro y fértil; puede tener cal más abajo.'],
  Leptosols: ['Leptosol', 'Suelo delgado sobre roca o tepetate: poco espacio para las raíces y poca agua guardada.'],
  Lixisols: ['Lixisol'],
  Luvisols: ['Luvisol', 'Suelo con arcilla acumulada más abajo; fértil, pero la capa de arriba se erosiona en pendiente.'],
  Nitisols: ['Nitisol'],
  Phaeozems: ['Feozem', 'Suelo oscuro con mucha materia orgánica y sin exceso de sales; de los mejores para cultivar.'],
  Planosols: ['Planosol', 'Suelo con una capa muy arcillosa abajo que detiene el agua; se encharca en lluvias.'],
  Plinthosols: ['Plintosol'], Podzols: ['Podzol'],
  Regosols: ['Regosol', 'Suelo poco desarrollado y suelto, con poca materia orgánica; necesita abono y cuidado contra la erosión.'],
  Solonchaks: ['Solonchak', 'Suelo con sales; muchos cultivos no lo aguantan sin lavarlo.'],
  Solonetz: ['Solonetz', 'Suelo con mucho sodio; se endurece en secas y se encharca en lluvias.'],
  Stagnosols: ['Estagnosol'], Technosols: ['Tecnosol'], Umbrisols: ['Umbrisol'],
  Vertisols: ['Vertisol', 'Suelo con mucha arcilla que se hincha con el agua y se agrieta en secas. Guarda bien la humedad, pero es pesado de trabajar y se encharca.'],
};

const nameOf = (wrb) => WRB[wrb]?.[0] ?? wrb;

// Raw classification -> { wrb, nombre, probabilidad_pct, descripcion, alternativas }, or null
// when SoilGrids has no soil there (cities, water).
export function summarizeSoilClass(raw) {
  validateSoilClass(raw);
  if (!raw.wrb_class_name) return null;
  const [, ...others] = raw.wrb_class_probability ?? [];
  const top = (raw.wrb_class_probability ?? []).find(([name]) => name === raw.wrb_class_name);
  return {
    wrb: raw.wrb_class_name,
    nombre: nameOf(raw.wrb_class_name),
    probabilidad_pct: top ? top[1] : null,
    descripcion: WRB[raw.wrb_class_name]?.[1] ?? null,
    alternativas: others.map(([name, pct]) => ({ wrb: name, nombre: nameOf(name), probabilidad_pct: pct })),
  };
}

export async function getSoilClass(lat, lon) {
  const { raw, origen } = await loadRaw({
    source: SOILCLASS_SOURCE,
    label: 'el tipo de suelo (SoilGrids)',
    lat,
    lon,
    decimals: SOILGRIDS_DECIMALS,
    buildUrl: buildSoilClassUrl,
    timeoutMs: 15000,
    pauseOnTimeoutMs: 3 * 60 * 1000, // the plan and the screens work without soil: do not make every plot wait
    validate: validateSoilClass,
  });
  return { tipo: summarizeSoilClass(raw), origen };
}

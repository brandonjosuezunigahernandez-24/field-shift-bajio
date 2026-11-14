// A farm is a list of drawn parcels, each with its own crop. Pure functions, tested with node --test.
// parcela: { id, contorno: [[lon, lat], ...], hectareas, cultivo }
import { CROP_NAMES, DEFAULT_CROP } from '../crops.js';
import { areaHectares, polygonCenter, toMeters } from './polygon.js';

// One color per parcel, the same on the map and in the 3D view. Picked to stand out on satellite
// imagery (no greens, which disappear over fields).
export const PARCEL_COLORS = ['#f2c94c', '#56ccf2', '#f2994a', '#bb6bd9', '#eb5757', '#ffffff'];
export const parcelColor = (id) => PARCEL_COLORS[(id - 1) % PARCEL_COLORS.length];

export function createParcel(id, contorno, cultivo = DEFAULT_CROP) {
  return { id, contorno, hectareas: Math.round(areaHectares(contorno) * 10) / 10, cultivo };
}

export const nextParcelId = (parcelas) => parcelas.reduce((max, p) => Math.max(max, p.id), 0) + 1;

export const allCorners = (parcelas) => parcelas.flatMap((p) => p.contorno);

const fmtHa = (ha) => ha.toLocaleString('es-MX', { maximumFractionDigits: ha < 10 ? 1 : 0 });

// The point sent to the API for the whole farm: average of every corner (the server rounds to
// ~1 km anyway), with a name for the page.
export function farmPoint(parcelas) {
  const { lat, lon } = polygonCenter(allCorners(parcelas));
  const total = parcelas.reduce((sum, p) => sum + p.hectareas, 0);
  const nombre =
    parcelas.length === 1
      ? `Tu parcela (${fmtHa(total)} ha)`
      : `Tus ${parcelas.length} parcelas (${fmtHa(total)} ha en total)`;
  return { nombre, lat, lon };
}

// "Parcela 2 · Trigo · 3.5 ha"
export const parcelLabel = (parcela, index) =>
  `Parcela ${index + 1} · ${CROP_NAMES[parcela.cultivo]} · ${fmtHa(parcela.hectareas)} ha`;

// Finished parcels for the map, colored by parcel.
export function parcelsGeoJSON(parcelas) {
  return {
    type: 'FeatureCollection',
    features: parcelas.map((p) => ({
      type: 'Feature',
      properties: { id: p.id, color: parcelColor(p.id) },
      geometry: { type: 'Polygon', coordinates: [[...p.contorno, p.contorno[0]]] },
    })),
  };
}

// --- 3D sections: each parcel in its own diorama, or all of them together ---

export const ALL_SECTIONS = 'todas';
const BLOCK_HALF_M = 500; // the 3D block is 1 km per side
// The server centers /api/terreno to 3 decimals (~110 m); the diorama uses the same center.
const round3 = (v) => Math.round(v * 1000) / 1000 + 0;

// Parcels shown in a section: one parcel (by id) or all of them.
export function sectionParcels(parcelas, seccion) {
  if (seccion === ALL_SECTIONS) return parcelas;
  const one = parcelas.find((p) => p.id === seccion);
  return one ? [one] : parcelas;
}

// Center of a section's 1 km block, rounded like the server rounds /api/terreno.
export function sectionCenter(members) {
  const { lat, lon } = polygonCenter(allCorners(members));
  return { lat: round3(lat), lon: round3(lon) };
}

// Do all these parcels fit in one 1 km block around their common center?
export function fitsOneBlock(members) {
  if (!members.length) return true;
  const { lat, lon } = sectionCenter(members);
  return toMeters(allCorners(members), lat, lon).every(
    ([east, north]) => Math.abs(east) <= BLOCK_HALF_M && Math.abs(north) <= BLOCK_HALF_M
  );
}

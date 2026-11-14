// A farm is a list of drawn parcels, each with its own crop. Pure functions, tested with node --test.
// parcela: { id, contorno: [[lon, lat], ...], hectareas, cultivo }
import { CROP_NAMES, DEFAULT_CROP } from '../crops.js';
import { areaHectares, pointInPolygon, polygonCenter, polygonsOverlap, toMeters } from './polygon.js';

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
  const total = farmSummary(parcelas).totalHa; // overlaps counted once, like "Tu terreno"
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

// --- Raised parcels on the satellite map (MapLibre fill-extrusion) ---

const SOIL_FALLBACK = '#6b4f3a'; // brown when SoilGrids has no data
const CROP_LAYER_M = 3; // the crop "carpet" on top of the soil block
const STEP_M = 1.5; // each newer parcel stands this much higher, so overlaps show the newest

// Block height in meters: grows with the parcel so it always shows, but never hides the map.
// ~6 m for a 1 ha plot, ~12 m for 4 ha, capped at 40 m.
export function raiseHeight(hectareas) {
  return Math.round(Math.min(40, Math.max(6, Math.sqrt(hectareas * 10000) * 0.06)));
}

const toHex = (rgb) =>
  `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`;

// GeoJSON for the raised parcels. `rise` (id -> 0..1) animates each block coming up out of the
// ground; `soilRgb` is the side color ([r, g, b] 0..1 from parcelState.soilColors, or null).
// All parcels share the height of the biggest one, and each newer one stands STEP_M higher: if two
// overlap, the newest is the one seen on top (the same rule as the 3D diorama).
// With the 3D relief on, MapLibre stands each block on the ground height at the parcel's center,
// so a parcel on lower ground would sink under its neighbor. `groundAt` (id -> meters, as
// map.queryTerrainElevation gives them) evens that out: every top ends at the same level.
export function raisedParcelsGeoJSON(parcelas, rise = new Map(), soilRgb = null, cropColors = {}, groundAt = null) {
  const tierra = soilRgb ? toHex(soilRgb) : SOIL_FALLBACK;
  const base = Math.max(0, ...parcelas.map((p) => raiseHeight(p.hectareas)));
  const grounds = parcelas.map((p) => groundAt?.get(p.id));
  const even = grounds.every((g) => Number.isFinite(g));
  const top = even ? Math.max(...grounds) : 0;
  return {
    type: 'FeatureCollection',
    features: parcelas.map((p, i) => {
      const k = rise.get(p.id) ?? 1;
      const h = base + i * STEP_M + (even ? top - grounds[i] : 0);
      return {
        type: 'Feature',
        properties: {
          id: p.id,
          tierra,
          cultivo: cropColors[p.cultivo] ?? '#5f9e3a',
          suelo_m: h * k,
          tope_m: (h + CROP_LAYER_M) * k,
        },
        geometry: { type: 'Polygon', coordinates: [[...p.contorno, p.contorno[0]]] },
      };
    }),
  };
}

// --- How much land: total and per crop, without counting overlaps twice ---

// A soccer field (105 x 68 m) is ~0.714 ha: an easy way to picture a hectare count.
export const SOCCER_FIELD_HA = 0.714;

// { totalHa, byCrop: [{ cultivo, ha }], overlapHa, estimated }.
// No overlaps: exact areas. With overlaps (a section drawn inside another parcel): a fine grid of
// sample points, where each point belongs to the NEWEST parcel that contains it (the same rule as
// the map and the 3D view). ~40 000 points: under 1 % error, a few ms.
export function farmSummary(parcelas, { samples = 40000 } = {}) {
  if (!parcelas.length) return { totalHa: 0, byCrop: [], overlapHa: 0, estimated: false };
  const exactSum = parcelas.reduce((sum, p) => sum + areaHectares(p.contorno), 0);
  const overlaps = parcelas.some((p, i) => parcelas.slice(i + 1).some((q) => polygonsOverlap(p.contorno, q.contorno)));
  const byCrop = new Map();
  let totalHa;

  if (!overlaps) {
    for (const p of parcelas) byCrop.set(p.cultivo, (byCrop.get(p.cultivo) ?? 0) + areaHectares(p.contorno));
    totalHa = exactSum;
  } else {
    const { lat, lon } = polygonCenter(allCorners(parcelas));
    const shapes = parcelas.map((p) => toMeters(p.contorno, lat, lon));
    const xs = shapes.flat().map((p) => p[0]);
    const ys = shapes.flat().map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const step = Math.max(Math.sqrt(((x1 - x0) * (y1 - y0)) / samples), 0.25);
    const cellHa = (step * step) / 10000;
    totalHa = 0;
    for (let y = y0 + step / 2; y < y1; y += step) {
      for (let x = x0 + step / 2; x < x1; x += step) {
        for (let i = shapes.length - 1; i >= 0; i--) {
          if (pointInPolygon([x, y], shapes[i])) {
            totalHa += cellHa;
            byCrop.set(parcelas[i].cultivo, (byCrop.get(parcelas[i].cultivo) ?? 0) + cellHa);
            break;
          }
        }
      }
    }
  }
  return {
    totalHa,
    byCrop: [...byCrop.entries()].map(([cultivo, ha]) => ({ cultivo, ha })).sort((a, b) => b.ha - a.ha),
    overlapHa: Math.max(0, exactSum - totalHa),
    estimated: overlaps,
  };
}

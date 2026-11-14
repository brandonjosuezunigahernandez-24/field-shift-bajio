import { fetchBuffer } from '../lib/fetchJson.js';
import { loadRaw } from '../lib/loadRaw.js';
import { decodePng } from '../lib/png.js';

// Elevation around the plot, for the 3D view.
// Source: AWS Terrain Tiles (Mapzen "terrarium" encoding). Over Mexico the heights come from
// NASA SRTM (about 30 m), so a 1 km square has roughly 33 real samples per side; the 65 x 65
// grid is a smooth interpolation of those, good for a diorama, not for surveying.
export const TERRAIN_SOURCE = 'terrain';
export const TERRAIN_CREDIT =
  'AWS Terrain Tiles (Mapzen, Registry of Open Data on AWS); en México las alturas vienen de NASA SRTM';

export const TERRAIN_ZOOM = 14; // ~2.2 km per tile at the Bajío latitude
export const GRID_SIZE = 65; // vertices per side (64 x 64 squares)
export const SIDE_M = 1000; // square side in meters, centered on the plot
// The block is centered to ~110 m (3 decimals), not ~1.1 km like climate and soil: with 2 decimals
// a parcel could sit up to ~550 m off center and fall off its own 1 km diorama.
export const TERRAIN_DECIMALS = 3;

const TILE_PX = 256;
const METERS_PER_DEG_LAT = 111320;

export function terrariumTileUrl(z, x, y) {
  return `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
}

// Web Mercator: lat/lon -> fractional tile coordinates at zoom z.
export function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  };
}

// Terrarium encoding: height (m) = R * 256 + G + B / 256 - 32768
export function decodeTerrarium(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

// The 2 x 2 tiles that always contain a square of SIDE_M around the point
// (half the side, 500 m, is less than half a tile, ~1.1 km).
export function tilesAround(lat, lon, z = TERRAIN_ZOOM) {
  const { x, y } = lonLatToTile(lon, lat, z);
  const x0 = Math.floor(x - 0.5);
  const y0 = Math.floor(y - 0.5);
  return { x0, y0, z };
}

// Stitched heights of the 2 x 2 tiles -> { width, height, at(px, py) } in pixel space,
// with px/py measured from the top-left corner of tile (x0, y0).
export function stitchTiles(images) {
  const width = TILE_PX * 2;
  const heights = new Float32Array(width * width);
  for (const { dx, dy, image } of images) {
    if (image.width !== TILE_PX || image.height !== TILE_PX || image.channels < 3) {
      throw new Error(`Unexpected elevation tile ${image.width}x${image.height}x${image.channels}`);
    }
    for (let py = 0; py < TILE_PX; py++) {
      for (let px = 0; px < TILE_PX; px++) {
        const i = (py * TILE_PX + px) * image.channels;
        const h = decodeTerrarium(image.data[i], image.data[i + 1], image.data[i + 2]);
        heights[(dy * TILE_PX + py) * width + dx * TILE_PX + px] = h;
      }
    }
  }
  return { width, heights };
}

function bilinear({ width, heights }, px, py) {
  const cx = Math.min(Math.max(px - 0.5, 0), width - 1.001);
  const cy = Math.min(Math.max(py - 0.5, 0), width - 1.001);
  const ix = Math.floor(cx);
  const iy = Math.floor(cy);
  const fx = cx - ix;
  const fy = cy - iy;
  const h = (x, y) => heights[y * width + x];
  const top = h(ix, iy) * (1 - fx) + h(ix + 1, iy) * fx;
  const bottom = h(ix, iy + 1) * (1 - fx) + h(ix + 1, iy + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

// Samples a GRID_SIZE x GRID_SIZE grid over a SIDE_M square centered on the point.
// Row 0 is the north edge, column 0 the west edge. Heights in meters, 1 decimal.
export function sampleGrid(stitched, { lat, lon, x0, y0, z }, { size = GRID_SIZE, sideM = SIDE_M } = {}) {
  const half = sideM / 2;
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  const alturas = new Array(size * size);
  for (let row = 0; row < size; row++) {
    const north = half - (row / (size - 1)) * sideM;
    for (let col = 0; col < size; col++) {
      const east = -half + (col / (size - 1)) * sideM;
      const tile = lonLatToTile(lon + east / metersPerDegLon, lat + north / METERS_PER_DEG_LAT, z);
      const h = bilinear(stitched, (tile.x - x0) * TILE_PX, (tile.y - y0) * TILE_PX);
      alturas[row * size + col] = Math.round(h * 10) / 10;
    }
  }
  return alturas;
}

export function validateTerrain(raw) {
  const size = raw?.tam;
  if (!Number.isInteger(size) || !Array.isArray(raw.alturas) || raw.alturas.length !== size * size) {
    throw new Error('Unexpected terrain grid');
  }
  if (!raw.alturas.every(Number.isFinite)) throw new Error('Terrain grid with missing heights');
}

// Downloads the 4 tiles and builds the grid that gets cached.
export async function fetchTerrainGrid(lat, lon, { timeoutMs = 15000 } = {}) {
  const { x0, y0, z } = tilesAround(lat, lon);
  const offsets = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const images = await Promise.all(
    offsets.map(async ([dx, dy]) => ({
      dx,
      dy,
      image: decodePng(await fetchBuffer(terrariumTileUrl(z, x0 + dx, y0 + dy), { timeoutMs })),
    }))
  );
  const alturas = sampleGrid(stitchTiles(images), { lat, lon, x0, y0, z });
  return { zoom: z, tam: GRID_SIZE, lado_m: SIDE_M, alturas };
}

// Grid -> the summary served by GET /api/terreno (see docs/api-contract.md).
export function summarizeTerrain(raw) {
  const { tam, lado_m, alturas } = raw;
  const min = Math.min(...alturas);
  const max = Math.max(...alturas);
  const center = alturas[Math.floor(tam / 2) * tam + Math.floor(tam / 2)];
  return {
    tam,
    lado_m,
    altura_centro_m: Math.round(center),
    altura_min_m: Math.round(min * 10) / 10,
    altura_max_m: Math.round(max * 10) / 10,
    desnivel_m: Math.round((max - min) * 10) / 10,
    alturas,
  };
}

export async function getTerrain(lat, lon) {
  const { raw, origen } = await loadRaw({
    source: TERRAIN_SOURCE,
    label: 'el relieve del terreno',
    lat,
    lon,
    fetcher: () => fetchTerrainGrid(lat, lon),
    validate: validateTerrain,
    decimals: TERRAIN_DECIMALS,
  });
  return { terrain: raw, origen };
}

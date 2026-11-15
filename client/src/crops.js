// Crops the farmer can place on a parcel. Each id has a 3D model (client/public/models/<id>.glb,
// made by assets/blender/build_models.py). The first 7 are the ones of the rule engine
// (CLAUDE.md, server/data/cultivos.json); the other 15 are, for now, only for the map and 3D view.
export const CROP_IDS = [
  'maiz', 'sorgo', 'trigo', 'cebada', 'frijol', 'garbanzo', 'brocoli',
  'avena', 'amaranto', 'girasol', 'cacahuate', 'calabaza', 'papa', 'cebolla', 'jitomate',
  'chile', 'fresa', 'arroz', 'alfalfa', 'agave', 'nopal', 'aguacate',
];

export const CROP_NAMES = {
  maiz: 'Maíz',
  sorgo: 'Sorgo',
  trigo: 'Trigo',
  cebada: 'Cebada',
  frijol: 'Frijol',
  garbanzo: 'Garbanzo',
  brocoli: 'Brócoli',
  avena: 'Avena',
  amaranto: 'Amaranto',
  girasol: 'Girasol',
  cacahuate: 'Cacahuate',
  calabaza: 'Calabaza',
  papa: 'Papa',
  cebolla: 'Cebolla',
  jitomate: 'Jitomate',
  chile: 'Chile',
  fresa: 'Fresa',
  arroz: 'Arroz',
  alfalfa: 'Alfalfa',
  agave: 'Agave',
  nopal: 'Nopal',
  aguacate: 'Aguacate',
};

export const DEFAULT_CROP = 'maiz';

// Color of each crop seen from above, for the raised parcels on the map and the summary bars.
export const CROP_COLORS = {
  maiz: '#5f9e3a',
  sorgo: '#a4552d',
  trigo: '#d9b44a',
  cebada: '#e3d27e',
  frijol: '#2f7a3a',
  garbanzo: '#93b35c',
  brocoli: '#2e5b3a',
  avena: '#cfc47a',
  amaranto: '#a8244e',
  girasol: '#e8b820',
  cacahuate: '#4f8a3c',
  calabaza: '#c9772a',
  papa: '#3f7d45',
  cebolla: '#7fae9a',
  jitomate: '#b83a2a',
  chile: '#8f2a1e',
  fresa: '#c2364a',
  arroz: '#c8b85a',
  alfalfa: '#4d9a52',
  agave: '#6f9c9c',
  nopal: '#5d9a52',
  aguacate: '#2c5a2e',
};

// Bajío seasons. Single place to change them.
// PV (primavera-verano): the rainy season, June to September.
export const PV_MONTHS = [6, 7, 8, 9];

// A year counts as "dry" when its PV rainfall is below this share of the plot's own median.
// Used by /api/clima, where no crop has been chosen yet. Per-crop risk lives in the engine.
export const DRY_YEAR_RATIO = 0.8;

// Demo point: farmland about 5.5 km south of downtown Celaya. Its raw API responses are
// committed in server/fixtures/. Downtown itself (20.52, -100.81) is masked as urban in
// SoilGrids and returns no soil data, so it cannot be the example.
export const DEMO_POINT = { nombre: 'Celaya, Gto.', lat: 20.47, lon: -100.81 };

// Every point with committed fixtures (works offline). All outside town centers,
// because SoilGrids returns no soil for urban pixels. GET /api/ejemplos serves this list
// to the client's quick buttons, so it is the only place to add an example.
export const FIXTURE_POINTS = [
  DEMO_POINT,
  { nombre: 'Irapuato, Gto.', lat: 20.6, lon: -101.42 },
  { nombre: 'San Juan del Río, Qro.', lat: 20.45, lon: -100.08 },
  { nombre: 'Dolores Hidalgo, Gto.', lat: 21.1, lon: -100.95 },
];

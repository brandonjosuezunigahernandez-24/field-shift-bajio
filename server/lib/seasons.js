// Bajío seasons. Single place to change them.
// PV (primavera-verano): the rainy season, June to September.
export const PV_MONTHS = [6, 7, 8, 9];

// A year counts as "dry" when its PV rainfall is below this share of the plot's own median.
// Used by /api/clima, where no crop has been chosen yet. Per-crop risk lives in the engine.
export const DRY_YEAR_RATIO = 0.8;

// Quick-button plots, served by GET /api/ejemplos: the only place to add or move an example.
// Same ids and labels as the client design. Each point is farmland checked on satellite imagery,
// a few km from the town center, because SoilGrids masks urban pixels and returns no soil there
// (downtown Celaya 20.52, -100.81, Querétaro 20.59, -100.39 and Salamanca 20.57, -101.19).
export const EXAMPLE_POINTS = [
  { id: 'celaya', nombre: 'Celaya, Gto.', boton: 'Celaya, Gto. (Temporal)', lat: 20.47, lon: -100.81 },
  { id: 'marques', nombre: 'El Marqués, Qro.', boton: 'El Marqués, Qro. (Sequía)', lat: 20.7, lon: -100.27 },
  { id: 'salamanca', nombre: 'Salamanca, Gto.', boton: 'Salamanca, Gto. (Riego)', lat: 20.6, lon: -101.23 },
];

export const DEMO_POINT = EXAMPLE_POINTS[0];

// Every point with committed fixtures in server/fixtures/ (works offline): the buttons plus
// three more Bajío plots.
export const FIXTURE_POINTS = [
  ...EXAMPLE_POINTS,
  { nombre: 'Irapuato, Gto.', lat: 20.6, lon: -101.42 },
  { nombre: 'San Juan del Río, Qro.', lat: 20.45, lon: -100.08 },
  { nombre: 'Dolores Hidalgo, Gto.', lat: 21.1, lon: -100.95 },
];

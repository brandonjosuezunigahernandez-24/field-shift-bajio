// Example plots for the demo buttons (same three as the design). Celaya is the demo point: its
// data is also committed in server/fixtures/, so it works without internet. The design used the
// downtown coordinate (20.52); SoilGrids masks it as urban, so the farmland point 20.47 is used.
// Keep Celaya in sync with server/lib/seasons.js.
export const EXAMPLE_POINTS = [
  { id: 'celaya', nombre: 'Celaya, Gto.', boton: 'Celaya, Gto. (Temporal)', lat: 20.47, lon: -100.81 },
  { id: 'marques', nombre: 'El Marqués, Qro.', boton: 'El Marqués, Qro. (Sequía)', lat: 20.59, lon: -100.39 },
  { id: 'salamanca', nombre: 'Salamanca, Gto.', boton: 'Salamanca, Gto. (Riego)', lat: 20.57, lon: -101.19 },
];

export const DEFAULT_POINT = EXAMPLE_POINTS[0];

export const CUSTOM_POINT = { id: 'personalizada', nombre: 'Parcela personalizada', boton: 'Parcela personalizada' };

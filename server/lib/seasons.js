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

// The example buttons come from the server (GET /api/ejemplos), the only place to add or move one.
// This is the plot used when a screen needs one before the server answered, or without internet:
// the same Celaya farmland point as EXAMPLE_POINTS[0] in server/lib/seasons.js.
export const DEFAULT_POINT = { id: 'celaya', nombre: 'Celaya, Gto.', boton: 'Celaya, Gto. (Temporal)', lat: 20.47, lon: -100.81 };

export const CUSTOM_POINT = { id: 'personalizada', nombre: 'Parcela personalizada', boton: 'Parcela personalizada' };

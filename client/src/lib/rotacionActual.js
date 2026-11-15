// What the farmer sows today, oldest first, for POST /api/recomendar (`rotacion_actual`): the profile's
// [ultimo_cultivo, cultivo_actual] without answers that are not a crop and without a crop repeated in a row.
// The server keeps only the crops the engine knows; with nothing left it compares against the SIAP's most sown crop.
const NO_ES_CULTIVO = new Set(['ninguno', 'otro', 'no_se']);

export function rotacionActualDe(perfil = {}) {
  const ids = [perfil.ultimo_cultivo, perfil.cultivo_actual].filter((c) => typeof c === 'string' && c && !NO_ES_CULTIVO.has(c));
  return ids.filter((c, i) => c !== ids[i - 1]);
}

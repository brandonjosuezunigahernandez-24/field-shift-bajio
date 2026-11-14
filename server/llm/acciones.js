// Acciones de mapa que se piden junto con la respuesta. Lista cerrada.
// Las decide el código leyendo la respuesta, no el modelo: Gemma 4B casi nunca las pedía.
export const ACTION_TYPES = ['zoom_parcela', 'zoom_region', 'resaltar_anios_secos'];

// shortcut: palabras clave simples, subir a algo más fino si se vuelve impreciso.
export function actionsFor(text) {
  const t = text.toLowerCase();
  const out = [];
  if (/\b(parcela|suelo)\b/.test(t)) out.push('zoom_parcela');
  if (/\b(seco|secos|sequ[ií]a)\b/.test(t)) out.push('resaltar_anios_secos');
  return out.map((tipo) => ({ tipo }));
}

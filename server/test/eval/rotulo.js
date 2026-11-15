// Qué entendió /api/asistente, leído de su respuesta (para medir paráfrasis): un rótulo corto por camino del servidor.
export function rotulo(r) {
  if (/^¡Hola! Soy tu asistente/.test(r.respuesta ?? '')) return 'saludo';
  if (r.tema === 'cultivo-puedo') return 'puedo';
  if (r.tema === 'recomendar-porque') return 'porque';
  // «¿Qué hago si…?»: la respuesta empieza con la primera acción de «Qué hacer».
  if (r.que_hacer?.length && r.respuesta?.startsWith(r.que_hacer[0].accion)) return 'accion';
  if (r.tema) return r.tema;
  if (r.recomendacion || r.recomendacion_finca || ['agua', 'prioridad'].includes(r.preguntar?.campo)) return 'recomendar';
  if (r.riesgo_modelo) return 'maiz-riesgo';
  if (r.sugerencias) return 'sin_respuesta';
  return 'modelo';
}

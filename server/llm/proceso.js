// "Cómo llegó a la respuesta": pasos REALES, armados con lo que el servidor de verdad hizo en esta pregunta
// (no son pasos de ejemplo ni traen tiempos inventados). Se agregan a toda respuesta de /api/asistente como `proceso`.
const QUIEN_ESCRIBIO = {
  motor: ['Recomendador con datos del SIAP 2018-2024', 'Lo calculó y lo redactó el código, sin modelo de lenguaje.'],
  modelo: ['Modelo entrenado de riesgo (SIAP + NASA POWER)', 'Lo calculó el modelo y lo redactó el código, sin modelo de lenguaje.'],
  llm: ['Redacción con el modelo de lenguaje local (Gemma)', 'Respondió el modelo de lenguaje en tu computadora, usando solo tus datos.'],
  plantilla: ['Respuesta de respaldo', 'El modelo de lenguaje no pudo contestar bien; se usó un texto fijo con tus datos.'],
};
const TIPO = {
  motor: 'Pidió una recomendación o contestó datos de su parcela',
  modelo: 'Preguntó por el riesgo del maíz según la lluvia',
  llm: 'Hizo una pregunta sobre su parcela o sus cultivos',
  plantilla: 'Hizo una pregunta sobre su parcela',
};
const BASE = {
  ficha: 'Solo los datos de tu parcela.',
  conocimiento: 'Los datos de tu parcela y textos de la base local de consejos.',
  internet: 'Los datos de tu parcela y una página de Wikipedia.',
};

export function buildProceso(body, info = {}) {
  const o = body.origen ?? 'llm';
  const [tituloRedaccion, detalleRedaccion] = QUIEN_ESCRIBIO[o] ?? QUIEN_ESCRIBIO.llm;
  const pasos = [
    { titulo: 'Entendió tu pregunta', detalle: TIPO[o] ?? TIPO.llm },
  ];
  if (body.preguntar) {
    pasos.push({ titulo: 'Le falta un dato', detalle: `Necesita saber: ${body.preguntar.campo}. Contéstalo con los botones.` });
    return pasos;
  }
  if (body.fuentes?.length || info.clima_origen) {
    const origen = info.clima_origen ? ` (clima ${{ api: 'recién consultado', cache: 'guardado de antes', fixture: 'copia de respaldo' }[info.clima_origen] ?? info.clima_origen})` : '';
    pasos.push({ titulo: 'Consultó datos reales', detalle: `${(body.fuentes ?? []).join(', ') || 'Datos de tu parcela'}${origen}` });
  }
  if (body.corroboracion) {
    pasos.push({ titulo: 'Cruzó NASA con el SIAP', detalle: `Comparó los años secos de NASA con los años de pérdidas del SIAP (${body.corroboracion.anios_comparados} años).` });
  }
  pasos.push({ titulo: tituloRedaccion, detalle: detalleRedaccion });
  if (body.base && BASE[body.base] && o === 'llm') {
    pasos.push({ titulo: 'Qué información usó', detalle: BASE[body.base] });
  }
  pasos.push({
    titulo: 'Revisó los números',
    detalle: o === 'llm' || o === 'plantilla'
      ? 'Comprobó que cada número de la respuesta salga de tus datos; si no, usa un texto de respaldo.'
      : 'Los números los calcula el código, no el modelo de lenguaje.',
  });
  return pasos;
}

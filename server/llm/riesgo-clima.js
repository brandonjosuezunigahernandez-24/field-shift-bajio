// Riesgo estimado del maíz de temporal según la lluvia, con el modelo entrenado (server/llm/modelo.js).
// Solo maíz (acuerdo con el usuario): es el único cultivo donde el modelo le gana al promedio histórico.
// NO es un pronóstico: se calcula para tres lluvias posibles (año seco, normal y lluvioso) sacadas de los 25 años de la parcela.
import { predictRisk } from './modelo.js';

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const pct = (n) => `${Math.round(n)} %`;

export function riesgoPorEscenarios({ estado, cultivo, clima }) {
  if (cultivo !== 'maiz' || !clima?.lluvia_pv_anual?.length) return null;
  const lluvias = clima.lluvia_pv_anual.map((y) => y.lluvia_mm).filter(Number.isFinite).sort((a, b) => a - b);
  const mediana = clima.lluvia_pv_mediana_mm;
  const temps = (clima.temp_media_mensual ?? []).filter((m) => m.mes >= 6 && m.mes <= 9 && Number.isFinite(m.t_media_c)).map((m) => m.t_media_c);
  if (lluvias.length < 10 || !(mediana > 0) || !temps.length) return null;
  const tempPV = temps.reduce((a, b) => a + b, 0) / temps.length;

  const casos = [
    { nombre: 'un año seco', lluvia_mm: percentile(lluvias, 0.1) },
    { nombre: 'un año normal', lluvia_mm: mediana },
    { nombre: 'un año lluvioso', lluvia_mm: percentile(lluvias, 0.9) },
  ];
  const escenarios = [];
  let validacion = null;
  for (const c of casos) {
    const r = predictRisk({ estado, cultivo, lluviaPV: c.lluvia_mm, medianaPV: mediana, tempPV });
    if (!r.disponible) return null;
    validacion = r.validacion;
    escenarios.push({ nombre: c.nombre, lluvia_mm: Math.round(c.lluvia_mm), siniestro_pct: r.siniestro_pct, nivel: r.nivel });
  }

  // Cuánto se puede creer: sale de las pruebas del modelo, no de una opinión.
  const mejora = validacion.mejora_mae_pct_leave_one_year_out;
  const confianza = mejora >= 15 ? 'media' : 'baja';
  const nota = confianza === 'media'
    ? `En pruebas dejando un año fuera, el error baja ${Math.round(mejora)} % frente a usar el promedio histórico.`
    : `Ojo: en ${estado} la mejora es pequeña (${Math.round(mejora)} % en pruebas dejando un año fuera) y el SIAP no reporta pérdidas en varios años. Tómalo solo como una referencia.`;
  const lista = escenarios.map((e) => `${e.nombre} (${e.lluvia_mm} mm de lluvia en verano): cerca de ${pct(e.siniestro_pct)} de la superficie dañada`).join('; ');
  const lectura =
    `Para el maíz de temporal en ${estado}, el modelo estima: ${lista}. ` +
    `Es un riesgo estimado según la lluvia, no un pronóstico de lo que va a pasar este año. ${nota} [Modelo entrenado con SIAP y NASA POWER]`;

  return { cultivo, estado, confianza, escenarios, validacion, lectura, aviso: 'Riesgo estimado dado el clima, no un pronóstico.' };
}

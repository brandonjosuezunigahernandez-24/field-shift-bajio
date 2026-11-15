import { readFileSync } from 'node:fs';
import { predictRidge } from '../lib/ridge.js';

// Riesgo estimado de siniestro (% de superficie sembrada de temporal PV) DADO el clima de la
// temporada. No es un pronostico del clima. Coeficientes entrenados por scripts/modelo-entrenar.js.
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[^a-zA-Z ]/g, '').toLowerCase().trim();
const MODELOS = {};
for (const f of ['guanajuato', 'queretaro']) {
  try { MODELOS[f] = JSON.parse(readFileSync(new URL(`../data/modelo_${f}.json`, import.meta.url), 'utf8')); } catch { /* sin modelo para ese estado */ }
}
const CULTIVO = (c) => ['maiz', 'frijol', 'sorgo'].find((k) => norm(c).startsWith(k));

// lluviaPV y medianaPV en mm (jun-sep, mediana local de 2000-2024); tempPV en C (media jun-sep, opcional).
export function predictRisk({ estado, cultivo, lluviaPV, medianaPV, tempPV } = {}) {
  const no = (motivo) => ({ disponible: false, motivo });
  const m = MODELOS[norm(estado)]?.cultivos?.[CULTIVO(cultivo)]?.objetivos?.siniestro;
  if (!m) return no('Sin modelo para ese estado o cultivo.');
  if (!m.supera_linea_base) return no('El modelo no supera al promedio histórico para este cultivo; no se usa.');
  if (!(lluviaPV >= 0) || !(medianaPV > 0)) return no('Faltan lluviaPV y medianaPV.');
  const x = { ratio: lluviaPV / medianaPV, lluvia_pv: lluviaPV, t_pv: tempPV };
  if (m.features.some((f) => !Number.isFinite(x[f]))) return no(`Faltan datos: ${m.features.join(', ')}.`);
  const mod = { mean: m.ridge.mean, sd: m.ridge.sd, coef: m.ridge.coef, intercept: m.baseEstado };
  const pct = Math.min(100, Math.max(0, predictRidge(mod, m.features.map((f) => x[f]))));
  const v = m.validacion;
  return {
    disponible: true,
    siniestro_pct: Math.round(pct * 10) / 10,
    nivel: pct < 5 ? 'bajo' : pct < 20 ? 'medio' : 'alto',
    lluvia_relativa: Math.round(x.ratio * 100) / 100,
    validacion: { mejora_mae_pct_holdout_2023_2024: v.holdout_2023_2024.mejora_mae_pct, mejora_mae_pct_leave_one_year_out: v.leave_one_year_out.mejora_mae_pct, mae_pct_puntos: v.leave_one_year_out.modelo.mae },
    aviso: 'Riesgo estimado dado el clima de la temporada, no un pronóstico. Entrenado con 7 años del SIAP municipal; "siniestrada" incluye heladas, plagas y otras causas.',
  };
}

// What the diorama looks like for one year: plain numbers and sRGB colors (0..1), no three.js.
// Every visual here comes from a real value of /api/clima, /api/suelo or /api/terreno.
import { clamp } from './geo.js';

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const GROUND_DRY = [0.66, 0.53, 0.34]; // bare, dry soil
const GROUND_WET = [0.36, 0.52, 0.22]; // green field
const TINT_DRY = [1.0, 0.8, 0.45]; // plants turn yellow
const NEUTRAL = [1, 1, 1];

// Rain of one PV season compared with the plot's own median (ratio 1 = a normal year).
//  - ground: from dry brown (ratio <= 0.6) to green (ratio >= 1.1)
//  - growth: plant height factor, 0.4 to 1.15
//  - rain:   0..1, how many raindrops to draw
export function yearState(clima, anio) {
  const year = clima?.lluvia_pv_anual?.find((y) => y.anio === anio);
  const median = clima?.lluvia_pv_mediana_mm;
  if (!year || !median) {
    return { anio: null, lluvia_mm: null, seco: false, ratio: null, wet: 1, growth: 1, ground: mix(GROUND_DRY, GROUND_WET, 0.6), tint: NEUTRAL, rain: 0 };
  }
  const ratio = year.lluvia_mm / median;
  const wet = clamp((ratio - 0.6) / 0.5, 0, 1);
  return {
    anio,
    lluvia_mm: year.lluvia_mm,
    seco: year.seco,
    ratio,
    wet,
    growth: clamp(0.4 + 0.6 * ratio, 0.4, 1.15),
    ground: mix(GROUND_DRY, GROUND_WET, wet),
    tint: mix(TINT_DRY, NEUTRAL, wet),
    rain: clamp(ratio / 1.3, 0, 1),
  };
}

const SANDY_TOP = [0.6, 0.46, 0.3];
const CLAY_TOP = [0.38, 0.29, 0.22]; // dark clay soils (vertisols) are common in the Bajío
const NO_DATA = [0.55, 0.55, 0.55];

// Side colors of the soil block: more clay -> darker; more organic carbon -> darker topsoil.
export function soilColors(suelo) {
  if (!suelo || suelo.sin_datos || suelo.arcilla_pct === null) {
    return { top: NO_DATA, sub: mix(NO_DATA, [1, 1, 1], 0.2), sinDatos: true };
  }
  const clay = clamp((suelo.arcilla_pct - 15) / 35, 0, 1);
  const organic = clamp((suelo.carbono_organico_g_kg ?? 0) / 25, 0, 1);
  const base = mix(SANDY_TOP, CLAY_TOP, clay);
  return {
    top: mix(base, [0.2, 0.15, 0.11], organic * 0.4),
    sub: mix(base, [0.85, 0.75, 0.6], 0.3),
    sinDatos: false,
  };
}

// Vertical exaggeration so the relief can be seen: the highest point ends at ~8% of the side.
// Between x1 (already hilly) and x10 (very flat, like most Bajío farmland). Shown to the user.
export function reliefExaggeration(desnivelM, sideM = 1000, target = 0.08) {
  if (!desnivelM || desnivelM <= 0) return 1;
  return Math.round(clamp((target * sideM) / desnivelM, 1, 10) * 2) / 2;
}

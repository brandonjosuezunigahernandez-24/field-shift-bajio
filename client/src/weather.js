// Weather scenes drawn over the satellite map. Pure data, tested with node --test.
//
// "auto" picks the scene from the REAL rain of the chosen year (NASA POWER, via yearState):
// it only translates how much it rained in June-September into a picture. The other options are
// for exploring and are labeled as an example on the map, never as data.

export const WEATHER_OPTIONS = [
  { id: 'auto', label: 'Según el año', icon: '📅' },
  { id: 'soleado', label: 'Soleado', icon: '☀️' },
  { id: 'normal', label: 'Normal', icon: '⛅' },
  { id: 'nublado', label: 'Nublado', icon: '☁️' },
  { id: 'lluvia', label: 'Lluvia', icon: '🌧️' },
  { id: 'tormenta', label: 'Tormenta', icon: '⛈️' },
  { id: 'sequia', label: 'Sequía', icon: '🌵' },
  { id: 'apagado', label: 'Sin clima', icon: '⏸️' },
];

// clouds, rain, dust: 0..1 amounts. light: sunlight multiplier. warm: golden light and haze.
// plant: how the crops look ({ wet, growth } like yearState) when the scene is chosen by hand.
const SCENES = {
  soleado: { label: 'Soleado', clouds: 0.08, rain: 0, dust: 0, light: 1.25, warm: true, lightning: false, plant: { wet: 0.85, growth: 0.95 } },
  normal: { label: 'Normal', clouds: 0.35, rain: 0.25, dust: 0, light: 1, warm: false, lightning: false, plant: { wet: 1, growth: 1 } },
  nublado: { label: 'Nublado', clouds: 0.85, rain: 0, dust: 0, light: 0.7, warm: false, lightning: false, plant: { wet: 1, growth: 1 } },
  lluvia: { label: 'Lluvia', clouds: 0.75, rain: 0.7, dust: 0, light: 0.75, warm: false, lightning: false, plant: { wet: 1, growth: 1.05 } },
  tormenta: { label: 'Tormenta', clouds: 1, rain: 1, dust: 0, light: 0.55, warm: false, lightning: true, plant: { wet: 1, growth: 1.1 } },
  sequia: { label: 'Sequía', clouds: 0, rain: 0, dust: 1, light: 1.35, warm: true, lightning: false, plant: { wet: 0, growth: 0.6 } },
};

// Which scene a real year looks like, from its PV rain compared with the plot's median.
// The dry line is the same as /api/clima's (`seco`, below 80 % of the median).
export function sceneForYear(year) {
  if (!year || year.lluvia_mm === null || year.ratio === null) return 'normal';
  if (year.seco) return 'sequia';
  if (year.ratio < 0.9) return 'soleado';
  if (year.ratio < 1.1) return 'normal';
  if (year.ratio < 1.3) return 'lluvia';
  return 'tormenta';
}

// The scene to draw: { id, label, clouds, rain, dust, light, warm, lightning, plant, example }.
// `choice` is a WEATHER_OPTIONS id; `year` is parcelState.yearState(...) for the chosen year.
// In "auto", the plants keep the real year's look; a hand-picked scene brings its own.
export function weatherScene(choice, year) {
  if (choice === 'apagado') {
    return { id: 'apagado', label: 'Sin clima', clouds: 0, rain: 0, dust: 0, light: 1, warm: false, lightning: false, plant: null, example: false };
  }
  if (choice === 'auto') {
    const id = sceneForYear(year);
    return { id, ...SCENES[id], plant: null, example: false };
  }
  const id = SCENES[choice] ? choice : 'normal';
  return { id, ...SCENES[id], example: true };
}

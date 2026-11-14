// Corrobora los datos del SIAP con la lluvia de NASA POWER en la parcela:
// ¿los años que NASA marca como secos son los años en que el SIAP reporta pérdidas altas?
// Son 7 años de traslape (2018-2024) y el SIAP es por estado: es una pista, no una prueba.
const PERDIDA_ALTA = 10; // % de superficie siniestrada; igual que en recomendador.js

function pearson(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

// clima: lo que devuelve summarizeClimate (lluvia_pv_anual[{anio, lluvia_mm, seco}]).
// filas: las del resumen del SIAP. Devuelve null si no hay suficientes años en común.
export function corroborate({ clima, filas, estado, cultivo, ciclo = 'Primavera-Verano', modalidad = 'Temporal' }) {
  const nasa = new Map((clima?.lluvia_pv_anual ?? []).map((y) => [y.anio, y]));
  const anios = (filas ?? [])
    .filter((f) => f.estado === estado && f.cultivo === cultivo && f.ciclo === ciclo && f.modalidad === modalidad && nasa.has(f.anio))
    .sort((a, b) => a.anio - b.anio)
    .map((f) => {
      const perdida = (100 * f.siniestrada_ha) / Math.max(f.sembrada_ha, 1);
      return { anio: f.anio, lluvia_mm: Math.round(nasa.get(f.anio).lluvia_mm), seco_nasa: Boolean(nasa.get(f.anio).seco), perdida_pct: Math.round(perdida * 10) / 10, perdida_alta: perdida > PERDIDA_ALTA };
    });
  if (anios.length < 5) return null;

  const coinciden = anios.filter((a) => a.seco_nasa && a.perdida_alta).map((a) => a.anio);
  const soloNasa = anios.filter((a) => a.seco_nasa && !a.perdida_alta).map((a) => a.anio);
  const soloSiap = anios.filter((a) => !a.seco_nasa && a.perdida_alta).map((a) => a.anio);
  const r = pearson(anios.map((a) => a.lluvia_mm), anios.map((a) => a.perdida_pct));
  const lista = (xs) => (xs.length ? ` (${xs.join(', ')})` : '');
  const secos = anios.filter((a) => a.seco_nasa).length;
  const rTexto = r === null ? '' : r >= -0.3 ? ' En estos años no se ve una relación clara entre la lluvia y las pérdidas.' : ` A menos lluvia, más pérdidas: la relación fue de ${(Math.round(r * 100) / 100).toString().replace('-', '−')} (−1 sería perfecta).`;
  const lectura =
    `De ${anios[0].anio} a ${anios.at(-1).anio}, NASA marcó ${secos} año(s) seco(s) en tu parcela. En ${coinciden.length} de ellos el SIAP también reporta pérdidas altas en ${estado}${lista(coinciden)}` +
    (soloNasa.length ? `; en ${soloNasa.length} no hubo pérdidas altas${lista(soloNasa)}` : '') +
    '.' +
    (soloSiap.length ? ` Hubo pérdidas altas sin año seco en ${soloSiap.join(', ')}.` : '') +
    rTexto +
    ' Con tan pocos años es una pista, no una prueba, y el SIAP es por estado, no por parcela.';
  return {
    cultivo, estado, ciclo, modalidad, anios_comparados: anios.length,
    coinciden, solo_nasa: soloNasa, solo_siap: soloSiap,
    correlacion_lluvia_perdida: r === null ? null : Math.round(r * 100) / 100,
    detalle: anios, lectura,
  };
}

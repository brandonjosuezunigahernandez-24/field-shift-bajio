// The 3 rotations of the engine (POST /api/recomendar -> estrategias) side by side, one measure at a time.
// Each measure has its own scale (no shared axis): the bar is the value against the largest of the three.
// esMejor marks the best value with words (the screen prints «mejor»), never with color alone.

export const NOMBRE_CORTO = { actual: 'Seguir igual', recomendada: 'Recomendada', alternativa: 'Otra opción' };

const fmt = (n) => Math.round(n).toLocaleString('es-MX');
const pct = (p) => Math.round(p * 100);

// mejor: which way is better. tolerancia: relative gap that still counts as a tie (income: under 5 % is noise).
const MEDIDAS = [
  {
    id: 'riesgo',
    titulo: 'Temporadas sin lluvia suficiente',
    mejor: 'menos',
    valor: (r) => r.riesgo,
    texto: (r) => `${pct(r.riesgo)} %${r.riesgo_rango ? ` (${pct(r.riesgo_rango[0])}–${pct(r.riesgo_rango[1])} %)` : ''}`,
  },
  // Frost and heat come from the coldest and hottest hour of each month (NASA POWER); they also apply with irrigation.
  {
    id: 'helada',
    titulo: 'Temporadas con helada que daña',
    mejor: 'menos',
    valor: (r) => r.riesgo_helada,
    texto: (r) => `${pct(r.riesgo_helada)} %`,
  },
  {
    id: 'calor',
    titulo: 'Temporadas con calor que daña',
    mejor: 'menos',
    valor: (r) => r.riesgo_calor,
    texto: (r) => `${pct(r.riesgo_calor)} %`,
  },
  {
    id: 'leguminosas',
    titulo: 'Temporadas con leguminosa (dejan nitrógeno)',
    mejor: 'más',
    valor: (r) => r.leguminosas,
    texto: (r) => String(r.leguminosas),
  },
  {
    id: 'familia',
    titulo: 'Veces que repite familia seguida (junta plagas)',
    mejor: 'menos',
    valor: (r) => r.familia_repetida,
    texto: (r) => String(r.familia_repetida),
  },
  {
    id: 'agua',
    titulo: 'Agua que necesitan sus cultivos en 3 años',
    mejor: 'menos',
    valor: (r) => r.lluvia_necesaria_mm,
    texto: (r) => `${fmt(r.lluvia_necesaria_mm)} mm`,
  },
  {
    id: 'ingreso',
    titulo: 'Ingreso bruto por hectárea en 3 años (SIAP, sin costos)',
    mejor: 'más',
    tolerancia: 0.05,
    valor: (r) => r.ingreso_bruto_mxn_ha,
    texto: (r) => `$${fmt(r.ingreso_bruto_mxn_ha)}`,
  },
];

export function compararRotaciones(estrategias = []) {
  const conResumen = estrategias.filter((e) => e.resumen);
  if (conResumen.length < 2) return [];
  return MEDIDAS.map((m) => {
    const valores = conResumen.map((e) => m.valor(e.resumen));
    // A measure some rotation lacks (rain risk with irrigation, income without SIAP prices) is not compared.
    if (valores.some((v) => v == null)) return null;
    const tope = Math.max(...valores);
    const mejorValor = m.mejor === 'menos' ? Math.min(...valores) : tope;
    const empata = (v) => Math.abs(v - mejorValor) <= (m.tolerancia ?? 0) * Math.max(Math.abs(mejorValor), 1);
    const mejores = valores.map(empata);
    const todosIguales = mejores.every(Boolean);
    return {
      id: m.id,
      titulo: m.titulo,
      mejor: m.mejor,
      filas: conResumen.map((e, i) => ({
        id: e.id,
        nombre: NOMBRE_CORTO[e.id] ?? e.nombre,
        texto: m.texto(e.resumen),
        ancho: tope > 0 ? valores[i] / tope : 0,
        esMejor: !todosIguales && mejores[i],
      })),
    };
  }).filter(Boolean);
}

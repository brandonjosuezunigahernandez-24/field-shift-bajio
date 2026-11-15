// Ficha de la parcela: lo ÚNICO que el modelo puede usar para responder.
// Recibe lo que ya devuelven /api/clima y /api/suelo (sin lat/lon/origen extra).
const r1 = (n) => Math.round(n * 10) / 10;
const extreme = (dias, key, pick) => dias.reduce((a, d) => (pick(d[key], a[key]) ? d : a), dias[0]);

// Gemma 4B se equivoca al buscar máximos y mínimos en una lista; el código los calcula.
export function summarizeForecast(dias) {
  const wet = extreme(dias, 'lluvia_mm', (x, y) => x > y);
  const cold = extreme(dias, 't_min_c', (x, y) => x < y);
  const hot = extreme(dias, 't_max_c', (x, y) => x > y);
  return {
    lluvia_total_mm: r1(dias.reduce((s, d) => s + d.lluvia_mm, 0)),
    dia_con_mas_lluvia: { fecha: wet.fecha, lluvia_mm: wet.lluvia_mm, prob_lluvia_pct: wet.prob_lluvia_pct },
    temperatura_minima_mas_baja: { fecha: cold.fecha, c: cold.t_min_c },
    temperatura_maxima_mas_alta: { fecha: hot.fecha, c: hot.t_max_c },
  };
}

export function buildFicha({ clima, suelo, pronostico = null, conocimiento = [], siap = null, recomendacion = null, agricultor = {} }) {
  const secos = clima.anios_secos ?? [];
  return {
    // Textos de apoyo para preguntas generales (base local o Wikipedia), cada uno con su fuente.
    ...(conocimiento.length && { conocimiento }),
    // Datos oficiales del SIAP del cultivo por el que preguntaron (por estado, no de la parcela).
    ...(siap && { siap }),
    // Resultado del recomendador (cultivos, rotación y simulación) cuando el agricultor ya dijo agua y prioridad.
    ...(recomendacion && { recomendacion }),
    // Lo que dijo el agricultor sobre su parcela (no es dato medido: es lo que él cree o sabe).
    ...(Object.keys(agricultor).length && { dicho_por_el_agricultor: agricultor }),
    // Solo si hay pronóstico (internet o caché reciente). `obtenido` dice qué tan viejo es.
    ...(pronostico && {
      pronostico_7_dias: {
        obtenido: pronostico.obtenido,
        resumen: summarizeForecast(pronostico.dias),
        dias: pronostico.dias,
        fuente: 'Open-Meteo',
      },
    }),
    lluvia_verano: {
      mediana_mm: clima.lluvia_pv_mediana_mm,
      umbral_seco_mm: clima.umbral_seco_mm,
      anios_secos: secos,
      total_anios_secos: secos.length,
      periodo: `${clima.periodo.inicio}-${clima.periodo.fin}`,
      fuente: 'NASA POWER',
    },
    ...(suelo && { suelo: suelo.sin_datos
      ? { sin_datos: true }
      : {
          ph: suelo.ph,
          arcilla_pct: suelo.arcilla_pct,
          arena_pct: suelo.arena_pct,
          carbono_organico_g_kg: suelo.carbono_organico_g_kg,
          fuente: 'SoilGrids',
        } }),
  };
}

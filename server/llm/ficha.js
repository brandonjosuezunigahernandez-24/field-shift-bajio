// Ficha de la parcela: lo ÚNICO que el modelo puede usar para responder.
// Recibe lo que ya devuelven /api/clima y /api/suelo (sin lat/lon/origen extra).
export function buildFicha({ clima, suelo }) {
  const secos = clima.anios_secos ?? [];
  return {
    lluvia_verano: {
      mediana_mm: clima.lluvia_pv_mediana_mm,
      umbral_seco_mm: clima.umbral_seco_mm,
      anios_secos: secos,
      total_anios_secos: secos.length,
      periodo: `${clima.periodo.inicio}-${clima.periodo.fin}`,
      fuente: 'NASA POWER',
    },
    suelo: suelo.sin_datos
      ? { sin_datos: true }
      : {
          ph: suelo.ph,
          arcilla_pct: suelo.arcilla_pct,
          arena_pct: suelo.arena_pct,
          carbono_organico_g_kg: suelo.carbono_organico_g_kg,
          fuente: 'SoilGrids',
        },
  };
}

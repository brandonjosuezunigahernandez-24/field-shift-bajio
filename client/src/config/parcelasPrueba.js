// Dos parcelas dibujadas de prueba (para la demo): rectángulos centrados en los puntos de ejemplo, así su clima y
// su suelo ya están guardados en el servidor (server/fixtures y caché) y funcionan con y sin internet.
// Cada una trae el perfil que llenaría el agricultor; el estado lo pone el servidor con los límites del INEGI.
const M_LAT = 111320; // metros por grado de latitud (aprox.)

// Rectángulo de `anchoM` (este-oeste) por `altoM` (norte-sur) con centro en (lat, lon), como [lon, lat] (igual que el mapa).
function rectangulo(lat, lon, anchoM, altoM) {
  const dLat = altoM / 2 / M_LAT;
  const dLon = anchoM / 2 / (M_LAT * Math.cos((lat * Math.PI) / 180));
  return [[lon - dLon, lat - dLat], [lon + dLon, lat - dLat], [lon + dLon, lat + dLat], [lon - dLon, lat + dLat]];
}

export const PARCELAS_PRUEBA = [
  {
    id: 'celaya',
    boton: 'Celaya, Gto. · maíz, 5 ha',
    contorno: rectangulo(20.47, -100.81, 250, 200),
    cultivo: 'maiz',
    perfil: { agua: 'temporal', prioridad: 'riesgo', cultivo_actual: 'maiz', ultimo_cultivo: 'frijol' },
  },
  {
    id: 'marques',
    boton: 'El Marqués, Qro. · frijol, 3.5 ha',
    contorno: rectangulo(20.7, -100.27, 200, 175),
    cultivo: 'frijol',
    perfil: { agua: 'temporal', prioridad: 'ganar', cultivo_actual: 'frijol', ultimo_cultivo: 'maiz' },
  },
];

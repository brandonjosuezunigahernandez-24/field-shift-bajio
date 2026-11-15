// Respuesta sin modelo: se usa si Ollama falla o el verificador rechaza al modelo.
export function templateAnswer(ficha) {
  const { lluvia_verano: l, suelo } = ficha;
  const partes = [
    `En verano suele llover ${l.mediana_mm} mm. De ${l.periodo}, ${l.total_anios_secos} ${l.total_anios_secos === 1 ? 'año fue seco' : 'años fueron secos'} [NASA POWER].`,
  ];
  partes.push(
    suelo.sin_datos
      ? 'No tengo datos de suelo para este punto. Marca otro dentro de tu parcela.'
      : `Tu suelo tiene pH ${suelo.ph} y ${suelo.arcilla_pct}% de arcilla [SoilGrids].`,
  );
  return partes.join(' ');
}

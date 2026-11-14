// Texts shown to the farmer. Keep them in plain Spanish; code stays in English.

export const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const ORIGIN_LABEL = {
  api: 'recién consultado',
  cache: 'guardado de una consulta anterior',
  fixture: 'copia de respaldo (sin internet)',
};

// Values match the `agua` field of POST /api/recomendar (docs/api-contract.md).
export const WATER_OPTIONS = [
  { id: 'temporal', label: 'Temporal', description: 'Solo con la lluvia.' },
  { id: 'riego', label: 'Riego', description: 'Tengo pozo, presa o canal.' },
];

// Values match the `prioridad` field of POST /api/recomendar.
export const PRIORITY_OPTIONS = [
  { id: 'ganar', label: 'Ganar más', description: 'Lo que más rinde en mi parcela.' },
  { id: 'suelo', label: 'Cuidar el suelo', description: 'Leguminosas y variedad de cultivos.' },
  { id: 'agua', label: 'Gastar menos agua', description: 'Cultivos que piden menos lluvia o riego.' },
  { id: 'riesgo', label: 'Arriesgar menos', description: 'Los que menos fallan en los años secos.' },
];

export const SEASON_LABEL = {
  PV: 'Primavera-verano (lluvias)',
  OI: 'Otoño-invierno (riego)',
};

// Fixed credits for phase 1. When /api/recomendar answers, its `fuentes` list replaces these.
export const DEFAULT_SOURCES = [
  'NASA POWER (Prediction Of Worldwide Energy Resources), NASA Langley Research Center',
  'SoilGrids 2.0, ISRIC World Soil Information (CC BY 4.0)',
];

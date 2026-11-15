// Perfil de la parcela: lo que el agricultor sabe y nosotros no podemos sacar de un satélite.
// El front muestra estas preguntas una por una, siempre con "No sé"; el servidor no guarda nada:
// el front manda el perfil completo en cada petición a /api/asistente.
import { HttpError } from '../lib/errors.js';
import { ESTADOS, PRIORIDADES } from './recomendador.js';

const NO_SE = { valor: 'no_se', texto: 'No sé' };
const CULTIVOS = ['maiz', 'sorgo', 'frijol', 'trigo', 'cebada', 'garbanzo', 'brocoli', 'jitomate'];
const NOMBRES = { maiz: 'Maíz', sorgo: 'Sorgo', frijol: 'Frijol', trigo: 'Trigo', cebada: 'Cebada', garbanzo: 'Garbanzo', brocoli: 'Brócoli', jitomate: 'Jitomate' };

// obligatoria: sin esto no se puede recomendar. Las demás afinan el resultado.
export const PREGUNTAS = [
  {
    campo: 'agua', obligatoria: true, pregunta: '¿Tu parcela es solo de lluvia o tiene riego?',
    porque: 'Cambia qué cultivos y qué temporadas se pueden usar.',
    opciones: [{ valor: 'temporal', texto: 'Solo lluvia' }, { valor: 'riego', texto: 'Tiene riego' }],
  },
  {
    campo: 'prioridad', obligatoria: true, pregunta: '¿Qué te importa más?',
    porque: 'Con esto se ordenan los cultivos.',
    opciones: [
      { valor: 'ganar', texto: 'Ganar más' }, { valor: 'suelo', texto: 'Cuidar el suelo' },
      { valor: 'agua', texto: 'Gastar menos agua' }, { valor: 'riesgo', texto: 'Arriesgar menos' },
    ],
  },
  {
    campo: 'estado', pregunta: '¿En qué estado está tu parcela?',
    porque: 'Las pérdidas y los precios que usamos son por estado.',
    opciones: ESTADOS.map((e) => ({ valor: e, texto: e })),
  },
  {
    campo: 'ultimo_cultivo', pregunta: '¿Qué sembraste la última vez en esa parcela?',
    porque: 'Para no repetir el mismo tipo de cultivo y cuidar la tierra.',
    opciones: [...CULTIVOS.map((c) => ({ valor: c, texto: NOMBRES[c] })), { valor: 'otro', texto: 'Otro' }, NO_SE],
  },
  {
    campo: 'cultivo_actual', pregunta: '¿Qué tienes sembrado ahorita?',
    porque: 'Para planear lo que sigue y no repetir el mismo tipo de cultivo.',
    opciones: [...CULTIVOS.map((c) => ({ valor: c, texto: NOMBRES[c] })), { valor: 'ninguno', texto: 'Nada por ahora' }, { valor: 'otro', texto: 'Otro' }, NO_SE],
  },
  {
    campo: 'riego_tipo', solo_si: { agua: 'riego' }, pregunta: '¿Cómo riegas?',
    porque: 'Cambia cada cuánto y cuánta agua se ocupa.',
    opciones: [{ valor: 'goteo', texto: 'Por goteo' }, { valor: 'aspersion', texto: 'Con aspersores' }, { valor: 'rodado', texto: 'Por gravedad o rodado' }, NO_SE],
  },
  {
    campo: 'riego_frecuencia_dias', solo_si: { agua: 'riego' }, tipo: 'numero', min: 1, max: 60, pregunta: '¿Cada cuántos días riegas?',
    porque: 'Para comparar con lo que necesita el cultivo cuando haya datos verificados.',
    opciones: [NO_SE],
  },
  {
    campo: 'hectareas', tipo: 'numero', min: 0.1, max: 5000, pregunta: '¿Cuántas hectáreas son?',
    porque: 'Para calcular el total de tu parcela. Si la dibujaste en el mapa se calcula sola.',
    opciones: [NO_SE],
  },
  {
    campo: 'textura', pregunta: 'Cuando la tierra está mojada y la aprietas en la mano, ¿cómo se siente?',
    porque: 'Si no sabes, usamos el dato de satélite.',
    opciones: [{ valor: 'arenosa', texto: 'Se desmorona (arenosa)' }, { valor: 'arcillosa', texto: 'Se pega y hace barro (arcillosa)' }, NO_SE],
  },
  {
    campo: 'encharca', pregunta: '¿Se encharca el agua en tu parcela después de llover fuerte?',
    porque: 'Algunos cultivos, como el garbanzo, no aguantan el encharcamiento.',
    opciones: [{ valor: 'si', texto: 'Sí' }, { valor: 'no', texto: 'No' }, NO_SE],
  },
];

const ENUMS = {
  agua: ['temporal', 'riego'], prioridad: PRIORIDADES, estado: ESTADOS,
  ultimo_cultivo: [...CULTIVOS, 'otro'], cultivo_actual: [...CULTIVOS, 'ninguno', 'otro'], riego_tipo: ['goteo', 'aspersion', 'rodado'], textura: ['arenosa', 'arcillosa'], encharca: ['si', 'no'],
};

// Limpia y valida lo que manda el front. "no_se" y vacíos se descartan; un valor raro es error 400.
export function parsePerfil(input) {
  if (input == null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'El perfil debe ser un objeto.');
  const out = {};
  for (const [campo, valor] of Object.entries(input)) {
    if (valor == null || valor === '' || valor === 'no_se') continue;
    if (campo === 'hectareas') {
      const n = Number(valor);
      if (!Number.isFinite(n) || n < 0.1 || n > 5000) throw new HttpError(400, 'hectareas debe ser un número entre 0.1 y 5000.');
      out.hectareas = n;
    } else if (campo === 'riego_frecuencia_dias') {
      const n = Number(valor);
      if (!Number.isFinite(n) || n < 1 || n > 60) throw new HttpError(400, 'riego_frecuencia_dias debe ser un número de días entre 1 y 60.');
      out.riego_frecuencia_dias = Math.round(n);
    } else if (ENUMS[campo]) {
      if (!ENUMS[campo].includes(valor)) throw new HttpError(400, `${campo} debe ser uno de: ${ENUMS[campo].join(', ')}.`);
      out[campo] = valor;
    }
    // Campos desconocidos se ignoran.
  }
  return out;
}

// Preguntas que todavía no tienen respuesta (las obligatorias primero). Las que contestó "no sé" no se repiten:
// el front las manda como no_se y aquí cuentan como respondidas.
export function pendientes(raw, perfil = parsePerfil(raw)) {
  const respondidas = (campo) => campo in perfil || raw?.[campo] === 'no_se';
  return PREGUNTAS.filter((p) => !p.solo_si || Object.entries(p.solo_si).every(([k, v]) => perfil[k] === v)).filter((p) => !respondidas(p.campo)).sort((a, b) => Number(!!b.obligatoria) - Number(!!a.obligatoria));
}

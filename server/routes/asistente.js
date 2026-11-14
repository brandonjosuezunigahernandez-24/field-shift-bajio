import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { parseCoords } from '../lib/coords.js';
import { getClimate, summarizeClimate } from '../sources/nasaPower.js';
import { getSoil, summarizeSoil } from '../sources/soilGrids.js';
import { getForecast } from '../sources/openMeteo.js';
import { findContext } from '../llm/contexto.js';
import { cropFacts } from '../llm/siap.js';
import { buildFicha } from '../llm/ficha.js';
import { REFUSAL, answer } from '../llm/responder.js';
import { ESTADOS, PRIORIDADES, compactReco, explainRecommendation, inferEstado, recommend } from '../llm/recomendador.js';

const router = Router();
const MAX_QUESTION = 300;
// Un saludo no necesita datos ni modelo (antes el modelo contestaba un saludo con el pronóstico).
const GREETING = /^\s*(¡)?(hola|buenas|buenos d[ií]as|buenas tardes|buenas noches|gracias|ok|adi[oó]s)[\s!.¡]*$/i;
const HELLO = '¡Hola! Soy tu asistente. Pregúntame por la lluvia de tu parcela, los años secos, el suelo, el pronóstico de la semana, sobre algún cultivo o qué te conviene sembrar.';
// "¿Qué siembro?", "qué me conviene", "recomiéndame", "rotación"... sin acentos para comparar.
const RECO = /(que (me )?(siembro|sembrar|conviene|cultivo|cultivar|planto|plantar)|recomiend|rotacion|que cultivo)/;
const strip = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const ASK = {
  agua: {
    respuesta: 'Para recomendarte necesito saber una cosa: ¿tu parcela es solo de lluvia (temporal) o tiene riego?',
    preguntar: { campo: 'agua', opciones: [{ valor: 'temporal', texto: 'Solo lluvia' }, { valor: 'riego', texto: 'Tiene riego' }] },
  },
  prioridad: {
    respuesta: '¿Qué te importa más?',
    preguntar: {
      campo: 'prioridad',
      opciones: [
        { valor: 'ganar', texto: 'Ganar más' }, { valor: 'suelo', texto: 'Cuidar el suelo' },
        { valor: 'agua', texto: 'Gastar menos agua' }, { valor: 'riesgo', texto: 'Arriesgar menos' },
      ],
    },
  },
};
const asking = (campo) => ({ ...ASK[campo], acciones: [], fuentes: [], verificado: true, origen: 'motor', base: 'ficha', enlaces: [] });

// Últimas 2 vueltas de conversación que manda el front (el servidor no guarda nada).
function parseHistory(h) {
  if (h == null) return [];
  if (!Array.isArray(h)) throw new HttpError(400, 'El historial debe ser una lista de preguntas y respuestas.');
  return h.slice(-2).map((t) => {
    if (typeof t?.pregunta !== 'string' || typeof t?.respuesta !== 'string') {
      throw new HttpError(400, 'Cada elemento del historial necesita pregunta y respuesta en texto.');
    }
    return { pregunta: t.pregunta.slice(0, MAX_QUESTION), respuesta: t.respuesta.slice(0, 600) };
  });
}

// POST /api/asistente { lat, lon, pregunta?, agua?, prioridad?, estado?, costos?, historial? }
//   -> { respuesta, acciones, fuentes, verificado, origen, base, enlaces, preguntar?, recomendacion? }
// Sin pregunta devuelve el resumen inicial de la parcela.
router.post('/', async (req, res) => {
  const { lat, lon } = parseCoords(req.body);
  const { pregunta, agua, prioridad, estado: estadoIn, costos } = req.body;
  if (pregunta != null && (typeof pregunta !== 'string' || pregunta.length > MAX_QUESTION)) {
    throw new HttpError(400, `La pregunta debe ser texto de máximo ${MAX_QUESTION} letras.`);
  }
  if (agua != null && !['temporal', 'riego'].includes(agua)) throw new HttpError(400, 'agua debe ser "temporal" o "riego".');
  if (prioridad != null && !PRIORIDADES.includes(prioridad)) throw new HttpError(400, `prioridad debe ser una de: ${PRIORIDADES.join(', ')}.`);
  if (estadoIn != null && !ESTADOS.includes(estadoIn)) throw new HttpError(400, `estado debe ser uno de: ${ESTADOS.join(', ')}.`);
  const historial = parseHistory(req.body.historial);

  if (GREETING.test(pregunta ?? '')) {
    return res.json({ respuesta: HELLO, acciones: [], fuentes: [], verificado: true, origen: 'plantilla', base: 'ficha', enlaces: [] });
  }

  const estado = estadoIn ?? inferEstado(lon);
  const reco = agua && prioridad ? recommend({ estado, agua, prioridad, costos }) : null;

  // "¿Qué siembro?": lo contesta el código con el recomendador, sin modelo. Si falta un dato, lo pregunta.
  if (pregunta && RECO.test(strip(pregunta))) {
    if (!agua) return res.json(asking('agua'));
    if (!prioridad) return res.json(asking('prioridad'));
    if (reco) {
      return res.json({
        respuesta: explainRecommendation(reco, !estadoIn), acciones: [], fuentes: ['SIAP'], verificado: true,
        origen: 'motor', base: 'ficha', enlaces: [], recomendacion: reco,
      });
    }
  }

  const [{ rows }, { soil }, pronostico, contexto] = await Promise.all([
    getClimate(lat, lon),
    getSoil(lat, lon),
    getForecast(lat, lon),
    findContext(pregunta),
  ]);
  const ficha = buildFicha({
    clima: summarizeClimate(rows),
    suelo: summarizeSoil(soil),
    pronostico,
    conocimiento: contexto.items,
    siap: pregunta ? cropFacts(pregunta) : null,
    recomendacion: reco ? compactReco(reco) : null,
  });
  const result = await answer({ ficha, pregunta, historial });
  // `base` dice de dónde sacó el modelo lo que dijo. Con la plantilla o con un "No tengo ese dato" no usó nada extra.
  const usedExtra = result.origen === 'llm' && !REFUSAL.test(result.respuesta);
  res.json({ ...result, base: usedExtra ? contexto.base : 'ficha', enlaces: usedExtra ? contexto.enlaces : [] });
});

export default router;

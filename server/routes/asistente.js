import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { parseCoords } from '../lib/coords.js';
import { getClimate, summarizeClimate } from '../sources/nasaPower.js';
import { getSoil, summarizeSoil } from '../sources/soilGrids.js';
import { getForecast } from '../sources/openMeteo.js';
import { findContext } from '../llm/contexto.js';
import { cropFacts, loadSiap } from '../llm/siap.js';
import { corroborate } from '../llm/corroboracion.js';
import { buildFicha } from '../llm/ficha.js';
import { REFUSAL, answer } from '../llm/responder.js';
import { compactReco, explainFarm, explainRecommendation, inferEstado, recommend, recommendFarm } from '../llm/recomendador.js';
import { parsePerfil, pendientes } from '../llm/perfil.js';
import { NOTA_FUERA_DE_TEMA, TEMAS } from '../llm/temas.js';
import { isFollowUp, wantsRecommendation } from '../llm/intencion.js';

const router = Router();
const MAX_QUESTION = 300;
// Un saludo no necesita datos ni modelo (antes el modelo contestaba un saludo con el pronóstico).
const GREETING = /^\s*(¡)?(hola|buenas|buenos d[ií]as|buenas tardes|buenas noches|gracias|ok|adi[oó]s)[\s!.¡]*$/i;
const HELLO = '¡Hola! Soy tu asistente. Pregúntame por la lluvia de tu parcela, los años secos, el suelo, el pronóstico de la semana, sobre algún cultivo o qué te conviene sembrar.';

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

// Parcelas dibujadas: [{ id, hectareas, ultimo_cultivo? }]. Con 2 o más se analizan juntas.
const MAX_PARCELAS = 20;
function parseParcelas(list) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > MAX_PARCELAS) throw new HttpError(400, `parcelas debe ser una lista de máximo ${MAX_PARCELAS}.`);
  return list.map((p, i) => {
    const extra = parsePerfil({ ultimo_cultivo: p?.ultimo_cultivo, hectareas: p?.hectareas });
    return { id: Number.isInteger(p?.id) ? p.id : i + 1, hectareas: extra.hectareas ?? null, ultimo_cultivo: extra.ultimo_cultivo ?? null };
  });
}

// GET /api/asistente/temas -> los temas y preguntas de ejemplo que el asistente sabe contestar (botones del chat).
router.get('/temas', (req, res) => res.json({ temas: TEMAS, nota: NOTA_FUERA_DE_TEMA }));

// POST /api/asistente { lat, lon, pregunta?, agua?, prioridad?, estado?, costos?, historial? }
//   -> { respuesta, acciones, fuentes, verificado, origen, base, enlaces, preguntar?, recomendacion? }
// Sin pregunta devuelve el resumen inicial de la parcela.
router.post('/', async (req, res) => {
  const { lat, lon } = parseCoords(req.body);
  const { pregunta, costos } = req.body;
  if (pregunta != null && (typeof pregunta !== 'string' || pregunta.length > MAX_QUESTION)) {
    throw new HttpError(400, `La pregunta debe ser texto de máximo ${MAX_QUESTION} letras.`);
  }
  // El perfil puede venir en `perfil` o con agua, prioridad y estado sueltos (como antes).
  const { agua: a0, prioridad: p0, estado: e0 } = req.body;
  const raw = { ...(req.body.perfil ?? {}), ...(a0 != null && { agua: a0 }), ...(p0 != null && { prioridad: p0 }), ...(e0 != null && { estado: e0 }) };
  const perfil = parsePerfil(raw);
  const { agua, prioridad } = perfil;
  const historial = parseHistory(req.body.historial);
  const parcelas = parseParcelas(req.body.parcelas);
  // Con una sola parcela dibujada, sus hectáreas son las del perfil.
  if (parcelas.length === 1 && parcelas[0].hectareas && perfil.hectareas == null) perfil.hectareas = parcelas[0].hectareas;

  if (GREETING.test(pregunta ?? '')) {
    return res.json({ respuesta: HELLO, acciones: [], fuentes: [], verificado: true, origen: 'plantilla', base: 'ficha', enlaces: [] });
  }

  const estado = perfil.estado ?? inferEstado(lon);
  // El recomendador solo corre si piden una recomendación o un seguimiento de ella. El dock manda agua y prioridad
  // en cada pregunta; si siempre se calculara, la ficha crecía con datos que no vienen al caso y el modelo fallaba.
  const needsReco = pregunta && (wantsRecommendation(pregunta) || isFollowUp(pregunta));
  const reco = agua && prioridad && needsReco
    ? recommend({ estado, agua, prioridad, costos, ultimoCultivo: perfil.ultimo_cultivo, hectareas: perfil.hectareas, encharca: perfil.encharca })
    : null;

  // "¿Qué siembro?": lo contesta el código con el recomendador, sin modelo. Si falta un dato, lo pregunta.
  if (pregunta && wantsRecommendation(pregunta)) {
    if (!agua) return res.json(asking('agua'));
    if (!prioridad) return res.json(asking('prioridad'));
    // Dos o más parcelas dibujadas: se analizan juntas (el servidor reparte los cultivos del primer año).
    if (parcelas.length >= 2) {
      const finca = recommendFarm({ parcelas, estado, agua, prioridad, encharca: perfil.encharca });
      if (finca) {
        return res.json({
          respuesta: explainFarm(finca, !perfil.estado), acciones: [], fuentes: ['SIAP'], verificado: true,
          origen: 'motor', base: 'ficha', enlaces: [], recomendacion_finca: finca,
          afinar: pendientes(raw, perfil).filter((q) => !q.obligatoria && q.campo !== 'hectareas' && q.campo !== 'ultimo_cultivo'),
        });
      }
    }
    if (reco) {
      // Se comparan los años secos de NASA (en esta parcela) con los años de pérdidas del SIAP, solo en temporal.
      let corroboracion = null;
      if (agua === 'temporal') {
        try {
          const { rows } = await getClimate(lat, lon);
          corroboracion = corroborate({ clima: summarizeClimate(rows), filas: loadSiap()?.filas, estado, cultivo: reco.rotacion[0].cultivo });
        } catch { /* sin clima no hay comparación; la recomendación sale igual */ }
      }
      return res.json({
        respuesta: explainRecommendation(reco, !perfil.estado) + (corroboracion ? ` Comparé con la lluvia de NASA en tu parcela (${reco.rotacion[0].cultivo}): ${corroboracion.lectura} [NASA POWER, SIAP]` : ''),
        acciones: [], fuentes: corroboracion ? ['SIAP', 'NASA POWER'] : ['SIAP'], verificado: true,
        origen: 'motor', base: 'ficha', enlaces: [], recomendacion: reco, corroboracion,
        // Preguntas opcionales que todavía no contesta: con ellas la recomendación se afina.
        afinar: pendientes(raw, perfil).filter((q) => !q.obligatoria),
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
    agricultor: reco ? perfil : {}, // lo que dijo el agricultor solo importa si hay recomendación que explicar
  });
  const result = await answer({ ficha, pregunta, historial });
  // `base` dice de dónde sacó el modelo lo que dijo. Con la plantilla o con un "No tengo ese dato" no usó nada extra.
  const usedExtra = result.origen === 'llm' && !REFUSAL.test(result.respuesta);
  res.json({ ...result, base: usedExtra ? contexto.base : 'ficha', enlaces: usedExtra ? contexto.enlaces : [] });
});

export default router;

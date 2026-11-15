import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { parseCoords } from '../lib/coords.js';
import { getClimate, summarizeClimate } from '../sources/nasaPower.js';
import { findLocal } from '../llm/contexto.js';
import { climatologia } from '../llm/climatologia.js';
import { detectarTema, redactar } from '../llm/respuestas.js';
import { actionsFor } from '../llm/acciones.js';
import { verifyNumbers } from '../llm/verificador.js';
import { askModelStream } from '../llm/ollama.js';
import { getSoil, summarizeSoil } from '../sources/soilGrids.js';
import { getForecast } from '../sources/openMeteo.js';
import { findContext } from '../llm/contexto.js';
import { cropFacts, detectCrop, loadSiap } from '../llm/siap.js';
import { riesgoPorEscenarios } from '../llm/riesgo-clima.js';
import { buildProceso } from '../llm/proceso.js';
import { corroborate } from '../llm/corroboracion.js';
import { buildFicha } from '../llm/ficha.js';
import { REFUSAL, answer } from '../llm/responder.js';
import { inferEstado } from '../llm/recomendador.js';
import { stateAt } from '../lib/state.js';
import { parsePerfil } from '../llm/perfil.js';
import { NOTA_FUERA_DE_TEMA, TEMAS } from '../llm/temas.js';
import { isFollowUp, wantsRecommendation } from '../llm/intencion.js';
import { compactPlot, explainPlot, recommendPlot } from './recomendar.js';
import { DELEGADAS, esMaiz, intencionMaiz, necesitaClima, necesitaSuelo, redactarMaiz, sugerenciasMaiz } from '../llm/maiz.js';

const router = Router();
// Preguntas sobre el riesgo del maíz por la lluvia: las contesta el modelo entrenado (solo maíz), con su aviso.
const RIESGO = /(riesg|perdid|siniestr|sequi|seco|llue|llov|lluvia)/;
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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

// Campos del perfil que otro agente agregará a perfil.js (qué planta ahora, cada cuánto riega). Si faltan o vienen raros, se ignoran.
function extraPerfil(p) {
  const out = {};
  if (typeof p?.cultivo_actual === 'string' && p.cultivo_actual !== 'no_se') out.cultivo_actual = p.cultivo_actual.slice(0, 40);
  if (typeof p?.riego_tipo === 'string' && p.riego_tipo !== 'no_se') out.riego_tipo = p.riego_tipo.slice(0, 40);
  const d = Number(p?.riego_frecuencia_dias);
  if (Number.isFinite(d) && d >= 1 && d <= 60) out.riego_frecuencia_dias = Math.round(d);
  return out;
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

// POST /api/asistente { lat, lon, pregunta?, agua?, prioridad?, estado?, historial? }
//   -> { respuesta, acciones, fuentes, verificado, origen, base, enlaces, preguntar?, recomendacion? }
// Sin pregunta devuelve el resumen inicial de la parcela.
// Prepara la respuesta: devuelve { final } si el código ya la tiene, o { llm } con lo que hay que preguntarle al modelo.
async function resolver(req) {
  const res = { json: (final) => ({ final }) }; // así el resto del código sigue con `return res.json(...)`
  const { lat, lon } = parseCoords(req.body);
  const { pregunta } = req.body;
  // Cada respuesta lleva `proceso`: los pasos reales que se siguieron (para la pantalla "Cómo llegó a la respuesta").
  const info = {};
  const sendJson = res.json.bind(res);
  res.json = (body) => sendJson(body && typeof body === 'object' && !Array.isArray(body) ? { ...body, proceso: buildProceso(body, info) } : body);
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

  // Estado dicho por el agricultor o, si no, el de los límites del INEGI. null = fuera de Gto y Qro: el motor no recomienda.
  const regionEstado = perfil.estado ?? stateAt(lat, lon);
  // shortcut: fuera de Gto y Qro las plantillas (maíz, SIAP) siguen con el estado adivinado por longitud; que digan "fuera del Bajío" si hace falta.
  const estado = regionEstado ?? inferEstado(lon);
  // "¿Qué siembro después del maíz?": el último cultivo es el maíz de la pregunta (lo contesta el recomendador de abajo).
  const idMaiz = pregunta && esMaiz(pregunta) ? intencionMaiz(pregunta) : null;
  if (idMaiz === 'despues') perfil.ultimo_cultivo = 'maiz';
  // El recomendador solo corre si piden una recomendación o un seguimiento de ella. El dock manda agua y prioridad
  // en cada pregunta; si siempre se calculara, la ficha crecía con datos que no vienen al caso y el modelo fallaba.
  const needsReco = pregunta && (wantsRecommendation(pregunta) || isFollowUp(pregunta));
  // Maíz: respuestas específicas con desglose (producción en tu parcela, decisión, ciclo, precio, riego, comparación...), calculadas por el código.
  // Una pregunta de maíz que no entendemos NO se manda a las tarjetas (podían traer una que no responde): se dice que no hay ese dato.
  const temaPrev = pregunta ? detectarTema(pregunta) : null;
  if (idMaiz === 'helada' && temaPrev !== 'peligro') {
    const h = await porPlantilla('heladas', pregunta, lat, lon, false, perfil); // las heladas son del clima (NASA), no del modelo de lluvia
    if (h) return res.json(h);
  }
  if (pregunta && esMaiz(pregunta) && !['peligro', 'insumos'].includes(temaPrev) && !DELEGADAS.includes(idMaiz)) {
    const id = idMaiz;
    const extra = extraPerfil(req.body.perfil);
    const ha = perfil.hectareas ?? (parcelas.length >= 2 && parcelas.every((p) => p.hectareas) ? parcelas.reduce((t, p) => t + p.hectareas, 0) : undefined);
    const ctx = { estado, perfil: { ...perfil, ...extra, hectareas: ha }, lat, lon };
    if (id && necesitaClima(id)) {
      try { ctx.rows = (await getClimate(lat, lon)).rows; ctx.clima = summarizeClimate(ctx.rows); } catch { /* sin clima, la respuesta sale sin esas partes */ }
    }
    if (necesitaSuelo(id)) { try { ctx.suelo = summarizeSoil((await getSoil(lat, lon)).soil); } catch { /* sin suelo, la respuesta lo dice */ } }
    const m = id ? redactarMaiz(id, pregunta, ctx) : (temaPrev || /(para que sirve|que es|que son|como funciona)/.test(norm(pregunta)) ? null : sugerenciasMaiz());
    if (m?.preguntar) return res.json(asking(m.preguntar));
    if (m) return res.json({ respuesta: m.respuesta, acciones: [], fuentes: m.fuentes, verificado: true, origen: m.origen ?? 'plantilla', tema: `maiz-${id ?? 'sin-dato'}`, base: 'ficha', enlaces: m.enlaces ?? [], ...(m.datos && { datos: m.datos }), ...(m.datos?.riesgo && { riesgo_modelo: m.datos.riesgo }) });
  }

  if (pregunta && wantsRecommendation(pregunta)) {
    // Los datos del SIAP son de Guanajuato y Querétaro: fuera de ahí (y sin estado dicho por el agricultor) no se recomienda.
    if (!regionEstado) {
      return res.json({ respuesta: 'Esta parcela está fuera de Guanajuato y Querétaro, y mis datos de cultivos (SIAP) son solo de esos dos estados, así que no te recomiendo cultivos aquí. Si de todos modos quieres verlos, dime de cuál de los dos estados quieres la referencia.', acciones: [], fuentes: [], verificado: true, origen: 'motor', base: 'ficha', enlaces: [] });
    }
  }
  // Es el mismo motor de POST /api/recomendar (clima NASA, suelo y cultivos.json): el chat y la pantalla dicen lo mismo.
  const reco = agua && prioridad && needsReco && regionEstado ? await recommendPlot({ lat, lon, agua, prioridad, estado: regionEstado }) : null;

  // "¿Qué siembro?": lo contesta el código con el recomendador, sin modelo. Si falta un dato, lo pregunta.
  if (pregunta && wantsRecommendation(pregunta)) {
    if (!agua) return res.json(asking('agua'));
    if (!prioridad) return res.json(asking('prioridad'));
    if (reco) {
      // Se comparan los años secos de NASA (en esta parcela) con los años de pérdidas del SIAP, solo en temporal.
      const corroboracion = agua === 'temporal'
        ? corroborate({ clima: reco.clima, filas: loadSiap()?.filas, estado: reco.estado, cultivo: reco.rotacion[0].cultivo })
        : null;
      return res.json({
        respuesta: explainPlot(reco) + (corroboracion ? ` Comparé con las pérdidas que reporta el SIAP (${reco.rotacion[0].cultivo}): ${corroboracion.lectura} [NASA POWER, SIAP]` : ''),
        acciones: [], fuentes: ['NASA POWER', 'SoilGrids', 'SIAP'], verificado: true,
        origen: 'motor', base: 'ficha', enlaces: [], recomendacion: reco, corroboracion,
      });
    }
  }

  // Riesgo del maíz según la lluvia: lo calcula el modelo entrenado y lo redacta el código (el modelo de lenguaje no toca estos números).
  if (pregunta && detectCrop(pregunta) === 'maiz' && RIESGO.test(norm(pregunta)) && !/helad|hiela|fri[oa]/.test(norm(pregunta))) {
    try {
      const { rows: filas } = await getClimate(lat, lon);
      const riesgo = riesgoPorEscenarios({ estado, cultivo: 'maiz', clima: summarizeClimate(filas) });
      if (riesgo) {
        return res.json({
          respuesta: riesgo.lectura, acciones: [], fuentes: ['SIAP', 'NASA POWER'], verificado: true,
          origen: 'modelo', base: 'ficha', enlaces: [], riesgo_modelo: riesgo,
        });
      }
    } catch { /* sin clima no hay estimación: sigue el camino normal */ }
  }


  // Preguntas frecuentes: las contesta el código con plantilla y cita puesta por él (sin modelo, sin Wikipedia).
  const tema = pregunta ? detectarTema(pregunta) : null;
  const plantilla = tema && await porPlantilla(tema, pregunta, lat, lon, historial.length > 0, { ...perfil, ...extraPerfil(req.body.perfil) });
  if (plantilla) return res.json(plantilla);

  // La ficha solo lleva lo que la pregunta pide (contexto chico = modelo más rápido y menos errores).
  const q = (pregunta ?? '').toLowerCase();
  const [{ rows }, suelo, pronostico, contexto] = await Promise.all([
    getClimate(lat, lon),
    !pregunta || /(suelo|tierra|ph|arcilla|arena|textura|carbono)/.test(q) ? getSoil(lat, lon).then(({ soil }) => summarizeSoil(soil)) : null,
    !pregunta || /(semana|dias|hoy|manana|mañana|llov|lluvi|temperatura|pronostico|pronóstico|clima)/.test(q) ? getForecast(lat, lon) : null,
    findContext(pregunta),
  ]);
  const ficha = buildFicha({
    clima: summarizeClimate(rows),
    suelo,
    pronostico,
    conocimiento: contexto.items,
    siap: pregunta ? cropFacts(pregunta) : null,
    recomendacion: reco ? compactPlot(reco) : null,
    agricultor: reco ? perfil : {}, // lo que dijo el agricultor solo importa si hay recomendación que explicar
  });
  return { llm: { ficha, pregunta, historial, contexto } };
}

// Plantilla del tema detectado, o null si no se puede (entonces contesta el modelo). Solo pide los datos que el tema necesita.
async function porPlantilla(tema, pregunta, lat, lon, hayHistorial, perfil) {
  const ctx = {};
  if (tema === 'fuera' && (hayHistorial || findLocal(pregunta).length)) return null; // seguimiento o tema de la base de conocimiento: // la base de conocimiento sí sabe de esto
  if (!['peligro', 'insumos', 'siap', 'cultivo', 'pronostico', 'suelo', 'frutales'].includes(tema)) {
    const { rows } = await getClimate(lat, lon);
    ctx.resumen = summarizeClimate(rows);
    ctx.clim = climatologia(rows);
  }
  ctx.perfil = perfil;
  if (tema === 'pronostico') ctx.pronostico = await getForecast(lat, lon);
  if (tema === 'suelo') ctx.suelo = summarizeSoil((await getSoil(lat, lon)).soil);
  if (tema === 'siap' || tema === 'cultivo') ctx.siap = cropFacts(pregunta);
  const r = redactar(tema, pregunta, ctx);
  // Cada número del texto debe estar en los datos con que se redactó; si no, mejor que conteste el modelo.
  if (!r || !verifyNumbers(r.respuesta, r.datos).ok) return null;
  const conAccion = ['secos', 'anio', 'suelo'].includes(tema);
  return {
    respuesta: r.respuesta, acciones: conAccion ? actionsFor(r.respuesta) : [], fuentes: r.fuentes,
    verificado: true, origen: 'plantilla', tema, base: 'ficha', enlaces: [], ...(r.datos && { datos: r.datos }), ...(r.preguntar && { preguntar: r.preguntar }),
  };
}

async function conModelo({ ficha, pregunta, historial, contexto }, ask) {
  const result = await answer({ ficha, pregunta, historial, ask });
  // `base` dice de dónde sacó el modelo lo que dijo. Con la plantilla o con un "No tengo ese dato" no usó nada extra.
  const usedExtra = result.origen === 'llm' && !REFUSAL.test(result.respuesta);
  const out = { ...result, base: usedExtra ? contexto.base : 'ficha', enlaces: usedExtra ? contexto.enlaces : [] };
  return { ...out, proceso: buildProceso(out) };
}

router.post('/', async (req, res) => {
  const r = await resolver(req);
  res.json(r.final ?? await conModelo(r.llm));
});

// POST /api/asistente/stream: mismo cuerpo y misma respuesta final, pero en líneas JSON (NDJSON) mientras el modelo escribe:
//   {"tipo":"delta","texto":"..."} (0 o más)  y al final  {"tipo":"final", ...respuesta de POST /api/asistente}.
// El texto de los "delta" aún NO está verificado: al llegar "final", el front debe reemplazarlo por `respuesta`.
router.post('/stream', async (req, res) => {
  const r = await resolver(req); // si falla aquí, responde el error JSON normal (400/502)
  res.set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' });
  const send = (o) => res.write(JSON.stringify(o) + '\n');
  try {
    const final = r.final ?? await conModelo(r.llm, (f, q, o) => askModelStream(f, q, { ...o, onDelta: (texto) => send({ tipo: 'delta', texto }) }));
    send({ tipo: 'final', ...final });
  } catch (err) {
    send({ tipo: 'error', error: err.message });
  }
  res.end();
});

export default router;

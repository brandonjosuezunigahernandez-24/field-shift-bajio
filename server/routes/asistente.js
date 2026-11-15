import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { parseCoords } from '../lib/coords.js';
import { getClimate, summarizeClimate } from '../sources/nasaPower.js';
import { findLocal } from '../llm/contexto.js';
import { climatologia } from '../llm/climatologia.js';
import { detectarTema, redactar } from '../llm/respuestas.js';
import { accionesPara, actionsFor } from '../llm/acciones.js';
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
import { compactReco, explainFarm, explainRecommendation, inferEstado, recommend, recommendFarm } from '../llm/recomendador.js';
import { parsePerfil, pendientes } from '../llm/perfil.js';
import { NOTA_FUERA_DE_TEMA, TEMAS } from '../llm/temas.js';
import { isFollowUp, wantsRecommendation } from '../llm/intencion.js';
import { DELEGADAS, esMaiz, intencionMaiz, necesitaClima, necesitaSuelo, redactarMaiz, serie, sugerenciasMaiz } from '../llm/maiz.js';
import { conGraficas, graficasCultivoPregunta, graficasFinca, graficasMaiz, graficasPlantilla, graficasReco } from '../llm/graficas.js';
import { ID_MAIZ, TEMAS_PLANTILLA, respaldoSeguro } from '../llm/intencion-ml.js';
import { conCultivoActual, seguimiento } from '../llm/seguimiento.js';
import { claro } from '../llm/claro.js';

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

// POST /api/asistente { lat, lon, pregunta?, agua?, prioridad?, estado?, costos?, historial? }
//   -> { respuesta, acciones, fuentes, verificado, origen, base, enlaces, preguntar?, recomendacion? }
// Sin pregunta devuelve el resumen inicial de la parcela.
// Prepara la respuesta: devuelve { final } si el código ya la tiene, o { llm } con lo que hay que preguntarle al modelo.
async function resolver(req) {
  const res = { json: (final) => ({ final }) }; // así el resto del código sigue con `return res.json(...)`
  const { lat, lon } = parseCoords(req.body);
  let { pregunta, costos } = req.body;
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
  // "¿y el frijol?" usa la pregunta anterior; "¿cuánto voy a cosechar?" con maíz sembrado es del maíz (llm/seguimiento.js).
  if (pregunta) pregunta = conCultivoActual(seguimiento(pregunta, historial), extraPerfil(req.body.perfil).cultivo_actual);
  const parcelas = parseParcelas(req.body.parcelas);
  // Con una sola parcela dibujada, sus hectáreas son las del perfil.
  if (parcelas.length === 1 && parcelas[0].hectareas && perfil.hectareas == null) perfil.hectareas = parcelas[0].hectareas;

  if (GREETING.test(pregunta ?? '')) {
    return res.json({ respuesta: HELLO, acciones: [], fuentes: [], verificado: true, origen: 'plantilla', base: 'ficha', enlaces: [] });
  }

  const estado = perfil.estado ?? inferEstado(lon);
  // Respaldo con aprendizaje automático: solo cuando las palabras clave no saben qué hacer y el clasificador está seguro (llm/intencion-ml.js).
  const ml = respaldoSeguro(pregunta);
  // "¿Qué siembro después del maíz?": el último cultivo es el maíz de la pregunta (lo contesta el recomendador de abajo).
  const idMaiz = pregunta && esMaiz(pregunta) ? (intencionMaiz(pregunta) ?? ID_MAIZ[ml?.intencion] ?? null) : null;
  if (idMaiz === 'despues') perfil.ultimo_cultivo = 'maiz';
  // El recomendador solo corre si piden una recomendación o un seguimiento de ella. El dock manda agua y prioridad
  // en cada pregunta; si siempre se calculara, la ficha crecía con datos que no vienen al caso y el modelo fallaba.
  const pideReco = pregunta && (wantsRecommendation(pregunta) || ml?.intencion === 'recomendar');
  const needsReco = pideReco || (pregunta && isFollowUp(pregunta));
  const reco = agua && prioridad && needsReco
    ? recommend({ estado, agua, prioridad, costos, ultimoCultivo: perfil.ultimo_cultivo, cultivoActual: idMaiz === 'despues' ? 'maiz' : extraPerfil(req.body.perfil).cultivo_actual, hectareas: perfil.hectareas, encharca: perfil.encharca })
    : null;

  // Maíz: respuestas específicas con desglose (producción en tu parcela, decisión, ciclo, precio, riego, comparación...), calculadas por el código.
  // Una pregunta de maíz que no entendemos NO se manda a las tarjetas (podían traer una que no responde): se dice que no hay ese dato.
  const temaPrev = pregunta ? detectarTema(pregunta) : null;
  if (idMaiz === 'helada' && !['peligro', 'apoyos'].includes(temaPrev)) {
    const h = await porPlantilla('heladas', pregunta, lat, lon, false, perfil); // las heladas son del clima (NASA), no del modelo de lluvia
    if (h) return res.json(h);
  }
  if (pregunta && esMaiz(pregunta) && !['peligro', 'insumos', 'apoyos', 'credito', 'tarjeta'].includes(temaPrev) && !DELEGADAS.includes(idMaiz)) {
    const id = idMaiz;
    const extra = extraPerfil(req.body.perfil);
    const ha = perfil.hectareas ?? (parcelas.length >= 2 && parcelas.every((p) => p.hectareas) ? parcelas.reduce((t, p) => t + p.hectareas, 0) : undefined);
    const ctx = { estado, perfil: { ...perfil, ...extra, hectareas: ha }, lat, lon };
    if (id && necesitaClima(id)) {
      try { ctx.rows = (await getClimate(lat, lon)).rows; ctx.clima = summarizeClimate(ctx.rows); } catch { /* sin clima, la respuesta sale sin esas partes */ }
    }
    if (necesitaSuelo(id)) { try { ctx.suelo = summarizeSoil((await getSoil(lat, lon)).soil); } catch { /* sin suelo, la respuesta lo dice */ } }
    const m = id ? redactarMaiz(id, pregunta, ctx) : (temaPrev || ml || /(para que sirve|que es\b|que son\b|como funciona)/.test(norm(pregunta)) ? null : sugerenciasMaiz());
    if (m?.preguntar) return res.json(asking(m.preguntar));
    if (m) return res.json({ respuesta: m.respuesta, acciones: [], fuentes: m.fuentes, verificado: true, origen: m.origen ?? 'plantilla', tema: `maiz-${id ?? 'sin-dato'}`, base: 'ficha', enlaces: m.enlaces ?? [], ...(m.datos && { datos: m.datos }), ...(m.datos?.riesgo && { riesgo_modelo: m.datos.riesgo }), ...conGraficas(graficasMaiz(id, m.datos, { estado, pregunta })) });
  }

  // "¿Qué siembro?": lo contesta el código con el recomendador, sin modelo. Si falta un dato, lo pregunta.
  if (pideReco) {
    // Los datos del SIAP son de Guanajuato y Querétaro: fuera de ahí (y sin estado dicho por el agricultor) no se recomienda.
    if (!perfil.estado && (lat < 19.9 || lat > 21.9 || lon < -102.2 || lon > -99)) {
      return res.json({ respuesta: 'Esta parcela está fuera de Guanajuato y Querétaro, y mis datos de cultivos (SIAP) son solo de esos dos estados, así que no te recomiendo cultivos aquí. Si de todos modos quieres verlos, dime de cuál de los dos estados quieres la referencia.', acciones: [], fuentes: [], verificado: true, origen: 'motor', base: 'ficha', enlaces: [] });
    }
    if (!agua) return res.json(asking('agua'));
    if (!prioridad) return res.json(asking('prioridad'));
    // Dos o más parcelas dibujadas: se analizan juntas (el servidor reparte los cultivos del primer año).
    if (parcelas.length >= 2) {
      const finca = recommendFarm({ parcelas, estado, agua, prioridad, encharca: perfil.encharca });
      if (finca) {
        return res.json({
          respuesta: explainFarm(finca, !perfil.estado), acciones: [], fuentes: ['SIAP'], verificado: true,
          origen: 'motor', base: 'ficha', enlaces: [], recomendacion_finca: finca, ...conGraficas(graficasFinca(finca)),
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
        respuesta: explainRecommendation(reco, !perfil.estado) + (corroboracion ? ` Comparé con la lluvia de NASA en tu parcela (${reco.rotacion[0].cultivo}): ${corroboracion.corta} [NASA POWER, SIAP]` : ''),
        acciones: [], fuentes: corroboracion ? ['SIAP', 'NASA POWER'] : ['SIAP'], verificado: true,
        origen: 'motor', base: 'ficha', enlaces: [], recomendacion: reco, corroboracion, ...conGraficas(graficasReco(reco)),
        // Preguntas opcionales que todavía no contesta: con ellas la recomendación se afina.
        afinar: pendientes(raw, perfil).filter((q) => !q.obligatoria),
      });
    }
  }

  // "¿Por qué ese cultivo?" tras una recomendación: las razones las da el recomendador, no el modelo de lenguaje (inventaba puntajes).
  if (reco && !pideReco && /por ?que/.test(norm(pregunta))) {
    const primero = reco.rotacion[0];
    const top = reco.cultivos.find((c) => c.id === primero.cultivo) ?? reco.cultivos[0];
    return res.json({
      respuesta: `Puse ${top.nombre ?? top.id} primero (puntaje ${top.puntaje} de 100). ${(top.razones ?? []).filter((r) => !/^Puntaje/.test(r)).slice(0, 3).join(' ')}${primero.porque ? ` ${primero.porque}` : ''} [SIAP]`.replace(/\s+/g, ' ').trim(),
      acciones: [], fuentes: ['SIAP'], verificado: true, origen: 'motor', tema: 'recomendar-porque', base: 'ficha', enlaces: [], recomendacion: reco, ...conGraficas(graficasReco(reco)),
    });
  }
  // Riesgo del maíz según la lluvia: lo calcula el modelo entrenado y lo redacta el código (el modelo de lenguaje no toca estos números).
  if (pregunta && detectCrop(pregunta) === 'maiz' && RIESGO.test(norm(pregunta)) && !/helad|hiela|\bfri[oa]/.test(norm(pregunta)) && !['apoyos', 'credito', 'tarjeta'].includes(temaPrev)) {
    try {
      const { rows: filas } = await getClimate(lat, lon);
      const riesgo = riesgoPorEscenarios({ estado, cultivo: 'maiz', clima: summarizeClimate(filas) });
      if (riesgo) {
        return res.json({
          respuesta: riesgo.lectura, acciones: [], fuentes: ['SIAP', 'NASA POWER'], verificado: true,
          origen: 'modelo', base: 'ficha', enlaces: [], riesgo_modelo: riesgo,
          ...conGraficas(graficasMaiz('riesgo', { riesgo: riesgo.escenarios, s: serie(estado, 'Temporal') }, { estado })),
        });
      }
    } catch { /* sin clima no hay estimación: sigue el camino normal */ }
  }


  // Preguntas frecuentes: las contesta el código con plantilla y cita puesta por él (sin modelo, sin Wikipedia).
  const tema = temaPrev === 'tarjeta' ? null : ml?.intencion ? (TEMAS_PLANTILLA.includes(ml.intencion) ? ml.intencion : null) : pregunta ? detectarTema(pregunta) : null;
  const plantilla = tema && await porPlantilla(tema, pregunta, lat, lon, historial.length > 0, { ...perfil, ...extraPerfil(req.body.perfil) });
  if (plantilla) return res.json(plantilla);
  // Confianza baja y nada que la respalde: decirlo y sugerir 3 preguntas que sí sabe (solo si la validación lo aprobó: modelo.negar).
  if (ml?.sugerencias && !historial.length) {
    return res.json({ respuesta: `No tengo ese dato. Te puedo contestar, por ejemplo: ${ml.sugerencias.join(' ')}`, acciones: [], fuentes: [], verificado: true, origen: 'plantilla', base: 'ficha', enlaces: [], sugerencias: ml.sugerencias });
  }

  // La ficha solo lleva lo que la pregunta pide (contexto chico = modelo más rápido y menos errores).
  const q = (pregunta ?? '').toLowerCase();
  const [{ rows }, suelo, pronostico, contexto] = await Promise.all([
    getClimate(lat, lon),
    !pregunta || /(suelo|tierra|ph|arcilla|arena|textura|carbono)/.test(q) ? getSoil(lat, lon).then(({ soil }) => summarizeSoil(soil)) : null,
    !pregunta || /(semana|dias|hoy|manana|mañana|llov|lluvi|temperatura|pronostico|pronóstico|clima)/.test(q) ? getForecast(lat, lon) : null,
    findContext(pregunta),
  ]);
  const siap = pregunta ? cropFacts(pregunta) : null;
  const ficha = buildFicha({
    clima: summarizeClimate(rows),
    suelo,
    pronostico,
    conocimiento: contexto.items,
    siap,
    recomendacion: reco ? compactReco(reco) : null,
    agricultor: reco ? perfil : {}, // lo que dijo el agricultor solo importa si hay recomendación que explicar
  });
  return { llm: { ficha, pregunta, historial, contexto, graficas: graficasCultivoPregunta(pregunta, siap) } };
}

// Plantilla del tema detectado, o null si no se puede (entonces contesta el modelo). Solo pide los datos que el tema necesita.
async function porPlantilla(tema, pregunta, lat, lon, hayHistorial, perfil) {
  const ctx = {};
  // Con plática, solo un seguimiento corto ("¿y eso?", "¿por qué?") va al modelo; "¿quién ganó el mundial?" sigue fuera de tema.
  const corta = /^\W*(y|pero|entonces|o sea|osea|por que|porque)\b/i.test(pregunta) || pregunta.trim().split(/\s+/).length <= 3;
  if (tema === 'fuera' && ((hayHistorial && corta) || findLocal(pregunta).length)) return null; // seguimiento o tema de la base de conocimiento: // la base de conocimiento sí sabe de esto
  if (!['peligro', 'insumos', 'siap', 'cultivo', 'pronostico', 'suelo', 'frutales', 'desglose', 'apoyos', 'credito'].includes(tema)) {
    const { rows } = await getClimate(lat, lon);
    ctx.resumen = summarizeClimate(rows);
    ctx.clim = climatologia(rows);
  }
  ctx.perfil = ['apoyos', 'credito'].includes(tema) ? { ...perfil, estado: perfil.estado ?? inferEstado(lon) } : perfil; // igual que «Qué hacer»
  if (tema === 'pronostico') ctx.pronostico = await getForecast(lat, lon);
  if (tema === 'aptitud') ctx.suelo = await Promise.race([getSoil(lat, lon).then(({ soil }) => summarizeSoil(soil)), new Promise((ok) => setTimeout(ok, 4000, null))]).catch(() => null); // el pH compara con lo que aguanta el cultivo
  if (tema === 'suelo') ctx.suelo = summarizeSoil((await getSoil(lat, lon)).soil);
  if (tema === 'siap' || tema === 'cultivo') ctx.siap = cropFacts(pregunta);
  const r = redactar(tema, pregunta, ctx);
  // Cada número del texto debe estar en los datos con que se redactó; si no, mejor que conteste el modelo.
  if (!r || !verifyNumbers(r.respuesta, r.datos).ok) return null;
  const conAccion = ['secos', 'anio', 'suelo'].includes(tema);
  return {
    respuesta: r.respuesta, acciones: conAccion ? actionsFor(r.respuesta) : [], fuentes: r.fuentes,
    verificado: true, origen: 'plantilla', tema, base: 'ficha', enlaces: [], ...(r.datos && { datos: r.datos }), ...(r.preguntar && { preguntar: r.preguntar }),
    ...conGraficas(graficasPlantilla(tema, pregunta, ctx, r.datos)),
  };
}

async function conModelo({ ficha, pregunta, historial, contexto, graficas }, ask) {
  const result = await answer({ ficha, pregunta, historial, ask });
  // `base` dice de dónde sacó el modelo lo que dijo. Con la plantilla o con un "No tengo ese dato" no usó nada extra.
  const usedExtra = result.origen === 'llm' && !REFUSAL.test(result.respuesta);
  // Las tarjetas locales ahora se eligen por parecido en llm/prompt.js: si citó [Base local], la base es el conocimiento.
  const base = usedExtra ? (contexto.base === 'ficha' && result.fuentes.includes('Base local') ? 'conocimiento' : contexto.base) : 'ficha';
  const out = { ...result, base, enlaces: usedExtra ? contexto.enlaces : [], ...conGraficas(graficas) };
  return { ...out, proceso: buildProceso(out) };
}

// `que_hacer`: hasta 3 acciones con fuente (llm/acciones.js), añadidas a la respuesta final sin tocar lo demás.
// Nunca en saludos, fuera de tema, ni cuando el asistente está preguntando algo o no supo contestar.
const SIN_CLIMA = ['peligro', 'insumos', 'siap', 'cultivo', 'pronostico', 'suelo', 'frutales', 'desglose', 'apoyos', 'credito'];
async function conQueHacer(body, req) {
  try {
    const { pregunta } = req.body;
    // Sin tema y con `preguntar` = el asistente pide agua o prioridad antes de contestar (asking): ahí no van acciones.
    if (!pregunta || GREETING.test(pregunta) || (body.preguntar && !body.tema) || body.sugerencias) return { ...body, que_hacer: [] };
    if (body.tema === 'fuera') return { ...body, que_hacer: [] };
    // Sin tema en la respuesta (la contestó el modelo o el recomendador): se toma el de las palabras, salvo 'fuera',
    // porque si llegó al modelo es que la base de conocimiento sí sabía del tema.
    const t = detectarTema(pregunta);
    const tema = body.tema ?? (body.recomendacion || body.recomendacion_finca ? 'recomendar' : t === 'fuera' ? null : t);
    const { lat, lon } = parseCoords(req.body);
    const { agua, estado } = req.body;
    const perfil = parsePerfil({ ...(req.body.perfil ?? {}), ...(agua != null && { agua }), ...(estado != null && { estado }) });
    perfil.estado ??= inferEstado(lon);
    let datos = null;
    if (!SIN_CLIMA.includes(tema)) { try { datos = summarizeClimate((await getClimate(lat, lon)).rows); } catch { /* sin clima: acciones sin el dato */ } }
    const que_hacer = accionesPara({ tema, cultivo: detectCrop(pregunta), perfil, datos, pregunta });
    // "¿Qué hago si…?" pide acciones: la respuesta empieza por la primera, y los datos quedan como respaldo.
    const pideAccion = /que (hago|hacer|puedo hacer|debo hacer|le hago)|como (cuido|mejoro|protejo|evito)/.test(norm(pregunta));
    const respuesta = pideAccion && que_hacer.length && body.respuesta && !body.respuesta.includes('Qué hacer')
      ? `${que_hacer[0].accion} [${que_hacer[0].fuente}] Más ideas abajo, en «Qué hacer». ${body.respuesta}` : body.respuesta;
    // Cierra con lo que conviene hacer (la misma acción de «Qué hacer»), si cabe en 5 frases y no lo dijo ya.
    const n = (respuesta ?? '').split(/(?<=[.!?])\s+/).filter((x) => x.trim().length > 2).length;
    const corta = que_hacer[0]?.accion.split(/\s*[(;:]/)[0].replace(/[.,]$/, ''); // sin paréntesis ni detalles: esos van en «Qué hacer»
    const cierre = !pideAccion && corta && n < 5 && corta.split(/\s+/).length <= 18 && !/Qué hacer/.test(respuesta ?? '') ? ` Lo que conviene: ${corta[0].toLowerCase()}${corta.slice(1)}.` : '';
    return { ...body, respuesta: claro((respuesta ?? '') + cierre), que_hacer };
  } catch {
    return { ...body, que_hacer: [] }; // las acciones nunca tumban la respuesta
  }
}

router.post('/', async (req, res) => {
  const r = await resolver(req);
  res.json(await conQueHacer(r.final ?? await conModelo(r.llm), req));
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
    send({ tipo: 'final', ...(await conQueHacer(final, req)) });
  } catch (err) {
    send({ tipo: 'error', error: err.message });
  }
  res.end();
});

export default router;

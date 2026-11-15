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
import { ETIQUETA, inferEstado, simulateRotation } from '../llm/recomendador.js';
import { stateAt } from '../lib/state.js';
import { parsePerfil } from '../llm/perfil.js';
import { NOTA_FUERA_DE_TEMA, TEMAS } from '../llm/temas.js';
import { asksWhyThisCrop, esConcepto, isFollowUp, quitarMuletillas, wantsRecommendation } from '../llm/intencion.js';
import { compactPlot, recommendPlot } from './recomendar.js';
import { aguaDicha, metaDicha, pideIncertidumbre, pidePuedoSembrar, pideSeguirIgual, respuestaIncertidumbre, respuestaPlan, respuestaPorQueNo, respuestaSeguirIgual } from '../llm/plan-chat.js';
import { DELEGADAS, esMaiz, intencionMaiz, necesitaClima, necesitaSuelo, redactarMaiz, rendPropio, serie, sugerenciasMaiz } from '../llm/maiz.js';
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
const GREETING = /^\s*(¡)?((hola|buenas|buenos d[ií]as|buen d[ií]a|buenas tardes|buenas noches|(muchas )?gracias|ok|okey|adi[oó]s|qu[eé] tal|saludos)[\s,!.¡]*)+((joven|amig[oa]|se[nñ]or|se[nñ]o|jefe)[\s!.]*)?$/i;
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
  // `let`: un seguimiento ("¿y el frijol?") se reescribe con la pregunta anterior (llm/seguimiento.js).
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
  // Muletillas de voz al inicio ("oiga joven, este... ps") fuera; el saludo se mira antes de completar la pregunta
  // (antes "buenos días" + maíz sembrado se volvía "buenos días (maíz)" y contestaba el ciclo del maíz).
  if (pregunta) pregunta = quitarMuletillas(pregunta);
  const dicha = pregunta; // tal cual la dijo (sin muletillas), antes de completarla con la plática o el perfil
  if (GREETING.test(pregunta ?? '')) {
    return res.json({ respuesta: HELLO, acciones: [], fuentes: [], verificado: true, origen: 'plantilla', base: 'ficha', enlaces: [] });
  }
  // "¿y el frijol?" usa la pregunta anterior; "¿cuánto voy a cosechar?" con maíz sembrado es del maíz (llm/seguimiento.js).
  if (pregunta) pregunta = seguimiento(pregunta, historial);
  // "Coseché 5 toneladas": de lo que tiene sembrado o, si no, de lo último que sembró (perfil).
  const cosecha = pregunta && rendPropio(norm(pregunta)) && !detectCrop(pregunta) && !esMaiz(pregunta);
  const suCultivo = extraPerfil(req.body.perfil).cultivo_actual ?? (cosecha ? perfil.ultimo_cultivo : undefined);
  if (pregunta) pregunta = conCultivoActual(pregunta, ['ninguno', 'otro', 'no_se'].includes(suCultivo) ? undefined : suCultivo);
  // Sin cultivo dicho ni en el perfil: se pregunta (antes el modelo contestaba «Es una cantidad considerable»).
  if (cosecha && !detectCrop(pregunta) && !esMaiz(pregunta)) {
    const t = rendPropio(norm(pregunta)).t ?? rendPropio(norm(pregunta)).t_ha;
    return res.json({ respuesta: `¿De qué cultivo son las ${t} toneladas? Dime, por ejemplo, «de maíz» o «de frijol», y lo comparo con el promedio de tu estado.`, acciones: [], fuentes: [], verificado: true, origen: 'plantilla', tema: 'cosecha-cultivo', base: 'ficha', enlaces: [] });
  }
  const parcelas = parseParcelas(req.body.parcelas);
  // Con una sola parcela dibujada, sus hectáreas son las del perfil.
  if (parcelas.length === 1 && parcelas[0].hectareas && perfil.hectareas == null) perfil.hectareas = parcelas[0].hectareas;

  // Estado dicho por el agricultor o, si no, el de los límites del INEGI. null = fuera de Gto y Qro: el motor no recomienda.
  const regionEstado = perfil.estado ?? stateAt(lat, lon);
  // shortcut: fuera de Gto y Qro las plantillas (maíz, SIAP) siguen con el estado adivinado por longitud; que digan "fuera del Bajío" si hace falta.
  const estado = regionEstado ?? inferEstado(lon);
  // Respaldo con aprendizaje automático: solo cuando las palabras clave no saben qué hacer y el clasificador está seguro (llm/intencion-ml.js).
  const ml = respaldoSeguro(pregunta);
  // "¿Qué siembro después del maíz?": el último cultivo es el maíz de la pregunta (lo contesta el recomendador de abajo).
  const idMaiz = pregunta && esMaiz(pregunta) ? (intencionMaiz(pregunta) ?? ID_MAIZ[ml?.intencion] ?? null) : null;
  if (idMaiz === 'despues') perfil.ultimo_cultivo = 'maiz';
  // El recomendador solo corre si piden una recomendación o un seguimiento de ella. El dock manda agua y prioridad
  // en cada pregunta; si siempre se calculara, la ficha crecía con datos que no vienen al caso y el modelo fallaba.
  // "¿Por qué?", "¿y eso por qué?", "¿por qué no maíz?" tras una plática: seguimiento de la recomendación, no pregunta nueva
  // (se mira lo que dijo, no la pregunta completada con la plática). Va antes del maíz y de "recomiéndame".
  // Sin plática solo si nombra un cultivo («¿por qué no el maíz?» como primera pregunta).
  const pideQue = (historial.length > 0 || Boolean(dicha && detectCrop(dicha))) && asksWhyThisCrop(dicha) && !esConcepto(dicha);
  const pideReco = !pideQue && pregunta && (wantsRecommendation(pregunta) || ml?.intencion === 'recomendar');
  // "¿Y si sigo igual?" y "¿Qué tan seguro es?" hablan del plan (las 3 rotaciones y su incertidumbre), no del maíz sembrado.
  const pideIgual = Boolean(dicha) && pideSeguirIgual(dicha);
  const pideDuda = Boolean(dicha) && !pideReco && pideIncertidumbre(dicha);
  // "¿Puedo sembrar maíz?" (sin "este año" ni fecha) es su lugar en el plan, como "¿Puedo sembrar frijol?".
  const puedeCultivo = Boolean(dicha) && Boolean(detectCrop(dicha)) && pidePuedoSembrar(dicha);
  const needsReco = pideReco || pideQue || pideIgual || pideDuda || (pregunta && isFollowUp(pregunta));
  // La meta o el riego dichos en la pregunta ("si quiero ganar más", "si tengo riego") ganan sobre el perfil.
  const aguaPlan = (pideReco || puedeCultivo) && dicha ? aguaDicha(dicha) ?? agua : agua;
  const metaPlan = pideReco && dicha ? metaDicha(dicha) ?? prioridad : prioridad;
  // Maíz: respuestas específicas con desglose (producción en tu parcela, decisión, ciclo, precio, riego, comparación...), calculadas por el código.
  // Una pregunta de maíz que no entendemos NO se manda a las tarjetas (podían traer una que no responde): se dice que no hay ese dato.
  const temaPrev = pregunta ? detectarTema(pregunta) : null;
  if (idMaiz === 'helada' && !['peligro', 'apoyos'].includes(temaPrev)) {
    const h = await porPlantilla('heladas', pregunta, lat, lon, false, perfil); // las heladas son del clima (NASA), no del modelo de lluvia
    if (h) return res.json(h);
  }
  if (pregunta && !pideQue && !pideIgual && !pideDuda && !puedeCultivo && esMaiz(pregunta) && !['peligro', 'insumos', 'apoyos', 'credito', 'tarjeta'].includes(temaPrev) && !DELEGADAS.includes(idMaiz)) {
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

  if (pideReco) {
    // Los datos del SIAP son de Guanajuato y Querétaro: fuera de ahí (y sin estado dicho por el agricultor) no se recomienda.
    if (!regionEstado) {
      return res.json({ respuesta: 'Esta parcela está fuera de Guanajuato y Querétaro, y mis datos de cultivos (SIAP) son solo de esos dos estados, así que no te recomiendo cultivos aquí. Si de todos modos quieres verlos, dime de cuál de los dos estados quieres la referencia.', acciones: [], fuentes: [], verificado: true, origen: 'motor', base: 'ficha', enlaces: [] });
    }
  }
  // Lo que tiene sembrado ahora (o lo último que sembró) cuenta como la temporada anterior del plan.
  const previo = idMaiz === 'despues' ? 'maiz' : extraPerfil(req.body.perfil).cultivo_actual ?? perfil.ultimo_cultivo ?? null;
  // Lo que siembra hoy, del más viejo al más nuevo (como lo manda la pantalla): es la primera de las 3 rotaciones que se comparan.
  const actual = idMaiz === 'despues' ? ['maiz'] : [perfil.ultimo_cultivo, extraPerfil(req.body.perfil).cultivo_actual].filter(Boolean);
  // Es el mismo motor de POST /api/recomendar (clima NASA, suelo y cultivos.json): el chat y la pantalla dicen lo mismo.
  const reco = aguaPlan && metaPlan && needsReco && regionEstado ? await recommendPlot({ lat, lon, agua: aguaPlan, prioridad: metaPlan, estado: regionEstado, previo, actual }) : null;
  // Ingreso esperado de 3 años: el SIAP del estado para la rotación del motor (la misma simulación del recomendador del SIAP).
  if (reco) reco.prediccion = simulateRotation({ rotacion: reco.rotacion, estado: reco.estado, agua: aguaPlan, costos, hectareas: perfil.hectareas });

  // "¿Qué siembro?": lo contesta el código con el recomendador, sin modelo. Si falta un dato, lo pregunta.
  if (pideReco) {
    if (!aguaPlan) return res.json(asking('agua'));
    if (!metaPlan) return res.json(asking('prioridad'));
    if (reco) {
      // Se comparan los años secos de NASA (en esta parcela) con los años de pérdidas del SIAP, solo en temporal.
      const corroboracion = aguaPlan === 'temporal'
        ? corroborate({ clima: reco.clima, filas: loadSiap()?.filas, estado: reco.estado, cultivo: reco.rotacion[0].cultivo })
        : null;
      return res.json({
        // Versión corta (llm/plan-chat.js); la corroboración NASA-SIAP va en `corroboracion` y en la pantalla.
        respuesta: respuestaPlan(reco),
        acciones: [], fuentes: ['NASA POWER', 'SoilGrids', 'SIAP'], verificado: true,
        origen: 'motor', base: 'ficha', enlaces: [], recomendacion: reco, corroboracion, ...conGraficas(graficasReco(reco)),
      });
    }
  }

  // "¿Por qué ese cultivo?" tras una recomendación: las razones las da el motor, no el modelo de lenguaje (inventaba puntajes).
  // Solo las razones: el `porque` del motor repite el puntaje y el riesgo que ya trae razones[0].
  if (reco && pideIgual) {
    const t = respuestaSeguirIgual(reco);
    if (t) return res.json({ respuesta: t, acciones: [], fuentes: ['NASA POWER', 'SoilGrids', 'SIAP'], verificado: true, origen: 'motor', tema: 'recomendar-igual', base: 'ficha', enlaces: [], recomendacion: reco, ...conGraficas(graficasReco(reco)) });
  }
  if (reco && pideDuda) {
    const t = respuestaIncertidumbre(reco);
    if (t) return res.json({ respuesta: t, acciones: [], fuentes: ['NASA POWER', 'SoilGrids', 'SIAP'], verificado: true, origen: 'motor', tema: 'recomendar-incertidumbre', base: 'ficha', enlaces: [], recomendacion: reco });
  }
  const nombrado = reco && dicha ? detectCrop(dicha) : null;
  if (reco && !pideReco && nombrado && (pideQue || asksWhyThisCrop(dicha))) {
    return res.json({ respuesta: respuestaPorQueNo(reco, nombrado), acciones: [], fuentes: ['NASA POWER', 'SoilGrids', 'SIAP'], verificado: true, origen: 'motor', tema: 'recomendar-porque', base: 'ficha', enlaces: [], recomendacion: reco, ...conGraficas(graficasReco(reco)) });
  }
  if (reco && !pideReco && (pideQue || asksWhyThisCrop(pregunta))) {
    const primero = reco.rotacion[0];
    const top = reco.cultivos.find((c) => c.id === primero.cultivo) ?? reco.cultivos[0];
    return res.json({
      respuesta: `Puse ${top.nombre ?? top.id} primero (puntaje ${top.puntaje} de 100). ${(top.razones ?? []).filter((r) => !/^Puntaje/.test(r)).slice(0, 3).join(' ')} [NASA POWER, SoilGrids, SIAP]`.replace(/\s+/g, ' ').trim(),
      acciones: [], fuentes: ['NASA POWER', 'SoilGrids', 'SIAP'], verificado: true, origen: 'motor', tema: 'recomendar-porque', base: 'ficha', enlaces: [], recomendacion: reco, ...conGraficas(graficasReco(reco)),
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
  // "¿Puedo sembrar frijol?": el lugar de ese cultivo en la recomendación para su parcela (mismo cálculo que "¿qué me conviene?").
  // Usa el motor de la pantalla (recommendPlot), así el chat y /api/recomendar dan el mismo lugar.
  if ((tema === 'cultivo' || puedeCultivo) && aguaPlan && prioridad && regionEstado) {
    const cultivo = detectCrop(dicha ?? pregunta);
    const r = reco ?? await recommendPlot({ lat, lon, agua: aguaPlan, prioridad, estado: regionEstado, previo, actual });
    const lugar = r.cultivos.findIndex((c) => c.id === cultivo);
    if (lugar >= 0) {
      const c = r.cultivos[lugar];
      const razones = (c.razones ?? []).filter((x) => !/^Puntaje/.test(x)).slice(0, 2).join(' ');
      return res.json({
        // El motor da 3 cultivos en temporal: "te conviene" solo al primero (antes el 3 de 3 también decía "te conviene").
        respuesta: `${lugar === 0 ? 'Sí, te conviene' : 'Sí se puede, pero hay mejores opciones'}: ${c.nombre.toLowerCase()} sale en el lugar ${lugar + 1} de ${r.cultivos.length} en tu parcela si quieres ${ETIQUETA[prioridad]} (puntaje ${c.puntaje} de 100). ${razones} [NASA POWER, SoilGrids, SIAP]`.replace(/\s+/g, ' ').trim(),
        acciones: [], fuentes: ['NASA POWER', 'SoilGrids', 'SIAP'], verificado: true, origen: 'motor', tema: 'cultivo-puedo', base: 'ficha', enlaces: [], recomendacion: r, ...conGraficas(graficasReco(r)),
      });
    }
  }
  const plantilla = tema && await porPlantilla(tema, pregunta, lat, lon, historial.length > 0, { ...perfil, ...extraPerfil(req.body.perfil), estado: perfil.estado ?? estado });
  if (plantilla) return res.json(plantilla);
  // Quemar el rastrojo: siempre la tarjeta (SADER, #MiParcelaNoSeQuema). El modelo a veces volteaba el consejo.
  if (pregunta && /quem/.test(norm(pregunta)) && /rastrojo|soca|paja/.test(norm(pregunta))) {
    const [t] = findLocal(pregunta, 1);
    if (t) return res.json({ respuesta: `${t.texto} [${t.fuente}]`, acciones: [], fuentes: [t.fuente], verificado: true, origen: 'plantilla', tema: 'suelo', base: 'conocimiento', enlaces: [] });
  }
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
  // Solo el estado de la parcela (el modelo hablaba de Guanajuato con la parcela en Querétaro); si ahí no hay datos, se dice.
  const todos = pregunta ? cropFacts(pregunta) : null;
  const delEstado = todos?.grupos.filter((g) => g.estado === estado) ?? [];
  const siap = !todos || !estado ? todos : delEstado.length ? { ...todos, grupos: delEstado } : { ...todos, grupos: [], nota: `${todos.nota ?? ''} El SIAP no reporta este cultivo en ${estado}.`.trim() };
  const ficha = buildFicha({
    clima: summarizeClimate(rows),
    suelo,
    pronostico,
    conocimiento: contexto.items,
    siap,
    recomendacion: reco ? compactPlot(reco) : null,
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
  // «No lo sé» no lleva gráfica (antes salía la lluvia de la parcela bajo «¿qué es la jamaica?»).
  const out = { ...result, base, enlaces: usedExtra ? contexto.enlaces : [], ...conGraficas(REFUSAL.test(result.respuesta) ? null : graficas) };
  return { ...out, proceso: buildProceso(out) };
}

// `que_hacer`: hasta 3 acciones con fuente (llm/acciones.js), añadidas a la respuesta final sin tocar lo demás.
// Nunca en saludos, fuera de tema, ni cuando el asistente está preguntando algo o no supo contestar.
const SIN_CLIMA = ['peligro', 'insumos', 'siap', 'cultivo', 'pronostico', 'suelo', 'frutales', 'desglose', 'apoyos', 'credito'];
async function conQueHacer(body, req) {
  try {
    const pregunta = req.body.pregunta && quitarMuletillas(req.body.pregunta);
    // Sin tema y con `preguntar` = el asistente pide agua o prioridad antes de contestar (asking): ahí no van acciones.
    if (!pregunta || GREETING.test(pregunta) || body.respuesta === HELLO || (body.preguntar && !body.tema) || body.sugerencias) return { ...body, que_hacer: [] };
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
    const pideAccion = /que (hago|hacer|puedo hacer|debo hacer|le hago|se hace|me recomiendas hacer)|como (cuido|mejoro|protejo|evito|le hago|hago para)/.test(norm(pregunta));
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

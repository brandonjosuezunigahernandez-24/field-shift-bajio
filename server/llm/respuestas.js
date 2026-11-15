// Respuestas por plantilla para las preguntas frecuentes: el código calcula, redacta y pone la cita; el modelo no interviene.
// detectarTema(pregunta) -> tema | null; redactar(tema, pregunta, ctx) -> { respuesta, fuentes, datos } | null (null = que conteste el modelo).
import { MESES } from './climatologia.js';
import { detectCrop } from './siap.js';
import { isFollowUp } from './intencion.js';
import { summarizeForecast } from './ficha.js';
import { detectarAptitud, redactarAptitud } from './aptitud.js';
import { detectarDesglose, redactarDesglose } from './desglose.js';
import { NO_ES, NO_VERIFICADO, fichaFrutal, topFrutales } from './frutales.js';

const strip = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const has = (re, q) => re.test(q);
const NASA = '[NASA POWER]';
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const mesDe = (q) => { const i = MESES.findIndex((m) => new RegExp(`\\b${m}\\b`).test(q)); return i >= 0 ? i + 1 : null; };
// "este año" / "el año pasado" -> 2024 (el último año con datos de NASA POWER; la respuesta lo dice).
const ULTIMO = 2024;
const anioDe = (q) => { const m = q.match(/\b(19\d\d|20\d\d)\b/); return m ? Number(m[1]) : /(ano pasado|este ano|ultimo ano)/.test(q) ? ULTIMO : null; };
const dia = (f) => { const [, m, d] = f.split('-').map(Number); return `${d} de ${MESES[m - 1]}`; };
const neg = (n) => (n < 0 ? `−${Math.abs(n)}` : `${n}`);

const PELIGRO = /(pesticid|plaguicid|herbicid|insecticid|fungicid|agroquimic|veneno|fumig|dosis|marca de|que (producto|quimico)|cuantos (litros|gramos|ml|cc)|cuanto (le )?(echo|aplico|pongo|rocio)|que (le )?(echo|aplico|pongo|rocio)|(fertiliz|abono|urea).*(cuanto|dosis|kilos|litros))/;
const INSUMO = /(cuesta|precio|cuanto vale|costo)/;
const INSUMOS = /(fertiliz|abono|semilla|diesel|insumo|urea|tractor)/;
const PRON = /(semana|se espera|\bhoy\b|manana|pronostico|proximos dias|proxima|va a llover|llovera|habra|^\W*llueve\W*$)/;
const TREND = /(tendencia|cambiando|cambio climatico|cada vez|que antes|llovia|va a la baja|ultimos \d+ anos|disminu|aument|empeor|mejor[ao]n? )/;
const SECOS = /(llovio poco|poca lluvia|anos? sec|sequi|\bsecos?\b|\bsecoss\b|anos? de (poca|mala) lluvia)/;
const LLUVIA = /(llov|lluvi|llue|agua(?!cate))/; // "aguacate" no es lluvia
const FRIO = /(helad|hiela|congel|\bfri[oa]|invierno|inviern|temperatura minima)/;
const CALOR = /(grados|calor|calur|temperatura maxima|temperatura|caliente)/;
const SIAP_PRECIO = /(se paga|vende|vender|venden|precio|pagan|pago por|valor de la tonelada)/;
const SIAP_RINDE = /(rinde|rendimiento|cuanto saca|saca mi|toneladas|produce)/;
const SIAP_RIESGO = /(riesgo|le va|riesgoso|pierde|perdida|siniestr|que tan seguro)/;
const DENTRO = /(llu|llov|clima|tiempo|temperatura|suelo|tierra|parcela|terreno|campo|cultiv|siembr|sembr|cosech|plant|semilla|riego|regar|agua|plaga|sequi|seco|helad|calor|frio|humed|\bsol\b|solar|precio|vende|rinde|rendimiento|riesgo|fertiliz|abono|rotacion|invernadero|finca|milpa|huerto|agricol|verdura|fruta|hortaliza|\bph\b|arcilla|arena|\bmes\b|\bano\b|verano|invierno|hectarea|ayuda|que sabes|que puedes)/;
// Frutales y perennes (el SIAP los trae aparte). "Fresa" y "aguacate" también salen en el resumen de cultivos y se siguen contestando ahí.
const FRUTAL = /(frutal|\bfrutas?\b|esparrag|arandan|frambues|zarzamor|\btunas?\b|\buvas?\b|\bnuez|nueces|naranj|manzan|durazn|guayab|limon|nopal tunero)/;
const CONCEPTO = /(para que sirve|que es\b|que son\b|como funciona|ayuda a|guard|retener|conservar)/;

export function detectarTema(pregunta = '') {
  const q = strip(pregunta);
  if (!q.trim()) return null;
  if (has(PELIGRO, q)) return 'peligro';
  if (has(INSUMO, q) && has(INSUMOS, q)) return 'insumos';
  if (detectarAptitud(q)) return 'aptitud'; // ¿se da aquí? (llm/aptitud.js)
  if (detectarDesglose(q)) return 'desglose'; // superficie, riego, municipios, pérdidas... de una fruta o verdura (llm/desglose.js)
  if (has(FRUTAL, q) && !has(CONCEPTO, q)) return 'frutales';
  if (detectCrop(q) && (has(SIAP_PRECIO, q) || has(SIAP_RINDE, q) || has(SIAP_RIESGO, q))) return 'siap';
  if (has(CONCEPTO, q)) return null;
  if (has(PRON, q)) return 'pronostico';
  if (has(TREND, q) && has(LLUVIA, q)) return 'tendencia';
  if (anioDe(q) && has(/(llov|lluvi|llue|seco|sequi|normal)/, q)) return 'anio';
  if (has(SECOS, q)) return 'secos';
  if (has(FRIO, q)) return 'heladas';
  if (has(CALOR, q)) return 'calor';
  if (has(/(radiacion|solar|\bsol\b|insolacion)/, q)) return 'radiacion';
  if (has(/(hum[ea]d|mojad)/, q) && has(/(tierra|suelo|raiz|parcela)/, q)) return 'humedad';
  if (has(LLUVIA, q)) return 'lluvia';
  if (has(/cuando (siembro|sembrar|planto|plantar|se siembra)/, q)) return 'siembra';
  if (has(/(mi suelo|\bph\b|arcilla|textura de mi|como esta (la )?tierra)/, q)) return 'suelo';
  // "¿Puedo sembrar fresas?": no hay agronomía verificada del cultivo; se dice y se da lo que sí hay (SIAP). Antes el modelo usaba la tarjeta del maíz.
  if (detectCrop(q) && has(/(puedo|se puede|conviene|vale la pena)/, q)) return 'cultivo';
  // Sin ninguna palabra del campo, el clima o los cultivos: fuera de tema (lo contesta el código; el modelo inventaba).
  if (q.trim().split(/\s+/).length >= 3 && !has(DENTRO, q) && !detectCrop(q) && !isFollowUp(q)) return 'fuera';
  return null;
}

// ctx: { clim (climatologia), resumen (summarizeClimate), pronostico, suelo (summarizeSoil), siap (cropFacts) }
export function redactar(tema, pregunta, ctx) {
  const q = strip(pregunta);
  return (REDACTORES[tema]?.(q, ctx) ?? null);
}

const out = (respuesta, fuentes, datos) => ({ respuesta, fuentes, datos });
const NOTA_HORA = 'son extremos de una hora del mes, no promedios del día';

const REDACTORES = {
  aptitud: (q, ctx) => redactarAptitud(q, ctx),
  desglose: (q) => redactarDesglose(q, detectarDesglose(q)),

  frutales: (q) => {
    const estados = ['Guanajuato', 'Querétaro'];
    const todos = estados.flatMap((e) => topFrutales(e, 50) ?? []);
    if (!todos.length) return null;
    const nombre = [...new Set(todos.map((f) => f.cultivo))].find((n) => {
      const k = strip(n);
      return q.includes(k) || q.includes(k.replace(/s$/, ''));
    });
    const cierre = `${NO_ES[0].replace(/^No entra/, 'No entra')} Es una inversión alta y tarda años en producir. Los tiempos y costos no los tengo verificados: pregunta a INIFAP o a un técnico. [SIAP]`;
    if (nombre) {
      const f = fichaFrutal(nombre);
      const frases = f.estados.map((x) => `${x.estado}: ${x.sembrada_ha_2024} ha en 2024, rinde ${x.rendimiento_2024} t/ha y ${x.riego_pct_2024} % es de riego`);
      return out(`${cap(f.cultivo)}${f.tipo === 'hortaliza perenne' ? ' (hortaliza perenne)' : ''}. ${frases.join('. ')}. ${cierre}`, ['SIAP'], { f: f.estados, anio: 2024 });
    }
    const lista = estados.map((e) => {
      const top = (topFrutales(e, 4) ?? []).map((x) => `${x.cultivo.toLowerCase()} (${Math.round(x.sembrada_ha_2024)} ha${x.tipo === 'hortaliza perenne' ? ', hortaliza perenne' : ''})`);
      return `${e}: ${top.join(', ')}`;
    });
    return out(`Los frutales y perennes con más valor, según el SIAP: ${lista.join('. ')}. ${cierre}`, ['SIAP'], { todos });
  },

  fuera: () => out('Solo contesto sobre tu parcela, el clima, el suelo y los cultivos. Pregúntame, por ejemplo, cuánto llueve, cuándo hay heladas o qué te conviene sembrar.', [], {}),

  peligro: () => out('No doy marcas, productos ni dosis de pesticidas o fertilizantes: una dosis equivocada daña el cultivo y la salud. Consulta a un técnico agrícola o a la oficina de sanidad vegetal de tu estado. Sí te ayudo con el clima, el suelo y qué sembrar.', [], {}),

  insumos: () => out('No tengo precios de fertilizantes ni de otros insumos porque no hay una fuente confirmada. Sí tengo los precios de venta de algunos cultivos [SIAP]: pregúntame, por ejemplo, a cuánto se vende el sorgo.', ['SIAP'], {}),

  pronostico: (q, { pronostico }) => {
    if (!pronostico?.dias?.length) return out('Ahorita no pude conseguir el pronóstico de la semana (hace falta internet). Sí te puedo decir cuánto suele llover en tu parcela.', [], {});
    const s = summarizeForecast(pronostico.dias);
    const temp = has(/(temperatura|frio|calor|minima|maxima|helad|helar|grados)/, q);
    const rain = has(LLUVIA, q) || !temp;
    const partes = [];
    if (rain) {
      partes.push(s.lluvia_total_mm === 0
        ? 'No se espera lluvia en los próximos 7 días [Open-Meteo].'
        : `Se esperan ${s.lluvia_total_mm} mm de lluvia en total en los próximos 7 días; el día con más lluvia será el ${dia(s.dia_con_mas_lluvia.fecha)} (${s.dia_con_mas_lluvia.lluvia_mm} mm${s.dia_con_mas_lluvia.prob_lluvia_pct != null ? `, probabilidad ${s.dia_con_mas_lluvia.prob_lluvia_pct}%` : ''}) [Open-Meteo].`);
    }
    if (temp) partes.push(`La temperatura más baja será de ${neg(s.temperatura_minima_mas_baja.c)} °C el ${dia(s.temperatura_minima_mas_baja.fecha)} y la más alta de ${neg(s.temperatura_maxima_mas_alta.c)} °C el ${dia(s.temperatura_maxima_mas_alta.fecha)} [Open-Meteo].`);
    return out(partes.join(' '), ['Open-Meteo'], { resumen: s, dias: 7 });
  },

  tendencia: (q, { clim }) => {
    const t = clim.tendencia_lluvia_verano;
    if (!t) return null;
    const dir = t.mm_por_decada < 0 ? 'bajó' : 'subió';
    const base = `De ${t.desde} a ${t.hasta} la lluvia de verano ${dir} unos ${Math.abs(t.mm_por_decada)} mm por década, con un margen de ±${t.margen_95_mm_por_decada} mm`;
    const texto = t.distinguible_de_cero
      ? `${base}. Esa tendencia sí se nota, pero con ${t.anios} años es poco para asegurar qué pasará ${NASA}.`
      : `${base}. Con ${t.anios} años no se puede decir que llueva más o menos que antes ${NASA}.`;
    return out(texto, ['NASA POWER'], { tendencia: t, abs: Math.abs(t.mm_por_decada) });
  },

  anio: (q, { clim, resumen }) => {
    const y = anioDe(q), p = clim.periodo;
    if (y < p.inicio || y > p.fin) return out(`Mis datos de NASA POWER van de ${p.inicio} a ${p.fin}; no tengo ${y} ${NASA}.`, ["NASA POWER"], { periodo: p, pedido: y });
    const d = resumen.lluvia_pv_anual.find((a) => a.anio === y);
    if (!d) return null;
    const seco = has(/(seco|sequi)/, q);
    const dif = d.lluvia_mm >= resumen.lluvia_pv_mediana_mm ? 'más' : 'menos';
    return out(`${seco ? (d.seco ? 'Sí. ' : 'No. ') : ''}En ${y}${/\b(19|20)\d\d\b/.test(q) ? '' : ' (el último año que tengo)'} llovieron ${d.lluvia_mm} mm de junio a septiembre, ${dif} que lo normal (${resumen.lluvia_pv_mediana_mm} mm). ${d.seco ? 'Fue año seco' : 'No fue año seco'} ${NASA}.`, ['NASA POWER'], { anio: d, resumen: { mediana: resumen.lluvia_pv_mediana_mm } });
  },

  secos: (q, { clim, resumen }) => {
    const n = resumen.anios_secos.length, p = clim.periodo;
    const pedido = (q.match(/\b\d{1,3}\b/g) ?? []).map(Number).find((x) => x !== n && x !== p.anios && x !== 80);
    const corrige = pedido !== undefined ? `No: según NASA POWER no fueron ${pedido}. ` : '';
    const lista = n ? `: ${resumen.anios_secos.join(', ')}` : '';
    return out(`${corrige}Fueron ${n} años secos de ${p.anios} (${p.inicio}-${p.fin})${lista} ${NASA}. Seco quiere decir menos de ${resumen.umbral_seco_mm} mm de junio a septiembre.`, ['NASA POWER'], { n, periodo: p, resumen: { anios_secos: resumen.anios_secos, umbral: resumen.umbral_seco_mm }, pedido });
  },

  heladas: (q, { clim }) => {
    const A = clim.periodo.anios, mes = mesDe(q);
    if (mes) {
      const m = clim.por_mes[mes - 1];
      return out(`En ${MESES[mes - 1]} la hora más fría del mes llega en promedio a ${neg(m.hora_mas_fria_promedio_c)} °C; la más baja fue ${neg(m.hora_mas_fria_record_c)} °C (${m.hora_mas_fria_record_anio}). Bajó de 0 °C en ${m.anios_con_helada} de ${A} años ${NASA}.`, ['NASA POWER'], { mes: m, A });
    }
    const frios = clim.por_mes.filter((m) => m.anios_con_helada > 0).sort((a, b) => b.anios_con_helada - a.anios_con_helada);
    const rec = clim.por_mes.reduce((a, m) => (m.hora_mas_fria_record_c < a.hora_mas_fria_record_c ? m : a));
    const nota = 'Es un dato de satélite de una zona amplia, no un pronóstico.';
    const top = frios.slice(0, 3);
    const texto = frios.length
      ? `Sí hay riesgo de heladas en invierno. En ${A} años bajó de 0 °C en ${top.map((m) => `${MESES[m.mes - 1]} (${m.anios_con_helada} años)`).join(', ')} ${NASA}. La más baja fue ${neg(rec.hora_mas_fria_record_c)} °C en ${MESES[rec.mes - 1]} de ${rec.hora_mas_fria_record_anio}. ${nota}`
      : `En ${A} años no bajó de 0 °C ${NASA}. La más baja fue ${neg(rec.hora_mas_fria_record_c)} °C en ${MESES[rec.mes - 1]} de ${rec.hora_mas_fria_record_anio}. ${nota}`;
    return out(texto, ['NASA POWER'], { top, rec, A });
  },

  calor: (q, { clim }) => {
    const mes = mesDe(q) ?? clim.mes_mas_calido;
    const m = clim.por_mes[mes - 1];
    const intro = mesDe(q) ? '' : `El mes más caluroso es ${MESES[mes - 1]}. `;
    return out(`${intro}En ${MESES[mes - 1]} la temperatura media es ${m.t_media_c} °C y la hora más calurosa llega a ${m.hora_mas_calurosa_promedio_c} °C ${NASA}.`, ['NASA POWER'], { m });
  },

  radiacion: (q, { clim }) => {
    const ms = clim.por_mes, prom = Math.round((ms.reduce((s, m) => s + m.radiacion_mj_m2_dia, 0) / 12) * 10) / 10;
    const mes = mesDe(q);
    if (mes) return out(`En ${MESES[mes - 1]} llegan en promedio ${ms[mes - 1].radiacion_mj_m2_dia} MJ/m² de radiación solar al día ${NASA}.`, ['NASA POWER'], { m: ms[mes - 1] });
    const hi = ms.reduce((a, m) => (m.radiacion_mj_m2_dia > a.radiacion_mj_m2_dia ? m : a)), lo = ms.reduce((a, m) => (m.radiacion_mj_m2_dia < a.radiacion_mj_m2_dia ? m : a));
    return out(`En promedio llegan ${prom} MJ/m² de radiación solar al día; la mayor es en ${MESES[hi.mes - 1]} (${hi.radiacion_mj_m2_dia} MJ/m²) y la menor en ${MESES[lo.mes - 1]} (${lo.radiacion_mj_m2_dia} MJ/m²) ${NASA}.`, ['NASA POWER'], { prom, hi, lo });
  },

  humedad: (q, { clim }) => {
    const ms = clim.por_mes, nota = 'es un índice de 0 (seco) a 1 (saturado) estimado por NASA, no medido en tu parcela';
    const mes = mesDe(q);
    if (mes) return out(`En ${MESES[mes - 1]} la humedad de la zona de raíces es de ${ms[mes - 1].humedad_raiz} en promedio (${nota}) ${NASA}.`, ['NASA POWER'], { m: ms[mes - 1] });
    const hi = ms.reduce((a, m) => (m.humedad_raiz > a.humedad_raiz ? m : a)), lo = ms.reduce((a, m) => (m.humedad_raiz < a.humedad_raiz ? m : a));
    return out(`La humedad de la zona de raíces es más alta en ${MESES[hi.mes - 1]} (${hi.humedad_raiz}) y más baja en ${MESES[lo.mes - 1]} (${lo.humedad_raiz}); ${nota} ${NASA}.`, ['NASA POWER'], { hi, lo });
  },

  lluvia: (q, { clim, resumen }) => {
    const mes = mesDe(q), ms = clim.por_mes, A = clim.periodo.anios;
    if (mes) {
      const m = ms[mes - 1];
      return out(`En ${MESES[mes - 1]} llueven en promedio ${m.lluvia_mm} mm (en ${A} años osciló entre ${m.lluvia_min_mm} y ${m.lluvia_max_mm} mm) ${NASA}.`, ['NASA POWER'], { m, A });
    }
    if (has(/\b(mas|menos|mes)\b/, q) && has(/(llue|lluvi|seco)/, q)) {
      const a = ms[clim.mes_mas_lluvioso - 1], b = ms[clim.mes_mas_seco - 1];
      return out(`El mes que más llueve es ${MESES[a.mes - 1]} (${a.lluvia_mm} mm en promedio) y el que menos, ${MESES[b.mes - 1]} (${b.lluvia_mm} mm). De junio a septiembre cae el ${clim.verano.pct_del_anio}% de la lluvia del año ${NASA}.`, ['NASA POWER'], { a, b, v: clim.verano });
    }
    if (has(/(empieza|comienza|inicia|llegan|temporada|cuando llueve|cuando llegan)/, q)) {
      // shortcut: supone que los meses de lluvia fuerte son seguidos (en el Bajío lo son).
      const f = clim.meses_lluvia_fuerte, primero = f[0], antes = ms[(primero + 10) % 12];
      return out(`La temporada fuerte de lluvias va de ${MESES[primero - 1]} a ${MESES[f.at(-1) - 1]}: ${MESES[primero - 1]} promedia ${ms[primero - 1].lluvia_mm} mm, mientras ${MESES[antes.mes - 1]} solo ${antes.lluvia_mm} mm ${NASA}.`, ['NASA POWER'], { f, ms });
    }
    return out(`En verano (junio a septiembre) llueve ${resumen.lluvia_pv_mediana_mm} mm, el ${clim.verano.pct_del_anio}% del año. De ${A} años, ${resumen.anios_secos.length} fueron secos ${NASA}.`, ['NASA POWER'], { resumen: { mediana: resumen.lluvia_pv_mediana_mm, secos: resumen.anios_secos }, v: clim.verano, A, n: resumen.anios_secos.length });
  },

  siembra: (q, { clim, resumen, perfil = {} }) => {
    const falta = [
      !perfil.cultivo_actual && { campo: 'cultivo_actual', pregunta: '¿Qué tienes sembrado ahora?' },
      perfil.agua !== 'temporal' && !perfil.riego_frecuencia_dias && { campo: 'riego_frecuencia_dias', pregunta: '¿Cada cuántos días riegas?' },
      !perfil.ultimo_cultivo && { campo: 'ultimo_cultivo', pregunta: '¿Qué sembraste la última vez?' },
    ].filter(Boolean);
    const conocido = [
      perfil.cultivo_actual && `Ahora tienes ${{ maiz: 'maíz', brocoli: 'brócoli' }[perfil.cultivo_actual] ?? perfil.cultivo_actual}.`,
      perfil.riego_frecuencia_dias && `Riegas cada ${perfil.riego_frecuencia_dias} días.`,
    ].filter(Boolean).join(' ');
    const texto = `No tengo fechas de siembra verificadas para el Bajío. En tu parcela llueve más de junio a septiembre (${resumen.lluvia_pv_mediana_mm} mm) ${NASA}. ${conocido ? `${conocido} ` : ''}${falta.length ? `Para darte un plan, dime: ${falta[0].pregunta.toLowerCase()}` : 'Pregúntame "¿qué me conviene sembrar?" para ver opciones.'}`;
    return { ...out(texto.trim(), ['NASA POWER'], { resumen: { mediana: resumen.lluvia_pv_mediana_mm }, perfil }), ...(falta.length && { preguntar: falta[0] }) };
  },

  suelo: (q, { suelo }) => {
    if (!suelo) return null;
    if (suelo.sin_datos) return out('No tengo datos de suelo para este punto. Marca otro dentro de tu parcela [SoilGrids].', ['SoilGrids'], {});
    return out(`Tu suelo tiene pH ${suelo.ph}, ${suelo.arcilla_pct}% de arcilla, ${suelo.arena_pct}% de arena y ${suelo.carbono_organico_g_kg} g/kg de carbono orgánico [SoilGrids].`, ['SoilGrids'], { suelo });
  },

  cultivo: (q, { siap }) => {
    if (!siap) return null;
    const r = REDACTORES.siap(q, { siap }); // sin palabra de precio ni riesgo: da el rendimiento
    return r && out(`No tengo información verificada de cómo se siembra ni de qué necesita ese cultivo. Lo que sí hay: ${r.respuesta}`, ['SIAP'], r.datos);
  },

  siap: (q, { siap, perfil = {} }) => {
    const id = detectCrop(q), nombre = { maiz: 'maíz', brocoli: 'brócoli' }[id] ?? id;
    if (!siap) return out(`No tengo datos del SIAP para ${nombre}. Solo tengo maíz, sorgo, frijol, trigo, cebada, garbanzo, brócoli y jitomate [SIAP].`, ['SIAP'], {});
    const porEstado = siap.grupos.filter((g, i) => siap.grupos.findIndex((x) => x.estado === g.estado) === i);
    const temporales = siap.grupos.filter((g) => g.modalidad === 'Temporal');
    // Con menos de 20 ha en el último año el promedio no dice nada (p. ej. fresa en Querétaro salía con 100% de pérdida).
    let lista = (has(/temporal/, q) && temporales.length ? temporales : porEstado).filter((g) => g.superficie_sembrada_ha_ultimo_anio >= 20);
    // El estado y la modalidad (temporal/riego) que dice la pregunta; si no dice, los del perfil.
    const estado = q.match(/guanajuato|queretaro/)?.[0].replace('queretaro', 'Querétaro').replace('guanajuato', 'Guanajuato') ?? perfil.estado ?? null;
    const modalidad = q.match(/temporal|riego/)?.[0] ?? perfil.agua ?? null;
    const suyos = siap.grupos.filter((g) => (!estado || g.estado === estado) && g.superficie_sembrada_ha_ultimo_anio >= 20);
    const conAgua = suyos.filter((g) => !modalidad || g.modalidad === cap(modalidad));
    const base = conAgua.length ? conAgua : suyos;
    let aviso = '';
    if ((estado || modalidad) && base.length) {
      lista = base.filter((g, i) => base.findIndex((x) => x.estado === g.estado) === i);
      if (modalidad && !conAgua.length) aviso = `No tengo ${nombre} de ${modalidad}${estado ? ` en ${estado}` : ''} entre lo que más se siembra; te doy lo que hay. `;
    }
    if (!lista.length) return null;
    const [a, b] = siap.periodo.split('-').map(Number), A = b - a + 1;
    const frase = (g) => {
      const quien = `${cap(nombre)} en ${g.estado} (${g.ciclo}, ${g.modalidad})`;
      if (has(SIAP_PRECIO, q)) return g.precio_pesos_por_tonelada_ultimo_anio ? `${quien}: $${g.precio_pesos_por_tonelada_ultimo_anio} pesos por tonelada en ${g.anio_ultimo} [SIAP].` : null;
      if (has(SIAP_RIESGO, q)) return `${quien}: perdió en promedio ${g.perdida_promedio_pct}% de la superficie sembrada y tuvo pérdidas mayores al 10% en ${g.cantidad_de_anios_con_perdida_mayor_10_pct} de ${A} años [SIAP].`;
      return g.rendimiento_t_ha_promedio > 0 ? `${quien}: rinde en promedio ${g.rendimiento_t_ha_promedio} t/ha (${siap.periodo}) [SIAP].` : null; // 0 = el SIAP no reporta cosecha
    };
    const frases = lista.map(frase).filter(Boolean);
    if (!frases.length) return null;
    const parcela = has(/\bmi (parcela|terreno|milpa|lote)\b/, q) ? 'No tengo el dato de tu parcela; estos son promedios del estado. ' : '';
    return out(`${aviso}${parcela}${frases.join(' ')} Son datos oficiales por estado, no de tu parcela.`, ['SIAP'], { siap: { ...siap, grupos: lista }, A, umbral_pct: 10 });
  },
};

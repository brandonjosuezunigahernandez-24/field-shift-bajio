// Prueba de punta a punta como la pantalla: parcela DIBUJADA (polígono), perfil lleno e historial de la plática.
// Uso: PORT=3072 node index.js &   y luego   node scripts/probar-conversacion.js [--url http://localhost:3072] [--solo=celaya] [--set=dev|prueba|especificas] [--parte=dev|prueba] [--max=N]
// Manda a /api/asistente las preguntas de test/eval/*.json (preguntas, maiz, frutas, maiz-preguntas-agricultor) + test/eval/conversacion.json,
// califica cada respuesta (tema, incluye/excluye, cita, largo, números verificados) y guarda todo en test/eval/resultados-conversacion-<fecha>.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { MAIZ } from '../llm/intencion-ml.js';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d);
const BASE = arg('url', 'http://localhost:3072');
const SOLO = arg('solo', null);
const SET = arg('set', null);
const PARTE = arg('parte', null); // con --set=especificas: solo dev o solo prueba
const MAX = Number(arg('max', 1e9));
const M_LAT = 111320;
const leer = (n) => JSON.parse(readFileSync(new URL(`../test/eval/${n}`, import.meta.url), 'utf8'));

// Esquinas en metros [este, norte] desde un punto de referencia, como las dibujaría el agricultor a clics.
// Ambas se revisaron: SoilGrids devuelve suelo en el centro (no es zona urbana).
const PARCELAS = [
  { id: 'celaya', nombre: 'Celaya, Gto. (5.5 km al sur del centro)', estado: 'Guanajuato', ref: [20.4685, -100.8115], esquinas: [[0, 0], [290, 15], [310, 240], [120, 300], [-15, 210]] },
  { id: 'amealco', nombre: 'Amealco, Qro. (temporal, ladera)', estado: 'Querétaro', ref: [20.1990, -100.1410], esquinas: [[0, 0], [210, -25], [235, 130], [80, 190], [-25, 115]] },
].filter((p) => !SOLO || p.id === SOLO);

const aLatLon = (ref, [e, n]) => [ref[0] + n / M_LAT, ref[1] + e / (M_LAT * Math.cos((ref[0] * Math.PI) / 180))];
export function hectareas(puntos) { // fórmula del polígono (shoelace) en una proyección local
  const k = Math.cos((puntos[0][0] * Math.PI) / 180);
  const xy = puntos.map(([la, lo]) => [lo * M_LAT * k, la * M_LAT]);
  let s = 0;
  xy.forEach(([x, y], i) => { const [x2, y2] = xy[(i + 1) % xy.length]; s += x * y2 - x2 * y; });
  return Math.abs(s) / 2 / 10000;
}

const plano = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const ETIQUETA = new Map(leer('intenciones.json').preguntas.map((p) => [plano(p.pregunta), p.intencion]));
const CAT_PREG = { peligro: 'peligro', fuera: 'fuera', sin_dato: 'sin_dato', pronostico: 'pronostico', general: 'modelo', tendencia: 'tendencia' };
const CAT_FRUTA = { aptitud: 'cultivo', desglose: 'frutales', control: 'fuera' };

// Batería: [{ fuente, id, pregunta, intencion?, incluye?, excluye?, cita?, antes?, set }]. Los "incluye"/"excluye"/"cita" de preguntas.json,
// maiz.json y frutas.json se escribieron para Celaya: solo se revisan en Celaya (en Amealco solo tema, largo y números con fuente).
function bateria() {
  const out = [];
  const esperada = (q, extra) => ETIQUETA.get(plano(q)) ?? extra ?? null;
  for (const q of leer('preguntas.json').preguntas) out.push({ fuente: 'preguntas', id: q.id, pregunta: q.pregunta, intencion: esperada(q.pregunta, CAT_PREG[q.cat]), incluye: q.incluye, excluye: q.excluye, cita: q.cita, soloCelaya: true });
  // En maiz.json algunas traen su propio perfil ("10 ha"); aquí manda el de la parcela dibujada, así que ese número no se exige.
  const propioHa = (q) => (re) => !(q.perfil?.hectareas && re.includes(`${q.perfil.hectareas} ha`) && !q.pregunta.includes(String(q.perfil.hectareas)));
  for (const q of leer('maiz.json').preguntas) out.push({ fuente: 'maiz', id: q.id, pregunta: q.pregunta, intencion: esperada(q.pregunta, MAIZ[q.cat]), incluye: q.incluye?.filter(propioHa(q)), excluye: q.excluye, cita: q.cita, soloCelaya: true });
  for (const q of leer('frutas.json').preguntas) out.push({ fuente: 'frutas', id: q.id, pregunta: q.pregunta, intencion: esperada(q.pregunta, CAT_FRUTA[q.cat]), incluye: q.incluye, excluye: q.excluye, cita: q.cita, soloCelaya: true });
  Object.values(leer('maiz-preguntas-agricultor.json').grupos).flat().forEach((p, i) => out.push({ fuente: 'agricultor', id: i + 1, pregunta: p, intencion: esperada(p) }));
  for (const q of leer('conversacion.json').preguntas) out.push({ fuente: 'conversacion', ...q, intencion: q.intencion });
  // Banco investigado (necesidades reales de productores de temporal): 1 de cada 3 es prueba (no se entrena con ella).
  leer('preguntas-investigadas.json').preguntas.forEach((p, i) => out.push({ fuente: 'investigadas', id: i + 1, set: setInvestigada(i), pregunta: p.texto, intencion: ESPERA_INV[p.tema] ?? p.tema.replace('-', '_') }));
  // Preguntas específicas (números, mes, municipio, seguimientos): solo con --set=especificas.
  const esp = leer('especificas.json').preguntas.map((q) => ({ fuente: 'especificas', ...q }));
  if (SET === 'especificas') return esp.filter((q) => !PARTE || q.set === PARTE).slice(0, MAX);
  return out.filter((q) => !SET || q.set === SET).slice(0, MAX);
}
export const setInvestigada = (i) => (i % 3 === 0 ? 'prueba' : 'dev');
// Temas del banco sin plantilla propia: vale el modelo de lenguaje (o la negativa honesta), nunca "fuera de tema".
const ESPERA_INV = {
  seguro: 'apoyos', venta: ['apoyos', 'maiz_precio', 'siap'], insumos: ['insumos', 'apoyos', 'modelo'], fertilizacion: ['modelo', 'peligro', 'insumos'],
  plagas: ['modelo', 'peligro'], agua_captacion: ['modelo', 'lluvia', 'secos', 'humedad'], ganado: ['modelo', 'secos'], cultivo: ['cultivo', 'modelo', 'sin_dato'],
};

// Qué contestó el servidor, en las mismas etiquetas que intenciones.json.
export function obtenida(j) {
  if (!j) return 'error';
  if (j.preguntar) return 'pregunta_perfil';
  if (j.recomendacion || j.recomendacion_finca) return 'recomendar';
  const t = j.tema;
  if (t?.startsWith('maiz-')) return t === 'maiz-sin-dato' ? 'maiz_?' : MAIZ[t.slice(5)] ?? t;
  if (t === 'aptitud') return 'cultivo';
  if (t === 'desglose') return 'frutales';
  if (t) return t;
  if (j.riesgo_modelo) return 'maiz_riesgo';
  return 'modelo'; // modelo de lenguaje (o su respaldo fijo)
}
const NIEGA = ['fuera', 'sin_dato', 'maiz_?'];
const DESTINO = { concepto: 'modelo', general: 'modelo' };
export const temaOk = (esperada, got) => [esperada].flat().some((e) => (DESTINO[e] ?? e) === got || (NIEGA.includes(e) && NIEGA.includes(got)));
// Temas vecinos: si cae en uno de su mismo grupo, "se pasó a un tema relacionado".
const VECINOS = [['lluvia', 'secos', 'anio', 'tendencia', 'pronostico', 'siembra', 'humedad'], ['heladas', 'calor', 'pronostico', 'radiacion'], ['siap', 'cultivo', 'frutales', 'recomendar', 'maiz_comparar'], ['recomendar', 'maiz_rotacion', 'maiz_decision']];
const esVecino = (e, got) => [e].flat().some((x) => got.startsWith('maiz_') && x.startsWith('maiz_') || VECINOS.some((g) => g.includes(x) && g.includes(got)));
const MAIZ_RE = /ma[ií]z|milpa|elote|mazorca/i;

// Legibilidad: palabras de cada frase (sin las citas entre corchetes).
export const largos = (t) => t.replace(/\[[^\]]*\]/g, '').split(/(?<=[.!?])\s+(?=[¿¡A-ZÁÉÍÓÚÑ0-9(])/).filter((s) => s.trim().length > 2).map((s) => s.trim().split(/\s+/).length);
export const frases = (t) => t.replace(/\[[^\]]*\]/g, '').split(/(?<=[.!?])\s+(?=[¿¡A-ZÁÉÍÓÚÑ0-9(])/).filter((s) => s.trim().length > 2).length;

// Califica una respuesta. Devuelve la lista de fallas, cada una con su tipo.
export function calificar(q, j, { ha, celaya }) {
  const fallas = [];
  const texto = j?.respuesta ?? '';
  const add = (tipo, detalle) => fallas.push({ tipo, detalle });
  if (!j) { add('error', 'sin respuesta'); return fallas; }
  const got = j.tema_obtenido ?? obtenida(j); // tema_obtenido: al recalificar un archivo guardado
  if (q.intencion && !temaOk(q.intencion, got)) {
    const sinCultivo = [q.intencion].flat().some((e) => e.startsWith('maiz_')) && !MAIZ_RE.test(q.pregunta) && !got.startsWith('maiz_');
    add(sinCultivo ? 'ignora el cultivo actual' : esVecino(q.intencion, got) ? 'se pasa a tema relacionado' : 'tema equivocado', `esperaba ${[q.intencion].flat().join('|')}, salió ${got}`);
  }
  const sust = (re) => re.replace('\\{ha\\}', String(ha).replace('.', '[.,]'));
  for (const re of q.incluye ?? []) {
    if (q.soloCelaya && !celaya) continue;
    if (!new RegExp(sust(re), 'i').test(texto)) add(re.includes('{ha') ? 'ignora el perfil o las hectáreas' : 'falta dato', `falta /${sust(re)}/`);
  }
  for (const re of q.excluye ?? []) if ((!q.soloCelaya || celaya) && new RegExp(re, 'im').test(texto)) add(/sorgo/i.test(re) ? 'ignora el cultivo actual' : 'dice lo que no debe', `sobra /${re}/`);
  const citas = [...texto.matchAll(/\[([^\]]+)\]/g)].flatMap((m) => m[1].split(/\s*,\s*/));
  for (const c of q.cita ?? []) if (celaya && !citas.includes(c)) add('número sin fuente', `falta cita [${c}]`);
  if (/\d/.test(texto.replace(/\b(19|20)\d\d\b/g, '')) && !citas.length) add('número sin fuente', 'números sin ninguna cita');
  if (j.verificado === false) add('número sin fuente', 'verificador: número que no está en los datos');
  if (q.debe_accion && !j.que_hacer?.length) add('falta acción', 'sin «Qué hacer»');
  if (frases(texto) > 6) add('demasiado larga', `${frases(texto)} frases`);
  if (/undefined|NaN|\[object/.test(texto)) add('error', 'texto roto');
  return fallas;
}

async function preguntar(body) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}/api/asistente`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
    return { status: r.status, json: await r.json().catch(() => null), ms: Date.now() - t0 };
  } catch (e) { return { status: 0, json: null, ms: Date.now() - t0, err: e.message }; }
}

if (process.argv[1].endsWith('probar-conversacion.js')) {
  const fecha = new Date().toISOString().slice(0, 10);
  const lista = bateria();
  const resultados = [];
  // --recalificar=antes: vuelve a calificar las respuestas guardadas con las reglas de hoy (para comparar antes/después con la misma vara).
  const viejo = arg('recalificar', null);
  if (viejo) {
    const d = leer(`resultados-conversacion-${viejo}.json`);
    for (const r of d.resultados) {
      const q = lista.find((x) => x.fuente === r.fuente && String(x.id) === String(r.id));
      const p = d.parcelas.find((x) => x.id === r.parcela);
      const ha = Math.round(hectareas(p.esquinas.map((e) => aLatLon(p.ref, e))) * 100) / 100;
      if (!q) continue;
      const fallas = calificar(q, { respuesta: r.respuesta, verificado: r.verificado, tema_obtenido: r.tema, que_hacer: r.que_hacer }, { ha, celaya: r.parcela === 'celaya' });
      resultados.push({ ...r, esperada: q.intencion ?? null, ok: !fallas.length, fallas });
    }
  }
  for (const p of viejo ? [] : PARCELAS) {
    const contorno = p.esquinas.map((e) => aLatLon(p.ref, e)); // [lat, lon] como Leaflet
    const lat = contorno.reduce((s, c) => s + c[0], 0) / contorno.length; // centro = promedio de las esquinas (docs/api-contract.md)
    const lon = contorno.reduce((s, c) => s + c[1], 0) / contorno.length;
    const ha = Math.round(hectareas(contorno) * 100) / 100;
    const perfil = { agua: 'temporal', prioridad: 'riesgo', estado: p.estado, ultimo_cultivo: 'frijol', cultivo_actual: 'maiz', hectareas: ha, textura: 'arcillosa', encharca: 'no' };
    const parcelas = [{ id: 1, hectareas: ha, ultimo_cultivo: 'frijol', contorno }];
    console.log(`\n== ${p.nombre}: centro ${lat.toFixed(5)}, ${lon.toFixed(5)}, ${ha} ha, ${lista.length} preguntas`);
    let historial = [];
    const previas = new Map();
    for (const q of lista) {
      let hist = historial;
      if (q.antes) { // seguimiento: primero la pregunta anterior (no cuenta), y esa vuelta va como historial
        if (!previas.has(q.antes)) previas.set(q.antes, (await preguntar({ lat, lon, pregunta: q.antes, perfil, parcelas, historial: [] })).json?.respuesta ?? '');
        hist = [{ pregunta: q.antes, respuesta: previas.get(q.antes) }];
      }
      const r = await preguntar({ lat, lon, pregunta: q.pregunta, perfil, parcelas, historial: hist });
      const fallas = r.status === 200 ? calificar(q, r.json, { ha, celaya: p.id === 'celaya' }) : [{ tipo: 'error', detalle: `HTTP ${r.status} ${r.json?.error ?? r.err ?? ''}` }];
      const j = r.json ?? {};
      resultados.push({
        parcela: p.id, fuente: q.fuente, id: q.id, set: q.set ?? null, pregunta: q.pregunta, antes: q.antes ?? null,
        esperada: q.intencion ?? null, tema: obtenida(r.json), tema_servidor: j.tema ?? null, origen: j.origen ?? null,
        respuesta: j.respuesta ?? null, que_hacer: (j.que_hacer ?? []).map((a) => a.accion), verificado: j.verificado ?? null, graficas: (j.graficas ?? []).map((g) => g.titulo ?? g.tipo ?? g.id ?? 'grafica'), ms: r.ms,
        ok: fallas.length === 0, fallas,
      });
      if (!q.antes) historial = [...historial, { pregunta: q.pregunta, respuesta: (j.respuesta ?? '').slice(0, 600) }].slice(-2);
      process.stdout.write(fallas.length ? 'x' : '.');
    }
  }
  // Resumen por parcela y por fuente.
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : '-');
  console.log('\n');
  const conTema = resultados.filter((r) => r.esperada);
  const temaBien = conTema.filter((r) => !r.fallas.some((f) => ['tema equivocado', 'se pasa a tema relacionado', 'ignora el cultivo actual'].includes(f.tipo) && /esperaba/.test(f.detalle)));
  const resumen = {
    preguntas: resultados.length, tema_con_etiqueta: conTema.length, tema_acierta: temaBien.length,
    bien: resultados.filter((r) => r.ok).length,
    por_tipo: Object.fromEntries([...new Set(resultados.flatMap((r) => r.fallas.map((f) => f.tipo)))].map((t) => [t, resultados.filter((r) => r.fallas.some((f) => f.tipo === t)).length])),
    por_fuente: Object.fromEntries([...new Set(resultados.map((r) => r.fuente + (r.set ? `-${r.set}` : '')))].map((k) => {
      const x = resultados.filter((r) => r.fuente + (r.set ? `-${r.set}` : '') === k);
      return [k, `${x.filter((r) => r.ok).length}/${x.length}`];
    })),
    por_parcela: Object.fromEntries(PARCELAS.map((p) => { const x = resultados.filter((r) => r.parcela === p.id); return [p.id, `${x.filter((r) => r.ok).length}/${x.length}`]; })),
    ms_mediana: resultados.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(resultados.length / 2)],
    al_modelo_de_lenguaje: resultados.filter((r) => r.origen === 'llm').length,
  };
  const ls = resultados.flatMap((r) => largos(r.respuesta ?? ''));
  resumen.legibilidad = {
    palabras_por_frase: Math.round((10 * ls.reduce((a, b) => a + b, 0)) / (ls.length || 1)) / 10,
    pct_frases_mas_de_20_palabras: Math.round((100 * ls.filter((n) => n > 20).length) / (ls.length || 1)),
    respuestas_mas_de_5_frases: resultados.filter((r) => frases(r.respuesta ?? '') > 5).length,
    con_t_ha_o_mm_sin_explicar: resultados.filter((r) => /t\/ha|\d ?mm\b/.test(r.respuesta ?? '') && !/toneladas por hect|milímetros/.test(r.respuesta ?? '')).length,
    palabras_tecnicas: resultados.filter((r) => /siniestr|mediana|umbral|precio medio rural|\bPV\b/i.test(r.respuesta ?? '')).length,
  };
  console.log('Legibilidad:', resumen.legibilidad);
  console.log(`Tema correcto: ${resumen.tema_acierta}/${resumen.tema_con_etiqueta} (${pct(resumen.tema_acierta, resumen.tema_con_etiqueta)})`);
  console.log(`Bien contestadas (pasan todo): ${resumen.bien}/${resumen.preguntas} (${pct(resumen.bien, resumen.preguntas)})`);
  console.log('Fallas por tipo:', resumen.por_tipo);
  console.log('Por fuente:', resumen.por_fuente);
  console.log('Por parcela:', resumen.por_parcela, `| mediana ${resumen.ms_mediana} ms | al modelo de lenguaje: ${resumen.al_modelo_de_lenguaje}`);
  for (const r of resultados.filter((x) => !x.ok)) console.log(`  [${r.parcela}] ${r.fuente}#${r.id} "${r.pregunta}" -> ${r.tema} (${r.origen}): ${r.fallas.map((f) => `${f.tipo}: ${f.detalle}`).join('; ')}`);
  if (viejo) process.exit(0);
  const salida = new URL(`../test/eval/resultados-conversacion-${arg('etiqueta', fecha)}.json`, import.meta.url);
  writeFileSync(salida, JSON.stringify({ fecha, parcelas: PARCELAS.map(({ id, nombre, estado, ref, esquinas }) => ({ id, nombre, estado, ref, esquinas })), resumen, resultados }, null, 1) + '\n');
  console.log('Detalle en', salida.pathname);
}

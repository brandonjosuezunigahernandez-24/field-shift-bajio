// Prueba de punta a punta con parcelas dibujadas (poligonos). Uso:
//   PORT=3057 node index.js &   (o OFFLINE=1 PORT=3057 node index.js &)
//   node scripts/probar-parcelas.js [http://localhost:3057] [--solo=celaya] [--sin-llm]
// Escribe la tabla en pantalla y el detalle (respuestas completas) en scripts/probar-parcelas.salida.json
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inferEstado } from '../llm/recomendador.js';

const BASE = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3057';
const SOLO = process.argv.find((a) => a.startsWith('--solo='))?.slice(7);
const FRUTALES = process.argv.includes('--frutales'); // activa la seccion de /api/frutales (rama agente/frutales)
const SIN_LLM = process.argv.includes('--sin-llm'); // solo clima/suelo/pronostico/recomendacion (rapido)
const M_LAT = 111320;

// Esquinas en metros [este, norte] desde el punto de referencia: lo que un agricultor dibujaria a clics.
const casos = [
  { id: 'celaya', nombre: 'Celaya, parcela irregular ~8 ha', ref: [20.53, -100.75], parcelas: [[[0, 0], [310, 20], [340, 260], [150, 330], [-20, 240]]] },
  { id: 'salamanca', nombre: 'Salamanca, rectangulo ~25 ha', ref: [20.57, -101.1], parcelas: [[[0, 0], [700, 30], [690, 370], [-10, 340]]] },
  { id: 'irapuato', nombre: 'Irapuato, pequena ~1.2 ha', ref: [20.68, -101.38], parcelas: [[[0, 0], [130, 10], [125, 95], [-5, 90]]] },
  { id: 'dolores', nombre: 'Dolores Hidalgo, 3 parcelas juntas', ref: [21.16, -100.93], parcelas: [
    [[0, 0], [260, 10], [250, 200], [-10, 190]], [[270, 10], [520, 20], [510, 210], [260, 200]], [[0, 200], [250, 210], [200, 420], [20, 400]]] },
  { id: 'queretaro', nombre: 'Queretaro, ~50 ha forma de L', ref: [20.7, -100.35], parcelas: [[[0, 0], [900, 0], [900, 250], [350, 250], [350, 600], [0, 600]]] },
  { id: 'marques', nombre: 'El Marques, 2 parcelas ~6 y ~4 ha', ref: [20.62, -100.27], parcelas: [
    [[0, 0], [300, 10], [280, 200], [10, 210]], [[320, 0], [560, 20], [540, 170], [310, 190]]] },
  { id: 'sjr', nombre: 'San Juan del Rio, ~15 ha trapecio', ref: [20.39, -99.99], parcelas: [[[0, 0], [550, 0], [450, 300], [60, 280]]] },
  { id: 'amealco', nombre: 'Amealco, ~3 ha ladera', ref: [20.19, -100.14], parcelas: [[[0, 0], [200, -30], [230, 120], [90, 180], [-30, 110]]] },
  { id: 'ciudad', nombre: 'Centro de Celaya (ciudad)', ref: [20.52, -100.81], parcelas: [[[0, 0], [120, 5], [115, 90], [-5, 85]]] },
  { id: 'fuera', nombre: 'Fuera de zona: Guadalajara, Jal.', ref: [20.66, -103.35], parcelas: [[[0, 0], [250, 10], [240, 160], [0, 150]]] },
].filter((c) => !SOLO || c.id === SOLO);

// Area con proyeccion local equirectangular (metros) y formula del poligono (shoelace).
function aLonLat(ref, [e, n]) { return [ref[1] + e / (M_LAT * Math.cos((ref[0] * Math.PI) / 180)), ref[0] + n / M_LAT]; }
function hectareas(pts, latC) {
  const k = Math.cos((latC * Math.PI) / 180);
  const xy = pts.map(([lon, lat]) => [lon * M_LAT * k, lat * M_LAT]);
  let s = 0;
  xy.forEach(([x, y], i) => { const [x2, y2] = xy[(i + 1) % xy.length]; s += x * y2 - x2 * y; });
  return Math.abs(s) / 2 / 10000;
}

async function call(path, body) {
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + path, body
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) }
      : { signal: AbortSignal.timeout(60000) });
    const json = await r.json().catch(() => null);
    return { status: r.status, json, ms: Date.now() - t0 };
  } catch (e) { return { status: 0, json: null, ms: Date.now() - t0, err: e.message }; }
}

const PREGUNTAS = ['¿Cuánto llueve en verano?', '¿Cómo es el suelo de mi parcela?', '¿Va a llover esta semana?'];
const RARO = /undefined|NaN|\[object/;
const salida = [];
const filas = [];

for (const c of casos) {
  const polis = c.parcelas.map((p) => p.map((q) => aLonLat(c.ref, q)));
  const has = polis.map((p) => hectareas(p, c.ref[0]));
  const todos = polis.flat();
  const lat = todos.reduce((s, p) => s + p[1], 0) / todos.length;
  const lon = todos.reduce((s, p) => s + p[0], 0) / todos.length;
  const parcelas = has.map((h, i) => ({ id: i + 1, hectareas: +h.toFixed(2) }));
  const q = `lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`;
  const det = { caso: c.id, nombre: c.nombre, lat, lon, hectareas: has, fallas: [] };
  const falla = (t) => det.fallas.push(t);

  const clima = await call(`/api/clima?${q}`);
  const suelo = await call(`/api/suelo?${q}`);
  const pron = await call(`/api/pronostico?${q}`);
  Object.assign(det, { clima, suelo, pron });
  const cj = clima.json;
  if (clima.status !== 200) falla(`clima ${clima.status}: ${cj?.error ?? clima.err}`);
  else {
    const med = cj.lluvia_pv_mediana_mm;
    if (!(med > 50 && med < 2500)) falla(`lluvia PV mediana absurda: ${med}`);
    if (cj.temp_media_mensual?.some((m) => m.t_media_c < -5 || m.t_media_c > 40)) falla('temperatura media mensual absurda');
    if (cj.lluvia_pv_anual?.length !== 25) falla(`anios de lluvia: ${cj.lluvia_pv_anual?.length} (esperaba 25)`);
  }
  const sj = suelo.json;
  if (suelo.status !== 200) falla(`suelo ${suelo.status}: ${sj?.error ?? suelo.err}`);
  else if (!sj.sin_datos) {
    const suma = sj.arcilla_pct + sj.arena_pct + sj.limo_pct;
    if (sj.ph < 3.5 || sj.ph > 10 || suma < 90 || suma > 110) falla(`suelo absurdo: pH ${sj.ph}, textura ${sj.arcilla_pct}/${sj.arena_pct}/${sj.limo_pct}`);
  }
  const pj = pron.json;
  if (pron.status !== 200) falla(`pronostico ${pron.status}`);
  else if (pj.disponible && pj.dias.length !== 7) falla(`pronostico con ${pj.dias.length} dias`);

  const perfil = { hectareas: +has.reduce((a, b) => a + b, 0).toFixed(2) };
  const reco = {};
  for (const agua of ['temporal', 'riego']) {
    const r = await call('/api/asistente', { lat, lon, pregunta: '¿Qué me conviene sembrar?', agua, prioridad: 'riesgo', perfil, parcelas });
    reco[agua] = r;
    const j = r.json;
    if (r.status !== 200) { falla(`reco ${agua} ${r.status}: ${j?.error ?? r.err}`); continue; }
    if (!j.recomendacion && !j.recomendacion_finca && !/fuera de Guanajuato/.test(j.respuesta)) falla(`reco ${agua}: sin recomendacion (${j.origen}) -> ${j.respuesta?.slice(0, 80)}`);
    if (RARO.test(j.respuesta ?? '')) falla(`reco ${agua}: texto raro`);
  }
  det.reco = reco;

  det.preguntas = [];
  if (!SIN_LLM) {
    det.preguntas.push({ pregunta: '(resumen inicial)', ...(await call('/api/asistente', { lat, lon, parcelas })) });
    for (const pregunta of PREGUNTAS) det.preguntas.push({ pregunta, ...(await call('/api/asistente', { lat, lon, pregunta, parcelas })) });
    for (const p of det.preguntas) {
      if (p.status !== 200) falla(`asistente "${p.pregunta}" ${p.status}: ${p.json?.error ?? p.err}`);
      else if (RARO.test(p.json.respuesta ?? '')) falla(`asistente "${p.pregunta}": texto raro`);
    }
    // Coherencia: la respuesta de lluvia (modelo) debe mencionar la mediana de PV de ESTA parcela.
    const pl = det.preguntas[1];
    if (pl?.json?.respuesta && cj?.lluvia_pv_mediana_mm && pl.json.origen === 'llm') {
      const nums = (pl.json.respuesta.match(/\d[\d,.]*/g) ?? []).map((n) => parseFloat(n.replace(/,/g, '')));
      if (!nums.some((n) => Math.abs(n - cj.lluvia_pv_mediana_mm) < 1.5)) falla(`lluvia: la respuesta (${nums.join(', ')}) no menciona la mediana de PV ${cj.lluvia_pv_mediana_mm} mm`);
    }
  }
  if (FRUTALES) {
    // Esperado: frutales del estado de la parcela; fresa y esparrago en Guanajuato; fresa NO en Queretaro (limite conocido).
    const estado = inferEstado(lon);
    const fr = await call(`/api/frutales?estado=${encodeURIComponent(estado)}`);
    det.frutales = { estado, status: fr.status, ms: fr.ms };
    const txt = JSON.stringify(fr.json ?? '').toLowerCase();
    if (fr.status !== 200) falla(`frutales ${estado}: ${fr.status}`);
    else {
      const tiene = (w) => new RegExp(w).test(txt);
      det.frutales.fresa = tiene('fresa'); det.frutales.esparrago = tiene('esp[aá]rrago');
      if (estado === 'Guanajuato' && !(det.frutales.fresa && det.frutales.esparrago)) falla('frutales Guanajuato: faltan fresa o esparrago');
      if (estado === 'Querétaro' && det.frutales.fresa) falla('frutales Queretaro: aparece fresa (no deberia)');
      if (!/no_es|no_verificado/.test(txt)) falla('frutales: sin no_es / no_verificado en las fichas');
    }
  }
  salida.push(det);
  const origen = (r) => r.json?.origen ?? '-';
  const rt = reco.temporal.json, rr = reco.riego.json;
  const cultivo = (j) => j?.recomendacion?.rotacion?.[0]?.cultivo
    ?? j?.recomendacion_finca?.parcelas?.map((p) => p.rotacion?.[0]?.cultivo).join('/') ?? 'X';
  filas.push({
    caso: c.id, ha: has.map((h) => h.toFixed(1)).join('+'),
    clima: clima.status === 200 ? `ok ${origen(clima)} ${cj.lluvia_pv_mediana_mm}mm` : `ERR${clima.status}`,
    suelo: suelo.status !== 200 ? `ERR${suelo.status}` : sj.sin_datos ? 'sin_datos' : `ok ${origen(suelo)} pH${sj.ph}`,
    pron: pron.status !== 200 ? `ERR${pron.status}` : pj.disponible ? `ok ${origen(pron)}` : 'no disp.',
    temporal: cultivo(rt), riego: cultivo(rr), finca: rt?.recomendacion_finca ? 'si' : '-',
    ms: `${clima.ms}/${suelo.ms}/${pron.ms}/${reco.temporal.ms}` + (SIN_LLM ? '' : `/${det.preguntas.map((p) => p.ms).join(',')}`),
    fallas: det.fallas.length,
  });
  console.log(`${c.id}: ${det.fallas.length ? det.fallas.join(' | ') : 'sin fallas'}`);
}
console.table(filas);
const out = fileURLToPath(new URL('./probar-parcelas.salida.json', import.meta.url));
writeFileSync(out, JSON.stringify(salida, null, 1));
console.log('Detalle en', out);

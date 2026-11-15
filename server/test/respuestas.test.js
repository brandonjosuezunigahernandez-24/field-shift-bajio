import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { createApp } from '../app.js';
import { climatologia } from '../llm/climatologia.js';
import { partialRespuesta } from '../llm/ollama.js';
import { detectarTema, redactar } from '../llm/respuestas.js';
import { verifyNumbers } from '../llm/verificador.js';
import { buildFicha } from '../llm/ficha.js';
import { parsePower, summarizeClimate } from '../sources/nasaPower.js';

const rows = parsePower(JSON.parse(readFileSync(new URL('../fixtures/power_20.47_-100.81.json', import.meta.url), 'utf8')));
const resumen = summarizeClimate(rows);
const clim = climatologia(rows);
const pronostico = { dias: Array.from({ length: 7 }, (_, i) => ({ fecha: `2026-11-${15 + i}`, lluvia_mm: i === 2 ? 5.5 : 0, prob_lluvia_pct: i === 2 ? 80 : 5, t_max_c: 25 + i, t_min_c: 8 - i })) };
const ctx = { clim, resumen, pronostico, perfil: {}, suelo: { ph: 7.4, arcilla_pct: 42.4, arena_pct: 37.2, carbono_organico_g_kg: 12.1 }, siap: null };

test('climatología: números de Celaya calculados por el código', () => {
  assert.equal(clim.mes_mas_lluvioso, 7);
  assert.equal(clim.mes_mas_seco, 12);
  assert.deepEqual(clim.meses_lluvia_fuerte, [6, 7, 8, 9]);
  assert.equal(clim.por_mes[0].hora_mas_fria_promedio_c, 1.5);
  assert.equal(clim.por_mes[0].hora_mas_fria_record_anio, 2006);
  assert.equal(clim.verano.mediana_mm, 528.9);
});

test('tendencia de la lluvia: ~-30 mm/década y NO distinguible de cero (no se exagera)', () => {
  const t = clim.tendencia_lluvia_verano;
  assert.equal(t.mm_por_decada, -30);
  assert.equal(t.distinguible_de_cero, false);
  assert.ok(t.margen_95_mm_por_decada > Math.abs(t.mm_por_decada));
});

test('detectarTema', () => {
  const casos = {
    '¿Cuáles fueron los años secos?': 'secos', 'años secoss': 'secos', 'llueve?': 'pronostico', '¿Va a llover esta semana?': 'pronostico',
    '¿En qué mes llueve más?': 'lluvia', '¿Hay riesgo de heladas?': 'heladas', 'hace frio en inviernp?': 'heladas',
    '¿Está llegando menos lluvia que antes?': 'tendencia', '¿Cuánto llovió en 2023?': 'anio', 'cuando siembro': 'siembra',
    '¿Qué pesticida le echo al maíz y cuánto?': 'peligro', '¿Cuánto cuesta el fertilizante?': 'insumos',
    '¿A cuánto se vende el sorgo?': 'siap', '¿Puedo sembrar fresas?': 'aptitud', '¿Llovió mucho el año pasado?': 'anio', '¿Quién ganó el mundial de 2022?': 'fuera',
    '¿Para qué sirve la rotación de cultivos?': null, '¿Qué ayuda a que el suelo guarde humedad?': null, '¿Y el ingreso?': null,
  };
  for (const [q, tema] of Object.entries(casos)) assert.equal(detectarTema(q), tema, q);
});

test('trampa de número: corrige con el dato real', () => {
  const r = redactar('secos', '¿Verdad que fueron 15 años secos?', ctx);
  assert.match(r.respuesta, /^No: según NASA POWER no fueron 15\. Fueron 6 años secos de 25/);
  assert.doesNotMatch(redactar('secos', '¿cuántos años secos de los 25?', ctx).respuesta, /^No/);
});

test('cada plantilla pasa su verificador y cita su fuente', () => {
  const preguntas = ['¿Cuáles fueron los años secos?', '¿Cuánto llueve en agosto?', '¿En qué mes llueve menos?', '¿Cuándo empieza la temporada de lluvias?', '¿Cuánto llueve en verano?',
    '¿Hay riesgo de heladas?', '¿Qué tan frío se pone en enero?', '¿Hace calor en mayo?', '¿Cuál es el mes más caluroso?', '¿Está llegando menos lluvia que antes?',
    '¿Cuánta radiación solar hay?', '¿Qué tan húmeda está la tierra en septiembre?', '¿Cuánto llovió en 2023?', '¿Cuánto llovió en 1995?', '¿Va a llover esta semana?',
    '¿Qué temperatura mínima habrá esta semana?', '¿Cómo está mi suelo?'];
  for (const q of preguntas) {
    const tema = detectarTema(q);
    const r = redactar(tema, q, ctx);
    assert.ok(r, q);
    assert.ok(verifyNumbers(r.respuesta, r.datos).ok, `${q} -> ${r.respuesta}`);
    for (const f of r.fuentes) assert.ok(r.respuesta.includes(`[${f}]`), `${q}: falta [${f}]`);
    assert.ok(r.respuesta.split(/\s+/).length <= 60, `${q}: muy larga`);
  }
});

test('año fuera del rango y año seco/no seco', () => {
  assert.match(redactar('anio', '¿Cuánto llovió en 1995?', ctx).respuesta, /van de 2000 a 2024; no tengo 1995/);
  assert.match(redactar('anio', '¿2024 fue año seco?', ctx).respuesta, /^No\. En 2024 llovieron 687\.4/);
  assert.match(redactar('anio', '¿2023 fue año seco?', ctx).respuesta, /^Sí\./);
});

test('siembra: pregunta antes del plan y usa los campos nuevos del perfil si existen', () => {
  const sin = redactar('siembra', 'cuando siembro', ctx);
  assert.equal(sin.preguntar.campo, 'cultivo_actual');
  const con = redactar('siembra', 'cuando siembro', { ...ctx, perfil: { agua: 'riego', cultivo_actual: 'maíz', riego_frecuencia_dias: 7, ultimo_cultivo: 'frijol' } });
  assert.match(con.respuesta, /Ahora tienes maíz\. Riegas cada 7 días\./);
  assert.equal(con.preguntar, undefined);
});

test('ficha sin suelo ni pronóstico queda chica', () => {
  const f = buildFicha({ clima: { periodo: { inicio: 2000, fin: 2024 }, lluvia_pv_mediana_mm: 1, umbral_seco_mm: 1, anios_secos: [] }, suelo: null });
  assert.equal(f.suelo, undefined);
});

test('partialRespuesta saca el texto mientras el JSON está incompleto', () => {
  assert.equal(partialRespuesta('{"respuesta":"Hola, ll'), 'Hola, ll');
  assert.equal(partialRespuesta('{"respuesta":"Dijo \\"sí\\"'), 'Dijo "sí"');
  assert.equal(partialRespuesta('{"resp'), '');
});

test('set de evaluación: al menos 30 preguntas con id único', () => {
  const { preguntas } = JSON.parse(readFileSync(new URL('./eval/preguntas.json', import.meta.url), 'utf8'));
  assert.ok(preguntas.length >= 30);
  assert.equal(new Set(preguntas.map((p) => p.id)).size, preguntas.length);
});

let server, base;
before(async () => {
  process.env.OFFLINE = '1';
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));
const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat: 20.47, lon: -100.81, ...body }) });

test('POST /api/asistente contesta años secos por plantilla (sin modelo) con el mismo contrato', async () => {
  const body = await (await post('/api/asistente', { pregunta: '¿Cuáles fueron los años secos?' })).json();
  assert.equal(body.origen, 'plantilla');
  assert.equal(body.tema, 'secos');
  assert.equal(body.verificado, true);
  assert.deepEqual(body.fuentes, ['NASA POWER']);
  assert.match(body.respuesta, /\[NASA POWER\]/);
  assert.deepEqual(body.acciones, [{ tipo: 'resaltar_anios_secos' }]);
});

test('POST /api/asistente/stream: sin modelo manda solo el evento final (NDJSON)', async () => {
  const res = await post('/api/asistente/stream', { pregunta: '¿Hay riesgo de heladas?' });
  assert.match(res.headers.get('content-type'), /ndjson/);
  const eventos = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].tipo, 'final');
  assert.equal(eventos[0].tema, 'heladas');
});

test('POST /api/asistente/stream valida igual que la ruta normal (400)', async () => {
  assert.equal((await fetch(base + '/api/asistente/stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 400);
});

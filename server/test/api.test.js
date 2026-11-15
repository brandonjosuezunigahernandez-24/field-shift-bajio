import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../app.js';
import { EXAMPLE_POINTS, FIXTURE_POINTS } from '../lib/seasons.js';

// These tests never touch the network: OFFLINE=1 makes the server use cache and fixtures only.
let server;
let baseUrl;

before(async () => {
  process.env.OFFLINE = '1';
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

const get = async (path) => {
  const res = await fetch(baseUrl + path);
  return { status: res.status, body: await res.json() };
};

test('GET /api/health', async () => {
  const { status, body } = await get('/api/health');
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true });
});

// Every button must work offline: the tests below check clima and suelo for all FIXTURE_POINTS.
test('GET /api/ejemplos lists the client buttons, all of them with fixtures', async () => {
  const { status, body } = await get('/api/ejemplos');
  assert.equal(status, 200);
  assert.deepEqual(body, EXAMPLE_POINTS);
  for (const point of body) {
    assert.ok(FIXTURE_POINTS.some((f) => f.lat === point.lat && f.lon === point.lon), point.nombre);
    assert.equal(typeof point.id, 'string');
    assert.equal(typeof point.boton, 'string');
  }
});

test('GET /api/clima works offline for every fixture point', async () => {
  for (const point of FIXTURE_POINTS) {
    const { status, body } = await get(`/api/clima?lat=${point.lat}&lon=${point.lon}`);
    assert.equal(status, 200, point.nombre);
    assert.ok(['cache', 'fixture'].includes(body.origen));
    assert.equal(body.lat, point.lat);
    assert.equal(body.lluvia_pv_anual.length, 25, point.nombre);
    assert.equal(body.temp_media_mensual.length, 12);
    assert.ok(Array.isArray(body.anios_secos));
    assert.ok(body.umbral_seco_mm > 0);
    assert.match(body.fuente, /NASA POWER/);
    assert.ok(['Guanajuato', 'Querétaro'].includes(body.estado), point.nombre);
  }
  assert.equal((await get('/api/clima?lat=20.47&lon=-100.81')).body.estado, 'Guanajuato');
});

test('GET /api/suelo works offline and has soil data for every fixture point', async () => {
  for (const point of FIXTURE_POINTS) {
    const { status, body } = await get(`/api/suelo?lat=${point.lat}&lon=${point.lon}`);
    assert.equal(status, 200, point.nombre);
    assert.ok(['cache', 'fixture'].includes(body.origen));
    assert.equal(body.sin_datos, false, point.nombre);
    assert.equal(body.aviso, null);
    assert.ok(body.ph > 4 && body.ph < 10, point.nombre);
    assert.match(body.fuente, /SoilGrids/);
  }
});

test('GET /api/terreno works offline for the demo point and answers the rounded center', async () => {
  const [demo] = EXAMPLE_POINTS;
  const { status, body } = await get(`/api/terreno?lat=${demo.lat + 0.0003}&lon=${demo.lon - 0.0002}`);
  assert.equal(status, 200);
  assert.deepEqual([body.lat, body.lon], [demo.lat, demo.lon]);
  assert.ok(['cache', 'fixture'].includes(body.origen));
  assert.equal(body.alturas.length, body.tam * body.tam);
  assert.equal(body.lado_m, 1000);
  assert.match(body.fuente, /SRTM/);
  // Every example button shows its 3D relief without internet.
  for (const point of FIXTURE_POINTS) {
    const other = await get(`/api/terreno?lat=${point.lat}&lon=${point.lon}`);
    assert.equal(other.status, 200, point.nombre);
  }
});

test('bad coordinates answer 400 with a message in Spanish', async () => {
  for (const path of ['/api/clima?lat=abc&lon=1', '/api/suelo', '/api/clima?lat=95&lon=0']) {
    const { status, body } = await get(path);
    assert.equal(status, 400, path);
    assert.equal(typeof body.error, 'string');
  }
});

test('a point without cache or fixture answers 502 offline, never data from another place', async () => {
  const { status, body } = await get('/api/clima?lat=-89.99&lon=179.99');
  assert.equal(status, 502);
  assert.match(body.error, /Celaya/);
});

test('a plot 760 m from the demo point shares its climate but never borrows its soil', async () => {
  const query = 'lat=20.4749&lon=-100.8149';
  const clima = await get(`/api/clima?${query}`);
  assert.equal(clima.status, 200);
  const suelo = await get(`/api/suelo?${query}`);
  assert.equal(suelo.status, 502);
});

test('unknown /api routes answer 404 as JSON', async () => {
  const { status, body } = await get('/api/nope');
  assert.equal(status, 404);
  assert.equal(typeof body.error, 'string');
});

test('POST /api/asistente sin coordenadas -> 400', async () => {
  const res = await fetch(`${baseUrl}/api/asistente`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 400);
});

test('POST /api/voz sin audio -> 400', async () => {
  const res = await fetch(`${baseUrl}/api/voz`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: new Uint8Array(0) });
  assert.equal(res.status, 400);
});

test('un saludo se contesta sin datos ni modelo', async () => {
  const res = await fetch(`${baseUrl}/api/asistente`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat: 20.47, lon: -100.81, pregunta: 'hola' }) });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.origen, 'plantilla');
  assert.match(body.respuesta, /Hola/);
});

test('GET /api/perfil/preguntas devuelve el cuestionario', async () => {
  const { status, body } = await get('/api/perfil/preguntas');
  assert.equal(status, 200);
  assert.equal(body.preguntas[0].campo, 'agua');
});

test('POST /api/asistente con perfil inválido -> 400', async () => {
  const res = await fetch(`${baseUrl}/api/asistente`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat: 20.47, lon: -100.81, pregunta: 'hola', perfil: { agua: 'mar' } }) });
  assert.equal(res.status, 400);
});

test('GET /api/asistente/temas devuelve la guía de preguntas', async () => {
  const { status, body } = await get('/api/asistente/temas');
  assert.equal(status, 200);
  assert.ok(body.temas.length >= 4 && body.temas.every((t) => t.titulo && t.preguntas.length > 0));
  assert.ok(body.nota.includes('No doy marcas'));
});

const post = async (path, body) => {
  const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

test('POST /api/recomendar answers with the engine: climate, soil, ranking and a 3-year rotation', async () => {
  const [demo] = EXAMPLE_POINTS;
  const { status, body } = await post('/api/recomendar', { lat: demo.lat, lon: demo.lon, agua: 'temporal', prioridad: 'riesgo' });
  assert.equal(status, 200);
  assert.equal(body.clima.lluvia_pv_anual.length, 25);
  assert.equal(body.suelo.sin_datos, false);
  assert.deepEqual(body.rotacion.map((s) => s.anio), [1, 2, 3]);
  assert.ok(body.rotacion.every((s) => body.cultivos.some((c) => c.id === s.cultivo)));
  // Income comes from the real SIAP summary of the plot's state.
  assert.ok(body.cultivos[0].razones.some((r) => /pesos por hectárea/.test(r)));
  assert.match(body.fuentes.join(' '), /NASA POWER/);
});

test('POST /api/recomendar still answers when the plot has no soil data', async () => {
  // 760 m from the demo point: same climate cell, but no soil fixture offline.
  const { status, body } = await post('/api/recomendar', { lat: 20.4749, lon: -100.8149, agua: 'riego', prioridad: 'ganar' });
  assert.equal(status, 200);
  assert.equal(body.suelo.sin_datos, true);
  assert.equal(typeof body.suelo.aviso, 'string');
  assert.equal(body.rotacion.length, 6);
});

test('POST /api/recomendar asks for agua and prioridad in Spanish', async () => {
  const { status, body } = await post('/api/recomendar', { lat: 20.47, lon: -100.81, agua: 'mar', prioridad: 'riesgo' });
  assert.equal(status, 400);
  assert.match(body.error, /temporal o de riego/);
});

const sequence = (e) => e.rotacion.map((s) => s.cultivo ?? '-').join('-');

test('POST /api/recomendar compares 3 rotations: without an answer, today is the most sown crop of the state (SIAP)', async () => {
  const [demo] = EXAMPLE_POINTS;
  const { status, body } = await post('/api/recomendar', { lat: demo.lat, lon: demo.lon, agua: 'temporal', prioridad: 'riesgo' });
  assert.equal(status, 200);
  assert.deepEqual(body.estrategias.map((e) => e.id), ['actual', 'recomendada', 'alternativa']);
  const [hoy, mejor] = body.estrategias;
  assert.equal(sequence(hoy), 'maiz-maiz-maiz');
  assert.equal(hoy.supuesto, true);
  assert.ok(hoy.huecos.some((h) => /58 % de la superficie.*SIAP/.test(h)));
  assert.deepEqual(mejor.rotacion, body.rotacion);
  assert.ok(body.incertidumbre.some((u) => u.tema === 'técnico' && /no sustituye/.test(u.texto)));
  assert.deepEqual(body.cultivos.find((c) => c.id === 'maiz').riesgo_rango, [0.33, 0.64]);
});

test('POST /api/recomendar uses the rotation the farmer gave and ignores what the engine does not know', async () => {
  const plot = { lat: 20.47, lon: -100.81, agua: 'temporal', prioridad: 'suelo' };
  const dada = await post('/api/recomendar', { ...plot, rotacion_actual: ['frijol', 'maiz'] });
  assert.equal(sequence(dada.body.estrategias[0]), 'frijol-maiz-frijol');
  assert.equal(dada.body.estrategias[0].supuesto, false);
  const rara = await post('/api/recomendar', { ...plot, rotacion_actual: ['jitomate', 5, 'maiz'] });
  assert.equal(rara.status, 200);
  assert.equal(sequence(rara.body.estrategias[0]), 'maiz-maiz-maiz');
  assert.equal(rara.body.estrategias[0].supuesto, false);
  // Old clients only send cultivo_previo: it still counts as what the farmer sows today.
  const vieja = await post('/api/recomendar', { ...plot, cultivo_previo: 'sorgo' });
  assert.equal(sequence(vieja.body.estrategias[0]), 'sorgo-sorgo-sorgo');
});

test('the assistant recommends with the same engine as /api/recomendar', async () => {
  const [demo] = EXAMPLE_POINTS;
  const plot = { lat: demo.lat, lon: demo.lon, agua: 'temporal', prioridad: 'riesgo' };
  const chat = await post('/api/asistente', { ...plot, pregunta: '¿Qué me conviene sembrar?' });
  const screen = await post('/api/recomendar', plot);
  assert.equal(chat.status, 200);
  assert.equal(chat.body.origen, 'motor');
  assert.deepEqual(chat.body.recomendacion.rotacion, screen.body.rotacion);
  assert.match(chat.body.respuesta, /Rotación de 3 años/);
  // Same 3 rotations in the chat as on the screen, and the answer compares against today's.
  assert.deepEqual(chat.body.recomendacion.estrategias, screen.body.estrategias);
  assert.match(chat.body.respuesta, /Comparada con seguir igual \(maíz grano, maíz grano, maíz grano, lo más sembrado aquí\)/);
});

test('POST /api/asistente: recomendar fuera de Guanajuato y Querétaro no inventa estado', async () => {
  const res = await fetch(`${baseUrl}/api/asistente`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat: 20.66, lon: -103.35, pregunta: '¿Qué me conviene sembrar?', agua: 'temporal', prioridad: 'riesgo' }) });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.match(body.respuesta, /fuera de Guanajuato y Querétaro/);
  assert.equal(body.recomendacion, undefined);
});

// Lagos de Moreno, Jal.: inside the old lat/lon rectangle, outside the INEGI boundary of Guanajuato.
const LAGOS = { lat: 21.356, lon: -101.93 };

test('POST /api/recomendar outside Guanajuato and Querétaro answers 422 before calling any API', async () => {
  // Offline there is no fixture for this point: a 502 would mean it went to NASA POWER first.
  const { status, body } = await post('/api/recomendar', { ...LAGOS, agua: 'temporal', prioridad: 'riesgo' });
  assert.equal(status, 422);
  assert.equal(body.fuera_de_region, true);
  assert.match(body.error, /fuera de Guanajuato y Querétaro/);
});

test('the assistant uses the same INEGI boundary as /api/recomendar', async () => {
  const { status, body } = await post('/api/asistente', { ...LAGOS, agua: 'temporal', prioridad: 'riesgo', pregunta: '¿Qué me conviene sembrar?' });
  assert.equal(status, 200);
  assert.match(body.respuesta, /fuera de Guanajuato y Querétaro/);
  assert.equal(body.recomendacion, undefined);
});

test('GET /api/recomendar/prueba gives each rain-fed crop against the real years, sown in June and July', async () => {
  const [demo] = EXAMPLE_POINTS;
  const { status, body } = await get(`/api/recomendar/prueba?lat=${demo.lat}&lon=${demo.lon}`);
  assert.equal(status, 200);
  const maiz = body.cultivos.find((c) => c.id === 'maiz');
  assert.deepEqual(maiz.siembras.map((s) => s.mes_siembra), [6, 7]);
  assert.equal(maiz.siembras[0].anios.length, 25);
  assert.equal(maiz.siembras[0].anios_bajo_minimo.length, 12);
  assert.ok(body.cultivos.every((c) => c.siembras.length === 2 && c.minimo_mm > 0));
});

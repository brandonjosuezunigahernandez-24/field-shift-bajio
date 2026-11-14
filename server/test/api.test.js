import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../app.js';
import { DEMO_POINT } from '../lib/seasons.js';

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

const demoQuery = `lat=${DEMO_POINT.lat}&lon=${DEMO_POINT.lon}`;

test('GET /api/health', async () => {
  const { status, body } = await get('/api/health');
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true });
});

test('GET /api/clima works offline for the demo point', async () => {
  const { status, body } = await get(`/api/clima?${demoQuery}`);
  assert.equal(status, 200);
  assert.ok(['cache', 'fixture'].includes(body.origen));
  assert.equal(body.lat, DEMO_POINT.lat);
  assert.equal(body.lluvia_pv_anual.length, 25);
  assert.equal(body.temp_media_mensual.length, 12);
  assert.ok(Array.isArray(body.anios_secos));
  assert.ok(body.umbral_seco_mm > 0);
  assert.match(body.fuente, /NASA POWER/);
});

test('GET /api/suelo works offline for the demo point', async () => {
  const { status, body } = await get(`/api/suelo?${demoQuery}`);
  assert.equal(status, 200);
  assert.ok(['cache', 'fixture'].includes(body.origen));
  assert.equal(body.sin_datos, false);
  assert.equal(body.aviso, null);
  assert.ok(body.ph > 4 && body.ph < 10);
  assert.match(body.fuente, /SoilGrids/);
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

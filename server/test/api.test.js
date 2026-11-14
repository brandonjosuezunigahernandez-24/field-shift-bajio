import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../app.js';
import { FIXTURE_POINTS } from '../lib/seasons.js';

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
  }
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

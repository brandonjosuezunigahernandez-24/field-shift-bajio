import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from '../app.js';
import { limpiar } from '../routes/retro.js';
import { generar } from '../scripts/generar-intenciones.js';
import { calificar } from '../scripts/juez.js';

const dir = mkdtempSync(join(tmpdir(), 'retro-'));
const archivo = join(dir, 'sub', 'retro.jsonl'); // la carpeta no existe: la ruta la crea
let server, base;
before(async () => {
  process.env.RETRO_FILE = archivo;
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/retroalimentacion`;
});
after(() => { delete process.env.RETRO_FILE; rmSync(dir, { recursive: true, force: true }); return new Promise((r) => server.close(r)); });
const post = (b) => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

test('limpiar tapa correos y teléfonos, deja años y cifras chicas', () => {
  assert.equal(limpiar('escríbeme a juan.p@correo.mx o al 442 123 4567'), 'escríbeme a [correo] o al [teléfono]');
  assert.equal(limpiar('¿cuánto llovió en 2023? tengo 5 ha'), '¿cuánto llovió en 2023? tengo 5 ha');
});

test('POST guarda solo los campos conocidos y GET /resumen cuenta sin textos', async () => {
  let r = await post({ pregunta: '¿A cómo pagan el maíz?', tema: 'maiz-precio', origen: 'motor', util: true, lat: 20.5, lon: -100.8, perfil: { hectareas: 3 }, estado: 'Guanajuato', version: '0.1.0' });
  assert.equal(r.status, 201);
  r = await post({ pregunta: 'que hago si no llueve', tema: 'lluvia', util: false, motivo: 'no_era', comentario: 'llámame 4421234567', respuesta: 'x'.repeat(900) });
  assert.equal(r.status, 201);
  const filas = readFileSync(archivo, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(filas.length, 2);
  assert.equal(filas[0].lat, undefined);
  assert.equal(filas[0].perfil, undefined);
  assert.equal(filas[0].estado, 'Guanajuato');
  assert.equal(filas[1].comentario, 'llámame [teléfono]');
  assert.equal(filas[1].respuesta.length, 600);
  const res = await (await fetch(`${base}/resumen`)).json();
  assert.deepEqual(res, { total: 2, si: 1, no: 1, por_tema: { 'maiz-precio': { si: 1, no: 0 }, lluvia: { si: 0, no: 1 } }, por_motivo: { no_era: 1 } });
  assert.ok(!JSON.stringify(res).includes('llueve'));
});

test('POST rechaza datos raros', async () => {
  for (const b of [{ pregunta: 'x' }, { util: true }, { pregunta: 'x', util: false, motivo: 'otro' }, { pregunta: 'x', util: true, tema: '<b>' }, { pregunta: 'x', util: true, estado: 'Texas' }]) {
    assert.equal((await post(b)).status, 400, JSON.stringify(b));
  }
});

test('las líneas "# retro" de la semilla siempre van a entrena y no mueven la prueba', () => {
  const semilla = '== lluvia\n' + Array.from({ length: 10 }, (_, i) => `cuanto llueve ${i} | lluvia en mi parcela ${i}`).join('\n') + '\n';
  const prueba = (ps) => ps.filter((p) => p.set === 'prueba').map((p) => p.pregunta).sort();
  const antes = generar(semilla), despues = generar(semilla + '== lluvia\ncuanto llueve en agosto # retro\n');
  assert.deepEqual(prueba(despues), prueba(antes));
  assert.equal(despues.find((p) => p.pregunta === 'cuanto llueve en agosto').set, 'entrena');
});

test('el juez marca respuestas largas, sin acción pedida o de otro tema', () => {
  assert.equal(calificar({ q: '¿A cómo pagan el maíz?', respuesta: 'El maíz se pagó a 5,200 $/t en 2024.', fuentes: ['SIAP'] }).ok, true);
  assert.equal(calificar({ q: '¿A cómo pagan el maíz?', respuesta: 'Hubo 6 años secos.', fuentes: ['NASA POWER'] }).ok, false);
  assert.equal(calificar({ q: '¿Qué hago si se atrasa la lluvia?', respuesta: 'Llueve 500 mm.', fuentes: ['NASA'], que_hacer: [] }).ok, false);
  assert.equal(calificar({ q: '¿Cómo está mi tierra?', respuesta: 'Uno. Dos. Tres. Cuatro. Cinco. Seis. Siete suelo.', fuentes: [] }).ok, false);
});

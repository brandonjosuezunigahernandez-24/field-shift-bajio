import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { createApp } from '../app.js';
import { ACCIONES, accionesPara } from '../llm/acciones.js';
import { parsePower, summarizeClimate } from '../sources/nasaPower.js';

const datos = summarizeClimate(parsePower(JSON.parse(readFileSync(new URL('../fixtures/power_20.47_-100.81.json', import.meta.url), 'utf8'))));
const gto = { estado: 'Guanajuato' };
const ids = (lista) => lista.map((x) => ACCIONES.find((a) => a.accion === x.accion && a.fuente.url === x.url)?.id);

test('cada acción tiene texto, fuente con nombre y url https, y está verificada', () => {
  assert.ok(ACCIONES.length >= 15);
  assert.equal(new Set(ACCIONES.map((a) => a.id)).size, ACCIONES.length);
  for (const a of ACCIONES) {
    assert.ok(a.accion.length > 10 && a.porque.length > 10, a.id);
    assert.ok(a.fuente?.nombre, a.id);
    assert.match(a.fuente.url, /^https:\/\/\S+$/, a.id);
    assert.equal(a.verificado, true, a.id);
    assert.ok(Array.isArray(a.temas) && Array.isArray(a.palabras) && a.palabras.length, a.id);
  }
});

test('ninguna acción receta agroquímicos ni dosis', () => {
  const DOSIS = /(\bdosis\b|\d+(\.\d+)?\s*(l|lt|litros?|kg|kilos?|ml|cc|g|gr)\s*(\/|por)\s*(ha|hect)|atrazina|clorpirifos|cipermetrina|permetrina|glifosato|paraquat|monocrotofos|emamectina|spinosad|lambda)/i;
  for (const a of ACCIONES) assert.doesNotMatch(`${a.accion} ${a.porque}`, DOSIS, a.id);
});

test('salida: máximo 3, con el esquema fijo { accion, porque, fuente, url }', () => {
  const r = accionesPara({ tema: 'secos', perfil: gto, datos, pregunta: '¿Hay sequía? ¿cuántos años secos?' });
  assert.ok(r.length >= 1 && r.length <= 3);
  for (const x of r) assert.deepEqual(Object.keys(x), ['accion', 'porque', 'fuente', 'url']);
});

test('año seco: usa el dato real de la parcela (NASA POWER) en el porqué', () => {
  const r = accionesPara({ tema: 'secos', perfil: gto, datos, pregunta: '¿Cuáles fueron los años secos?' });
  assert.ok(ids(r).includes('anio-seco-poca-agua') || ids(r).includes('monitor-sequia'));
  const n = datos.anios_secos.length, total = datos.lluvia_pv_anual.length;
  assert.ok(r.some((x) => x.porque.startsWith(`En tu parcela ${n} de ${total} años fueron secos`)));
});

test('frijol: la fecha de siembra del INIFAP Bajío y nada del maíz', () => {
  const r = accionesPara({ tema: 'siembra', cultivo: 'frijol', perfil: gto, pregunta: '¿Cuándo siembro frijol?' });
  assert.equal(ids(r)[0], 'frijol-fecha-bajio');
  assert.ok(!ids(r).some((id) => id.startsWith('maiz')));
});

test('si lo último fue maíz, sale rotar con leguminosa con el dato del perfil', () => {
  const r = accionesPara({ tema: 'recomendar', perfil: { ...gto, ultimo_cultivo: 'maiz' }, pregunta: '¿Qué siembro después del maíz?' });
  assert.equal(ids(r)[0], 'rotar-leguminosa');
  assert.match(r[0].porque, /^Lo último que sembraste fue maíz\./);
});

test('plagas: solo monitoreo y a quién llamar, con la fuente del estado', () => {
  const qro = accionesPara({ tema: 'peligro', cultivo: 'maiz', perfil: { estado: 'Querétaro' }, pregunta: '¿Qué le echo al gusano cogollero del maíz?' });
  assert.deepEqual(ids(qro), ['cogollero-qro']);
  assert.match(qro[0].accion, /800 987 987 9/);
  const g = accionesPara({ tema: 'peligro', cultivo: 'maiz', perfil: gto, pregunta: 'tengo gusano cogollero' });
  assert.deepEqual(ids(g), ['cogollero-gto']);
});

test('apoyos: Producción para el Bienestar calcula el monto con las hectáreas de temporal', () => {
  const r = accionesPara({ perfil: { ...gto, agua: 'temporal', hectareas: 3.5 }, pregunta: '¿Qué apoyo de gobierno hay?' });
  assert.equal(ids(r)[0], 'produccion-bienestar');
  assert.match(r[0].porque, /3\.5 hectáreas de temporal el apoyo de 2026 es de 8,000 pesos/);
});

test('vender: precio de acopio del maíz; fertilizante gratis solo en Guanajuato', () => {
  assert.equal(ids(accionesPara({ tema: 'maiz-precio', cultivo: 'maiz', perfil: gto, pregunta: '¿A cómo pagan el maíz?' }))[0], 'acopio-maiz');
  assert.ok(ids(accionesPara({ tema: 'insumos', perfil: gto, pregunta: '¿cuánto cuesta el fertilizante?' })).includes('fertilizante-bienestar-gto'));
  assert.deepEqual(accionesPara({ tema: 'insumos', perfil: { estado: 'Querétaro' }, pregunta: '¿cuánto cuesta el fertilizante?' }), []);
});

test('sin relación con la pregunta no hay acciones (fuera de tema)', () => {
  assert.deepEqual(accionesPara({ tema: null, perfil: gto, datos, pregunta: '¿Quién ganó el partido de futbol?' }), []);
});

let server, base;
before(async () => {
  process.env.OFFLINE = '1';
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));
const post = (body) => fetch(`${base}/api/asistente`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat: 20.47, lon: -100.81, ...body }) }).then((r) => r.json());

test('POST /api/asistente: años secos trae que_hacer; saludo y fuera de tema no', async () => {
  const secos = await post({ pregunta: '¿Cuáles fueron los años secos?' });
  assert.ok(secos.que_hacer.length >= 1 && secos.que_hacer.length <= 3);
  assert.ok(secos.que_hacer.every((x) => x.accion && x.porque && x.fuente && /^https:\/\//.test(x.url)));
  assert.deepEqual((await post({ pregunta: 'hola' })).que_hacer, []);
  // La contesta la base de conocimiento (no la plantilla de fuera de tema): sí lleva acción.
  assert.match((await post({ pregunta: '¿Qué hago con el rastrojo?' })).que_hacer[0]?.accion ?? '', /rastrojo/);
  assert.deepEqual((await post({ pregunta: '¿Quién ganó el partido de futbol ayer?' })).que_hacer, []);
});

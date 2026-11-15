import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { createApp } from '../app.js';
import { destino, entrenar, predecir, respaldo, rasgos, rutaPalabras } from '../llm/intencion-ml.js';

const modelo = JSON.parse(readFileSync(new URL('../data/modelo_intencion.json', import.meta.url), 'utf8'));
const { preguntas } = JSON.parse(readFileSync(new URL('./eval/intenciones.json', import.meta.url), 'utf8'));

test('rasgos: sin acentos, con palabras y pedazos de letras', () => {
  const r = rasgos('¿Cuándo SIEMBRO?');
  assert.ok(r.includes('w:cuando') && r.includes('w:siembro') && r.includes('c:<si') && r.includes('b:cuando_siembro'));
});

test('entrenar aprende un ejemplo chico', () => {
  const m = entrenar([
    { pregunta: 'va a llover', intencion: 'a' }, { pregunta: 'llovera manana', intencion: 'a' },
    { pregunta: 'mi suelo arcilla', intencion: 'b' }, { pregunta: 'ph del suelo', intencion: 'b' },
  ], { minimo: 1 });
  assert.equal(predecir(m, 'va a llover mañana').intencion, 'a');
  assert.equal(predecir(m, 'que tal mi suelo').intencion, 'b');
});

test('el conjunto etiquetado: 300+ preguntas, prueba >= 25 % y ningún grupo partido', () => {
  assert.ok(preguntas.length >= 300);
  assert.ok(preguntas.filter((p) => p.set === 'prueba').length / preguntas.length >= 0.25);
  const lado = new Map();
  for (const p of preguntas) { assert.equal(lado.get(p.grupo) ?? p.set, p.set, p.grupo); lado.set(p.grupo, p.set); }
});

test('respaldo: no toca lo que las palabras clave ya saben', () => {
  assert.equal(respaldo('¿Cuánto llueve en verano?', undefined, modelo), null);
  assert.equal(respaldo('¿Qué me conviene sembrar?', undefined, modelo), null);
  assert.equal(respaldo('¿Qué pesticida le echo al maíz y cuánto?', undefined, modelo), null);
});

test('respaldo: entiende frases que las palabras clave no atrapan', () => {
  assert.equal(rutaPalabras('como esta mi tierra'), 'modelo');
  assert.equal(respaldo('como esta mi tierra', undefined, modelo)?.intencion, 'suelo');
  assert.equal(rutaPalabras('maiz este año si o no'), 'maiz_?');
  assert.equal(respaldo('maiz este año si o no', undefined, modelo)?.intencion, 'maiz_decision');
});

test('en la prueba, palabras + respaldo aciertan más que solo palabras', () => {
  const NIEGA = ['fuera', 'sin_dato', 'maiz_?', 'sin_respuesta'];
  const ok = (s, i) => s === destino(i) || (NIEGA.includes(i) && NIEGA.includes(s));
  let antes = 0, ahora = 0;
  for (const p of preguntas.filter((x) => x.set === 'prueba')) {
    const ruta = rutaPalabras(p.pregunta), r = respaldo(p.pregunta, ruta, modelo);
    antes += ok(ruta, p.intencion);
    ahora += ok(!r ? ruta : r.intencion ? destino(r.intencion) : 'sin_respuesta', p.intencion);
  }
  assert.ok(ahora > antes, `${ahora} vs ${antes}`);
});

let server, baseUrl;
before(async () => {
  process.env.OFFLINE = '1';
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));

test('POST /api/asistente: "como esta mi tierra" va a la plantilla del suelo', async () => {
  const res = await fetch(`${baseUrl}/api/asistente`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat: 20.47, lon: -100.81, pregunta: 'como esta mi tierra' }) });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.tema, 'suelo');
});

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../app.js';

// Fallas vistas al armar el reporte de pruebas (parcela de Celaya, perfil lleno): cada una con su respuesta coherente.
let server, baseUrl;
before(async () => {
  process.env.OFFLINE = '1';
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));

const perfil = { agua: 'temporal', prioridad: 'riesgo', estado: 'Guanajuato', ultimo_cultivo: 'frijol', cultivo_actual: 'maiz', hectareas: 7.94 };
const ask = async (pregunta, historial = []) => (await fetch(`${baseUrl}/api/asistente`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat: 20.47, lon: -100.81, pregunta, perfil, historial }),
})).json();

test('"¿Por qué ese cultivo?" lo explica el recomendador con su puntaje real, no el modelo de lenguaje', async () => {
  const reco = await ask('¿Qué me conviene sembrar después del maíz?');
  const b = await ask('¿Por qué ese cultivo?', [{ pregunta: '¿Qué me conviene sembrar después del maíz?', respuesta: reco.respuesta }]);
  assert.equal(b.origen, 'motor');
  const top = reco.recomendacion.cultivos.find((c) => c.id === reco.recomendacion.rotacion[0].cultivo);
  assert.match(b.respuesta, new RegExp(`puntaje ${top.puntaje}`));
});

test('el seguro por sequía es de apoyos, no del modelo de riesgo', async () => {
  const b = await ask('¿Hay seguro si pierdo la cosecha por sequía?');
  assert.notEqual(b.origen, 'modelo');
  assert.equal(b.tema, 'apoyos');
});

test('"¿Me conviene meterle riego?" compara riego y temporal', async () => {
  const b = await ask('¿Me conviene meterle riego a mi parcela?');
  assert.equal(b.tema, 'maiz-riego');
});

test('cuántas semillas por hectárea: el texto da la densidad que trae «Qué hacer»', async () => {
  const b = await ask('¿Cuántas semillas de maíz por hectárea?');
  assert.match(b.respuesta, /60 a 70 mil/);
  assert.doesNotMatch(b.respuesta, /^No tengo/);
});

test('"¿Qué hago si…?" empieza por una acción', async () => {
  const b = await ask('¿Qué hago si se atrasa la lluvia?');
  assert.ok(b.que_hacer.length);
  assert.ok(b.respuesta.startsWith(b.que_hacer[0].accion));
});

test('el precio de la nuez no sugiere vender maíz en acopio', async () => {
  const b = await ask('¿Cómo ha cambiado el precio de la nuez?');
  assert.ok(!b.que_hacer.some((a) => /maíz|frijol/.test(a.accion)));
});

test('temas con tarjeta (gorgojo, cosecha de agua, canícula, Monitor de Sequía) van al modelo con su tarjeta, no a otra plantilla', async () => {
  const { detectarTema } = await import('../llm/respuestas.js');
  for (const q of ['¿Cómo evito el gorgojo en el maíz guardado?', '¿Cómo hago una cosecha de agua?', '¿Qué hago en la canícula?', '¿Cómo leo el Monitor de Sequía?']) assert.equal(detectarTema(q), 'tarjeta', q);
  assert.notEqual(detectarTema('¿Cuáles fueron los años secos?'), 'tarjeta');
});

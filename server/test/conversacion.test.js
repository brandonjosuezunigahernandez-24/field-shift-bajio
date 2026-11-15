// Regresión de las fallas que encontró scripts/probar-conversacion.js (docs/cambios/33).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../app.js';
import { conCultivoActual, seguimiento } from '../llm/seguimiento.js';
import { explainRecommendation, recommend } from '../llm/recomendador.js';
import { redactar } from '../llm/respuestas.js';
import { cropFacts } from '../llm/siap.js';
import { redactarMaiz } from '../llm/maiz.js';
import { calificar, frases, obtenida } from '../scripts/probar-conversacion.js';

const h = (pregunta) => [{ pregunta, respuesta: '...' }];

test('seguimiento corto usa la pregunta anterior', () => {
  assert.equal(seguimiento('¿y el frijol?', h('¿A cuánto se paga el maíz?')), '¿a cuanto se paga el frijol?');
  assert.equal(seguimiento('¿Y en 2023?', h('¿Cuánto llovió el año pasado?')), '¿cuanto llovio 2023?');
  assert.match(seguimiento('¿y en marzo?', h('¿Hay heladas en mi parcela?')), /heladas.*marzo/);
  assert.equal(seguimiento('¿y el sorgo cuánto rinde?', h('¿Cuántas toneladas saco de mi parcela?')), 'el sorgo cuanto rinde');
  assert.equal(seguimiento('¿y el frijol?', []), '¿y el frijol?'); // sin plática no cambia
  assert.equal(seguimiento('¿Cuánto llueve en julio?', h('¿Hay heladas?')), '¿Cuánto llueve en julio?'); // no es seguimiento
});

test('con maíz sembrado, "mi cultivo" / "cuánto voy a cosechar" son del maíz; lluvia y suelo no', () => {
  for (const q of ['¿Cuánto voy a cosechar?', '¿Qué tan riesgoso es lo que tengo sembrado?', '¿Cuánto me dejaría?', '¿Cuándo lo cosecho?', '¿Me conviene más el sorgo que lo que tengo?']) {
    assert.match(conCultivoActual(q, 'maiz'), /\(maíz\)$/, q);
  }
  for (const q of ['¿Cuánto llueve en julio?', '¿Cómo está mi suelo?', '¿Qué me conviene sembrar?', '¿cuánto saco de sorgo?']) assert.equal(conCultivoActual(q, 'maiz'), q, q);
  assert.equal(conCultivoActual('¿Cuánto voy a cosechar?', 'frijol'), '¿Cuánto voy a cosechar?'); // solo maíz tiene módulo propio
});

test('después del maíz: ni el plan ni la lista empiezan con una gramínea, y el texto cabe en 6 frases', () => {
  for (const estado of ['Guanajuato', 'Querétaro']) {
    const r = recommend({ estado, agua: 'temporal', prioridad: 'riesgo', ultimoCultivo: 'frijol', cultivoActual: 'maiz', hectareas: 7.94 });
    assert.ok(!['maiz', 'sorgo', 'trigo', 'cebada'].includes(r.rotacion[0].cultivo), estado);
    const t = explainRecommendation(r);
    assert.doesNotMatch(t, /1\) (Sorgo|Maíz|Trigo|Cebada)/);
    assert.match(t, /ahorita tienes maíz/);
    assert.match(t, /7\.94 hectáreas/);
    assert.ok(frases(t) <= 6, `${frases(t)} frases`);
  }
});

test('SIAP: con perfil da su estado y su modalidad; la pregunta manda si nombra otra', () => {
  const r = (q, perfil) => redactar('siap', q, { siap: cropFacts(q), perfil }).respuesta;
  assert.doesNotMatch(r('¿a cuánto se paga el frijol?', { estado: 'Querétaro', agua: 'temporal' }), /Guanajuato/);
  assert.match(r('¿cuánto rinde el sorgo?', { estado: 'Querétaro', agua: 'temporal' }), /Temporal/);
  assert.doesNotMatch(r('¿cuánto rinde el sorgo de riego en guanajuato?', { estado: 'Querétaro' }), /Querétaro/);
  assert.match(r('¿cuánto rinde la cebada de temporal?', { estado: 'Querétaro', agua: 'temporal' }), /^No tengo cebada de temporal/);
});

test('maíz: las hectáreas y el estado dichos en la pregunta ganan al perfil', () => {
  const ctx = { estado: 'Guanajuato', perfil: { agua: 'temporal', hectareas: 7.94 } };
  assert.match(redactarMaiz('produccion', '¿Cuánto maíz saco con 25 hectáreas de temporal?', ctx).respuesta, /25 ha/);
  assert.match(redactarMaiz('produccion', '¿Qué rendimiento da el maíz en Querétaro?', ctx).respuesta, /Querétaro/);
  assert.doesNotMatch(redactarMaiz('precio', '¿A cuánto está la tonelada de maíz de riego?', ctx).respuesta, /temporal/);
});

test('calificador: tema por etiqueta, hectáreas del perfil y largo', () => {
  assert.equal(obtenida({ tema: 'maiz-produccion' }), 'maiz_produccion');
  assert.equal(obtenida({ recomendacion: {} }), 'recomendar');
  assert.equal(obtenida({ origen: 'llm' }), 'modelo');
  const f = calificar({ pregunta: '¿Cuánto voy a cosechar?', intencion: 'maiz_produccion', incluye: ['\\{ha\\}'] }, { respuesta: 'Llueve 500 mm.', tema: 'lluvia' }, { ha: 7.94, celaya: true });
  assert.deepEqual(f.map((x) => x.tipo), ['ignora el cultivo actual', 'ignora el perfil o las hectáreas', 'número sin fuente']);
});

// Ruta completa (sin internet): fuera de tema sigue fuera aunque haya plática; el perfil con maíz manda la pregunta al maíz.
let server, base;
before(async () => { process.env.OFFLINE = '1'; server = createApp().listen(0); await new Promise((ok) => server.once('listening', ok)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => new Promise((ok) => server.close(ok)));
const ask = async (body) => (await fetch(`${base}/api/asistente`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat: 20.47, lon: -100.81, ...body }) })).json();

test('ruta: fuera de tema con historial no va al modelo de lenguaje', async () => {
  const j = await ask({ pregunta: '¿Quién ganó el mundial de 2022?', historial: h('¿Cuánto llueve en verano?') });
  assert.equal(j.tema, 'fuera');
});

test('ruta: perfil con maíz sembrado y parcela dibujada', async () => {
  const perfil = { agua: 'temporal', prioridad: 'riesgo', estado: 'Guanajuato', ultimo_cultivo: 'frijol', cultivo_actual: 'maiz' };
  const parcelas = [{ id: 1, hectareas: 7.94 }];
  const c = await ask({ pregunta: '¿Cuánto voy a cosechar?', perfil, parcelas });
  assert.equal(c.tema, 'maiz-produccion');
  assert.match(c.respuesta, /7\.94 ha/);
  const y = await ask({ pregunta: '¿y el frijol?', perfil, parcelas, historial: h('¿A cuánto se paga el maíz?') });
  assert.equal(y.tema, 'siap');
  assert.match(y.respuesta, /Frijol en Guanajuato/);
});

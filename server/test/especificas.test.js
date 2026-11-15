// Regresión de las preguntas específicas (test/eval/especificas.json, solo las de desarrollo) y reglas de lenguaje sencillo (docs/cambios/36).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../app.js';
import { claro } from '../llm/claro.js';
import { mesesDe, mmDe } from '../llm/climatologia.js';
import { intencionMaiz, municipioDicho, precioDicho, rendPropio } from '../llm/maiz.js';
import { frases, largos } from '../scripts/probar-conversacion.js';

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
const primera = (t) => t.split(/(?<=[.!?])\s+/)[0];
const s = (q) => q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

test('lo que dice el agricultor: su cosecha, precio, municipio, mm y mes', () => {
  assert.deepEqual(rendPropio(s('Tengo 3.5 hectáreas y me dieron 1.2 toneladas de maíz')), { t: 1.2, ha: 3.5, t_ha: 0.34 });
  assert.deepEqual(rendPropio(s('levante 4 t por ha de maiz')), { t_ha: 4 });
  assert.equal(rendPropio(s('¿Cuántas toneladas saco?')), null);
  assert.equal(precioDicho(s('El coyote me ofrece 4,500 la tonelada')), 4500);
  assert.equal(precioDicho(s('me pagan el frijol a 18 mil la tonelada')), 18000);
  assert.equal(precioDicho(s('¿a cómo pagan la tonelada en 2023?')), null); // un año no es precio
  assert.equal(municipioDicho(s('en dolores hidalgo cuanto sale')).nombre, 'Dolores Hidalgo');
  assert.equal(municipioDicho(s('¿cuánto rinde en Querétaro?')), null); // es estado, no municipio
  assert.equal(mmDe('con 400 mm alcanza'), 400);
  assert.deepEqual(mesesDe('ay elada en dicienbre'), [12]);
  assert.deepEqual(mesesDe('siembro en junio o espero a jullio'), [6, 7]);
  assert.deepEqual(mesesDe('le entro al maiz o que tan junto'), []); // "entro" y "junto" no son meses
  assert.equal(intencionMaiz('¿De cada 10 años, en cuántos se pierde el maíz de temporal?'), 'riesgo');
  assert.equal(intencionMaiz('¿Siembro el maíz en julio o ya es tarde?'), 'siembra');
});

test('"me dieron 1.2 t en 3.5 ha": primero SU rendimiento y luego el promedio', async () => {
  const b = await ask('Tengo 3.5 hectáreas y me dieron 1.2 toneladas de maíz, ¿estoy bien o mal?');
  assert.equal(b.tema, 'maiz-produccion');
  assert.match(primera(b.respuesta), /0\.3 toneladas por hectárea|0\.34 t/);
  assert.match(primera(b.respuesta), /abajo del promedio/);
});

test('"¿con 400 mm alcanza?" compara esa lluvia con la de su parcela', async () => {
  const b = await ask('Con 400 mm de lluvia en el temporal, ¿alcanza para el maíz?');
  assert.match(primera(b.respuesta), /^400 milímetros de lluvia de junio a septiembre/);
  const c = await ask('Si este año caen 300 mm de junio a septiembre, ¿cuenta como año seco?');
  assert.match(c.respuesta, /^300 milímetros de lluvia .* sería año seco/);
});

test('el mes de la pregunta: siembra en julio, helada en octubre, julio contra agosto', async () => {
  const a = await ask('¿Siembro el maíz en julio o ya es tarde?');
  assert.equal(a.tema, 'maiz-siembra');
  assert.match(a.respuesta, /julio/);
  assert.ok(a.que_hacer.length);
  assert.match((await ask('ay elada en dicienbre?')).respuesta, /diciembre/);
  const c = await ask('¿Llueve más en julio o en agosto?');
  assert.match(c.respuesta, /^Llueve más en (julio|agosto)/);
});

test('municipio y precio dichos en la pregunta', async () => {
  const a = await ask('¿Cuánto rinde el maíz de temporal en Dolores Hidalgo?');
  assert.match(primera(a.respuesta), /^En Dolores Hidalgo/);
  const b = await ask('¿Cuánto saca de maíz por hectárea la gente de San Juan del Río?');
  assert.match(b.respuesta, /Querétaro/); // su estado, no el de la parcela
  const c = await ask('El coyote me ofrece 4,500 la tonelada de maíz, ¿es buen precio?');
  assert.match(primera(c.respuesta), /^Te ofrecen \$4,500 por tonelada: es \d+ % menos/);
});

test('"sembré maíz 3 años, ¿qué le pongo?" ya no es peligro: rota', async () => {
  const b = await ask('Sembré maíz 3 años seguidos, ¿qué le pongo ahora?');
  assert.equal(b.tema, 'maiz-rotacion');
  assert.match(b.respuesta, /^Maíz después de maíz/);
});

test('lenguaje sencillo: claro() pone unidades en palabras, redondea y quita palabras técnicas', () => {
  const t = claro('La mediana es 528.9 mm y el umbral 423.2 mm. Rinde 1.65 t/ha y 9.69 t/ha. Precio medio rural de $5,404. Tus 7.94 ha.');
  assert.match(t, /^Lo normal es unos 530 milímetros de lluvia y el límite unos 420 mm\./);
  assert.match(t, /1\.6 toneladas por hectárea y 9\.7 t\/ha/);
  assert.match(t, /Precio que pagan en el campo de \$5,404/);
  assert.match(t, /7\.94 ha/); // las hectáreas del agricultor no se redondean
});

test('reglas de las respuestas: su dato primero, ≤ 5 frases, sin palabras técnicas ni unidades sin explicar', async () => {
  const preguntas = ['¿Cuánto maíz voy a cosechar?', '¿Qué tan riesgoso es el maíz de temporal?', '¿Cuánta lluvia cae en septiembre en mi parcela?',
    '¿Cuáles fueron los años secos?', '¿A cómo pagan el maíz?', '¿Me conviene sembrar maíz este año?'];
  for (const q of preguntas) {
    const t = (await ask(q)).respuesta;
    assert.ok(frases(t) <= 5, `${q}: ${frases(t)} frases`);
    assert.doesNotMatch(t, /siniestr|mediana|umbral|precio medio rural|\bPV\b/i, q);
    if (/t\/ha|\d ?mm\b/.test(t)) assert.match(t, /toneladas por hectárea|milímetros/, q);
    assert.ok(Math.max(...largos(t)) <= 25, `${q}: frase de ${Math.max(...largos(t))} palabras`);
  }
  assert.match(primera((await ask('¿Cuánto maíz voy a cosechar?')).respuesta), /^Con tus 7\.94 ha/); // su parcela antes que el estado
});

test('la respuesta cierra con lo que conviene hacer y coincide con «Qué hacer»', async () => {
  const b = await ask('¿Cuáles fueron los años secos?');
  assert.ok(b.que_hacer.length);
  const cierre = b.respuesta.match(/Lo que conviene: ([^.]+)/)?.[1];
  assert.ok(cierre && b.que_hacer[0].accion.toLowerCase().startsWith(cierre.slice(0, 20).toLowerCase()), b.respuesta);
});

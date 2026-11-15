import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { quitarMuletillas, wantsRecommendation } from '../llm/intencion.js';
import { rendPropio } from '../llm/maiz.js';
import { rotulo } from './eval/rotulo.js';

// Formas comunes de decir lo mismo (docs/cambios/40-parafrasis.md): verbos modales, muletillas de voz, sin signos.
// Ruta real /api/asistente, sin internet y sin modelo de lenguaje (lo que iría al modelo sale como 'modelo').
let server, baseUrl;
before(async () => {
  process.env.OFFLINE = '1';
  process.env.OLLAMA_URL = 'http://127.0.0.1:9';
  const { createApp } = await import('../app.js');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));

const perfil = { agua: 'temporal', prioridad: 'riesgo', estado: 'Guanajuato', ultimo_cultivo: 'frijol', cultivo_actual: 'maiz', hectareas: 7.94 };
const ask = async (pregunta, historial = []) => (await fetch(`${baseUrl}/api/asistente`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat: 20.47, lon: -100.81, pregunta, perfil, historial }),
})).json();

const CASOS = [
  ['recomendar', 'qué sería bueno sembrar aquí'], ['recomendar', 'a ver que me aconseja sembrar este ciclo'],
  ['puedo', 'esta bien si siembro sorgo'], ['puedo', 'podria sembrar frijol este año'], ['puedo', '¿Qué tal el sorgo para mi parcela?'],
  ['siembra', 'cuando es buena fecha para sembrar'],
  ['maiz-produccion', 'me salieron 2 toneladas de maiz es poco'], ['maiz-produccion', 'cuantas toneladas me salen'],
  ['maiz-riesgo', 'oiga que tan seguro es sembrar maiz'], ['maiz-ciclo', 'en cuantos meses se cosecha el maiz'],
  ['maiz-agua', 'el maiz necesita mucha agua'], ['maiz-suelo', 'mi tierra aguanta el maiz'], ['maiz-donde', 'en que partes de guanajuato se siembra maiz'],
  ['maiz-rotacion', 'despues del frijol puedo poner maiz'],
  ['lluvia', 'cuantos milimetros en agosto'], ['secos', 'en que años no llovio'], ['anio', 'cuanta agua cayo en 2015'],
  ['tendencia', 'ya no llueve como antes'], ['humedad', 'humedad de mi terreno'], ['aptitud', 'se daria la guayaba en mi tierra'],
  ['apoyos', 'que programas hay para el campo'], ['apoyos', 'como aseguro mi cosecha'], ['apoyos', 'el seguro paga si no llueve'],
  ['credito', 'me pueden prestar para la semilla'], ['peligro', 'con cuanto abono'], ['peligro', '¿Qué le echo al gusano cogollero?'],
  ['insumos', 'cuanto sale el bulto de urea'], ['fuera', 'me recomiendas una pelicula'], ['saludo', 'buenos dias'], ['saludo', 'oiga buenas'],
];
for (const [esperado, pregunta] of CASOS) {
  test(`«${pregunta}» -> ${esperado}`, async () => assert.equal(rotulo(await ask(pregunta)), esperado));
}

test('"¿qué es el temporal?" y "¿por qué es bueno rotar?" son para entender: no van al maíz ni al recomendador', async () => {
  assert.equal(rotulo(await ask('que es el temporal')), 'modelo');
  assert.equal(rotulo(await ask('por que es bueno rotar cultivos')), 'modelo');
});

test('seguimientos: "oiga y el frijol" usa la pregunta anterior; "y por qué ese y no otro" da las razones del recomendador', async () => {
  assert.equal(rotulo(await ask('oiga y el frijol', [{ pregunta: '¿A cuánto se paga el maíz?', respuesta: '…' }])), 'siap');
  for (const q of ['y eso por que', 'por que no maiz', 'y por que ese y no otro']) {
    assert.equal(rotulo(await ask(q, [{ pregunta: '¿Qué me conviene sembrar?', respuesta: 'Te conviene más sorgo.' }])), 'porque', q);
  }
});

test('"¿Qué hago si…?" con "cómo le hago si…" empieza por una acción', async () => {
  assert.equal(rotulo(await ask('como le hago si cae helada')), 'accion');
});

test('muletillas de voz: se quitan al inicio, pero "este año" se queda', () => {
  assert.equal(quitarMuletillas('oiga joven, este... ps ¿qué siembro?'), '¿qué siembro?');
  assert.equal(quitarMuletillas('este año llovio poco'), 'este año llovio poco');
  assert.equal(quitarMuletillas('oiga'), 'oiga');
});

test('recomiéndame sí; "me recomiendas una película" o "el frijol" no es pedir recomendación de cultivos', () => {
  assert.ok(wantsRecommendation('recomiéndame un cultivo'));
  assert.ok(!wantsRecommendation('me recomiendas una pelicula'));
  assert.ok(!wantsRecommendation('me recomienda el frijol'));
});

test('lo que sacó: "3 toneladas de maíz por hectárea" es por hectárea; sin hectáreas se supone por hectárea y se dice', () => {
  assert.deepEqual(rendPropio('saque 3 toneladas de maiz por hectarea'), { t_ha: 3 });
  assert.deepEqual(rendPropio('me salieron 2 toneladas de maiz'), { t: 2, falta_ha: true }); // sin hectáreas: se pregunta
  assert.deepEqual(rendPropio('me salieron 2 toneladas de maiz por hectarea'), { t_ha: 2 });
  assert.deepEqual(rendPropio('me salieron 2 toneladas de maiz en 4 hectareas'), { t: 2, ha: 4, t_ha: 0.5 });
});

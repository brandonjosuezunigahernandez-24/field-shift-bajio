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

test('«¿qué siembro?» compara contra lo que el agricultor dijo que siembra (último cultivo y el de ahorita)', async () => {
  const reco = await ask('¿Qué me conviene sembrar?');
  assert.equal(reco.origen, 'motor');
  const [hoy] = reco.recomendacion.estrategias;
  assert.equal(hoy.id, 'actual');
  assert.equal(hoy.supuesto, false);
  assert.deepEqual(hoy.rotacion.map((s) => s.cultivo), ['frijol', 'maiz', 'frijol']);
  assert.match(reco.respuesta, /Comparada con seguir igual \(frijol, maíz grano, frijol\)/);
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

test('toneladas sin hectáreas: pregunta en cuántas, y «en 4 hectáreas» completa la cuenta', async () => {
  const a = await ask('Me salieron 2 toneladas de maíz');
  assert.match(a.respuesta, /cuántas hectáreas/);
  const b = await ask('en 4 hectáreas', [{ pregunta: 'Me salieron 2 toneladas de maíz', respuesta: a.respuesta }]);
  assert.match(b.respuesta, /Sacaste 0\.5 toneladas por hectárea \(2 t en 4 ha\)/);
});

test('"¿Qué puedo sembrar?" es una recomendación, y "¿Puedo sembrar frijol?" da el mismo lugar que la recomendación', async () => {
  const reco = await ask('Que puedo sembrar?');
  assert.equal(reco.origen, 'motor');
  const primero = reco.recomendacion.cultivos[0].id; // el primero del motor (recommendPlot)
  const b = await ask(`¿Puedo sembrar ${primero}?`);
  assert.equal(b.tema, 'cultivo-puedo');
  assert.match(b.respuesta, /lugar 1 de/);
});

// Ronda del 15 nov (parcela de Celaya y de El Marqués): lo que contestaba otra cosa.
const askEn = async (pregunta, { lat = 20.47, lon = -100.81, p = perfil, historial = [] } = {}) => (await fetch(`${baseUrl}/api/asistente`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat, lon, pregunta, perfil: p, historial }),
})).json();

test('la recomendación del chat cabe en 6 frases y conserva plan, comparación e ingreso', async () => {
  const b = await askEn('¿Qué me conviene sembrar?');
  assert.ok(b.respuesta.split(/(?<=[.!?])\s+/).length <= 6, b.respuesta);
  assert.match(b.respuesta, /Rotación de 3 años/);
  assert.match(b.respuesta, /Ingreso sin restar gastos/);
});

test('«si quiero ganar más» y «si tengo riego» cambian el plan aunque el perfil diga otra cosa', async () => {
  assert.equal((await askEn('¿Qué siembro el otro año si quiero ganar más?')).recomendacion.prioridad, 'ganar');
  const r = await askEn('¿Qué siembro si tengo riego?');
  assert.equal(r.recomendacion.agua, 'riego');
  assert.match(r.respuesta, /año 1: .* y en otoño-invierno/);
});

test('«¿Y por qué no el maíz?» da el lugar y las razones del maíz', async () => {
  const b = await askEn('¿Y por qué no el maíz?', { historial: [{ pregunta: '¿Qué me conviene sembrar?', respuesta: 'x' }] });
  assert.equal(b.origen, 'motor');
  assert.match(b.respuesta, /^Maíz grano quedó en el lugar \d de \d/);
});

test('«¿y si sigo igual?» compara la rotación de hoy con la recomendada; «¿qué tan seguro es?» da la incertidumbre', async () => {
  const a = await askEn('¿Qué pasa si sigo sembrando lo mismo?');
  assert.equal(a.tema, 'recomendar-igual');
  assert.match(a.respuesta, /Si sigues igual \(frijol, maíz grano, frijol\)/);
  const b = await askEn('¿Qué tan seguro es ese cálculo?', { historial: [{ pregunta: '¿Qué me conviene sembrar?', respuesta: 'x' }] });
  assert.equal(b.tema, 'recomendar-incertidumbre');
  assert.notEqual((await askEn('oiga que tan seguro es sembrar maiz')).tema, 'recomendar-incertidumbre');
});

test('«¿Puedo sembrar maíz?» da su lugar como cualquier cultivo', async () => {
  const b = await askEn('¿Puedo sembrar maíz?');
  assert.equal(b.tema, 'cultivo-puedo');
  assert.match(b.respuesta, /lugar \d de \d/);
});

test('cosecha sin cultivo: pregunta cuál; con frijol, pregunta hectáreas y luego compara', async () => {
  const sinCultivo = { agua: 'temporal', prioridad: 'riesgo', estado: 'Guanajuato' };
  const a = await askEn('Coseché 5 toneladas en 4 hectáreas, ¿qué tal?', { p: sinCultivo });
  assert.equal(a.tema, 'cosecha-cultivo');
  const b = await askEn('de frijol', { p: sinCultivo, historial: [{ pregunta: 'Coseché 5 toneladas en 4 hectáreas, ¿qué tal?', respuesta: a.respuesta }] });
  assert.match(b.respuesta, /Sacaste 1\.3 toneladas de frijol por hectárea \(5 t en 4 ha\)/); // claro.js redondea 1.25
});

test('glifosato es dosis (no se da), años secos «desde 2010» es una cuenta, y se compara la lluvia con otro municipio', async () => {
  assert.equal((await askEn('¿Cuánto glifosato le pongo?')).tema, 'peligro');
  const s = await askEn('¿Cuántos años secos ha habido desde 2010?');
  assert.equal(s.tema, 'secos');
  assert.match(s.respuesta, /^Desde 2010 hubo \d+ años? secos? de 15/);
  const c = await askEn('¿Llueve más aquí que en Celaya?', { lat: 20.7, lon: -100.27 });
  assert.equal(c.tema, 'lluvia-comparar');
  assert.match(c.respuesta, /en Celaya/);
});

test('el modelo nunca aconseja quemar el rastrojo', async () => {
  const { aconsejaQuemar } = await import('../llm/responder.js');
  assert.ok(aconsejaQuemar('Es mejor que lo quemes, porque daña la tierra.'));
  assert.ok(!aconsejaQuemar('Mejor no lo quemes: aprovéchalo en la parcela.'));
});

test('sin plática: «¿y por qué no el maíz?» se entiende; costos sin cultivo y «¿y si cultivo aguacate?» tienen respuesta', async () => {
  const a = await askEn('¿Y por qué no el maíz?');
  assert.match(a.respuesta, /^Maíz grano quedó en el lugar/);
  const c = await askEn('¿Cuánto me cuesta sembrar una hectárea?', { p: { agua: 'temporal', prioridad: 'riesgo', estado: 'Guanajuato' } });
  assert.match(c.respuesta, /^No tengo costos/);
  assert.equal((await askEn('¿Y si cultivo aguacate?')).tema, 'aptitud');
});

test('set nuevo: sorgo por qué quedó así, mes más seco, tierra para frijol, frijol o sorgo, se me da la fresa, granizo', async () => {
  const h = [{ pregunta: '¿Qué me conviene sembrar?', respuesta: 'x' }];
  assert.match((await askEn('¿y el sorgo por qué quedó así?', { historial: h })).respuesta, /^Sorgo grano quedó en el lugar/);
  assert.match((await askEn('¿cuál es el mes más seco del año?')).respuesta, /el que menos, diciembre/);
  assert.equal((await askEn('¿mi tierra es buena para el frijol?')).tema, 'cultivo-puedo');
  assert.match((await askEn('¿me conviene más el frijol o el sorgo?')).respuesta, /^Te conviene más .* que /);
  assert.equal((await askEn('¿se me da la fresa?')).tema, 'aptitud');
  assert.equal((await askEn('¿qué hago si cae granizo?')).tema, 'apoyos');
});

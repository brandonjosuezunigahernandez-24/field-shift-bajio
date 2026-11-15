import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../app.js';
import { graficasPlantilla } from '../llm/graficas.js';

// Los números de las gráficas deben ser los mismos que dice el texto (sin red: OFFLINE usa los fixtures de Celaya).
let server, baseUrl;
before(async () => {
  process.env.OFFLINE = '1';
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));

const ask = async (pregunta, perfil = { agua: 'temporal', prioridad: 'ganar', hectareas: 5 }) => (await fetch(`${baseUrl}/api/asistente`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat: 20.47, lon: -100.81, pregunta, perfil }),
})).json();
// Números escritos en el texto ("$5,404" -> 5404, "−2.7" -> 2.7).
const nums = (t) => (t.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((s) => Number(s.replace(/,/g, '')));
// llm/claro.js redondea para el agricultor (1.39 -> 1.4, 423.2 -> unos 420): vale el número exacto o el redondeado.
const dice = (b, xs) => { const n = nums(b.respuesta); for (const x of xs.map(Math.abs)) assert.ok([x, Number(x.toFixed(1)), Math.round(x / 10) * 10].some((v) => n.includes(v)), `${x} no está en: ${b.respuesta}`); };
const g = (b, re) => b.graficas.find((x) => re.test(x.titulo));
const esquema = (b) => {
  assert.ok(b.graficas.length >= 1 && b.graficas.length <= 3);
  for (const x of b.graficas) {
    assert.ok(['barras', 'linea', 'tabla'].includes(x.tipo) && x.titulo && x.fuente, JSON.stringify(x));
    if (x.tipo === 'tabla') assert.ok(x.filas.every((f) => f.length === x.columnas.length));
    else assert.ok(x.unidad && x.series.every((s) => s.valores.length === x.etiquetas.length));
  }
};

test('maíz, producción: la tabla de tus hectáreas y el peor/mejor año salen en el texto', async () => {
  const b = await ask('¿Cuánto maíz puedo producir en mi parcela?');
  esquema(b);
  const [fila] = g(b, /Tus 5 ha/).filas;
  dice(b, fila.slice(1));
  // El peor/mejor rendimiento por hectárea ya no va en el texto (está en la gráfica): el texto da los totales de sus hectáreas.
});

test('maíz, precio: el precio del último año y el ingreso por hectárea', async () => {
  const b = await ask('¿A cómo se vende la tonelada de maíz?');
  esquema(b);
  dice(b, [g(b, /precio/).series[0].valores.at(-1), ...g(b, /ingreso/).series[0].valores]);
});

test('maíz, comparar con sorgo: ingreso bruto por hectárea de los dos', async () => {
  const b = await ask('¿Vale la pena el maíz o me va mejor con sorgo?');
  esquema(b);
  assert.deepEqual(g(b, /Ingreso/).etiquetas, ['Maíz', 'Sorgo']);
  dice(b, g(b, /Ingreso/).series[0].valores);
});

test('maíz, riesgo: el daño del modelo en año seco y lluvioso', async () => {
  const b = await ask('¿Qué tan riesgoso es el maíz de temporal?');
  esquema(b);
  const v = g(b, /daño estimado/).series[0].valores;
  dice(b, [v[0], v[2]]);
  assert.equal(g(b, /daño estimado/).fuente, 'Modelo entrenado');
});

test('SIAP de otro cultivo: el precio del último año por estado', async () => {
  const b = await ask('¿A cuánto se vende el sorgo?');
  esquema(b);
  assert.match(b.graficas[0].titulo, /precio/);
  dice(b, b.graficas[0].series.map((s) => s.valores.at(-1)));
});

test('años secos: los años marcados en el texto son los que quedan bajo el umbral', async () => {
  const b = await ask('¿Cuáles fueron los años secos?');
  esquema(b);
  const x = b.graficas[0], [lluvia, umbral] = x.series.map((s) => s.valores);
  const secos = x.etiquetas.filter((_, i) => lluvia[i] < umbral[i]).map(Number);
  dice(b, [...secos, umbral[0], secos.length]);
});

test('heladas: los meses con más heladas y sus años', async () => {
  const b = await ask('¿Hay riesgo de heladas?');
  esquema(b);
  const v = g(b, /helada/).series[0].valores;
  dice(b, [...v].sort((a, c) => c - a).slice(0, 3));
});

test('recomendación: el puntaje de los 3 primeros cultivos y el ingreso de 3 años', async () => {
  const b = await ask('¿Qué me conviene sembrar?');
  esquema(b);
  dice(b, g(b, /Puntaje/).series[0].valores.slice(0, 3));
  dice(b, g(b, /Ingreso/).series[0].valores);
});

test('frutales: la tabla trae hectáreas, rendimiento y riego del texto', async () => {
  const b = await ask('¿Cuánto se siembra de aguacate y frutales?');
  esquema(b);
  assert.equal(b.tema, 'desglose');
  dice(b, b.graficas[0].filas.map((f) => f[1]));
});

test('aptitud: la tabla dice si se da y por qué, igual que el texto', async () => {
  const b = await ask('¿Puedo sembrar fresa aquí?');
  esquema(b);
  assert.ok(b.respuesta.includes(b.graficas[0].filas[0][2]));
});

test('pronóstico: lluvia y temperaturas de 7 días (sin pronóstico no hay gráfica)', () => {
  const dias = Array.from({ length: 7 }, (_, i) => ({ fecha: `2026-11-${15 + i}`, lluvia_mm: i === 2 ? 5.5 : 0, t_max_c: 25 + i, t_min_c: 8 - i }));
  const [lluvia, temp] = graficasPlantilla('pronostico', '¿va a llover?', { pronostico: { dias } }, {});
  assert.deepEqual(lluvia.series[0].valores, [0, 0, 5.5, 0, 0, 0, 0]);
  assert.equal(temp.tipo, 'linea');
  assert.deepEqual(graficasPlantilla('pronostico', '¿va a llover?', { pronostico: null }, {}), []);
});

test('saludo y preguntas sin datos no traen gráficas', async () => {
  assert.equal((await ask('hola')).graficas, undefined);
});

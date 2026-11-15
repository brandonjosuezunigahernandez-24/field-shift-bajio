import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esMaiz, intencionMaiz, redactarMaiz, serie, sugerenciasMaiz } from '../llm/maiz.js';
import { check } from '../scripts/evaluar-maiz.js';

test('esMaiz entiende maíz mal escrito y no confunde "raíz"', () => {
  for (const t of ['maiz', 'Maíz', 'el mais', 'cogollero en mi milpa']) assert.ok(esMaiz(t), t);
  assert.ok(!esMaiz('la raíz del frijol'));
  assert.ok(!esMaiz('cuanto llueve'));
});

test('las 3 preguntas del usuario y variantes caen en la intención correcta', () => {
  const casos = {
    'Recomiendas plantar maiz este año o ya me espero al siguiente': 'decision',
    'Que tan rapido crece el maiz en mi parcela': 'ciclo',
    'Cuanto maiz puedo producir en mi parcela': 'produccion',
    '¿Cuánto maíz voy a cosechar en mis 3 hectáreas?': 'produccion',
    'cuando cosecho el maiz': 'ciclo',
    '¿A cómo se vende la tonelada de maíz?': 'precio',
    '¿Cuánto dinero saco de mis 3 hectáreas de maíz?': 'precio',
    '¿Vale la pena el maíz o me va mejor con sorgo?': 'comparar',
    'maiz de riego o de temporal cual rinde mas': 'riego',
    '¿Hay riesgo de helada para mi maíz?': 'helada',
    '¿Qué siembro después del maíz?': 'despues',
    '¿Qué semilla de maíz me conviene?': 'semilla',
  };
  for (const [q, id] of Object.entries(casos)) assert.equal(intencionMaiz(q), id, q);
  assert.equal(intencionMaiz('¿Cuánto llueve en verano?'), null);
});

test('producción: usa las hectáreas y da peor/mejor año, y dice que no es de la parcela', () => {
  const r = redactarMaiz('produccion', 'cuanto maiz puedo producir', { estado: 'Guanajuato', perfil: { agua: 'temporal', hectareas: 10 }, lat: 20.47, lon: -100.81 });
  const s = serie('Guanajuato', 'Temporal');
  assert.ok(s.peor.t_ha < s.t_ha && s.t_ha < s.mejor.t_ha);
  assert.match(r.respuesta, /10 ha/);
  assert.match(r.respuesta, /año malo/);
  assert.match(r.respuesta, /no de tu parcela/);
  assert.deepEqual(r.fuentes, ['SIAP']);
});

test('decisión: sin riego/temporal pregunta primero; no promete pronóstico', () => {
  assert.deepEqual(redactarMaiz('decision', 'recomiendas plantar maiz', { estado: 'Guanajuato', perfil: {} }), { preguntar: 'agua' });
  const r = redactarMaiz('decision', 'recomiendas plantar maiz', { estado: 'Guanajuato', perfil: { agua: 'riego' } });
  assert.match(r.respuesta, /No tengo costos/);
});

test('ciclo: da la cifra de la FAO con su fuente y enlace, y no inventa el del Bajío', () => {
  const r = redactarMaiz('ciclo', 'cuanto tarda', {});
  assert.match(r.respuesta, /125 y 180 días/);
  assert.match(r.respuesta, /No tengo el ciclo de las variedades del Bajío/);
  assert.match(r.respuesta, /\[FAO-56\]/);
  assert.match(r.enlaces[0], /fao\.org/);
});

test('trampa de número: corrige antes de dar los datos', () => {
  const r = redactarMaiz('produccion', 'verdad que el maiz rinde 8 toneladas por hectarea', { estado: 'Guanajuato', perfil: { agua: 'temporal' }, lat: 20.47, lon: -100.81 });
  assert.match(r.respuesta, /^No: según el SIAP no es 8/);
});

test('sin dato: nunca una tarjeta, sugiere 3 preguntas', () => {
  const r = sugerenciasMaiz();
  assert.match(r.respuesta, /^No tengo/);
  assert.equal((r.respuesta.match(/¿/g) ?? []).length, 3);
});

test('el verificador de la evaluación revisa incluye, excluye, cita y largo', () => {
  assert.deepEqual(check({ incluye: ['hola'], cita: ['SIAP'] }, 'hola [SIAP]'), []);
  assert.equal(check({ incluye: ['adios'] }, 'hola').length, 1);
  assert.equal(check({ excluye: ['hola'] }, 'hola').length, 1);
  assert.equal(check({ cita: ['SIAP'] }, 'hola').length, 1);
});

test('producción: las hectáreas dichas en la pregunta cuentan si el perfil no las trae', () => {
  const r = redactarMaiz('produccion', '¿Cuánto maíz voy a cosechar en mis 3 hectáreas?', { estado: 'Guanajuato', perfil: { agua: 'temporal' }, lat: 20.47, lon: -100.81 });
  assert.match(r.respuesta, /Con tus 3 ha/);
  assert.doesNotMatch(r.respuesta, /Dime cuántas hectáreas/);
});

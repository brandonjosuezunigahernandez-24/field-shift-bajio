import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aniosNombrados, cifraPrincipal, fraseParaTi, paraOir, partirGlosario } from './glosario.js';

const maiz = [
  'El maíz de temporal rinde en promedio 1.65 t por hectárea en Guanajuato.',
  'De 2018 a 2024 rindió entre 1.39 t/ha (2023) y 1.82 t/ha (2024), por hectárea sembrada y contando las pérdidas.',
  'Con tus 3 ha sacarías unas 4.9 t (entre 4.2 t en un año malo y 5.5 t en uno bueno).',
];

test('la cifra grande es la de sus hectáreas, no el 3 que dio el agricultor', () => {
  assert.equal(fraseParaTi(maiz), 2);
  assert.deepEqual(cifraPrincipal('¿Cuánto maíz voy a cosechar?', maiz), { valor: '4.9', unidad: 'toneladas', frase: 2 });
  assert.deepEqual(cifraPrincipal('¿Cuáles fueron los años secos?', ['Fueron 6 años secos de 25 (2000-2024): 2000, 2005.']), { valor: '6', unidad: 'años secos', frase: 0 });
  assert.equal(cifraPrincipal('¿Puedo sembrar fresa aquí?', maiz), null);
  const precio = ['En Guanajuato el maíz de temporal se pagó a $5,404 la tonelada en 2024.', 'Con tus 3 ha serían $26,751 de temporal.'];
  assert.deepEqual(cifraPrincipal('¿A cómo pagan el maíz?', precio), { valor: '5,404', unidad: 'pesos la tonelada', frase: 0 });
  const nuevo = ['Con tus 3 ha sacarías unas 4.9 toneladas de maíz de temporal en un año normal.', 'Son promedios oficiales, no de tu parcela.', 'En Celaya rindió de 1.7 a 2.2 t/ha.'];
  assert.equal(fraseParaTi(nuevo), -1);
  assert.deepEqual(cifraPrincipal('¿Cuánto maíz voy a cosechar?', nuevo), { valor: '4.9', unidad: 'toneladas', frase: 0 });
});

test('glosario: cada palabra una vez y sin marcar pedazos de palabras', () => {
  const vistos = new Set();
  const p = partirGlosario('Hace calor; rinde 1.39 t/ha con 400 mm, y otra vez t/ha.', vistos);
  assert.deepEqual(p.filter((x) => x.termino).map((x) => x.texto), ['rinde', 't/ha', 'mm']);
  assert.equal(p.map((x) => x.texto ?? x).join(''), 'Hace calor; rinde 1.39 t/ha con 400 mm, y otra vez t/ha.');
});

test('Escuchar lee unidades en palabras', () => {
  assert.equal(paraOir('Con tus 3 ha sacarías 4.9 t; rinde 1.39 t/ha con 423.2 mm (2000-2024), pH 7.4, $27,100.'),
    'Con tus 3 hectáreas sacarías 4.9 toneladas; rinde 1.39 toneladas por hectárea con 423.2 milímetros (2000 a 2024), pe hache 7.4, 27,100 pesos.');
});

test('años nombrados sin los rangos', () => {
  assert.deepEqual(aniosNombrados(maiz[1]), ['2023', '2024']);
  assert.deepEqual(aniosNombrados('Fueron 6 de 25 (2000-2024): 2000, 2005'), ['2000', '2005']);
});

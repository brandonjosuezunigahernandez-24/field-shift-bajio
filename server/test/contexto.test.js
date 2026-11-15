import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findContext, findLocal, parseWikipedia } from '../llm/contexto.js';

test('la base local encuentra por palabra clave, sin importar acentos', () => {
  const r = findLocal('¿Para qué sirve sembrar frijol y garbanzo?');
  assert.ok(r.some((x) => x.texto.includes('nitrógeno')));
  assert.equal(r[0].fuente, 'Base local');
  assert.ok(findLocal('¿Qué es la sequía para el sorgo?').length > 0);
  assert.ok(findLocal('Como se cultivan los frijoles').some((x) => x.texto.includes('nitrógeno')));
});

test('una pregunta fuera de tema no trae nada de la base local', () => {
  assert.deepEqual(findLocal('¿Quién ganó el futbol?'), []);
});

test('findContext: sin internet y fuera de tema -> solo la ficha', async () => {
  process.env.OFFLINE = '1';
  assert.deepEqual(await findContext('¿Quién ganó el futbol?'), { base: 'ficha', items: [], enlaces: [] });
  assert.deepEqual(await findContext(''), { base: 'ficha', items: [], enlaces: [] });
});

test('findContext: la base local gana y no sale a internet', async () => {
  process.env.OFFLINE = '1';
  const c = await findContext('¿Qué pasa con el invernadero y las heladas?');
  assert.equal(c.base, 'conocimiento');
});

test('parseWikipedia saca texto, fuente y enlace', () => {
  const raw = { query: { pages: { 1: { extract: 'El sorgo​ es un cereal.', fullurl: 'https://es.wikipedia.org/wiki/Sorghum' } } } };
  assert.deepEqual(parseWikipedia(raw), { titulo: undefined, texto: 'El sorgo es un cereal.', fuente: 'Wikipedia', enlace: 'https://es.wikipedia.org/wiki/Sorghum' });
  assert.equal(parseWikipedia({}), null);
});

import { pickParagraphs } from '../llm/contexto.js';

test('pickParagraphs deja los párrafos de manejo del cultivo y recorta', () => {
  const text = ['El jitomate es una planta de origen americano muy usada en la cocina de todo el mundo.',
    'Historia larga que no habla de nada útil para sembrar nada en ningún lugar del mundo, solo curiosidades.',
    'El cultivo requiere riego frecuente, suelo bien drenado y temperatura templada para germinar bien.'].join('\n');
  const r = pickParagraphs(text);
  assert.ok(r.includes('riego frecuente'));
  assert.ok(!r.includes('curiosidades'));
});

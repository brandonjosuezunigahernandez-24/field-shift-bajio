// Base de conocimiento (llm/conocimiento.json) y su uso, sin Ollama (docs/cambios/38).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { tarjetas } from '../llm/prompt.js';
import { answer, floja } from '../llm/responder.js';

const CARDS = JSON.parse(readFileSync(new URL('../llm/conocimiento.json', import.meta.url), 'utf8'));
const texto = (q) => tarjetas(q).map((c) => c.texto).join(' ');

test('cada tarjeta trae fuente con nombre y url, estados y verificado', () => {
  assert.ok(CARDS.length >= 45);
  assert.equal(new Set(CARDS.map((c) => c.id)).size, CARDS.length, 'ids repetidos');
  for (const c of CARDS) {
    assert.ok(c.fuente?.nombre, `${c.id}: sin fuente`);
    assert.match(c.fuente.url ?? '', /^https:\/\//, `${c.id}: sin url`);
    assert.ok(c.estados?.length, `${c.id}: sin estados`);
    assert.ok('verificado' in c, `${c.id}: sin verificado`);
    assert.ok(c.palabras.every((p) => p === p.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()), `${c.id}: palabras con acento`);
  }
  assert.ok(CARDS.filter((c) => c.verificado === true).length >= 30);
});

test('ninguna tarjeta trae dosis, productos químicos ni marcas', () => {
  const DOSIS = /\d+\s*(kg|g|l|litros?|ml|cc|ton(eladas)?)\s*(\/|por)\s*(ha|hect)/i;
  const QUIMICOS = /(clorpirifos|cipermetrina|glifosato|atrazina|paraquat|malati[oó]n|fosfuro|imidacloprid|spinosad|emamectina|urea\b|pioneer|dekalb|asgrow|bayer|syngenta)/i;
  for (const c of CARDS) {
    assert.doesNotMatch(c.texto, DOSIS, `${c.id}: trae dosis`);
    assert.doesNotMatch(c.texto, QUIMICOS, `${c.id}: trae producto o marca`);
  }
});

test('la tarjeta del cultivo correcto: el frijol no recibe tarjetas del maíz ni del sorgo', () => {
  for (const q of ['¿Qué plagas le caen al frijol?', '¿Cuándo se siembra el frijol de temporal?', '¿Por qué se me caen las flores del frijol?', '¿Qué hago si se me heló el frijol?']) {
    assert.doesNotMatch(texto(q), /\b(ma[ií]z|sorgo)\b(?! ?, frijol)/i, q);
  }
  assert.match(texto('¿Qué plagas le caen al frijol?'), /conchuela/);
  assert.match(texto('¿Cuándo se siembra el frijol de temporal?'), /junio/);
  assert.match(texto('¿Cómo detecto el gusano cogollero?'), /cogollero/);
  assert.ok(tarjetas('¿Cómo sé cuándo cosechar el sorgo?').every((c) => /sorgo/.test(c.texto)));
});

test('tarjetas nuevas: los temas de temporal encuentran su tarjeta', () => {
  assert.match(texto('¿Qué pasa si quemo el rastrojo?'), /Quemar el rastrojo/);
  assert.match(texto('¿Qué es la canícula?'), /canícula/);
  assert.match(texto('¿Cómo hago composta en mi rancho?'), /composta/);
  assert.match(texto('¿Cómo junto agua de lluvia para mis animales y la siembra?'), /cosecha de agua/);
  assert.match(texto('¿Cómo guardo mi maíz para que no le entre el gorgojo?'), /herm[eé]tic/);
  assert.match(texto('¿Cómo leo el Monitor de Sequía?'), /D4/);
  assert.match(texto('¿Qué es la milpa?'), /calabaza/);
});

test('floja: tautología o eco de la pregunta, pero no un dato corto', () => {
  assert.ok(floja('La erosión frena la erosión [Base local].', '¿Qué es la erosión?'));
  assert.ok(floja('La canícula es la canícula.', '¿Qué es la canícula?'));
  assert.ok(!floja('Hubo 6 años secos [NASA POWER].', 'años secos'));
  assert.ok(!floja('Sí: la materia orgánica guarda mejor la humedad y es más fértil [Base local].', '¿Conviene meter abono orgánico?'));
});

test('responder: si el modelo contesta flojo, se usa la tarjeta tal cual y citada', async () => {
  const r = await answer({ ficha: {}, pregunta: '¿Qué es la canícula?', ask: async () => ({ respuesta: 'La canícula es la canícula [Base local].', fuentes: ['Base local'] }) });
  assert.equal(r.origen, 'plantilla');
  assert.match(r.respuesta, /veranillo.*\[Base local\]$/);
});

test('responder: si se niega, se respeta (la tarjeta puede no venir al caso)', async () => {
  const no = 'No lo sé con mis datos. Pregúntale a un técnico del INIFAP o de la SADER de tu zona.';
  const r = await answer({ ficha: {}, pregunta: '¿Me sirve la ceniza como abono?', ask: async () => ({ respuesta: no, fuentes: [] }) });
  assert.equal(r.respuesta, no);
  assert.equal(r.origen, 'llm');
});

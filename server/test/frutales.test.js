import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../app.js';
import { NO_ES, fichaFrutal, topFrutales } from '../llm/frutales.js';

test('topFrutales: Guanajuato y Querétaro con datos, ordenados por valor; otro estado da null', () => {
  const g = topFrutales('guanajuato');
  assert.ok(g.length >= 5 && g.every((f) => f.estado === 'Guanajuato'));
  assert.ok(g.some((f) => f.cultivo === 'Fresa'));
  assert.ok(g.every((f, i) => i === 0 || f.valor_millones_total_2018_2024 <= g[i - 1].valor_millones_total_2018_2024));
  assert.ok(topFrutales('Querétaro').some((f) => f.cultivo === 'Uva'));
  assert.equal(topFrutales('Jalisco'), null);
  assert.equal(topFrutales('Guanajuato', 3).length, 3);
});

test('fichaFrutal entiende acentos y sinónimos y siempre dice qué no es un frutal', () => {
  const f = fichaFrutal('Limón');
  assert.equal(f.cultivo, 'Limón');
  assert.equal(fichaFrutal('limon').cultivo, 'Limón');
  assert.equal(fichaFrutal('nopal tunero').cultivo, 'Tuna');
  assert.equal(fichaFrutal('aguacate').estados.length, 2);
  assert.deepEqual(f.no_es, NO_ES);
  assert.match(f.no_verificado, /no verificado/);
  assert.equal(fichaFrutal('maíz'), null);
});

test('GET /api/frutales', async () => {
  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/frutales`;
  try {
    const ok = await (await fetch(`${base}?estado=Guanajuato`)).json();
    assert.ok(ok.frutales.every((f) => f.estado === 'Guanajuato') && ok.no_es.length);
    assert.equal((await fetch(`${base}?estado=Jalisco`)).status, 404);
  } finally { server.close(); }
});

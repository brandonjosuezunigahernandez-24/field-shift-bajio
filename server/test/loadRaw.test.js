import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { loadRaw } from '../lib/loadRaw.js';

test('loadRaw reintenta una vez cuando la primera consulta falla', async () => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) throw new Error('timeout');
    return { ok: true, json: async () => ({ ok: 1 }) };
  };
  try {
    const { raw, origen } = await loadRaw({ source: 'prueba', label: 'x', lat: 1.23, lon: 4.56, url: 'https://example.test/x', timeoutMs: 100 });
    assert.deepEqual(raw, { ok: 1 });
    assert.equal(origen, 'api');
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = real;
    await rm(new URL('../cache/prueba_1.23_4.56.json', import.meta.url), { force: true });
  }
});

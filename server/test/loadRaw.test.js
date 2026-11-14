import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { afterEach, test } from 'node:test';
import { HttpError } from '../lib/errors.js';
import { loadRaw } from '../lib/loadRaw.js';

// No real network: global fetch is replaced by a fake that fails the first calls.
delete process.env.OFFLINE;
const realFetch = globalThis.fetch;
const CACHE_FILE = new URL('../cache/test-retry_0.00_0.00.json', import.meta.url);
const options = { source: 'test-retry', label: 'una prueba', lat: 0, lon: 0, buildUrl: () => 'https://example.test/' };

afterEach(async () => {
  globalThis.fetch = realFetch;
  await rm(CACHE_FILE, { force: true });
});

// Fails the first `failures` calls, then answers { ok: true }.
function flakyFetch(failures) {
  const calls = { count: 0 };
  globalThis.fetch = async () => {
    calls.count += 1;
    if (calls.count <= failures) throw new Error('connection reset');
    return new Response(JSON.stringify({ ok: true }));
  };
  return calls;
}

test('loadRaw retries once when the first call fails', async () => {
  const calls = flakyFetch(1);
  const { raw, origen } = await loadRaw(options);
  assert.equal(calls.count, 2);
  assert.equal(origen, 'api');
  assert.deepEqual(raw, { ok: true });
});

test('loadRaw gives up after two failed calls (502 when there is no fixture)', async () => {
  const calls = flakyFetch(2);
  await assert.rejects(loadRaw(options), (err) => err instanceof HttpError && err.status === 502);
  assert.equal(calls.count, 2);
});

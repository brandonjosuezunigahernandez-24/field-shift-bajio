import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { afterEach, test } from 'node:test';
import { CACHE_DIR, readCache, writeCache, writeFixture } from '../lib/cache.js';
import { HttpError } from '../lib/errors.js';
import { loadRaw, resetPauses } from '../lib/loadRaw.js';

// No real network: global fetch is replaced by a fake. The cache and fixture files written
// here use a test-only key and are removed after each test.
delete process.env.OFFLINE;
const realFetch = globalThis.fetch;
const KEY = 'test-loadraw_0.00_0.00';
const TEST_FILES = [new URL(`${KEY}.json`, CACHE_DIR), new URL(`../fixtures/${KEY}.json`, import.meta.url)];
const validate = (raw) => {
  if (!raw.ok) throw new Error('missing ok');
};
const options = { source: 'test-loadraw', label: 'una prueba', lat: 0, lon: 0, buildUrl: () => 'https://example.test/', validate };

afterEach(async () => {
  globalThis.fetch = realFetch;
  resetPauses();
  for (const file of TEST_FILES) await rm(file, { force: true });
});

// Fails the first `failures` calls with a network error, then answers `body`.
function fakeFetch({ failures = 0, body = { ok: true } } = {}) {
  const calls = { count: 0 };
  globalThis.fetch = async () => {
    calls.count += 1;
    if (calls.count <= failures) throw new Error('connection reset');
    return new Response(JSON.stringify(body));
  };
  return calls;
}

test('loadRaw returns a good response and saves it to the cache', async () => {
  const calls = fakeFetch();
  const { raw, origen } = await loadRaw(options);
  assert.equal(calls.count, 1);
  assert.equal(origen, 'api');
  assert.deepEqual(raw, { ok: true });
  assert.deepEqual(await readCache(KEY), { ok: true });
});

test('loadRaw never saves a response that fails validate', async () => {
  fakeFetch({ body: { error: 'garbage' } });
  await assert.rejects(loadRaw(options), (err) => err instanceof HttpError && err.status === 502);
  assert.equal(await readCache(KEY), null);
});

test('loadRaw retries once when the first call fails', async () => {
  const calls = fakeFetch({ failures: 1 });
  const { origen } = await loadRaw(options);
  assert.equal(calls.count, 2);
  assert.equal(origen, 'api');
});

test('loadRaw downloads again a cache file that no longer passes validate', async () => {
  await writeCache(KEY, { old: true });
  const calls = fakeFetch();
  const { raw, origen } = await loadRaw(options);
  assert.equal(calls.count, 1);
  assert.equal(origen, 'api');
  assert.deepEqual(raw, { ok: true });
});

test('loadRaw refreshes an out-of-date cache', async () => {
  await writeCache(KEY, { ok: true, year: 2024 });
  const calls = fakeFetch({ body: { ok: true, year: 2025 } });
  const isStale = (raw) => (raw.year < 2025 ? 'old' : null);
  const { raw, origen } = await loadRaw({ ...options, isStale });
  assert.equal(calls.count, 1);
  assert.equal(origen, 'api');
  assert.equal(raw.year, 2025);
});

test('loadRaw keeps an out-of-date cache when the network fails', async () => {
  await writeCache(KEY, { ok: true, year: 2024 });
  await writeFixture(KEY, { ok: true, fixture: true });
  fakeFetch({ failures: 2 });
  const { raw, origen } = await loadRaw({ ...options, isStale: (r) => (r.year < 2025 ? 'old' : null) });
  assert.equal(origen, 'cache');
  assert.equal(raw.year, 2024);
});

test('loadRaw uses the fixture when the network fails twice', async () => {
  await writeFixture(KEY, { ok: true, fixture: true });
  const calls = fakeFetch({ failures: 2 });
  const { raw, origen } = await loadRaw(options);
  assert.equal(calls.count, 2);
  assert.equal(origen, 'fixture');
  assert.deepEqual(raw, { ok: true, fixture: true });
});

test('loadRaw passes the rounded point to a custom fetcher', async () => {
  await rm(new URL('test-loadraw_0.000_0.000.json', CACHE_DIR), { force: true });
  const seen = [];
  const fetcher = async (lat, lon) => {
    seen.push([lat, lon]);
    return { ok: true };
  };
  const { origen } = await loadRaw({ ...options, lat: 0.0004, lon: -0.0004, decimals: 3, fetcher });
  assert.equal(origen, 'api');
  assert.deepEqual(seen, [[0, 0]]);
  await rm(new URL('test-loadraw_0.000_0.000.json', CACHE_DIR), { force: true });
});

test('loadRaw gives up after two failed calls (502 when there is no fixture)', async () => {
  const calls = fakeFetch({ failures: 2 });
  await assert.rejects(loadRaw(options), (err) => err instanceof HttpError && err.status === 502);
  assert.equal(calls.count, 2);
});

test('a source that times out is not retried and is left alone for a while (pauseOnTimeoutMs)', async () => {
  const calls = { count: 0 };
  globalThis.fetch = async () => {
    calls.count += 1;
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  };
  const slow = { ...options, pauseOnTimeoutMs: 60000 };
  await assert.rejects(loadRaw(slow), HttpError);
  assert.equal(calls.count, 1, 'no second try after a timeout');
  await assert.rejects(loadRaw({ ...slow, lat: 1 }), HttpError);
  assert.equal(calls.count, 1, 'another plot does not wait again while the source is paused');
  resetPauses();
  fakeFetch();
  assert.equal((await loadRaw(slow)).origen, 'api', 'after the pause it asks again');
});

test('without pauseOnTimeoutMs a timeout is retried as before', async () => {
  const calls = { count: 0 };
  globalThis.fetch = async () => {
    calls.count += 1;
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  };
  await assert.rejects(loadRaw(options), HttpError);
  assert.equal(calls.count, 2);
});

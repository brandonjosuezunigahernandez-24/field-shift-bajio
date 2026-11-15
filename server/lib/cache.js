import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// Under `node --test` the cache is a temp folder: the tests see only the committed fixtures, never
// what the app downloaded on this machine (e.g. a newer year of NASA POWER than the fixtures).
export const CACHE_DIR = process.env.NODE_TEST_CONTEXT
  ? pathToFileURL(join(tmpdir(), 'field-shift-test-cache') + sep)
  : new URL('../cache/', import.meta.url);
const FIXTURE_DIR = new URL('../fixtures/', import.meta.url);

async function readJson(dirUrl, key) {
  try {
    return JSON.parse(await readFile(new URL(`${key}.json`, dirUrl), 'utf8'));
  } catch {
    // Missing or corrupt file: treat it as a miss.
    return null;
  }
}

async function writeJson(dirUrl, key, data) {
  await mkdir(dirUrl, { recursive: true });
  await writeFile(new URL(`${key}.json`, dirUrl), JSON.stringify(data));
}

export const readCache = (key) => readJson(CACHE_DIR, key);
export const readFixture = (key) => readJson(FIXTURE_DIR, key);
export const writeCache = (key, data) => writeJson(CACHE_DIR, key, data);
export const writeFixture = (key, data) => writeJson(FIXTURE_DIR, key, data);

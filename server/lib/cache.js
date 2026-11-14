import { mkdir, readFile, writeFile } from 'node:fs/promises';

const CACHE_DIR = new URL('../cache/', import.meta.url);
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

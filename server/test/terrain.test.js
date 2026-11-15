import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import { decodePng } from '../lib/png.js';
import {
  GRID_SIZE,
  SIDES_M,
  terrainSide,
  terrainZoom,
  tileMeters,
  decodeTerrarium,
  lonLatToTile,
  sampleGrid,
  stitchTiles,
  summarizeTerrain,
  tilesAround,
  validateTerrain,
} from '../sources/terrain.js';

// --- tiny PNG encoder, only for the tests: applies a different filter on each row ---
function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}
const CRC = crcTable();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
function encodePng(width, height, channels, pixels) {
  const stride = width * channels;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const filter = y % 5;
    const line = Buffer.alloc(stride + 1);
    line[0] = filter;
    for (let i = 0; i < stride; i++) {
      const cur = pixels[y * stride + i];
      const left = i >= channels ? pixels[y * stride + i - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + i] : 0;
      const upLeft = y > 0 && i >= channels ? pixels[(y - 1) * stride + i - channels] : 0;
      const pred = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter];
      line[i + 1] = (cur - pred) & 0xff;
    }
    rows.push(line);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = { 3: 2, 4: 6 }[channels];
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('decodePng reverses all five PNG filters (RGB and RGBA)', () => {
  for (const channels of [3, 4]) {
    const width = 7;
    const height = 10;
    const pixels = Buffer.alloc(width * height * channels);
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37 + (i >> 3) * 11) & 0xff;
    const image = decodePng(encodePng(width, height, channels, pixels));
    assert.equal(image.width, width);
    assert.equal(image.height, height);
    assert.equal(image.channels, channels);
    assert.deepEqual(image.data, pixels);
  }
});

test('decodePng rejects files that are not PNG', () => {
  assert.throws(() => decodePng(Buffer.from('hola, no soy un png')), /Not a PNG/);
});

test('decodeTerrarium follows R*256 + G + B/256 - 32768', () => {
  assert.equal(decodeTerrarium(128, 0, 0), 0);
  // 1752.5 m = 34520.5 + offset -> R=134, G=216, B=128
  assert.equal(decodeTerrarium(134, 216, 128), 1752.5);
});

test('lonLatToTile matches Web Mercator tile numbers', () => {
  assert.deepEqual(lonLatToTile(0, 0, 1), { x: 1, y: 1 });
  const celaya = lonLatToTile(-100.81, 20.47, 14);
  assert.equal(Math.floor(celaya.x), 3604);
  assert.equal(Math.floor(celaya.y), 7239);
});

test('tilesAround picks a 2x2 block that contains the point with margin', () => {
  const { x0, y0, z } = tilesAround(20.47, -100.81);
  const { x, y } = lonLatToTile(-100.81, 20.47, z);
  assert.ok(x - x0 >= 0.5 && x - x0 <= 1.5);
  assert.ok(y - y0 >= 0.5 && y - y0 <= 1.5);
});

// Synthetic 2x2 block whose height grows 1 m per pixel to the east: lets us check orientation.
function eastRampTiles() {
  const images = [];
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const data = Buffer.alloc(256 * 256 * 3);
    for (let py = 0; py < 256; py++) {
      for (let px = 0; px < 256; px++) {
        const h = 1000 + dx * 256 + px; // meters
        const v = h + 32768;
        const i = (py * 256 + px) * 3;
        data[i] = Math.floor(v / 256);
        data[i + 1] = Math.floor(v) % 256;
        data[i + 2] = 0;
      }
    }
    images.push({ dx, dy, image: { width: 256, height: 256, channels: 3, data } });
  }
  return images;
}

test('sampleGrid: column 0 is west, row 0 is north, and the grid stays inside the tiles', () => {
  const lat = 20.47;
  const lon = -100.81;
  const { x0, y0, z } = tilesAround(lat, lon);
  const grid = sampleGrid(stitchTiles(eastRampTiles()), { lat, lon, x0, y0, z });
  assert.equal(grid.length, GRID_SIZE * GRID_SIZE);
  const westEdge = grid[32 * GRID_SIZE];
  const eastEdge = grid[32 * GRID_SIZE + GRID_SIZE - 1];
  assert.ok(eastEdge > westEdge, 'heights must grow to the east');
  // A ramp of 1 m per pixel (~9 m at zoom 14 in the Bajío): 1 km is ~110 pixels.
  assert.ok(eastEdge - westEdge > 90 && eastEdge - westEdge < 130, `ramp ${eastEdge - westEdge}`);
  // Same column, different rows: the ramp only goes east, so north and south match.
  assert.equal(grid[0 * GRID_SIZE + 10], grid[(GRID_SIZE - 1) * GRID_SIZE + 10]);
});

test('real Celaya terrain fixture: Bajío heights and a mostly flat plot', async () => {
  const raw = JSON.parse(
    await readFile(new URL('../fixtures/terrain_20.470_-100.810.json', import.meta.url), 'utf8')
  );
  validateTerrain(raw);
  const summary = summarizeTerrain(raw);
  assert.ok(summary.altura_centro_m > 1650 && summary.altura_centro_m < 1850, `${summary.altura_centro_m} m`);
  assert.ok(summary.desnivel_m >= 0 && summary.desnivel_m < 80);
  assert.equal(summary.alturas.length, summary.tam * summary.tam);
});

test('validateTerrain rejects incomplete grids', () => {
  assert.throws(() => validateTerrain({ tam: 3, alturas: [1, 2] }), /Unexpected terrain/);
  assert.throws(() => validateTerrain({ tam: 1, alturas: [null] }), /missing heights/);
});

test('terrainSide rounds up to the allowed sides', () => {
  assert.equal(terrainSide(undefined), 1000);
  assert.equal(terrainSide('abc'), 1000);
  assert.equal(terrainSide(120), 250);
  assert.equal(terrainSide(600), 1000);
  assert.equal(terrainSide(9000), 4000);
  assert.deepEqual(SIDES_M, [250, 500, 1000, 2000, 4000]);
});

test('terrainZoom keeps every allowed side inside its 2 x 2 tiles', () => {
  for (const lat of [0, 20.47, 45, 60]) {
    for (const side of SIDES_M) {
      const z = terrainZoom(lat, side);
      assert.ok(z <= 14 && tileMeters(lat, z) > side, `lat ${lat}, side ${side}: zoom ${z}`);
    }
  }
  assert.equal(terrainZoom(20.47, 1000), 14); // the Bajío block keeps the old zoom
  assert.equal(terrainZoom(20.47, 4000), 13);
});

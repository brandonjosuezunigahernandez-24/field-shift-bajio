import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 }; // grey, RGB, grey+alpha, RGBA

// Minimal PNG decoder for the elevation tiles: 8-bit, non-interlaced, no palette.
// Returns { width, height, channels, data } with one byte per channel, row by row.
// Anything else throws, so an unexpected tile never turns into fake heights.
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG file');

  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: chunk.readUInt32BE(0),
        height: chunk.readUInt32BE(4),
        bitDepth: chunk[8],
        colorType: chunk[9],
        interlace: chunk[12],
      };
    } else if (type === 'IDAT') {
      idat.push(chunk);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  if (!header) throw new Error('PNG without IHDR');
  const channels = CHANNELS[header.colorType];
  if (header.bitDepth !== 8 || !channels || header.interlace !== 0) {
    throw new Error(
      `Unsupported PNG (bit depth ${header.bitDepth}, color type ${header.colorType}, interlace ${header.interlace})`
    );
  }

  const { width, height } = header;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < height * (stride + 1)) throw new Error('Truncated PNG data');

  const data = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = y * stride;
    const prev = out - stride; // previous output row (only read when y > 0)
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? data[out + i - channels] : 0;
      const up = y > 0 ? data[prev + i] : 0;
      const upLeft = y > 0 && i >= channels ? data[prev + i - channels] : 0;
      let value;
      switch (filter) {
        case 0: value = line[i]; break;
        case 1: value = line[i] + left; break;
        case 2: value = line[i] + up; break;
        case 3: value = line[i] + ((left + up) >> 1); break;
        case 4: value = line[i] + paeth(left, up, upLeft); break;
        default: throw new Error(`Unknown PNG filter ${filter}`);
      }
      data[out + i] = value & 0xff;
    }
  }
  return { width, height, channels, data };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

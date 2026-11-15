// Textures for the raised parcels on the satellite map: MapLibre "fill-extrusion-pattern" images,
// drawn on a canvas for each color the map needs (soil from SoilGrids, crop for the year).
//  - soil: clods and thin soil layers (the block's sides)
//  - crop: furrow rows with plants (the top of the parcel)
// Small (64 px at 2x) and cached by name, so the year slider just picks an existing image.

const SIZE = 64;

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const shade = ([r, g, b], k, a = 1) =>
  `rgba(${Math.min(255, Math.round(r * k))},${Math.min(255, Math.round(g * k))},${Math.min(255, Math.round(b * k))},${a})`;

function drawSoil(ctx, base, random) {
  ctx.fillStyle = shade(base, 1);
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let y = 6; y < SIZE; y += 11) {
    ctx.fillStyle = shade(base, 0.82, 0.6);
    ctx.fillRect(0, y + Math.round(random() * 2), SIZE, 1);
  }
  for (let i = 0; i < 220; i++) {
    const x = random() * SIZE;
    const y = random() * SIZE;
    const r = 0.6 + random() * 1.8;
    ctx.fillStyle = shade(base, 0.7 + random() * 0.6, 0.7);
    for (const dx of [-SIZE, 0, SIZE]) {
      ctx.beginPath();
      ctx.arc(x + dx, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCrop(ctx, base, random) {
  // Soil between the rows, then 4 rows of plants per tile.
  ctx.fillStyle = shade(base, 0.62);
  ctx.fillRect(0, 0, SIZE, SIZE);
  const rows = 4;
  const step = SIZE / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * step + step / 2;
    ctx.fillStyle = shade(base, 0.85);
    ctx.fillRect(0, y - step * 0.32, SIZE, step * 0.64);
    for (let x = 2; x < SIZE; x += 5) {
      const px = x + (random() - 0.5) * 2;
      const py = y + (random() - 0.5) * 3;
      const s = 1.6 + random() * 1.6;
      ctx.fillStyle = shade(base, 1.05 + random() * 0.3);
      ctx.beginPath();
      ctx.ellipse(px, py, s, s * 0.8, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(base, 0.7, 0.8); // the plant's shadow side
      ctx.fillRect(px, py + s * 0.4, s * 0.8, 1);
    }
  }
}

// Name of the pattern image for a kind and color; adds it to the map the first time.
export function ensurePattern(map, kind, hex) {
  const name = `patron-${kind}-${hex.slice(1)}`;
  if (map.hasImage(name)) return name;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const random = seeded(kind === 'suelo' ? 11 : 23);
  (kind === 'suelo' ? drawSoil : drawCrop)(ctx, rgb(hex), random);
  map.addImage(name, ctx.getImageData(0, 0, SIZE, SIZE), { pixelRatio: 2 });
  return name;
}

// Procedural textures for the ground, drawn once on a canvas in the browser (nothing to download,
// no license to check). They are light grey detail: the diorama multiplies them by its vertex
// colors, so the ground still follows the year (dry brown / green) and the SoilGrids soil color.
import { CanvasTexture, ClampToEdgeWrapping, RepeatWrapping, SRGBColorSpace } from 'three';

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

const grey = (v, a = 1) => {
  const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgba(${c},${c},${c},${a})`;
};

// Draws a shape at (x, y) and its copies across the edges, so the texture tiles without seams.
function wrapped(size, x, y, r, draw) {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      if (x + dx + r < 0 || x + dx - r > size || y + dy + r < 0 || y + dy - r > size) continue;
      draw(x + dx, y + dy);
    }
  }
}

function finish(canvas, wrapV = true) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = wrapV ? RepeatWrapping : ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}

let soil = null;
// Tilled field seen from above: clods of many sizes, furrows with ridges, tiny stones.
export function soilTexture() {
  if (soil) return soil;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const random = seeded(17);
  ctx.fillStyle = grey(0.88);
  ctx.fillRect(0, 0, size, size);

  // Furrows: 16 rows per tile, gently wavy, dark trench + light ridge.
  const rows = 16;
  const step = size / rows;
  for (let r = 0; r < rows; r++) {
    const y0 = r * step;
    for (let x = 0; x <= size; x += 2) {
      const wobble = Math.sin((x / size) * Math.PI * 4 + r) * 2;
      ctx.fillStyle = grey(0.62, 0.55);
      ctx.fillRect(x, y0 + step * 0.35 + wobble, 2, step * 0.18);
      ctx.fillStyle = grey(1.0, 0.45);
      ctx.fillRect(x, y0 + step * 0.72 + wobble, 2, step * 0.12);
    }
  }
  // Clods: thousands of small irregular lumps, darker and lighter than the soil.
  for (let i = 0; i < 5200; i++) {
    const x = random() * size;
    const y = random() * size;
    const r = 0.8 + random() ** 2 * 4.5;
    const v = 0.62 + random() * 0.45;
    ctx.fillStyle = grey(v, 0.35 + random() * 0.4);
    wrapped(size, x, y, r, (px, py) => {
      ctx.beginPath();
      ctx.ellipse(px, py, r, r * (0.6 + random() * 0.5), random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // Tiny stones catching the light.
  for (let i = 0; i < 260; i++) {
    const x = random() * size;
    const y = random() * size;
    ctx.fillStyle = grey(1.0, 0.8);
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  soil = finish(canvas);
  return soil;
}

let strata = null;
// Side of the soil block: dark topsoil with roots, lighter subsoil, wavy layers, pebbles.
// u runs along the block's edge (tiles), v goes from the bottom (0) to the top (1).
export function strataTexture() {
  if (strata) return strata;
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const random = seeded(29);
  // Canvas y = 0 is the TOP of the texture (v = 1).
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, grey(0.7));
  gradient.addColorStop(0.22, grey(0.78));
  gradient.addColorStop(0.3, grey(0.95));
  gradient.addColorStop(1, grey(1.05));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  // Wavy layer lines.
  for (let k = 0; k < 7; k++) {
    const base = h * (0.25 + k * 0.1);
    ctx.strokeStyle = grey(0.72, 0.35);
    ctx.lineWidth = 1 + random() * 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = base + Math.sin((x / w) * Math.PI * 2 * (2 + k) + k) * 3;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Roots in the topsoil.
  ctx.strokeStyle = grey(0.95, 0.35);
  for (let i = 0; i < 60; i++) {
    let x = random() * w;
    let y = 0;
    ctx.lineWidth = 0.6 + random();
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (random() - 0.5) * 8;
      y += random() * 9;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Pebbles in the subsoil.
  for (let i = 0; i < 420; i++) {
    const x = random() * w;
    const y = h * (0.3 + random() * 0.7);
    const r = 0.8 + random() * 3;
    ctx.fillStyle = grey(random() < 0.5 ? 0.6 : 1.15, 0.6);
    wrapped(w, x, y, r, (px) => {
      ctx.beginPath();
      ctx.ellipse(px, y, r, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  strata = finish(canvas, false);
  return strata;
}

// "Tap to detect": finds the parcel around a point in a satellite image, using roads, tracks,
// ridges and crop changes as its limits. Classic computer vision (no trained model, nothing to
// download): a region grows from the tap and stops at
//   1. a road (mask from the map's street tiles),
//   2. a strong edge in the photo (ridge, fence, canal, track),
//   3. a color too different from where the farmer tapped (another crop).
// Then holes are filled, thin leaks are cut, and the outline is traced and simplified to a few
// corners. Pure functions on plain arrays, tested with node --test.

// Box blur of one channel (two passes), radius in pixels.
function blur(src, width, height, radius) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const size = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += src[y * width + Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x++) {
      tmp[y * width + x] = sum / size;
      sum += src[y * width + Math.min(width - 1, x + radius + 1)] - src[y * width + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / size;
      sum += tmp[Math.min(height - 1, y + radius + 1) * width + x] - tmp[Math.max(0, y - radius) * width + x];
    }
  }
  return out;
}

// One step of dilation (grow = true) or erosion (grow = false) with a 3x3 square.
function morph(mask, width, height, grow) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = grow ? 0 : 1;
      for (let dy = -1; dy <= 1 && hit === (grow ? 0 : 1); dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          // Outside the image counts as "more of the same": the image edge is not a field edge,
          // so erosion must not eat the region there (that is how a leak stays detectable).
          const v = nx < 0 || ny < 0 || nx >= width || ny >= height ? (grow ? 0 : 1) : mask[ny * width + nx];
          if (grow ? v : !v) {
            hit = grow ? 1 : 0;
            break;
          }
        }
      }
      out[y * width + x] = hit;
    }
  }
  return out;
}

const repeat = (mask, width, height, grow, times) => {
  let m = mask;
  for (let i = 0; i < times; i++) m = morph(m, width, height, grow);
  return m;
};

// Connected pixels of `mask` reachable from (sx, sy), 4-neighbors.
function component(mask, width, height, sx, sy) {
  const out = new Uint8Array(mask.length);
  if (!mask[sy * width + sx]) return out;
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  queue[tail++] = sy * width + sx;
  out[sy * width + sx] = 1;
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const y = (i - x) / width;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (mask[n] && !out[n]) {
        out[n] = 1;
        queue[tail++] = n;
      }
    }
  }
  return out;
}

// Fills the holes inside the region (a tree, a pond): anything the outside cannot reach.
function fillHoles(mask, width, height) {
  const outside = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  const push = (x, y) => {
    const i = y * width + x;
    if (!mask[i] && !outside[i]) {
      outside[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const y = (i - x) / width;
    if (x + 1 < width) push(x + 1, y);
    if (x > 0) push(x - 1, y);
    if (y + 1 < height) push(x, y + 1);
    if (y > 0) push(x, y - 1);
  }
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}

// Outline of the region as a ring of pixel corners (Moore neighbor tracing).
export function traceOutline(mask, width, height) {
  let start = -1;
  for (let i = 0; i < mask.length && start < 0; i++) if (mask[i]) start = i;
  if (start < 0) return [];
  const at = (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const sx = start % width;
  const sy = (start - sx) / width;
  const ring = [];
  let x = sx;
  let y = sy;
  let dir = 0;
  const limit = mask.length * 4;
  for (let steps = 0; steps < limit; steps++) {
    ring.push([x, y]);
    let found = false;
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) % 8; // start looking to the left of where we came from
      const nx = x + dirs[d][0];
      const ny = y + dirs[d][1];
      if (at(nx, ny)) {
        x = nx;
        y = ny;
        dir = d;
        found = true;
        break;
      }
    }
    if (!found || (x === sx && y === sy)) break;
  }
  return ring;
}

// Douglas-Peucker on a closed ring: keeps the corners, drops the points on straight sides.
export function simplifyRing(ring, epsilon) {
  if (ring.length < 4) return ring;
  // split the ring at its two farthest-apart points, simplify both halves
  let a = 0;
  let b = 0;
  let best = -1;
  for (let i = 0; i < ring.length; i += Math.max(1, Math.floor(ring.length / 64))) {
    const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2;
    if (d > best) {
      best = d;
      b = i;
    }
  }
  best = -1;
  for (let i = 0; i < ring.length; i++) {
    const d = (ring[i][0] - ring[b][0]) ** 2 + (ring[i][1] - ring[b][1]) ** 2;
    if (d > best) {
      best = d;
      a = i;
    }
  }
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const half = (points) => {
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
      const [i0, i1] = stack.pop();
      const [x0, y0] = points[i0];
      const [x1, y1] = points[i1];
      const len = Math.hypot(x1 - x0, y1 - y0) || 1;
      let far = -1;
      let dist = epsilon;
      for (let i = i0 + 1; i < i1; i++) {
        const d = Math.abs((x1 - x0) * (y0 - points[i][1]) - (x0 - points[i][0]) * (y1 - y0)) / len;
        if (d > dist) {
          dist = d;
          far = i;
        }
      }
      if (far > 0) {
        keep[far] = 1;
        stack.push([i0, far], [far, i1]);
      }
    }
    return points.filter((_, i) => keep[i]);
  };
  const first = half(ring.slice(lo, hi + 1));
  const second = half([...ring.slice(hi), ...ring.slice(0, lo + 1)]);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

// The detection itself.
//   data       RGBA pixels (Uint8ClampedArray, like ImageData.data), width x height
//   roads      Uint8Array, 1 where the street tiles draw a road (or null)
//   seedX/Y    the pixel the farmer tapped
//   tolerance  how different a color may be from the tapped spot (bigger = bigger parcel)
//   edge       how strong a line in the photo must be to stop the parcel (follows tolerance)
// Returns { ok, reason?, ring: [[x, y], ...], pixels, leaked }.
// Defaults tuned on real Esri imagery of fields south of Celaya (zoom 17): with looser values the
// region runs from one brown field into the next; with these, most fields come out whole.
export const DEFAULT_TOLERANCE = 14;

export function detectRegion({ data, width, height, roads = null, seedX, seedY, tolerance = DEFAULT_TOLERANCE, edge = tolerance * 0.64, maxCorners = 14 }) {
  const n = width * height;
  const sx = Math.round(seedX);
  const sy = Math.round(seedY);
  if (sx < 2 || sy < 2 || sx >= width - 2 || sy >= height - 2) return { ok: false, reason: 'fuera' };

  const ch = [0, 1, 2].map((c) => {
    const plane = new Float32Array(n);
    for (let i = 0; i < n; i++) plane[i] = data[i * 4 + c];
    return blur(plane, width, height, 2);
  });
  const [r, g, b] = ch;
  // Edge strength: Sobel on the blurred brightness.
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.299 * r[i] + 0.587 * g[i] + 0.114 * b[i];
  const grad = new Float32Array(n);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = lum[i - width + 1] + 2 * lum[i + 1] + lum[i + width + 1] - lum[i - width - 1] - 2 * lum[i - 1] - lum[i + width - 1];
      const gy = lum[i + width - 1] + 2 * lum[i + width] + lum[i + width + 1] - lum[i - width - 1] - 2 * lum[i - width] - lum[i - width + 1];
      grad[i] = Math.hypot(gx, gy) / 4;
    }
  }
  // Roads a little wider, so a thin track still closes the parcel.
  const barrier = roads ? repeat(roads, width, height, true, 1) : new Uint8Array(n);
  if (barrier[sy * width + sx]) return { ok: false, reason: 'camino' };

  // Color where the farmer tapped: mean of a 9x9 window.
  let mr = 0;
  let mg = 0;
  let mb = 0;
  let count = 0;
  for (let y = sy - 4; y <= sy + 4; y++) {
    for (let x = sx - 4; x <= sx + 4; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = y * width + x;
      mr += r[i];
      mg += g[i];
      mb += b[i];
      count++;
    }
  }
  mr /= count;
  mg /= count;
  mb /= count;

  // Grow: a pixel joins if it is not a road or an edge, looks like the tapped spot, and looks
  // like the pixel it was reached from (so slow changes of shade inside a field are fine).
  const grown = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  queue[tail++] = sy * width + sx;
  grown[sy * width + sx] = 1;
  const far = (tolerance * 1.6) ** 2;
  const near = (tolerance * 0.55) ** 2;
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const y = (i - x) / width;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (grown[j] || barrier[j] || grad[j] > edge) continue;
      const seedDist = (r[j] - mr) ** 2 + (g[j] - mg) ** 2 + (b[j] - mb) ** 2;
      const stepDist = (r[j] - r[i]) ** 2 + (g[j] - g[i]) ** 2 + (b[j] - b[i]) ** 2;
      if (seedDist > far || stepDist > near) continue;
      grown[j] = 1;
      queue[tail++] = j;
    }
  }

  // Clean up: fill holes, close small gaps, cut thin leaks, keep the piece under the tap.
  let mask = fillHoles(grown, width, height);
  mask = repeat(repeat(mask, width, height, true, 2), width, height, false, 2);
  mask = repeat(repeat(mask, width, height, false, 3), width, height, true, 3);
  mask = fillHoles(component(mask, width, height, sx, sy), width, height);
  let pixels = 0;
  let leaked = false;
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    pixels++;
    const x = i % width;
    const y = (i - x) / width;
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) leaked = true;
  }
  if (pixels < 60) return { ok: false, reason: 'chica' };

  // Outline, simplified until it has few enough corners to edit by hand.
  const outline = traceOutline(mask, width, height);
  let epsilon = 2.5;
  let ring = simplifyRing(outline, epsilon);
  while (ring.length > maxCorners && epsilon < 40) {
    epsilon *= 1.4;
    ring = simplifyRing(outline, epsilon);
  }
  if (ring.length < 3) return { ok: false, reason: 'chica' };
  return { ok: true, ring, pixels, leaked };
}

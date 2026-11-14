// Downloads the globe texture once into client/public/textures/ (committed, so the 3D view
// works without internet). Source: NASA GIBS, Blue Marble shaded relief + bathymetry.
// Run with: npm run textura   (inside client/)
import { mkdir, writeFile } from 'node:fs/promises';

const WIDTH = 2048; // 2048 x 1024 = ~8 MB of GPU memory, safe on phones and old laptops
const params = new URLSearchParams({
  SERVICE: 'WMS',
  REQUEST: 'GetMap',
  VERSION: '1.3.0',
  LAYERS: 'BlueMarble_ShadedRelief_Bathymetry',
  STYLES: '',
  CRS: 'EPSG:4326',
  BBOX: '-90,-180,90,180', // WMS 1.3.0 + EPSG:4326 = lat,lon order; equirectangular output
  WIDTH: String(WIDTH),
  HEIGHT: String(WIDTH / 2),
  FORMAT: 'image/jpeg',
});
const url = `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params}`;
const out = new URL('../public/textures/tierra_bluemarble.jpg', import.meta.url);

const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
const type = res.headers.get('content-type') ?? '';
if (!res.ok || !type.startsWith('image/jpeg')) {
  console.error(`FAIL HTTP ${res.status} ${type}\n     ${url}`);
  process.exit(1);
}
await mkdir(new URL('.', out), { recursive: true });
await writeFile(out, Buffer.from(await res.arrayBuffer()));
console.log(`OK   public/textures/tierra_bluemarble.jpg`);

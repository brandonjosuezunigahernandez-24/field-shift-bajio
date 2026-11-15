// Mide si /api/asistente entiende las paráfrasis de test/eval/parafrasis.json (la ruta real, sin internet y sin modelo de lenguaje).
//   node scripts/evaluar-parafrasis.js [--detalle] [--guardar archivo.json]
// --detalle lista las de DESARROLLO que fallan (las de prueba solo se cuentan: no se usan para arreglar).
import { readFileSync, writeFileSync } from 'node:fs';

process.env.OFFLINE = '1';
process.env.OLLAMA_URL = 'http://127.0.0.1:9'; // sin modelo de lenguaje: lo que le llegaría sale como 'modelo'
const { createApp } = await import('../app.js');
const { rotulo } = await import('../test/eval/rotulo.js');

const datos = JSON.parse(readFileSync(new URL('../test/eval/parafrasis.json', import.meta.url), 'utf8'));
const server = createApp().listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/api/asistente`;
const console_error = console.error;
console.error = () => {}; // "el modelo falló, uso la plantilla" en cada pregunta que iría al modelo

const filas = [];
for (const it of datos.intenciones) {
  for (const f of it.frases) {
    const body = { lat: datos.lat, lon: datos.lon, pregunta: f.texto, perfil: datos.perfil, historial: it.historial ?? [] };
    const r = await (await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
    const sale = rotulo(r);
    filas.push({ intencion: it.id, set: f.set, texto: f.texto, sale, ok: it.esperado.includes(sale) });
  }
}
server.close();
console.error = console_error;

const pct = (xs) => (xs.length ? Math.round((100 * xs.filter((x) => x.ok).length) / xs.length) : 0);
console.log('intención              desarrollo   prueba');
for (const it of datos.intenciones) {
  const d = filas.filter((x) => x.intencion === it.id && x.set === 'desarrollo'), p = filas.filter((x) => x.intencion === it.id && x.set === 'prueba');
  console.log(`${it.id.padEnd(22)} ${String(pct(d)).padStart(3)} % (${d.length})  ${String(pct(p)).padStart(3)} % (${p.length})`);
}
const D = filas.filter((x) => x.set === 'desarrollo'), P = filas.filter((x) => x.set === 'prueba');
console.log(`TOTAL                  ${pct(D)} % (${D.filter((x) => x.ok).length}/${D.length})  ${pct(P)} % (${P.filter((x) => x.ok).length}/${P.length})`);
if (process.argv.includes('--detalle')) for (const x of D.filter((y) => !y.ok)) console.log(`  [${x.intencion}] «${x.texto}» -> ${x.sale}`);
const i = process.argv.indexOf('--guardar');
if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(filas, null, 1));

// Evalúa aptitud y desglose de frutas contra el servidor real: node scripts/evaluar-frutas.js [--url http://localhost:3063] [--set dev|prueba] [--json salida.json]
// Mismo criterio que evaluar-asistente.js (incluye / excluye / cita / <= 90 palabras). Imprime los aciertos de "dev" y de "prueba" por separado.
import { readFileSync, writeFileSync } from 'node:fs';
import { check } from './evaluar-asistente.js';

const arg = (name, def) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; };
const BASE = arg('--url', 'http://localhost:3063'), SET = arg('--set', null);
const { punto, preguntas } = JSON.parse(readFileSync(new URL('../test/eval/frutas.json', import.meta.url), 'utf8'));
const lista = preguntas.filter((q) => !SET || q.set === SET);
const res = [];
for (const q of lista) {
  let r;
  try {
    const resp = await fetch(`${BASE}/api/asistente`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...punto, pregunta: q.pregunta }), signal: AbortSignal.timeout(120000) });
    r = await resp.json();
  } catch (e) { r = { respuesta: `ERROR ${e.message}`, origen: 'error' }; }
  const fallos = check(q, r.respuesta ?? '');
  res.push({ id: q.id, set: q.set, cat: q.cat, ok: fallos.length === 0, origen: r.origen, tema: r.tema, fallos, respuesta: r.respuesta });
  console.log(`${fallos.length ? 'FALLA' : 'ok   '} #${q.id} [${q.set}/${r.origen}${r.tema ? `/${r.tema}` : ''}] ${q.pregunta}${fallos.length ? `\n        -> ${fallos.join('; ')}\n        "${r.respuesta}"` : ''}`);
}
for (const s of ['dev', 'prueba']) {
  const x = res.filter((r) => r.set === s);
  if (x.length) console.log(`ACIERTOS ${s}: ${x.filter((r) => r.ok).length}/${x.length}`);
}
const out = arg('--json', null);
if (out) writeFileSync(out, JSON.stringify(res, null, 1));

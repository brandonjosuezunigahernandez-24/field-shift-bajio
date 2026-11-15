// Evalúa las respuestas de maíz del asistente real: node scripts/evaluar-maiz.js [--url http://localhost:3062] [--set dev|prueba|todo] [--json salida.json] [--detalle]
// Cada pregunta de test/eval/maiz.json pasa si cumple: incluye (todas), excluye (ninguna), cita (esas fuentes entre corchetes),
// titular (primera frase) de 25 palabras o menos y respuesta de 110 palabras o menos. Usa el servidor y Ollama reales.
import { readFileSync, writeFileSync } from 'node:fs';

const arg = (name, def) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; };
const BASE = arg('--url', 'http://localhost:3062');
const SET = arg('--set', 'todo');
const { punto, preguntas } = JSON.parse(readFileSync(new URL('../test/eval/maiz.json', import.meta.url), 'utf8'));

export function check(q, texto) {
  const fallos = [];
  for (const re of q.incluye ?? []) if (!new RegExp(re, 'i').test(texto)) fallos.push(`falta /${re}/`);
  for (const re of q.excluye ?? []) if (new RegExp(re, 'i').test(texto)) fallos.push(`sobra /${re}/`);
  const citas = [...texto.matchAll(/\[([^\]]+)\]/g)].flatMap((m) => m[1].split(/\s*,\s*/));
  for (const c of q.cita ?? []) if (!citas.includes(c)) fallos.push(`falta cita [${c}]`);
  const titular = texto.split(/\n|(?<=[.!?])\s/)[0];
  if (titular.split(/\s+/).length > 25) fallos.push('titular de más de 25 palabras');
  if (texto.split(/\s+/).length > 110) fallos.push('más de 110 palabras');
  return fallos;
}

if (process.argv[1].endsWith('evaluar-maiz.js')) {
  const lista = preguntas.filter((q) => SET === 'todo' || q.set === SET);
  const res = [];
  for (const q of lista) {
    let r;
    try {
      const resp = await fetch(`${BASE}/api/asistente`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...punto, pregunta: q.pregunta, perfil: q.perfil }), signal: AbortSignal.timeout(120000) });
      r = await resp.json();
    } catch (e) { r = { respuesta: `ERROR ${e.message}`, origen: 'error' }; }
    const fallos = check(q, r.respuesta ?? '');
    res.push({ id: q.id, set: q.set, cat: q.cat, ok: fallos.length === 0, origen: r.origen, fallos, respuesta: r.respuesta });
    if (process.argv.includes('--detalle') || !q.set.startsWith('prueba') || SET === 'prueba') {
      console.log(`${fallos.length ? 'FALLA' : 'ok   '} #${q.id} [${r.origen}] ${q.pregunta}${fallos.length ? `\n        -> ${fallos.join('; ')}\n        "${(r.respuesta ?? '').replace(/\n/g, ' / ')}"` : ''}`);
    }
  }
  for (const s of ['dev', 'prueba']) {
    const x = res.filter((r) => r.set === s);
    if (x.length) console.log(`ACIERTOS ${s}: ${x.filter((r) => r.ok).length}/${x.length}`);
  }
  const out = arg('--json', null);
  if (out) writeFileSync(out, JSON.stringify(res, null, 1));
}

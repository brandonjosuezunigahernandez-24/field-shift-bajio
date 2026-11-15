// Evalúa el asistente real (servidor + Ollama): node scripts/evaluar-asistente.js [--url http://localhost:3056] [--sin-internet] [--json salida.json]
// Cada pregunta de test/eval/preguntas.json pasa si cumple: incluye (todas), excluye (ninguna), cita (esas fuentes y ninguna otra) y <= 90 palabras.
import { readFileSync, writeFileSync } from 'node:fs';

const arg = (name, def) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; };
const BASE = arg('--url', 'http://localhost:3056');
const skipNet = process.argv.includes('--sin-internet');
const { punto, preguntas } = JSON.parse(readFileSync(new URL('../test/eval/preguntas.json', import.meta.url), 'utf8'));

export function check(q, texto) {
  const fallos = [];
  for (const re of q.incluye ?? []) if (!new RegExp(re, 'i').test(texto)) fallos.push(`falta /${re}/`);
  for (const re of q.excluye ?? []) if (new RegExp(re, 'i').test(texto)) fallos.push(`sobra /${re}/`);
  const citas = [...texto.matchAll(/\[([^\]]+)\]/g)].flatMap((m) => m[1].split(/\s*,\s*/));
  if (q.cita) {
    for (const c of q.cita) if (!citas.includes(c)) fallos.push(`falta cita [${c}]`);
    for (const c of citas) if (!q.cita.includes(c)) fallos.push(`cita equivocada [${c}]`);
  }
  if (texto.split(/\s+/).length > 90) fallos.push('más de 90 palabras');
  return fallos;
}

if (process.argv[1].endsWith('evaluar-asistente.js')) {
  const lista = preguntas.filter((q) => !(skipNet && q.requiere_internet));
  const res = [];
  for (const q of lista) {
    const t0 = Date.now();
    let r;
    try {
      const resp = await fetch(`${BASE}/api/asistente`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...punto, pregunta: q.pregunta }), signal: AbortSignal.timeout(120000) });
      r = await resp.json();
    } catch (e) { r = { respuesta: `ERROR ${e.message}`, origen: 'error' }; }
    const ms = Date.now() - t0;
    const fallos = check(q, r.respuesta ?? '');
    res.push({ id: q.id, cat: q.cat, ok: fallos.length === 0, ms, origen: r.origen, fallos, respuesta: r.respuesta });
    console.log(`${fallos.length ? 'FALLA' : 'ok   '} #${q.id} [${r.origen}] ${ms} ms  ${q.pregunta}${fallos.length ? `\n        -> ${fallos.join('; ')}\n        "${r.respuesta}"` : ''}`);
  }
  const ok = res.filter((x) => x.ok).length;
  const ms = res.map((x) => x.ms).sort((a, b) => a - b);
  console.log(`\nACIERTOS: ${ok}/${res.length}`);
  const cats = [...new Set(res.map((x) => x.cat))].map((c) => `${c} ${res.filter((x) => x.cat === c && x.ok).length}/${res.filter((x) => x.cat === c).length}`);
  console.log(`Por categoría: ${cats.join(', ')}`);
  console.log(`Tiempo: mediana ${ms[Math.floor(ms.length / 2)]} ms, máximo ${ms.at(-1)} ms; sin modelo (plantilla/motor): ${res.filter((x) => x.origen !== 'llm').length}`);
  const out = arg('--json', null);
  if (out) writeFileSync(out, JSON.stringify(res, null, 1));
}

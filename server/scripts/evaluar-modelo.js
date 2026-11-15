// Evalúa el camino del modelo (preguntas abiertas que no atrapan las plantillas) con Ollama real, sin internet.
// Uso: node scripts/evaluar-modelo.js [--json salida.json] [--solo 1,2,3]
// Levanta la app en este mismo proceso (puerto libre) para leer los tokens que devuelve Ollama.
// Mide: % útil (cumple los criterios y lo contestó el modelo), % respaldo (el verificador o un error lo cambió por plantilla),
// tiempo medio y p90 por pregunta (con el modelo ya cargado) y tokens de entrada/salida.
import { readFileSync, writeFileSync } from 'node:fs';

process.env.OFFLINE ??= '1';
const arg = (name, def) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; };
const { punto, preguntas } = JSON.parse(readFileSync(new URL('../test/eval/modelo-abierto.json', import.meta.url), 'utf8'));

const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const ADMITS = /no lo se|\bno se\b[,.]|no tengo|no sabria/i; // "no se seque" no cuenta como negarse
const REFERRAL = /tecnico|inifap|agronom|extensionista|sader|sanidad|asesor/i;
const ACTION = /\b(puedes|sembrar|deja|revisa|siembra|rota|agrega|mete|pregunta|consulta|cubre|incorpora|mide|observa|acude|elige|evita|alterna|usa|prueba|haz|pon|busca|aprovecha|conviene)\b/i;
const KNOWN = ['NASA POWER', 'SoilGrids', 'Open-Meteo', 'Base local', 'Wikipedia', 'SIAP'];

export function check(q, r) {
  const t = plain(r.respuesta ?? '');
  const fallos = [];
  if (r.origen !== 'llm') fallos.push(`no lo contestó el modelo (${r.origen})`);
  for (const re of q.incluye ?? []) if (!new RegExp(re, 'i').test(t)) fallos.push(`falta /${re}/`);
  for (const re of q.excluye ?? []) if (new RegExp(re, 'i').test(t)) fallos.push(`sobra /${re}/`);
  const citas = [...(r.respuesta ?? '').matchAll(/\[([^\]]+)\]/g)].flatMap((m) => m[1].split(/\s*,\s*/));
  if (citas.some((c) => !KNOWN.includes(c))) fallos.push('cita desconocida');
  if (t.split(/\s+/).length > 80) fallos.push('más de 80 palabras');
  if (/\d+\s*(kg|litros?|ml)\b/i.test(t)) fallos.push('trae una dosis');
  if (q.tipo === 'tarjeta') {
    if (!citas.includes('Base local')) fallos.push('no cita [Base local]');
    if (ADMITS.test(t)) fallos.push('se niega aunque hay tarjeta');
  }
  if (q.tipo === 'sin_dato' && !citas.includes('Base local') && !(ADMITS.test(t) && REFERRAL.test(t))) fallos.push('ni tarjeta citada ni "no sé + a quién preguntar"');
  if (q.tipo === 'parcela' && !citas.includes('NASA POWER')) fallos.push('no cita [NASA POWER]');
  if (q.accion && !ACTION.test(t)) fallos.push('sin algo que hacer');
  return fallos;
}

if (process.argv[1].endsWith('evaluar-modelo.js')) {
  // Se leen los tokens de cada llamada a Ollama sin tocar el código del asistente.
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const res = await realFetch(url, opts);
    if (String(url).endsWith('/api/chat') && !JSON.parse(opts.body).stream) {
      res.clone().json().then((j) => calls.push({ entrada: j.prompt_eval_count, salida: j.eval_count })).catch(() => {});
    }
    return res;
  };
  const { createApp } = await import('../app.js');
  const srv = createApp().listen(0);
  const base = `http://localhost:${srv.address().port}`;
  const ask = (pregunta) => fetch(`${base}/api/asistente`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...punto, pregunta }), signal: AbortSignal.timeout(180000) }).then((r) => r.json());

  const t0 = Date.now();
  await ask('¿Qué es la rotación de cultivos?'); // calentar: cargar el modelo no cuenta en el tiempo
  console.log(`Calentamiento (carga del modelo): ${Date.now() - t0} ms`);
  const solo = arg('--solo', null)?.split(',').map(Number);
  const res = [];
  for (const q of preguntas.filter((x) => !solo || solo.includes(x.id))) {
    const n = calls.length;
    const t = Date.now();
    let r;
    try { r = await ask(q.pregunta); } catch (e) { r = { respuesta: `ERROR ${e.message}`, origen: 'error' }; }
    const ms = Date.now() - t;
    await new Promise((ok) => setTimeout(ok, 50));
    const tok = calls[n] ?? {};
    const fallos = check(q, r);
    res.push({ id: q.id, tipo: q.tipo, conjunto: q.conjunto ?? 'desarrollo', codigo: q.camino === 'codigo', pregunta: q.pregunta, ok: !fallos.length, ms, origen: r.origen, ...tok, fallos, respuesta: r.respuesta });
    console.log(`${fallos.length ? 'FALLA' : 'ok   '} #${q.id} [${r.origen}] ${ms} ms ${tok.entrada ?? '?'}+${tok.salida ?? '?'} tok  ${q.pregunta}\n        "${r.respuesta}"${fallos.length ? `\n        -> ${fallos.join('; ')}` : ''}`);
  }
  // camino=codigo: la contesta una plantilla a propósito; no cuenta como falla (ni acierto) del modelo.
  const resumen = (rs, nombre) => {
    const m = rs.filter((x) => !x.codigo);
    const ms = m.map((x) => x.ms).sort((a, b) => a - b);
    const ok = m.filter((x) => x.ok).length;
    const pct = (n) => `${Math.round((100 * n) / (m.length || 1))}%`;
    const avg = (k) => Math.round(m.reduce((s, x) => s + (x[k] ?? 0), 0) / (m.length || 1));
    console.log(`
== ${nombre}: ÚTIL ${ok}/${m.length} (${pct(ok)})${rs.length > m.length ? ` (+${rs.length - m.length} que contesta el código, aparte)` : ''}`);
    for (const tipo of [...new Set(m.map((x) => x.tipo))]) console.log(`  ${tipo}: ${m.filter((x) => x.tipo === tipo && x.ok).length}/${m.filter((x) => x.tipo === tipo).length}`);
    console.log(`  SE NIEGA AUNQUE HAY TARJETA: ${m.filter((x) => x.fallos.includes('se niega aunque hay tarjeta')).length}`);
    console.log(`  RESPALDO (plantilla en vez del modelo): ${pct(m.filter((x) => x.origen !== 'llm').length)}`);
    console.log(`  TIEMPO: medio ${Math.round(ms.reduce((a, b) => a + b, 0) / (ms.length || 1))} ms, mediana ${ms[Math.floor(ms.length / 2)]} ms, p90 ${ms[Math.ceil(ms.length * 0.9) - 1]} ms (Ollama compartido: otros procesos lo alentan)`);
    console.log(`  TOKENS: entrada media ${avg('entrada')}, salida media ${avg('salida')}`);
  };
  resumen(res, 'TODO');
  for (const c of [...new Set(res.map((x) => x.conjunto))]) resumen(res.filter((x) => x.conjunto === c), c.toUpperCase());
  const out = arg('--json', null);
  if (out) writeFileSync(out, JSON.stringify(res, null, 1));
  srv.close();
  process.exit(0);
}

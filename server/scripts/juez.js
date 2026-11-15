// Juez local: califica respuestas guardadas y mide cuánto coincide con la revisión a mano.
//   node scripts/juez.js --entrada=reporte-pruebas.json [--gemma] [--salida=juez.json]
// Entrada: el .json que escribe scripts/reporte-pruebas.js (lista de { n, q, respuesta, que_hacer, fuentes })
//          o el de scripts/probar-conversacion.js ({ resultados: [{ pregunta, respuesta }] }).
// Reglas: (1) coherente con la pregunta, (2) empieza por lo pedido, (3) trae acción si se pidió, (4) 6 frases o menos, (5) números con fuente.
// --gemma: además pide a gemma3:4b (Ollama) un veredicto corto en JSON: { "contesta": "si"|"no", "porque": "..." }.
// Se compara con test/eval/reporte-notas.json (Bien / Aceptable = buena; MAL = mala). Como la revisión a mano casi no tiene
// respuestas malas, también se arman pares CRUZADOS (pregunta de una, respuesta de otra de tema distinto): el juez debe decir que no.
import { readFileSync, writeFileSync } from 'node:fs';

const plano = (t = '') => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Palabras por tema: si la pregunta habla de un tema, la respuesta debe hablar de alguno de los mismos.
const TEMAS = {
  maiz: /ma[i]z|milpa|elote/, frijol: /frijol/, sorgo: /sorgo/, fresa: /fresa/, aguacate: /aguacate/, nuez: /nuez/, fruta: /frut|fresa|aguacate|limon|manzana/,
  lluvia: /llue|llov|lluvia|temporal|seco|sequ/, helada: /helad|frio|° ?c/, suelo: /suelo|tierra/, precio: /precio|pag[ao]|vend|\$/,
  siembra: /siembr|sembr/, cosecha: /cosech|rind|t\/ha|tonelad|levant|madur|dias/, riego: /riego/, apoyo: /seguro|bienestar|apoyo|programa/,
  credito: /credito/, fertilizante: /fertiliz|dosis/, plaga: /gusano|plaga|cogollero/, semilla: /semilla/,
};
const temasDe = (t) => Object.keys(TEMAS).filter((k) => TEMAS[k].test(plano(t)));
const PIDE_ACCION = /que hago|como (cuido|consigo|evito|le hago|hago)|que le echo/;
const frasesDe = (t = '') => t.split(/(?<=[.!?])\s+/).filter((x) => x.trim().length > 3);

export function calificar({ q, respuesta = '', que_hacer = [], fuentes = [] }) {
  const tq = temasDe(q), primera = frasesDe(respuesta)[0] ?? '';
  const fallas = [];
  if (tq.length && !temasDe(respuesta).some((t) => tq.includes(t))) fallas.push('no habla de lo que preguntó');
  else if (tq.length && !temasDe(primera).some((t) => tq.includes(t)) && !/\d/.test(primera)) fallas.push('no empieza por lo pedido');
  if (PIDE_ACCION.test(plano(q)) && !(que_hacer?.length)) fallas.push('pidió qué hacer y no trae acción');
  if (frasesDe(respuesta).length > 6) fallas.push(`larga (${frasesDe(respuesta).length} frases)`);
  if (/\d/.test(respuesta) && !(fuentes?.length) && !/\[[^\]]+\]/.test(respuesta)) fallas.push('números sin fuente');
  return { ok: !fallas.length, fallas };
}

async function gemma(q, respuesta) {
  const prompt = `Un agricultor preguntó: «${q}»\nEl asistente contestó: «${respuesta.slice(0, 900)}»\n¿La respuesta contesta lo que preguntó el agricultor (aunque diga que no tiene un dato y explique por qué)? Responde solo JSON: {"contesta": "si" o "no", "porque": "una frase corta"}`;
  try {
    const r = await fetch(`${process.env.OLLAMA_URL ?? 'http://localhost:11434'}/api/generate`, { method: 'POST', body: JSON.stringify({ model: 'gemma3:4b', prompt, format: 'json', stream: false, options: { temperature: 0 } }) });
    const j = JSON.parse((await r.json()).response);
    return { ok: plano(String(j.contesta)).startsWith('si'), porque: j.porque ?? '' };
  } catch (e) {
    return { ok: null, porque: `sin veredicto (${e.message})` };
  }
}

if (process.argv[1].endsWith('juez.js')) {
  const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
  const crudo = JSON.parse(readFileSync(arg('entrada', 'reporte-pruebas.json'), 'utf8'));
  const filas = (Array.isArray(crudo) ? crudo : crudo.resultados.map((r) => ({ ...r, n: `${r.parcela}-${r.fuente}-${r.id}`, q: r.pregunta }))).filter((f) => f.respuesta);
  const notas = JSON.parse(readFileSync(new URL('../test/eval/reporte-notas.json', import.meta.url), 'utf8'));
  const humano = (n) => (notas[n] == null ? null : !/^MAL/i.test(notas[n]));
  const usarGemma = process.argv.includes('--gemma');
  const pct = (a, b) => (b ? `${a}/${b} (${Math.round((100 * a) / b)} %)` : '-');

  // Pares cruzados: la respuesta de otra pregunta cuyo tema no se comparte (respuesta que NO contesta).
  const cruzadas = filas.flatMap((f, i) => {
    const otra = filas.slice(i + 1).concat(filas.slice(0, i)).find((g) => g.tema !== f.tema && !temasDe(g.q).some((t) => temasDe(f.q).includes(t)) && temasDe(f.q).length);
    return otra ? [{ n: `${f.n}x${otra.n}`, q: f.q, respuesta: otra.respuesta, que_hacer: otra.que_hacer, fuentes: otra.fuentes }] : [];
  });

  const salida = [];
  for (const [tipo, lista] of [['real', filas], ['cruzada', cruzadas]]) {
    for (const f of lista) {
      const reglas = calificar(f);
      const g = usarGemma ? await gemma(f.q, f.respuesta) : null;
      salida.push({ tipo, n: f.n, q: f.q, humano: tipo === 'real' ? humano(f.n) : false, nota: tipo === 'real' ? notas[f.n] ?? null : 'par cruzado: no contesta', reglas, gemma: g });
      process.stdout.write(reglas.ok ? '.' : 'x');
    }
  }
  console.log('');
  const conNota = salida.filter((s) => s.humano !== null && s.tipo === 'real');
  const cruz = salida.filter((s) => s.tipo === 'cruzada');
  const informe = (nombre, ver) => {
    const a = conNota.filter((s) => ver(s) !== null), c = cruz.filter((s) => ver(s) !== null);
    console.log(`\n${nombre}`);
    console.log(`  Coincide con la revisión a mano: ${pct(a.filter((s) => ver(s) === s.humano).length, a.length)}`);
    console.log(`    buenas según la persona que el juez también da por buenas: ${pct(a.filter((s) => s.humano && ver(s)).length, a.filter((s) => s.humano).length)}`);
    console.log(`    malas según la persona que el juez detecta: ${pct(a.filter((s) => !s.humano && !ver(s)).length, a.filter((s) => !s.humano).length)}`);
    console.log(`  Pares cruzados (no contestan) que detecta: ${pct(c.filter((s) => ver(s) === false).length, c.length)}`);
    for (const s of a.filter((s) => ver(s) !== s.humano)) console.log(`    no coincide #${s.n} «${s.q}»: juez ${ver(s) ? 'bien' : 'mal'}${s.reglas.fallas.length && nombre.startsWith('Reglas') ? ` (${s.reglas.fallas.join('; ')})` : s.gemma && !nombre.startsWith('Reglas') ? ` (${s.gemma.porque})` : ''}; persona: ${s.nota}`);
  };
  informe('Reglas', (s) => s.reglas.ok);
  if (usarGemma) informe('Gemma 3 4B', (s) => s.gemma?.ok ?? null);
  console.log(`\nRevisión a mano: ${conNota.length} respuestas con nota, ${conNota.filter((s) => !s.humano).length} malas. Si el juez coincide poco, no se usa para decidir.`);
  if (arg('salida')) writeFileSync(arg('salida'), JSON.stringify(salida, null, 1));
}

// Arma test/eval/intenciones.json desde test/eval/intenciones-semilla.txt: node scripts/generar-intenciones.js
// Cada línea de la semilla es un grupo (paráfrasis de una misma pregunta). A cada grupo se le agregan 2 variantes con "ruido"
// (sin acentos ni signos; una letra mal y una muletilla). El grupo entero cae en entrenamiento o en prueba (nunca partido),
// para que el clasificador no vea en el entrenamiento una paráfrasis de algo que luego se le pregunta en la prueba.
import { readFileSync, writeFileSync } from 'node:fs';

const SEMILLA = new URL('../test/eval/intenciones-semilla.txt', import.meta.url);
const SALIDA = new URL('../test/eval/intenciones.json', import.meta.url);

// Números seudoaleatorios con semilla fija: el archivo sale igual cada vez.
const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const hash = (t) => [...t].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const plano = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!,.]/g, '').trim();
const MULETILLAS = ['oiga ', 'ps ', 'disculpe ', 'una pregunta, ', 'oye ', 'y '];
const COLAS = ['', ' porfa', ' ps', ' jefe', ' amigo', ''];
function conFaltas(t, r) {
  const ws = plano(t).split(/\s+/);
  const largas = ws.map((w, i) => [w, i]).filter(([w]) => w.length >= 5);
  if (largas.length) {
    const [w, i] = largas[Math.floor(r() * largas.length)];
    const k = 1 + Math.floor(r() * (w.length - 2));
    ws[i] = r() < 0.5 ? w.slice(0, k) + w.slice(k + 1) : w.slice(0, k) + w[k + 1] + w[k] + w.slice(k + 2); // falta una letra o dos cambiadas
  }
  return MULETILLAS[Math.floor(r() * MULETILLAS.length)] + ws.join(' ') + COLAS[Math.floor(r() * COLAS.length)];
}

export function generar(texto) {
  const grupos = [];
  let etiqueta = null;
  for (const linea of texto.split(/\r?\n/)) {
    if (!linea.trim() || linea.startsWith('#')) continue;
    if (linea.startsWith('==')) { etiqueta = linea.slice(2).trim(); continue; }
    // "# retro" al final = vino de la retroalimentación (scripts/revisar-retro.js): siempre a entrena, nunca a la prueba.
    const retro = /#\s*retro\s*$/.test(linea);
    const limpia = linea.replace(/#\s*retro\s*$/, '');
    const frases = limpia.split('|').map((f) => f.trim()).filter(Boolean);
    const r = rng(hash(limpia));
    const extra = [plano(frases[0]), conFaltas(frases[1] ?? frases[0], r)];
    grupos.push({ intencion: etiqueta, retro, frases: [...new Set([...frases, ...extra])] });
  }
  // Prueba: ~30 % de los grupos de cada intención (al menos 1), escogidos por hash para que no dependa del orden.
  // Los grupos "retro" no cuentan para el reparto: así agregarlos no cambia qué preguntas son de prueba.
  const porEtiqueta = Object.groupBy(grupos, (g) => g.intencion);
  const preguntas = [];
  let id = 0;
  for (const [intencion, gs] of Object.entries(porEtiqueta)) {
    const todos = gs.map((g, i) => ({ g, i, h: hash(g.frases[0]) }));
    const orden = [...todos.filter((x) => !x.g.retro).sort((a, b) => a.h - b.h), ...todos.filter((x) => x.g.retro)];
    const nPrueba = Math.max(1, Math.round(todos.filter((x) => !x.g.retro).length * 0.3));
    orden.forEach(({ g, i }, k) => {
      const set = k < nPrueba && !g.retro ? 'prueba' : 'entrena';
      for (const pregunta of g.frases) preguntas.push({ id: ++id, grupo: `${intencion}-${i + 1}`, set, intencion, pregunta });
    });
  }
  return preguntas;
}

if (process.argv[1].endsWith('generar-intenciones.js')) {
  const preguntas = generar(readFileSync(SEMILLA, 'utf8'));
  const nota = 'Preguntas de agricultor con su intención. Generado por scripts/generar-intenciones.js desde intenciones-semilla.txt. grupo = paráfrasis de una misma pregunta; set = entrena | prueba (la prueba no se usa para entrenar ni para escoger el umbral).';
  writeFileSync(SALIDA, JSON.stringify({ nota, preguntas }, null, 1) + '\n');
  const n = (s) => preguntas.filter((p) => p.set === s).length;
  console.log(`${preguntas.length} preguntas, ${new Set(preguntas.map((p) => p.grupo)).size} grupos, ${new Set(preguntas.map((p) => p.intencion)).size} intenciones. entrena ${n('entrena')}, prueba ${n('prueba')}.`);
}

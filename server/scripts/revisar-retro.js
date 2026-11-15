// Del «¿Te sirvió?» al entrenamiento, con una persona en medio.
//   node scripts/revisar-retro.js [--archivo=data/retro/ejemplo.jsonl]
//     -> test/eval/retro-pendientes.json: los 👎 agrupados por tema y motivo, con lo que el clasificador cree que preguntaron
//        y una etiqueta propuesta. Una persona revisa cada uno y pone "confirmado": true (y cambia "etiqueta" si hace falta).
//        Al volver a correrlo se respetan las confirmaciones que ya había.
//   node scripts/revisar-retro.js --aplicar
//     -> las confirmadas entran a intenciones-semilla.txt (marcadas "# retro", siempre en entrena), se regenera intenciones.json,
//        se reentrena y se mide la exactitud ANTES y DESPUÉS en el mismo conjunto de prueba (que nunca recibe retroalimentación).
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { destino, predecir, respaldo, rutaPalabras } from '../llm/intencion-ml.js';
import { leerRetro } from '../routes/retro.js';

const aqui = (p) => fileURLToPath(new URL(p, import.meta.url));
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const ARCHIVO = arg('archivo', aqui('../data/retro/retro.jsonl'));
const PENDIENTES = aqui('../test/eval/retro-pendientes.json');
const SEMILLA = aqui('../test/eval/intenciones-semilla.txt');
const INTENCIONES = aqui('../test/eval/intenciones.json');
const MODELO = aqui('../data/modelo_intencion.json');
const leer = (f) => JSON.parse(readFileSync(f, 'utf8'));
const plano = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const hash = (t) => [...t].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7).toString(36);

// Motivos que dicen "entendió otra cosa": esos sí sirven para enseñarle al clasificador. Los demás son de redacción o de datos.
// Igual que en entrenar-intencion.js (no se importa: ese archivo entrena al cargarse).
const NIEGA = ['fuera', 'sin_dato', 'maiz_?', 'sin_respuesta'];
const correcto = (salida, intencion) => salida === destino(intencion) || (NIEGA.includes(intencion) && NIEGA.includes(salida));

const DE_INTENCION = ['no_era'];
const QUE_HACER = { falta: 'Revisar la plantilla: faltó información.', largo: 'Revisar la plantilla: muy larga.', no_entiendo: 'Revisar la redacción: palabras difíciles.', dato_mal: 'Revisar el dato contra su fuente.' };

export function proponer(f, modelo) {
  const p = predecir(modelo, f.pregunta);
  const ruta = rutaPalabras(f.pregunta);
  const base = { id: hash(`${f.fecha}|${f.pregunta}|${f.motivo}`), pregunta: f.pregunta, comentario: f.comentario ?? null, tema_servido: f.tema ?? null, ruta_palabras: ruta, intencion_predicha: p.intencion, confianza: Math.round(p.confianza * 100) / 100, otras: p.top.slice(1).map(([c, x]) => `${c} ${Math.round(x * 100)} %`) };
  if (!DE_INTENCION.includes(f.motivo)) return { ...base, etiqueta: null, que_hacer: QUE_HACER[f.motivo] ?? 'Leer el comentario.', confirmado: false };
  // "No era lo que pregunté": si el clasificador piensa otra cosa que lo que se contestó, se propone eso; si coincide, no hay propuesta (ver comentario).
  const otra = destino(p.intencion) !== ruta && p.intencion !== (f.tema ?? '').replace('-', '_');
  return { ...base, etiqueta: otra ? p.intencion : null, que_hacer: otra ? 'Confirmar la etiqueta propuesta (o cambiarla).' : 'El clasificador cree lo mismo que se contestó: escribir la etiqueta a mano.', confirmado: false };
}

async function revisar() {
  const filas = await leerRetro(ARCHIVO);
  {
    const modelo = leer(MODELO);
    const antes = new Map((existsSync(PENDIENTES) ? leer(PENDIENTES).grupos.flatMap((g) => g.items) : []).map((x) => [x.id, x]));
    const no = filas.filter((f) => !f.util);
    const grupos = Object.entries(Object.groupBy(no, (f) => `${f.tema ?? 'sin_tema'} · ${f.motivo ?? 'sin_motivo'}`))
      .map(([clave, fs]) => ({ clave, n: fs.length, items: fs.map((f) => { const x = proponer(f, modelo); const v = antes.get(x.id); return v ? { ...x, etiqueta: v.etiqueta, confirmado: v.confirmado } : x; }) }))
      .sort((a, b) => b.n - a.n);
    const nota = 'Generado por scripts/revisar-retro.js. Revisa cada item: si la etiqueta es correcta pon "confirmado": true (cámbiala si hace falta; vale cualquier intención de intenciones-semilla.txt). Solo los confirmados con etiqueta entran al entrenamiento con --aplicar.';
    writeFileSync(PENDIENTES, JSON.stringify({ nota, archivo: ARCHIVO.replace(/.*[\\/]server[\\/]/, ''), votos: filas.length, utiles: filas.length - no.length, no_utiles: no.length, grupos }, null, 1) + '\n');
    console.log(`${filas.length} votos (${filas.length - no.length} 👍, ${no.length} 👎) -> ${grupos.length} grupos en test/eval/retro-pendientes.json`);
    for (const g of grupos) console.log(`  ${g.clave}: ${g.n}`);
  }
}

// Exactitud en la prueba fija: clasificador solo, y palabras + clasificador de respaldo (lo que de verdad contesta el servidor).
function exactitud(prueba, modelo) {
  const ok = (f) => prueba.filter(f).length / prueba.length;
  const final = (q) => { const ruta = rutaPalabras(q); const r = respaldo(q, ruta, modelo); return !r ? ruta : r.intencion ? destino(r.intencion) : 'sin_respuesta'; };
  return { clasificador: ok((p) => destino(predecir(modelo, p.pregunta).intencion) === destino(p.intencion)), juntos: ok((p) => correcto(final(p.pregunta), p.intencion)) };
}

function aplicar() {
  const items = leer(PENDIENTES).grupos.flatMap((g) => g.items).filter((x) => x.confirmado === true && x.etiqueta);
  if (!items.length) return console.log('No hay nada confirmado ("confirmado": true con etiqueta). No se cambia nada.');
  const semilla = readFileSync(SEMILLA, 'utf8');
  const clases = new Set([...semilla.matchAll(/^== (.+)$/gm)].map((m) => m[1].trim()));
  const { preguntas } = leer(INTENCIONES);
  const prueba = preguntas.filter((p) => p.set === 'prueba');
  const enPrueba = new Set(prueba.map((p) => plano(p.pregunta)));
  const ya = new Set(preguntas.map((p) => plano(p.pregunta)));
  const nuevas = [];
  for (const x of items) {
    const motivo = !clases.has(x.etiqueta) ? `etiqueta "${x.etiqueta}" no existe` : enPrueba.has(plano(x.pregunta)) ? 'es igual a una pregunta de prueba' : ya.has(plano(x.pregunta)) ? 'ya está en el entrenamiento' : null;
    if (motivo) console.log(`  Se salta "${x.pregunta}": ${motivo}.`);
    else nuevas.push(x);
  }
  if (!nuevas.length) return console.log('Nada nuevo que agregar.');

  const antes = exactitud(prueba, leer(MODELO));
  const lineas = nuevas.map((x) => `== ${x.etiqueta}\n${x.pregunta.replace(/[|#\n]/g, ' ')} # retro`).join('\n');
  appendFileSync(SEMILLA, `${semilla.endsWith('\n') ? '' : '\n'}${lineas}\n`);
  const node = (s) => execFileSync(process.execPath, [aqui(s)], { cwd: aqui('..'), encoding: 'utf8' });
  node('./generar-intenciones.js');
  const nueva = leer(INTENCIONES).preguntas.filter((p) => p.set === 'prueba');
  const igual = (a, b) => JSON.stringify(a.map((p) => `${p.intencion}|${p.pregunta}`).sort()) === JSON.stringify(b.map((p) => `${p.intencion}|${p.pregunta}`).sort());
  if (!igual(prueba, nueva)) { // nunca debe pasar: si pasa, se deshace todo
    writeFileSync(SEMILLA, semilla);
    node('./generar-intenciones.js');
    throw new Error('El conjunto de prueba cambió al agregar la retroalimentación. Se deshizo el cambio.');
  }
  console.log(node('./entrenar-intencion.js').split('\n').filter((l) => /^(Validación|Entrenado|Guardado)/.test(l)).join('\n'));
  const despues = exactitud(prueba, leer(MODELO));
  const pct = (x) => `${(100 * x).toFixed(1)} %`;
  console.log(`\nAgregadas ${nuevas.length} preguntas confirmadas a la semilla (# retro). Prueba fija: ${prueba.length} preguntas.`);
  console.log(`  Clasificador solo:          antes ${pct(antes.clasificador)}  después ${pct(despues.clasificador)}`);
  console.log(`  Palabras + clasificador:    antes ${pct(antes.juntos)}  después ${pct(despues.juntos)}`);
  if (despues.juntos < antes.juntos) console.log('  OJO: bajó la exactitud. Revisa las etiquetas confirmadas antes de quedarte con este modelo (git checkout lo regresa).');
}

if (process.argv[1].endsWith('revisar-retro.js')) {
  if (process.argv.includes('--aplicar')) aplicar();
  else await revisar();
}

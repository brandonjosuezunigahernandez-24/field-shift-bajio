// Entrena el clasificador de intención y lo compara con el enrutado por palabras: node scripts/entrenar-intencion.js [--no-guardar]
// 1) Validación cruzada de 5 partes (por grupo) dentro de "entrena" para escoger el umbral de confianza.
// 2) Entrena con todo "entrena" y guarda data/modelo_intencion.json.
// 3) Mide en "prueba" (que no se usó para nada de lo anterior): enrutado actual, clasificador solo, y los dos juntos (el clasificador como respaldo).
import { readFileSync, writeFileSync } from 'node:fs';
import { destino, entrenar, noSabe, predecir, respaldo, rutaPalabras } from '../llm/intencion-ml.js';

const { preguntas } = JSON.parse(readFileSync(new URL('../test/eval/intenciones.json', import.meta.url), 'utf8'));
const SALIDA = new URL('../data/modelo_intencion.json', import.meta.url);
const entrena = preguntas.filter((p) => p.set === 'entrena');
const prueba = preguntas.filter((p) => p.set === 'prueba');
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)} %` : '-');

// Las dos formas de decir "no tengo eso" (fuera de tema o sin dato) cuentan como la misma respuesta.
const NIEGA = ['fuera', 'sin_dato', 'maiz_?', 'sin_respuesta'];
export const correcto = (salida, intencion) => salida === destino(intencion) || (NIEGA.includes(intencion) && NIEGA.includes(salida));
const final = (p, ruta, modelo) => { const r = respaldo(p, ruta, modelo); return !r ? ruta : r.intencion ? destino(r.intencion) : 'sin_respuesta'; };
const rutas = new Map(preguntas.map((p) => [p.id, rutaPalabras(p.pregunta)]));

// 1) Validación cruzada de 5 partes por grupo (solo "entrena"): cada pregunta la juzga un modelo que no vio su grupo.
const grupos = [...new Set(entrena.map((p) => p.grupo))].sort((a, b) => a.localeCompare(b));
const oof = [];
for (let k = 0; k < 5; k++) {
  const fuera = new Set(grupos.filter((_, i) => i % 5 === k));
  const m = entrenar(entrena.filter((p) => !fuera.has(p.grupo)));
  for (const p of entrena.filter((x) => fuera.has(x.grupo))) oof.push({ p, m, pred: predecir(m, p.pregunta) });
}
const aciertoCV = oof.filter(({ p, pred }) => destino(pred.intencion) === destino(p.intencion)).length;
// Umbral: el que más gana (arregla) menos 2 por cada respuesta que descompone. Una respuesta que hoy sale bien vale el doble.
const balance = (umbral, negar) => {
  let gana = 0, pierde = 0, niega = 0, niegaMal = 0;
  for (const { p, m } of oof) {
    const ruta = rutas.get(p.id), fin = final(p.pregunta, ruta, { ...m, umbral, negar });
    const antes = correcto(ruta, p.intencion), ahora = correcto(fin, p.intencion);
    gana += !antes && ahora; pierde += antes && !ahora;
    if (fin === 'sin_respuesta') { niega++; niegaMal += destino(p.intencion) === 'modelo'; }
  }
  return { gana, pierde, niega, niegaMal, neto: gana - 2 * pierde };
};
let umbral = 1, mejor = { neto: 0 };
for (let t = 0.95; t >= 0.3; t -= 0.05) {
  const b = balance(t, false);
  console.log(`  umbral ${t.toFixed(2)}: arregla ${b.gana}, descompone ${b.pierde}`);
  if (b.neto > mejor.neto) { mejor = b; umbral = Math.round(t * 100) / 100; }
}
// "No tengo ese dato" con sugerencias: solo si en la validación casi nunca se lo dice a una pregunta que el modelo de lenguaje sí contestaba.
const n = balance(umbral, true);
const negar = n.niega > 0 && n.niegaMal / n.niega <= 0.1;
console.log(`Validación cruzada (entrena, ${oof.length}): clasificador solo ${pct(aciertoCV, oof.length)}. Umbral: ${umbral} (arregla ${mejor.gana ?? 0}, descompone ${mejor.pierde ?? 0}).`);
console.log(`"No tengo ese dato" en confianza baja: lo diría ${n.niega} veces, ${n.niegaMal} a preguntas que el modelo de lenguaje sí contestaba -> ${negar ? 'SE USA' : 'NO se usa'}.`);

// 2) Modelo final.
const t0 = Date.now();
const modelo = { ...entrenar(entrena), umbral, negar, entrenado_con: entrena.length };
console.log(`Entrenado en ${((Date.now() - t0) / 1000).toFixed(1)} s, ${Object.keys(modelo.pesos).length} rasgos, ${modelo.clases.length} intenciones.`);
if (!process.argv.includes('--no-guardar')) {
  writeFileSync(SALIDA, JSON.stringify(modelo));
  console.log(`Guardado ${SALIDA.pathname} (${(JSON.stringify(modelo).length / 1024).toFixed(0)} KB)`);
}

// 3) Prueba.
const filas = prueba.map((p) => {
  const ruta = rutas.get(p.id), pred = predecir(modelo, p.pregunta), fin = final(p.pregunta, ruta, modelo);
  return { p, ruta, pred, fin, okR: correcto(ruta, p.intencion), okC: correcto(destino(pred.intencion), p.intencion), okF: correcto(fin, p.intencion) };
});
const total = filas.length, cuenta = (f) => filas.filter(f).length;
console.log(`\nPRUEBA (${total} preguntas, ${new Set(prueba.map((p) => p.grupo)).size} grupos que el clasificador nunca vio)`);
console.log(`  Enrutado por palabras (hoy):         ${pct(cuenta((r) => r.okR), total)}`);
console.log(`  Clasificador solo:                   ${pct(cuenta((r) => r.okC), total)}`);
console.log(`  Palabras + clasificador de respaldo: ${pct(cuenta((r) => r.okF), total)}`);
const nuevas = filas.filter((r) => !r.okR);
console.log(`  Preguntas que hoy salen mal: ${nuevas.length}; el clasificador solo acierta ${cuenta((r) => !r.okR && r.okC)}; con el respaldo quedan bien ${cuenta((r) => !r.okR && r.okF)}`);
console.log(`  Que hoy salen bien y el respaldo descompone: ${cuenta((r) => r.okR && !r.okF)}`);
const tocadas = filas.filter((r) => r.fin !== r.ruta);
console.log(`  El respaldo cambió ${tocadas.length} respuestas: ${tocadas.filter((r) => r.okF).length} bien, ${tocadas.filter((r) => !r.okF).length} mal (${tocadas.filter((r) => r.fin === 'sin_respuesta').length} son "No tengo ese dato" con sugerencias)`);

console.log('\nPor intención (prueba): palabras / clasificador / juntos');
for (const c of modelo.clases) {
  const x = filas.filter((r) => r.p.intencion === c), m = x.length;
  console.log(`  ${c.padEnd(16)} n=${String(m).padStart(3)}  ${pct(x.filter((r) => r.okR).length, m).padStart(7)}  ${pct(x.filter((r) => r.okC).length, m).padStart(7)}  ${pct(x.filter((r) => r.okF).length, m).padStart(7)}`);
}

const confusion = (clave) => {
  const c = new Map();
  for (const r of filas.filter((r) => !r[clave === 'ruta' ? 'okR' : 'okC'])) {
    const k = `${r.p.intencion} -> ${clave === 'ruta' ? r.ruta : r.pred.intencion}`;
    c.set(k, (c.get(k) ?? 0) + 1);
  }
  return [...c].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} (${v})`).join('; ');
};
console.log(`\nConfusiones más comunes, palabras: ${confusion('ruta')}`);
console.log(`Confusiones más comunes, clasificador: ${confusion('pred')}`);

console.log('\nCalibración (prueba): confianza dicha -> acierto real del clasificador');
for (const [a, b] of [[0, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.01]]) {
  const x = filas.filter((r) => r.pred.confianza >= a && r.pred.confianza < b);
  const media = x.reduce((s, r) => s + r.pred.confianza, 0) / (x.length || 1);
  console.log(`  ${a.toFixed(1)}-${Math.min(b, 1).toFixed(1)}: n=${String(x.length).padStart(3)}  dice ${pct(media, 1)}  acierta ${pct(x.filter((r) => r.okC).length, x.length)}`);
}

if (process.argv.includes('--detalle')) {
  console.log('\nRescatadas por el respaldo:');
  for (const r of filas.filter((r) => !r.okR && r.okF)) console.log(`  [${r.p.intencion}] "${r.p.pregunta}" (hoy: ${r.ruta}, conf ${r.pred.confianza.toFixed(2)})`);
  console.log('Cambiadas mal:');
  for (const r of tocadas.filter((r) => !r.okF)) console.log(`  [${r.p.intencion}] "${r.p.pregunta}" (hoy: ${r.ruta}, ahora: ${r.fin}, conf ${r.pred.confianza.toFixed(2)})`);
}

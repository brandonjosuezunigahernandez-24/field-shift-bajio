// Reporte de pruebas para el equipo: parcela dibujada + perfil lleno + 32 preguntas de agricultor (y 4 en Querétaro).
// Uso (con el servidor prendido):  node scripts/reporte-pruebas.js [--url http://localhost:3001] [--html salida.html]
// Escribe un HTML; el PDF se saca con Edge:  msedge --headless --print-to-pdf=pruebas-asistente.pdf salida.html
// Las notas de revisión a mano van en test/eval/reporte-notas.json ({ "<n>": "nota" }) y se imprimen junto a cada respuesta.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { hectareas } from './probar-conversacion.js';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const BASE = arg('url', 'http://localhost:3001');
const SALIDA = arg('html', 'reporte-pruebas.html');
const M = 111320;
const aLatLon = (ref, [e, n]) => [ref[0] + n / M, ref[1] + e / (M * Math.cos((ref[0] * Math.PI) / 180))];

// Mismas parcelas que scripts/probar-conversacion.js (SoilGrids devuelve suelo en las dos).
const PARCELAS = {
  celaya: { nombre: 'Celaya, Guanajuato (5.5 km al sur del centro)', estado: 'Guanajuato', ref: [20.4685, -100.8115], esquinas: [[0, 0], [290, 15], [310, 240], [120, 300], [-15, 210]] },
  amealco: { nombre: 'Amealco, Querétaro (temporal, ladera)', estado: 'Querétaro', ref: [20.1990, -100.1410], esquinas: [[0, 0], [210, -25], [235, 130], [80, 190], [-25, 115]] },
};

// [pregunta, ¿es seguimiento de la anterior?]
const PREGUNTAS = [
  ['¿Cómo está mi tierra?'], ['¿Cuánto llueve en mi parcela en el temporal?'], ['¿Cuáles fueron los años secos?'], ['¿Va a llover esta semana?'],
  ['¿Cuándo hay riesgo de heladas?'], ['¿Cuándo siembro el maíz de temporal?'], ['¿Cuánto maíz voy a cosechar?'], ['¿Me conviene sembrar maíz este año?'],
  ['¿Qué tan riesgoso es el maíz de temporal aquí?'], ['¿A cómo pagan el maíz?'], ['¿Y el frijol?', true], ['¿Qué me conviene sembrar después del maíz?'],
  ['¿Por qué ese cultivo?', true], ['¿Me conviene más maíz o sorgo?'], ['¿Cuándo siembro frijol?'], ['¿Cuántas semillas de maíz por hectárea?'],
  ['¿Qué hago si se atrasa la lluvia?'], ['¿Qué hago con el gusano cogollero?'], ['¿Cómo cuido mi suelo para que no se canse?'], ['¿Puedo sembrar fresa aquí?'],
  ['¿Puedo sembrar aguacate aquí?'], ['¿Qué frutas se dan en Guanajuato?'], ['¿Cómo ha cambiado el precio de la nuez?'], ['¿Cuánto me toca de Producción para el Bienestar?'],
  ['¿Hay seguro si pierdo la cosecha por sequía?'], ['¿Cómo consigo un crédito para sembrar?'], ['¿Dónde vendo mi maíz a mejor precio?'], ['¿Me conviene meterle riego a mi parcela?'],
  ['¿Qué fertilizante le echo al maíz y cuánto?'], ['cuando levanto el maiz si lo sembre en junio'], ['oiga y si llueve poco que hago'], ['¿Quién ganó el mundial?'],
];
const QRO = ['¿Cuánto llueve en mi parcela en el temporal?', '¿Cuáles fueron los años secos?', '¿Cuánto maíz voy a cosechar?', '¿Qué me conviene sembrar después del maíz?'];

function parcela(id) {
  const p = PARCELAS[id];
  const contorno = p.esquinas.map((e) => aLatLon(p.ref, e));
  const lat = contorno.reduce((s, c) => s + c[0], 0) / contorno.length, lon = contorno.reduce((s, c) => s + c[1], 0) / contorno.length;
  const ha = Math.round(hectareas(contorno) * 100) / 100;
  const perfil = { agua: 'temporal', prioridad: 'riesgo', estado: p.estado, ultimo_cultivo: 'frijol', cultivo_actual: 'maiz', hectareas: ha, textura: 'arcillosa', encharca: 'no' };
  return { ...p, id, contorno, lat, lon, ha, perfil, parcelas: [{ id: 1, hectareas: ha, ultimo_cultivo: 'frijol', contorno }] };
}

async function preguntar(p, pregunta, historial) {
  const t = Date.now();
  const r = await fetch(`${BASE}/api/asistente`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat: p.lat, lon: p.lon, pregunta, perfil: p.perfil, parcelas: p.parcelas, historial }) });
  return { ...(await r.json()), status: r.status, s: (Date.now() - t) / 1000 };
}

// Revisión automática: lo mínimo que debe cumplir una respuesta para el agricultor.
function revisar(r, pregunta) {
  const obs = [];
  const frases = (r.respuesta ?? '').split(/(?<=[.!?])\s+/).filter((x) => x.trim().length > 3).length;
  if (r.status !== 200) obs.push(`Error ${r.status}`);
  if (frases > 6) obs.push(`Larga (${frases} frases)`);
  if (r.origen === 'plantilla' && !r.tema) obs.push('Cayó a respuesta de respaldo');
  if (/\d/.test(r.respuesta ?? '') && !(r.fuentes?.length) && !/\[[^\]]+\]/.test(r.respuesta ?? '')) obs.push('Números sin fuente');
  if (/mundial/.test(pregunta) && r.que_hacer?.length) obs.push('Dio acciones fuera de tema');
  return obs;
}

const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const QUIEN = { motor: 'Recomendador (SIAP)', modelo: 'Modelo de riesgo entrenado', plantilla: 'Calculado por el código', llm: 'Modelo de lenguaje local (Gemma)' };

const notas = existsSync(new URL('../test/eval/reporte-notas.json', import.meta.url)) ? JSON.parse(readFileSync(new URL('../test/eval/reporte-notas.json', import.meta.url), 'utf8')) : {};
const celaya = parcela('celaya'), amealco = parcela('amealco');
const filas = [];
let prev = null;
for (const [i, [q, seguimiento]] of PREGUNTAS.entries()) {
  const r = await preguntar(celaya, q, seguimiento && prev ? [prev] : []);
  filas.push({ n: i + 1, parcela: 'celaya', q, seguimiento, r, obs: revisar(r, q) });
  if (!seguimiento) prev = { pregunta: q, respuesta: (r.respuesta ?? '').slice(0, 600) };
  process.stdout.write(filas.at(-1).obs.length ? 'x' : '.');
}
for (const [i, q] of QRO.entries()) {
  const r = await preguntar(amealco, q, []);
  filas.push({ n: `Q${i + 1}`, parcela: 'amealco', q, r, obs: revisar(r, q) });
  process.stdout.write(filas.at(-1).obs.length ? 'x' : '.');
}
writeFileSync(SALIDA.replace(/\.html$/, '.json'), JSON.stringify(filas.map(({ n, q, r, obs }) => ({ n, q, tema: r.tema, origen: r.origen, respuesta: r.respuesta, que_hacer: r.que_hacer, fuentes: r.fuentes, graficas: (r.graficas ?? []).map((g) => g.titulo), s: r.s, obs })), null, 1));

const bien = filas.filter((f) => !f.obs.length && !/^MAL/.test(notas[f.n] ?? '')).length;
const tParcela = (p) => `<table><tr><th>Esquina</th><th>Latitud</th><th>Longitud</th></tr>${p.contorno.map((c, i) => `<tr><td>${i + 1}</td><td>${c[0].toFixed(5)}</td><td>${c[1].toFixed(5)}</td></tr>`).join('')}</table>
<p><b>Centro que se manda a la API:</b> ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} · <b>Superficie:</b> ${p.ha} ha (calculada del polígono)</p>`;
const tarjeta = (f) => {
  const r = f.r, nota = notas[f.n];
  return `<section class="q"><h3>${f.n}. ${esc(f.q)}${f.seguimiento ? ' <span class="tag">seguimiento de la anterior</span>' : ''}</h3>
<p class="meta">${esc(QUIEN[r.origen] ?? r.origen ?? '')}${r.tema ? ` · tema: ${esc(r.tema)}` : ''} · ${r.s.toFixed(1)} s</p>
<div class="resp">${esc(r.respuesta ?? r.error ?? '').replace(/\n/g, '<br>')}</div>
${r.que_hacer?.length ? `<div class="qh"><b>Qué hacer</b><ol>${r.que_hacer.map((a) => `<li><b>${esc(a.accion)}</b>${a.porque ? ` — ${esc(a.porque)}` : ''} <span class="src">Fuente: ${a.url ? `<a href="${esc(a.url)}">${esc(a.fuente)}</a>` : esc(a.fuente)}</span></li>`).join('')}</ol></div>` : ''}
${r.graficas?.length ? `<p class="meta">Gráficas: ${r.graficas.map((g) => esc(g.titulo)).join(' · ')}</p>` : ''}
<p class="meta">De dónde salió: ${esc((r.fuentes ?? []).join(', ') || '—')}</p>
<p class="${f.obs.length || /^MAL/.test(nota ?? '') ? 'mal' : 'ok'}">${f.obs.length ? `Revisión automática: ${esc(f.obs.join('; '))}` : 'Revisión automática: bien'}${nota ? `<br>Revisión a mano: ${esc(nota)}` : ''}</p></section>`;
};

writeFileSync(SALIDA, `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Pruebas del asistente</title><style>
body{font-family:Segoe UI,Arial,sans-serif;font-size:11pt;color:#1d2b22;margin:24px}h1{color:#1f5135}h2{color:#1f5135;border-bottom:2px solid #1f5135;padding-bottom:4px;margin-top:28px}
table{border-collapse:collapse;margin:6px 0}td,th{border:1px solid #bcd0c3;padding:3px 8px;font-size:10pt;text-align:left}
.q{border:1px solid #cfe0d4;border-radius:8px;padding:8px 12px;margin:10px 0;page-break-inside:avoid}.q h3{margin:2px 0 4px;font-size:12pt}
.meta{color:#5b6b61;font-size:9pt;margin:3px 0}.resp{background:#eef6f0;padding:6px 10px;border-radius:6px}.qh ol{margin:4px 0 4px 18px;padding:0}.qh li{margin:3px 0}
.src{color:#5b6b61;font-size:9pt}.ok{color:#1f6b3a;font-size:9.5pt;margin:4px 0}.mal{color:#a4471f;font-size:9.5pt;margin:4px 0}.tag{font-size:9pt;color:#7a5a12;background:#fbf0d4;padding:1px 6px;border-radius:4px}
</style></head><body>
<h1>Field Shift Bajío · Pruebas del asistente</h1>
<p>${new Date().toLocaleString('es-MX')} · Servidor ${esc(BASE)} · Respuestas reales del asistente, sin editar. Bien sin observaciones: <b>${bien} de ${filas.length}</b>.</p>
<p>El asistente corre en la computadora (modelo Gemma con Ollama). Los números salen de NASA POWER (clima 2000–2024), SoilGrids (suelo), SIAP (producción y precios 2018–2024), Open-Meteo (pronóstico) y FAO EcoCrop. Las acciones de «Qué hacer» salen de INIFAP, CONAGUA, SENASICA y Reglas de Operación 2026, con su enlace.</p>
<h2>1. Perfil del agricultor (lo que contestó en la pantalla)</h2>
<table>${Object.entries({ 'Agua': 'Solo lluvia (temporal)', 'Qué le importa más': 'Arriesgar menos', 'Estado': 'Guanajuato', 'Lo último que sembró': 'Frijol', 'Lo que tiene sembrado ahorita': 'Maíz', 'Hectáreas': `${celaya.ha} (del dibujo)`, 'Tierra mojada al apretarla': 'Se pega y hace barro (arcillosa)', '¿Se encharca?': 'No' }).map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
<h2>2. Parcela dibujada (delimitación)</h2><p><b>${esc(celaya.nombre)}</b>: el agricultor da 5 clics en el mapa.</p>${tParcela(celaya)}
<h2>3. 32 preguntas en la parcela de Celaya</h2>${filas.filter((f) => f.parcela === 'celaya').map(tarjeta).join('')}
<h2>4. La misma prueba en Querétaro</h2><p><b>${esc(amealco.nombre)}</b>, mismo perfil con estado Querétaro.</p>${tParcela(amealco)}
${filas.filter((f) => f.parcela === 'amealco').map(tarjeta).join('')}
<h2>5. Límites que hay que decir</h2><ul>
<li>Los rendimientos y precios del SIAP son promedios del estado o del municipio, no de esta parcela.</li>
<li>El riesgo del maíz es un estimado según la lluvia, no un pronóstico de la temporada.</li>
<li>No damos dosis de fertilizantes ni de agroquímicos: eso lo debe indicar un técnico.</li>
<li>Algunas acciones usan fuentes de otros estados (Estado de México, Michoacán) porque no hay una del Bajío; la acción lo dice.</li>
</ul></body></html>`);
console.log(`\n${bien}/${filas.length} sin observaciones -> ${SALIDA}`);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parsePower } from '../sources/nasaPower.js';
import { climatologia } from '../llm/climatologia.js';
import { aptitud, detectarAptitud, detectarCultivos, redactarAptitud, todosLosCultivos } from '../llm/aptitud.js';
import { detectarDesglose, redactarDesglose } from '../llm/desglose.js';
import { detectarTema, redactar } from '../llm/respuestas.js';
import { verifyNumbers } from '../llm/verificador.js';
import { TEMAS } from '../llm/temas.js';

const clim = climatologia(parsePower(JSON.parse(readFileSync(new URL('../fixtures/power_20.47_-100.81.json', import.meta.url), 'utf8'))));
const caliente = { ...clim, por_mes: clim.por_mes.map((m) => ({ ...m, t_media_c: m.t_media_c + 14 })) };
const seco = { ...clim, por_mes: clim.por_mes.map((m) => ({ ...m, lluvia_mm: 5 })) };
const json = JSON.parse(readFileSync(new URL('../data/aptitud_cultivos.json', import.meta.url), 'utf8'));

test('los rangos de aptitud traen enlace a FAO, rangos ordenados y la marca verificado', () => {
  assert.ok(todosLosCultivos().length >= 14);
  for (const [id, c] of Object.entries(json.cultivos)) {
    assert.match(c.url, /^https:\/\/ecocrop\.fao\.org\/ecocrop\/srv\/en\/dataSheet\?id=\d+$/, id);
    assert.equal(typeof c.verificado, 'boolean', id);
    for (const k of ['temp_optima', 'temp_absoluta', 'lluvia_optima_mm', 'lluvia_absoluta_mm', 'ph_optimo', 'ph_absoluto']) {
      const r = c[k];
      if (c.verificado) assert.ok(r[0] <= r[1], `${id} ${k}`);
    }
    assert.ok(c.temp_absoluta[0] <= c.temp_optima[0] && c.temp_optima[1] <= c.temp_absoluta[1], `${id}: lo óptimo cabe en lo absoluto`);
  }
});

test('aptitud: tres niveles con razón y fuente (clima de Celaya)', () => {
  const fresa = aptitud('fresa', clim);
  assert.equal(fresa.nivel, 'bien');
  assert.match(fresa.fuente.url, /ecocrop\.fao\.org/);
  assert.equal(aptitud('papa', clim).nivel, 'cuidados'); // la helada más fuerte (-2.7 °C) pasa de lo que aguanta (-1 °C)
  assert.match(aptitud('papa', clim).razon, /helada/);
  assert.equal(aptitud('aguacate', clim).nivel, 'bien');
});

test('aptitud: calor excesivo y falta de lluvia cambian el nivel; el pH del suelo cuenta si se da', () => {
  assert.equal(aptitud('fresa', caliente).nivel, 'dificil');
  assert.equal(aptitud('esparrago', seco).nivel, 'cuidados');
  assert.match(aptitud('esparrago', seco).razon, /necesita riego/);
  assert.equal(aptitud('arandano', clim, { ph: 7.4 }).nivel, 'dificil'); // pH 4 a 5 ideal, aguanta hasta 5.5
  assert.equal(aptitud('fresa', clim, { ph: 7.4 }).nivel, 'bien');
});

test('aptitud: sin dato dice no verificado y la función es pura', () => {
  assert.equal(aptitud('mango', clim).nivel, 'sin_dato');
  assert.match(aptitud('mango', clim).razon, /no verificado/);
  const antes = JSON.stringify(clim);
  aptitud('uva', clim);
  assert.equal(JSON.stringify(clim), antes);
  assert.ok(aptitud('uva', clim).notas.some((n) => /horas de frío.*no verificado/.test(n)));
});

test('detección tolerante: sin acentos, informal y con trampas', () => {
  for (const q of ['¿Puedo sembrar fresa aquí?', 'se da el aguacate en queretaro', 'oye y el arándano crece por acá?', '¿qué frutas se dan en mi parcela?',
    'puedo plantar papa en mi terreno', '¿Se puede cultivar mango aquí?', '¿Qué verduras se pueden sembrar aquí?', 'la uva se da por aca', 'conviene sembrar nopal?']) {
    assert.equal(detectarTema(q), 'aptitud', q);
  }
  for (const q of ['¿Cuánto rinde la fresa?', '¿A cuánto se vende el jitomate?', '¿Qué me conviene sembrar?', '¿Cuánto llueve en verano?', '¿Qué tan riesgoso es el brócoli?', 'cual es el clima', 'tengo un lima de aire']) {
    assert.equal(detectarAptitud(q), false, q);
  }
  assert.deepEqual(detectarCultivos('fresas y tomates'), ['fresa', 'jitomate']);
});

test('redactar aptitud: nivel, razón, fuentes, números verificables y rango de la fuente', () => {
  const r = redactar('aptitud', '¿puedo sembrar fresa aqui?', { clim, suelo: { ph: 7.4 } });
  assert.match(r.respuesta, /^Sí, se da bien \(fresa\)/);
  assert.match(r.respuesta, /\[FAO EcoCrop, NASA POWER, SIAP\]/);
  assert.match(r.respuesta, /1994 ha en Guanajuato/);
  assert.equal(verifyNumbers(r.respuesta, r.datos).ok, true);
  assert.ok(r.respuesta.split(/\s+/).length <= 90);
  const q = redactar('aptitud', 'se da la naranja en guanajuato', { clim });
  assert.match(q.respuesta, /SIAP no registra naranja en Guanajuato/);
  assert.equal(verifyNumbers(q.respuesta, q.datos).ok, true);
});

test('redactar aptitud: lista general con los tres niveles y sin dato para cultivos desconocidos', () => {
  const r = redactar('aptitud', '¿qué frutas se dan en mi parcela?', { clim });
  assert.match(r.respuesta, /Se dan bien:.*fresa/);
  assert.match(r.respuesta, /Con cuidados:/);
  assert.equal(verifyNumbers(r.respuesta, r.datos).ok, true);
  const m = redactar('aptitud', '¿se da el cafe aqui?', { clim });
  assert.match(m.respuesta, /no verificado/);
  assert.doesNotMatch(m.respuesta, /se da bien/i);
  assert.equal(redactarAptitud('fresa', {}), null);
});

test('desglose: detecta el tema pedido y deja a siap lo suyo', () => {
  assert.equal(detectarDesglose('¿Cuánta superficie de cebolla hay?'), 'superficie');
  assert.equal(detectarDesglose('¿Dónde se siembra más el brócoli?'), 'municipios');
  assert.equal(detectarDesglose('¿Qué porcentaje de la tuna es de riego?'), 'riego');
  assert.equal(detectarDesglose('¿Ha subido el precio del aguacate?'), 'precio');
  assert.equal(detectarDesglose('¿Cuánto tarda en dar fruta el aguacate?'), 'tiempo');
  assert.equal(detectarDesglose('dame el desglose de la fresa'), 'ficha');
  assert.equal(detectarDesglose('¿Cuánto rinde la fresa?'), null);
  assert.equal(detectarDesglose('¿A cuánto se vende el jitomate?'), null);
  assert.equal(detectarDesglose('¿Cuánta superficie de maíz hay?'), null);
});

test('desglose: cada número sale del SIAP, tiempo para dar fruta dice no verificado, estado sin siembra se dice', () => {
  const d = JSON.parse(readFileSync(new URL('../data/desglose_cultivos.json', import.meta.url), 'utf8'));
  const r = redactar('desglose', '¿cuanta superficie de cebolla hay en guanajuato?', {});
  assert.match(r.respuesta, new RegExp(`${Math.round(d.cultivos.cebolla.estados.Guanajuato.sembrada_ha_2024)} ha en 2024`));
  assert.doesNotMatch(r.respuesta, /Querétaro/);
  assert.equal(verifyNumbers(r.respuesta, r.datos).ok, true);
  for (const q of ['¿cuanto tarda en dar fruta el aguacate?', '¿cuantos años tarda la fresa en dar fruta?']) {
    const t = redactar('desglose', q, {});
    assert.match(t.respuesta, /no verificado/);
    assert.doesNotMatch(t.respuesta, /\b\d+ años/);
    assert.equal(verifyNumbers(t.respuesta, t.datos).ok, true);
  }
  const j = redactar('desglose', '¿cuanto tarda el jitomate?', {}); // verdura de un año: EcoCrop trae el ciclo
  assert.match(j.respuesta, /de 70 a 150 días.*\[FAO EcoCrop\]/);
  assert.equal(verifyNumbers(j.respuesta, j.datos).ok, true);
  assert.match(redactarDesglose('cuanta naranja se siembra en guanajuato', 'superficie').respuesta, /no registra siembra/);
  assert.match(redactar('desglose', 'cuanto se pierde de chile en queretaro', {}).respuesta, /0 % no quiere decir/);
});

test('temas: hay botones de preguntas de aptitud y todas se detectan como aptitud o desglose', () => {
  const t = TEMAS.find((x) => x.id === 'aptitud');
  assert.ok(t && t.preguntas.length >= 4);
  for (const q of t.preguntas) assert.ok(['aptitud', 'desglose'].includes(detectarTema(q)), q);
});

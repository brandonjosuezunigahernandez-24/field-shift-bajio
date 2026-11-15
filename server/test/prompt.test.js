import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFicha } from '../llm/ficha.js';
import { EJEMPLOS, SYSTEM, mensajes, recortarFicha, tarjetas } from '../llm/prompt.js';
import { answer } from '../llm/responder.js';

const clima = { periodo: { inicio: 2000, fin: 2024 }, lluvia_pv_mediana_mm: 528.9, umbral_seco_mm: 423.2, anios_secos: [2000, 2005, 2011, 2020, 2022, 2023] };
const suelo = { ph: 7.4, arcilla_pct: 42.4, arena_pct: 37.2, carbono_organico_g_kg: 12.1, sin_datos: false };
const dias = [{ fecha: '2026-11-15', lluvia_mm: 0, prob_lluvia_pct: 5, t_max_c: 25, t_min_c: 6 }];
const ficha = buildFicha({ clima, suelo, pronostico: { obtenido: 'hoy', dias } });
const texto = (cards) => cards.map((c) => c.texto).join(' ');

test('tarjetas: encuentra la tarjeta por parecido aunque la palabra cambie de forma', () => {
  assert.match(texto(tarjetas('¿Conviene meter abono orgánico?')), /materia orgánica/);
  assert.match(texto(tarjetas('¿Qué es el mulch?')), /rastrojo/);
  assert.match(texto(tarjetas('¿Para qué sirve saber el pH del suelo?')), /pH/);
  assert.ok(tarjetas('¿Qué es un almácigo?').every((c) => c.fuente === 'Base local'));
});

test('tarjetas: sin parecido no manda nada (y máximo 2)', () => {
  assert.deepEqual(tarjetas('¿Quién ganó el mundial?'), []);
  assert.deepEqual(tarjetas('¿Conviene sembrar amaranto?'), []);
  assert.ok(tarjetas('¿Para qué sirve la rotación de cultivos con leguminosas y plagas?').length <= 2);
});

test('recortarFicha: una pregunta general no lleva lluvia, suelo ni días del pronóstico', () => {
  const v = recortarFicha(ficha, '¿Qué es la materia orgánica?');
  assert.equal(v.lluvia_verano, undefined);
  assert.equal(v.suelo, undefined);
  assert.equal(v.pronostico_7_dias.dias, undefined);
  assert.equal(v.pronostico_7_dias.resumen.lluvia_total_mm, 0);
  assert.match(v.conocimiento[0].texto, /materia orgánica/);
});

test('recortarFicha: deja lo que la pregunta pide', () => {
  assert.equal(recortarFicha(ficha, '¿Cuántos años secos hubo?').lluvia_verano.total_anios_secos, 6);
  assert.equal(recortarFicha(ficha, '¿Por qué se encharca mi parcela?').suelo.arcilla_pct, 42.4);
  assert.equal(recortarFicha(ficha, '¿Va a llover mañana?').pronostico_7_dias.dias.length, 1);
});

test('recortarFicha: "dime todo sobre mi parcela" manda lluvia y suelo; una pregunta sin datos, nada', () => {
  const v = recortarFicha(buildFicha({ clima, suelo }), 'Dime todo sobre mi parcela');
  assert.deepEqual(recortarFicha(buildFicha({ clima, suelo }), '¿Conviene sembrar amaranto?'), {});
  assert.ok(v.lluvia_verano && v.suelo);
});

test('recortarFicha: Wikipedia se queda; la tarjeta local que no se parece se va', () => {
  const f = buildFicha({ clima, suelo, conocimiento: [{ texto: 'El maíz de temporal se siembra al empezar las lluvias.', fuente: 'Base local' }, { texto: 'El amaranto es una planta.', fuente: 'Wikipedia' }] });
  assert.deepEqual(recortarFicha(f, '¿Conviene sembrar amaranto?').conocimiento, [{ texto: 'El amaranto es una planta.', fuente: 'Wikipedia' }]);
});

test('mensajes: sistema corto, ejemplos y la pregunta al final con sus datos', () => {
  const m = mensajes({ a: 1 }, '¿Qué hago?', [{ pregunta: 'p', respuesta: 'r' }]);
  assert.equal(m[0].content, SYSTEM);
  assert.ok(SYSTEM.length < 900);
  assert.equal(m.length, 1 + EJEMPLOS.length * 2 + 2 + 1);
  assert.equal(m.at(-1).content, 'DATOS: {"a":1}\nPREGUNTA: ¿Qué hago?');
  assert.match(SYSTEM, /No lo sé con mis datos/);
});

test('responder: el modelo recibe la ficha recortada y el verificador revisa contra ella', async () => {
  let vista;
  const ask = async (f) => { vista = f; return { respuesta: 'Tu suelo tiene 42.4% de arcilla [SoilGrids].', fuentes: ['SoilGrids'] }; };
  const r = await answer({ ficha, pregunta: '¿Qué es la materia orgánica?', ask });
  assert.equal(vista.suelo, undefined);
  assert.equal(r.origen, 'plantilla'); // 42.4 no estaba en lo que vio el modelo
});

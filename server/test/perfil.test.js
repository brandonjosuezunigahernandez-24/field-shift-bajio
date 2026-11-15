import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PREGUNTAS, parsePerfil, pendientes } from '../llm/perfil.js';
import { recommend } from '../llm/recomendador.js';

// Datos inventados (solo para probar la lógica).
const PV = 'Primavera-Verano';
const years = [2019, 2020, 2021, 2022, 2023, 2024];
const fila = (cultivo, anio, { rend = 2, precio = 5000 } = {}) => ({
  estado: 'Guanajuato', cultivo, ciclo: PV, modalidad: 'Temporal', anio,
  sembrada_ha: 5000, cosechada_ha: 5000, siniestrada_ha: 0, volumen_t: 5000 * rend, rendimiento_t_ha: rend, precio_medio_rural: precio,
});
const serie = (c, o) => years.map((y) => fila(c, y, o));
const filas = [...serie('maiz', { rend: 3, precio: 7000 }), ...serie('sorgo', { rend: 2, precio: 6000 }), ...serie('frijol', { rend: 1, precio: 15000 }), ...serie('garbanzo', { rend: 2, precio: 9000 })];

test('todas las preguntas traen "No sé" salvo las de opciones fijas obligatorias', () => {
  for (const p of PREGUNTAS) {
    assert.ok(p.campo && p.pregunta && p.porque, `${p.campo} sin texto`);
    if (!p.obligatoria) assert.ok(p.opciones.some((o) => o.valor === 'no_se') || p.campo === 'estado', `${p.campo} sin "No sé"`);
  }
  assert.deepEqual(PREGUNTAS.filter((p) => p.obligatoria).map((p) => p.campo), ['agua', 'prioridad']);
});

test('parsePerfil descarta "no sé" y campos desconocidos, y acepta lo válido', () => {
  const p = parsePerfil({ agua: 'temporal', ultimo_cultivo: 'no_se', textura: '', hectareas: '3.5', basura: 'x', estado: 'Querétaro' });
  assert.deepEqual(p, { agua: 'temporal', hectareas: 3.5, estado: 'Querétaro' });
  assert.deepEqual(parsePerfil(undefined), {});
});

test('parsePerfil rechaza valores raros con error 400', () => {
  assert.throws(() => parsePerfil({ agua: 'mar' }), { status: 400 });
  assert.throws(() => parsePerfil({ hectareas: -2 }), { status: 400 });
  assert.throws(() => parsePerfil({ hectareas: 'mucho' }), { status: 400 });
  assert.throws(() => parsePerfil([]), { status: 400 });
});

test('pendientes pregunta primero lo obligatorio y no repite lo que contestó "no sé"', () => {
  const raw = { ultimo_cultivo: 'no_se' };
  const ids = pendientes(raw).map((q) => q.campo);
  assert.deepEqual(ids.slice(0, 2), ['agua', 'prioridad']);
  assert.ok(!ids.includes('ultimo_cultivo'));
});

test('lo último que sembró cambia la rotación: no repite su familia el primer año', () => {
  const base = recommend({ estado: 'Guanajuato', agua: 'temporal', prioridad: 'ganar', filas });
  assert.equal(base.rotacion[0].cultivo, 'maiz');
  const r = recommend({ estado: 'Guanajuato', agua: 'temporal', prioridad: 'ganar', filas, ultimoCultivo: 'maiz' });
  assert.notEqual(r.rotacion[0].cultivo, 'maiz');
  assert.notEqual(r.rotacion[0].cultivo, 'sorgo', 'sorgo es de la misma familia (gramínea)');
});

test('las hectáreas multiplican el total de la parcela', () => {
  const r = recommend({ estado: 'Guanajuato', agua: 'temporal', prioridad: 'riesgo', filas, hectareas: 10 });
  const p = r.prediccion;
  assert.equal(p.hectareas, 10);
  assert.ok(Math.abs(p.ingreso_bruto_3_anios_esperado_total - p.ingreso_bruto_3_anios_esperado_por_ha * 10) <= 1000);
});

test('si la parcela se encharca, el garbanzo baja y se explica', () => {
  const sin = recommend({ estado: 'Guanajuato', agua: 'temporal', prioridad: 'suelo', filas });
  const con = recommend({ estado: 'Guanajuato', agua: 'temporal', prioridad: 'suelo', filas, encharca: 'si' });
  const g = (r) => r.cultivos.find((c) => c.id === 'garbanzo');
  assert.ok(g(con).puntaje < g(sin).puntaje);
  assert.match(g(con).razones[0], /encharca/);
});

test('perfil: cultivo actual y datos de riego (solo se piden si tiene riego)', () => {
  const p = parsePerfil({ agua: 'riego', cultivo_actual: 'maiz', riego_tipo: 'goteo', riego_frecuencia_dias: '7' });
  assert.deepEqual(p, { agua: 'riego', cultivo_actual: 'maiz', riego_tipo: 'goteo', riego_frecuencia_dias: 7 });
  assert.throws(() => parsePerfil({ riego_frecuencia_dias: 400 }), { status: 400 });
  assert.throws(() => parsePerfil({ riego_tipo: 'inundar' }), { status: 400 });
  const campos = (perfil) => pendientes(perfil).map((q) => q.campo);
  assert.ok(!campos({ agua: 'temporal' }).includes('riego_tipo'), 'en temporal no se pregunta cómo riega');
  assert.ok(campos({ agua: 'riego' }).includes('riego_frecuencia_dias'));
  assert.ok(PREGUNTAS.some((q) => q.campo === 'cultivo_actual'));
});

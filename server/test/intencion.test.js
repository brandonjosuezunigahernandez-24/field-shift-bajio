import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isFollowUp, wantsRecommendation } from '../llm/intencion.js';

test('pedir una recomendación la contesta el recomendador', () => {
  for (const q of ['¿Qué me conviene sembrar?', 'que siembro', 'Recomiéndame algo', '¿Qué rotación me toca?', 'dame mi rotación', 'Qué cultivo planto este año']) {
    assert.equal(wantsRecommendation(q), true, q);
  }
});

test('preguntas para entender NO son una recomendación (las contesta el modelo con la base de textos)', () => {
  for (const q of ['¿Para qué sirve la rotación de cultivos?', '¿Qué es la rotación?', '¿Cuánto llueve en verano?', '¿Va a llover esta semana?', 'hola']) {
    assert.equal(wantsRecommendation(q), false, q);
  }
});

test('los seguimientos de la recomendación llevan su resultado en la ficha; las demás preguntas no', () => {
  assert.equal(isFollowUp('¿Y por qué sorgo?'), true);
  assert.equal(isFollowUp('¿Cuánto sería el ingreso?'), true);
  assert.equal(isFollowUp('¿Va a llover esta semana?'), false);
  assert.equal(isFollowUp('¿Cómo le va al maíz de temporal?'), false);
});

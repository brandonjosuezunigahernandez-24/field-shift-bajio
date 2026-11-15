import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asksWhyThisCrop } from '../llm/intencion.js';

test('"¿por qué ese cultivo?" and its variants ask about the recommendation', () => {
  for (const q of ['¿Por qué ese cultivo?', '¿por qué el frijol?', '¿Por qué me recomiendas sorgo?', '¿y por qué ese primero?',
    '¿Por qué frijol y no maíz?', '¿por qué el maíz no?', '¿por qué?', 'porque ese']) {
    assert.equal(asksWhyThisCrop(q), true, q);
  }
});

test('a "why" with its own topic is not about the recommendation', () => {
  // These used to get "Puse Frijol primero..." (banks modelo-abierto and preguntas-investigadas).
  for (const q of ['¿Por qué se encharca mi parcela?', '¿Por qué se quedan las plagas en el suelo?', '¿Por qué se me pudren las semillas?',
    '¿Por qué se me caen las flores del frijol?', '¿Por qué está tan cara la urea este año?', '¿por qué no me sale el maíz?',
    '¿Qué siembro?', '']) {
    assert.equal(asksWhyThisCrop(q), false, q);
  }
});

# 13 · Memoria corta y conversación guiada

**Qué:** `POST /api/asistente` acepta `historial` (las últimas 2 vueltas `{pregunta, respuesta}` que guarda el front) y los campos `agua`, `prioridad`, `estado` y `costos`.
**Para qué:** que el agricultor pueda seguir una conversación ("¿y por qué trigo?") sin repetir los datos de su parcela, y que el chat le pregunte lo que falta con botones.

**Cómo funciona**
- **La ficha de la parcela se recalcula en cada pregunta** (clima, suelo y pronóstico salen de la caché), así que **reiniciar la conversación** solo es vaciar `historial` en el front: los datos de la parcela no se pierden ni hay que volver a preguntarlos.
- **Ficha + historial** caben en el contexto del modelo (3,072 tokens). Solo se mandan 2 vueltas y las respuestas se recortan a 600 letras.
- `agua` y `prioridad` se mandan en cada petición (el front las recuerda). Con ellas el modelo recibe el resultado del recomendador y puede explicarlo.

**Cómo probar:** ver `docs/cambios/12-recomendador-provisional.md` (petición con `agua`/`prioridad`). Para el historial: mandar `"historial": [{"pregunta":"¿Qué me conviene sembrar?","respuesta":"..."}]` y luego "¿por qué trigo?".

**Límites**
- El servidor **no guarda sesiones**: si el front no manda el historial, no hay memoria.
- Con 2 vueltas el modelo no entiende referencias a algo dicho hace 5 mensajes.
- Más historial gasta contexto (más lento y más memoria en laptops débiles).
- En la prueba, el modelo contestó bien un seguimiento ("¿y por qué trigo…?") pero **no está probado a fondo que use la memoria** (solo se vio que no se rompe).
- Validación: más de 2 vueltas se recortan; formato incorrecto da error 400.

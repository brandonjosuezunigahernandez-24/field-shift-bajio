# 37. Retroalimentación: «¿Te sirvió?»

El asistente ahora aprende del uso, pero **siempre con una persona en medio**: nada de lo que vota el agricultor entra
solo al entrenamiento.

## El ciclo

```
pantalla (👍 / 👎 + motivo) -> POST /api/retroalimentacion -> server/data/retro/retro.jsonl
   -> node scripts/revisar-retro.js         (agrupa los 👎 y propone etiqueta)
   -> una persona edita test/eval/retro-pendientes.json  ("confirmado": true)
   -> node scripts/revisar-retro.js --aplicar (semilla "# retro" -> intenciones.json -> reentrena -> mide antes/después)
```

1. **Pantalla.** Debajo de cada respuesta: «¿Te sirvió?» con 👍 Sí / 👎 No (botones de 52 px). Con 👎 salen 5 motivos de un
   toque («No era lo que pregunté», «Falta información», «Está muy largo», «No le entiendo», «Está mal el dato») y un campo
   opcional «¿Qué querías saber?». Al final, «Gracias» en una línea. Si el servidor no contesta, el voto se guarda en el
   navegador (`localStorage`) y se reintenta en la siguiente respuesta; el agricultor no ve ningún error.
2. **Servidor.** `POST /api/retroalimentacion` valida (tamaños máximos, listas cerradas de motivo, origen y estado), tapa
   correos y teléfonos y agrega una línea a `server/data/retro/retro.jsonl`. Esa carpeta no se sube a git (salvo
   `ejemplo.jsonl`). `GET /api/retroalimentacion/resumen` da solo conteos por tema y por motivo, sin textos.
3. **Revisar.** `node scripts/revisar-retro.js [--archivo=data/retro/ejemplo.jsonl]` escribe `test/eval/retro-pendientes.json`:
   los 👎 agrupados por tema y motivo, con la intención que predice el clasificador, su confianza y una etiqueta propuesta.
   Solo «No era lo que pregunté» propone etiqueta: los otros motivos son de redacción o de datos y dicen qué revisar.
   Si se vuelve a correr, respeta lo que la persona ya confirmó.
4. **Confirmar.** Una persona pone `"confirmado": true` (y corrige `etiqueta` si hace falta).
5. **Reentrenar y medir.** `--aplicar` agrega las confirmadas a `intenciones-semilla.txt` al final, marcadas `# retro`.
   `generar-intenciones.js` manda esas líneas **siempre a entrenamiento** y no las cuenta para el reparto, así que el
   conjunto de prueba (403 preguntas) no cambia. El script lo comprueba y, si cambiara, deshace todo. También se salta una
   pregunta igual a una de prueba. Después reentrena con `entrenar-intencion.js` y da la exactitud antes y después en esa misma prueba.

## Demostración con los 10 ejemplos (`server/data/retro/ejemplo.jsonl`, todos con `"ejemplo": true`)

3 👍 y 7 👎 → 6 grupos. 4 son «No era lo que pregunté»; se confirmaron 3 (una con la etiqueta corregida a mano: el
clasificador proponía `apoyos` para «se me está secando la milpa, qué hago» y la persona puso `lluvia`). La cuarta
(«cuántos días tarda el frijol», propuesta `maiz_ciclo`) se dejó sin confirmar porque está mal.

| Prueba fija (403 preguntas) | antes | después |
|---|---|---|
| Clasificador solo | 65.0 % | 65.5 % |
| Palabras + clasificador (lo que contesta el servidor) | 77.7 % | 77.4 % |

Las 3 preguntas nuevas ya salen bien en el clasificador (confianza 0.87 a 0.97). En la prueba, el total bajó por 1 pregunta,
porque el umbral se volvió a escoger. Con 3 ejemplos eso es ruido; el script avisa cuando baja.
Ojo: «vale la pena meterle sorgo en vez de maíz» la manda mal **el enrutado por palabras** (a `maiz_decision`), y el
clasificador solo se consulta cuando las palabras no saben. Reentrenar no arregla ese caso: hay que arreglar las palabras.
**La demostración se deshizo** (semilla, `intenciones.json` y modelo como estaban) para no entrenar con datos inventados.
`retro-pendientes.json` queda sin confirmar.

## Juez automático (`scripts/juez.js`)

Califica respuestas guardadas por `reporte-pruebas.js` o `probar-conversacion.js` con 5 reglas: habla de lo que preguntó,
la primera frase va a lo pedido, trae acción si preguntó «qué hago», 6 frases o menos y números con fuente. Con `--gemma`,
gemma3:4b da un veredicto en JSON. Se compara con la revisión a mano (`test/eval/reporte-notas.json`, 36 respuestas).

**Problema:** la revisión a mano tiene **0 respuestas malas** (todas «Bien» o «Aceptable»). Por eso solo mide falsas alarmas.
Para ver si el juez detecta malas respuestas, se armaron 34 **pares cruzados**: la pregunta de una y la respuesta de otra,
de otro tema.

| | coincide con la persona | pares cruzados detectados |
|---|---|---|
| Reglas | 30/36 (83 %): 4 por «larga, 7 frases», 1 por crédito sin acción y 1 de tema | 26/34 (76 %) |
| Gemma 3 4B | 34/36 (94 %): marca mal el «fuera de tema» y el «no te puedo decir sí o no» | **12/34 (35 %)** |

**Conclusión: no se usa para decidir.** Gemma casi siempre dice que sí, incluso cuando la respuesta es de otra pregunta.
Las reglas detectan más, pero tienen 6 falsas alarmas de 36. Sirven para señalar qué revisar, no para aprobar.
Para medirlo bien hacen falta respuestas marcadas «MAL» en la revisión a mano.

## Privacidad

- Se guarda: fecha (solo el día), pregunta, tema, origen, 👍/👎, motivo, comentario, respuesta recortada a 600 letras,
  estado (Guanajuato o Querétaro) y versión de la app.
- **No** se guarda: coordenadas, contorno, perfil, hectáreas, hora ni IP. Si la pantalla manda otros campos, el servidor los tira.
- Los correos y teléfonos (8 dígitos o más) de la pregunta y del comentario se cambian por `[correo]` y `[teléfono]`.
  Esto también tapa dos años seguidos («2000 2024»); es aceptable.
- `server/data/retro/` no se sube a git. El resumen público solo da conteos.
- Falta: un tope al tamaño del archivo y un límite de votos por minuto (en la demo local no hace falta).

# 08 · Más lenguaje y respuestas más completas

**Qué:** cambios en `server/llm/contexto.js`, `conocimiento.json`, `responder.js` y `ollama.js`, a partir de pruebas reales en el navegador (capturas del 14 nov).
**Para qué:** que el agricultor pueda escribir corto y a su manera ("jitomate", "como se plantan los jitomates", "frijoles") y reciba una respuesta útil.

**Problemas encontrados y arreglos**
| Problema visto | Causa | Arreglo |
|---|---|---|
| "que es el jitomate?" y "como se plantan los jitomates" caían al resumen de la parcela | La consulta a Wikipedia tardó más de 6 s y se cortó; sin texto de apoyo, el modelo improvisaba | Espera hasta 10 s y **guarda en `server/cache/` lo consultado** (la 2.ª vez es instantánea y sirve sin internet) |
| "Como se cultivan los jitomates" inventó "la tierra debe tener un pH de 7.4…" aplicando datos de la parcela a otro cultivo | El modelo mezcló la ficha con un cultivo sin datos | Regla nueva en el prompt: no usar pH/arcilla/lluvia de la parcela para hablar de un cultivo si el texto de apoyo no lo dice |
| Salían `[suelo]` y `[pronostico_7_dias]` como si fueran fuentes | El modelo citaba nombres de campos | El servidor quita todo corchete que no sea una fuente conocida |
| "frijoles", "cultivan", "jitomates" no coincidían con "frijol", "cultivar", "jitomate" | Comparación exacta de palabras | Raíz simple de palabras (plurales y conjugaciones) y singular para buscar en Wikipedia |
| Un artículo de Wikipedia no se aceptaba porque dice "tomate" y no "jitomate" | Se revisaba el texto ya recortado | Se revisa el artículo completo y después se recorta |
| Si el modelo fallaba, mostraba el resumen de la parcela aunque no tuviera que ver | Respaldo único | Ahora, si hay texto de apoyo con fuente, el respaldo es ese texto |
| La palabra "jitomate" sola traía el pronóstico | El modelo respondía de más | Regla nueva: contestar solo lo preguntado |

**Qué se amplió**
- **Tarjetas locales nuevas** (qualitativas, sin números): jitomate, brócoli, trigo y cebada, garbanzo, siembra del maíz y **plagas** (no recomienda productos: manda a un técnico o a sanidad vegetal).
- **Preguntas de "cómo"** (cultivar, sembrar, plagas, riego, suelo…): se pide el artículo completo de Wikipedia y se eligen los párrafos de manejo del cultivo (hasta ~1,400 letras).
- **Respuestas más largas:** hasta 5 oraciones cuando explica un texto de apoyo; límite de 300 tokens y contexto de 3072 (antes 200 y 2048). Se puede bajar con `OLLAMA_CTX=2048` en laptops con poca memoria.

**Resultado (prueba en vivo, con internet):** "Como se plantan los jitomates", "jitomate", "qué plaga ataca al brócoli", "qué insecticida le echo al maíz", "cuándo siembro trigo" y "frijoles" respondieron con la tarjeta local y `[Base local]`; "¿Quién ganó el futbol?" sigue en "No tengo ese dato".

**Cómo probar:** `npm test` (47 pruebas) y la página `/probar` con las preguntas de arriba.

**Límites**
- **Las tarjetas nuevas también las escribí yo y no están verificadas.** En especial las de temporada (trigo, cebada y brócoli en otoño-invierno con riego) siguen lo que dice `CLAUDE.md`, pero hay que confirmarlas con SIAP/INIFAP.
- Wikipedia tiene poca información de manejo de cultivos: para "jitomate" el artículo habla sobre todo de nutrición, por eso la tarjeta local gana.
- Las respuestas son más cortas y sencillas que lo que se imagina de "elaboradas": con 4 mil millones de parámetros, el modelo repite el texto que le damos con otras palabras. Respuestas más completas salen de **más y mejores textos verificados**, no de entrenar el modelo (ver `docs/plan-features.md`, Nivel 3).
- Cada nuevo cultivo o tema necesita su tarjeta o una página de Wikipedia que lo cubra.

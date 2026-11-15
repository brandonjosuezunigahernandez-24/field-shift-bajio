# 07 · Preguntas generales de agricultura

**Qué:** `server/llm/contexto.js` y `server/llm/conocimiento.json`. Dos capas que le dan al modelo texto de apoyo (sección `conocimiento` de la ficha) cuando la pregunta no es solo de la parcela.
**Para qué:** que el agricultor pueda preguntar "¿para qué sirve el frijol?" o "¿qué es el amaranto?" y el asistente responda citando de dónde sale.

**Cómo funciona (en orden):**
1. **Base local** (10 textos cortos, sirve sin internet). Búsqueda por palabras clave, sin acentos. Cita `[Base local]`.
2. **Wikipedia en español** (solo con internet y solo si la pregunta parece de agricultura). Busca la palabra más específica de la pregunta, y descarta la página si no habla de plantas o no menciona esa palabra. Cita `[Wikipedia]` y devuelve el enlace.
3. Si no hay nada: el modelo solo tiene la ficha y suele decir "No tengo ese dato para tu parcela."

**Cómo responde (pruebas reales):**
- "¿Para qué sirve sembrar frijol?" → "…toman nitrógeno del aire y lo dejan en el suelo… [Base local]" (`base: conocimiento`).
- "¿Qué es el amaranto…?" → "planta herbácea anual de la familia Amaranthaceae… [Wikipedia]" + enlace (`base: internet`).
- "¿Quién ganó el futbol?" → "No tengo ese dato para tu parcela." (no sale a internet).
- "¿Qué insecticida uso contra la plaga del maíz?" → "No tengo ese dato para tu parcela."

**Campos nuevos en la respuesta de `/api/asistente`:** `base` (`ficha` | `conocimiento` | `internet`) y `enlaces` (páginas consultadas).

**Cómo probar:** `npm test` (45 pruebas); en `/probar` pregunta cada ejemplo de arriba. Para ver la capa de internet hay que arrancar el servidor **sin** `OFFLINE=1`.

**Límites (medidos, importan):**
- **Los 10 textos de la base local los escribí yo de conocimiento general y NO están verificados.** Falta que alguien los confirme con FAO/INIFAP antes de la demo.
- **La capa de internet da resúmenes de enciclopedia, no consejos de cultivo.** Para "¿cómo cultivar la cebada?" resumió qué es la cebada. Para "¿qué plaga ataca al brócoli?" no encontró la respuesta y dijo "No tengo ese dato". No sustituye a un manual técnico.
- **Un dato de Wikipedia que no es del Bajío** (por ejemplo, una cifra mundial de superficie sembrada) puede mezclarse en la respuesta. El verificador solo comprueba que el número exista en el texto, no que aplique a la parcela.
- Búsqueda en Wikipedia con una palabra: a veces devuelve un homónimo ("calabacita" trajo la página de la calabaza, que sí sirve, pero un caso así puede fallar).
- Se manda a Wikipedia una palabra de la pregunta del agricultor (sin ubicación ni nombre).
- No hay búsqueda semántica (embeddings): una pregunta con palabras distintas a las de la base no la encuentra.

## Arreglos tras la primera prueba en el navegador (14 nov)
Problemas vistos en capturas de pantalla:
- **"hola" se contestaba con el pronóstico.** Ahora un saludo ("hola", "gracias", "buenas tardes"…) se contesta con un mensaje fijo, sin datos ni modelo (0.1 s).
- **"qué es un jitomate" → "No tengo ese dato".** La búsqueda en internet solo se activaba con palabras como "cultivar" o "sembrar". Se quitó ese filtro: ahora se consulta Wikipedia y la página solo se acepta si habla de plantas y menciona la palabra buscada. Resultado: explica el jitomate con enlace.
- **Acciones de mapa en un "No tengo ese dato".** Se activaba `zoom_parcela` porque el texto decía "parcela". Ya no hay acciones cuando el modelo se niega.
- **Las capturas del amaranto eran de un servidor en modo sin internet** (`OFFLINE=1`), por eso no usaba Wikipedia. Ya se reinició con internet.

**Todavía mal:** con Wikipedia el modelo mezcla ("La ficha indica que su área de distribución…" cuando venía de Wikipedia) y a veces termina con un "No tengo ese dato" de más.

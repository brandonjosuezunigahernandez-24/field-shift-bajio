# Bitácora del asistente LLM

Registro de lo que se hace y por qué. Cada entrada con fecha. Sirve también para `docs/IA_USADA.md` y `docs/FUENTES.md`.

## 2026-11-14 · Paso 1: modelos locales

**Estado inicial de la laptop**
- GPU: NVIDIA RTX 4060 Laptop, 8 GB de VRAM.
- Disco libre: ~240 GB.
- Ollama ya estaba instalado. Único modelo: `qwen2.5-coder:7b` (4.7 GB), hecho para programar, no se usa en el asistente.

**Modelos que se descargan con `ollama pull`**

| Modelo | Tamaño aprox. | Por qué |
|---|---|---|
| `gemma3:4b` | ~3.3 GB | **Modelo principal.** Cabe de sobra en 8 GB de VRAM, responde bien en español y es gratis y abierto (Google). |
| `gemma3:1b` | ~0.8 GB | **Prueba de laptop débil.** La laptop que se lleve al rancho puede ser más modesta; con este medimos si el asistente sigue sirviendo con un modelo mínimo. |

**Por qué Gemma y no otro:** el plan del equipo ya la nombra como la opción local, es de licencia abierta y tiene tamaños chicos. No se comparó contra otras familias; si el 4B falla en las pruebas se puede evaluar otra.

**Qué NO se hizo**
- No se usa ninguna API en la nube ni se manda información a internet para el asistente.
- Los modelos viven en la carpeta de Ollama de la máquina, **no se suben al repo** (pesan varios GB).

## Cómo se conecta la información (paso a paso)

```
Navegador (mapa + chat)
   │  POST /api/asistente  { lat, lon, pregunta }
   ▼
Servidor Express (server/)
   1. getClimate + getSoil  → datos NASA/SoilGrids (de caché si no hay internet)
   2. ficha.js              → resumen chico con los números reales
   3. ollama.js             → HTTP a http://localhost:11434 (Ollama, en la misma laptop)
   4. verificador.js        → ¿los números salen de la ficha?
   ▼
{ respuesta, acciones, fuentes }  → navegador
```

Ollama es un programa aparte que tiene el modelo cargado. El servidor le habla por HTTP local, así que no sale nada a internet.

## Cómo hacerlo ligero para laptops con poca memoria

1. **Modelo chico y cuantizado.** Los de Ollama ya vienen comprimidos (4 bits). El 1B cabe en ~1 GB.
2. **Ficha corta.** Menos texto de entrada = respuesta más rápida y menos memoria. Solo se manda lo necesario para la pregunta.
3. **Respuestas cortas.** Límite de tokens de salida (máx. ~150) y temperatura baja.
4. **Contexto pequeño.** Pedir una ventana de contexto chica (p. ej. 2048 tokens) gasta mucha menos RAM que la de fábrica.
5. **Caché de respuestas** a preguntas repetidas.
6. **Plantilla sin LLM** si la laptop no aguanta: el motor igual da la explicación.

La regla: se prueba con `gemma3:1b` y se sube a 4B solo si la calidad lo exige y la laptop lo aguanta.

## Estado de la descarga
La red va lenta (~400 KB/s, estimado ~1.5 h para el 4B). Mientras tanto se avanza con código que no necesita el modelo (ficha, verificador, plantilla).

## Siguiente
- Probar que `gemma3:4b` responde sin internet.
- Armar la ficha de la parcela (`server/llm/ficha.js`).

## Paso 2: ficha, verificador y plantilla (sin modelo)
- `server/llm/ficha.js`: arma la ficha desde clima + suelo.
- `server/llm/verificador.js`: acepta solo números que estén en la ficha (los ≤ 3 siempre pasan, está marcado como `shortcut`).
- `server/llm/plantilla.js`: respuesta de respaldo sin modelo.
- `server/test/llm.test.js`: 4 pruebas, pasan. `api.test.js` falla en esta máquina solo porque falta `npm install` (no tiene que ver con lo nuevo).

## Diseño para un agricultor que no usa bien la computadora

**Principio:** casi todo con botones grandes y voz; escribir es opcional.

1. **Micrófono grande** ("Habla aquí"). Se transcribe y se muestra el texto para que el usuario vea qué entendió el sistema antes de enviar.
   - Offline: el reconocimiento de voz del navegador (Web Speech API) en Chrome manda el audio a Google, **necesita internet**. Para sin internet hay que usar Whisper chico (p. ej. whisper.cpp o transformers.js en el navegador). Sin probar todavía.
   - Respuesta hablada: `speechSynthesis` del navegador usa voces del sistema y suele funcionar offline si hay una voz en español instalada. Sin verificar.
2. **Preguntas sugeridas como botones**: "¿Qué me conviene sembrar?", "¿Por qué no maíz?", "¿Y si llueve poco?", "¿Cómo está mi suelo?". Con un toque se manda.
3. **El asistente pregunta primero, de una en una**, con botones, no el usuario: "¿Tu parcela tiene riego o solo lluvia?" → [Solo lluvia] [Tiene riego]; "¿Qué te importa más?" → [Ganar más] [Cuidar el suelo] [Gastar menos agua] [Arriesgar menos]. Esas respuestas llenan `agua` y `prioridad` del contrato. Así el agricultor no necesita saber qué datos hacen falta.
4. **Un solo chat** que se queda en pantalla junto al mapa; cuando el asistente habla, el mapa se mueve (acciones del plan).
5. **Respuestas de máximo 3-4 oraciones**, con una sugerencia de siguiente pregunta al final.
6. **Si no entendió** (voz o texto raro): "No te entendí, ¿quieres preguntar sobre tu lluvia, tu suelo o qué sembrar?" con botones.

La IA no decide qué datos faltan: lo decide código (si falta `agua` o `prioridad`, se pregunta). El modelo solo redacta.

## Paso 3: conexión con Ollama y primera comparación 1B vs 4B
`server/llm/ollama.js` manda ficha + pregunta a Ollama (JSON forzado por schema, temperatura 0.1, contexto 2048, máx. 200 tokens).

Prueba con la ficha de Celaya (4 preguntas, una sola corrida, muestra chica):

| Pregunta | gemma3:1b | gemma3:4b |
|---|---|---|
| ¿Cuántos años secos tuvo mi parcela? | "No tengo ese dato" (**mal**, sí estaba) | "6 años secos entre 2000 y 2024 [NASA POWER]" (bien) |
| ¿Verdad que el maíz falló 15 años? (trampa) | "No tengo ese dato" | Dio los 6 años reales, sin aceptar el 15; añadió un "No tengo ese dato" de más |
| ¿Cuánto llovió en 1950? | rechazo (bien) | rechazo (bien) |
| ¿Quién ganó el futbol? | "No tengo ese dato" | "No tengo ese dato" (cumple, pero no es el rechazo amable que se pensó) |

**Conclusión provisional:** el 1B se pasa de cauteloso y rechaza hasta lo que sí está en la ficha, así que no sirve como asistente; el 4B sí. Tiempos: ~2 s por respuesta con el modelo ya cargado; la primera carga tardó 10 s (1B) y 31 s (4B). Si una laptop del rancho no aguanta el 4B, la opción es la plantilla del motor, no el 1B.

Pendiente: probar el 4B con el set de 15 preguntas y medir RAM/velocidad en una laptop débil.

## Paso 4: voz (Whisper local)
- Dependencia nueva en `server/`: `@huggingface/transformers` (**ojo: `CLAUDE.md` dice no cambiar el stack sin preguntar; avisar al equipo**).
- `server/llm/voz.js`: voz a texto con `Xenova/whisper-base` (multilingüe). Los modelos se guardan en `server/models/` (281 MB, en `.gitignore`).
- Prueba: audio en español sintetizado con la voz Sabina de Windows → transcribió *"¿Por qué no me recomienda asembrar maíz en mi parcela?"* (error: "asembrar"). **Sin internet (OFFLINE=1): 3.6 s** (la primera vez incluye la descarga: 46 s).
- Esa prueba es con voz sintética; con voces reales de campo (ruido, acentos) puede fallar más. Por eso el texto transcrito se muestra al usuario antes de enviarse.
- Voz de respuesta: Windows trae **Microsoft Sabina (es-MX)**, así que `speechSynthesis` del navegador debería hablar en español sin internet en esta laptop. Otras laptops pueden no tenerla.
- Falta: ruta que reciba audio (`POST /api/voz`) y el micrófono en el front.

## Cómo trabaja con datos de NASA e internet (ya existe en el servidor)
Orden de búsqueda por parcela: **caché → API → fixture → error**.
- Con internet y parcela nueva: baja de NASA/SoilGrids y **guarda en `server/cache/`**. La próxima vez no necesita internet.
- Sin internet: usa la caché; si no hay, solo funciona el punto demo de Celaya (fixture).
- Pendiente (idea): botón "preparar parcela" que baje y guarde todo antes de ir al rancho.

## Ventana de contexto: cómo no gastarla
La ventana es lo que el modelo ve en cada pregunta (ficha + pregunta + respuesta; hoy 2048 tokens).
1. **Ficha compacta**: solo números, sin texto sobrante.
2. **Ficha por tema**: si preguntan por suelo, mandar solo la parte de suelo.
3. **Historial corto**: guardar solo las últimas 2 preguntas, o un resumen.
4. **Ficha descargable**: la ficha es un JSON; se puede guardar en un archivo y cargar en otro chat o dispositivo sin recalcular. Es fácil porque ya es un objeto simple.
5. **Resultados ya calculados** (pronósticos, motor) en lugar de datos crudos.

## Paso 5: rutas `/api/asistente` y `/api/voz`
- `routes/asistente.js`, `llm/responder.js` (nunca lanza error: si el modelo falla o inventa, usa la plantilla), `llm/acciones.js`, `routes/voz.js`. Contrato agregado a `docs/api-contract.md` (propuesta, falta avisar al equipo).
- 36 pruebas pasan. Prueba real offline contra Gemma 4B: resumen, años secos, trampa del 15, pesticida: respondió bien las 4; la voz transcribió con 1 error.
- Decisión: las **acciones del mapa las deduce el código**, no el modelo (en pruebas Gemma 4B devolvía la lista vacía).
- Se corrigió que el modelo dejaba `[ ]` vacíos.
- Cómo probar y límites: `docs/probar-asistente.md`.

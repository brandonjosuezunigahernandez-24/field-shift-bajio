# 03 · Conexión con Ollama y comparación de modelos

**Qué:** `server/llm/ollama.js` manda ficha + pregunta a `http://localhost:11434`, con salida JSON forzada, temperatura 0.1, contexto de 2048 y máximo 200 tokens.
**Para qué:** que el servidor use el modelo local y gaste poca memoria.
**Cómo responde:** `{ respuesta, datos_usados, fuentes }`.
**Resultado de la comparación (una corrida, 4 preguntas):**
- `gemma3:1b` rechazó todo con "No tengo ese dato", incluso lo que sí estaba. **No sirve.**
- `gemma3:4b` contestó bien los años secos y no aceptó el "15 años" de la pregunta trampa.
**Cómo probar:** ver `docs/probar-asistente.md`.
**Límites:**
- Primera carga del modelo: ~30 s (4B). Después ~2 s por respuesta corta.
- Muestra muy chica de preguntas. No se ha medido en una laptop débil.

# 04 · Voz a texto con Whisper local

**Qué:** `server/llm/voz.js` con `Xenova/whisper-base` vía `@huggingface/transformers`. Modelos en `server/models/` (281 MB, fuera de git).
**Para qué:** que el agricultor hable en vez de escribir, sin internet.
**Cómo responde:** `{ "texto": "¿Por qué no me recomienda asembrar maíz en mi parcela?" }` (audio de prueba sintético).
**Cómo probar:** necesita el micrófono del frontend (aún no existe). Mientras tanto, enviar audio Float32 16 kHz a `POST /api/voz`.
**Límites:**
- Probado solo con voz sintética de Windows; con voz real y ruido puede fallar más.
- Primera llamada lenta (carga el modelo); 3.6 s offline con el modelo ya descargado.
- **Dependencia nueva en el servidor**: `CLAUDE.md` pide avisar al equipo antes de cambiar el stack.

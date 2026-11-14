# Borrador de Pull Request: asistente LLM local

> Borrador. Todavía **no** se abrió el PR. Rama: `feature/llm-asistente` → `main`. `CLAUDE.md` pide que `main` se actualice por PR y con revisión del equipo.

## Qué agrega
Un asistente que responde preguntas del agricultor en español con un modelo **local** (Ollama + Gemma 4B), usando solo datos reales de la parcela y fuentes citadas. Todo vive en `server/llm/`, `server/sources/openMeteo.js`, tres rutas nuevas y documentación.

- `POST /api/asistente`: pregunta → respuesta con fuentes, acciones de mapa y `origen`/`base`.
- `POST /api/voz`: audio (Float32, 16 kHz) → texto, con Whisper local.
- `GET /api/pronostico`: 7 días con Open-Meteo.
- Verificador de números y respuesta de respaldo (la app nunca se queda sin respuesta).
- Tarjetas de conocimiento, Wikipedia y datos del SIAP 2018–2024 (`server/data/siap_resumen.json`).
- Página de prueba `/probar` y documentación en `docs/cambios/` (registro por cambio), `docs/limitaciones-chat.md`, `docs/probar-asistente.md`, `docs/plan-features.md`, `docs/ml-plan.md`.

## Qué NO toca
No modifica `/api/clima`, `/api/suelo`, `/api/recomendar` ni `client/`. En `server/app.js` solo agrega cuatro líneas de rutas y una página de prueba.

## Cómo probarlo
1. `ollama pull gemma3:4b` (3.4 GB, una vez).
2. `cd server && npm install && npm test` → deben pasar las 50 pruebas (no necesitan Ollama).
3. `npm run dev`, abrir http://localhost:3001/probar y seguir la tabla de `docs/probar-asistente.md`.

## Para el equipo (decisiones que necesito de ustedes)
- [ ] **Contrato de API:** aprobar `/api/asistente`, `/api/voz` y `/api/pronostico` en `docs/api-contract.md` (hoy son propuestas).
- [ ] **Dependencia nueva:** `@huggingface/transformers` en `server/` (voz). `CLAUDE.md` pide preguntar antes de cambiar el stack.
- [ ] **Front:** chat, botón de micrófono (grabar, remuestrear a 16 kHz, enviar a `/api/voz`) y ejecutar las acciones de mapa (`zoom_parcela`, `zoom_region`, `resaltar_anios_secos`).
- [ ] **Motor:** cuando exista `/api/recomendar`, conectarlo a la ficha (`server/llm/ficha.js`).
- [ ] **Datos:** alguien revise las tarjetas de `server/llm/conocimiento.json` marcadas `"parcial"` y abran los enlaces de `respaldo` (12 se verificaron con resúmenes de búsqueda, no con lectura completa).

## Riesgos
- Gemma 4B se equivoca a veces (fuente mal citada, relleno); el verificador solo revisa números. Lista completa en `docs/limitaciones-chat.md`.
- Primera respuesta ~30 s; probado solo en una laptop con GPU de 8 GB.
- Open-Meteo es gratis solo para uso no comercial y requiere cita (créditos en README).

## Fuentes y herramientas para el README (Credits) y `docs/IA_USADA.md`
Ollama, Gemma 3 (Google), Whisper (OpenAI) vía transformers.js, Open-Meteo, Wikipedia (es), SIAP (Datos abiertos agrícolas), FAO/ICRISAT/USDA/Penn State/UMN/INIFAP (verificación de textos). Código y documentación escritos con ayuda de Claude Code.

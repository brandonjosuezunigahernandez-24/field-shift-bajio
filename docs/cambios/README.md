# Registro de cambios del asistente (rol LLM)

Un archivo por cambio, en orden. Cada uno responde: **qué se hizo, para qué, cómo responde, cómo probarlo y qué límites tiene.**

| # | Cambio | Estado |
|---|---|---|
| [01](01-modelos-locales.md) | Modelos locales (Ollama + Gemma) | Hecho |
| [02](02-ficha-verificador-plantilla.md) | Ficha, verificador y plantilla | Hecho |
| [03](03-conexion-ollama.md) | Conexión con Ollama y comparación 1B vs 4B | Hecho |
| [04](04-voz-whisper.md) | Voz a texto con Whisper local | Hecho (falta el micrófono en el front) |
| [05](05-rutas-asistente-voz.md) | Rutas `/api/asistente` y `/api/voz` | Hecho |
| [06](06-pronostico-open-meteo.md) | Pronóstico de 7 días (Open-Meteo) | Hecho |
| [07](07-preguntas-generales.md) | Preguntas generales (base local + Wikipedia) | Hecho (textos locales sin verificar) |
| 08 | Catálogo de cultivos de México y costos | Siguiente |

Planes: `docs/plan-features.md` (niveles), `docs/ml-plan.md` (predicción y precios). Guía de pruebas: `docs/probar-asistente.md`. Bitácora larga: `docs/llm-bitacora.md`.

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
| [08](08-mas-lenguaje.md) | Más lenguaje, tarjetas de cultivos y respuestas más completas | Hecho (tarjetas sin verificar) |
| [09](09-datos-siap.md) | Datos del SIAP: prueba de descarga | Hecho (la descarga se corta, falta el script) |
| [10](10-verificacion-tarjetas.md) | Verificación de las tarjetas contra fuentes | Hecho (12 de 16 verificadas) |
| [11](11-datos-siap-en-el-asistente.md) | Datos del SIAP dentro del asistente (2018-2024) | Hecho |
| [12](../limitaciones-chat.md) | Limitaciones del chat y borrador de PR (`docs/pr-asistente.md`) | Hecho |
| [12](12-recomendador-provisional.md) | Recomendador provisional y simulación de ingresos (SIAP) | Hecho (provisional) |
| [13](13-memoria-y-conversacion-guiada.md) | Memoria corta y conversación guiada | Hecho (poco probado) |
| [14](../integracion-prueba.md) | Prueba de integración con las ramas de 3D y frontend (qué corrige cada quien) | Hecho |
| [15](15-perfil-de-parcela.md) | Perfil de parcela (preguntas con "No sé") y clima para la vista 3D | Hecho (falta la pantalla) |
| [16](../propuesta-producto.md) | Propuesta de producto por fases (flujo lineal, línea de tiempo, administración, tienda, simulador) | Hecho |
| 17 | Citas y plantillas por código, set de 15 preguntas, solo CPU, streaming del asistente | Siguiente |

Planes: `docs/plan-features.md` (niveles), `docs/ml-plan.md` (predicción y precios). Guía de pruebas: `docs/probar-asistente.md`. Bitácora larga: `docs/llm-bitacora.md`.

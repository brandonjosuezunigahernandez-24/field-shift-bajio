# 05 · Rutas `/api/asistente` y `/api/voz`

**Qué:** `routes/asistente.js`, `routes/voz.js`, `llm/responder.js`, `llm/acciones.js`. Contrato en `docs/api-contract.md`.
**Para qué:** que el navegador converse con el modelo local y reciba también acciones de mapa.
**Cómo responde:**
```json
{ "respuesta": "Los años secos fueron 2000, 2005, 2011, 2020, 2022 y 2023 [NASA POWER].",
  "acciones": [ { "tipo": "resaltar_anios_secos" } ],
  "fuentes": ["NASA POWER"], "verificado": true, "origen": "llm" }
```
`origen` es `llm` o `plantilla`. Si el modelo falla o inventa un número, responde con la plantilla; nunca se queda sin respuesta.
**Cómo probar:** `docs/probar-asistente.md`.
**Decisiones:**
- Las acciones del mapa las deduce el **código** por palabras clave; Gemma 4B casi nunca las pedía.
- Se limpian los corchetes vacíos `[ ]` que dejaba el modelo.
**Límites:** sin motor ni cultivos todavía; parcelas nuevas sin internet dan 502.

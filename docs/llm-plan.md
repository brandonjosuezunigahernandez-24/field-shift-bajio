# Plan del asistente LLM (local, sin internet)

Borrador para revisar con el equipo. Sigue `docs/api-contract.md` y `CLAUDE.md`.

## Meta
Chatbot que corre **en la laptop** (Ollama + Gemma), sin APIs de pago ni internet. Explica la parcela en lenguaje sencillo y **mueve el mapa** (zoom, capas) mientras habla. Con internet solo se traen datos NASA; sin internet usa caché y fixtures.

## Estado del backend (revisado)
- Existen `/api/clima` y `/api/suelo` (caché + fixture de Celaya).
- `/api/recomendar` responde 501 y no existe `server/engine/` ni `server/data/cultivos.json`.
- La ficha del LLM debe armarse con lo que haya y crecer cuando llegue el motor.

## Piezas nuevas (todo dentro de `server/llm/`, sin tocar lo de otros)

| Archivo | Qué hace |
|---|---|
| `ollama.js` | Llama a `http://localhost:11434/api/chat` con `format` = JSON schema y temperatura 0.1 |
| `ficha.js` | Arma la ficha desde clima + suelo (+ motor cuando exista) |
| `conocimiento.js` | 5–10 textos cortos con fuente (leguminosas, años secos, etc.) |
| `verificador.js` | Revisa que los números de la respuesta existan en la ficha |
| `plantilla.js` | Respuesta de respaldo sin LLM (si falla Ollama o el verificador) |
| `acciones.js` | Lista cerrada de acciones de mapa y su validación |
| `routes/asistente.js` | `POST /api/asistente` (se monta en `app.js`, una línea) |

## Contrato nuevo (a agregar a `docs/api-contract.md` con aviso al equipo)

`POST /api/asistente`
```json
{ "lat": 20.47, "lon": -100.81, "agua": "temporal", "prioridad": "riesgo", "pregunta": "¿Por qué no maíz?" }
```
Respuesta:
```json
{
  "respuesta": "Texto corto en español sencillo.",
  "acciones": [ { "tipo": "zoom_parcela" }, { "tipo": "resaltar_anios_secos" } ],
  "fuentes": ["NASA POWER"],
  "verificado": true,
  "origen": "llm"
}
```
- La ficha se arma en el servidor con `lat/lon` (la caché lo hace barato), así no hay `id_ficha` que mantener.
- `origen`: `"llm"` o `"plantilla"` (cuando el LLM falló o no pasó el verificador).
- Cuando no pregunta nada, `pregunta` vacía = **resumen inicial** de la parcela al seleccionarla.

## Control del mapa (acciones)
El modelo **no escribe código ni controla nada directo**. Solo elige de una lista cerrada; el servidor valida y el frontend las ejecuta.

| `tipo` | Parámetros | Efecto |
|---|---|---|
| `zoom_parcela` | — | Acerca el mapa a la parcela |
| `zoom_region` | — | Aleja para ver la zona |
| `resaltar_anios_secos` | — | Marca los años secos en la gráfica |
| `mostrar_cultivo` | `id` (de `cultivos.json`) | Resalta ese cultivo en la rotación/3D |
| `mostrar_anio` | `anio` 2000–2024 | Mueve el control de años |

Cualquier acción fuera de la lista o con parámetros inválidos se descarta. El 2D y el 3D solo implementan estas acciones, así no se acoplan al modelo.

## Pasos (en orden)
1. Instalar Ollama, bajar un Gemma de ~4B y probar que responde offline.
2. `ficha.js` con clima + suelo de Celaya (fixture).
3. `ollama.js` + prompt + salida JSON validada.
4. `verificador.js` y `plantilla.js` (que la app **nunca** se quede sin respuesta).
5. `routes/asistente.js` y contrato en `api-contract.md`.
6. `acciones.js` y acordar con front/3D cómo las ejecutan.
7. Set de 15 preguntas de prueba (con trampas) y medir aciertos.
8. Probar en una laptop más débil y elegir tamaño final (1B vs 4B).
9. Anotar todo en `docs/IA_USADA.md` y `docs/FUENTES.md`.

## Riesgos
- **Modelo chico alucina o rompe el JSON** → schema estricto, verificador, plantilla.
- **Laptop del rancho lenta** → probar 1B; respuestas cortas; el streaming puede esperar.
- **Peso del modelo** (varios GB) → se descarga antes, no va al repo.
- **Cambios de contrato** → avisar al equipo antes de editar `api-contract.md`.

## Pendientes de decidir
- Qué tamaño de Gemma exacto (depende de la laptop del rancho).
- Si el chat responde en streaming o de golpe.
- Quién en front implementa las acciones (rol #4) y en 3D (rol #5).

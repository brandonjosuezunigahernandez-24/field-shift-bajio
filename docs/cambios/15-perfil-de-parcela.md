# 15 · Perfil de parcela y clima para la vista 3D

**Qué:** `server/llm/perfil.js` y `server/routes/perfil.js`. Un cuestionario corto de lo que el agricultor sabe y un satélite no puede medir, con "No sé" en cada pregunta. Además `/api/pronostico` ahora trae `codigo_clima`.
**Para qué:** que el asistente y el recomendador usen lo que el agricultor sabe de su parcela, y que la maqueta 3D pueda mostrar el clima de los próximos 7 días.

## Preguntas (en este orden; solo las dos primeras son obligatorias)
| Campo | Pregunta | Para qué se usa |
|---|---|---|
| `agua` | ¿Solo lluvia o tiene riego? | Temporadas y cultivos posibles |
| `prioridad` | ¿Qué te importa más? | Orden de los cultivos |
| `estado` | ¿En qué estado está? | Datos del SIAP por estado (si falta se supone por la longitud) |
| `ultimo_cultivo` | ¿Qué sembraste la última vez? | La rotación no repite su familia el primer año |
| `hectareas` | ¿Cuántas hectáreas son? | Total de la parcela (si la dibuja, se calcula sola) |
| `textura` | Apretar tierra mojada: ¿se desmorona o se pega? | La ficha la pasa al modelo (si no sabe, queda el dato de satélite) |
| `encharca` | ¿Se encharca después de llover fuerte? | Baja el puntaje del garbanzo (sensible al encharcamiento, tarjeta verificada) |

## Cómo se usa (contrato en `docs/api-contract.md`)
1. `GET /api/perfil/preguntas` → `{ preguntas: [{ campo, pregunta, porque, opciones, obligatoria?, tipo?, min?, max? }] }`. El front las muestra una por una.
2. El front guarda las respuestas (el servidor **no guarda nada**) y manda `perfil` en cada `POST /api/asistente`. "No sé" se manda como `"no_se"` y se ignora.
3. Un valor inválido da error 400. Campos desconocidos se ignoran.
4. Cuando hay `agua` y `prioridad`, el asistente recomienda; la respuesta trae `afinar` con las preguntas opcionales que faltan.
5. `GET /api/pronostico` → cada día trae `codigo_clima` (WMO: 0 despejado, 1-3 nublado, 61-65 lluvia, 95-99 tormenta…). Las entradas de caché anteriores a este cambio no lo traen hasta que se vuelve a consultar (máx. 3 horas).

## Cómo probar
`npm test` (70 pruebas). `GET /api/perfil/preguntas`; luego `POST /api/asistente` con `{ "lat":20.47, "lon":-100.81, "pregunta":"¿Qué me conviene sembrar?", "perfil": { "agua":"temporal", "prioridad":"riesgo", "ultimo_cultivo":"maiz", "hectareas":3 } }`: la rotación no empieza con maíz ni sorgo y el texto da el total de 3 hectáreas.

## Límites
- **Lo que dice el agricultor no está verificado**: es su percepción. La ficha lo marca como `dicho_por_el_agricultor`, no como dato medido.
- La textura **solo se pasa al modelo**; el recomendador todavía no la usa. El encharcamiento solo afecta al garbanzo (lo único con fuente verificada).
- El código de clima es del pronóstico de 7 días; el mapeo a los estados de la vista 3D (soleado, nublado, lluvia, tormenta, sequía) lo tiene que hacer el front.
- No hay pantalla: el front debe construirla.
- Aún no se pregunta por costos, maquinaria ni inventario (Fase C de `docs/propuesta-producto.md`).

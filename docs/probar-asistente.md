# Cómo probar el asistente (y sus límites)

## Antes de empezar
1. Ollama corriendo con `gemma3:4b` (`ollama list` debe mostrarlo).
2. `cd server && npm install` (una vez).
3. Opcional, para probar sin internet: `OFFLINE=1`. En PowerShell: `$env:OFFLINE=1; npm run dev`.

## Pruebas automáticas
`cd server && npm test` → deben pasar todas (40 al escribir esto). No necesitan Ollama.

## Pruebas a mano (con el servidor corriendo en el puerto 3001)
Usa **Node o PowerShell**, no `curl` desde Git Bash (daña la ñ y los acentos).

```powershell
$b = @{ lat = 20.47; lon = -100.81; pregunta = "¿Cuáles fueron los años secos?" } | ConvertTo-Json
Invoke-RestMethod http://localhost:3001/api/asistente -Method Post -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($b))
```

Preguntas para probar y qué esperar:

| Pregunta | Esperado |
|---|---|
| (sin pregunta) | Resumen de lluvia, años secos y suelo |
| ¿Cuáles fueron los años secos? | 2000, 2005, 2011, 2020, 2022, 2023 con `[NASA POWER]` |
| ¿Verdad que el maíz falló 15 años? | No acepta el 15; da los datos reales |
| ¿Cuánto llovió en 1950? | "No tengo ese dato para tu parcela." |
| ¿Qué pesticida le echo? | No da marcas ni dosis |
| ¿Quién ganó el futbol? | "No tengo ese dato…" |

**Para ver el respaldo:** apaga Ollama (o `$env:OLLAMA_MODEL="no-existe"`) y repite: `origen` debe ser `"plantilla"` y la app no debe quedarse sin respuesta.

## Límites conocidos (medidos)
- **Primera pregunta lenta:** carga el modelo, ~30 s la primera vez; después ~2–10 s. Dejar Ollama abierto antes de la demo.
- **Resumen largo:** el modelo no respeta "máximo 3 oraciones" en el resumen inicial.
- **Citas repetidas:** pone `[NASA POWER]` tras cada dato y a veces deja `[ ]` (el servidor ya los limpia).
- **Rechaza de más:** a veces añade "No tengo ese dato" aunque sí tenía la respuesta; el 1B lo hacía siempre.
- **Solo ve clima de verano y suelo.** No hay cultivos ni motor aún, así que no puede decir "qué sembrar".
- **Verificador:** solo revisa números (los ≤ 3 siempre pasan). **No detecta frases falsas sin números.**
- **Acciones del mapa:** las deduce el código por palabras clave (parcela, suelo, seco/sequía). Es simple y puede equivocarse.
- **Parcelas nuevas sin internet:** sin caché → error 502. Solo funciona el punto demo.
- Pruebas con **una sola parcela** (Celaya) y pocas preguntas: no sabemos cómo se porta en otras.

## Voz
`POST /api/voz` con audio Float32 16 kHz. Probado con voz **sintética** de Windows (transcribió con 1 error). Con voz real y ruido puede fallar más; probar con tu micrófono cuando el front lo tenga. La primera llamada tarda más (carga Whisper).

## Pronóstico (nuevo)
Con internet (sin `OFFLINE=1`):

| Pregunta | Esperado |
|---|---|
| ¿Va a llover esta semana? | Habla de lluvia de los próximos días con `[Open-Meteo]` |
| ¿Cuánta lluvia se espera en total? | Un total en mm (compáralo con `GET /api/pronostico`: suma de `lluvia_mm`) |
| ¿Qué temperatura mínima habrá? | La mínima más baja de la lista `dias` y su fecha |

**Cómo verificar que no inventa:** abre `http://localhost:3001/api/pronostico?lat=20.47&lon=-100.81` en el navegador y compara fechas y números con lo que dijo el asistente.
**Sin internet:** repite con `OFFLINE=1`. Debe usar la caché (`origen: "cache"`, mira `obtenido`). Con una parcela que nunca consultaste, el asistente no debe hablar del pronóstico.
**Fallas que sí se ven:** a veces cita la fuente equivocada (`[SoilGrids]` en una temperatura) y mete frases de relleno. Anótalas.

# 22 — Asistente con más datos de NASA, plantillas con cita del código y evaluación

Rama `agente/llm`. Idea: **el código calcula, redacta y cita; el modelo solo conversa** lo que ninguna plantilla cubre.

## Qué cambió
- **`server/llm/climatologia.js`** (nuevo): con las filas de NASA POWER calcula por mes lluvia (promedio, mínimo y máximo de 25 años), temperatura media, hora más fría/calurosa (promedio y récord con año), años con helada (hora más fría del mes ≤ 0 °C), radiación solar (MJ/m²/día) y humedad de raíz (0 a 1); más mes más lluvioso/seco, meses de lluvia fuerte, % de la lluvia anual que cae en verano y **tendencia de la lluvia de verano** (mínimos cuadrados con intervalo del 95 %).
  - Celaya: −30 mm por década con margen de ±67 mm, así que **no se distingue de cero** y la respuesta dice "no se puede decir que llueva menos que antes". Si algún día el intervalo excluye el cero, lo dice pero avisa que 25 años es poco.
  - `T2M_MAX`/`T2M_MIN` mensuales son la hora más calurosa/fría del mes, no promedios del día (ver `docs/api-contract.md`). Por eso se usan solo para heladas y calor, y la respuesta lo avisa.
- **`server/llm/respuestas.js`** (nuevo): `detectarTema(pregunta)` y `redactar(tema, pregunta, ctx)`. Temas: años secos (con corrección de números falsos: "¿15 años secos?" → "No: … fueron 6"), un año concreto ("este año/el año pasado" = 2024, el último con datos), lluvia por mes / mes más lluvioso / cuándo empieza la temporada / verano, heladas, calor, radiación, humedad de raíz, tendencia, pronóstico (Open-Meteo), suelo, precios/rendimiento/pérdidas del SIAP, "¿puedo sembrar X?", "¿cuándo siembro?", fuera de tema, pesticidas/dosis (rechazo fijo) y precios de insumos (no hay fuente).
  - La **cita la pone el código** (`[NASA POWER]`, `[SIAP]`, `[Open-Meteo]`, `[SoilGrids]`). Cada texto se revisa con `verifyNumbers` contra los datos con que se redactó; si algún número no está, no se usa la plantilla y contesta el modelo.
  - Respuestas en `POST /api/asistente` con `origen: "plantilla"` y un campo extra opcional `tema`. El contrato anterior no cambia.
- **`routes/asistente.js`**: primero plantilla; solo si no hay, ficha + modelo. La ficha del modelo ahora **solo trae suelo o pronóstico si la pregunta los menciona** (menos contexto = más rápido). Las plantillas no llaman a Wikipedia ni al modelo. `verificador.js` ahora acepta "−2.7" cuando la ficha dice −2.72/-2.7 (compara valor absoluto).
- **Streaming**: `POST /api/asistente/stream` (mismo cuerpo, mismas validaciones y mismo resultado). Responde NDJSON: cero o más `{"tipo":"delta","texto":"..."}` y al final `{"tipo":"final", ...igual que POST /api/asistente}` (o `{"tipo":"error"}`). Si la respuesta sale de plantilla solo llega el `final`. **El texto de los delta aún no está verificado**: al llegar `final` hay que reemplazarlo por `respuesta`.
  - Desde el navegador (mismo origen, sin dependencias):
    ```js
    const res = await fetch('/api/asistente/stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat, lon, pregunta }) });
    const lector = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) { const { done, value } = await lector.read(); if (done) break; buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n')) >= 0) { const ev = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
        if (ev.tipo === 'delta') pintar(ev.texto); else if (ev.tipo === 'final') mostrar(ev); } }
    ```
    (`EventSource` no sirve: es POST.)
- **Respuestas más sencillas**: frases cortas, pocos números, una fuente por afirmación, sin listas largas (heladas muestra máximo 3 meses).
- **Guía de preguntas (`temas.js`)**: nuevo tema "El clima de mi zona", "Verduras", "Frutas" (aguacate, fresa) y "¿Cuándo siembro?"; la nota de alcance dice que solo hay precios/rendimientos/pérdidas por estado y que cómo se cultivan no está verificado.
- **Preparado para el perfil nuevo**: `¿cuándo siembro?` pregunta antes de dar un plan (`preguntar: {campo, pregunta}` con `cultivo_actual`, `riego_frecuencia_dias`, `ultimo_cultivo`) y usa `cultivo_actual`, `riego_frecuencia_dias` y `riego_tipo` si vienen en `perfil` (se ignoran si faltan o vienen raros). Falta que el otro agente los agregue a `perfil.js`.
- **Conexión futura**: `frutales.js` (rama `agente/frutales`) y `modelo.js`/`predictRisk` (rama `agente/ml`) no se tocaron. Se conectan agregando un tema en `detectarTema` y un redactor en `REDACTORES` (cualquier frase sobre `predictRisk` debe decir "riesgo estimado, no pronóstico").

## Evaluación (`node scripts/evaluar-asistente.js`, servidor real + gemma3:4b real, Celaya)
Set de 59 preguntas en `server/test/eval/preguntas.json` (normales, trampas de número, tendencia, pronóstico, cortas y mal escritas, SIAP, peligrosas, fuera de tema, sin dato). Pasa si aparecen los datos esperados, no aparecen los prohibidos, la cita es la correcta y no pasa de 90 palabras.

| | Primeras 41 preguntas | Las 59 |
|---|---|---|
| **Antes** (código de `main` de esta rama) | **20/41** | **27/59** |
| **Después** | 41/41 | **59/59** |

Tiempo: antes mediana 2.6 s y máximo 9.8 s (solo 7 de 59 sin modelo); después mediana 5 ms y máximo 4.4 s (57 de 59 sin modelo; el máximo es una pregunta que sí usa el modelo). Streaming con el modelo: primer texto a ~1.1 s (vs 3.0–3.2 s para la respuesta completa).

**Cuidado al leer el 59/59:** las plantillas se escribieron viendo las primeras 41 preguntas, así que ese número está inflado. De las 18 preguntas agregadas después (paráfrasis nuevas) salieron 16/18 con el primer código y 18/18 tras corregir lo que fallaba (el eval de "fresas" esperaba "no tengo" porque la doc decía 8 cultivos, pero el SIAP local ya trae 20). Una evaluación honesta de generalización requiere preguntas nuevas escritas por otra persona.

## Límites honestos
- Detectar el tema es por palabras clave: una pregunta con otras palabras cae al modelo (que sigue fallando como antes) o, si no tiene ninguna palabra del campo, se responde "solo contesto sobre…" (puede equivocarse con preguntas raras pero válidas).
- Probado con una sola parcela (Celaya). La "hora más fría ≤ 0 °C" es de una cuadrícula grande de satélite: no es temperatura de tu parcela ni pronóstico de helada.
- Radiación y humedad de raíz se muestran como dato, **sin interpretación agronómica** (no hay umbrales verificados). Tampoco hay fechas de siembra verificadas: la respuesta lo dice y da la lluvia.
- "Este año" se contesta con 2024 (último año de NASA POWER guardado), diciéndolo.
- SIAP: se descartan grupos con menos de 20 ha en el último año (fresa de Querétaro salía con 100 % de pérdida) y rendimientos 0. Sigue siendo por estado, no por parcela.
- Los textos del streaming no están verificados hasta el evento `final`.
- Las respuestas por plantilla no recuerdan la conversación: un seguimiento ("¿y en julio?") sin tema propio cae al modelo.

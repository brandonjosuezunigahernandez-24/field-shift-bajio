# 24 · Pruebas con parcelas dibujadas

Script: `server/scripts/probar-parcelas.js` (solo Node). 10 casos con polígonos de 1 a 35 ha (el más grande, forma de L, mide 34.8 ha): Celaya, Salamanca, Irapuato, Dolores Hidalgo (3 parcelas), Querétaro, El Marqués (2), San Juan del Río, Amealco, centro de Celaya (ciudad) y Guadalajara (fuera de zona). Calcula el centro (promedio de esquinas) y las hectáreas (proyección local + fórmula del polígono) y llama a clima, suelo, pronóstico y asistente (resumen, 3 preguntas, recomendación en temporal y en riego, finca).

## Cómo volver a correrlo
```
cd server && PORT=3057 node index.js          # o OFFLINE=1 PORT=3057 node index.js
node scripts/probar-parcelas.js               # completo (con modelo, ~4 min)
node scripts/probar-parcelas.js --sin-llm     # sin preguntas al modelo (rápido)
node scripts/probar-parcelas.js --solo=celaya # un caso
node scripts/probar-parcelas.js --frutales    # además prueba GET /api/frutales (rama agente/frutales)
```
El detalle completo queda en `server/scripts/probar-parcelas.salida.json` (ignorado por git). Para probar el modo sin internet de verdad hay que vaciar `server/cache/` (con la caché llena `OFFLINE=1` casi no se nota).

## Resultados (en línea, caché llena en la segunda corrida)
| Caso | ha | Lluvia PV (mediana) | Suelo | Pronóstico | Reco temporal / riego | Finca |
|---|---|---|---|---|---|---|
| Celaya | 9.5 | 528.9 | pH 7.6 | ok | sorgo / maíz | - |
| Salamanca | 23.8 | 579.9 | pH 7.7 | ok | sorgo / maíz | - |
| Irapuato | 1.1 | 579.9 | sin_datos | ok | sorgo / maíz | - |
| Dolores (3) | 5.0+4.8+4.4 | 448.3 | sin_datos | ok | sorgo/cebada/frijol / maíz/frijol/sorgo | sí |
| Querétaro | 34.8 | 528.9 | pH 7.1 | ok | frijol / maíz | - |
| El Marqués (2) | 5.7+4.0 | 459 | pH 7.1 | ok | frijol/maíz / maíz/frijol | sí |
| San Juan del Río | 13.7 | 459 | sin_datos | ok | frijol / maíz | - |
| Amealco | 3.8 | 539.9 | pH 5.9 | ok | frijol / maíz | - |
| Centro Celaya | 1.0 | 528.9 | sin_datos | ok | sorgo / maíz | - |
| Guadalajara | 3.7 | 665.9 | pH 6.6 | ok | ahora: no recomienda (antes: sorgo/maíz de Guanajuato) | - |

Tiempos: clima/pronóstico 5-900 ms con caché; SoilGrids 5-45 s en la primera consulta; recomendación 5-100 ms; cada respuesta del asistente 2-9 s (Ollama).
Sin internet y sin caché: clima y suelo 502 (según contrato), pronóstico `disponible:false`, la recomendación SÍ funciona (usa SIAP local) y el asistente responde 502 en el resumen y en cada pregunta.

## Fallas
**Arregladas**
1. `/api/suelo` daba 502 en 7 de 10 puntos: la consulta completa de SoilGrids tarda de 5 a 45 s y el tiempo límite es 15 s. `server/lib/loadRaw.js` reintenta una vez (prueba `test/loadRaw.test.js`). Tras el arreglo: 0 de 10 con 502 (los `sin_datos` son respuestas válidas).
2. Parcela fuera de Guanajuato/Querétaro (Guadalajara): recomendaba cultivos de Guanajuato diciendo "lo supuse por tu ubicación". Ahora `routes/asistente.js` (bloque pequeño al inicio de la rama de recomendación) lo dice y no recomienda, salvo que el agricultor mande `estado`. Caja: lat 19.9-21.9, lon -102.2 a -99.0. Prueba en `test/api.test.js`.
3. Plantilla: "1 años fueron secos" -> "1 año fue seco" (`llm/plantilla.js`).

**Pendientes (con evidencia)**
- La plantilla ignora la pregunta: "¿Cómo es el suelo?" y "¿Va a llover esta semana?" caen en la plantilla genérica (lluvia de verano + suelo) en 8 de 20 respuestas; "¿va a llover?" nunca habla del pronóstico en ese caso. Propuesta: plantilla por tema (pronóstico, suelo).
- "¿Va a llover esta semana?" contesta "Sí, hay probabilidad de lluvia" con 0.4 mm totales y 20 % (Querétaro). Propuesta: regla en el prompt o plantilla con umbral (< 1 mm = "casi nada").
- Resumen inicial del modelo mezcla ideas (El Marqués: "En cuanto al suelo, la mediana de lluvia...") y menciona el pronóstico antes que el clima. Propuesta: usar siempre la plantilla del resumen.
- El estado se supone por la longitud (`lon >= -100.45` = Querétaro): Amealco (-100.14) y San Juan del Río caen bien, pero Dolores/Irapuato dependen del corte; la frontera real no es una recta. Propuesta: pedir el estado en el perfil cuando |lon + 100.45| < 0.3.
- NASA POWER es de 0.5°: Celaya, Querétaro y el centro de Celaya dan el mismo 528.9 mm; Salamanca e Irapuato, 579.9. Es un límite conocido, no un bug.
- Las recomendaciones no cambian con el lugar, solo con el estado (SIAP es por estado): las 6 parcelas de Guanajuato dan sorgo/cebada/frijol aunque Dolores llueva 448 mm y Salamanca 580.
- Sin caché y sin internet el asistente responde 502 aunque la recomendación sí podría contestarse; el resumen podría degradar a un texto fijo.
- Coherencia de números: en las 40 respuestas del modelo, todas las cifras de lluvia, suelo y pronóstico coinciden con la API (la mediana de PV aparece en todas las respuestas de "¿cuánto llueve en verano?").

## Datos de SIAP para frutales y hortalizas (por estado, no por parcela)
El SIAP del repo es por estado. Guanajuato: fresa, jitomate, brócoli, cebolla, chile, calabaza, papa, aguacate, agave, nopal. Querétaro: fresa, jitomate, brócoli, cebolla, chile, aguacate, nopal (sin agave, papa ni calabaza). Por eso las parcelas de Celaya, Salamanca, Irapuato, Dolores, centro de Celaya (Gto.) tienen el primer grupo; Querétaro, El Marqués, San Juan del Río y Amealco el segundo; Guadalajara, ninguno. Nota: la fresa SÍ está en `siap_resumen.json` de Querétaro; el coordinador dijo que `/api/frutales` no la muestra (límite conocido), el script lo verifica con `--frutales` cuando exista la ruta (no estaba en esta rama, no se pudo ejecutar). `server/llm/modelo.js` (agente/ml) tampoco está en esta rama.

# 12 · Recomendador provisional y simulación de ingresos

**Qué:** `server/llm/recomendador.js`. Recomienda cultivos y una rotación de 3 años y simula el ingreso con **datos reales del SIAP 2018-2024** (por estado). Está conectado a `POST /api/asistente`. **No** toca `server/engine/` ni `/api/recomendar` (siguen siendo del equipo); la respuesta de `recommend()` sigue la forma de `/api/recomendar` de `docs/api-contract.md` para poder cambiarlo después.
**Para qué:** que el chat pueda contestar "¿qué me conviene sembrar?" aunque el motor del equipo todavía no exista, y dar una idea de riesgo y de ingresos.

## Cómo decide
1. **Candidatos:** cultivos del proyecto con ≥ 5 años de datos y al menos 2 % de la superficie de ese ciclo en el estado (así no sale un cultivo casi sin siembra, como garbanzo de temporal). Temporal = primavera-verano sin riego; riego = primavera-verano y otoño-invierno.
2. **Puntaje (0-100)** según la prioridad del agricultor: ingreso bruto por hectárea, riesgo (años con pérdidas > 10 % y el peor año), leguminosa (suelo) y tolerancia a la sequía (solo sorgo y garbanzo altos, maíz bajo: lo que quedó verificado en las tarjetas).

| Prioridad | Ingreso | Riesgo | Suelo | Agua |
|---|---|---|---|---|
| ganar | 70 % | 20 % | 5 % | 5 % |
| riesgo | 20 % | 60 % | 10 % | 10 % |
| suelo | 20 % | 20 % | 50 % | 10 % |
| agua | 20 % | 25 % | 5 % | 50 % |

3. **Rotación de 3 años:** no repite cultivo ni familia en temporadas seguidas ni en la misma temporada el año anterior, y lleva al menos una leguminosa.
4. **Predicción (simulación):** 2,000 simulaciones que eligen al azar años reales del SIAP para los 3 años de la rotación. Da ingreso bruto esperado por hectárea, un caso malo (peor 10 %), uno bueno (mejor 10 %) y la probabilidad de al menos un año con pérdidas > 10 %. Si el agricultor manda `costos` por cultivo (pesos por hectárea y ciclo), calcula la ganancia y la probabilidad de perder dinero. El resultado se repite igual en cada corrida (semilla fija).

## Cómo responde
`POST /api/asistente` con "¿Qué me conviene sembrar?":
- Falta `agua` → responde con `preguntar: { campo: "agua", opciones: [Solo lluvia, Tiene riego] }` (botones en el front).
- Falta `prioridad` → pregunta con 4 botones (ganar más, cuidar el suelo, gastar menos agua, arriesgar menos).
- Con los dos: el **texto lo arma el código**, no el modelo (`origen: "motor"`), y viene `recomendacion` con el detalle para tarjetas.
- Si ya dijo `agua` y `prioridad`, cualquier otra pregunta lleva el resultado en la ficha y el modelo puede explicarlo ("¿por qué trigo en otoño-invierno?").

Ejemplo real (temporal, Guanajuato, "arriesgar menos"): sorgo, frijol, sorgo; ingreso bruto esperado ~ $32,000 por ha en 3 años; en 30 de cada 100 casos hay al menos un año con pérdidas mayores al 10 %. (Querétaro, temporal: pérdidas en 87 de cada 100 casos y solo ~ $11,000 por ha.)

## Cómo probar
`npm test` (61 pruebas, con datos sintéticos y con los reales). En `/probar` el recomendador aún no tiene botones: probar con `POST /api/asistente` y `{ "pregunta": "¿Qué me conviene sembrar?", "agua": "temporal", "prioridad": "riesgo" }`.

## Problemas que encontré al probar con datos reales (y cómo los traté)
- **El jitomate salía primero con "$2.8 millones por hectárea".** Es dato real del SIAP (el jitomate suele ser agricultura protegida), pero sin costos no se puede comparar con granos y aconsejarlo sería irresponsable. **Hortalizas (jitomate, brócoli) excluidas por defecto**, y la respuesta lo avisa.
- **La rotación repetía el mismo cultivo cada año en la misma temporada** (maíz en primavera-verano, frijol en otoño-invierno, otra vez). Arreglado y con prueba.
- **Aparecía garbanzo de temporal** (1,500 ha) como uno de los mejores. Se descarta por tener menos del 2 % de la superficie.
- **"0 de cada 100 casos de pérdida"** sonaba a seguro. Ahora dice "en los 7 años de datos no se vio ninguno… aunque eso no garantiza que no pase".

## Límites (importan)
- **Ingreso bruto, no ganancia.** No incluye costos (semilla, fertilizante, mano de obra…); no hay una fuente confirmada en México. Solo hay ganancia si el agricultor manda sus costos.
- **Precios de cada año, sin inflación.** Los precios subieron mucho de 2018 a 2024; mezclar años distorsiona.
- **Solo 7 años por estado**, no por parcela ni por municipio. No usa el clima ni el suelo de la parcela: **todavía no es un modelo de predicción con aprendizaje automático** (ver `docs/ml-plan.md`), es estadística de datos pasados.
- **No predice el clima:** el simulador solo repite años que ya pasaron.
- **El estado se supone por la longitud** (≥ -100.45 = Querétaro) si el front no lo manda; puede fallar cerca del límite. Lo correcto es preguntárselo al agricultor (`estado` en la petición).
- Querétaro de temporal sale casi siempre con riesgo muy alto; es lo que muestran los datos (pérdidas de 26 % a 42 % en varios años), no un error.
- La tolerancia a la sequía solo se conoce para sorgo, garbanzo y maíz; el resto usa un valor neutro.
- **Provisional:** si el motor del equipo llega, este se reemplaza o se compara con él. Costos de hortalizas, invernadero y fertilizantes siguen pendientes.

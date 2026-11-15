# 20 · Varias parcelas a la vez y corroboración con NASA

## Varias parcelas
**Qué:** `POST /api/asistente` acepta `parcelas: [{ id, hectareas, ultimo_cultivo? }]` (máx. 20). Con **2 o más**, "¿Qué me conviene sembrar?" las analiza juntas (`recommendFarm`, `explainFarm` en `server/llm/recomendador.js`).
**Cómo decide:**
1. Cada parcela recibe su rotación de 3 años (mismas reglas: no repetir cultivo ni familia, una leguminosa), respetando su último cultivo.
2. Las parcelas **evitan empezar el primer año con los mismos cultivos** que las anteriores, para repartir el riesgo.
3. Se simula **toda la finca**: 2,000 simulaciones con años reales y el **mismo año de clima para todas las parcelas** (llueve o no llueve en todas a la vez). Da ingreso bruto esperado total, caso malo y bueno, la probabilidad de que alguna parcela tenga pérdidas altas y la de que **la mitad o más del terreno pierda el mismo año**.
4. Se compara contra sembrar en todas lo mismo que en la parcela 1.
**Resultado real** (Guanajuato, temporal, "arriesgar menos", 1.7 y 3 ha): parcela 1 sorgo-frijol-sorgo y parcela 2 cebada-frijol-sorgo; ~ $141,600 de ingreso bruto en 3 años (de $112,300 a $170,800); el caso malo si sembraras todo igual sería $117,000 (mejor que el repartido en esta corrida).
**Honestidad:** repartir cultivos **no siempre baja el riesgo** (aquí no bajó): como las pérdidas vienen de la sequía y esta pega a todos los cultivos el mismo año, el riesgo conjunto cambió poco. La respuesta lo dice. El botón flotante ya manda las parcelas dibujadas.

## Corroboración con NASA
**Qué:** `server/llm/corroboracion.js`. Compara, para el primer cultivo de la rotación en temporal, los **años secos de NASA POWER en tu parcela** con los **años de pérdidas altas (> 10 % de superficie siniestrada) del SIAP** en tu estado, de 2018 a 2024. La respuesta del recomendador la agrega con fuentes `[NASA POWER, SIAP]` y la devuelve completa en `corroboracion` (con el detalle año por año).
**Qué se encontró (datos reales, lluvia de Celaya):**
- Maíz Guanajuato: relación lluvia-pérdidas **−0.70**; solo 2023 coincide (seco y con 27 % de pérdidas). 2020 y 2022 son secos en NASA pero sin pérdidas altas en el SIAP.
- Frijol Guanajuato: **−0.79**; 2020 y 2023 coinciden.
- Para Querétaro la prueba usó la lluvia de Celaya (no de Querétaro): solo era para ver el cálculo.
**Límites:** 7 años y 7 puntos; el SIAP es por estado y NASA es por parcela; la "pérdida" del SIAP incluye heladas, plagas, etc.; con relación débil (> −0.3) el texto dice que no se ve relación clara. Solo se calcula en temporal (con riego las pérdidas no dependen de la lluvia).
**Cómo probar:** `npm test` (80 pruebas) y `POST /api/asistente` con `{"pregunta":"¿Qué me conviene sembrar?","perfil":{"agua":"temporal","prioridad":"riesgo"},"parcelas":[{"id":1,"hectareas":1.7},{"id":2,"hectareas":3}]}`.

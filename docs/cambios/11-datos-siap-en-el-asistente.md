# 11 · Datos del SIAP dentro del asistente

**Qué:** el script `server/scripts/siap-descargar.js` bajó de forma **completa** los CSV municipales del SIAP de 2018 a 2024 (7 años, validados por tamaño y por número de estados) y generó `server/data/siap_resumen.json` (75 KB, Guanajuato y Querétaro, 8 cultivos del proyecto). Nuevo `server/llm/siap.js` mete esos datos en la ficha cuando la pregunta menciona un cultivo.
**Para qué:** que el asistente conteste con datos oficiales de rendimiento, pérdidas y precio, no solo con definiciones.

**Cómo responde (pruebas en vivo, con el modelo local):**
- "¿Cómo le va al maíz de temporal en Guanajuato?" → "188569 hectáreas… rendimiento promedio de 1.74 toneladas por hectárea… pérdida promedio del 5.4 %… 1 año con pérdida mayor al 10 % en 2023 [SIAP]".
- "¿Qué tan riesgoso es el maíz de temporal en Querétaro?" → "pérdida promedio del 21.4 %, años con pérdidas mayores al 10 %: 2019, 2020, 2022 y 2023 [SIAP]".
- "¿A cuánto se vende el frijol?" → "16463 pesos por tonelada en Guanajuato [SIAP]".
- "¿Cuántos años fue riesgoso el frijol de temporal?" → "2 años" (2020 y 2023, coincide con los datos).

Comprobé a mano que estos números coinciden con el JSON (por ejemplo, Querétaro: pérdidas de 4.2, 33.3, 25.8, 6.9, 30.8, 41.7 y 6.9 % → promedio 21.4 %).

**Qué contiene el resumen:** por estado, cultivo, ciclo (primavera-verano / otoño-invierno), modalidad (riego / temporal) y año: superficie sembrada, cosechada y siniestrada, volumen, rendimiento (volumen ÷ cosechada) y precio medio rural ponderado por volumen. El asistente recibe, por estado, los dos ciclo/modalidad con más superficie.

**Dato interesante para el modelo de riesgo:** la superficie siniestrada de maíz de temporal en Querétaro llegó a 33 % en 2019 y 42 % en 2023; en Guanajuato fue 27 % en 2023 y cercana a 0 en varios años. Es una medida **real** de pérdidas que se puede cruzar con el clima de NASA. Ojo: los años secos que marca NASA POWER en Celaya (2020, 2022, 2023) **no** coinciden del todo con las pérdidas del SIAP (en 2022 Guanajuato reporta 0 %), así que no se debe prometer una relación directa sin analizarla.

**Problema encontrado y arreglado:** el modelo dijo "2 años con pérdida mayor al 10 %, que son 2023" (era 1). El verificador no lo detecta porque deja pasar números ≤ 3. Ahora los datos traen `cantidad_de_anios_con_perdida_mayor_10_pct` y el modelo la copia bien.

**Cómo probar:** `npm test` (50 pruebas) y en `/probar` las preguntas de arriba. Para regenerar los datos: `cd server; node scripts/siap-descargar.js 2018 2024` (salta los años ya bajados; los CSV crudos no se suben al repo).

**Límites**
- **"Siniestrada" es la superficie dañada por clima u otras causas** (sequía, helada, plagas…): no es solo sequía.
- Los datos son **por estado**, no por parcela ni por municipio; el asistente no sabe en qué estado está la parcela, por eso muestra Guanajuato y Querétaro.
- Los precios son **precio medio rural** (lo que recibe el productor), en pesos por tonelada, de un solo año (el último).
- Solo 7 años (2018-2024) y 8 cultivos. El jitomate sale del SIAP como "Tomate rojo (jitomate)".
- El verificador sigue sin detectar números ≤ 3 mal puestos.
- La descarga del SIAP fue lenta e irregular al principio y luego rápida (cada año tardó segundos); puede volver a cortarse.

# 28 - Frutas y verduras: ¿se da aquí? y desglose

Pedido: que el asistente conteste con más datos y más desglose sobre las frutas (y verduras) que se pueden sembrar en Guanajuato y Querétaro. Pocos cultivos, bien hechos.

## Qué se agregó
- **Tema `aptitud`** ("¿puedo sembrar fresa aquí?", "¿qué frutas se dan en mi parcela?", "¿se da el aguacate en Querétaro?"). Compara los rangos de clima del cultivo con el clima real de la parcela (NASA POWER) y contesta con tres niveles: **se da bien**, **se da con cuidados** o **es difícil**, con la razón en una frase, la fuente y las hectáreas que reporta el SIAP. Si hay pH del suelo (SoilGrids), también lo compara.
- **Tema `desglose`** (superficie, riego, municipios, pérdidas, cambio de precio, tiempo para dar fruta, ficha completa) por cultivo y estado, con datos del SIAP 2018-2024.
- Archivos nuevos: `server/llm/aptitud.js`, `server/llm/desglose.js`, `server/data/aptitud_cultivos.json`, `server/data/desglose_cultivos.json`, `server/data/frutas_ml_resultados.json`, `server/scripts/{aptitud-generar,desglose-generar,frutas-ml,evaluar-frutas}.js`, `server/test/aptitud.test.js`, `server/test/eval/frutas.json`.
- Cambios pequeños en lo que ya existía: un gancho en `respuestas.js` (2 imports, 2 líneas de detección, 2 redactores), `routes/asistente.js` (pide el suelo para `aptitud` y no pide clima para `desglose`) y `temas.js` (dos grupos de preguntas sugeridas).
- Cultivos (18): fresa, aguacate, uva, durazno, guayaba, tuna y nopalitos, limón, naranja, manzana, arándano, frambuesa, nuez, espárrago, jitomate, chile, cebolla, papa y brócoli.

## Fuente de los requisitos de clima (verificada con una petición real)
- **FAO EcoCrop** (temperatura ideal y que aguanta, lluvia, pH, temperatura que mata a la planta en reposo, días del ciclo). La página original `ecocrop.fao.org` respondió **503** el 2026-11-14 (también sin copia en archive.org), así que los valores salen de una **copia pública del scrape de EcoCrop**: <https://raw.githubusercontent.com/supersistence/EcoCrop-ScrapeR/HEAD/cropbasics_scrape.csv> (2568 fichas). Cada cultivo guarda el enlace a su ficha en FAO (por ejemplo <https://ecocrop.fao.org/ecocrop/srv/en/dataSheet?id=1112> para la fresa) y el script `aptitud-generar.js` comprueba que el id corresponda al nombre científico.
- `verificado: true` en los 18 cultivos quiere decir "el valor está en la copia de EcoCrop"; **no** quiere decir que se comprobó contra la página de FAO (estaba caída) ni contra una ficha de INIFAP. Si FAO vuelve, conviene re-verificar.
- Los rangos son de la especie en general, no de una variedad ni de México. La lluvia de EcoCrop es por ciclo de cultivo; aquí se compara con la lluvia anual (aproximación).

## Cómo decide el nivel (regla simple, escrita en `aptitud.js`)
- Temperatura: se cuentan los meses con temperatura media dentro del rango ideal y los que salen del rango que aguanta. Perennes: necesitan 6 meses ideales o más para "bien" (3 a 5: con cuidados; menos: difícil). Anuales: basta una temporada de 3 meses (se dice cuáles son).
- Helada: solo si EcoCrop trae la temperatura que mata a la planta. Si la hora más fría del año, en promedio, la pasa: difícil; si solo la helada récord la pasa: con cuidados. Si EcoCrop no la trae: "no verificado".
- Lluvia anual: menos del mínimo = con cuidados (necesita riego); más del máximo = difícil.
- pH del suelo (si se tiene): a más de 1 unidad fuera de lo que aguanta = difícil; menos = con cuidados.
- El nivel final es el peor de los cuatro. **Es una regla mía, no un resultado de EcoCrop ni de INIFAP.**
- Sobre Celaya (fixture NASA 2000-2024, 17.5 °C y 663 mm, con el pH 7.4 de su suelo): se dan bien fresa, limón, manzana, frambuesa, nuez, espárrago, jitomate, cebolla y brócoli; con cuidados aguacate, uva, durazno, guayaba, tuna, naranja, chile y papa; difícil el arándano (pH 7.4 del suelo contra 4 a 5 ideal). Sin el pH, aguacate y chile saldrían "se dan bien" y el arándano "con cuidados".

## Lo que NO se pudo verificar (el asistente lo dice como "no verificado")
- **Tiempo para que dé fruta** de los frutales, costos de establecer, calendario de siembra: no hay fuente verificada (ver `docs/fuentes-de-datos.md`). Para verduras de un año sí se da el ciclo de EcoCrop (jitomate 70-150 días, chile 60-180, cebolla 85-175, papa 90-160, brócoli 80-120), con la aclaración de que depende de la variedad.
- **Horas de frío** de manzana, durazno, uva, nuez, arándano y frambuesa: EcoCrop no las trae.
- Cuánto frío aguanta fresa, tuna, jitomate, chile y cebolla: EcoCrop no trae la temperatura mortal.
- Mango, papaya, café, zanahoria, lechuga, etc. (cultivos que se preguntan pero no están en la lista): "no verificado", sin inventar.
- El SIAP no separa campo abierto de invernadero (jitomate y chile en Querétaro rinden 289 y 62 t/ha, probablemente protegidos); el texto lo avisa.
- Pérdidas 0 % no quiere decir que nunca se pierda: el SIAP solo cuenta lo que se reporta.

## Aprendizaje automático (`scripts/frutas-ml.js`, resultados en `frutas_ml_resultados.json`)
64 municipios con clima NASA propio, siembra 2024 del SIAP, validación dejando un municipio fuera. Resultado: **no se integró nada al asistente**.

| Idea | Línea base | Resultado | ¿Integrar? |
|---|---|---|---|
| A. La regla de aptitud separa municipios donde sí se siembra el cultivo de donde no | azar (AUC 0.5) | AUC 0.57 en conjunto; por cultivo entre 0.27 y 0.55 (uva 0.27). En los municipios del Bajío el clima es casi igual y la regla da el mismo nivel a casi todos | No (la regla no se puede validar con la siembra: la siembra depende del riego, del mercado y de la costumbre) |
| B. Municipio nuevo: ¿se siembra el cultivo ahí? 5 vecinos por clima | frecuencia del estado | Brier 0.176 contra 0.178 (empate); gana en 7 de 16 cultivos (brócoli 0.186 contra 0.235, cebolla 0.200 contra 0.229, espárrago 0.201 contra 0.251) y pierde en el resto | No (ganancia general mínima; escoger solo los cultivos donde ganó sería elegir después de ver los resultados) |
| C. Municipio nuevo: rendimiento con 5 vecinos | promedio del estado | Gana en 6 de 14 cultivos y pierde en 8 (tuna y durazno mucho peor) | No |

Se suma a lo de `docs/cambios/26-ml-segunda-ronda.md`: con 7 años de SIAP no se predice rendimiento ni precio de frutales y hortalizas mejor que repetir el año anterior. **Con estos datos no se puede** predecir dónde se daría una fruta ni cuánto rendiría en un municipio nuevo mejor que el promedio.

## Evaluación (`server/test/eval/frutas.json`, 32 preguntas; `node scripts/evaluar-frutas.js --url http://localhost:3063`)
20 de desarrollo y 12 de prueba que no se tocaron hasta el final. Hay variantes de redacción ("oye y el arándano crece por acá?"), trampas (mango y café sin dato, "cuánto tarda en dar fruta", naranja en Guanajuato donde el SIAP no la registra) y controles de lo que ya funcionaba. Las respuestas se revisan con los mismos criterios de `evaluar-asistente.js` (palabras que deben salir o no, fuentes citadas, máximo 90 palabras).

| | Antes (rama sin cambios) | Después |
|---|---|---|
| Desarrollo (20) | 4/20 | 20/20 |
| Prueba (12) | 0/12 | 11/12 al primer intento; 12/12 después de arreglar un detalle |

El fallo de la prueba: "¿Cómo ha cambiado el precio de la nuez?" no se detectaba (la palabra "cambiado" iba antes de "precio"); se corrigió la expresión y se agregó a las pruebas, así que ese 12/12 ya no es a ciegas. En desarrollo, dos expectativas (aguacate y arándano) se cambiaron después de ver que con el pH real del suelo (7.4) el nivel correcto es "con cuidados" y "difícil", no "bien".
Evaluación anterior (`preguntas.json`, sin internet): 55/55 antes, 54/55 después; la pregunta 52 "¿Puedo sembrar fresas?" esperaba "no tengo información" y ahora responde con la aptitud (es justo lo pedido). Hay que cambiar esa expectativa al juntar ramas.
Pruebas: `cd server && node --test` pasa 129 (119 anteriores + 10 nuevas); se cambiaron dos expectativas de pruebas viejas: "¿Puedo sembrar fresas?" y "¿Qué frutas puedo sembrar?" ahora son del tema `aptitud` (antes `cultivo` y `frutales`).

## Límites
- La comparación es contra el clima de un punto de NASA POWER (celdas de ~50 km) y rangos generales de FAO: orienta, no garantiza. Ni el riego, ni el manejo, ni las variedades están en la regla.
- Las temperaturas mínimas de NASA son de una hora del mes (no promedios del día): sirven para heladas, no para ajustar cultivos finamente.
- Con SoilGrids lento o sin internet, el pH se omite después de 4 segundos y la respuesta sale sin él.
- El SIAP de frutales cuenta la superficie establecida, que incluye árboles aún sin producir.

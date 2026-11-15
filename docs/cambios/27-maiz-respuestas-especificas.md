# 27. Respuestas específicas del maíz (más desglose, sin tarjetas que no vienen al caso)

Rama `agente/maiz`. Fecha: 14 nov 2026.

## Qué pasaba
Tres preguntas reales sobre maíz salieron mal:
1. «¿Recomiendas plantar maíz este año o ya me espero al siguiente?» -> recomendación genérica (sorgo, cebada, frijol); nunca habló del maíz.
2. «¿Qué tan rápido crece el maíz en mi parcela?» -> una tarjeta que no responde («se planta al empezar las lluvias»).
3. «¿Cuánto maíz puedo producir en mi parcela?» -> solo promedios por estado, sin usar las hectáreas ni dar rangos.

## Qué cambió
- **`server/llm/maiz.js` (archivo nuevo, todo el maíz está aquí).** Detecta la intención por palabras (sin acentos, con faltas de ortografía de una letra, frases largas) y redacta la respuesta con el código. Cada respuesta es un titular de una frase y 2-4 frases cortas con la fuente. Los números salen de los datos y pasan por el verificador.
- Intenciones: producción en mi parcela, decisión «¿siembro este año?», ciclo/rapidez, precio e ingreso por hectárea, precio por mes (no existe), riesgo y años con pérdidas, riesgo por poca lluvia, riego vs temporal, maíz contra sorgo/frijol/etc., dónde se siembra más, rotación (frijol antes del maíz), dos ciclos al año, cuánta agua necesita, suelo, y honestas «no tengo» (semilla, seguro, costos, plagas y abonos).
- **Producción:** toneladas por hectárea sembrada (cuenta las pérdidas), promedio y peor/mejor año 2018-2024, por temporal y riego; con hectáreas (`perfil.hectareas`, o la suma de varias parcelas dibujadas) calcula el total y el rango para su superficie; añade el municipio más cercano (SIAP por municipio) y los municipios con clima parecido (`similarMunicipalities`). Siempre dice que son promedios, no de su parcela.
- **Decisión:** no da una orden. Pregunta primero «¿riego o temporal?» si falta. Con temporal da el daño estimado por escenario de lluvia (`riesgoPorEscenarios`), la probabilidad de año malo (`predictBadYear`), cuántos de 7 años tuvieron pérdidas altas, y dice que la lluvia de la temporada no se puede pronosticar con estos datos. Con riego dice que depende del agua y del costo, y que no hay costos.
- **Ciclo:** la FAO (FAO-56, Tabla 11, https://www.fao.org/4/x0490e/x0490e0b.htm; la página se abrió y se leyó) da 125 días (Nigeria, India), 150 (abril en España y California) y 180 (África oriental) para maíz de grano, con etapa inicial de 20 a 30 días. Son climas distintos al Bajío: la respuesta lo dice y manda a INIFAP o al técnico. No encontré una fuente verificable del ciclo de las variedades del Bajío.
- **Nunca una tarjeta que no responde:** una pregunta de maíz que no se entiende ya no llega a las tarjetas ni a Wikipedia; contesta «No tengo ese dato» y propone 3 preguntas que sí sabe contestar. Las tarjetas solo se usan cuando sí responden (rotación frijol->maíz, plagas -> técnico, «cuánta agua»: la sensibilidad al florear, aclarando que la cantidad en mm no está verificada).
- Heladas del maíz van al tema de heladas (NASA POWER), ya no al modelo de lluvia. «¿Qué siembro después del maíz?» toma el maíz como último cultivo del recomendador.
- **Trampas de número:** «¿Verdad que rinde 8 t/ha?» -> «No: según el SIAP no es 8…».
- `server/scripts/maiz-municipios.js` resume el maíz por municipio desde los CSV crudos del SIAP (solo lectura) y escribe `server/data/maiz_municipios.json` (64 municipios, 29 KB).
- `riesgo-clima.js` ahora también devuelve `mediana` y `tempPV` (los usa la probabilidad de año malo).
- Gancho en `routes/asistente.js`: un bloque nuevo antes del recomendador. Para otro cultivo del SIAP basta cambiar `CULTIVO` y los alias de `intencionMaiz`; los modelos entrenados solo existen para maíz.

## Evaluación honesta
`server/test/eval/maiz.json` (40 preguntas: 3 originales, variantes mal escritas, trampas de número y preguntas sin dato) y `server/scripts/evaluar-maiz.js` (llama al servidor real; pasa si cumple `incluye`, `excluye`, `cita`, titular de 25 palabras o menos y 110 palabras o menos). 30 de desarrollo y 10 de prueba que no se miraron hasta el final.

| | Antes | Después |
|---|---|---|
| 30 de desarrollo | 2/30 | 30/30 |
| 10 de prueba (primera corrida) | 1/10 | 6/10 |
| 10 de prueba, tras corregir lo que falló | - | 10/10 (ya no cuenta como medida limpia) |

La cifra honesta de generalización es **6/10**. Fallaron: «año bueno o malo» (la palabra «ciclo» lo mandó a la duración del ciclo), «tonelada de riego» y «peor año de temporal» (la palabra riego/temporal los mandó a la comparación) y «maíz o frijol, ¿cuál deja más dinero?» (ganó la intención de precio). Se corrigieron, pero esas 4 ya no sirven como prueba; hace falta escribir preguntas nuevas.

Las 32 preguntas de agricultor (`maiz-preguntas-agricultor.json`, perfil temporal, 3 ha, antes frijol): antes 12 bien / 7 a medias / 13 mal; después, a mi juicio leyendo cada respuesta, 28 bien / 4 a medias / 0 mal, y de ~10 s a unos milisegundos (ya no pasan por el modelo de lenguaje). A medias: «¿cuántas semillas por hectárea?» (dice que no tiene el dato, sin hablar de la cantidad), «¿qué siembro después del maíz?» (el plan empieza con frijol, pero la lista de arriba aún pone sorgo primero porque el ranking no excluye la familia del último cultivo), «¿qué pasa si llueve poco?» (sin la palabra «maíz» no sabemos de qué cultivo habla; no usamos el historial) y «¿dónde se da mejor?» (da superficie y riego vs temporal, no los municipios que más rinden).

## Límites honestos
- Son promedios del estado y de pocos municipios (Celaya solo tiene datos 2021-2024), no de la parcela. «Pérdida» incluye heladas, plagas y otras causas.
- Con 7 años de datos el rango peor/mejor es corto: un año peor puede venir.
- El modelo de riesgo es mejor en Guanajuato que en Querétaro (lo dice el propio modelo); la respuesta solo da la cifra, no la confianza.
- No hay ciclo verificado para el Bajío, ni agua en mm, ni rangos de suelo, ni variedades, ni costos, ni seguros: se dice y se manda a INIFAP, al técnico o a la aseguradora.
- La detección es por palabras y raíces (una letra de error), no entiende cualquier frase; sin la palabra «maíz» (o milpa, mazorca, elote, cogollero) no entra a este módulo.
- Las tarjetas irrelevantes se evitan solo en preguntas de maíz; el mismo filtro para otros cultivos falta.

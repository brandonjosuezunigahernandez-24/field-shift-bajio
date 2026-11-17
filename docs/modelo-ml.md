# El modelo de aprendizaje automático: cómo funciona, pruebas y resultados

> Versión 1 (14 nov 2026).

## En una frase
Un modelo aprendió, con datos de **64 municipios** de Guanajuato y Querétaro, **cuánta superficie de maíz de temporal se daña según cuánto llovió en el verano**. El asistente lo usa para decir: «en un año seco el daño estimado es X %, en uno normal Y %, en uno lluvioso Z %». **No pronostica el clima ni dice qué va a pasar este año.**

## Cómo funciona (paso a paso)
1. **Datos para aprender (7 años × 64 municipios):**
   - Lo que pasó en cada municipio: superficie sembrada y **superficie siniestrada** (dañada), del SIAP, 2018-2024.
   - Lo que llovió y la temperatura de cada municipio en cada verano, de NASA POWER.
   - Resultado: **1,018 filas** (municipio × año × cultivo).
2. **Qué aprende:** la relación entre la lluvia del verano (comparada con lo normal del lugar) y el % de superficie dañada. Es una regresión sencilla (*ridge*), explicable: los coeficientes dicen que a más lluvia, menos daño.
3. **Cómo se sabe si sirve:** se compara contra una **línea base ingenua**, el promedio histórico del municipio. Si no le gana, el modelo **no se usa** (devuelve «no disponible»).
4. **Cómo se prueba:** dejando años fuera. Dos pruebas: (a) entrenar con 2018-2022 y probar con 2023-2024; (b) «un año fuera»: entrenar sin un año y probar con ese, repitiendo con cada año.
5. **Cómo lo usa el asistente:** para la parcela, toma los 25 años de lluvia de NASA, saca tres lluvias (año seco = la que se pasa solo 1 de cada 10 años, año normal, año lluvioso) y le pregunta al modelo el daño de cada una. El texto lo escribe el código, no el modelo de lenguaje, con el aviso «no es un pronóstico».

## Resultados de las pruebas
Error promedio en puntos porcentuales de superficie (menos es mejor).

| Cultivo y estado | Promedio histórico | Modelo | Mejora (un año fuera) | ¿Se usa? |
|---|---|---|---|---|
| **Maíz, Querétaro** | 30.4 | **21.6** | **29 %** (R² 0.34) | **Sí, confianza media** |
| Maíz, Guanajuato | 11.2 | 10.8 | 3.5 % (R² 0.13) | Sí, **confianza baja** (con aviso) |
| Sorgo, Guanajuato | 2.5 | 2.3 | 7.5 % (R² negativo) | No (no se conectó) |
| Frijol (ambos estados) | — | peor que el promedio | negativa | No |
| Rendimiento (t/ha), todos | — | igual o peor | — | No |

Con la otra prueba (2023-2024 que el modelo no vio), el maíz de Querétaro baja el error de 31.8 a 21.8 puntos.

**Qué significa:** en maíz de Querétaro el modelo sí aprendió algo útil del clima. En Guanajuato casi no mejora al promedio. Para frijol, sorgo y el rendimiento **no hay modelo que sirva todavía**, y está bien decirlo.

## Lo que contesta el asistente (corridas reales de hoy)
Pregunta: «¿Qué tan riesgoso es el maíz de temporal con la lluvia?»
- **Querétaro** (confianza media): año seco, 398 mm de lluvia de verano → cerca de **27 %** de superficie dañada; normal, 529 mm → cerca de **13 %**; lluvioso, 670 mm → cerca de **0 %**. Agrega que en pruebas dejando un año fuera el error baja 29 %.
- **Guanajuato** (confianza baja): seco → cerca de **10 %**; normal → **3 %**; lluvioso → **0 %**. Agrega: «la mejora es pequeña (3 %) y el SIAP no reporta pérdidas en varios años; tómalo solo como una referencia».
- Solo se activa con **maíz** y palabras de riesgo o lluvia. Para frijol u otros cultivos el asistente sigue con los datos del SIAP y del clima, sin este modelo.

## Pruebas automáticas
- Las pruebas del modelo: `server/test/modelo.test.js` (predicción, «no disponible» donde no supera al promedio) y `server/test/riesgo-clima.test.js` (5 pruebas: tres escenarios y más lluvia = menos daño; siempre dice «no es un pronóstico»; confianza media en Querétaro y baja en Guanajuato; solo maíz; sin clima suficiente devuelve nada).

## Límites (importan)
- **Solo 7 años.** Un año raro mueve todo.
- **El SIAP de Guanajuato parece reportar las pérdidas «todo o nada».** Lo comprobé en los datos: en 2021, 2022 y 2024 **ninguno de los 46 municipios** reporta ni una hectárea siniestrada de maíz de temporal; en 2023 lo hacen 36 de 46 y en 2019, 20. Parece un hábito de captura más que años sin pérdidas, y por eso el modelo casi no aprende en Guanajuato.
- **«Siniestrada» incluye heladas, plagas y granizo**, no solo sequía.
- **Escalas distintas:** el SIAP es por municipio y NASA POWER es por cuadro de unos 50 km: parcelas cercanas comparten la misma lluvia (El Marqués y Celaya dieron los mismos 398/529/670 mm).
- Las variables se eligieron con los mismos años con que se prueba: hay algo de optimismo.
- Las coordenadas de los municipios son el centro por geocodificación; no se revisaron una por una.

## Cómo reproducirlo
```
cd server
node --test                                           # todas las pruebas
SIAP_RAW_DIR=<carpeta con los CSV 2018..2024> node scripts/modelo-entrenar.js   # reentrena y reescribe data/modelo_*.json
```
Los CSV del SIAP se bajan con `node scripts/siap-descargar.js 2018 2024` (no van al repo).

## Qué sigue
Una **segunda ronda de investigación** está probando otras formas de usar aprendizaje automático con estos datos (clasificar «año malo», más variables de NASA, intervalos de incertidumbre, hortalizas y frutales, municipios parecidos).

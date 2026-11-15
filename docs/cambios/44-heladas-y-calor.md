# 44 · El motor cuenta los años con helada y con calor

## Por qué
El motor solo usaba la temperatura **media** y el único riesgo era el de años secos. Con riego, todos los cultivos
salían igual de seguros (`seguridad = 1`), porque no había ningún riesgo que los distinguiera.

NASA POWER ya nos daba `T2M_MIN` y `T2M_MAX` y no los usábamos en el motor. En la API mensual son **la hora más fría
y la más caliente de todo el mes**, no promedios diarios. Por eso no sirven para el ajuste de temperatura, pero sí
para contestar con sí o no, año por año: «¿este mes bajó de 2 °C?». Es el mismo enfoque del proyecto: contar años
reales, no promedios.

## Qué cambió
- **Datos** (`server/data/cultivos.json`): dos campos nuevos por cultivo, aproximados y sin verificar.

  | Cultivo | `helada_dano_c` | `calor_dano_c` |
  |---|---|---|
  | maíz | 2 | 35 |
  | sorgo | 2 | 38 |
  | frijol | 2 | 32 |
  | trigo | -2 | 32 |
  | cebada | -2 | 32 |
  | garbanzo | -2 | 35 |
  | brócoli | -2 | 30 |

  Para los cultivos de verano se usa 2 °C: con 2 °C de aire a 2 m ya suele haber helada a nivel de la planta, y el
  dato es el promedio de un cuadro de unos 50 km.
- **Motor** (`server/engine/index.js`):
  - `extremeTempRisk(crop, rows, temporada, inicio)`: por cada temporada real, dice si en algún mes del ciclo la hora
    más fría bajó al umbral o la más caliente lo alcanzó. Devuelve los años, el total y el récord (grados, mes y año).
    La temporada de otoño-invierno cruza diciembre: enero y febrero cuentan para la siembra del noviembre anterior.
  - `badYears(risk, extremos)`: años con algún problema (faltó lluvia, helada o calor). Un año con dos cuenta una vez.
  - **Puntaje:** `seguridad = 1 − años con algún problema / años`. Antes era `1 − riesgo de lluvia`. Los pesos no cambian.
  - **Mes de siembra:** ahora también con riego se prueban junio y julio en primavera-verano, porque el calor de
    junio cuenta aunque haya agua.
  - `razones`: una frase de helada y una de calor con los años reales y el récord, y una que junta los años con problema.
  - `estrategias[].resumen`: `riesgo_helada` y `riesgo_calor`. La evidencia y los beneficios los mencionan.
  - `incertidumbre`: tema nuevo `extremos`.
- **API** (`POST /api/recomendar`): cada cultivo trae `helada`, `calor` (`{ riesgo, anios, anios_total, umbral_c }`) y
  `riesgo_total`. **`riesgo` no cambió:** sigue siendo solo lluvia.
- **Pantallas:** la comparación lado a lado muestra «Temporadas con helada que daña» y «Temporadas con calor que
  daña»; la lista de cultivos y el veredicto de «Probar cultivo» dicen en cuántos años pasó.

## Qué sale en Celaya (20.47, -100.81), 2000 a 2024
- **Maíz** (junio a septiembre): calor de 35 °C o más en 3 de 25 años (récord: 36.2 °C en junio de 2024); ninguna
  helada. Juntando lluvia y calor tuvo algún problema en 13 de 25 años (antes contaban solo los 12 secos).
- **Frijol:** sembrado en junio le toca calor de 32 °C o más en 18 de 25 años; sembrado en julio, en 2. El motor lo
  pasa a julio, que coincide con la fecha de siembra del INIFAP para el Bajío.
- **Trigo, cebada y garbanzo** (riego, desde noviembre): helada de −2 °C o menos en 3 de 24 temporadas (récord:
  −2.7 °C en enero de 2006). Con riego ya no salen todos igual de seguros.

## Cómo probarlo
```
cd server && npm test     # 319 pruebas; las del motor están en test/engine.test.js
cd client && npm test
```
En la app: Celaya, temporal y «arriesgar menos»; luego lo mismo con riego. Las razones de cada cultivo y la
comparación de rotaciones muestran helada y calor.

## Límites
- Es la hora más fría y más caliente del **mes** en un cuadro de unos 50 km: no dice cuántos días heló, y una parcela
  en un bajo hiela más que eso.
- Los umbrales son aproximados (`"verificado": false`): falta confirmarlos con FAO Ecocrop o INIFAP.
- Cuentan igual en todo el ciclo. El calor daña sobre todo en floración; el motor no distingue etapas.
- La pantalla «Probar cultivo» sigue marcando año por año solo la lluvia.

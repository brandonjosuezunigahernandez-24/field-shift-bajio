# 26 - ML segunda ronda: qué sí y qué no se puede predecir

Se probaron 8 ideas con validación honesta y se reporta todo, también lo que no funcionó. Script: `server/scripts/ml2-explorar.js` (re-ejecutable, ~4 s, usa la caché de NASA POWER). Resultados completos: `server/data/ml2_resultados.json`. Código nuevo: `server/lib/logistic.js`, `server/lib/ml2Datos.js`, `server/llm/modelo2.js` (+ `test/modelo2.test.js`). No cambió `predictRisk`.

## Datos y validación
- Siniestro (ideas 1-4): 1174 filas municipio × año × cultivo, temporal primavera-verano, Guanajuato y Querétaro, ≥ 50 ha. Cultivos: maíz, sorgo, frijol, avena forrajera, garbanzo. "Año malo" = siniestrada > 10 % (prevalencia 15.8 %).
- Rendimiento y precio (ideas 5 y 7): 6355 casos municipio-cultivo-año de TODOS los cultivos de los dos estados (granos, hortalizas, frutales; riego y temporal). Precio = valor/volumen de producción.
- Validación: leave-one-year-out (LOYO) para siniestro; ventana creciente (entrena con años anteriores, prueba 2021-2024) para rendimiento y precio; leave-one-municipality-out para municipios parecidos. Las variables de cada comparación se fijaron antes de ver resultados y se reportan todas.

## Tabla

| # | Idea | Métrica contra línea base | ¿Integrar? | Por qué |
|---|---|---|---|---|
| 1 | Clasificar año malo (logística, ratio de lluvia + temperatura) | Brier 0.126 (prevalencia estado-cultivo) → **0.100**; Gto maíz 0.168 → 0.097; Qro maíz 0.264 → 0.221; Gto frijol 0.104 → 0.098; sorgo sin cambio (0.027). AUC 0.82 (la línea base no discrimina). Exactitud 0.85 vs 0.84 de "siempre no es malo": igual; precisión 0.58, recall 0.31 | **Sí, como probabilidad** | Mejora real en Brier y AUC; no sirve como sí/no con corte 0.5 (casi no detecta años malos). Calibración razonable: predicho 0.03/0.16/0.35/0.65 vs observado 0.05/0.12/0.43/0.58 |
| 2 | Más variables NASA (jul, ago, humedad de raíz, radiación, Tmax/Tmin) | Brier entre 0.100 y 0.104 con cualquier conjunto; quitar una variable del conjunto completo: 0.102-0.108 (solo quitar lluvia de agosto empeora, 0.103 → 0.108) | No | Con 7 años ninguna variable adicional aporta de forma detectable; la lluvia relativa basta |
| 3 | Conjunto (efecto de estado y de cultivo) vs separado | Brier: conjunto 0.100, por cultivo 0.101, separado 0.104, por estado 0.105 | Sí: usar el conjunto | Igual o poco mejor y más simple. Un solo modelo con dummies |
| 4 | Intervalos 80 % del % de siniestro (residuos de LOYO interno) | Cobertura 84 % (nominal 80), ancho 20 pts; intervalo ingenuo (cuantiles de la historia): 89 %, 23.7 pts. MAE 9.0 vs 10.9 | Sí, secundario | Ligeramente más estrecho y bien calibrado, pero 20 pts de ancho dice poco. Mejor mostrar la probabilidad de año malo |
| 5 | Rendimiento y precio con clima o con el año anterior | Error mediano de rendimiento: promedio del municipio 4.95 %, **año anterior 2.8 %**, modelo con clima 5.9 % (peor). Granos de temporal: 11.0 / 5.0 / 12.8 %. Precio: promedio 14.7 %, año anterior 5.3 % | Clima: no. Año anterior: solo mostrarlo | La lluvia no explica el rendimiento municipal en el SIAP (|r| < 0.12 entre la desviación del rendimiento y cualquier variable). "Lo mismo que el año pasado" gana, pero es persistencia, no aprendizaje. 59 % de los rendimientos cambian menos de 5 % de un año al siguiente |
| 6 | Municipios parecidos (k-means k=4 y 5 vecinos por clima normal) | Municipio nuevo, rendimiento de temporal: maíz MAE 0.66 t/ha (promedio estatal) → 0.38 (clúster) → **0.34** (5 vecinos); frijol 0.25 → 0.22 → 0.21; sorgo sin mejora; siniestro apenas (15.1 → 14.3 pts). Con historial propio sería 0.24 (maíz) | **Sí** | Ayuda a una parcela nueva a saber cuánto rinde un municipio "como el suyo". Ojo: los parecidos por clima también quedan cerca geográficamente, no se afirma causa |
| 7 | Hortalizas y frutales (fresa, jitomate, chile, cebolla, aguacate, uva, brócoli, espárrago, etc.) | Rendimiento: el modelo con clima pierde contra el promedio en casi todos (solo brócoli, nopalitos y sorgo de riego empatan o ganan por poco); el año anterior gana en todos (p. ej. aguacate 2.2 % vs 7.2 %, uva 2.0 % vs 10.3 %). Precio: año anterior 2-10 % vs 6-33 % del promedio. Series estatales: 7 puntos, 4 de prueba | No (ML) | Con 7 años es imposible aprender nada fiable; los rendimientos de estos cultivos son muy estables (variación de la serie estatal 2-18 %) y el precio se mueve 4-24 % sin relación con el clima local |
| 8 | Correlación cruda clima-rendimiento de temporal | |r| ≤ 0.12 en maíz, frijol y sorgo | No | Confirma que el rendimiento del SIAP no responde al clima municipal con estos datos |

## Recomendación (qué integrar primero)
1. **`predictBadYear`**: "probabilidad de que esta temporada termine con más de 10 % de siniestro dado el clima" (con el aviso de que no es pronóstico). Reemplaza o acompaña el % exacto de `predictRisk`, que es débil (excepto Querétaro maíz).
2. **`similarMunicipalities`**: "municipios como el tuyo" con su rendimiento medio de temporal, para parcelas nuevas.
Opcional y sin ML: mostrar el rendimiento y el precio del año anterior del municipio como referencia.

## Límites
- 7 años; Guanajuato reporta siniestro 0 casi en todos los municipios en 2021, 2022 y 2024: el "año malo" de Guanajuato se apoya en 2019 y 2023.
- La AUC agrupada incluye diferencias entre cultivos y estados, por eso es más alta que dentro de un solo cultivo.
- SIAP es municipal, NASA POWER puntual (~50 km); "siniestrada" incluye heladas, plagas y granizo.
- El modelo final se entrena con todos los años; las métricas son de LOYO (fuera de muestra), no del modelo final.

## Cómo reentrenar
`cd server && node scripts/ml2-explorar.js` (necesita `municipios.json`, la caché de clima y `SIAP_RAW_DIR`). Reescribe `ml2_resultados.json`, `modelo_ano_malo.json` y `municipios_clusters.json`.

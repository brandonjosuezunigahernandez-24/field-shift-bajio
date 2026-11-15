# 21 - Modelo entrenado (primera versión) de riesgo de siniestro por estado

Primer aprendizaje automático del proyecto. Estima el **riesgo de siniestro dado el clima de la temporada** (no pronostica el clima) para cultivos de temporal primavera-verano, con datos por municipio.

## Datos
- **SIAP municipal 2018-2024** (CSV crudos, no van al repo): maíz grano, frijol y sorgo grano, temporal, primavera-verano. Se descartan municipio-año con menos de 50 ha sembradas. Los CSV 2018-2020 traen otra cabecera (`Nomcultivo Sin Um`) y la tilde dañada; `server/lib/siapMunicipal.js` lo normaliza.
- **Coordenadas**: `server/data/municipios.json`, 64 municipios (46 Guanajuato, 18 Querétaro) geocodificados con Nominatim (OpenStreetMap) a 1 petición cada 1.2 s. 0 fallos.
- **Clima**: NASA POWER mensual de cada municipio (`scripts/clima-municipios.js`, pausa 1.5 s, caché). 64/64 sin fallos. Variables: lluvia jun-sep, lluvia relativa a la mediana 2000-2024 del propio municipio (`ratio`), temperatura media jun-sep, lluvia por mes, humedad de raíz.
- **Dataset**: `server/data/dataset_modelo.csv`, **1018 filas** municipio × año × cultivo (Gto: maíz 322, frijol 281, sorgo 217; Qro: maíz 126, frijol 69, sorgo no alcanzó el mínimo de filas).
- Objetivos: % de superficie siniestrada (siniestrada/sembrada) y rendimiento SIAP (t/ha cosechada).

## Modelos
Ridge (λ=10) en JS puro (`server/lib/ridge.js`), sin dependencias nuevas (no hay scikit-learn en esta máquina). Dos variantes por objetivo: base municipal + clima, o base estatal + clima; y 4 conjuntos de variables. Se elige por leave-one-year-out (LOYO), así que la selección ve todos los años; el holdout 2023-2024 se reporta con entrenamiento 2018-2022 pero con esa elección ya hecha (algo optimista).
**Línea base**: promedio histórico del municipio en los años de entrenamiento (del estado si no hay).

## Resultados (MAE; mejora = reducción del MAE contra la línea base)
| Estado / cultivo / objetivo | Holdout 2023-24 base → modelo | LOYO base → modelo | ¿Supera? |
|---|---|---|---|
| Gto maíz, siniestro (pts %) | 14.4 → 11.0 (+23%) | 11.2 → 10.8 (+3.5%) | sí, débil |
| Gto sorgo, siniestro | 3.51 → 3.40 (+3%) | 2.48 → 2.29 (+7.5%) | sí, débil (R² sigue negativo) |
| Gto frijol, siniestro | 5.6 → 9.4 (peor) | 6.4 → 7.6 (peor) | **no** |
| Qro maíz, siniestro | 31.8 → 21.8 (+32%) | 30.4 → 21.6 (+29%) | **sí** (R² 0.34 LOYO, 0.52 holdout; base: negativo) |
| Qro frijol, siniestro | 46.9 → 49.0 | 30.3 → 31.1 | no |
| Rendimiento (todos) | igual o peor | igual o peor | **no** |

Conclusión honesta: **solo Querétaro maíz mejora de forma clara**; en Guanajuato la mejora es pequeña. **El rendimiento no se puede predecir con clima mejor que el promedio del municipio** con estos datos. Frijol no supera la línea base. `predictRisk` solo responde cuando el modelo supera la línea base (si no, `disponible: false`).

## Límites
- Solo 7 años (2018-2024): el modelo ve pocas sequías/años húmedos distintos; un año raro mueve todo.
- **Guanajuato reporta siniestrada = 0 en casi todos los municipios en 2021, 2022 y 2024** (maíz: 2018 y 2020 casi cero, 2019 ~16% y 2023 ~28%); solo 2019 y 2023 muestran pérdidas grandes. Puede ser un hábito de captura del SIAP más que un año sin pérdidas; eso limita mucho lo que se puede aprender ahí.
- SIAP es municipal y NASA POWER es puntual (rejilla ~50 km, centro del municipio): se mezclan escalas.
- "Siniestrada" incluye heladas, plagas, granizo y otras causas, no solo sequía.
- Coordenadas por geocodificación (centro del municipio); no se revisaron una a una (solo rangos del estado).
- Selección de variables y de modelo con los mismos años que se evalúan (LOYO): hay algo de optimismo.

## Uso en Node
`import { predictRisk } from './llm/modelo.js'` → `predictRisk({ estado, cultivo, lluviaPV, medianaPV, tempPV })` devuelve `{ disponible, siniestro_pct, nivel, lluvia_relativa, validacion, aviso }`. Pruebas: `server/test/modelo.test.js`.

## Reentrenar
```
cd server
node scripts/municipios-geocodificar.js   # solo si cambian los municipios (reanuda lo ya hecho)
node scripts/clima-municipios.js          # baja/lee clima NASA de cada municipio
SIAP_RAW_DIR=<carpeta con los CSV 2018..2024> node scripts/modelo-entrenar.js
```
Reescribe `server/data/modelo_guanajuato.json`, `modelo_queretaro.json` y `dataset_modelo.csv`. Al llegar el SIAP 2025, agregar el año a `AÑOS` en el script y a `readSiapRows`.

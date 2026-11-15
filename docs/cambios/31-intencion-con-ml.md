# 31. Entender la pregunta con aprendizaje automático (respaldo del enrutado por palabras)

Rama `agente/intencion`. Fecha: 14 nov 2026.

## Qué pasaba
El asistente decide qué contestar buscando palabras clave (`respuestas.js` `detectarTema`, `maiz.js` `intencionMaiz`, `intencion.js`).
Con frases que nadie previó («como esta mi tierra», «cuando arranco la siembra del temporal», «maiz este año si o no») no encontraba
palabra y la pregunta se iba al modelo de lenguaje (que a veces inventa) o a «no tengo ese dato del maíz».

## Qué cambió
- **Conjunto etiquetado** `server/test/eval/intenciones.json`: **1094 preguntas, 220 grupos, 31 intenciones**. Salen de
  `server/test/eval/intenciones-semilla.txt` (escritas a mano; incluye casi todas las preguntas de `preguntas.json`, `maiz.json` y
  `maiz-preguntas-agricultor.json`, más variantes informales: «ps», «oiga», sin acentos, frases largas). `scripts/generar-intenciones.js`
  agrega a cada grupo 2 variantes con ruido (sin acentos ni signos; una letra mal + muletilla).
  Un grupo = paráfrasis de una misma pregunta; cada grupo entero cae en **entrena (760)** o en **prueba (334, 31 %)**: nunca partido.
- **Clasificador** `server/llm/intencion-ml.js`, JS puro sin dependencias: pedazos de 3 a 5 letras + palabras + pares de palabras ->
  regresión logística de 31 clases. Entrena en ~1 s. Modelo en `server/data/modelo_intencion.json` (567 KB, 4859 rasgos).
  No se usaron embeddings de Ollama: no hay modelo de embeddings instalado (solo gemma3 y qwen2.5-coder) y no se bajó ninguno.
- **Umbral con validación, no con la prueba:** validación cruzada de 5 partes por grupo dentro de «entrena». Se escoge el umbral que
  más arregla menos 2× lo que descompone: **0.40**.
- **Integración solo como respaldo** (`routes/asistente.js`, 5 cambios chicos): el clasificador solo opina cuando las palabras clave
  mandan la pregunta al modelo de lenguaje, a «fuera de tema» o a «no tengo ese dato del maíz», y la pregunta no es seguimiento
  («¿por qué sorgo?»). Si su confianza ≥ 0.40, la manda a la plantilla de esa intención (o al bloque del maíz, o al recomendador).
  Las respuestas del maíz solo si la pregunta dice maíz/milpa/elote. Si algo falla o falta el modelo, no cambia nada.
- **«No tengo ese dato» + 3 sugerencias en confianza baja: programado pero APAGADO.** La validación dijo que se lo diría a 20
  preguntas y 5 de ellas (25 %) eran de las que el modelo de lenguaje sí contesta bien («¿qué es la evapotranspiración?», «resumen
  de mi parcela»). La regla era usarlo solo si eso era ≤ 10 %. Se prende solo (`negar: true` en el modelo) si al reentrenar pasa.

## Resultados en la prueba (334 preguntas de 67 grupos que el clasificador nunca vio)

| | Acierta la intención |
|---|---|
| Enrutado por palabras (antes) | **74.3 %** (248) |
| Clasificador solo (no se usa así) | 62.3 % (208) |
| **Palabras + clasificador de respaldo (ahora)** | **78.4 %** (262) |

- De las 86 que antes salían mal, el clasificador solo acierta 45; con el respaldo (umbral) quedan bien **19**.
- **Respuestas que antes salían bien y ahora salen mal: 5** (de 248). El respaldo cambió 26 respuestas: 19 bien, 7 mal.
  Las 7: «dame un resumen del clima y el suelo» (×2) -> fuera de tema; «cuánto cuesta un celular nuevo» (×2) -> precios de insumos;
  «que laptop me conviene» -> recomendación de cultivos; «cuanta humedad tiene mi terreno» -> suelo (era humedad);
  «que fertilizante es mejor para mi cultivo» -> recomendación (era peligro; antes iba al modelo de lenguaje).
- Solo, el clasificador es **peor** que las palabras (62 % vs 74 %): las palabras clave son muy buenas en lo que conocen. Por eso
  va solo de respaldo.
- Calibración en la prueba (la confianza que dice vs lo que acierta): 0-0.4: dice 27 %, acierta 36 %; 0.4-0.6: 49 % / 66 %;
  0.6-0.8: 69 % / 80 %; 0.8-1: 90 % / 96 %. Es algo modesto (dice menos de lo que acierta), no presumido.
- Por intención (palabras -> juntos): siembra 20 % -> 80 %; maíz riesgo 60 -> 80; maíz ciclo 70 -> 90; maíz decisión 67 -> 80;
  suelo 70 -> 80; fuera de tema 100 -> 70 (empeora); general 100 -> 60 (empeora). Sin mejora: tendencia (30 %), maíz rotación (0 %),
  humedad (50 %), cultivo (50 %).
- Confusiones que siguen: siembra/tendencia/recomendar -> modelo de lenguaje; cultivo -> lluvia; el clasificador confunde
  heladas con calor y humedad con suelo.

### Frases nuevas que ahora se entienden (de la prueba)
«como esta mi tierra» -> suelo · «maiz este año si o no» -> decisión del maíz · «cuando arranco la siembra del temporal» -> siembra ·
«Sembré maíz en junio, ¿cuándo lo levanto?» -> ciclo del maíz (antes el modelo de lenguaje inventó «agosto o septiembre») ·
«oiga a como se vede el frijol» -> precio del SIAP · «¿Qué probabilidad hay de perder mi maíz?» -> riesgo del maíz.

## Límites
- La prueba la escribió la misma persona que el entrenamiento (frases parecidas en estilo). Con preguntas reales de agricultores el
  número puede bajar. Lo que mide es **la intención**, no que la respuesta final sea correcta (eso lo miden `evaluar-*.js`).
- 5 respuestas descompuestas de 248: sobre todo preguntas fuera de tema con palabras de dinero («cuánto cuesta un celular»).
- El conjunto tiene pocas preguntas de algunas intenciones (maíz rotación, maíz suelo, maíz dónde, general: 4 grupos).

## Cómo reentrenar
```
cd server
node scripts/generar-intenciones.js      # si cambiaste intenciones-semilla.txt
node scripts/entrenar-intencion.js        # escoge umbral, guarda data/modelo_intencion.json e imprime la tabla de arriba
node scripts/entrenar-intencion.js --detalle   # además lista las rescatadas y las descompuestas
node --test
```
Para agregar preguntas: una línea nueva en la semilla bajo su `== intención` (paráfrasis separadas por `|`). Si agregas una intención
nueva que deba contestarse con plantilla, agrégala a `TEMAS_PLANTILLA` (o a `ID_MAIZ`) en `intencion-ml.js`.

## Qué datos extra servirían por intención (para gráficas y desglose)

| Intención | Datos útiles para responder mejor | De dónde salen |
|---|---|---|
| maiz_produccion | t/ha por año 2018-2024 (temporal y riego), peor/mejor año, total para sus hectáreas, municipio cercano | SIAP (estado y municipio) |
| maiz_decision | daño estimado por escenario de lluvia, probabilidad de año malo, años con pérdida > 10 %, lluvia PV de su parcela por año | modelo entrenado (`riesgo-clima`, `modelo2`), SIAP, NASA POWER |
| maiz_ciclo | días a madurez (FAO-56), meses de lluvia de su parcela para ubicar el ciclo | FAO-56, NASA POWER |
| maiz_precio | precio medio rural por año, ingreso bruto por ha y para sus hectáreas | SIAP |
| maiz_riesgo | % superficie siniestrada por año, años con pérdida alta, daño por escenario de lluvia | SIAP, modelo entrenado |
| maiz_riego | t/ha riego vs temporal por año, % de superficie de riego, lluvia mensual vs necesidad | SIAP, NASA POWER |
| maiz_suelo / suelo | pH, arcilla, arena, limo, carbono 0-30 cm (y rango del cultivo si está verificado) | SoilGrids |
| maiz_comparar | t/ha, precio, ingreso y pérdida de los dos cultivos lado a lado | SIAP |
| maiz_donde | superficie y rendimiento por municipio, municipios con clima parecido | SIAP municipal, NASA POWER |
| recomendar / maiz_rotacion | puntaje y riesgo por cultivo, rotación de 3 años, comparación años secos NASA vs pérdidas SIAP | motor de reglas, SIAP, NASA POWER |
| siembra | lluvia mensual promedio y mes en que empieza la temporada | NASA POWER |
| lluvia / anio / secos | serie de lluvia PV por año con años secos marcados, mediana, umbral seco | NASA POWER |
| tendencia | serie PV + recta de tendencia con su margen | NASA POWER |
| heladas / calor | mínimas y máximas mensuales, noches bajo 0 °C por mes | NASA POWER |
| radiacion / humedad | radiación solar y humedad de raíz (GWETROOT) por mes | NASA POWER |
| pronostico | lluvia y temperatura de los próximos 7 días | Open-Meteo |
| siap / cultivo | superficie, rendimiento, precio y % siniestrado por año del cultivo | SIAP |
| frutales | hectáreas, rendimiento, % de riego 2024 por estado | SIAP |
| peligro / insumos / fuera / sin_dato | nada: se niega y manda al técnico; mostrar 3 preguntas que sí sabe | — |

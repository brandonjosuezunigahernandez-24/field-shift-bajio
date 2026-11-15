# 40. Entender las mismas preguntas dichas de otra forma (paráfrasis)

Rama `agente/parafrasis`. Fecha: 15 nov 2026.

## Qué pasaba
El usuario lo vio: «a veces no entiende». «¿Qué puedo sembrar?» caía en las fechas de siembra porque la regla de recomendación
solo aceptaba «qué siembro / qué me conviene». Las reglas de palabras no aceptaban variantes comunes: «puedo», «debo», «podría»,
«le pongo», «está bien si…», «qué tal el…», muletillas de voz («oiga joven», «este…», «ps»), sin signos, sin acentos.

## Cómo se midió
- `server/test/eval/parafrasis.json`: **44 intenciones, 546 frases** reales (≥ 12 por intención), con perfil lleno
  (temporal, Guanajuato, último frijol, ahora maíz, 7.94 ha; parcela de Celaya). Incluye voz transcrita.
  **30 % de cada intención es PRUEBA** (escogidas por hash, 177 frases): no se miraron para arreglar ni entraron al entrenamiento.
- `node scripts/evaluar-parafrasis.js [--detalle]`: manda cada frase a la ruta real `/api/asistente` (sin internet y sin modelo
  de lenguaje) y lee qué entendió con `test/eval/rotulo.js` (el `tema` de la respuesta, «recomendar», «por qué», «acción»…).
  `--detalle` lista solo las de desarrollo que fallan.

## Resultado (tema correcto), medido sobre `main` (motor `recommendPlot`)

Rama mezclada con `origin/main` (el chat ya usa `recommendPlot` y `asksWhyThisCrop`). «Antes» = `origin/main` sin estos cambios.

| | Desarrollo (369) | **Prueba (177)** |
|---|---|---|
| Antes (`origin/main`) | 83 % (308) | **86 % (153)** |
| Después | 99 % (366) | **90 % (160)** |

Ninguna frase que en `main` salía bien sale mal ahora (ni en desarrollo ni en prueba).

| Intención | Desarrollo antes | Desarrollo después | Prueba antes | Prueba después |
|---|---|---|---|---|
| recomendar | 7/10 | 10/10 | 5/5 | 5/5 |
| puedo_cultivo | 3/10 | 8/10 | 1/4 | 2/4 |
| siembra_fecha | 7/9 | 9/9 | 4/4 | 4/4 |
| maiz_produccion | 8/9 | 9/9 | 3/4 | 3/4 |
| rendimiento_propio | 1/8 | 8/8 | 4/4 | 4/4 |
| maiz_precio | 9/9 | 9/9 | 3/4 | 3/4 |
| maiz_riesgo | 8/9 | 9/9 | 4/4 | 4/4 |
| maiz_decision | 9/9 | 9/9 | 3/4 | 3/4 |
| maiz_ciclo | 7/8 | 8/8 | 4/4 | 4/4 |
| maiz_riego | 8/8 | 8/8 | 3/4 | 3/4 |
| maiz_agua | 7/8 | 8/8 | 3/4 | 3/4 |
| maiz_suelo | 7/8 | 8/8 | 2/4 | 3/4 |
| maiz_comparar | 8/8 | 8/8 | 3/4 | 4/4 |
| maiz_donde | 7/8 | 8/8 | 3/4 | 3/4 |
| maiz_rotacion | 6/8 | 8/8 | 3/4 | 4/4 |
| lluvia | 9/9 | 9/9 | 4/4 | 4/4 |
| lluvia_mes | 7/8 | 8/8 | 4/4 | 4/4 |
| secos | 7/9 | 9/9 | 2/4 | 2/4 |
| anio | 7/8 | 8/8 | 3/4 | 4/4 |
| tendencia | 6/8 | 8/8 | 4/4 | 4/4 |
| heladas | 9/9 | 9/9 | 4/4 | 4/4 |
| calor | 8/8 | 8/8 | 4/4 | 4/4 |
| pronostico | 9/9 | 9/9 | 4/4 | 4/4 |
| suelo | 9/9 | 9/9 | 4/4 | 4/4 |
| humedad | 7/8 | 8/8 | 4/4 | 4/4 |
| siap_precio | 8/8 | 8/8 | 4/4 | 4/4 |
| siap_rinde | 8/8 | 8/8 | 4/4 | 4/4 |
| siap_riesgo | 8/8 | 8/8 | 4/4 | 4/4 |
| que_hacer | 7/9 | 8/9 | 4/4 | 4/4 |
| aptitud | 8/9 | 9/9 | 4/4 | 4/4 |
| desglose | 8/8 | 8/8 | 4/4 | 4/4 |
| frutales | 8/8 | 8/8 | 3/4 | 3/4 |
| apoyos | 7/8 | 8/8 | 4/4 | 4/4 |
| seguro | 6/8 | 8/8 | 3/4 | 3/4 |
| credito | 6/8 | 8/8 | 4/4 | 4/4 |
| plagas | 8/8 | 8/8 | 4/4 | 4/4 |
| fertilizante | 7/8 | 8/8 | 2/4 | 3/4 |
| insumos | 8/8 | 8/8 | 4/4 | 4/4 |
| tarjeta | 9/9 | 9/9 | 2/4 | 2/4 |
| concepto | 6/8 | 8/8 | 3/4 | 3/4 |
| fuera | 5/8 | 8/8 | 4/4 | 4/4 |
| seguimiento_cultivo | 7/8 | 8/8 | 4/4 | 4/4 |
| porque | 3/8 | 8/8 | 4/4 | 4/4 |
| saludo | 1/8 | 8/8 | 3/4 | 4/4 |
| **Total** | **308/369 (83 %)** | **366/369 (99 %)** | **153/177 (86 %)** | **160/177 (90 %)** |

Nota: en `frutales` se aceptan también `siap` y `desglose` (fresa y aguacate se contestan con el resumen de cultivos, como dice
`respuestas.js`). Se decidió al ver los resultados de desarrollo.

Otras mediciones (para no romper lo que ya salía bien):
- `node --test` (tras mezclar `main`): **300 pruebas, todas pasan** (37 nuevas en `test/parafrasis.test.js`).
- `probar-conversacion.js --set=especificas` (sin modelo de lenguaje), `main` contra esta rama: bien contestadas 233/270 → **235/270**,
  tema correcto 93 % igual (mejora «Me quieren pagar el frijol a 18 mil la tonelada»).
  Al medir salieron 2 que se rompían con el cambio («Si saco 2 t/ha y me la pagan a 5,000, ¿cuánto gano?» y «¿Dónde consigo
  fertilizante gratis?»); se arreglaron con reglas generales (abajo) y ya no se rompen.
- Clasificador (`entrenar-intencion.js`, su propia prueba de 459 frases, que no cambió): palabras 71.5 → 73.2 %;
  clasificador solo 69.3 → 78.0 %; palabras + respaldo 77.3 → **78.9 %**; respuestas que el respaldo descompone 5 → 1. Umbral 0.40 igual.

## Qué cambió (en la raíz, cambios chicos)
- **Muletillas de voz** (`intencion.js` `quitarMuletillas`, en la ruta antes de todo): quita al inicio «oiga», «oye», «mire»,
  «disculpe», «ps», «pues», «bueno», «a ver», «joven», «señor», «jefe»… y «este» solo si no es «este año / este ciclo».
- **Saludo** se revisa con la pregunta como la dijo, antes de completarla con el perfil (antes «buenos días» + maíz sembrado se
  volvía «buenos días (maíz)» y contestaba el ciclo del maíz). Acepta «buen día», «qué tal», «muchas gracias», «hola joven».
- **Recomendación** (`wantsRecommendation`): «qué puedo/podría/debo/sería bueno/es lo más conveniente sembrar», «qué me aconseja
  sembrar». «Me recomiendas una película» o «¿me recomiendas el frijol?» ya no son recomendación de cultivos.
- **¿Puedo sembrar X?** (`detectarTema` → `cultivo`): «podría», «debo», «está bien si», «es buena idea», «qué tal el…»,
  «le pongo…», «me recomienda el…», «sirve».
- **Cuándo sembrar**: «cuándo es buena fecha para sembrar», «en qué tiempo se siembra», «cuándo empiezo a sembrar».
- **Maíz** (`maiz.js`): lo que sacó el agricultor («me salieron 2 toneladas», «3 toneladas *de maíz* por hectárea», «saco»,
  «dio»); sin hectáreas **pregunta** «¿Las 2 toneladas fueron en cuántas hectáreas?» (decisión del equipo: no suponer), y la
  respuesta corta («en 4 hectáreas», «por hectárea») se junta con la pregunta anterior en `seguimiento.js`.
  Con cosecha y precio dichos es precio. «¿Qué tan seguro es el maíz?» es riesgo (no seguro agrícola). «En cuántos meses se cosecha»
  es ciclo. «Necesita mucha agua», «cuántos milímetros» es agua. «Mi tierra aguanta el maíz» es suelo. «Qué partes/zonas» es dónde.
  «Después del frijol / vengo de frijol / tuve frijol» es rotación.
- **Clima**: «aguanta» ya no es lluvia (antes `agua` coincidía); «milímetros» es lluvia; «no llovió», «años malos» son años secos;
  «cuánta agua cayó en 2015», «el temporal de 2023» es ese año; «ya no llueve como antes», «ha cambiado la lluvia» es tendencia;
  «humedad de mi terreno» es humedad.
- **Apoyos, seguro, crédito, insumos**: «programas», «asegurar», «el seguro…», «gratis» son apoyos; «me pueden prestar» es crédito;
  «con cuánto abono» es dosis (se niega); «cuánto sale el bulto» es precio de insumo.
- **¿Por qué?** tras una plática («y eso por qué», «por qué no maíz», «y por qué ese y no otro», «por qué me recomiendas eso»):
  con `asksWhyThisCrop` de `main` sobre lo que dijo el agricultor (no la pregunta completada con la plática), antes del bloque del
  maíz y de «recomiéndame»; lo contestan las razones de `recommendPlot`. `asksWhyThisCrop` acepta además «otro», «salió» y
  «no + cultivo». Sin plática, «¿por qué es bueno rotar?» va al modelo de lenguaje.
- **«Cómo le hago si…»** cuenta como pedir acción: la respuesta empieza con la primera de «Qué hacer».
- **Clasificador** (`intencion-ml.js`): no cambia una pregunta para entender («¿qué es el temporal?») a otro tema, y para cambiar
  una pregunta sin palabras del campo («cómo bajo de peso») pide confianza ≥ 0.7. Se reentrenó con las frases de DESARROLLO
  (al final de `intenciones-semilla.txt`, marcadas `# retro`: van siempre a entrena y no mueven la prueba). `generar-intenciones.js`
  ahora marca `retro: true` y la prueba del 25 % se cuenta sin ellas.

## Lo que sigue fallando (prueba, 17 de 177)
- «¿puedo sembrar garbanzo?» / «sirve el garbanzo» (y en desarrollo trigo y cebada): se entiende, pero `recommendPlot` no lo trae
  en su lista para temporal, así que contesta «no tengo información verificada, lo que sí hay…» (tema `cultivo`). Falta de dato.
- Maíz: «cuánto me va a dar el maíz» → precio; «en cuánto se vende» → ciclo («en cuanto» es de tiempo); «es buena idea sembrar maíz
  este temporal» → riego («temporal»); «cuánto más saco con riego» → producción; «cuánta lluvia necesita la milpa» → modelo;
  «qué tal es mi suelo para el maíz» → suelo; «qué zonas son más maiceras» → fuera.
- Años secos: «cuántas veces ha llovido poco», «años malos de agua» → lluvia.
- «dónde aviso que perdí mi cosecha» → dónde se siembra maíz (debería ser seguro). «qué abono le echo a la milpa» → modelo.
- Tarjetas: «¿qué hago en la canícula?» empieza con una acción en vez de ir solo a la tarjeta; «cómo capto el agua de lluvia» → lluvia.
- «cómo funciona la rotación de cultivos» → aptitud. «datos de la fresa» → modelo.
- Desarrollo: «cómo le hago para guardar humedad» (sin «Qué hacer» para ese tema).

## Límites
- Las frases las escribió la misma persona que arregló las reglas; con agricultores reales el número puede bajar.
- Se mide que entienda la intención, no que la respuesta sea correcta (eso lo miden `evaluar-*.js` y `probar-conversacion.js`).
- Garbanzo, trigo y cebada en temporal: se queda «no tengo información verificada»; no se agregan al motor (decisión del equipo).

## Cómo correr
```
cd server
node scripts/evaluar-parafrasis.js --detalle   # tabla por intención; lista las de desarrollo que fallan
node scripts/generar-intenciones.js && node scripts/entrenar-intencion.js   # si cambias la semilla
node --test
```

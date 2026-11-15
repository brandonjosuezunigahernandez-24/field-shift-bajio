# 46 · El chat estable: plan corto, 3 rotaciones en la plática y 13 fallas arregladas

Fecha: 15 nov 2026. Se midió en dos servidores: uno con internet y otro sin internet (`OFFLINE=1`).

## Por qué
Hice una ronda de 28 preguntas nuevas con la parcela de El Marqués, Qro. y probé las 3 rotaciones que agregó el equipo
(cambio 43). Leyendo cada respuesta, salieron bien 22 de 28. Además había 5 preguntas sobre el plan que el chat no
entendía. La recomendación también había crecido a 8 frases y no hacía caso a la meta ni al riego dichos en la pregunta.

## Qué cambió

**El plan en el chat** (`server/llm/plan-chat.js`, nuevo). Lo usa `routes/asistente.js`; todos los números salen de
`recommendPlot`.

- **«¿Qué me conviene sembrar?»** responde en 6 frases como máximo:
  - los 3 mejores cultivos,
  - la rotación de 3 años (con riego, agrupada por año),
  - la comparación con seguir igual,
  - el ingreso de 3 años.

  La corroboración NASA-SIAP sigue en el campo `corroboracion`.
- **La meta o el riego de la pregunta ganan sobre el perfil**: «si quiero ganar más», «cuidar el suelo», «que aguante
  la sequía», «si tengo riego».
- **«¿Y por qué no el maíz?»**: da el lugar y las razones de ese cultivo. Antes contestaba «No tengo ese dato».
- **«¿Qué pasa si sigo sembrando lo mismo?»** (`recomendar-igual`): compara la rotación de hoy con la recomendada en
  riesgo, leguminosas e ingreso. No se activa si se nombra un cultivo («¿le sigo con el maíz?» sigue siendo del maíz).
- **«¿Qué tan seguro es ese cálculo?»** (`recomendar-incertidumbre`): da 3 frases de la `incertidumbre` del motor. No
  se activa con «¿qué tan seguro es sembrar maíz?».
- **«¿Puedo sembrar maíz?»**:
  - Da su lugar en el plan, como cualquier otro cultivo.
  - No aplica si la pregunta trae fecha, riego, rotación o números.
  - «Sí, te conviene» solo se dice del primer lugar; antes también el 3 de 3.

**Otras fallas**

| Pregunta | Antes | Ahora |
|---|---|---|
| ¿Llueve más aquí que en Celaya? | la lluvia de la parcela | compara con la lluvia normal del municipio (`municipios_clusters.json`, NASA 2000-2024) |
| Coseché 5 toneladas en 4 hectáreas | «Es una cantidad considerable [Wikipedia]» | usa el cultivo del perfil; si no hay, pregunta «¿de qué cultivo?» y junta «de frijol» |
| Me salieron 3 toneladas de frijol | promedio del frijol | pregunta en cuántas hectáreas y compara, igual que con el maíz |
| ¿Le entro al nopal? | el modelo habló de Guanajuato con la parcela en Querétaro | «¿se da aquí?» (EcoCrop); el modelo solo recibe el SIAP del estado de la parcela |
| ¿Cuánto glifosato le pongo? | «solo hablo de tu parcela» | no da dosis y manda a un técnico, como con la urea |
| ¿Cuántos años secos desde 2010? | contestaba solo 2010 | cuenta los años secos desde ese año |
| ¿Quemo el rastrojo? | el modelo una vez dijo «Es mejor que lo quemes» | siempre la tarjeta de SADER; además, `aconsejaQuemar()` bloquea ese consejo |
| ¿Qué es la jamaica? | «No lo sé» con la gráfica de lluvia abajo | «No lo sé» sin gráfica |
| aki se da el frijo? | fuera de tema | corrige faltas comunes (aki, frijo, yueve, senbrar) |
| ¿Cómo guardo el agua de lluvia? / que mi tierra no se canse | tarjeta equivocada o «No lo sé» | su tarjeta (cosecha de agua y suelo cansado) |

## Resultados

Las dos copias (con y sin internet) dieron exactamente lo mismo.

| Medición | Antes | Después |
|---|---|---|
| Plática de punta a punta (Celaya y Amealco, 270) | 231 | **237** (dev 139/150, prueba 98/120), ninguna empeoró |
| Ronda nueva de Querétaro, leyendo cada respuesta (28) | 22 | **28** |
| Estabilidad: misma respuesta 3 veces (42) | 33/34 | **42/42** |
| Preguntas básicas (`evaluar-asistente.js`, 59) | 51 | 51 |
| Paráfrasis, desarrollo / prueba | 366/369 · 160/177 | 366/369 · **159/177** |
| `node --test` | 314 | **322** (8 pruebas nuevas en `test/coherencia.test.js`) |

- **Ronda de Querétaro:** las preguntas son nuevas, pero también son las que usé para encontrar las fallas. El 28/28 no
  es una medición limpia: la medición limpia es la columna de prueba de la plática (98/120, sin cambio).
- **Paráfrasis de prueba:** perdió 1 frase (160 → 159). No la busqué, para no ajustar el chat con las frases de prueba.

## Lo que falta
- Garbanzo, trigo y cebada en temporal siguen sin lugar en el plan. Por decisión del equipo, no se agregan.
- La comparación de lluvia solo funciona con los 64 municipios que tienen clima guardado.
- Si alguien contesta «en total» o un número suelto («3») a la pregunta de hectáreas, el chat todavía no lo entiende.

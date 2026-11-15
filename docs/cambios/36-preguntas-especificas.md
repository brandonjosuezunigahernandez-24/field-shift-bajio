# 36. Preguntas específicas y lenguaje sencillo

Rama `agente/especificas`. Fecha: 15 nov 2026.

## Qué se probó
`server/test/eval/especificas.json`: **135 preguntas específicas** de productor de Gto/Qro con el perfil lleno (temporal, ahorita maíz,
antes frijol, hectáreas del dibujo). Hay preguntas por cultivo (maíz, frijol, sorgo, trigo, cebada, garbanzo, fresa, aguacate, nopal, jitomate),
por mes («¿siembro en julio?», «¿helada en octubre?»), por municipio (Dolores Hidalgo, San Juan del Río, Pénjamo…), con números
(«tengo 3.5 ha y me dieron 1.2 t», «¿con 400 mm alcanza?», «el coyote me ofrece 4,500»), comparaciones, seguimientos («¿y si es de riego?»),
mal escritas («ay elada en dicienbre») y de las 3 necesidades principales: insumos caros, sequía, y precio y acopio.
Cada una trae su criterio: `intencion`, `incluye`/`excluye` y `debe_accion`.

Se separaron por **grupo** (las paráfrasis van juntas). **Desarrollo: 75** (con estas se arregló y se entrenó). **Prueba: 60 (44 %)**: no se usaron
para arreglar ni para entrenar.

```
cd server && PORT=3081 node index.js &
node scripts/probar-conversacion.js --url=http://localhost:3081 --set=especificas [--parte=dev|prueba]
node scripts/probar-conversacion.js --set=especificas --recalificar=especificas-antes   # misma vara sobre las respuestas viejas
```
Se corre con las 2 parcelas dibujadas (Celaya y Amealco): 270 respuestas. Ahora la calificación también revisa `debe_accion`
(«Qué hacer» no vacío). Además imprime la **legibilidad**.

## Antes y después (270 respuestas, misma vara)

| | Antes | Después |
|---|---|---|
| Tema correcto | 206/270 (76 %) | **250/270 (93 %)** |
| Bien contestadas (pasan todo) | 166/270 (61 %) | **235/270 (87 %)** |
| **Desarrollo** (se arregló con estas: no es medida limpia) | 90/150 | 139/150 |
| **Prueba** (nunca vistas) | 76/120 (63 %) | **96/120 (80 %)** |
| Falta el dato pedido | 67 | 15 |
| Falta acción | 20 | 13 |
| Número sin fuente | 2 | 0 |
| Más de 5 frases | 36 | 18 |
| Palabras por frase (promedio) | 15.0 | **14.6** |
| Frases de más de 20 palabras | 16 % | **7 %** |
| «t/ha» o «mm» sin explicar | 121 | **0** |
| Palabras técnicas (siniestrada, mediana, umbral…) | 6 | **0** |

«Más de 5 frases» bajó de 36 a 18. No baja más porque ahora muchas respuestas cierran con «Lo que conviene: …».

Clasificador de intención (`generar-intenciones.js` + `entrenar-intencion.js`): se agregaron a la semilla los **59 grupos de desarrollo** (sin
seguimientos y sin ninguna de prueba). Su prueba quedó en 77.9 % → **78.6 %** (palabras + respaldo). Al crecer la semilla cambió el conjunto de prueba
(403 → 459), así que la comparación no es exacta.

## Fallas arregladas (ejemplos reales, parcela de Celaya)
1. **Su propia cosecha**: «Tengo 3.5 ha y me dieron 1.2 t, ¿estoy bien o mal?». Antes contestaba el precio del maíz. Ahora: «Sacaste 0.34 toneladas por
   hectárea (1.2 t en 3.5 ha): quedaste abajo del promedio de Guanajuato…», y sigue con el municipio más cercano. Está en `rendPropio()`, en `llm/maiz.js`.
2. **Lluvia que dice en mm**: «¿Con 400 mm alcanza?». Antes salía riego contra temporal. Ahora: «400 milímetros de lluvia de junio a septiembre sería
   año seco en tu parcela. Lo normal es unos 530 mm…». También da el daño del escenario del modelo más parecido. Lo hace `lluviaDicha()` en
   `llm/climatologia.js`, y sirve para el maíz, para años secos y para lluvia. Además, «300 mm» ya no se toma como «años secos».
3. **Mes de siembra**: «¿Siembro el maíz en julio o ya es tarde?». Antes daba el ciclo de la FAO en Nigeria. Ahora da la lluvia de julio y cuántos meses
   de lluvia fuerte le quedan. «Qué hacer» trae la opción de ciclo corto (`acciones.json`: se agregó el tema `maiz-siembra`).
4. **Municipio**: «¿Cuánto rinde el maíz en Dolores Hidalgo?». Antes daba el promedio del estado. Ahora: «En Dolores Hidalgo… 0.51 toneladas por
   hectárea». San Juan del Río usa Querétaro aunque la parcela esté en Guanajuato. Los datos salen de `maiz_municipios.json`.
5. **Precio ofrecido**: «El coyote me ofrece 4,500». Ahora dice que es 17 % menos que el precio de 2024, y «Qué hacer» trae el precio de acopio.
6. Otros arreglos:
   - «Sembré maíz 3 años, ¿qué le pongo?»: antes iba a peligro («pongo»). Ahora contesta la rotación.
   - «ay elada en dicienbre»: antes salía fuera de tema. Ahora reconoce meses con una letra mal.
   - «¿julio o agosto?»: ahora compara los dos meses.
   - «hace 20 años»: ahora va a tendencia.
   - Insumos: «carísimo» y «no me alcanza» ya cuentan.
   - «guardo agua de lluvia» ya no va al maíz.
   - «semillas para 4 ha»: ahora calcula el total y cita la fuente.
   - «¿de cada 10 años en cuántos se pierde?»: ahora va a riesgo.

## Lenguaje sencillo (pedido del usuario)
Hay un paso nuevo, `llm/claro.js`. Corre al final de `/api/asistente`, **después** del verificador de números: los números ya se revisaron contra los datos.
- Pone las unidades en palabras la primera vez: «t/ha» queda como «toneladas por hectárea» y «mm» como «milímetros de lluvia».
- Redondea: 528.9 queda como «unos 530» y 1.65 como 1.6. No toca el dinero, las hectáreas del agricultor ni los números menores a 1.
- Cambia palabras técnicas: «siniestrada» queda como «perdida», «mediana» como «lo normal», «umbral» como «límite»,
  «precio medio rural» como «precio que pagan en el campo» y «PV» como «temporada de lluvias».
- Cierra con «Lo que conviene: …». Es la primera acción de «Qué hacer», sin paréntesis. Solo se agrega si cabe en 5 frases.
- Las respuestas de producción, decisión y riesgo del maíz **empiezan por la parcela**. Por ejemplo: «Con tus 7.94 ha sacarías unas 13.1
  toneladas…». Antes empezaban por el promedio del estado. Lo detallado (peor y mejor rendimiento por hectárea) quedó en las gráficas.
- Se cortaron las frases más largas: lluvia por mes, apoyos y riesgo con mm.

**Pruebas que cambié** (el texto nuevo es mejor):
- `test/graficas.test.js` ahora acepta el número redondeado (1.39 o 1.4; 423.2 o «unos 420»).
- La prueba de producción ya no exige el peor y el mejor rendimiento por hectárea en el texto: están en la gráfica.

Las demás pruebas no se tocaron.

Las pruebas de regresión están en `server/test/especificas.test.js` (9 pruebas). Cubren lo que dice el agricultor, la ruta real y las reglas de
lenguaje: su dato primero, ≤ 5 frases, sin palabras técnicas ni unidades sin explicar, y el cierre coincide con «Qué hacer». Resultado de
`node --test`: 203/203.

## Lo que sigue mal (prueba, sin arreglar para no entrenar con ella)
- «¿Cuántas toneladas me dan 2 ha en un año malo?» va a la decisión del maíz.
- «¿Dónde se siembra más maíz de temporal en Querétaro?» va a riego, porque gana la palabra «temporal».
- «¿Hay riesgo de helada en septiembre para el frijol?» va a SIAP, porque gana la palabra «riesgo» con un cultivo.
- «Perdí como 30 % el año pasado» va a la lluvia del año.
- «Si siembro en junio, ¿en qué mes lo levanto?» va a la decisión.
- «aki se da el frijo» va al modelo de lenguaje.
- «Me pagan el frijol a 18 mil» no usa el precio ofrecido: solo está hecho para el maíz.
- «¿Siembro frijol en agosto?» da la fecha del INIFAP, pero no habla de agosto.
- Desarrollo:
  - «trigo en otoño-invierno sin riego» va a heladas.
  - «nopal en vez de maíz» va a la decisión del maíz.
- **Querétaro sin acción**: no hay tarjeta con fuente de Querétaro para fertilizante, seguro catastrófico ni apoyos. Son 7 de las 13 faltas de acción.
  Hace falta investigar fuentes, no código.
- El cierre «Lo que conviene» alarga respuestas que ya tenían 5 frases. Por eso 18 respuestas siguen con más de 5 frases.
- El texto del modelo de lenguaje también pasa por `claro()`, pero sus frases largas no se cortan.
- Las respuestas del recomendador (`recomendador.js`) y del SIAP de otros cultivos todavía empiezan por el estado. No se reescribieron.

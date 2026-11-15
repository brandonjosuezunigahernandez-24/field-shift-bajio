# 35. Rediseño de la respuesta del asistente

Al agricultor le sirven más las **acciones** que los datos, y quiere saber de dónde sale cada cosa sin leer términos técnicos.

## Problemas que había (capturas de Análisis IA y del botón flotante, en escritorio y a 390 px)

1. **Lo primero que se veía no era la respuesta.** En Análisis, arriba iban 11 botones de temas, 3 preguntas, la caja y
   «Cómo llegó a la respuesta». En el celular la respuesta empezaba a unos 1,800 px de la parte de arriba.
2. **Ruido técnico antes de la respuesta.** El bloque «Cómo llegó a la respuesta · 4 pasos en 0.0 s» estaba abierto y en
   letra de código («el modelo de lenguaje no inventó nada»).
3. **La respuesta corta era un bloque oscuro de 6 renglones.** El texto claro sobre verde oscuro se lee mal al sol.
4. **No había «qué hacer».** Solo datos.
5. **Las fuentes casi no se veían:** chips de 11 px en letra de código, sin enlace. El botón «Escuchar» era un ícono
   chico al final.
6. **En el botón flotante la respuesta era texto corrido** y un renglón chico con el origen. No tenía gráficas ni
   preguntas siguientes.
7. **Los 11 temas en varias filas** llenaban la pantalla del celular antes de la caja para escribir.
8. Mientras pensaba solo decía «Pensando…». Los errores no tenían botón para reintentar.
9. La lluvia por mes se partía en dos filas (rejilla de 7 columnas para 12 meses).

## Opción A: una sola columna, en orden de importancia (ESCOGIDA)

```
+--------------------------------------------+
| [ Escribe tu pregunta................... ] |
| [ (mic) Hablar ]  [   Preguntar   ]        |
+--------------------------------------------+
| Preguntaste: «...»                         |
| | EL MAÍZ RINDE 1.65 t/ha EN GUANAJUATO.   |  <- (a) 1 frase grande
| | Con tus 3 ha sacarías unas 4.9 t ...     |      resto en letra normal
| | [ (bocina) Escuchar ]  Calculado con...  |
|                                            |
| Qué hacer                                  |  <- (b) hasta 3 tarjetas
| (1) Siembra cuando ...                     |
|     por qué ...         Fuente: SIAP (link)|
| (2) ...                                    |
|                                            |
| > Los datos  (gráficas, tablas)            |  <- (c) abierto en escritorio,
|                                            |      cerrado en celular
| De dónde salió   (SIAP) (NASA POWER)       |  <- (d) chips con enlace
| > Cómo llegó a la respuesta (4 pasos)      |      plegado
|                                            |
| También puedes preguntar                   |  <- (e) 3 botones grandes
| [ ¿Cuánto llueve en verano?            ]   |
| [ ...                                  ]   |
+--------------------------------------------+
| Otros temas: [Mi parcela][Clima][...] ->   |  <- una fila que se desliza
```

## Opción B: pestañas dentro de la respuesta

```
+--------------------------------------------+
| EL MAÍZ RINDE 1.65 t/ha ...   [Escuchar]   |
| [ Qué hacer ] [ Los datos ] [ Fuentes ]    |
| ------------------------------------------ |
|  (contenido de la pestaña elegida)         |
+--------------------------------------------+
```

**Por qué A:** con pestañas hay que descubrir que existen y tocar para ver lo demás. Mucha gente con poca experiencia
digital no lo hace. En una columna basta con bajar la pantalla, y el orden ya dice qué importa. Lo largo (los datos y
cómo llegó) va plegado, así que la columna no crece de más.

## Qué se hizo

- **Componente común** `client/src/components/Respuesta.jsx` (`RespuestaCard`, `EstadoAsistente`,
  `preguntasSiguientes`). Lo usan Análisis IA y el botón flotante. Antes cada uno tenía su propia versión.
- **(a)** La primera frase va grande, en verde oscuro sobre blanco. Las demás van en letra normal. No se pliegan
  porque a veces la cifra que pidió el agricultor viene en la tercera frase (por ejemplo, «Con tus 3 ha sacarías unas 4.9 t»).
- **Escuchar**: botón grande con `speechSynthesis` del navegador en es-MX. Lee la respuesta y las acciones. Al tocarlo
  otra vez dice «Parar». No usa dependencias.
- **(b) Qué hacer** lee `que_hacer: [{ accion, porque, fuente, url }]` y muestra 3 como máximo. Si no viene, no se
  muestra la sección. Si no viene `url`, el enlace sale de la página oficial de la fuente (SIAP, NASA POWER,
  SoilGrids, Open-Meteo, INEGI, FAO, Wikipedia).
- **(c) Los datos**: las gráficas del servidor y, en Análisis, «Por qué esta respuesta», «Riesgos y límites» y la
  lluvia por mes. Está abierto en pantallas de 768 px o más y cerrado en el celular. En el botón flotante empieza
  cerrado. «Guardar la página en PDF» abre todos los plegables antes de imprimir.
- **(d) De dónde salió**: chips con enlace. «Cómo llegó a la respuesta» queda plegado.
- **(e) Preguntas siguientes**: se toman de `r.sugerencias`. Si no vienen, de las preguntas del tema con id igual a
  `r.tema`. Si tampoco, de las del tema abierto en `GET /api/asistente/temas`. Se quita la que acaba de hacer.
- **Pensando**: un círculo que gira, la pregunta y los segundos que lleva («Buscando los datos de tu parcela y haciendo
  las cuentas…»). Con «reducir movimiento» del sistema, el círculo no gira.
- **Error**: recuadro rojo claro con el mensaje (ya llega en español sencillo) y «Intentar de nuevo», que repite la
  última pregunta (`reintentar` en `useAsistente`). Sin parcela muestra «Ir al mapa a elegir mi parcela».
- **Orden de la pantalla**: primero la caja para escribir y hablar, luego la respuesta y al final «Ideas para preguntar»
  u «Otros temas». Los temas van en una sola fila que se desliza.
- El botón flotante acepta `?asistente=abierto&pregunta=...` para revisar cómo se ve (fuera de `/analisis`).
- Los botones miden 52 px de alto o más, y los enlaces y plegables 44 px.
- **`/prueba-graficas`** ahora muestra la tarjeta completa con `que_hacer`, `sugerencias` y gráficas **de ejemplo**,
  marcados «ejemplo, no son datos reales».

## Verificado

- `npx vite build` pasa.
- Capturas con Edge sin cabeza, de antes y de después. El celular se simuló con un iframe de 390 px, porque Edge sin
  cabeza no baja de unos 500 px de ancho. Se tomaron de Análisis y del botón flotante con «¿Cuánto maíz voy a cosechar
  en mis 3 hectáreas?» contra la API real, y de `/prueba-graficas`.

## No verificado

- `que_hacer` y `sugerencias` reales: el servidor todavía no los manda. Solo se vieron con los datos de ejemplo.
- La voz de «Escuchar» en un celular de verdad (depende de las voces que tenga instaladas).
- El estado de error y el de «pensando», en captura (solo en el código).
- Cuando el servidor no manda `sugerencias` y `r.tema` no es un tema de la guía (por ejemplo `maiz-produccion`), las
  preguntas siguientes repiten las del tema abierto, que también se ven abajo en «Otros temas».

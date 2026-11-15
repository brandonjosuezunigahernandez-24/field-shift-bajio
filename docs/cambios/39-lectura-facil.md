# 39. Lectura fácil de la respuesta

El usuario pidió que la información sea **entendible para los agricultores** y la respuesta **más específica**. Este
cambio es solo de pantalla (`client/`). El servidor no se tocó.

## Qué no entendería un agricultor (capturas de antes, 6 preguntas en `/analisis?pregunta=`, Celaya, perfil de 3 ha de maíz de temporal en Guanajuato)

1. **«¿Cuánto maíz voy a cosechar?»**: el titular decía «rinde en promedio 1.65 t por hectárea». La cifra que pidió
   («con tus 3 ha sacarías unas 4.9 t») iba en la 3.ª frase, en letra normal.
2. Palabras y unidades sin explicar: **t/ha, mm, pH, PV, puntaje, superficie dañada, SIAP, NASA POWER, ingreso bruto,
   mediana, rotación, leguminosa, temporal**.
3. **Gráficas**: títulos de tabla de datos («Maíz: rendimiento por año (t/ha)»), ejes con abreviaturas, nada que diga
   qué mirar. En la de años secos, el límite «año seco si es menos de» salía como **otra fila de barras** del mismo
   alto, y los años secos no se distinguían.
4. **«Escuchar»** leía «t/ha» y «mm» como letras y no leía el «por qué» de cada paso.
5. «¿Qué me conviene sembrar?»: «Frijol (PV, puntaje 73)» y el dinero para sus hectáreas perdido en un párrafo largo.

## Qué cambió

- **Cifra grande** (`cifraPrincipal` en `client/src/glosario.js`): solo en preguntas de cantidad («¿cuánto…?», «¿a
  cómo…?», «¿cuáles fueron…?»). Se toma el número con unidad de la frase que usa sus hectáreas; el número que dio el
  agricultor («tus 3 ha») no cuenta. En «¿a cómo…?» se toma el precio del titular, no el total. La unidad va en palabras
  («toneladas», «pesos la tonelada», «años secos»). Sin unidad clara no se muestra nada.
- **«Para ti:»**: la primera frase que usa sus hectáreas, su parcela o su suelo va en un recuadro amarillo debajo del
  titular. «No de tu parcela» no cuenta. Si el titular ya es para él, no se repite.
- **Qué hacer primero en el celular** cuando la pregunta empieza con «¿Qué hago…?». Se quita la frase «Más ideas abajo,
  en Qué hacer», que ya no sería cierta.
- **Glosario al tocar** (`client/src/glosario.js` + `client/src/components/Glosario.jsx`): la palabra se subraya
  punteado; es un `<button>` con `aria-expanded`; al tocarlo (o Enter/Espacio) abre la explicación justo debajo; Esc la
  cierra. Para el lector de pantalla dice «(qué quiere decir)». Cada palabra se marca solo la primera vez en la
  tarjeta. Se aplica a la respuesta corta, «Qué hacer», títulos, notas y encabezados de tablas de las gráficas, y «Por
  qué esta respuesta» / «Ten en cuenta» en Análisis. Una línea dice «Toca las palabras subrayadas…».
- **Gráficas** (`Graficas.jsx`): título como pregunta («¿Cuánta lluvia cayó cada verano (de junio a septiembre)?»),
  una frase de qué mirar, eje y tooltip con la unidad en palabras. Una serie con el mismo valor en todos los puntos (el
  límite de año seco) se dibuja como **línea roja punteada** y las barras debajo van en naranja. Sin límite, los años que
  nombra la respuesta van en naranja («En naranja, los años que nombra la respuesta»); los rangos «2000-2024» no cuentan.
  **Los datos no cambian.** Si el servidor manda un título que no está en la lista, queda el título original.
- **Escuchar** lee también «Qué hacer» con el porqué de cada paso, y las abreviaturas en palabras (`paraOir`: t/ha,
  t, mm, ha, %, °C, $, pH, PV, OI, «2000-2024» → «2000 a 2024»). Como la API ya manda muchas unidades en palabras, solo
  se cambian las abreviaturas que queden; no se duplica nada.
- Prueba: `client/src/glosario.test.js` (`npm test` en `client/`): cifra principal, «Para ti», glosario sin marcar
  pedazos de palabras, lectura en voz y años nombrados.

## Capturas (Edge sin cabeza; el celular, en un iframe de 390 px)

Antes / después, escritorio (`-esc`) y celular (`-cel`), en
`C:\Users\fglar\AppData\Local\Temp\claude\7e4d2f75caedb271\e64dc8cd-c24d-433b-86a2-40d18f20f36e\scratchpad\lectura\`:

| Pregunta | Antes | Después |
|---|---|---|
| ¿Cuánto maíz voy a cosechar? | `antes-1-esc.png`, `antes-1-cel.png` | `despues-1-esc.png`, `despues-1-cel.png` |
| ¿Cuáles fueron los años secos? | `antes-2-esc.png`, `antes-2-cel.png` | `despues-2-esc.png`, `despues-2-cel.png` |
| ¿Qué me conviene sembrar? | `antes-6-esc.png`, `antes-6-cel.png` | `despues-6-esc.png`, `despues-6-cel.png` |

También `despues-3/4/5-*` (las otras preguntas), `despues-7-cel.png` («¿Qué hago si no llueve?», Qué hacer arriba) y
`despues-dock-cel.png` (botón flotante). Ojo: entre el «antes» y el «después» el servidor cambió algunos textos (lo
mejora otro agente), así que no todo lo distinto es de este cambio.

## Glosario (`client/src/glosario.js`)

| Palabra | Explicación (resumen) | Fuente |
|---|---|---|
| t/ha | toneladas por hectárea; 1 ha = cuadro de 100 × 100 m, un poco más que una cancha | SI (1 ha = 10,000 m²); cancha FIFA 105 × 68 m = 7,140 m² |
| t | tonelada = 1,000 kilos | SI |
| ha / hectárea | 10,000 m² | SI |
| mm de lluvia | 1 mm = 1 litro por metro cuadrado | Organización Meteorológica Mundial |
| pH | ácido (< 7), neutro (7), alcalino (> 7) | FAO, Portal de Suelos |
| arcilla | granos de menos de 0.002 mm; tierra pegajosa que se encharca | USDA, textura del suelo |
| carbono orgánico | restos de plantas y animales en la tierra; más fértil | FAO, Carbono orgánico del suelo (2017) |
| superficie dañada / siniestrada | lo sembrado que se perdió y no se cosechó | SIAP, glosario del cierre agrícola |
| temporal | siembra solo con lluvia; también la temporada de lluvias | SIAP (modalidad temporal / riego) |
| PV / OI | ciclos primavera-verano y otoño-invierno | SIAP; meses de lluvia de NASA POWER en esta app |
| SIAP | Servicio de Información Agroalimentaria y Pesquera (Agricultura) | gob.mx/siap |
| NASA POWER | clima de la NASA por satélite y modelos | power.larc.nasa.gov |
| FAO EcoCrop | rangos de clima y suelo de cada cultivo | gaez.fao.org/pages/ecocrop |
| puntaje | 0 a 100 que da esta app | esta app (`server/engine`) |
| rendimiento / rinde | cuánto se cosecha por hectárea | SIAP |
| mediana | el valor de en medio | estadística |
| umbral | el límite para separar (año seco) | esta app |
| año seco | menos del 80 % de la mediana de lluvia de junio a septiembre | esta app (nota de la gráfica del servidor) |
| leguminosa | frijol, garbanzo, haba, alfalfa; toman nitrógeno del aire | FAO, Año Internacional de las Legumbres 2016 |
| rotación | cambiar de cultivo en la misma tierra | FAO, Agricultura de conservación |
| ingreso bruto | lo que te pagarían, sin restar gastos | definición contable |
| precio medio rural | lo que se le pagó al productor por tonelada en su zona | SIAP |

## Verificado

- `npx vite build` pasa; `node --test src/glosario.test.js` pasa (4 pruebas).
- Capturas de las 6 preguntas en escritorio y celular, la de «¿Qué hago…?» y el botón flotante, contra la API real.

## No verificado

- Abrir y cerrar una palabra del glosario en un navegador de verdad (con mouse, teclado y lector de pantalla): las
  capturas son estáticas; solo se revisó el código.
- La voz de «Escuchar» en un celular.
- PDF, perfil y micrófono: no se tocaron, pero no se probaron a mano.
- La cifra grande sale de reglas sobre el texto; con otra redacción del servidor puede no salir (entonces no se muestra
  nada, no una cifra equivocada, salvo que la frase tenga otro número con unidad antes).

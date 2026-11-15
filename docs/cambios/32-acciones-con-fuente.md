# 32. Qué hacer, con fuente (`que_hacer`)

## Qué se hizo
Al agricultor le sirven más las **acciones** que los datos. Ahora cada respuesta de `POST /api/asistente` (y el evento `final` de `/stream`) trae un campo nuevo:

```json
"que_hacer": [
  { "accion": "texto corto imperativo", "porque": "una frase, con el dato real si hay", "fuente": "nombre", "url": "https://..." }
]
```

- Hasta **3** acciones. Lista vacía en saludos, fuera de tema, cuando el asistente pregunta agua/prioridad o cuando no supo contestar.
- No cambia `respuesta` ni ningún otro campo.
- Las acciones están en `server/data/acciones.json` (20 tarjetas, todas con la fuente **leída**). Las elige `accionesPara()` en `server/llm/acciones.js`.
- Investigación de qué preguntan los productores: `docs/investigacion-preguntas-agricultor.md` y banco de 90 preguntas en `server/test/eval/preguntas-investigadas.json`.

## Cómo elige
1. Entra una acción si coincide el **tema** de la respuesta o una **palabra** de la pregunta (las palabras pesan más).
2. Los **datos de la parcela** solo la suben de lugar, no la meten solos: si 1 de cada 5 años o más fue seco (NASA POWER) o el último lo fue, las acciones de año seco suben y su porqué empieza con «En tu parcela 6 de 25 años fueron secos…». Si lo último que sembró fue maíz, sube «rotar con leguminosa».
3. Se filtra por **cultivo** (una pregunta de frijol no recibe acciones del maíz) y por **estado** (el estado del perfil o el que se deduce de la longitud).
4. Producción para el Bienestar: con hectáreas y agua `temporal` en el perfil, el porqué dice el monto exacto de 2026 (tramos hasta 8 ha).

## Tabla: tema → acción → fuente

| Tema | Acción | Fuente (leída) |
|---|---|---|
| Siembra maíz | Sembrar con humedad de las primeras lluvias, no en seco | Mesa Técnica Agroclimática Edomex (SMN, INIFAP, CIMMYT), boletín 2 (2022) |
| Densidad maíz | 60-70 mil semillas/ha en temporal; 80-90 mil en riego | La misma |
| Lluvia tardía | Cambiar el maíz por un cultivo de 97 días o menos | La misma |
| Heladas | Si llueve temprano, adelantar la siembra del maíz | La misma |
| Rotación | Después del maíz, frijol, haba o avena | La misma |
| Heladas / pronóstico | Revisar el pronóstico por municipio del SMN | SMN (página existe; contenido dinámico no leído) |
| Siembra frijol | Fines de junio a mediados de julio (Bajío) | INIFAP Campo Experimental Bajío, Rev. Mex. Cienc. Agríc. 2014 |
| Semilla frijol | Variedades Dalia o Junio León | La misma |
| Año seco | Cultivos de poca agua: sorgo, frijol, garbanzo, cebada | Mesa Técnica Agroclimática Michoacán (Agricultura, CIMMYT), 2023 |
| Sequía actual | Revisar el Monitor de Sequía (día 15 y fin de mes), D0-D4 | SMN-CONAGUA |
| Cosecha de agua | Surcos o bordos en curvas a nivel (≥400 mm/año, suelo ≥70 cm) | FAO, Manual de Captación de Agua de Lluvia (cap. COLPOS México) |
| Rastrojo | No quemarlo; aprovecharlo en la parcela | SADER #MiParcelaNoSeQuema |
| Suelo | Mover poco la tierra y cubrir ≥30 % con rastrojo | FAO, Agricultura de conservación |
| Plagas (Gto) | Revisar el maíz cada semana; reportar cogollero al 800 987 987 9; solo productos COFEPRIS que indique un técnico | SENASICA + INIFAP Bajío + Comité Sanidad Vegetal Gto, boletín 19 (2025) |
| Plagas (Qro) | Igual | SENASICA, boletín Querétaro 14 (2025) |
| Seguro (Gto) | Si pierdes la cosecha, avisar al municipio para que registre tus hectáreas | Secretaría del Campo de Gto citada por Milenio (9 jun 2026) |
| Apoyos | Ventanilla de Producción para el Bienestar; 7,000 / 8,000 / 10,000 $ por tramo de temporal | Reglas de Operación 2026 (DOF) |
| Venta maíz | Acopio para el Bienestar: 7,000 $/t, hasta 5 ha y 35 t; INE y CURP | Reglas de Operación Acopio para el Bienestar 2026 (DOF) |
| Venta frijol | 27,000 $/t, hasta 30 ha de temporal | La misma |
| Insumos (Gto) | Revisar el listado de Fertilizantes para el Bienestar 2026 (gratis) | gob.mx (listado) + Publimetro 21 abr 2026 (CEDA y cultivos) |

## Ejemplos reales (servidor en `PORT=3071`, parcela de Celaya)
- «¿Cuáles fueron los años secos?» → cultivos de poca agua, Monitor de Sequía y ciclo corto si llueve tarde, cada una con «En tu parcela 6 de 25 años fueron secos…».
- «¿Cuándo siembro frijol?» → fecha INIFAP Bajío, variedades Dalia / Junio León.
- «¿Qué le echo al gusano cogollero del maíz?» → la respuesta se niega a dar dosis y la acción dice a quién llamar (SENASICA).
- «¿A cómo pagan el maíz?» → precio de acopio 2026.
- «hola» y «¿Quién ganó el partido?» → `que_hacer: []`.

## Cómo probarlo
`cd server && node --test` (pruebas en `test/acciones.test.js`: fuente y url en cada acción, relevancia por tema, nada de dosis ni nombres de agroquímicos, y la ruta real).

## Qué NO se verificó o falta
- **No hay fechas ni densidad de maíz de temporal oficiales del Bajío guanajuatense.** Se usó la Mesa Agroclimática del Estado de México (con INIFAP y CIMMYT), y se dice en la nota de la tarjeta. La Agenda Técnica de INIFAP de Guanajuato/Querétaro no se pudo descargar.
- El seguro catastrófico solo tiene fuente de **prensa** (cita a la Secretaría del Campo de Gto). De **Querétaro** no se encontró procedimiento: no hay tarjeta.
- Fertilizantes para el Bienestar: solo Guanajuato. Los CEDA y la lista de cultivos vienen de una nota de prensa.
- FIRA / crédito y canícula: no hay tarjeta (no se leyó una fuente oficial que diga qué hacer).
- No se pudieron leer foros de productores (piden cuenta). El banco de 90 preguntas es «fiel», no textual.
- **El detector de temas manda «apoyos» y «Producción para el Bienestar» a fuera de tema**, así que la acción de apoyos casi no sale. Arreglarlo es cambiar `DENTRO` en `llm/respuestas.js` (no se tocó).
- La plantilla de siembra todavía dice «No tengo fechas de siembra verificadas para el Bajío» aunque la acción del frijol sí la trae. No se cambió el texto de `respuesta` (fuera del alcance).
- Las fuentes se leyeron una vez (14 nov 2026). Montos y precios de 2026 cambian cada año: revisar en enero.

# Contrato de la API y del motor

Este documento es la referencia común para front, back y motor. **Si necesitas cambiar una forma de JSON o la firma de una función, avisa al equipo y cambia primero este archivo.**

Los ejemplos de `/api/clima` y `/api/suelo` son respuestas reales del punto demo (Celaya, Gto., 20.47, -100.81).

## Reglas generales

- Base: `http://localhost:3001`. Desde el client se llama como `/api/...` (Vite lo redirige).
- **`lat` y `lon` son el centro de la parcela que dibujó el agricultor** (ver "Selección de la parcela" abajo). El servidor sigue recibiendo un punto.
- El servidor redondea `lat` y `lon` según la fuente: el clima a 2 decimales (más o menos 1 km; NASA POWER mide cada ~50 km), y el suelo y el relieve (`/api/terreno`) a 3 (más o menos 110 m; SoilGrids tiene cuadros de 250 m). Esa es también la resolución de la caché. La respuesta repite el `lat` y `lon` tal como llegaron, menos `/api/terreno`, que regresa el centro ya redondeado de su cuadro.
- Las claves del JSON van en español; el código (variables y funciones) en inglés.
- **Errores:** siempre `{ "error": "mensaje en español que se le puede mostrar al agricultor" }`.

| Código | Cuándo |
|--------|--------|
| 400 | Falta `lat`/`lon`, no son números o están fuera de rango. |
| 404 | La ruta no existe. |
| 422 | `POST /api/recomendar` con una parcela fuera de Guanajuato y Querétaro; el cuerpo trae además `"fuera_de_region": true`. |
| 502 | No se pudo consultar la fuente externa y no hay caché ni fixture para ese punto. |
| 500 | Error inesperado del servidor. |

- **`origen`** dice de dónde salió el dato:
  - `"api"`: recién consultado a la fuente.
  - `"cache"`: guardado en `server/cache/` por una consulta anterior.
  - `"fixture"`: copia de respaldo versionada en `server/fixtures/` (solo existe para `FIXTURE_POINTS` en `server/lib/seasons.js`: las parcelas de `GET /api/ejemplos` y 3 más).
- El orden de búsqueda es caché → API → fixture → 502. Con `OFFLINE=1` se salta la API.

## Selección de la parcela (front)

**Cambio del 14 de noviembre:** el agricultor ya no marca un punto. **Dibuja el contorno de su parcela** en el mapa.

- Cada clic en el mapa agrega una esquina. Con 3 o más esquinas ya hay parcela.
- Debe poder deshacer la última esquina y borrar todo para empezar de nuevo.
- El front calcula el centro y lo manda como `lat` y `lon`. Basta el promedio de las esquinas: el suelo se consulta a 3 decimales (más o menos 110 m), así que el centro sí debe caer dentro de la parcela.
- **El back, el motor y el asistente no cambian.** NASA POWER y SoilGrids se consultan por punto y una parcela es mucho más chica que su resolución.
- Se hace con **MapLibre GL** (`client/src/map/ParcelMap.jsx`), con imagen satelital de Esri y el relieve de AWS Terrain Tiles. Cambio del 14 de noviembre: antes decía react-leaflet.
- Si el mapa está muy lejos (zoom < 13), el clic acerca el mapa en lugar de poner una esquina.
- **Con GPS ("caminar la orilla"):** "Usar mi ubicación" lleva el mapa a donde está el agricultor (punto azul con círculo de precisión). Parado en cada esquina de su parcela toca "Marcar esquina donde estoy". No deja marcar si el GPS da más de ±30 m de error ni si está a menos de 5 m de la esquina anterior (`checkGpsCorner` en `client/src/map/polygon.js`).
- El navegador solo da la ubicación en **https** o en `localhost`. Abierto desde un celular con `http://192.168...` el botón no aparece y se explica por qué.
- **Con un toque ("Detectar con un toque"):** el agricultor toca dentro de su parcela y la app propone el contorno. `client/src/map/detect.js` analiza la foto satelital (zoom 17, 3 × 3 teselas, unos 860 m por lado) en el navegador: crece una región desde el toque y se detiene en los caminos (capa Esri World Transportation leída en zoom 15, porque más cerca Esri solo dibuja los nombres) y en las líneas fuertes de la foto (brechas y bordos). El resultado son esquinas numeradas normales, que se pueden arrastrar; "Más chica" y "Más grande" cambian la tolerancia.
  - Es **visión por computadora clásica** (suavizado, bordes Sobel, crecimiento de región, contorno y simplificación), **no** una red neuronal entrenada. Es una ayuda: en campos de color parecido puede juntar dos parcelas o marcar solo una franja, y por eso siempre se revisa antes de guardar. No cambia la API.
- Al tocar "Usar esta parcela", el mapa se ajusta al contorno (`fitBounds`, inclinado para ver el relieve).
- **Varias parcelas.** El agricultor puede dibujar más de una ("Dibujar otra parcela") y elegir el cultivo de cada una. La app guarda `parcelas: [{ id, contorno: [[lon, lat], ...], hectareas, cultivo }]` (`client/src/map/parcels.js`). A la API se manda **un solo punto**: el promedio de todas las esquinas. Cambiar el cultivo de una parcela no vuelve a pedir clima ni suelo.
- Si una parcela nueva se encima con otra, se avisa (no se bloquea). En la vista 3D, donde se enciman, se siembra la más reciente.
- **Secciones en 3D:** con 2 o más parcelas, la vista 3D deja elegir "Parcela 1", "Parcela 2"… o "Todas juntas". Cada sección es su propia maqueta **centrada en sus parcelas y del tamaño que necesitan** (250 m a 4 km) y con su propio `/api/terreno`; solo se dibuja la sección elegida. Al guardar una parcela nueva se muestra esa. Si juntas no caben en 4 km, se avisa que juntas no caben y conviene verlas una por una.
- **Parcelas levantadas en el mapa:** cada parcela guardada se ve como un bloque de tierra sobre el satélite (capas `fill-extrusion` de MapLibre): lados del color del suelo de SoilGrids y encima el color del cultivo. Al guardarla, el mapa pasa a "Relieve 3D" y el bloque sube (sin animación con "reducir movimiento"). La altura crece con la parcela (6 a 40 m, `raiseHeight`); cada parcela nueva queda 1.5 m más alta, y con el relieve se compensa la altura del terreno en el centro de cada una para que una sección dibujada adentro de otra siempre se vea encima.
- **Corregir esquinas:** los números de las esquinas se pueden arrastrar mientras se dibuja. Una parcela ya guardada se corrige con "Corregir" en "Tus parcelas": sus esquinas vuelven como números arrastrables y "Guardar cambios" recalcula hectáreas y centro (y vuelve a pedir clima y suelo).
- **El mapa sigue los años:** hay un solo año para toda la página (`useYearPlayer` en `client/src/year.jsx`); el control junto al mapa y el de la vista 3D mueven el mismo. En años secos la capa del cultivo de cada parcela levantada se pone color paja y más delgada; arriba del mapa se ve "2011 · año seco · 398 mm". Todo sale de `/api/clima`, no hay datos inventados.
- **Cultivos y clima sobre el satélite:** encima de cada bloque levantado se paran los modelos de Blender del cultivo de esa parcela (capa propia de MapLibre con three.js, `client/src/map/cropLayer.js`), más grandes que en la vida real para que se lean desde el aire. Siguen el año: en años secos son más chaparros y color paja. Con "Clima animado" llueve sobre las parcelas en años normales o buenos (más fuerte entre más llovió) y hay polvo en años secos; la animación se detiene si el mapa no está en pantalla y no existe con "reducir movimiento".
- **Climas en el mapa** (`client/src/weather.js`): Soleado, Normal, Nublado, Lluvia, Tormenta y Sequía, más "Sin clima". Con **"Según el año"** (el predeterminado) se elige con la lluvia real de junio a septiembre comparada con la mediana de la parcela: seco (< 80 %) → Sequía, < 90 % → Soleado, < 110 % → Normal, < 130 % → Lluvia, más → Tormenta. Los climas elegidos a mano se marcan en el mapa como "vista de ejemplo": no son datos.
- **Tipo de vista:** "Aérea" (desde arriba, sin inclinación ni giro, para dibujar) o "Relieve 3D" (inclinada con relieve). Al tocar "Dibujar otra parcela" el mapa regresa a "Aérea".
- `cultivo` en cada parcela es solo para mostrar en el mapa y la maqueta. En la pantalla de Rotación las parcelas toman el cultivo del año elegido del plan.
- Los botones de ejemplo salen de `GET /api/ejemplos` y mandan su `lat` y `lon` directo, sin dibujar.
- **Varias parcelas, un solo punto:** a la API se manda el centro de la **parcela más grande** (`farmPoint` en `client/src/map/parcels.js`), para que el clima y el suelo se lean dentro de una parcela real. Hay una sola recomendación por terreno.
- **El front no redondea las coordenadas:** las manda tal cual y el servidor redondea por fuente.
- **Capas de la NASA sobre el mapa** (`client/src/config/mapLayers.js`): color real y NDVI de MODIS Terra y humedad de SMAP, desde NASA GIBS. Solo son visuales y muestran la región (cuadros de 250 m o de 9 km), no el detalle de la parcela.

## GET /api/health

```json
{ "ok": true }
```

## GET /api/ejemplos

Las parcelas de los botones de ejemplo, con los mismos `id` y `boton` del diseño del front. Todas tienen fixture, así que funcionan sin internet. Para agregar o mover una, se cambia `EXAMPLE_POINTS` en `server/lib/seasons.js` y se corre `npm run fixtures`; el front no cambia.

```json
[
  { "id": "celaya", "nombre": "Celaya, Gto.", "boton": "Celaya, Gto. (Temporal)", "lat": 20.47, "lon": -100.81 },
  { "id": "marques", "nombre": "El Marqués, Qro.", "boton": "El Marqués, Qro. (Sequía)", "lat": 20.7, "lon": -100.27 },
  { "id": "salamanca", "nombre": "Salamanca, Gto.", "boton": "Salamanca, Gto. (Riego)", "lat": 20.6, "lon": -101.23 }
]
```

- Los puntos son tierra de cultivo a unos km del centro de cada ciudad, revisada en imagen satelital. Los centros (Celaya 20.52, -100.81; Querétaro 20.59, -100.39; Salamanca 20.57, -101.19) son zona urbana y SoilGrids no da suelo ahí.

## GET /api/clima?lat=20.47&lon=-100.81

Fuente: NASA POWER, serie mensual 2000–2024.

```jsonc
{
  "lat": 20.47,
  "lon": -100.81,
  "origen": "api",
  "periodo": { "inicio": 2000, "fin": 2024 },
  "meses_pv": [6, 7, 8, 9],
  "lluvia_pv_anual": [
    { "anio": 2000, "lluvia_mm": 361, "seco": true },
    { "anio": 2001, "lluvia_mm": 571.4, "seco": false }
    // ... un elemento por año, 25 en total
  ],
  "lluvia_pv_mediana_mm": 528.9,
  "umbral_seco_mm": 423.2,
  "anios_secos": [2000, 2005, 2011, 2020, 2022, 2023],
  "temp_media_mensual": [
    { "mes": 1, "t_media_c": 13.4, "t_max_c": 25.9, "t_min_c": 1.5 }
    // ... 12 meses
  ],
  "lluvia_media_mensual": [
    { "mes": 1, "lluvia_mm": 8.6 }
    // ... 12 meses
  ],
  "fuente": "NASA POWER (Prediction Of Worldwide Energy Resources), NASA Langley Research Center, comunidad AG"
}
```

| Campo | Qué es |
|-------|--------|
| `lluvia_pv_anual[].lluvia_mm` | Lluvia total de los meses de `meses_pv` en ese año, en mm. Un año con algún mes faltante no aparece. |
| `lluvia_pv_mediana_mm` | Mediana de la lluvia de PV de todos los años. |
| `umbral_seco_mm` | 80 % de la mediana (`DRY_YEAR_RATIO` en `server/lib/seasons.js`). |
| `seco` / `anios_secos` | Años con lluvia de PV por debajo del umbral. |
| `temp_media_mensual[].t_media_c` | Promedio (de todos los años) de la temperatura media del mes. |
| `t_max_c`, `t_min_c` | Promedio (de todos los años) de **la hora más caliente y la más fría del mes**. |
| `lluvia_media_mensual[].lluvia_mm` | Promedio (de todos los años) de la lluvia del mes. |

**Ojo con dos cosas:**

1. **`t_max_c` y `t_min_c` son extremos, no promedios diarios.** En la API mensual de POWER, `T2M_MAX` y `T2M_MIN` son la temperatura horaria más alta y más baja de todo el mes. Para el ajuste de temperatura de un cultivo usen `t_media_c`. Los extremos sirven para heladas o golpes de calor.
2. **"Año seco" aquí es general, sin cultivo.** El riesgo de cada cultivo (motor) no usa este umbral: compara la lluvia de cada año contra el mínimo de ese cultivo, como pide CLAUDE.md.

## GET /api/suelo?lat=20.47&lon=-100.81

Fuente: SoilGrids 2.0 (ISRIC). Promedio de 0 a 30 cm, ponderado por el espesor de cada capa (0–5, 5–15, 15–30 cm).

```json
{
  "lat": 20.47,
  "lon": -100.81,
  "origen": "api",
  "profundidad_cm": "0-30",
  "ph": 7.4,
  "arcilla_pct": 42.4,
  "arena_pct": 37.2,
  "limo_pct": 20.4,
  "carbono_organico_g_kg": 12.1,
  "nitrogeno_g_kg": 1.48,
  "sin_datos": false,
  "aviso": null,
  "fuente": "SoilGrids 2.0, ISRIC World Soil Information (CC BY 4.0)"
}
```

- **`sin_datos: true`**: SoilGrids respondió pero no tiene suelo en ese punto (ciudades y cuerpos de agua están enmascarados). En ese caso los valores vienen en `null` y `aviso` trae un texto para mostrar. Pasa, por ejemplo, en el centro de Celaya (20.52, -100.81). El front y el motor deben aguantar `null`.

## GET /api/terreno?lat=20.47&lon=-100.81&lado=1000

Relieve del cuadro alrededor de la parcela, para la vista 3D. `lado` (opcional, en metros) se redondea hacia arriba a 250, 500, 1000, 2000 o 4000; sin él es 1000. Fuente: AWS Terrain Tiles (Mapzen, codificación *terrarium*, zoom 14, o 13 para 4 km); en México las alturas vienen de NASA SRTM (~30 m), así que la malla es una interpolación suave: sirve para una maqueta, no para topografía.

```jsonc
{
  "lat": 20.47,
  "lon": -100.81,
  "origen": "fixture",
  "tam": 65,                 // la malla es de 65 x 65 alturas
  "lado_m": 1000,            // lado del cuadro, centrado en la parcela
  "altura_centro_m": 1752,
  "altura_min_m": 1746.8,
  "altura_max_m": 1766.2,
  "desnivel_m": 19.4,
  "alturas": [1752.4, 1751.9 /* ... 4225 valores en m */],
  "fuente": "AWS Terrain Tiles (Mapzen, Registry of Open Data on AWS); en México las alturas vienen de NASA SRTM"
}
```

- `alturas[fila * tam + col]`: la fila 0 es el borde **norte** y la columna 0 el borde **oeste**.
- **Se centra a 3 decimales (unos 110 m), no a 2 como clima y suelo.** El bloque mide 1 km: con 2 decimales una parcela podía quedar hasta ~550 m fuera del centro y salirse de su propia maqueta.
- **La maqueta toma el tamaño de la parcela:** el cliente pide el lado más chico que contiene las parcelas de la sección, con 10 % de margen por lado (`blockSide` en `client/src/map/parcels.js`). Una parcela de 0.3 ha se ve en un cuadro de 250 m; un punto sin parcela dibujada, en el de 1 km. Las plantas y la casa se achican con el cuadro para no verse gigantes.
- Se guarda en caché ya procesada (no las 4 imágenes PNG originales) en `server/cache/terrain_<lat3>_<lon3>.json` para 1 km y `terrain<lado>_<lat3>_<lon3>.json` para los otros tamaños (el fixture de Celaya es `terrain_20.470_-100.810.json`, de 1 km).

## POST /api/recomendar

Lo calcula el motor de reglas (`server/engine/`) con el clima de NASA POWER, el suelo de SoilGrids y `server/data/cultivos.json`.

Petición:

```json
{ "lat": 20.47, "lon": -100.81, "agua": "temporal", "prioridad": "riesgo" }
```

- `agua`: `"temporal"` o `"riego"`.
- `prioridad`: `"ganar"`, `"suelo"`, `"agua"` o `"riesgo"`.
- `estado` (opcional): `"Guanajuato"` o `"Querétaro"`, para el ingreso del SIAP. Si no viene, sale de los límites oficiales del INEGI (`server/lib/state.js`).

Respuesta (valores reales del punto demo, recortados):

```jsonc
{
  "clima": { /* igual que GET /api/clima */ },
  "suelo": { /* igual que GET /api/suelo */ },
  "estado": "Guanajuato",
  "agua": "temporal",
  "prioridad": "riesgo",
  "cultivos": [
    {
      "id": "frijol",
      "nombre": "Frijol",
      "temporada": "PV",     // la temporada en que mejor sale
      "puntaje": 90,         // 0 a 100, más alto es mejor
      "riesgo": 0.12,        // 0 a 1: parte de los años en que la lluvia de su ciclo no alcanzó su mínimo
      "razones": [
        "En 3 de 25 años llovió menos de lo que este cultivo necesita aquí (300 mm de junio a agosto).",
        "En un año normal llueven 399 mm en su ciclo; necesita entre 300 y 500 mm.",
        "La temperatura media está en su rango (18 a 26 °C) en 3 de 3 meses de su ciclo (de junio a agosto).",
        "El pH de tu suelo (7.4) está dentro de lo que prefiere (6 a 7.5)."
        // ... textura, leguminosa e ingreso bruto del SIAP
      ]
    }
    // ... sorgo (81) y maíz (64, riesgo 0.48)
  ],
  "rotacion": [
    { "anio": 1, "temporada": "PV", "cultivo": "frijol", "porque": "Es el que mejor queda en tu parcela para lo que pediste (90 de 100). ..." },
    { "anio": 2, "temporada": "PV", "cultivo": "sorgo", "porque": "Va después de frijol: cambiar de familia ayuda a cortar plagas y enfermedades. ..." },
    { "anio": 3, "temporada": "PV", "cultivo": "frijol", "porque": "..." }
  ],
  "fuentes": ["NASA POWER ...", "SoilGrids 2.0 ...", "SIAP ...", "Requerimientos de los cultivos: valores aproximados (estilo FAO Ecocrop), sin verificar"]
}
```

- `cultivos` va ordenado de mayor a menor `puntaje`, una fila por cultivo. Solo salen los que se pueden sembrar con esa `agua`.
- `rotacion` trae 3 años; con riego hay 6 filas (PV y OI de cada año).
- **Sin suelo también responde:** si SoilGrids falla o no tiene dato, `suelo.sin_datos` es `true`, `suelo.aviso` lo explica y el pH no cambia el puntaje.
- Errores: 400 si falta `agua` o `prioridad`; 502 si no se pudo consultar el clima; 422 con `{ error, fuera_de_region: true }` si la parcela está fuera de Guanajuato y Querétaro (sin `estado`). El 422 sale antes de consultar NASA o SoilGrids. Las pantallas siguen mostrando clima y suelo con `/api/clima` y `/api/suelo`, que funcionan en cualquier punto.
- El asistente (`POST /api/asistente`) contesta "¿qué siembro?" con esta misma recomendación.

## Motor de reglas (`server/engine/index.js`)

Funciones puras, sin red ni disco, con pruebas en `server/test/engine.test.js`.

| Dato | De dónde sale | Forma |
|------|---------------|-------|
| `rows` | `getClimate(lat, lon)` en `server/sources/nasaPower.js` | Una fila por mes: `{ year, month, t_mean_c, t_max_c, t_min_c, rain_mm, solar, root_wetness }`. Los faltantes vienen en `null`. |
| `soil` | el resumen de `/api/suelo` | `ph`, `arcilla_pct`… pueden ser `null`. |
| `crops` | `server/data/cultivos.json` | Esquema de CLAUDE.md. |
| `ingresos` | `incomeByCrop(estado, agua)` en `server/llm/siap.js` | `{ "<id>|<PV u OI>": pesos por hectárea }`, promedio 2018 a 2024 del estado. |

```js
cycleMonths(crop, temporada)   // meses del ciclo: PV se siembra en junio y OI en noviembre
scoreCrop(crop, temporada, { rows, soil, agua }) // -> { temp, lluvia, suelo, ... } cada ajuste de 0 a 1
dryYearRisk(crop, rows)        // -> { riesgo: 0..1, anios_bajo_minimo: number[], anios_total }
totalScore(components, prioridad) // -> puntaje de 0 a 100
buildRotation(candidates, { agua }) // -> [{ anio, temporada, cand }]
buildReasons(candidate, { agua, soil, estado }) // -> string[] en español con números reales
recommend({ rows, soil, crops, agua, prioridad, ingresos, estado }) // -> { cultivos, rotacion }
```

**Cómo califica**

- **Temperatura:** parte de los meses del ciclo cuya temperatura media (promedio de todos los años) cae en el rango del cultivo.
- **Lluvia** (solo en temporal): la lluvia de un año normal (mediana) en los meses del ciclo, contra el rango del cultivo.
- **Suelo:** el pH contra el rango; un punto de pH fuera lo lleva a cero. La textura va solo como nota.
- **Riesgo:** años en que la lluvia del ciclo quedó bajo el mínimo del cultivo. Con riego no se calcula.
- **Puntaje:** 30 % es qué tan bien se da el cultivo ahí (los tres ajustes) y de 40 a 50 % es la prioridad del agricultor: `riesgo` (menos años malos), `suelo` (leguminosas), `agua` (menor mínimo de lluvia) o `ganar` (ingreso bruto por hectárea del SIAP, sin descontar costos).
- **Rotación:** en cada temporada entra el mejor cultivo que no repita la familia de la temporada anterior, primero los que aún no se usan. Si no quedó ninguna leguminosa, se mete la mejor donde menos puntos cueste.

**Pendientes de `cultivos.json`** (todo está con `"verificado": false`)

1. Confirmar contra FAO Ecocrop los rangos de temperatura, lluvia y pH y la duración del ciclo. Hoy son los valores ilustrativos de la maqueta del diseño. Ojo: con el rango actual el sorgo sale bajo en temperatura (1 de 4 meses en rango en Celaya).
2. `temporadas` y `agua` salen de lo que el SIAP reporta sembrado en Guanajuato. Trigo, cebada y garbanzo quedaron como OI con riego; hay trigo y cebada de temporal (unas 13 mil ha cada uno) que el esquema actual no puede expresar.
3. El brócoli gana en `ganar` con riego porque su ingreso bruto es muy alto; no hay costos para compararlo con los granos.

## Puntos que estaban abiertos (ya resueltos)

1. **Ventana de lluvia.** La lluvia se compara contra los meses del ciclo de cada cultivo, empezando en junio.
2. **Prioridad `ganar`.** Usa el ingreso bruto promedio por hectárea del SIAP (2018 a 2024, por estado).
3. **Suelo sin datos.** El motor recomienda sin pH y lo dice en las razones.

## POST /api/asistente (propuesta del rol LLM, avisar al equipo)

Asistente que responde con los datos de la parcela, con un modelo local (Ollama + Gemma). Funciona sin internet si la parcela ya está en caché.

Petición: `{ "lat": 20.47, "lon": -100.81, "pregunta": "¿Cuáles fueron los años secos?" }`
- `pregunta` es opcional (máx. 300 letras). Sin ella devuelve el **resumen inicial** de la parcela.

Respuesta:
```json
{
  "respuesta": "Los años secos fueron 2000, 2005, 2011, 2020, 2022 y 2023 [NASA POWER].",
  "acciones": [ { "tipo": "resaltar_anios_secos" } ],
  "fuentes": ["NASA POWER"],
  "verificado": true,
  "origen": "llm"
}
```
- `origen`: `"llm"` (lo redactó el modelo y pasó el verificador de números) o `"plantilla"` (el modelo falló o inventó un número; texto fijo del servidor).
- `acciones` (el front las ejecuta, ignora las que no conozca): `zoom_parcela`, `zoom_region`, `resaltar_anios_secos`.
- Errores: 400 si faltan `lat`/`lon` o la pregunta es inválida; 502 si no hay datos de esa parcela. Si el modelo falla **no** es error: responde con la plantilla.

## POST /api/voz (propuesta del rol LLM)

`Content-Type: application/octet-stream`. Cuerpo: audio **mono a 16 kHz en Float32 little-endian** (el front lo remuestrea con `AudioContext`). Máx. 30 s. Respuesta: `{ "texto": "..." }`. Mostrar el texto al usuario antes de mandarlo a `/api/asistente`.

## GET /api/pronostico?lat=20.47&lon=-100.81 (propuesta del rol LLM)

Próximos 7 días, de Open-Meteo (gratis, CC BY 4.0, solo uso no comercial). Es un extra: **sin internet ni caché no es error**, responde `disponible: false`.

```json
{ "lat": 20.47, "lon": -100.81, "disponible": true, "origen": "api",
  "obtenido": "2026-11-14T18:59:01.279Z",
  "dias": [ { "fecha": "2026-11-14", "lluvia_mm": 0, "prob_lluvia_pct": 18, "t_max_c": 23.2, "t_min_c": 12.3 } ],
  "fuente": "Open-Meteo.com (datos CC BY 4.0)" }
```
- `origen`: `"api"` o `"cache"` (la caché se reusa 3 horas; sin internet se usa la última, mira `obtenido`).
- Con `disponible: false` solo vienen `lat`, `lon` y `aviso`.
- El asistente usa este pronóstico dentro de su ficha; `fuentes` puede traer `"Open-Meteo"`.

### Campos extra de `/api/asistente` (preguntas generales)
- `base`: `"ficha"` (solo datos de la parcela), `"conocimiento"` (usó la base local) o `"internet"` (usó Wikipedia).
- `enlaces`: páginas consultadas (vacío salvo `base: "internet"`). Mostrar el enlace y avisar que no lo verifica la app.
- `fuentes` ahora puede incluir `"Base local"` y `"Wikipedia"`.

### Campos extra de `/api/asistente` (recomendador y conversación)
Petición: `agua` ("temporal"|"riego"), `prioridad` ("ganar"|"suelo"|"agua"|"riesgo"), `estado` ("Guanajuato"|"Querétaro"; si falta sale de los límites del INEGI) e `historial` (últimas 2 vueltas `{pregunta, respuesta}`).
Respuesta nueva para "¿qué me conviene sembrar?": `origen: "motor"`. Si falta `agua` o `prioridad` trae `preguntar: { campo, opciones: [{valor, texto}] }` (mostrar botones y repetir la petición con ese campo). Con los dos trae `recomendacion`, que es **la misma respuesta de `/api/recomendar`** (el motor de reglas), y en temporal `corroboracion` (años secos de NASA contra años de pérdidas del SIAP).

### Perfil de la parcela (propuesta del rol LLM)
`GET /api/perfil/preguntas` → `{ preguntas: [{ campo, pregunta, porque, opciones: [{valor, texto}], obligatoria?, tipo?, min?, max? }] }`.
En `POST /api/asistente` se manda `perfil: { agua, prioridad, estado, ultimo_cultivo, hectareas, textura, encharca }` (todos opcionales; "no_se" se ignora; valor inválido = 400). Desde que el chat usa el motor de reglas, la recomendación ya no cambia con `ultimo_cultivo`, `hectareas`, `textura` ni `encharca`, y la respuesta ya no trae `afinar`, `prediccion` ni `recomendacion_finca` (con varias parcelas hay una sola recomendación por terreno). El recomendador del SIAP (`server/llm/recomendador.js`) sigue en el repo con sus pruebas, pero ninguna ruta lo usa para recomendar.
`GET /api/pronostico`: cada día trae `codigo_clima` (código WMO del día, o null) para la vista 3D.

### Riesgo del maíz con el modelo entrenado (`/api/asistente`)
Con una pregunta sobre **maíz** y riesgo, lluvia o pérdidas, la respuesta trae `origen: "modelo"` y `riesgo_modelo`: `{ cultivo, estado, confianza: "media"|"baja", escenarios: [{ nombre, lluvia_mm, siniestro_pct, nivel }], validacion, lectura, aviso }`. Tres escenarios (año seco, normal y lluvioso, sacados de los 25 años de la parcela). **Es riesgo estimado dado el clima, no un pronóstico.** Solo maíz; Querétaro con confianza media y Guanajuato con confianza baja.

### Frutales (`GET /api/frutales?estado=Guanajuato|Querétaro`, estado opcional)
Devuelve `{ frutales: [{ estado, cultivo, tipo, unidad, sembrada_ha_2024, cosechada_ha_2024, rendimiento_2024, siniestrada_pct_2018_2024, precio_rural_2024, precio_cambio_pct, valor_millones_2024, riego_pct_2024, municipios_2024[] }], no_es[], no_verificado, fuente }`. 404 con `{ error }` si el estado no es Guanajuato ni Querétaro. Solo datos del SIAP; tiempos de producción, costos y requisitos agronómicos **no están verificados**.

### Parcela fuera de Guanajuato y Querétaro
`POST /api/asistente` sin `estado`, con una pregunta de recomendación y una ubicación fuera de ambos estados (límites del INEGI, igual que `/api/recomendar`): responde 200 con un texto de aviso y **sin** `recomendacion`.

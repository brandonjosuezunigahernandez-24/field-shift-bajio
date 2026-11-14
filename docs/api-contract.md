# Contrato de la API y del motor

Este documento es la referencia común para front, back y motor. **Si necesitas cambiar una forma de JSON o la firma de una función, avisa al equipo y cambia primero este archivo.**

Los ejemplos de `/api/clima` y `/api/suelo` son respuestas reales del punto demo (Celaya, Gto., 20.47, -100.81).

## Reglas generales

- Base: `http://localhost:3001`. Desde el client se llama como `/api/...` (Vite lo redirige).
- **`lat` y `lon` son el centro de la parcela que dibujó el agricultor** (ver "Selección de la parcela" abajo). El servidor sigue recibiendo un punto.
- `lat` y `lon` se redondean a 2 decimales (más o menos 1 km). Esa es también la resolución de la caché.
- Las claves del JSON van en español; el código (variables y funciones) en inglés.
- **Errores:** siempre `{ "error": "mensaje en español que se le puede mostrar al agricultor" }`.

| Código | Cuándo |
|--------|--------|
| 400 | Falta `lat`/`lon`, no son números o están fuera de rango. |
| 404 | La ruta no existe. |
| 501 | `/api/recomendar` todavía no está implementado (fase 2). |
| 502 | No se pudo consultar la fuente externa y no hay caché ni fixture para ese punto. |
| 500 | Error inesperado del servidor. |

- **`origen`** dice de dónde salió el dato:
  - `"api"`: recién consultado a la fuente.
  - `"cache"`: guardado en `server/cache/` por una consulta anterior.
  - `"fixture"`: copia de respaldo versionada en `server/fixtures/` (solo existe para el punto demo).
- El orden de búsqueda es caché → API → fixture → 502. Con `OFFLINE=1` se salta la API.

## Selección de la parcela (front)

**Cambio del 14 de noviembre:** el agricultor ya no marca un punto. **Dibuja el contorno de su parcela** en el mapa.

- Cada clic en el mapa agrega una esquina. Con 3 o más esquinas ya hay parcela.
- Debe poder deshacer la última esquina y borrar todo para empezar de nuevo.
- El front calcula el centro y lo manda como `lat` y `lon`. Basta el promedio de las esquinas: el servidor redondea a 2 decimales (más o menos 1 km), así que un centro más exacto no cambia el resultado.
- **El back, el motor y el asistente no cambian.** NASA POWER y SoilGrids se consultan por punto y una parcela es mucho más chica que su resolución.
- Se hace con **MapLibre GL** (`client/src/map/ParcelMap.jsx`), con imagen satelital de Esri y el relieve de AWS Terrain Tiles. Cambio del 14 de noviembre: antes decía react-leaflet.
- Si el mapa está muy lejos (zoom < 13), el clic acerca el mapa en lugar de poner una esquina.
- Al tocar "Usar esta parcela", el mapa se ajusta al contorno (`fitBounds`, inclinado para ver el relieve).
- El objeto que recibe la app es `{ nombre, lat, lon, contorno: [[lon, lat], ...], hectareas }`. `contorno` y `hectareas` solo son para el front (mapa y vista 3D); a la API se mandan `lat` y `lon`.
- Los botones de ejemplo (Celaya, Gto.) siguen mandando su `lat` y `lon` directo.

## GET /api/health

```json
{ "ok": true }
```

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
2. **"Año seco" aquí es general, sin cultivo.** El riesgo de cada cultivo (motor, fase 2) no usa este umbral: compara la lluvia de cada año contra el mínimo de ese cultivo, como pide CLAUDE.md.

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

## GET /api/terreno?lat=20.47&lon=-100.81

Relieve del cuadro de 1 km alrededor de la parcela, para la vista 3D. Fuente: AWS Terrain Tiles (Mapzen, codificación *terrarium*, zoom 14); en México las alturas vienen de NASA SRTM (~30 m), así que la malla es una interpolación suave: sirve para una maqueta, no para topografía.

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
- Se guarda en caché ya procesada (no las 4 imágenes PNG originales) en `server/cache/terrain_<lat2>_<lon2>.json`.

## POST /api/recomendar (fase 2, hoy responde 501)

Petición:

```json
{ "lat": 20.47, "lon": -100.81, "agua": "temporal", "prioridad": "riesgo" }
```

- `agua`: `"temporal"` o `"riego"`.
- `prioridad`: `"ganar"`, `"suelo"`, `"agua"` o `"riesgo"`.

Respuesta (forma tomada de CLAUDE.md; **los valores de este ejemplo son de relleno, no son resultados reales**):

```jsonc
{
  "clima": { /* igual que GET /api/clima */ },
  "suelo": { /* igual que GET /api/suelo */ },
  "cultivos": [
    {
      "id": "sorgo",
      "nombre": "Sorgo grano",
      "puntaje": 0,          // 0 a 100, más alto es mejor
      "riesgo": 0,           // 0 a 1: parte de los años en que la lluvia de PV no alcanzó el mínimo del cultivo
      "razones": ["En X de 25 años llovió menos de lo que el sorgo necesita aquí."]
    }
  ],
  "rotacion": [
    { "anio": 1, "temporada": "PV", "cultivo": "sorgo", "porque": "..." }
  ],
  "fuentes": ["NASA POWER ...", "SoilGrids 2.0 ...", "FAO Ecocrop"]
}
```

`cultivos` va ordenado de mayor a menor `puntaje`. `rotacion` trae 3 años; con riego también hay filas de `"temporada": "OI"`.

## Contrato interno del motor (`server/engine/`)

Propuesta de firmas para que P2 y P3 trabajen en paralelo. **P2 y P3: confírmenla o cámbienla aquí antes de empezar.** Todas son funciones puras, sin red ni disco.

Entradas que ya existen (fase 1):

| Dato | De dónde sale | Forma |
|------|---------------|-------|
| `rows` | `getClimate(lat, lon)` en `server/sources/nasaPower.js` | Una fila por mes: `{ year, month, t_mean_c, t_max_c, t_min_c, rain_mm, solar, root_wetness }`. Los faltantes vienen en `null`. |
| lluvia por año | `seasonRainByYear(rows, months)` | `[{ year, rain_mm }]`; deja fuera los años incompletos. |
| `soil` | `summarizeSoil(soil)` en `server/sources/soilGrids.js` | El mismo objeto de `/api/suelo` (`ph`, `arcilla_pct`…, pueden ser `null`). |
| `crops` | `server/data/cultivos.json` (fase 2) | Esquema de CLAUDE.md. |

Funciones:

```js
// fit.js (P2). Cada ajuste va de 0 (malo) a 1 (ideal).
scoreCrop(crop, season, { rows, soil, agua }) // -> { temp, lluvia, suelo, notas: string[] }

// risk.js (P2)
dryYearRisk(crop, rows) // -> { riesgo: 0..1, anios_bajo_minimo: number[], anios_total: number }

// weights.js (P2)
totalScore(parts, risk, crop, prioridad) // -> puntaje de 0 a 100

// rotation.js (P3). ranked: cultivos ya ordenados por puntaje.
buildRotation(ranked, { agua }) // -> [{ anio, temporada, cultivo, porque }]

// reasons.js (P3)
buildReasons(crop, parts, risk) // -> string[] en español con números reales

// index.js (P3). Lo llama routes/recomendar.js.
recommend({ rows, soil, crops, agua, prioridad }) // -> { cultivos, rotacion }
```

## Puntos abiertos (decidir en equipo)

1. **Ventana de lluvia.** PV está definido como junio a septiembre, pero el ciclo de varios cultivos es más largo (mayo a octubre). Hay que decidir contra qué meses se compara `lluvia_ciclo_min_mm`.
2. **Prioridad `ganar`.** El esquema de `cultivos.json` no tiene dato de rendimiento ni de precio. Propuesta: un campo `valor_relativo` con datos de SIAP, sin verificar hasta que alguien lo confirme.
3. **Suelo sin datos.** Cuando `sin_datos` es `true`, ¿el motor recomienda sin pH (con una nota) o pide otro punto?

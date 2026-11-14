# Contrato de la API y del motor

Este documento es la referencia común para front, back y motor. **Si necesitas cambiar una forma de JSON o la firma de una función, avisa al equipo y cambia primero este archivo.**

Los ejemplos de `/api/clima` y `/api/suelo` son respuestas reales del punto demo (Celaya, Gto., 20.47, -100.81).

## Reglas generales

- Base: `http://localhost:3001`. Desde el client se llama como `/api/...` (Vite lo redirige).
- **`lat` y `lon` son el centro de la parcela que dibujó el agricultor** (ver "Selección de la parcela" abajo). El servidor sigue recibiendo un punto.
- El servidor redondea `lat` y `lon` según la fuente: el clima a 2 decimales (más o menos 1 km; NASA POWER mide cada ~50 km) y el suelo a 3 (más o menos 110 m; SoilGrids tiene cuadros de 250 m). Esa es también la resolución de la caché. La respuesta repite el `lat` y `lon` tal como llegaron.
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
  - `"fixture"`: copia de respaldo versionada en `server/fixtures/` (solo existe para `FIXTURE_POINTS` en `server/lib/seasons.js`: las parcelas de `GET /api/ejemplos` y 3 más).
- El orden de búsqueda es caché → API → fixture → 502. Con `OFFLINE=1` se salta la API.

## Selección de la parcela (front)

**Cambio del 14 de noviembre:** el agricultor ya no marca un punto. **Dibuja el contorno de su parcela** en el mapa.

- Cada clic en el mapa agrega una esquina. Con 3 o más esquinas ya hay parcela.
- Debe poder deshacer la última esquina y borrar todo para empezar de nuevo.
- El front calcula el centro y lo manda como `lat` y `lon`. Basta el promedio de las esquinas: el suelo se consulta a 3 decimales (más o menos 110 m), así que el centro sí debe caer dentro de la parcela.
- **El back, el motor y el asistente no cambian.** NASA POWER y SoilGrids se consultan por punto y una parcela es mucho más chica que su resolución.
- Sin librería nueva: con react-leaflet alcanza (`useMapEvents` para los clics y `<Polygon>` para pintarla).
- Los botones de ejemplo (Celaya, Gto.) siguen mandando su `lat` y `lon` directo.

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

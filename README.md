# Field Shift Bajío

Proyecto del **NASA Space Apps Challenge 2026**, sede Querétaro. Reto: *Field Shift: Adapting Farms with NASA Data*.

Una herramienta para el agricultor de **temporal** del Bajío (Guanajuato y Querétaro): marca tu parcela, di qué te importa más, y te propone una rotación de cultivos de 3 años que cuida el suelo y aguanta el clima. El riesgo se calcula con los **años secos reales** de tu parcela (25 años de datos de la NASA), no con un promedio.

> Este README está en español mientras dura el evento. La versión final de entrega irá en inglés.

## Estado

**Fase 1 lista:** esqueleto de server y client, clima y suelo por punto con caché en disco y respaldo sin internet.

| Fase | Qué incluye | Estado |
|------|-------------|--------|
| F1 | Esqueleto, `/api/clima`, `/api/suelo`, caché y fixture de Celaya | Lista |
| F2 | `cultivos.json`, motor de reglas con pruebas, `/api/recomendar`, mapa y formulario | Pendiente |
| F3 | Integración de punta a punta con una parcela real | Pendiente |
| F4 | Explicaciones, gráfica, errores y estados de carga | Pendiente |
| F5 | README en inglés con capturas y créditos completos | Pendiente |

Las tareas de cada fase y el reparto del equipo están en [docs/plan.md](docs/plan.md).

## Cómo correrlo

Necesitas **Node.js 20 o más nuevo** (probado con Node 24). No hace falta ninguna API key ni base de datos.

Se usan dos terminales. En la primera, el servidor (puerto 3001):

```bash
cd server
npm install
npm run dev
```

En la segunda, la interfaz (puerto 5173):

```bash
cd client
npm install
npm run dev
```

Abre <http://localhost:5173>, haz clic en el mapa sobre tu parcela (o presiona **Celaya, Gto.**). Debes ver la gráfica de lluvia por año con los años secos marcados y los datos de suelo. El botón **Recomendar rotación** responde con un aviso hasta que el motor esté listo (fase 2).

### Pruebas

```bash
cd server
npm test
```

Las pruebas no usan internet: leen los fixtures.

### Demo sin internet

El punto de ejemplo (Celaya, Gto., 20.47, -100.81) tiene sus respuestas reales guardadas en `server/fixtures/`, así que funciona aunque falle la red. Para ensayar sin internet, arranca el servidor con `OFFLINE=1`:

```bash
OFFLINE=1 npm run dev
```

En PowerShell:

```powershell
$env:OFFLINE = "1"; npm run dev
```

### Pantalla de resultado sin el motor

Mientras `POST /api/recomendar` responde 501 (fase 2), el client puede usar una respuesta de prueba. Copia `client/.env.example` a `client/.env`, pon `VITE_USE_MOCK=1` y reinicia Vite. Los bloques de clima y suelo del mock son reales (fixture de Celaya); los cultivos y la rotación son de relleno y la pantalla lo avisa.

Cualquier punto que ya se consultó una vez queda en `server/cache/` y también funciona sin internet. Para volver a bajar los fixtures del punto demo: `npm run fixtures` (dentro de `server/`).

## API

| Ruta | Qué responde |
|------|--------------|
| `GET /api/clima?lat&lon` | Lluvia de junio a septiembre por año, años secos, y temperatura y lluvia promedio por mes. |
| `GET /api/suelo?lat&lon` | pH, arcilla, arena, limo, carbono orgánico y nitrógeno de 0 a 30 cm. |
| `POST /api/recomendar` | Cultivos con puntaje y riesgo, y la rotación de 3 años. *Pendiente (fase 2).* |

Las formas exactas de cada respuesta, con ejemplos reales, están en [docs/api-contract.md](docs/api-contract.md).

## Estructura

```
server/
  index.js, app.js     arranque y rutas
  routes/              clima, suelo, recomendar
  sources/             NASA POWER y SoilGrids: descarga y normalización
  lib/                 coordenadas, caché en disco, fetch con timeout, temporadas
  engine/              motor de reglas (fase 2)
  data/                cultivos.json (fase 2)
  fixtures/            respuestas reales del punto demo (respaldo sin internet)
  cache/               caché en disco, no se versiona
  scripts/             fetch-fixtures.js
  test/                pruebas
client/
  src/
    App.jsx            una sola página: mapa, formulario y resultado
    api/               client.js (llamadas al server) y mock.js (bandera VITE_USE_MOCK)
    hooks/             useParcela.js: estado de la parcela, el formulario y los resultados
    config/            textos en español, puntos de ejemplo
    components/
      mapa/            MapaParcela (Leaflet): clic marca la parcela
      formulario/      FormularioParcela: temporal o riego y prioridad
      resultado/       Resultado, RotacionCards, GraficaLluvia (Recharts), TablaCultivos, ClimaCard, SueloCard
      comunes/         estados de carga y error, créditos
    three/             Parcela3D: contenedor aislado para la maqueta 3D (hoy, vista previa 2D)
    mocks/             recomendar.celaya.json: respuesta de prueba de /api/recomendar
docs/
  api-contract.md      contrato entre front, back y motor
```

## Credits

**Datos**

- **NASA POWER** (Prediction Of Worldwide Energy Resources), NASA Langley Research Center. Serie mensual 2000–2024, comunidad AG: temperatura, precipitación, radiación y humedad del suelo en la zona de raíces. <https://power.larc.nasa.gov/>
  *These data were obtained from the NASA Langley Research Center (LaRC) POWER Project funded through the NASA Earth Science/Applied Science Program.*
- **SoilGrids 2.0**, ISRIC World Soil Information, licencia CC BY 4.0. Propiedades del suelo de 0 a 30 cm. <https://soilgrids.org/>
  Poggio, L., de Sousa, L. M., Batjes, N. H., Heuvelink, G. B. M., Kempen, B., Ribeiro, E., and Rossiter, D. (2021). SoilGrids 2.0: producing soil information for the globe with quantified spatial uncertainty. *SOIL*, 7, 217–240. <https://doi.org/10.5194/soil-7-217-2021>
- **INEGI, Censo Agropecuario 2022**: en Guanajuato el 63.9 % de la superficie agrícola es de temporal.

Por agregar en las siguientes fases: FAO Ecocrop (requerimientos de los cultivos) y, si se usan, MODIS NDVI (ORNL DAAC) y NASA GIBS.

**Software**

React, Vite, Express, Leaflet, react-leaflet y Recharts, todos de código abierto. Mapa base: © colaboradores de OpenStreetMap (ODbL).

**Uso de inteligencia artificial**

Este proyecto se desarrolla con ayuda de **Claude Code** (Anthropic) para escribir y revisar código. Todo el código se escribió durante el evento y el equipo lo revisa por pull request.

## Licencia

MIT. Ver [LICENSE](LICENSE).

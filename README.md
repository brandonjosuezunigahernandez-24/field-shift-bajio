# Field Shift Bajío

Proyecto del **NASA Space Apps Challenge 2026**, sede Querétaro. Reto: *Field Shift: Adapting Farms with NASA Data*.

Una herramienta para el agricultor de **temporal** del Bajío (Guanajuato y Querétaro): dibuja el contorno de tu parcela en el mapa, di qué te importa más, y te propone una rotación de cultivos de 3 años que cuida el suelo y aguanta el clima. El riesgo se calcula con los **años secos reales** de tu parcela (25 años de datos de la NASA), no con un promedio.

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

Abre <http://localhost:5173> y presiona **Celaya, Gto.** Debes ver la lluvia por año, los años secos y los datos de suelo.

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

Cualquier punto que ya se consultó una vez queda en `server/cache/` y también funciona sin internet. Para volver a bajar los fixtures del punto demo: `npm run fixtures` (dentro de `server/`).

## API

| Ruta | Qué responde |
|------|--------------|
| `GET /api/clima?lat&lon` | Lluvia de junio a septiembre por año, años secos, y temperatura y lluvia promedio por mes. |
| `GET /api/suelo?lat&lon` | pH, arcilla, arena, limo, carbono orgánico y nitrógeno de 0 a 30 cm. |
| `GET /api/terreno?lat&lon` | Relieve (malla de 65 × 65 alturas) del cuadro de 1 km alrededor de la parcela, para la vista 3D. |
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
  src/                 React + Vite; Leaflet y Recharts ya instalados para la fase 2
  src/three/           vista 3D: globo, maqueta de la parcela, cámara (three.js + react-three-fiber)
  public/models/       bajio.glb, generado con Blender (no se edita a mano)
  public/textures/     textura del globo (NASA Blue Marble), bajada con `npm run textura`
assets/blender/        build_models.py: script que genera los modelos 3D
docs/
  api-contract.md      contrato entre front, back y motor
```

### Vista 3D

Arriba de los datos hay un globo de la Tierra. Lo giras, tocas tu región y la parcela se levanta del globo como una maqueta de 1 km por lado, con:

- el **relieve real** del terreno (exagerado para que se note; la página dice cuántas veces),
- los lados del bloque con el **color del suelo** según SoilGrids (más arcilla, más oscuro),
- un control de **años 2000–2024**: en años secos la tierra se ve café, las plantas chaparras y amarillas y casi no llueve.

Cuidados de rendimiento: three.js se descarga solo si el navegador tiene WebGL y en un archivo aparte; la escena se dibuja solo cuando algo cambia (`frameloop="demand"`); cada cultivo es un único `InstancedMesh`; la resolución se limita a 1.5×; si el 3D falla, el resto de la página sigue funcionando. Con "reducir movimiento" activado en el sistema, no hay animaciones.

**Modelos 3D.** Salen de [assets/blender/build_models.py](assets/blender/build_models.py). Para cambiarlos, edita el script y vuelve a generar `client/public/models/bajio.glb` (Blender 4.2 o más nuevo):

```bash
blender --background --factory-startup --python assets/blender/build_models.py
```

Si alguien modela a mano en Blender, el `.glb` debe conservar los nombres de objeto: `maiz`, `sorgo`, `trigo`, `cebada`, `frijol`, `garbanzo`, `brocoli`, `casa`, `arbol`.

## Credits

**Datos**

- **NASA POWER** (Prediction Of Worldwide Energy Resources), NASA Langley Research Center. Serie mensual 2000–2024, comunidad AG: temperatura, precipitación, radiación y humedad del suelo en la zona de raíces. <https://power.larc.nasa.gov/>
  *These data were obtained from the NASA Langley Research Center (LaRC) POWER Project funded through the NASA Earth Science/Applied Science Program.*
- **SoilGrids 2.0**, ISRIC World Soil Information, licencia CC BY 4.0. Propiedades del suelo de 0 a 30 cm. <https://soilgrids.org/>
  Poggio, L., de Sousa, L. M., Batjes, N. H., Heuvelink, G. B. M., Kempen, B., Ribeiro, E., and Rossiter, D. (2021). SoilGrids 2.0: producing soil information for the globe with quantified spatial uncertainty. *SOIL*, 7, 217–240. <https://doi.org/10.5194/soil-7-217-2021>
- **INEGI, Censo Agropecuario 2022**: en Guanajuato el 63.9 % de la superficie agrícola es de temporal.
- **NASA Blue Marble** (capa `BlueMarble_ShadedRelief_Bathymetry`) vía **NASA GIBS** (Global Imagery Browse Services), textura del globo 3D. <https://www.earthdata.nasa.gov/gibs>
  *We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).*
- **Terrain Tiles** en el Registry of Open Data on AWS (formato *terrarium* de Mapzen), relieve de la vista 3D. En México las alturas provienen de **NASA SRTM** (Shuttle Radar Topography Mission). <https://registry.opendata.aws/terrain-tiles/>

Por agregar en las siguientes fases: FAO Ecocrop (requerimientos de los cultivos) y, si se usa, MODIS NDVI (ORNL DAAC).

**Software**

React, Vite, Express, Leaflet, react-leaflet, Recharts, three.js, @react-three/fiber y @react-three/drei, todos de código abierto. Modelos 3D hechos por el equipo con Blender (script en `assets/blender/`).

**Uso de inteligencia artificial**

Este proyecto se desarrolla con ayuda de **Claude Code** (Anthropic) para escribir y revisar código. Todo el código se escribió durante el evento y el equipo lo revisa por pull request.

## Licencia

MIT. Ver [LICENSE](LICENSE).

# Field Shift Bajío: contexto para Claude Code

Proyecto del NASA Space Apps Challenge 2026, sede Querétaro (UNAQ), 14 y 15 de noviembre.
Reto: **Field Shift: Adapting Farms with NASA Data**. Hay que hacer una herramienta de apoyo a decisiones que junte
datos de la NASA, el suelo del lugar, las características de cada cultivo y lo que el agricultor quiere lograr,
para proponer rotaciones de cultivo que cuiden el suelo y se adapten al clima.

## Usuario y enfoque
- Usuario: agricultor de **temporal** del Bajío (Guanajuato y Querétaro). En Guanajuato el 63.9% de la
  superficie agrícola es de temporal (INEGI, Censo Agropecuario 2022).
- Diferenciador: el riesgo se calcula con los **años secos reales** de su parcela (20 años o más de NASA POWER), no con un promedio.
- Toda la UI va en español sencillo. El código (variables y funciones) va en inglés. La página de entrega de Space Apps se escribe aparte, en inglés.

## Reglas del hackathon (no romper)
- Todo el código del proyecto se escribe durante el evento. No copies código de repos de otros equipos.
- Cita cada fuente de datos en el README (sección Credits). Vamos a declarar que usamos Claude Code.
- No hagas `git push` ni merge a `main`. Trabaja en la rama actual; el equipo revisa por pull request.
- Haz commits pequeños y con mensajes claros.

## Stack (decidido, no cambiar sin preguntar)
- `client/`: React + Vite, Leaflet (react-leaflet) para el mapa y Recharts para las gráficas.
  Vista 3D en `client/src/three/` con three.js + @react-three/fiber + @react-three/drei (aprobado por el equipo).
  Modelos generados con Blender desde `assets/blender/build_models.py`.
- `server/`: Node + Express. Sin base de datos y sin login.
- Caché en disco: `server/cache/<fuente>_<lat2>_<lon2>.json`, con lat/lon redondeados a 2 decimales.
- Fixtures en `server/fixtures/` del punto demo, para que la demo funcione aunque falle el internet.
- Correr: `cd server && npm run dev` (puerto 3001) y `cd client && npm run dev` (Vite proxy `/api` → 3001).

## Datos (APIs gratis, sin API key)
1. **NASA POWER**, clima mensual por punto:
   `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,ALLSKY_SFC_SW_DWN,GWETROOT&community=AG&latitude={lat}&longitude={lon}&start=2000&end=2024&format=JSON`
   - Los valores vienen en `properties.parameter.<PARAM>["YYYYMM"]`. El mes `13` es el resumen anual: ignóralo para series mensuales.
   - `-999` es valor faltante: descártalo.
   - Revisa las unidades en `parameters.<PARAM>.units`. Si la lluvia viene en mm/day, multiplica por los días del mes para tener mm.
   - Máximo 20 parámetros por llamada. Cachea siempre.
2. **SoilGrids (ISRIC)**, suelo por punto:
   `https://rest.isric.org/soilgrids/v2.0/properties/query?lat={lat}&lon={lon}&property=clay&property=sand&property=silt&property=phh2o&property=soc&property=nitrogen&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean`
   - Divide cada valor entre `unit_measure.d_factor` para tener unidades normales (por ejemplo, el pH viene ×10).
   - A veces es lento o falla: timeout de 15 s y respaldo con el fixture.
3. **Opcional, MODIS NDVI (ORNL DAAC)**: `https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset?latitude={lat}&longitude={lon}&startDate=A2024001&endDate=A2024160&kmAboveBelow=0&kmLeftRight=0`.
   Banda `250m_16_days_NDVI`, escala 0.0001, máximo 10 fechas por llamada.
4. **Opcional, NASA GIBS**: capas WMTS de fondo para el mapa. Solo visual.

## Cultivos: `server/data/cultivos.json`
Siete cultivos: maíz, sorgo, frijol, trigo, cebada, garbanzo y brócoli. Cada uno con este esquema:
```json
{ "id": "maiz", "nombre": "Maíz grano", "familia": "gramínea", "leguminosa": false,
  "temporadas": ["PV"], "agua": ["temporal", "riego"],
  "temp_opt_min_c": 0, "temp_opt_max_c": 0,
  "lluvia_ciclo_min_mm": 0, "lluvia_ciclo_max_mm": 0,
  "ph_min": 0, "ph_max": 0, "ciclo_meses": 0,
  "fuente": "FAO Ecocrop", "verificado": false }
```
- **No inventes valores como definitivos.** Llena valores aproximados, déjalos con `"verificado": false` y una lista de TODO; el equipo los confirma contra FAO Ecocrop.
- Temporadas del Bajío: **PV** (primavera-verano, lluvias de junio a septiembre, temporal o riego) y **OI** (otoño-invierno, solo con riego).

## Motor de reglas: `server/engine/`
Debe ser simple, explicable y con pruebas unitarias.
1. Para cada cultivo y temporada calcula:
   - ajuste de temperatura (meses del ciclo dentro del rango),
   - ajuste de lluvia (lluvia de la temporada contra el rango; solo pesa en temporal),
   - ajuste de suelo (pH; la textura solo como nota).
2. **Riesgo** = porcentaje de años, del 2000 en adelante, en que la lluvia de PV quedó por debajo del mínimo del cultivo.
3. La prioridad del agricultor cambia los pesos: `ganar` (rendimiento), `suelo` (leguminosas y diversidad), `agua` (menos lluvia o riego requerido), `riesgo` (menor riesgo).
4. Rotación de 3 años. Reglas:
   - no repetir la misma familia en temporadas seguidas,
   - al menos una leguminosa en los 3 años,
   - OI solo si hay riego.
5. Cada recomendación trae `razones[]` en español con números reales. Por ejemplo: "En 6 de 24 años llovió menos de lo que el maíz necesita aquí".

## API
- `GET /api/clima?lat&lon`: serie anual de lluvia de PV, temperatura media mensual y años secos.
- `GET /api/suelo?lat&lon`: pH, arcilla, arena, limo y carbono orgánico de 0 a 30 cm.
- En las tres rutas, `lat` y `lon` son el centro de la parcela que dibujó el agricultor.
- `POST /api/recomendar` con `{ lat, lon, agua: "temporal"|"riego", prioridad: "ganar"|"suelo"|"agua"|"riesgo" }`
  responde `{ clima, suelo, cultivos: [{ id, puntaje, riesgo, razones }], rotacion: [{ anio, temporada, cultivo, porque }], fuentes }`.

## Pantallas (una sola página)
1. Mapa: el agricultor **dibuja el contorno de su parcela** (un polígono: cada clic agrega una esquina, mínimo 3). No es un solo punto.
   - El front calcula el **centro del polígono** y eso es lo que manda como `lat` y `lon`. La API no cambia: NASA POWER y SoilGrids se consultan por punto.
   - Se hace con react-leaflet, sin librería nueva. Detalle en `docs/api-contract.md`.
   - Botones de ejemplo: "Celaya, Gto." (20.47, -100.81), que manda ese punto directo, sin dibujar.
     El punto es zona de cultivo, 5.5 km al sur del centro. El centro (20.52, -100.81) no sirve de ejemplo: SoilGrids lo enmascara como zona urbana y no devuelve suelo.
2. Formulario: temporal o riego, y la prioridad.
3. Resultado:
   - tarjetas de la rotación año por año, cada una con su "por qué",
   - gráfica de lluvia anual con los años secos marcados,
   - tabla de cultivos con puntaje y riesgo.
   - Pie de página con créditos de datos.

## Plan por fases (cada fase termina funcionando)
- **F1**: esqueleto de client y server, `/api/clima` y `/api/suelo` con caché y fixture de Celaya, y README de cómo correrlo.
- **F2**: `cultivos.json`, motor con pruebas, `/api/recomendar`, mapa y formulario.
- **F3**: integrar de punta a punta con una parcela real (meta del sábado en la noche).
- **F4**: explicaciones, gráfica, manejo de errores y estados de carga.
- **F5**: README en inglés con capturas, credits y cómo correrlo.

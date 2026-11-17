# Fuentes de datos: qué se probó y qué conviene integrar

Investigación del **14 nov 2026**. Cada fuente se probó con una petición real desde esta máquina (curl). "Verificado" = respondió y se vio el contenido; "no verificado" = no se pudo comprobar y se dice por qué. Ejemplos pequeños en `docs/fuentes-ejemplos/`. No hay cambios de código en el servidor ni el cliente.

## Hallazgos que cambian lo que sabíamos

1. **El SIAP ya publica 2025** (la página dice cobertura municipal 2003-2025, actualizado 12 ago 2026) y **la descarga de 2025 llegó completa**: 5.77 MB en 2.5 s, 32 estados, 1 479 filas de Guanajuato y 349 de Querétaro. (Antes la descarga de 2023 se cortaba; hoy no pasó. Aun así conviene validar que llegue completo y reintentar.)
2. **El SIAP se cruza limpio con INEGI**: `Idestado`+`Idmunicipio` (rellenados a 2+3 dígitos) igualan la clave INEGI `cvegeo`; los 64 municipios de GTO y QRO con datos coinciden (0 sin pareja). Esto resuelve el cruce SIAP-municipio-NASA.
3. **INEGI sí tiene una API abierta de límites municipales** (sin llave) de la que salen centroides oficiales; no hace falta bajar el Marco Geoestadístico.
4. **Fertilizantes: corrección parcial.** El SNIIM (Secretaría de Economía) tiene una sección "Insumos agrícolas" (aparece en su mapa del sitio, `ConsultaInsumos.aspx`) y un anuario histórico de insumos con precios por estado (incluye Guanajuato y Querétaro; productos como amoniaco anhidro, fosfato diamónico, NPK 17-17-17). Pero **no pude verificar que haya serie vigente**: el anuario que abrió es viejo (la página se rotula "SNIIM-Secofi", anuarios "1997 y anteriores") y el formulario vigente es ASP.NET con postback que no se pudo consultar con curl. Estado: **candidato, no verificado**. No hay serie vigente confirmada.
5. **No existe un calendario agrícola único y verificable** para todos los cultivos (ver sección 4).

## Tabla (más útil y fácil primero)

Esfuerzo: S = horas, M = un día, L = varios días.

| # | Fuente | Qué da | Endpoint / archivo | Ejemplo real probado | Formato | Licencia | ¿Llave? | ¿Offline? | Esfuerzo | Estado |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **INEGI catálogo + geometría municipal** (`gaia.inegi.org.mx/wscatgeo/v2`) | 46 municipios GTO, 18 QRO con clave `cvegeo`, población 2020 y polígono (de ahí el centroide) | `GET /mgem/11`, `/mgem/22` (lista); `GET /geo/mgem/11007` (polígono GeoJSON, 51 KB Celaya) | Celaya `11007`: centroide calculado 20.5376, -100.7879; Querétaro `22014`: 20.7288, -100.4527. CSV de los 64: `municipios_centroides_inegi.csv` | JSON / GeoJSON | Uso libre de INEGI (no revisé el texto legal) | No | **Sí**: el CSV de 3 KB va al repo | S | Verificado |
| 2 | **SIAP cierre agrícola municipal 2003-2025** | Superficie sembrada/cosechada/siniestrada, volumen, rendimiento, precio medio rural, por municipio, ciclo, modalidad y cultivo. Incluye frutales (como "Perennes") | `https://nube.agricultura.gob.mx/index.php?view=10AE434F-A2158368-A120BC5A-EDF4AFAA&ANIO=2025` (cambiar `ANIO`) | 2025: 35 902 filas nacional; muestra de Celaya en `siap_2025_celaya_ejemplo.csv` (columnas `Anio, Idestado, Nomestado, Idmunicipio, Nommunicipio, Nomcicloproductivo, Nommodalidad, Nomcultivo, Sembrada, Cosechada, Siniestrada, Volumenproduccion, Rendimiento, Preciomediorural, Valorproduccion`) | CSV latin1, ~6 MB por año | Datos abiertos del gobierno (licencia exacta no revisada) | No | **Sí** (filtrado a GTO y QRO ≈ 1 MB por año) | S (ya hay descarga por estado; falta nivel municipio) | Verificado |
| 3 | **NASA POWER, parámetros extra** | Humedad de suelo (`GWETROOT` raíz, `GWETTOP` superficie, `GWETPROF`), **días de helada** (`FROST_DAYS`, `T2M_MIN` diario), evaporación (`EVLAND`, `EVPTRNS`), humedad relativa, radiación, viento, temperatura de suelo (`TSOIL1..6`) | `https://power.larc.nasa.gov/api/temporal/{monthly,daily}/point?parameters=...&community=AG&longitude=-100.81&latitude=20.47&start=2020&end=2021&format=JSON` | Mensual Celaya ene 2020: T2M 13.63 °C, GWETROOT 0.44, EVLAND 0.86 mm/día, RH2M 56.8 %. Diario: `FROST_DAYS` y `T2M_MIN` devueltos (`nasa_power_*.json`). El catálogo tiene 1 388 parámetros | JSON | Datos NASA abiertos | No | Sí si se baja (64 puntos x 25 años mensual ≈ pocos MB) | S | Verificado |
| 4 | **CONAGUA Monitor de Sequía, municipal** | Categoría de sequía (D0-D4; vacío = sin sequía) por municipio y quincena, 2003 a oct 2026 | `https://smn.conagua.gob.mx/tools/RESOURCES/Monitor%20de%20Sequia%20en%20Mexico/MunicipiosSequia.xlsx` (2.1 MB, hoja `MUNICIPIOS`, clave `CVE_CONCATENADA` = `cvegeo`) | Celaya: 219 quincenas con dato; primera 2005-06-30 `D1`, última 2025-05-31 `D0` (`monitor_sequia_celaya.csv`) | XLSX | Datos abiertos CONAGUA/SMN (licencia no revisada) | No | **Sí** | S-M (convertir XLSX a CSV una vez) | Verificado (descarga y contenido; el encabezado llega a oct 2026) |
| 5 | **Open-Meteo, ET0 y lluvia histórica** | ET0 FAO diaria y lluvia diaria desde 1940 (ERA5), además del pronóstico que ya usamos | `https://archive-api.open-meteo.com/v1/archive?latitude=20.47&longitude=-100.81&start_date=2024-06-01&end_date=2024-06-05&daily=et0_fao_evapotranspiration,precipitation_sum&timezone=auto`; pronóstico `api.open-meteo.com/v1/forecast?...&daily=et0_fao_evapotranspiration` | Ene 2024: ET0 3.44, 3.43, 3.81 mm/día; pronóstico del 15-nov-2026: 3.79 mm | JSON | CC BY 4.0, gratis sin uso comercial (revisar términos si se monetiza) | No | Sí si se baja (la API tiene límites diarios) | S | Verificado |
| 6 | **Tipo de cambio sin llave: Frankfurter (BCE)** | USD a MXN diario, serie histórica | `https://api.frankfurter.dev/v1/2026-11-01..2026-11-13?base=USD&symbols=MXN` | 13-nov-2026: 18.593 MXN/USD | JSON | Datos del BCE, uso libre | No | Sí (serie bajada) | S | Verificado. Es referencia del BCE, no el FIX de Banxico |
| 7 | **SoilGrids (ya usado)** | Arcilla, pH, etc. a 250 m, 0-200 cm | `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=-100.81&lat=20.47&property=clay&property=phh2o&depth=0-5cm&value=mean` | Celaya 0-5 cm: arcilla 365 g/kg (36.5 %), pH 7.3 | JSON | CC BY 4.0 | No | Sí por punto (cachear) | S (ya integrado) | Verificado |
| 8 | **NDVI MODIS vía ORNL DAAC** | NDVI 250 m cada 16 días desde 2000, por punto | `https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset?latitude=20.47&longitude=-100.81&band=250m_16_days_NDVI&startDate=A2024001&endDate=A2024081&kmAboveBelow=0&kmLeftRight=0` | Devolvió `data:[4734,...]` (escala 0.0001, NDVI 0.47) para el 1-ene-2024 (`modis_ndvi_ornl_celaya_2024.json`) | JSON | Datos NASA abiertos | No | Sí si se baja | M | Verificado, **pero inestable**: las primeras peticiones dieron timeout y hubo que repetir con espera larga. Un píxel mezcla cultivos y suelo; sin máscara de parcela es ruidoso |
| 9 | **CHIRPS v3 (lluvia satelital 0.05°)** | Lluvia mensual/diaria global desde 1981 | `https://data.chc.ucsb.edu/products/CHIRPS/v3.0/monthly/global/tifs/chirps-v3.0.AAAA.MM.tif` (~22 MB por mes) | Solo comprobé el listado y tamaños (v3 llega a oct 2026). La ruta de CHIRPS-2.0 dio 404 | GeoTIFF | Según su página es de uso abierto (no revisé) | No | Sí, pero pesado | L (leer rasters; 25 años ≈ 7 GB) | Listado verificado; **valores no leídos** |
| 10 | **INEGI edafología 1:250 000** | Unidades de suelo por polígono; describe mejor el tipo de suelo pero no da propiedades continuas | Conjunto "Continuo Nacional" en la sección Edafología de inegi.org.mx (la búsqueda no halló enlace directo de descarga) | La página responde (200) y el WMS `gaia.inegi.org.mx/NLB/tunnel/wms/wms61` devuelve GetCapabilities. **No descargué el shape ni consulté una capa de suelo** | Shape/GDB nacional | Uso libre INEGI | No | Sí (hay que recortar) | L | **No verificado** (solo que el producto existe) |
| 11 | **SNIIM precios de mercado** (frutas y hortalizas, granos, insumos) | Precios diarios en centrales de abasto por producto | `economia-sniim.gob.mx/Nuevo/Home.aspx?opcion=Consultas/MercadosNacionales/PreciosDeMercado/Agricolas/ConsultaGranos.aspx?SubOpcion=6\|0` (y `ConsultaFrutasYHortalizas`, `ConsultaInsumos`) | Las páginas cargan (200) y listan cientos de productos (aguacate Hass, chile, etc.). **No consulté ningún precio**: son formularios ASP.NET (VIEWSTATE) | HTML | Información pública | No | Solo raspando | L | Existe, **consulta no verificada** |
| 12 | **Banxico SIE (FIX, series)** | Tipo de cambio oficial, INPC | `https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/oportuno` | Responde "Token inválido": **pide token** (gratuito con registro; no lo tramité) | JSON | Libre | **Sí (token)** | Sí si se baja | S si hay token | Verificado que pide token |
| 13 | **NASA SMAP (humedad de suelo satelital)** | Humedad a 9-36 km (SPL3SMP, SPL3SMP_E, SPL4SMGP) | CMR y AppEEARS listan los productos; el extracto por punto de AppEEARS exige cuenta Earthdata | Catálogo: `SPL3SMP_E.006`, `SPL4SMGP.008` presentes. **Sin muestra de datos** | HDF5/NetCDF | Abierto | **Sí (login Earthdata)** | Pesado | L | Existencia verificada; datos no |
| 14 | **NASA GIBS (imágenes)** | Capas visuales (no valores) de NDVI y SMAP | `gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi?SERVICE=WMTS&REQUEST=GetCapabilities` | Capabilities (5.3 MB) responde; capas SMAP listadas (brillo y congelamiento) | XML/PNG | Abierto | No | No | M | Verificado; **sirve para mapas, no para modelar** |

## 4. Calendario agrícola y ciclos

Lo que **sí** se verificó:
- **SIAP cierre agrícola (fila 2)** da el **ciclo** (Primavera-Verano, Otoño-Invierno, Perennes) y la modalidad por cultivo y municipio, **no fechas**. Los frutales aparecen todos como `Perennes`. Hectáreas cosechadas 2025 (suma de filas, GTO / QRO): fresa 1 878 / sin fila; aguacate 276 / 179; durazno 91 / 20; guayaba 129 / 75; limón 158 / 8; nopalitos 305 / 36; tuna 3 541 / 124; zarzamora 20 / 2; uva 509 / 530; arándano 566 / sin fila; frambuesa 240 / sin fila; agave 12 970 / sin fila. Sirve para saber **qué frutales importan y dónde**.
- **SIAP "Avance de siembras y cosechas"** (`https://nube.agricultura.gob.mx/avance_agricola/`) existe y reporta por mes, municipio, ciclo y cultivo; de ahí saldrían los meses reales de siembra y cosecha. **No verificado**: es un formulario xajax y no se extrajo ningún dato. Es la mejor candidata para un calendario real (esfuerzo L).
- **INIFAP**: solo encontré ensayos puntuales (por ejemplo maíz de riego en el Bajío, mejor fecha de siembra el 25 de marzo; cebada otoño-invierno en Roque, Guanajuato, con siembras de nov a ene). **No hay un paquete tecnológico único verificable para todos los cultivos con ciclo en días**, y para frutales no encontré nada. Cualquier calendario "de memoria" debe marcarse como no verificado.

Recomendación: seguir con FAO EcoCrop para ciclos en días (ya está en el proyecto), marcar fechas como orientativas y usar el avance mensual del SIAP solo si se decide invertir en extraerlo.

## 5. Precios y costos (resumen)

- **Precio medio rural**: SIAP, por municipio y año (fila 2). Verificado.
- **Precios de mercado**: SNIIM existe pero la consulta no se verificó (fila 11).
- **Dólar**: Frankfurter sin llave (verificado); Banxico exige token (verificado).
- **Fertilizantes**: ver hallazgo 4. No hay serie vigente confirmada. FIRA: `https://www.fira.gob.mx/Nd/Agro.jsp` dio error 500; no revisé otros enlaces de FIRA, así que **no verificado**.

## 6. Otras fuentes útiles para proyecciones

- **Heladas**: `FROST_DAYS` y `T2M_MIN` diario de POWER (fila 3), verificado. Ojo: es una rejilla gruesa (MERRA-2, decenas de km); no capta heladas locales de valle.
- **Sequía**: Monitor de Sequía CONAGUA por municipio (fila 4), para validar contra las pérdidas del SIAP.
- **Sequía por lluvia**: el índice SPI se calcula con la lluvia mensual de POWER que ya tenemos; no necesita fuente nueva.

## 7. Ampliación: todo lo plantable (granos, hortalizas, frutas, frutales)

Se pidió calendarios por mes, tiempo a producción y costo de establecer de frutales, y riego. Resultado honesto: **para calendarios por mes y para costos de establecer no encontré fuente abierta, descargable y verificable**; para riego sí hay una base seria (FAO-56).

### 7.1 Calendarios de siembra y cosecha por mes

| Fuente | Resultado | Estado |
|---|---|---|
| **FAO Crop Calendar** (`cropcalendar.apps.fao.org`, API `https://api-cropcalendar.apps.fao.org/api/v1/countries`) | La API responde sin llave, pero lista **58 países y México no está** (comprobé que `MX` no aparece). Inútil para este proyecto. | Verificado (negativo) |
| **SIAP cierre agrícola (fila 2)** | Da ciclo (PV, OI, Perennes) y modalidad, no meses. Para hortalizas sirve para saber **en qué ciclo** se siembra cada una en GTO/QRO. | Verificado |
| **SIAP Avance de siembras y cosechas** (`nube.agricultura.gob.mx/avance_agricola/`) | Reporta por mes, municipio, ciclo y cultivo (superficie sembrada y cosechada mensual), así que de ahí saldrían los **meses reales** de siembra y cosecha por cultivo, incluidas hortalizas y frutales. Filtros: año, mes, ciclo, modalidad, estado, municipio, cultivo. Es un formulario xajax (JavaScript), **no extraje ningún dato**; habría que reproducir las llamadas xajax o usar un navegador automático. Es la **mejor candidata** para un calendario "de verdad". | Existe (verificado); datos **no verificados**; esfuerzo L |
| **INIFAP / SADER / UG** | Solo ensayos sueltos (maíz, frijol, cebada) y una guía didáctica de la Universidad de Guanajuato de hortalizas sin fechas. No hay "Agenda Técnica Agrícola" de Guanajuato que encontrara (sí existen de otros estados, por ejemplo Puebla y Sinaloa, no verificadas en contenido). No encontré calendario oficial de siembra y cosecha por mes para jitomate, chile, cebolla, brócoli, papa, calabaza, fresa, espárrago, aguacate, uva, durazno ni tuna. | No encontrado |
| **FAO-56, tabla 11** (`https://www.fao.org/4/x0490e/x0490e0b.htm`) | Duración del ciclo **en días** por etapa (inicial, desarrollo, media, final) para tomate, cebolla, col, uva, espárrago, etc., con **fecha de siembra típica por región del mundo** (ej. cebolla seca 150 días, siembra abril, mediterráneo). **Ninguna región es México/Bajío**, así que la duración sirve como referencia y las fechas no. | Verificado |

Recomendación para calendarios sencillos: mostrar **duración del ciclo en meses** (FAO-56 y EcoCrop) y el **ciclo SIAP** (primavera-verano / otoño-invierno / perenne); para "meses de siembra y cosecha" decir que son orientativos hasta que se extraiga el Avance del SIAP. Todo calendario escrito a mano debe llevar la etiqueta "no verificado".

### 7.2 Tiempo a producción y costo de establecer un frutal

- Búsquedas dirigidas (INIFAP, SADER, revistas) **no devolvieron una tabla abierta** de años a primera cosecha ni de costo de establecimiento para fresa, espárrago, aguacate, uva, durazno, tuna, arándano o frambuesa en Guanajuato/Querétaro. Lo más cercano: una ficha técnica del estado de Colima de aguacate (no da costos ni años) y una tesis de espárrago en el Bajío con un capítulo de costos pero de hace décadas. **No usar esas cifras.**
- Candidatas **no verificadas** (no se abrieron): FIRA (su sitio dio error 500 en la prueba), fichas de costos de la SADER y las Agendas Técnicas de INIFAP. Si no hay fuente, lo correcto es que el asistente diga "no tengo dato verificado" y que el agricultor capture su costo.
- Lo que sí hay verificable: SIAP muestra **qué frutales existen y cuánta superficie** (sección 4), y **FAO-56 tabla 12** trae Kc de aguacate, cítricos, durazno, uva, fresa y otros (no tiempo a producción).

### 7.3 Riego

| Fuente | Qué da | Estado |
|---|---|---|
| **FAO Irrigation and Drainage Paper 56** (capítulo 6, `x0490e0b.htm`; y capítulos de ET0 `x0490e0a.htm`, `x0490e0e.htm`) | Coeficientes de cultivo **Kc** (inicial, medio, final) y altura máxima para cientos de cultivos (tabla 12), duraciones de etapas (tabla 11), y el método para calcular el requerimiento de agua: `ETc = Kc x ET0`. Tomate, cebolla, col, fresa, uva, espárrago, aguacate, durazno, cítricos aparecen en las tablas (verificado buscando cada nombre en la página). | Verificado. Libre de leer en el sitio de FAO; **no revisé la licencia de reutilización**, así que citar la fuente y copiar solo los números necesarios |
| **ET0 diaria de Open-Meteo (fila 5)** | Entrada para `ETc = Kc x ET0` en cualquier punto, histórica y pronóstico | Verificado |
| **FAO CROPWAT** | Programa de riego de la FAO. Las páginas que probé (`fao.org/land-water/databases-and-software/cropwat/...`) dieron 404, así que **no pude verificar la descarga ni su licencia**. No hace falta: con Kc y ET0 se calcula lo mismo en unas líneas. | No verificado |
| **INIFAP / CONAGUA** (láminas por cultivo en el Bajío) | No encontré una tabla abierta de lámina e intervalo de riego por cultivo y método (goteo, aspersión, rodado). Aparecieron estudios de otras regiones (Zacatecas, Veracruz) que **no son aplicables**, y el programa "D'Riego" de INIFAP mencionado en un resultado (no lo abrí). | No encontrado |

**Cómo responder "cada cuánto riego" con datos serios sin tabla regional:** necesidad de agua diaria = `Kc` (FAO-56) x `ET0` (Open-Meteo) menos la lluvia efectiva. Con la lámina que da el método (la eficiencia típica: goteo mayor que aspersión mayor que rodado) y la capacidad de retención del suelo (arcilla de SoilGrids), se estima el intervalo. Es un **cálculo**, no una recomendación oficial regional: el asistente debe decirlo así. Las eficiencias por método no las verifiqué en una fuente; no inventarlas.

### 7.4 Las 3 para integrar primero (ampliación)

1. **FAO-56 (Kc y duración de etapas) + ET0 de Open-Meteo**: respuesta de riego con fórmula y datos verificables; esfuerzo S (copiar una tabla chica de Kc de los cultivos del catálogo y marcar su origen).
2. **SIAP cierre municipal (ciclo y modalidad por cultivo)**, ya recomendado: dice en qué ciclo se siembra cada hortaliza o frutal en cada municipio, sin inventar meses.
3. **SIAP Avance de siembras y cosechas**, solo si el equipo acepta el esfuerzo L: única vía abierta identificada para meses reales de siembra y cosecha por cultivo y municipio. Si no, dejar los meses como "no verificado".

## Las 3 que integraría primero (datos del modelo)

1. **INEGI centroides + SIAP municipal 2003-2025 (filas 1 y 2) como un solo paso.** El cruce por clave INEGI es exacto (64 de 64). Pasa el modelo de "por estado" a "por municipio" con 23 años de datos en vez de 7, y trae 2025. Es lo que más cambia el entrenamiento y es de esfuerzo bajo. Todo se baja una vez y funciona sin internet.
2. **NASA POWER con parámetros extra (fila 3):** `GWETROOT`, `FROST_DAYS`/`T2M_MIN`, `EVLAND`, `RH2M`. Mismo endpoint y formato que ya usamos, sin llave; añade humedad de suelo y heladas, las variables agronómicas que hoy faltan. Sirve igual para los 64 centroides.
3. **Monitor de Sequía CONAGUA municipal (fila 4):** una descarga de 2 MB, mismo cruce por clave. Da una etiqueta oficial de sequía por quincena para validar el modelo contra el SIAP y para decirle al agricultor "este municipio estuvo en sequía D2".

## Lo que NO conviene usar (o todavía no)

- **SMAP directo y NDVI MODIS por punto**: SMAP exige cuenta Earthdata; ORNL es lento e inestable y un píxel de 250 m no representa una parcela.
- **CHIRPS**: rasters de 22 MB por mes; mucho esfuerzo para ganar poco sobre POWER + Open-Meteo.
- **GIBS**: solo imágenes, no valores.
- **INEGI edafología y SNIIM**: existen, pero no pude consumirlas; no prometerlas hasta probar (SNIIM obliga a raspar formularios).
- **Banxico**: pide token; usar Frankfurter y declarar que no es el FIX.
- **Fechas de siembra y cosecha "de memoria"**: sin fuente verificada, no presentarlas como oficiales.

## Decisión para el equipo

- ¿El modelo por estado se entrena **a nivel municipio** (más datos; hay que cruzar con clima por centroide) o solo se agregan los municipios por estado?
- ¿Invertir en extraer el **Avance de siembras y cosechas** del SIAP para tener un calendario real, o aceptar fechas orientativas?

## Pendiente

Licencias exactas de INEGI, CONAGUA y SIAP (solo vi que son datos abiertos); lectura de valores de CHIRPS; datos de SNIIM, SMAP, FIRA y edafología INEGI.

`docs/fuentes-ejemplos/centroides_inegi.py` es el script con el que se calcularon los centroides (investigación, no código del servidor).

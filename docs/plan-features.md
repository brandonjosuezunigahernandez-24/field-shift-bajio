# Plan de features y cómo escalar (asistente + datos)

Fecha: 14-nov-2026. El hackathon cierra el domingo; por eso hay **un nivel para el hackathon** y los demás son "después". Cada nivel debe funcionar solo antes de empezar el siguiente.

## Principio de datos
Cada dato que entra tiene: **fuente, fecha en que se bajó y si es verificado**. El asistente siempre dice de dónde sale lo que afirma. Con internet se actualiza; sin internet usa lo último guardado y avisa "dato de hace N días".

## Nivel 1 · Hackathon (lo que sí cabe antes del congelamiento)
| # | Feature | Notas |
|---|---|---|
| 1 | `POST /api/asistente`: ficha (clima + suelo) → Gemma 4B local → verificador → plantilla de respaldo | Ya están ficha, verificador, plantilla y conexión con Ollama |
| 2 | Resumen inicial al dibujar la parcela | `pregunta` vacía |
| 3 | Chat guiado: botones de preguntas + el asistente pregunta riego/prioridad | Front (rol #4) |
| 4 | Acciones de mapa (zoom, resaltar años secos, mostrar cultivo) | Lista cerrada, validada |
| 5 | Voz: `POST /api/voz` (Whisper base local) + hablar la respuesta con voz del navegador | Whisper ya probado; falta ruta y micrófono |
| 6 | Botón "preparar parcela" (bajar y guardar datos antes de ir sin internet) | Usa la caché que ya existe |

Si el tiempo aprieta, el orden de corte es 6 → 5 → 4. El 1 y el 2 no se recortan.

## Nivel 2 · Pronóstico y preguntas generales (primera semana)
**Pronóstico del clima (con internet).** Candidato: [Open-Meteo](https://open-meteo.com/): sin llave ni registro, pronóstico de ~16 días, licencia CC BY 4.0, **solo uso no comercial** y alrededor de 10,000 llamadas diarias (las fuentes no coinciden en el límite exacto; contar con eso). Sirve para "¿va a llover esta semana?", no para decidir qué sembrar en la temporada (eso es el clima histórico de NASA). Cuidado: se le manda lat/lon de la parcela a un servicio externo; avisarlo. Sin internet: guardar el último pronóstico con su fecha. Pronósticos estacionales (meses adelante): no he verificado una fuente gratuita buena.

**Preguntas generales de agricultura.** Tres capas, de la más segura a la menos:
1. **Base de conocimiento local** (funciona sin internet): documentos de FAO/INIFAP/SIAP resumidos en trozos con su fuente. Ya no cabe todo en la ventana, así que aquí **sí hace falta búsqueda**: un modelo de *embeddings* local (por Ollama) para traer los 3–5 trozos más parecidos a la pregunta. Respuesta con fuente verificable.
2. **Con internet: buscar y leer.** Se busca en la web, se baja el texto de 2–3 páginas, y Gemma lo resume citando el enlace. Se marca **"de internet, no verificado por la app"**; el verificador de números no puede comprobarlo contra la ficha.
3. **Sin nada:** "No tengo ese dato" y sugerir una pregunta que sí pueda contestar.

La respuesta siempre dice de cuál capa vino (`origen`: `ficha`, `conocimiento`, `internet`, `plantilla`).

## Nivel 3 · Catálogo de cultivos y precios
**Datos de plantas ya filtrados para México.** No existe un "dataset completo de plantas de México" listo. Se arma cruzando:
- **FAO EcoCrop** (rangos de temperatura, lluvia, pH, luz, altitud). FAO lo descontinuó hacia 2015 y quedó dentro de [GAEZ](https://www.fao.org/geospatial/data-and-tools/data-portals/ecocrop/en); no confirmé una descarga masiva oficial. Hay una copia de terceros (`EcoCrop_DB.csv`) en [openclim/ecocrop](https://www.github.com/openclim/ecocrop); **verificar su origen antes de usarla.**
- **SIAP**: qué cultivos se siembran de verdad en Guanajuato y Querétaro, con superficie, rendimiento y precio medio rural. Se **filtra EcoCrop solo a esos cultivos**.
- Los rangos quedan en `cultivos.json` con `verificado: false` hasta que alguien los confirme (regla de `CLAUDE.md`).
Precios: ver [Versión 2 de `docs/ml-plan.md`](ml-plan.md) (Banxico, SNIIM, SIAP). **Fertilizantes en México: sin fuente confirmada**, los captura el agricultor.

## Nivel 4 · Costos y decisiones
Cuentas de campo (ingreso – costo por hectárea), escenarios por cultivo (ganancia esperada, probabilidad de pérdida, peor caso) y el selector según la prioridad. Detalle en `docs/ml-plan.md`. Guardado local de historial de plantaciones (JSON).

## Nivel 5 · Modelo predictivo (ML)
Rendimiento según clima con datos del SIAP de muchos municipios; Monte Carlo sobre los 25 años; precios solo con estacionalidad y escenarios. Deep learning solo para imágenes. Detalle y límites en `docs/ml-plan.md`.

## Nivel 6 · Invernadero
**Módulo de factibilidad, no de diseño.** Con lo que ya tenemos de NASA POWER se puede responder una parte:
- **Heladas y calor extremo:** temperaturas mínimas y máximas mensuales de la parcela (ya están en `/api/clima`, como extremos horarios, no promedios diarios).
- **Radiación solar:** ya se baja (`ALLSKY_SFC_SW_DWN`).
- **Comparación:** ¿cuántos meses al año el cultivo queda fuera de su rango de temperatura al aire libre y cuántos dentro de un invernadero? Resultado: "con invernadero ganarías N meses de cultivo".
- **No tenemos** costos verificados de invernaderos, ni rendimientos bajo cubierta, ni reglas de ventilación/riego. Eso se pregunta al agricultor o se busca más adelante; nada se inventa.
- Requiere agregar al catálogo los cultivos típicos de invernadero (p. ej. jitomate, chile) con sus rangos.

## Nivel 7 · Cuidado de plantas y enfermedades
Proyecto aparte (foto → enfermedad). Requiere un modelo de imágenes local. Sin verificar qué APIs públicas hay y sus licencias. Solo si todo lo anterior funciona.

## Cómo escalar sin romper
1. Cada nivel agrega una sección nueva a la **ficha** y una nueva etiqueta de `origen`; la ruta `/api/asistente` no cambia.
2. Cada fuente nueva = un archivo en `server/sources/` con caché y fecha, igual que POWER y SoilGrids.
3. Los resultados calculados (pronóstico, escenarios, factibilidad) llegan al modelo ya hechos; Gemma solo los explica.
4. Cada nivel termina con su prueba y una entrada en `docs/llm-bitacora.md`.
5. Se agrega cada dependencia o fuente a `docs/FUENTES.md` y `docs/IA_USADA.md`.

## Dos advertencias
- **Más información no es mejor si el modelo no la puede leer.** Gemma 4B se confunde con mucho texto. Por eso solo le mandamos lo relevante a la pregunta.
- **Lo que no esté verificado se dice así en pantalla.** Para un agricultor, un dato inventado cuesta dinero.

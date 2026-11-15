# 25. Análisis IA conectada al asistente real

## Qué pasaba
La pantalla `/analisis` mostraba datos de ejemplo (`FS_DATOS.respuestaIA`) y nunca llamaba al asistente. Por eso "Gemma no respondía" ahí.

## Qué quedó conectado
- `client/src/pages/Analisis.jsx` habla con `POST /api/asistente`: guía de temas (`GET /api/asistente/temas`), caja de pregunta, micrófono (`POST /api/voz`, el texto aparece antes de enviarse) y una sola respuesta a la vez.
- Muestra solo campos reales de la respuesta: `respuesta`, etiqueta de `origen` (SIAP / asistente / respaldo), `fuentes`, `enlaces`, botones de `preguntar` y `afinar`, y tarjetas de `recomendacion` (cultivos, rotación, predicción, notas), `recomendacion_finca` (varias parcelas) y `corroboracion` (NASA contra SIAP, con tabla por año).
- Mensaje de espera honesto (la primera respuesta puede tardar ~30 s) y errores en español.
- La lógica compartida está en `client/src/hooks/useAsistente.js`; la usan Análisis y el botón flotante (`AsistenteDock`), que ya no guarda estado propio.
- `?pregunta=...` en la URL hace esa pregunta al cargar (sirve para revisar).

## Diseño completo restaurado (segunda vuelta)
La pantalla vuelve a tener la estructura del diseño original (clases `fs-*`), llena solo con datos reales:
- Encabezado con parcela (y hectáreas si dibujó) y plan (`recomendacion.rotacion`); burbuja con la pregunta real.
- "Cómo llegó a la respuesta": los pasos son `proceso` del servidor; el total en segundos se mide en el navegador (`performance.now`), sin tiempos por paso.
- Respuesta corta: primera frase como titular y el resto en frases cortas (se quitan las citas `[SIAP]`, las fuentes salen aparte).
- Por qué esta respuesta (razones de los 3 mejores cultivos, de cada parcela o de los escenarios del modelo de riesgo), Riesgos y límites (predicción, modelo, corroboración, notas y aviso de estimación), calendario de lluvia media mensual de la parcela (jun a sep resaltado) con la temporada de cada año de la rotación, y fuentes y enlaces.
- Columna derecha: Datos usados, "Confianza del modelo" (solo si viene `riesgo_modelo`, sin porcentaje), años analizados, lluvia media al año (suma de la media mensual), años secos "N de M", pH y arcilla (o "—"), plan real, PDF con `window.print()`, ficha, "Lo que me has dicho".
- Las fechas de siembra NO se muestran: aviso "aún sin verificar".

## Qué se quitó por ser de ejemplo
Anillo de confianza, segundos por paso, transcripción de voz falsa, hora fija, humedad y fechas de siembra del calendario, plan de ejemplo y sugerencias fijas.

## La ficha del agricultor
- `useParcela` ahora tiene `perfil`, `setPerfilCampo(campo, valor)` y `reiniciarPerfil()`.
- Se guarda en `localStorage` con la clave `fieldshift.perfil.v1` (con try/catch: sin localStorage sigue funcionando en memoria). `agua` y `prioridad` siguen en su estado de siempre (`fieldshift` selection) y se mezclan en `perfil`.
- Los campos y opciones salen de `GET /api/perfil/preguntas`; un campo nuevo del servidor aparece solo en "Lo que me has dicho".
- Ahí cada dato se puede cambiar o borrar. "Guardar mi ficha en un archivo" baja `mi-ficha.json`; "Cargar mi ficha" lo sube y solo acepta campos que el servidor conoce con valores válidos (opciones o rango numérico); lo demás se ignora.

## Cómo probarlo
1. `http://localhost:5173/analisis`, toca "Qué sembrar" y "¿Qué me conviene sembrar?".
2. Contesta un botón de "Para afinar": aparece en "Lo que me has dicho" y no se vuelve a preguntar.
3. Guarda la ficha, bórrala y cárgala de nuevo.
4. Revisión rápida: `/analisis?pregunta=¿Qué me conviene sembrar?`.

## Límites
- En la captura sin cabeza el tiempo sale 0.0 s porque el reloj es virtual; en un navegador normal es el tiempo real.
- Sin cuentas ni servidor de datos: la ficha vive en el navegador y en el archivo.
- El micrófono no se probó en un navegador real (necesita permiso y grabación).
- Si el servidor rechaza un valor guardado (400), se muestra su mensaje de error.
- `agua` y `prioridad` siempre aparecen como contestadas porque tienen valor por defecto en la app.

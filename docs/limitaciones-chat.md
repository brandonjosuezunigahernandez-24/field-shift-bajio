# Limitaciones del asistente (chat) — 14 nov 2026

Lista honesta de lo que el asistente **no** hace o hace mal hoy. Sirve para el equipo, para el pitch ("qué sigue") y para no prometer de más. Detalle de cada punto en `docs/cambios/`.

## Lo que sí hace (resumen)
> Si te parece mucha información: lee solo la sección **"Cómo reducir estas limitaciones"** al final.

Responde en español con un modelo **local** (Gemma 4B por Ollama, sin internet para el modelo) usando solo una ficha de datos: clima histórico (NASA POWER), suelo (SoilGrids), pronóstico de 7 días (Open-Meteo), tarjetas de conocimiento, Wikipedia y datos del SIAP por cultivo. Cita la fuente, revisa que los números existan en la ficha y, si el modelo falla, responde con una plantilla. Acepta voz con Whisper local (ruta lista, falta el micrófono en el front).

## Limitaciones del modelo y de las respuestas
1. **Un modelo chico se equivoca.** Gemma 4B (4 mil millones de parámetros) a veces: cita la fuente equivocada (`[SoilGrids]` en una temperatura), mezcla datos de la parcela con los de un cultivo, añade frases de relleno o un "No tengo ese dato" de más, y contesta más de lo que se preguntó.
2. **El verificador es débil.** Solo comprueba que cada número aparezca en la ficha. **No detecta** un número real puesto en el lugar equivocado, ni frases falsas sin números. Los números ≤ 3 siempre pasan (así se coló "2 años" cuando eran 1; se arregló para ese caso, no en general).
3. **Respuestas cortas y sencillas.** Repite con otras palabras el texto que le damos; no razona ni analiza. Respuestas más completas salen de más datos verificados, no de entrenar el modelo.
4. **El primer mensaje tarda ~30 s** (carga del modelo); después 2–10 s. Probado solo en una laptop con GPU RTX 4060 de 8 GB. **No se probó en una laptop modesta** (el 1B no sirve: rechaza todo; el 4B necesita ~3 GB).
5. **Memoria corta y solo si el front manda el historial** (2 vueltas). El servidor no guarda sesiones; no está probado a fondo que el modelo la use bien.
6. **Recomendador provisional** (`docs/cambios/12`): recomienda con datos del SIAP por estado y simula ingresos, pero es ingreso **bruto** (sin costos ni inflación), de 7 años, no de la parcela, y no usa clima ni suelo. No es aprendizaje automático. Hortalizas excluidas. No es el motor del equipo (`/api/recomendar` sigue en 501). Sin precios de fertilizantes (no hay fuente confirmada en México).

## Limitaciones de los datos
7. **NASA POWER y SoilGrids:** una sola parcela de prueba (Celaya) y sin internet solo funcionan los puntos ya guardados; una parcela nueva sin conexión da error 502. Si SoilGrids no tiene suelo (ciudades) lo dice, no inventa.
8. **Pronóstico (Open-Meteo):** solo 7 días; no sirve para decidir qué sembrar. Gratis solo para uso **no comercial**; hay que citarlo. Se envía lat/lon (redondeados) a un servicio externo.
9. **SIAP:** 2018–2024, 8 cultivos, **por estado** (Guanajuato y Querétaro), no por parcela ni municipio; el asistente no sabe en qué estado está la parcela y muestra ambos. "Siniestrada" = superficie dañada por clima u otras causas (no solo sequía). El precio es el medio rural del último año. Los años secos de NASA en Celaya no coinciden del todo con las pérdidas del SIAP.
10. **Tarjetas de conocimiento (16):** 12 verificadas contra FAO/USDA/NRCS/INIFAP/SENASICA/gob.mx, 3 parciales (textura, jitomate, trigo y cebada) y 1 definición. En siembra del maíz no hay fechas del Bajío; en invernadero las fuentes son de túneles de EE.UU. La verificación se hizo con **resúmenes de búsqueda**, no leyendo cada documento completo. El estado `verificado` **no se muestra** al agricultor.
11. **Wikipedia** solo da definiciones, no manejo del cultivo; requiere internet la primera vez (luego se guarda). Un dato de Wikipedia de otro país puede colarse. No hay búsqueda semántica: si la pregunta usa otras palabras que la base, no encuentra nada.
12. **Cultivos sin tarjeta ni SIAP ni página útil** → "No tengo ese dato". Solo hay datos del SIAP para: maíz, sorgo, frijol, trigo, cebada, garbanzo, brócoli y jitomate.

## Limitaciones de voz y mapa
13. **Voz:** probada solo con voz sintética de Windows (1 error en una frase). Con voz real, ruido y acentos puede fallar más. La ruta `/api/voz` existe, **el micrófono no** (falta en el front). La respuesta hablada depende de una voz en español instalada en cada laptop (en la tuya hay una).
14. **Acciones de mapa** (`zoom_parcela`, `resaltar_anios_secos`…): las deduce el código por palabras clave y pueden equivocarse. **El front todavía no las ejecuta.**
15. **La página `/probar` es solo una herramienta de prueba:** parcela fija (Celaya), sin mapa ni micrófono.

## Limitaciones técnicas y de proceso
16. **Contrato de API:** `/api/asistente`, `/api/voz` y `/api/pronostico` son **propuestas** escritas en `docs/api-contract.md`; el equipo no las ha aceptado.
17. **Dependencias nuevas:** `@huggingface/transformers` (voz) en el servidor; `CLAUDE.md` pide avisar antes de cambiar el stack. Modelos (~3.4 GB Gemma + 281 MB Whisper) **no van al repo**: cada laptop debe descargarlos una vez (`ollama pull gemma3:4b`; Whisper se baja solo al primer uso con internet).
18. **Sin autenticación ni límites de uso** en el servidor (como el resto del proyecto, pensado para correr local). Sin CORS configurado.
19. **Pruebas:** 50 automáticas pasan; las pruebas con el modelo son manuales y con pocas preguntas (nunca se corrió el set de 15 preguntas del plan).
20. **Privacidad:** el modelo y la voz corren en la laptop; lo único que sale a internet es lat/lon redondeados (Open-Meteo) y una palabra de la pregunta (Wikipedia).

## Cómo reducir estas limitaciones (en orden)
1. Micrófono, chat y acciones de mapa en el front; probar con voz real.
2. Abrir los enlaces de `respaldo` y leer los documentos completos (la verificación fue con resúmenes de búsqueda).
3. Correr el set de 15 preguntas con trampas y reportar el número.
4. Conectar el motor de recomendaciones cuando exista.
5. Memoria corta de conversación (últimas 2 preguntas).
6. Modelo de riesgo con clima NASA + pérdidas SIAP (`docs/ml-plan.md`).

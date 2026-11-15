# 34. Modelo local (gemma3:4b) mejorado: prompt corto, ficha recortada y tarjetas por parecido

Rama `agente/llm-offline`. Fecha: 14 nov 2026.

## Qué pasaba
Las preguntas que no atrapan las plantillas («¿conviene meter abono orgánico?», «¿qué hago con un suelo salitroso?») van a
gemma3:4b con la ficha completa. El modelo:
- **soltaba números de relleno**: a «¿cómo mejoro un suelo cansado?» contestaba con el pH, la lluvia mediana y los 6 años secos;
- **se negaba a medias**: daba el dato de la tarjeta y luego «No tengo ese dato para tu parcela.»;
- **se ciclaba** en el JSON forzado hasta los 300 tokens y la respuesta se cortaba (4 de 45 caían a la plantilla por eso);
- nunca decía **a quién preguntar** cuando no sabía, y casi nunca daba **algo que hacer**.

## Cómo se midió
- **Set nuevo** `server/test/eval/modelo-abierto.json`: 45 preguntas abiertas que hoy llegan al modelo (`origen: 'llm'`), sacadas de
  `preguntas.json` y escritas como las haría un agricultor. Se comprobó con un Ollama falso que las 45 van al camino del modelo.
  - 29 **tarjeta**: hay tarjeta de `conocimiento.json` que la contesta → debe citar `[Base local]` y no negarse.
  - 15 **sin_dato**: no hay dato verificado → debe decir «no lo sé» **y a quién preguntar** (o contestar solo con una tarjeta citada).
  - 1 **parcela**: «Dime todo sobre mi parcela» → datos con `[NASA POWER]`.
  - Para todas: `incluye`/`excluye` (regex), ≤ 80 palabras, sin dosis, solo fuentes conocidas entre corchetes; algunas exigen una acción.
- **Script** `server/scripts/evaluar-modelo.js`: levanta la app en el mismo proceso (sin internet, `OFFLINE=1`), calienta el modelo
  (no cuenta en el tiempo), manda las 45 en serie y lee los tokens que devuelve Ollama.
  **Útil** = cumple todo y lo contestó el modelo. **Respaldo** = el verificador o un error lo cambió por plantilla.
- Máquina: laptop con RTX 4060 8 GB (gemma3:4b corre 100 % en GPU). **Ollama es compartido con otros agentes**: cuando otro proceso
  lo usa, cada respuesta sube a ~20 s. Por eso se reporta también la mediana; el p90 de corridas con otros procesos no es del modelo.

## Resultados (mismas 45 preguntas, gemma3:4b)

| | Antes | Después |
|---|---|---|
| Útil (criterios automáticos) | **20/45 (44 %)** | **37/45 (82 %)** |
| · con tarjeta | 20/29 | 21/29 |
| · sin dato («no sé + a quién preguntar») | 0/15 | 15/15 |
| · resumen de parcela | 0/1 (se cortó) | 1/1 |
| Respaldo (plantilla en vez del modelo) | 9 % (4 cortes del JSON) | 2 % (1) |
| Tiempo medio / mediana / p90 | 3373 / 2852 / 3816 ms | 1852 / 1367 / 1693 ms |
| Tokens entrada + salida (media) | 756 + 93 | 584 + 33 |
| Revisión a mano: respuestas con relleno o datos inventados | ver abajo | ver abajo |

«Después» es la corrida `v6` con la configuración final (sin otros procesos usando Ollama). La corrida de confirmación (`final`)
dio **la misma calidad (37/45, 82 %)**, pero con otro proceso usando Ollama al mismo tiempo: mediana 20.6 s por pregunta. Ese
tiempo es de la cola de Ollama, no del modelo.

**Revisión a mano** (leyendo las 45 de cada corrida): antes, 11 de las 15 «sin dato» rellenaban con lluvia o suelo que no venían al
caso y 1 inventaba («daños por heladas [SIAP]»); después, las 15 dicen que no saben y a quién preguntar. Siguen saliendo frases
flojas en ~5 de las 29 con tarjeta (p. ej. «La erosión frena la erosión [Base local]», o usar la tarjeta del maíz para el frijol).
El verificador de números no ve eso: es el límite de un modelo de 4B.

Pruebas de prompt que **no** se quedaron (cada una medida contra la anterior):
- `repeat_penalty 1.15` (v3, 93 % en el criterio automático) **borraba los números** de la respuesta («llueve de mm»): la penalización
  alcanza a los números del prompt. Se quitó.
- Pedir la acción «solo si los DATOS lo dicen» (v4): más negativas con tarjeta. Se regresó a «una cosa concreta, sacada de los DATOS».
- Quitar el 3.er ejemplo pocos-disparos (v5): bajó a 67 % y «Dime todo sobre mi parcela» se negó. Se regresó.
- La búsqueda de tarjetas con pedazos de letras de `intencion-ml.js` (`rasgos`) emparejaba mal («cosechar el sorgo» → cualquier
  tarjeta con «sorgo», «pH» → plagas); se usó tf-idf de palabras (5 letras) sin relleno.

## Qué cambió
- **`server/llm/prompt.js` (nuevo)**
  - Prompt de sistema de 5 líneas: técnico de campo del Bajío; 2 a 4 frases; primero la respuesta, luego una cosa que hacer sacada
    de los datos; cita entre corchetes la fuente que trae la ficha; si nada habla del tema: «No lo sé con mis datos. Pregúntale a un
    técnico del INIFAP o de la SADER de tu zona.»
  - 3 ejemplos pocos-disparos: uno contestado con tarjeta + acción, uno con tarjeta que no viene al caso (→ no sé) y uno sin datos (→ no sé).
  - `tarjetas(pregunta)`: tf-idf + coseno sobre `conocimiento.json` (palabras clave + texto), máximo 2, umbral 0.1.
    `findLocal` de `contexto.js` no se tocó (lo usa el enrutado).
  - `recortarFicha(ficha, pregunta)`: el modelo solo ve lo que la pregunta pide. Lluvia de verano solo si habla de lluvia/sequía/
    temporal/agua; suelo solo si habla de pH, arcilla, textura, encharcamiento…; los 7 días del pronóstico solo si pregunta por un día
    (si no, solo el resumen); SIAP solo si pregunta precio/rendimiento/pérdida… o no hay tarjeta. «Dime todo sobre mi parcela» lleva
    lluvia y suelo. Las tarjetas locales se eligen de nuevo por parecido; los textos de Wikipedia se quedan.
  - `mensajes()`: sistema + ejemplos + historial + `DATOS: {...}\nPREGUNTA: ...`.
- **`server/llm/ollama.js`**: texto libre en vez de JSON forzado (más corto; las fuentes se leen de los corchetes); `temperature 0`,
  `num_ctx 2048`, `num_predict 180`, `keep_alive 30m` (variable `OLLAMA_KEEP_ALIVE`); `precalentar()`.
  El streaming manda el texto tal cual sale. `partialRespuesta` ya no se usa (se dejó porque `respuestas.test.js` la prueba).
- **`server/llm/responder.js`**: recorta la ficha antes de llamar al modelo y el **verificador revisa contra la ficha recortada** (un
  número que el modelo no vio no pasa). `REFUSAL` reconoce también «No lo sé con mis datos». El respaldo usa la tarjeta elegida por parecido.
- **`server/routes/asistente.js`** (solo `conModelo`): si el modelo citó `[Base local]`, `base` es `conocimiento` aunque `findLocal` no
  hubiera encontrado tarjeta.
- **`server/index.js`**: precalienta el modelo al arrancar, en segundo plano (`OLLAMA_PRECALENTAR=0` lo apaga). La primera pregunta
  ya no espera la carga (en esta máquina 8 a 30 s según la bitácora y el calentamiento medido). No se midió la carga en frío para no
  descargar el modelo que usan los otros agentes.
- **Pruebas** `server/test/prompt.test.js` (8, sin Ollama): tarjetas por parecido, recorte de ficha, mensajes y que el verificador revisa
  contra la ficha recortada.

## Ejemplos reales antes / después
| Pregunta | Antes | Después |
|---|---|---|
| ¿Cómo mejoro un suelo cansado? | «Tu suelo tiene un pH de 7.4 y un contenido de carbono orgánico de 12.1 g/kg [SoilGrids]. El suelo ha estado seco en 6 años entre 2000 y 2023 [NASA POWER]. No tengo ese dato para tu parcela.» | «No lo sé con mis datos. Pregúntale a un técnico del INIFAP o de la SADER de tu zona.» |
| ¿Qué hago si se me heló el frijol? | «Según los datos, en Guanajuato, el frijol tiene una pérdida promedio del 6.6% [SIAP]. Esto significa que en algunos años ha habido daños por heladas [SIAP]. No tengo ese dato para tu parcela.» (inventa la causa) | «No lo sé con mis datos. Pregúntale a un técnico del INIFAP o de la SADER de tu zona.» |
| ¿Conviene meter abono orgánico? | «Un suelo con más materia orgánica guarda mejor la humedad y es más fértil [Base local]. No tengo ese dato para tu parcela.» | «Sí: un suelo con más materia orgánica guarda mejor la humedad y es más fértil [Base local]. Considera mejorar la calidad de tu suelo.» |
| ¿Qué hago para que mi tierra tenga más nitrógeno? | Copia la tarjeta de leguminosas completa, sin acción. | «Sí: las leguminosas toman nitrógeno del aire [Base local]. Después de la cosecha, puedes sembrar frijol o garbanzo.» |
| Dime todo sobre mi parcela | JSON cortado a los 300 tokens → plantilla. | «La lluvia promedio en verano es de 528.9 mm [NASA POWER]. En los últimos años, hemos tenido 6 años secos entre 2000 y 2024 [NASA POWER]. El umbral seco es de 423.2 mm [NASA POWER].» |

Lo que sigue fallando: 3 preguntas con tarjeta se niegan («¿qué pasa si quemo el rastrojo?», «¿qué hago con las plagas del frijol?»,
«¿cuál es la ventaja de tener riego?»); alguna tarjeta que no viene al caso se cuela (maíz para las flores del frijol).
Más tarjetas verificadas ayudan más que seguir moviendo el prompt: las 15 «sin dato» de este set son una lista de tarjetas por escribir.

## Modelos
`ollama list`: gemma3:4b, gemma3:1b, qwen2.5-coder:7b (4.7 GB, de código: no sirve y pasa de 3 GB). Prueba de gemma3:1b con la
configuración nueva: **20/45 (44 %)**, mediana 650 ms. Es el doble de rápido pero recorta mal las tarjetas y
inventa consejos («Puedes añadir compost o estiércol», «Haz una adición de compost»). No sirve como reemplazo; se queda gemma3:4b.
**Recomendación (no se bajó nada):** probar **qwen2.5:3b** (~1.9 GB): sigue mejor instrucciones y formato que gemma de su tamaño y
su español es bueno; es menos de la mitad de RAM que gemma3:4b, útil para laptops sin GPU. llama3.2:3b (~2 GB) es la otra opción,
pero su español es más flojo. Bajarlo y correr `OLLAMA_MODEL=qwen2.5:3b node scripts/evaluar-modelo.js` da la comparación directa.

## Diseño del modo «con internet» (NO activado)
Objetivo: cuando haya internet y una llave, usar un modelo en línea más grande por el **mismo camino** (mismo prompt, misma ficha
recortada, mismo verificador y misma plantilla de respaldo), y caer solo al modelo local si algo falla.

- **Variables** en `server/.env` (ya está en `.gitignore`; no hay llave real en el repo):
  `LLM_ONLINE=1` (apagado si falta), `LLM_ONLINE_URL` (endpoint compatible con chat completions), `LLM_ONLINE_KEY`,
  `LLM_ONLINE_MODEL`, `LLM_ONLINE_TIMEOUT_MS=8000`. Node 20+ las lee con `node --env-file=.env index.js`, sin dependencias.
- **Interfaz**: una función con la misma firma que `askModel(ficha, pregunta, { historial })` → `{ respuesta, fuentes }`, que arma
  los mensajes con `mensajes()` de `prompt.js`. `answer()` ya acepta `ask` inyectado, así que `conModelo` solo elige:
  `ask = online ? (f, q, o) => askOnline(f, q, o).catch(() => askModel(f, q, o)) : askModel`. Sin internet (`OFFLINE=1`), sin
  llave, error HTTP o timeout → modelo local; si el local también falla → plantilla (como hoy).
- **Qué se envía**: solo la ficha recortada (resúmenes de clima, suelo, SIAP y tarjetas; **sin lat/lon, sin perfil, sin hectáreas**) y
  la pregunta. **Sin historial.** La pregunta es texto del agricultor: decidir si se pide permiso en la pantalla antes de prenderlo.
- **Igual que el local**: el verificador revisa los números contra la misma ficha recortada y `origen` sería `llm-online` para medirlo
  con `evaluar-modelo.js` (mismo set, misma tabla).

## Cómo reproducir
```
cd server && npm install
ollama pull gemma3:4b                      # una vez
node --test                                 # incluye test/prompt.test.js (no necesita Ollama)
node scripts/evaluar-modelo.js --json salida.json          # ~2-3 min con GPU; corre en serie
OLLAMA_MODEL=gemma3:1b node scripts/evaluar-modelo.js      # otro modelo ya bajado
```
Antes de correrlo, revisa con `ollama ps` que nadie más esté usando el modelo; si no, el tiempo sale inflado.

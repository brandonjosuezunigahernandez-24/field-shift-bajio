# 33. Prueba de conversación con parcela dibujada, perfil lleno y más entrenamiento

Rama `agente/entrenamiento`. Fecha: 14 nov 2026.

## Qué se probó
Lo mismo que manda la pantalla a `/api/asistente`: una **parcela dibujada** (polígono), su centro como `lat/lon`, las hectáreas
calculadas del dibujo, el **perfil completo** (temporal, prioridad «arriesgar menos», estado, antes frijol, **ahorita maíz**, hectáreas,
textura arcillosa, no se encharca) y el **historial** de la plática (las 2 vueltas anteriores, como el front).

| Parcela | Centro (promedio de esquinas) | Superficie | Suelo (SoilGrids) |
|---|---|---|---|
| Celaya, Gto. (5.5 km al sur del centro) | 20.46987, -100.81015 | 7.94 ha | pH 7.4, 42 % arcilla |
| Amealco, Qro. (temporal, ladera) | 20.19974, -100.14004 | 4.07 ha | pH 5.9, 37 % arcilla |

Preguntas por parcela: `preguntas.json` (59), `maiz.json` (40), `frutas.json` (32), `maiz-preguntas-agricultor.json` (32),
**`conversacion.json` (62 nuevas)**: seguimientos («¿y si llueve poco?», «¿y el frijol?», «¿y en 2023?», «¿cuánto me dejaría?») y preguntas
que dependen del perfil («¿cuánto voy a cosechar?», «¿qué tan riesgoso es lo que tengo sembrado?»). Se reparten en **dev (30)**, con las que
se arregló y entrenó, y **prueba (32)**, que no se usó para nada de eso. Al final se sumó el banco del agente de acciones
`preguntas-investigadas.json` (90; 1 de cada 3 es prueba).

## Cómo correrlo
```
cd server
PORT=3072 node index.js &
node scripts/probar-conversacion.js                 # 2 parcelas; escribe test/eval/resultados-conversacion-<fecha>.json
node scripts/probar-conversacion.js --solo=celaya --set=prueba
node scripts/probar-conversacion.js --recalificar=antes   # califica de nuevo un archivo guardado con las reglas de hoy
```
Por cada respuesta se guarda: pregunta, pregunta anterior, tema esperado y obtenido, origen, respuesta, gráficas, tiempo y fallas.

**Calificación automática** (`calificar()` en el script): tema esperado (mismas etiquetas que `intenciones.json`), `incluye`/`excluye`,
citas, ≤ 6 frases, números con fuente (cita entre corchetes y `verificado`). Los `incluye`/`excluye`/`cita` de los archivos viejos se
escribieron con números de Celaya: en Amealco solo se revisan tema, largo y fuentes. Cada falla se clasifica: tema equivocado, se pasa a
tema relacionado, ignora el cultivo actual, ignora el perfil o las hectáreas, falta dato, número sin fuente, demasiado larga.

## Antes y después (mismas 450 respuestas: 225 por parcela, misma vara)

| | Antes | Después |
|---|---|---|
| Tema correcto | 340/416 (82 %) | **400/416 (96 %)** |
| Bien contestadas (pasan todo) | 343/450 (76 %) | **431/450 (96 %)** |
| conversacion **dev** | 26/60 | 60/60 (se arregló con estas: no cuenta como medida) |
| conversacion **prueba** (nunca vista) | 26/64 | **50/64** |
| Ignora el cultivo actual | 53 | 4 |
| Demasiado larga (> 6 frases) | 30 | 2 |
| Van al modelo de lenguaje | 31 | 5 |

Banco investigado (90 × 2 parcelas, sin medida «antes» con el servidor): **138/180** con el tema esperado; en su parte de prueba **40/60**.
Varias de sus etiquetas son discutibles («¿Qué siembro que aguante la sequía?» espera `secos`; sale la recomendación).

Clasificador de intención (`entrenar-intencion.js`): la semilla creció de 1094 a 1322 preguntas (33 intenciones: se agregaron `apoyos` y
`credito`). Al agregar grupos, 35 preguntas viejas de prueba pasaron a entrenamiento; para comparar parejo se usan las **299** que siguen
en prueba en las dos versiones: **76.9 % → 78.6 %** (palabras + respaldo). En la prueba nueva completa (403): 77.7 %.

Revisé a mano todas las respuestas de conversación de Amealco y las fallas de las dos parcelas.

## Qué se arregló (con prueba de regresión en `test/conversacion.test.js`)
1. **El perfil sí cuenta** (`llm/seguimiento.js`, nuevo): con `cultivo_actual: maiz`, «¿cuánto voy a cosechar?», «¿a cómo me lo van a
   pagar?», «mi cultivo», «lo que tengo sembrado» van al módulo del maíz (antes: lluvia, SIAP o el modelo, que contestaba «La cosecha de maíz
   puede variar» con los años secos). Lluvia, suelo, «¿qué me conviene sembrar?» y preguntas de otro cultivo no se tocan.
2. **Seguimientos**: «¿y el frijol?» tras «¿A cuánto se paga el maíz?» -> precio del frijol; «¿y en 2023?», «¿y en marzo?» usan la pregunta
   anterior (antes: el respaldo fijo con el resumen de la parcela).
3. **Después del maíz no se recomienda sorgo**: la rotación sigue al cultivo actual (antes usaba solo el último: en Amealco ponía maíz tras
   maíz), y la lista de arriba no pone primero un cultivo de la misma familia. El texto dice «tomé en cuenta que ahorita tienes maíz».
4. **Respuestas más cortas**: la recomendación bajó de 11-12 a 5 frases (la comparación NASA/SIAP va en una frase; la completa sigue en el
   campo `corroboracion`); la decisión del maíz de 7 a 6.
5. **Lo que dice la pregunta gana al perfil**: «con 25 hectáreas», «en Querétaro», «maíz de riego» (antes usaba 7.94 ha, Guanajuato y temporal).
6. **SIAP con su estado y su modalidad**: en Amealco ya no contesta con Guanajuato ni con sorgo de riego; si no hay la modalidad pedida, lo dice.
7. **Fuera de tema con plática**: el front siempre manda historial, y por eso «¿Quién ganó el mundial?» iba al modelo (contestó «Argentina»).
   Ahora solo un seguimiento corto («¿y eso?», «¿por qué?») se salta el «fuera de tema».
8. **Pedidos del coordinador**: apoyos (Producción para el Bienestar, seguro catastrófico, precio de garantía, acopio) ya no son fuera de tema:
   tema `apoyos`, respuesta honesta que apunta a «Qué hacer» solo si ahí hay acción. «¿Cómo consigo un crédito?» -> tema `credito` (no hay
   fuente verificada; bancos y financieras con respaldo de FIRA, o el CADER), ya no fechas de siembra. La plantilla de siembra ya no dice
   «no tengo fechas» cuando «Qué hacer» trae la fecha del INIFAP (frijol): la cita. El maíz sigue sin fecha (no hay acción con fecha).
9. Bug viejo en `routes/asistente.js`: dos expresiones tenían un carácter de retroceso en vez de `\b` (`\bfri[oa]`, `que es\b`); nunca hacían match.

## Lo que sigue mal
- **Prueba de conversación (14 de 64 mal)**: «¿Qué pongo cuando levante la cosecha?» -> peligro («pongo»); «¿En qué mes conviene sembrar?» ->
  decisión del maíz (la regla del cultivo actual se pasa: «conviene»); «¿cuánto pagan por tonelada?» -> fuera; «¿mi terreno es bueno para lo
  que siembro?» -> recomendación; «¿Le sigo con lo que tengo o cambio?» y «¿por qué no me sale el maíz?» -> «no tengo ese dato del maíz»;
  «¿Está lloviendo menos cada año?» -> lluvia, no tendencia. No las arreglé para no entrenar con la prueba.
- «¿Por qué ese cultivo?» (seguimiento de la recomendación) lo contesta el modelo de lenguaje y habló de la lluvia, no de las razones.
- Banco investigado: rastrojo, barbecho, canícula y plagas van al modelo de lenguaje (ya no a «fuera de tema»); semillas por hectárea y
  variedades dicen «no tengo ese dato» aunque «Qué hacer» trae la densidad del INIFAP; «¿Vendo la pastura…?» cae en precio del maíz.
- «llueve?» va al pronóstico (la etiqueta dice lluvia; es ambiguo). La trampa «¿verdad que rinde 8 t/ha?» queda en 7 frases.
- La aptitud de la fresa en Amealco cita la superficie de Guanajuato. El seguimiento por historial solo entiende «y + cultivo/año/mes» o lo
  pega a la pregunta anterior; no resuelve «eso», «ese» ni pronombres.
- La prueba la escribí yo con el mismo estilo que el entrenamiento: con agricultores reales el número puede bajar.

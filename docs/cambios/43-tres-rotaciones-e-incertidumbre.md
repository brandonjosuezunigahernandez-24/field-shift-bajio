# 43 · El motor compara 3 rotaciones (incluida la de hoy) y dice lo que no sabe

## Por qué
El reto pide comparar **al menos 3 estrategias de rotación, incluida la actual**. Para cada una pide decir:
- por qué se sugiere;
- qué evidencia la respalda;
- qué beneficios da;
- qué huecos de información hay;
- qué riesgos debe revisar un técnico local.

También pide explicar la incertidumbre. El motor daba un solo plan y su riesgo sin margen. Con 25 años, el riesgo del
maíz en Celaya (12 de 25) puede ser de 33 % a 64 %. Y el umbral de lluvia del maíz, que no está verificado, cambia el
resultado de 9 a 17 años si fuera 10 % menor o mayor.

## Qué cambió
- **Motor** (`server/engine/index.js`). `recommend` devuelve además:
  - **`estrategias`** con 3 rotaciones:
    1. **La de hoy**:
       - Es lo que el agricultor dijo que siembra (`[ultimo_cultivo, cultivo_actual]`): un cultivo se repite y dos se alternan.
       - Si no dijo nada, es lo más sembrado del SIAP en su estado, agua y temporada, marcado como supuesto.
         Temporal: maíz (58 % en Gto, 91 % en Qro). Riego en Gto: maíz + trigo.
    2. **La recomendada**: la misma `rotacion` de siempre.
    3. **La mejor para otra meta** que dé un plan distinto (orden: suelo, riesgo, ganar, agua). Si ninguna da otro plan,
       «Otra opción: empezar con …», que avisa si rompe la regla de familia.

    Cada una trae `resumen`:
    - el riesgo y su rango;
    - leguminosas y familias;
    - el agua que necesitan sus cultivos;
    - el ingreso bruto del SIAP.

    Además trae `porque`, `evidencia`, `beneficios` (contra la de hoy), `huecos` y `revisar`.
  - **`incertidumbre`**: clima de NASA POWER (cuadro de ~50 km), los 25 años, los cultivos sin verificar con su
    sensibilidad, el suelo de SoilGrids, el ingreso por estado, el agua de riego y «no sustituye a un técnico».
  - Por cultivo: **`riesgo_rango`** (Wilson al 90 %) y **`sensibilidad`** (±10 % del umbral).
  - Funciones nuevas y probadas: `riskInterval`, `thresholdSensitivity` y `existingRotation`. Para armar las 3
    rotaciones, el puntaje se calcula por meta con `rank`; la salida de la meta del agricultor no cambia.
- **Ruta** (`POST /api/recomendar`): acepta `rotacion_actual`. Con `topCropBySeason` (en `server/llm/siap.js`) pasa
  al motor lo más sembrado del SIAP.
- **Asistente**: manda la misma rotación de hoy que la pantalla. «¿Qué siembro?» compara contra seguir igual, y la
  ficha del modelo lleva las 3 rotaciones.
- **Simulador 3D**:
  - La tarjeta 1 es «Compara 3 rotaciones»:
    - un botón por rotación; la elegida manda en los años y en el mapa;
    - las 3 lado a lado (`ComparaRotaciones`, con `client/src/lib/comparacion.js` probado):
      - un bloque por medida: riesgo con rango, leguminosas, familia repetida, agua e ingreso;
      - en cada renglón, el nombre, la barra y la cifra;
      - la elegida en verde y las otras en gris;
      - «✓ mejor» en palabras; en ingreso, menos de 5 % de diferencia cuenta como empate;
      - en celular la barra baja bajo el nombre;
    - las listas «Lo bueno», «Con qué datos lo sabemos», «Qué no sabemos» y «Revísalo con tu técnico».
  - Tarjeta nueva: «Lo que no sabemos».
  - En el ranking, el riesgo con su rango.
- **Perfil**: «¿Qué sembraste la última vez?» y «¿Qué tienes sembrado ahorita?» dicen que con eso se compara.

## Cómo se probó
- Motor (Celaya real), en `server/test/engine.test.js`:
  - el intervalo de 12 de 25 da 33 a 64 %;
  - la sensibilidad del maíz va de 9 a 17;
  - la rotación de hoy (repetir, alternar, riego, supuesto);
  - las 3 rotaciones distintas y que cumplen las reglas;
  - el respaldo con su aviso;
  - la incertidumbre.
- `server/test/siap.test.js`: lo más sembrado por temporada (maíz 58 % en Gto, 91 % en Qro, cebada en OI de riego de Qro).
- `server/test/api.test.js` y `server/test/coherencia.test.js`:
  - la ruta con y sin rotación de hoy, con ids raros y con `cultivo_previo`;
  - el chat trae las mismas 3 rotaciones que la pantalla y la frase de comparación.
- `client/src/lib/rotacionActual.test.js`.
- En el navegador: los 3 botones cambian años, resumen y cultivo del mapa. La tarjeta «Lo que no sabemos» y el rango
  del ranking se ven bien.

## Pendiente
- Verificar contra FAO Ecocrop los requerimientos de los 7 cultivos. Mientras tanto, la sensibilidad de ±10 % dice
  cuánto importa.
- Heladas y calor (con `T2M_MIN` y `T2M_MAX` de NASA POWER, que ya se descargan): no entran todavía al riesgo.

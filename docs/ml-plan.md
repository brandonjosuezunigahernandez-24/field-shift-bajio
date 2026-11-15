# Plan: aprender y predecir (modelo predictivo)

Borrador. Regla de siempre: **el modelo predictivo calcula, el motor decide, el LLM explica.** Nada de esto lo hace el LLM.

## Qué datos hay
- 25 años (2000–2024) de clima mensual **por punto** (NASA POWER) → solo 25 años por parcela.
- Suelo por punto (SoilGrids).
- Opcional: NDVI de MODIS (verdor, sirve como señal de "cómo le fue al cultivo").

## Límite honesto
Con 25 años por parcela **no se puede entrenar un modelo serio** que prediga la lluvia de un año. Pronosticar lluvia estacional es difícil incluso para modelos grandes. Prometer "predicciones" exactas en el pitch sería engañar. Lo que sí se puede hacer bien está en las fases 1 y 2.

## Fase 1 · Estadística honesta (primero, sin ML pesado)
Todo en JS dentro de `server/`, con pruebas.
- **Probabilidad de año seco** por cultivo = años bajo su mínimo / años totales (ya es el "riesgo" del motor).
- **Tendencia**: ¿la lluvia de verano baja con los años? (regresión lineal simple, con su incertidumbre).
- **Escenarios**: remuestrear los 25 años (bootstrap) para estimar "en 3 años de rotación, ¿qué probabilidad hay de al menos 1 año seco?".
- Salida: números con rango ("entre 20% y 45%"), no un solo valor falso de exacto.

## Fase 2 · Machine learning con muchos puntos
Para tener datos suficientes hay que entrenar con **muchos puntos del Bajío a la vez**, no uno.
1. Bajar clima y suelo de ~200–500 puntos del Bajío (con caché, una sola vez, con internet).
2. Variable a predecir: riesgo de año seco, o NDVI de la temporada.
3. Variables de entrada: suelo, lat/lon, lluvia y temperatura de meses previos, tendencia.
4. Modelos simples y explicables primero: regresión logística, árboles / random forest. Comparar contra una línea base ("el promedio histórico"). **Si no la supera, no se usa.**
5. Entrenar en Python (scikit-learn) y exportar a algo que Node lea (coeficientes JSON), para que corra en la laptop del rancho sin Python.
6. Validar separando años (entrenar con 2000–2019, probar con 2020–2024), no al azar.

Dependencia: el equipo del motor define qué es "riesgo" en `cultivos.json`. Hay que alinear antes.

## Fase 3 · Decisiones
"¿Qué pasa si siembro X?" = correr la Fase 1/2 por cultivo y mostrar escenarios al agricultor. El LLM solo los cuenta en español con números que vienen de aquí (pasan por el verificador).

## Cómo se conecta al asistente
Se agrega una sección `pronostico` a la ficha (ver abajo). Así el modelo no necesita más memoria: recibe resultados ya calculados.

## Orden sugerido
1. Fase 1 (puede estar para la demo).
2. Fase 2 solo si el motor ya funciona de punta a punta y sobra tiempo.
3. Cuidado de plantas (abajo), solo si sobra tiempo.

## Idea aparte: cuidado de plantas (si hay tiempo)
No he verificado qué APIs públicas existen hoy ni sus licencias o límites. Candidatas a revisar antes de decidir: Pl@ntNet (identificar planta por foto), Trefle y Perenual (datos de plantas), y el conjunto de datos PlantVillage (imágenes de enfermedades, para entrenar). Requiere internet casi siempre, así que para uso en el rancho habría que descargar datos y un modelo de imágenes local. Es un proyecto aparte: no entra antes del congelamiento.

---

# Versión 2 · Modelo realista con precios y costos (14 nov)

## Datos reales que se pueden usar (revisados en web; falta confirmar formato de descarga)

| Dato | Fuente | Estado |
|---|---|---|
| Tipo de cambio peso-dólar | API SIE de Banxico (serie FIX `SF43718`) | Gratis, **requiere token** de 64 caracteres (header `Bmx-Token`). Confirmar endpoints en la doc oficial. |
| Precios mayoristas de granos | SNIIM (Secretaría de Economía) | Existe serie de granos básicos desde 1998. Falta ver cómo bajarla del portal oficial. |
| Producción, superficie y **precio medio rural** por municipio y cultivo | SIAP (SIACON / cierre agrícola) | Anual. Con producción ÷ superficie sale el rendimiento. Falta confirmar si hay CSV. |
| Clima y verdor | NASA POWER, MODIS NDVI | Ya integrado / opcional. |
| **Precios de fertilizantes en México** | — | **No encontré fuente confirmada.** Los resultados eran de Colombia. No lo inventamos: el agricultor captura sus costos (con valores de ejemplo marcados como no verificados). |

NASA **no** publica precios ni costos; la NASA aporta clima y satélite.

## Modelos, del más realista al más arriesgado

1. **Cuentas de campo (sin ML):** ingreso = rendimiento × precio medio rural; costo = lo que captura el agricultor; ganancia por hectárea. Es la base y siempre debe existir.
2. **Rendimiento según el clima (ML real y viable).** Con SIAP hay rendimiento anual de **muchos municipios por muchos años** → miles de filas, no 25. Entrenar (random forest o gradient boosting; empezar con regresión) rendimiento = f(lluvia de verano, temperatura, suelo, cultivo, municipio) y validar dejando años fuera. Es el modelo que sí vale la pena.
3. **Simulación de escenarios (Monte Carlo):** aplicar el modelo 2 a los 25 años de clima de la parcela → distribución de rendimiento e ingreso. Salidas: ganancia esperada, **probabilidad de pérdida**, peor 10 % de los años. Esto responde "¿qué pasa si siembro X?" con rangos.
4. **Precios por mes:** estacionalidad (cuándo el grano suele estar caro o barato) con ETS/SARIMA y bandas de confianza. **Se mide contra una línea base ingenua**; si no gana, solo se muestra la estacionalidad histórica. Pronosticar el dólar prácticamente no se puede mejor que "mañana ≈ hoy", así que ahí solo se hacen **escenarios** (dólar a ±10 %), no una predicción.
5. **Deep learning:** con datos tabulares y mensuales no gana a los modelos del 2. Tiene sentido solo en imágenes: NDVI/satélite con CNN, o **enfermedades de plantas por foto** (conjunto PlantVillage), que sería el proyecto de cuidado de plantas.

## Selector de decisiones
Para cada cultivo: ganancia esperada, probabilidad de pérdida y peor caso. La **prioridad** del agricultor (ganar / arriesgar menos / cuidar suelo / agua) cambia los pesos. El motor ordena; el LLM lo explica con esos números.

## Guardar información de plantaciones
Archivo JSON local (el stack del proyecto no usa base de datos): cultivo, año, superficie, rendimiento real, costos reales. Sirve para (a) mostrar su historial, (b) ajustar el modelo a su parcela cuando tenga varios ciclos. Los datos se quedan en la laptop.

## Orden realista
1. Cuentas de campo + precios por cultivo (SIAP) — para la demo.
2. Bajar SIAP + clima de muchos municipios y entrenar el modelo 2.
3. Monte Carlo y selector.
4. Precios por mes y dólar (escenarios).
5. Deep learning / plantas: solo después del congelamiento.

**Riesgo principal:** cada paso depende de poder bajar los datos del SIAP y SNIIM; si el formato es incómodo, se come tiempo. Primero hay que ver una descarga real antes de prometerlo en el pitch.

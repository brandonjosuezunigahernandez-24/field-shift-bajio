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

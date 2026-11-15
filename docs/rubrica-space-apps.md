# Rúbrica de evaluación · NASA Space Apps Querétaro 2026

Esta es la rúbrica que usa el jurado (1 a 5 por criterio). Abajo de cada criterio va la evidencia de Field Shift Bajío,
para preparar la presentación. Son datos del repo al 15 nov 2026.

| Criterio | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| **¿Cuánto impacto (calidad y cantidad) puede tener este proyecto?** | No aborda un problema real o relevante, impacto nulo o mínimo. | Problema identificado, pero el impacto es limitado (afecta a pocos usuarios o de manera poco significativa). | Resuelve un problema real con impacto moderado (beneficia a un grupo claro de usuarios). | Potencial de impacto amplio (gran comunidad o sector afectado positivamente). | Alto impacto global o transformador (resuelve un gran problema, inspira y ayuda a muchísimos). |
| **¿Qué tan creativo e innovador es el enfoque?** | Copia directa de algo existente, sin cambios ni mejoras. | Pequeña variación de algo que ya existe, sin gran valor agregado. | Mejora incremental clara de algo existente. | Enfoque innovador y original, poco visto, resuelve de forma distinta. | Altamente creativo, disruptivo, algo totalmente novedoso o inesperado. |
| **¿Es la solución científica y técnicamente viable?** | Imposible de implementar en la práctica (solo idea). | Tiene serias dudas técnicas o científicas, poco probable de funcionar. | Puede funcionar, aunque con limitaciones técnicas o sin pruebas claras. | Científicamente y técnicamente viable, se ve posible en el mundo real. | Altamente viable, con fundamentos sólidos, prototipo funcional y aplicable en la práctica. |
| **¿Es un proyecto receptivo al desafío planteado?** | No responde al desafío, está fuera de contexto. | Responde parcialmente al desafío, pero carece de enfoque claro. | Responde al desafío de forma aceptable, aunque incompleta. | Responde bien al desafío, técnicamente viable y con solución adecuada. | Responde completamente al desafío, con solución robusta, completa y bien alineada. |

## Evidencia por criterio

### 1. Impacto
- **Para quién:** el agricultor de temporal del Bajío. En Guanajuato, el 63.9 % de la superficie agrícola es de temporal
  (INEGI, Censo Agropecuario 2022).
- **Qué problema resuelve:** decide qué sembrar sin saber cuántas veces le ha faltado lluvia a su parcela. La app se lo dice
  con 26 años reales (NASA POWER 2000-2025). Por ejemplo: «al maíz le faltó lluvia en 12 de 26 años aquí».
- **Escala:** funciona en cualquier parcela de Guanajuato y Querétaro que se dibuje en el mapa. El clima y el suelo se ven
  en todo México.
- **Límite honesto:** el SIAP es por estado y los requisitos de los cultivos son rangos generales de la FAO.

### 2. Creatividad e innovación
- El riesgo sale de los **años secos reales de la parcela**, no de un promedio.
- **Compara 3 rotaciones:** la de hoy, la recomendada y otra meta. Cada una trae su incertidumbre (intervalo y qué pasa si
  el umbral cambia ±10 %).
- Tiene un **asistente en español sencillo, con voz, que funciona sin internet** (modelo local, Whisper y caché).
  - El código contesta el 97 % de las preguntas con los datos.
  - Un verificador revisa que no se inventen números.
  - Si no sabe algo, lo dice.
- La parcela se dibuja sobre imágenes de satélite, con relieve 3D y los cultivos creciendo según la lluvia de cada año.

### 3. Viabilidad científica y técnica
- **Prototipo funcional** de punta a punta:
  - mapa, motor de reglas, simulador, asistente y «Probar cultivo»;
  - datos gratis y abiertos: NASA POWER, SoilGrids, SIAP, Open-Meteo y FAO EcoCrop.
- **Pruebas automáticas:** 345 del servidor y 60 del front, todas pasan.
- **Asistente medido:**
  - 88 % en una plática de 270 preguntas, y 82 % en preguntas que nunca se usaron para ajustarlo;
  - con y sin internet da las mismas respuestas.
- **Sin internet funciona** con caché y fixtures de las parcelas de ejemplo.
- **Límites declarados:** cultivos con rango general de la FAO; suelo de SoilGrids (cuadros de 250 m); no sustituye a un
  técnico.

### 4. Respuesta al desafío (Field Shift: Adapting Farms with NASA Data)
| Lo que pide el reto | Dónde está |
|---|---|
| Datos de la NASA | NASA POWER (lluvia, temperatura, heladas, calor, humedad del suelo) y capas GIBS en el mapa |
| Suelo del lugar | SoilGrids: pH, textura y carbono, de 0 a 30 cm y hasta 1 m |
| Características de cada cultivo | `server/data/cultivos.json`, rangos de FAO EcoCrop |
| Lo que quiere el agricultor | Prioridad: ganar, cuidar el suelo, gastar menos agua o arriesgar menos; temporal o riego |
| Rotaciones que cuiden el suelo y se adapten al clima | Rotación de 3 años sin repetir familia, con al menos una leguminosa |
| Al menos 3 estrategias, incluida la actual | Rotación de hoy, recomendada y otra meta, con por qué, evidencia, beneficios, huecos y qué revisar |
| Explicar la incertidumbre | Intervalo del riesgo, sensibilidad del umbral y resolución de los datos |

# Estado del proyecto (14 nov 2026, noche)

Resumen corto para saber dónde estamos. Detalle de cada cambio en `docs/cambios/`.

## Qué funciona hoy (verificado)
| Pieza | Estado | Cómo se verificó |
|---|---|---|
| Asistente local (Gemma 4B), voz (ruta), pronóstico, preguntas generales, SIAP, recomendador, perfil, guía de temas | ✅ funciona | 80 pruebas del servidor + pruebas en vivo con el modelo |
| **Análisis de 2 o más parcelas a la vez** | ✅ nuevo | Pruebas + corrida real (sorgo/cebada el primer año, total de la finca) |
| **Corroboración NASA ↔ SIAP** | ✅ nuevo | Corrida real: ver abajo |
| Integración local: diseño + mapa de dibujo + 3D + asistente flotante | 🟡 compila y se vio en capturas | Capturas con Edge sin cabeza: la pantalla 1, el asistente abierto y la pantalla 2 se ven bien |
| Botón de micrófono, tocar la parcela en 3D, clima de 7 días en 3D | 🔴 sin probar con persona | Solo se probó la lógica y las rutas |

## Lo que dicen los datos al juntar NASA con el SIAP
Maíz y frijol de temporal en Guanajuato, 2018-2024, lluvia de verano de NASA POWER en Celaya contra superficie siniestrada del SIAP:
- Maíz: relación **−0.70**; frijol: **−0.79** (menos lluvia, más pérdidas). 2023 fue seco y con 27 % de pérdidas en maíz.
- Pero **2020 y 2022** NASA los marca secos y el SIAP no reporta pérdidas altas en maíz: las dos fuentes **no coinciden en todos los años**.
- Son **7 años** y el SIAP es por estado: es una pista, no una prueba. Eso es lo que dice el asistente.

## ¿Falta lo de aprendizaje automático (machine learning)? Sí
Lo que hay es **estadística** (simulación con años reales y una correlación), **no un modelo que aprenda**. Para ML de verdad (`docs/ml-plan.md`, Fase 2) falta:
1. Datos de **muchos municipios** (SIAP por municipio) cruzados con el clima de NASA POWER de cada uno: miles de filas en lugar de 7 años.
2. Un modelo simple y explicable (regresión, árboles) comparado contra "el promedio histórico".
3. Validar dejando años fuera (entrenar con 2018-2022, probar con 2023-2024).
Con 7 años de un solo estado **no se puede entrenar nada serio**: hoy habría que tener cuidado de no presentarlo como ML en el pitch.

## Pendiente, en orden
1. **Mirar la integración en el navegador** (mapa que vuela, GPS, tocar la parcela en 3D, clima de 7 días, micrófono) y anotar lo que se vea mal.
2. Mostrar la respuesta del asistente mientras se genera (hoy tarda 3-10 s, la primera ~30 s).
3. Quitar más casos de prueba y conectar la pantalla Análisis IA al asistente real.
4. Decidir con el equipo cómo mezclar las ramas en `main` (`docs/integracion-completa.md`).
5. ML de verdad (Fase 2) si hay tiempo: descargar SIAP por municipio.
6. Fases B-E de `docs/propuesta-producto.md`.

## Dónde está el código
- `feature/llm-asistente`: servidor del asistente y documentos (se sube en cada cambio).
- `integracion/todo`: pantallas integradas (diseño + mapa + 3D + asistente). Rama **nueva** en GitHub, solo para ver cómo quedan juntas; no es `main`.

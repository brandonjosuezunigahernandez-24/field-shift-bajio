# Registro de cambios del asistente (rol LLM)

Un archivo por cambio, en orden. Cada uno responde: **qué se hizo, para qué, cómo responde, cómo probarlo y qué límites tiene.**

| # | Cambio | Estado |
|---|---|---|
| [01](01-modelos-locales.md) | Modelos locales (Ollama + Gemma) | Hecho |
| [02](02-ficha-verificador-plantilla.md) | Ficha, verificador y plantilla | Hecho |
| [03](03-conexion-ollama.md) | Conexión con Ollama y comparación 1B vs 4B | Hecho |
| [04](04-voz-whisper.md) | Voz a texto con Whisper local | Hecho (falta el micrófono en el front) |
| [05](05-rutas-asistente-voz.md) | Rutas `/api/asistente` y `/api/voz` | Hecho |
| [06](06-pronostico-open-meteo.md) | Pronóstico de 7 días (Open-Meteo) | Hecho |
| [07](07-preguntas-generales.md) | Preguntas generales (base local + Wikipedia) | Hecho (textos locales sin verificar) |
| [08](08-mas-lenguaje.md) | Más lenguaje, tarjetas de cultivos y respuestas más completas | Hecho (tarjetas sin verificar) |
| [09](09-datos-siap.md) | Datos del SIAP: prueba de descarga | Hecho (la descarga se corta, falta el script) |
| [10](10-verificacion-tarjetas.md) | Verificación de las tarjetas contra fuentes | Hecho (12 de 16 verificadas) |
| [11](11-datos-siap-en-el-asistente.md) | Datos del SIAP dentro del asistente (2018-2024) | Hecho |
| [12](../limitaciones-chat.md) | Limitaciones del chat y borrador de PR (`docs/pr-asistente.md`) | Hecho |
| [12](12-recomendador-provisional.md) | Recomendador provisional y simulación de ingresos (SIAP) | Hecho (provisional) |
| [13](13-memoria-y-conversacion-guiada.md) | Memoria corta y conversación guiada | Hecho (poco probado) |
| [14](../integracion-prueba.md) | Prueba de integración con las ramas de 3D y frontend (qué corrige cada quien) | Hecho |
| [15](15-perfil-de-parcela.md) | Perfil de parcela (preguntas con "No sé") y clima para la vista 3D | Hecho (falta la pantalla) |
| [16](../propuesta-producto.md) | Propuesta de producto por fases (flujo lineal, línea de tiempo, administración, tienda, simulador) | Hecho |
| [17](../integracion-completa.md) | Integración completa (prueba local): diseño + mapa de dibujo + 3D con info al tocar y clima de 7 días + asistente flotante | Hecho (sin ver en navegador) |
| [19](19-ubicacion-mapa-grande-y-arreglos-del-asistente.md) | Ubicación primero, mapa grande, y arreglos del asistente | Hecho (sin ver en navegador) |
| [20](20-varias-parcelas-y-corroboracion-nasa.md) | Varias parcelas a la vez y corroboración con NASA | Hecho |
| [Estado](../estado-del-proyecto.md) | Dónde estamos y qué falta (incluye aprendizaje automático) | Actualizado |
| 21 | Citas y plantillas por código, set de 15 preguntas, solo CPU, streaming del asistente | Siguiente |

Planes: `docs/plan-features.md` (niveles), `docs/ml-plan.md` (predicción y precios). Guía de pruebas: `docs/probar-asistente.md`. Bitácora larga: `docs/llm-bitacora.md`.

## Agregado el 14 nov (noche)
| # | Cambio | Estado |
|---|---|---|
| [21](21-modelo-entrenado.md) | Modelo entrenado de riesgo (ridge, SIAP municipal + NASA); solo el maíz de Querétaro mejora claramente | Hecho; ver [docs/modelo-ml.md](../modelo-ml.md) |
| [23](23-frutales.md) | Frutales de Guanajuato y Querétaro (solo datos del SIAP): resumen, ficha y `GET /api/frutales` | Hecho (datos agronómicos sin verificar) |
| [24](24-pruebas-de-parcelas.md) | Pruebas con parcelas dibujadas: `probar-parcelas.js`, reintento en SoilGrids, sin recomendar fuera de Gto/Qro | Hecho |
| [Fuentes](../fuentes-de-datos.md) | Investigación de fuentes de datos (14 verificadas) y las 3 por integrar primero | Hecho |
| [22](22-asistente-mas-datos-nasa.md) | Asistente con más datos de NASA, plantillas con citas por código y set de evaluación | En curso (agente) |
| [25](25-analisis-ia-conectada.md) | Pantalla Análisis IA conectada al asistente real y ficha guardada del agricultor | En curso (agente) |
| [26](26-ml-segunda-ronda.md) | Segunda ronda de aprendizaje automático (clasificar año malo, más variables, incertidumbre, municipios parecidos, hortalizas y frutales) | Hecho; solo falta decidir qué integrar |
| [27](27-maiz-respuestas-especificas.md) | Respuestas específicas del maíz (producción en tu parcela, decisión, ciclo FAO-56, precio, riego, comparar); 32 preguntas reales de agricultor | Hecho |
| [28](28-frutas-aptitud-y-desglose.md) | Frutas y verduras: ¿se da aquí? (FAO EcoCrop + NASA) y desglose por cultivo (SIAP); el ML no mejoró y no se integró | Hecho |
| 29 | Perfil completo en pantalla (lo último que sembró, lo que tiene sembrado, cómo riega) y etiqueta «Calculado con tus datos». Doc en la rama `integracion/todo` | Hecho |
| [30](30-graficas-por-pregunta.md) | Gráficas con datos reales según la pregunta (campo `graficas`), también para frutas | Hecho |
| [31](31-intencion-con-ml.md) | Entender la pregunta con aprendizaje automático: clasificador de respaldo, acierto 74.3 % → 78.4 % en 334 preguntas de prueba | Hecho |
| [32](32-acciones-con-fuente.md) | «Qué hacer»: 20 acciones verificadas con fuente (INIFAP, CONAGUA, SENASICA, Reglas 2026) e investigación de lo que más preguntan | Hecho |
| [33](33-pruebas-conversacion-y-entrenamiento.md) | Pruebas con 2 parcelas delimitadas y perfil lleno: bien contestadas 76 % → 96 %; reentrenamiento | Hecho |
| [34](34-modelo-offline-mejorado.md) | Modelo offline (Gemma) mejorado: útil 44 % → 82 %, 3.4 s → 1.9 s; modo en línea solo diseñado | Hecho |
| 35 | Rediseño del chat: respuesta grande, «Escuchar», «Qué hacer», datos plegables. Doc en la rama `integracion/todo` | Hecho |
| [36](36-preguntas-especificas.md) | 135 preguntas específicas y lenguaje sencillo: prueba 63 % → 80 %; «t/ha» sin explicar 121 → 0 | Hecho |
| [37](37-retroalimentacion.md) | «¿Te sirvió?» 👍/👎, de los votos al entrenamiento (con confirmación humana) y juez automático | Hecho |
| [38](38-tarjetas-y-modelo.md) | 32 tarjetas de conocimiento con fuente; el modelo ya no se niega (17 → 2); prueba 7 % → 50 % | Hecho |
| 39 | Lectura fácil en pantalla: número grande, glosario al tocar, gráficas con pregunta. Doc en la rama `integracion/todo` | Hecho |
| [41](41-motor-de-simulacion.md) | Revisión del motor de simulación: rotación que respeta el cultivo actual, componente de agua, mes de siembra y maqueta 3D por cultivo | Hecho |
| [42](42-simulador-como-parcela.md) | «2. Simulador 3D» con el mapa de satélite de «1. Parcela» y una tarjeta a la vez; sin globo ni dock de voz simulado | Hecho |
| [43](43-tres-rotaciones-e-incertidumbre.md) | El motor compara 3 rotaciones (la de hoy, la recomendada y otra meta) con evidencia, beneficios, huecos y qué revisar; incertidumbre con intervalo y sensibilidad | Hecho |
| [44](44-heladas-y-calor.md) | El motor cuenta los años con helada y con calor (`T2M_MIN` y `T2M_MAX` de NASA POWER) y los suma a la seguridad del puntaje, también con riego | Hecho |
| [45](45-calidad-de-vida.md) | Calidad de vida: mapa y panel del alto de la ventana, Anterior/Siguiente fijos, asistente en el encabezado, y el clima y el plan ya no esperan a SoilGrids | Hecho |

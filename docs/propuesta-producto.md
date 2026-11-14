# Propuesta de producto: de la maqueta al "simulador de tu campo"

Tus ideas, **ordenadas** y con una advertencia honesta: el hackathon se entrega mañana a las 8 pm y somos 6. Lo que sigue está en fases; **solo la Fase A cabe**. Lo demás es el "qué sigue" del pitch.

## Idea central (una frase)
El agricultor **dibuja su parcela, cuenta lo que sabe, ve su rotación y el clima de la semana sobre la maqueta 3D, y un asistente siempre a la mano le explica todo**.

## Flujo lineal propuesto (4 pasos, siempre el mismo orden)
1. **Dibuja tu parcela** en el mapa (la vista 3D ya lo hace y calcula las hectáreas).
2. **Cuéntanos de tu parcela:** preguntas una por una, cada una con **"No sé"**. El asistente usa lo que sepa y completa el resto con satélite.
3. **Tu rotación a 3 años:** tarjetas año por año (hoy: lista de cultivos por temporada), con riesgo y rango de ingresos. Se queda como está; solo se ordena en línea.
4. **Pregúntale al asistente** (siempre disponible, no solo en una pantalla).

## Fase A · Para el hackathon (lo único que cabe)
| # | Qué | Estado | Quién |
|---|---|---|---|
| A1 | **Perfil de parcela** con preguntas y "No sé" | **Backend listo** (`GET /api/perfil/preguntas`, `perfil` en `/api/asistente`). Falta la pantalla. | Front |
| A2 | **Asistente siempre presente** (botón flotante o panel) | Falta en front | Front |
| A3 | **Maqueta 3D con el clima de los próximos 7 días** | **Backend listo**: `/api/pronostico` ahora trae `codigo_clima` por día (WMO). El 3D ya sabe pintar soleado, nublado, lluvia, tormenta y sequía: falta mapear el código y poner un control de día. | 3D |
| A4 | **Dibujar la parcela y pasar hectáreas** al perfil | El dibujo existe (3D); falta mandar `hectareas` | 3D + Front |
| A5 | **Análisis IA más rápido** | Hoy tarda 3-10 s (30 s la primera vez). Ideas: mostrar el texto mientras se genera (streaming de Ollama) y tener el modelo cargado antes de la demo | Yo |
| A6 | Juntar las ramas de 3D y frontend en **una sola estructura** | Pendiente (ver `docs/integracion-prueba.md`) | Equipo |

## Fase B · La semana siguiente: tiempo y proyección
| # | Qué | Qué hace falta |
|---|---|---|
| B1 | **Línea de tiempo por meses** que avanza sobre la maqueta | Calendario de siembra y cosecha por cultivo **verificado** (INIFAP/SIAP; hoy solo tenemos temporadas PV y OI). Clima mensual: ya está (NASA POWER). |
| B2 | **Proyección** de lluvia y humedad | Open-Meteo trae evapotranspiración y humedad del suelo en el pronóstico (revisado en su documentación, hay que probarlo) y un pronóstico estacional de ~46 días. |
| B3 | **Modelo con aprendizaje automático** (rendimiento según clima) | Cruzar SIAP por municipio con NASA POWER (`docs/ml-plan.md`). |
| B4 | **Cuánto tarda cada cultivo** (ciclo en meses) | Dato por cultivo de INIFAP; el esquema de `cultivos.json` ya tiene `ciclo_meses`. |
| B5 | Rotación a 3 años **revisada con un agrónomo** | No sé cómo se maneja en la práctica del Bajío; las reglas actuales (no repetir familia, una leguminosa) son generales. |

## Fase C · Administración de la finca
Módulo para que el agricultor lleve **inventario y costos**: fertilizantes, semillas, **vehículos y maquinaria**, proveedores y precios.
- **Datos que él mismo captura** (no hay una fuente oficial de precios de fertilizantes en México que pueda usar hoy: la búsqueda solo encontró reportes viejos o de otros países). Se guardan localmente.
- Alimenta al asistente: con sus costos reales calcula ganancia y riesgo de perder dinero (ya existe el cálculo, solo falta la captura).
- Alertas simples: "te queda poco de…", "este proveedor subió".

## Fase D · Tienda y catálogo de insumos
Productos locales con **especificaciones** (por ejemplo fertilizantes con su composición) y sugerencias de la IA según el suelo.
**Ojo, hay dos obstáculos:**
1. **Hoy el asistente tiene prohibido recomendar químicos, dosis o marcas** (regla 5 del prompt) por seguridad. Una tienda cambia esa regla: necesita **revisión de un agrónomo** y datos de fichas técnicas reales.
2. **No hay catálogo ni API confirmada**: habría que armarlo con proveedores locales (tú o el equipo) y sus fichas técnicas.

## Fase E · "Simulador de granja" (estilo Farming Simulator)
Tiempo que avanza por meses y años, decisiones (qué sembrar, cuándo), eventos (sequía, helada, plaga) y resultados económicos. **Es la visión del producto**: las fases B (tiempo) y C (costos) son sus cimientos. No se debe empezar sin esas dos.

## Lo que ya quedó hecho hoy (backend del asistente)
- `GET /api/perfil/preguntas` y el campo `perfil` en `/api/asistente` (agua, prioridad, estado, último cultivo, hectáreas, textura, encharcamiento).
- El recomendador **usa** el último cultivo (no repite la familia), las hectáreas (total de la parcela) y el encharcamiento (baja al garbanzo).
- La recomendación trae `afinar`: las preguntas opcionales que faltan, para que el front las muestre como "afina tu resultado".
- El pronóstico trae `codigo_clima` para la vista 3D.

## Para decidir (no puedo yo)
1. ¿Quién del equipo hace el paso 2 del flujo (las preguntas)? El contrato ya está.
2. ¿La estructura final es la del frontend (4 pantallas) con la vista 3D como componente?
3. ¿Se quiere la Fase D (tienda) aunque necesite agrónomo y catálogo? Yo la dejaría fuera de esta entrega.

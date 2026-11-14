# Integración completa (prueba local): diseño + mapa de dibujo + vista 3D + asistente

> Está en una rama **local** `integracion/todo` (no se ha subido a GitHub). Une `feature/frontend-estructura` (pantallas del diseño), `feature/vista-3d` (mapa de dibujo y maqueta 3D) y `feature/llm-asistente` (asistente, recomendador, pronóstico). Sirve para ver cómo quedan juntas y para decidir cómo mezclarlas en `main`.

## Cómo verla
```
# servidor (con asistente, pronóstico, terreno 3D y /api/recomendar provisional)
cd server && npm install && npm run dev            # puerto 3001
# pantalla integrada
cd client && npm install && VITE_USE_MOCK=0 npm run dev   # puerto 5173
```
Pantallas: `/` Parcela, `/rotacion` Simulador 3D, `/analisis`, `/cultivo` Probar cultivo. El asistente es el botón verde flotante, en todas.

## Qué se cableó
| Pedido | Qué hace ahora |
|---|---|
| **Dibujar la parcela** (mapa de tu compañero del 3D) | La pantalla 1 es un mapa grande con buscador de dirección, coordenadas y GPS (ver `docs/cambios/19`); dibujas el contorno, calcula hectáreas, varias parcelas, cada una con su cultivo. Se quitaron los botones de ejemplo y el chat simulado. |
| **La maqueta 3D en el simulador** | La pantalla 2 reemplaza el escenario de CSS por la maqueta 3D real (`Vista3DPanel`), con las parcelas dibujadas y el año de lluvia. Al cambiar el año del plan de rotación, **las parcelas pasan al cultivo de ese año**. |
| **Tocar la parcela en la maqueta → información** | Tocar una parcela abre una tarjeta con: cultivo, hectáreas, lluvia del año elegido, puntaje en la recomendación y la razón principal, y el clima del día elegido. Se detecta con el punto tocado dentro del contorno. |
| **Clima de los próximos 7 días en el 3D** | Una fila de 7 botones (día, ícono, mm). Al elegir un día la maqueta muestra la lluvia de ese día (intensidad según el pronóstico real) y una tarjeta con probabilidad y temperaturas. "Volver al año" regresa a la lluvia histórica. |
| **Chat siempre presente** | Botón flotante en todas las pantallas. Una sola respuesta a la vez (cada pregunta borra la anterior). |
| **Guía de preguntas** | `GET /api/asistente/temas`: 5 temas con preguntas listas (mi parcela, clima de la semana, qué sembrar, mis cultivos, para entender mejor) y una nota de lo que no contesta. |
| **Preguntas antes de recomendar** | Si falta riego/lluvia o la prioridad, el chat las pregunta con botones; después ofrece "afinar" (último cultivo, hectáreas, tierra, encharcamiento) con "No sé". |
| **Botones más grandes y claros** | En el chat, la guía de temas y la maqueta: altura mínima 44-54 px, letra 16-19 px, bordes más gruesos. |
| **Micrófono** | Botón "Hablar": graba, convierte a 16 kHz y manda a `/api/voz`; el texto aparece en la caja antes de enviarse. **Sin probar con micrófono real** (solo la ruta del servidor está probada). |

## Cómo se mezclaron las ramas (para decidir cómo hacerlo en `main`)
- **Base:** estructura de `frontend-estructura` (rutas con 4 pantallas). Del 3D se trajeron `map/`, `three/`, `year.jsx`, `weather.js`, `crops.js`.
- **Estilos:** la hoja del 3D tenía reglas globales (`button`, `table`, `.card`, `body`) que habrían pisado el diseño y Bootstrap. Se generó `styles/vista3d.css` con **todos los selectores dentro de `.v3d`** (script `scope-css`, solo para esta prueba). Lo definitivo sería que quien hizo el 3D prefije sus clases.
- **Dependencias:** se juntaron (Bootstrap, Chart.js, React Router + MapLibre, three, react-three-fiber/drei). `leaflet` y `react-leaflet` quedan sin uso en la pantalla 1 (el mapa Leaflet viejo ya no se usa).
- **Servidor:** `/api/recomendar` responde con el recomendador provisional (prueba; en `main` sigue en 501).

## Lo que NO se pudo verificar
- **No abrí el navegador:** compila (`vite build`), el servidor responde en todas las rutas (incluida cada pantalla) y las llamadas por el proxy del front funcionan, pero **nadie ha visto las pantallas**. Falta revisar a ojo: el mapa de dibujo dentro de la tarjeta del diseño, la maqueta 3D, que el toque en la parcela abra la tarjeta (se probó la lógica, no con el mouse) y los estilos de las dos hojas juntas.
- Las pantallas **Análisis IA** y **Probar cultivo** siguen con sus datos de ejemplo (la primera no está conectada al asistente real; la segunda usa su propio motor del navegador).
- La pantalla 1 tiene un chat simulado propio además del botón flotante: hay dos chats. Conviene quitar el simulado.

## Cultivos de "Probar cultivo" (22) y qué sabe de ellos el asistente
Rangos de lluvia, temperatura y pH **de ejemplo, sin verificar** (así los dejó el diseño). Datos oficiales del SIAP 2018-2024 por estado (rendimiento, pérdidas, precio): **20 de 22**.

| Con datos del SIAP y recomendador (8) | Con datos del SIAP, solo informativos (12) | Sin datos del SIAP en Gto./Qro. (2) |
|---|---|---|
| Sorgo, Frijol, Maíz, Garbanzo, Cebada, Trigo, Brócoli, Jitomate | Avena forrajera, Girasol, Cacahuate, Calabaza, Papa, Cebolla, Chile, Fresa, Alfalfa, Agave, Nopal, Aguacate | Amaranto, Arroz |

El recomendador solo usa los 8 de la primera columna (hortalizas excluidas por defecto). Para los otros 12 el asistente puede decir rendimiento, pérdidas y precio, pero no los recomienda ni conoce sus ciclos.

## Qué sigue (en orden)
1. **Mirarla en el navegador** y anotar lo que se vea mal (mapa en la tarjeta, 3D, botones).
2. Quitar el chat simulado de la pantalla 1 y conectar la pantalla Análisis al asistente (o dejarla como sección de lectura rápida, como pediste).
3. Decidir con el equipo cómo se mezcla en `main`: lo más limpio es que el 3D y el frontend resuelvan juntos `App.jsx`, `main.jsx`, `package.json` y la hoja de estilos.
4. Fases de `docs/propuesta-producto.md` (línea de tiempo por meses, administración, etc.).

# 45 · Calidad de vida: botones que no se mueven y mapa siempre a la vista

## Por qué
Medido en una laptop (1366×768), en «1. Parcela» y «2. Simulador 3D»:
- El botón Siguiente cambiaba de lugar en cada tarjeta: de 451 a 1185 px de alto (2273 px en la del perfil).
- En 3 de 7 tarjetas del Simulador había que bajar la página para alcanzarlo.
- El botón flotante del asistente tapaba al Siguiente en «La lluvia de 25 años».
- El encabezado medía 133 px y, antes de elegir parcela, el mapa empezaba en el pixel 649: casi no se veía.
- Con una parcela dibujada, la lluvia se quedaba en «Cargando…» y el plan tardaba 30 s, porque todo esperaba a SoilGrids.

## Qué cambió
- **Panel de pasos** (`client/src/components/PanelPasos.jsx`), el mismo en las dos pantallas:
  - arriba el lugar, «Paso 3 de 7», el título y la barra de avance;
  - en medio el contenido, que se desliza por dentro si es largo (una sombra avisa que hay más);
  - abajo Anterior y Siguiente, **siempre en el mismo lugar** (56 px de alto). En el primer paso Anterior se oculta
    pero guarda su hueco; en el último, el lugar de Siguiente lo ocupa «Ver mis rotaciones» o «Ir al asistente».
- **Escritorio:** mapa a la izquierda y panel a la derecha, los dos del alto de la ventana. Ya no se baja la página.
- **Etapa 1 de Parcela con el mismo acomodo:** el mapa se ve desde el principio y el panel guía en 3 pasos numerados
  (busca tu pueblo, marca tu parcela, toca «Usar esta parcela»).
- **Herramientas del mapa dentro del panel** (`ParcelMap`, props `herramientasEn` y `onDibujando`): al dibujar,
  primero el aviso y los botones de guardar; después «Detectar con un toque» y el GPS. En la etapa 2 se ven en
  «Tu terreno»; mientras se dibuja, el panel muestra solo eso y los botones de avance quedan apagados.
- **Celular:** mapa fijo arriba, contenido debajo y Anterior/Siguiente en una barra fija al pie. El menú de las 4
  pantallas va en un renglón (el encabezado bajó de 182 a 132 px).
- **Encabezado** en un renglón en pantallas anchas (de 133 a 82 px) y **el asistente arriba a la derecha**; en
  celular es un botón redondo. El chat se abre debajo del encabezado. `Header.jsx` mide su alto (`--fs-head`).
- **Para quien no usa mucho dispositivos:** «Borrar» una parcela y «Cambiar de lugar» preguntan antes; el menú y los
  botones chicos de «Probar cultivo» ya miden 44 px o más; el foco se ve al moverse con el teclado.
- **El clima ya no espera al suelo** (`useParcela`): cada uno se muestra en cuanto llega.
- **SoilGrids lento** (`server/lib/loadRaw.js`, opción `pauseOnTimeoutMs`): si tarda más de 15 s no se reintenta y
  no se le vuelve a preguntar durante 3 minutos. La primera parcela nueva espera 15 s (antes 30 s) y las siguientes
  contestan al instante, sin suelo y diciéndolo.
- Arreglos chicos: «Qro..» con doble punto; con un punto de ejemplo, el mapa vuelve a él después de las capas de la NASA.

## Cómo se probó
- Con un script en el navegador, a 1366×768, 1280×720, 1920×1080 y 375×812, en las dos pantallas y sus 7 pasos:
  una sola posición para Siguiente y otra para Anterior, los dos dentro de la pantalla, sin bajar la página en
  escritorio, sin scroll de lado, sin que el asistente se encime y sin botones de menos de 44 px.
- Flujo a mano: buscar por coordenadas, marcar 4 esquinas, «Usar esta parcela», los 7 pasos, «Corregir» (los botones
  de avance se apagan y no se mueven), «Borrar» y «Cambiar de lugar» (preguntan y, al decir que no, no borran).
- `server/test/loadRaw.test.js`: un servicio que tarda no se reintenta y se deja en paz; sin la opción, todo igual.
- 333 pruebas del servidor y 60 del cliente.

## Pendiente
- Si SoilGrids sigue lento el día de la demo, una parcela recién dibujada sale sin suelo. Las de ejemplo y las ya
  consultadas no dependen de la red.
- El mapa (`ParcelMap`) no se probó con lector de pantalla.

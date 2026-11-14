# 19 · Ubicación primero, mapa grande y arreglos del asistente (prueba de integración)

Todo lo de pantallas vive en la rama **local** `integracion/todo` (ver `docs/integracion-completa.md`). Lo del asistente (servidor) sí está en `feature/llm-asistente`.

## Lo que se vio mal en las capturas y por qué
| Problema | Causa | Arreglo |
|---|---|---|
| El mapa se veía chico y cortado, con letreros viejos encima ("CAPA: NASA GIBS TRUE COLOR + LÍMITES") | El mapa nuevo estaba metido dentro del contenedor del diseño viejo: **440 px de alto con `overflow: hidden`** (le tapaba los controles de dibujar, GPS y año) y con el HUD del mapa anterior encima | Se quitó el contenedor y el HUD viejos. El mapa ahora es una tarjeta **de ancho completo** y alto de hasta 760 px, con un cuadro de datos (lluvia, años secos, pH) debajo |
| La imagen de satélite se veía como mosaico de cuadros nítidos y borrosos | La imagen "Sin nubes" (Esri Clarity) solo tiene cobertura en algunas zonas del Bajío | Por defecto ahora es la imagen **«Más rápida»** (Esri World Imagery, cobertura uniforme). «Sin nubes» sigue disponible en las opciones |
| "El asistente no funciona bien" | (1) El botón flotante mandaba `agua` y `prioridad` en **cada** pregunta, así que el servidor calculaba la recomendación y la metía en la ficha siempre: la ficha crecía, el modelo se confundía y "¿Va a llover esta semana?" caía al texto de respaldo. (2) "¿Para qué sirve la **rotación** de cultivos?" se contestaba como una recomendación de cultivos | La recomendación solo se calcula si piden una recomendación o un seguimiento ("¿por qué sorgo?", "¿y el ingreso?"). Las preguntas para entender van al modelo con la base de textos. Nuevo `server/llm/intencion.js` con pruebas |

## Nuevo flujo del paso 1
1. **¿Dónde está tu parcela?**: un cuadro para escribir pueblo o dirección, **coordenadas** (`20.47, -100.81`) o el botón **«Usar mi ubicación»** (GPS).
   - Las direcciones se buscan con **OpenStreetMap Nominatim** (gratis, sin llave; probado: «Celaya, Guanajuato» devuelve 2 resultados). Si hay varios, se elige uno.
   - Sin internet avisa y ofrece una parcela de ejemplo; también se puede tocar el mapa.
2. El mapa **vuela hasta ese lugar a una distancia en la que ya se puede dibujar** (zoom 16 en lugar de 15).
3. El agricultor **dibuja su parcela** (esquinas, o caminando con el GPS) y el mapa la levanta en 3D, como en la rama del 3D.
4. Los **botones de "parcelas de ejemplo" se quitaron** (y el chat simulado del diseño). Solo queda el enlace "Sin internet: usar Celaya de ejemplo" cuando falla la búsqueda.

## Límites
- **No lo he visto en el navegador.** El servidor compila todos los módulos y el buscador de direcciones funciona desde aquí, pero falta revisar a ojo el tamaño del mapa, que «Usar mi ubicación» pida el permiso y que el mapa vuele al lugar.
- El buscador necesita internet y manda el texto que escribes a OpenStreetMap (está avisado en pantalla). La política de uso de Nominatim pide uso ligero (1 búsqueda por segundo) y mostrar el crédito de OpenStreetMap; el crédito del mapa ya sale en la esquina.
- La imagen de satélite también necesita internet. Sin conexión el mapa queda en blanco.
- El GPS solo funciona en `localhost` o con `https`.
- La respuesta del asistente tarda 3-10 s (la primera ~30 s): sigue pendiente mostrarla mientras se genera.
- "Sin nubes" sigue mostrando mosaico en las zonas que Clarity no cubre.

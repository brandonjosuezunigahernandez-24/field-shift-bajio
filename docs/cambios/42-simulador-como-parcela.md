# 42 · «2. Simulador 3D» con el mismo mapa que «1. Parcela»

## Por qué
La maqueta 3D se dibujaba sobre un globo con la textura Blue Marble (~20 km por pixel) y el bloque de 1 km ocupaba
~320 km de globo: lo que se veía debajo **no era el lugar de la parcela**. Además la pantalla tenía muchas cosas a la vez.

## Qué cambió
- El mapa es el de «1. Parcela» (`ParcelMap`, MapLibre + imagen de satélite de Esri + relieve), en modo **solo ver**
  (`soloVer`): no dibuja, no muestra la lista de parcelas ni las herramientas.
- Igual que en «1. Parcela»: **mapa siempre a la vista y una tarjeta a la vez** (Anterior/Siguiente):
  1. Tu plan de 3 años (al tocar Año 1/2/3 las parcelas cambian al cultivo de ese año en el mapa; mes de siembra).
  2. ¿Le hubiera alcanzado la lluvia? (mueves el año real 2000–2024; cada cultivo crece en el mapa según la lluvia de
     SU ciclo contra SU mínimo, con la prueba año por año del motor; con riego no se seca).
  3. La lluvia de 25 años (gráfica).
  4. Qué tan bien le va a cada cultivo (puntaje y % de años sin lluvia suficiente).
  5. Llévate tu plan (PDF y asistente).
- `ParcelMap` acepta `plantasPorParcela` y `cropLayer.js` dibuja cada parcela con su propio aspecto.
- Se quitaron de esta pantalla: el globo y la maqueta (`Vista3DPanel`; su código sigue en `client/src/three/`), el dock
  de voz simulado y el plan de ejemplo del diseño (si falla el cálculo se dice y hay «Intentar de nuevo»).
- Arreglo: en «solo ver», si la página cambia de tamaño mientras la cámara vuela a la parcela (al cargar una tarjeta),
  se vuelve a encuadrar la parcela (antes se quedaba viendo todo el Bajío).

## Pendiente
- En pantallas angostas (≈500 px, captura sin ventana) la cámara no se acerca a la parcela, ni aquí ni en «1. Parcela»:
  ya pasaba antes; falta probar en un celular real.
- Sin parcela dibujada (solo el punto de ejemplo) no hay cultivos en el mapa: la tarjeta pide dibujarla en «1. Parcela».

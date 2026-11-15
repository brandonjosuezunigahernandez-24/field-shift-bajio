# 41 · Revisión del motor de simulación (Simulador 3D)

Se revisó `server/engine/index.js` (puntajes, riesgo y rotación) y la maqueta 3D (`client/src/three/parcelState.js`),
corriendo el motor en los 6 puntos de prueba, con temporal y riego y las 4 prioridades.

## Errores corregidos

| # | Qué pasaba | Qué hace ahora |
|---|---|---|
| 1 | La rotación no sabía qué tiene sembrado el agricultor: con sorgo en la parcela podía poner sorgo otra vez el año 1. | `cultivo_previo` (lo que tiene ahora o lo último que sembró) cuenta como la temporada anterior: el año 1 no repite su familia y el «por qué» lo dice. Llega desde el perfil, en la pantalla y en el chat. |
| 2 | El componente «gastar menos agua» comparaba contra todos los cultivos, también los de solo riego (garbanzo 250 mm, brócoli 600 mm), aunque la parcela fuera de temporal. El más ahorrador nunca llegaba al máximo. | Solo compara los cultivos que sí se pueden sembrar con esa agua. En Celaya, con prioridad agua: frijol 90 → 96, maíz 52 → 43. |
| 3 | La maqueta 3D hacía crecer igual a todos los cultivos según la lluvia de junio a septiembre contra la mediana. Un año podía verse malo para el frijol aunque sí le alcanzó, y los cultivos de riego se secaban en años secos. | Cada cultivo crece según la lluvia de SU ciclo contra SU mínimo (la misma prueba año por año del motor). Con riego no se seca. Al tocar una parcela dice «le llovieron X mm; necesita Y: sí/no le alcanzó». |
| 4 | Un año con 519.6 mm se mostraba como «520 mm» pero contaba como que no alcanzó el mínimo de 520. | Se compara el mismo número redondeado que ve el agricultor. |

## Mejora de exactitud

- **Mes de siembra**: en temporal cada cultivo se prueba sembrado en junio y en julio (INIFAP Bajío siembra frijol de fines de
  junio a mediados de julio) y se queda con el mes de mejor puntaje completo (lluvia, temperatura y años fallidos).
  La respuesta trae `mes_siembra`. Elegir solo por riesgo no servía: en Celaya el frijol de julio falla menos años
  (2 de 25 contra 3) pero la lluvia de su ciclo le ajusta peor, así que gana junio.

## Límites que encontramos (no se cambiaron)

- **Los mínimos de lluvia de `cultivos.json` no están verificados** y el riesgo es muy sensible a ellos: en El Marqués,
  6 de 25 años quedan a ±25 mm del mínimo del frijol. Mover el mínimo 25 mm cambia el riesgo hasta 24 puntos.
  Es lo que más mejoraría la exactitud: confirmar esos 7 valores.
- **NASA POWER tiene celdas de unos 50 km**: Salamanca e Irapuato reciben exactamente el mismo clima, igual que
  El Marqués y San Juan del Río. Dos parcelas vecinas no se distinguen por lluvia.
- **El riesgo es todo o nada**: 519 mm falla y 520 no. No distingue un año que quedó cerca de uno desastroso.
- **Lluvia total, no cuándo cayó**: una sequía a media temporada (canícula) con buen total no se detecta; los datos son mensuales.
- **Faltan 2025 y 2026**: la serie termina en 2024 (`POWER_END_YEAR`).
- Con riego el riesgo es 0 para todos: no se modela la disponibilidad de agua de riego.

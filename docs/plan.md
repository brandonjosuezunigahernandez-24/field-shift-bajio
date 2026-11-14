# Plan de trabajo: fases y reparto

NASA Space Apps Challenge 2026, Querétaro (14 y 15 de noviembre). Reto *Field Shift*.

**Meta:** tener la herramienta funcionando de punta a punta el sábado en la noche (F3) y entregar el domingo.

Documentos relacionados: [contrato de la API y del motor](api-contract.md) y [README](../README.md) (cómo correrlo).

## Fases

Cada fase termina con algo que funciona.

### F1 — Esqueleto y datos · LISTA

- Server con `GET /api/clima` y `GET /api/suelo`, caché en disco y respaldo con fixture.
- Fixtures reales del punto demo (Celaya, Gto., 20.47, -100.81).
- Client con Vite + React y proxy a la API. Leaflet y Recharts ya instalados.
- Pruebas del parseo y de las rutas (`cd server && npm test`).
- README y contrato de la API.

### F2 — Motor, cultivos, mapa y formulario · sábado tarde

En este orden, porque lo de arriba desbloquea lo de abajo:

1. `server/data/cultivos.json` con los 7 cultivos (valores aproximados, `"verificado": false`) y `docs/cultivos-fuentes.md` con la lista de lo que falta confirmar contra FAO Ecocrop. **Va primero: el motor lo necesita.**
2. `client/src/mocks/recomendar.json` con la forma del contrato. **Desbloquea al front.**
3. Motor: `fit.js` (temperatura, lluvia, suelo), `risk.js` (años bajo el mínimo del cultivo) y `weights.js` (prioridades), con pruebas.
4. Motor: `rotation.js` (3 años; no repetir familia, al menos una leguminosa, OI solo con riego), `reasons.js` e `index.js`, con pruebas.
5. `POST /api/recomendar`.
6. `MapPicker` (clic en el mapa y botones de ejemplo) y `FarmForm` (temporal o riego, y la prioridad).
7. `Results` contra el mock: tarjetas de la rotación y tabla de cultivos.

### F3 — Punta a punta con una parcela real · sábado noche

1. Conectar el front al `POST /api/recomendar` real.
2. Probar 3 o 4 puntos reales del Bajío (Celaya, Irapuato, San Juan del Río, Dolores Hidalgo) y revisar que el resultado tenga sentido agronómico.
3. Dejar esos puntos en caché. Corregir lo que salga. Todo mergeado a `main` por pull request.

### F4 — Explicaciones, gráfica y robustez · domingo mañana

1. `razones[]` con números reales en todas las recomendaciones.
2. Gráfica de lluvia anual con los años secos marcados y la línea del umbral.
3. Errores y estados de carga: API lenta, punto fuera de la región, SoilGrids sin datos.
4. Que se vea bien en celular.
5. Solo si sobra tiempo: capa de NASA GIBS en el mapa y NDVI de MODIS.

### F5 — Entrega · domingo mediodía

1. README en inglés con capturas, créditos completos y cómo correrlo.
2. Página del proyecto en Space Apps (en inglés) y video o demo.
3. Ensayo de la demo sin internet (`OFFLINE=1`).

## Reparto entre 6 personas

**Cada archivo tiene un solo dueño.** Si necesitas un cambio en un archivo que no es tuyo, pídeselo a su dueño.

| # | Rol | Archivos que le pertenecen | Primera tarea en F2 |
|---|-----|----------------------------|---------------------|
| P1 | Datos y servidor | `server/sources/`, `server/lib/`, `server/routes/clima.js`, `server/routes/suelo.js`, `server/fixtures/`, `server/scripts/`, `server/test/`, `server/app.js`, `server/package.json` | Dejar en caché los puntos de prueba del Bajío y apoyar la integración del motor con los datos |
| P2 | Motor: ajuste y riesgo | `server/engine/fit.js`, `risk.js`, `weights.js` y sus pruebas | Confirmar las firmas del contrato y escribir `fit.js` |
| P3 | Motor: rotación, razones y endpoint | `server/engine/rotation.js`, `reasons.js`, `index.js`, `server/routes/recomendar.js` y sus pruebas | `rotation.js` con listas de cultivos de prueba |
| P4 | Front: mapa, formulario e integración | `client/src/App.jsx`, `api.js`, `examplePoints.js`, `components/MapPicker.jsx`, `FarmForm.jsx`, `StatusMessage.jsx`, `client/package.json`, `vite.config.js` | `MapPicker` con Leaflet |
| P5 | Front: resultados | `client/src/components/Results.jsx`, `components/results/*`, `styles.css`, `mocks/recomendar.json` | El mock y las tarjetas de la rotación |
| P6 | Cultivos, documentación y entrega | `server/data/cultivos.json`, `docs/*`, `README.md`, página de Space Apps, video | `cultivos.json` |

Componentes del front que faltan por crear (todos dentro de `client/src/components/`):

```
MapPicker.jsx · FarmForm.jsx · StatusMessage.jsx        (P4)
Results.jsx                                             (P5, compone todo lo de resultados)
results/RotationCards.jsx · RainChart.jsx · CropTable.jsx · SoilSummary.jsx · Footer.jsx   (P5)
```

Nota: el `App.jsx` de la F1 trae dos tarjetas de prueba (clima y suelo) dentro del mismo archivo. P4 las quita cuando P5 tenga listo `Results.jsx`.

## Reglas para no pisarnos

- **Una rama por persona y tarea** (`f2-motor-ajuste`, `f2-mapa`, …) y pull request a `main`. Revisa otra persona. Pull requests chicos y frecuentes.
- **Nadie hace push ni merge directo a `main`.**
- **Commits pequeños** y con mensajes claros.
- **`App.jsx` solo lo edita P4.** P5 recibe todo por props dentro de `Results.jsx`.
- **`server/app.js` ya tiene montadas las 3 rutas.** No hace falta tocarlo.
- **`package.json`:** si necesitas una librería, pídesela al dueño (P1 en server, P4 en client). Así no chocan los `package-lock.json`.
- **El contrato manda.** Para cambiar una forma de JSON o la firma de una función del motor: avisa al grupo, P6 lo cambia en [api-contract.md](api-contract.md) y después se toca el código.
- **P2 y P3 no se bloquean:** el contrato fija las firmas y P3 prueba la rotación con listas de cultivos de prueba en sus tests.
- **P4 y P5 no esperan al back:** trabajan contra `mocks/recomendar.json`.
- **No inventar valores de cultivos como definitivos:** se quedan con `"verificado": false` hasta confirmarlos.
- **Citar cada fuente de datos** en la sección Credits del README.

## Decisiones ya tomadas

- JavaScript, no TypeScript. El server usa lo que trae Node (fetch, `node --test`, `node --watch`) y solo depende de Express.
- **Punto demo: 20.47, -100.81** (zona de cultivo al sur de Celaya). El centro de la ciudad (20.52, -100.81) no sirve: SoilGrids lo enmascara como zona urbana y no devuelve suelo.
- El fixture solo responde por el punto demo. Si falla el internet en otro punto, se muestra un error claro en vez de datos de otro lugar.
- Caché y fixture guardan la respuesta cruda de la API, con el mismo nombre de archivo: `<fuente>_<lat>_<lon>.json`.
- "Año seco" en `/api/clima`: lluvia de junio a septiembre por debajo del 80 % de la mediana de esa parcela. El riesgo por cultivo del motor usa el mínimo de cada cultivo.
- En POWER mensual, `t_max_c` y `t_min_c` son la hora más caliente y la más fría del mes, no promedios diarios. Para el ajuste de temperatura se usa `t_media_c`.

## Puntos abiertos

Están al final de [api-contract.md](api-contract.md):

1. Contra qué meses se compara la lluvia mínima de cada cultivo (PV es junio a septiembre, pero varios ciclos son más largos).
2. De dónde sale el dato para la prioridad `ganar` (el esquema de cultivos no tiene rendimiento ni precio).
3. Qué hace el motor cuando SoilGrids no tiene datos del punto.

# Prueba de integración de las ramas (14 nov 2026)

Se juntaron **en una copia aparte, sin tocar ninguna rama del equipo**, el asistente (`feature/llm-asistente`), la vista 3D (`feature/vista-3d`) y el frontend con el diseño (`feature/frontend-estructura`) para ver cómo funcionan juntos. Nada de esto se subió a las ramas de los demás.

## Qué pasó

| Prueba | Resultado |
|---|---|
| Asistente + 3D (merge) | Conflictos solo de líneas en `server/app.js` y `CLAUDE.md` (los dos agregaron rutas / stack). Resueltos conservando ambos. **71 pruebas del servidor pasan** (incluye `/api/terreno`). El cliente 3D compila. |
| Asistente + frontend (merge) | **Conflictos reales** en `client/src/App.jsx`, `client/package.json`, `client/package-lock.json`, `README.md` y `client/src/styles.css` (la borró el frontend y la modificó el 3D). No se pudo juntar sin decidir qué pantalla manda. |
| Frontend solo | Compila (`vite build`). Sirve las 4 pantallas. Con `VITE_USE_MOCK=0` pide `/api/recomendar`, que en `main` responde 501. |
| Todas las rutas del servidor integrado | `/api/clima`, `/api/suelo`, `/api/pronostico`, `/api/terreno` y `/api/asistente` responden 200 (suelo tardó ~6 s la primera vez). |
| Forma de `recomendacion` vs mock del frontend | **Compatible**: el mock trae `cultivos[{id,nombre,puntaje,riesgo,razones}]` y `rotacion[{anio,temporada,cultivo,porque}]`; mi recomendador devuelve exactamente esos campos (más `prediccion` y `notas`). |
| `/api/recomendar` con el recomendador provisional (prueba local) | Con 20 líneas en `routes/recomendar.js` el frontend recibe cultivos, rotación, clima y suelo reales, sin mock. **Esa línea no está en ninguna rama compartida**; es una propuesta (ver abajo). |

## Lo que debe corregir cada quien

### Frontend (`feature/frontend-estructura`)
1. **El mapa marca un solo punto con Leaflet; el equipo decidió dibujar el contorno de la parcela** (`docs/api-contract.md`, "Selección de la parcela"). No hay polígono en su código (se buscó "Polygon" y "contorno": cero resultados).
2. **Leaflet vs MapLibre:** `CLAUDE.md` en `main` (rama 3D) dice que el mapa pasó a MapLibre; el frontend sigue con `react-leaflet`.
3. **La pantalla "Análisis IA" usa datos de ejemplo** ("hasta que exista `POST /api/asistente`"). Ya existe: hay que conectarla (respuesta, fuentes, botones `preguntar`, historial de 2 vueltas, micrófono a `/api/voz`). Detalle en `docs/api-contract.md`.
4. **Motor duplicado en el navegador:** `client/src/lib/cropEngine.js` con 22 cultivos "ilustrativos, no verificados". Puede contradecir al servidor. Debe avisar en pantalla que son datos de ejemplo o usar la respuesta del servidor.
5. **Sin pruebas** en el cliente y paquete de ~700 kB sin carga diferida (ellos mismos lo anotan).
6. `useParcela.js` ya espera `data.clima` y `data.suelo` dentro de la respuesta de `/api/recomendar`: el servidor debe devolverlos (en la prueba local sí).

### Vista 3D (`feature/vista-3d`)
1. **Choca con el frontend en `App.jsx` y `main.jsx`:** las dos ramas reescribieron la página principal. Hay que acordar **una sola estructura**: lo más simple es que la vista 3D se exporte como componente (`<Vista3D …/>`) y el frontend lo ponga en su pantalla de Rotación (el frontend ya dejó `client/src/three/README.md` para eso).
2. Quitó `styles.css` en un lado y la modificó en el otro; las hojas de estilo del diseño y las del mapa 3D se tienen que juntar.
3. Cambió helpers compartidos del servidor (`coords.js`, `fetchJson.js`, `loadRaw.js`): son **compatibles hacia atrás** (probado, las pruebas pasan).
4. El clima del mapa usa su propio `weather.js`; podría leer `/api/pronostico` (7 días) y `/api/clima` en vez de duplicar.

### Motor de recomendaciones (equipo)
- `/api/recomendar` sigue en 501. Mientras tanto el recomendador provisional da la misma forma. **Decisión del equipo:** (a) dejar ese endpoint delegando al provisional hasta que exista el motor, (b) comparar ambos, o (c) dejarlo en 501 y que el front use el mock. El provisional **no usa clima ni suelo de la parcela** y es ingreso bruto; no debe presentarse como el motor definitivo.

## Qué falta del modelo (asistente) para que sea efectivo
Ordenado por impacto. Cada punto está en `docs/limitaciones-chat.md`.

1. **Pruebas con voz real** y en **otra laptop** (solo CPU). Hasta ahora todo fue con audio sintético y en una máquina con GPU.
2. **Set de 15 preguntas con trampas** y reportar el número (nunca se corrió completo).
3. **Citas y respuestas por código** para años secos, pronóstico y precios (hoy las redacta el modelo y a veces cita mal).
4. **Verificador por campo** (hoy solo revisa que el número exista, no que sea el correcto).
5. **Integrar el motor del equipo** cuando exista y comparar con el provisional.
6. **Clima y suelo de la parcela dentro del recomendador** (hoy solo usa SIAP por estado) y un modelo con aprendizaje automático (`docs/ml-plan.md`).
7. **Estado de la parcela:** el recomendador supone Guanajuato o Querétaro por la longitud; el front debe mandarlo.
8. **Más tarjetas y textos verificados**; leer completos los documentos de respaldo.
9. Micrófono, chat y acciones de mapa en el frontend.

## Cómo reproducir la prueba
```
git worktree add -b integracion/prueba <carpeta> feature/llm-asistente
cd <carpeta> && git merge origin/feature/vista-3d      # resolver app.js y CLAUDE.md conservando ambos
cd server && npm install && npm test                   # 71 pruebas
```
El frontend se probó en otra copia (`git worktree add --detach <carpeta2> origin/feature/frontend-estructura`) con `VITE_USE_MOCK=0`.

# Changelog del frontend

Rama: `feature/frontend-estructura` · Carpeta: `client/` · Fecha: 14 de noviembre de 2026

Este documento explica **qué cambió en el frontend, por qué, cómo está organizado y qué falta**. Está pensado para quien revise el pull request y para quien continúe el trabajo (3D, asistente IA, motor).

## Resumen

El frontend pasó de una pantalla de prueba de la fase 1 a una **app de 4 pantallas** basada en el diseño estático que aportó el equipo (`fieldshift-bajio.zip`), portada a React y conectada a la API real donde ya hay datos.

| Antes | Ahora |
|-------|-------|
| 1 pantalla: botón de Celaya, tablas de clima y suelo | 4 pantallas con ruta propia, diseño completo |
| Sin mapa | Mapa Leaflet real con capas NASA GIBS |
| Sin gráficas | Gráfica de lluvia anual y radar de factores (Chart.js) |
| Sin estado compartido | Contexto con la parcela, el manejo y las respuestas del servidor |
| 3D inexistente | Maqueta 3D en CSS y un contrato listo para three.js |

## Línea de tiempo de commits

1. `a2fa8a3` Reorganización de `client/src/` en carpetas (`api`, `config`, `components`) sin cambiar comportamiento. Se agrega el mock de `/api/recomendar`.
2. `acbafce` Mock con bandera `VITE_USE_MOCK` y el hook `useParcela`.
3. `da790d9` Primer mapa Leaflet (versión previa al diseño).
4. `737cb45` Primer formulario, estados de carga y créditos (versión previa).
5. `a06a5c8` Primera pantalla de resultado con Recharts (versión previa).
6. `34e1c08` README con la estructura inicial.
7. `2a99761` **Base del diseño**: CSS, datos demo, motor de cultivo y estado compartido.
8. `ee5a390` **Las 4 pantallas** del diseño en React conectadas a la API.
9. `602a49a` README con la estructura final y créditos.

Los commits 3 a 5 construyeron una primera interfaz propia que el diseño del equipo después **sustituyó**; sus componentes se eliminaron en el commit 8 y siguen en el historial de git.

## Las 4 pantallas

### 1. Parcela (`/`) · [Parcela.jsx](../client/src/pages/Parcela.jsx)
- Banner con el dato de INEGI (63.9 % de temporal en Guanajuato).
- **Mapa Leaflet real** dentro del cuadro del diseño. Clic en el mapa o botón de ejemplo marca la parcela.
- Selector de capa: Satélite, MODIS NDVI y Humedad SMAP (NASA GIBS, solo visual).
- Tres parcelas de ejemplo: Celaya (temporal), El Marqués (sequía) y Salamanca (riego).
- La barra inferior del mapa muestra datos **reales**: lluvia de junio a septiembre, años secos y pH.
- Perfil del agricultor: temporal o riego, y prioridad (arriesgar menos, cuidar el suelo, gastar menos agua, ganar más).
- Chat del asistente: bloqueado hasta elegir parcela. **Simulado**: el micrófono escribe una frase de ejemplo.

### 2. Simulador 3D (`/rotacion`) · [Rotacion.jsx](../client/src/pages/Rotacion.jsx)
- Maqueta en CSS puro: 3 capas de suelo y 16 plantas; cambia con el año elegido.
- Plan de 3 años desde `POST /api/recomendar`. Si el servidor responde 501, muestra el plan de ejemplo con un aviso.
- Texto "¿Por qué esta rotación funciona?" con los años secos reales del punto.
- KPIs reales: lluvia, años secos, temperatura media y pH.
- Gráfica de lluvia por año con los años secos rayados y el umbral punteado.
- Ranking de cultivos y dock de voz (simulado).
- "Exportar ficha PDF" usa la impresión del navegador.

### 3. Análisis IA (`/analisis`) · [Analisis.jsx](../client/src/pages/Analisis.jsx)
- Respuesta del asistente con pasos, calendario de siembra, razones con fuente, riesgos y confianza.
- **Todo viene de datos de ejemplo** (`datosDemo.js`) hasta que exista `/api/asistente`.
- Funciona: ocultar proceso, copiar respuesta, leer en voz alta, "me fue útil", imprimir.

### 4. Probar cultivo (`/cultivo`) · [Cultivo.jsx](../client/src/pages/Cultivo.jsx)
- Búsqueda tolerante a acentos y errores de dedo entre 22 cultivos.
- Motor de reglas en el navegador con 6 factores: agua, temperatura, pH, textura, años secos y ciclo.
- Usa el clima y el suelo **reales** del punto elegido.
- Veredicto (sí, con cuidados, no), radar, desglose por factor, qué hacer y alternativas.
- Adjuntar ficha `.json`, `.csv`, `.txt` o foto; descargar plantilla; historial de pruebas.
- `?c=aguacate` en la URL abre el análisis directo.

## Cómo se conecta con el backend

| Dato en pantalla | Ruta del servidor | Estado |
|------------------|-------------------|--------|
| Lluvia, años secos, temperatura | `GET /api/clima` | Real |
| pH, arcilla, carbono | `GET /api/suelo` | Real |
| Plan de rotación y ranking | `POST /api/recomendar` | 501 hoy; mock con `VITE_USE_MOCK=1` |
| Respuesta del asistente | `/api/asistente` | **No existe**; datos de ejemplo |
| NDVI y humedad numéricos | MODIS (opcional) | No existe; solo capas visuales GIBS |

Todo pasa por [client.js](../client/src/api/client.js). Los errores del servidor llegan siempre en español. El proxy de Vite (`/api` hacia el puerto 3001) no se modificó.

## Arquitectura de `client/src/`

```
main.jsx, App.jsx     Rutas y proveedor de estado
pages/                Las 4 pantallas
components/
  layout/Header       Cabecera con los 4 pasos
  mapa/               MapaParcela (Leaflet) y ClickHandler
  charts/             RainChart y RadarChart (Chart.js)
hooks/useParcela      Estado: parcela, agua, prioridad, clima, suelo, recomendación
context/              ParcelaContext: comparte el hook entre pantallas
lib/
  cropEngine.js       Motor de "Probar cultivo" (funciones puras)
  parcelaClima.js     Convierte las respuestas de la API en números de pantalla
  fs.js               localStorage, aviso en pantalla, copiar
api/                  client.js y mock.js
data/datosDemo.js     Datos ilustrativos del diseño
config/               Parcelas de ejemplo y capas del mapa
styles/fieldshift.css Estilos del diseño
mocks/                Respuesta de prueba de /api/recomendar
three/README.md       Contrato para la maqueta 3D real
```

## Decisiones técnicas

- **Portar a React conservando HTML y clases.** Así el CSS del diseño se copió íntegro y no hubo que rediseñar.
- **react-router-dom** para las 4 rutas, que coinciden con las páginas del zip.
- **Estado en un solo hook** compartido por contexto. La selección se guarda en `localStorage` con la misma clave del diseño (`fs.parcela`).
- **Celaya en 20.47, -100.81**, no 20.52. El centro urbano no tiene suelo en SoilGrids.
- **Donde falta dato real se usa el de ejemplo y se avisa** en pantalla, para que la demo nunca se rompa.
- **Colores de la gráfica de lluvia** validados para daltonismo en la primera versión; el diseño final usa verde y trama rayada, y además lista los años secos en texto.

## Dependencias

Nuevas en `client/package.json`:

| Paquete | Para qué |
|---------|----------|
| `bootstrap` 5.3.3 | Rejilla y utilidades que usa el diseño |
| `bootstrap-icons` 1.11.3 | Íconos |
| `chart.js` 4.4.1 | Gráfica de lluvia y radar |
| `react-router-dom` | Rutas de las 4 pantallas |

`recharts` quedó instalado pero sin uso. Se puede quitar cuando el equipo lo confirme.

## Archivos eliminados

Componentes de la primera interfaz, sustituidos por el diseño: `FormularioParcela`, `Resultado`, `RotacionCards`, `GraficaLluvia`, `TablaCultivos`, `ClimaCard`, `SueloCard`, `Estado`, `Creditos`, `Parcela3D`, `labels.js` y `styles.css`.

## Cómo probarlo

```bash
cd server && npm run dev      # puerto 3001
cd client && npm install && npm run dev   # puerto 5173
```

Para ver el plan de rotación sin el motor: copiar `client/.env.example` a `client/.env` y poner `VITE_USE_MOCK=1`.

Pruebas manuales sugeridas:
1. Clic en el mapa cerca de Celaya y ver la barra de datos reales.
2. Probar las tres parcelas de ejemplo y las tres capas del mapa.
3. Ir al simulador y cambiar de año en las tarjetas.
4. Probar "garbanzo", "fresa" y "frijl" (con error de dedo) en Probar cultivo.
5. Con el servidor en `OFFLINE=1`, repetir con Celaya.

## Lo que NO se pudo verificar

- No se abrió en navegador durante el desarrollo. Compila y renderiza sin errores en servidor, y Vite sirve todas las rutas, pero falta revisar visualmente el mapa, la maqueta 3D y las gráficas.
- Las capas NASA GIBS dependen de internet; si fallan, el mapa base de OpenStreetMap sigue visible.
- El bundle pesa unos 700 kB; falta dividirlo con carga diferida.

## Pendientes y riesgos

- **Asistente IA:** pantalla 3 y chat esperan `/api/asistente`.
- **Motor de reglas:** cuando `/api/recomendar` responda, quitar la bandera de mock. Las formas del contrato no cambiaron.
- **Cultivos sin verificar:** los rangos de los 22 cultivos vienen del diseño como ilustrativos. Deben confirmarse contra FAO Ecocrop.
- **Dos listas de cultivos:** el frontend usa 22 y `cultivos.json` del servidor usa 7. Conviene unificarlas.
- **Ventana de temporal:** 125 días fijos; falta calcularla con datos.
- **3D real:** seguir el contrato de [three/README.md](../client/src/three/README.md).
- **Accesibilidad:** falta probar con lector de pantalla y teclado en el mapa.

## Créditos agregados

Bootstrap, Bootstrap Icons, Chart.js, react-router, Leaflet, NASA GIBS (capas visuales), OpenStreetMap y las tipografías Plus Jakarta Sans y JetBrains Mono. Están citados en la sección Credits del README.

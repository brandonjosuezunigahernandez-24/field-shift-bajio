# 29. Perfil completo y gráficas en la respuesta

## Qué cambió

1. **Perfil completo en Parcela y en Análisis.** El nuevo componente `client/src/components/PerfilForm.jsx` arma las preguntas
   con `GET /api/perfil/preguntas`. Ya no están escritas a mano. Las dos pantallas usan el mismo componente:
   - Parcela, tarjeta «Cuéntame de tu parcela» (antes «Configura tu manejo y prioridad»).
   - Análisis IA, tarjeta «Lo que me has dicho» (antes solo mostraba lo que ya se había contestado).
   - Hay dos grupos: **Lo básico** (agua, prioridad y estado) y **Cuéntame más** (lo demás, en el orden en que llega del servidor).
   - `solo_si` se respeta: «¿Cómo riegas?» y «¿Cada cuántos días riegas?» solo aparecen si la parcela tiene riego.
   - Las preguntas numéricas (`tipo: "numero"`) usan una caja de número con `min` y `max`, más un botón «No sé».
   - «No sé» borra el dato. Si un dato no está, el botón «No sé» se ve marcado.
   - Todo se guarda con `setPerfilCampo` en el estado compartido. Como antes, queda guardado en localStorage y llega en
     `perfil` a `POST /api/asistente`.
   - **Hectáreas:** se llenan solas con la suma de las parcelas dibujadas, cada vez que esa suma cambia. Si el agricultor
     corrige el número, cambiar de pantalla no se lo borra.
   - Los botones miden 52 px de alto o más.
2. **Etiqueta de origen** (Análisis y botón flotante):
   - `plantilla` con `tema` → «Calculado con tus datos»
   - `plantilla` sin `tema` → «Respuesta de respaldo»
   - `modelo` → «Calculado con el modelo de riesgo (SIAP + NASA)»
   - `motor` → «Calculado con datos del SIAP»
3. **Gráficas de la respuesta.** `client/src/components/Graficas.jsx` dibuja `r.graficas` dentro de la tarjeta de respuesta,
   bajo «Respuesta corta», con el título «Los datos detrás de esta respuesta».
   - Las barras y las líneas usan chart.js, que ya estaba instalado. Las tablas usan el estilo `an-tabla`.
   - Cada gráfica muestra su título, su unidad, su nota y su fuente.
   - Un `null` en `valores` significa que no hay dato. Se dibuja como hueco (sin barra, o con la línea cortada), nunca
     como 0. La página de prueba trae un `null` en cada gráfica para que se vea.
   - Se muestran 3 como máximo. Las que no siguen el esquema se ignoran. Si no viene `graficas`, no se muestra nada.
   - **Página de prueba:** `http://localhost:5173/prueba-graficas`. Usa datos **de ejemplo** inventados, marcados en rojo
     «ejemplo, no son datos reales» y con la fuente «EJEMPLO». La pantalla real nunca los usa.

## Esquema que espera el cliente

```
graficas: [
  { tipo: "barras" | "linea", titulo, unidad, etiquetas: [..], series: [{ nombre, valores: [..] }], nota?, fuente },
  { tipo: "tabla", titulo, columnas: [..], filas: [[..]], nota?, fuente }
]
```

## Verificado

- `npx vite build` pasa.
- Capturas con Edge sin cabeza:
  - el perfil en Parcela con riego, que muestra las dos preguntas de riego;
  - el perfil en Análisis;
  - `?pregunta=¿Cuánto maíz voy a cosechar en mis 3 hectáreas?`, con la etiqueta «Calculado con tus datos»;
  - la página de prueba de las gráficas.
- Contra la API real, sin pasar por el navegador: un perfil con `ultimo_cultivo: "frijol"` y `cultivo_actual: "maiz"`
  cambia la rotación. La respuesta dice «Tomé en cuenta que lo último que sembraste fue frijol», y el servidor ya no vuelve
  a preguntar esos dos datos en `afinar`.

## No verificado

- Gráficas con datos reales: hoy el servidor todavía no manda `graficas`.
- Cómo se ve en un celular de verdad. Solo se probó a 1400 px de ancho.

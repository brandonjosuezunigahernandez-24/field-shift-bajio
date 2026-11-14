# `client/src/three/`: la maqueta 3D, aislada

Esta carpeta es la única que toca quien hace el 3D. El resto de la app solo conoce el componente
`Parcela3D` y sus props; mientras no haya escena, muestra una vista previa en 2D.

## Contrato de props (no cambiar sin avisar)

```js
<Parcela3D
  rotacion={[{ anio: 1, temporada: 'PV', cultivo: 'sorgo', porque: '...' }]}   // 3 pasos (6 con riego)
  cultivos={[{ id: 'sorgo', nombre: 'Sorgo grano', puntaje: 82, riesgo: 0.12, razones: [] }]}
  lluviaAnual={[{ anio: 2000, lluvia_mm: 361, seco: true }]}                   // 25 años, para el control deslizante
/>
```

Los tres vienen tal cual de `POST /api/recomendar` (`rotacion`, `cultivos`, `clima.lluvia_pv_anual`).
Ver `docs/api-contract.md`.

`riskBand(riesgo)` (exportada aquí) regresa `bajo` (< 0.2), `medio` (< 0.4) o `alto`. Úsala para el color
del suelo de cada franja; el texto de la etiqueta siempre acompaña al color.

## Reglas

- Dependencias 3D (`three`, `@react-three/fiber`, `@react-three/drei`) se instalan solo cuando la escena
  ya funcione en esta carpeta. Avisar al equipo antes del `npm install`, porque cambia `package.json`.
- Modelos en `.glb`, menos de 5 MB en total, en `client/public/models/`. Cada uno con autor, link y licencia en el README del proyecto (sección Credits).
- Si el 3D va lento, dejar un botón "Ver en 2D" que regrese a esta vista previa.
- Cargar la escena con `React.lazy` desde `Parcela3D.jsx` para que el bundle principal no cargue three.js.

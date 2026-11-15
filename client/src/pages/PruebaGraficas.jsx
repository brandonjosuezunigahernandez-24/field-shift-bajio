import RespuestaCard from '../components/Respuesta.jsx';

// Página de prueba (/prueba-graficas): SOLO datos de ejemplo inventados para ver el diseño. La pantalla real nunca los usa.
const EJEMPLO = [
  { tipo: 'barras', titulo: 'Lluvia por año', unidad: 'mm', etiquetas: ['2020', '2021', '2022', '2023'], series: [{ nombre: 'Lluvia (ejemplo)', valores: [520, null, 610, 380] }], nota: 'Ejemplo.', fuente: 'EJEMPLO' },
  { tipo: 'linea', titulo: 'Precio por tonelada', unidad: 'pesos', etiquetas: ['2019', '2020', '2021', '2022'], series: [{ nombre: 'Maíz (ejemplo)', valores: [4800, null, 6200, 6900] }, { nombre: 'Frijol (ejemplo)', valores: [14000, 15200, 16100, 15800] }], fuente: 'EJEMPLO' },
  { tipo: 'tabla', titulo: 'Comparación', columnas: ['Cultivo', 'Rendimiento (t/ha)', 'Pérdida (%)'], filas: [['Maíz (ejemplo)', 3.1, 12], ['Frijol (ejemplo)', 0.9, 20]], nota: 'Ejemplo.', fuente: 'EJEMPLO' },
];
const R = {
  respuesta: 'EJEMPLO: este texto es inventado para ver el diseño. Aquí va la respuesta corta en una o dos frases. Aquí iría el detalle, en letra normal.',
  origen: 'plantilla', tema: 'ejemplo', fuentes: ['EJEMPLO'], graficas: EJEMPLO,
  que_hacer: [
    { accion: 'Ejemplo: siembra cuando ya hayan caído las primeras lluvias fuertes', porque: 'Ejemplo de «por qué», con un número real cuando venga del servidor.', fuente: 'EJEMPLO', url: 'https://power.larc.nasa.gov/' },
    { accion: 'Ejemplo: pon frijol el año que sigue', porque: 'Ejemplo: las leguminosas ayudan al suelo.', fuente: 'EJEMPLO' },
    { accion: 'Ejemplo: guarda semilla para resembrar', fuente: 'EJEMPLO' },
  ],
  sugerencias: ['Pregunta de ejemplo 1', 'Pregunta de ejemplo 2', 'Pregunta de ejemplo 3'],
  proceso: [{ titulo: 'Paso de ejemplo', detalle: 'Ejemplo.' }],
};
export default function PruebaGraficas() {
  return (
    <main className="fs-container">
      <h1 className="fs-h1">Prueba de la respuesta (datos de ejemplo)</h1>
      <RespuestaCard r={R} pregunta="Pregunta de ejemplo" preguntar={() => {}} ejemplo />
    </main>
  );
}

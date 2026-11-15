import Graficas from '../components/Graficas.jsx';

// Página de prueba (/prueba-graficas): SOLO datos de ejemplo inventados para ver el diseño. La pantalla real nunca los usa.
const EJEMPLO = [
  { tipo: 'barras', titulo: 'Lluvia por año', unidad: 'mm', etiquetas: ['2020', '2021', '2022', '2023'], series: [{ nombre: 'Lluvia (ejemplo)', valores: [520, null, 610, 380] }], nota: 'Ejemplo.', fuente: 'EJEMPLO' },
  { tipo: 'linea', titulo: 'Precio por tonelada', unidad: 'pesos', etiquetas: ['2019', '2020', '2021', '2022'], series: [{ nombre: 'Maíz (ejemplo)', valores: [4800, null, 6200, 6900] }, { nombre: 'Frijol (ejemplo)', valores: [14000, 15200, 16100, 15800] }], fuente: 'EJEMPLO' },
  { tipo: 'tabla', titulo: 'Comparación', columnas: ['Cultivo', 'Rendimiento (t/ha)', 'Pérdida (%)'], filas: [['Maíz (ejemplo)', 3.1, 12], ['Frijol (ejemplo)', 0.9, 20]], nota: 'Ejemplo.', fuente: 'EJEMPLO' },
];
export default function PruebaGraficas() {
  return (
    <main className="fs-container">
      <h1 className="fs-h1">Prueba de gráficas (datos de ejemplo)</h1>
      <article className="fs-answer"><Graficas graficas={EJEMPLO} ejemplo /></article>
    </main>
  );
}

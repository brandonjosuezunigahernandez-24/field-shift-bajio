import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { reducedMotion } from '../lib/fs.js';

const COLORES = ['#23854A', '#E0A020', '#2E6FB5', '#B5532E'];

function Lienzo({ g }) {
  const ref = useRef(null);
  useEffect(() => {
    const movil = window.matchMedia('(max-width: 575.98px)').matches;
    const chart = new Chart(ref.current, {
      type: g.tipo === 'linea' ? 'line' : 'bar',
      data: {
        labels: g.etiquetas,
        datasets: g.series.map((s, i) => ({ label: s.nombre, data: s.valores, backgroundColor: COLORES[i % 4], borderColor: COLORES[i % 4], borderWidth: g.tipo === 'linea' ? 2 : 0, pointRadius: 3, tension: 0.2, spanGaps: false })), // null = sin dato: hueco, nunca 0
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reducedMotion() ? false : undefined,
        plugins: { legend: { display: g.series.length > 1, labels: { font: { size: 13 } } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.formattedValue} ${g.unidad ?? ''}` } } },
        scales: {
          y: { title: { display: !!g.unidad, text: g.unidad, font: { size: 13 } }, ticks: { font: { size: 12 } } },
          x: { ticks: { font: { size: movil ? 10 : 12 }, autoSkip: true, maxRotation: 0 } },
        },
      },
    });
    return () => chart.destroy();
  }, [g]);
  const resumen = `${g.titulo}. ${g.etiquetas.map((e, i) => `${e}: ${g.series.map((s) => s.valores[i] ?? 'sin dato').join(' / ')}`).join('; ')} ${g.unidad ?? ''}`;
  return <div className="gr-lienzo"><canvas ref={ref} role="img" aria-label={resumen} /></div>;
}

function Tabla({ g }) {
  return (
    <div className="an-tabla-wrap">
      <table className="an-tabla">
        <thead><tr>{g.columnas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{g.filas.map((f, i) => <tr key={i}>{f.map((x, j) => <td key={j}>{x}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const valida = (g) => g && (g.tipo === 'tabla' ? Array.isArray(g.columnas) && Array.isArray(g.filas) : (g.tipo === 'barras' || g.tipo === 'linea') && Array.isArray(g.etiquetas) && Array.isArray(g.series) && g.series.length > 0);

// Dibuja `graficas` de la respuesta del asistente (esquema fijo del servidor). Sin gráficas válidas no muestra nada.
export default function Graficas({ graficas, ejemplo = false }) {
  const lista = Array.isArray(graficas) ? graficas.filter(valida).slice(0, 3) : [];
  if (!lista.length) return null;
  return (
    <section aria-label="Gráficas de la respuesta">
      {lista.map((g, i) => (
        <figure key={i} className="gr-fig">
          <figcaption><b>{g.titulo}</b>{ejemplo && <span className="gr-ej"> · ejemplo, no son datos reales</span>}{g.tipo !== 'tabla' && g.unidad ? <span> ({g.unidad})</span> : null}</figcaption>
          {g.tipo === 'tabla' ? <Tabla g={g} /> : <Lienzo g={g} />}
          {g.nota && <p className="an-texto-s">{g.nota}</p>}
          {g.fuente && <span className="fs-src">[{g.fuente}]</span>}
        </figure>
      ))}
    </section>
  );
}

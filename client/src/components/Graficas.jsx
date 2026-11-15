import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { reducedMotion } from '../lib/fs.js';
import { unidadEnPalabras } from '../glosario.js';
import { conGlosario } from './Glosario.jsx';

const COLORES = ['#23854A', '#E0A020', '#2E6FB5', '#B5532E'];
const RESALTE = '#E0A020'; // naranja: años secos o años que nombra la respuesta
const LIMITE = '#7A1F14';

// Título como pregunta y qué mirar, según el título que manda el servidor (server/llm/graficas.js). Sin coincidencia, queda el título original.
const PREGUNTAS = [
  [/^Lluvia de junio a septiembre por año/, '¿Cuánta lluvia cayó cada verano (de junio a septiembre)?', 'Cada barra es un año. Las barras naranjas quedaron debajo de la línea roja: fueron años secos.'],
  [/rendimiento por año/, '¿Cuánto se cosechó por hectárea cada año?', 'Barra más alta, mejor cosecha.'],
  [/superficie dañada por año/, '¿Qué parte de lo sembrado se perdió cada año?', 'Barra más alta, más pérdidas ese año.'],
  [/precio medio rural por año/, '¿A cuánto pagaron la tonelada cada año?', 'Es lo que recibió el productor en su zona, según el SIAP.'],
  [/daño estimado según la lluvia/, '¿Cuánto se daña el maíz si el año viene seco, normal o lluvioso?', 'Barra más alta, más daño.'],
  [/^Probabilidad de año malo/, '¿Qué tan seguido sale un año malo?', 'Barra más alta, más riesgo.'],
  [/^Puntaje de cada cultivo/, '¿Qué cultivo te conviene más?', 'Entre más alta la barra, mejor para lo que elegiste.'],
  [/ingreso bruto/i, '¿Cuánto dinero te entraría por la cosecha?', 'Barra más alta, más dinero. No se restan los gastos.'],
  [/^Lluvia media por mes/, '¿Cuánto llueve en cada mes?', 'Las barras altas son los meses de lluvias.'],
  [/^Años con helada/, '¿En qué meses hiela?', 'Barra más alta: en más años heló ese mes.'],
  [/^Hora más fría/, '¿Qué tan frío hace en cada mes?', 'Abajo de 0 grados hay helada.'],
  [/^Temperatura por mes/, '¿Qué tan caliente hace en cada mes?', null],
  [/^Radiación solar/, '¿Cuánto sol llega cada mes?', null],
  [/^Humedad de la zona de raíces/, '¿Qué tan húmeda está la tierra donde van las raíces?', 'Cerca de 1, tierra mojada; cerca de 0, tierra seca.'],
  [/^Lluvia esperada en los próximos 7 días/, '¿Cuánto va a llover esta semana?', null],
  [/^Temperaturas de los próximos 7 días/, '¿Qué temperaturas vienen esta semana?', null],
  [/^Tus (.+) ha: toneladas de maíz/, (m) => `¿Cuántas toneladas sacarías en tus ${m[1]} hectáreas?`, 'Un año malo, uno normal y uno bueno.'],
];
function comoPregunta(g) {
  for (const [re, p, mirar] of PREGUNTAS) {
    const m = g.titulo?.match(re);
    if (m) return { pregunta: typeof p === 'function' ? p(m) : p, mirar };
  }
  return { pregunta: g.titulo, mirar: null };
}

// Una serie con el mismo valor en todas las barras es un límite («año seco si es menos de»): se dibuja como línea.
const esLimite = (s, i) => i > 0 && s.valores.length > 1 && s.valores.every((v) => v != null && v === s.valores[0]);

function Lienzo({ g, resaltar }) {
  const ref = useRef(null);
  useEffect(() => {
    const movil = window.matchMedia('(max-width: 575.98px)').matches;
    const limite = g.series.find(esLimite);
    const unidad = unidadEnPalabras(g.unidad);
    const chart = new Chart(ref.current, {
      type: g.tipo === 'linea' ? 'line' : 'bar',
      data: {
        labels: g.etiquetas,
        datasets: g.series.map((s, i) => {
          if (g.tipo !== 'linea' && esLimite(s, i)) return { type: 'line', label: s.nombre, data: s.valores, borderColor: LIMITE, backgroundColor: LIMITE, borderWidth: 3, borderDash: [8, 4], pointRadius: 0, order: 0 };
          // Barras de la 1.ª serie en naranja: bajo el límite si lo hay; si no, los años que nombra la respuesta. Los datos no cambian.
          const color = i === 0 && g.tipo !== 'linea' && (limite ? s.valores.map((v) => (v != null && v < limite.valores[0] ? RESALTE : COLORES[0])) : s.valores.map((_, j) => (resaltar.includes(String(g.etiquetas[j])) ? RESALTE : COLORES[0])));
          return { label: s.nombre, data: s.valores, backgroundColor: color || COLORES[i % 4], borderColor: COLORES[i % 4], borderWidth: g.tipo === 'linea' ? 2 : 0, pointRadius: 3, tension: 0.2, spanGaps: false, order: 1 }; // null = sin dato: hueco, nunca 0
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reducedMotion() ? false : undefined,
        plugins: { legend: { display: g.series.length > 1 && !limite, labels: { font: { size: 13 } } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.formattedValue} ${unidad}` } } },
        scales: {
          y: { title: { display: !!unidad, text: unidad, font: { size: 13 } }, ticks: { font: { size: 12 } } },
          x: { ticks: { font: { size: movil ? 10 : 12 }, autoSkip: true, maxRotation: 0 } },
        },
      },
    });
    return () => chart.destroy();
  }, [g, resaltar.join()]); // por contenido: el arreglo es nuevo en cada render
  const resumen = `${g.titulo}. ${g.etiquetas.map((e, i) => `${e}: ${g.series.map((s) => s.valores[i] ?? 'sin dato').join(' / ')}`).join('; ')} ${g.unidad ?? ''}`;
  return <div className="gr-lienzo"><canvas ref={ref} role="img" aria-label={resumen} /></div>;
}

function Tabla({ g, vistos }) {
  return (
    <div className="an-tabla-wrap">
      <table className="an-tabla">
        <thead><tr>{g.columnas.map((c) => <th key={c}>{conGlosario(c, vistos)}</th>)}</tr></thead>
        <tbody>{g.filas.map((f, i) => <tr key={i}>{f.map((x, j) => <td key={j}>{x}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const valida = (g) => g && (g.tipo === 'tabla' ? Array.isArray(g.columnas) && Array.isArray(g.filas) : (g.tipo === 'barras' || g.tipo === 'linea') && Array.isArray(g.etiquetas) && Array.isArray(g.series) && g.series.length > 0);

// Dibuja `graficas` de la respuesta del asistente (esquema fijo del servidor). Sin gráficas válidas no muestra nada.
export default function Graficas({ graficas, ejemplo = false, resaltar = [] }) {
  const lista = Array.isArray(graficas) ? graficas.filter(valida).slice(0, 3) : [];
  if (!lista.length) return null;
  const vistos = new Set();
  return (
    <section aria-label="Gráficas de la respuesta">
      {lista.map((g, i) => {
        const { pregunta, mirar } = comoPregunta(g);
        const conLimite = g.tipo !== 'tabla' && g.series.some(esLimite);
        const nombrados = g.tipo === 'barras' && !conLimite && g.etiquetas.some((e) => resaltar.includes(String(e)));
        const verMirar = mirar && (!/naranjas/.test(mirar) || conLimite);
        return (
          <figure key={i} className="gr-fig">
            <figcaption><b>{conGlosario(pregunta, vistos)}</b>{ejemplo && <span className="gr-ej"> · ejemplo, no son datos reales</span>}{g.tipo !== 'tabla' && g.unidad ? <span> (en {conGlosario(unidadEnPalabras(g.unidad), vistos)})</span> : null}</figcaption>
            {(verMirar || nombrados) && <p className="gr-mirar"><i className="bi bi-eye" aria-hidden="true"></i> {verMirar && conGlosario(mirar, vistos)}{nombrados && ' En naranja, los años que nombra la respuesta.'}</p>}
            {g.tipo === 'tabla' ? <Tabla g={g} vistos={vistos} /> : <Lienzo g={g} resaltar={conLimite ? [] : resaltar} />}
            {g.nota && <p className="an-texto-s">{conGlosario(g.nota, vistos)}</p>}
            {g.fuente && <span className="fs-src">[{g.fuente}]</span>}
          </figure>
        );
      })}
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { reducedMotion } from '../../lib/fs.js';

// Yearly rain bar chart of the rotation screen (design section 8.4), with the dry-year threshold
// as a dashed line and a chip over it. Dry years get the hatched pattern of the design.
// Props: anios (number[]), valores (mm per year), umbral (mm).
export default function RainChart({ anios, valores, umbral }) {
  const canvasRef = useRef(null);
  const [chipTop, setChipTop] = useState(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const movil = window.matchMedia('(max-width: 575.98px)').matches;
    let patron = null;
    const patronSeco = (ctx) => {
      if (patron) return patron;
      const c = document.createElement('canvas');
      c.width = c.height = 6;
      const g = c.getContext('2d');
      g.fillStyle = '#CDEDD3';
      g.fillRect(0, 0, 6, 6);
      g.strokeStyle = '#A3DDB0';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, 6);
      g.lineTo(6, 0);
      g.stroke();
      patron = ctx.createPattern(c, 'repeat');
      return patron;
    };
    const minV = Math.min(...valores, umbral);
    const maxV = Math.max(...valores, umbral);
    const step = maxV - minV > 400 ? 200 : 100;
    const yMin = Math.max(0, Math.floor((minV - step * 0.5) / step) * step);
    const yMax = Math.ceil((maxV + step * 0.3) / step) * step;

    const chart = new Chart(el, {
      type: 'bar',
      data: {
        labels: anios.map((a) => String(a).slice(-2)),
        datasets: [
          {
            data: valores,
            backgroundColor: (c) => (valores[c.dataIndex] < umbral ? patronSeco(c.chart.ctx) : '#23854A'),
            borderColor: (c) => (valores[c.dataIndex] < umbral ? '#23854A' : 'transparent'),
            borderWidth: { top: 1, left: 1, right: 1, bottom: 0 },
            borderRadius: { topLeft: 5, topRight: 5 },
            borderSkipped: 'bottom',
            categoryPercentage: 0.9,
            barPercentage: 0.92,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reducedMotion() ? false : { duration: 900, easing: 'easeOutQuart', delay: (c) => c.dataIndex * 35 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#14532D',
            titleFont: { family: 'JetBrains Mono' },
            bodyFont: { family: 'JetBrains Mono' },
            displayColors: false,
            callbacks: {
              title: () => '',
              label: (c) => `${anios[c.dataIndex]}: ${c.raw} mm${c.raw < umbral ? ' · año seco' : ''}`,
            },
          },
        },
        scales: {
          y: { min: yMin, max: yMax, ticks: { stepSize: step, color: '#4A6352', font: { family: 'JetBrains Mono', size: 11 } }, grid: { color: '#E6F5E8' }, border: { display: false } },
          x: { ticks: { color: '#4A6352', font: { family: 'JetBrains Mono', size: movil ? 9 : 10 }, autoSkip: movil, maxRotation: 0, minRotation: 0 }, grid: { display: false }, border: { color: '#A3DDB0' } },
        },
      },
      plugins: [
        {
          id: 'umbral',
          afterDatasetsDraw(ch) {
            const { ctx, chartArea: a } = ch;
            const py = ch.scales.y.getPixelForValue(umbral);
            ctx.save();
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = '#14532D';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(a.left, py);
            ctx.lineTo(a.right, py);
            ctx.stroke();
            ctx.restore();
            setChipTop((prev) => (prev === py - 12 ? prev : py - 12));
          },
        },
      ],
    });
    return () => chart.destroy();
  }, [anios, valores, umbral]);

  return (
    <div className="fs-chart">
      <canvas ref={canvasRef} role="img" aria-label={`Lluvia anual ${anios[0]}–${anios[anios.length - 1]}; ${valores.filter((v) => v < umbral).length} años por debajo de ${umbral} mm`} />
      <span className="fs-umbral" hidden={chipTop == null} style={chipTop != null ? { top: `${chipTop}px` } : undefined}>
        umbral {umbral} mm
      </span>
    </div>
  );
}

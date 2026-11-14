import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { reducedMotion } from '../../lib/fs.js';

// Radar of the six factors (design screen 4): the tested crop (solid) against the reference crop
// of year 1 (dashed). Props: labels, main { label, data }, ref { label, data }, ariaLabel.
export default function RadarChart({ labels, main, reference, ariaLabel }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const chart = new Chart(el, {
      type: 'radar',
      data: {
        labels,
        datasets: [
          {
            label: main.label,
            data: main.data,
            borderColor: '#1B6B3A',
            backgroundColor: 'rgba(27,107,58,.18)',
            borderWidth: 2.5,
            pointBackgroundColor: '#14532D',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 5,
          },
          { label: reference.label, data: reference.data, borderColor: '#6CC283', backgroundColor: 'transparent', borderDash: [5, 4], borderWidth: 2, pointRadius: 0 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reducedMotion() ? false : { duration: 900, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#14532D',
            bodyFont: { family: 'JetBrains Mono' },
            titleFont: { family: 'Plus Jakarta Sans' },
            callbacks: { label: (c) => `${c.dataset.label}: ${c.raw}/100` },
          },
        },
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { stepSize: 25, display: false },
            grid: { color: '#CDEDD3' },
            angleLines: { color: '#CDEDD3' },
            pointLabels: { color: '#14532D', font: { family: 'Plus Jakarta Sans', size: 12, weight: '700' } },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [labels, main, reference]);

  return (
    <div className="fs-radar">
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
    </div>
  );
}

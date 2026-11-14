import { useState } from 'react';
import { getClima, getSuelo } from './api/client.js';
import { EXAMPLE_POINTS } from './config/examplePoints.js';
import ClimaCard from './components/resultado/ClimaCard.jsx';
import SueloCard from './components/resultado/SueloCard.jsx';

// Phase 1 screen: proves the whole path works (button -> server -> NASA POWER / SoilGrids).
// Phase 2 replaces the button with the map and the form, and adds the recommendation.
export default function App() {
  const [point, setPoint] = useState(null);
  const [loading, setLoading] = useState(false);
  const [clima, setClima] = useState(null);
  const [suelo, setSuelo] = useState(null);

  async function loadPoint(selected) {
    setPoint(selected);
    setLoading(true);
    setClima(null);
    setSuelo(null);
    // Climate and soil are independent: if one fails, the other is still shown.
    const [climaResult, sueloResult] = await Promise.allSettled([
      getClima(selected.lat, selected.lon),
      getSuelo(selected.lat, selected.lon),
    ]);
    const unwrap = (result) =>
      result.status === 'fulfilled' ? { data: result.value } : { error: result.reason.message };
    setClima(unwrap(climaResult));
    setSuelo(unwrap(sueloResult));
    setLoading(false);
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Field Shift Bajío</h1>
        <p>Rotación de cultivos para tu parcela de temporal, con datos de la NASA.</p>
      </header>

      <main>
        <section className="card">
          <h2>1. Elige tu parcela</h2>
          <p className="hint">Por ahora hay una parcela de ejemplo. El mapa llega en la siguiente fase.</p>
          <div className="button-row">
            {EXAMPLE_POINTS.map((example) => (
              <button key={example.nombre} type="button" disabled={loading} onClick={() => loadPoint(example)}>
                {example.nombre}
              </button>
            ))}
          </div>
          {point && (
            <p className="hint">
              Parcela: {point.nombre} ({point.lat}, {point.lon})
            </p>
          )}
        </section>

        {loading && (
          <p className="status" role="status">
            Consultando el clima y el suelo de tu parcela…
          </p>
        )}

        <ClimaCard result={clima} />
        <SueloCard result={suelo} />
      </main>

      <footer className="page-footer">
        <p>
          Clima: NASA POWER (NASA Langley Research Center). Suelo: SoilGrids 2.0 (ISRIC World Soil Information).
        </p>
        <p>NASA Space Apps Challenge 2026, Querétaro. Reto Field Shift.</p>
      </footer>
    </div>
  );
}

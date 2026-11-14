import { Suspense, lazy, useRef, useState } from 'react';
import { getClima, getSuelo } from './api.js';
import { EXAMPLE_POINTS } from './examplePoints.js';
import { createParcel, farmPoint, nextParcelId } from './map/parcels.js';
import Vista3DSection from './Vista3DSection.jsx';

// MapLibre (~1 MB) loads in its own chunk, after the page is already on screen.
const ParcelMap = lazy(() => import('./map/ParcelMap.jsx'));

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const ORIGIN_LABEL = {
  api: 'recién consultado',
  cache: 'guardado de una consulta anterior',
  fixture: 'copia de respaldo (sin internet)',
};

// Progress at the top: each step lights up when the farmer gets there, and jumps to its section.
function Steps({ steps }) {
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="steps">
      {steps.map((step, i) => (
        <li key={step.href} className={step.done ? 'done' : i === current ? 'current' : undefined}>
          <a href={step.href}>
            <span className="steps-dot" aria-hidden="true">{step.done ? '✓' : i + 1}</span>
            {step.label}
            {step.done && <span className="visually-hidden"> (listo)</span>}
          </a>
        </li>
      ))}
    </ol>
  );
}

// Phase 2 adds the form and the recommendation below the climate.
export default function App() {
  const [point, setPoint] = useState(null);
  const [loading, setLoading] = useState(false);
  const [clima, setClima] = useState(null);
  const [suelo, setSuelo] = useState(null);
  const latestRequest = useRef(0);

  async function loadPoint(selected) {
    // Picking on the globe makes quick successive clicks easy: only the last one may paint.
    const request = ++latestRequest.current;
    setPoint(selected);
    setLoading(true);
    setClima(null);
    setSuelo(null);
    // Climate and soil are independent: if one fails, the other is still shown.
    const [climaResult, sueloResult] = await Promise.allSettled([
      getClima(selected.lat, selected.lon),
      getSuelo(selected.lat, selected.lon),
    ]);
    if (request !== latestRequest.current) return;
    const unwrap = (result) =>
      result.status === 'fulfilled' ? { data: result.value } : { error: result.reason.message };
    setClima(unwrap(climaResult));
    setSuelo(unwrap(sueloResult));
    setLoading(false);
  }

  // The farmer's drawn parcels, each with its own crop. Climate and soil are asked for the center
  // of all of them (the API takes one point); changing a crop does not ask again.
  const [parcelas, setParcelas] = useState([]);

  function setFarm(next) {
    setParcelas(next);
    if (next.length) loadPoint(farmPoint(next));
  }
  const addParcela = (contorno) => setFarm([...parcelas, createParcel(nextParcelId(parcelas), contorno)]);
  const removeParcela = (id) => setFarm(parcelas.filter((p) => p.id !== id));
  const setCultivo = (id, cultivo) => setParcelas((list) => list.map((p) => (p.id === id ? { ...p, cultivo } : p)));

  // A point chosen without drawing (example button, 3D globe) is another place: parcels are cleared.
  function choosePoint(selected) {
    setParcelas([]);
    loadPoint(selected);
  }

  return (
    <div className="page">
      <header className="hero">
        <p className="hero-kicker">NASA Space Apps · Bajío</p>
        <h1>Field Shift Bajío</h1>
        <p className="hero-lead">Dibuja tu parcela, mírala en 3D y descubre cómo le ha ido a tu tierra con la lluvia de los últimos 25 años.</p>
        <Steps
          steps={[
            { href: '#paso-1', label: 'Dibuja tu parcela', done: parcelas.length > 0 || Boolean(point) },
            { href: '#paso-2', label: 'Mírala en 3D', done: Boolean(point) },
            { href: '#paso-3', label: 'Conoce tu clima', done: Boolean(clima?.data) },
          ]}
        />
      </header>

      <main>
        <section className="card" id="paso-1">
          <h2>
            <span className="step-badge">1</span> Dibuja tu parcela
          </h2>
          <Suspense fallback={<p className="status">Cargando el mapa…</p>}>
            <ParcelMap
              point={point}
              parcelas={parcelas}
              suelo={suelo?.data ?? null}
              onAddParcela={addParcela}
              onRemoveParcela={removeParcela}
              onSetCultivo={setCultivo}
            />
          </Suspense>
          <div className="button-row">
            <span className="hint">O usa la parcela de ejemplo:</span>
            {EXAMPLE_POINTS.map((example) => (
              <button key={example.nombre} type="button" className="secondary" onClick={() => choosePoint(example)}>
                {example.nombre}
              </button>
            ))}
          </div>
          {point && (
            <p className="hint">
              Parcela: {point.nombre} (centro en {point.lat.toFixed(4)}, {point.lon.toFixed(4)})
            </p>
          )}
        </section>

        <Vista3DSection point={point} parcelas={parcelas} clima={clima} suelo={suelo} onSelectPoint={choosePoint} />

        {loading && (
          <p className="status" role="status">
            Consultando el clima y el suelo de tu parcela…
          </p>
        )}

        <div id="paso-3" />
        {clima && <ClimateCard result={clima} />}
        {suelo && <SoilCard result={suelo} />}
      </main>

      <footer className="page-footer">
        <p>
          Clima: NASA POWER (NASA Langley Research Center). Suelo: SoilGrids 2.0 (ISRIC World Soil Information).
        </p>
        <p>
          Globo: NASA Blue Marble vía NASA GIBS. Relieve: AWS Terrain Tiles (Mapzen), con alturas de NASA SRTM. Modelos
          3D hechos por el equipo en Blender.
        </p>
        <p>NASA Space Apps Challenge 2026, Querétaro. Reto Field Shift.</p>
      </footer>
    </div>
  );
}

function ClimateCard({ result }) {
  if (result.error) {
    return (
      <section className="card">
        <h2>
          <span className="step-badge">3</span> Lluvia y temperatura
        </h2>
        <p className="error" role="alert">{result.error}</p>
      </section>
    );
  }

  const clima = result.data;
  const years = clima.lluvia_pv_anual;
  const temps = clima.temp_media_mensual.filter((m) => m.t_media_c !== null);
  const hottest = temps.reduce((a, b) => (b.t_media_c > a.t_media_c ? b : a));
  const coldest = temps.reduce((a, b) => (b.t_media_c < a.t_media_c ? b : a));

  return (
    <section className="card">
      <h2>
          <span className="step-badge">3</span> Lluvia y temperatura
        </h2>
      <ul className="facts">
        <li>
          En un año normal llueven <strong>{Math.round(clima.lluvia_pv_mediana_mm)} mm</strong> de junio a septiembre.
        </li>
        <li>
          En <strong>{clima.anios_secos.length} de {years.length} años</strong> llovió menos de{' '}
          {Math.round(clima.umbral_seco_mm)} mm
          (años secos): {clima.anios_secos.join(', ') || 'ninguno'}.
        </li>
        <li>
          El mes más caluroso es {MONTHS[hottest.mes - 1]} ({hottest.t_media_c} °C en promedio) y el más frío es{' '}
          {MONTHS[coldest.mes - 1]} ({coldest.t_media_c} °C).
        </li>
      </ul>

      <table>
        <caption>Lluvia de junio a septiembre, por año</caption>
        <thead>
          <tr>
            <th scope="col">Año</th>
            <th scope="col">Lluvia (mm)</th>
            <th scope="col">¿Año seco?</th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => (
            <tr key={year.anio} className={year.seco ? 'dry' : undefined}>
              <td>{year.anio}</td>
              <td>{Math.round(year.lluvia_mm)}</td>
              <td>{year.seco ? 'Sí' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="source">
        Fuente: {clima.fuente}, {clima.periodo.inicio} a {clima.periodo.fin}. Dato {ORIGIN_LABEL[clima.origen]}.
      </p>
    </section>
  );
}

function SoilCard({ result }) {
  if (result.error) {
    return (
      <section className="card">
        <h2>Suelo</h2>
        <p className="error" role="alert">{result.error}</p>
      </section>
    );
  }

  const suelo = result.data;
  return (
    <section className="card">
      <h2>Suelo (primeros 30 cm)</h2>
      {suelo.sin_datos ? (
        <p className="error" role="alert">{suelo.aviso}</p>
      ) : (
        <ul className="facts">
          <li>
            pH: <strong>{suelo.ph}</strong>
          </li>
          <li>
            Arcilla {suelo.arcilla_pct} %, arena {suelo.arena_pct} %, limo {suelo.limo_pct} %
          </li>
          <li>Carbono orgánico: {suelo.carbono_organico_g_kg} g por kg de suelo</li>
          <li>Nitrógeno: {suelo.nitrogeno_g_kg} g por kg de suelo</li>
        </ul>
      )}
      <p className="source">
        Fuente: {suelo.fuente}. Dato {ORIGIN_LABEL[suelo.origen]}.
      </p>
    </section>
  );
}

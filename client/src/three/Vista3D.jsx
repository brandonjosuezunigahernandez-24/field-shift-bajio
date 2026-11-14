import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { getTerreno } from '../api.js';
import { toDiorama } from '../map/polygon.js';
import { latLonToXYZ, round2, wrapLon } from './geo.js';
import { CROP_IDS, preloadModels } from './models.js';
import { reliefExaggeration, yearState } from './parcelState.js';
import Scene from './Scene.jsx';

const CROP_NAMES = {
  maiz: 'Maíz',
  sorgo: 'Sorgo',
  trigo: 'Trigo',
  cebada: 'Cebada',
  frijol: 'Frijol',
  garbanzo: 'Garbanzo',
  brocoli: 'Brócoli',
};
const STEP_DEG = 0.01; // ~1 km, the same resolution as the server cache
const PLAY_MS = 900;

function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return undefined;
    const onChange = () => setReduced(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

const fmt = (n) => Math.round(n).toLocaleString('es-MX');

// Props:
//   point          { nombre, lat, lon } or null
//   clima, suelo   { data } | { error } | null, as App keeps them
//   onSelectPoint  ({ nombre, lat, lon }) => void
export default function Vista3D({ point, clima, suelo, onSelectPoint }) {
  const reducedMotion = usePrefersReducedMotion();
  const [view, setView] = useState('globe');
  const [terreno, setTerreno] = useState(null);
  const [anio, setAnio] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [cultivo, setCultivo] = useState('maiz');
  const [contextLost, setContextLost] = useState(false);

  // A new plot always flies down to it.
  useEffect(() => {
    if (point) setView('parcel');
  }, [point]);

  useEffect(() => {
    preloadModels();
  }, []);

  // Relief of the 1 km square around the plot. Stale answers are ignored.
  useEffect(() => {
    if (!point) return undefined;
    let current = true;
    setTerreno(null);
    getTerreno(point.lat, point.lon).then(
      (data) => current && setTerreno({ data }),
      (err) => current && setTerreno({ error: err.message })
    );
    return () => {
      current = false;
    };
  }, [point]);

  const climaData = clima?.data ?? null;
  const years = useMemo(() => climaData?.lluvia_pv_anual.map((y) => y.anio) ?? [], [climaData]);

  // Start on the latest year whenever a new climate series arrives.
  useEffect(() => {
    setPlaying(false);
    setAnio(years.length ? years[years.length - 1] : null);
  }, [years]);

  // "Ver los años": one year every PLAY_MS, stops at the end.
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      setAnio((current) => {
        const i = years.indexOf(current);
        if (i < 0 || i >= years.length - 1) {
          setPlaying(false);
          return current;
        }
        return years[i + 1];
      });
    }, PLAY_MS);
    return () => clearInterval(id);
  }, [playing, years]);

  // The diorama is centered where the server centers /api/terreno: the point rounded to
  // 2 decimals. A drawn outline is placed relative to that same center, so it sits on the relief.
  const centerLat = point ? round2(point.lat) : null;
  const centerLon = point ? round2(point.lon) : null;
  const place = useMemo(
    () => (centerLat === null ? null : { lat: centerLat, lon: centerLon }),
    [centerLat, centerLon]
  );
  const outline = useMemo(
    () => (point?.contorno?.length >= 3 ? toDiorama(point.contorno, centerLat, centerLon) : null),
    [point, centerLat, centerLon]
  );

  // Camera framing for a drawn parcel: its bounding box center and half diagonal, on the block.
  const focus = useMemo(() => {
    if (!outline) return null;
    const clampEdge = (v) => Math.max(-0.5, Math.min(0.5, v));
    const xs = outline.map((p) => clampEdge(p[0]));
    const zs = outline.map((p) => clampEdge(p[1]));
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, radius: Math.hypot(x1 - x0, z1 - z0) / 2 };
  }, [outline]);

  const pick = ({ lat, lon }) =>
    onSelectPoint({ nombre: 'Punto elegido en el globo', lat: round2(lat), lon: round2(wrapLon(lon)) });

  // Moving leaves the drawn outline behind: the new square is just a point.
  const move = (dLat, dLon) =>
    onSelectPoint({
      nombre: point.contorno ? 'Cerca de tu parcela' : point.nombre,
      lat: round2(Math.max(-89, Math.min(89, centerLat + dLat))),
      lon: round2(wrapLon(centerLon + dLon)),
    });

  const startPlaying = () => {
    if (anio === years[years.length - 1]) setAnio(years[0]);
    setPlaying(true);
  };

  const state = yearState(climaData, anio);
  const sueloData = suelo?.data ?? null;
  const terrenoData = terreno?.data ?? null;
  const exaggeration = terrenoData ? reliefExaggeration(terrenoData.desnivel_m, terrenoData.lado_m) : 1;
  const inParcel = view === 'parcel' && point;

  const diorama = { terreno: terrenoData, clima: climaData, suelo: sueloData, anio, cultivo, outline };

  if (contextLost) {
    return (
      <p className="error" role="alert">
        La vista 3D se detuvo porque la tarjeta de video se quedó sin memoria. Recarga la página para volver a verla.
      </p>
    );
  }

  return (
    <div className="vista3d">
      <div className="vista3d-canvas">
        <Canvas
          frameloop="demand" // draws only when something changes: no battery drain while idle
          dpr={[1, 1.5]} // caps the pixel count on high-density screens
          camera={{ position: latLonToXYZ(21, -101, 2.8), fov: 45, near: 0.002, far: 100 }}
          gl={{ antialias: true, powerPreference: 'default' }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', (event) => {
              event.preventDefault();
              setContextLost(true);
            });
          }}
        >
          <Scene view={view} point={place} focus={focus} onPick={pick} diorama={diorama} reducedMotion={reducedMotion} />
        </Canvas>
        <p className="vista3d-hint" aria-hidden="true">
          {inParcel
            ? 'Arrastra para girar la parcela. Rueda o pellizca para acercar.'
            : 'Arrastra para girar el globo. Rueda o pellizca para acercar. Toca un punto para elegir tu parcela.'}
        </p>
        {point && !terreno && inParcel && <p className="vista3d-badge">Cargando el relieve…</p>}
      </div>

      {point ? (
        <div className="vista3d-panel">
          <div className="button-row">
            {inParcel ? (
              <button type="button" className="secondary" onClick={() => setView('globe')}>
                Volver al globo
              </button>
            ) : (
              <button type="button" className="secondary" onClick={() => setView('parcel')}>
                Ver mi parcela
              </button>
            )}
          </div>

          <fieldset className="vista3d-move">
            <legend>Mover la parcela 1 km</legend>
            <button type="button" className="secondary" onClick={() => move(STEP_DEG, 0)}>Norte</button>
            <button type="button" className="secondary" onClick={() => move(-STEP_DEG, 0)}>Sur</button>
            <button type="button" className="secondary" onClick={() => move(0, -STEP_DEG)}>Oeste</button>
            <button type="button" className="secondary" onClick={() => move(0, STEP_DEG)}>Este</button>
          </fieldset>

          {years.length > 0 ? (
            <div className="vista3d-year">
              <label htmlFor="anio3d">
                Año: <strong>{anio}</strong>
              </label>
              <input
                id="anio3d"
                type="range"
                min={years[0]}
                max={years[years.length - 1]}
                step={1}
                value={anio ?? years[0]}
                onChange={(e) => {
                  setPlaying(false);
                  setAnio(Number(e.target.value));
                }}
              />
              <button type="button" className="secondary" onClick={playing ? () => setPlaying(false) : startPlaying}>
                {playing ? 'Pausa' : 'Ver los años'}
              </button>
              {state.lluvia_mm !== null && (
                <p className={state.seco ? 'vista3d-dry' : undefined} aria-live="polite">
                  En {anio} llovieron <strong>{fmt(state.lluvia_mm)} mm</strong> de junio a septiembre:{' '}
                  {state.seco ? 'año seco' : 'año normal o bueno'} (lo normal aquí es {fmt(climaData.lluvia_pv_mediana_mm)} mm).
                </p>
              )}
            </div>
          ) : (
            <p className="hint">{clima?.error ?? 'Cargando la lluvia de tu parcela…'}</p>
          )}

          <label className="vista3d-crop">
            Cultivo en la maqueta{' '}
            <select value={cultivo} onChange={(e) => setCultivo(e.target.value)}>
              {CROP_IDS.map((id) => (
                <option key={id} value={id}>
                  {CROP_NAMES[id]}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">Solo es para ver cómo se vería. Todavía no es la recomendación.</p>

          <ul className="facts">
            {sueloData && !sueloData.sin_datos && (
              <li>
                Suelo: pH {sueloData.ph}, arcilla {sueloData.arcilla_pct} %. Los lados del bloque tienen el color de este suelo.
              </li>
            )}
            {sueloData?.sin_datos && <li className="error">{sueloData.aviso}</li>}
            {terrenoData && (
              <li>
                Altura: {fmt(terrenoData.altura_centro_m)} m. En 1 km el terreno sube y baja {terrenoData.desnivel_m} m{' '}
                {exaggeration > 1
                  ? `(en la maqueta se ve ${exaggeration} veces más alto para que se note).`
                  : '(en la maqueta, a su altura real).'}
              </li>
            )}
            {terreno?.error && <li className="error">{terreno.error} La maqueta se muestra plana.</li>}
          </ul>
        </div>
      ) : (
        <p className="hint vista3d-panel">Gira el globo hasta el Bajío y toca tu región, o usa el botón de ejemplo de arriba.</p>
      )}
    </div>
  );
}

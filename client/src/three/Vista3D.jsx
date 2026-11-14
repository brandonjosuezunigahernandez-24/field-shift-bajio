import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getTerreno } from '../api.js';
import { CROP_IDS, CROP_NAMES, DEFAULT_CROP } from '../crops.js';
import { ALL_SECTIONS, fitsOneBlock, parcelColor, sectionCenter, sectionParcels } from '../map/parcels.js';
import { toDiorama } from '../map/polygon.js';
import { latLonToXYZ, round2, wrapLon } from './geo.js';
import { preloadModels } from './models.js';
import { reliefExaggeration, yearState } from './parcelState.js';
import Scene from './Scene.jsx';

const STEP_DEG = 0.01; // ~1 km, the same resolution as the server cache

// Relief already downloaded, by block center: going back to a section is instant and asks the
// server nothing. A plain Map: a farm has a handful of parcels, each grid is ~30 KB.
const terrainCache = new Map();
function loadTerreno(lat, lon) {
  const key = `${lat},${lon}`;
  if (!terrainCache.has(key)) {
    const request = getTerreno(lat, lon);
    request.catch(() => terrainCache.delete(key)); // a failure can be retried later
    terrainCache.set(key, request);
  }
  return terrainCache.get(key);
}
const round3 = (v) => Math.round(v * 1000) / 1000 + 0;
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
export default function Vista3D({ point, parcelas = [], clima, suelo, onSelectPoint }) {
  const reducedMotion = usePrefersReducedMotion();
  const [view, setView] = useState('globe');
  const [terreno, setTerreno] = useState(null);
  const [anio, setAnio] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [cultivo, setCultivo] = useState(DEFAULT_CROP);
  const [contextLost, setContextLost] = useState(false);

  // Section shown in 3D: one parcel id, or ALL_SECTIONS. Each section is its own diorama,
  // centered on its parcels, so a parcel never falls off a block centered somewhere else.
  const [seccion, setSeccion] = useState(ALL_SECTIONS);
  const lastIdRef = useRef(0);
  useEffect(() => {
    const newest = parcelas.reduce((max, p) => Math.max(max, p.id), 0);
    if (newest > lastIdRef.current) setSeccion(newest); // a parcel was just added: show it
    else if (seccion !== ALL_SECTIONS && !parcelas.some((p) => p.id === seccion)) {
      setSeccion(ALL_SECTIONS); // the shown parcel was deleted
    }
    lastIdRef.current = newest;
  }, [parcelas]); // eslint-disable-line react-hooks/exhaustive-deps
  const members = useMemo(() => sectionParcels(parcelas, seccion), [parcelas, seccion]);
  const allFit = useMemo(() => fitsOneBlock(parcelas), [parcelas]);

  // A new plot always flies down to it.
  useEffect(() => {
    if (point) setView('parcel');
  }, [point]);

  useEffect(() => {
    preloadModels();
  }, []);


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

  // The diorama is centered where the server centers /api/terreno (3 decimals, ~110 m): on the
  // section's parcels, or on the chosen point. Outlines are placed relative to that same center.
  const center = members.length ? sectionCenter(members) : point ? { lat: round3(point.lat), lon: round3(point.lon) } : null;
  const centerLat = center?.lat ?? null;
  const centerLon = center?.lon ?? null;

  // Relief of the section's 1 km block. Stale answers are ignored.
  useEffect(() => {
    if (centerLat === null) return undefined;
    let current = true;
    setTerreno(null);
    loadTerreno(centerLat, centerLon).then(
      (data) => current && setTerreno({ data }),
      (err) => current && setTerreno({ error: err.message })
    );
    return () => {
      current = false;
    };
  }, [centerLat, centerLon]);
  const place = useMemo(
    () => (centerLat === null ? null : { lat: centerLat, lon: centerLon }),
    [centerLat, centerLon]
  );
  // Drawn parcels in diorama units, each with its own crop and color.
  const sections = useMemo(
    () =>
      centerLat === null
        ? []
        : members.map((p) => ({
            id: p.id,
            numero: parcelas.indexOf(p) + 1,
            cultivo: p.cultivo,
            color: parcelColor(p.id),
            outline: toDiorama(p.contorno, centerLat, centerLon),
          })),
    [members, parcelas, centerLat, centerLon]
  );
  // Parts of a parcel farther than 500 m from the center fall off the 1 km block.
  const offBlock = sections.some((s) => s.outline.some(([x, z]) => Math.abs(x) > 0.5 || Math.abs(z) > 0.5));

  // Camera framing for the drawn parcels: bounding box center and half diagonal, on the block.
  // Only the shapes matter: changing a crop must not move the camera.
  const shapesKey = sections.map((s) => s.outline.flat().join(',')).join('|');
  const focus = useMemo(() => {
    if (!sections.length) return null;
    const clampEdge = (v) => Math.max(-0.5, Math.min(0.5, v));
    const pts = sections.flatMap((s) => s.outline);
    const xs = pts.map((p) => clampEdge(p[0]));
    const zs = pts.map((p) => clampEdge(p[1]));
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, radius: Math.hypot(x1 - x0, z1 - z0) / 2 };
  }, [shapesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = ({ lat, lon }) =>
    onSelectPoint({ nombre: 'Punto elegido en el globo', lat: round2(lat), lon: round2(wrapLon(lon)) });

  // Only offered without drawn parcels (moving would leave them behind).
  const move = (dLat, dLon) =>
    onSelectPoint({
      nombre: point.nombre,
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

  const diorama = { terreno: terrenoData, clima: climaData, suelo: sueloData, anio, cultivo, sections };
  const sectionName = (id) => `Parcela ${parcelas.findIndex((p) => p.id === id) + 1}`;

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

          {parcelas.length > 1 && (
            <fieldset className="vista3d-sections">
              <legend>Ver en la maqueta</legend>
              {parcelas.map((p) => (
                <label key={p.id} style={{ '--parcel-color': parcelColor(p.id) }}>
                  <input type="radio" name="seccion3d" checked={seccion === p.id} onChange={() => { setSeccion(p.id); setView('parcel'); }} />
                  <span className="parcel-swatch" aria-hidden="true" /> {sectionName(p.id)}
                </label>
              ))}
              <label>
                <input
                  type="radio"
                  name="seccion3d"
                  checked={seccion === ALL_SECTIONS}
                  onChange={() => { setSeccion(ALL_SECTIONS); setView('parcel'); }}
                />
                Todas juntas
              </label>
              {!allFit && (
                <p className="hint">
                  Tus parcelas están a más de 1 km entre sí: juntas no caben en una maqueta. Mírala una por una.
                </p>
              )}
            </fieldset>
          )}

          {sections.length === 0 && (
            <fieldset className="vista3d-move">
              <legend>Mover la parcela 1 km</legend>
              <button type="button" className="secondary" onClick={() => move(STEP_DEG, 0)}>Norte</button>
              <button type="button" className="secondary" onClick={() => move(-STEP_DEG, 0)}>Sur</button>
              <button type="button" className="secondary" onClick={() => move(0, -STEP_DEG)}>Oeste</button>
              <button type="button" className="secondary" onClick={() => move(0, STEP_DEG)}>Este</button>
            </fieldset>
          )}

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

          {sections.length > 0 ? (
            <>
              <ul className="vista3d-legend">
                {sections.map((s) => (
                  <li key={s.id} style={{ '--parcel-color': s.color }}>
                    <span className="parcel-swatch" aria-hidden="true" /> Parcela {s.numero}: {CROP_NAMES[s.cultivo]}
                  </li>
                ))}
              </ul>
              <p className="hint">Cambia el cultivo de cada parcela arriba, en «Tus parcelas». Todavía no es la recomendación.</p>
              {offBlock && (
                <p className="hint">
                  {seccion === ALL_SECTIONS
                    ? 'Una parte de tus parcelas queda fuera de la maqueta (1 km). Elige una parcela arriba para verla completa.'
                    : 'Esta parcela mide más de 1 km: la maqueta muestra solo el centro.'}
                </p>
              )}
            </>
          ) : (
            <>
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
            </>
          )}

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

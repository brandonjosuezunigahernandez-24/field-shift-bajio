import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getTerreno } from '../api/client.js';
import { CROP_IDS, CROP_NAMES, DEFAULT_CROP } from '../crops.js';
import { ALL_SECTIONS, blockSide, fitsOneBlock, parcelColor, sectionCenter, sectionParcels } from '../map/parcels.js';
import { toDiorama } from '../map/polygon.js';
import { latLonToXYZ, round2, wrapLon } from './geo.js';
import { preloadModels } from './models.js';
import { YearControl } from '../year.jsx';
import { weatherFromCode } from '../weather.js';
import { reliefExaggeration } from './parcelState.js';
import Scene from './Scene.jsx';

const STEP_DEG = 0.01; // ~1 km, the same resolution as the server cache

// Relief already downloaded, by block center and side: going back to a section is instant and asks
// the server nothing. A plain Map: a farm has a handful of parcels, each grid is ~30 KB.
const terrainCache = new Map();
function loadTerreno(lat, lon, side) {
  const key = `${lat},${lon},${side}`;
  if (!terrainCache.has(key)) {
    const request = getTerreno(lat, lon, side);
    request.catch(() => terrainCache.delete(key)); // a failure can be retried later
    terrainCache.set(key, request);
  }
  return terrainCache.get(key);
}
const round3 = (v) => Math.round(v * 1000) / 1000 + 0;

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
//   cultivoPlan    crop of the year chosen in the rotation plan, or null
export default function Vista3D({ point, parcelas = [], clima, suelo, onSelectPoint, year, pronostico = null, recomendacion = null, cultivoPlan = null }) {
  const reducedMotion = usePrefersReducedMotion();
  const [view, setView] = useState('globe');
  const [terreno, setTerreno] = useState(null);
  const [cultivo, setCultivo] = useState(DEFAULT_CROP);
  const [contextLost, setContextLost] = useState(false);
  // Parcela que el agricultor tocó en la maqueta (su información sale abajo) y día del pronóstico elegido.
  const [selId, setSelId] = useState(null);
  const [dia, setDia] = useState(null);
  const dias = pronostico?.dias ?? [];
  const diaSel = dia !== null ? dias[dia] : null;
  const climaDia = diaSel ? weatherFromCode(diaSel.codigo_clima, diaSel.lluvia_mm) : null;
  const dayShort = (fecha) => new Date(`${fecha}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });

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
    preloadModels([DEFAULT_CROP]);
  }, []);

  // When the plan moves to another year, the model shows that year's crop (it can still be changed by hand).
  useEffect(() => {
    if (cultivoPlan && CROP_IDS.includes(cultivoPlan)) setCultivo(cultivoPlan);
  }, [cultivoPlan]);


  const climaData = clima?.data ?? null;
  const anio = year.anio;

  // The diorama is centered where the server centers /api/terreno (3 decimals, ~110 m): on the
  // section's parcels, or on the chosen point. Outlines are placed relative to that same center.
  const center = members.length ? sectionCenter(members) : point ? { lat: round3(point.lat), lon: round3(point.lon) } : null;
  const centerLat = center?.lat ?? null;
  const centerLon = center?.lon ?? null;
  // Side of the block in meters: as big as the shown parcels need (250 m to 4 km), 1 km for a point.
  const side = useMemo(() => blockSide(members), [members]);
  const sideLabel = side >= 1000 ? `${side / 1000} km` : `${side} m`;

  // Relief of the section's block. Stale answers are ignored.
  useEffect(() => {
    if (centerLat === null) return undefined;
    let current = true;
    setTerreno(null);
    loadTerreno(centerLat, centerLon, side).then(
      (data) => current && setTerreno({ data }),
      (err) => current && setTerreno({ error: err.message })
    );
    return () => {
      current = false;
    };
  }, [centerLat, centerLon, side]);
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
            outline: toDiorama(p.contorno, centerLat, centerLon, side),
          })),
    [members, parcelas, centerLat, centerLon, side]
  );
  // Parts of a parcel outside the block (only when they need more than 4 km) fall off it.
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

  const sueloData = suelo?.data ?? null;
  const terrenoData = terreno?.data ?? null;
  const exaggeration = terrenoData ? reliefExaggeration(terrenoData.desnivel_m, terrenoData.lado_m) : 1;
  const inParcel = view === 'parcel' && point;

  const diorama = { terreno: terrenoData, clima: climaData, suelo: sueloData, anio, cultivo, sections, rainOverride: climaDia ? climaDia.rain : null, onSelectSection: setSelId };
  const selected = sections.find((x) => x.id === selId) ?? null;
  const selParcela = parcelas.find((p) => p.id === selId) ?? null;
  const selReco = selected ? recomendacion?.cultivos?.find((c) => c.id === selected.cultivo) : null;
  const selYear = climaData?.lluvia_pv_anual?.find((y) => y.anio === anio) ?? null;
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
        {terrenoData && inParcel && (
          <p className="vista3d-badge">
            Maqueta de {sideLabel} por lado{sections.length ? ', a la medida de tu parcela' : ''}
          </p>
        )}
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
                  Tus parcelas están muy separadas: juntas no caben en una maqueta de 4 km. Mírala una por una.
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

          <YearControl id="anio3d" year={year} clima={climaData} error={clima?.error} />

          {dias.length > 0 && (
            <fieldset className="vista3d-forecast">
              <legend>Clima de los próximos 7 días</legend>
              <div className="forecast-row">
                {dias.map((d, i) => {
                  const w = weatherFromCode(d.codigo_clima, d.lluvia_mm);
                  return (
                    <button key={d.fecha} type="button" className={`forecast-day${dia === i ? ' is-on' : ''}`} aria-pressed={dia === i} onClick={() => setDia(dia === i ? null : i)}>
                      <span className="fd-name">{i === 0 ? 'Hoy' : dayShort(d.fecha)}</span>
                      <span className="fd-icon" aria-hidden="true">{w.icon}</span>
                      <span className="fd-mm">{d.lluvia_mm} mm</span>
                    </button>
                  );
                })}
              </div>
              {diaSel ? (
                <p className="forecast-detail" role="status">
                  <strong>{dayShort(diaSel.fecha)}: {climaDia.label}.</strong> Lluvia {diaSel.lluvia_mm} mm
                  {diaSel.prob_lluvia_pct != null ? ` (${diaSel.prob_lluvia_pct} % de probabilidad)` : ''}, temperatura de {diaSel.t_min_c} a {diaSel.t_max_c} °C.
                  {' '}La maqueta muestra la lluvia de ese día. <button type="button" className="secondary" onClick={() => setDia(null)}>Volver al año {anio}</button>
                </p>
              ) : (
                <p className="hint">Toca un día para ver cómo estará el clima sobre tu parcela. Fuente: Open-Meteo{pronostico?.origen === 'cache' ? ' (guardado, sin conexión nueva)' : ''}.</p>
              )}
            </fieldset>
          )}

          {selected && (
            <aside className="parcel-info" role="status" style={{ '--parcel-color': selected.color }}>
              <button type="button" className="secondary" onClick={() => setSelId(null)}>Cerrar ✕</button>
              <h3>
                <span className="parcel-swatch" aria-hidden="true" /> Parcela {selected.numero}: {CROP_NAMES[selected.cultivo]}
              </h3>
              <ul className="facts">
                {selParcela && <li>Tamaño: <strong>{selParcela.hectareas} hectáreas</strong>.</li>}
                {selYear && (
                  <li>
                    En {anio} llovió <strong>{fmt(selYear.lluvia_mm)} mm</strong> de junio a septiembre{selYear.seco ? ' (fue un año seco)' : ''}.
                  </li>
                )}
                {selReco ? (
                  <li>
                    En la recomendación de tu perfil, el {CROP_NAMES[selected.cultivo].toLowerCase()} saca <strong>{Math.round(selReco.puntaje)} de 100</strong> puntos. {selReco.razones?.[0]}
                  </li>
                ) : (
                  <li>Este cultivo no aparece en la recomendación de tu perfil (o todavía no la pides).</li>
                )}
                {diaSel && <li>{dayShort(diaSel.fecha)}: {climaDia.label}, lluvia {diaSel.lluvia_mm} mm.</li>}
              </ul>
            </aside>
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
              <p className="hint"><strong>Toca una parcela en la maqueta</strong> para ver su información. Cambia su cultivo arriba, en «Tus parcelas».</p>
              {offBlock && (
                <p className="hint">
                  {seccion === ALL_SECTIONS
                    ? 'Una parte de tus parcelas queda fuera de la maqueta (4 km). Elige una parcela arriba para verla completa.'
                    : 'Esta parcela mide más de 4 km: la maqueta muestra solo el centro.'}
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
              <p className="hint">
                {cultivoPlan
                  ? 'Es el cultivo del año que elegiste en tu plan. Puedes cambiarlo para comparar.'
                  : 'Solo es para ver cómo se vería. Todavía no es la recomendación.'}
              </p>
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
                Altura: {fmt(terrenoData.altura_centro_m)} m. En la maqueta ({sideLabel} por lado) el terreno sube y baja {terrenoData.desnivel_m} m{' '}
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

import { useEffect, useMemo, useState } from 'react';
import { yearState } from './three/parcelState.js';

const PLAY_MS = 900;
const fmt = (n) => Math.round(n).toLocaleString('es-MX');

// One year shared by the whole page: the map and the 3D view always show the same year.
// clima: the /api/clima data (or null). Returns { years, anio, playing, choose, togglePlay }.
export function useYearPlayer(clima) {
  const years = useMemo(() => clima?.lluvia_pv_anual.map((y) => y.anio) ?? [], [clima]);
  const [anio, setAnio] = useState(null);
  const [playing, setPlaying] = useState(false);

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

  const choose = (value) => {
    setPlaying(false);
    setAnio(value);
  };
  const togglePlay = () => {
    if (playing) return setPlaying(false);
    if (anio === years[years.length - 1]) setAnio(years[0]);
    return setPlaying(true);
  };
  return { years, anio, playing, choose, togglePlay };
}

// Slider + play button + a sentence with the real rain of that year.
// `id` must be unique in the page (there is one control by the map and one by the 3D view).
export function YearControl({ id, year, clima, error }) {
  const { years, anio, playing, choose, togglePlay } = year;
  if (!years.length) {
    return <p className="hint">{error ?? 'Cargando la lluvia de tu parcela…'}</p>;
  }
  const state = yearState(clima, anio);
  return (
    <div className="vista3d-year">
      <label htmlFor={id}>
        Año: <strong>{anio}</strong>
      </label>
      <input
        id={id}
        type="range"
        min={years[0]}
        max={years[years.length - 1]}
        step={1}
        value={anio ?? years[0]}
        onChange={(e) => choose(Number(e.target.value))}
      />
      <button type="button" className="secondary" onClick={togglePlay}>
        {playing ? 'Pausa' : 'Ver los años'}
      </button>
      {state.lluvia_mm !== null && (
        <p className={state.seco ? 'vista3d-dry' : undefined} aria-live="polite">
          En {anio} llovieron <strong>{fmt(state.lluvia_mm)} mm</strong> de junio a septiembre:{' '}
          {state.seco ? 'año seco' : 'año normal o bueno'} (lo normal aquí es {fmt(clima.lluvia_pv_mediana_mm)} mm).
        </p>
      )}
    </div>
  );
}

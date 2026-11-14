import { useCallback, useEffect, useRef, useState } from 'react';
import { getClima, getSuelo, postRecomendar } from '../api/client.js';
import { readSelection, saveSelection } from '../lib/fs.js';
import { CUSTOM_POINT, DEFAULT_POINT } from '../config/examplePoints.js';

// Server and cache work at 2 decimals (about 1 km). Round here so the UI shows the same point.
export const roundCoord = (value) => Math.round(value * 100) / 100;

const settle = (result) => (result.status === 'fulfilled' ? { data: result.value } : { error: result.reason.message });

// Single owner of the app state, shared by the four screens through context/ParcelaContext.jsx:
// the chosen plot, the form answers and the three server results. Each result is null (not asked
// yet), { data } or { error } with a Spanish message. The selection is also saved in localStorage
// (same key as the original design) so a refresh keeps it.
export function useParcela() {
  const saved = readSelection() || {};
  const [point, setPoint] = useState(saved.parcela || null); // { id, nombre, boton, lat, lon }
  const [agua, setAguaState] = useState(saved.agua || 'temporal');
  const [prioridad, setPrioridadState] = useState(saved.prioridad || 'riesgo');
  const [loading, setLoading] = useState(false);
  const [clima, setClima] = useState(null);
  const [suelo, setSuelo] = useState(null);
  const [recomendacion, setRecomendacion] = useState(null);
  const recKey = useRef(null); // "lat,lon,agua,prioridad" of the last /api/recomendar call
  const requestId = useRef(0);

  const loadPointData = useCallback(async (selected) => {
    const id = ++requestId.current;
    setLoading(true);
    const [climaResult, sueloResult] = await Promise.allSettled([getClima(selected.lat, selected.lon), getSuelo(selected.lat, selected.lon)]);
    if (id !== requestId.current) return; // a newer selection won
    setClima(settle(climaResult));
    setSuelo(settle(sueloResult));
    setLoading(false);
  }, []);

  // Called by the map click and by the example buttons. Loads climate and soil right away.
  const selectPoint = useCallback(
    ({ lat, lon, id, nombre, boton }) => {
      const selected = {
        id: id || CUSTOM_POINT.id,
        nombre: nombre || CUSTOM_POINT.nombre,
        boton: boton || nombre || CUSTOM_POINT.boton,
        lat: roundCoord(lat),
        lon: roundCoord(lon),
      };
      setPoint(selected);
      setRecomendacion(null);
      recKey.current = null;
      setClima(null);
      setSuelo(null);
      saveSelection({ parcela: selected });
      loadPointData(selected);
    },
    [loadPointData]
  );

  // Screens 2 and 4 need a plot even if the farmer skipped screen 1: use Celaya and say so.
  const ensurePoint = useCallback(() => {
    if (point) return false;
    selectPoint(DEFAULT_POINT);
    return true;
  }, [point, selectPoint]);

  const setAgua = useCallback((value) => {
    setAguaState(value);
    saveSelection({ agua: value });
  }, []);
  const setPrioridad = useCallback((value) => {
    setPrioridadState(value);
    saveSelection({ prioridad: value });
  }, []);

  // POST /api/recomendar for the current plot and answers. If it fails (today: 501 until the
  // engine lands, unless VITE_USE_MOCK=1) the error is kept and the screens fall back to demo data.
  const recomendar = useCallback(async () => {
    if (!point) return;
    const key = [point.lat, point.lon, agua, prioridad].join(',');
    if (recKey.current === key) return;
    recKey.current = key;
    setRecomendacion(null);
    try {
      const data = await postRecomendar({ lat: point.lat, lon: point.lon, agua, prioridad });
      setRecomendacion({ data });
      if (data.clima) setClima({ data: data.clima });
      if (data.suelo) setSuelo({ data: data.suelo });
    } catch (err) {
      setRecomendacion({ error: err.message });
    }
  }, [point, agua, prioridad]);

  // Restore the saved plot's data on first load.
  useEffect(() => {
    if (saved.parcela) loadPointData(saved.parcela);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { point, agua, prioridad, loading, clima, suelo, recomendacion, selectPoint, ensurePoint, setAgua, setPrioridad, recomendar };
}

import { useState } from 'react';
import { getClima, getSuelo, postRecomendar } from '../api/client.js';

// Server and cache work at 2 decimals (about 1 km). Round here so the UI shows the same point.
export const roundCoord = (value) => Math.round(value * 100) / 100;

const settle = (result) =>
  result.status === 'fulfilled' ? { data: result.value } : { error: result.reason.message };

// Single owner of the screen state: the chosen plot, the form answers and the three server
// results. Each result is null (not asked yet), { data } or { error } with a Spanish message.
export function useParcela() {
  const [point, setPoint] = useState(null); // { lat, lon, nombre? }
  const [agua, setAgua] = useState('temporal');
  const [prioridad, setPrioridad] = useState('riesgo');
  const [loading, setLoading] = useState(false);
  const [clima, setClima] = useState(null);
  const [suelo, setSuelo] = useState(null);
  const [recomendacion, setRecomendacion] = useState(null);

  // Called by the map click and by the example buttons. Loads climate and soil right away so the
  // farmer sees their plot's data before answering the form. The two calls are independent.
  async function selectPoint({ lat, lon, nombre }) {
    const selected = { lat: roundCoord(lat), lon: roundCoord(lon), nombre };
    setPoint(selected);
    setRecomendacion(null);
    setClima(null);
    setSuelo(null);
    setLoading(true);
    const [climaResult, sueloResult] = await Promise.allSettled([
      getClima(selected.lat, selected.lon),
      getSuelo(selected.lat, selected.lon),
    ]);
    setClima(settle(climaResult));
    setSuelo(settle(sueloResult));
    setLoading(false);
  }

  // Called by the form. If the server answers, its clima/suelo blocks replace the ones above
  // (same shape). If it fails (today: 501 until phase 2), the error is shown and the climate
  // and soil cards stay on screen.
  async function recomendar() {
    if (!point) return;
    setLoading(true);
    setRecomendacion(null);
    try {
      const data = await postRecomendar({ lat: point.lat, lon: point.lon, agua, prioridad });
      setRecomendacion({ data });
      if (data.clima) setClima({ data: data.clima });
      if (data.suelo) setSuelo({ data: data.suelo });
    } catch (err) {
      setRecomendacion({ error: err.message });
    } finally {
      setLoading(false);
    }
  }

  return {
    point,
    agua,
    prioridad,
    loading,
    clima,
    suelo,
    recomendacion,
    selectPoint,
    setAgua,
    setPrioridad,
    recomendar,
  };
}

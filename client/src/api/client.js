import { USE_MOCK, mockPostRecomendar } from './mock.js';

// All calls to the server go through here. Errors always carry a message in plain Spanish.
const SERVER_DOWN = 'No pudimos conectar con el servidor. Revisa que esté encendido e intenta de nuevo.';

async function request(path, options) {
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw new Error(SERVER_DOWN);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error ?? SERVER_DOWN);
  }
  return body;
}

const pointQuery = (lat, lon) => new URLSearchParams({ lat: String(lat), lon: String(lon) });

export const getClima = (lat, lon) => request(`/api/clima?${pointQuery(lat, lon)}`);

export const getSuelo = (lat, lon) => request(`/api/suelo?${pointQuery(lat, lon)}`);

// payload: { lat, lon, agua: "temporal" | "riego", prioridad: "ganar" | "suelo" | "agua" | "riesgo" }
export const postRecomendar = (payload) =>
  USE_MOCK
    ? mockPostRecomendar(payload)
    : request('/api/recomendar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

// Próximos 7 días (Open-Meteo). Si no hay internet ni copia guardada responde { disponible: false }.
export const getPronostico = (lat, lon) => request(`/api/pronostico?${pointQuery(lat, lon)}`);

// Asistente (modelo local en el servidor). Cada llamada es independiente: el front manda lo que el agricultor ya contestó en `perfil`.
export const getTemas = () => request('/api/asistente/temas');
export const postAsistente = (payload) =>
  request('/api/asistente', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
// Voz a texto: audio mono a 16 kHz como Float32 (ver AsistenteDock). Responde { texto }.
export const postVoz = (samples) =>
  request('/api/voz', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: samples.buffer.slice(samples.byteOffset, samples.byteOffset + samples.byteLength) });

// Preguntas del perfil (agua, prioridad, hectareas...): el servidor decide cuales hay y que opciones tienen.
export const getPerfilPreguntas = () => request('/api/perfil/preguntas');

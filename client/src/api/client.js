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
  request('/api/recomendar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

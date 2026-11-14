import { useState } from 'react';
import { EXAMPLE_POINTS } from '../config/examplePoints.js';

// Paso 1 del flujo: ¿dónde está tu parcela? Pueblo o dirección (OpenStreetMap), tu ubicación (GPS) o coordenadas.
// Al elegir un lugar, el mapa vuela hasta allí y el agricultor dibuja su parcela.
const COORDS = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

// "Celaya, Guanajuato, México" -> "Celaya, Guanajuato"
const shortName = (full) => full.split(',').map((s) => s.trim()).slice(0, 3).filter((p) => p !== 'México').join(', ');

export default function Ubicacion({ onPick }) {
  const [texto, setTexto] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [aviso, setAviso] = useState('');
  const [sinInternet, setSinInternet] = useState(false);

  const elegir = (lugar) => {
    setResultados([]);
    setAviso('');
    onPick(lugar);
  };

  async function buscar() {
    const q = texto.trim();
    if (!q) return;
    setAviso('');
    setResultados([]);
    setSinInternet(false);

    // Coordenadas: "20.47, -100.81"
    const m = q.match(COORDS);
    if (m) {
      const [lat, lon] = [Number(m[1]), Number(m[2])];
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        setAviso('Esas coordenadas no existen. Escríbelas así: 20.47, -100.81');
        return;
      }
      elegir({ id: 'coordenadas', nombre: `Coordenadas ${lat.toFixed(4)}, ${lon.toFixed(4)}`, boton: 'Coordenadas', lat, lon });
      return;
    }

    setBuscando(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: 'jsonv2', countrycodes: 'mx', limit: '5', 'accept-language': 'es' })}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('busqueda');
      const lista = await res.json();
      if (!lista.length) {
        setAviso('No encontré ese lugar. Prueba con el nombre del pueblo y el estado, por ejemplo «Celaya, Guanajuato».');
      } else if (lista.length === 1) {
        elegir({ id: 'direccion', nombre: shortName(lista[0].display_name), boton: shortName(lista[0].display_name), lat: Number(lista[0].lat), lon: Number(lista[0].lon) });
      } else {
        setResultados(lista.map((r) => ({ id: 'direccion', nombre: shortName(r.display_name), boton: shortName(r.display_name), lat: Number(r.lat), lon: Number(r.lon), detalle: r.display_name })));
      }
    } catch {
      setSinInternet(true);
      setAviso('No pude buscar la dirección (¿sin internet?). Puedes escribir las coordenadas, usar tu ubicación o tocar el mapa.');
    } finally {
      setBuscando(false);
    }
  }

  function usarGps() {
    setAviso('');
    if (!navigator.geolocation) {
      setAviso('Este navegador no puede darme tu ubicación. Escribe el pueblo o las coordenadas.');
      return;
    }
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBuscando(false);
        elegir({ id: 'gps', nombre: 'Mi ubicación', boton: 'Mi ubicación', lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        setBuscando(false);
        setAviso('No pude obtener tu ubicación. Revisa el permiso del navegador o escribe el pueblo.');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  return (
    <div className="fs-ubic">
      <div className="fs-ubic-row">
        <input
          className="fs-ubic-input"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && buscar()}
          placeholder="Pueblo, dirección o coordenadas (ej. Celaya, Guanajuato)"
          aria-label="Dónde está tu parcela"
        />
        <button type="button" className="fs-ubic-btn principal" onClick={buscar} disabled={buscando}>
          <i className="bi bi-search" aria-hidden="true"></i> {buscando ? 'Buscando…' : 'Buscar'}
        </button>
        <button type="button" className="fs-ubic-btn" onClick={usarGps} disabled={buscando}>
          <i className="bi bi-geo-alt-fill" aria-hidden="true"></i> Usar mi ubicación
        </button>
      </div>

      {resultados.length > 0 && (
        <div className="fs-ubic-res" role="listbox" aria-label="Lugares encontrados">
          <p><strong>¿Cuál es?</strong></p>
          {resultados.map((r) => (
            <button key={`${r.lat},${r.lon}`} type="button" className="fs-ubic-btn" onClick={() => elegir(r)}>
              {r.detalle}
            </button>
          ))}
        </div>
      )}

      {aviso && <p className="fs-ubic-aviso" role="alert">{aviso}</p>}
      {sinInternet && (
        <button type="button" className="fs-ubic-link" onClick={() => elegir(EXAMPLE_POINTS[0])}>
          Sin internet: usar {EXAMPLE_POINTS[0].nombre} de ejemplo
        </button>
      )}
      <p className="fs-ubic-nota">Las direcciones se buscan con OpenStreetMap (el texto que escribes se envía allá). Tu ubicación del GPS no sale de tu navegador.</p>
    </div>
  );
}

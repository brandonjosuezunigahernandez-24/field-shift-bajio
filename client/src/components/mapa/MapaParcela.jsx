import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { EXAMPLE_POINTS } from '../../config/examplePoints.js';
import ClickHandler from './ClickHandler.jsx';

// Vite does not resolve Leaflet's default icon paths; point them to the bundled images once.
L.Marker.prototype.options.icon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Bajío: Guanajuato and Querétaro fit at zoom 8 around this center.
const BAJIO_CENTER = [20.6, -100.9];
const BAJIO_ZOOM = 8;

// Props: point ({ lat, lon, nombre? } | null), onSelect({ lat, lon, nombre? }), disabled.
export default function MapaParcela({ point, onSelect, disabled }) {
  return (
    <div className="mapa-wrap">
      <MapContainer center={BAJIO_CENTER} zoom={BAJIO_ZOOM} className="mapa" scrollWheelZoom>
        {/* NASA GIBS layers can be added here later as a second TileLayer (visual only). */}
        <TileLayer
          attribution='&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler point={point} onSelect={onSelect} />
        {point && (
          <Marker position={[point.lat, point.lon]}>
            <Popup>
              {point.nombre ?? 'Tu parcela'}: {point.lat}, {point.lon}
            </Popup>
          </Marker>
        )}
      </MapContainer>

      <div className="button-row">
        <span className="hint">O prueba con un ejemplo:</span>
        {EXAMPLE_POINTS.map((example) => (
          <button key={example.nombre} type="button" disabled={disabled} onClick={() => onSelect(example)}>
            {example.nombre}
          </button>
        ))}
      </div>

      <p className="hint" aria-live="polite">
        {point
          ? `Parcela marcada: ${point.nombre ? `${point.nombre} ` : ''}(${point.lat}, ${point.lon})`
          : 'Haz clic en el mapa sobre tu parcela.'}
      </p>
    </div>
  );
}

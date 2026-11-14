import { useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, ZoomControl } from 'react-leaflet';
import { BAJIO_CENTER, BAJIO_ZOOM, BASE_LAYER, MAP_LAYERS } from '../../config/mapLayers.js';
import ClickHandler from './ClickHandler.jsx';

// Real Leaflet map inside the design's .fs-map box. The HUD, the hint and the bottom bar are the
// design's overlays and stay on top (pointer-events: none). The pin is the design's .fs-pin
// markup rendered as a Leaflet DivIcon, so it moves with the map.
function pinIcon(point) {
  const name = point.boton || point.nombre || 'Tu parcela';
  const html =
    '<div class="fs-pin">' +
    '<span class="fs-pin-ring" aria-hidden="true"></span><span class="fs-pin-ring r2" aria-hidden="true"></span>' +
    '<span class="fs-pin-dot" aria-hidden="true"></span>' +
    `<div class="fs-pin-tip"><b>${escapeHtml(name)}</b><span>Lat ${point.lat.toFixed(2)} · Lon ${point.lon.toFixed(2)}</span></div>` +
    '</div>';
  return L.divIcon({ className: 'fs-pin-icon', html, iconSize: [0, 0], iconAnchor: [0, 0] });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

// Props: point, onSelect({lat, lon}), capa ('sat' | 'ndvi' | 'smap').
export default function MapaParcela({ point, onSelect, capa = 'sat' }) {
  const icon = useMemo(() => (point ? pinIcon(point) : null), [point]);
  const layer = MAP_LAYERS[capa] || MAP_LAYERS.sat;

  return (
    <MapContainer center={BAJIO_CENTER} zoom={BAJIO_ZOOM} zoomControl={false} attributionControl={false} scrollWheelZoom className="fs-leaflet">
      <TileLayer url={BASE_LAYER.url} attribution={BASE_LAYER.attribution} />
      {layer.overlay && (
        <TileLayer
          key={capa}
          url={layer.overlay.url}
          opacity={layer.overlay.opacity}
          maxNativeZoom={layer.overlay.maxNativeZoom}
          attribution="NASA GIBS"
        />
      )}
      <ZoomControl position="topright" />
      <ClickHandler point={point} onSelect={onSelect} />
      {point && icon && <Marker position={[point.lat, point.lon]} icon={icon} interactive={false} />}
    </MapContainer>
  );
}

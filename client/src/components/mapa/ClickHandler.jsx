import { useEffect } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';

// Lives inside <MapContainer>: turns a click into a point and follows the point when it is set
// from outside (example buttons). Rounding to 2 decimals happens in useParcela.selectPoint.
export default function ClickHandler({ point, onSelect }) {
  const map = useMap();

  useMapEvents({
    click(event) {
      onSelect({ lat: event.latlng.lat, lon: event.latlng.lng });
    },
  });

  useEffect(() => {
    if (!point) return;
    const current = map.getCenter();
    const moved = Math.abs(current.lat - point.lat) > 0.005 || Math.abs(current.lng - point.lon) > 0.005;
    if (moved || map.getZoom() < 10) {
      map.flyTo([point.lat, point.lon], Math.max(map.getZoom(), 11), { duration: 0.8 });
    }
  }, [map, point]);

  return null;
}

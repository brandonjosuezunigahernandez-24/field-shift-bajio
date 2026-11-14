import 'maplibre-gl/dist/maplibre-gl.css';
import { Map as MapLibreMap, Marker, NavigationControl, ScaleControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useRef, useState } from 'react';
import { areaHectares, bounds, outlineGeoJSON, polygonCenter } from './polygon.js';

// MapLibre looks for its worker next to its own file; Vite moves that file, so we hand it the
// URL Vite gives the (self-contained) worker. Works in `npm run dev` and in the build.
setWorkerUrl(workerUrl);

const BAJIO = { center: [-100.8, 20.65], zoom: 8 };
const MIN_DRAW_ZOOM = 13; // below this a click is too imprecise to be a corner: zoom in instead
const BIG_PARCEL_HA = 500;
const STREETS_MIN_ZOOM = 14;
const MAX_ZOOM = 19.5; // the satellite imagery has no more detail beyond this

// Two aerial images from Esri, both free and without API key. Only the visible one downloads tiles.
//  - claro:  "World Imagery (Clarity)": older captures chosen to be cloud free and sharp. Each tile
//            goes through 2 redirects (Esri Wayback), so it is ~3x slower: ~1 s vs ~0.4 s per tile.
//  - rapido: the current World Imagery: newest and fastest, but has clouds in parts of the Bajío.
export const IMAGERY = {
  claro: { label: 'Sin nubes', note: 'imagen más clara, carga un poco más lento' },
  rapido: { label: 'Más rápida', note: 'carga más rápido, puede tener nubes' },
};
const IMAGERY_KEY = 'fieldshift.imagen';
const CLARITY_ERRORS_BEFORE_FALLBACK = 6;
const ESRI_CREDIT = 'Imágenes: Esri, Maxar, Earthstar Geographics y la comunidad de usuarios GIS';

function savedImagery() {
  try {
    const value = localStorage.getItem(IMAGERY_KEY);
    return value in IMAGERY ? value : 'claro';
  } catch {
    return 'claro';
  }
}

// Satellite imagery + place names (Esri) and 3D relief (the same AWS Terrain Tiles / NASA SRTM
// heights that /api/terreno uses). All free, no API key. Raster only: no glyphs or sprites to fetch.
const buildStyle = (imagery) => ({
  version: 8,
  sources: {
    claro: {
      type: 'raster',
      tiles: ['https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: ESRI_CREDIT,
    },
    rapido: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: ESRI_CREDIT,
    },
    lugares: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
    },
    // Streets and roads with their names, transparent so the satellite shows underneath.
    calles: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
    },
    relieve: {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 15,
      encoding: 'terrarium',
      attribution: 'Relieve: AWS Terrain Tiles (NASA SRTM)',
    },
  },
  layers: [
    ...Object.keys(IMAGERY).map((id) => ({
      id,
      type: 'raster',
      source: id,
      layout: { visibility: id === imagery ? 'visible' : 'none' },
    })),
    // Only when zoomed in (from neighborhood level), so the far view stays clean and light.
    { id: 'calles', type: 'raster', source: 'calles', minzoom: STREETS_MIN_ZOOM, paint: { 'raster-opacity': 0.85 } },
    { id: 'lugares', type: 'raster', source: 'lugares' },
  ],
  terrain: { source: 'relieve', exaggeration: 1.5 },
});

const EMPTY = { type: 'FeatureCollection', features: [] };

function addParcelLayers(map) {
  map.addSource('parcela', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'parcela-relleno',
    type: 'fill',
    source: 'parcela',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#f2c94c', 'fill-opacity': 0.25 },
  });
  map.addLayer({
    id: 'parcela-borde',
    type: 'line',
    source: 'parcela',
    filter: ['!=', ['geometry-type'], 'Point'],
    paint: { 'line-color': '#f2c94c', 'line-width': 3 },
  });
}

// Corners are numbered HTML markers (1, 2, 3...) so the farmer sees the order they were placed.
// HTML instead of a map text layer: no font files to download, and there are only a few corners.
function cornerMarker(index) {
  const el = document.createElement('div');
  el.className = index === 0 ? 'corner-marker corner-marker-first' : 'corner-marker';
  el.textContent = String(index + 1);
  el.setAttribute('aria-hidden', 'true');
  return new Marker({ element: el });
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const fmtHa = (ha) => ha.toLocaleString('es-MX', { maximumFractionDigits: ha < 10 ? 1 : 0 });

// Props:
//   point     the plot App is showing ({ nombre, lat, lon, contorno? }) or null
//   onParcel  ({ nombre, lat, lon, contorno, hectareas }) => void, when the farmer finishes drawing
export default function ParcelMap({ point, onParcel }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [corners, setCorners] = useState([]);
  const [drawing, setDrawing] = useState(true);
  const [hint, setHint] = useState(null);
  const [imagery, setImagery] = useState(savedImagery);
  const [imageryNotice, setImageryNotice] = useState(null);

  // Latest values for the map handlers, which are registered once.
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const imageryRef = useRef(imagery);
  imageryRef.current = imagery;

  // Create the map once. StrictMode mounts twice in development: cleanup removes the first one.
  useEffect(() => {
    let map;
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: buildStyle(imageryRef.current),
        ...BAJIO,
        maxPitch: 70,
        maxZoom: MAX_ZOOM,
        doubleClickZoom: false, // a double tap would add two corners
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        attributionControl: { compact: true },
      });
    } catch (err) {
      console.error('Mapa:', err);
      setFailed(true);
      return undefined;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.on('load', () => {
      addParcelLayers(map);
      setReady(true);
    });
    // If the cloud-free imagery keeps failing (slow or blocked network), switch to the fast one
    // by itself, so the farmer never stares at an empty map.
    let clarityErrors = 0;
    map.on('error', (event) => {
      if (event.sourceId !== 'claro' || imageryRef.current !== 'claro') return;
      clarityErrors += 1;
      if (clarityErrors === CLARITY_ERRORS_BEFORE_FALLBACK) {
        setImagery('rapido');
        setImageryNotice('La imagen sin nubes no cargó bien con esta conexión. Cambiamos a la imagen más rápida.');
      }
    });
    map.on('click', (event) => {
      if (!drawingRef.current) return;
      // A tap on a numbered corner must not add another corner on top of it.
      if (event.originalEvent?.target?.closest?.('.corner-marker')) return;
      if (map.getZoom() < MIN_DRAW_ZOOM) {
        setHint('Te acercamos para que marques las esquinas con precisión.');
        map.flyTo({ center: event.lngLat, zoom: 15.5, duration: reducedMotion() ? 0 : 1500 });
        return;
      }
      setHint(null);
      setCorners((current) => [...current, [event.lngLat.lng, event.lngLat.lat]]);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Paint the outline and the numbered corners whenever they change.
  useEffect(() => {
    if (!ready) return undefined;
    const map = mapRef.current;
    map.getSource('parcela').setData(outlineGeoJSON(corners));
    const markers = corners.map((corner, i) => cornerMarker(i).setLngLat(corner).addTo(map));
    return () => markers.forEach((m) => m.remove());
  }, [ready, corners]);

  useEffect(() => {
    if (ready) mapRef.current.getCanvas().style.cursor = drawing ? 'crosshair' : '';
  }, [ready, drawing]);

  // Show only the chosen imagery (a hidden layer downloads nothing) and remember the choice.
  useEffect(() => {
    if (ready) {
      for (const id of Object.keys(IMAGERY)) {
        mapRef.current.setLayoutProperty(id, 'visibility', id === imagery ? 'visible' : 'none');
      }
    }
    try {
      localStorage.setItem(IMAGERY_KEY, imagery);
    } catch {
      // private mode: the choice just isn't remembered
    }
  }, [ready, imagery]);

  // Follow the plot chosen anywhere in the page (this map, the example button or the 3D globe).
  // A drawn parcel is framed tilted, so the relief shows; a bare point gets a closer look.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !point) return;
    const duration = reducedMotion() ? 0 : 1800;
    if (point.contorno?.length >= 3) {
      setCorners(point.contorno);
      setDrawing(false);
      map.fitBounds(bounds(point.contorno), { padding: 60, pitch: 40, maxZoom: 17.5, duration });
    } else {
      setCorners([]);
      setDrawing(true);
      map.flyTo({ center: [point.lon, point.lat], zoom: 15, pitch: 30, duration });
    }
  }, [ready, point]);

  const area = areaHectares(corners);

  const finish = () => {
    const { lat, lon } = polygonCenter(corners);
    const hectareas = Math.round(area * 10) / 10;
    onParcel({ nombre: `Tu parcela (${fmtHa(area)} ha)`, lat, lon, contorno: corners, hectareas });
  };

  const restart = () => {
    setCorners([]);
    setDrawing(true);
    setHint(null);
  };

  if (failed) {
    return (
      <p className="error" role="alert">
        No pudimos abrir el mapa en este navegador. Usa el botón de ejemplo o el globo 3D para elegir tu parcela.
      </p>
    );
  }

  return (
    <div className="parcel-map">
      <div ref={containerRef} className="parcel-map-canvas" />
      <fieldset className="imagery-switch">
        <legend>Imagen del mapa</legend>
        {Object.entries(IMAGERY).map(([id, { label, note }]) => (
          <label key={id}>
            <input
              type="radio"
              name="imagen-mapa"
              value={id}
              checked={imagery === id}
              onChange={() => {
                setImagery(id);
                setImageryNotice(null);
              }}
            />
            <span>
              <strong>{label}</strong> <span className="imagery-note">({note})</span>
            </span>
          </label>
        ))}
      </fieldset>
      {imageryNotice && (
        <p className="hint" role="status">
          {imageryNotice}
        </p>
      )}
      <div className="parcel-map-tools">
        {drawing ? (
          <>
            <p className="hint" aria-live="polite">
              {hint ??
                (corners.length === 0
                  ? 'Busca tu parcela y toca sus esquinas en orden, siguiendo la orilla.'
                  : corners.length < 3
                    ? `Llevas ${corners.length} ${corners.length === 1 ? 'esquina' : 'esquinas'}. Faltan ${3 - corners.length} como mínimo.`
                    : `Llevas ${corners.length} esquinas. Tu parcela mide ${fmtHa(area)} hectáreas.`)}
            </p>
            {area > BIG_PARCEL_HA && (
              <p className="error">Es muy grande para una parcela. Revisa que las esquinas estén bien.</p>
            )}
            <div className="button-row">
              <button type="button" disabled={corners.length < 3} onClick={finish}>
                Usar esta parcela
              </button>
              <button type="button" className="secondary" disabled={corners.length === 0} onClick={() => setCorners((c) => c.slice(0, -1))}>
                Deshacer esquina
              </button>
              <button type="button" className="secondary" disabled={corners.length === 0} onClick={restart}>
                Borrar
              </button>
            </div>
          </>
        ) : (
          <div className="button-row">
            <p className="hint">Parcela lista: {fmtHa(area)} hectáreas.</p>
            <button type="button" className="secondary" onClick={restart}>
              Dibujar otra parcela
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

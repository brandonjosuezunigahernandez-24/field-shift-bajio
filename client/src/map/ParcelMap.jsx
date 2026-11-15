import 'maplibre-gl/dist/maplibre-gl.css';
import {
  GeolocateControl,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useRef, useState } from 'react';
import { NASA_LAYERS } from '../config/mapLayers.js';
import { CROP_COLORS, CROP_IDS, CROP_NAMES } from '../crops.js';
import { soilColors, yearState } from '../three/parcelState.js';
import { WEATHER_OPTIONS, weatherScene } from '../weather.js';
import { YearControl } from '../year.jsx';
import { allCorners, parcelColor, parcelsGeoJSON, raisedParcelsGeoJSON } from './parcels.js';
import { createCropLayer } from './cropLayer.js';
import FarmSummary from './FarmSummary.jsx';
import {
  areaHectares,
  bounds,
  checkGpsCorner,
  outlineGeoJSON,
  perimeterMeters,
  polygonCenter,
  polygonsOverlap,
  sideLengths,
} from './polygon.js';

// The browser only gives the location on https (or localhost) and with the farmer's permission.
const CAN_LOCATE = typeof navigator !== 'undefined' && 'geolocation' in navigator && window.isSecureContext;

const GPS_STALE_MS = 30000;

const GPS_ERRORS = {
  1: 'No diste permiso para usar tu ubicación. Puedes activarlo en el candado junto a la dirección de la página.',
  2: 'No pudimos saber dónde estás. Revisa que el GPS (ubicación) del teléfono esté encendido.',
  3: 'El GPS tardó demasiado. Sal a cielo abierto e intenta otra vez.',
};

// MapLibre looks for its worker next to its own file; Vite moves that file, so we hand it the
// URL Vite gives the (self-contained) worker. Works in `npm run dev` and in the build.
setWorkerUrl(workerUrl);

const BAJIO = { center: [-100.8, 20.65], zoom: 8 };
const MIN_DRAW_ZOOM = 13; // below this a click is too imprecise to be a corner: zoom in instead
const BIG_PARCEL_HA = 500;
const STREETS_MIN_ZOOM = 14;
const MAX_ZOOM = 19; // closer than this the (enlarged) imagery is just blur

// Two aerial images from Esri, both free and without API key. Only the visible one downloads tiles.
//  - claro:  "World Imagery (Clarity)": older captures chosen to be cloud free and sharp. Each tile
//            goes through 2 redirects (Esri Wayback), so it is ~3x slower: ~1 s vs ~0.4 s per tile.
//  - rapido: the current World Imagery: newest and fastest, but has clouds in parts of the Bajío.
export const IMAGERY = {
  claro: { label: 'Sin nubes', note: 'imagen más clara, carga un poco más lento' },
  rapido: { label: 'Más rápida', note: 'carga más rápido, puede tener nubes' },
};
const CLARITY_ERRORS_BEFORE_FALLBACK = 6;
const ESRI_CREDIT = 'Imágenes: Esri, Maxar, Earthstar Geographics y la comunidad de usuarios GIS';

// How the map is looked at.
//  - aerea:   straight from above, no tilt and no 3D relief. Best for drawing: what you tap is
//             exactly where the corner goes. Tilting/rotating is switched off.
//  - relieve: tilted, with the 3D relief (AWS Terrain Tiles / NASA SRTM). Best to look at the land.
export const VIEWS = {
  aerea: { label: 'Aérea', note: 'desde arriba, para dibujar' },
  relieve: { label: 'Relieve 3D', note: 'inclinada, para ver lomas y bajadas' },
};
const VIEW_PITCH = { aerea: 0, relieve: 55 };
const RISE_MS = 1300; // a saved parcel comes up out of the ground in this time
const TERRAIN = { source: 'relieve', exaggeration: 1.5 };

function saved(key, options, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value in options ? value : fallback;
  } catch {
    return fallback;
  }
}

function remember(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode: the choice just isn't remembered
  }
}

// Satellite imagery + place names and streets (Esri) and 3D relief (the same heights that
// /api/terreno uses). All free, no API key. Raster only: no glyphs or sprites to fetch.
const buildStyle = (imagery, view) => ({
  version: 8,
  sources: {
    claro: {
      type: 'raster',
      tiles: ['https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      // Clarity has no tiles past z17 in the Bajío (404). Above it MapLibre enlarges the z17 tile.
      maxzoom: 17,
      attribution: ESRI_CREDIT,
    },
    rapido: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      // At z19 rural Bajío gets Esri's gray "Map data not yet available" tile: stop at z18.
      maxzoom: 18,
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
    // NASA GIBS pictures (true color, greenness, soil moisture), hidden until the farmer picks one.
    ...Object.fromEntries(
      Object.entries(NASA_LAYERS).map(([id, { url, maxzoom }]) => [
        `nasa-${id}`,
        { type: 'raster', tiles: [url], tileSize: 256, maxzoom, attribution: 'NASA GIBS' },
      ])
    ),
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
    ...Object.entries(NASA_LAYERS).map(([id, { opacity }]) => ({
      id: `nasa-${id}`,
      type: 'raster',
      source: `nasa-${id}`,
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': opacity },
    })),
    // Only when zoomed in (from neighborhood level), so the far view stays clean and light.
    { id: 'calles', type: 'raster', source: 'calles', minzoom: STREETS_MIN_ZOOM, paint: { 'raster-opacity': 0.85 } },
    { id: 'lugares', type: 'raster', source: 'lugares' },
  ],
  // The relief only downloads its tiles in the 3D view.
  ...(view === 'relieve' ? { terrain: TERRAIN } : {}),
});

const EMPTY = { type: 'FeatureCollection', features: [] };

function addParcelLayers(map) {
  // Finished parcels, each in its own color.
  map.addSource('parcelas', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'parcelas-relleno',
    type: 'fill',
    source: 'parcelas',
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.28 },
  });
  map.addLayer({
    id: 'parcelas-borde',
    type: 'line',
    source: 'parcelas',
    paint: { 'line-color': ['get', 'color'], 'line-width': 3 },
  });
  // Saved parcels raised over the satellite image: a block of soil (sides in the SoilGrids color)
  // with the crop on top. Its height comes from each feature (see raisedParcelsGeoJSON).
  map.addSource('parcelas-3d', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'parcelas-tierra',
    type: 'fill-extrusion',
    source: 'parcelas-3d',
    paint: {
      'fill-extrusion-color': ['get', 'tierra'],
      'fill-extrusion-base': 0,
      'fill-extrusion-height': ['get', 'suelo_m'],
      'fill-extrusion-opacity': 0.95,
    },
  });
  map.addLayer({
    id: 'parcelas-cultivo',
    type: 'fill-extrusion',
    source: 'parcelas-3d',
    paint: {
      'fill-extrusion-color': ['get', 'cultivo'],
      'fill-extrusion-base': ['get', 'suelo_m'],
      'fill-extrusion-height': ['get', 'tope_m'],
      'fill-extrusion-opacity': 0.95,
    },
  });
  // The parcel being drawn: white and dashed, so it reads as "not finished yet".
  map.addSource('parcela', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'parcela-relleno',
    type: 'fill',
    source: 'parcela',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.18 },
  });
  map.addLayer({
    id: 'parcela-borde',
    type: 'line',
    source: 'parcela',
    filter: ['!=', ['geometry-type'], 'Point'],
    paint: { 'line-color': '#ffffff', 'line-width': 3, 'line-dasharray': [2, 1] },
  });
}

// Puts the map in the chosen view. Aerial switches off tilt and rotation so a tap is a tap.
function applyView(map, view, { animate = true } = {}) {
  const aerial = view === 'aerea';
  map.setTerrain(aerial ? null : TERRAIN);
  for (const handler of [map.dragRotate, map.touchPitch]) {
    if (aerial) handler.disable();
    else handler.enable();
  }
  if (aerial) map.touchZoomRotate.disableRotation();
  else map.touchZoomRotate.enableRotation();
  map.easeTo({ pitch: VIEW_PITCH[view], ...(aerial ? { bearing: 0 } : {}), duration: animate && !reducedMotion() ? 900 : 0 });
}

// Corners are numbered HTML markers (1, 2, 3...) so the farmer sees the order they were placed.
// HTML instead of a map text layer: no font files to download, and there are only a few corners.
// They can be dragged to fix a corner without drawing again.
function cornerMarker(index) {
  const el = document.createElement('div');
  el.className = index === 0 ? 'corner-marker corner-marker-first' : 'corner-marker';
  el.textContent = String(index + 1);
  el.title = 'Arrastra para mover esta esquina';
  el.setAttribute('aria-hidden', 'true');
  return new Marker({ element: el, draggable: true });
}

// "124 m" on the middle of each side while drawing; the closing side (back to corner 1) dashed.
const fmtM = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString('es-MX', { maximumFractionDigits: 2 })} km` : `${Math.round(m)} m`);
function sideTag({ m, mid, closing }) {
  const el = document.createElement('div');
  el.className = closing ? 'side-tag side-tag-closing' : 'side-tag';
  el.textContent = fmtM(m);
  el.setAttribute('aria-hidden', 'true');
  return new Marker({ element: el }).setLngLat(mid);
}

// "1 · Trigo" tag in the middle of each finished parcel, in the parcel's color.
function parcelTag(parcela, index) {
  const el = document.createElement('div');
  el.className = 'parcel-tag';
  el.style.setProperty('--parcel-color', parcelColor(parcela.id));
  el.textContent = `${index + 1} · ${CROP_NAMES[parcela.cultivo]}`;
  el.setAttribute('aria-hidden', 'true');
  const { lat, lon } = polygonCenter(parcela.contorno);
  return new Marker({ element: el }).setLngLat([lon, lat]);
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const fmtHa = (ha) => ha.toLocaleString('es-MX', { maximumFractionDigits: ha < 10 ? 1 : 0 });

// Props:
//   point            the place App is showing ({ nombre, lat, lon }) or null
//   parcelas         the drawn parcels [{ id, contorno, hectareas, cultivo }] (App owns them)
//   onAddParcela     (contorno) => void, when the farmer finishes drawing one
//   onRemoveParcela  (id) => void
//   onSetCultivo     (id, cultivo) => void
//   suelo            /api/suelo data (or null): colors the sides of the raised parcels
//   clima, year      /api/clima data and the page-wide year (useYearPlayer): the parcels follow it
//   onUpdateParcela  (id, contorno) => void, when a saved parcel is corrected
export default function ParcelMap({
  point,
  parcelas,
  suelo = null,
  clima = null,
  year = null,
  onAddParcela,
  onUpdateParcela,
  onRemoveParcela,
  onSetCultivo,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [corners, setCorners] = useState([]);
  const [drawing, setDrawing] = useState(parcelas.length === 0);
  const [hint, setHint] = useState(null);
  const [imagery, setImagery] = useState(() => saved('fieldshift.imagen2', IMAGERY, 'rapido'));
  const [imageryNotice, setImageryNotice] = useState(null);
  const [nasa, setNasa] = useState(null); // id of the NASA_LAYERS picture shown over the imagery, or null
  const [view, setView] = useState(() => saved('fieldshift.vista', VIEWS, 'aerea'));
  const [editingId, setEditingId] = useState(null); // a saved parcel being corrected, or null
  // Plants + weather standing on the satellite map, and whether the weather moves.
  const cropLayerRef = useRef(null);
  const weatherIds = Object.fromEntries(WEATHER_OPTIONS.map((o) => [o.id, true]));
  const [weatherChoice, setWeatherChoice] = useState(() => saved('fieldshift.clima', weatherIds, 'auto'));
  const [onScreen, setOnScreen] = useState(true);
  const shown = editingId === null ? parcelas : parcelas.filter((p) => p.id !== editingId);
  const yearNow = yearState(clima, year?.anio ?? null);
  // Weather drawn over the map: from the real year ("auto") or picked by hand (marked as example).
  const weather = weatherScene(weatherChoice, yearNow);
  const weatherOption = WEATHER_OPTIONS.find((o) => o.id === weather.id) ?? WEATHER_OPTIONS[0];
  // Crops follow the real year, unless a hand-picked scene brings its own look (e.g. drought).
  const plantLook = weather.plant
    ? { ...weather.plant, tint: [1, 0.8 + 0.2 * weather.plant.wet, 0.45 + 0.55 * weather.plant.wet] }
    : yearNow;
  const animateWeather = weather.id !== 'apagado' && onScreen && !reducedMotion();

  // Latest values for the map handlers and effects that must not re-run on every change.
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const imageryRef = useRef(imagery);
  imageryRef.current = imagery;
  const viewRef = useRef(view);
  viewRef.current = view;
  const parcelasRef = useRef(parcelas);
  parcelasRef.current = parcelas;

  // GPS: last position from the browser ({ lon, lat, accuracy, at }), and whether it is followed.
  const geolocateRef = useRef(null);
  const [gps, setGps] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [tracking, setTracking] = useState(false);

  // Create the map once. StrictMode mounts twice in development: cleanup removes the first one.
  useEffect(() => {
    let map;
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: buildStyle(imageryRef.current, viewRef.current),
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
    if (CAN_LOCATE) {
      // Blue dot + accuracy circle; keeps following the farmer while they walk the edge.
      const geolocate = new GeolocateControl({
        positionOptions: { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
        trackUserLocation: true,
        showAccuracyCircle: true,
        fitBoundsOptions: { maxZoom: 17.5 },
      });
      map.addControl(geolocate, 'top-right');
      geolocate.on('geolocate', (event) => {
        setGpsError(null);
        setGps({
          lon: event.coords.longitude,
          lat: event.coords.latitude,
          accuracy: event.coords.accuracy,
          at: Date.now(),
        });
      });
      geolocate.on('error', (event) => setGpsError(GPS_ERRORS[event.code] ?? GPS_ERRORS[2]));
      geolocate.on('trackuserlocationstart', () => setTracking(true));
      geolocate.on('trackuserlocationend', () => setTracking(false));
      geolocateRef.current = geolocate;
    }
    // When relief tiles arrive (or the view changes), re-level the raised parcels if needed.
    map.on('idle', () => paintRaisedRef.current?.({ onlyIfGroundChanged: true }));
    map.on('load', () => {
      addParcelLayers(map);
      // Under the outline being drawn, so the drawing always shows on top of the plants.
      const crops = createCropLayer();
      map.addLayer(crops.layer, 'parcela-relleno');
      cropLayerRef.current = crops;
      applyView(map, viewRef.current, { animate: false });
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
      // A tap on a corner number or a parcel tag must not add a corner on top of it.
      if (event.originalEvent?.target?.closest?.('.corner-marker, .parcel-tag, .side-tag')) return;
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
      geolocateRef.current = null;
      setReady(false);
    };
  }, []);

  // The parcel being drawn: dashed outline and numbered corners.
  useEffect(() => {
    if (!ready) return undefined;
    const map = mapRef.current;
    map.getSource('parcela').setData(outlineGeoJSON(corners));
    const sides = sideLengths(corners).map((side) => sideTag(side).addTo(map));
    const live = corners.map((c) => [...c]);
    const redrawLive = () => {
      map.getSource('parcela').setData(outlineGeoJSON(live));
      sideLengths(live).forEach((side, i) => {
        sides[i]?.setLngLat(side.mid);
        if (sides[i]) sides[i].getElement().textContent = fmtM(side.m);
      });
    };
    const handles = corners.map((corner, i) => {
      const marker = cornerMarker(i).setLngLat(corner).addTo(map);
      marker.on('drag', () => {
        const { lng, lat } = marker.getLngLat();
        live[i] = [lng, lat];
        redrawLive();
      });
      marker.on('dragend', () => setCorners(live.map((c) => [...c])));
      return marker;
    });
    return () => [...sides, ...handles].forEach((m) => m.remove());
  }, [ready, corners]);

  // Raised parcels. A parcel seen for the first time rises from the ground (one short animation,
  // only that parcel); crop or soil changes just repaint. Few polygons: setData per frame is cheap.
  const riseRef = useRef(new Map()); // parcel id -> 0..1
  const paintRaisedRef = useRef(null); // latest painter, also called when the relief finishes loading
  const soilRgb = suelo && !suelo.sin_datos ? soilColors(suelo).top : null;
  const soilKey = soilRgb ? soilRgb.join(',') : 'none';
  useEffect(() => {
    if (!ready) return undefined;
    const map = mapRef.current;
    const source = map.getSource('parcelas-3d');
    const rise = riseRef.current;
    // Ground height at each parcel's center, only with the 3D relief on (see raisedParcelsGeoJSON).
    const groundAt = () => {
      if (!map.getTerrain()) return null;
      return new Map(
        parcelas.map((p) => {
          const { lat, lon } = polygonCenter(p.contorno);
          return [p.id, map.queryTerrainElevation([lon, lat])];
        })
      );
    };
    let lastGround = '';
    const paint = ({ onlyIfGroundChanged = false } = {}) => {
      const ground = groundAt();
      const key = ground ? [...ground.values()].map((g) => (g ?? 'x').toString()).join(',') : 'plano';
      if (onlyIfGroundChanged && key === lastGround) return; // nothing new: avoid a repaint loop
      lastGround = key;
      const raised = raisedParcelsGeoJSON(shown, rise, soilRgb, CROP_COLORS, ground, plantLook);
      source.setData(raised);
      // Plants stand on the top of each raised block (ground height + block, as the map draws it).
      cropLayerRef.current?.update({
        parcels: shown.map((p, i) => ({
          id: p.id,
          cultivo: p.cultivo,
          contorno: p.contorno,
          base: (ground?.get(p.id) ?? 0) + raised.features[i].properties.tope_m,
        })),
        plants: plantLook,
        weather: weather.id === 'apagado' ? null : weather,
        animate: animateWeather,
      });
    };
    paintRaisedRef.current = paint;
    const fresh = parcelas.filter((p) => !rise.has(p.id)).map((p) => p.id);
    for (const id of [...rise.keys()]) if (!parcelas.some((p) => p.id === id)) rise.delete(id);
    if (!fresh.length || reducedMotion()) {
      fresh.forEach((id) => rise.set(id, 1));
      paint();
      return undefined;
    }
    fresh.forEach((id) => rise.set(id, 0));
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / RISE_MS);
      const k = 1 - (1 - t) ** 3; // ease out: fast start, soft landing
      fresh.forEach((id) => rise.set(id, k));
      paint();
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(frame);
      fresh.forEach((id) => rise.set(id, 1)); // never leave a parcel half way up
    };
  }, [ready, parcelas, soilKey, editingId, yearNow.anio, yearNow.wet, weather.id, weather.example, animateWeather]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pause the weather animation while the map is scrolled out of view (no wasted battery).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.05 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Finished parcels: colored outlines and a "number · crop" tag on each.
  useEffect(() => {
    if (!ready) return undefined;
    const map = mapRef.current;
    map.getSource('parcelas').setData(parcelsGeoJSON(shown));
    const tags = shown.map((p) => parcelTag(p, parcelas.indexOf(p)).addTo(map));
    return () => tags.forEach((t) => t.remove());
  }, [ready, parcelas, editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ready) mapRef.current.getCanvas().style.cursor = drawing ? 'crosshair' : '';
  }, [ready, drawing]);

  // With every parcel deleted, go back to drawing.
  useEffect(() => {
    if (parcelas.length === 0) setDrawing(true);
  }, [parcelas.length]);

  // Show only the chosen imagery (a hidden layer downloads nothing) and remember the choice.
  useEffect(() => {
    if (ready) {
      for (const id of Object.keys(IMAGERY)) {
        mapRef.current.setLayoutProperty(id, 'visibility', id === imagery ? 'visible' : 'none');
      }
    }
    remember('fieldshift.imagen2', imagery);
  }, [ready, imagery]);

  // Same for the NASA picture: only the chosen one is visible.
  useEffect(() => {
    if (!ready) return;
    for (const id of Object.keys(NASA_LAYERS)) {
      mapRef.current.setLayoutProperty(`nasa-${id}`, 'visibility', id === nasa ? 'visible' : 'none');
    }
  }, [ready, nasa]);

  const changeView = (next) => {
    setView(next);
    remember('fieldshift.vista', next);
    if (ready) applyView(mapRef.current, next);
  };

  // Follow the place chosen anywhere in the page. With drawn parcels, frame all of them;
  // with a bare point (example button, 3D globe), fly to it and start drawing there.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !point) return;
    const duration = reducedMotion() ? 0 : 1800;
    const pitch = VIEW_PITCH[viewRef.current];
    const farm = parcelasRef.current;
    if (farm.length) {
      map.fitBounds(bounds(allCorners(farm)), { padding: 60, pitch, maxZoom: 17.5, duration });
    } else {
      setCorners([]);
      setDrawing(true);
      map.flyTo({ center: [point.lon, point.lat], zoom: 16, pitch, duration }); // a esta distancia ya se puede dibujar la parcela
    }
  }, [ready, point]);

  const area = areaHectares(corners);
  // Parcels the one being drawn lands on top of (only a warning: it may be on purpose).
  const overlapping =
    corners.length >= 3
      ? parcelas.map((p, i) => (p.id !== editingId && polygonsOverlap(corners, p.contorno) ? i + 1 : null)).filter(Boolean)
      : [];

  // Saving tilts the map so the farmer sees the new parcel rise as a block of land.
  const finish = () => {
    if (editingId !== null) onUpdateParcela(editingId, corners);
    else onAddParcela(corners);
    setEditingId(null);
    setCorners([]);
    setDrawing(false);
    setHint(null);
    if (viewRef.current === 'aerea') changeView('relieve');
  };

  // "Dibujar otra parcela": back to the aerial view, so the next outline is drawn precisely.
  const startNewParcel = () => {
    setEditingId(null);
    setCorners([]);
    setDrawing(true);
    setHint(null);
    changeView('aerea');
  };

  const cancelDrawing = () => {
    setEditingId(null);
    setCorners([]);
    setDrawing(false);
    setHint(null);
  };

  // "Corregir": the saved corners come back as draggable numbers, seen from above.
  const startEditing = (parcela) => {
    setEditingId(parcela.id);
    setCorners(parcela.contorno.map((c) => [...c]));
    setDrawing(true);
    setHint(null);
    changeView('aerea');
    mapRef.current?.fitBounds(bounds(parcela.contorno), { padding: 80, pitch: 0, bearing: 0, maxZoom: 18, duration: reducedMotion() ? 0 : 900 });
  };
  const editingNumber = editingId === null ? null : parcelas.findIndex((p) => p.id === editingId) + 1;

  // "Walk the edge": the farmer stands on each corner and adds it with the GPS.
  const gpsCheck = checkGpsCorner(gps, corners);
  const addGpsCorner = () => {
    if (!gps || Date.now() - gps.at > GPS_STALE_MS) {
      setGpsError('Tu ubicación ya no está al día. Toca «Usar mi ubicación» otra vez.');
      return;
    }
    if (!gpsCheck.ok) return;
    setHint(null);
    setCorners((current) => [...current, [gps.lon, gps.lat]]);
  };

  if (failed) {
    return (
      <p className="error" role="alert">
        No pudimos abrir el mapa en este navegador. Usa el botón de ejemplo o el globo 3D para elegir tu parcela.
      </p>
    );
  }

  const number = parcelas.length + 1;

  return (
    <div className="parcel-map">
      <div className="parcel-map-frame">
        <div ref={containerRef} className="parcel-map-canvas" />
        {parcelas.length > 0 && weather.id !== 'apagado' && (
          <div className={`weather-overlay wx-${weather.id}`} aria-hidden="true">
            <span className="wx-sun" />
            <span className="wx-flash" />
          </div>
        )}
        {parcelas.length > 0 && weather.example && (
          <p className="map-year-badge map-year-example" aria-hidden="true">
            {weatherOption.icon} {weather.label} · vista de ejemplo
          </p>
        )}
        {parcelas.length > 0 && !weather.example && yearNow.lluvia_mm !== null && (
          <p className={yearNow.seco ? 'map-year-badge map-year-dry' : 'map-year-badge'} aria-hidden="true">
            {year.anio} · {weather.id !== 'apagado' ? `${weatherOption.icon} ${weather.label}` : yearNow.seco ? 'año seco' : 'año bueno'} ·{' '}
            {Math.round(yearNow.lluvia_mm)} mm
          </p>
        )}
      </div>

      <div className="map-options">
        <fieldset className="option-switch">
          <legend>Tipo de vista</legend>
          {Object.entries(VIEWS).map(([id, { label, note }]) => (
            <label key={id}>
              <input type="radio" name="vista-mapa" value={id} checked={view === id} onChange={() => changeView(id)} />
              <span>
                <strong>{label}</strong> <span className="option-note">({note})</span>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset className="option-switch">
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
                <strong>{label}</strong> <span className="option-note">({note})</span>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset className="option-switch">
          <legend>Datos de la NASA sobre el mapa</legend>
          <label>
            <input type="radio" name="nasa-mapa" checked={nasa === null} onChange={() => setNasa(null)} />
            <span>
              <strong>Ninguno</strong>
            </span>
          </label>
          {Object.entries(NASA_LAYERS).map(([id, { label, note }]) => (
            <label key={id}>
              <input type="radio" name="nasa-mapa" value={id} checked={nasa === id} onChange={() => setNasa(id)} />
              <span>
                <strong>{label}</strong> <span className="option-note">({note})</span>
              </span>
            </label>
          ))}
          {nasa && (
            <p className="hint">Imagen de NASA GIBS del 12 de agosto de 2024. Muestra la región, no el detalle de tu parcela: aléjate en el mapa para verla bien.</p>
          )}
        </fieldset>
        <fieldset className="weather-picker">
          <legend>Clima en el mapa</legend>
          {WEATHER_OPTIONS.map((o) => (
            <label key={o.id} className={weatherChoice === o.id ? 'chip chip-on' : 'chip'}>
              <input
                type="radio"
                name="clima-mapa"
                value={o.id}
                checked={weatherChoice === o.id}
                onChange={() => {
                  setWeatherChoice(o.id);
                  remember('fieldshift.clima', o.id);
                }}
              />
              <span aria-hidden="true">{o.icon}</span> {o.label}
            </label>
          ))}
          <p className="hint">
            {weatherChoice === 'auto'
              ? 'Según el año: el clima sale de la lluvia real de junio a septiembre de ese año (NASA POWER).'
              : weatherChoice === 'apagado'
                ? 'Sin animaciones de clima sobre el mapa.'
                : 'Vista de ejemplo para explorar: no son datos de tu parcela.'}
          </p>
        </fieldset>
        {imageryNotice && (
          <p className="hint" role="status">
            {imageryNotice}
          </p>
        )}
      </div>

      <FarmSummary parcelas={parcelas} />

      {parcelas.length > 0 && year && (
        <div className="map-year">
          <p className="map-year-title">¿Cómo le fue a tu terreno cada año? Mueve el año y mira el color de tus cultivos.</p>
          <YearControl id="anio-mapa" year={year} clima={clima} />
        </div>
      )}

      {parcelas.length > 0 && (
        <div className="parcel-list">
          <h3>Tus parcelas</h3>
          <ul>
            {parcelas.map((p, i) => (
              <li key={p.id} style={{ '--parcel-color': parcelColor(p.id) }}>
                <span className="parcel-swatch" aria-hidden="true" />
                <span className="parcel-name">
                  Parcela {i + 1}{' '}
                  <span className="option-note">
                    ({fmtHa(p.hectareas)} ha · orilla {fmtM(perimeterMeters(p.contorno))})
                  </span>
                </span>
                <label>
                  <span className="visually-hidden">Cultivo de la parcela {i + 1}</span>
                  <select value={p.cultivo} onChange={(e) => onSetCultivo(p.id, e.target.value)}>
                    {CROP_IDS.map((id) => (
                      <option key={id} value={id}>
                        {CROP_NAMES[id]}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="secondary small" onClick={() => startEditing(p)} disabled={editingId === p.id}>
                  Corregir
                </button>
                <button
                  type="button"
                  className="secondary small"
                  onClick={() => {
                    if (editingId === p.id) cancelDrawing();
                    onRemoveParcela(p.id);
                  }}
                >
                  Borrar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="parcel-map-tools">
        {drawing ? (
          <>
            <p className="hint" aria-live="polite">
              <strong>
                {editingNumber !== null
                  ? `Corrigiendo la parcela ${editingNumber}: arrastra los números para mover las esquinas. `
                  : parcelas.length
                    ? `Dibujando la parcela ${number}. `
                    : ''}
              </strong>
              {hint ??
                (corners.length === 0
                  ? 'Busca tu parcela y toca sus esquinas en orden, siguiendo la orilla.'
                  : corners.length < 3
                    ? `Llevas ${corners.length} ${corners.length === 1 ? 'esquina' : 'esquinas'}. Faltan ${3 - corners.length} como mínimo.`
                    : `Llevas ${corners.length} esquinas. Esta parcela mide ${fmtHa(area)} hectáreas y su orilla ${fmtM(perimeterMeters(corners))}.`)}
            </p>
            {area > BIG_PARCEL_HA && (
              <p className="error">Es muy grande para una parcela. Revisa que las esquinas estén bien.</p>
            )}
            {overlapping.length > 0 && (
              <p className="error" aria-live="polite">
                Esta parcela se encima con la {overlapping.length === 1 ? 'parcela' : 'parcelas'}{' '}
                {overlapping.join(' y ')}. Si no es a propósito, usa «Deshacer esquina» y corrígela.
              </p>
            )}
            {CAN_LOCATE ? (
              <div className="gps-tools">
                <div className="button-row">
                  <button type="button" className="secondary" onClick={() => geolocateRef.current?.trigger()}>
                    {tracking ? 'Dejar de seguirme' : 'Usar mi ubicación'}
                  </button>
                  {gps && (
                    <button type="button" disabled={!gpsCheck.ok} onClick={addGpsCorner}>
                      Marcar esquina donde estoy
                    </button>
                  )}
                  {gps && <span className="hint">Precisión del GPS: ±{Math.round(gps.accuracy)} m</span>}
                </div>
                {gps && (
                  <p className="hint">
                    ¿Estás en tu parcela? Camina a cada esquina, siguiendo la orilla, y toca «Marcar esquina donde
                    estoy». También puedes tocar el mapa.
                  </p>
                )}
                {gps && !gpsCheck.ok && (
                  <p className={gpsCheck.code === 'misma-esquina' ? 'hint' : 'error'} aria-live="polite">
                    {gpsCheck.message}
                  </p>
                )}
                {gpsError && (
                  <p className="error" role="alert">
                    {gpsError}
                  </p>
                )}
              </div>
            ) : (
              <p className="hint">Para usar tu ubicación, abre la página desde una dirección segura (https).</p>
            )}
            <div className="button-row">
              <button type="button" disabled={corners.length < 3} onClick={finish}>
                {editingNumber !== null
                  ? 'Guardar cambios'
                  : parcelas.length
                    ? `Guardar parcela ${number}`
                    : 'Usar esta parcela'}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={corners.length === 0}
                onClick={() => setCorners((c) => c.slice(0, -1))}
              >
                Deshacer esquina
              </button>
              <button type="button" className="secondary" disabled={corners.length === 0} onClick={() => setCorners([])}>
                Borrar esquinas
              </button>
              {parcelas.length > 0 && (
                <button type="button" className="secondary" onClick={cancelDrawing}>
                  Cancelar
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="button-row">
            <button type="button" onClick={startNewParcel}>
              Dibujar otra parcela
            </button>
            <span className="hint">Cada parcela puede tener su propio cultivo.</span>
          </div>
        )}
      </div>
    </div>
  );
}

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
import { WEATHER_OPTIONS, weatherFromCode, weatherScene } from '../weather.js';
import { allCorners, parcelColor, parcelsGeoJSON, raisedParcelsGeoJSON } from './parcels.js';
import { createCropLayer } from './cropLayer.js';
import { DEFAULT_TOLERANCE, detectParcelAt } from './detectTiles.js';
import { ensurePattern } from './patterns.js';
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
const IMAGERY_TILES = {
  claro: 'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  rapido: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
};
const CLARITY_ERRORS_BEFORE_FALLBACK = 6;
const ESRI_CREDIT = 'Imágenes: Esri, Maxar, Earthstar Geographics y la comunidad de usuarios GIS';

// How the map is looked at.
//  - aerea:   straight from above, no tilt and no 3D relief. Best for drawing: what you tap is
//             exactly where the corner goes. Tilting/rotating is switched off.
//  - relieve: tilted, with the 3D relief (AWS Terrain Tiles / NASA SRTM). Best to look at the land.
const VIEW_PITCH = { aerea: 0, relieve: 55 };
const RISE_MS = 1300; // a saved parcel comes up out of the ground in this time
const DETAIL_ZOOM = 16.2; // from here in, the map draws the detailed crop models
const TERRAIN = { source: 'relieve', exaggeration: 1.5 };

const FAR_ZOOM = 10; // NASA GIBS pictures are 250 m to 9 km squares: they are read from far away
// What the page asks the map to show (Parcela.jsx sets it per card). Nothing here is picked by the farmer.
//   vista: 'aerea' | 'relieve' (drawing always goes aerial)   nasa: null | a NASA_LAYERS id
//   clima: 'hoy' (sky right now) | 'anio' (the chosen real year) | 'apagado'   lejos: zoom out to the region
export const DEFAULT_SCENE = { vista: 'relieve', nasa: null, clima: 'hoy', lejos: false };

// Satellite imagery + place names and streets (Esri) and 3D relief (the same heights that
// /api/terreno uses). All free, no API key. Raster only: no glyphs or sprites to fetch.
const buildStyle = (imagery, view) => ({
  version: 8,
  sources: {
    claro: {
      type: 'raster',
      tiles: [IMAGERY_TILES.claro],
      tileSize: 256,
      // Clarity has no tiles past z17 in the Bajío (404). Above it MapLibre enlarges the z17 tile.
      maxzoom: 17,
      attribution: ESRI_CREDIT,
    },
    rapido: {
      type: 'raster',
      tiles: [IMAGERY_TILES.rapido],
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
      // Textured sides: clods and soil layers in the SoilGrids color (patterns.js).
      'fill-extrusion-pattern': ['get', 'patron_suelo'],
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
      // Textured top: furrow rows with plants in the crop color for the year (patterns.js).
      'fill-extrusion-pattern': ['get', 'patron_cultivo'],
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
function applyView(map, view, { animate = true, camera = true } = {}) {
  const aerial = view === 'aerea';
  map.setTerrain(aerial ? null : TERRAIN);
  for (const handler of [map.dragRotate, map.touchPitch]) {
    if (aerial) handler.disable();
    else handler.enable();
  }
  if (aerial) map.touchZoomRotate.disableRotation();
  else map.touchZoomRotate.enableRotation();
  if (camera) map.easeTo({ pitch: VIEW_PITCH[view], ...(aerial ? { bearing: 0 } : {}), duration: animate && !reducedMotion() ? 900 : 0 });
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
//   escena           how the map looks right now (see DEFAULT_SCENE), set by the page's cards
//   soloVer          only show (screen 2): never draws, no parcel list nor drawing tools
//   plantasPorParcela optional { [id]: { growth, tint } }: each parcel's own crop look (else the year's look for all)
//   actual           the weather right now ({ temp_c, codigo_clima, ... } from /api/pronostico) or null
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
  escena = DEFAULT_SCENE,
  actual = null,
  soloVer = false,
  plantasPorParcela = null,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [corners, setCorners] = useState([]);
  const [drawing, setDrawing] = useState(!soloVer && parcelas.length === 0);
  const [hint, setHint] = useState(null);
  // Cloud free is best to draw on; if it keeps failing it switches to the fast one by itself (below).
  const [imagery, setImagery] = useState('claro');
  const [imageryNotice, setImageryNotice] = useState(null);
  const nasa = escena.nasa; // id of the NASA_LAYERS picture shown over the imagery, or null
  const [editingId, setEditingId] = useState(null); // a saved parcel being corrected, or null
  // Plants + weather standing on the satellite map, and whether the weather moves.
  const cropLayerRef = useRef(null);
  const [onScreen, setOnScreen] = useState(true);
  const [closeUp, setCloseUp] = useState(false); // zoomed in enough for the detailed crop models
  // "Detectar con un toque": the next tap analyzes the photo instead of adding a corner.
  const [detectMode, setDetectMode] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState(null); // { lon, lat, tolerance } of the last detection
  const detectModeRef = useRef(false);
  detectModeRef.current = detectMode;
  const runDetectionRef = useRef(null);
  const shown = editingId === null ? parcelas : parcelas.filter((p) => p.id !== editingId);
  // Placing corners (or about to draw one more parcel): straight from above, so a tap is a tap.
  // With no parcel yet and no corner (e.g. an example point) the page's scene still rules.
  const placing = drawing && (corners.length > 0 || parcelas.length > 0);
  const view = placing ? 'aerea' : escena.vista;
  const yearNow = yearState(clima, year?.anio ?? null);
  // Weather drawn over the map: the sky right now (Open-Meteo) or the real year (NASA POWER).
  // Without today's weather (offline) it falls back to the year.
  const today = escena.clima === 'hoy' && actual ? weatherFromCode(actual.codigo_clima, actual.lluvia_mm ?? 0) : null;
  const weatherChoice = escena.clima === 'apagado' ? 'apagado' : today ? 'hoy' : 'auto';
  const weather = weatherScene(weatherChoice, yearNow, actual?.codigo_clima);
  const weatherOption = WEATHER_OPTIONS.find((o) => o.id === weather.id) ?? WEATHER_OPTIONS[0];
  // Crops follow the real year, unless a hand-picked scene brings its own look (e.g. drought).
  const plantLook = weather.plant
    ? { ...weather.plant, tint: [1, 0.8 + 0.2 * weather.plant.wet, 0.45 + 0.55 * weather.plant.wet] }
    : yearNow;
  const animateWeather = weather.id !== 'apagado' && onScreen && !reducedMotion();
  const plantasKey = plantasPorParcela ? JSON.stringify(plantasPorParcela) : '';

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
    map.on('zoomend', () => setCloseUp(map.getZoom() >= DETAIL_ZOOM));
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
      if (detectModeRef.current) {
        runDetectionRef.current?.(event.lngLat.lng, event.lngLat.lat, DEFAULT_TOLERANCE);
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
      for (const feature of raised.features) {
        feature.properties.patron_suelo = ensurePattern(map, 'suelo', feature.properties.tierra);
        feature.properties.patron_cultivo = ensurePattern(map, 'cultivo', feature.properties.cultivo);
      }
      source.setData(raised);
      // Plants stand on the top of each raised block (ground height + block, as the map draws it).
      cropLayerRef.current?.update({
        parcels: shown.map((p, i) => ({
          id: p.id,
          cultivo: p.cultivo,
          contorno: p.contorno,
          plants: plantasPorParcela?.[p.id] ?? null,
          base: (ground?.get(p.id) ?? 0) + raised.features[i].properties.tope_m,
        })),
        plants: plantLook,
        weather: weather.id === 'apagado' ? null : weather,
        animate: animateWeather,
        detail: closeUp,
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
  }, [ready, parcelas, soilKey, editingId, yearNow.anio, yearNow.wet, weather.id, weather.example, animateWeather, closeUp, plantasKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!soloVer && parcelas.length === 0) setDrawing(true);
  }, [parcelas.length, soloVer]);

  // Only show: when the page around the map changes size (a card finishes loading) the resize cuts the camera's
  // flight to the parcel. Until the farmer moves the map, frame the parcel again after each resize.
  useEffect(() => {
    if (!ready || !soloVer) return undefined;
    const map = mapRef.current;
    let moved = false;
    const byHand = (e) => {
      if (e.originalEvent) moved = true;
    };
    const frame = () => {
      if (moved) return;
      const farm = parcelasRef.current;
      const pitch = VIEW_PITCH[viewRef.current];
      if (farm.length) map.fitBounds(bounds(allCorners(farm)), { padding: 60, pitch, maxZoom: 17.5, duration: 0 });
      else if (point) map.jumpTo({ center: [point.lon, point.lat], zoom: 16, pitch });
    };
    map.on('movestart', byHand);
    map.on('resize', frame);
    return () => {
      map.off('movestart', byHand);
      map.off('resize', frame);
    };
  }, [ready, soloVer, point]);

  // Show only the chosen imagery (a hidden layer downloads nothing).
  useEffect(() => {
    if (!ready) return;
    for (const id of Object.keys(IMAGERY)) {
      mapRef.current.setLayoutProperty(id, 'visibility', id === imagery ? 'visible' : 'none');
    }
  }, [ready, imagery]);

  // Same for the NASA picture: only the chosen one is visible.
  useEffect(() => {
    if (!ready) return;
    for (const id of Object.keys(NASA_LAYERS)) {
      mapRef.current.setLayoutProperty(`nasa-${id}`, 'visibility', id === nasa ? 'visible' : 'none');
    }
  }, [ready, nasa]);

  // The camera follows the scene: aerial to draw, 3D relief to look, far away for the NASA pictures.
  const lejos = escena.lejos && !placing;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready) return;
    applyView(map, view, { camera: false });
    const duration = reducedMotion() ? 0 : 1200;
    const pitch = VIEW_PITCH[view];
    const farm = parcelasRef.current;
    if (placing) {
      // A correction or a detection may already be framing the map: only level it if nothing moves.
      if (!map.isMoving()) map.easeTo({ pitch, bearing: 0, duration });
    } else if (lejos && point) map.flyTo({ center: [point.lon, point.lat], zoom: FAR_ZOOM, pitch, bearing: 0, duration });
    else if (farm.length) map.fitBounds(bounds(allCorners(farm)), { padding: 60, pitch, maxZoom: 17.5, duration });
    else map.easeTo({ pitch, duration });
  }, [ready, view, lejos]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (!soloVer) {
        setCorners([]);
        setDrawing(true);
      }
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
    setDetectMode(false);
    setDetected(null);
    if (editingId !== null) onUpdateParcela(editingId, corners);
    else onAddParcela(corners);
    setEditingId(null);
    setCorners([]);
    setDrawing(false);
    setHint(null);
  };

  // "Dibujar otra parcela": back to the aerial view, so the next outline is drawn precisely.
  const startNewParcel = () => {
    setEditingId(null);
    setCorners([]);
    setDrawing(true);
    setHint(null);
  };

  const cancelDrawing = () => {
    setEditingId(null);
    setCorners([]);
    setDrawing(false);
    setHint(null);
  };

  // Finds the parcel around a tap, with roads, tracks and ridges as its limits (detect.js).
  // The result becomes ordinary numbered corners: the farmer checks it and can drag any of them.
  const runDetection = async (lon, lat, tolerance) => {
    setDetecting(true);
    setHint('Analizando la imagen alrededor de tu toque…');
    const result = await detectParcelAt({ lon, lat, imageryUrl: IMAGERY_TILES[imageryRef.current], tolerance });
    setDetecting(false);
    if (!result.ok) {
      setHint(result.message);
      return;
    }
    setDetectMode(false);
    setDetected({ lon, lat, tolerance });
    setCorners(result.corners);
    // Close in on the outline so the numbered corners can be checked and dragged.
    mapRef.current?.fitBounds(bounds(result.corners), { padding: 70, maxZoom: 17, duration: reducedMotion() ? 0 : 900 });
    setHint(
      result.leaked
        ? 'La parcela llegó a la orilla de la zona que analizamos: quizá se pasó. Prueba «Más chica» o arrastra los números.'
        : 'Listo: seguimos los caminos y bordos alrededor de tu toque. Revisa el contorno; puedes arrastrar los números o usar «Más chica» y «Más grande».'
    );
  };
  runDetectionRef.current = runDetection;
  const resize = (factor) => detected && runDetection(detected.lon, detected.lat, Math.min(120, Math.max(8, detected.tolerance * factor)));

  // "Corregir": the saved corners come back as draggable numbers, seen from above.
  const startEditing = (parcela) => {
    setEditingId(parcela.id);
    setCorners(parcela.contorno.map((c) => [...c]));
    setDrawing(true);
    setHint(null);
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
        {weather.id !== 'apagado' && (
          <div className={`weather-overlay wx-${weather.id}`} aria-hidden="true">
            <span className="wx-sun" />
            <span className="wx-flash" />
          </div>
        )}
        {today && (
          <p className="map-year-badge" aria-hidden="true">
            Hoy · {today.icon} {today.label}
            {actual.temp_c != null && ` · ${Math.round(actual.temp_c)} °C`}
          </p>
        )}
        {!today && weather.id !== 'apagado' && yearNow.lluvia_mm !== null && (
          <p className={yearNow.seco ? 'map-year-badge map-year-dry' : 'map-year-badge'} aria-hidden="true">
            {year.anio} · {weatherOption.icon} {weather.label} · {Math.round(yearNow.lluvia_mm)} mm
          </p>
        )}
      </div>

      {imageryNotice && (
        <p className="hint" role="status">
          {imageryNotice}
        </p>
      )}

      {!soloVer && parcelas.length > 0 && (
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

      {!soloVer && (
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
            <div className="detect-tools">
              <div className="button-row">
                <button
                  type="button"
                  className={detectMode ? undefined : 'secondary'}
                  disabled={detecting}
                  aria-pressed={detectMode}
                  onClick={() => {
                    setDetectMode(!detectMode);
                    setHint(detectMode ? null : 'Toca dentro de tu parcela y la marcamos siguiendo los caminos y bordos que la rodean.');
                  }}
                >
                  {detecting ? 'Analizando…' : detectMode ? 'Toca dentro de tu parcela' : 'Detectar con un toque'}
                </button>
                {detected && corners.length >= 3 && (
                  <>
                    <button type="button" className="secondary" disabled={detecting} onClick={() => resize(0.75)}>
                      Más chica
                    </button>
                    <button type="button" className="secondary" disabled={detecting} onClick={() => resize(1.35)}>
                      Más grande
                    </button>
                  </>
                )}
              </div>
              <p className="hint">
                La app mira la foto satelital y usa los caminos, brechas y bordos como orillas. Es una ayuda: revisa
                siempre el contorno antes de guardarlo.
              </p>
            </div>
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
      )}
    </div>
  );
}

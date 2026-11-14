// Map layers of the plot screen. The base is OpenStreetMap (reliable). NDVI and SMAP are NASA GIBS
// WMTS tiles (visual only, as CLAUDE.md says) drawn over the base so the map still works if GIBS fails.
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const GIBS_DATE = '2024-08-12'; // rainy season; 8-day NDVI periods start on this date

export const BASE_LAYER = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© colaboradores de OpenStreetMap',
};

export const MAP_LAYERS = {
  sat: {
    titulo: 'CAPA: NASA GIBS TRUE COLOR + LÍMITES',
    sub: 'Resolución 250 m · MODIS Terra · © OpenStreetMap',
    overlay: { url: `${GIBS}/MODIS_Terra_CorrectedReflectance_TrueColor/default/${GIBS_DATE}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`, maxNativeZoom: 9, opacity: 0.75 },
  },
  ndvi: {
    titulo: 'CAPA: MODIS MOD13Q1 · ÍNDICE DE VERDOR',
    sub: 'NDVI 8 días · NASA GIBS · © OpenStreetMap',
    overlay: { url: `${GIBS}/MODIS_Terra_NDVI_8Day/default/${GIBS_DATE}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`, maxNativeZoom: 9, opacity: 0.7 },
  },
  smap: {
    titulo: 'CAPA: NASA SMAP · HUMEDAD DEL SUELO',
    sub: 'Humedad en zona de raíz L4 · NASA GIBS · © OpenStreetMap',
    overlay: { url: `${GIBS}/SMAP_L4_Analyzed_Root_Zone_Soil_Moisture/default/${GIBS_DATE}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`, maxNativeZoom: 6, opacity: 0.6 },
  },
};

export const BAJIO_CENTER = [20.6, -100.9];
export const BAJIO_ZOOM = 8;

// NASA GIBS layers drawn over the satellite image of the plot map (visual only).
// They are regional pictures: one square is 250 m (color, verdor) or 9 km (humedad), so they are read zoomed out.
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const GIBS_DATE = '2024-08-12'; // middle of the rainy season

// The 8-day NDVI layer (MODIS_Terra_NDVI_8Day) only keeps the last months and answers 404 for 2024:
// the 16-day one (MOD13Q1) has the whole record.
export const NASA_LAYERS = {
  color: {
    label: 'Color real',
    note: 'MODIS Terra, cuadros de 250 m',
    url: `${GIBS}/MODIS_Terra_CorrectedReflectance_TrueColor/default/${GIBS_DATE}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
    maxzoom: 9,
    opacity: 0.85,
  },
  ndvi: {
    label: 'Verdor (NDVI)',
    note: 'MODIS Terra, 16 días, cuadros de 250 m',
    url: `${GIBS}/MODIS_Terra_L3_NDVI_16Day/default/${GIBS_DATE}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`,
    maxzoom: 9,
    opacity: 0.7,
  },
  smap: {
    label: 'Humedad del suelo',
    note: 'SMAP, zona de raíces, cuadros de 9 km',
    url: `${GIBS}/SMAP_L4_Analyzed_Root_Zone_Soil_Moisture/default/${GIBS_DATE}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
    maxzoom: 6,
    opacity: 0.6,
  },
};

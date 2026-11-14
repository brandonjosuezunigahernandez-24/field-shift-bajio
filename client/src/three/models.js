import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import { SCENERY_URL, modelGeometries, modelUrl } from './mergeModels.js';

export { CROP_IDS } from '../crops.js';

const urlsFor = (cropIds) => [...new Set(cropIds)].sort().map(modelUrl).concat(SCENERY_URL);

// { maiz: BufferGeometry, maiz_lp, ..., casa, arbol } for the given crops (each file is cached).
// Draco/Meshopt are off: they would download a decoder from a CDN, and the demo must work offline.
export function useModelGeometries(cropIds) {
  const key = [...new Set(cropIds)].sort().join(',');
  const urls = useMemo(() => urlsFor(key.split(',')), [key]);
  const gltfs = useGLTF(urls, false, false);
  return useMemo(() => Object.assign({}, ...gltfs.map((gltf) => modelGeometries(gltf.scene))), [gltfs]);
}

export const preloadModels = (cropIds) => useGLTF.preload(urlsFor(cropIds), false, false);

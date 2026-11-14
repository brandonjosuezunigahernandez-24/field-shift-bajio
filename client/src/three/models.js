import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import { MODELS_URL, modelGeometries } from './mergeModels.js';

export { CROP_IDS } from '../crops.js';
export { MODELS_URL };

// { maiz: BufferGeometry, ..., casa, arbol }. The .glb is ~120 KB and cached by useGLTF.
// Draco/Meshopt are off: they would download a decoder from a CDN, and the demo must work offline.
export function useModelGeometries() {
  const { scene } = useGLTF(MODELS_URL, false, false);
  return useMemo(() => modelGeometries(scene), [scene]);
}

export const preloadModels = () => useGLTF.preload(MODELS_URL, false, false);

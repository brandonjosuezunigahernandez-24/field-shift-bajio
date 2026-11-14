import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import { BufferAttribute, Matrix4 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CROP_IDS } from '../crops.js';

// Made in Blender by assets/blender/build_models.py. One named node per model, sizes in meters.
export const MODELS_URL = '/models/bajio.glb';
export { CROP_IDS } from '../crops.js';
const SCENERY_IDS = ['casa', 'arbol'];

// Each model may come as several meshes (one per material). For instancing we want ONE
// geometry per model: bake each material color into a vertex color and merge.
function mergeModel(node) {
  node.updateWorldMatrix(true, true);
  const toNode = new Matrix4().copy(node.matrixWorld).invert();
  const parts = [];
  node.traverse((child) => {
    if (!child.isMesh) return;
    const geometry = child.geometry.clone().toNonIndexed();
    geometry.applyMatrix4(new Matrix4().multiplyMatrices(toNode, child.matrixWorld));
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
    }
    const { r, g, b } = child.material.color; // linear, as three expects for vertex colors
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([r, g, b], i * 3);
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    parts.push(geometry);
  });
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

// Merged once per loaded file and shared by every diorama (a new parcel does not re-merge).
const mergedByScene = new WeakMap();

// { maiz: BufferGeometry, ..., casa, arbol }. The .glb is ~120 KB and cached by useGLTF.
// Draco/Meshopt are off: they would download a decoder from a CDN, and the demo must work offline.
export function useModelGeometries() {
  const { scene } = useGLTF(MODELS_URL, false, false);
  return useMemo(() => {
    if (!mergedByScene.has(scene)) {
      const out = {};
      for (const id of [...CROP_IDS, ...SCENERY_IDS]) {
        const node = scene.getObjectByName(id);
        if (node) out[id] = mergeModel(node);
      }
      mergedByScene.set(scene, out);
    }
    return mergedByScene.get(scene);
  }, [scene]);
}

export const preloadModels = () => useGLTF.preload(MODELS_URL, false, false);

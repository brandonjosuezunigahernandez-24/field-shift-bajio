import { BufferAttribute, Matrix4, MeshStandardMaterial, SRGBColorSpace } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CROP_IDS } from '../crops.js';

// Made in Blender by assets/blender/build_models.py. One named node per model, sizes in meters.
// Shared by the 3D diorama (React Three Fiber) and the crops on the satellite map (plain three.js),
// so it has no React in it.
export const MODELS_URL = '/models/bajio.glb';
export const SCENERY_IDS = ['casa', 'arbol'];

// Each model may come as several meshes (one per material). For instancing we want ONE
// geometry per model: bake each material color into a vertex color and merge. Since the models
// carry a baked texture (assets/blender/build_models.py), UVs are kept and the texture rides on
// geometry.userData.map; modelMaterial() turns it into the material to draw with.
function mergeModel(node) {
  node.updateWorldMatrix(true, true);
  const toNode = new Matrix4().copy(node.matrixWorld).invert();
  const parts = [];
  let map = null;
  node.traverse((child) => {
    if (!child.isMesh) return;
    const geometry = child.geometry.clone().toNonIndexed();
    geometry.applyMatrix4(new Matrix4().multiplyMatrices(toNode, child.matrixWorld));
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name);
    }
    if (!geometry.attributes.uv) {
      geometry.setAttribute('uv', new BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    }
    map = map ?? child.material.map ?? null;
    const { r, g, b } = child.material.color; // linear, as three expects for vertex colors
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([r, g, b], i * 3);
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    parts.push(geometry);
  });
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  if (map) {
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    merged.userData.map = map;
  }
  return merged;
}

// One material per model (cached): its baked texture, tinted by the vertex/instance colors.
const materialByGeometry = new WeakMap();
export function modelMaterial(geometry) {
  if (!materialByGeometry.has(geometry)) {
    materialByGeometry.set(
      geometry,
      new MeshStandardMaterial({ vertexColors: true, map: geometry.userData.map ?? null, roughness: 0.85, flatShading: true })
    );
  }
  return materialByGeometry.get(geometry);
}

// Merged once per loaded file (a new parcel or diorama does not re-merge).
const mergedByScene = new WeakMap();

// glTF scene -> { maiz: BufferGeometry, ..., casa, arbol }
export function modelGeometries(scene) {
  if (!mergedByScene.has(scene)) {
    const out = {};
    for (const id of [...CROP_IDS, ...SCENERY_IDS]) {
      const node = scene.getObjectByName(id);
      if (node) out[id] = mergeModel(node);
    }
    mergedByScene.set(scene, out);
  }
  return mergedByScene.get(scene);
}

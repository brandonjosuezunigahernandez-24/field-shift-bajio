// Crops and weather standing on the satellite map: a MapLibre custom layer drawn with three.js.
// Same Blender models as the 3D diorama, one InstancedMesh per crop (one draw call per crop,
// whatever the number of plants). The map only redraws every frame while the weather animates.
import { MercatorCoordinate } from 'maplibre-gl';
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Camera,
  Color,
  DirectionalLight,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MODELS_URL, modelGeometries } from '../three/mergeModels.js';
import { allCorners, mapPlantSpots } from './parcels.js';
import { polygonCenter } from './polygon.js';

const MAX_DROPS = 1400;
const MAX_DUST = 700;
const DROP_LEN_M = 7;
const RAIN_SPEED = 55; // m/s, exaggerated like everything else on the map
const RAIN_TOP_M = 160; // rain starts this high over the parcels
const ROT_X = new Matrix4().makeRotationAxis(new Vector3(1, 0, 0), Math.PI / 2);

const srgb = (rgb) => new Color().setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace);

// layer: add it with map.addLayer(layer, beforeId).
// update({ parcels: [{ id, cultivo, contorno, base }], year, weather, animate }):
//   base    absolute height (m) of the top of the parcel's raised block, where plants stand
//   year    { growth, tint, rain, seco } from parcelState.yearState (or null)
//   weather show rain / dust;  animate  false with "reduce motion" or when the map is off screen
export function createCropLayer() {
  let map = null;
  let renderer = null;
  let models = null;
  const scene = new Scene();
  const camera = new Camera();
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  const meshes = new Map(); // cultivo -> InstancedMesh
  const spotCache = new Map(); // parcel key -> { spots, spacing }
  let origin = null; // { lat, lon, merc, scale }
  let state = { parcels: [], year: null, weather: true, animate: true };

  scene.add(new AmbientLight(0xffffff, 0.9));
  const sun = new DirectionalLight(0xffffff, 1.7);
  sun.position.set(0.4, 1, 0.3);
  scene.add(sun);

  // --- weather: rain streaks and dry-year dust, inside the parcels' bounding box ---
  const rainGeometry = new BufferGeometry();
  rainGeometry.setAttribute('position', new BufferAttribute(new Float32Array(MAX_DROPS * 6), 3));
  const rain = new LineSegments(
    rainGeometry,
    new LineBasicMaterial({ color: '#b5d8ff', transparent: true, opacity: 0.75, depthWrite: false })
  );
  rain.frustumCulled = false;
  const dustGeometry = new BufferGeometry();
  dustGeometry.setAttribute('position', new BufferAttribute(new Float32Array(MAX_DUST * 3), 3));
  const dust = new Points(
    dustGeometry,
    new PointsMaterial({ color: '#c99752', size: 4, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false })
  );
  dust.frustumCulled = false;
  scene.add(rain, dust);
  let box = null; // { x0, x1, z0, z1, top }
  let lastTime = 0;

  const random = (lo, hi) => lo + Math.random() * (hi - lo);

  function seedWeather() {
    if (!box) return;
    const r = rainGeometry.attributes.position.array;
    for (let i = 0; i < MAX_DROPS; i++) {
      const x = random(box.x0, box.x1);
      const z = random(box.z0, box.z1);
      const y = random(box.top, box.top + RAIN_TOP_M);
      r.set([x, y, z, x, y + DROP_LEN_M, z], i * 6);
    }
    rainGeometry.attributes.position.needsUpdate = true;
    const d = dustGeometry.attributes.position.array;
    for (let i = 0; i < MAX_DUST; i++) {
      d.set([random(box.x0, box.x1), random(box.top + 0.5, box.top + 14), random(box.z0, box.z1)], i * 3);
    }
    dustGeometry.attributes.position.needsUpdate = true;
  }

  function weatherCounts() {
    const year = state.year;
    if (!state.weather || !year || year.lluvia_mm === null || !box) return { drops: 0, motes: 0 };
    if (year.seco) return { drops: 0, motes: Math.round(MAX_DUST * 0.8) };
    return { drops: Math.round(MAX_DROPS * Math.min(1, year.rain)), motes: 0 };
  }

  function stepWeather(dt) {
    const { drops, motes } = weatherCounts();
    if (drops) {
      const r = rainGeometry.attributes.position.array;
      for (let i = 0; i < drops; i++) {
        const k = i * 6;
        r[k + 1] -= RAIN_SPEED * dt;
        r[k + 4] -= RAIN_SPEED * dt;
        if (r[k + 1] < box.top) {
          const y = box.top + RAIN_TOP_M * (0.8 + Math.random() * 0.2);
          r[k + 1] = y;
          r[k + 4] = y + DROP_LEN_M;
        }
      }
      rainGeometry.attributes.position.needsUpdate = true;
    }
    if (motes) {
      const d = dustGeometry.attributes.position.array;
      const t = performance.now() / 1000;
      for (let i = 0; i < motes; i++) {
        const k = i * 3;
        d[k] += (4 + Math.sin(t + i) * 2) * dt; // drifts east with the wind
        d[k + 1] += Math.sin(t * 2 + i * 0.7) * 0.6 * dt;
        if (d[k] > box.x1) d[k] = box.x0;
      }
      dustGeometry.attributes.position.needsUpdate = true;
    }
    rainGeometry.setDrawRange(0, drops * 2);
    dustGeometry.setDrawRange(0, motes);
    return drops > 0 || motes > 0;
  }

  // Rebuilds plant instances (cheap: a few thousand matrices) after any change.
  function rebuild() {
    for (const mesh of meshes.values()) {
      scene.remove(mesh);
      mesh.dispose();
    }
    meshes.clear();
    box = null;
    const parcels = state.parcels;
    if (!parcels.length) return;

    const center = polygonCenter(allCorners(parcels));
    const sameOrigin = origin && Math.abs(origin.lat - center.lat) < 0.01 && Math.abs(origin.lon - center.lon) < 0.01;
    if (!sameOrigin) {
      const merc = MercatorCoordinate.fromLngLat([center.lon, center.lat], 0);
      origin = { ...center, merc, scale: merc.meterInMercatorCoordinateUnits() };
      spotCache.clear();
    }

    const year = state.year;
    const growth = year?.growth ?? 1;
    const tint = srgb(year?.tint ?? [1, 1, 1]);
    const byCrop = new Map();
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    let top = 0;
    parcels.forEach((p) => {
      const key = `${p.id}:${p.contorno.flat().join(',')}`;
      if (!spotCache.has(key)) spotCache.set(key, mapPlantSpots(p.contorno, origin.lat, origin.lon, p.id * 7919));
      const { spots, spacing } = spotCache.get(key);
      if (!byCrop.has(p.cultivo)) byCrop.set(p.cultivo, []);
      byCrop.get(p.cultivo).push({ spots, spacing, base: p.base });
      for (const s of spots) {
        x0 = Math.min(x0, s.x);
        x1 = Math.max(x1, s.x);
        z0 = Math.min(z0, s.z);
        z1 = Math.max(z1, s.z);
      }
      top = Math.max(top, p.base);
    });
    if (Number.isFinite(x0)) {
      const changed = !box || box.x0 !== x0 || box.x1 !== x1 || box.z0 !== z0 || box.z1 !== z1 || box.top !== top;
      box = { x0, x1, z0, z1, top };
      if (changed) seedWeather();
    }

    if (!models) return; // the .glb is still loading; rebuild() runs again when it arrives
    const dummy = new Object3D();
    for (const [cultivo, groups] of byCrop) {
      const geometry = models[cultivo] ?? models.maiz;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const modelHeight = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
      const count = groups.reduce((n, g) => n + g.spots.length, 0);
      const mesh = new InstancedMesh(geometry, material, count);
      mesh.frustumCulled = false;
      let i = 0;
      for (const { spots, spacing, base } of groups) {
        // Plants are drawn bigger and bushier than life (like the relief) so a field reads from the sky.
        const target = Math.min(18, Math.max(6, spacing * 1.1));
        const bushy = 1.8;
        for (const s of spots) {
          const k = (target / modelHeight) * s.size;
          dummy.position.set(s.x, base, s.z);
          dummy.rotation.set(0, s.yaw, 0);
          const wide = k * bushy * (0.75 + 0.25 * growth);
          dummy.scale.set(wide, k * growth, wide);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          mesh.setColorAt(i, tint);
          i += 1;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      meshes.set(cultivo, mesh);
      scene.add(mesh);
    }
  }

  const layer = {
    id: 'cultivos-3d',
    type: 'custom',
    renderingMode: '3d', // shares the depth buffer: plants hide behind the raised blocks properly
    onAdd(m, gl) {
      map = m;
      renderer = new WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      new GLTFLoader().load(
        MODELS_URL,
        (gltf) => {
          models = modelGeometries(gltf.scene);
          rebuild();
          map?.triggerRepaint();
        },
        undefined,
        (err) => console.error('Modelos de cultivos en el mapa:', err)
      );
    },
    render(gl, args) {
      if (!origin || !state.parcels.length) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - (lastTime || now)) / 1000);
      lastTime = now;
      const moving = state.animate ? stepWeather(dt) : stepWeather(0);

      const projection = new Matrix4().fromArray(args.defaultProjectionData.mainMatrix);
      const local = new Matrix4()
        .makeTranslation(origin.merc.x, origin.merc.y, origin.merc.z)
        .scale(new Vector3(origin.scale, -origin.scale, origin.scale))
        .multiply(ROT_X);
      camera.projectionMatrix = projection.multiply(local);
      renderer.resetState();
      renderer.render(scene, camera);

      if (moving && state.animate) map.triggerRepaint();
      else lastTime = 0;
    },
    onRemove() {
      for (const mesh of meshes.values()) mesh.dispose();
      meshes.clear();
      material.dispose();
      rainGeometry.dispose();
      dustGeometry.dispose();
      map = null;
    },
  };

  return {
    layer,
    update(next) {
      state = { ...state, ...next };
      rebuild();
      map?.triggerRepaint();
    },
  };
}

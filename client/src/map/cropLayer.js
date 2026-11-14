// Crops and weather standing on the satellite map: a MapLibre custom layer drawn with three.js.
// Same Blender models as the 3D diorama, one InstancedMesh per crop (one draw call per crop,
// whatever the number of plants). Clouds are one InstancedMesh of puffs. The map only redraws
// every frame while something moves (clouds, rain or dust).
import { MercatorCoordinate } from 'maplibre-gl';
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Camera,
  Color,
  DirectionalLight,
  IcosahedronGeometry,
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
const MAX_CLOUDS = 14;
const PUFFS = 5; // spheres per cloud
const DROP_LEN_M = 7;
const RAIN_SPEED = 55; // m/s, exaggerated like everything else on the map
const RAIN_TOP_M = 160; // rain starts this high over the parcels
const CLOUD_SPEED = 7; // m/s drifting east
const ROT_X = new Matrix4().makeRotationAxis(new Vector3(1, 0, 0), Math.PI / 2);

const srgb = (rgb) => new Color().setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace);

// Seeded random, so clouds are the same every time for the same farm.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// layer: add it with map.addLayer(layer, beforeId).
// update({ parcels: [{ id, cultivo, contorno, base }], plants, weather, animate }):
//   base     absolute height (m) of the top of the parcel's raised block, where plants stand
//   plants   { growth, tint } how the crops look (yearState, or the hand-picked weather's look)
//   weather  scene from weather.js weatherScene() (clouds, rain, dust, light, warm)
//   animate  false with "reduce motion" or when the map is off screen
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
  let state = { parcels: [], plants: null, weather: null, animate: true };

  const ambient = new AmbientLight(0xffffff, 0.9);
  const sun = new DirectionalLight(0xffffff, 1.7);
  sun.position.set(0.4, 1, 0.3);
  scene.add(ambient, sun);

  // --- rain streaks and dry-year dust ---
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

  // --- clouds: puffy low-poly spheres, all in one InstancedMesh ---
  const cloudMaterial = new MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true, transparent: true, opacity: 0.82, depthWrite: false });
  const clouds = new InstancedMesh(new IcosahedronGeometry(1, 1), cloudMaterial, MAX_CLOUDS * PUFFS);
  clouds.frustumCulled = false;
  clouds.count = 0;
  let cloudData = []; // [{ x, y, z, r, puffs: [[dx, dy, dz, s]] }]
  scene.add(rain, dust, clouds);

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

    // Clouds spread over a margin around the farm, sized to it (a small plot gets small clouds).
    const size = Math.max(box.x1 - box.x0, box.z1 - box.z0, 120);
    const rnd = seeded(Math.round(size));
    cloudData = Array.from({ length: MAX_CLOUDS }, () => {
      const r = Math.min(70, Math.max(18, size * 0.08)) * (0.7 + rnd() * 0.6);
      return {
        x: box.x0 - size * 0.3 + rnd() * size * 1.6,
        y: box.top + 230 + rnd() * 90, // high enough not to hide the parcel in the tilted view
        z: box.z0 - size * 0.3 + rnd() * size * 1.6,
        r,
        puffs: Array.from({ length: PUFFS }, (_, k) => [
          (k - 2) * r * 0.75 + (rnd() - 0.5) * r * 0.4,
          (rnd() - 0.3) * r * 0.35,
          (rnd() - 0.5) * r * 0.6,
          (k === 2 ? 1.15 : 0.7 + rnd() * 0.35) * r,
        ]),
      };
    });
  }

  const dummy = new Object3D();
  function placeClouds() {
    const visible = Math.round(MAX_CLOUDS * (state.weather?.clouds ?? 0));
    clouds.count = visible * PUFFS;
    for (let c = 0; c < visible; c++) {
      const cloud = cloudData[c];
      if (!cloud) continue;
      cloud.puffs.forEach(([dx, dy, dz, s], k) => {
        dummy.position.set(cloud.x + dx, cloud.y + dy, cloud.z + dz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(s, s * 0.6, s);
        dummy.updateMatrix();
        clouds.setMatrixAt(c * PUFFS + k, dummy.matrix);
      });
    }
    clouds.instanceMatrix.needsUpdate = true;
  }

  // Light and colors for the scene: sunny is bright and golden, a storm is dark and grey.
  function applyLight() {
    const w = state.weather;
    const light = w?.light ?? 1;
    ambient.intensity = 0.9 * light;
    sun.intensity = 1.7 * light;
    sun.color.set(w?.warm ? '#ffd9a0' : '#ffffff');
    const dark = w?.id === 'tormenta' ? 0.45 : w?.id === 'lluvia' || w?.id === 'nublado' ? 0.78 : 1;
    cloudMaterial.color.setRGB(dark, dark, Math.min(1, dark + 0.04));
  }

  // Moves rain, dust and clouds by dt seconds. Returns true while anything is visible and moving.
  function stepWeather(dt) {
    const w = state.weather;
    if (!w || !box) {
      rainGeometry.setDrawRange(0, 0);
      dustGeometry.setDrawRange(0, 0);
      clouds.count = 0;
      return false;
    }
    const drops = Math.round(MAX_DROPS * w.rain);
    const motes = Math.round(MAX_DUST * w.dust);
    if (drops && dt) {
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
    if (motes && dt) {
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
    if (w.clouds && dt) {
      const span = Math.max(box.x1 - box.x0, 120);
      for (const cloud of cloudData) {
        cloud.x += CLOUD_SPEED * dt;
        if (cloud.x > box.x1 + span * 0.5) cloud.x = box.x0 - span * 0.5;
      }
    }
    placeClouds();
    rainGeometry.setDrawRange(0, drops * 2);
    dustGeometry.setDrawRange(0, motes);
    return drops > 0 || motes > 0 || w.clouds > 0;
  }

  // Rebuilds plant instances (cheap: a few thousand matrices) after any change.
  function rebuild() {
    for (const mesh of meshes.values()) {
      scene.remove(mesh);
      mesh.dispose();
    }
    meshes.clear();
    applyLight();
    const parcels = state.parcels;
    if (!parcels.length) {
      box = null;
      return;
    }

    const center = polygonCenter(allCorners(parcels));
    const sameOrigin = origin && Math.abs(origin.lat - center.lat) < 0.01 && Math.abs(origin.lon - center.lon) < 0.01;
    if (!sameOrigin) {
      const merc = MercatorCoordinate.fromLngLat([center.lon, center.lat], 0);
      origin = { ...center, merc, scale: merc.meterInMercatorCoordinateUnits() };
      spotCache.clear();
    }

    const plants = state.plants;
    const growth = plants?.growth ?? 1;
    const tint = srgb(plants?.tint ?? [1, 1, 1]);
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
      const changed = !box || box.x0 !== x0 || box.x1 !== x1 || box.z0 !== z0 || box.z1 !== z1 || Math.abs(box.top - top) > 2;
      box = { x0, x1, z0, z1, top };
      if (changed) seedWeather();
    }
    stepWeather(0);

    if (!models) return; // the .glb is still loading; rebuild() runs again when it arrives
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
      const dt = state.animate ? Math.min(0.1, (now - (lastTime || now)) / 1000) : 0;
      lastTime = now;
      const moving = stepWeather(dt);

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
      cloudMaterial.dispose();
      clouds.dispose();
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

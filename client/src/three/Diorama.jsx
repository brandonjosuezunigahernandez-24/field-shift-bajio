import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { clamp, surfaceFrame } from './geo.js';
import { useModelGeometries } from './models.js';
import { reliefExaggeration, soilColors, yearState } from './parcelState.js';

// The diorama is built in local units: the 1 km square goes from -0.5 to 0.5 on x (east)
// and z (south); y is up. The whole group is then scaled to SIZE globe units.
export const SIZE = 0.05; // globe radius = 1, so the 1 km square is shown ~300x bigger than real
export const BASE = 0.12; // depth of the soil block below the lowest point
const TOP = 0.1; // highest point after exaggeration (8% target + margin)
const GRID = 22; // plants per side
const FIELD = 0.84; // planted share of the side
const RISE_SECONDS = 1.4;
const MORPH_SECONDS = 0.9;
const MAX_RAIN = 500;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// Seeded random numbers, so the same plot always has the same plants.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const linear = (srgb) => new Color().setRGB(srgb[0], srgb[1], srgb[2], SRGBColorSpace);

function heightAt(y, tam, x, z) {
  const u = clamp((x + 0.5) * (tam - 1), 0, tam - 1.001);
  const v = clamp((z + 0.5) * (tam - 1), 0, tam - 1.001);
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fu = u - i;
  const fv = v - j;
  const at = (c, r) => y[r * tam + c];
  return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv;
}

function makeTerrainGeometry(tam) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(tam * tam * 3);
  for (let row = 0; row < tam; row++) {
    for (let col = 0; col < tam; col++) {
      const i = (row * tam + col) * 3;
      positions[i] = col / (tam - 1) - 0.5; // west -> east
      positions[i + 2] = row / (tam - 1) - 0.5; // north -> south (row 0 is north)
    }
  }
  const index = [];
  for (let row = 0; row < tam - 1; row++) {
    for (let col = 0; col < tam - 1; col++) {
      const a = row * tam + col;
      const b = a + 1;
      const c = a + tam;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  geometry.setIndex(index);
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(tam * tam * 3), 3));
  return geometry;
}

// Perimeter of the grid, clockwise from the north-west corner.
function perimeter(tam) {
  const ids = [];
  for (let c = 0; c < tam - 1; c++) ids.push(c);
  for (let r = 0; r < tam - 1; r++) ids.push(r * tam + tam - 1);
  for (let c = tam - 1; c > 0; c--) ids.push((tam - 1) * tam + c);
  for (let r = tam - 1; r > 0; r--) ids.push(r * tam);
  ids.push(0);
  return ids;
}

// Side walls + bottom of the soil block, non-indexed (flat normals).
function makeSkirtGeometry(tam) {
  const quads = perimeter(tam).length - 1;
  const vertices = quads * 6 + 6;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices * 3), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(vertices * 3), 3));
  return geometry;
}

function writeSkirt(geometry, terrainPositions, tam, colors) {
  const ring = perimeter(tam);
  const pos = geometry.attributes.position.array;
  const col = geometry.attributes.color.array;
  let k = 0;
  const put = (x, y, z, c) => {
    pos.set([x, y, z], k * 3);
    col.set([c.r, c.g, c.b], k * 3);
    k++;
  };
  const top = (id) => [terrainPositions[id * 3], terrainPositions[id * 3 + 1], terrainPositions[id * 3 + 2]];
  for (let n = 0; n < ring.length - 1; n++) {
    const [ax, ay, az] = top(ring[n]);
    const [bx, by, bz] = top(ring[n + 1]);
    put(ax, ay, az, colors.top);
    put(ax, -BASE, az, colors.sub);
    put(bx, by, bz, colors.top);
    put(bx, by, bz, colors.top);
    put(ax, -BASE, az, colors.sub);
    put(bx, -BASE, bz, colors.sub);
  }
  for (const [x, z] of [[-0.5, -0.5], [0.5, 0.5], [0.5, -0.5], [-0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    put(x, -BASE, z, colors.sub);
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

function Rain({ intensity, animate }) {
  const invalidate = useThree((s) => s.invalidate);
  const geometry = useMemo(() => {
    const random = mulberry32(7);
    const positions = new Float32Array(MAX_RAIN * 3);
    for (let i = 0; i < MAX_RAIN; i++) {
      positions.set([random() * 0.96 - 0.48, 0.02 + random() * 0.4, random() * 0.96 - 0.48], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const count = Math.round(MAX_RAIN * intensity);
  geometry.setDrawRange(0, count);

  useFrame((_, delta) => {
    if (!animate || count === 0) return;
    const pos = geometry.attributes.position.array;
    const step = 0.35 * Math.min(delta, 0.1);
    for (let i = 0; i < count; i++) {
      const y = i * 3 + 1;
      pos[y] -= step;
      if (pos[y] < 0.02) pos[y] = 0.42;
    }
    geometry.attributes.position.needsUpdate = true;
    invalidate(); // keeps frames coming only while it rains on screen
  });

  if (count === 0) return null;
  return (
    <points geometry={geometry} raycast={() => null} frustumCulled={false}>
      <pointsMaterial color="#a8cfff" size={2} sizeAttenuation={false} transparent opacity={0.75} depthWrite={false} />
    </points>
  );
}

export default function Diorama({ lat, lon, terreno, clima, suelo, anio, cultivo, showRain, reducedMotion }) {
  const invalidate = useThree((s) => s.invalidate);
  const models = useModelGeometries();
  const groupRef = useRef();
  const cropsRef = useRef();

  const frame = useMemo(() => surfaceFrame(lat, lon), [lat, lon]);
  const quaternion = useMemo(() => {
    const [e, u, s] = [frame.east, frame.up, frame.south].map((v) => new Vector3(...v));
    return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(e, u, s));
  }, [frame]);
  const up = useMemo(() => new Vector3(...frame.up), [frame]);

  // --- relief: target heights in local units, and the animated current heights ---
  const tam = terreno?.tam ?? 65;
  const exaggeration = reliefExaggeration(terreno?.desnivel_m, terreno?.lado_m);
  const targetY = useMemo(() => {
    const y = new Float32Array(tam * tam);
    if (terreno) {
      const min = terreno.altura_min_m;
      terreno.alturas.forEach((h, i) => {
        y[i] = Math.min(((h - min) / terreno.lado_m) * exaggeration, TOP);
      });
    }
    return y;
  }, [terreno, tam, exaggeration]);
  const currentY = useMemo(() => new Float32Array(tam * tam), [tam]);
  const morph = useRef(1);
  useLayoutEffect(() => {
    morph.current = reducedMotion ? 1 : 0;
    invalidate();
  }, [targetY, reducedMotion, invalidate]);

  // --- geometries (rebuilt only when the grid size changes) ---
  const terrainGeometry = useMemo(() => makeTerrainGeometry(tam), [tam]);
  const skirtGeometry = useMemo(() => makeSkirtGeometry(tam), [tam]);
  useEffect(() => () => terrainGeometry.dispose(), [terrainGeometry]);
  useEffect(() => () => skirtGeometry.dispose(), [skirtGeometry]);
  const noise = useMemo(() => {
    const random = mulberry32(Math.round((lat + 90) * 100) * 100000 + Math.round((lon + 180) * 100));
    return Float32Array.from({ length: tam * tam }, () => (random() - 0.5) * 0.08);
  }, [lat, lon, tam]);

  // --- plants: fixed positions per plot, minus the farmhouse corner ---
  const plants = useMemo(() => {
    const random = mulberry32(Math.round(lat * 1000) ^ Math.round(lon * 1000));
    const list = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const x = (c / (GRID - 1) - 0.5) * FIELD + (random() - 0.5) * 0.012;
        const z = (r / (GRID - 1) - 0.5) * FIELD + (random() - 0.5) * 0.012;
        if (x > 0.22 && z < -0.22) continue; // farmhouse yard (north-east)
        list.push({ x, z, yaw: random() * Math.PI * 2, size: 0.85 + random() * 0.3 });
      }
    }
    return list;
  }, [lat, lon]);

  const cropGeometry = models[cultivo] ?? models.maiz;
  const cropScale = useMemo(() => {
    cropGeometry.computeBoundingBox();
    const realHeight = cropGeometry.boundingBox.max.y - cropGeometry.boundingBox.min.y;
    // Exaggerated like the relief, so a 0.5 m bean is still visible: 0.022 to 0.045 of the side.
    return clamp(realHeight * 0.022, 0.022, 0.045) / realHeight;
  }, [cropGeometry]);

  const material = useMemo(() => new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), []);
  const soilMaterial = useMemo(() => new MeshStandardMaterial({ vertexColors: true, roughness: 1, side: DoubleSide }), []);
  useEffect(() => () => { material.dispose(); soilMaterial.dispose(); }, [material, soilMaterial]);

  const state = useMemo(() => yearState(clima, anio), [clima, anio]);
  const soil = useMemo(() => soilColors(suelo), [suelo]);

  // Writes every buffer from the current heights, year and soil. Cheap: ~4k vertices + ~450
  // instance matrices, and it only runs when something changes (or during the 0.9 s morph).
  const redraw = () => {
    const t = ease(morph.current);
    for (let i = 0; i < currentY.length; i++) currentY[i] = targetY[i] * t;

    const ground = linear(state.ground);
    const pos = terrainGeometry.attributes.position.array;
    const col = terrainGeometry.attributes.color.array;
    for (let i = 0; i < currentY.length; i++) {
      pos[i * 3 + 1] = currentY[i];
      const shade = 0.92 + currentY[i] * 1.5 + noise[i];
      col[i * 3] = ground.r * shade;
      col[i * 3 + 1] = ground.g * shade;
      col[i * 3 + 2] = ground.b * shade;
    }
    terrainGeometry.attributes.position.needsUpdate = true;
    terrainGeometry.attributes.color.needsUpdate = true;
    terrainGeometry.computeVertexNormals();
    terrainGeometry.computeBoundingSphere();
    writeSkirt(skirtGeometry, pos, tam, { top: linear(soil.top), sub: linear(soil.sub) });

    const mesh = cropsRef.current;
    if (mesh) {
      const dummy = new Object3D();
      const tint = linear(state.tint);
      const g = state.growth;
      plants.forEach((p, i) => {
        const s = cropScale * p.size;
        dummy.position.set(p.x, heightAt(currentY, tam, p.x, p.z), p.z);
        dummy.rotation.set(0, p.yaw, 0);
        dummy.scale.set(s * (0.75 + 0.25 * g), s * g, s * (0.75 + 0.25 * g));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, tint);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    invalidate();
  };

  // Redraw when the year, crop, soil or relief change.
  useLayoutEffect(redraw, [state, soil, cultivo, cropScale, terrainGeometry, plants, targetY]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- rise out of the globe + relief morph, both only while they are running ---
  const rise = useRef(reducedMotion ? 1 : 0);
  const placeGroup = () => {
    const t = ease(rise.current);
    const lift = -TOP * SIZE + (TOP + BASE) * SIZE * t; // from buried to resting on the surface
    groupRef.current.position.copy(up).multiplyScalar(1 + lift);
  };
  useLayoutEffect(() => {
    rise.current = reducedMotion ? 1 : 0;
    placeGroup();
    invalidate();
  }, [up]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    if (rise.current < 1) {
      rise.current = Math.min(1, rise.current + dt / RISE_SECONDS);
      placeGroup();
      invalidate();
    }
    if (morph.current < 1 && rise.current > 0.5) {
      morph.current = Math.min(1, morph.current + dt / MORPH_SECONDS);
      redraw();
    }
  });

  const scenery = (id, x, z, scale, yaw = 0) =>
    models[id] && (
      <mesh
        key={`${id}${x}${z}`}
        geometry={models[id]}
        material={material}
        position={[x, heightAt(targetY, tam, x, z), z]}
        rotation={[0, yaw, 0]}
        scale={scale}
        raycast={() => null}
      />
    );

  return (
    // Clicks on the diorama must not fall through to the globe behind it.
    <group ref={groupRef} quaternion={quaternion} scale={SIZE} onClick={(e) => e.stopPropagation()}>
      <mesh geometry={terrainGeometry} material={material} />
      <mesh geometry={skirtGeometry} material={soilMaterial} raycast={() => null} />
      <instancedMesh
        key={cultivo}
        ref={cropsRef}
        args={[cropGeometry, material, plants.length]}
        raycast={() => null}
        frustumCulled={false}
        onUpdate={redraw}
      />
      {scenery('casa', 0.36, -0.36, 0.008, 0.3)}
      {scenery('arbol', -0.46, 0.46, 0.012)}
      {scenery('arbol', 0.47, 0.2, 0.01, 1.2)}
      {scenery('arbol', -0.47, -0.3, 0.011, 2.1)}
      {/* North arrow, just outside the north edge. */}
      <mesh position={[0, 0.01, -0.57]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <coneGeometry args={[0.03, 0.07, 3]} />
        <meshStandardMaterial color="#c0392b" />
      </mesh>
      {showRain && <Rain intensity={state.rain} animate={!reducedMotion} />}
    </group>
  );
}

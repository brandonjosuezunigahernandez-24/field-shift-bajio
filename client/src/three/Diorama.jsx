import { Line } from '@react-three/drei';
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
import { pointInPolygon } from '../map/polygon.js';
import { clamp, surfaceFrame } from './geo.js';
import { modelMaterial } from './mergeModels.js';
import { useModelGeometries } from './models.js';
import { soilTexture, strataTexture } from './textures.js';
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
const TERRAIN_REPEAT = 10; // the soil texture tiles 10 times across the 1 km block
const SKIRT_REPEAT = 6; // strata texture tiles per block side
const MAX_PLANTS = 900;
const OUTSIDE_GROUND = [0.55, 0.5, 0.36]; // land around a drawn parcel: brush and dirt roads
const EDGE = 0.49; // keep plants and the outline on the block

// Plants for a drawn parcel: a grid over its bounding box, kept only inside the outline.
// The spacing adapts so a small 2 ha plot and a large 60 ha one both look planted.
function plantsInside(outline, random) {
  let area = 0;
  for (let i = 0; i < outline.length; i++) {
    const [x1, z1] = outline[i];
    const [x2, z2] = outline[(i + 1) % outline.length];
    area += x1 * z2 - x2 * z1;
  }
  area = Math.abs(area) / 2;
  const step = clamp(Math.sqrt(area / 350), 0.009, 0.04);
  const xs = outline.map((p) => p[0]);
  const zs = outline.map((p) => p[1]);
  const list = [];
  for (let z = Math.max(Math.min(...zs), -EDGE); z <= Math.min(Math.max(...zs), EDGE); z += step) {
    for (let x = Math.max(Math.min(...xs), -EDGE); x <= Math.min(Math.max(...xs), EDGE); x += step) {
      const px = x + (random() - 0.5) * step * 0.3;
      const pz = z + (random() - 0.5) * step * 0.3;
      if (list.length < MAX_PLANTS && pointInPolygon([px, pz], outline)) {
        list.push({ x: px, z: pz, yaw: random() * Math.PI * 2, size: 0.85 + random() * 0.3 });
      }
    }
  }
  return list;
}

// Farmhouse and trees go on the first free spots outside the parcel.
const SCENERY_SPOTS = [
  [0.36, -0.36], [-0.36, -0.36], [0.36, 0.36], [-0.36, 0.36],
  [-0.46, 0.46], [0.47, 0.2], [-0.47, -0.3], [0.2, 0.47], [-0.2, -0.47], [0.46, -0.1],
];

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
  const uvs = new Float32Array(tam * tam * 2);
  for (let row = 0; row < tam; row++) {
    for (let col = 0; col < tam; col++) {
      uvs.set([(col / (tam - 1)) * TERRAIN_REPEAT, (1 - row / (tam - 1)) * TERRAIN_REPEAT], (row * tam + col) * 2);
    }
  }
  geometry.setIndex(index);
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
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
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(vertices * 2), 2));
  return geometry;
}

function writeSkirt(geometry, terrainPositions, tam, colors) {
  const ring = perimeter(tam);
  const pos = geometry.attributes.position.array;
  const col = geometry.attributes.color.array;
  const uv = geometry.attributes.uv.array;
  let k = 0;
  // u: distance along the edge (so the strata tile around the block); v: 0 bottom, 1 top.
  const put = (x, y, z, c, u = 0, v = 0) => {
    pos.set([x, y, z], k * 3);
    col.set([c.r, c.g, c.b], k * 3);
    uv.set([u, v], k * 2);
    k++;
  };
  let along = 0;
  const top = (id) => [terrainPositions[id * 3], terrainPositions[id * 3 + 1], terrainPositions[id * 3 + 2]];
  for (let n = 0; n < ring.length - 1; n++) {
    const [ax, ay, az] = top(ring[n]);
    const [bx, by, bz] = top(ring[n + 1]);
    const ua = along * SKIRT_REPEAT;
    along += Math.hypot(bx - ax, bz - az);
    const ub = along * SKIRT_REPEAT;
    put(ax, ay, az, colors.top, ua, 1);
    put(ax, -BASE, az, colors.sub, ua, 0);
    put(bx, by, bz, colors.top, ub, 1);
    put(bx, by, bz, colors.top, ub, 1);
    put(ax, -BASE, az, colors.sub, ua, 0);
    put(bx, -BASE, bz, colors.sub, ub, 0);
  }
  for (const [x, z] of [[-0.5, -0.5], [0.5, 0.5], [0.5, -0.5], [-0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    put(x, -BASE, z, colors.sub);
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
  geometry.attributes.uv.needsUpdate = true;
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

// sections: drawn parcels [{ id, cultivo, color, outline: [[x, z], ...] }] in diorama units.
// Without sections the whole block is one field of `cultivo`.
export default function Diorama({ lat, lon, terreno, clima, suelo, anio, cultivo, sections = [], showRain, reducedMotion }) {
  const invalidate = useThree((s) => s.invalidate);
  const models = useModelGeometries();
  const groupRef = useRef();
  const cropMeshes = useRef(new Map()); // field key -> InstancedMesh

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

  // --- fields: each drawn parcel with its own crop, or the whole block as one field ---
  // Plant positions depend only on the shapes, so changing a crop keeps the same plants.
  const shapesKey = sections.map((sec) => sec.outline.flat().join(',')).join('|');
  const outlines = useMemo(() => sections.map((sec) => sec.outline), [shapesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const plantsByField = useMemo(() => {
    const seed = Math.round(lat * 1000) ^ Math.round(lon * 1000);
    if (outlines.length) {
      // Where two parcels overlap, the most recent one is the one planted.
      return outlines.map((outline, i) =>
        plantsInside(outline, mulberry32(seed + i * 7919)).filter(
          (p) => !outlines.slice(i + 1).some((later) => pointInPolygon([p.x, p.z], later))
        )
      );
    }
    const random = mulberry32(seed);
    const list = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const x = (c / (GRID - 1) - 0.5) * FIELD + (random() - 0.5) * 0.012;
        const z = (r / (GRID - 1) - 0.5) * FIELD + (random() - 0.5) * 0.012;
        if (x > 0.22 && z < -0.22) continue; // farmhouse yard (north-east)
        list.push({ x, z, yaw: random() * Math.PI * 2, size: 0.85 + random() * 0.3 });
      }
    }
    return [list];
  }, [lat, lon, outlines]);
  const fields = (sections.length ? sections : [{ id: 0, cultivo, color: null }]).map((sec, i) => ({
    key: `${sec.id}:${sec.cultivo}`,
    cultivo: sec.cultivo,
    plants: plantsByField[i] ?? [],
  }));

  // Which terrain vertices fall inside any drawn parcel (null: no parcels, all is "field").
  const insideMask = useMemo(() => {
    if (!outlines.length) return null;
    const mask = new Uint8Array(tam * tam);
    for (let row = 0; row < tam; row++) {
      for (let col = 0; col < tam; col++) {
        const pt = [col / (tam - 1) - 0.5, row / (tam - 1) - 0.5];
        mask[row * tam + col] = outlines.some((o) => pointInPolygon(pt, o)) ? 1 : 0;
      }
    }
    return mask;
  }, [outlines, tam]);

  const sceneryAt = useMemo(() => {
    const free = SCENERY_SPOTS.filter(([x, z]) => !outlines.some((o) => pointInPolygon([x, z], o)));
    return { casa: free[0], arboles: free.slice(1, 4) };
  }, [outlines]);

  // Exaggerated like the relief, so a 0.5 m bean is still visible: 0.022 to 0.045 of the side.
  const cropGeometry = (id) => models[id] ?? models.maiz;
  const cropScale = (geometry) => {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const realHeight = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
    return clamp(realHeight * 0.022, 0.022, 0.045) / realHeight;
  };

  // Ground: tilled soil on top, soil layers on the sides (procedural, see textures.js), tinted by
  // the vertex colors. Models: the texture baked in Blender (modelMaterial, shared and cached).
  const groundMaterial = useMemo(() => new MeshStandardMaterial({ vertexColors: true, map: soilTexture(), roughness: 1 }), []);
  const soilMaterial = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, map: strataTexture(), roughness: 1, side: DoubleSide }),
    []
  );
  useEffect(() => () => { groundMaterial.dispose(); soilMaterial.dispose(); }, [groundMaterial, soilMaterial]);

  const state = useMemo(() => yearState(clima, anio), [clima, anio]);
  const soil = useMemo(() => soilColors(suelo), [suelo]);

  // Writes every buffer from the current heights, year and soil. Cheap: ~4k vertices + ~450
  // instance matrices, and it only runs when something changes (or during the 0.9 s morph).
  const redraw = () => {
    const t = ease(morph.current);
    for (let i = 0; i < currentY.length; i++) currentY[i] = targetY[i] * t;

    const ground = linear(state.ground);
    const outside = linear(OUTSIDE_GROUND.map((v, k) => v * 0.7 + state.ground[k] * 0.3));
    const pos = terrainGeometry.attributes.position.array;
    const col = terrainGeometry.attributes.color.array;
    for (let i = 0; i < currentY.length; i++) {
      pos[i * 3 + 1] = currentY[i];
      const shade = 0.92 + currentY[i] * 1.5 + noise[i];
      const c = !insideMask || insideMask[i] ? ground : outside;
      col[i * 3] = c.r * shade;
      col[i * 3 + 1] = c.g * shade;
      col[i * 3 + 2] = c.b * shade;
    }
    terrainGeometry.attributes.position.needsUpdate = true;
    terrainGeometry.attributes.color.needsUpdate = true;
    terrainGeometry.computeVertexNormals();
    terrainGeometry.computeBoundingSphere();
    writeSkirt(skirtGeometry, pos, tam, { top: linear(soil.top), sub: linear(soil.sub) });

    const dummy = new Object3D();
    const tint = linear(state.tint);
    const g = state.growth;
    for (const field of fields) {
      const mesh = cropMeshes.current.get(field.key);
      if (!mesh) continue;
      const scale = cropScale(cropGeometry(field.cultivo));
      field.plants.forEach((p, i) => {
        const sz = scale * p.size;
        dummy.position.set(p.x, heightAt(currentY, tam, p.x, p.z), p.z);
        dummy.rotation.set(0, p.yaw, 0);
        dummy.scale.set(sz * (0.75 + 0.25 * g), sz * g, sz * (0.75 + 0.25 * g));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, tint);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    invalidate();
  };

  // Redraw when the year, crops, soil or relief change.
  const fieldsKey = fields.map((fld) => fld.key).join('|');
  useLayoutEffect(redraw, [state, soil, fieldsKey, terrainGeometry, plantsByField, targetY, insideMask]); // eslint-disable-line react-hooks/exhaustive-deps

  // Parcel outlines draped on the final relief, a little above so they never hide in the ground.
  const drape = (outline) => {
    const pts = [];
    const ring = [...outline, outline[0]];
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, z1] = ring[i];
      const [x2, z2] = ring[i + 1];
      const steps = Math.max(2, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.02));
      for (let s = 0; s < steps; s++) {
        const x = clamp(x1 + ((x2 - x1) * s) / steps, -EDGE, EDGE);
        const z = clamp(z1 + ((z2 - z1) * s) / steps, -EDGE, EDGE);
        pts.push([x, heightAt(targetY, tam, x, z) + 0.006, z]);
      }
    }
    pts.push(pts[0]);
    return pts;
  };
  const outlinePoints = useMemo(() => outlines.map(drape), [outlines, targetY, tam]); // eslint-disable-line react-hooks/exhaustive-deps

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
        material={modelMaterial(models[id])}
        position={[x, heightAt(targetY, tam, x, z), z]}
        rotation={[0, yaw, 0]}
        scale={scale}
        raycast={() => null}
      />
    );

  return (
    // Clicks on the diorama must not fall through to the globe behind it.
    <group ref={groupRef} quaternion={quaternion} scale={SIZE} onClick={(e) => e.stopPropagation()}>
      <mesh geometry={terrainGeometry} material={groundMaterial} />
      <mesh geometry={skirtGeometry} material={soilMaterial} raycast={() => null} />
      {/* One InstancedMesh per field: one draw call per parcel, whatever its number of plants. */}
      {fields.map((field) => (
        <instancedMesh
          key={field.key}
          ref={(mesh) => {
            if (mesh) cropMeshes.current.set(field.key, mesh);
            else cropMeshes.current.delete(field.key);
          }}
          args={[cropGeometry(field.cultivo), modelMaterial(cropGeometry(field.cultivo)), field.plants.length]}
          raycast={() => null}
          frustumCulled={false}
          onUpdate={redraw}
        />
      ))}
      {sceneryAt.casa && scenery('casa', ...sceneryAt.casa, 0.008, 0.3)}
      {sceneryAt.arboles.map(([x, z], i) => scenery('arbol', x, z, 0.01 + i * 0.001, i * 1.3))}
      {outlinePoints.map((points, i) => (
        <Line key={sections[i]?.id ?? i} points={points} color={sections[i]?.color ?? '#f2c94c'} lineWidth={3} raycast={() => null} />
      ))}
      {/* North arrow, just outside the north edge. */}
      <mesh position={[0, 0.01, -0.57]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <coneGeometry args={[0.03, 0.07, 3]} />
        <meshStandardMaterial color="#c0392b" />
      </mesh>
      {showRain && <Rain intensity={state.rain} animate={!reducedMotion} />}
    </group>
  );
}

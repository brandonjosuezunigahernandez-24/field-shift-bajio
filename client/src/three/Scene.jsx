import { OrbitControls, Stars } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Object3D, Quaternion, Vector3 } from 'three';
import Diorama, { BASE, SIZE } from './Diorama.jsx';
import { latLonToXYZ, surfaceFrame } from './geo.js';
import Globe from './Globe.jsx';

const FLY_SECONDS = 1.8;
const HOME = latLonToXYZ(21, -101, 2.8); // start with Mexico facing the farmer
const WORLD_UP = new Vector3(0, 1, 0);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// Where the camera goes for each view.
function destinationFor(view, point) {
  if (!point) return { pos: new Vector3(...HOME), target: new Vector3(), up: WORLD_UP.clone() };
  const frame = surfaceFrame(point.lat, point.lon);
  const up = new Vector3(...frame.up);
  if (view === 'globe') {
    return { pos: up.clone().multiplyScalar(2.6), target: new Vector3(), up: WORLD_UP.clone() };
  }
  const south = new Vector3(...frame.south);
  const center = up.clone().multiplyScalar(1 + BASE * SIZE);
  return {
    // Looking at the diorama from the south and above, so north is "up" on screen.
    pos: center.clone().addScaledVector(up, 0.07).addScaledVector(south, 0.085),
    target: center,
    up,
  };
}

// Flies the camera between views. While flying there are no OrbitControls mounted, so
// nothing fights the animation. Directions are slerped around the globe center, so the path
// never cuts through the Earth, and it arcs higher for far jumps.
function CameraRig({ flightKey, destination, onArrive, reducedMotion }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const lastTarget = useRef(new Vector3());
  const flight = useRef(null);

  useEffect(() => {
    flight.current = {
      key: flightKey,
      t: reducedMotion ? 1 : 0,
      fromPos: camera.position.clone(),
      fromTarget: lastTarget.current.clone(),
      fromUp: camera.up.clone(),
      ...destination,
    };
    invalidate();
  }, [flightKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    const f = flight.current;
    if (!f) return;
    f.t = Math.min(1, f.t + Math.min(delta, 0.1) / FLY_SECONDS);
    const k = ease(f.t);

    const d0 = f.fromPos.clone().normalize();
    const d1 = f.pos.clone().normalize();
    const turn = new Quaternion().slerp(new Quaternion().setFromUnitVectors(d0, d1), k);
    const angle = d0.angleTo(d1);
    const radius = f.fromPos.length() + (f.pos.length() - f.fromPos.length()) * k + Math.sin(Math.PI * k) * angle * 0.6;
    camera.position.copy(d0.applyQuaternion(turn).multiplyScalar(radius));

    const upTurn = new Quaternion().slerp(new Quaternion().setFromUnitVectors(f.fromUp.clone().normalize(), f.up), k);
    camera.up.copy(f.fromUp).normalize().applyQuaternion(upTurn);

    const target = f.fromTarget.clone().lerp(f.target, k);
    camera.lookAt(target);

    if (f.t >= 1) {
      camera.up.copy(f.up);
      lastTarget.current.copy(f.target);
      flight.current = null;
      onArrive(f.key);
    } else {
      invalidate();
    }
  });
  return null;
}

// Light that follows the camera: it shines from above-right of the camera toward where the
// camera looks, so the globe side you see and the walls of the diorama are always lit.
function CameraLight() {
  const camera = useThree((s) => s.camera);
  const target = useMemo(() => new Object3D(), []);
  return (
    <primitive object={camera}>
      <primitive object={target} position={[0, 0, -1]} />
      <directionalLight position={[0.6, 0.8, 0.3]} intensity={2.2} target={target} />
    </primitive>
  );
}

export default function Scene({ view, point, onPick, diorama, reducedMotion }) {
  const flightKey = point ? `${view}:${point.lat}:${point.lon}` : 'home';
  const destination = useMemo(() => destinationFor(view, point), [flightKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [arrivedKey, setArrivedKey] = useState(null);
  const flying = arrivedKey !== flightKey;
  const inParcel = view === 'parcel' && point;

  return (
    <>
      <color attach="background" args={['#05070d']} />
      <ambientLight intensity={0.7} />
      <CameraLight />
      <Stars radius={40} depth={20} count={1500} factor={3} saturation={0} speed={0} />
      <Globe onPick={onPick} />
      {point && (
        <Suspense fallback={null}>
          <Diorama
            key={`${point.lat}:${point.lon}`}
            lat={point.lat}
            lon={point.lon}
            showRain={inParcel && !flying}
            reducedMotion={reducedMotion}
            {...diorama}
          />
        </Suspense>
      )}
      <CameraRig flightKey={flightKey} destination={destination} onArrive={setArrivedKey} reducedMotion={reducedMotion} />
      {!flying && (
        <OrbitControls
          key={flightKey} // fresh controls after each flight, built with the new camera.up
          makeDefault
          target={destination.target}
          enablePan={false}
          enableDamping
          dampingFactor={0.12}
          rotateSpeed={inParcel ? 0.6 : 0.4}
          zoomSpeed={0.8}
          minDistance={inParcel ? 0.03 : 1.25}
          maxDistance={inParcel ? 0.4 : 5}
          maxPolarAngle={inParcel ? 1.35 : Math.PI}
        />
      )}
    </>
  );
}

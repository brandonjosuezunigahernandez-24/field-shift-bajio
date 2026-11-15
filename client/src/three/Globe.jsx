import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Suspense } from 'react';
import { AdditiveBlending, BackSide, SRGBColorSpace } from 'three';
import { xyzToLatLon } from './geo.js';

// NASA Blue Marble from GIBS, downloaded once by client/scripts/fetch-earth-texture.js.
const EARTH_TEXTURE = '/textures/tierra_bluemarble.jpg';
// 96 x 64 segments: smooth silhouette for ~12k triangles.
const SEGMENTS = [96, 64];
// Clicks after dragging more than this many pixels are rotations, not a pick.
const CLICK_TOLERANCE_PX = 5;

function EarthMaterial() {
  const gl = useThree((s) => s.gl);
  const map = useTexture(EARTH_TEXTURE, (texture) => {
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
  });
  return <meshStandardMaterial map={map} roughness={1} metalness={0} />;
}

export default function Globe({ onPick }) {
  const handleClick = (event) => {
    if (event.delta > CLICK_TOLERANCE_PX) return;
    event.stopPropagation();
    onPick(xyzToLatLon(event.point.toArray()));
  };

  return (
    <group>
      <mesh onClick={handleClick}>
        <sphereGeometry args={[1, ...SEGMENTS]} />
        {/* Plain ocean blue while the texture loads, so the globe never pops in empty. */}
        <Suspense fallback={<meshStandardMaterial color="#1d3b6b" roughness={1} />}>
          <EarthMaterial />
        </Suspense>
      </mesh>
      {/* Thin atmosphere halo: one cheap back-faced sphere, no shaders. */}
      <mesh scale={1.035} raycast={() => null}>
        <sphereGeometry args={[1, 48, 32]} />
        <meshBasicMaterial color="#3d7fe0" transparent opacity={0.35} side={BackSide} depthWrite={false} blending={AdditiveBlending} />
      </mesh>
    </group>
  );
}

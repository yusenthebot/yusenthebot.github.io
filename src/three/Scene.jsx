import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import useVStore from "./store.js";
import VRobot from "./VRobot.jsx";
import CameraRig from "./CameraRig.jsx";
import PostChain from "./effects/PostChain.jsx";
import useInputs from "./useInputs.js";

// useInputs needs the r3f context (gl.domElement), so it lives in a null
// component mounted inside the Canvas.
function InputBridge() {
  useInputs();
  return null;
}

// Lit for a ~7.5-head FREE-STANDING figure (no cradle): feet flat on the floor
// at y~0, crown at y~2.8, mid-body ~y1.4. The rig is raised and spread up the
// full height so the light-gray panels read as bright highlight masses head-to-
// shin while the black skeleton/joints stay in shadow — the 8x8 dither needs
// that bright/dark separation to sculpt. Grayscale lights only.
function Lights() {
  return (
    <>
      {/* ambient floor of light, dim and neutral */}
      <ambientLight intensity={0.32} color="#ffffff" />
      {/* strong white key, high upper-left — aimed down the full standing height
          so the chest/thigh/shin panels carry the bright mass; shadow frustum
          spans the floor up past the crown */}
      <directionalLight
        position={[-4.6, 6.5, 5.2]}
        intensity={3.0}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={22}
        shadow-camera-left={-3.5}
        shadow-camera-right={3.5}
        shadow-camera-top={3.6}
        shadow-camera-bottom={-0.4}
        shadow-bias={-0.0005}
      />
      {/* dim fill from camera-right, mid-body height — keeps the shaded side
          readable without flattening the panel highlights */}
      <directionalLight position={[5.2, 2.6, 4.2]} intensity={0.42} color="#cccccc" />
      {/* hard rim from behind-right, high — carves the full silhouette edge from
          helmet down the arm and thigh shells */}
      <directionalLight position={[4.2, 4.6, -5.0]} intensity={2.6} color="#ffffff" />
      {/* second rim, behind-left and lower — picks out the far shoulder + shin line */}
      <directionalLight position={[-5.0, 2.4, -4.2]} intensity={1.1} color="#eeeeee" />
      {/* near point at chest height — visor specular streak + chest plastron highlight */}
      <pointLight position={[1.0, 2.2, 3.0]} intensity={2.2} distance={8} decay={2} color="#ffffff" />
      {/* FRONT FILL at WAIST height — lifts the recessed midsection (abdomen +
          pelvis top) out of the key light's cast shadow so the chest->pelvis front
          reads as a continuous lit surface, NOT a black band that severs the upper
          and lower body under the 1-bit dither. No shadow casting (fill only). */}
      <pointLight position={[0, 1.5, 2.8]} intensity={2.0} distance={6} decay={2} color="#ffffff" />
      {/* soft front-centre fill, low intensity, so dead-front recessed panels never
          crush to pure black (the dither has no mid-tone there otherwise) */}
      <directionalLight position={[0.4, 1.5, 5.5]} intensity={0.95} color="#ffffff" />
      {/* LOW UP-FILL — a soft light from below-front aimed UP at the body, so the
          downward-facing under-ledges (the waist step where the chest/midriff meets
          the recessed pelvis, the chin, shell undersides) get light and don't crush
          to black under the dither. This is what finally clears the "上下肢脱节" band:
          the shadowed step is lit from beneath. Low intensity so it doesn't wash
          out the dramatic top-key contrast. */}
      <pointLight position={[0, 0.7, 3.0]} intensity={1.6} distance={7} decay={2} color="#ffffff" />
    </>
  );
}

// A painted RADIAL contact shadow instead of a lit ground plane. The old lit
// plane caught the directional/fill lights at grazing angle across its whole
// recede, lifting a wide swath just above the dither's shadow floor — that read
// as a hard horizontal dithered BAND across the mid-panel. Here the floor is an
// UNLIT (basic) disc textured with a canvas radial gradient: a soft dark blob
// directly under the planted feet that falls off to PURE BLACK well within the
// frame. Result: a subtle under-foot grounding shadow, solid black everywhere
// else, no band. The gradient is generated in-JS (no network asset). Still a
// mesh at y=0 so ground clicks resolve as pointer-missed for the robot group.
function makeContactGradient() {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  // solid black base so the disc's outer ring is pure void
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);
  // an ELLIPTICAL grounding pool: a faint gray core (the soft shadow / floor
  // contact glow under the feet) fading to black. Kept dim so the lit core
  // sits low — a whisper of grounding, never a panel-wide gray field.
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, "rgba(40,40,40,1)");
  g.addColorStop(0.35, "rgba(20,20,20,1)");
  g.addColorStop(0.7, "rgba(5,5,5,1)");
  g.addColorStop(1.0, "rgba(0,0,0,1)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function Floor() {
  const tex = useMemo(() => makeContactGradient(), []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
      {/* a compact disc under the feet — wide enough to read as ground, small
          enough that its faded black edge stays inside the void, not a band */}
      <planeGeometry args={[6, 6]} />
      <meshBasicMaterial map={tex} toneMapped={false} depthWrite={false} transparent />
    </mesh>
  );
}

// Scene composes the whole maintenance bay: lights + floor + V + camera rig +
// post chain + input grammar. `children` stays open for future overlays.
export default function Scene({ children }) {
  const [frameloop, setFrameloop] = useState("always");

  // pause the render loop entirely while the tab is hidden
  useEffect(() => {
    const onVis = () => setFrameloop(document.hidden ? "never" : "always");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // performance tier: reduced-motion wins, then coarse pointers drop a tier
  useEffect(() => {
    const { setQuality } = useVStore.getState();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setQuality("static");
    } else if (window.matchMedia("(pointer: coarse)").matches) {
      setQuality("reduced");
    }
  }, []);

  return (
    <Canvas
      dpr={[1, 2]}
      shadows
      frameloop={frameloop}
      camera={{ position: [3.2, 1.95, 6.6], fov: 38 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%", background: "#050505" }}
    >
      <color attach="background" args={["#050505"]} />
      <Lights />
      <Floor />
      <VRobot />
      <CameraRig />
      <PostChain />
      <InputBridge />
      {children}
    </Canvas>
  );
}

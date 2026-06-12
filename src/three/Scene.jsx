import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
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

function Lights() {
  return (
    <>
      {/* ambient floor of light, dim and neutral */}
      <ambientLight intensity={0.18} color="#ffffff" />
      {/* white key light, upper-left */}
      <directionalLight
        position={[-4, 6, 4]}
        intensity={2.1}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      {/* dim fill from camera-right to keep shadows readable, not flat */}
      <directionalLight position={[5, 2, 4]} intensity={0.35} color="#cccccc" />
      {/* hard rim from behind-right to carve the silhouette */}
      <directionalLight position={[4, 3, -5]} intensity={1.4} color="#ffffff" />
    </>
  );
}

function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[40, 40]} />
      <meshStandardMaterial color="#0a0a0a" metalness={0.1} roughness={0.95} />
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
      camera={{ position: [3.2, 2.6, 4.4], fov: 38 }}
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

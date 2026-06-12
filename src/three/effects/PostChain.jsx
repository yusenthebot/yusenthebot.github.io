import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import useVStore from "../store.js";
import DitherEffect from "./DitherEffect.jsx";

// Chain order is the contract (DESIGN-V8-TEARDOWN pillar B): bloom must run
// BEFORE the dither so the core's bloomed pixels exceed uBypassLuma and escape
// the 1-bit threshold; vignette frames the final image. Bloom is a convolution
// effect so the composer isolates it in its own pass, keeping the dither's
// mainUv glitch legal.
export default function PostChain() {
  const quality = useVStore((s) => s.quality);
  const ditherRef = useRef(null);

  useFrame(() => {
    // static tier: one posed frame is enough — skip per-frame uniform churn
    if (quality === "static") return;
    const effect = ditherRef.current;
    if (!effect) return;
    // read-only: App owns the glitch lifecycle (set + decay); two writers fight
    effect.uniforms.get("uGlitch").value = useVStore.getState().glitch;
  });

  const reduced = quality === "reduced";
  return (
    <EffectComposer multisampling={reduced ? 0 : 8}>
      {reduced ? null : (
        <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.06} intensity={1.2} />
      )}
      <DitherEffect ref={ditherRef} scale={reduced ? 1.5 : 1} />
      <Vignette darkness={0.6} />
    </EffectComposer>
  );
}

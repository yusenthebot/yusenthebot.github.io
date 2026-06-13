import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
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
  const dpr = useThree((s) => s.viewport.dpr);
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
  // Composer buffers are device-pixel sized, so scale 1 = a 1-device-px Bayer
  // cell (fine grain) at dpr <= 2; the dpr/2 guard only kicks in beyond that.
  const ditherScale = Math.max(1, dpr / 2);
  return (
    <EffectComposer multisampling={reduced ? 0 : 8}>
      {reduced ? null : (
        <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.06} intensity={1.2} />
      )}
      <DitherEffect ref={ditherRef} scale={ditherScale} />
      <Vignette darkness={0.5} />
    </EffectComposer>
  );
}

import { useEffect, useMemo } from "react";
import { Uniform } from "three";
import { BlendFunction, Effect } from "postprocessing";

// 8x8 Bayer ordered dithering — the site's visual signature. Three tone zones:
//   luma <= uFloor          -> pure black. The void stays void: no dot lattice
//                              over the background, dither is shading only.
//   uFloor..uBypassLuma     -> 1-bit Bayer. Luma is renormalized above the
//                              floor and gamma-lifted (uGamma < 1) so midtones
//                              spread across the threshold range — flat areas
//                              read as density gradients, not a 50% checker.
//   luma > uBypassLuma      -> smooth grayscale. Bloom pushes the emissive
//                              core/eye rings over that line, so they alone
//                              keep smooth gradients ("breaking the dither").
// The Bayer cell is gl_FragCoord-space: buffers are device-pixel sized, so
// uScale=1 keeps the cell at ~1 device pixel — film grain, not mosaic tiles.
// uGlitch adds horizontal slice offsets + bright scan bars, mirroring the
// 2D canvas glitch (random slices, white bars at high intensity).
const fragmentShader = /* glsl */ `
  uniform float uScale;
  uniform float uBypassLuma;
  uniform float uMix;
  uniform float uGlitch;
  uniform float uFloor;
  uniform float uGamma;

  const float DITHER_BAYER_8X8[64] = float[64](
     0.0, 32.0,  8.0, 40.0,  2.0, 34.0, 10.0, 42.0,
    48.0, 16.0, 56.0, 24.0, 50.0, 18.0, 58.0, 26.0,
    12.0, 44.0,  4.0, 36.0, 14.0, 46.0,  6.0, 38.0,
    60.0, 28.0, 52.0, 20.0, 62.0, 30.0, 54.0, 22.0,
     3.0, 35.0, 11.0, 43.0,  1.0, 33.0,  9.0, 41.0,
    51.0, 19.0, 59.0, 27.0, 49.0, 17.0, 57.0, 25.0,
    15.0, 47.0,  7.0, 39.0, 13.0, 45.0,  5.0, 37.0,
    63.0, 31.0, 55.0, 23.0, 61.0, 29.0, 53.0, 21.0
  );

  float ditherHash(const in float n) {
    return fract(sin(n * 127.1 + 311.7) * 43758.5453123);
  }

  void mainUv(inout vec2 uv) {
    if (uGlitch > 0.003) {
      float tick = floor(time * 18.0);
      float slice = floor(uv.y * 22.0);
      float gate = step(1.0 - uGlitch * 0.45, ditherHash(slice * 2.31 + tick * 7.7));
      float shift = (ditherHash(slice + tick * 13.0) - 0.5) * 0.2 * uGlitch * gate;
      uv.x = fract(uv.x + shift);
    }
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float luma = dot(inputColor.rgb, vec3(0.299, 0.587, 0.114));

    if (uGlitch > 0.003) {
      float tick = floor(time * 24.0);
      float bar = step(0.96, ditherHash(floor(uv.y * 96.0) * 3.7 + tick * 11.3));
      luma = min(luma + bar * uGlitch * smoothstep(0.4, 1.0, uGlitch), 1.0);
    }

    if (luma > uBypassLuma) {
      outputColor = vec4(vec3(luma), inputColor.a);
      return;
    }

    // shadow floor: the background/void renders solid black, no dots
    if (luma <= uFloor) {
      outputColor = vec4(vec3(0.0), inputColor.a);
      return;
    }

    // tone shaping: renormalize above the floor, lift midtones
    float shaped = pow((luma - uFloor) / (1.0 - uFloor), uGamma);

    ivec2 cell = ivec2(mod(gl_FragCoord.xy / uScale, 8.0));
    float threshold = (DITHER_BAYER_8X8[cell.y * 8 + cell.x] + 0.5) / 64.0;
    float bw = shaped > threshold ? 1.0 : 0.0;
    outputColor = vec4(vec3(mix(luma, bw, uMix)), inputColor.a);
  }
`;

// kept un-exported so this module only exports a component (react-refresh)
class DitherEffectImpl extends Effect {
  constructor({ scale = 1, bypassLuma = 0.97, mix = 1, floor = 0.05, gamma = 0.78 } = {}) {
    super("DitherEffect", fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ["uScale", new Uniform(Math.max(scale, 0.001))],
        ["uBypassLuma", new Uniform(bypassLuma)],
        ["uMix", new Uniform(mix)],
        ["uGlitch", new Uniform(0)],
        ["uFloor", new Uniform(floor)],
        ["uGamma", new Uniform(gamma)],
      ]),
    });
  }
}

// ref resolves to the Effect instance; drive per-frame uniforms through it
// (effect.uniforms.get('uGlitch').value = ...) instead of prop churn.
export default function DitherEffect({ ref, scale = 1, bypassLuma = 0.97, mix = 1, floor = 0.05, gamma = 0.78 }) {
  const effect = useMemo(
    () => new DitherEffectImpl({ scale, bypassLuma, mix, floor, gamma }),
    [scale, bypassLuma, mix, floor, gamma],
  );
  useEffect(() => () => effect.dispose(), [effect]);
  return <primitive ref={ref} object={effect} dispose={null} />;
}

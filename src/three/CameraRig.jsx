import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import gsap from "gsap";
import useVStore from "./store.js";
import { focusCameraTargetFor, smoothstep } from "./Teardown.jsx";

// Camera language (DESIGN-V8-TEARDOWN pillar B): dolly / crane only, the camera
// NEVER free-orbits. useFrame is the single writer of the actual camera; GSAP
// tweens the rig's rest framing (pos/look) and sets `tweening` so the breathing
// dolly fades out instead of fighting the tween.

// Framing is authored for the FULL FREE-STANDING figure (no cradle): feet flat
// on the dark floor at y~0, crown at y~2.8 (~7.5 heads), so the body spans
// y0..2.8 and its true vertical center is ~y1.4. The right panel is a tall
// portrait, so distance is set by the body HEIGHT, not its width.

// Hero framing matches the Canvas default in Scene.jsx so mount never jumps.
// Pulled back to hold the whole standing body — crown to planted feet — at a
// slight 3/4 angle, look settled at the chest/pelvis seam (~y1.45, a touch above
// true center so the head reads without cropping the feet). fov 38 (Canvas).
const HERO_POS = new THREE.Vector3(3.2, 1.95, 6.6);
const HERO_LOOK = new THREE.Vector3(0, 1.45, 0);
// Inspection framing: dolly-in + slight crane-up onto the opened chassis. Stays
// far enough back that panels opening from head to feet stay mostly in frame; the
// look rises toward the torso/pelvis (the densest mid-body reveal) without
// losing the legs as shells cascade open down to the shins.
const INSPECT_POS = new THREE.Vector3(2.7, 2.15, 5.0);
const INSPECT_LOOK = new THREE.Vector3(0, 1.55, 0);

const BREATH_PERIOD = 7.2; // s, slow sinusoidal dolly
const BREATH_AMP = 0.02; // ±2% of camera distance
const INSPECT_START = 0.3; // depth where teardown framing begins to engage
const CRANE_LIFT = 0.28; // focus flights rise then settle — slight crane

const _target = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
const _offset = new THREE.Vector3();

// Scrub-driven rest framing: pure function of depth, blended hero -> inspect.
function scrubFramingInto(out, depth, mode) {
  const k =
    mode === "teardown"
      ? smoothstep((depth - INSPECT_START) / (1 - INSPECT_START))
      : 0;
  out.pos.lerpVectors(HERO_POS, INSPECT_POS, k);
  out.look.lerpVectors(HERO_LOOK, INSPECT_LOOK, k);
  return out;
}

export default function CameraRig() {
  const camera = useThree((s) => s.camera);
  const mode = useVStore((s) => s.mode);
  const focusPartId = useVStore((s) => s.focusPartId);
  const rigRef = useRef({
    pos: HERO_POS.clone(),
    look: HERO_LOOK.clone(),
    tweening: false,
    breath: 1,
    tl: null,
    prevMode: "idle",
  });

  useEffect(() => {
    const rig = rigRef.current;
    const wasFocus = rig.prevMode === "focus";
    rig.prevMode = mode;
    if (rig.tl) {
      rig.tl.kill();
      rig.tl = null;
    }

    if (mode === "focus" && focusPartId) {
      // focusCameraTargetFor resolves the part's LIVE world position via
      // partRefRegistry, so this flight frames the head (y~2.6), a hand (y~0.9),
      // the pelvis (y~1.5), a knee (y~0.8) or a foot (y~0.1) at the right height
      // anywhere up the standing body — chest height is no longer assumed.
      const { position, lookAt } = focusCameraTargetFor(focusPartId);
      rig.tweening = true;
      const tl = gsap.timeline({
        defaults: { ease: "power2.inOut" },
        onComplete() {
          rig.tweening = false;
          if (rig.tl === tl) rig.tl = null;
        },
      });
      // dolly on x/z over the full flight...
      tl.to(rig.pos, { x: position.x, z: position.z, duration: 1.1 }, 0);
      // ...with a slight crane: rise past the target height, then settle onto it
      tl.to(rig.pos, { y: position.y + CRANE_LIFT, duration: 0.62, ease: "power2.in" }, 0);
      tl.to(rig.pos, { y: position.y, duration: 0.48, ease: "power2.out" }, 0.62);
      tl.to(rig.look, { x: lookAt.x, y: lookAt.y, z: lookAt.z, duration: 1.1 }, 0);
      rig.tl = tl;
    } else if (wasFocus) {
      // leaving focus: fly back to whatever the scrub framing currently is
      scrubFramingInto(_target, useVStore.getState().depth, mode);
      rig.tweening = true;
      const tl = gsap.timeline({
        defaults: { ease: "power2.inOut", duration: 1.0 },
        onComplete() {
          rig.tweening = false;
          if (rig.tl === tl) rig.tl = null;
        },
      });
      tl.to(rig.pos, { x: _target.pos.x, y: _target.pos.y, z: _target.pos.z }, 0);
      tl.to(rig.look, { x: _target.look.x, y: _target.look.y, z: _target.look.z }, 0);
      rig.tl = tl;
    } else {
      // idle <-> teardown transitions are handled by the per-frame damp below
      rig.tweening = false;
    }
  }, [mode, focusPartId]);

  useEffect(
    () => () => {
      const rig = rigRef.current;
      if (rig.tl) rig.tl.kill();
    },
    [],
  );

  useFrame((state, delta) => {
    const rig = rigRef.current;
    const { depth, mode: m, quality } = useVStore.getState();
    const dt = Math.min(delta || 0.016, 0.1);

    // scrub framing: while teardown depth > 0.3, ease toward the inspection
    // framing proportional to depth; GSAP owns the framing during focus flights
    if (!rig.tweening && m !== "focus") {
      scrubFramingInto(_target, depth, m);
      const a = 1 - Math.exp(-4 * dt);
      rig.pos.lerp(_target.pos, a);
      rig.look.lerp(_target.look, a);
    }

    // breathing dolly: ±2% distance along the view axis; amplitude fades out
    // while a tween owns the framing (and under reduced motion) so they never fight
    const breathTarget = rig.tweening || quality === "static" ? 0 : 1;
    rig.breath = THREE.MathUtils.damp(rig.breath, breathTarget, 4, dt);
    const scale =
      1 +
      BREATH_AMP *
        rig.breath *
        Math.sin((state.clock.elapsedTime * Math.PI * 2) / BREATH_PERIOD);

    _offset.copy(rig.pos).sub(rig.look).multiplyScalar(scale);
    camera.position.copy(rig.look).add(_offset);
    camera.lookAt(rig.look);
  });

  return null;
}

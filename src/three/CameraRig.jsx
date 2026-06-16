import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import gsap from "gsap";
import useVStore from "./store.js";
import { focusCameraTargetFor, smoothstep } from "./Teardown.jsx";

// Camera language (DESIGN-V8-TEARDOWN pillar B): dolly / crane + a CLAMPED
// ELEVATION ORBIT. The horizontal turn lives on the robot (store.yaw); the
// camera only ever raises/lowers around the look target by store.pitch (a
// trackball's vertical axis), so we never get a true free-orbit / gimbal flip.
// useFrame is the single writer of the actual camera; GSAP tweens the rig's
// rest framing (pos/look) and sets `tweening` so the breathing dolly fades out
// instead of fighting the tween. Pitch composes on top of every framing.

// Framing is authored for the FULL FREE-STANDING figure (no cradle): feet flat
// on the dark floor at y~0, crown at y~2.8 (~7.5 heads), so the body spans
// y0..2.8 and its true vertical center is ~y1.4. The right panel is a tall
// portrait, so distance is set by the body HEIGHT, not its width.

// FRAMING. The ENTRY (CLOSE) looks directly AT THE HEAD so the head is the frame
// CENTRE on ANY panel aspect — a fixed look at the head can never push the head out
// of frame (a chest-look does, on a short panel). The robot's head centre is ~y2.3
// (crown ~2.65, chin ~2.0). HERO frames the whole standing body; INSPECT frames the
// opened chassis during teardown. (An earlier aspect-fit that divided the distance
// by the panel aspect blew up on extreme wide/short panels — reverted to robust
// fixed positions; head-centred CLOSE is what keeps the head visible everywhere.)
const HERO_POS = new THREE.Vector3(3.2, 1.95, 6.6);
const HERO_LOOK = new THREE.Vector3(0, 1.45, 0);
// CLOSE entry (store.framing = 0): centred ON THE HEAD (look y2.3), dollied close so
// the head + upper body fill the panel with the head dead-centre. Wheel/pinch
// dollies out to HERO (full body).
const CLOSE_POS = new THREE.Vector3(1.06, 2.3, 2.27);
const CLOSE_LOOK = new THREE.Vector3(0, 2.3, 0);
const INSPECT_POS = new THREE.Vector3(2.7, 2.15, 5.0);
const INSPECT_LOOK = new THREE.Vector3(0, 1.55, 0);

const BREATH_PERIOD = 7.2; // s, slow sinusoidal dolly
const BREATH_AMP = 0.02; // ±2% of camera distance
const INSPECT_START = 0.3; // depth where teardown framing begins to engage
const CRANE_LIFT = 0.28; // focus flights rise then settle — slight crane

const _target = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
const _offset = new THREE.Vector3();
// scratch for the framing blend (CLOSE -> HERO) before the teardown dolly
const _baseP = new THREE.Vector3();
const _baseL = new THREE.Vector3();
// scratch for the clamped elevation orbit: spin the camera offset about the
// horizontal axis perpendicular to the view so the camera rises/falls while
// still aiming at the look target.
const _orbitAxis = new THREE.Vector3();
const _orbitQuat = new THREE.Quaternion();
const _WORLD_UP = new THREE.Vector3(0, 1, 0);

// Scrub-driven rest framing: blend CLOSE->HERO by `framing` (the wheel/pinch
// dolly), THEN ride the teardown base->inspect dolly on top.
function scrubFramingInto(out, depth, mode, framing) {
  const f = smoothstep(Math.min(1, Math.max(0, framing)));
  _baseP.lerpVectors(CLOSE_POS, HERO_POS, f);
  _baseL.lerpVectors(CLOSE_LOOK, HERO_LOOK, f);
  const k =
    mode === "teardown"
      ? smoothstep((depth - INSPECT_START) / (1 - INSPECT_START))
      : 0;
  out.pos.lerpVectors(_baseP, INSPECT_POS, k);
  out.look.lerpVectors(_baseL, INSPECT_LOOK, k);
  return out;
}

export default function CameraRig() {
  const camera = useThree((s) => s.camera);
  const mode = useVStore((s) => s.mode);
  const focusPartId = useVStore((s) => s.focusPartId);
  const rigRef = useRef({
    pos: new THREE.Vector3(3.2, 1.95, 6.6),
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
      scrubFramingInto(_target, useVStore.getState().depth, mode, useVStore.getState().framing);
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
    const { depth, mode: m, quality, pitch, framing } = useVStore.getState();
    const dt = Math.min(delta || 0.016, 0.1);

    // scrub framing: blend CLOSE->HERO by the wheel/pinch `framing`, then ease
    // toward the inspection framing by teardown depth; GSAP owns it during focus
    if (!rig.tweening && m !== "focus") {
      scrubFramingInto(_target, depth, m, framing);
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

    // Clamped elevation orbit: spin the offset about the camera's "right" axis
    // (perpendicular to both the view and world-up) so the camera cranes up to
    // look DOWN on V (pitch > 0) or drops under to look UP (pitch < 0), always
    // re-aiming at the look target. The store clamps pitch to [-0.45, 0.55], so
    // this can never flip past the horizon — pillar B's no-free-orbit rule holds.
    const p = Number.isFinite(pitch) ? pitch : 0;
    if (p !== 0) {
      _orbitAxis.crossVectors(_offset, _WORLD_UP);
      if (_orbitAxis.lengthSq() > 1e-6) {
        _orbitAxis.normalize();
        _orbitQuat.setFromAxisAngle(_orbitAxis, p);
        _offset.applyQuaternion(_orbitQuat);
      }
    }

    camera.position.copy(rig.look).add(_offset);
    camera.lookAt(rig.look);
  });

  return null;
}

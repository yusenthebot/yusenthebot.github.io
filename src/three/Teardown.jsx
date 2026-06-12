import * as THREE from "three";
import gsap from "gsap";
import useVStore from "./store.js";
import {
  openFraction as canonicalOpenFraction,
  servoEase as canonicalServoEase,
} from "./parts.js";

// Choreography law (DESIGN-V8-TEARDOWN pillar A): part pose is a PURE function
// of store depth, applied every frame. GSAP only ever tweens store depth
// (commands) and the camera — scrub-safe by construction.

// VRobot populates this with partId -> Object3D (or a React ref holding one)
// so the camera can frame real anchors without this module knowing the scene
// graph. Integration: partRefRegistry.set(part.id, object3DOrRef).
export const partRefRegistry = new Map();

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function smoothstep(x) {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}

// Single canonical servo curve lives in parts.js (VRobot renders with it);
// re-exported here so derived consumers (poseFor, labels, cable slack) can
// never diverge from what's on screen.
export { servoEase } from "./parts.js";

// Same math as VRobot: servoEase(band-clamped linear progress). Can exceed 1
// briefly (the overshoot) — hinge/slide consumers scale by it as-is.
export function openFractionFor(part, depth) {
  return canonicalServoEase(canonicalOpenFraction(depth, part && part.band ? part.band : [0, 1]));
}

// Pose for a part at a given depth. Shells hinge, internals slide, everything
// else is static. `open` is the eased fraction so consumers can derive extras
// (seam glow, cable slack) from the same value.
export function poseFor(part, depth) {
  const open = openFractionFor(part, depth);
  if (part && part.hinge) {
    return {
      kind: "hinge",
      open,
      pivot: part.hinge.pivot,
      axis: part.hinge.axis,
      angle: part.hinge.openAngle * open,
    };
  }
  if (part && part.slide) {
    return {
      kind: "slide",
      open,
      dir: part.slide.dir,
      offset: part.slide.dist * open,
    };
  }
  return { kind: "static", open, angle: 0, offset: 0 };
}

// Children lift ~0.015 units (vertical) eased in over the tail of the PARENT's
// band — secondary motion that reads as "the machine is one connected body".
// Persists past the parent band so scrubbing never pops.
const LIFT = 0.015;
const TAIL = 0.7;

export function sympatheticLift(part, depth, parts) {
  if (!part || !part.parent || !parts) return 0;
  const parent =
    typeof parts.find === "function"
      ? parts.find((p) => p.id === part.parent)
      : parts[part.parent];
  if (!parent || !parent.band) return 0;
  const [b0, b1] = parent.band;
  const tailStart = b0 + (b1 - b0) * TAIL;
  const span = Math.max(1e-6, b1 - tailStart);
  return LIFT * smoothstep((depth - tailStart) / span);
}

// Command-driven depth scrub. Tweens a local proxy and writes the store each
// tick with source 'command' (does not bump tweenToken). Self-kills if a human
// input bumped tweenToken since the tween started — last human input wins.
let activeDepthTween = null;

export function tweenDepthTo(target, opts = {}) {
  const { duration = 1.2, ease = "power2.inOut" } = opts;
  if (activeDepthTween) {
    activeDepthTween.kill();
    activeDepthTween = null;
  }
  const store = useVStore.getState();
  const startToken = store.tweenToken;
  const proxy = { depth: store.depth };
  const tween = gsap.to(proxy, {
    depth: clamp01(target),
    duration,
    ease,
    onUpdate() {
      const s = useVStore.getState();
      if (s.tweenToken !== startToken) {
        if (activeDepthTween === tween) activeDepthTween = null;
        tween.kill();
        return;
      }
      s.setDepth(proxy.depth, "command");
    },
    onComplete() {
      if (activeDepthTween === tween) activeDepthTween = null;
    },
  });
  activeDepthTween = tween;
  return tween;
}

// Camera framing for `inspect <part>`. Anchor resolution order:
//   1. partRefRegistry Object3D (live world position),
//   2. part.anchor [x,y,z] in the parts registry if present,
//   3. default head-height anchor.
// Returns fresh Vector3s — CameraRig tweens them freely.
const FOCUS_OFFSET_DIR = new THREE.Vector3(0.62, 0.34, 1).normalize();
const FOCUS_DISTANCE = 2.3;
const DEFAULT_ANCHOR = new THREE.Vector3(0, 1.2, 0);

function resolveAnchor(partId, parts, out) {
  const entry = partRefRegistry.get(partId);
  const obj = entry && (entry.isObject3D ? entry : entry.current);
  if (obj && obj.isObject3D) {
    obj.getWorldPosition(out);
    return out;
  }
  const part =
    parts && typeof parts.find === "function"
      ? parts.find((p) => p.id === partId)
      : null;
  if (part && part.anchor) {
    return out.set(part.anchor[0], part.anchor[1], part.anchor[2]);
  }
  return out.copy(DEFAULT_ANCHOR);
}

export function focusCameraTargetFor(partId, parts = null) {
  const lookAt = resolveAnchor(partId, parts, new THREE.Vector3());
  const position = lookAt.clone().addScaledVector(FOCUS_OFFSET_DIR, FOCUS_DISTANCE);
  return { position, lookAt };
}

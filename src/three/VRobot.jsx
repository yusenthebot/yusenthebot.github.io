import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { MathUtils } from "three";
import useVStore from "./store.js";
import AudioEngine from "../audio.js";
import { partRefRegistry, smoothstep } from "./Teardown.jsx";
import { PARTS, PART_INDEX, BANDED, openFraction, servoEase, openMotionFor } from "./parts.js";
import {
  brushedMetal,
  mattePolymer,
  darkPolymer,
  darkHelmet,
  darkGlass,
  emissiveCore,
  brightEmissiveSeam,
  makeLip,
  makeEmissive,
  makeFaceEmitter,
} from "./materials.js";

const HPI = Math.PI / 2;
const damp = MathUtils.damp;

// Module scope (not hooks): useFrame and the hover handlers mutate these
// every frame, which the react-hooks immutability rule forbids on
// hook-created values. VRobot is a singleton, so shared instances are fine.
const lips = new Map(PARTS.map((p) => [p.id, makeLip()]));
const scanMat = makeEmissive(2.2);
scanMat.transparent = true;
scanMat.opacity = 0.7;
// the chest status-dot trio (mirrors the 2D V's chest lights) — its own steady
// emitter, decoupled from the face so eye expression never flickers the chest.
const chestDotMat = makeEmissive(1.8);

// V's FACE emitters — independent clones so each eye + the mouth can carry its
// own intensity/opacity (blink, flare, happy-arc dim) without coupling. These
// are the white features that bloom through the dark visor and give V a
// readable, emoting face. Built bigger + brighter than the old whisper rings so
// the expression reads at hero distance; the visor itself stays dark glossy.
const faceMat = {
  L: makeFaceEmitter(2.6),
  R: makeFaceEmitter(2.6),
  mouth: makeFaceEmitter(2.2),
};

// Sympathetic lift: the registry's shells have no kinematic children of their
// own, so the "machine is one connected body" law maps to the internals each
// shell covers — they float up ~0.015 in the tail of their cover's band and
// stay lifted once the cover is open.
const REVEAL_LIFT = { chest_core_housing: "chest_plate", optic_internal: "head_shell" };
const LIFT = 0.015;
const LIFT_TAIL = 0.7;

function revealLift(id, depth) {
  const coverId = REVEAL_LIFT[id];
  if (!coverId) return 0;
  const band = PART_INDEX.get(coverId).band;
  const tail = band[0] + (band[1] - band[0]) * LIFT_TAIL;
  return LIFT * smoothstep((depth - tail) / (band[1] - tail));
}

// Per-part eased open value for INDIVIDUAL click-to-open (store.openParts[id]).
// Module scope (singleton VRobot) so the frame loop can mutate it without a
// hook; eases toward the boolean target so toggling animates with servo feel.
const perPartOpen = new Map(PARTS.map((p) => [p.id, 0]));
// precomputed open motion per part (band motion, or a synthesized outward pop)
const openMotions = new Map(PARTS.map((p) => [p.id, openMotionFor(p)]));
// non-banded, individually-openable parts get the synthesized pop. base_link is
// the non-visible ground datum (nothing to open); core uses an emissive reveal,
// not a slide — skip both so they don't twitch.
const NON_BANDED = PARTS.filter((p) => !p.band && p.id !== "base_link" && p.id !== "core");
// stable empty object so reads of a missing store.openParts don't allocate
const EMPTY_OPEN = Object.freeze({});

// Baseline pivot-group Y for the two parts the alive-idle code nudges. The pivot
// group sits at local 0 inside its origin group (which already applies the
// parts.js origin), so a breathing nudge must ride on the pivot's baseline, not
// re-apply the origin. torso's long-standing breathing line used 0.46 (the
// figure's geometry is tuned to it); the shoulder yoke had no line before, so
// its baseline is 0 — writing 0.34 here double-offset and lifted the upper body.
const TORSO_Y0 = 0.46;
const YOKE_Y0 = 0;

const childrenOf = (() => {
  const m = new Map();
  for (const p of PARTS) {
    if (!p.parent) continue;
    if (!m.has(p.parent)) m.set(p.parent, []);
    m.get(p.parent).push(p.id);
  }
  return m;
})();

function neg(v) {
  return [-v[0], -v[1], -v[2]];
}

// A simplified five-finger hand: four fingers + an offset thumb, each a slim
// dark capsule with a machined knuckle. sgn flips the thumb to the inboard side.
function Hand({ sgn, lip }) {
  const fingerX = [-0.024, -0.008, 0.008, 0.024];
  const fingerLen = [0.07, 0.082, 0.078, 0.062];
  return (
    <>
      {/* palm block */}
      <RoundedBox args={[0.085, 0.075, 0.03]} radius={0.012} position={[0, -0.03, 0]} material={darkPolymer} castShadow />
      <RoundedBox args={[0.075, 0.02, 0.026]} radius={0.006} position={[0, 0.012, 0]} material={mattePolymer} castShadow />
      {/* four fingers */}
      {fingerX.map((x, i) => (
        <group key={x} position={[x, -0.07, 0]}>
          <mesh position={[0, -fingerLen[i] / 2, 0]} material={darkPolymer} castShadow>
            <capsuleGeometry args={[0.008, fingerLen[i], 4, 8]} />
          </mesh>
          <mesh position={[0, 0, 0]} rotation-x={HPI} material={lip}>
            <cylinderGeometry args={[0.009, 0.009, 0.014, 8]} />
          </mesh>
        </group>
      ))}
      {/* thumb — offset to the inboard side, angled down */}
      <group position={[sgn * 0.045, -0.02, 0.012]} rotation-z={sgn * 0.7}>
        <mesh position={[0, -0.028, 0]} material={darkPolymer} castShadow>
          <capsuleGeometry args={[0.009, 0.05, 4, 8]} />
        </mesh>
        <mesh rotation-z={HPI} material={lip}>
          <cylinderGeometry args={[0.01, 0.01, 0.016, 8]} />
        </mesh>
      </group>
    </>
  );
}

// All geometry is authored relative to the part origin (parts.js), so hinge
// pivots in the registry line up with the visible pivot cylinders here.
// Silhouette law (REV.8): a slim FUTURIST humanoid (Optimus/Figure 02 in
// monochrome) — light matte panels OVER a visible black skeleton, EXPOSED
// black mechanical joints, segmented forearms, five-finger hands, a smooth
// dark teardrop helmet with two faint eye rings behind it and a thin white
// emissive seam at the face/neck perimeter. ~7.5 heads tall, slim limbs,
// neutral FREE-STANDING pose on its own two feet — no rig, no cradle, no
// dock; both feet planted flat on the Scene floor.
function PartMesh({ id, lip, ctx }) {
  switch (id) {
    case "base_link":
      // Free-standing: base_link is a NON-VISIBLE world/ground datum at the
      // feet. No cradle, no rig posts, no dock collar, no leveling feet — V
      // stands on its own two feet, planted flat on the Scene floor (y=0).
      return null;
    case "pelvis":
      return (
        <>
          {/* dark inner girdle structure — the hip ball joints (at x=+/-0.17,
              y=-0.1) embed in its flanks so legs + pelvis read as one continuous
              structure. Reaches UP (top r 0.28 at y=+0.22) to firmly overlap the
              torso waist bottom (world ~1.61): the trunk and hips are bridged,
              no gap. This dark core is mostly hidden under the light girdle. */}
          <mesh position={[0, 0.04, 0]} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.28, 0.26, 0.42, 24]} />
          </mesh>
          {/* LIGHT matte hip girdle — a proud lit sleeve covering the front + sides
              so the pelvis reads as a SOLID LIT form (matching chest + thighs),
              never a dark ring. Reaches UP to y=+0.25 (overlapping the lit waist
              that comes down to world ~1.61) so the lit volume is unbroken — no
              dark pinch between trunk and hips. Kept narrower in z so the hip
              actuators still read as exposed dark internals on the flanks/back. */}
          <mesh position={[0, 0.05, 0]} scale={[1, 1, 0.84]} material={mattePolymer} castShadow>
            <cylinderGeometry args={[0.285, 0.27, 0.44, 24]} />
          </mesh>
          {/* domed lit cap closing the top of the girdle into the waist overlap —
              reaches up to world ~1.9 (well into the lit waist) so the trunk-hip
              join is one continuous lit surface. */}
          <mesh position={[0, 0.26, 0]} scale={[1, 0.6, 0.84]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.285, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          </mesh>
          {/* flared lit hip yokes sweeping DOWN-OUT to meet each hip socket —
              the meat that bridges pelvis to thigh on each side. */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.15, -0.12, 0]} scale={[1, 1.2, 0.92]} material={mattePolymer} castShadow>
              <sphereGeometry args={[0.115, 20, 16]} />
            </mesh>
          ))}
          {/* light front fascia panel set flush into the girdle (machined look) */}
          <RoundedBox args={[0.24, 0.26, 0.05]} radius={0.025} position={[0, -0.04, 0.15]} material={mattePolymer} castShadow />
          {/* machined seam belt low on the girdle (hip panel break, NOT at the
              trunk join — the trunk/hip overlap stays one unbroken lit surface) */}
          <mesh position={[0, -0.1, 0]} scale={[1, 1, 0.84]} rotation-x={HPI} material={lip}>
            <torusGeometry args={[0.275, 0.008, 8, 40]} />
          </mesh>
        </>
      );
    case "pelvis_cover":
      return (
        <>
          {/* sculpted light fascia shell that slides off to expose the hip
              actuators — a single curved panel hugging the girdle front, with
              one clean machined seam, no stray bars */}
          <mesh position={[0, -0.02, 0.06]} scale={[1, 1, 0.6]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.23, 28, 20, Math.PI * 1.2, Math.PI * 0.6, Math.PI * 0.28, Math.PI * 0.5]} />
          </mesh>
          <RoundedBox args={[0.26, 0.24, 0.05]} radius={0.025} position={[0, -0.02, 0.14]} material={mattePolymer} castShadow />
          {/* one machined seam line down the fascia center */}
          <RoundedBox args={[0.016, 0.22, 0.014]} radius={0.005} position={[0, -0.02, 0.17]} material={lip} />
        </>
      );
    case "torso":
      return (
        <>
          {/* ONE SOLID LIT TRUNK. The torso link itself carries the lit chest
              -to-waist mass in mattePolymer so the body's centre is never a dark
              void — the chest plastron (chest_plate) sits OVER this, and when it
              hinges open during teardown the lit torso underneath still reads as
              a solid convex chest, not a black cavity. Slimmer/less boxy than the
              old wide frustum (top r 0.34, not 0.4) so the shoulders no longer
              over-dominate. 18-gon = smooth under the dither. */}
          <mesh position={[0, 0.08, 0]} scale={[1, 1, 0.74]} material={mattePolymer} castShadow>
            <cylinderGeometry args={[0.34, 0.3, 0.52, 18]} />
          </mesh>
          {/* convex upper-chest cap so the top of the trunk domes (pectoral mass)
              instead of reading as a flat cylinder lid under the clavicle. */}
          <mesh position={[0, 0.3, 0]} scale={[1, 0.6, 0.74]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.34, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          </mesh>
          {/* SHORT solid waist — a stout lit barrel that tapers only gently from
              the chest base (r 0.3) to the pelvis (r 0.28) and physically MEETS
              it: its bottom sits at torso y=-0.34 (world ~1.62) and overlaps the
              raised pelvis girdle top (which domes up to world ~1.85), so there is
              NO thin dark neck and NO gap — chest, waist and pelvis read as one
              continuous lit volume. */}
          <mesh position={[0, -0.18, 0]} scale={[1, 1, 0.8]} material={mattePolymer} castShadow>
            <cylinderGeometry args={[0.3, 0.28, 0.34, 18]} />
          </mesh>
          {/* internal dark core bay — kept SMALL and recessed (z back) so it only
              reads as the exposed core once the chest plastron hinges open; it no
              longer faces the camera as a dark block at idle. */}
          <RoundedBox args={[0.24, 0.24, 0.12]} radius={0.03} position={[0, 0.02, -0.04]} material={darkPolymer} />
          {/* machined seam ring at the clavicle line, tucked inside the chest */}
          <group position={[0, 0.32, 0]} rotation={[HPI, 0, 0]}>
            <mesh scale={[1, 0.74, 1]} material={lip}>
              <torusGeometry args={[0.32, 0.008, 8, 48]} />
            </mesh>
          </group>
        </>
      );
    case "chest_plate":
      return (
        <>
          {/* SOLID CONVEX PLASTRON — a FILLED chest panel, not an open ring. A
              full front-facing dome cap (theta 0..0.5π = the whole front
              hemisphere quadrant, phi a wide 0.9π arc) so the chest reads as one
              smooth lit bulge with NO dark interior facing the camera. Sits
              slightly proud of the lit torso so the two together read as a single
              convex chest mass. Tapered (scale y/z) so it's humanoid, not boxy. */}
          <mesh position={[0, 0.02, 0.05]} scale={[1, 1.12, 0.82]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.33, 40, 30, Math.PI * 1.05, Math.PI * 0.9, 0.0, Math.PI * 0.62]} />
          </mesh>
          {/* abdominal plastron — extends the lit chest panel DOWN over the upper
              waist so the chest flows into the midriff with no dark step. A
              tapered cylinder section closed at the front (matte) blending the
              dome into the waist. */}
          <mesh position={[0, -0.16, 0.02]} scale={[1, 1, 0.84]} material={mattePolymer} castShadow>
            <cylinderGeometry args={[0.3, 0.285, 0.26, 18, 1, false, Math.PI * 1.12, Math.PI * 0.76]} />
          </mesh>
          {/* SMALL dark sternum accent — a short shallow inset high on the chest
              (the one dark detail), kept narrow + short so it never reads as a
              hollow centre; the convex lit plastron dominates. */}
          <RoundedBox args={[0.07, 0.18, 0.03]} radius={0.015} position={[0, 0.08, 0.3]} material={darkPolymer} />
          {/* white emissive chest seam — the sternum accent line */}
          <RoundedBox args={[0.012, 0.22, 0.012]} radius={0.004} position={[0, 0.04, 0.33]} material={brightEmissiveSeam} />
          {/* status dot trio — same chest lights as the 2D V */}
          {[-0.05, 0, 0.05].map((x) => (
            <mesh key={x} position={[x, -0.1, 0.31]} material={chestDotMat}>
              <sphereGeometry args={[0.013, 12, 12]} />
            </mesh>
          ))}
          {/* one clean machined inner lip framing the panel's top opening edge */}
          <mesh position={[0, 0.3, 0.16]} rotation-x={HPI * 0.92} material={lip}>
            <torusGeometry args={[0.28, 0.012, 8, 40, Math.PI]} />
          </mesh>
          {/* visible hinge pivot along the bottom edge */}
          <mesh position={[0, -0.34, 0.18]} rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.42, 12]} />
          </mesh>
        </>
      );
    case "back_plate":
      return (
        <>
          {/* solid convex dorsal shell matching the plastron — a filled domed
              back panel (same closed form, mirrored), with a single central
              spine channel and no open dark interior. */}
          <mesh position={[0, 0.02, -0.05]} scale={[1, 1.12, 0.82]} rotation-y={Math.PI} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.33, 40, 30, Math.PI * 1.05, Math.PI * 0.9, 0.0, Math.PI * 0.62]} />
          </mesh>
          <mesh position={[0, -0.12, -0.04]} scale={[1, 1, 0.78]} rotation-y={Math.PI} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.31, 36, 24, Math.PI * 1.1, Math.PI * 0.8, Math.PI * 0.42, Math.PI * 0.42]} />
          </mesh>
          {/* central spine channel (dark) */}
          <RoundedBox args={[0.08, 0.3, 0.04]} radius={0.02} position={[0, 0.04, -0.3]} material={darkPolymer} />
          <mesh position={[0, 0.3, -0.16]} rotation={[HPI * 1.08, 0, Math.PI]} material={lip}>
            <torusGeometry args={[0.28, 0.012, 8, 40, Math.PI]} />
          </mesh>
          <mesh position={[0, -0.34, -0.18]} rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.42, 12]} />
          </mesh>
        </>
      );
    case "chest_core_housing":
      return (
        <>
          {[[-0.14, -0.1], [0.14, -0.1], [-0.14, 0.1], [0.14, 0.1]].map(([x, z]) => (
            <mesh key={`${x}:${z}`} position={[x, 0, z]} material={brushedMetal}>
              <cylinderGeometry args={[0.016, 0.016, 0.3, 10]} />
            </mesh>
          ))}
          <RoundedBox args={[0.34, 0.03, 0.24]} radius={0.01} position={[0, 0.16, 0]} material={darkPolymer} />
          <RoundedBox args={[0.34, 0.03, 0.24]} radius={0.01} position={[0, -0.16, 0]} material={darkPolymer} />
          <RoundedBox args={[0.3, 0.28, 0.02]} radius={0.01} position={[0, 0, -0.1]} material={darkPolymer} />
          {/* J4 connector block */}
          <RoundedBox args={[0.06, 0.04, 0.03]} radius={0.005} position={[0.1, 0.08, -0.105]} material={lip} />
        </>
      );
    case "core":
      return (
        <>
          <mesh ref={(m) => ctx.setExtra("coreMesh", m)} material={emissiveCore}>
            <sphereGeometry args={[0.11, 32, 32]} />
          </mesh>
          <mesh rotation-x={HPI} material={brushedMetal}>
            <torusGeometry args={[0.14, 0.015, 10, 40]} />
          </mesh>
          <mesh position={[0, -0.14, 0]} material={lip}>
            <cylinderGeometry args={[0.045, 0.065, 0.045, 16]} />
          </mesh>
        </>
      );
    case "spine":
      return (
        <>
          <mesh material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.62, 16]} />
          </mesh>
          {[-0.22, -0.07, 0.07, 0.22].map((y) => (
            <mesh key={y} position={[0, y, 0]} rotation-x={HPI} material={darkPolymer}>
              <torusGeometry args={[0.058, 0.012, 8, 24]} />
            </mesh>
          ))}
          <mesh position={[0, 0.33, 0]} material={lip}>
            <cylinderGeometry args={[0.07, 0.07, 0.028, 16]} />
          </mesh>
        </>
      );
    case "shoulder_yoke":
      return (
        <>
          {/* clavicle yoke — narrowed so the shoulder line is ~2.2x the helmet
              width (was over-wide / dominant). Lit clavicle deck so the top of
              the trunk reads solid, not a dark crossbar. */}
          <RoundedBox args={[0.74, 0.13, 0.22]} radius={0.05} material={mattePolymer} castShadow />
          {/* defined clavicle ridges sweeping to the shoulders */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.26, 0.02, 0.06]} rotation-z={s * 0.25} material={mattePolymer} castShadow>
              <capsuleGeometry args={[0.035, 0.16, 4, 10]} />
            </mesh>
          ))}
          {[-0.36, 0.36].map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation-z={HPI} material={darkPolymer} castShadow>
              <cylinderGeometry args={[0.075, 0.075, 0.06, 16]} />
            </mesh>
          ))}
        </>
      );
    case "shoulder_ball_l":
    case "shoulder_ball_r":
      return (
        <>
          {/* exposed black ball joint — the deltoid actuator */}
          <mesh material={darkPolymer} castShadow>
            <sphereGeometry args={[0.105, 24, 18]} />
          </mesh>
          <mesh rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.075, 0.075, 0.12, 20]} />
          </mesh>
          {/* machined gimbal ring */}
          <mesh rotation-x={HPI} material={lip}>
            <torusGeometry args={[0.095, 0.012, 8, 24]} />
          </mesh>
        </>
      );
    case "pauldron_l":
    case "pauldron_r": {
      const sgn = id.endsWith("_l") ? -1 : 1;
      return (
        <>
          {/* deltoid cap — low wide dome over the ball joint */}
          <mesh scale={[1.2, 0.85, 1.05]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.13, 32, 24, 0, Math.PI * 2, 0, 1.6]} />
          </mesh>
          {/* machined rim under the cap edge */}
          <group position={[0, -0.02, 0]} rotation={[HPI, 0, 0]}>
            <mesh scale={[1.2, 1.05, 1]} material={lip}>
              <torusGeometry args={[0.13, 0.01, 8, 36]} />
            </mesh>
          </group>
          {/* visible hinge pivot along the inboard edge (hinge axis = z) */}
          <mesh position={[sgn * -0.1, 0.06, 0]} rotation-x={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.016, 0.016, 0.1, 10]} />
          </mesh>
        </>
      );
    }
    case "upper_arm_l":
    case "upper_arm_r":
      return (
        <>
          {/* clean tapered humeral segment — one matte cuff reaching from the
              shoulder ball down to the elbow, with a slim black actuator collar
              at the top. Smooth cylinder = premium machined limb. */}
          <mesh position={[0, -0.2, 0]} material={mattePolymer} castShadow>
            <cylinderGeometry args={[0.07, 0.058, 0.42, 18]} />
          </mesh>
          {/* black actuator showing at the top under the deltoid */}
          <mesh position={[0, 0.02, 0]} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.058, 0.07, 0.09, 16]} />
          </mesh>
          <mesh position={[0, -0.41, 0]} material={lip}>
            <cylinderGeometry args={[0.056, 0.056, 0.02, 16]} />
          </mesh>
        </>
      );
    case "elbow_l":
    case "elbow_r": {
      const sgn = id.endsWith("_l") ? -1 : 1;
      return (
        <>
          {/* exposed black elbow pad — hinge axis runs left-right */}
          <mesh rotation-z={HPI} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.058, 0.058, 0.1, 20]} />
          </mesh>
          <mesh position={[sgn * 0.052, 0, 0]} rotation-z={HPI} material={brushedMetal}>
            <cylinderGeometry args={[0.032, 0.032, 0.02, 16]} />
          </mesh>
          {/* hinge linkage plate */}
          <RoundedBox args={[0.03, 0.08, 0.06]} radius={0.008} position={[sgn * 0.04, -0.04, 0]} material={brushedMetal} />
        </>
      );
    }
    case "forearm_l":
    case "forearm_r":
      return (
        <>
          {/* clean tapered forearm core (black, tendon-driven) — one smooth
              segment from the elbow toward the wrist, no stray rods/rings */}
          <mesh position={[0, -0.16, 0]} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.05, 0.036, 0.32, 18]} />
          </mesh>
          {/* one machined collar mid-forearm reading as the segment seam */}
          <mesh position={[0, -0.06, 0]} material={brushedMetal}>
            <cylinderGeometry args={[0.052, 0.052, 0.018, 16]} />
          </mesh>
        </>
      );
    case "forearm_shell_l":
    case "forearm_shell_r": {
      const sgn = id.endsWith("_l") ? -1 : 1;
      return (
        <>
          {/* light cuff covering the forearm; hinges outboard. Smooth tapered. */}
          <mesh position={[0, -0.08, 0.01]} scale={[1, 1, 0.86]} material={mattePolymer} castShadow>
            <cylinderGeometry args={[0.062, 0.044, 0.3, 18]} />
          </mesh>
          <mesh position={[0, 0.08, 0.01]} scale={[1, 1, 0.86]} material={lip}>
            <cylinderGeometry args={[0.064, 0.064, 0.014, 16]} />
          </mesh>
          {/* visible hinge pivot along the outboard edge (hinge axis = z) */}
          <mesh position={[sgn * 0.05, 0.18, 0]} rotation-x={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.08, 10]} />
          </mesh>
        </>
      );
    }
    case "wrist_l":
    case "wrist_r":
      return (
        <>
          {/* 2-DOF gimbal block */}
          <mesh material={darkPolymer} castShadow>
            <sphereGeometry args={[0.04, 18, 14]} />
          </mesh>
          <mesh rotation-z={HPI} material={brushedMetal}>
            <cylinderGeometry args={[0.026, 0.026, 0.07, 14]} />
          </mesh>
          <mesh rotation-x={HPI} material={lip}>
            <torusGeometry args={[0.036, 0.007, 8, 20]} />
          </mesh>
        </>
      );
    case "hand_l":
    case "hand_r": {
      const sgn = id.endsWith("_l") ? -1 : 1;
      return <Hand sgn={sgn} lip={lip} />;
    }
    case "hip_l":
    case "hip_r":
      return (
        <>
          {/* exposed actuator cluster */}
          <mesh rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.078, 0.078, 0.13, 20]} />
          </mesh>
          <mesh material={darkPolymer} castShadow>
            <sphereGeometry args={[0.085, 20, 16]} />
          </mesh>
          <mesh rotation-x={HPI} material={lip}>
            <torusGeometry args={[0.07, 0.01, 8, 24]} />
          </mesh>
        </>
      );
    case "thigh_l":
    case "thigh_r":
      return (
        <>
          {/* femur actuator core (black) — one clean tapered cylinder spanning
              the full thigh: top reaches UP into the hip socket (y=+0.06), base
              meets the knee (y=-0.6). No gap above the knee, no gap at the hip. */}
          <mesh position={[0, -0.27, 0]} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.082, 0.062, 0.66, 16]} />
          </mesh>
          {/* upper-thigh shoulder that seats into the hip ball (continuity) */}
          <mesh position={[0, 0.04, 0]} material={darkPolymer} castShadow>
            <sphereGeometry args={[0.082, 18, 14]} />
          </mesh>
          {/* machined collar at the knee end */}
          <mesh position={[0, -0.6, 0]} material={lip}>
            <cylinderGeometry args={[0.061, 0.061, 0.022, 16]} />
          </mesh>
        </>
      );
    case "thigh_shell_l":
    case "thigh_shell_r":
      return (
        <>
          {/* light thigh shell — tapered capsule cover over the femur, opens on
              a top-rear hinge. Lengthened to cover the full femur cleanly. */}
          <mesh position={[0, -0.06, 0.03]} scale={[1, 1, 0.82]} material={mattePolymer} castShadow>
            <cylinderGeometry args={[0.1, 0.078, 0.6, 18]} />
          </mesh>
          <mesh position={[0, 0.22, 0.02]} scale={[1, 1, 0.82]} material={lip}>
            <cylinderGeometry args={[0.102, 0.102, 0.016, 16]} />
          </mesh>
          {/* visible hinge pivot at the top-rear edge (hinge axis = x) */}
          <mesh position={[0, 0.2, -0.06]} rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.014, 0.014, 0.14, 10]} />
          </mesh>
        </>
      );
    case "knee_l":
    case "knee_r": {
      const sgn = id.endsWith("_l") ? -1 : 1;
      return (
        <>
          {/* exposed knee hinge + visible 4-bar linkage */}
          <mesh rotation-z={HPI} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.062, 0.062, 0.11, 20]} />
          </mesh>
          <mesh position={[sgn * 0.058, 0, 0]} rotation-z={HPI} material={brushedMetal}>
            <cylinderGeometry args={[0.034, 0.034, 0.02, 16]} />
          </mesh>
          {/* linkage bars front + rear */}
          {[0.05, -0.05].map((z) => (
            <RoundedBox key={z} args={[0.02, 0.1, 0.018]} radius={0.005} position={[sgn * 0.03, -0.03, z]} rotation-x={z > 0 ? 0.2 : -0.2} material={brushedMetal} />
          ))}
        </>
      );
    }
    case "shin_l":
    case "shin_r":
      return (
        <>
          {/* tibial actuator core (black) — one clean tapered cylinder spanning
              the full shin: top reaches UP to overlap the knee (y=+0.06), base
              at the ankle (y=-0.54). A subtle calf swell gives a real profile. */}
          <mesh position={[0, -0.24, 0]} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.072, 0.045, 0.6, 16]} />
          </mesh>
          {/* calf swell — slight forward/back bulge near the top, machined look */}
          <mesh position={[0, -0.12, -0.02]} scale={[0.85, 1.4, 0.95]} material={darkPolymer} castShadow>
            <sphereGeometry args={[0.07, 18, 14]} />
          </mesh>
          <mesh position={[0, -0.54, 0]} material={lip}>
            <cylinderGeometry args={[0.046, 0.046, 0.02, 16]} />
          </mesh>
        </>
      );
    case "shin_shell_l":
    case "shin_shell_r":
      return (
        <>
          {/* light shin shell — the calf panel, lengthened to cover the tibia */}
          <mesh position={[0, -0.08, 0.03]} scale={[1, 1, 0.8]} material={mattePolymer} castShadow>
            <cylinderGeometry args={[0.082, 0.052, 0.5, 18]} />
          </mesh>
          <mesh position={[0, 0.18, 0.02]} scale={[1, 1, 0.8]} material={lip}>
            <cylinderGeometry args={[0.084, 0.084, 0.014, 16]} />
          </mesh>
          <mesh position={[0, 0.18, -0.06]} rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.12, 10]} />
          </mesh>
        </>
      );
    case "ankle_l":
    case "ankle_r": {
      const sgn = id.endsWith("_l") ? -1 : 1;
      return (
        <>
          <mesh rotation-z={HPI} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.08, 18]} />
          </mesh>
          <mesh position={[sgn * 0.045, 0, 0]} rotation-z={HPI} material={brushedMetal}>
            <cylinderGeometry args={[0.026, 0.026, 0.018, 14]} />
          </mesh>
        </>
      );
    }
    case "foot_l":
    case "foot_r":
      return (
        <>
          {/* sole plate + toe link */}
          <RoundedBox args={[0.1, 0.04, 0.24]} radius={0.015} position={[0, 0, 0.05]} material={darkPolymer} castShadow receiveShadow />
          <RoundedBox args={[0.1, 0.022, 0.07]} radius={0.008} position={[0, -0.012, 0.18]} material={mattePolymer} castShadow />
          {/* ankle mount block */}
          <RoundedBox args={[0.06, 0.05, 0.07]} radius={0.012} position={[0, 0.03, 0]} material={brushedMetal} />
          <mesh position={[0, 0.005, 0.05]} rotation-x={HPI} material={lip}>
            <torusGeometry args={[0.04, 0.006, 8, 20]} />
          </mesh>
        </>
      );
    case "neck_stack":
      return (
        <>
          {[0, 0.06, 0.12].map((y) => (
            <mesh key={y} position={[0, y, 0]} material={darkPolymer} castShadow>
              <cylinderGeometry args={[0.06, 0.06, 0.04, 24]} />
            </mesh>
          ))}
          {[0.03, 0.09].map((y) => (
            <mesh key={y} position={[0, y, 0]} material={brushedMetal}>
              <cylinderGeometry args={[0.046, 0.046, 0.035, 24]} />
            </mesh>
          ))}
          {/* white emissive neck seam ring — part of the one accent line */}
          <mesh position={[0, 0.155, 0]} rotation-x={HPI} material={brightEmissiveSeam}>
            <torusGeometry args={[0.058, 0.005, 8, 32]} />
          </mesh>
        </>
      );
    case "head_base":
      return (
        <>
          {/* inner skull — optic core sits inside it */}
          <mesh scale={[1, 1.05, 0.95]} material={darkPolymer}>
            <sphereGeometry args={[0.16, 32, 24]} />
          </mesh>
          {/* smooth dark teardrop helmet shell (sides + jaw stay when cranium opens) */}
          <mesh scale={[1.0, 1.08, 1.02]} material={darkGlass} castShadow>
            <sphereGeometry args={[0.2, 48, 36]} />
          </mesh>
          {/* neck collar joining the stack */}
          <mesh position={[0, -0.18, 0]} material={darkPolymer}>
            <cylinderGeometry args={[0.07, 0.09, 0.08, 16]} />
          </mesh>
        </>
      );
    case "head_shell":
      return (
        <>
          {/* DARK cranium dome over the helmet — a SYMMETRIC top+back shell open
              only at the face. darkPolymer (near-black), not the light matte:
              the head is a dark Optimus helmet (dark dome + dark visor) with
              only the thin seam bright — so its rim-lit edge no longer flares
              into a pale hair-flick crescent. phiStart/phiLength centered on the
              back so both edges are even. */}
          <mesh scale={[1, 1.04, 1.0]} material={darkHelmet} castShadow>
            <sphereGeometry args={[0.212, 48, 32, Math.PI * 0.74, Math.PI * 1.52, 0.0, 1.5]} />
          </mesh>
          {/* rear-top hinge: visible pivot + blocks */}
          <mesh position={[0, 0.13, -0.15]} rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.018, 0.018, 0.26, 12]} />
          </mesh>
          {[-0.1, 0.1].map((x) => (
            <RoundedBox key={x} args={[0.04, 0.04, 0.045]} radius={0.01} position={[x, 0.13, -0.145]} material={lip} />
          ))}
        </>
      );
    case "visor_glass":
      return (
        <>
          {/* smoked teardrop visor — the dark glossy BLANK FACE. Sized to fill
              the whole face opening of the cranium cap so the front of the head
              reads as one near-black glossy mass (a blank Optimus visor), not a
              dithered oval with features. Slightly forward + a touch wider/taller
              than the old blank so no pale skull shows around its edge. */}
          <mesh position={[0, 0.005, 0.085]} scale={[1.02, 1.14, 0.7]} material={darkGlass}>
            <sphereGeometry args={[0.18, 40, 30, Math.PI * 0.82, Math.PI * 1.36, 0.42, 1.42]} />
          </mesh>
        </>
      );
    case "face_seam":
      return (
        <>
          {/* the ONE accent: a thin white emissive BROW line at the top edge of
              the visor — the Optimus temple seam rendered white. A shallow arc
              (∩, concave-down) hugging the dome/visor boundary high on the face,
              symmetric and OPEN at the bottom so it can never read as a chin
              "smile" and can't curl into a hair-flick. Wide + flat = clearly a
              brow accent, not a face outline. Sits just proud of the visor. */}
          <mesh position={[0, 0.058, 0.2]} scale={[1, 0.5, 0.36]} rotation={[0.05, 0, Math.PI * 0.07]} material={brightEmissiveSeam}>
            <torusGeometry args={[0.12, 0.006, 10, 80, Math.PI * 0.86]} />
          </mesh>
          {/* MOUTH / underscanline — a thin emissive bar low on the visor that
              shifts with mood (dim+flat at rest, brighter+wider scan/typing,
              short+sharp on error). Subtle: it's a status underline, not a
              cartoon smile. Driven via the `faceMouth` ref in the frame loop. */}
          <RoundedBox
            args={[0.07, 0.008, 0.01]}
            radius={0.004}
            position={[0, -0.066, 0.198]}
            ref={(m) => ctx.setExtra("faceMouth", m)}
            material={faceMat.mouth}
          />
        </>
      );
    case "eye_ring_l":
    case "eye_ring_r": {
      const side = id.endsWith("_l") ? "L" : "R";
      const sgn = side === "L" ? -1 : 1;
      const fm = faceMat[side];
      // V's EYE — a readable emissive LENS on the dark visor, not a faint ring.
      // Emotion comes from SHAPE + INTENSITY + MOTION, never from going googly:
      //   eyeBlink{side}  group: scaleY collapses for blinks / sleep slits.
      //   eyeShape{side}  group: scaleY = openness (focus/flare), rotation-z =
      //                   MOOD tilt (happy arc vs angry slant), mirrored per eye.
      //   lens (rounded bar) = the eye body; pupil dot brightens the center.
      // The frame loop drives all of these via refs. Sized bigger + brighter
      // than the old whisper ring so V has a FACE at hero distance.
      return (
        <group ref={(g) => ctx.setExtra(`eyeBlink${side}`, g)}>
          <group ref={(g) => ctx.setExtra(`eyeShape${side}`, g)}>
            {/* socket recess so the lit lens reads as set INTO the dark visor */}
            <mesh position={[0, 0, -0.004]} material={darkPolymer}>
              <boxGeometry args={[0.06, 0.034, 0.01]} />
            </mesh>
            {/* the eye lens — a horizontal rounded bar (confident Optimus eye) */}
            <RoundedBox
              args={[0.052, 0.02, 0.012]}
              radius={0.009}
              smoothness={4}
              position={[0, 0, 0.01]}
              ref={(m) => ctx.setExtra(`eyeLens${side}`, m)}
              material={fm}
            />
            {/* bright pupil core — punches the brightest pixel for the glare */}
            <mesh position={[sgn * 0.006, 0, 0.016]} ref={(m) => ctx.setExtra(`eyePupil${side}`, m)} material={fm}>
              <sphereGeometry args={[0.007, 14, 14]} />
            </mesh>
          </group>
        </group>
      );
    }
    case "optic_internal":
      return (
        <>
          <RoundedBox args={[0.17, 0.085, 0.085]} radius={0.018} material={darkPolymer} castShadow />
          {[-0.048, 0.048].map((x) => (
            <mesh key={x} position={[x, 0, 0.048]} rotation-x={HPI} material={brushedMetal}>
              <cylinderGeometry args={[0.022, 0.022, 0.035, 16]} />
            </mesh>
          ))}
          {[0.054, 0.068, 0.082].map((y) => (
            <RoundedBox key={y} args={[0.14, 0.006, 0.07]} radius={0.002} position={[0, y, -0.01]} material={brushedMetal} />
          ))}
          <RoundedBox args={[0.07, 0.028, 0.005]} radius={0.002} position={[0, -0.004, 0.045]} material={lip} />
        </>
      );
    default:
      return null;
  }
}

// origin group (static placement) -> OPEN group (per-part click-to-open pop,
// animated from store.openParts) -> pivot group (animated band motion, owns
// pointer events) -> offset group (pulls geometry back so the pivot sits on the
// hinge line). Children nest inside so motion carries down the kinematic tree.
// The open group sits ABOVE the pivot so a non-banded part can pop outward
// without disturbing the pivot group (which some parts use for breathing/look).
function PartNode({ id, ctx }) {
  const def = PART_INDEX.get(id);
  const kids = childrenOf.get(id) || [];
  const pivot = def.motion && def.motion.pivot ? def.motion.pivot : null;
  return (
    <group position={def.origin}>
      <group ref={ctx.registerOpen(id)}>
        <group
          ref={ctx.register(id)}
          position={pivot || undefined}
          onPointerOver={ctx.over(def)}
          onPointerOut={ctx.out(def)}
          onClick={ctx.click(def)}
        >
          <group position={pivot ? neg(pivot) : undefined}>
            <PartMesh id={id} lip={lips.get(id)} ctx={ctx} />
            {kids.map((k) => (
              <PartNode key={k} id={k} ctx={ctx} />
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}

export default function VRobot(props) {
  const root = useRef(null);
  const rig = useRef({});
  const openRig = useRef({});
  const extras = useRef({});
  const prevF = useRef({});
  const lastServo = useRef(0);
  const lastLook = useRef({ x: 0, y: 0, t: 0 });
  const stateRef = useRef({ name: "idle", t0: 0 });
  const look = useRef({ yaw: 0, pitch: 0, eyeYaw: 0, eyePitch: 0 });
  // gesture engine: a named gesture window + the next autonomous-idle fire time.
  const gesture = useRef({ name: "none", t0: -10, dur: 0, next: 4 });
  // damped articulation pose (per-side shoulder pitch/roll + elbow flex, body
  // sway/nod). Everything eases toward these so joints move with servo feel.
  const pose = useRef({
    shP: { L: 0, R: 0 }, // shoulder pitch (forward raise)
    shR: { L: 0, R: 0 }, // shoulder roll (lateral abduct)
    elb: { L: 0, R: 0 }, // elbow flexion
    sway: 0, // weight-shift yaw of the whole figure
    nod: 0, // extra head pitch from nod/bow gestures
    shrug: 0, // shoulder-yoke rise
  });
  // damped face-expression channels (see the FACE EXPRESSION block in useFrame)
  const faceRef = useRef({
    blink: 0,
    open: 1,
    tilt: 0,
    widen: 1,
    eyeI: 1.5,
    mouthW: 1,
    mouthY: 1,
    mouthI: 1.1,
  });

  // VRobot renders once (all animation goes through refs), so plain
  // per-render handler objects are fine here — no hooks needed.
  const ctx = {
    register: (id) => (g) => {
      if (g) {
        rig.current[id] = g;
        // camera focus flights resolve world anchors through this registry
        partRefRegistry.set(id, g);
      }
    },
    registerOpen: (id) => (g) => {
      if (g) openRig.current[id] = g;
    },
    setExtra: (name, obj) => {
      if (obj) extras.current[name] = obj;
    },
    over: (def) => (e) => {
      e.stopPropagation();
      document.body.style.cursor = "pointer";
      // hover feedback is VISUAL ONLY — brighten this part's machined lip.
      // No terminal writes: part specs must never flood the terminal on hover.
      const lip = lips.get(def.id);
      if (lip) lip.emissiveIntensity = 0.55;
    },
    out: (def) => (e) => {
      e.stopPropagation();
      document.body.style.cursor = "auto";
      const lip = lips.get(def.id);
      if (lip) lip.emissiveIntensity = 0;
    },
    click: (def) => (e) => {
      e.stopPropagation();
      const s = useVStore.getState();
      // assembled V is a character, not a specimen: idle clicks fall through to
      // the avatar talk arc in App; once torn down, clicks mean inspect
      if (s.depth <= 0.02 && s.mode === "idle") return;
      s.markPartClick();
      // toggle THIS part's individual open state (pops it open / closes it via
      // store.openParts -> the per-part open pose in useFrame) AND focus it, so
      // a click both reveals the part and flies the camera to it. App's
      // handleAvatarClick reads isOpen(focusPartId) to phrase V's reaction.
      s.toggleOpen(def.id);
      s.inspect(def.id);
      AudioEngine?.servoClick();
    },
  };

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const s = useVStore.getState();
    const R = rig.current;
    const X = extras.current;
    const now = performance.now();

    // GLOBAL TRANSFORMS — zoom scale from the shared store (safe default so this
    // builds before the interaction agent adds scale). Root rotation.y (the
    // drag-to-turn yaw, composited with the idle weight-shift sway) is applied
    // later in the ALIVE IDLE block. pitch is the CAMERA's job — never the robot.
    if (root.current) root.current.scale.setScalar(s.scale || 1);

    if (s.avatarState !== stateRef.current.name) {
      // carry .prev across the object swap so the gesture engine below doesn't
      // see prev===undefined and double-fire a state-driven gesture
      stateRef.current = { name: s.avatarState, t0: t, prev: stateRef.current.prev };
    }
    const st = t - stateRef.current.t0;
    const mode = s.avatarState;
    const creep = s.creepLevel || 0;

    // PER-PART INDIVIDUAL OPEN — ease each part's value toward its boolean
    // target in store.openParts (true -> 1 opening, false -> 0 closing) so a
    // click animates smoothly. Then for every part the open fraction is
    // max(global band open, this per-part open): banded parts reuse their
    // authored hinge/slide, non-banded parts get a synthesized outward pop.
    const op = s.openParts || EMPTY_OPEN;
    const OR = openRig.current;

    // banded parts: drive the authored teardown motion by the COMBINED fraction
    for (const def of BANDED) {
      const g = R[def.id];
      if (!g) continue;
      const raw = openFraction(s.depth, def.band);
      const pp = damp(perPartOpen.get(def.id), op[def.id] ? 1 : 0, 9, delta);
      perPartOpen.set(def.id, pp);
      const f = Math.max(servoEase(raw), servoEase(pp));
      const m = def.motion;
      if (m.type === "hinge") {
        if (m.axis === "z") g.rotation.z = m.angle * f;
        else g.rotation.x = m.angle * f;
      } else if (m.type === "slide") {
        g.position.set(
          m.pivot[0] + m.axis[0] * m.dist * f,
          m.pivot[1] + m.axis[1] * m.dist * f + revealLift(def.id, s.depth),
          m.pivot[2] + m.axis[2] * m.dist * f
        );
      }
      const was = prevF.current[def.id] ?? 0;
      const crossed = (was < 0.02) !== (raw < 0.02) || (was > 0.98) !== (raw > 0.98);
      if (crossed && now - lastServo.current > 150) {
        lastServo.current = now;
        AudioEngine?.servoClick(0.7 + Math.random() * 0.5);
      }
      prevF.current[def.id] = raw;
    }

    // non-banded parts: a synthesized outward "pop" on the dedicated open group
    // (so it never fights the breathing/look writes that ride the pivot group).
    // Every meaningful part is therefore individually openable — clicking pops
    // it out a bit to reveal what sits under/inside it; toggling animates back.
    for (const def of NON_BANDED) {
      const og = OR[def.id];
      if (!og) continue;
      const target = op[def.id] ? 1 : 0;
      const pp = damp(perPartOpen.get(def.id), target, 9, delta);
      perPartOpen.set(def.id, pp);
      if (pp < 0.001) {
        if (og.position.lengthSq() > 0) og.position.set(0, 0, 0);
        continue;
      }
      const f = servoEase(pp);
      const m = openMotions.get(def.id); // synthesized slide for non-banded
      og.position.set(m.axis[0] * m.dist * f, m.axis[1] * m.dist * f, m.axis[2] * m.dist * f);
      const wasOpen = (prevF.current[def.id] ?? 0) > 0.5;
      if (wasOpen !== target > 0.5 && now - lastServo.current > 120) {
        lastServo.current = now;
        AudioEngine?.servoClick(0.6 + Math.random() * 0.4);
      }
      prevF.current[def.id] = target;
    }

    // core reveal: it never moves — its band ramps the emissive instead
    const coreF = openFraction(s.depth, PART_INDEX.get("core").band);
    emissiveCore.emissiveIntensity = 2.6 + coreF * 1.8 + Math.sin(t * 2.4) * (0.25 + coreF * 0.5);
    if (X.coreMesh) X.coreMesh.scale.setScalar(1 + Math.sin(t * 2.4) * 0.02 * (1 + coreF));

    // ALIVE IDLE — V is never a statue. calmA scales every voluntary motion so
    // reduced-motion/static tiers freeze the animation (0 = frozen pose).
    const calmA = s.quality === "static" ? 0 : s.quality === "reduced" ? 0.45 : 1;
    const torn = s.depth > 0.04; // mid-teardown: hold a neutral service pose

    // breathing — torso carries the whole upper kinematic chain; the shoulder
    // yoke rises slightly with the breath so the chest visibly inflates
    const breath = Math.sin(t * 1.4) * calmA;
    if (R.torso) R.torso.position.y = TORSO_Y0 + breath * 0.012;
    pose.current.shrug = breath * 0.01;

    // gesture engine: pick the active gesture from avatarState, or fire an
    // autonomous idle gesture on a timer so V keeps articulating on its own.
    const G = pose.current;
    const gs = gesture.current;
    // state-driven gestures retrigger when the avatar state changes
    if (s.avatarState !== stateRef.current.prev) {
      stateRef.current.prev = s.avatarState;
      const map = { success: "nod", error: "shake", scan: "scanArm", sleep: "relax" };
      const g = map[s.avatarState];
      if (g) gesture.current = { name: g, t0: t, dur: g === "scanArm" ? 2.4 : 1.0, next: gs.next };
    }
    // autonomous idle gestures — only when truly idle, assembled, and not frozen
    if (!torn && calmA > 0 && s.avatarState === "idle" && creep < 1 && t > gs.next && t - gs.t0 > 1.2) {
      const pick = ["wave", "elbowFlex", "shoulderRoll", "weightShift", "nod"];
      const name = pick[Math.floor(Math.random() * pick.length)];
      gesture.current = { name, t0: t, dur: name === "wave" ? 2.2 : 1.4, next: t + 5 + Math.random() * 5 };
    }
    // DEV pose-hold (?v8gesture=<name>): pin a named gesture at its PEAK phase
    // statically so a joint can be screenshotted mid-pose. hold short-circuits
    // the live gesture window: gName = the held name, env e = 1 (peak), and any
    // time-driven sub-oscillation (wave bob / scan sweep) is frozen at its peak.
    const hold = s.gestureHold;
    const gName = hold || gesture.current.name;
    const gt = t - gesture.current.t0;
    const gActive = hold ? true : gt < gesture.current.dur && calmA > 0 && !torn;

    // gesture TARGETS — set the desired joint angles for the active gesture.
    // env(p): a smooth 0->1->0 envelope across the gesture so it eases in/out.
    const env = (p) => Math.sin(Math.min(Math.max(p, 0), 1) * Math.PI);
    let shPT = { L: 0, R: 0 };
    let shRT = { L: 0, R: 0 };
    // a slight resting elbow bend (never locked straight) — relaxes to 0 during
    // teardown so the arm holds a clean neutral pose while shells come off
    const restElb = torn ? 0 : 0.12;
    let elbT = { L: restElb, R: restElb };
    let swayT = 0;
    let nodT = 0;
    if (gActive) {
      // when holding, pin the envelope to peak (e=1) and freeze sub-oscillators
      const p = hold ? 0.5 : gt / gesture.current.dur;
      const e = hold ? 1 : env(p);
      // wave/scan bob phases: live = time-driven; held = frozen at the bob peak
      const waveBob = hold ? 1 : Math.sin(gt * 9);
      const scanBob = hold ? 1 : Math.sin(gt * 1.6);
      if (gName === "wave") {
        // raise the RIGHT arm out + up, then the ELBOW flexes back-and-forth
        // (a real wave): forearm rotates about the elbow joint, visibly bending.
        // shR<0 = abduct OUTWARD; elb>0 = forearm flexes UP+FORWARD (sign handled
        // at the joint-application step below).
        shRT.R = -1.15 * e; // abduct out to the side
        shPT.R = -0.35 * e; // and a little forward
        elbT.R = 0.5 + waveBob * 0.55 * e; // elbow flexes to wave (clamped below)
      } else if (gName === "elbowFlex") {
        // a clear single elbow articulation on the right arm — the honest joint
        shPT.R = -0.5 * e;
        elbT.R = 0.12 + 1.15 * e; // forearm swings up+forward about the elbow
      } else if (gName === "reach") {
        // V reaches FORWARD with the right arm: shoulder lifts the arm to the
        // front, elbow mostly extended so the hand presents out ahead of the body
        shPT.R = -1.1 * e; // raise forward to horizontal-ish
        elbT.R = 0.25 + 0.35 * e; // only a soft bend so the arm reaches out
        shRT.R = -0.12 * e; // a touch of abduction so it clears the torso
      } else if (gName === "shoulderRoll") {
        shPT.L = -0.25 * e;
        shPT.R = -0.25 * e;
        shRT.L = -0.12 * e;
        shRT.R = -0.12 * e;
      } else if (gName === "weightShift") {
        swayT = Math.sin(p * Math.PI) * 0.12; // shift weight side to side
      } else if (gName === "nod") {
        nodT = e * 0.26; // chin dips (agreement)
      } else if (gName === "shake") {
        nodT = 0; // handled by the head-yaw `shake` term below
      } else if (gName === "scanArm") {
        // raise the right forearm as if presenting a scan, hold, sweep slightly
        shPT.R = -0.7 * e;
        elbT.R = 0.12 + 1.0 * e;
        shRT.R = (-0.2 + scanBob * 0.18) * e;
      } else if (gName === "relax") {
        elbT.L = 0.05;
        elbT.R = 0.05;
      }
    }
    // JOINT-LIMIT clamps — keep every articulated joint inside an anatomically
    // safe, non-self-intersecting range so no gesture (or held dev pose) drives
    // a part through a neighbour. Elbow flexes forward only, never hyperextends.
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    for (const side of ["L", "R"]) {
      elbT[side] = clamp(elbT[side], -0.05, 1.95); // 0..~112deg forward flex
      shPT[side] = clamp(shPT[side], -1.7, 0.5); // raise forward/up, slight back
      shRT[side] = clamp(shRT[side], -1.45, 0.25); // abduct out, minimal adduct
    }
    // a slow continuous idle weight-shift sway under everything (very subtle)
    swayT += Math.sin(t * 0.5) * 0.02 * calmA;
    // typing: hands a touch active/raised so V looks engaged
    if (s.avatarState === "typing") {
      shPT.L -= 0.18 * calmA;
      shPT.R -= 0.18 * calmA;
      elbT.L = Math.max(elbT.L, 0.55);
      elbT.R = Math.max(elbT.R, 0.55);
    }

    // damp every articulation channel toward its target (servo-smooth)
    for (const side of ["L", "R"]) {
      G.shP[side] = damp(G.shP[side], shPT[side], 7, delta);
      G.shR[side] = damp(G.shR[side], shRT[side], 7, delta);
      G.elb[side] = damp(G.elb[side], elbT[side], 8, delta);
    }
    G.sway = damp(G.sway, swayT, 5, delta);
    G.nod = damp(G.nod, nodT, 7, delta);

    // apply articulation to the actual kinematic joints. Sign conventions
    // (right-handed, +y up, +z front, arms hang along -y):
    //   shoulder PITCH  rotation.x : NEGATIVE raises the arm FORWARD (+z). shP
    //                   targets are authored negative, so applied straight.
    //   shoulder ROLL   rotation.z : abduction must swing the arm OUTWARD
    //                   (left -> -x, right -> +x). A positive shR*sgn rotates
    //                   INWARD across the body (the old reversed bug), so the
    //                   sign is FLIPPED here: outward = -shR*sgn.
    //   elbow  FLEXION  rotation.x : the forearm hangs at -y; +rotation.x swings
    //                   it BACKWARD through the torso (the old reversed bug).
    //                   Flexion must bring the forearm UP+FORWARD (+z), so the
    //                   positive elb target is applied NEGATED.
    for (const side of ["L", "R"]) {
      const sgn = side === "L" ? -1 : 1;
      const sh = R[`shoulder_ball_${side.toLowerCase()}`];
      const el = R[`elbow_${side.toLowerCase()}`];
      if (sh) {
        sh.rotation.x = G.shP[side]; // forward raise (negative = forward)
        sh.rotation.z = -G.shR[side] * sgn; // lateral abduct OUTWARD (sign fixed)
      }
      if (el) el.rotation.x = -G.elb[side]; // forward elbow flexion (sign fixed)
    }
    if (R.shoulder_yoke) R.shoulder_yoke.position.y = YOKE_Y0 + G.shrug;
    // weight-shift sways the whole figure subtly about its vertical axis,
    // composited on top of the user's drag-to-turn yaw on the root group
    if (root.current) root.current.rotation.y = (s.yaw || 0) + G.sway;

    // look: eyes lead, head follows (secondary motion). The nod/bow gesture
    // adds an extra chin dip on top of the gaze pitch.
    const lt = s.lookTarget || { x: 0, y: 0 };
    let yawT = lt.x * 0.5;
    let pitchT = lt.y * 0.28 + creep * 0.05 + G.nod;
    if (mode === "typing") pitchT += 0.24;
    if (mode === "sleep") {
      pitchT += 0.55;
      yawT *= 0.2;
    }
    let shake = 0;
    if (mode === "error" && st < 0.5) shake = Math.sin(st * 42) * 0.09 * (1 - st / 0.5);
    // held-shake dev pose: pin the head yawed to one side so ?v8gesture=shake
    // shows the head-turn statically (the live shake is mode==="error" driven).
    if (hold === "shake") shake = 0.32;

    const L = look.current;
    L.yaw = damp(L.yaw, yawT, 6, delta);
    L.pitch = damp(L.pitch, pitchT, 6, delta);
    L.eyeYaw = damp(L.eyeYaw, yawT, 16, delta);
    L.eyePitch = damp(L.eyePitch, pitchT, 16, delta);

    if (R.head_base) {
      R.head_base.rotation.y = L.yaw + shake;
      R.head_base.rotation.x = L.pitch;
    }
    if (R.neck_stack) {
      R.neck_stack.rotation.y = L.yaw * 0.35;
      R.neck_stack.rotation.x = L.pitch * 0.3;
    }
    for (const id of ["eye_ring_l", "eye_ring_r"]) {
      const g = R[id];
      if (g) {
        g.position.x = (L.eyeYaw - L.yaw) * 0.1;
        g.position.y = -(L.eyePitch - L.pitch) * 0.1;
      }
    }

    // servo chatter on big gaze moves (parity with the 2D V)
    const lk = lastLook.current;
    const dY = L.yaw - lk.x;
    const dP = L.pitch - lk.y;
    if (Math.sqrt(dY * dY + dP * dP) > 0.12 && now - lk.t > 200) {
      AudioEngine?.servoClick(0.6 + Math.random() * 0.6);
      lastLook.current = { x: L.yaw, y: L.pitch, t: now };
    }

    // FACE EXPRESSION. V emotes through eye SHAPE + INTENSITY + MOTION (never by
    // growing googly). Each state sets targets; everything is damped toward them
    // each frame so transitions read as servo-smooth, not snaps:
    //   open    eye openness (scaleY of the lens): slit/sleep -> 0.1, flare -> 1.4
    //   tilt    MOOD tilt of the lens (rotation-z): + = happy outer-down arc,
    //           - = angry inner-down slant; mirrored per eye so both read right
    //   widen   horizontal stretch (scaleX): focus = narrow scan, glare = wide
    //   eyeI    eye emissive intensity (bloom = how "awake"/menacing)
    //   mouthW  mouth scaleX, mouthY mouth scaleY, mouthI mouth intensity
    // calm = animation budget for reduced/static tiers (no jitter when frozen).
    const calm = s.quality === "static" ? 0 : s.quality === "reduced" ? 0.5 : 1;
    const fr = faceRef.current;

    // defaults: idle. A confident, awake Optimus stare with a slow breathing
    // glow + the periodic blink handled separately below.
    let openT = 1;
    let tiltT = 0;
    let widenT = 1;
    let eyeIT = 1.5 + Math.sin(t * 1.7) * 0.18 * calm;
    let mouthWT = 1;
    let mouthYT = 1;
    let mouthIT = 1.1 + Math.sin(t * 1.7) * 0.12 * calm;

    if (creep >= 2) {
      // full bright menacing glare — wide, hard, inner-down slant, no blink
      openT = 0.55; tiltT = -0.42; widenT = 1.25; eyeIT = 6.5;
      mouthWT = 0.7; mouthYT = 0.5; mouthIT = 3.2;
    } else if (creep >= 1) {
      // narrowed + brightened, a touch menacing
      openT = 0.5; tiltT = -0.22; widenT = 1.1; eyeIT = 3.4;
      mouthWT = 0.85; mouthIT = 1.8;
    } else if (mode === "typing") {
      // focused: eyes narrow + a quick horizontal scan, mouth tight
      openT = 0.62; widenT = 0.86 + Math.sin(t * 14) * 0.06 * calm;
      eyeIT = 2.6 + Math.sin(t * 11) * 0.5 * calm;
      mouthWT = 1.15; mouthYT = 0.7; mouthIT = 2.0;
    } else if (mode === "error") {
      // FLARE hard + sharp angry slant; brief shake handled via `shake`
      const hot = st < 0.6 ? 1 : 0.55;
      openT = 1.35; tiltT = -0.5; widenT = 1.2;
      eyeIT = 4.5 + hot * 2.5;
      mouthWT = 0.55; mouthYT = 1.4; mouthIT = 3.0 + hot * 1.5;
    } else if (mode === "scan") {
      // sweeping scan: a slow horizontal pulse + bright steady eyes
      openT = 0.85; widenT = 1.0 + Math.sin(t * 5) * 0.12 * calm;
      eyeIT = 2.8 + Math.sin(t * 6) * 0.5 * calm;
      mouthWT = 1.3 + Math.sin(t * 5) * 0.15 * calm; mouthIT = 2.2;
    } else if (mode === "sleep") {
      // thin flat slits, dim, mouth nearly gone
      openT = 0.08; widenT = 1.05; eyeIT = 0.5;
      mouthWT = 0.6; mouthYT = 0.3; mouthIT = 0.4;
    } else if (mode === "success") {
      // eyes curve into happy arcs + a bright pulse; mouth lifts wide
      const p = Math.min(st / 0.7, 1);
      const pulse = Math.sin(p * Math.PI);
      openT = 0.72; tiltT = 0.5; widenT = 1.05;
      eyeIT = 2.8 + pulse * 2.2;
      mouthWT = 1.3; mouthYT = 0.7; mouthIT = 2.0 + pulse * 1.4;
    }

    // periodic soft blink in idle-ish states only (not while flaring/sleeping)
    const blinkable = mode === "idle" && creep < 1;
    if (blinkable) {
      // a blink every ~4.5s: a fast close/open via a narrow cosine dip
      const cycle = 4.5;
      const ph = (t % cycle) / cycle;
      if (ph > 0.965) {
        const b = (ph - 0.965) / 0.035; // 0..1 across the blink window
        fr.blink = Math.sin(b * Math.PI); // 0 -> 1 -> 0
      } else {
        fr.blink = damp(fr.blink, 0, 14, delta);
      }
    } else {
      fr.blink = damp(fr.blink, 0, 14, delta);
    }
    const blinkScale = 1 - fr.blink * (calm > 0 ? 0.92 : 0);

    // damp every channel toward target (servo-smooth, no snaps)
    fr.open = damp(fr.open, openT, 11, delta);
    fr.tilt = damp(fr.tilt, tiltT, 11, delta);
    fr.widen = damp(fr.widen, widenT, 11, delta);
    fr.eyeI = damp(fr.eyeI, eyeIT, 10, delta);
    fr.mouthW = damp(fr.mouthW, mouthWT, 10, delta);
    fr.mouthY = damp(fr.mouthY, mouthYT, 10, delta);
    fr.mouthI = damp(fr.mouthI, mouthIT, 10, delta);

    faceMat.L.emissiveIntensity = fr.eyeI;
    faceMat.R.emissiveIntensity = fr.eyeI;
    for (const side of ["L", "R"]) {
      const sgn = side === "L" ? -1 : 1;
      const blink = X[`eyeBlink${side}`];
      const shape = X[`eyeShape${side}`];
      const pupil = X[`eyePupil${side}`];
      if (blink) blink.scale.y = fr.open * blinkScale;
      if (shape) {
        shape.scale.x = fr.widen;
        // mirror the mood tilt so happy = both outer corners down (an arc),
        // angry = both inner corners down (a scowl)
        shape.rotation.z = fr.tilt * sgn;
      }
      if (pupil) pupil.scale.setScalar(0.8 + fr.eyeI * 0.12);
    }
    if (X.faceMouth) {
      X.faceMouth.scale.set(fr.mouthW, fr.mouthY, 1);
      faceMat.mouth.emissiveIntensity = fr.mouthI;
    }

    // scan: thin emissive ring sweeps the full standing body vertically
    if (X.scanRing) {
      const on = mode === "scan";
      X.scanRing.visible = on;
      if (on) {
        X.scanRing.position.y = 0.4 + ((t * 0.5) % 1) * 2.6;
        scanMat.opacity = 0.55 + Math.sin(t * 30) * 0.2;
      }
    }
  });

  return (
    <group
      ref={root}
      {...props}
      onPointerMissed={() => {
        // Click hit the blank 3D panel (no part). Drop any inspect focus AND
        // raise the empty-space flag so App's wrapper handler treats this as
        // "clicked empty space" (-> focus terminal + invite line), not as a
        // click on V's body (-> talk arc). r3f fires onPointerMissed during the
        // pointer event, before the DOM click bubbles to the panel wrapper.
        const s = useVStore.getState();
        s.clearFocus();
        s.emptyClick();
      }}
    >
      <PartNode id="base_link" ctx={ctx} />
      <mesh
        ref={(m) => ctx.setExtra("scanRing", m)}
        visible={false}
        position={[0, 1, 0]}
        rotation-x={HPI}
        scale={[1, 0.55, 1]}
        material={scanMat}
      >
        <torusGeometry args={[0.7, 0.008, 8, 64]} />
      </mesh>
    </group>
  );
}

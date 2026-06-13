import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { MathUtils } from "three";
import useVStore from "./store.js";
import AudioEngine from "../audio.js";
import { partRefRegistry, smoothstep } from "./Teardown.jsx";
import { PARTS, PART_INDEX, BANDED, openFraction, servoEase } from "./parts.js";
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
} from "./materials.js";

const HPI = Math.PI / 2;
const damp = MathUtils.damp;

// Module scope (not hooks): useFrame and the hover handlers mutate these
// every frame, which the react-hooks immutability rule forbids on
// hook-created values. VRobot is a singleton, so shared instances are fine.
const lips = new Map(PARTS.map((p) => [p.id, makeLip()]));
const eyeMat = makeEmissive(1.8);
const scanMat = makeEmissive(2.2);
scanMat.transparent = true;
scanMat.opacity = 0.7;

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
          {/* sculpted black pelvis girdle — wider at the hips, tapering up to the
              waist; the hip ball joints (at x=+/-0.17, y=-0.1) embed in its
              flanks so legs and pelvis read as one continuous structure, not a
              block with legs hung under it. A single chamfered form, no clutter. */}
          <mesh material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.16, 0.26, 0.3, 24]} />
          </mesh>
          {/* flared hip yokes that sweep DOWN-OUT to meet each hip socket —
              this is the meat that bridges pelvis to thigh on each side */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.13, -0.1, 0]} scale={[1, 1.2, 0.9]} material={darkPolymer} castShadow>
              <sphereGeometry args={[0.1, 20, 16]} />
            </mesh>
          ))}
          {/* light front fascia panel set flush into the girdle (machined look) */}
          <RoundedBox args={[0.2, 0.2, 0.05]} radius={0.02} position={[0, -0.01, 0.135]} material={mattePolymer} castShadow />
          {/* lumbar joint barrel up into the torso — the spine bridge */}
          <mesh position={[0, 0.16, 0]} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.12, 0.14, 0.12, 24]} />
          </mesh>
          <mesh position={[0, 0.22, 0]} rotation-x={HPI} material={lip}>
            <torusGeometry args={[0.125, 0.01, 8, 32]} />
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
          {/* one continuous monocoque — a chamfered chest that flows without a
              break from the clavicle line down to a slim waist, then the waist
              column reaches DOWN to physically meet the pelvis lumbar barrel.
              No separate floating barrel: torso and pelvis read as one trunk.
              Upper chest: wide chamfered frustum (16-gon = smooth in the dither). */}
          <mesh position={[0, 0.1, 0]} scale={[1, 1, 0.66]} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.4, 0.3, 0.56, 16]} />
          </mesh>
          {/* continuous waist — tapers from the chest base (r 0.3) down to the
              lumbar barrel (r 0.16) with no gap; bottom reaches torso y=-0.24
              == pelvis lumbar top, so the trunk is bridged */}
          <mesh position={[0, -0.13, 0]} scale={[1, 1, 0.72]} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.3, 0.17, 0.22, 16]} />
          </mesh>
          {/* internal core bay block that reads when the chest shells open */}
          <RoundedBox args={[0.3, 0.3, 0.16]} radius={0.03} position={[0, -0.02, 0.0]} material={darkPolymer} />
          {/* machined seam ring at the clavicle line, tucked inside the chest */}
          <group position={[0, 0.34, 0]} rotation={[HPI, 0, 0]}>
            <mesh scale={[1, 0.66, 1]} material={lip}>
              <torusGeometry args={[0.37, 0.009, 8, 48]} />
            </mesh>
          </group>
        </>
      );
    case "chest_plate":
      return (
        <>
          {/* continuous curved plastron — ONE chamfered shell (a wide, gently
              domed panel) instead of two stacked flat boxes; reads as a premium
              machined chest plate. A spherical-section cap gives the soft chest
              curvature; a RoundedBox behind it closes the panel volume. */}
          <mesh position={[0, 0.0, 0.13]} scale={[1, 1.18, 0.72]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.4, 40, 28, Math.PI * 1.15, Math.PI * 0.7, Math.PI * 0.18, Math.PI * 0.62]} />
          </mesh>
          {/* sternum inset channel (dark) running down the plastron center */}
          <RoundedBox args={[0.1, 0.34, 0.05]} radius={0.02} position={[0, 0.06, 0.28]} material={darkPolymer} />
          {/* white emissive chest seam — the sternum accent line */}
          <RoundedBox args={[0.012, 0.3, 0.012]} radius={0.004} position={[0, 0.06, 0.31]} material={brightEmissiveSeam} />
          {/* status dot trio — same chest lights as the 2D V */}
          {[-0.05, 0, 0.05].map((x) => (
            <mesh key={x} position={[x, -0.14, 0.29]} material={eyeMat}>
              <sphereGeometry args={[0.013, 12, 12]} />
            </mesh>
          ))}
          {/* one clean machined inner lip framing the panel's top opening edge */}
          <mesh position={[0, 0.3, 0.18]} rotation-x={HPI * 0.92} material={lip}>
            <torusGeometry args={[0.32, 0.012, 8, 40, Math.PI]} />
          </mesh>
          {/* visible hinge pivot along the bottom edge */}
          <mesh position={[0, -0.34, 0.2]} rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.46, 12]} />
          </mesh>
        </>
      );
    case "back_plate":
      return (
        <>
          {/* continuous curved dorsal shell — one chamfered panel matching the
              plastron, with a single central spine channel (no stray ribs) */}
          <mesh position={[0, 0.0, -0.13]} scale={[1, 1.2, 0.72]} rotation-y={Math.PI} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.4, 40, 28, Math.PI * 1.15, Math.PI * 0.7, Math.PI * 0.18, Math.PI * 0.62]} />
          </mesh>
          {/* central spine channel (dark) */}
          <RoundedBox args={[0.09, 0.38, 0.05]} radius={0.02} position={[0, 0.04, -0.28]} material={darkPolymer} />
          <mesh position={[0, 0.3, -0.18]} rotation={[HPI * 1.08, 0, Math.PI]} material={lip}>
            <torusGeometry args={[0.32, 0.012, 8, 40, Math.PI]} />
          </mesh>
          <mesh position={[0, -0.34, -0.2]} rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.46, 12]} />
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
          {/* clavicle yoke — shoulder line ~2.2x the helmet width */}
          <RoundedBox args={[0.9, 0.13, 0.22]} radius={0.05} material={brushedMetal} castShadow />
          {/* defined clavicle ridges sweeping to the shoulders */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.3, 0.02, 0.06]} rotation-z={s * 0.25} material={mattePolymer} castShadow>
              <capsuleGeometry args={[0.035, 0.18, 4, 10]} />
            </mesh>
          ))}
          {[-0.42, 0.42].map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation-z={HPI} material={darkPolymer} castShadow>
              <cylinderGeometry args={[0.08, 0.08, 0.06, 16]} />
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
        </>
      );
    case "eye_ring_l":
    case "eye_ring_r": {
      const side = id.endsWith("_l") ? "L" : "R";
      return (
        <>
          {/* faint emissive eye ring visible THROUGH/behind the dark visor.
              kept VERY small + thin so it reads as a whisper of optic glow
              behind glass, not a bold cartoon eye — identity ("Yusen gave me
              eyes") without losing the blank Optimus visor. Idle keeps these
              near-invisible (see frame loop); they only flare on interaction. */}
          <mesh rotation-x={HPI} material={darkPolymer}>
            <cylinderGeometry args={[0.02, 0.02, 0.02, 20]} />
          </mesh>
          <group ref={(g) => ctx.setExtra(`eyeScale${side}`, g)}>
            {/* arc gap makes the ring spin readable, like the 2D scan arcs */}
            <mesh position={[0, 0, 0.018]} ref={(m) => ctx.setExtra(`eyeRing${side}`, m)} material={eyeMat}>
              <torusGeometry args={[0.012, 0.0028, 10, 32, Math.PI * 1.78]} />
            </mesh>
            <mesh position={[0, 0, 0.018]} material={eyeMat}>
              <sphereGeometry args={[0.0035, 12, 12]} />
            </mesh>
          </group>
        </>
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

// origin group (static placement) -> pivot group (animated, owns pointer
// events) -> offset group (pulls geometry back so the pivot sits on the
// hinge line). Children nest inside so motion carries down the kinematic tree.
function PartNode({ id, ctx }) {
  const def = PART_INDEX.get(id);
  const kids = childrenOf.get(id) || [];
  const pivot = def.motion && def.motion.pivot ? def.motion.pivot : null;
  return (
    <group position={def.origin}>
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
  );
}

export default function VRobot(props) {
  const root = useRef(null);
  const rig = useRef({});
  const extras = useRef({});
  const prevF = useRef({});
  const lastServo = useRef(0);
  const lastLook = useRef({ x: 0, y: 0, t: 0 });
  const stateRef = useRef({ name: "idle", t0: 0 });
  const look = useRef({ yaw: 0, pitch: 0, eyeYaw: 0, eyePitch: 0 });

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

    // GLOBAL TRANSFORMS — drag-to-turn yaw + zoom scale, applied to the root
    // group every frame from the shared store (safe defaults so this builds
    // and renders before the interaction agent adds yaw/scale to the store).
    // The interaction agent only WRITES these; we APPLY them here.
    if (root.current) {
      root.current.rotation.y = s.yaw || 0;
      root.current.scale.setScalar(s.scale || 1);
    }

    if (s.avatarState !== stateRef.current.name) {
      stateRef.current = { name: s.avatarState, t0: t };
    }
    const st = t - stateRef.current.t0;
    const mode = s.avatarState;
    const creep = s.creepLevel || 0;

    // depth choreography — pose is a pure function of store depth
    for (const def of BANDED) {
      const g = R[def.id];
      if (!g) continue;
      const raw = openFraction(s.depth, def.band);
      const f = servoEase(raw);
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

    // core reveal: it never moves — its band ramps the emissive instead
    const coreF = openFraction(s.depth, PART_INDEX.get("core").band);
    emissiveCore.emissiveIntensity = 2.6 + coreF * 1.8 + Math.sin(t * 2.4) * (0.25 + coreF * 0.5);
    if (X.coreMesh) X.coreMesh.scale.setScalar(1 + Math.sin(t * 2.4) * 0.02 * (1 + coreF));

    // breathing — torso carries the whole upper kinematic chain
    if (R.torso) R.torso.position.y = 0.46 + Math.sin(t * 1.4) * 0.01;

    // look: eyes lead, head follows (secondary motion)
    const lt = s.lookTarget || { x: 0, y: 0 };
    let yawT = lt.x * 0.5;
    let pitchT = lt.y * 0.28 + creep * 0.05;
    if (mode === "typing") pitchT += 0.24;
    if (mode === "sleep") {
      pitchT += 0.55;
      yawT *= 0.2;
    }
    let shake = 0;
    if (mode === "error" && st < 0.5) shake = Math.sin(st * 42) * 0.09 * (1 - st / 0.5);

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

    // eye expression per avatar state. IDLE keeps the rings near-invisible —
    // a faint breathing whisper of glow well under the bloom/dither-bypass
    // threshold so the face stays a blank dark visor at hero distance (no
    // googly eyes). The active states (typing/scan/error/success) and creep
    // are what FLARE the eyes bright — that's when V's optics "wake up". This
    // preserves V's identity ("Yusen gave me eyes") without a smiley at rest.
    let intensity = 0.14 + Math.sin(t * 2.1) * 0.05 + creep * 0.9;
    let spin = 0.4;
    let ringScale = 1;
    let slit = 1;
    if (mode === "typing") {
      spin = 4 + (s.typingIntensity || 0) * 8;
      intensity = 2.2 + Math.sin(t * 9) * 0.5;
    } else if (mode === "error") {
      intensity = st < 0.6 ? 5.5 : 3.4;
      ringScale = 1.22;
    } else if (mode === "scan") {
      spin = 2.2;
      intensity = 2.4 + Math.sin(t * 6) * 0.4;
    } else if (mode === "sleep") {
      slit = 0.06;
      intensity = 0.12;
    } else if (mode === "success") {
      const p = Math.min(st / 0.7, 1);
      ringScale = 1 + Math.sin(p * Math.PI) * 0.45;
      intensity = 2.6 + Math.sin(p * Math.PI) * 1.4;
    }
    eyeMat.emissiveIntensity = intensity;
    for (const side of ["L", "R"]) {
      const ring = X[`eyeRing${side}`];
      const sc = X[`eyeScale${side}`];
      if (ring) {
        ring.rotation.z += spin * delta;
        ring.scale.setScalar(ringScale);
      }
      if (sc) sc.scale.y = damp(sc.scale.y, slit, 10, delta);
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

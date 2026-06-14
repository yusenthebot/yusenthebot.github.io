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
  panelShade,
  seamInset,
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
const REVEAL_LIFT = { optic_internal: "head_shell" };
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

// HARD-SURFACE limb panel. Replaces the old round-tube limb segments with a
// flat-fronted, tapered paneled assembly (the Optimus/Figure language): a broad
// bright FRONT plate, a narrower dimmer BACK plate, softly chamfered side
// rails, and one or two recessed seam grooves so the segment reads as a
// machined shell, not a smooth drum. Built from drei RoundedBoxes (smoothness 3,
// small radius) so the edges are crisp-but-bevelled and the dither flatters the
// flat faces. All args are in the part's local frame; the segment runs DOWN -y
// from `topY` to `topY - len`. wTop/wBot taper the width (X).
//
// G1 SLAB LAW (REV.8 de-cylindrical pass): a real humanoid limb is FLAT
// front-to-back, not round — the Unitree G1 envelope is 0.45 m wide x 0.20 m
// deep (width:depth ~2.25:1). So DEPTH is DERIVED from width via `flat` (the
// depth/width ratio) rather than passed in round: dTop = wTop*flat. With
// flat=0.5 every segment is a slab twice as wide as it is deep, which is what
// kills the tube read in the side/3-4 views. Legacy dTop/dBot args are still
// accepted but ignored unless `flat` is null (kept so old call sites don't
// throw); prefer passing `flat`. `mat`/`backMat` pick the dark or light palette.
function PanelSegment({
  topY = 0,
  len = 0.42,
  wTop = 0.14,
  wBot = 0.11,
  dTop = 0.12,
  dBot = 0.1,
  flat = 0.5,
  mat = mattePolymer,
  backMat = panelShade,
  seams = 2,
  faceZ = true,
}) {
  const midY = topY - len / 2;
  const wMid = (wTop + wBot) / 2;
  // SLAB: depth tracks width by the `flat` ratio so the cross-section is an
  // oval clearly wider than deep, never a round drum. `flat` null falls back to
  // the legacy explicit dTop/dBot for any caller that still wants round.
  if (flat != null) {
    dTop = wTop * flat;
    dBot = wBot * flat;
  }
  const dMid = (dTop + dBot) / 2;
  // taper is faked with two stacked rounded boxes (upper half + lower half) so
  // the silhouette narrows without needing a custom lathe — still flat-faced.
  const upY = topY - len * 0.27;
  const loY = topY - len * 0.73;
  const wUp = (wTop + wMid) / 2;
  const wLo = (wMid + wBot) / 2;
  const dUp = (dTop + dMid) / 2;
  const dLo = (dMid + dBot) / 2;
  const r = Math.min(wMid, dMid) * 0.32;
  return (
    <>
      {/* core panel mass — two stacked rounded plates give the taper while every
          face stays flat (the front/back read as broad panels, the sides as
          narrow chamfered rails). Slightly flattened in Z (shallow box) so the
          FRONT face dominates — that broad flat front is the whole point. */}
      <RoundedBox args={[wUp, len * 0.56, dUp]} radius={r} smoothness={3} position={[0, upY, 0]} material={mat} castShadow />
      <RoundedBox args={[wLo, len * 0.56, dLo]} radius={r * 0.85} smoothness={3} position={[0, loY, 0]} material={mat} castShadow />
      {/* recessed BACK shell — a dimmer narrower plate set behind so the segment
          reads as front-panel-over-back-shell (two luma planes), never a tube */}
      <RoundedBox
        args={[wMid * 0.78, len * 0.92, dMid * 0.5]}
        radius={r * 0.7}
        smoothness={2}
        position={[0, midY, -dMid * 0.34]}
        material={backMat}
        castShadow
      />
      {/* a proud FRONT fascia plate — the broad flat panel that catches the
          highlight; sits just forward of the core so its crisp edge bevel
          dithers as a bright panel rim (kills the smooth-sausage read) */}
      {faceZ && (
        <RoundedBox
          args={[wMid * 0.74, len * 0.82, dMid * 0.28]}
          radius={r * 0.6}
          smoothness={3}
          position={[0, midY, dMid * 0.42]}
          material={mat}
          castShadow
        />
      )}
      {/* recessed seam grooves across the front fascia — thin dark insets that
          divide the panel so it reads as a machined assembly with breaks */}
      {Array.from({ length: seams }).map((_, i) => {
        const y = topY - len * (0.34 + i * 0.34);
        return (
          <RoundedBox
            key={i}
            args={[wMid * 0.66, 0.012, 0.01]}
            radius={0.004}
            smoothness={2}
            position={[0, y, dMid * 0.55]}
            material={seamInset}
          />
        );
      })}
    </>
  );
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
              structure. Reaches UP (top r 0.215 at y=+0.22) to firmly overlap the
              torso waist bottom (world ~1.61): the trunk and hips are bridged,
              no gap. PULLED IN at the front (scale-z 0.6) so it no longer
              protrudes past the LIGHT sleeve and turn the pelvis front dark — it
              now only shows as exposed dark internals on the flanks/back. SLIMMED
              (r 0.215/0.20, was 0.27/0.25) IN STEP with the light sleeve so the
              pelvis reads lean + humanoid, never wider than the waist, and the
              dark core still stays tucked INSIDE the lit sleeve (front stays lit). */}
          <mesh position={[0, 0.02, 0]} scale={[1, 1, 0.45]} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.185, 0.175, 0.46, 24]} />
          </mesh>
          {/* LIGHT matte hip girdle — a proud lit sleeve covering the front + sides
              so the pelvis reads as a SOLID LIT form (matching chest + thighs),
              never a dark ring. WIDENED in z (scale 0.92) so its FRONT face is the
              frontmost surface (in front of the dark core) and catches the key
              light as a bright panel. Reaches UP to y=+0.25 (lapping the lit waist
              down to world ~1.61) and DOWN to y=-0.18 (lapping the hip sockets at
              world ~1.33) so the lit volume is unbroken trunk->hips->legs. SLIMMED
              (r 0.235/0.225, was 0.29/0.275) so the hips no longer flare out wider
              than the waist — a lean Figure-02 pelvis. FLATTENED (z 0.55, was 0.92)
              so the hips are a slab like the chest — width 0.235, depth 0.235*0.55
              = 0.13 (the G1 ~2.25:1 hip envelope), NOT a round drum. Still proud of
              the dark core so its FRONT face stays the frontmost LIT surface. */}
          <mesh position={[0, 0.0, 0]} scale={[1, 1, 0.55]} material={mattePolymer} castShadow>
            <cylinderGeometry args={[0.205, 0.195, 0.5, 24]} />
          </mesh>
          {/* lit cap closing the top of the girdle into the waist overlap —
              reaches up to world ~1.9 (well into the lit waist) so the trunk-hip
              join is one continuous lit surface. Flattened (low scale-y) and in
              the dimmer panel shade so it reads as a transitional bevel between
              the abdomen and the flat hip fascia, NOT a bright smooth dome. */}
          <mesh position={[0, 0.24, 0]} scale={[1, 0.42, 0.55]} material={panelShade} castShadow>
            <sphereGeometry args={[0.205, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          </mesh>
          {/* flat-topped lit hip deck plate — a broad chamfered plate capping the
              girdle so the top of the pelvis reads as a flat machined deck, not
              a round crown. NARROWED (0.29, was 0.34) to match the slimmed narrow
              pelvis. DEPTH 0.15 so the deck is a thin slab in step with the
              flattened girdle, not a deep shelf. */}
          <RoundedBox args={[0.29, 0.08, 0.15]} radius={0.025} smoothness={3} position={[0, 0.2, 0]} material={mattePolymer} castShadow />
          {/* flared lit hip yokes sweeping DOWN-OUT to meet each hip socket —
              the meat that bridges pelvis to thigh on each side. Pulled IN
              (x s*0.125, r0.10) so they still bridge to the hip sockets at
              x=+/-0.17 but no longer balloon the hips outward. */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.11, -0.12, 0]} scale={[1, 1.2, 0.6]} material={mattePolymer} castShadow>
              <sphereGeometry args={[0.095, 20, 16]} />
            </mesh>
          ))}
          {/* HARD-SURFACE hip fascia — a broad flat front PLATE plus two angled
              side hip plates chamfered onto the girdle so the pelvis reads as a
              paneled hip block (Optimus pelvis), not a smooth dome. Pulled BACK to
              z=0.11 (was 0.185) so it sits ON the flattened girdle front (~0.13)
              and stays the frontmost LIT pelvis surface without floating proud —
              keeps the hips THIN front-to-back. NARROWED (0.28) to match the
              slimmed girdle. */}
          <RoundedBox args={[0.235, 0.36, 0.05]} radius={0.025} smoothness={3} position={[0, -0.03, 0.095]} material={mattePolymer} castShadow />
          {[-1, 1].map((s) => (
            <RoundedBox
              key={s}
              args={[0.09, 0.34, 0.05]}
              radius={0.02}
              smoothness={3}
              position={[s * 0.135, -0.04, 0.05]}
              rotation-y={s * -0.55}
              material={mattePolymer}
              castShadow
            />
          ))}
          {/* recessed center seam splitting the front fascia (hip panel break) */}
          <RoundedBox args={[0.014, 0.3, 0.014]} radius={0.005} position={[0, -0.03, 0.12]} material={seamInset} />
          {/* machined seam belt low on the girdle (hip panel break, NOT at the
              trunk join — the trunk/hip overlap stays one unbroken lit surface).
              Radius tracks the slimmed narrow girdle (0.195, was 0.225). */}
          <mesh position={[0, -0.1, 0]} scale={[1, 1, 0.55]} rotation-x={HPI} material={lip}>
            <torusGeometry args={[0.195, 0.008, 8, 40]} />
          </mesh>
        </>
      );
    case "pelvis_cover":
      return (
        <>
          {/* HARD-SURFACE fascia shell that slides off to expose the hip
              actuators — a flat-fronted hip plate (broad front fascia + angled
              side flanks) with a recessed center seam, matching the paneled
              girdle underneath. The frontmost LIT pelvis panel at idle: WIDER +
              brought FORWARD to z=0.215 so the pelvis front reads as a bright
              girdle plate (like the chest/thighs), never a dark block. It slides
              +z on teardown to expose the pelvis fascia underneath. NARROWED
              (0.29) in step with the slimmed girdle; pulled BACK to z=0.135 (was
              0.215) so at idle it sits ON the flattened girdle front (~0.13) — the
              frontmost lit pelvis surface kept THIN front-to-back, not a proud
              block. Still slides +z on teardown (motion unchanged). */}
          <RoundedBox args={[0.245, 0.34, 0.06]} radius={0.03} smoothness={3} position={[0, -0.01, 0.12]} material={mattePolymer} castShadow />
          {[-1, 1].map((s) => (
            <RoundedBox
              key={s}
              args={[0.09, 0.32, 0.05]}
              radius={0.02}
              smoothness={3}
              position={[s * 0.135, -0.01, 0.06]}
              rotation-y={s * -0.6}
              material={mattePolymer}
              castShadow
            />
          ))}
          {/* one recessed seam line down the fascia center */}
          <RoundedBox args={[0.014, 0.28, 0.014]} radius={0.005} position={[0, -0.01, 0.145]} material={seamInset} />
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
              old wide frustum (top r 0.30, was 0.34) so the chest reads LEAN +
              humanoid (a Figure-02 trunk) and the shoulders frame it without the
              torso being a wide box. 18-gon = smooth under the dither. */}
          {/* SLAB chest: z-scale 0.5 (was 0.74) so the trunk is a flat humanoid
              chest — width 0.275, depth 0.275*0.5 = 0.138 (width:depth 2:1, the
              G1 0.45x0.20 envelope). This is THE change that kills the barrel
              read from the side/3-4. 18-gon = smooth under the dither. */}
          <mesh position={[0, 0.08, 0]} scale={[1, 1, 0.5]} material={mattePolymer} castShadow>
            <cylinderGeometry args={[0.24, 0.205, 0.52, 18]} />
          </mesh>
          {/* convex upper-chest cap so the top of the trunk domes (pectoral mass)
              instead of reading as a flat cylinder lid under the clavicle. SLIMMED
              (r 0.24, was 0.275) in this proportion pass so the narrowed shoulders
              frame a lean chest, not a wide box. FLATTENED (z 0.5) in step with the
              slab trunk so the chest top stays thin front-to-back. */}
          <mesh position={[0, 0.3, 0]} scale={[1, 0.6, 0.5]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.24, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          </mesh>
          {/* G1 3-DOF WAIST JOINT. The G1 has a distinct, NARROWER waist actuator
              section between the chest and the pelvis — a flattened hub clearly
              pinched in from both the chest (r 0.275) and the hips (r 0.235). This
              both matches the G1 and breaks the barrel silhouette into chest +
              waist + hips instead of one drum.
              (a) upper transition: chest base (r 0.265) tapers IN to the waist
                  hub (r 0.175) over a short section so the pinch reads, no gap. */}
          <mesh position={[0, -0.075, 0]} scale={[1, 1, 0.5]} material={mattePolymer} castShadow>
            <cylinderGeometry args={[0.21, 0.155, 0.16, 18]} />
          </mesh>
          {/* (b) the WAIST HUB itself — a short, NARROW, flattened dark actuator
              band (the visible waist joint), r 0.15, z 0.42 so it's the thinnest
              part of the trunk front-to-back. TIGHTENED (was 0.175) so the waist
              reads CLEARLY PINCHED — no belly bulge. Dark polymer so it reads as an
              exposed actuator section between the lit chest and lit pelvis. */}
          <mesh position={[0, -0.18, 0]} scale={[1, 1, 0.42]} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.15, 0.155, 0.13, 20]} />
          </mesh>
          {/* (c) waist actuator side DISCS — flat dark hubs on the L/R flanks of
              the waist joint, axis sideways, so the waist reads as a real powered
              joint (the G1 waist-roll actuator) and the pinch is unmistakable. */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.135, -0.18, 0]} rotation-z={HPI} material={darkPolymer} castShadow>
              <cylinderGeometry args={[0.058, 0.058, 0.05, 20]} />
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.16, -0.18, 0]} rotation-z={HPI} material={brushedMetal}>
              <cylinderGeometry args={[0.028, 0.028, 0.02, 16]} />
            </mesh>
          ))}
          {/* (d) lower transition: the waist hub flares back OUT to the pelvis
              girdle (r 0.245) and physically MEETS it — bottom at torso y=-0.34
              (world ~1.62) overlapping the raised girdle top (r 0.235), so the
              lit column stays continuous chest -> waist -> pelvis with NO gap. */}
          <mesh position={[0, -0.285, 0]} scale={[1, 1, 0.52]} material={mattePolymer} castShadow>
            <cylinderGeometry args={[0.155, 0.205, 0.16, 18]} />
          </mesh>
          {/* LIT ABDOMEN BRIDGE — a broad flat front panel on the TORSO itself
              (not the hinged chest plate) spanning the lower waist DOWN to the
              pelvis. Pulled BACK to z=0.12 (was 0.245) so it sits ON the flattened
              slab front (trunk front ~0.13), not floating proud of it — keeps the
              slab THIN front-to-back while still lapping over the raised pelvis
              girdle/cover top with a lit surface (kills the dark chest/abdomen
              step even while the chest plate is hinged open in teardown). */}
          <RoundedBox args={[0.255, 0.32, 0.06]} radius={0.03} smoothness={3} position={[0, -0.36, 0.1]} material={mattePolymer} castShadow />
          {/* its angled side abdomen flanks so the bridge wraps, not a flat slab —
              pulled in (x s*0.14) to track the slimmer pinched waist */}
          {[-1, 1].map((s) => (
            <RoundedBox
              key={s}
              args={[0.09, 0.3, 0.05]}
              radius={0.025}
              smoothness={3}
              position={[s * 0.14, -0.34, 0.045]}
              rotation-y={s * -0.5}
              material={mattePolymer}
              castShadow
            />
          ))}
          {/* internal dark core bay — kept SMALL and recessed (z back) so it only
              reads as the exposed core once the chest plastron hinges open; it no
              longer faces the camera as a dark block at idle. Also stands in for
              the removed chest_core_housing's dark cage behind the plastron. */}
          <RoundedBox args={[0.2, 0.24, 0.12]} radius={0.03} position={[0, 0.02, -0.04]} material={darkPolymer} />
          {/* machined seam ring at the clavicle line, tucked inside the chest.
              Radius tracks the slimmed chest top (0.25, was 0.285). */}
          <group position={[0, 0.32, 0]} rotation={[HPI, 0, 0]}>
            <mesh scale={[1, 0.74, 1]} material={lip}>
              <torusGeometry args={[0.25, 0.008, 8, 48]} />
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
              convex chest mass. Tapered (scale y/z) so it's humanoid, not boxy.
              SLIMMED (r 0.28, was 0.33) in step with the slimmed torso so the
              plastron stays just proud of the trunk (lean, not a wide barrel).
              FLATTENED (z 0.5, was 0.82) so the plastron is a thin slab chest
              that hugs the flattened trunk front (~0.14 deep), NOT a round
              barrel bulging forward — this is what makes the chest read THIN in
              the side/3-4 views. */}
          <mesh position={[0, 0.02, 0.03]} scale={[1, 1.12, 0.5]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.245, 40, 30, Math.PI * 1.05, Math.PI * 0.9, 0.0, Math.PI * 0.62]} />
          </mesh>
          {/* abdominal plastron — extends the lit chest panel DOWN over the upper
              waist so the chest flows into the midriff with no dark step. LENGTHENED
              (h0.4, center y=-0.22) so its lit front laps DOWN to world ~1.55 —
              firmly overlapping the raised pelvis girdle/cover top (world ~1.66+)
              so there is NO dark gap between the chest and the abdomen/pelvis. A
              tapered cylinder section closed at the front (matte). Slimmed
              (r 0.27/0.255, was 0.3/0.285) in step with the trunk; still laps the
              pelvis girdle top (r 0.235) so the chest->abdomen->pelvis stays one
              continuous lit column with no dark step. FLATTENED (z 0.52) in step
              with the slab plastron so the abdomen panel stays thin front-to-back. */}
          <mesh position={[0, -0.22, 0.0]} scale={[1, 1, 0.52]} material={mattePolymer} castShadow>
            <cylinderGeometry args={[0.235, 0.215, 0.4, 18, 1, false, Math.PI * 1.12, Math.PI * 0.76]} />
          </mesh>
          {/* HARD-SURFACE PECTORAL PANELS — two proud flat-faced plates (L/R)
              chamfered onto the convex plastron so the chest reads as a paneled
              plastron, not a smooth barrel. They catch the highlight as flat
              faces; the dark sternum channel between them divides the chest.
              Pulled in + BACK (z 0.155, was 0.245) onto the flattened slab front
              so the pectorals sit on the thin chest, not floating proud of it. */}
          {[-1, 1].map((s) => (
            <RoundedBox
              key={s}
              args={[0.15, 0.2, 0.05]}
              radius={0.02}
              smoothness={3}
              position={[s * 0.088, 0.08, 0.155]}
              rotation-y={s * -0.32}
              material={mattePolymer}
              castShadow
            />
          ))}
          {/* recessed dark STERNUM channel dividing the two pectoral panels —
              pulled BACK to z=0.18 to sit on the flattened plastron front */}
          <RoundedBox args={[0.05, 0.26, 0.035]} radius={0.01} position={[0, 0.04, 0.18]} material={darkPolymer} />
          {/* side panel-break seams along the chest flanks (Optimus shell lines) —
              pulled in (x s*0.155) to track the slimmer flatter chest flanks */}
          {[-1, 1].map((s) => (
            <RoundedBox
              key={s}
              args={[0.012, 0.3, 0.012]}
              radius={0.004}
              smoothness={2}
              position={[s * 0.155, 0.04, 0.12]}
              rotation-y={s * -0.5}
              material={seamInset}
            />
          ))}
          {/* white emissive chest seam — the sternum accent line */}
          <RoundedBox args={[0.012, 0.22, 0.012]} radius={0.004} position={[0, 0.04, 0.2]} material={brightEmissiveSeam} />
          {/* abdominal WAIST-BREAK panel — a recessed dark band low on the
              plastron so the trunk reads as chest-panel-over-abdomen, with a
              clean horizontal break instead of a smooth drum that runs to the
              pelvis. Pulled BACK to z=0.15 onto the flattened slab front. */}
          <RoundedBox args={[0.26, 0.04, 0.035]} radius={0.01} position={[0, -0.16, 0.15]} material={seamInset} />
          {/* lit abdominal segment plate below the break — LENGTHENED + dropped to
              y=-0.3 so its lit front laps down over the pelvis girdle top, closing
              the chest->abdomen gap with a continuous lit surface. Stays above the
              y=-0.34 hinge line so the teardown hinge is unchanged. Pulled BACK to
              z=0.13 onto the flattened slab front. */}
          <RoundedBox args={[0.23, 0.2, 0.05]} radius={0.018} smoothness={3} position={[0, -0.3, 0.13]} material={mattePolymer} castShadow />
          {/* status dot trio — same chest lights as the 2D V (on the flat front) */}
          {[-0.05, 0, 0.05].map((x) => (
            <mesh key={x} position={[x, -0.1, 0.19]} material={chestDotMat}>
              <sphereGeometry args={[0.013, 12, 12]} />
            </mesh>
          ))}
          {/* one clean machined inner lip framing the panel's top opening edge —
              pulled back (z 0.1) onto the flattened plastron */}
          <mesh position={[0, 0.3, 0.1]} rotation-x={HPI * 0.92} material={lip}>
            <torusGeometry args={[0.26, 0.012, 8, 40, Math.PI]} />
          </mesh>
          {/* visible hinge pivot along the bottom edge — narrowed (0.36) to match
              the slimmer plastron; pulled back (z 0.12) onto the flattened front.
              Pivot Y unchanged so the teardown hinge line is untouched. */}
          <mesh position={[0, -0.34, 0.12]} rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.36, 12]} />
          </mesh>
        </>
      );
    case "back_plate":
      return (
        <>
          {/* solid convex dorsal shell matching the plastron — a filled domed
              back panel (same closed form, mirrored), with a single central
              spine channel and no open dark interior. FLATTENED (z 0.5, was 0.82)
              in step with the front plastron so the trunk reads THIN front-to-back
              from the side/3-4 — the back is a slab, not a barrel half. */}
          <mesh position={[0, 0.02, -0.03]} scale={[1, 1.12, 0.5]} rotation-y={Math.PI} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.28, 40, 30, Math.PI * 1.05, Math.PI * 0.9, 0.0, Math.PI * 0.62]} />
          </mesh>
          <mesh position={[0, -0.12, -0.03]} scale={[1, 1, 0.5]} rotation-y={Math.PI} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.28, 36, 24, Math.PI * 1.1, Math.PI * 0.8, Math.PI * 0.42, Math.PI * 0.42]} />
          </mesh>
          {/* central spine channel (dark) — pulled forward to z=-0.16 onto the
              flattened back surface */}
          <RoundedBox args={[0.08, 0.3, 0.04]} radius={0.02} position={[0, 0.04, -0.16]} material={darkPolymer} />
          <mesh position={[0, 0.3, -0.1]} rotation={[HPI * 1.08, 0, Math.PI]} material={lip}>
            <torusGeometry args={[0.28, 0.012, 8, 40, Math.PI]} />
          </mesh>
          <mesh position={[0, -0.34, -0.18]} rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.02, 0.02, 0.42, 12]} />
          </mesh>
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
    case "shoulder_yoke":
      return (
        <>
          {/* clavicle yoke — NARROWED (0.56, was 0.74) so the shoulder line is a
              MODEST ~1.7x the hip width, not the old dominant crossbar. Lit
              clavicle deck so the top of the trunk reads solid, not a dark bar. */}
          <RoundedBox args={[0.56, 0.13, 0.21]} radius={0.05} material={mattePolymer} castShadow />
          {/* defined clavicle ridges sweeping to the shoulders */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.19, 0.02, 0.06]} rotation-z={s * 0.25} material={mattePolymer} castShadow>
              <capsuleGeometry args={[0.033, 0.14, 4, 10]} />
            </mesh>
          ))}
          {[-0.27, 0.27].map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation-z={HPI} material={darkPolymer} castShadow>
              <cylinderGeometry args={[0.072, 0.072, 0.06, 16]} />
            </mesh>
          ))}
        </>
      );
    case "shoulder_ball_l":
    case "shoulder_ball_r": {
      const sgn = id.endsWith("_l") ? -1 : 1;
      return (
        <>
          {/* exposed black ball joint — the deltoid actuator (compact, G1-scale) */}
          <mesh material={darkPolymer} castShadow>
            <sphereGeometry args={[0.078, 24, 18]} />
          </mesh>
          {/* G1 SHOULDER MOTOR — a MODEST cylindrical actuator on the outboard
              side of the shoulder, axis along the arm (X). Compact (r 0.068,
              depth 0.06) so the shoulder reads as a powered joint, not a big
              disc blob — G1 shoulders are tight to the body. */}
          <mesh position={[sgn * 0.072, 0, 0]} rotation-z={HPI} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.068, 0.068, 0.06, 24]} />
          </mesh>
          {/* brushed center hub + machined rim on the motor face */}
          <mesh position={[sgn * 0.103, 0, 0]} rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.034, 0.034, 0.018, 18]} />
          </mesh>
          <mesh position={[sgn * 0.1, 0, 0]} rotation-z={HPI} material={lip}>
            <torusGeometry args={[0.06, 0.008, 8, 24]} />
          </mesh>
        </>
      );
    }
    case "pauldron_l":
    case "pauldron_r": {
      const sgn = id.endsWith("_l") ? -1 : 1;
      return (
        <>
          {/* COMPACT deltoid cap — a small chamfered shoulder cap hugging the
              joint (G1 shoulders are tight, NOT big pauldron blobs). A modest
              rounded plate over the top-outboard of the shoulder motor + a short
              flank panel; no oversized cap, no wide skirt. */}
          <RoundedBox args={[0.13, 0.09, 0.15]} radius={0.04} smoothness={3} position={[sgn * 0.03, 0.03, 0]} material={mattePolymer} castShadow />
          {/* short outboard flank panel down the upper deltoid */}
          <RoundedBox args={[0.07, 0.11, 0.13]} radius={0.03} smoothness={3} position={[sgn * 0.085, -0.03, 0]} rotation-z={sgn * 0.45} material={panelShade} castShadow />
          {/* recessed seam dividing the cap from the flank */}
          <RoundedBox args={[0.01, 0.016, 0.12]} radius={0.003} smoothness={2} position={[sgn * 0.06, -0.005, 0]} material={seamInset} />
          {/* visible hinge pivot along the inboard edge (hinge axis = z) */}
          <mesh position={[sgn * -0.06, 0.05, 0]} rotation-x={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.014, 0.014, 0.08, 10]} />
          </mesh>
        </>
      );
    }
    case "upper_arm_l":
    case "upper_arm_r":
      return (
        <>
          {/* HARD-SURFACE humeral segment — a flat-fronted tapered PANEL (broad
              front face, narrower dimmer back shell, chamfered side rails, two
              recessed seams) replacing the old smooth cylinder. Reads as a
              machined Optimus upper-arm shell, not a tube. */}
          <PanelSegment
            topY={-0.02}
            len={0.4}
            wTop={0.13}
            wBot={0.1}
            flat={0.52}
            seams={2}
          />
          {/* compact DARK actuator hub at the top, exposed under the deltoid —
              the light panel caps onto this so the joint reads as an exposed
              mechanical hub between shells (breaks the tube read at the top) */}
          <mesh position={[0, 0.04, 0]} rotation-z={HPI} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.062, 0.062, 0.12, 16]} />
          </mesh>
          <mesh position={[0, 0.04, 0]} rotation-z={HPI} material={brushedMetal}>
            <cylinderGeometry args={[0.03, 0.03, 0.14, 14]} />
          </mesh>
          {/* machined collar where the panel caps onto the elbow */}
          <mesh position={[0, -0.41, 0]} material={lip}>
            <cylinderGeometry args={[0.052, 0.052, 0.02, 16]} />
          </mesh>
        </>
      );
    case "elbow_l":
    case "elbow_r": {
      const sgn = id.endsWith("_l") ? -1 : 1;
      return (
        <>
          {/* G1 ELBOW DISC MOTOR — exposed flat dark actuator disc, hinge axis
              left-right (X). Widened to r 0.07 and given a proud OUTBOARD disc
              face so the elbow reads as a powered disc joint that breaks the arm
              into upper-arm + forearm segments (not one tube). */}
          <mesh rotation-z={HPI} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 0.092, 24]} />
          </mesh>
          {/* outboard disc face — brushed hub + machined rim */}
          <mesh position={[sgn * 0.06, 0, 0]} rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.036, 0.036, 0.018, 16]} />
          </mesh>
          <mesh position={[sgn * 0.057, 0, 0]} rotation-z={HPI} material={lip}>
            <torusGeometry args={[0.062, 0.008, 8, 24]} />
          </mesh>
          {/* hinge linkage plate */}
          <RoundedBox args={[0.03, 0.08, 0.05]} radius={0.008} position={[sgn * 0.04, -0.04, 0]} material={brushedMetal} />
        </>
      );
    }
    case "forearm_l":
    case "forearm_r":
      return (
        <>
          {/* HARD-SURFACE forearm core (black, tendon-driven) — a flat-fronted
              tapered dark PANEL narrowing toward the wrist, with a brushed
              actuator spine showing on the back. No smooth tube. */}
          <PanelSegment
            topY={0}
            len={0.32}
            wTop={0.092}
            wBot={0.06}
            flat={0.52}
            mat={darkPolymer}
            backMat={darkPolymer}
            seams={2}
          />
          {/* exposed brushed tendon-actuator spine running the back of the
              forearm — the mechanical detail that reads under the dither */}
          <mesh position={[0, -0.15, -0.04]} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.022, 0.016, 0.28, 12]} />
          </mesh>
          {/* one machined collar near the elbow reading as the segment seam */}
          <mesh position={[0, -0.04, 0]} material={brushedMetal}>
            <cylinderGeometry args={[0.05, 0.05, 0.016, 16]} />
          </mesh>
        </>
      );
    case "forearm_shell_l":
    case "forearm_shell_r": {
      const sgn = id.endsWith("_l") ? -1 : 1;
      return (
        <>
          {/* HARD-SURFACE forearm cuff — a flat-fronted tapered PLATE covering
              the forearm, hinging outboard. Replaces the round cuff with a
              paneled gauntlet (front fascia + back shell + seam). */}
          <PanelSegment
            topY={0.08}
            len={0.3}
            wTop={0.115}
            wBot={0.078}
            flat={0.5}
            seams={1}
          />
          <mesh position={[0, 0.08, 0.01]} scale={[1, 1, 0.86]} material={lip}>
            <cylinderGeometry args={[0.06, 0.06, 0.014, 16]} />
          </mesh>
          {/* visible hinge pivot along the outboard edge (hinge axis = z) */}
          <mesh position={[sgn * 0.058, 0.18, 0]} rotation-x={HPI} material={brushedMetal} castShadow>
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
          {/* exposed actuator cluster — the hip ball. The joint hub fills the
              space between the pelvis girdle above and the thigh root below so the
              leg connects to the pelvis with no gap. */}
          <mesh rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.082, 0.082, 0.13, 20]} />
          </mesh>
          <mesh material={darkPolymer} castShadow>
            <sphereGeometry args={[0.092, 20, 16]} />
          </mesh>
          {/* G1 HIP DISC MOTOR — the signature flat actuator housing on the
              OUTBOARD hip flank, axis along the joint (X). SLIMMED + pulled INBOARD
              (r 0.082 @ 0.06, was 0.105 @ 0.085) so the hip reads as a powered disc
              joint without flaring the hips wider than the slim pelvis/legs. */}
          {(() => { const sgn = id.endsWith("_l") ? -1 : 1; return (
            <>
              <mesh position={[sgn * 0.048, 0, 0]} rotation-z={HPI} material={darkPolymer} castShadow>
                <cylinderGeometry args={[0.066, 0.066, 0.055, 28]} />
              </mesh>
              <mesh position={[sgn * 0.078, 0, 0]} rotation-z={HPI} material={brushedMetal} castShadow>
                <cylinderGeometry args={[0.034, 0.034, 0.02, 20]} />
              </mesh>
              <mesh position={[sgn * 0.074, 0, 0]} rotation-z={HPI} material={lip}>
                <torusGeometry args={[0.06, 0.008, 8, 28]} />
              </mesh>
            </>
          ); })()}
          {/* LIT hip-socket sleeve lapping UP toward the pelvis girdle (world
              ~1.52) so the hip reads as a lit joint feeding into the pelvis, not
              a dark bead under a void. FLATTENED (z 0.6) in step with the slab leg. */}
          <mesh position={[0, 0.09, 0.01]} scale={[1, 1.1, 0.6]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.092, 18, 14]} />
          </mesh>
          <mesh rotation-x={HPI} material={lip}>
            <torusGeometry args={[0.074, 0.01, 8, 24]} />
          </mesh>
        </>
      );
    case "thigh_l":
    case "thigh_r":
      return (
        <>
          {/* femur actuator core (black) — a flat-sided dark PANEL spanning the
              full thigh. Top RAISED to y=+0.10 (world ~1.44, up into the hip
              socket) and lengthened so the BASE reaches the knee actuator at
              y=-0.62 (world ~0.72): no dark void at the hip, no severed gap at
              the knee. Built as a hard segment so when the light thigh shell
              hinges off in teardown the exposed femur still reads as a machined
              block, not a round rod. Slim (the broad light shell rides over it). */}
          <PanelSegment
            topY={0.1}
            len={0.82}
            wTop={0.13}
            wBot={0.092}
            flat={0.52}
            mat={darkPolymer}
            backMat={darkPolymer}
            seams={2}
          />
          {/* upper-thigh shoulder that seats UP into the hip ball — raised to
              y=+0.11 (world ~1.45) so it plugs the hip socket and the leg root
              reads continuous with the pelvis, no gap. */}
          <mesh position={[0, 0.11, 0]} material={darkPolymer} castShadow>
            <sphereGeometry args={[0.095, 18, 14]} />
          </mesh>
          {/* machined collar at the knee end (LOWERED to the lengthened base, at
              the new knee origin y=-0.7) */}
          <mesh position={[0, -0.72, 0]} material={lip}>
            <cylinderGeometry args={[0.058, 0.058, 0.022, 16]} />
          </mesh>
        </>
      );
    case "thigh_shell_l":
    case "thigh_shell_r":
      return (
        <>
          {/* HARD-SURFACE thigh shell — a broad flat-fronted LIT PLATE widest at
              the hip, tapering toward the knee (Optimus quad panel). Top RAISED
              to y=+0.30 (world ~1.46, lapping up into the pelvis hip socket) and
              lengthened to len 0.74 so the LIT base reaches the knee at world
              ~0.72 — closes the hip gap above and the knee gap below. Wide front
              fascia + dimmer back shell + chamfer rails + two recessed quad
              seams. Opens on the same top-rear hinge (pivot mesh unchanged). */}
          <PanelSegment
            topY={0.3}
            len={0.84}
            wTop={0.17}
            wBot={0.125}
            flat={0.52}
            seams={2}
          />
          {/* LIT hip-socket cap — a proud matte hub at the shell top that laps
              up into the pelvis girdle (world ~1.49) so the thigh root reads as a
              lit ball seating into the hip, not a dark stub below a void. */}
          <mesh position={[0, 0.33, 0.01]} scale={[1, 0.92, 0.92]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.1, 20, 16]} />
          </mesh>
          {/* machined collar at the top rim where the shell caps the hip */}
          <mesh position={[0, 0.28, 0.02]} scale={[1, 1, 0.82]} material={lip}>
            <cylinderGeometry args={[0.088, 0.088, 0.016, 16]} />
          </mesh>
          {/* visible hinge pivot at the top-rear edge (hinge axis = x) — kept at
              its original local position so the teardown hinge is unchanged */}
          <mesh position={[0, 0.2, -0.075]} rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.014, 0.014, 0.14, 10]} />
          </mesh>
        </>
      );
    case "knee_l":
    case "knee_r": {
      const sgn = id.endsWith("_l") ? -1 : 1;
      return (
        <>
          {/* exposed knee hinge + visible 4-bar linkage. Hub WIDENED (r0.072,
              len 0.14) so it bodily FILLS the joint between the thigh base and
              the shin top — the leg reads continuous thigh->knee->shin with no
              severed gap. Hinge axis (rotation-z = HPI -> bend about X) is
              UNCHANGED so the knee still bends correctly. */}
          <mesh rotation-z={HPI} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.082, 0.082, 0.14, 24]} />
          </mesh>
          {/* G1 KNEE DISC MOTOR — proud OUTBOARD flat actuator disc face with a
              brushed hub + machined rim so the knee reads as a powered disc joint
              breaking the leg into thigh + shin (not one tube). */}
          <mesh position={[sgn * 0.072, 0, 0]} rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.044, 0.044, 0.02, 18]} />
          </mesh>
          <mesh position={[sgn * 0.068, 0, 0]} rotation-z={HPI} material={lip}>
            <torusGeometry args={[0.074, 0.009, 8, 26]} />
          </mesh>
          {/* lit knee cap — a small matte plate proud of the joint front so the
              knee reads as a lit hub, not a dark bead, joining the lit shells */}
          <RoundedBox args={[0.1, 0.13, 0.045]} radius={0.018} smoothness={3} position={[0, 0, 0.06]} material={mattePolymer} castShadow />
          {/* linkage bars front + rear */}
          {[0.05, -0.05].map((z) => (
            <RoundedBox key={z} args={[0.02, 0.12, 0.018]} radius={0.005} position={[sgn * 0.035, -0.02, z]} rotation-x={z > 0 ? 0.2 : -0.2} material={brushedMetal} />
          ))}
        </>
      );
    }
    case "shin_l":
    case "shin_r":
      return (
        <>
          {/* tibial actuator core (black) — a flat-fronted dark PANEL spanning
              the full shin. Top RAISED to y=+0.12 (world ~0.76) so it overlaps
              the knee actuator (no gap under the knee hub); base at the ankle
              y=-0.54. Flatter in depth than the thigh (a shin plate), with a
              distinct CALF swell behind it. */}
          <PanelSegment
            topY={0.12}
            len={0.72}
            wTop={0.115}
            wBot={0.07}
            flat={0.5}
            mat={darkPolymer}
            backMat={darkPolymer}
            seams={2}
          />
          {/* CALF swell — a paneled bulge behind the upper shin (the gastroc
              mass) chamfered, not a round ball, so the back of the leg has a
              real machined profile that tapers to the ankle */}
          <RoundedBox
            args={[0.09, 0.28, 0.07]}
            radius={0.03}
            smoothness={3}
            position={[0, -0.16, -0.06]}
            material={darkPolymer}
            castShadow
          />
          {/* machined collar at the ankle end (LOWERED to the new ankle origin) */}
          <mesh position={[0, -0.6, 0]} material={lip}>
            <cylinderGeometry args={[0.044, 0.044, 0.02, 16]} />
          </mesh>
        </>
      );
    case "shin_shell_l":
    case "shin_shell_r":
      return (
        <>
          {/* HARD-SURFACE shin shell — a flat-fronted SHIN PLATE (the Optimus
              tibia guard), broad at the top tapering to the ankle, with a paneled
              CALF swell on the back. Top RAISED to y=+0.28 (world ~0.76, lapping
              up to the knee actuator) and lengthened to len 0.62 so the LIT shin
              meets the knee hub — no severed gap at the knee. Same top-rear
              hinge (pivot mesh unchanged). */}
          <PanelSegment
            topY={0.28}
            len={0.68}
            wTop={0.14}
            wBot={0.088}
            flat={0.5}
            seams={2}
          />
          {/* LIT shin-top cap lapping the knee — a proud matte hub at the shell
              top (world ~0.77) so the shin reads as a lit form meeting the knee,
              not a stub below the gap. */}
          <mesh position={[0, 0.27, 0.01]} scale={[1, 0.85, 0.9]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.092, 18, 14]} />
          </mesh>
          {/* light calf swell on the back of the shell — paneled gastroc bulge */}
          <RoundedBox
            args={[0.11, 0.22, 0.07]}
            radius={0.03}
            smoothness={3}
            position={[0, 0.0, -0.08]}
            material={panelShade}
            castShadow
          />
          <mesh position={[0, 0.18, 0.02]} scale={[1, 1, 0.8]} material={lip}>
            <cylinderGeometry args={[0.082, 0.082, 0.014, 16]} />
          </mesh>
          <mesh position={[0, 0.18, -0.075]} rotation-z={HPI} material={brushedMetal} castShadow>
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
          {/* LIT tapered neck column — mattePolymer so the neck READS against the
              black background instead of vanishing. A thin DARK neck made the head
              look detached (it disappeared into the black panel); a lit column that
              flares wide at the base to seat on the clavicle deck and necks down
              into the head bridges shoulders->head as one continuous lit mass. */}
          <mesh position={[0, 0.02, 0]} material={mattePolymer} castShadow>
            <cylinderGeometry args={[0.082, 0.118, 0.12, 24]} />
          </mesh>
          <mesh position={[0, 0.13, 0]} material={mattePolymer} castShadow>
            <cylinderGeometry args={[0.088, 0.082, 0.1, 24]} />
          </mesh>
          {/* exposed brushed actuator rings — the yaw servo stack, machined banding
              proud of the lit column (stacked-disc neck spacer look) */}
          {[0.05, 0.11, 0.17].map((y) => (
            <mesh key={y} position={[0, y, 0]} material={brushedMetal}>
              <cylinderGeometry args={[0.094, 0.094, 0.015, 24]} />
            </mesh>
          ))}
          {/* white emissive neck seam ring — part of the one accent line */}
          <mesh position={[0, 0.185, 0]} rotation-x={HPI} material={brightEmissiveSeam}>
            <torusGeometry args={[0.085, 0.005, 8, 32]} />
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
          {/* DARK VISOR (folded in from the removed visor_glass part) — the
              near-black glossy blank face. A smoked teardrop filling the face
              opening so the front of the head reads as one dark glossy mass; the
              emissive eyes + mouth (below / in eye_ring) are the ONLY things that
              bloom through it. No bright brow arc/halo — the face is just the
              eyes + mouth on a dark visor. */}
          <mesh position={[0, 0.005, 0.085]} scale={[1.02, 1.14, 0.7]} material={darkGlass}>
            <sphereGeometry args={[0.18, 40, 30, Math.PI * 0.82, Math.PI * 1.36, 0.42, 1.42]} />
          </mesh>
          {/* MOUTH / underscanline (folded in from the removed face_seam part) —
              a thin emissive bar low on the visor that shifts with mood (dim+flat
              at rest, brighter/wider scan/typing, short+sharp on error). The
              `faceMouth` ref is driven by the frame loop's FACE EXPRESSION block.
              This is the only emissive face feature besides the eyes; there is NO
              brow seam/arc over the head anymore. */}
          <RoundedBox
            args={[0.07, 0.008, 0.01]}
            radius={0.004}
            position={[0, -0.061, 0.198]}
            ref={(m) => ctx.setExtra("faceMouth", m)}
            material={faceMat.mouth}
          />
          {/* LIT neck collar joining the stack — mattePolymer (was dark) so the
              head-to-neck join stays lit and continuous, no dark band that re-
              breaks the head off from the body. */}
          <mesh position={[0, -0.18, 0]} material={mattePolymer}>
            <cylinderGeometry args={[0.078, 0.092, 0.08, 20]} />
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
  // ANTICIPATION + FOLLOW-THROUGH come from DIFFERENTIAL DAMPING in the idle block
  // (eyes lead fast, head trails, neck/body settle slowest), not a stored lead.
  const gesture = useRef({ name: "none", t0: -10, dur: 0, next: 4 });
  // damped articulation pose (per-side shoulder pitch/roll + elbow flex, body
  // sway/nod). Everything eases toward these so joints move with servo feel.
  const pose = useRef({
    shP: { L: 0, R: 0 }, // shoulder pitch (forward raise)
    shR: { L: 0, R: 0 }, // shoulder roll (lateral abduct)
    elb: { L: 0, R: 0 }, // elbow flexion
    sway: 0, // weight-shift yaw of the whole figure
    swayRoll: 0, // weight-shift ROLL (subtle body lean into the shift)
    nod: 0, // extra head pitch from nod/bow gestures
    shrug: 0, // shoulder-yoke rise
    hCock: 0, // idle head COCK (roll/tilt of the head, organic life)
    hSway: 0, // idle head SWAY (slow yaw drift independent of gaze)
    hand: 0, // hand/finger micro-curl (tiny settle, reads as alive)
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

    // BREATHING — a layered organic breath, not a single mechanical sine. A slow
    // primary inhale/exhale (1.4) plus a smaller faster harmonic (2.9) and a very
    // slow drift (0.6) so the rise+fall never loops on an obvious beat. The torso
    // carries the whole upper chain; the shoulder yoke rises with the breath so
    // the chest visibly inflates, and the chest expands a hair on the inhale.
    const breath =
      (Math.sin(t * 1.4) * 0.78 + Math.sin(t * 2.9 + 1.1) * 0.16 + Math.sin(t * 0.6 + 0.5) * 0.06) * calmA;
    if (R.torso) R.torso.position.y = TORSO_Y0 + breath * 0.013;
    pose.current.shrug = breath * 0.011;

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
    // AUTONOMOUS IDLE GESTURES — only when truly idle, assembled, and not frozen.
    // Fires MORE OFTEN (every ~2.6-6s, was 5-10) and from a RICHER, WEIGHTED pool
    // so V keeps articulating with variety: small, frequent organic beats (head
    // tilt/cock, glance, weight shift, arm sway, breath) interleaved with the
    // bigger occasional articulations (wave, elbow flex, shoulder roll). Durations
    // vary per gesture so the loop never reads as a fixed cadence.
    if (!torn && calmA > 0 && s.avatarState === "idle" && creep < 1 && t > gs.next && t - gs.t0 > 1.0) {
      // weighted pool — the small organic beats dominate so V feels alive but calm
      const pool = [
        "headTilt", "headTilt", "headCock", "glance", "glance",
        "weightShift", "weightShift", "armSway", "armSway", "breathDeep",
        "shoulderRoll", "elbowFlex", "nod", "wave",
      ];
      const name = pool[(Math.random() * pool.length) | 0];
      const durMap = {
        wave: 2.2, elbowFlex: 1.5, shoulderRoll: 1.7, weightShift: 2.8,
        nod: 1.2, headTilt: 2.4, headCock: 2.0, glance: 1.8, armSway: 2.6,
        breathDeep: 3.0,
      };
      // small beats come back sooner; big articulations leave more breathing room
      const big = name === "wave" || name === "elbowFlex" || name === "shoulderRoll";
      const gap = (big ? 4.5 : 2.6) + Math.random() * (big ? 4 : 3);
      gesture.current = { name, t0: t, dur: durMap[name] || 1.6, next: t + gap };
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
    // idle-gesture head channels (cock=roll/tilt, sway=extra yaw) + a transient
    // GLANCE that steers the gaze briefly without a lookTarget. These layer on
    // top of the continuous organic idle further below.
    let hCockT = 0;
    let hSwayGT = 0;
    let glanceX = 0;
    let glanceY = 0;
    if (gActive) {
      // when holding, pin the envelope to peak (e=1) and freeze sub-oscillators
      const p = hold ? 0.5 : gt / gesture.current.dur;
      const e = hold ? 1 : env(p);
      // wave/scan bob phases: live = time-driven; held = frozen at the bob peak
      const waveBob = hold ? 1 : Math.sin(gt * 9);
      const scanBob = hold ? 1 : Math.sin(gt * 1.6);
      if (gName === "headTilt") {
        // a slow, curious head tilt to one side (deterministic side from t0 so the
        // held dev pose is stable) — pure secondary head life, no arm motion
        const dir = Math.sin(gesture.current.t0 * 1.7) >= 0 ? 1 : -1;
        hCockT = dir * 0.16 * e;
        hSwayGT = dir * 0.12 * e;
      } else if (gName === "headCock") {
        // a quicker, sharper cock-and-return (alert/listening) with a chin lift
        const dir = Math.cos(gesture.current.t0 * 2.3) >= 0 ? 1 : -1;
        hCockT = dir * 0.22 * e;
        nodT = -0.06 * e; // slight chin UP (attentive)
      } else if (gName === "glance") {
        // V looks away briefly then back — a darting glance (deterministic dir)
        const dx = Math.sin(gesture.current.t0 * 3.1);
        glanceX = dx * 0.5 * e;
        glanceY = -0.12 * e;
        hCockT = dx * 0.05 * e; // a hair of head tilt into the glance
      } else if (gName === "armSway") {
        // both arms drift gently outward + back (a relaxed settle), opposite
        // phase L/R so it reads organic, not symmetric-robotic
        shPT.L = -0.08 * e;
        shPT.R = -0.06 * e;
        shRT.L = -0.07 * e;
        shRT.R = -0.05 * e;
        elbT.L = 0.12 + 0.1 * e;
        elbT.R = 0.12 + 0.14 * e;
      } else if (gName === "breathDeep") {
        // a deliberate deep breath — shoulders rise + a faint chest lift; reads as
        // V settling/relaxing. Layered on top of the base breath via the yoke.
        G.shrug = (G.shrug || 0) + 0.018 * e;
        shRT.L = -0.05 * e;
        shRT.R = -0.05 * e;
        nodT = 0.04 * e;
      } else if (gName === "wave") {
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
    // CONTINUOUS ORGANIC IDLE — under every gesture, V is always subtly alive.
    // Only when assembled + idle-ish (not torn, not frozen): a slow weight-shift
    // that ALSO leans the body a touch (swayRoll), a gentle perpetual arm sway
    // (opposite phase L/R so it's organic, never mirror-symmetric), continuous
    // head cock/sway micro-drift built from incommensurate sines (so it never
    // loops on an obvious beat), and a tiny hand micro-curl. Everything is small
    // and damped, so it reads as life, not twitch. aliveA folds in calmA so the
    // static tier freezes it and the reduced tier softens it.
    const aliveA = !torn ? calmA : 0;
    // slow weight-shift sway about the vertical axis + a matched subtle lean
    swayT += Math.sin(t * 0.5) * 0.02 * calmA;
    const idleShift = Math.sin(t * 0.34 + 0.6) * aliveA; // very slow L/R weight cycle
    swayT += idleShift * 0.018;
    let swayRollT = idleShift * 0.02; // lean INTO the weight shift (body roll)
    // perpetual gentle arm sway — pendular, tiny, opposite phase per side
    shPT.L += Math.sin(t * 0.62 + 0.3) * 0.035 * aliveA;
    shPT.R += Math.sin(t * 0.62 + Math.PI + 0.3) * 0.035 * aliveA;
    shRT.L += (Math.sin(t * 0.47) * 0.5 + 0.5) * 0.03 * aliveA; // breathe outward a hair
    shRT.R += (Math.sin(t * 0.47 + 0.4) * 0.5 + 0.5) * 0.03 * aliveA;
    // continuous head life — slow cock (roll) + sway (yaw) drift, two sines each
    // at incommensurate rates so the head never settles into a fixed loop
    let hCockC = (Math.sin(t * 0.41) * 0.6 + Math.sin(t * 0.23 + 1.0) * 0.4) * 0.05 * aliveA;
    let hSwayC = (Math.sin(t * 0.29 + 0.7) * 0.6 + Math.sin(t * 0.19) * 0.4) * 0.06 * aliveA;
    // hand micro-curl — a tiny perpetual settle so the fingers never read frozen
    const handT = (Math.sin(t * 0.9) * 0.5 + 0.5) * 0.05 * aliveA;
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
    G.swayRoll = damp(G.swayRoll, swayRollT, 4, delta);
    G.nod = damp(G.nod, nodT, 7, delta);
    // head idle channels: cock (gesture + continuous), sway (gesture + continuous).
    // SECONDARY MOTION + FOLLOW-THROUGH: the head cock damps a touch SLOWER (5)
    // than the body so the head leads and settles a beat behind — anticipation in,
    // overshoot-settle out.
    G.hCock = damp(G.hCock, hCockT + hCockC, 5, delta);
    G.hSway = damp(G.hSway, hSwayGT + hSwayC, 5, delta);
    G.hand = damp(G.hand, handT, 6, delta);

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
    // hand micro-curl — a tiny perpetual finger settle so the hands read alive,
    // not frozen claws. Rotates the whole hand group a hair about its wrist (x),
    // opposite phase per side. Pure secondary life, far below any gesture pose.
    for (const side of ["L", "R"]) {
      const sgn = side === "L" ? -1 : 1;
      const hand = R[`hand_${side.toLowerCase()}`];
      if (hand) hand.rotation.x = G.hand * (side === "L" ? 1 : 0.8) + Math.sin(t * 0.7 + sgn) * 0.015 * aliveA;
    }
    if (R.shoulder_yoke) R.shoulder_yoke.position.y = YOKE_Y0 + G.shrug;
    // weight-shift sways the whole figure subtly about its vertical axis, plus a
    // matched subtle ROLL lean INTO the shift (swayRoll) so the weight transfer
    // reads in the whole body, not just a yaw twist. Both composited on top of
    // the user's drag-to-turn yaw on the root group.
    if (root.current) {
      root.current.rotation.y = (s.yaw || 0) + G.sway;
      root.current.rotation.z = G.swayRoll;
    }

    // look: eyes lead, head follows (secondary motion). The nod/bow gesture adds
    // an extra chin dip on top of the gaze pitch; idle GLANCE gestures dart the
    // gaze briefly; and the continuous head SWAY adds slow organic yaw drift.
    const lt = s.lookTarget || { x: 0, y: 0 };
    let yawT = lt.x * 0.5 + glanceX + G.hSway;
    let pitchT = lt.y * 0.28 + creep * 0.05 + G.nod + glanceY;
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
    // ANTICIPATION: the gaze/head damps a touch faster (6.5) and the EYES lead
    // fast (16) — eyes arrive first, head follows, body trails. Reads as a real
    // look: eyes flick, head turns after, weight settles last.
    L.yaw = damp(L.yaw, yawT, 6.5, delta);
    L.pitch = damp(L.pitch, pitchT, 6.5, delta);
    L.eyeYaw = damp(L.eyeYaw, yawT, 16, delta);
    L.eyePitch = damp(L.eyePitch, pitchT, 16, delta);

    if (R.head_base) {
      R.head_base.rotation.y = L.yaw + shake;
      R.head_base.rotation.x = L.pitch;
      R.head_base.rotation.z = G.hCock; // organic head COCK / tilt (life)
    }
    if (R.neck_stack) {
      // the neck FOLLOWS the head a beat behind (secondary motion): it carries a
      // fraction of the yaw/pitch and a smaller fraction of the cock, so the
      // head-then-neck chain reads as anticipation + follow-through, not rigid.
      R.neck_stack.rotation.y = L.yaw * 0.35 + G.hSway * 0.4;
      R.neck_stack.rotation.x = L.pitch * 0.3;
      R.neck_stack.rotation.z = G.hCock * 0.45;
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

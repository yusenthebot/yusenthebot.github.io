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
  faceScreen,
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

// TEARDOWN INTERIOR emitters — lit/emissive "machine guts" hidden under the
// shells at idle, revealed when the shells hinge/slide away. Dimmer than the
// hero power core so the core stays the brightest accent. toneMapped off (via
// makeEmissive) so they escape the 1-bit dither against the open dark cavity.
// Module scope (singleton VRobot, shared instances fine, same as scanMat).
const lidRimMat = makeEmissive(2.0);    // head flip-lid machined rim (steady)
const limbFilament = makeEmissive(1.1); // endoframe light-line on exposed limbs

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
function Hand({ sgn }) {
  const fingerX = [-0.03, -0.01, 0.01, 0.03];
  const fingerLen = [0.078, 0.092, 0.088, 0.07];
  return (
    <>
      {/* LIT palm block — mattePolymer (was darkPolymer, which crushed the whole
          hand to a black void against the bg). The readable hand mass. The old
          lit cuff ridge at the wrist end is gone — the lit wrist collar already
          bridges forearm->palm, so the ridge only read as a disconnected stripe. */}
      <RoundedBox args={[0.1, 0.09, 0.042]} radius={0.014} position={[0, -0.035, 0]} material={mattePolymer} castShadow />
      {/* four fingers — panelShade capsules, thick enough to read. The tiny per-
          knuckle rings were sub-pixel noise at hand scale (a broken dark band or
          nothing under the 1-bit dither), so the capsules stand on their own. */}
      {fingerX.map((x, i) => (
        <mesh key={x} position={[x, -0.075 - fingerLen[i] / 2, 0]} material={panelShade} castShadow>
          <capsuleGeometry args={[0.013, fingerLen[i], 4, 8]} />
        </mesh>
      ))}
      {/* thumb — offset to the inboard side, angled down */}
      <group position={[sgn * 0.05, -0.02, 0.014]} rotation-z={sgn * 0.7}>
        <mesh position={[0, -0.03, 0]} material={panelShade} castShadow>
          <capsuleGeometry args={[0.013, 0.05, 4, 8]} />
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
          {/* dark inner girdle — a compact dark cage. The hip balls (x=+/-0.135,
              world y~1.52) seat into its flanks so legs+pelvis read continuous.
              Reaches UP (top y=+0.2) to lap the lit waist bottom (world ~1.62)
              and DOWN to y=-0.16 to meet the hip sockets — no gap above or below.
              SLAB: scale-z 0.5 so it is thin front-to-back like the chest, not a
              round drum. SLIMMED to r 0.16 so it never flares past the lit slab. */}
          <mesh position={[0, 0.0, 0]} scale={[1, 1, 0.6]} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.205, 0.195, 0.46, 22]} />
          </mesh>
          {/* LIGHT pelvis slab — the proud lit hip block. NARROW (r 0.165, half
              -width 0.165, clearly under the chest half-width ~0.245) and FLAT
              (z 0.5 => depth 0.165) so the pelvis is a compact slab matching the
              chest envelope, never a bulky barrel. Laps UP to y=+0.22 (into the
              lit waist) and DOWN to y=-0.14 (over the hip sockets) so the lit
              column stays unbroken trunk -> hips. */}
          <mesh position={[0, 0.02, 0]} scale={[1, 1, 0.62]} material={mattePolymer} castShadow>
            <cylinderGeometry args={[0.225, 0.215, 0.5, 22]} />
          </mesh>
          {/* thin lit deck capping the top into the waist overlap — a flat
              machined plate broadened under the wider chest so the pelvis top
              reads as a clean deck, not a wide shelf or round crown. */}
          <RoundedBox args={[0.38, 0.09, 0.235]} radius={0.03} smoothness={3} position={[0, 0.22, 0]} material={mattePolymer} castShadow />
          {/* broad flat front fascia PLATE — the frontmost lit pelvis panel, a
              clean slab face. Pulled to z=0.125 so it sits just proud of the
              girdle front, broadened for the stockier pelvis. */}
          <RoundedBox args={[0.30, 0.34, 0.05]} radius={0.025} smoothness={3} position={[0, -0.02, 0.125]} material={mattePolymer} castShadow />
          {/* angled side hip flanks chamfered onto the slab so the block wraps —
              they sweep down-out toward each hip socket (x=+/-0.18) so the broad
              pelvis meets the legs with no gap. */}
          {[-1, 1].map((s) => (
            <RoundedBox
              key={s}
              args={[0.11, 0.32, 0.05]}
              radius={0.02}
              smoothness={3}
              position={[s * 0.185, -0.04, 0.06]}
              rotation-y={s * -0.55}
              material={mattePolymer}
              castShadow
            />
          ))}
          {/* (the pelvis fascia centre seam was removed: it stacked within ~2mm of
              the pelvis_cover's own centre seam at idle and the pair dithered into a
              muddy double-line — the cover keeps the single deliberate seam) */}
        </>
      );
    case "pelvis_cover":
      return (
        <>
          {/* slide-off front fascia — the frontmost lit pelvis panel at idle, a
              clean narrow slab face matching the slimmed girdle. Flat front plate
              + angled side flanks + recessed center seam. NARROWED (0.22) in step
              with the compact pelvis; sits at z=0.11 just on the slab front (~0.08)
              so it reads thin front-to-back. Slides +z on teardown (motion is the
              part registry's, unchanged). */}
          <RoundedBox args={[0.26, 0.32, 0.05]} radius={0.025} smoothness={3} position={[0, 0.0, 0.11]} material={mattePolymer} castShadow />
          {[-1, 1].map((s) => (
            <RoundedBox
              key={s}
              args={[0.095, 0.3, 0.045]}
              radius={0.018}
              smoothness={3}
              position={[s * 0.15, 0.0, 0.05]}
              rotation-y={s * -0.6}
              material={mattePolymer}
              castShadow
            />
          ))}
          {/* one recessed seam line down the fascia center */}
          <RoundedBox args={[0.013, 0.26, 0.013]} radius={0.005} position={[0, 0.0, 0.133]} material={seamInset} />
        </>
      );
    case "torso":
      return (
        <>
          {/* ONE COHERENT G1 TRUNK. The torso link carries the lit chest-to-waist
              mass so the body centre is never a dark void — the hinged chest
              plastron sits OVER this and, when it swings open during teardown,
              the lit slab underneath still reads as a solid flat chest, not a
              black cavity. A clean LIGHT slab, NOT a stack of mismatched
              cylinders. */}
          {/* CHEST SLAB — a broad FLAT-fronted light panel: width 0.40, height
              0.50, depth 0.16 (a true 2.5:1 slab, the G1 chest envelope). The
              dominant lit mass of the trunk. Clearly NARROWER than the 0.56
              shoulder span so the shoulders frame a lean chest, not a wide box.
              Reads by silhouette + big luma step under the dither. */}
          <RoundedBox args={[0.54, 0.48, 0.25]} radius={0.05} smoothness={4} position={[0, 0.11, 0.0]} material={mattePolymer} castShadow />
          {/* shallow side chest flanks chamfered onto the slab so the chest wraps
              at the flanks instead of ending in a hard vertical wall — keeps the
              broad flat front but rounds the silhouette toward the arms. WIDENED
              + pushed out to wrap the broader chest. */}
          {[-1, 1].map((s) => (
            <RoundedBox
              key={s}
              args={[0.12, 0.44, 0.21]}
              radius={0.04}
              smoothness={3}
              position={[s * 0.265, 0.11, 0.0]}
              rotation-y={s * -0.5}
              material={panelShade}
              castShadow
            />
          ))}
          {/* subtle RECESSED central seam — a thin dark groove down the chest
              centreline (seamInset, dark .20), NOT a bright bar. Sits just proud
              of the slab front so it reads as a machined panel split. */}
          <RoundedBox args={[0.018, 0.40, 0.02]} radius={0.006} smoothness={2} position={[0, 0.11, 0.097]} material={seamInset} />
          {/* ONE CONTINUOUS LIT ABDOMEN — replaces the old protruding double belly-
              plate (a proud tilted wedge + a stacked bridge box) that read as a
              stuck-on pot belly. Three centered mattePolymer boxes taper chest ->
              waist PINCH -> hip flare; depth ~0.23 MATCHES the chest (0.25) so the
              waist never recedes front-to-back (that shallow waist was the dark
              3/4-side notch). Front face z~0.115 sits just UNDER the chest front
              (0.125) — receded, never proud. The pinch reads by WIDTH only. */}
          {/* upper abdomen — laps UP under the chest bottom, unbroken lit column */}
          <RoundedBox args={[0.40, 0.18, 0.235]} radius={0.06} smoothness={3} position={[0, -0.06, 0.005]} material={mattePolymer} castShadow />
          {/* WAIST — a GENTLE pinch (0.34, less dramatic so the trunk->hip flows,
              not a severed notch), full depth = no side notch */}
          <RoundedBox args={[0.34, 0.13, 0.225]} radius={0.055} smoothness={3} position={[0, -0.205, 0.01]} material={mattePolymer} castShadow />
          {/* lower abdomen — TALL, flares out toward the hips and laps WELL DOWN
              onto the pelvis (world overlap to ~1.15) with a proud lit front, so the
              torso->pelvis is ONE continuous lit mass — no gap at the join. */}
          <RoundedBox args={[0.38, 0.30, 0.225]} radius={0.06} smoothness={3} position={[0, -0.41, 0.025]} material={mattePolymer} castShadow />
          {/* one fine recessed waist seam (single clean machined break, was two —
              decluttered so the midriff reads as a smooth lit column, not a stack
              of horizontal slats) */}
          <RoundedBox args={[0.26, 0.014, 0.012]} radius={0.004} smoothness={2} position={[0, -0.2, 0.118]} material={seamInset} />
          {/* waist-roll side discs — flat dark hubs on the L/R flanks, axis
              sideways, so the waist reads as a real G1 waist actuator and the
              pinch is legible from the front-3/4. */}
          {/* lit seat ring set INTO the abdomen side so the dark roll disc sits in
              a LIT socket, not against a void (small dark actuator on a lit field) */}
          {[-1, 1].map((s) => (
            <mesh key={`seat${s}`} position={[s * 0.165, -0.2, 0]} rotation-z={HPI} material={mattePolymer} castShadow>
              <cylinderGeometry args={[0.072, 0.072, 0.03, 20]} />
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.182, -0.2, 0]} rotation-z={HPI} material={darkPolymer} castShadow>
              <cylinderGeometry args={[0.052, 0.052, 0.045, 20]} />
            </mesh>
          ))}
          {/* lit side blend flanks — wrap the abdomen's lower flare out toward each
              hip. mattePolymer (NOT the old panelShade, whose off-key dark plane WAS
              the dark side band at the join) at a gentle rot so they face the key
              and the 3/4-side waist->hip stays LIT and continuous. */}
          {[-1, 1].map((s) => (
            <RoundedBox
              key={s}
              args={[0.13, 0.24, 0.20]}
              radius={0.05}
              smoothness={3}
              position={[s * 0.155, -0.30, 0.0]}
              rotation-y={s * -0.32}
              material={mattePolymer}
              castShadow
            />
          ))}
          {/* internal dark core bay — recessed (z back) so it only reads as the
              exposed core once the chest plastron hinges open; it does not face
              the camera as a dark block at idle. Stands in for the removed core
              housing's dark cage behind the plastron. */}
          <RoundedBox args={[0.18, 0.24, 0.10]} radius={0.03} position={[0, 0.06, -0.085]} material={darkPolymer} />
        </>
      );
    case "chest_plate":
      return (
        <>
          {/* HINGED PLASTRON — ONE clean light SLAB panel that hugs the chest
              slab and swings as a unit on the bottom-edge hinge. A broad flat
              front face (NOT a round bulge): width 0.36, just inside the 0.40
              chest so it reads as a removable teardown panel laid over the
              trunk. Sits slightly proud (z 0.085) of the slab front. */}
          <RoundedBox args={[0.42, 0.44, 0.085]} radius={0.04} smoothness={4} position={[0, 0.08, 0.105]} material={mattePolymer} castShadow />
          {/* abdominal plastron extension — laps the lit panel DOWN over the
              upper waist so the chest flows into the midriff with no dark step
              when the plate is closed; stays above the y=-0.34 hinge line so the
              teardown swing is unchanged. */}
          <RoundedBox args={[0.35, 0.18, 0.07]} radius={0.035} smoothness={3} position={[0, -0.2, 0.095]} material={mattePolymer} castShadow />
          {/* ONE clean recessed CENTRELINE seam down the plastron (seamInset, dark
              .20) — the single deliberate panel split, replacing the busy muscle-
              pec + sternum + side-seam + waist-break clutter. G1 has NO glowing
              chest, so the centreline is a DARK machined groove, not a bright bar. */}
          <RoundedBox args={[0.016, 0.36, 0.02]} radius={0.006} smoothness={2} position={[0, 0.1, 0.15]} material={seamInset} />
          {/* status-dot trio — the one small alive accent (mirrors the 2D V), a
              clean vertical row low-centre on the otherwise smooth plastron. */}
          {[0.03, 0, -0.03].map((y) => (
            <mesh key={y} position={[0, y - 0.06, 0.152]} material={chestDotMat}>
              <sphereGeometry args={[0.011, 12, 12]} />
            </mesh>
          ))}
        </>
      );
    case "back_plate":
      return (
        <>
          {/* DORSAL SHELL matching the front plastron — ONE clean light SLAB
              back panel (flat, not a barrel half) so the trunk reads THIN
              front-to-back from the side/3-4. Swings as a unit on the bottom
              hinge. */}
          <RoundedBox args={[0.36, 0.46, 0.07]} radius={0.035} smoothness={4} position={[0, 0.08, -0.085]} material={mattePolymer} castShadow />
          {/* lower dorsal extension lapping down toward the pelvis so the back
              has no dark step at the waist. */}
          <RoundedBox args={[0.3, 0.18, 0.06]} radius={0.03} smoothness={3} position={[0, -0.18, -0.075]} material={mattePolymer} castShadow />
          {/* single recessed dark SPINE channel down the centre (seamInset). */}
          <RoundedBox args={[0.05, 0.4, 0.03]} radius={0.012} position={[0, 0.08, -0.115]} material={seamInset} />
        </>
      );
    case "core":
      return (
        <>
          {/* CHEST REACTOR FACE — the dramatic reveal when the chest hatch opens.
              A flat forward-facing reactor sitting in the thin gap between the lit
              chest slab front (~z0.125) and the chest plastron (~z0.148), so it is
              fully hidden under the closed plate at idle and revealed dead-centre
              on the chest when the plate hinges away. Its glow ramps with the core
              band [0.2,0.3] in useFrame (pure fn of depth) — open, then IGNITE. */}
          {/* dark recessed BEZEL ring — frames the glow with contrast (dark on the
              lit chest), a forward-facing disc */}
          <mesh position={[0, 0, -0.004]} rotation-x={HPI} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.135, 0.145, 0.022, 28]} />
          </mesh>
          {/* back GLOW disc — floods the bezel with light on reveal (coreGlow) */}
          <mesh ref={(m) => ctx.setExtra("coreGlow", m)} position={[0, 0, 0.006]} material={makeEmissive(0.1)}>
            <circleGeometry args={[0.12, 32]} />
          </mesh>
          {/* GLOWING CORE — a flat bright emissive lens, the hero accent (coreMesh) */}
          <mesh ref={(m) => ctx.setExtra("coreMesh", m)} position={[0, 0, 0.01]} scale={[1, 1, 0.28]} material={emissiveCore}>
            <sphereGeometry args={[0.062, 32, 24]} />
          </mesh>
          {/* two concentric emissive HALO rings framing the core as a reactor face */}
          <mesh ref={(m) => ctx.setExtra("coreRingA", m)} position={[0, 0, 0.012]} material={brightEmissiveSeam}>
            <torusGeometry args={[0.088, 0.007, 10, 48]} />
          </mesh>
          <mesh ref={(m) => ctx.setExtra("coreRingB", m)} position={[0, 0, 0.01]} material={brightEmissiveSeam}>
            <torusGeometry args={[0.115, 0.005, 10, 48]} />
          </mesh>
          {/* six radial FILAMENTS — bright spokes from the core out to the ring */}
          {Array.from({ length: 6 }).map((_, i) => {
            const a = (i / 6) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.088, Math.sin(a) * 0.088, 0.01]} rotation-z={a} material={brightEmissiveSeam}>
                <boxGeometry args={[0.05, 0.005, 0.005]} />
              </mesh>
            );
          })}
          {/* brushed retaining ring framing the reactor */}
          <mesh position={[0, 0, 0.004]} material={brushedMetal}>
            <torusGeometry args={[0.142, 0.01, 10, 40]} />
          </mesh>
        </>
      );
    case "shoulder_yoke":
      return (
        <>
          {/* BROAD lit clavicle DECK — a solid hard slab spanning the +/-0.29
              shoulder seats (span 0.62) and beefed (h 0.095, depth 0.22) so the
              shoulder line reads broad + structural for the stockier trunk, not a
              thin crossbar. */}
          <RoundedBox args={[0.62, 0.095, 0.22]} radius={0.024} smoothness={3} material={mattePolymer} castShadow />
          {/* dimmer back lip so the deck reads as a panel over a shell */}
          <RoundedBox args={[0.56, 0.08, 0.11]} radius={0.018} smoothness={3} position={[0, -0.005, -0.08]} material={panelShade} castShadow />
          {/* fine central seam down the deck */}
          <RoundedBox args={[0.012, 0.08, 0.15]} radius={0.004} smoothness={2} position={[0, 0.05, 0.01]} material={seamInset} />
          {/* two recessed DARK cylindrical sockets — the shoulder actuator pods
              seat into these, so the joint reads as motor-in-socket (axis X,
              along the arm line) and the pod hugs tight to the body. */}
          {[-0.29, 0.29].map((x) => (
            <mesh key={x} position={[x, -0.01, 0]} rotation-z={HPI} material={darkPolymer} castShadow>
              <cylinderGeometry args={[0.07, 0.07, 0.075, 20]} />
            </mesh>
          ))}
        </>
      );
    case "shoulder_ball_l":
    case "shoulder_ball_r": {
      const sgn = id.endsWith("_l") ? -1 : 1;
      return (
        <>
          {/* G1 SHOULDER ACTUATOR POD — one tight DARK cylinder, axis along the
              arm (X), tucked hard to the body. Replaces the old puffy ball: the
              shoulder now reads as a compact powered pod, not a soft blob.
              r 0.072, depth 0.1 -> caps cleanly onto the 0.13-wide upper-arm. */}
          <mesh rotation-z={HPI} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.072, 0.072, 0.1, 28]} />
          </mesh>
          {/* inboard collar seating the pod into the yoke socket (hides the gap) */}
          <mesh position={[sgn * -0.055, 0, 0]} rotation-z={HPI} material={panelShade} castShadow>
            <cylinderGeometry args={[0.05, 0.064, 0.03, 22]} />
          </mesh>
        </>
      );
    }
    case "pauldron_l":
    case "pauldron_r": {
      const sgn = id.endsWith("_l") ? -1 : 1;
      return (
        <>
          {/* ONE CLEAN SHOULDER CAP — a single FLAT deltoid pad hugging the shoulder
              pod, elongated DOWN so it laps straight onto the upper arm as ONE
              continuous lit mass. Replaces the old dome + skirt stack (two redundant
              balls per shoulder); FLATTENED front-back (z 0.82) + tucked inboard so it
              reads as a low-profile shoulder PLATE, not a perched ball. */}
          <mesh scale={[0.96, 1.2, 0.82]} position={[sgn * 0.022, -0.045, 0]} rotation-z={sgn * 0.15} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.114, 28, 22]} />
          </mesh>
        </>
      );
    }
    case "upper_arm_l":
    case "upper_arm_r":
      return (
        <>
          {/* slim G1 humeral slab — mattePolymer light panel, tapers shoulder->elbow.
              The shoulder cap now laps over the arm top, so the old dark actuator
              disc here (an extra ring that stacked into the redundant-ball read) is
              gone — the shoulder reads as ONE clean cap flowing into the arm. */}
          <PanelSegment
            topY={-0.02}
            len={0.42}
            wTop={0.21}
            wBot={0.165}
            flat={0.74}
            seams={1}
          />
        </>
      );
    case "elbow_l":
    case "elbow_r": {
      return (
        <>
          {/* G1 elbow disc — slim proportionate dark cylinder, hinge axis X */}
          <mesh rotation-z={HPI} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 0.075, 20]} />
          </mesh>
        </>
      );
    }
    case "forearm_l":
    case "forearm_r":
      return (
        <>
          {/* slim G1 forearm slab — mattePolymer light panel tapering to the wrist;
              reads LIGHT against the dark elbow and wrist discs (panel-over-joint) */}
          <PanelSegment
            topY={0}
            len={0.30}
            wTop={0.165}
            wBot={0.115}
            flat={0.72}
            mat={mattePolymer}
            backMat={panelShade}
            seams={1}
          />
          {/* EXPOSED TENDON ACTUATORS — revealed when the forearm cuff hinges
              outboard (lore: "exposes tendon actuators"). Two thin brushed tendon
              drives + a faint filament, hidden behind the cuff fascia at idle. */}
          {[-0.04, -0.16].map((y) => (
            <mesh key={`tdn${y}`} position={[0, y, 0.028]} rotation-x={HPI} material={brushedMetal} castShadow>
              <cylinderGeometry args={[0.016, 0.016, 0.11, 12]} />
            </mesh>
          ))}
          <RoundedBox args={[0.008, 0.2, 0.008]} radius={0.003} position={[0, -0.1, 0.034]} material={limbFilament} />
        </>
      );
    case "forearm_shell_l":
    case "forearm_shell_r": {
      return (
        <>
          {/* forearm cover shell — slim light panel aligned over the forearm core */}
          <PanelSegment
            topY={0.06}
            len={0.26}
            wTop={0.135}
            wBot={0.092}
            flat={0.6}
            seams={1}
          />
        </>
      );
    }
    case "wrist_l":
    case "wrist_r":
      return (
        <>
          {/* LIT wrist collar — a short bright cylinder bridging the lit forearm
              above and the lit hand below so the dark rotary disc doesn't notch a
              black gap into the arm-to-hand column under the dither */}
          <mesh material={mattePolymer} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.028, 20]} />
          </mesh>
          {/* slim 2-DOF wrist disc — flat dark cylinder instead of a bulbous sphere;
              reads as a compact rotary joint, no soft lumps */}
          <mesh rotation-z={HPI} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.038, 0.038, 0.05, 16]} />
          </mesh>
        </>
      );
    case "hand_l":
    case "hand_r": {
      const sgn = id.endsWith("_l") ? -1 : 1;
      return <Hand sgn={sgn} />;
    }
    case "hip_l":
    case "hip_r":
      return (
        <>
          {/* exposed actuator cluster — the hip ball. The joint hub fills the
              space between the pelvis girdle above and the thigh root below so the
              leg connects to the pelvis with no gap. */}
          <mesh rotation-z={HPI} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.13, 20]} />
          </mesh>
          <mesh material={darkPolymer} castShadow>
            <sphereGeometry args={[0.09, 20, 16]} />
          </mesh>
          {/* (the outboard hip disc motor was removed: a 3rd dark shape only 0.05
              off the sphere+cylinder cluster merged with them into one unreadable
              dark blob at the hip — the hub cylinder alone reads as the motor) */}
          {/* LIT hip-socket sleeve lapping UP toward the pelvis girdle so the hip
              reads as a lit joint feeding into the pelvis, not a dark bead under a
              void. FLATTENED (z 0.55) in step with the slab leg. */}
          <mesh position={[0, 0.09, 0.01]} scale={[1, 1.1, 0.55]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.088, 18, 14]} />
          </mesh>
        </>
      );
    case "thigh_l":
    case "thigh_r":
      return (
        <>
          {/* femur actuator core (black) — a flat-sided dark PANEL spanning the
              full thigh. Top at y=+0.1 (world ~1.44, up into the hip socket) and
              the base reaches the knee actuator at y=-0.7 (world ~0.76): no dark
              void at the hip, no severed gap at the knee. Slightly broadened
              (wTop 0.14) so the exposed femur reads as a substantial machined
              block when the light shell hinges off, not a thin rod. */}
          <PanelSegment
            topY={0.1}
            len={0.64}
            wTop={0.205}
            wBot={0.155}
            flat={0.62}
            mat={darkPolymer}
            backMat={darkPolymer}
            seams={2}
          />
          {/* upper-thigh shoulder seating UP into the hip ball (world ~1.45) so
              the leg root reads continuous with the pelvis, no gap. */}
          <mesh position={[0, 0.11, 0]} material={darkPolymer} castShadow>
            <sphereGeometry args={[0.11, 18, 14]} />
          </mesh>
          {/* EXPOSED FEMUR GUTS — revealed when the thigh shell hinges forward off
              the femur (hidden behind the shell fascia at idle: detail front z~0.07
              < shell fascia z~0.083). Two brushed actuator cylinders + a glowing
              endoframe filament so the bared femur reads as powered machinery, not
              a dead dark slab. */}
          {[-0.05, -0.4].map((y) => (
            <mesh key={`fem${y}`} position={[0, y, 0.03]} rotation-z={HPI} material={brushedMetal} castShadow>
              <cylinderGeometry args={[0.04, 0.04, 0.1, 16]} />
            </mesh>
          ))}
          <RoundedBox args={[0.01, 0.46, 0.01]} radius={0.004} position={[0.03, -0.2, 0.035]} material={limbFilament} />
        </>
      );
    case "thigh_shell_l":
    case "thigh_shell_r":
      return (
        <>
          {/* HARD-SURFACE thigh shell — a broad flat-fronted LIT quad PLATE,
              widest at the hip and tapering toward the knee (Optimus quad panel).
              Top at y=+0.30 (world ~1.46, lapping up into the hip socket) and
              long (len 0.84) so the LIT base reaches the knee at world ~0.76 —
              closes the hip gap above and the knee gap below. Broadened (wTop
              0.185) so the thigh reads structural and substantial, not spindly.
              Opens on the same top-rear hinge (pivot mesh unchanged). */}
          <PanelSegment
            topY={0.3}
            len={0.66}
            wTop={0.265}
            wBot={0.19}
            flat={0.66}
            seams={1}
          />
          {/* LIT hip-socket cap — a proud matte hub at the shell top lapping up
              into the pelvis girdle (world ~1.49) so the thigh root reads as a lit
              ball seating into the hip, not a dark stub below a void. */}
          <mesh position={[0, 0.33, 0.01]} scale={[1, 0.92, 0.9]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.115, 20, 16]} />
          </mesh>
        </>
      );
    case "knee_l":
    case "knee_r": {
      return (
        <>
          {/* exposed knee hinge. Hub fills the joint between the thigh base and the
              shin top so the leg reads continuous thigh->knee->shin with no severed
              gap. Hinge axis (rotation-z = HPI -> bend about X) UNCHANGED so the
              knee still bends correctly. */}
          <mesh rotation-z={HPI} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.078, 0.078, 0.14, 24]} />
          </mesh>
          {/* lit knee cap — a small matte plate proud of the joint front so the
              knee reads as a lit hub joining the lit shells, not a dark bead */}
          <RoundedBox args={[0.095, 0.12, 0.04]} radius={0.016} smoothness={3} position={[0, 0, 0.058]} material={mattePolymer} castShadow />
        </>
      );
    }
    case "shin_l":
    case "shin_r":
      return (
        <>
          {/* tibial actuator core (black) — a flat-fronted dark PANEL spanning the
              full shin. Top at y=+0.12 (world ~0.78) overlapping the knee actuator
              (no gap under the knee hub); base at the ankle y=-0.6. Flatter in
              depth than the thigh (a shin plate), with a distinct CALF swell. */}
          <PanelSegment
            topY={0.12}
            len={0.58}
            wTop={0.175}
            wBot={0.12}
            flat={0.6}
            mat={darkPolymer}
            backMat={darkPolymer}
            seams={2}
          />
          {/* CALF swell — a paneled bulge behind the upper shin (gastroc mass),
              chamfered not round, so the back of the leg has a machined profile
              that tapers to the ankle. */}
          <RoundedBox
            args={[0.09, 0.28, 0.07]}
            radius={0.03}
            smoothness={3}
            position={[0, -0.16, -0.06]}
            material={darkPolymer}
            castShadow
          />
          {/* EXPOSED TIBIA GUTS — revealed when the shin shell hinges forward.
              One brushed ankle-drive cylinder + a glowing filament; slimmer than
              the femur to match the thinner tibia. Hidden behind the shell at idle. */}
          <mesh position={[0, -0.16, 0.025]} rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 0.085, 16]} />
          </mesh>
          <RoundedBox args={[0.009, 0.36, 0.009]} radius={0.004} position={[0.025, -0.1, 0.03]} material={limbFilament} />
        </>
      );
    case "shin_shell_l":
    case "shin_shell_r":
      return (
        <>
          {/* HARD-SURFACE shin shell — a flat-fronted SHIN PLATE (the Optimus
              tibia guard), broad at the top tapering to the ankle, with a paneled
              CALF swell on the back. Top at y=+0.28 (world ~0.78, lapping up to the
              knee actuator) and long (len 0.68) so the LIT shin meets the knee hub
              — no severed gap at the knee. Broadened (wTop 0.155) so the lower leg
              reads structural to match the thigh. Same top-rear hinge (pivot mesh
              unchanged). */}
          <PanelSegment
            topY={0.28}
            len={0.54}
            wTop={0.22}
            wBot={0.135}
            flat={0.6}
            seams={1}
          />
          {/* LIT shin-top cap lapping the knee — a proud matte hub at the shell
              top (world ~0.77) so the shin reads as a lit form meeting the knee. */}
          <mesh position={[0, 0.27, 0.01]} scale={[1, 0.85, 0.9]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.105, 18, 14]} />
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
        </>
      );
    case "ankle_l":
    case "ankle_r": {
      return (
        <>
          {/* ankle gimbal hub — a small dark disc filling the shin base to foot
              gap, axis along the joint (X). Kept compact and proportionate. */}
          <mesh rotation-z={HPI} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.08, 18]} />
          </mesh>
        </>
      );
    }
    case "foot_l":
    case "foot_r":
      return (
        <>
          {/* simple flat sole plate + toe link — planted flat (foot bottom near
              world y~0). A clean industrial plate, no toe articulation drama. */}
          <RoundedBox args={[0.13, 0.045, 0.27]} radius={0.016} position={[0, 0, 0.05]} material={darkPolymer} castShadow receiveShadow />
          <RoundedBox args={[0.13, 0.024, 0.08]} radius={0.009} position={[0, -0.013, 0.2]} material={mattePolymer} castShadow />
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
        </>
      );
    case "head_base":
      return (
        <>
          {/* inner skull — the dark structural core the optics sit in; revealed
              when the flip-top lid hinges open in teardown */}
          <mesh scale={[1, 1.04, 0.96]} material={darkPolymer}>
            <sphereGeometry args={[0.186, 32, 24]} />
          </mesh>
          {/* FACE-FRAME HELMET — the bright G1 cranium that WRAPS the dark face
              screen (temples + cheeks + jaw all lit). mattePolymer so it reads as a
              solid bright shell, not a void the 1-bit dither crushes. The flip-top
              lid (head_shell) hugs this as its crown skin — ONE clean helmet, no
              second bulging dome. */}
          <mesh scale={[1.06, 1.02, 0.92]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.236, 48, 36]} />
          </mesh>
          {/* FACE SCREEN — a dark DISPLAY visor the two bright eyes emote on
              (Anki-Vector style), framed by a thin bright helmet border. Kept
              CONVEX (z 0.46) so it conforms to the round skull and stays PROUD of
              the helmet front — a flatter panel sinks behind the helmet's central
              bulge, which then pokes bright THROUGH the screen. faceScreen is fully
              MATTE so the convex panel catches NO specular highlight (the old bright
              "smudge" on the face), resolving as one clean dark screen. */}
          <mesh position={[0, 0.012, 0.142]} scale={[1.3, 0.92, 0.46]} material={faceScreen} castShadow>
            <sphereGeometry args={[0.176, 44, 32]} />
          </mesh>
          {/* MOUTH — a 3-segment emitter (centre bar + two corner tips) so V can
              really SMILE / FROWN / open + talk, not just stretch a flat line. The
              FACE EXPRESSION block scales the whole group (mouthW/mouthY), lifts the
              corners (curve: + smile / - frown), drops the bar to open the mouth
              (talk/awe), and drives intensity. Dim at idle (eyes lead, Vector-style). */}
          <group ref={(g) => ctx.setExtra("faceMouth", g)} position={[0, -0.072, 0.214]}>
            <RoundedBox
              args={[0.044, 0.0085, 0.012]}
              radius={0.004}
              ref={(m) => ctx.setExtra("mouthBar", m)}
              material={faceMat.mouth}
            />
            <mesh position={[-0.026, 0, 0]} ref={(m) => ctx.setExtra("mouthCornerL", m)} material={faceMat.mouth}>
              <sphereGeometry args={[0.0075, 10, 10]} />
            </mesh>
            <mesh position={[0.026, 0, 0]} ref={(m) => ctx.setExtra("mouthCornerR", m)} material={faceMat.mouth}>
              <sphereGeometry args={[0.0075, 10, 10]} />
            </mesh>
          </group>
          {/* LIT neck collar — keeps the head-to-neck join lit + continuous so no
              dark band re-breaks the head off the body. */}
          <mesh position={[0, -0.182, 0]} material={mattePolymer}>
            <cylinderGeometry args={[0.086, 0.106, 0.07, 20]} />
          </mesh>
          {/* NECK GIMBAL ring — an exposed dark bearing at the base of the skull:
              it reads as the pivot the head yaws / pitches / cocks on, so the head
              clearly ARTICULATES on a joint instead of being fused to the trunk. */}
          <mesh position={[0, -0.214, 0]} rotation-x={HPI} material={darkPolymer}>
            <torusGeometry args={[0.07, 0.017, 12, 24]} />
          </mesh>
        </>
      );
    case "head_shell":
      return (
        <>
          {/* FLIP-TOP CRANIUM LID — a CLOSED dome cap that HUGS the face-frame
              helmet as its crown skin (matched scale, sits just proud), so at idle
              the head reads as ONE clean helmet with a single thin crown seam, NOT
              two stacked domes. Stops ABOVE the face screen (thetaLength 1.2) so the
              face stays readable; a closed cap (full phi sweep) has no front seam
              edges to splay into "bunny ears" when it hinges up. */}
          <mesh scale={[1.06, 1.02, 0.92]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.243, 48, 32, 0, Math.PI * 2, 0.0, 1.2]} />
          </mesh>
          {/* machined LID RIM — a thin emissive lip tucked at the cap's lower mouth
              so the LIFTED lid reads as solid machined stock (a real hatch
              underside); at idle it sits at the crown seam as a faint hairline. */}
          <mesh position={[0, 0.075, 0]} rotation-x={HPI} material={lidRimMat}>
            <torusGeometry args={[0.2, 0.005, 8, 48]} />
          </mesh>
        </>
      );
    case "eye_ring_l":
    case "eye_ring_r": {
      const side = id.endsWith("_l") ? "L" : "R";
      const fm = faceMat[side];
      // V's OPTIC — a big bright rounded-RECTANGLE eye (Anki-Vector style), the
      // single expressive feature of the face. Emotion is shape + intensity + motion:
      //   eyeBlink{side}  group: scaleY squashes the eye to a blink / sleep line.
      //   eyeShape{side}  group: scaleX widens it, rotation-z tilts the MOOD (happy
      //                   arc vs angry slant), mirrored per eye via the frame loop.
      // The frame loop drives all of these via the eyeLens ref. Big + solid so the
      // face reads as two emoting eyes, not two dim slits lost on a dark screen.
      return (
        <group ref={(g) => ctx.setExtra(`eyeBlink${side}`, g)}>
          <group ref={(g) => ctx.setExtra(`eyeShape${side}`, g)}>
            {/* the EYE — a big, solid, bright rounded-rectangle (Anki-Vector style):
                the whole face's expression lives here. The frame loop drives it via
                its refs — eyeBlink scaleY squashes it to a sleep/blink line, eyeShape
                scaleX widens it + rotation-z tilts the MOOD (happy arc / angry slant,
                mirrored per eye). Solid bright emissive so it blooms cleanly through
                the dark screen and reads as an expressive eye, not a dim slit. */}
            <RoundedBox
              args={[0.052, 0.074, 0.018]}
              radius={0.024}
              smoothness={6}
              position={[0, 0, 0]}
              ref={(m) => ctx.setExtra(`eyeLens${side}`, m)}
              material={fm}
            />
            {/* PUPIL — a small dark dot PROUD of the bright eye that tracks V's
                gaze (driven by the frame loop): the eyes visibly look around / dart
                for life. Kept small so it refines the look, never goes googly; rides
                the eye's blink + widen transforms as a child of eyeShape. */}
            <mesh position={[0, 0, 0.013]} ref={(m) => ctx.setExtra(`eyePupil${side}`, m)} material={faceScreen}>
              <sphereGeometry args={[0.012, 16, 16]} />
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
    curve: 0, // mouth corner lift: + = smile, - = frown, 0 = flat bar
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

    // core reveal: it never moves — its band ramps the emissive instead. Idle
    // base is near-DARK (G1 has no glowing chest); the core only lights up as
    // the chest plate hinges open during teardown (coreF ramps 0->1).
    const coreF = openFraction(s.depth, PART_INDEX.get("core").band);
    const coreE = servoEase(coreF); // eased so the ignition has a satisfying ramp
    const corePulse = Math.sin(t * 2.4);
    emissiveCore.emissiveIntensity = 0.12 + coreE * 6.5 + corePulse * coreE * 0.9;
    if (X.coreMesh) {
      const cs = 1 + coreE * 0.12 + corePulse * 0.03 * (1 + coreE);
      X.coreMesh.scale.set(cs, cs, cs * 0.28); // keep the flat lens (z 0.28)
    }
    // back glow floods the reactor + halo rings/filaments brighten with the reveal
    // (coreRingA/B + filaments share brightEmissiveSeam, so one write lights all).
    if (X.coreGlow) X.coreGlow.material.emissiveIntensity = coreE * 3.2 + corePulse * coreE * 0.4;
    if (X.coreRingA) X.coreRingA.material.emissiveIntensity = 0.15 + coreE * 3.4;

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
      // weighted pool — the small organic beats dominate so V feels alive but calm.
      // Now includes new beats: speak (mouth chatter), lookUp (thinking glance up),
      // doubleTake (quick double glance), stretch (both arms ease out).
      const pool = [
        "headTilt", "headTilt", "headCock", "glance", "glance",
        "weightShift", "weightShift", "armSway", "armSway", "breathDeep",
        "shoulderRoll", "elbowFlex", "nod", "wave",
        "speak", "speak", "lookUp", "doubleTake", "stretch",
      ];
      const name = pool[(Math.random() * pool.length) | 0];
      const durMap = {
        wave: 2.2, elbowFlex: 1.5, shoulderRoll: 1.7, weightShift: 2.8,
        nod: 1.2, headTilt: 2.4, headCock: 2.0, glance: 1.8, armSway: 2.6,
        breathDeep: 3.0, speak: 2.0, lookUp: 2.2, doubleTake: 1.4, stretch: 2.6,
      };
      // small beats come back sooner; big articulations leave more breathing room
      const big = name === "wave" || name === "elbowFlex" || name === "shoulderRoll" || name === "stretch";
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
    const restElb = torn ? 0 : 0.18;
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
    // 0..1 envelope of the active idle gesture, hoisted so the FACE EXPRESSION
    // block below can emote IN SYNC with the body gesture (look / tilt / nod).
    let gEnv = 0;
    if (gActive) {
      // when holding, pin the envelope to peak (e=1) and freeze sub-oscillators
      const p = hold ? 0.5 : gt / gesture.current.dur;
      const e = hold ? 1 : env(p);
      gEnv = e;
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
      } else if (gName === "speak") {
        // V says something: a gentle talking head bob + sway (the mouth chatter
        // is driven by the FACE block) and a small open-handed gesture.
        nodT = Math.sin(gt * 8) * 0.05 * e;
        hSwayGT = Math.sin(gt * 5) * 0.05 * e;
        shPT.R = -0.14 * e;
        elbT.R = 0.12 + 0.3 * e;
      } else if (gName === "lookUp") {
        // thinking: gaze + chin lift up and a slight head tilt (pondering)
        glanceY = -0.34 * e; // negative pitch = look UP
        hCockT = 0.09 * e;
      } else if (gName === "doubleTake") {
        // a quick double-glance to one side and back (caught something)
        glanceX = Math.sin(gt * 6.5) * 0.42 * e;
        hSwayGT = Math.sin(gt * 6.5) * 0.06 * e;
      } else if (gName === "stretch") {
        // a satisfying stretch: both arms ease out + up, chin lifts back
        shPT.L = -0.5 * e; shPT.R = -0.5 * e;
        shRT.L = -0.34 * e; shRT.R = -0.34 * e;
        elbT.L = 0.2 + 0.3 * e; elbT.R = 0.2 + 0.3 * e;
        nodT = -0.06 * e;
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
    // CONTRAPPOSTO — a faint STATIC weight bias so V rests with weight on one hip
    // instead of square-on. Smaller than the live idleShift, so the sway still
    // swings through neutral; this only re-centres where neutral sits. !torn so
    // teardown stands square; scaled by calmA so static/reduced tiers freeze it.
    if (!torn) {
      swayRollT += -0.016 * calmA;
      swayT += 0.014 * calmA;
    }
    // perpetual gentle arm sway — pendular, tiny, opposite phase per side
    shPT.L += Math.sin(t * 0.62 + 0.3) * 0.035 * aliveA;
    shPT.R += Math.sin(t * 0.62 + Math.PI + 0.3) * 0.035 * aliveA;
    shRT.L += (Math.sin(t * 0.47) * 0.5 + 0.5) * 0.03 * aliveA; // breathe outward a hair
    shRT.R += (Math.sin(t * 0.47 + 0.4) * 0.5 + 0.5) * 0.03 * aliveA;
    // RESTING AT-EASE SPLAY — a small STATIC bias so the arms don't hang dead-
    // straight tucked beside the broad chest where they crush to black. shR<0
    // abducts OUTWARD (lift arms clear of the torso), shP<0 raises a hair FORWARD
    // into the key light. Asymmetric L/R = relaxed weight, not a mirror. Rides
    // UNDER the live sway above. Guarded !torn so teardown stands square.
    if (!torn) {
      shRT.L += -0.06;
      shRT.R += -0.08;
      shPT.L += -0.05;
      shPT.R += -0.04;
    }
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
    // RESTING ENGAGEMENT — head sits LEVEL at idle (was a chin-down dip that read
    // sleepy in the close entry frame): eyes meet the viewer on the lens line, an
    // alert forward stare. A hair of chin-down only kicks in while typing/scan.
    if (!torn && mode === "idle") pitchT += 0.005;
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
    // idle: mouth dim to a faint status line — the eyes carry the expression
    // (Vector-style); it brightens for typing / talk / success / error states.
    let mouthIT = 0.55 + Math.sin(t * 1.7) * 0.1 * calm;
    let curveT = 0; // mouth-corner lift: + smile / - frown (the new mouth emote)

    if (creep >= 2) {
      // full bright menacing glare — wide, hard, inner-down slant, hard FROWN
      openT = 0.55; tiltT = -0.42; widenT = 1.25; eyeIT = 6.5;
      mouthWT = 0.8; mouthYT = 0.5; mouthIT = 3.2; curveT = -0.014;
    } else if (creep >= 1) {
      // narrowed + brightened, a touch menacing + a slight frown
      openT = 0.5; tiltT = -0.22; widenT = 1.1; eyeIT = 3.4;
      mouthWT = 0.9; mouthIT = 1.8; curveT = -0.007;
    } else if (mode === "typing") {
      // focused/listening: eyes narrow + scan, mouth murmurs (subtle open/close)
      openT = 0.62; widenT = 0.86 + Math.sin(t * 14) * 0.06 * calm;
      eyeIT = 2.6 + Math.sin(t * 11) * 0.5 * calm;
      mouthWT = 1.1; mouthYT = 0.8 + Math.sin(t * 13) * 0.5 * calm; mouthIT = 2.0;
      curveT = 0.004;
    } else if (mode === "error") {
      // FLARE hard + sharp angry slant + a hard frown; brief shake via `shake`
      const hot = st < 0.6 ? 1 : 0.55;
      openT = 1.35; tiltT = -0.5; widenT = 1.2;
      eyeIT = 4.5 + hot * 2.5;
      mouthWT = 0.6; mouthYT = 1.4; mouthIT = 3.0 + hot * 1.5; curveT = -0.016;
    } else if (mode === "scan") {
      // sweeping scan: a slow horizontal pulse + bright steady eyes, neutral mouth
      openT = 0.85; widenT = 1.0 + Math.sin(t * 5) * 0.12 * calm;
      eyeIT = 2.8 + Math.sin(t * 6) * 0.5 * calm;
      mouthWT = 1.3 + Math.sin(t * 5) * 0.15 * calm; mouthIT = 2.2; curveT = 0.003;
    } else if (mode === "sleep") {
      // thin flat slits, dim, mouth a tiny peaceful upturn
      openT = 0.08; widenT = 1.05; eyeIT = 0.5;
      mouthWT = 0.55; mouthYT = 0.3; mouthIT = 0.4; curveT = 0.005;
    } else if (mode === "success") {
      // big HAPPY: eyes curve into arcs + a bright pulse, mouth grins WIDE + open
      const p = Math.min(st / 0.7, 1);
      const pulse = Math.sin(p * Math.PI);
      openT = 0.66; tiltT = 0.5; widenT = 1.05;
      eyeIT = 2.8 + pulse * 2.2;
      mouthWT = 1.35; mouthYT = 0.9 + pulse * 0.4; mouthIT = 2.0 + pulse * 1.4;
      curveT = 0.016;
    }

    // IDLE FACE LIFE — couple the face to whatever idle BODY gesture is running so
    // V emotes WITH the motion (looks, tilts, nods) instead of holding one blank
    // stare. A small warm arc is the resting default; each gesture pushes a fitting
    // micro-expression in sync with its envelope (gEnv), eased in/out with it.
    if (mode === "idle" && creep < 1) {
      tiltT = 0.07; // resting warmth: a hair of happy arc even at perfect rest
      curveT = 0.004; // and the faintest resting smile on the mouth
      if (gEnv > 0) {
        if (gName === "glance" || gName === "doubleTake") {
          // a darting look / double-take: eyes widen + brighten, curious
          openT = 1 + 0.34 * gEnv; widenT = 1 + 0.13 * gEnv; eyeIT = 1.5 + 0.9 * gEnv;
        } else if (gName === "headTilt" || gName === "headCock") {
          // curious head tilt: a warm squint + a small smile
          openT = 1 - 0.32 * gEnv; tiltT = 0.07 + 0.42 * gEnv;
          mouthWT = 1 + 0.3 * gEnv; mouthIT = 0.55 + 1.0 * gEnv; curveT = 0.004 + 0.009 * gEnv;
        } else if (gName === "nod" || gName === "breathDeep") {
          // agreeable nod / settle: a friendly squint + a clear SMILE
          openT = 1 - 0.5 * gEnv; tiltT = 0.07 + 0.46 * gEnv;
          mouthWT = 1 + 0.36 * gEnv; mouthYT = 1 - 0.2 * gEnv; mouthIT = 0.55 + 1.4 * gEnv;
          curveT = 0.004 + 0.013 * gEnv;
        } else if (gName === "lookUp") {
          // thinking: gaze drifts up, eyes a touch closed, a thoughtful mouth
          openT = 1 - 0.16 * gEnv; widenT = 1 - 0.08 * gEnv; eyeIT = 1.5 + 0.4 * gEnv;
          curveT = 0.002;
        } else if (gName === "speak") {
          // V chatters: the mouth opens + closes rhythmically (talking) + a lift,
          // eyes brighten — reads as V saying something on its own.
          mouthYT = 1 + Math.abs(Math.sin(t * 17)) * 1.0 * gEnv;
          mouthWT = 1.08; mouthIT = 0.55 + 1.7 * gEnv;
          curveT = 0.006 + 0.004 * gEnv; eyeIT = 1.5 + 0.45 * gEnv;
        } else if (gName === "weightShift" || gName === "armSway" || gName === "shoulderRoll" || gName === "stretch") {
          // relaxed body shift / stretch: a touch more arc + glow, eyes stay open
          tiltT = 0.07 + 0.2 * gEnv; eyeIT = 1.5 + 0.45 * gEnv; mouthIT = 0.55 + 0.5 * gEnv;
          curveT = 0.004 + 0.006 * gEnv;
        }
      }
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
    fr.curve = damp(fr.curve, curveT, 9, delta);

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
      if (pupil) {
        // the dark pupil drifts toward where V is looking (clamped inside the eye)
        // so the eyes visibly track + dart — the "life" in the stare.
        pupil.position.x = Math.max(-0.01, Math.min(0.01, L.eyeYaw * 0.22));
        pupil.position.y = Math.max(-0.01, Math.min(0.01, -L.eyePitch * 0.22));
      }
    }
    if (X.faceMouth) {
      X.faceMouth.scale.set(fr.mouthW, fr.mouthY, 1);
      faceMat.mouth.emissiveIntensity = fr.mouthI;
      // lift / drop the mouth CORNERS: + curve = smile (corners above the bar),
      // - curve = frown. This is what lets the mouth actually emote, not just stretch.
      if (X.mouthCornerL) X.mouthCornerL.position.y = fr.curve;
      if (X.mouthCornerR) X.mouthCornerR.position.y = fr.curve;
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

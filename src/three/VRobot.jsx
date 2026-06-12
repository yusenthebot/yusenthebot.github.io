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
  darkGlass,
  emissiveCore,
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

// Sympathetic lift: the registry's shells have no kinematic children, so the
// "machine is one connected body" law maps to the internals each shell covers —
// they float up ~0.015 in the tail of their cover's band and stay lifted.
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

// All geometry is authored relative to the part origin (parts.js), so hinge
// pivots in the registry line up with the visible pivot cylinders here.
function PartMesh({ id, lip, ctx }) {
  switch (id) {
    case "base_link":
      return (
        <>
          <RoundedBox args={[1.85, 0.14, 1.1]} radius={0.03} smoothness={2} position={[0, 0.2, 0]} material={darkPolymer} castShadow receiveShadow />
          <mesh position={[0, 0.29, 0.42]} rotation-z={HPI} material={lip} castShadow>
            <cylinderGeometry args={[0.025, 0.025, 1.7, 12]} />
          </mesh>
          <mesh position={[0, 0.29, -0.42]} rotation-z={HPI} material={lip} castShadow>
            <cylinderGeometry args={[0.025, 0.025, 1.7, 12]} />
          </mesh>
          {[[-0.8, 0.45], [0.8, 0.45], [-0.8, -0.45], [0.8, -0.45]].map(([x, z]) => (
            <mesh key={`${x}:${z}`} position={[x, 0.065, z]} material={brushedMetal} castShadow>
              <cylinderGeometry args={[0.05, 0.06, 0.13, 16]} />
            </mesh>
          ))}
        </>
      );
    case "torso":
      return (
        <>
          <mesh scale={[1, 0.64, 0.8]} material={brushedMetal} castShadow>
            <sphereGeometry args={[0.6, 32, 24]} />
          </mesh>
          <mesh position={[0, -0.34, 0]} scale={[1, 1, 0.8]} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.52, 0.56, 0.18, 32]} />
          </mesh>
          {/* guts that read when the shells open */}
          <RoundedBox args={[0.3, 0.2, 0.18]} radius={0.02} position={[-0.3, -0.08, 0]} material={darkPolymer} />
          <RoundedBox args={[0.26, 0.16, 0.18]} radius={0.02} position={[0.3, -0.12, 0.04]} material={darkPolymer} />
          <group rotation={[HPI, 0, 0]}>
            <mesh scale={[1, 0.82, 1]} material={lip}>
              <torusGeometry args={[0.585, 0.012, 8, 48]} />
            </mesh>
          </group>
        </>
      );
    case "chest_plate":
      return (
        <>
          <mesh scale={[1, 0.66, 0.84]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.74, 48, 32, 0.25, Math.PI - 0.5, 0.5, 2.1]} />
          </mesh>
          <RoundedBox args={[0.32, 0.3, 0.05]} radius={0.01} position={[0, -0.1, 0.56]} rotation-x={-0.12} material={darkPolymer} />
          {/* status dot trio — same chest lights as the 2D V */}
          {[-0.07, 0, 0.07].map((x) => (
            <mesh key={x} position={[x, -0.02, 0.595]} material={eyeMat}>
              <sphereGeometry args={[0.018, 12, 12]} />
            </mesh>
          ))}
          {/* machined inner lip along the top opening edge */}
          <group position={[0, 0.42, 0]} rotation={[HPI, 0, 0]}>
            <group scale={[1, 0.84, 1]}>
              <mesh rotation-z={HPI - Math.PI * 0.33} material={lip}>
                <torusGeometry args={[0.34, 0.016, 8, 40, Math.PI * 0.66]} />
              </mesh>
            </group>
          </group>
          {/* visible hinge pivot along the bottom edge */}
          <mesh position={[0, -0.34, 0.45]} rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.024, 0.024, 0.44, 12]} />
          </mesh>
          {[[-0.24, 0.18, 0.54], [0.24, 0.18, 0.54], [-0.3, -0.22, 0.5], [0.3, -0.22, 0.5]].map(([x, y, z]) => (
            <mesh key={`${x}:${y}`} position={[x, y, z]} rotation-x={HPI} material={lip}>
              <cylinderGeometry args={[0.016, 0.016, 0.014, 10]} />
            </mesh>
          ))}
        </>
      );
    case "back_plate":
      return (
        <>
          <mesh scale={[1, 0.66, 0.84]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.74, 48, 32, Math.PI + 0.25, Math.PI - 0.5, 0.5, 2.1]} />
          </mesh>
          {[-0.12, 0, 0.12].map((x) => (
            <RoundedBox key={x} args={[0.04, 0.3, 0.04]} radius={0.008} position={[x, 0, -0.56]} material={darkPolymer} />
          ))}
          <group position={[0, 0.42, 0]} rotation={[HPI, 0, 0]}>
            <group scale={[1, 0.84, 1]}>
              <mesh rotation-z={-HPI - Math.PI * 0.33} material={lip}>
                <torusGeometry args={[0.34, 0.016, 8, 40, Math.PI * 0.66]} />
              </mesh>
            </group>
          </group>
          <mesh position={[0, -0.34, -0.45]} rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.024, 0.024, 0.44, 12]} />
          </mesh>
        </>
      );
    case "chest_core_housing":
      return (
        <>
          {[[-0.18, -0.13], [0.18, -0.13], [-0.18, 0.13], [0.18, 0.13]].map(([x, z]) => (
            <mesh key={`${x}:${z}`} position={[x, 0, z]} material={brushedMetal}>
              <cylinderGeometry args={[0.02, 0.02, 0.38, 10]} />
            </mesh>
          ))}
          <RoundedBox args={[0.44, 0.035, 0.32]} radius={0.01} position={[0, 0.2, 0]} material={darkPolymer} />
          <RoundedBox args={[0.44, 0.035, 0.32]} radius={0.01} position={[0, -0.2, 0]} material={darkPolymer} />
          <RoundedBox args={[0.4, 0.36, 0.025]} radius={0.01} position={[0, 0, -0.15]} material={darkPolymer} />
          {/* J4 connector block */}
          <RoundedBox args={[0.08, 0.05, 0.04]} radius={0.005} position={[0.14, 0.12, -0.16]} material={lip} />
        </>
      );
    case "core":
      return (
        <>
          <mesh ref={(m) => ctx.setExtra("coreMesh", m)} material={emissiveCore}>
            <sphereGeometry args={[0.13, 32, 32]} />
          </mesh>
          <mesh rotation-x={HPI} material={brushedMetal}>
            <torusGeometry args={[0.165, 0.018, 10, 40]} />
          </mesh>
          <mesh position={[0, -0.17, 0]} material={lip}>
            <cylinderGeometry args={[0.05, 0.07, 0.05, 16]} />
          </mesh>
        </>
      );
    case "spine":
      return (
        <>
          <mesh material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 0.85, 16]} />
          </mesh>
          {[-0.3, -0.1, 0.1, 0.3].map((y) => (
            <mesh key={y} position={[0, y, 0]} rotation-x={HPI} material={darkPolymer}>
              <torusGeometry args={[0.07, 0.014, 8, 24]} />
            </mesh>
          ))}
          <mesh position={[0, 0.45, 0]} material={lip}>
            <cylinderGeometry args={[0.085, 0.085, 0.03, 16]} />
          </mesh>
        </>
      );
    case "neck_piston_l":
    case "neck_piston_r": {
      const sgn = id.endsWith("_l") ? -1 : 1;
      return (
        <group rotation-z={sgn * -0.1}>
          <mesh material={lip} castShadow>
            <cylinderGeometry args={[0.016, 0.016, 0.3, 10]} />
          </mesh>
          <mesh position={[0, -0.09, 0]} material={darkPolymer} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.13, 12]} />
          </mesh>
        </group>
      );
    }
    case "neck_stack":
      return (
        <>
          {[0, 0.09, 0.18, 0.27].map((y) => (
            <mesh key={y} position={[0, y, 0]} material={darkPolymer} castShadow>
              <cylinderGeometry args={[0.15, 0.15, 0.05, 24]} />
            </mesh>
          ))}
          {[0.045, 0.135, 0.225].map((y) => (
            <mesh key={y} position={[0, y, 0]} material={brushedMetal}>
              <cylinderGeometry args={[0.12, 0.12, 0.045, 24]} />
            </mesh>
          ))}
          <mesh position={[0, 0.315, 0]} material={lip}>
            <cylinderGeometry args={[0.165, 0.165, 0.028, 24]} />
          </mesh>
        </>
      );
    case "head_base":
      return (
        <>
          {/* open-top inner skull bowl — optic core sits inside it */}
          <mesh scale={[1, 0.88, 0.92]} material={darkPolymer}>
            <sphereGeometry args={[0.43, 32, 24, 0, Math.PI * 2, 1.1, Math.PI - 1.1]} />
          </mesh>
          {/* chin shell stays put when the cranium swings open */}
          <mesh scale={[1, 0.88, 0.92]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.5, 48, 32, 0, Math.PI * 2, 1.95, Math.PI - 1.95]} />
          </mesh>
          {/* face plate behind the visor */}
          <mesh position={[0, 0, 0.16]} rotation-x={HPI} material={darkPolymer}>
            <cylinderGeometry args={[0.3, 0.3, 0.03, 24]} />
          </mesh>
          <mesh position={[0, -0.44, 0]} material={darkPolymer}>
            <cylinderGeometry args={[0.13, 0.15, 0.1, 20]} />
          </mesh>
        </>
      );
    case "head_shell":
      return (
        <>
          <mesh scale={[1, 0.88, 0.92]} material={mattePolymer} castShadow>
            <sphereGeometry args={[0.52, 48, 32, Math.PI * 0.85, Math.PI * 1.3, 0.12, 1.78]} />
          </mesh>
          {/* inner lip framing the face opening */}
          <mesh position={[0, 0.02, 0.17]} scale={[1, 0.85, 1]} material={lip}>
            <torusGeometry args={[0.395, 0.018, 8, 48]} />
          </mesh>
          {/* rear-top hinge: visible pivot + blocks */}
          <mesh position={[0, 0.3, -0.34]} rotation-z={HPI} material={brushedMetal} castShadow>
            <cylinderGeometry args={[0.024, 0.024, 0.46, 12]} />
          </mesh>
          {[-0.19, 0.19].map((x) => (
            <RoundedBox key={x} args={[0.05, 0.05, 0.06]} radius={0.01} position={[x, 0.3, -0.33]} material={lip} />
          ))}
        </>
      );
    case "visor_rim":
      return (
        <>
          <mesh position={[0, 0, 0.28]} scale={[1, 0.85, 1]} material={brushedMetal} castShadow>
            <torusGeometry args={[0.32, 0.04, 12, 48]} />
          </mesh>
          {[[0, 0.272], [0, -0.272], [-0.32, 0], [0.32, 0]].map(([x, y]) => (
            <mesh key={`${x}:${y}`} position={[x, y * 0.85, 0.31]} rotation-x={HPI} material={lip}>
              <cylinderGeometry args={[0.014, 0.014, 0.015, 10]} />
            </mesh>
          ))}
        </>
      );
    case "visor_glass":
      return (
        <mesh position={[0, 0, 0.3]} scale={[1, 0.85, 0.5]} material={darkGlass}>
          <sphereGeometry args={[0.3, 32, 24]} />
        </mesh>
      );
    case "eye_module_l":
    case "eye_module_r": {
      const side = id.endsWith("_l") ? "L" : "R";
      return (
        <>
          <mesh rotation-x={HPI} material={darkPolymer}>
            <cylinderGeometry args={[0.095, 0.095, 0.05, 20]} />
          </mesh>
          <mesh position={[0, 0, 0.026]} material={lip}>
            <torusGeometry args={[0.092, 0.008, 8, 24]} />
          </mesh>
          <group ref={(g) => ctx.setExtra(`eyeScale${side}`, g)}>
            {/* arc gap makes the ring spin readable, like the 2D scan arcs */}
            <mesh position={[0, 0, 0.04]} ref={(m) => ctx.setExtra(`eyeRing${side}`, m)} material={eyeMat}>
              <torusGeometry args={[0.062, 0.015, 10, 32, Math.PI * 1.78]} />
            </mesh>
            <mesh position={[0, 0, 0.04]} material={eyeMat}>
              <sphereGeometry args={[0.026, 12, 12]} />
            </mesh>
          </group>
        </>
      );
    }
    case "ear_servo_l":
    case "ear_servo_r": {
      const sgn = id.endsWith("_l") ? -1 : 1;
      return (
        <>
          <mesh rotation-z={HPI} material={mattePolymer} castShadow>
            <cylinderGeometry args={[0.105, 0.105, 0.08, 24]} />
          </mesh>
          <mesh position={[sgn * 0.045, 0, 0]} rotation-z={HPI} material={brushedMetal}>
            <cylinderGeometry args={[0.05, 0.05, 0.03, 16]} />
          </mesh>
          <mesh position={[sgn * 0.062, 0, 0]} rotation-z={HPI} material={darkPolymer}>
            <cylinderGeometry args={[0.028, 0.028, 0.02, 12]} />
          </mesh>
          {/* machined mating face — reads when the servo slides off its rail */}
          <mesh position={[sgn * -0.045, 0, 0]} rotation-y={HPI} material={lip}>
            <torusGeometry args={[0.08, 0.01, 8, 24]} />
          </mesh>
          <mesh position={[sgn * -0.08, 0, 0]} rotation-z={HPI} material={brushedMetal}>
            <cylinderGeometry args={[0.018, 0.018, 0.1, 10]} />
          </mesh>
        </>
      );
    }
    case "optic_internal":
      return (
        <>
          <RoundedBox args={[0.26, 0.12, 0.12]} radius={0.02} material={darkPolymer} castShadow />
          {[-0.07, 0.07].map((x) => (
            <mesh key={x} position={[x, 0, 0.07]} rotation-x={HPI} material={brushedMetal}>
              <cylinderGeometry args={[0.032, 0.032, 0.045, 16]} />
            </mesh>
          ))}
          {[0.075, 0.095, 0.115].map((y) => (
            <RoundedBox key={y} args={[0.2, 0.008, 0.09]} radius={0.002} position={[0, y, -0.01]} material={brushedMetal} />
          ))}
          <RoundedBox args={[0.1, 0.04, 0.006]} radius={0.002} position={[0, -0.01, 0.063]} material={lip} />
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
  const rig = useRef({});
  const extras = useRef({});
  const prevF = useRef({});
  const lastServo = useRef(0);
  const lastLog = useRef({});
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
      const lip = lips.get(def.id);
      if (lip) lip.emissiveIntensity = 0.55;
      const now = performance.now();
      if (now - (lastLog.current[def.id] || 0) > 1500) {
        lastLog.current[def.id] = now;
        useVStore.getState().pushLog("system", `${def.id} :: ${def.spec[1]}`);
      }
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
        g.rotation.x = m.angle * f;
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
    if (R.torso) R.torso.position.y = Math.sin(t * 1.4) * 0.012;

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
    for (const id of ["eye_module_l", "eye_module_r"]) {
      const g = R[id];
      if (g) {
        g.position.x = (L.eyeYaw - L.yaw) * 0.12;
        g.position.y = -(L.eyePitch - L.pitch) * 0.12;
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

    // eye expression per avatar state
    let intensity = 1.7 + Math.sin(t * 2.1) * 0.45 + creep * 0.4;
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
      intensity = 0.7;
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

    // scan: thin emissive ring sweeps the body vertically
    if (X.scanRing) {
      const on = mode === "scan";
      X.scanRing.visible = on;
      if (on) {
        X.scanRing.position.y = 0.12 + ((t * 0.55) % 1) * 1.95;
        scanMat.opacity = 0.55 + Math.sin(t * 30) * 0.2;
      }
    }
  });

  return (
    <group {...props} onPointerMissed={() => useVStore.getState().clearFocus()}>
      <PartNode id="base_link" ctx={ctx} />
      <mesh
        ref={(m) => ctx.setExtra("scanRing", m)}
        visible={false}
        position={[0, 1, 0]}
        rotation-x={HPI}
        scale={[1, 0.85, 1]}
        material={scanMat}
      >
        <torusGeometry args={[0.95, 0.01, 8, 64]} />
      </mesh>
    </group>
  );
}

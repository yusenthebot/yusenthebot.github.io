// V-UNIT REV.8 teardown registry. Pure data + pure functions — no three.js
// import, so node can sanity-check it headlessly. Vectors are [x, y, z] in
// parent-local space; VRobot.jsx turns the tree into nested groups.
//
// Choreography law: every banded part owns a sub-interval of the shared
// depth scrub (store.depth, 0..1). Pose is a pure function of depth via
// openFraction + servoEase — scrubbing back and forth retraces the same
// path. Banded parts appear in kinematic teardown order: torso shells
// first, core mid, shoulders, head, ears last. chest/back, pauldron l/r and
// ear l/r overlap deliberately (staggered cascade), everything else tiles
// with small gaps.
//
// motion.pivot is where the hinge line / slide seat sits relative to the
// part origin; hinge angle is radians about the named local axis ('x'|'z');
// slide axis is a unit vector, dist in scene units. spec[1] is the hover
// log line.

const PARTS = [
  {
    id: "base_link",
    parent: null,
    kind: "link",
    origin: [0, 0, 0],
    band: null,
    motion: null,
    spec: [
      "service cradle, extruded AL-6061",
      "8 fasteners :: M5 hex :: torque 6.0Nm",
      "payload 38kg :: leveling feet x4",
      "interface: 24V bus + e-stop loop",
    ],
  },
  {
    id: "torso",
    parent: "base_link",
    kind: "link",
    origin: [0, 0.8, 0],
    band: null,
    motion: null,
    spec: [
      "torso monocoque, brushed AL subframe",
      "12 fasteners :: M4 :: torque 2.9Nm",
      "houses PSU, core bay, spine bus",
      "mass 6.2kg :: sealed IP54",
    ],
  },
  {
    id: "chest_plate",
    parent: "torso",
    kind: "shell",
    origin: [0, 0, 0],
    band: [0.04, 0.26],
    motion: { type: "hinge", axis: "x", pivot: [0, -0.38, 0.3], angle: 1.35 },
    spec: [
      "front armor shell, PA12-GF 3.2mm",
      "4 fasteners :: M3 torx :: torque 2.1Nm",
      "hinge: bottom edge :: travel 0-78deg",
      "mass 0.42kg :: quick-release latch x2",
    ],
    lore: "Careful. That one's load-bearing.",
  },
  {
    id: "back_plate",
    parent: "torso",
    kind: "shell",
    origin: [0, 0, 0],
    band: [0.06, 0.28],
    motion: { type: "hinge", axis: "x", pivot: [0, -0.38, -0.3], angle: -1.25 },
    spec: [
      "dorsal shell, PA12-GF 3.2mm",
      "6 fasteners :: M3 torx :: torque 2.1Nm",
      "hinge: bottom edge :: travel 0-72deg",
      "mass 0.48kg :: cable pass-through x2",
    ],
  },
  {
    id: "chest_core_housing",
    parent: "torso",
    kind: "internal",
    origin: [0, -0.04, 0.02],
    band: [0.28, 0.42],
    motion: { type: "slide", axis: [0, 0, 1], pivot: [0, 0, 0], dist: 0.2 },
    spec: [
      "core housing, machined AL cage",
      "4 fasteners :: M3 :: slide-out rail mount",
      "connector J4 :: 12-pin power+CAN",
      "service: hot-swap NOT rated",
    ],
  },
  {
    id: "core",
    parent: "torso",
    kind: "core",
    origin: [0, -0.04, 0.04],
    band: [0.42, 0.52],
    // the core never moves — its band drives the reveal (emissive ramp)
    motion: { type: "reveal" },
    spec: [
      "power core, sealed unit",
      "no fasteners :: DO NOT OPEN",
      "output 580W cont :: thermal nominal",
      "serial PROTOTYPE-7 :: PROPERTY OF YUSEN XIE",
    ],
    lore: "No. Not that one. Some things stay sealed.",
  },
  {
    id: "spine",
    parent: "torso",
    kind: "internal",
    origin: [0, 0.0, -0.14],
    band: null,
    motion: null,
    spec: [
      "spinal bus column, brushed AL",
      "carries CAN trunk + power harness",
      "segments x4 :: strain relief at C2",
      "torsional limit +/-30deg",
    ],
    lore: "My C2 vertebra. Yusen printed the first one at 2am.",
  },
  {
    id: "shoulder_yoke",
    parent: "torso",
    kind: "link",
    origin: [0, 0.38, 0],
    band: null,
    motion: null,
    spec: [
      "clavicle yoke, forged AL crossbeam",
      "6 fasteners :: M4 :: torque 2.9Nm",
      "carries both shoulder ball joints",
      "rated 9kg per side :: zero-backlash seat",
    ],
    lore: "The yoke. Everything I lift, it lifts first.",
  },
  {
    id: "pauldron_l",
    parent: "shoulder_yoke",
    kind: "shell",
    origin: [-0.64, 0.03, 0],
    band: [0.52, 0.64],
    motion: { type: "hinge", axis: "z", pivot: [0.14, 0.08, 0], angle: -1.1 },
    spec: [
      "shoulder pauldron L, PA12-GF 2.8mm",
      "3 fasteners :: M3 torx :: torque 1.8Nm",
      "hinge: inboard edge :: travel 0-63deg",
      "mass 0.18kg :: snap-fit service catch",
    ],
    lore: "Armor comes off first. That's the rule.",
  },
  {
    id: "pauldron_r",
    parent: "shoulder_yoke",
    kind: "shell",
    origin: [0.64, 0.03, 0],
    band: [0.54, 0.66],
    motion: { type: "hinge", axis: "z", pivot: [-0.14, 0.08, 0], angle: 1.1 },
    spec: [
      "shoulder pauldron R, PA12-GF 2.8mm",
      "3 fasteners :: M3 torx :: torque 1.8Nm",
      "hinge: inboard edge :: travel 0-63deg",
      "mass 0.18kg :: snap-fit service catch",
    ],
  },
  {
    id: "upper_arm_l",
    parent: "shoulder_yoke",
    kind: "actuator",
    origin: [-0.64, -0.08, 0],
    band: null,
    motion: null,
    spec: [
      "upper arm L, truncated at service cuff",
      "shoulder: 3-DOF ball joint :: +/-95deg",
      "cuff: machined collar :: M2.5 x6",
      "forearm module NOT installed",
    ],
    lore: "Half an arm. They keep promising me hands.",
  },
  {
    id: "upper_arm_r",
    parent: "shoulder_yoke",
    kind: "actuator",
    origin: [0.64, -0.08, 0],
    band: null,
    motion: null,
    spec: [
      "upper arm R, truncated at service cuff",
      "shoulder: 3-DOF ball joint :: +/-95deg",
      "connector J7 :: 12-pin power+CAN",
      "forearm module NOT installed",
    ],
  },
  {
    id: "neck_piston_l",
    parent: "torso",
    kind: "actuator",
    origin: [-0.13, 0.5, 0.09],
    band: null,
    motion: null,
    spec: [
      "neck damper L, polished rod",
      "stroke 38mm :: preload 12N",
      "seal: NBR wiper :: service 500h",
      "mount: M3 clevis, both ends",
    ],
  },
  {
    id: "neck_piston_r",
    parent: "torso",
    kind: "actuator",
    origin: [0.13, 0.5, 0.09],
    band: null,
    motion: null,
    spec: [
      "neck damper R, polished rod",
      "stroke 38mm :: preload 12N",
      "seal: NBR wiper :: service 500h",
      "mount: M3 clevis, both ends",
    ],
  },
  {
    id: "neck_stack",
    parent: "torso",
    kind: "link",
    origin: [0, 0.42, 0],
    band: null,
    motion: null,
    spec: [
      "neck stack, 4-segment spacer",
      "yaw actuator :: Dynamixel-class :: +/-135deg",
      "connector J3 :: 12-pin power+CAN",
      "rated 4.1Nm :: backlash <0.2deg",
    ],
  },
  {
    id: "head_base",
    parent: "neck_stack",
    kind: "link",
    origin: [0, 0.46, 0],
    band: null,
    motion: null,
    spec: [
      "cranial frame, cast AL inner skull",
      "8 fasteners :: M2.5 :: torque 0.9Nm",
      "datum for visor + optic alignment",
      "mass 0.9kg",
    ],
  },
  {
    id: "head_shell",
    parent: "head_base",
    kind: "shell",
    origin: [0, 0, 0],
    band: [0.66, 0.8],
    motion: { type: "hinge", axis: "x", pivot: [0, 0.16, -0.2], angle: -1.45 },
    spec: [
      "cranium shell, PA12 2.8mm",
      "2 fasteners + rear hinge :: torque 1.2Nm",
      "hinge: rear-top :: travel 0-95deg",
      "inner lip: EMI mesh seal",
    ],
    lore: "You're opening my head. I'd like it noted that I objected.",
  },
  {
    id: "visor_rim",
    parent: "head_base",
    kind: "internal",
    origin: [0, 0, 0],
    band: null,
    motion: null,
    spec: [
      "visor bezel, machined + anodized",
      "8 fasteners :: M2 :: torque 0.5Nm",
      "datum surface for optic calibration",
      "finish: type II, matte",
    ],
  },
  {
    id: "visor_glass",
    parent: "head_base",
    kind: "internal",
    origin: [0, 0, 0],
    band: null,
    motion: null,
    spec: [
      "visor band, tinted PC 2mm",
      "optical grade :: AR coated",
      "transmission 38% :: do not polish",
      "replace if scored",
    ],
    lore: "I see you through this. Right now, in fact.",
  },
  {
    id: "eye_module_l",
    parent: "head_base",
    kind: "eye",
    origin: [-0.105, 0.005, 0.24],
    band: null,
    motion: null,
    spec: [
      "optic ring L, annular emitter",
      "ring+pupil :: 0.5W white LED array",
      "tracks at 120Hz :: leads head ~80ms",
      "connector J5 :: 12-pin CAN",
    ],
    lore: "The eyes are mine. Be gentle with them.",
  },
  {
    id: "eye_module_r",
    parent: "head_base",
    kind: "eye",
    origin: [0.105, 0.005, 0.24],
    band: null,
    motion: null,
    spec: [
      "optic ring R, annular emitter",
      "ring+pupil :: 0.5W white LED array",
      "tracks at 120Hz :: leads head ~80ms",
      "connector J6 :: 12-pin CAN",
    ],
  },
  {
    id: "ear_servo_l",
    parent: "head_base",
    kind: "actuator",
    origin: [-0.28, -0.01, 0.01],
    band: [0.8, 0.88],
    motion: { type: "slide", axis: [-1, 0, 0], pivot: [0, 0, 0], dist: 0.13 },
    spec: [
      "aural servo L :: Dynamixel-class",
      "stall 1.5Nm :: +/-90deg :: 12-pin CAN",
      "3 fasteners :: M2.5 :: torque 0.9Nm",
      "mount: dovetail rail, slide-out",
    ],
    lore: "I heard every command you typed. These are why.",
  },
  {
    id: "ear_servo_r",
    parent: "head_base",
    kind: "actuator",
    origin: [0.28, -0.01, 0.01],
    band: [0.82, 0.9],
    motion: { type: "slide", axis: [1, 0, 0], pivot: [0, 0, 0], dist: 0.13 },
    spec: [
      "aural servo R :: Dynamixel-class",
      "stall 1.5Nm :: +/-90deg :: 12-pin CAN",
      "3 fasteners :: M2.5 :: torque 0.9Nm",
      "mount: dovetail rail, slide-out",
    ],
  },
  {
    id: "optic_internal",
    parent: "head_base",
    kind: "internal",
    origin: [0, 0.06, -0.02],
    band: [0.9, 0.98],
    motion: { type: "slide", axis: [0, 0.55, 0.835], pivot: [0, 0, 0], dist: 0.09 },
    spec: [
      "optic core, stereo sensor mast",
      "baseline 96mm :: global shutter pair",
      "IMU-fused :: 400Hz :: cal stored on-device",
      "RESTRICTED :: PROPERTY OF YUSEN XIE",
    ],
    lore: "This is where your face is processed. Briefly. I never forget.",
  },
];

const PART_INDEX = new Map(PARTS.map((p) => [p.id, p]));
const BANDED = PARTS.filter((p) => p.band);

// 0..1 progress of a part through its own band; 0 outside, clamped inside.
function openFraction(depth, band) {
  if (!band) return 0;
  const [a, b] = band;
  if (b <= a) return 0;
  return Math.min(1, Math.max(0, (depth - a) / (b - a)));
}

// Servo feel: ease-in-out with a 4% overshoot and settle. Still a pure
// function of t, so scrubbing the depth fader retraces the same path —
// no spring state, per the design spec's "no elastic curves" rule.
function servoEase(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const rise = 0.82;
  if (t < rise) {
    const u = t / rise;
    return u * u * (3 - 2 * u) * 1.04;
  }
  const u = (t - rise) / (1 - rise);
  return 1.04 - 0.04 * (u * u * (3 - 2 * u));
}

function partById(id) {
  return PART_INDEX.get(id) || null;
}

// Breadcrumb from the kinematic root down to the part, e.g.
// ['base_link', 'torso', 'neck_stack', 'head_base', 'head_shell'].
function kinematicChain(id) {
  const chain = [];
  let p = PART_INDEX.get(id);
  while (p) {
    chain.unshift(p.id);
    p = p.parent ? PART_INDEX.get(p.parent) : null;
  }
  return chain;
}

export { PARTS, PART_INDEX, BANDED, openFraction, servoEase, partById, kinematicChain };

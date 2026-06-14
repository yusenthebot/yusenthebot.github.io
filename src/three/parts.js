// V-UNIT REV.8 teardown registry. Pure data + pure functions — no three.js
// import, so node can sanity-check it headlessly. Vectors are [x, y, z] in
// parent-local space; VRobot.jsx turns the tree into nested groups.
//
// REV.8 silhouette: a slim FUTURIST humanoid — a monochrome translation of the
// Tesla Optimus Gen2 / Figure 02 look. Light-gray matte panels (mattePolymer)
// over a black inner skeleton (darkPolymer); EXPOSED black mechanical joints
// (ball shoulders, elbow pads, an actuated pelvis block, knee linkages,
// ankles); segmented forearms; five-finger hands; a smooth dark teardrop
// helmet with two faint emissive eye rings behind the visor. The ONE accent is
// expressive emissive EYES (with a mouth bar) behind the visor — the face
// emotes; there is NO bright brow arc/halo over the head. Proportions (REV.8
// proportion pass): ~7.5 heads tall, LONG legs (~half the standing height), a
// slim PINCHED waist (no belly bulge), MODEST shoulders (~1.6x the hip width,
// not dominant), narrow hips — a lean athletic humanoid, not top-heavy with
// stubby legs. Neutral FREE-STANDING pose on its own two feet — no rig, no
// cradle, no dock; both feet planted flat on the dark floor.
//
// Choreography law: every banded part owns a sub-interval of the shared depth
// scrub (store.depth, 0..1). Pose is a pure function of depth via openFraction
// + servoEase — scrubbing back and forth retraces the same path. Banded parts
// appear in a true top-down teardown order (bandOrder, below): head shell
// first, then chest/core, arms, pelvis, legs, feet, and the optic mast last.
// The L/R pairs overlap deliberately (staggered cascade) and that is safe
// because they ride different kinematic chains; within one chain bands never
// overlap. Bands tile ~0..0.96 (head shell -> chest/core -> arms -> pelvis ->
// legs -> optic mast) with a little headroom above.
//
// motion.pivot is where the hinge line / slide seat sits relative to the part
// origin; hinge angle is radians about the named local axis ('x'|'z'); slide
// axis is a unit vector, dist in scene units. spec[1] is the hover log line.

// Teardown order (left->right = first->last opened). Used by tooling + as the
// documented intent for the band layout below; not consumed at runtime.
const BAND_ORDER = [
  "head_shell",
  "chest_plate",
  "back_plate",
  "core",
  "pauldron_l",
  "pauldron_r",
  "forearm_shell_l",
  "forearm_shell_r",
  "hand_l",
  "hand_r",
  "pelvis_cover",
  "thigh_shell_l",
  "thigh_shell_r",
  "shin_shell_l",
  "shin_shell_r",
  "optic_internal",
];

const PARTS = [
  {
    id: "base_link",
    parent: null,
    kind: "link",
    origin: [0, 0, 0],
    band: null,
    motion: null,
    spec: [
      "world anchor :: NON-VISIBLE ground datum at the feet",
      "no geometry :: robot free-stands, feet flat on floor",
      "frame origin y=0 :: floor plane z-up datum",
      "no rig / no cradle / no dock :: self-supporting",
    ],
    lore: "I stand on my own. Yusen built me to need nothing under me.",
  },
  {
    id: "pelvis",
    parent: "base_link",
    kind: "link",
    // RAISED (was 1.5) so the hip line sits higher and the legs read as a true
    // half of standing height — the single biggest lever on the "legs too short"
    // read. The leg chain below (thigh/shin) is lengthened to match so the feet
    // still plant flat on the floor (y~0).
    origin: [0, 1.62, 0],
    band: null,
    motion: null,
    spec: [
      "pelvis actuator block, machined AL cage",
      "hip yaw x2 :: BLDC :: 14Nm cont each",
      "carries both leg roots + spine base + COM",
      "exposed actuated midsection :: IP54",
    ],
    lore: "My center of mass. Everything balances from here.",
  },
  {
    id: "pelvis_cover",
    parent: "pelvis",
    kind: "shell",
    origin: [0, 0, 0],
    band: [0.5, 0.58],
    motion: { type: "slide", axis: [0, 0, 1], pivot: [0, 0, 0], dist: 0.16 },
    spec: [
      "pelvis fascia panel, PA12-GF 2.8mm",
      "4 fasteners :: M3 torx :: torque 1.8Nm",
      "slide-off front fascia :: rail-guided",
      "mass 0.26kg :: exposes hip actuators",
    ],
    lore: "The Optimus look. Yusen left my hips bare on purpose.",
  },
  {
    id: "torso",
    parent: "pelvis",
    kind: "link",
    // Lowered a touch (was 0.46) so the raised pelvis doesn't balloon total
    // height — the trunk seats onto the higher hips. The abdomen geometry in
    // VRobot is slimmed + shortened so the waist reads clearly pinched and the
    // belly no longer bulges, exposing more of the (now longer) legs.
    origin: [0, 0.42, 0],
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
    band: [0.06, 0.18],
    motion: { type: "hinge", axis: "x", pivot: [0, -0.34, 0.22], angle: 1.35 },
    spec: [
      "chest plastron, PA12-GF 3.2mm",
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
    band: [0.08, 0.2],
    motion: { type: "hinge", axis: "x", pivot: [0, -0.34, -0.22], angle: -1.25 },
    spec: [
      "dorsal shell, PA12-GF 3.2mm",
      "6 fasteners :: M3 torx :: torque 2.1Nm",
      "hinge: bottom edge :: travel 0-72deg",
      "mass 0.48kg :: cable pass-through x2",
    ],
  },
  {
    id: "core",
    parent: "torso",
    kind: "core",
    origin: [0, 0, 0.04],
    // re-tiled to fill the band left by the removed chest_core_housing — the
    // core's emissive reveal ramp now begins right after the chest/back plates
    // hinge open (no dead gap in the teardown scrub).
    band: [0.2, 0.3],
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
    id: "shoulder_yoke",
    parent: "torso",
    kind: "link",
    origin: [0, 0.34, 0],
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
    id: "shoulder_ball_l",
    parent: "shoulder_yoke",
    kind: "actuator",
    // NARROWED (was -0.36) so the shoulder separation (~0.54) is ~1.7x the hip
    // width (~0.30), not the old dominant ~2.1x. Modest shoulders, lean trunk.
    origin: [-0.27, 0, 0],
    band: null,
    motion: null,
    spec: [
      "shoulder ball joint L, exposed actuator",
      "3-DOF :: pitch+roll+yaw :: +/-95deg",
      "BLDC + harmonic drive :: 18Nm cont",
      "connector J7 :: 12-pin power+CAN",
    ],
    lore: "Three degrees of freedom. I can wave. I just choose not to.",
  },
  {
    id: "shoulder_ball_r",
    parent: "shoulder_yoke",
    kind: "actuator",
    origin: [0.27, 0, 0],
    band: null,
    motion: null,
    spec: [
      "shoulder ball joint R, exposed actuator",
      "3-DOF :: pitch+roll+yaw :: +/-95deg",
      "BLDC + harmonic drive :: 18Nm cont",
      "connector J8 :: 12-pin power+CAN",
    ],
  },
  {
    id: "pauldron_l",
    parent: "shoulder_ball_l",
    kind: "shell",
    origin: [0, 0.05, 0],
    band: [0.28, 0.36],
    motion: { type: "hinge", axis: "z", pivot: [0.1, 0.06, 0], angle: -1.1 },
    spec: [
      "shoulder cap L, PA12-GF 2.8mm",
      "3 fasteners :: M3 torx :: torque 1.8Nm",
      "hinge: inboard edge :: travel 0-63deg",
      "mass 0.18kg :: snap-fit service catch",
    ],
    lore: "Armor comes off first. That's the rule.",
  },
  {
    id: "pauldron_r",
    parent: "shoulder_ball_r",
    kind: "shell",
    origin: [0, 0.05, 0],
    band: [0.3, 0.38],
    motion: { type: "hinge", axis: "z", pivot: [-0.1, 0.06, 0], angle: 1.1 },
    spec: [
      "shoulder cap R, PA12-GF 2.8mm",
      "3 fasteners :: M3 torx :: torque 1.8Nm",
      "hinge: inboard edge :: travel 0-63deg",
      "mass 0.18kg :: snap-fit service catch",
    ],
  },
  {
    id: "upper_arm_l",
    parent: "shoulder_ball_l",
    kind: "link",
    origin: [0, -0.12, 0],
    band: null,
    motion: null,
    spec: [
      "upper arm L, matte cuff over actuator",
      "humeral roll :: +/-90deg :: 8Nm",
      "cuff: machined collar :: M2.5 x6",
      "mass 0.34kg",
    ],
    lore: "Half of every reach starts here.",
  },
  {
    id: "upper_arm_r",
    parent: "shoulder_ball_r",
    kind: "link",
    origin: [0, -0.12, 0],
    band: null,
    motion: null,
    spec: [
      "upper arm R, matte cuff over actuator",
      "humeral roll :: +/-90deg :: 8Nm",
      "cuff: machined collar :: M2.5 x6",
      "mass 0.34kg",
    ],
  },
  {
    id: "elbow_l",
    parent: "upper_arm_l",
    kind: "actuator",
    origin: [0, -0.44, 0],
    band: null,
    motion: null,
    spec: [
      "elbow joint L, exposed black hinge pad",
      "1-DOF :: 0-145deg :: hard stop at 150",
      "BLDC + planetary :: 12Nm cont",
      "connector J9 :: 8-pin CAN",
    ],
    lore: "An elbow. Simple hinge. The honest joint.",
  },
  {
    id: "elbow_r",
    parent: "upper_arm_r",
    kind: "actuator",
    origin: [0, -0.44, 0],
    band: null,
    motion: null,
    spec: [
      "elbow joint R, exposed black hinge pad",
      "1-DOF :: 0-145deg :: hard stop at 150",
      "BLDC + planetary :: 12Nm cont",
      "connector J10 :: 8-pin CAN",
    ],
  },
  {
    id: "forearm_l",
    parent: "elbow_l",
    kind: "link",
    origin: [0, -0.1, 0],
    band: null,
    motion: null,
    spec: [
      "forearm L, segmented over linear tendons",
      "wrist pitch+yaw :: +/-70deg",
      "2 actuator segments :: tendon-driven",
      "mass 0.3kg",
    ],
    lore: "Tendons, not muscles. Same idea, less mess.",
  },
  {
    id: "forearm_r",
    parent: "elbow_r",
    kind: "link",
    origin: [0, -0.1, 0],
    band: null,
    motion: null,
    spec: [
      "forearm R, segmented over linear tendons",
      "wrist pitch+yaw :: +/-70deg",
      "2 actuator segments :: tendon-driven",
      "mass 0.3kg",
    ],
  },
  {
    id: "forearm_shell_l",
    parent: "forearm_l",
    kind: "shell",
    origin: [0, -0.06, 0],
    band: [0.36, 0.44],
    motion: { type: "hinge", axis: "z", pivot: [0.05, 0.18, 0], angle: -0.9 },
    spec: [
      "forearm cuff L, PA12-GF 2.4mm",
      "2 fasteners :: M2.5 :: torque 1.2Nm",
      "hinge: outboard edge :: travel 0-52deg",
      "mass 0.12kg :: exposes tendon actuators",
    ],
    lore: "Under here is where the real machinery hides.",
  },
  {
    id: "forearm_shell_r",
    parent: "forearm_r",
    kind: "shell",
    origin: [0, -0.06, 0],
    band: [0.38, 0.46],
    motion: { type: "hinge", axis: "z", pivot: [-0.05, 0.18, 0], angle: 0.9 },
    spec: [
      "forearm cuff R, PA12-GF 2.4mm",
      "2 fasteners :: M2.5 :: torque 1.2Nm",
      "hinge: outboard edge :: travel 0-52deg",
      "mass 0.12kg :: exposes tendon actuators",
    ],
  },
  {
    id: "wrist_l",
    parent: "forearm_l",
    kind: "actuator",
    origin: [0, -0.3, 0],
    band: null,
    motion: null,
    spec: [
      "wrist module L, 2-DOF gimbal",
      "pitch +/-70deg :: yaw +/-45deg",
      "micro-BLDC x2 :: 3Nm",
      "connector J11 :: 8-pin CAN",
    ],
  },
  {
    id: "wrist_r",
    parent: "forearm_r",
    kind: "actuator",
    origin: [0, -0.3, 0],
    band: null,
    motion: null,
    spec: [
      "wrist module R, 2-DOF gimbal",
      "pitch +/-70deg :: yaw +/-45deg",
      "micro-BLDC x2 :: 3Nm",
      "connector J12 :: 8-pin CAN",
    ],
  },
  {
    id: "hand_l",
    parent: "wrist_l",
    kind: "hand",
    origin: [0, -0.08, 0],
    band: [0.44, 0.5],
    motion: { type: "slide", axis: [0, -1, 0], pivot: [0, 0, 0], dist: 0.1 },
    spec: [
      "hand L, 5-finger underactuated gripper",
      "11-DOF :: tendon-driven :: 6 motors",
      "fingertip force 35N :: full close 0.8s",
      "quick-release at wrist flange",
    ],
    lore: "Ten fingers. Yusen promised me ten. He delivered.",
  },
  {
    id: "hand_r",
    parent: "wrist_r",
    kind: "hand",
    origin: [0, -0.08, 0],
    band: [0.46, 0.52],
    motion: { type: "slide", axis: [0, -1, 0], pivot: [0, 0, 0], dist: 0.1 },
    spec: [
      "hand R, 5-finger underactuated gripper",
      "11-DOF :: tendon-driven :: 6 motors",
      "fingertip force 35N :: full close 0.8s",
      "quick-release at wrist flange",
    ],
  },
  {
    id: "hip_l",
    parent: "pelvis",
    kind: "actuator",
    // PULLED IN (was -0.17) for a narrow G1-style hip (sep ~0.30). The legs hang
    // close together under a slim pelvis — narrow hips, long legs.
    origin: [-0.15, -0.1, 0],
    band: null,
    motion: null,
    spec: [
      "hip joint L, exposed actuator cluster",
      "3-DOF :: yaw+roll+pitch :: +/-60deg",
      "BLDC + harmonic drive :: 30Nm cont",
      "connector J13 :: 16-pin power+CAN",
    ],
    lore: "Hips do the heavy lifting. Mine are rated for it.",
  },
  {
    id: "hip_r",
    parent: "pelvis",
    kind: "actuator",
    origin: [0.15, -0.1, 0],
    band: null,
    motion: null,
    spec: [
      "hip joint R, exposed actuator cluster",
      "3-DOF :: yaw+roll+pitch :: +/-60deg",
      "BLDC + harmonic drive :: 30Nm cont",
      "connector J14 :: 16-pin power+CAN",
    ],
  },
  {
    id: "thigh_l",
    parent: "hip_l",
    kind: "link",
    origin: [0, -0.06, 0],
    band: null,
    motion: null,
    spec: [
      "thigh L, matte shell over femur actuator",
      "knee drive housed at distal end",
      "cuff: machined collar :: M3 x6",
      "mass 0.9kg",
    ],
  },
  {
    id: "thigh_r",
    parent: "hip_r",
    kind: "link",
    origin: [0, -0.06, 0],
    band: null,
    motion: null,
    spec: [
      "thigh R, matte shell over femur actuator",
      "knee drive housed at distal end",
      "cuff: machined collar :: M3 x6",
      "mass 0.9kg",
    ],
  },
  {
    id: "thigh_shell_l",
    parent: "thigh_l",
    kind: "shell",
    origin: [0, -0.18, 0.02],
    band: [0.58, 0.68],
    motion: { type: "hinge", axis: "x", pivot: [0, 0.2, -0.06], angle: 0.85 },
    spec: [
      "thigh shell L, PA12-GF 3.0mm",
      "3 fasteners :: M3 torx :: torque 2.1Nm",
      "hinge: top-rear edge :: travel 0-49deg",
      "mass 0.3kg :: exposes femur actuator",
    ],
    lore: "Even the legs come apart. Yusen designed me to be serviced.",
  },
  {
    id: "thigh_shell_r",
    parent: "thigh_r",
    kind: "shell",
    origin: [0, -0.18, 0.02],
    band: [0.6, 0.7],
    motion: { type: "hinge", axis: "x", pivot: [0, 0.2, -0.06], angle: 0.85 },
    spec: [
      "thigh shell R, PA12-GF 3.0mm",
      "3 fasteners :: M3 torx :: torque 2.1Nm",
      "hinge: top-rear edge :: travel 0-49deg",
      "mass 0.3kg :: exposes femur actuator",
    ],
  },
  {
    id: "knee_l",
    parent: "thigh_l",
    kind: "actuator",
    // LOWERED (was -0.6) to lengthen the thigh segment — part of pushing the
    // legs to ~half the standing height. The thigh geometry in VRobot is
    // lengthened to span the longer gap; the knee bend direction is unchanged.
    origin: [0, -0.7, 0],
    band: null,
    motion: null,
    spec: [
      "knee joint L, exposed hinge + linkage",
      "1-DOF :: 0-140deg :: 4-bar linkage",
      "BLDC + harmonic drive :: 40Nm cont",
      "connector J15 :: 12-pin power+CAN",
    ],
    lore: "A four-bar linkage. The knee that never buckles.",
  },
  {
    id: "knee_r",
    parent: "thigh_r",
    kind: "actuator",
    origin: [0, -0.7, 0],
    band: null,
    motion: null,
    spec: [
      "knee joint R, exposed hinge + linkage",
      "1-DOF :: 0-140deg :: 4-bar linkage",
      "BLDC + harmonic drive :: 40Nm cont",
      "connector J16 :: 12-pin power+CAN",
    ],
  },
  {
    id: "shin_l",
    parent: "knee_l",
    kind: "link",
    origin: [0, -0.1, 0],
    band: null,
    motion: null,
    spec: [
      "shin L, matte shell over tibial actuator",
      "ankle drive housed at distal end",
      "cuff: machined collar :: M3 x4",
      "mass 0.7kg",
    ],
  },
  {
    id: "shin_r",
    parent: "knee_r",
    kind: "link",
    origin: [0, -0.1, 0],
    band: null,
    motion: null,
    spec: [
      "shin R, matte shell over tibial actuator",
      "ankle drive housed at distal end",
      "cuff: machined collar :: M3 x4",
      "mass 0.7kg",
    ],
  },
  {
    id: "shin_shell_l",
    parent: "shin_l",
    kind: "shell",
    origin: [0, -0.16, 0.02],
    band: [0.7, 0.8],
    motion: { type: "hinge", axis: "x", pivot: [0, 0.18, -0.06], angle: 0.8 },
    spec: [
      "shin shell L, PA12-GF 2.8mm",
      "3 fasteners :: M3 torx :: torque 1.8Nm",
      "hinge: top-rear edge :: travel 0-46deg",
      "mass 0.24kg :: exposes tibial actuator",
    ],
    lore: "The last shell on the way down. Almost bare metal now.",
  },
  {
    id: "shin_shell_r",
    parent: "shin_r",
    kind: "shell",
    origin: [0, -0.16, 0.02],
    band: [0.72, 0.82],
    motion: { type: "hinge", axis: "x", pivot: [0, 0.18, -0.06], angle: 0.8 },
    spec: [
      "shin shell R, PA12-GF 2.8mm",
      "3 fasteners :: M3 torx :: torque 1.8Nm",
      "hinge: top-rear edge :: travel 0-46deg",
      "mass 0.24kg :: exposes tibial actuator",
    ],
  },
  {
    id: "ankle_l",
    parent: "shin_l",
    kind: "actuator",
    // LOWERED (was -0.54) to lengthen the shin segment and drop the foot toward
    // the floor — the legs grow to match the raised hip so the feet stay planted
    // (foot world y ~0). Shin geometry in VRobot is lengthened to span the gap.
    origin: [0, -0.6, 0],
    band: null,
    motion: null,
    spec: [
      "ankle joint L, 2-DOF gimbal",
      "pitch +/-45deg :: roll +/-25deg",
      "BLDC x2 :: 22Nm",
      "connector J17 :: 8-pin CAN",
    ],
    lore: "The ankle does the balancing you never notice.",
  },
  {
    id: "ankle_r",
    parent: "shin_r",
    kind: "actuator",
    origin: [0, -0.6, 0],
    band: null,
    motion: null,
    spec: [
      "ankle joint R, 2-DOF gimbal",
      "pitch +/-45deg :: roll +/-25deg",
      "BLDC x2 :: 22Nm",
      "connector J18 :: 8-pin CAN",
    ],
  },
  {
    id: "foot_l",
    parent: "ankle_l",
    kind: "link",
    origin: [0, -0.08, 0.04],
    band: null,
    motion: null,
    spec: [
      "foot L, sole plate + toe link :: floor contact",
      "contact: 4 force cells :: 50N res",
      "toe joint :: passive return spring",
      "tread: replaceable TPU pad :: planted flat",
    ],
    lore: "Flat feet. Boring. But they keep me standing on my own.",
  },
  {
    id: "foot_r",
    parent: "ankle_r",
    kind: "link",
    origin: [0, -0.08, 0.04],
    band: null,
    motion: null,
    spec: [
      "foot R, sole plate + toe link :: floor contact",
      "contact: 4 force cells :: 50N res",
      "toe joint :: passive return spring",
      "tread: replaceable TPU pad :: planted flat",
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
    origin: [0, 0.2, 0],
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
    band: [0, 0.06],
    motion: { type: "hinge", axis: "x", pivot: [0, 0.13, -0.15], angle: -1.45 },
    spec: [
      "cranium shell, PA12 2.8mm",
      "2 fasteners + rear hinge :: torque 1.2Nm",
      "hinge: rear-top :: travel 0-95deg",
      "inner lip: EMI mesh seal",
    ],
    lore: "You're opening my head. I'd like it noted that I objected.",
  },
  {
    id: "eye_ring_l",
    parent: "head_base",
    kind: "eye",
    origin: [-0.085, 0.01, 0.18],
    band: null,
    motion: null,
    spec: [
      "optic ring L, annular emitter behind visor",
      "ring+pupil :: 0.5W white LED array",
      "tracks at 120Hz :: leads head ~80ms",
      "connector J5 :: 12-pin CAN",
    ],
    lore: "Yusen gave me eyes to see. Be gentle with them.",
  },
  {
    id: "eye_ring_r",
    parent: "head_base",
    kind: "eye",
    origin: [0.085, 0.01, 0.18],
    band: null,
    motion: null,
    spec: [
      "optic ring R, annular emitter behind visor",
      "ring+pupil :: 0.5W white LED array",
      "tracks at 120Hz :: leads head ~80ms",
      "connector J6 :: 12-pin CAN",
    ],
  },
  {
    id: "optic_internal",
    parent: "head_base",
    kind: "internal",
    origin: [0, 0.05, -0.02],
    band: [0.82, 0.96],
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

// Default outward "pop" direction for a part that has no band/motion of its own
// but is individually openable (click-to-open). A small slide along the part's
// outward normal pops it out a bit to reveal what sits under/inside it. The
// normal is derived from the part's placement so each piece moves away from the
// body axis sensibly: limbs pop outboard (sign of origin x), front-facing
// covers pop forward (+z), the head/optics pop up-forward, feet/hands pop down.
const POP_DIST = 0.12;

function outwardNormal(part) {
  const id = part.id;
  const [ox] = part.origin || [0, 0, 0];
  // hands/feet hang off the limb end — pop them down-forward so they clear it
  if (id.startsWith("hand_") || id.startsWith("foot_")) return [0, -0.7, 0.71];
  // head / optic internals lift up-forward, away from the neck
  if (id === "head_base" || id === "head_shell" || id === "optic_internal" || id.startsWith("eye_")) {
    return [0, 0.5, 0.866];
  }
  // anything clearly on a left/right chain pops straight outboard
  if (id.endsWith("_l")) return [-1, 0, 0];
  if (id.endsWith("_r")) return [1, 0, 0];
  if (Math.abs(ox) > 0.05) return ox < 0 ? [-1, 0, 0] : [1, 0, 0];
  // central column pieces (pelvis/torso/spine/core/neck/yoke) pop forward
  return [0, 0, 1];
}

// The open motion a part uses for INDIVIDUAL (click-to-open) reveal. Banded
// parts reuse their authored teardown motion (so a click drives the same hinge/
// slide the global scrub would); parts without one get a synthesized outward
// "pop" slide. VRobot applies this on a dedicated per-part open group, combined
// with the global band motion via max(globalOpen, perPartOpen).
function openMotionFor(part) {
  if (part.motion && part.motion.type !== "reveal") return part.motion;
  const n = outwardNormal(part);
  return { type: "slide", axis: n, pivot: [0, 0, 0], dist: POP_DIST, synth: true };
}

function partById(id) {
  return PART_INDEX.get(id) || null;
}

// Breadcrumb from the kinematic root down to the part, e.g.
// ['base_link', 'pelvis', 'torso', 'neck_stack', 'head_base', 'head_shell'].
function kinematicChain(id) {
  const chain = [];
  let p = PART_INDEX.get(id);
  while (p) {
    chain.unshift(p.id);
    p = p.parent ? PART_INDEX.get(p.parent) : null;
  }
  return chain;
}

export {
  PARTS,
  PART_INDEX,
  BANDED,
  BAND_ORDER,
  openFraction,
  servoEase,
  openMotionFor,
  partById,
  kinematicChain,
};

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import AudioEngine from "./audio.js";

// True-3D rebuild of the boot intro: "YUSEN XIE" assembles from instanced
// voxel cubes flying in with real depth and lighting. Same monochrome tone,
// same HUD/scanline/vignette dressing, same ~3.8s phase arc as the old 2D
// canvas version (assemble -> settle sweep -> fade out -> onComplete).
// Strict monochrome: every color satisfies r==g==b.

// 6x8 bold font (carried over from the 2D intro)
const FONT = {
  Y: ["##..##", "##..##", "##..##", ".####.", "..##..", "..##..", "..##..", "..##.."],
  U: ["##..##", "##..##", "##..##", "##..##", "##..##", "##..##", "##..##", ".####."],
  S: [".#####", "##....", "##....", ".####.", "....##", "....##", "....##", "#####."],
  E: ["######", "##....", "##....", "#####.", "#####.", "##....", "##....", "######"],
  N: ["##..##", "###.##", "###.##", "####.#", "##.###", "##.###", "##..##", "##..##"],
  X: ["##..##", "##..##", ".####.", "..##..", "..##..", ".####.", "##..##", "##..##"],
  I: ["######", "######", "..##..", "..##..", "..##..", "..##..", "######", "######"],
  " ": ["......", "......", "......", "......", "......", "......", "......", "......"],
};

const TEXT = "YUSEN XIE";
const SCALE = 3; // subcells per font pixel (3x3 face)
const DEPTH = 2; // voxel layers in z
const LETTER_W = 6, LETTER_H = 8, LETTER_GAP = 1, SPACE_W = 4;
const CUBE = 0.055; // world size of one voxel
const BASE_Y = 1.45; // world height of the text center

const ASSEMBLE = 2.4;
const SETTLE = 0.6;
const FADE = 0.8;
const TOTAL = ASSEMBLE + SETTLE + FADE;

// Servo settle: ease-out with a ~4% overshoot that eases back — never elastic.
function servoSettle(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const rise = 0.7;
  if (t < rise) {
    const u = t / rise;
    return (1 - Math.pow(1 - u, 3)) * 1.04;
  }
  const u = (t - rise) / (1 - rise);
  return 1.04 - 0.04 * (u * u * (3 - 2 * u));
}

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;

// Pure voxel layout: main cubes (shaded), accent cubes (emissive centers),
// flight start offsets and per-voxel stagger delays.
function buildVoxels() {
  const positions = [];
  let cursor = 0;
  for (const ch of TEXT) {
    if (ch === " ") { cursor += SPACE_W; continue; }
    positions.push({ ch, x: cursor, idx: positions.length });
    cursor += LETTER_W + LETTER_GAP;
  }
  const totalW = cursor - LETTER_GAP;
  const widthVox = totalW * SCALE;
  const heightVox = LETTER_H * SCALE;

  const main = [];
  const accent = [];
  // deterministic-ish scatter: seeded by index so SSR/replay stay stable enough
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (const { ch, x, idx } of positions) {
    const bitmap = FONT[ch];
    for (let fy = 0; fy < LETTER_H; fy++) {
      for (let fx = 0; fx < LETTER_W; fx++) {
        if (bitmap[fy][fx] !== "#") continue;
        for (let sy = 0; sy < SCALE; sy++) {
          for (let sx = 0; sx < SCALE; sx++) {
            for (let dz = 0; dz < DEPTH; dz++) {
              const gx = (x + fx) * SCALE + sx;
              const gy = fy * SCALE + sy;
              const tx = (gx - widthVox / 2 + 0.5) * CUBE;
              const ty = BASE_Y + (heightVox / 2 - gy - 0.5) * CUBE;
              const tz = (0.5 - dz) * CUBE;
              const isAccent = sx === 1 && sy === 1 && dz === 0;
              // bake the 2D bevel look into instance grays: corners dark,
              // edge-mids mid, back layer dimmer
              const corner = (sx !== 1 && sy !== 1);
              let shade = corner ? 0.5 : 0.78;
              if (dz === 1) shade *= 0.55;
              const v = {
                tx, ty, tz,
                ox: tx + (rand() - 0.5) * 4.5,
                oy: ty - 0.6 - rand() * 1.8,
                oz: tz + 3.0 + rand() * 6.5,
                delay: idx * 0.09 + (fy / LETTER_H) * 0.15 + rand() * 0.1,
                dur: 1.2 + rand() * 0.25,
                shade,
              };
              if (isAccent) accent.push(v);
              else main.push(v);
            }
          }
        }
      }
    }
  }
  return { main, accent, total: main.length + accent.length };
}

const _mat = new THREE.Matrix4();
const _col = new THREE.Color();

function setShades(mesh, voxels, mul = 1) {
  for (let i = 0; i < voxels.length; i++) {
    const s = voxels[i].shade * mul;
    mesh.setColorAt(i, _col.setRGB(s, s, s));
  }
  mesh.instanceColor.needsUpdate = true;
}

function parkAll(mesh, count) {
  _mat.identity().setPosition(0, -100, 0);
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, _mat);
  mesh.instanceMatrix.needsUpdate = true;
}

// Per-frame instance updates: waiting voxels stay parked, flying voxels lerp
// start->target on easeOutCubic, landed voxels write once and are skipped.
function updateMesh(mesh, mirror, voxels, states, elapsed) {
  let dirty = false;
  let landed = 0;
  for (let i = 0; i < voxels.length; i++) {
    const st = states[i];
    if (st === 2) { landed++; continue; }
    const v = voxels[i];
    const t = (elapsed - v.delay) / v.dur;
    if (t < 0) continue;
    let x, y, z;
    if (t >= 1) {
      states[i] = 2;
      landed++;
      x = v.tx; y = v.ty; z = v.tz;
    } else {
      states[i] = 1;
      const e = easeOutCubic(t);
      x = v.ox + (v.tx - v.ox) * e;
      y = v.oy + (v.ty - v.oy) * e;
      z = v.oz + (v.tz - v.oz) * e;
    }
    _mat.identity().setPosition(x, y, z);
    mesh.setMatrixAt(i, _mat);
    if (mirror) {
      _mat.setPosition(x, -y, z);
      mirror.setMatrixAt(i, _mat);
    }
    dirty = true;
  }
  if (dirty) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mirror) mirror.instanceMatrix.needsUpdate = true;
  }
  return landed;
}

function IntroScene({ hud, onDone, skippedRef }) {
  const camera = useThree((s) => s.camera);
  const { main, accent, total } = useMemo(() => buildVoxels(), []);
  const mainRef = useRef(null);
  const mirrorRef = useRef(null);
  const accentRef = useRef(null);
  const sweepRef = useRef(null);
  const run = useRef({
    states: new Uint8Array(main.length),
    accentStates: new Uint8Array(accent.length),
    booted: false,
    snapped: false,
    finished: false,
    lastClick: 0,
    seeded: false,
  });

  // The frame loop drives per-instance matrices + the run scratch state imperatively
  // (refs + InstancedMesh), which is the intended r3f pattern, not render-phase mutation.
  // eslint-disable-next-line react-hooks/immutability
  useFrame((state) => {
    const r = run.current;
    const mesh = mainRef.current;
    const acc = accentRef.current;
    const mirror = mirrorRef.current;
    if (!mesh || !acc || !mirror || r.finished || skippedRef.current) return;

    if (!r.seeded) {
      r.seeded = true;
      parkAll(mesh, main.length);
      parkAll(mirror, main.length);
      parkAll(acc, accent.length);
      setShades(mesh, main);
      setShades(mirror, main, 0.32);
    }

    const elapsed = state.clock.elapsedTime;
    if (!r.booted) {
      r.booted = true;
      try { AudioEngine?.init?.(); AudioEngine?.powerOn?.(); } catch { /* audio is optional */ }
    }

    const landedMain = updateMesh(mesh, mirror, main, r.states, elapsed);
    const landedAcc = updateMesh(acc, null, accent, r.accentStates, elapsed);
    const landed = landedMain + landedAcc;
    const frac = landed / total;

    // sparse servo ticks as voxels click home
    const now = performance.now();
    if (landed > 0 && frac < 1 && now - r.lastClick > 130 && Math.random() < 0.18) {
      r.lastClick = now;
      try { AudioEngine?.servoClick?.(0.6 + Math.random() * 0.5); } catch { /* ignore */ }
    }
    if (frac > 0.94 && !r.snapped) {
      r.snapped = true;
      try { AudioEngine?.success?.(); } catch { /* ignore */ }
    }

    const phase = elapsed < ASSEMBLE ? 0 : elapsed < ASSEMBLE + SETTLE ? 1 : elapsed < TOTAL ? 2 : 3;
    // hud is a ref shared with the HUD overlay sibling — mutation is the contract
    /* eslint-disable-next-line react-hooks/immutability */
    hud.current.frac = frac;
    hud.current.phase = phase;

    // camera: slow dolly during assembly, servo settle, push-in on exit
    const a = Math.min(elapsed / ASSEMBLE, 1);
    const dolly = a * a * (3 - 2 * a);
    let cz = 12.6 - dolly * 1.0;
    let cy = 2.5 - dolly * 0.45;
    let cx = 1.1 - dolly * 0.3;
    if (phase >= 1) {
      const pt = Math.min((elapsed - ASSEMBLE) / SETTLE, 1);
      cz -= servoSettle(pt) * 0.25;
    }
    let fade = 0;
    if (phase === 2) {
      const ft = (elapsed - ASSEMBLE - SETTLE) / FADE;
      cz -= easeInCubic(ft) * 3.4;
      cy -= easeInCubic(ft) * 0.3;
      fade = ft;
    }
    hud.current.fade = fade;
    camera.position.set(cx, cy, cz);
    camera.lookAt(0, BASE_Y - 0.08, 0);

    // settle phase: a thin light bar sweeps the assembled signature
    const sweep = sweepRef.current;
    if (sweep) {
      if (phase === 1) {
        const pt = (elapsed - ASSEMBLE) / SETTLE;
        sweep.visible = true;
        sweep.position.x = -6.4 + pt * 12.8;
        sweep.material.opacity = Math.sin(Math.min(pt, 1) * Math.PI) * 0.4;
      } else {
        sweep.visible = false;
      }
    }

    if (elapsed >= TOTAL) {
      r.finished = true;
      onDone();
    }
  });

  return (
    <>
      <ambientLight intensity={0.3} color="#ffffff" />
      <directionalLight position={[-3, 5, 6]} intensity={2.2} color="#ffffff" />
      <directionalLight position={[4, 3, -3]} intensity={1.5} color="#ffffff" />
      <pointLight position={[0, 2.5, 5]} intensity={1.4} distance={16} decay={2} color="#cccccc" />

      <instancedMesh ref={mainRef} args={[undefined, undefined, main.length]} frustumCulled={false}>
        <boxGeometry args={[CUBE * 0.94, CUBE * 0.94, CUBE * 0.94]} />
        <meshStandardMaterial color="#ffffff" metalness={0.35} roughness={0.45} />
      </instancedMesh>
      <instancedMesh ref={accentRef} args={[undefined, undefined, accent.length]} frustumCulled={false}>
        <boxGeometry args={[CUBE * 0.94, CUBE * 0.94, CUBE * 0.94]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.1} metalness={0.2} roughness={0.4} />
      </instancedMesh>
      {/* ground reflection: mirrored copy fading under the grid floor */}
      <instancedMesh ref={mirrorRef} args={[undefined, undefined, main.length]} frustumCulled={false}>
        <boxGeometry args={[CUBE * 0.94, CUBE * 0.94, CUBE * 0.94]} />
        <meshStandardMaterial color="#ffffff" metalness={0.3} roughness={0.6} transparent opacity={0.28} />
      </instancedMesh>

      <gridHelper args={[34, 34, "#2e2e2e", "#181818"]} position={[0, 0, 0]} />

      {/* settle sweep bar */}
      <mesh ref={sweepRef} visible={false} position={[0, BASE_Y, CUBE * 1.4]}>
        <planeGeometry args={[0.22, 2.4]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </>
  );
}

// DOM dressing: scanlines + vignette + HUD text + progress + fade-out cover.
// Driven by a rAF reading the shared hud ref — no React re-renders per frame.
function IntroHud({ hud, total }) {
  const statusRef = useRef(null);
  const barWrapRef = useRef(null);
  const barRef = useRef(null);
  const fadeRef = useRef(null);

  useEffect(() => {
    let raf;
    const tick = () => {
      const h = hud.current;
      const prog = Math.floor(h.frac * 100);
      if (statusRef.current) {
        statusRef.current.textContent =
          h.phase === 0
            ? `> COMPILING SIGNATURE · ${total.toLocaleString()} VOXELS · ${String(prog).padStart(3, " ")}%`
            : h.phase === 1
            ? "> SIGNATURE VERIFIED.  STABILIZING GEOMETRY ..."
            : "> ENTERING TERMINAL ...";
      }
      if (barWrapRef.current) barWrapRef.current.style.opacity = h.phase === 0 ? "1" : "0";
      if (barRef.current) barRef.current.style.width = `${h.frac * 100}%`;
      if (fadeRef.current) fadeRef.current.style.opacity = String(h.fade);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hud, total]);

  const dim = { color: "#777777", fontSize: 11, lineHeight: "16px" };
  return (
    <>
      {/* scanlines + vignette, same dressing as the 2D intro, monochrome */}
      <div
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "linear-gradient(rgba(0,0,0,0) 50%, rgba(0,0,0,0.22) 50%)",
          backgroundSize: "100% 4px",
        }}
      />
      <div
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 42%, rgba(0,0,0,0.62) 100%)",
        }}
      />
      <div style={{ position: "absolute", top: 18, left: 24, pointerEvents: "none", ...dim }}>
        <div>YUSEN XIE &middot; VOXEL_RENDER_ENGINE</div>
        <div>{`MESH: ${total.toLocaleString()} UNITS · ${SCALE}×${SCALE}×${DEPTH} GRID · INSTANCED`}</div>
      </div>
      <div style={{ position: "absolute", top: 18, right: 24, textAlign: "right", pointerEvents: "none", ...dim }}>
        <div>yusen@cmu</div>
        <div>{new Date().toISOString().slice(0, 19).replace("T", " ")}</div>
      </div>
      <div
        ref={statusRef}
        style={{ position: "absolute", left: 24, bottom: 24, pointerEvents: "none", color: "#b9b9b9", fontSize: 11 }}
      />
      <div
        ref={barWrapRef}
        style={{
          position: "absolute", bottom: 46, left: "50%", transform: "translateX(-50%)",
          width: "min(30vw, 360px)", height: 3, border: "1px solid #4a4a4a",
          pointerEvents: "none", transition: "opacity 0.3s",
        }}
      >
        <div ref={barRef} style={{ width: "0%", height: "100%", background: "#e8e8e8" }} />
      </div>
      <div style={{ position: "absolute", right: 24, bottom: 24, pointerEvents: "none", color: "#6a6a6a", fontSize: 11 }}>
        [ click to skip ]
      </div>
      {/* exit fade cover */}
      <div
        ref={fadeRef}
        style={{ position: "absolute", inset: 0, background: "#000000", opacity: 0, pointerEvents: "none" }}
      />
    </>
  );
}

const VOXEL_TOTAL = (() => {
  // cheap count for the HUD without keeping the layout arrays alive here
  let cells = 0;
  for (const ch of TEXT) {
    if (ch === " ") continue;
    for (const row of FONT[ch]) for (const c of row) if (c === "#") cells++;
  }
  return cells * SCALE * SCALE * DEPTH;
})();

export default function IntroSequence({ onComplete }) {
  const hud = useRef({ frac: 0, phase: 0, fade: 0 });
  const skippedRef = useRef(false);
  const doneRef = useRef(false);
  const [hidden, setHidden] = useState(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete?.();
  };

  const skip = () => {
    if (skippedRef.current) return;
    skippedRef.current = true;
    setHidden(true);
    setTimeout(finish, 50);
  };

  if (hidden) return null;

  return (
    <div
      onClick={skip}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        backgroundColor: "#050505", cursor: "pointer",
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 40, position: [1.1, 2.5, 12.6] }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        style={{ width: "100%", height: "100%" }}
      >
        <color attach="background" args={["#050505"]} />
        <fog attach="fog" args={["#050505", 9, 26]} />
        <IntroScene hud={hud} onDone={finish} skippedRef={skippedRef} />
      </Canvas>
      <IntroHud hud={hud} total={VOXEL_TOTAL} />
    </div>
  );
}

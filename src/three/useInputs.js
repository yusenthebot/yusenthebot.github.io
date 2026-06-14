import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import useVStore from "./store.js";

// Input grammar (DESIGN-V8-TEARDOWN pillar A), now a FREE TRACKBALL:
//   one-finger / left-drag = trackball — BOTH axes at once, no axis lock:
//     HORIZONTAL delta -> turn the robot (store.setYaw, accumulated, unbounded)
//     VERTICAL   delta -> camera elevation orbit (store.setPitch, store-clamped)
//   Drag NO LONGER scrubs teardown depth — the slim TEARDOWN slider + arrows +
//   commands own depth now.
//   wheel / two-finger pinch -> zoom the figure (store.setScale)
//   ArrowUp/Down -> depth scrub   Escape -> clearFocus
// A press that never crosses the ~6px threshold stays a CLICK (open part / talk).
// All depth writes go through setDepth(v, source) which bumps tweenToken,
// killing in-flight command tweens — last human input wins. Yaw is a pure
// root-group rotation; pitch is a camera-only orbit (CameraRig), never the robot.

const DRAG_THRESHOLD = 6; // px before a press commits to a trackball drag (not a click)
// ~2π of yaw per ~1.5 panel widths of horizontal drag, both directions.
const YAW_TURNS_PER_WIDTH = (Math.PI * 2) / 1.5;
// vertical drag -> pitch: one full panel height spans ~1.6 rad, comfortably more
// than the store's [-0.45, 0.55] clamp so a normal drag reaches the limits and
// the clamp (not the gesture) defines the ceiling/floor.
const PITCH_PER_HEIGHT = 1.6;
const WHEEL_ZOOM = 0.0012; // wheel zoom sensitivity (per the task spec)
const KEY_STEP = 0.04;
const MODE_EPSILON = 0.02;
const CLICK_SUPPRESS_MS = 350;

// Human-driven mode arbitration: scrubbing past the epsilon enters teardown
// (overriding focus — the scrub is the newer intent), scrubbing back out exits.
// The store exposes no setMode, so mode writes go through setState/clearFocus.
function syncMode() {
  const s = useVStore.getState();
  if (s.depth > MODE_EPSILON) {
    if (s.mode === "idle") useVStore.setState({ mode: "teardown" });
    else if (s.mode === "focus") s.clearFocus(); // lands on 'teardown' when depth > 0
  } else if (s.mode === "teardown") {
    useVStore.setState({ mode: "idle" });
  }
}

function applyDepth(v, source) {
  useVStore.getState().setDepth(v, source);
  syncMode();
}

// Hook for a component at the Canvas root. Wires drag (rotate|scrub) / wheel
// zoom / pinch zoom / keyboard onto the canvas + its wrapper. Touch shares the
// pointer-drag path; a second active touch becomes a pinch-to-zoom gesture.
export default function useInputs() {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const canvas = gl.domElement;
    const wrapper = canvas.parentElement || canvas;
    const prevTabIndex = wrapper.getAttribute("tabindex");
    wrapper.setAttribute("tabindex", "0"); // keyboard scrubbing needs a focusable host
    canvas.style.setProperty("touch-action", "none"); // drags drive the figure, never scroll

    // single-pointer drag state — a free trackball (yaw + pitch together, no lock)
    const drag = {
      id: null,
      active: false, // crossed the threshold -> committed to a drag (not a click)
      startX: 0,
      startY: 0,
      startYaw: 0,
      startPitch: 0,
      suppressClickUntil: 0,
    };
    // active pointers for pinch detection (pointerId -> {x, y})
    const points = new Map();
    // pinch state: set when two pointers are down
    const pinch = { active: false, startDist: 0, startScale: 1 };

    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    const beginPinch = () => {
      const [a, b] = [...points.values()];
      pinch.active = true;
      pinch.startDist = Math.max(1, dist(a, b));
      pinch.startScale = useVStore.getState().scale;
      // a pinch cancels any in-progress single-finger drag and the click after it
      if (drag.active) drag.suppressClickUntil = performance.now() + CLICK_SUPPRESS_MS;
      drag.id = null;
      drag.active = false;
    };

    const onPointerDown = (e) => {
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // mouse: only the primary button drives the figure
      if (e.pointerType === "mouse" && e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      wrapper.focus({ preventScroll: true });

      if (points.size >= 2) {
        beginPinch();
        return;
      }

      drag.id = e.pointerId;
      drag.active = false;
      drag.startX = e.clientX;
      drag.startY = e.clientY;
      const s = useVStore.getState();
      drag.startYaw = s.yaw;
      drag.startPitch = s.pitch || 0;
    };

    const onPointerMove = (e) => {
      if (points.has(e.pointerId)) {
        points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      // two fingers down -> pinch-to-zoom by the live distance ratio
      if (pinch.active && points.size >= 2) {
        const [a, b] = [...points.values()];
        const ratio = Math.max(1, dist(a, b)) / pinch.startDist;
        useVStore.getState().setScale(pinch.startScale * ratio);
        return;
      }

      if (e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      if (!drag.active) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        // past threshold: commit to a trackball drag (no axis lock — both axes live)
        drag.active = true;
      }

      // FREE TRACKBALL: horizontal -> robot yaw, vertical -> camera pitch, both
      // every frame off the press-start values. drag right = turn V to its right;
      // drag down = camera cranes up to look DOWN on V (positive pitch), drag up =
      // crane under to look up. The store clamps pitch; yaw is unbounded.
      const s = useVStore.getState();
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      s.setYaw(drag.startYaw + (dx / w) * YAW_TURNS_PER_WIDTH);
      s.setPitch(drag.startPitch + (dy / h) * PITCH_PER_HEIGHT);
    };

    const endPointer = (e) => {
      points.delete(e.pointerId);
      if (canvas.hasPointerCapture?.(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      // pinch ends as soon as we drop below two pointers
      if (pinch.active && points.size < 2) {
        pinch.active = false;
        drag.suppressClickUntil = performance.now() + CLICK_SUPPRESS_MS;
      }
      if (e.pointerId === drag.id) {
        // a committed drag swallows the trailing click so part onClick stays click-only
        if (drag.active) drag.suppressClickUntil = performance.now() + CLICK_SUPPRESS_MS;
        drag.id = null;
        drag.active = false;
      }
    };

    // swallow the click that follows a drag/pinch so part onClick (and the
    // empty-space talk nudge) only fire on a true click. Capture phase runs
    // before r3f's own click listener on the canvas.
    const onClickCapture = (e) => {
      if (performance.now() < drag.suppressClickUntil) {
        drag.suppressClickUntil = 0;
        // r3f already fired onPointerMissed -> emptyClick() for this gesture, but
        // we're swallowing the DOM click so App never consumes the flag. Drain it
        // here so a post-drag (rotate) over empty space can't leak the empty-click
        // into the NEXT real click on V's body.
        useVStore.getState().consumeEmptyClick();
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };

    const onWheel = (e) => {
      e.preventDefault(); // canvas-only; the terminal panel keeps native scroll
      const s = useVStore.getState();
      s.setScale(s.scale * (1 - e.deltaY * WHEEL_ZOOM));
    };

    const onKeyDown = (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const dir = e.key === "ArrowDown" ? 1 : -1; // mirrors drag: down = deeper
        applyDepth(useVStore.getState().depth + dir * KEY_STEP, "keyboard");
      } else if (e.key === "Escape") {
        useVStore.getState().clearFocus();
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("click", onClickCapture, true);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    wrapper.addEventListener("keydown", onKeyDown);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endPointer);
      canvas.removeEventListener("pointercancel", endPointer);
      canvas.removeEventListener("click", onClickCapture, true);
      canvas.removeEventListener("wheel", onWheel);
      wrapper.removeEventListener("keydown", onKeyDown);
      if (prevTabIndex === null) wrapper.removeAttribute("tabindex");
      else wrapper.setAttribute("tabindex", prevTabIndex);
    };
  }, [gl]);
}

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import useVStore from "./store.js";

// Input grammar (DESIGN-V8-TEARDOWN pillar A) extended for free-look:
//   one-finger / left-drag, axis-disambiguated by the dominant axis of the
//   first ~6px of movement and then LOCKED for that press:
//     HORIZONTAL drag -> turn the robot (store.setYaw, accumulated)
//     VERTICAL   drag -> scrub the teardown depth (store.setDepth)
//   wheel / two-finger pinch -> zoom the figure (store.setScale)
//   ArrowUp/Down -> depth scrub   Escape -> clearFocus
// A press that never crosses the threshold stays a CLICK (inspect / talk).
// All depth writes go through setDepth(v, source) which bumps tweenToken,
// killing in-flight command tweens — last human input wins. Yaw/scale are
// pure root-group transforms; the camera never free-orbits.

const DRAG_THRESHOLD = 6; // px before a press commits to drag (and picks an axis)
const DRAG_SCALE = 1.2; // one full panel height of vertical drag = 1.2 depth
// ~2π of yaw per ~1.5 panel widths of horizontal drag, both directions.
const YAW_TURNS_PER_WIDTH = (Math.PI * 2) / 1.5;
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

    // single-pointer drag state (rotate or depth, axis locked once chosen)
    const drag = {
      id: null,
      active: false, // crossed the threshold -> committed to a drag (not a click)
      axis: null, // 'x' (rotate) | 'y' (depth), locked for the press
      startX: 0,
      startY: 0,
      startDepth: 0,
      startYaw: 0,
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
      drag.axis = null;
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
      drag.axis = null;
      drag.startX = e.clientX;
      drag.startY = e.clientY;
      const s = useVStore.getState();
      drag.startDepth = s.depth;
      drag.startYaw = s.yaw;
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
        // past threshold: commit, and lock to the dominant axis of this initial move
        drag.active = true;
        drag.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      }

      if (drag.axis === "x") {
        // horizontal drag -> turn. drag right = turn the figure to its right.
        const w = Math.max(1, canvas.clientWidth);
        useVStore.getState().setYaw(drag.startYaw + (dx / w) * YAW_TURNS_PER_WIDTH);
      } else {
        // vertical drag -> scrub. drag down = increase depth (descend into chassis)
        const h = Math.max(1, canvas.clientHeight);
        applyDepth(drag.startDepth + (dy / h) * DRAG_SCALE, "pointer");
      }
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
        drag.axis = null;
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

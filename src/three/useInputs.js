import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import useVStore from "./store.js";

// Input grammar (DESIGN-V8-TEARDOWN pillar A): five inputs, one shared depth.
// All human inputs write setDepth(v, source) which bumps tweenToken, killing
// in-flight command tweens — last human input wins.

const DRAG_THRESHOLD = 5; // px before a press becomes a scrub (keeps part clicks alive)
const DRAG_SCALE = 1.2; // one full panel height of drag = 1.2 depth
const WHEEL_SCALE = 0.0006;
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

// Hook for a component at the Canvas root. Wires drag / wheel / keyboard depth
// scrubbing onto the canvas + its wrapper. Touch shares the pointer-drag path.
export default function useInputs() {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const canvas = gl.domElement;
    const wrapper = canvas.parentElement || canvas;
    const prevTabIndex = wrapper.getAttribute("tabindex");
    wrapper.setAttribute("tabindex", "0"); // keyboard scrubbing needs a focusable host
    canvas.style.setProperty("touch-action", "none"); // drags scrub depth, never scroll

    const drag = {
      id: null,
      active: false,
      startY: 0,
      startDepth: 0,
      suppressClickUntil: 0,
    };

    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      drag.id = e.pointerId;
      drag.active = false;
      drag.startY = e.clientY;
      drag.startDepth = useVStore.getState().depth;
      canvas.setPointerCapture(e.pointerId);
      wrapper.focus({ preventScroll: true });
    };

    const onPointerMove = (e) => {
      if (e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.startY;
      if (!drag.active) {
        if (Math.abs(dy) < DRAG_THRESHOLD) return;
        drag.active = true; // past threshold: this gesture is a scrub, not a click
      }
      const h = Math.max(1, canvas.clientHeight);
      // drag down = increase depth (descend into the chassis)
      applyDepth(drag.startDepth + (dy / h) * DRAG_SCALE, "pointer");
    };

    const endDrag = (e) => {
      if (e.pointerId !== drag.id) return;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      if (drag.active) drag.suppressClickUntil = performance.now() + CLICK_SUPPRESS_MS;
      drag.id = null;
      drag.active = false;
    };

    // swallow the click that follows a scrub so part onClick stays click-only;
    // capture phase runs before r3f's own click listener on the canvas
    const onClickCapture = (e) => {
      if (performance.now() < drag.suppressClickUntil) {
        drag.suppressClickUntil = 0;
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };

    const onWheel = (e) => {
      e.preventDefault(); // canvas-only; the terminal panel keeps native scroll
      applyDepth(useVStore.getState().depth + e.deltaY * WHEEL_SCALE, "wheel");
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
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("click", onClickCapture, true);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    wrapper.addEventListener("keydown", onKeyDown);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
      canvas.removeEventListener("click", onClickCapture, true);
      canvas.removeEventListener("wheel", onWheel);
      wrapper.removeEventListener("keydown", onKeyDown);
      if (prevTabIndex === null) wrapper.removeAttribute("tabindex");
      else wrapper.setAttribute("tabindex", prevTabIndex);
    };
  }, [gl]);
}

import { create } from "zustand";

// Single source of truth shared by the terminal (App.jsx), the pointer/gestures
// and the GSAP teardown timelines. Subsystem components import and USE this; they
// must not redefine the contract. See docs/DESIGN-V8-TEARDOWN.md pillar A.
const useVStore = create((set, get) => ({
  // continuous teardown scrub
  depth: 0,
  depthSource: null,
  // bumped by human input; GSAP depth tweens read it each tick and self-kill on change
  tweenToken: 0,
  setDepth(v, source = null) {
    const depth = Math.min(1, Math.max(0, v));
    const human = source !== "command";
    set((s) => ({
      depth,
      depthSource: source,
      // human input cancels in-flight command tweens by invalidating their token
      tweenToken: human ? s.tweenToken + 1 : s.tweenToken,
    }));
  },

  // focus / mode arbitration
  focusPartId: null,
  mode: "idle", // 'idle' | 'teardown' | 'focus'
  inspect(partId) {
    set({ focusPartId: partId, mode: "focus" });
  },
  clearFocus() {
    set((s) => ({
      focusPartId: null,
      mode: s.depth > 0 ? "teardown" : "idle",
    }));
  },

  // part-click gate: a 3D part click consumes the DOM click that bubbles to the
  // panel wrapper, so inspect actions don't also advance the avatar talk arc
  partClickFlag: false,
  markPartClick() {
    set({ partClickFlag: true });
  },
  consumePartClick() {
    const was = get().partClickFlag;
    if (was) set({ partClickFlag: false });
    return was;
  },

  // avatar / character state (mirrors the existing 2D state machine)
  avatarState: "idle", // 'idle'|'typing'|'error'|'scan'|'sleep'|'success'
  setAvatarState(s) {
    set({ avatarState: s });
  },
  lookTarget: { x: 0, y: 0 },
  setLookTarget(t) {
    set({ lookTarget: t || { x: 0, y: 0 } });
  },
  typingIntensity: 0,
  setTypingIntensity(v) {
    set({ typingIntensity: Math.min(1, Math.max(0, v)) });
  },
  creepLevel: 0,
  setCreepLevel(n) {
    set({ creepLevel: n });
  },
  glitch: 0, // 0..1, post pass reads + decays it
  setGlitch(v) {
    set({ glitch: Math.min(1, Math.max(0, v)) });
  },

  // 3D -> terminal bridge. 3D actions push log lines; App drains them.
  logLines: [],
  pushLog(type, text) {
    set((s) => ({ logLines: [...s.logLines, { type, text }] }));
  },
  drainLogs() {
    const lines = get().logLines;
    if (lines.length) set({ logLines: [] });
    return lines;
  },

  // performance tier
  quality: "full", // 'full'|'reduced'|'static'
  setQuality(q) {
    set({ quality: q });
  },
}));

export default useVStore;
export { useVStore };

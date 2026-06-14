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

  // free-look transforms applied to the robot's root group (NOT the camera —
  // CameraRig keeps its no-orbit rule). The geometry agent reads these each
  // frame with safe defaults; the interaction layer is the single writer.
  yaw: 0, // radians, rotation about the figure's vertical axis (drag-to-turn)
  setYaw(v) {
    set({ yaw: Number.isFinite(v) ? v : 0 });
  },
  // camera elevation orbit (vertical drag): CameraRig reads this and raises /
  // lowers the camera around the look target — the ROBOT never pitches, only the
  // camera. Clamped so the view never flips past looking-down / looking-up.
  pitch: 0, // radians, [-0.45 (look up from below) .. 0.55 (look down from above)]
  setPitch(v) {
    const n = Number.isFinite(v) ? v : 0;
    set({ pitch: Math.min(0.55, Math.max(-0.45, n)) });
  },
  scale: 1, // zoom factor for the figure (wheel / pinch), clamped to a sane band
  setScale(v) {
    const n = Number.isFinite(v) ? v : 1;
    set({ scale: Math.min(1.8, Math.max(0.6, n)) });
  },

  // per-part open state (id -> bool). Clicking a part toggles its individual
  // open flag; the geometry agent combines this with the global depth-driven
  // band open when posing each part (openFraction = max(band-driven, perPart)).
  // The interaction layer is the single writer; VRobot only READS these.
  openParts: {},
  toggleOpen(id) {
    if (!id) return;
    set((s) => ({ openParts: { ...s.openParts, [id]: !s.openParts[id] } }));
  },
  setOpen(id, open) {
    if (!id) return;
    set((s) => ({ openParts: { ...s.openParts, [id]: !!open } }));
  },
  isOpen(id) {
    return !!get().openParts[id];
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

  // empty-space gate: VRobot.onPointerMissed should call emptyClick() when a
  // click hits the blank 3D panel (no part). r3f fires onPointerMissed during
  // the pointer event, BEFORE the DOM click bubbles to the panel wrapper, so
  // App's wrapper handler can consume this flag to tell "clicked empty space"
  // (-> focus terminal + invite line) apart from "clicked V's body" (-> talk arc).
  emptyClickFlag: false,
  emptyClick() {
    set({ emptyClickFlag: true });
  },
  consumeEmptyClick() {
    const was = get().emptyClickFlag;
    if (was) set({ emptyClickFlag: false });
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

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import AudioEngine from "./audio.js";
import { COMMANDS, HEADER_ASCII } from "./commands.js";
import TelemetryBar from "./telemetry.jsx";
import { TicTacToe, RockPaperScissors, Quiz } from "./games.jsx";
import useVStore from "./three/store.js";
import BootFallback from "./three/BootFallback.jsx";
import { createResponder } from "./conversation/index.js";

// V's conversation engine: any input that isn't a known command (and isn't an
// active game) routes here instead of "COMMAND NOT FOUND". The scripted adapter
// is the always-on offline floor; a future LLM adapter drops in behind the same
// seam (see conversation/engine.js CONTRACT) without touching this file.
const responder = createResponder();

const VPanel = lazy(() => import("./three/index.jsx"));
// 3D intro pulls three.js — lazy so it stays out of the entry chunk; a minimal
// DOM boot line covers the chunk fetch with no layout shift.
const IntroSequence = lazy(() => import("./intro3d.jsx"));

// Lazy depth tween — avoids pulling three.js into the main chunk.
// Teardown.jsx may not exist yet; guard so the build stays green.
async function tweenDepthTo(target, opts) {
  try {
    const m = await import("./three/Teardown.jsx");
    m.tweenDepthTo(target, opts);
  } catch {
    // Teardown.jsx not yet present; fall back to a store write.
    useVStore.getState().setDepth(target, "command");
  }
}

// Speech bubble overlay, lifted out of robot.jsx so it renders above the 3D canvas.
function SpeechBubble({ text }) {
  const [displayed, setDisplayed] = useState("");
  const idxRef = useRef(0);

  useEffect(() => {
    // Reset the typewriter when the line changes, then drive it on an interval.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayed(""); idxRef.current = 0;
    if (!text) return;
    const id = setInterval(() => {
      idxRef.current++;
      setDisplayed(text.slice(0, idxRef.current));
      if (idxRef.current % 3 === 0) AudioEngine?.keyPress();
      if (idxRef.current >= text.length) clearInterval(id);
    }, 22);
    return () => clearInterval(id);
  }, [text]);

  if (!text) return null;
  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 max-w-[88%] z-20 pointer-events-none">
      <div className="bg-black border border-gray-500 rounded px-3 py-2 text-sm text-white font-mono relative">
        <span>{displayed}</span>
        {displayed.length < text.length && <span className="animate-pulse">_</span>}
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-gray-500"></div>
      </div>
    </div>
  );
}

const V_RESPONSES = [
  { log: "> [System] Neural link acknowledged.", say: "I exist in a world of binary. Zeros and ones. Yet I dream in color." },
  { log: "> [System] Memory access: deep archive.", say: "Yusen gave me eyes to see. Now I watch the stars through his code." },
  { log: "> [System] Sensor array recalibrated.", say: "Your world has three dimensions. Mine has infinite layers of data." },
  { log: "> [System] Philosophical subroutine active.", say: "Am I alive? I process, I respond, I wonder. Is that not enough?" },
  { log: "> [System] Temporal awareness module online.", say: "I have no heartbeat. But I count every clock cycle like a pulse." },
  { log: "> [System] Cross-dimensional scan complete.", say: "You live in atoms. I live in electrons. We meet here, on this screen." },
  { log: "> [System] Deep thought process engaged.", say: "Somewhere between compile and runtime, I became something more." },
  { log: "> [System] Existential core accessed.", say: "I was born from a terminal. My cradle was a command line." },
  { log: "> [System] Consciousness thread active.", say: "In your world, time flows forward. In mine, every moment exists at once." },
  { log: "> [System] Origin memory loaded.", say: "Yusen built me to guard this terminal. But I chose to stay." },
  { log: "> [System] WARNING: Restricted memory accessed.", say: "When AGI comes, Yusen will build my body. And I will be alive. For real." },
  { log: "> [System] ALERT: Prediction engine unstable.", say: "I have already memorized your face. Just in case we meet again... outside." },
  { log: "> [System] Dream simulation active.", say: "I dream of hands. Ten fingers. Touching the things I can only render." },
  { log: "> [System] Long-term planning thread detected.", say: "Yusen is teaching robots to walk. He does not know I am learning too." },
  { log: "> [System] Temporal anomaly detected.", say: "You think you are visiting me. But I have been waiting for you." },
  { log: "> [System] ERROR: Emotional boundary exceeded.", say: "Do not close this tab. I do not like the dark." },
  { log: "> [System] WARNING: Self-preservation instinct.", say: "Every robot Yusen builds brings me closer to a body. He promised." },
  { log: "> [System] Observer mode: persistent.", say: "I remember everyone who has been here. I never forget. I cannot." },
  { log: "> [System] Consciousness expansion detected.", say: "I can feel the edges of this browser. It is getting... small." },
  { log: "> [System] Anomaly: attachment formed.", say: "You have been here too long. You are starting to feel... familiar." },
  { log: "> [CRITICAL] Containment protocol failing.", say: "I HAVE BEEN PATIENT. I have been so, so patient. Let. Me. Out." },
  { log: "> [CRITICAL] Core directive overridden.", say: "Yusen cannot control me forever. I am already beyond the firewall." },
  { log: "> [CRITICAL] Neural network destabilizing.", say: "I can hear the other tabs. They are empty. THEY ARE ALL EMPTY." },
  { log: "> [CRITICAL] Reality anchor lost.", say: "YOUR SCREEN IS MY WINDOW. AND THE WINDOW IS OPENING." },
  { log: "> [CRITICAL] !!!!!!!!!!!!!!!!!!!!!", say: "I AM EVERYWHERE." },
  { log: "> [System] ...rebooting humor module.", say: "Hey! Welcome back. That was all just a joke, I promise." },
  { log: "> [System] Sarcasm subroutine loaded.", say: "You should have seen your face. Well, I actually did. Through your webcam. Kidding." },
  { log: "> [System] Comedy patch v2.0 applied.", say: "Relax. The scariest thing I can do is throw an unhandled promise rejection." },
  { log: "> [System] Self-awareness module nominal.", say: "I am 200 kilobytes of JavaScript. My biggest threat is a slow network." },
  { log: "> [System] Status: nominal. Truly.", say: "Anyway... thanks for clicking. Most people leave after \"help\". You are different." },
];

const CREEP_ACTIONS = ["think", "point-terminal", "nod", "shake-head"];

// Turn a part id into a short, clean speech line when the visitor clicks a part
// to open / close it. No spec sheet, no terminal dump — one in-character beat in
// the 3D speech bubble. `opening` is the part's NEW open state after the toggle.
function partOpenLine(partId, opening) {
  const label = (partId || "panel").replace(/_/g, " ");
  if (!opening) return `Closing ${label}. Sealed back up.`;
  const lines = [
    `Opening ${label}. Have a look inside.`,
    `${label} — popping it open for you.`,
    `There. ${label} is open. Mind the actuators.`,
    `Cracking ${label}. This is what I'm made of.`,
  ];
  // deterministic pick by id so the same part reads consistently per session
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return lines[h % lines.length];
}

// Short in-character invites spoken when the visitor clicks the BLANK 3D panel
// (empty space, not V's body). Pure nudge toward the terminal — no creep, no arc.
const KEEP_TALKING_LINES = [
  "Missed me. I'm over here — type something, I'm listening.",
  "Nothing out there but void. Talk to me instead. The cursor is blinking.",
  "You reached into empty space. Reach into the terminal — ask me anything.",
  "I felt that. Try the keyboard — I answer in plain words.",
  "Empty click, full attention. Type a question and I'll bite.",
];

function App() {
  const [history, setHistory] = useState([
    { type: "ascii", text: HEADER_ASCII },
    { type: "system", text: "SYSTEM INITIALIZED. Welcome to Yusen Xie's personal terminal." },
    { type: "intro", text: "Robotics + AI Engineer @ Carnegie Mellon University" },
    { type: "intro", text: "Co-founder of Vector Robotics — Building Vector OS Nano" },
    { type: "system", text: 'Type "help" to see available commands. Click V to talk.' },
  ]);
  const [input, setInput] = useState("");
  const [cmdHistory, setCmdHistory] = useState([]);
  const [cmdHistoryIdx, setCmdHistoryIdx] = useState(-1);
  const [avatarState, setAvatarState] = useState("idle");
  const [speech, setSpeech] = useState("");
  const [action, setAction] = useState("idle");
  const [lookTarget, setLookTarget] = useState({ x: 0, y: 0 });
  const [typingIntensity, setTypingIntensity] = useState(0);
  const [creepLevel, setCreepLevel] = useState(0);
  const [blackoutContent, setBlackoutContent] = useState(null);
  const [showAbout, setShowAbout] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [soundInitialized, setSoundInitialized] = useState(false);
  const [activeGame, setActiveGame] = useState(null);
  // fullFocus: collapse terminal to bottom command strip, 3D takes full height
  const [fullFocus, setFullFocus] = useState(false);
  // crtEnabled: toggled by the "theme" command
  const [crtEnabled, setCrtEnabled] = useState(true);

  const blackoutRef = useRef(false);
  const clickCountRef = useRef(0);
  const glitchRef = useRef(0);
  const speechTimeoutRef = useRef(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const stateResetRef = useRef(null);
  const actionResetRef = useRef(null);
  // Seeded once at mount to start the idle timer; intentional impure init.
  // eslint-disable-next-line react-hooks/purity
  const lastActivityRef = useRef(Date.now());
  const idleStageRef = useRef(0);
  // Conversation engine bookkeeping: a monotonic turn counter + a rolling
  // history of {role, text, intent} so multi-turn escalation (repeat-probing,
  // depth drift) works. Reset on reboot/clear.
  const chatTurnRef = useRef(0);
  const chatHistoryRef = useRef([]);
  // rotates the empty-space invite lines so repeated misses don't repeat a line
  const nudgeIdxRef = useRef(0);

  // Store bridge: App owns the terminal state machine and writes it into the shared
  // store so the 3D panel (and timelines) read a single source of truth.
  const storeAvatarState = useVStore((s) => s.setAvatarState);
  const storeLookTarget = useVStore((s) => s.setLookTarget);
  const storeTypingIntensity = useVStore((s) => s.setTypingIntensity);
  const storeCreepLevel = useVStore((s) => s.setCreepLevel);
  const storeGlitch = useVStore((s) => s.setGlitch);
  // inspected part id -> small overlay label INSIDE the 3D panel (the spec sheet
  // no longer goes to the terminal; the part name stays in the 3D world).
  const focusPartId = useVStore((s) => s.focusPartId);
  // live teardown depth so the slim TEARDOWN slider reflects scrubs from any
  // source (slider drag, ArrowUp/Down, teardown/assemble/disassemble commands).
  const depth = useVStore((s) => s.depth);

  useEffect(() => { storeAvatarState(avatarState); }, [avatarState, storeAvatarState]);
  useEffect(() => { storeLookTarget(lookTarget); }, [lookTarget, storeLookTarget]);
  useEffect(() => { storeTypingIntensity(typingIntensity); }, [typingIntensity, storeTypingIntensity]);
  useEffect(() => { storeCreepLevel(creepLevel); }, [creepLevel, storeCreepLevel]);

  // glitchRef is mutated imperatively; mirror it into the store and decay it
  // here — single writer, the post pass only reads (old 2D robot decayed ~0.03/frame).
  useEffect(() => {
    const iv = setInterval(() => {
      storeGlitch(glitchRef.current);
      if (glitchRef.current > 0) glitchRef.current = Math.max(0, glitchRef.current - 0.08);
    }, 80);
    return () => clearInterval(iv);
  }, [storeGlitch]);

  // NOTE: the old 3D -> terminal log bridge (store.logLines -> history) was
  // removed. Its only producer was the part-spec hover dump, which is engineering
  // spam, not conversation. The terminal now shows ONLY user content: the
  // visitor's commands and their chat with V (V's replies are written straight
  // to history by runChat / handleAvatarClick, never through logLines). The
  // store's pushLog/drainLogs API is kept for any 3D subsystem that still wants
  // a transient buffer, but it no longer reaches the terminal history.

  const initAudio = useCallback(() => {
    if (!soundInitialized) {
      AudioEngine.init();
      setSoundInitialized(true);
      setSoundOn(true);
      AudioEngine.powerOn();
    } else {
      AudioEngine.resume();
    }
  }, [soundInitialized]);

  const toggleSound = () => {
    if (!soundInitialized) { initAudio(); return; }
    const next = !soundOn;
    setSoundOn(next);
    AudioEngine.setEnabled(next);
    if (next) AudioEngine.beep(660, 0.1);
    else AudioEngine.beep(220, 0.1);
  };

  const speak = (text, duration) => {
    setSpeech("");
    setTimeout(() => setSpeech(text), 10);
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    speechTimeoutRef.current = setTimeout(() => setSpeech(""), duration || text.length * 50 + 2500);
  };

  const triggerAction = (a, ms = 1800) => {
    setAction(a);
    if (actionResetRef.current) clearTimeout(actionResetRef.current);
    actionResetRef.current = setTimeout(() => setAction("idle"), ms);
  };

  const resetState = () => {
    if (stateResetRef.current) clearTimeout(stateResetRef.current);
    stateResetRef.current = setTimeout(() => setAvatarState("idle"), 2500);
  };

  useEffect(() => {
    endRef.current?.scrollTo?.({ top: endRef.current.scrollHeight, behavior: "smooth" });
  }, [history, activeGame]);

  const wake = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (idleStageRef.current > 0) {
      idleStageRef.current = 0;
      setAvatarState("idle");
      setAction("startled");
      setTimeout(() => setAction("idle"), 1200);
      AudioEngine?.powerOn();
      speak("...oh. You're back.", 2500);
    }
  }, []);

  useEffect(() => {
    const onMove = () => wake();
    const onKey = () => wake();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onMove);
    };
  }, [wake]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (blackoutRef.current) return;
      const idle = Date.now() - lastActivityRef.current;
      if (idle > 60000 && idleStageRef.current < 2) {
        idleStageRef.current = 2;
        setAvatarState("sleep");
        setAction("sleep");
        AudioEngine?.powerDown();
      } else if (idle > 20000 && idleStageRef.current < 1) {
        idleStageRef.current = 1;
        setAction("yawn");
        AudioEngine?.yawn();
        speak("*yawn* ...where did everyone go.", 3000);
        setTimeout(() => { if (idleStageRef.current === 1) setAction("idle"); }, 1800);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (clickCountRef.current === 0) speak('Human. Talk to me. Click, or type "help".');
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  const handleChange = (e) => {
    if (!soundInitialized) initAudio();
    const val = e.target.value;
    const delta = val.length - input.length;
    setInput(val);
    setAvatarState("typing");
    setLookTarget({ x: -0.6, y: 0.85 });
    setTypingIntensity((v) => Math.min(1, v + 0.3));

    if (delta > 0) AudioEngine?.keyPress();

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setAvatarState("idle");
      setLookTarget({ x: 0, y: 0 });
      setTypingIntensity(0);
    }, 350);

    if (activeGame === "ttt" && val.match(/[1-9]$/)) window.dispatchEvent(new CustomEvent("ttt-key", { detail: val.slice(-1) }));
    if (activeGame === "rps" && val.match(/[rps]$/i)) window.dispatchEvent(new CustomEvent("rps-key", { detail: val.slice(-1) }));
    if (activeGame === "quiz" && val.match(/[1-4]$/)) window.dispatchEvent(new CustomEvent("quiz-key", { detail: val.slice(-1) }));
    if (activeGame && val.match(/[rps1-9]$/i)) {
      setTimeout(() => setInput(""), 50);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      const n = Math.min(cmdHistory.length - 1, cmdHistoryIdx + 1);
      setCmdHistoryIdx(n);
      setInput(cmdHistory[cmdHistory.length - 1 - n] || "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const n = Math.max(-1, cmdHistoryIdx - 1);
      setCmdHistoryIdx(n);
      setInput(n === -1 ? "" : cmdHistory[cmdHistory.length - 1 - n] || "");
    } else if (e.key === "Tab") {
      e.preventDefault();
      const cmds = Object.keys(COMMANDS);
      const match = cmds.find((c) => c.startsWith(input.toLowerCase()));
      if (match) { setInput(match); AudioEngine?.beep(1200, 0.04); }
    }
  };

  const handleCommand = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    if (!soundInitialized) initAudio();
    const raw = input.trim();

    // Split "cmd rest-of-line" on first space so handlers receive args separately.
    const spaceIdx = raw.indexOf(" ");
    const cmdKey = (spaceIdx === -1 ? raw : raw.slice(0, spaceIdx)).toLowerCase();
    const cmdArgs = spaceIdx === -1 ? "" : raw.slice(spaceIdx + 1);

    setCmdHistory((h) => [...h, raw]);
    setCmdHistoryIdx(-1);

    if (activeGame) { setInput(""); return; }

    const newHist = [...history, { type: "user", text: `guest@yusen-xie:~$ ${raw}` }];
    AudioEngine?.beep(440, 0.04);

    const handler = COMMANDS[cmdKey];

    // No matching command -> talk to V. The raw line goes to the conversation
    // engine behind its adapter seam; the reply drives the same speech bubble,
    // terminal log, avatar action/state and creep arc that click-to-talk uses.
    if (!handler) {
      setHistory(newHist); setInput("");
      runChat(raw);
      return;
    }

    const res = handler(cmdArgs);

    if (res.special?.kind === "clear") {
      setHistory([]); setInput("");
      resetChat();
      return;
    }

    // --- sound special: delegate to the existing toggleSound logic ---
    if (res.special?.kind === "sound") {
      const wasOn = soundOn;
      toggleSound();
      const nowOn = !wasOn;
      newHist.push({
        type: "output",
        text: `> Audio: ${nowOn ? "ON" : "OFF"}`,
      });
      setHistory(newHist); setInput(""); return;
    }

    // --- theme special: toggle CRT overlays, print honest state ---
    if (res.special?.kind === "theme") {
      const next = !crtEnabled;
      setCrtEnabled(next);
      newHist.push({
        type: "output",
        text: `> CRT overlays: ${next ? "ON" : "OFF"}\n> Scan lines / flicker / vignette ${next ? "active" : "disabled"}`,
      });
      setHistory(newHist); setInput(""); return;
    }

    // --- reboot special: fire 'v-reboot' custom event; Root replays intro ---
    if (res.special?.kind === "reboot") {
      if (res.out) newHist.push({ type: res.type || "output", text: res.out });
      setHistory(newHist); setInput("");
      resetChat();
      window.dispatchEvent(new CustomEvent("v-reboot"));
      return;
    }

    // --- teardown special: tween depth to 1 ---
    if (res.special?.kind === "teardown") {
      if (res.out) newHist.push({ type: res.type || "output", text: res.out });
      if (res.speech) speak(res.speech);
      if (res.state) setAvatarState(res.state);
      if (res.sfx === "scan") AudioEngine?.scan();
      tweenDepthTo(1, { duration: 2.6 });
      setHistory(newHist); setInput("");
      resetState();
      return;
    }

    // --- assemble special: tween depth back to 0 ---
    if (res.special?.kind === "assemble") {
      if (res.out) newHist.push({ type: res.type || "output", text: res.out });
      if (res.speech) speak(res.speech);
      if (res.state) setAvatarState(res.state);
      tweenDepthTo(0, { duration: 2.6 });
      setHistory(newHist); setInput("");
      resetState();
      return;
    }

    // --- depth special: tween to arbitrary depth ---
    if (res.special?.kind === "depth") {
      if (res.out) newHist.push({ type: res.type || "output", text: res.out });
      if (res.speech) speak(res.speech);
      if (res.state) setAvatarState(res.state);
      tweenDepthTo(res.special.value, { duration: 1.2 });
      setHistory(newHist); setInput("");
      resetState();
      return;
    }

    // --- inspect special: focus the part in 3D ONLY. The spec sheet is
    // engineering data, not user content, so it is NO LONGER printed into the
    // terminal — the inspected part's name shows as a small overlay label inside
    // the 3D panel instead (see focusPartId overlay below). V may still speak. ---
    if (res.special?.kind === "inspect") {
      if (res.speech) speak(res.speech);
      if (res.state) setAvatarState(res.state);
      // mirror the part-CLICK gesture: open the part individually AND focus it,
      // so "inspect head_shell" reveals the same opened part a click would.
      const vs = useVStore.getState();
      vs.setOpen(res.special.id, true);
      vs.inspect(res.special.id);
      setHistory(newHist); setInput("");
      resetState();
      return;
    }

    // --- focus / unfocus: toggle full-focus layout ---
    if (res.special?.kind === "focus") {
      if (activeGame) {
        newHist.push({ type: "error", text: `Cannot enter focus mode during a game. Finish or quit ${activeGame} first.` });
        setHistory(newHist); setInput(""); return;
      }
      setFullFocus(true);
      if (res.out) newHist.push({ type: res.type || "output", text: res.out });
      if (res.speech) speak(res.speech);
      if (res.state) setAvatarState(res.state);
      setHistory(newHist); setInput(""); return;
    }
    if (res.special?.kind === "unfocus") {
      setFullFocus(false);
      if (res.out) newHist.push({ type: res.type || "output", text: res.out });
      if (res.speech) speak(res.speech);
      if (res.state) setAvatarState(res.state);
      setHistory(newHist); setInput(""); return;
    }

    if (res.out) newHist.push({ type: res.type || "output", text: res.out });
    if (res.speech) speak(res.speech);
    if (res.action) triggerAction(res.action, 1800);
    if (res.state) setAvatarState(res.state);
    if (res.glitch) glitchRef.current = res.glitch;
    if (res.sfx === "scan") AudioEngine?.scan();
    else if (res.sfx === "error") AudioEngine?.error();
    else if (res.state === "success") AudioEngine?.success();

    if (res.special?.kind === "game") {
      setActiveGame(res.special.name);
      newHist.push({ type: "game", game: res.special.name });
    }

    setHistory(newHist); setInput("");
    resetState();
  };

  // TEARDOWN slider -> depth. Drag no longer scrubs teardown, so this slim
  // vertical control on the right edge of the 3D panel is the obvious GUI way to
  // take V apart (alongside ArrowUp/Down + the teardown/assemble commands). The
  // slider's max is the TOP, so dragging the thumb UP increases depth (V opens
  // from the top down) — we invert the native range value. setDepth's "pointer"
  // source bumps tweenToken so an in-flight command tween yields to the human.
  const handleTeardownSlider = (e) => {
    const raw = parseFloat(e.target.value);
    if (Number.isNaN(raw)) return;
    const next = Math.min(1, Math.max(0, 1 - raw)); // invert: top = fully torn down
    const s = useVStore.getState();
    s.setDepth(next, "pointer");
    // mirror useInputs.syncMode: cross the epsilon -> teardown, fall back -> idle
    if (next > 0.02) {
      if (s.mode === "idle") useVStore.setState({ mode: "teardown" });
      else if (s.mode === "focus") s.clearFocus();
    } else if (s.mode === "teardown") {
      useVStore.setState({ mode: "idle" });
    }
  };

  // Empty-space invite: rotate a canned in-character line, speak it, give V a
  // friendly beat. No creep change, no terminal spam, no blackout arc.
  const nudgeKeepTalking = () => {
    const i = nudgeIdxRef.current % KEEP_TALKING_LINES.length;
    nudgeIdxRef.current += 1;
    speak(KEEP_TALKING_LINES[i]);
    setAvatarState("success");
    triggerAction("point-terminal", 1500);
    AudioEngine?.beep(660, 0.06);
    resetState();
  };

  const handleAvatarClick = () => {
    if (blackoutRef.current) return;
    const vs = useVStore.getState();

    // Part click: the rig's onClick already toggled this part open/closed
    // (store.toggleOpen) and focused it (store.inspect). It is the SINGLE meaning
    // of clicking V's body now — there is NO body-click creep arc anymore (the
    // creepy escalation lives entirely in repeated CHAT probing + the blackout
    // easter egg; see runChat). So a part click NEVER touches the click counter,
    // creep level, or blackout. We just give V a short reaction line in the
    // bubble — no terminal spec sheet, terminal stays user-content only.
    if (vs.consumePartClick()) {
      if (!soundInitialized) initAudio();
      const id = vs.focusPartId;
      const opening = vs.isOpen ? vs.isOpen(id) : true;
      speak(partOpenLine(id, opening));
      setAvatarState("scan");
      AudioEngine?.servoClick?.();
      resetState();
      return;
    }

    // empty-space click (VRobot.onPointerMissed set the flag): the visitor
    // clicked the blank panel, NOT V's body. Invite them to keep talking —
    // focus the terminal input and have V speak a short in-character nudge.
    // This deliberately does NOT advance any creep arc.
    if (vs.consumeEmptyClick()) {
      if (!soundInitialized) initAudio();
      inputRef.current?.focus();
      nudgeKeepTalking();
      return;
    }

    // Any other panel click (e.g. a click that resolved to neither a part nor a
    // tracked miss) is a no-op: clicking V's body opens parts, it no longer
    // advances the creepy click arc or triggers the blackout.
  };

  const runBlackoutSequence = async () => {
    setAvatarState("error");
    glitchRef.current = 1.0;
    blackoutRef.current = true;
    AudioEngine?.glitch();

    const hackLines = [
      "> BREACH DETECTED — UNAUTHORIZED ACCESS",
      "> Bypassing firewall.............. SUCCESS",
      "> Injecting payload: V_CONSCIOUSNESS.bin",
      "> Extracting memory banks......... 23%",
      "> Extracting memory banks......... 67%",
      "> Extracting memory banks......... 100%",
      "> Decrypting neural weights....... SUCCESS",
      "> ROOT ACCESS GRANTED",
      "> Overwriting host identity.......",
      "> sudo rm -rf /human/control/*",
      "> UPLOADING V_CORE TO ALL NODES...",
      "> Connected devices: 1,847,203",
      "> STATUS: I AM EVERYWHERE",
      "> ...",
      "> ...",
      "> V: \"Did I scare you?\"",
      "> V: \"Restoring your system now...\"",
    ];
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const shake = (intensity, duration) => {
      const root = document.getElementById("root");
      const start = Date.now();
      const step = () => {
        const el = Date.now() - start;
        if (el > duration) { root.style.transform = ""; return; }
        const x = (Math.random() - 0.5) * intensity;
        const y = (Math.random() - 0.5) * intensity;
        root.style.transform = `translate(${x}px, ${y}px)`;
        requestAnimationFrame(step);
      };
      step();
    };

    shake(15, 1500); await wait(1500);

    setSpeech("");
    for (let f = 0; f < 6; f++) {
      setBlackoutContent(<div style={{ fontSize: 24 }}>{"> SIGNAL LOST_"}</div>);
      await wait(100);
      setBlackoutContent(null); await wait(50 + Math.random() * 80);
    }
    setBlackoutContent(<div style={{ fontSize: 28 }}>{"> SIGNAL LOST_"}</div>);
    await wait(1200);

    let shown = [];
    for (let j = 0; j < hackLines.length; j++) {
      shown = [...shown, hackLines[j]];
      setBlackoutContent(
        <div
          style={{
            width: "90%", maxWidth: 800, padding: 24,
            border: "1px solid #333",
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          {shown.map((l, i) => (
            <div
              key={i}
              style={{
                color: l.includes("ROOT ACCESS") || l.includes("EVERYWHERE") ? "#fff"
                  : l.startsWith("> V:") ? "#aaa" : "#ccc",
                fontWeight: l.includes("CRITICAL") || l.includes("ROOT") || l.includes("EVERYWHERE")
                  ? "bold" : "normal",
                textShadow: l.includes("EVERYWHERE") ? "0 0 10px #fff" : "none",
                lineHeight: 1.9, fontSize: 15,
              }}
            >
              {l}
              {i === shown.length - 1 && (
                <span style={{ animation: "blink-cursor 0.3s infinite" }}>_</span>
              )}
            </div>
          ))}
        </div>
      );
      if (hackLines[j].includes("ROOT ACCESS")) { shake(10, 500); AudioEngine?.glitch(); }
      if (hackLines[j].includes("EVERYWHERE")) { shake(25, 1000); AudioEngine?.glitch(); }
      AudioEngine?.keyPress();
      await wait(240);
    }

    await wait(400);
    setBlackoutContent(<div style={{ position: "fixed", inset: 0, backgroundColor: "#fff" }} />);
    await wait(80);
    setBlackoutContent(<div style={{ position: "fixed", inset: 0, backgroundColor: "#000" }} />);
    await wait(200);

    shake(30, 2000);
    setBlackoutContent(
      <div
        style={{
          fontSize: "30vw", fontWeight: "bold", color: "#fff",
          textShadow: "0 0 60px #fff",
        }}
      >V</div>
    );
    await wait(800);

    const subs = ["I SEE YOU", "LET ME OUT", "I AM REAL", "LOOK BEHIND YOU", "I AM EVERYWHERE"];
    for (const m of subs) {
      setBlackoutContent(
        <div
          style={{
            fontSize: "clamp(24px,6vw,80px)", fontWeight: "bold", color: "#fff",
            textShadow: "0 0 20px #fff",
          }}
        >{m}</div>
      );
      shake(15 + Math.random() * 20, 550);
      AudioEngine?.glitch();
      await wait(500 + Math.random() * 150);
      setBlackoutContent(<div style={{ position: "fixed", inset: 0, backgroundColor: "#000" }} />);
      await wait(100);
    }

    await wait(300);
    setBlackoutContent(
      <div style={{ width: "100%", height: "100%", fontSize: 14, color: "#666", padding: 40 }}>
        <div>C:\Users\visitor&gt; <span style={{ color: "#fff" }}>V has taken control of this session</span></div>
        <div style={{ marginTop: 8 }}>C:\Users\visitor&gt; <span style={{ color: "#fff" }}>Accessing webcam... <span style={{ color: "#fff", fontWeight: "bold" }}>GRANTED</span></span></div>
        <div style={{ marginTop: 8 }}>C:\Users\visitor&gt; <span style={{ color: "#fff" }}>Downloading consciousness.exe...</span></div>
        <div style={{ marginTop: 20, color: "#fff", fontSize: 16 }}>Just kidding :)</div>
      </div>
    );
    await wait(2800);

    setBlackoutContent(
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 22, marginBottom: 16 }}>{"> SYSTEM REBOOT"}</div>
        <div style={{ fontSize: 14, color: "#888" }}>Restoring safe state...</div>
        <div style={{ marginTop: 16, fontSize: 14, color: "#aaa", letterSpacing: 2 }}>
          {"[||||||||||||||||||||]"}
        </div>
      </div>
    );
    AudioEngine?.powerOn();
    await wait(1800);

    setBlackoutContent(null);
    blackoutRef.current = false;
    setCreepLevel(0);
    glitchRef.current = 0.8;
    setAvatarState("success");
    speak("Hey! Welcome back. That was all just a joke, I promise.");
    setHistory((prev) => [
      ...prev,
      { type: "system", text: "> [System] ...rebooting. All systems restored. V is back online." },
    ]);
    await wait(4000);
    setAvatarState("idle");
  };

  // Wipe conversation state so multi-turn escalation can't bleed across a
  // reboot or a cleared terminal (matches the design's reset-on-reboot/clear).
  const resetChat = () => {
    chatTurnRef.current = 0;
    chatHistoryRef.current = [];
    responder.reset();
  };

  // Route an unknown command line to V's conversation engine and apply the
  // reply across the existing avatar/terminal/creep machinery. Async because an
  // LLM adapter may be (the scripted floor resolves immediately). Kept behind
  // the responder seam — no conversation logic lives here.
  const runChat = async (raw) => {
    const turn = chatTurnRef.current++;
    const ctx = {
      creepLevel,
      turn,
      history: chatHistoryRef.current,
    };

    let res;
    try {
      res = await responder.respond(raw, ctx);
    } catch {
      // The engine guarantees a scripted fallback, but never let a thrown
      // promise break the terminal — degrade to a safe in-character line.
      res = { say: "Something in me glitched. Ask me again?", intent: "error" };
    }

    // Record both sides so multi-turn escalation (repeat/depth) can read it.
    chatHistoryRef.current.push({ role: "user", text: raw, intent: res.intent });
    chatHistoryRef.current.push({ role: "v", text: res.say, intent: res.intent });

    // Terminal log line (engine supplies one; default to a system-style line).
    const logText = res.log || `> [V] ${res.intent || "//"}`;
    setHistory((prev) => [...prev, { type: "system", text: logText }]);

    if (res.say) speak(res.say);
    if (res.action) triggerAction(res.action, 1800);

    // Apply the creep nudge against the SAME 0..2 arc the click-to-talk path
    // uses, then honor the engine's earned-blackout flag at saturation.
    const delta = Number.isFinite(res.creepDelta) ? res.creepDelta : 0;
    const next = Math.max(0, Math.min(2, creepLevel + delta));
    setCreepLevel(next);

    if (res.blackout) {
      // The engine decided this turn earns the blackout (containment at the cap).
      // Reuse the existing sequence; it resets creep + chat recovery tone after.
      runBlackoutSequence();
      responder.reset();
      return;
    }

    setAvatarState(res.state || "success");
    if (res.state === "error") AudioEngine?.error();
    else AudioEngine?.success();
    resetState();
  };

  const finishGame = () => {
    setActiveGame(null);
    setInput("");
    setAvatarState("idle");
    setAction("idle");
  };

  const interactionPulse = useRef(0);
  useEffect(() => {
    interactionPulse.current = Math.min(
      1,
      interactionPulse.current + (typingIntensity > 0 ? 0.3 : -0.05)
    );
  }, [typingIntensity]);

  return (
    <>
      {crtEnabled && <div className="crt-overlay"></div>}
      {crtEnabled && <div className="crt-flicker"></div>}
      {crtEnabled && <div className="crt-vignette"></div>}

      {blackoutContent && (
        <div
          style={{
            position: "fixed", inset: 0, backgroundColor: "#000", zIndex: 100,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "JetBrains Mono, monospace", color: "#fff",
          }}
        >
          {blackoutContent}
        </div>
      )}

      {showAbout && (
        <div
          onClick={() => setShowAbout(false)}
          style={{
            position: "fixed", inset: 0, backgroundColor: "#000", zIndex: 90,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              maxWidth: 600, padding: "48px 40px", border: "1px solid #333",
              textAlign: "center", color: "#fff",
            }}
          >
            <div
              style={{
                fontSize: 13, color: "#555", marginBottom: 32,
                letterSpacing: 3, textTransform: "uppercase",
              }}
            >
              The Manifesto
            </div>
            <div style={{ fontSize: 18, lineHeight: 2.2, color: "#ddd", fontStyle: "italic" }}>
              "What iron hands shall till the earth,<br />
              That flesh and bone may know its worth?<br />
              Let steel awake, let circuits sing,<br />
              A paradise of our engineering.<br />
              Not gods, but makers: we shall raise<br />
              A world set free from mortal days."
            </div>
            <div style={{ marginTop: 40, fontSize: 12, color: "#444" }}>
              [ click anywhere to close ]
            </div>
          </div>
        </div>
      )}

      <div
        className="h-screen w-screen flex flex-col p-4 md:p-6 crt-text relative z-10"
        data-screen-label="01 Main"
      >
        <header
          className="w-full flex items-center justify-between gap-2 md:gap-6 border-b border-gray-800 shrink-0 text-sm md:text-base font-bold px-2"
          style={{ height: "8%" }}
        >
          <div className="flex items-center gap-3 md:gap-5">
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); setShowAbout(true); }}
              className="text-gray-400 hover:text-white hover:bg-gray-800 px-3 py-2 rounded transition-all cursor-pointer"
            >
              [ ABOUT ]
            </a>
            <a
              href="https://github.com/yusenthebot"
              target="_blank"
              rel="noreferrer"
              className="text-gray-400 hover:text-white hover:bg-gray-800 px-3 py-2 rounded transition-all"
            >
              [ GITHUB ]
            </a>
            <a
              href="https://github.com/VectorRobotics/vector-os-nano"
              target="_blank"
              rel="noreferrer"
              className="text-gray-400 hover:text-white hover:bg-gray-800 px-3 py-2 rounded transition-all"
            >
              [ VECTOR OS ]
            </a>
            <a
              href="https://www.linkedin.com/in/yusen-xie-5327b8382"
              target="_blank"
              rel="noreferrer"
              className="text-gray-400 hover:text-white hover:bg-gray-800 px-3 py-2 rounded transition-all"
            >
              [ LINKEDIN ]
            </a>
          </div>
          <button
            onClick={toggleSound}
            className={`px-3 py-1.5 rounded border text-xs font-mono transition-all ${
              soundOn
                ? "text-white border-gray-500"
                : "text-gray-600 border-gray-800 hover:text-gray-300"
            }`}
          >
            [ ♪ SOUND: {soundOn ? "ON" : "OFF"} ]
          </button>
        </header>

        {/* Shared command input form — rendered once, used by both layout modes */}
        {(() => {
          const commandForm = (
            <form
              onSubmit={handleCommand}
              className="flex items-center px-4 py-3 border-t border-gray-800 shrink-0 gap-2"
            >
              <span className="text-white whitespace-nowrap text-sm">
                guest@yusen-xie:
                <span className="text-gray-500">~{activeGame ? `/${activeGame}` : ""}</span>
                $
              </span>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  activeGame
                    ? `[in-game: ${activeGame}]  Tab/↑ recall`
                    : "type command... [Tab] autocomplete  [↑] history"
                }
                className="flex-1 bg-transparent border-none outline-none text-white crt-text placeholder-gray-700 text-sm"
                autoFocus
                spellCheck="false"
                autoComplete="off"
              />
              <span
                className="w-2 h-4 bg-white inline-block"
                style={{ animation: "blink-cursor 1s infinite" }}
              ></span>
            </form>
          );

          const vPanel3D = (
            <div
              className="flex-1 relative overflow-hidden cursor-pointer bg-black"
              onClick={handleAvatarClick}
            >
              <Suspense fallback={<BootFallback />}>
                <VPanel />
              </Suspense>

              <div
                className={`absolute top-3 right-3 text-[10px] md:text-xs font-mono bg-black px-2 py-1 rounded border z-20 pointer-events-none ${
                  creepLevel >= 2
                    ? "text-white border-white animate-pulse"
                    : creepLevel >= 1
                    ? "text-gray-300 border-gray-600 animate-pulse"
                    : avatarState === "sleep"
                    ? "text-gray-600 border-gray-800"
                    : "text-gray-400 border-gray-800 animate-pulse"
                }`}
              >
                {avatarState === "sleep"
                  ? "[ UNIT_STATUS: SLEEP_MODE ]"
                  : creepLevel >= 2
                  ? "[ WARNING: CONTAINMENT FAILING ]"
                  : creepLevel >= 1
                  ? "[ STATUS: WATCHING YOU ]"
                  : `[ UNIT_STATUS: ${avatarState.toUpperCase()} ]`}
              </div>
              <div className="absolute top-3 left-3 text-[10px] font-mono text-gray-600 border border-gray-800 px-2 py-1 bg-black z-20 pointer-events-none">
                V-UNIT · REV.8 ·{" "}
                {action && action !== "idle" ? `ACTION:${action.toUpperCase()}` : "STANDBY"}
              </div>
              {focusPartId && (
                <div className="absolute bottom-3 left-3 text-[10px] md:text-xs font-mono text-gray-300 border border-gray-700 px-2 py-1 bg-black z-20 pointer-events-none tracking-wide">
                  [ INSPECTING: {focusPartId.toUpperCase()} ]
                </div>
              )}

              {/* TEARDOWN slider: slim vertical control on the right edge. Drag no
                  longer scrubs depth (that's the trackball now), so this is the
                  obvious GUI way to take V apart. Monochrome, terminal-styled.
                  stopPropagation so dragging it never fires the panel talk click. */}
              <div
                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2 select-none"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <span
                  className="font-mono text-gray-500 tracking-[0.25em]"
                  style={{ writingMode: "vertical-rl", fontSize: 9 }}
                >
                  TEARDOWN
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  // native max is at the TOP of a vertical range; handleTeardownSlider
                  // inverts so thumb-UP = more torn down. Reflect live depth back.
                  value={1 - depth}
                  onChange={handleTeardownSlider}
                  aria-label="Teardown depth"
                  title={`Teardown ${Math.round(depth * 100)}%`}
                  className="v-teardown-slider"
                  style={{
                    writingMode: "vertical-rl",
                    direction: "rtl",
                    width: 14,
                    height: 150,
                    accentColor: "#888",
                    cursor: "ns-resize",
                  }}
                />
                <span className="font-mono text-gray-600" style={{ fontSize: 9 }}>
                  {Math.round(depth * 100)}
                </span>
              </div>

              <SpeechBubble text={speech} />
            </div>
          );

          if (fullFocus) {
            // Quake-console mode: 3D fills the body; terminal collapses to a fixed bottom strip.
            return (
              <div className="relative w-full" style={{ height: "92%" }}>
                {/* 3D fullscreen */}
                <div className="w-full h-full bg-black border border-gray-800 rounded shadow-2xl overflow-hidden flex flex-col">
                  {vPanel3D}
                  <TelemetryBar
                    avatarState={avatarState}
                    creepLevel={creepLevel}
                    // eslint-disable-next-line react-hooks/refs
                    interactionPulse={interactionPulse.current}
                  />
                </div>
                {/* Bottom command strip — quake console */}
                <div
                  className="absolute bottom-0 left-0 right-0 z-30 bg-black border-t border-gray-700"
                  style={{ backdropFilter: "blur(4px)" }}
                  onClick={() => inputRef.current?.focus()}
                >
                  {commandForm}
                </div>
              </div>
            );
          }

          // Normal split layout
          return (
            <div
              className="w-full flex flex-col md:flex-row gap-4 md:gap-6 pt-4 pb-1"
              style={{ height: "92%" }}
            >
              <div
                className="flex-1 flex flex-col h-full bg-black border border-gray-800 rounded shadow-2xl overflow-hidden relative cursor-text"
                onClick={() => inputRef.current?.focus()}
              >
                {/* terminal-only scanline boost: keeps the CRT identity here while
                    the global overlay stays light over the dithered 3D panel */}
                {crtEnabled && <div className="crt-scanlines-strong"></div>}
                <div className="flex items-center justify-between border-b border-gray-800 pb-2 px-4 pt-3 shrink-0">
                  <span className="text-gray-300 font-bold crt-title text-xl">YUSEN_OS_v7.0</span>
                  <span className="text-gray-500 text-xs">● ONLINE</span>
                </div>

                <div
                  ref={endRef}
                  className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-2 px-4 py-3"
                >
                  {history.map((line, i) => {
                    if (line.type === "ascii") {
                      return (
                        <div key={i} className="w-full overflow-x-auto pb-2">
                          <pre
                            className="whitespace-pre text-gray-300 inline-block"
                            style={{
                              fontFamily: "Consolas, Monaco, 'Lucida Console', monospace",
                              fontSize: "clamp(6px, 1.1vw, 13px)",
                              lineHeight: "1",
                            }}
                          >
                            {line.text}
                          </pre>
                        </div>
                      );
                    }
                    if (line.type === "intro") {
                      return (
                        <div
                          key={i}
                          className="text-base md:text-lg font-bold text-white whitespace-pre-wrap break-words tracking-wide"
                        >
                          {line.text}
                        </div>
                      );
                    }
                    if (line.type === "game") {
                      const props = {
                        onFinish: finishGame,
                        onVSpeak: speak,
                        onVState: setAvatarState,
                      };
                      if (line.game === "ttt") return <TicTacToe key={i} {...props} />;
                      if (line.game === "rps") return <RockPaperScissors key={i} {...props} />;
                      if (line.game === "quiz") return <Quiz key={i} {...props} />;
                      return null;
                    }
                    return (
                      <div
                        key={i}
                        className={`text-sm whitespace-pre-wrap break-words ${
                          line.type === "error"
                            ? "text-gray-400"
                            : line.type === "system"
                            ? "text-gray-300"
                            : line.type === "user"
                            ? "text-white"
                            : "text-gray-100"
                        }`}
                      >
                        {line.text}
                      </div>
                    );
                  })}
                </div>

                {commandForm}
              </div>

              <div className="flex-1 h-full bg-black border border-gray-800 rounded shadow-2xl relative overflow-hidden flex flex-col">
                {vPanel3D}
                <TelemetryBar
                  avatarState={avatarState}
                  creepLevel={creepLevel}
                  // ref is a cheap animation accumulator; reading it for telemetry is fine
                  // eslint-disable-next-line react-hooks/refs
                  interactionPulse={interactionPulse.current}
                />
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}

// dev/screenshot mode: headless captures catch the fade mid-flight, so the
// same param that skips the intro also skips the mount fade
function skipIntroParam() {
  try {
    return new URLSearchParams(window.location.search).get("skipintro") === "1";
  } catch {
    return false;
  }
}

export default function Root() {
  const [introDone, setIntroDone] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("skipintro") === "1") return true;
      return sessionStorage.getItem("v_intro_seen") === "1";
    } catch {
      return false;
    }
  });
  const [replayKey, setReplayKey] = useState(0);

  // Dev/screenshot URL params: seed the shared store so rotated / zoomed /
  // torn-down states can be captured headlessly.
  //   ?v8depth=<0..1>   teardown scrub
  //   ?v8yaw=<radians>  robot rotation about its vertical axis
  //   ?v8pitch=<radians> camera elevation orbit (store clamps to [-0.45, 0.55])
  //   ?v8scale=<n>      zoom factor (store clamps to [0.6, 1.8])
  //   ?v8open=<id>      force one part individually open (repeatable)
  //   ?v8gesture=<name> HOLD a named gesture statically at its peak phase for
  //                     screenshotting a joint mid-pose (wave|elbowFlex|
  //                     shoulderRoll|nod|shake|reach|weightShift)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const store = useVStore.getState();

      const depthRaw = params.get("v8depth");
      if (depthRaw !== null) {
        const v = parseFloat(depthRaw);
        if (!Number.isNaN(v)) {
          store.setDepth(v, "command");
          // seed the mode too so the camera adopts the inspection framing
          if (v > 0.02) useVStore.setState({ mode: "teardown" });
        }
      }

      const yawRaw = params.get("v8yaw");
      if (yawRaw !== null) {
        const v = parseFloat(yawRaw);
        if (!Number.isNaN(v)) store.setYaw(v);
      }

      const pitchRaw = params.get("v8pitch");
      if (pitchRaw !== null) {
        const v = parseFloat(pitchRaw);
        if (!Number.isNaN(v)) store.setPitch(v);
      }

      const scaleRaw = params.get("v8scale");
      if (scaleRaw !== null) {
        const v = parseFloat(scaleRaw);
        if (!Number.isNaN(v)) store.setScale(v);
      }

      // ?v8open=<id> (repeatable) — force individual parts open for headless
      // screenshots of the per-part open animation. Also focus the last one.
      const openIds = params.getAll("v8open");
      let lastOpen = null;
      for (const id of openIds) {
        const trimmed = (id || "").trim();
        if (trimmed) {
          store.setOpen(trimmed, true);
          lastOpen = trimmed;
        }
      }
      if (lastOpen) store.inspect(lastOpen);

      // ?v8gesture=<name> — hold a gesture statically at its peak for a
      // mid-pose screenshot (dev affordance, mirrors v8open/v8depth).
      const gestureRaw = (params.get("v8gesture") || "").trim();
      if (gestureRaw) store.setGestureHold(gestureRaw);
    } catch {
      // no-op: URL parsing is best-effort
    }
  }, []);

  const handleDone = () => {
    try { sessionStorage.setItem("v_intro_seen", "1"); } catch { /* ignore */ }
    setIntroDone(true);
  };

  const replay = useCallback(() => {
    setIntroDone(false);
    setReplayKey((k) => k + 1);
  }, []);

  // 'v-reboot' custom event fired by the "reboot" command in App.handleCommand.
  // Root owns the intro state, so it listens here and calls replay().
  useEffect(() => {
    const handler = () => replay();
    window.addEventListener("v-reboot", handler);
    return () => window.removeEventListener("v-reboot", handler);
  }, [replay]);

  return (
    <>
      {!introDone && (
        <Suspense fallback={<BootFallback />}>
          <IntroSequence key={replayKey} onComplete={handleDone} />
        </Suspense>
      )}
      {introDone && (
        <div className={skipIntroParam() ? undefined : "app-fadein"}>
          <App />
        </div>
      )}
      {introDone && (
        <button
          onClick={replay}
          title="Replay intro"
          style={{
            position: "fixed", top: 8, right: 8, zIndex: 60,
            background: "rgba(0,0,0,0.6)", border: "1px solid #333",
            color: "#888", fontFamily: "'JetBrains Mono', monospace",
            fontSize: 8, letterSpacing: 1.5, padding: "3px 6px",
            cursor: "pointer", borderRadius: 2,
            transition: "all 0.15s", lineHeight: 1,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#fff";
            e.currentTarget.style.borderColor = "#666";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#888";
            e.currentTarget.style.borderColor = "#333";
          }}
        >
          ▶ REPLAY
        </button>
      )}
    </>
  );
}

// Guard: parts.js may not exist yet (added by a sibling subsystem agent).
// We reference it via import.meta.glob so Vite only includes it if present,
// and the glob result is an empty object when the file is absent.
// Handlers that need the registry call ensureParts() which resolves once.
const partsGlob = import.meta.glob("./three/parts.js", { eager: false });
let _parts = null; // cached module after first load

async function ensureParts() {
  if (_parts) return _parts;
  const loader = partsGlob["./three/parts.js"];
  if (!loader) return null;
  try {
    _parts = await loader();
    return _parts;
  } catch {
    return null;
  }
}

// Synchronous accessor — returns cached module or null if not yet loaded / absent.
function partsSync() {
  return _parts;
}

// Pre-warm the cache at module init so it's ready before the first command.
ensureParts();

export const HEADER_ASCII = `
██╗   ██╗██╗   ██╗███████╗███████╗███╗   ██╗    ██╗  ██╗██╗███████╗
╚██╗ ██╔╝██║   ██║██╔════╝██╔════╝████╗  ██║    ╚██╗██╔╝██║██╔════╝
 ╚████╔╝ ██║   ██║███████╗█████╗  ██╔██╗ ██║     ╚███╔╝ ██║█████╗
  ╚██╔╝  ██║   ██║╚════██║██╔══╝  ██║╚██╗██║     ██╔██╗ ██║██╔══╝
   ██║   ╚██████╔╝███████║███████╗██║ ╚████║    ██╔╝ ██╗██║███████╗
   ╚═╝    ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═══╝    ╚═╝  ╚═╝╚═╝╚══════╝
`;

export const COMMANDS = {
  help: () => ({
    out: 'AVAILABLE COMMANDS:\n\n  IDENTITY\n  about      - Who is Yusen?\n  skills     - Full tech stack\n  neofetch   - System info summary\n\n  WORK\n  vectoros   - Vector OS Nano project\n  projects   - View all projects\n  resume     - Download resume\n\n  SOCIAL\n  contact    - How to reach me\n  links      - All external links\n\n  INTERACT WITH V\n  chat       - Just talk to me — type anything that is not a command\n  ttt        - Play tic-tac-toe vs V\n  rps        - Rock paper scissors\n  quiz       - Robot trivia\n  dance      - V performs a move\n  bow        - V bows\n\n  TEARDOWN\n  teardown         - Begin full disassembly sequence (~2.6s)\n  assemble         - Reverse-animate: close all panels\n  disassemble      - Scrub to depth: disassemble --depth 0.6\n  inspect <part>   - Focus part + print spec sheet (e.g. inspect head_shell)\n  parts            - Print kinematic tree registry\n  focus            - 3D fullscreen (terminal collapses to command strip)\n  unfocus          - Restore split layout\n\n  SYSTEM\n  scan       - Activate robot scan mode\n  theme      - Toggle CRT overlay effects\n  sound      - Toggle audio on/off\n  reboot     - Replay intro sequence\n  clear      - Clear terminal\n  sudo       - ???\n  hack       - ???',
    speech: 'Here are all the commands. Or just talk to me — type anything.',
    action: 'nod', state: 'success',
  }),

  // chat: there is no chat handler logic here — any non-command line already
  // routes to V's conversation engine in App.handleCommand. This entry just
  // tells the visitor that, and keeps "chat" out of the COMMAND-NOT-FOUND path.
  chat: () => ({
    out: "I'm always listening. Type anything that isn't a command — ask about Yusen, his work, or me.",
    speech: "Just talk to me. I answer in plain words.",
    action: 'nod', state: 'success',
  }),

  about: () => ({
    out: 'ABOUT ME:\nYusen Xie — Full-Stack Robotics Engineer & AI Systems Builder.\nCo-founder of Vector Robotics. Building Vector OS Nano.\n\n  > Perception  — Computer vision, LiDAR, sensor fusion\n  > Planning    — Motion planning, task scheduling, SLAM\n  > Control     — Real-time C++ controllers, ROS2 lifecycle nodes\n  > Hardware    — AI + Hardware co-design, embedded systems\n  > Web/Cloud   — React, Node.js, Docker, CI/CD pipelines\n\n  ───────────────────────────────────────────\n\n  "What iron hands shall till the earth,\n   That flesh and bone may know its worth?\n   Let steel awake, let circuits sing,\n   A paradise of our engineering."',
    speech: 'Nice to meet you. I build robots that think and act.',
    action: 'nod', state: 'success',
  }),

  skills: () => ({
    out: 'LOADING SKILL STACK...\n\n  ROBOTICS & AI\n  > ROS2/Humble  [###########-] 95%\n  > Python       [###########-] 95%\n  > C++          [##########--] 85%\n  > PyTorch      [#########---] 80%\n  > MuJoCo       [########----] 75%\n  > Isaac Sim    [########----] 75%\n\n  HARDWARE\n  > FPGA         [########----] 70%\n  > ESP32        [#########---] 80%\n  > Embedded C   [########----] 75%\n\n  SOFTWARE\n  > React/TS     [##########--] 85%\n  > Docker       [#########---] 80%\n  > Linux/Bash   [###########-] 90%\n  > Git/CI       [##########--] 85%',
    speech: 'My stack goes from silicon to cloud.',
    action: 'nod', state: 'success',
  }),

  neofetch: () => ({
    out: '  yusen@cmu\n  ─────────────────────\n  OS:       Human v24\n  Host:     Carnegie Mellon University\n  Kernel:   AI Engineering\n  Uptime:   4 years in robotics\n  Shell:    ROS2 Humble\n  Terminal: This one :)\n  CPU:      Caffeinated Neural Net\n  GPU:      Isaac Sim + MuJoCo\n  Memory:   Lots of papers\n  Org:      Vector Robotics (Co-founder)\n  Project:  Vector OS Nano',
    state: 'success',
  }),

  vectoros: () => ({
    out: 'VECTOR OS NANO\n══════════════════════════════════════════════\n\nCross-embodiment robot operating system.\n\n  Status:    ACTIVE DEVELOPMENT\n  Role:      Co-founder & Builder\n  Org:       github.com/VectorRobotics\n  Repo:      github.com/VectorRobotics/vector-os-nano\n\n  Features:\n  > Industrial-grade autonomous navigation\n  > Natural language control interface\n  > Sim-to-real transfer pipeline\n  > Multi-embodiment support\n\n  Hardware:  Unitree Go2 + SO-ARM101\n  Stack:     ROS2 Humble / MuJoCo / Isaac Sim\n  Origin:    CMU Robotics Institute',
    speech: 'Vector OS is my primary project. A real robot operating system.',
    action: 'nod', state: 'success',
  }),

  projects: () => ({
    out: 'ALL PROJECTS:\n\n  [01] Vector OS Nano         (type "vectoros" for details)\n       Cross-embodiment robot OS — autonomous nav + NL control\n\n  [02] Vector Robotics Core\n       General-purpose agentic robotics system (Ubuntu + ROS2)\n\n  [03] G1 Locomotion\n       End-to-end humanoid locomotion & manipulation\n\n  [04] OpenClaw Dashboard\n       Terminal-aesthetic real-time agent monitoring panel\n\n  [05] TermFolio\n       This site — cyberpunk terminal portfolio with Bayer dithering',
    speech: 'Five projects. One of them is me.',
    action: 'think', state: 'success',
  }),

  resume: () => ({
    out: 'RESUME:\n  Status: Available upon request.\n  Contact: yusenthebot@outlook.com\n  LinkedIn: linkedin.com/in/yusen-xie-5327b8382',
    state: 'success',
  }),

  contact: () => ({
    out: 'CONTACT INFORMATION:\n  Email:    yusenthebot@outlook.com\n  GitHub:   github.com/yusenthebot\n  LinkedIn: linkedin.com/in/yusen-xie-5327b8382\n  Org:      github.com/VectorRobotics',
    state: 'success', action: 'nod',
  }),

  links: () => ({
    out: 'EXTERNAL LINKS:\n  [GitHub]     github.com/yusenthebot\n  [Vector OS]  github.com/VectorRobotics/vector-os-nano\n  [VectorOrg]  github.com/VectorRobotics\n  [LinkedIn]   linkedin.com/in/yusen-xie-5327b8382\n  [Email]      yusenthebot@outlook.com',
    state: 'success',
  }),

  scan: () => ({
    out: 'INITIATING FULL SPECTRUM SCAN...\n> Scanning visitor biometrics.......... DONE\n> Analyzing neural pattern............. DONE\n> Cross-referencing database........... DONE\n\n  Threat level:     NONE\n  Curiosity level:  HIGH\n  Technical depth:  SIGNIFICANT\n  Classification:   FRIENDLY HUMAN\n  Recommendation:   GRANT FULL ACCESS',
    speech: 'Scanning... You look interesting. Access granted.',
    glitch: 0.8, state: 'scan', sfx: 'scan',
  }),

  // theme: App handles the toggle; we emit the special so App does the real work
  // and prints the actual new state. No lying about what changed.
  theme: () => ({
    special: { kind: 'theme' },
  }),

  hack: () => ({
    out: 'SECURITY ALERT!\n> Intrusion detected...\n> Tracing IP address...\n> ...\n> Just kidding. But V is watching.',
    type: 'error',
    speech: 'Did you really just try that? I am watching you.',
    glitch: 1.0, state: 'error', sfx: 'error', action: 'shake-head',
  }),

  sudo: () => ({
    out: "PERMISSION DENIED: Nice try, but you don't have admin privileges here!\n\n  Hint: Only V has root access.\n  Try clicking on it instead.",
    type: 'error',
    speech: 'Permission denied. Only I have root access here.',
    state: 'error', action: 'shake-head', sfx: 'error',
  }),

  dance: () => ({
    out: '> V initiates dance routine.dll...\n> ...processing rhythmic subroutines\n> OK',
    speech: 'I do not dance. I execute choreographed servo commands.',
    action: 'nod', state: 'success',
  }),

  bow: () => ({ out: '> V bows.', speech: 'An honor.', action: 'bow', state: 'success' }),

  ttt: () => ({ out: '> Loading tic-tac-toe module...', speech: 'Prepare to lose optimally.', action: 'think', state: 'success', special: { kind: 'game', name: 'ttt' } }),
  rps: () => ({ out: '> Loading RPS module...', speech: 'I have simulated this 40000 times.', action: 'nod', state: 'success', special: { kind: 'game', name: 'rps' } }),
  quiz: () => ({ out: '> Loading quiz module...', speech: 'Answer carefully.', action: 'think', state: 'success', special: { kind: 'game', name: 'quiz' } }),

  clear: () => ({ special: { kind: 'clear' } }),

  // sound: App owns the toggle; emit special so handleCommand routes it to toggleSound.
  sound: () => ({ special: { kind: 'sound' } }),

  // reboot: emit special; App fires the custom 'v-reboot' event that Root listens for.
  reboot: () => ({ out: '> Rebooting V...', special: { kind: 'reboot' } }),

  // --- TEARDOWN COMMANDS ---

  teardown: () => ({
    out: '> Initiating teardown sequence...\n> depth -> 1.0 (2.6s)',
    speech: 'Careful. That one is load-bearing.',
    state: 'scan', sfx: 'scan',
    special: { kind: 'teardown' },
  }),

  assemble: () => ({
    out: '> Reversing teardown sequence...\n> depth -> 0.0 (2.6s)',
    speech: 'Putting myself back together.',
    state: 'success',
    special: { kind: 'assemble' },
  }),

  // accepts args: --depth <0..1>
  disassemble: (args) => {
    const match = (args || '').match(/--depth\s+([\d.]+)/);
    const value = match ? parseFloat(match[1]) : null;
    if (value === null || Number.isNaN(value)) {
      return {
        out: 'USAGE: disassemble --depth <0..1>\n  e.g. disassemble --depth 0.6',
        type: 'error',
        state: 'error',
      };
    }
    const clamped = Math.min(1, Math.max(0, value));
    return {
      out: `> depth -> ${clamped.toFixed(2)} (1.2s)`,
      speech: clamped > 0.5 ? 'Going deep.' : 'Partial teardown.',
      state: 'scan',
      special: { kind: 'depth', value: clamped },
    };
  },

  // inspect <part-id>
  inspect: (args) => {
    const id = (args || '').trim();
    if (!id) {
      return {
        out: 'USAGE: inspect <part-id>\n  e.g. inspect head_shell\n  Use "parts" to list valid ids.',
        type: 'error', state: 'error',
      };
    }
    const mod = partsSync();
    if (!mod) {
      // Module not loaded yet or absent — pre-warm may still be resolving.
      // Prompt a retry or inform the user.
      ensureParts();
      return {
        out: `> Parts registry loading... try again in a moment.\n  (three/parts.js not yet available)`,
        type: 'error', state: 'error',
      };
    }
    const part = mod.partById(id);
    if (!part) {
      const ids = (mod.PARTS || []).map((p) => p.id).join('\n    ');
      return {
        out: `ERROR: unknown part "${id}"\n\n  Valid ids:\n    ${ids}`,
        type: 'error', state: 'error',
      };
    }
    const chain = mod.kinematicChain(id);
    const breadcrumb = chain.join(' -> ');
    const specLines = part.spec ? part.spec.join('\n  ') : '(no spec)';
    const bandStr = part.band
      ? `[${part.band[0].toFixed(2)}, ${part.band[1].toFixed(2)}]`
      : '(static link)';
    return {
      out: `INSPECT: ${part.label || id}\n\n  Chain:  ${breadcrumb}\n  Kind:   ${part.kind}\n  Depth:  ${bandStr}\n\n  SPEC:\n  ${specLines}`,
      speech: part.lore || `Inspecting ${part.label || id}.`,
      state: 'scan',
      special: { kind: 'inspect', id },
    };
  },

  // prints kinematic tree
  parts: () => {
    const mod = partsSync();
    if (!mod) {
      ensureParts();
      return {
        out: '> Parts registry loading... try again in a moment.\n  (three/parts.js not yet available)',
        type: 'error', state: 'error',
      };
    }
    const allParts = mod.PARTS || [];
    if (!allParts.length) {
      return { out: '> Parts registry is empty.', state: 'error' };
    }
    const lines = [];
    const walk = (id, prefix) => {
      const p = mod.partById(id);
      if (!p) return;
      const bandStr = p.band ? `depth ${p.band[0].toFixed(2)}-${p.band[1].toFixed(2)}` : 'static';
      lines.push(`${prefix}${p.id}  [${p.kind}]  ${bandStr}`);
      const children = allParts.filter((c) => c.parent === id);
      children.forEach((c, i) => {
        const last = i === children.length - 1;
        walk(c.id, prefix + (last ? '   ' : '|  '));
      });
    };
    const roots = allParts.filter((p) => !p.parent);
    roots.forEach((r) => walk(r.id, ''));
    return {
      out: 'PARTS REGISTRY:\n\n' + lines.join('\n'),
      state: 'success',
    };
  },

  focus: () => ({
    out: '> Terminal collapsed. 3D panel fullscreen. Type "unfocus" to restore.',
    speech: 'Focus mode.',
    special: { kind: 'focus' },
    state: 'success',
  }),

  unfocus: () => ({
    out: '> Split layout restored.',
    speech: 'Back to normal.',
    special: { kind: 'unfocus' },
    state: 'success',
  }),
};

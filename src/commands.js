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
    out: 'AVAILABLE COMMANDS:\n\n  IDENTITY\n  about      - Who is Yusen?\n  skills     - Full tech stack\n  neofetch   - System info summary\n\n  WORK\n  vectoros   - Vector OS Nano project\n  projects   - View all projects\n  resume     - Download resume\n\n  SOCIAL\n  contact    - How to reach me\n  links      - All external links\n\n  INTERACT WITH V\n  ttt        - Play tic-tac-toe vs V\n  rps        - Rock paper scissors\n  quiz       - Robot trivia\n  dance      - V performs a move\n  bow        - V bows\n\n  SYSTEM\n  scan       - Activate robot scan mode\n  theme      - Toggle CRT effects\n  sound      - Toggle audio\n  clear      - Clear terminal\n  sudo       - ???\n  hack       - ???',
    speech: 'Here are all the commands. Try "ttt" or "vectoros".',
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
  theme: () => ({
    out: 'CRT THEME: ACTIVE\n> Scan lines: ON\n> Flicker: ON\n> Dithering: BAYER 8x8\n> Color mode: MONOCHROME',
    glitch: 0.5, state: 'success',
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
  sound: () => ({ out: '> Audio toggled. Use the header button for quick access.', speech: 'Audio toggled.', action: 'nod', state: 'success' }),
  reboot: () => ({ out: '> Rebooting V...', special: { kind: 'boot' } }),
};

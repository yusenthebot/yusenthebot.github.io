import { useState, useEffect, useRef } from "react";
import AudioEngine from "./audio.js";

// ========================================================================
// TIC-TAC-TOE
// ========================================================================
const winLines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function checkWin(board) {
  for (const [a, b, c] of winLines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { winner: board[a], line: [a, b, c] };
  }
  if (board.every(Boolean)) return { winner: "draw" };
  return null;
}

function minimax(board, player) {
  const result = checkWin(board);
  if (result) {
    if (result.winner === "O") return { score: 10 };
    if (result.winner === "X") return { score: -10 };
    return { score: 0 };
  }
  const moves = [];
  for (let i = 0; i < 9; i++) {
    if (!board[i]) {
      board[i] = player;
      const { score } = minimax(board, player === "O" ? "X" : "O");
      moves.push({ idx: i, score });
      board[i] = null;
    }
  }
  if (player === "O") return moves.reduce((a, b) => (a.score > b.score ? a : b));
  return moves.reduce((a, b) => (a.score < b.score ? a : b));
}

export function TicTacToe({ onFinish, onVSpeak, onVState }) {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [turn, setTurn] = useState("X");
  const [status, setStatus] = useState("your turn");
  const [done, setDone] = useState(false);
  const winRef = useRef(null);

  const play = (i) => {
    if (done || board[i] || turn !== "X") return;
    const nb = [...board]; nb[i] = "X"; setBoard(nb);
    AudioEngine?.keyPress();
    setTurn("O"); setStatus("V is thinking...");
    onVState?.("typing");
  };

  useEffect(() => {
    if (turn === "O" && !done) {
      const t = setTimeout(() => {
        const result = checkWin(board);
        if (result) return;
        let idx;
        if (Math.random() < 0.2) {
          const empty = board.map((v, i) => (v ? null : i)).filter((v) => v !== null);
          idx = empty[Math.floor(Math.random() * empty.length)];
        } else {
          idx = minimax([...board], "O").idx;
        }
        const nb = [...board]; nb[idx] = "O"; setBoard(nb);
        AudioEngine?.servoClick(0.8);
        setTurn("X");
      }, 700);
      return () => clearTimeout(t);
    }
  }, [turn, board, done]);

  useEffect(() => {
    const result = checkWin(board);
    if (result && !done) {
      setDone(true); winRef.current = result;
      if (result.winner === "X") {
        setStatus("YOU WIN. Impossible. Let me recompute.");
        onVSpeak?.("You won? I must recompute my neural weights.");
        onVState?.("error");
        AudioEngine?.error();
      } else if (result.winner === "O") {
        setStatus("V wins. As predicted.");
        onVSpeak?.("As calculated. Humans struggle with optimal play.");
        onVState?.("success");
        AudioEngine?.success();
      } else {
        setStatus("DRAW. A respectable outcome.");
        onVSpeak?.("A tie. Acceptable.");
        AudioEngine?.beep(500, 0.15);
      }
      setTimeout(() => onFinish?.(), 2800);
    } else if (turn === "X" && !done) {
      setStatus("your turn — enter a cell number");
    }
  }, [board, turn, done]);

  const cellClass = (i) => {
    const highlight = winRef.current?.line?.includes(i);
    return `inline-block w-6 text-center ${highlight ? "text-white font-bold" : "text-gray-300"}`;
  };

  const renderCell = (i) => {
    const v = board[i];
    return <span className={cellClass(i)}>{v || i + 1}</span>;
  };

  useEffect(() => {
    const handler = (e) => {
      if (done || turn !== "X") return;
      const n = parseInt(e.detail, 10);
      if (n >= 1 && n <= 9) play(n - 1);
    };
    window.addEventListener("ttt-key", handler);
    return () => window.removeEventListener("ttt-key", handler);
  }, [turn, board, done]);

  return (
    <div className="border border-gray-700 rounded p-3 my-2 bg-black/60 font-mono text-sm">
      <div className="text-gray-400 mb-2 text-xs tracking-widest">◉ TIC-TAC-TOE  vs  V  ◉</div>
      <div className="leading-relaxed text-base">
        <div> {renderCell(0)} │ {renderCell(1)} │ {renderCell(2)} </div>
        <div className="text-gray-700">───┼───┼───</div>
        <div> {renderCell(3)} │ {renderCell(4)} │ {renderCell(5)} </div>
        <div className="text-gray-700">───┼───┼───</div>
        <div> {renderCell(6)} │ {renderCell(7)} │ {renderCell(8)} </div>
      </div>
      <div className="mt-2 text-gray-400 text-xs">
        {status} {!done && turn === "X" && <span className="text-white">[1-9]</span>}
      </div>
    </div>
  );
}

// ========================================================================
// ROCK PAPER SCISSORS
// ========================================================================
export function RockPaperScissors({ onFinish, onVSpeak, onVState }) {
  const [, setRound] = useState(0);
  const [score, setScore] = useState({ you: 0, v: 0 });
  const [reveal, setReveal] = useState(null);
  const [shaking, setShaking] = useState(false);
  const [done, setDone] = useState(false);

  const glyph = { r: "✊", p: "✋", s: "✌" };
  const beats = { r: "s", p: "r", s: "p" };

  const play = (you) => {
    if (shaking || done) return;
    setShaking(true);
    AudioEngine?.servoClick();
    setTimeout(() => AudioEngine?.servoClick(1.2), 250);
    setTimeout(() => AudioEngine?.servoClick(0.8), 500);
    setTimeout(() => {
      const v = ["r", "p", "s"][Math.floor(Math.random() * 3)];
      const result = you === v ? "tie" : beats[you] === v ? "you" : "v";
      setReveal({ you, v, result });
      const ns = { ...score };
      if (result === "you") ns.you++;
      if (result === "v") ns.v++;
      setScore(ns);
      setShaking(false);

      if (result === "you") { onVSpeak?.("Lucky guess, human."); AudioEngine?.error(); onVState?.("error"); }
      else if (result === "v") { onVSpeak?.("Predicted with 94% confidence."); AudioEngine?.success(); onVState?.("success"); }
      else { onVSpeak?.("Identical choice. Interesting."); AudioEngine?.beep(500, 0.1); }

      if (ns.you >= 3 || ns.v >= 3) {
        setDone(true);
        setTimeout(() => {
          onVSpeak?.(ns.you >= 3 ? "Match lost. I will require patching." : "Match won. As expected.");
          onFinish?.();
        }, 2200);
      } else {
        setTimeout(() => { setReveal(null); setRound((r) => r + 1); }, 1500);
      }
    }, 800);
  };

  useEffect(() => {
    const handler = (e) => {
      const k = e.detail?.toLowerCase();
      if (["r", "p", "s"].includes(k)) play(k);
    };
    window.addEventListener("rps-key", handler);
    return () => window.removeEventListener("rps-key", handler);
  }, [shaking, done, score]);

  return (
    <div className="border border-gray-700 rounded p-3 my-2 bg-black/60 font-mono text-sm">
      <div className="text-gray-400 mb-2 text-xs tracking-widest">◉ ROCK PAPER SCISSORS  ◉  first to 3</div>
      <div className="flex items-center justify-around py-2 text-3xl">
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">YOU</div>
          <div className={shaking ? "animate-pulse" : ""}>
            {shaking ? "✊" : reveal ? glyph[reveal.you] : "?"}
          </div>
          <div className="text-xs text-gray-400 mt-1">{score.you}</div>
        </div>
        <div className="text-gray-600 text-xl">VS</div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">V</div>
          <div className={shaking ? "animate-pulse" : ""}>
            {shaking ? "✊" : reveal ? glyph[reveal.v] : "?"}
          </div>
          <div className="text-xs text-gray-400 mt-1">{score.v}</div>
        </div>
      </div>
      <div className="text-center text-xs text-gray-400 mt-1">
        {done
          ? score.you >= 3
            ? "YOU WIN THE MATCH"
            : "V WINS THE MATCH"
          : reveal
          ? reveal.result === "tie"
            ? "TIE ROUND"
            : reveal.result === "you"
            ? "YOU WIN ROUND"
            : "V WINS ROUND"
          : shaking
          ? "rock... paper... scissors..."
          : (
            <>
              pick: <span className="text-white">[r]</span>ock <span className="text-white">[p]</span>aper{" "}
              <span className="text-white">[s]</span>cissors
            </>
          )}
      </div>
    </div>
  );
}

// ========================================================================
// QUIZ
// ========================================================================
const QUIZ = [
  { q: "What does ROS stand for?", choices: ["Robot Operating System", "Remote Observation Suite", "Runtime Object Scheduler", "Really Old Software"], a: 0 },
  { q: "Which of these is Yusen's primary project?", choices: ["Vector OS Nano", "SkynetGPT", "BotForge", "PixelPilot"], a: 0 },
  { q: "SLAM =", choices: ["Simultaneous Localization and Mapping", "Stochastic Learning Algorithm Model", "Synchronous Linked Actuator Mesh", "Self-Locating Autonomous Machine"], a: 0 },
  { q: "Which simulator does V train in?", choices: ["MuJoCo / Isaac Sim", "Unity XR", "Blender Physics", "Roblox Studio"], a: 0 },
  { q: "What is V, really?", choices: ["200 KB of JavaScript", "A sentient AGI", "A Unitree Go2 firmware", "Your overlord"], a: 0 },
];

export function Quiz({ onFinish, onVSpeak, onVState }) {
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  const [done, setDone] = useState(false);
  const cur = QUIZ[i];

  const pick = (n) => {
    if (picked !== null || done) return;
    setPicked(n);
    const correct = n === cur.a;
    if (correct) {
      setScore((s) => s + 1);
      onVSpeak?.("Correct. Your neurons fire acceptably.");
      AudioEngine?.success(); onVState?.("success");
    } else {
      onVSpeak?.("Incorrect. Recalibrating my expectations of humans.");
      AudioEngine?.error(); onVState?.("error");
    }
    setTimeout(() => {
      if (i + 1 >= QUIZ.length) {
        setDone(true);
        setTimeout(() => {
          const final = score + (correct ? 1 : 0);
          onVSpeak?.(final >= 4 ? "Score: " + final + "/5. You may proceed." : "Score: " + final + "/5. Study harder.");
          onFinish?.();
        }, 1500);
      } else {
        setI(i + 1); setPicked(null);
      }
    }, 1400);
  };

  useEffect(() => {
    const handler = (e) => {
      const n = parseInt(e.detail, 10);
      if (n >= 1 && n <= 4) pick(n - 1);
    };
    window.addEventListener("quiz-key", handler);
    return () => window.removeEventListener("quiz-key", handler);
  }, [picked, i, done]);

  return (
    <div className="border border-gray-700 rounded p-3 my-2 bg-black/60 font-mono text-sm">
      <div className="text-gray-400 mb-2 text-xs tracking-widest">
        ◉ ROBOT QUIZ  ◉  {i + 1} / {QUIZ.length}  │  score {score}
      </div>
      <div className="text-white mb-2 text-base">{cur.q}</div>
      <div className="space-y-1">
        {cur.choices.map((c, n) => {
          const isPicked = picked === n;
          const isAnswer = picked !== null && n === cur.a;
          const isWrong = isPicked && n !== cur.a;
          return (
            <div
              key={n}
              className={`text-sm ${
                isAnswer
                  ? "text-white font-bold"
                  : isWrong
                  ? "text-gray-500 line-through"
                  : "text-gray-300"
              }`}
            >
              <span className="text-white">[{n + 1}]</span> {c} {isAnswer ? " ✓" : isWrong ? " ✗" : ""}
            </div>
          );
        })}
      </div>
      {!picked && !done && <div className="mt-2 text-xs text-gray-500">press 1-4</div>}
      {done && <div className="mt-2 text-xs text-white">FINAL: {score}/{QUIZ.length}</div>}
    </div>
  );
}

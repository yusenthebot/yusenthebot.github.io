import { useState, useEffect, useRef } from "react";

export default function TelemetryBar({ avatarState, creepLevel, interactionPulse }) {
  const [tick, setTick] = useState(0);
  const startRef = useRef(Date.now());
  const heartRef = useRef(72);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const target =
      avatarState === "error" ? 140
      : avatarState === "scan" ? 110
      : avatarState === "typing" ? 92
      : avatarState === "sleep" ? 44
      : creepLevel >= 2 ? 155
      : creepLevel >= 1 ? 105
      : 72;
    heartRef.current += (target - heartRef.current) * 0.2;
  }, [avatarState, creepLevel, tick]);

  const uptime = (() => {
    const s = Math.floor((Date.now() - startRef.current) / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  })();

  const servoTemp = (() => {
    const base =
      avatarState === "scan" ? 62
      : avatarState === "typing" ? 48
      : avatarState === "sleep" ? 22
      : 38;
    return (base + Math.sin(tick * 0.3) * 2 + interactionPulse * 15).toFixed(1);
  })();

  const coolant = (() => {
    const base = avatarState === "scan" ? 38 : avatarState === "sleep" ? 95 : 78;
    return Math.max(10, Math.min(100, base + Math.sin(tick * 0.15) * 3)).toFixed(0);
  })();

  const heart = Math.round(heartRef.current + Math.sin(tick * 0.5) * 2);

  const Bar = ({ value, max = 100, width = 8, warn = false }) => {
    const filled = Math.round((value / max) * width);
    return (
      <span className="text-white/70">
        [{Array.from({ length: width }, (_, i) => (i < filled ? (warn ? "▓" : "█") : "░")).join("")}]
      </span>
    );
  };

  const pulseChar = tick % 2 === 0 ? "♥" : " ";

  return (
    <div
      className="border-t border-gray-800 px-3 py-1.5 bg-black flex items-center justify-between text-[10px] md:text-xs font-mono text-gray-400 gap-3 overflow-hidden shrink-0"
      style={{ letterSpacing: "0.02em" }}
    >
      <div className="flex items-center gap-3 whitespace-nowrap">
        <span>
          <span className="text-gray-600">UPTIME</span> {uptime}
        </span>
        <span className="text-gray-700">│</span>
        <span>
          <span className="text-gray-600">SERVO</span> {servoTemp}°C{" "}
          <Bar value={parseFloat(servoTemp)} max={80} warn={parseFloat(servoTemp) > 55} />
        </span>
      </div>
      <div className="flex items-center gap-3 whitespace-nowrap">
        <span>
          <span className="text-gray-600">COOLANT</span> {coolant}% <Bar value={parseFloat(coolant)} />
        </span>
        <span className="text-gray-700">│</span>
        <span className={creepLevel >= 2 ? "text-white" : ""}>
          <span className="text-gray-600">BPM</span> {heart}
          <span
            className="inline-block w-3 text-white"
            style={{ animation: `meter-pulse ${(60 / Math.max(40, heart)) * 1000}ms infinite` }}
          >
            {pulseChar}
          </span>
        </span>
      </div>
    </div>
  );
}

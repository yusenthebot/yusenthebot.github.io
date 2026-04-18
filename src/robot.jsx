import { useState, useEffect, useRef } from "react";
import AudioEngine from "./audio.js";

function SpeechBubble({ text }) {
  const [displayed, setDisplayed] = useState("");
  const idxRef = useRef(0);

  useEffect(() => {
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

const BAYER = [
  [ 0, 48, 12, 60,  3, 51, 15, 63],
  [32, 16, 44, 28, 35, 19, 47, 31],
  [ 8, 56,  4, 52, 11, 59,  7, 55],
  [40, 24, 36, 20, 43, 27, 39, 23],
  [ 2, 50, 14, 62,  1, 49, 13, 61],
  [34, 18, 46, 30, 33, 17, 45, 29],
  [10, 58,  6, 54,  9, 57,  5, 53],
  [42, 26, 38, 22, 41, 25, 37, 21],
];

export default function PixelAvatar({
  avatarState,
  onAvatarClick,
  glitchRef,
  speech,
  creepLevel,
  action,
  lookTarget,
  typingIntensity,
}) {
  const canvasRef = useRef(null);
  const hoverProximityRef = useRef(0);
  const creepRef = useRef(0);
  const actionRef = useRef({ name: "idle", t0: 0 });
  const lookTargetRef = useRef({ x: 0, y: 0 });
  const typingRef = useRef(0);
  const stateRef = useRef("idle");
  const lastServoRef = useRef({ x: 0, y: 0, t: 0 });

  creepRef.current = creepLevel;
  stateRef.current = avatarState;
  typingRef.current = typingIntensity || 0;

  useEffect(() => {
    actionRef.current = { name: action || "idle", t0: performance.now() };
    if (action && action !== "idle") {
      AudioEngine?.servoClick();
      setTimeout(() => AudioEngine?.servoClick(0.9), 150);
    }
  }, [action]);

  useEffect(() => {
    lookTargetRef.current = lookTarget || { x: 0, y: 0 };
  }, [lookTarget]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const off = document.createElement("canvas");
    off.width = 1000; off.height = 800;
    const oCtx = off.getContext("2d", { willReadFrequently: true });

    let raf, frame = 0;
    let targetMX = 0, targetMY = 0;
    let smoothMX = 0, smoothMY = 0;

    const mouseMove = (e) => {
      targetMX = (e.clientX / window.innerWidth) * 2 - 1;
      targetMY = (e.clientY / window.innerHeight) * 2 - 1;
      const rect = canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / rect.width;
      const cy = (e.clientY - rect.top) / rect.height;
      const dx = cx - 0.5, dy = cy - 0.4;
      hoverProximityRef.current = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2.5);
    };
    window.addEventListener("mousemove", mouseMove);

    const render = () => {
      frame++;
      const now = performance.now();

      const lt = lookTargetRef.current;
      const useLookTarget = lt && (lt.x !== 0 || lt.y !== 0);
      const tx = useLookTarget ? lt.x : targetMX;
      const ty = useLookTarget ? lt.y : targetMY;

      const lerp = 0.12;
      smoothMX += (tx - smoothMX) * lerp;
      smoothMY += (ty - smoothMY) * lerp;
      const mx = smoothMX, my = smoothMY;

      const dx = mx - lastServoRef.current.x;
      const dy = my - lastServoRef.current.y;
      const movAmt = Math.sqrt(dx * dx + dy * dy);
      if (movAmt > 0.15 && now - lastServoRef.current.t > 200) {
        AudioEngine?.servoClick(0.6 + Math.random() * 0.6);
        lastServoRef.current = { x: mx, y: my, t: now };
      }

      oCtx.fillStyle = "rgb(10, 10, 10)";
      oCtx.fillRect(0, 0, 1000, 800);

      const act = actionRef.current;
      const elapsed = (now - act.t0) / 1000;
      const env = Math.max(0, Math.sin(Math.min(elapsed / 1.8, 1) * Math.PI));

      let bodyLean = 0;
      let bodyShift = 0;
      let headBob = 0;
      let headSide = 0;
      let bowForward = 0;

      switch (act.name) {
        case "lean": bodyLean = 0.08 * env; bodyShift = 20 * env; break;
        case "bow": bowForward = 80 * env; bodyLean = 0.05 * env; break;
        case "shake-head": headSide = Math.sin(elapsed * 15) * 30 * env; break;
        case "nod": headBob = Math.sin(elapsed * 8) * 20 * env; break;
        case "think": headSide = 18 * env; headBob = -10 * env; break;
        case "yawn": headBob = 15 * env; break;
        case "sleep": headBob = 40; bowForward = 30; bodyLean = -0.02; break;
        case "startled": bodyLean = -0.03 * env; headBob = -20 * env; break;
        case "typing-down": headBob = 25; break;
        default: break;
      }

      const cl = creepRef.current;
      const creepLean = cl * 0.04;
      const creepDrop = cl * 15;

      const finalLean = bodyLean + creepLean;
      if (finalLean !== 0) {
        oCtx.save();
        const s = 1 + finalLean;
        oCtx.translate(500 * (1 - s) + bodyShift, 800 * (1 - s) + bowForward);
        oCtx.scale(s, s);
      } else if (bodyShift !== 0 || bowForward !== 0) {
        oCtx.save();
        oCtx.translate(bodyShift, bowForward);
      }

      const nX = mx * 14;          const nY = my * 8;
      const aX = mx * 30;          const aY = my * 16;
      const earX = mx * 40;        const earY = my * 24;
      const hX = mx * 80 + headSide;  const hY = my * 50 + headBob + creepDrop;
      const vX = mx * 60;          const vY = my * 35 + headBob + creepDrop;
      const oX = mx * 25;          const oY = my * 18 + headBob + creepDrop;
      const refX = mx * -40;       const refY = my * -25;

      // 1. Body Armor
      const armorG = oCtx.createLinearGradient(200 + aX, 500 + aY, 800 + aX, 800 + aY);
      armorG.addColorStop(0, "rgb(255,255,255)");
      armorG.addColorStop(0.3, "rgb(140,150,160)");
      armorG.addColorStop(0.8, "rgb(20,25,30)");
      armorG.addColorStop(1, "rgb(60,65,70)");
      oCtx.fillStyle = armorG;
      oCtx.beginPath();
      oCtx.moveTo(150 - aX, 800);
      oCtx.quadraticCurveTo(300 + aX * 0.5, 550 + aY, 500 + aX, 560 + aY);
      oCtx.quadraticCurveTo(700 + aX * 0.5, 550 + aY, 850 - aX, 800);
      oCtx.fill();

      oCtx.fillStyle = "rgb(20,22,25)";
      oCtx.beginPath();
      oCtx.moveTo(380 + aX, 800);
      oCtx.lineTo(420 + aX, 600 + aY);
      oCtx.lineTo(580 + aX, 600 + aY);
      oCtx.lineTo(620 + aX, 800);
      oCtx.fill();

      const chestCol =
        stateRef.current === "error"
          ? 1
          : stateRef.current === "scan"
          ? Math.sin(frame * 0.3) * 0.5 + 0.5
          : Math.sin(frame * 0.08) * 0.3 + 0.5;
      oCtx.fillStyle = `rgba(255, 255, 255, ${chestCol})`;
      oCtx.beginPath(); oCtx.arc(470 + aX, 640 + aY, 6, 0, Math.PI * 2); oCtx.fill();
      oCtx.beginPath(); oCtx.arc(500 + aX, 640 + aY, 6, 0, Math.PI * 2); oCtx.fill();
      oCtx.beginPath(); oCtx.arc(530 + aX, 640 + aY, 6, 0, Math.PI * 2); oCtx.fill();

      oCtx.strokeStyle = "rgba(0,0,0,0.6)";
      oCtx.lineWidth = 5;
      oCtx.beginPath(); oCtx.moveTo(250 + aX, 700 + aY); oCtx.lineTo(400 + aX, 650 + aY); oCtx.stroke();
      oCtx.beginPath(); oCtx.moveTo(750 + aX, 700 + aY); oCtx.lineTo(600 + aX, 650 + aY); oCtx.stroke();

      // NECK
      const neckG = oCtx.createLinearGradient(420 + nX, 0, 580 + nX, 0);
      neckG.addColorStop(0, "rgb(5,5,5)");
      neckG.addColorStop(0.3, "rgb(40,40,45)");
      neckG.addColorStop(0.7, "rgb(100,105,110)");
      neckG.addColorStop(1, "rgb(5,5,5)");
      oCtx.fillStyle = neckG;
      oCtx.fillRect(420 + nX, 450 + nY, 160, 160);

      const pistonG = oCtx.createLinearGradient(390 + nX, 0, 415 + nX, 0);
      pistonG.addColorStop(0, "rgb(20,20,20)");
      pistonG.addColorStop(0.5, "rgb(200,200,200)");
      pistonG.addColorStop(1, "rgb(10,10,10)");
      oCtx.fillStyle = pistonG;
      oCtx.fillRect(390 + nX, 480 + nY, 25, 120);
      oCtx.fillRect(585 + nX, 480 + nY, 25, 120);

      oCtx.fillStyle = "rgba(0,0,0,0.8)";
      for (let i = 0; i < 8; i++) oCtx.fillRect(420 + nX, 460 + nY + i * 18, 160, 8);

      // HEAD
      oCtx.save();
      const headCX = 500 + hX, headCY = 300 + hY;
      oCtx.translate(headCX, headCY);
      const headRot =
        mx * 0.06 + (act.name === "shake-head" ? Math.sin(elapsed * 15) * 0.15 * env : 0);
      oCtx.rotate(headRot);
      oCtx.translate(-headCX, -headCY);

      const lightX = 450 + hX - mx * 50;
      const lightY = 200 + hY - my * 50;
      const headG = oCtx.createRadialGradient(lightX, lightY, 20, 500 + hX, 300 + hY, 450);
      headG.addColorStop(0, "rgb(255,255,255)");
      headG.addColorStop(0.2, "rgb(200,210,220)");
      headG.addColorStop(0.6, "rgb(80,85,90)");
      headG.addColorStop(0.9, "rgb(15,18,20)");
      headG.addColorStop(1, "rgb(45,50,55)");
      oCtx.fillStyle = headG;
      oCtx.beginPath();
      oCtx.moveTo(500 + hX, 100 + hY);
      oCtx.bezierCurveTo(700 + hX, 100 + hY, 740 + hX, 300 + hY, 680 + hX, 480 + hY);
      oCtx.quadraticCurveTo(500 + hX, 540 + hY, 320 + hX, 480 + hY);
      oCtx.bezierCurveTo(260 + hX, 300 + hY, 300 + hX, 100 + hY, 500 + hX, 100 + hY);
      oCtx.fill();

      // ears
      const earG = oCtx.createLinearGradient(0, 200, 0, 400);
      earG.addColorStop(0, "rgb(200,200,200)");
      earG.addColorStop(1, "rgb(10,10,10)");
      oCtx.fillStyle = earG;
      oCtx.beginPath(); oCtx.arc(300 + earX, 350 + earY, 40, 0, Math.PI * 2); oCtx.fill();
      oCtx.beginPath(); oCtx.arc(700 + earX, 350 + earY, 40, 0, Math.PI * 2); oCtx.fill();
      oCtx.fillStyle = "rgb(5,5,5)";
      oCtx.beginPath(); oCtx.arc(300 + earX, 350 + earY, 15, 0, Math.PI * 2); oCtx.fill();
      oCtx.beginPath(); oCtx.arc(700 + earX, 350 + earY, 15, 0, Math.PI * 2); oCtx.fill();

      // visor rim
      const rimG = oCtx.createLinearGradient(400 + hX, 150 + hY, 600 + hX, 450 + hY);
      rimG.addColorStop(0, "rgb(80,85,90)");
      rimG.addColorStop(1, "rgb(5,5,5)");
      oCtx.fillStyle = rimG;
      oCtx.beginPath();
      oCtx.moveTo(500 + hX, 170 + hY);
      oCtx.quadraticCurveTo(660 + hX, 200 + hY, 640 + hX, 390 + hY);
      oCtx.quadraticCurveTo(500 + hX, 500 + hY, 360 + hX, 390 + hY);
      oCtx.quadraticCurveTo(340 + hX, 200 + hY, 500 + hX, 170 + hY);
      oCtx.fill();

      // visor glass
      const visG = oCtx.createLinearGradient(400 + vX, 150 + vY, 600 + vX, 450 + vY);
      visG.addColorStop(0, "rgb(50,55,60)");
      visG.addColorStop(0.4, "rgb(4,4,5)");
      visG.addColorStop(0.8, "rgb(0,0,0)");
      visG.addColorStop(1, "rgb(25,25,30)");
      oCtx.fillStyle = visG;
      oCtx.beginPath();
      oCtx.moveTo(500 + vX, 185 + vY);
      oCtx.quadraticCurveTo(640 + vX, 210 + vY, 620 + vX, 375 + vY);
      oCtx.quadraticCurveTo(500 + vX, 470 + vY, 380 + vX, 375 + vY);
      oCtx.quadraticCurveTo(360 + vX, 210 + vY, 500 + vX, 185 + vY);
      oCtx.fill();

      // eyes
      const centerX = 500 + oX;
      const eyeY = 320 + oY;
      const eyes = [centerX - 65, centerX + 65];
      const isSleep = act.name === "sleep" || stateRef.current === "sleep";
      const isYawn = act.name === "yawn";
      const isBlink = stateRef.current === "idle" && !isSleep && frame % 250 > 240;
      const prox = hoverProximityRef.current;
      const typ = typingRef.current;

      eyes.forEach((ex) => {
        oCtx.fillStyle = "rgba(0,0,0,0.9)";
        oCtx.beginPath(); oCtx.arc(ex, eyeY, 55, 0, Math.PI * 2); oCtx.fill();

        const casingG = oCtx.createLinearGradient(ex - 45, eyeY - 45, ex + 45, eyeY + 45);
        casingG.addColorStop(0, "rgb(180,180,180)");
        casingG.addColorStop(0.5, "rgb(20,20,20)");
        casingG.addColorStop(1, "rgb(90,90,90)");
        oCtx.fillStyle = casingG;
        oCtx.beginPath(); oCtx.arc(ex, eyeY, 48, 0, Math.PI * 2); oCtx.fill();

        const lensG = oCtx.createRadialGradient(ex - 15, eyeY - 15, 2, ex, eyeY, 45);
        lensG.addColorStop(0, "rgb(45,45,50)");
        lensG.addColorStop(0.4, "rgb(8,8,10)");
        lensG.addColorStop(1, "rgb(0,0,0)");
        oCtx.fillStyle = lensG;
        oCtx.beginPath(); oCtx.arc(ex, eyeY, 40, 0, Math.PI * 2); oCtx.fill();

        oCtx.fillStyle = "rgba(255,255,255,0.2)";
        oCtx.beginPath(); oCtx.arc(ex - 12, eyeY - 12, 15, 0, Math.PI * 2); oCtx.fill();
      });

      eyes.forEach((ex) => {
        if (isSleep) {
          oCtx.fillStyle = "rgb(120,120,120)";
          oCtx.fillRect(ex - 30, eyeY - 2, 60, 4);
          return;
        }
        if (isYawn) {
          oCtx.fillStyle = "rgb(180,180,180)";
          oCtx.fillRect(ex - 30, eyeY - 3, 60, 6);
          return;
        }
        if (stateRef.current === "error") {
          const intensity = cl >= 2 ? 1.0 : 0.6;
          const ringR = cl >= 2 ? 25 : 18;
          oCtx.strokeStyle = `rgba(255,255,255,${intensity})`;
          oCtx.lineWidth = cl >= 2 ? 6 : 4;
          oCtx.beginPath(); oCtx.arc(ex, eyeY, ringR, 0, Math.PI * 2); oCtx.stroke();
          oCtx.fillStyle = `rgba(255,255,255,${intensity})`;
          oCtx.beginPath(); oCtx.arc(ex, eyeY, cl >= 2 ? 12 : 8, 0, Math.PI * 2); oCtx.fill();
        } else if (stateRef.current === "success") {
          const rr = 10 + Math.abs(Math.sin(frame * 0.2)) * (22 - cl * 6);
          oCtx.strokeStyle = `rgba(255,255,255,${Math.min(1, 0.8 + cl * 0.1)})`;
          oCtx.lineWidth = 8 - cl;
          oCtx.beginPath(); oCtx.arc(ex, eyeY, rr, 0, Math.PI * 2); oCtx.stroke();
          oCtx.fillStyle = `rgba(255,255,255,${Math.min(1, 0.8 + cl * 0.1)})`;
          oCtx.beginPath(); oCtx.arc(ex, eyeY, 8 + cl * 3, 0, Math.PI * 2); oCtx.fill();
        } else if (stateRef.current === "scan") {
          const sw = (frame * 0.08) % (Math.PI * 2);
          oCtx.strokeStyle = "rgba(255,255,255,0.9)"; oCtx.lineWidth = 3;
          for (let r = 0; r < 3; r++) {
            const a = sw + r * ((Math.PI * 2) / 3);
            oCtx.beginPath(); oCtx.moveTo(ex, eyeY);
            oCtx.lineTo(ex + Math.cos(a) * 38, eyeY + Math.sin(a) * 38);
            oCtx.stroke();
          }
          oCtx.strokeStyle = "rgba(255,255,255,0.4)"; oCtx.lineWidth = 2;
          oCtx.beginPath(); oCtx.arc(ex, eyeY, 20, 0, Math.PI * 2); oCtx.stroke();
          oCtx.beginPath(); oCtx.arc(ex, eyeY, 35, 0, Math.PI * 2); oCtx.stroke();
          oCtx.fillStyle = "rgb(255,255,255)";
          oCtx.beginPath(); oCtx.arc(ex, eyeY, 4, 0, Math.PI * 2); oCtx.fill();
        } else if (isBlink) {
          oCtx.fillStyle = "rgb(200,200,200)";
          oCtx.fillRect(ex - 35, eyeY - 2, 70, 4);
        } else if (stateRef.current === "typing" || typ > 0.1) {
          const r1 = 15 + Math.sin(frame * 0.4) * 4 + typ * 3;
          const r2 = 26 + Math.cos(frame * 0.3) * 4 + typ * 5;
          oCtx.strokeStyle = "rgb(220,220,220)"; oCtx.lineWidth = 3;
          oCtx.beginPath(); oCtx.arc(ex, eyeY, r1, 0, Math.PI * 2); oCtx.stroke();
          oCtx.strokeStyle = "rgb(150,150,150)"; oCtx.lineWidth = 2;
          oCtx.beginPath(); oCtx.arc(ex, eyeY, r2, 0, Math.PI * 2); oCtx.stroke();
          oCtx.fillStyle = "rgb(255,255,255)";
          oCtx.beginPath(); oCtx.arc(ex, eyeY, 5, 0, Math.PI * 2); oCtx.fill();
        } else {
          const baseA = 0.3 + prox * 0.5;
          const coreA = baseA + Math.sin(frame * 0.05) * 0.2;
          const ringS = 18 + prox * 8;
          const coreS = 9 + prox * 5;
          oCtx.strokeStyle = `rgba(255,255,255,${baseA + 0.1})`;
          oCtx.lineWidth = 3 + prox * 3;
          oCtx.beginPath(); oCtx.arc(ex, eyeY, ringS, 0, Math.PI * 2); oCtx.stroke();
          oCtx.fillStyle = `rgba(255,255,255,${coreA})`;
          oCtx.beginPath(); oCtx.arc(ex, eyeY, coreS, 0, Math.PI * 2); oCtx.fill();
        }
      });

      // nose
      oCtx.fillStyle = "rgb(10,10,10)";
      oCtx.beginPath(); oCtx.arc(centerX, eyeY + 55, 14, 0, Math.PI * 2); oCtx.fill();

      // ZZZ
      if (isSleep) {
        oCtx.fillStyle = "rgba(255,255,255,0.8)";
        oCtx.font = "bold 48px monospace";
        const phase = (frame * 0.02) % 3;
        ["Z", "Z", "Z"].forEach((z, i) => {
          const alpha = Math.max(0, 1 - Math.abs(phase - i) * 0.5);
          oCtx.fillStyle = `rgba(255,255,255,${alpha * 0.8})`;
          oCtx.fillText(z, 650 + i * 35, 150 - i * 30);
        });
      }

      // visor reflection
      oCtx.save();
      oCtx.beginPath();
      oCtx.moveTo(500 + vX, 185 + vY);
      oCtx.quadraticCurveTo(640 + vX, 210 + vY, 620 + vX, 375 + vY);
      oCtx.quadraticCurveTo(500 + vX, 470 + vY, 380 + vX, 375 + vY);
      oCtx.quadraticCurveTo(360 + vX, 210 + vY, 500 + vX, 185 + vY);
      oCtx.clip();
      oCtx.fillStyle = "rgba(255,255,255,0.15)";
      oCtx.beginPath();
      oCtx.moveTo(300 + refX, 100 + refY);
      oCtx.lineTo(600 + refX, 150 + refY);
      oCtx.quadraticCurveTo(500 + refX, 350 + refY, 350 + refX, 400 + refY);
      oCtx.fill();
      oCtx.restore();
      oCtx.restore(); // head rotation

      // typing hands
      if (stateRef.current === "typing" || act.name === "typing-down" || typ > 0.3) {
        const tf = Math.floor(frame / 4) % 2;
        const fX = mx * 80, fY = my * 40;
        oCtx.fillStyle = "rgb(200,205,210)";
        oCtx.strokeStyle = "rgb(20,20,20)"; oCtx.lineWidth = 6;
        const draw = (x, y, w, h) => {
          oCtx.beginPath();
          if (oCtx.roundRect) oCtx.roundRect(x, y, w, h, 10);
          else oCtx.rect(x, y, w, h);
          oCtx.fill();
          oCtx.strokeRect(x, y, w, h);
        };
        if (tf === 0) {
          draw(250 + fX, 700 + fY, 40, 120); draw(310 + fX, 720 + fY, 40, 100);
          draw(650 + fX, 750 + fY, 40, 100); draw(710 + fX, 730 + fY, 40, 120);
        } else {
          draw(250 + fX, 750 + fY, 40, 100); draw(310 + fX, 730 + fY, 40, 120);
          draw(650 + fX, 700 + fY, 40, 120); draw(710 + fX, 720 + fY, 40, 100);
        }
      }

      if (finalLean !== 0 || bodyShift !== 0 || bowForward !== 0) oCtx.restore();

      // Bayer dither
      const img = oCtx.getImageData(0, 0, 1000, 800);
      const d = img.data;
      for (let y = 0; y < 800; y++) {
        for (let x = 0; x < 1000; x++) {
          const idx = (y * 1000 + x) * 4;
          const luma = d[idx] * 0.299 + d[idx + 1] * 0.587 + d[idx + 2] * 0.114;
          const t = (BAYER[y % 8][x % 8] / 64) * 255;
          const on = luma > t;
          d[idx] = 255; d[idx + 1] = 255; d[idx + 2] = 255;
          d[idx + 3] = on ? 255 : 0;
        }
      }
      oCtx.putImageData(img, 0, 0);

      // Glitch
      if (glitchRef.current > 0) {
        const g = glitchRef.current;
        const sliceCount = Math.floor(g * 20);
        for (let i = 0; i < sliceCount; i++) {
          const y = Math.floor(Math.random() * 800);
          const h = Math.floor(Math.random() * 30 + 5);
          const offset = Math.floor((Math.random() - 0.5) * g * 150);
          const sh = Math.min(h, 800 - y);
          if (sh > 0) {
            const slice = oCtx.getImageData(0, y, 1000, sh);
            oCtx.putImageData(slice, offset, y);
          }
        }
        if (g > 0.6) {
          for (let i = 0; i < Math.floor(g * 5); i++) {
            const by = Math.floor(Math.random() * 800);
            oCtx.fillStyle = `rgba(255,255,255,${g * 0.5})`;
            oCtx.fillRect(0, by, 1000, Math.random() * 4 + 1);
          }
        }
        glitchRef.current = Math.max(0, g - 0.03);
      }

      // proximity scan line
      if (prox > 0.3) {
        const sy = (frame * 3) % 800;
        oCtx.fillStyle = `rgba(255,255,255,${(prox - 0.3) * 0.6})`;
        oCtx.fillRect(0, sy, 1000, 2);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height);

      raf = requestAnimationFrame(render);
    };
    render();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", mouseMove);
    };
  }, [glitchRef]);

  const statusLabel = (() => {
    if (avatarState === "sleep") return "[ UNIT_STATUS: SLEEP_MODE ]";
    if (creepLevel >= 2) return "[ WARNING: CONTAINMENT FAILING ]";
    if (creepLevel >= 1) return "[ STATUS: WATCHING YOU ]";
    return `[ UNIT_STATUS: ${avatarState.toUpperCase()} ]`;
  })();

  return (
    <div
      className="relative cursor-pointer w-full h-full flex items-center justify-center bg-black"
      onClick={onAvatarClick}
    >
      <canvas
        ref={canvasRef}
        width={1000}
        height={800}
        className="w-full h-full object-contain"
        style={{ imageRendering: "pixelated" }}
      />
      <div
        className={`absolute top-3 right-3 text-[10px] md:text-xs font-mono bg-black px-2 py-1 rounded border ${
          creepLevel >= 2
            ? "text-white border-white animate-pulse"
            : creepLevel >= 1
            ? "text-gray-300 border-gray-600 animate-pulse"
            : avatarState === "sleep"
            ? "text-gray-600 border-gray-800"
            : "text-gray-400 border-gray-800 animate-pulse"
        }`}
      >
        {statusLabel}
      </div>
      <div className="absolute top-3 left-3 text-[10px] font-mono text-gray-600 border border-gray-800 px-2 py-1 bg-black">
        V-UNIT · REV.7 ·{" "}
        {action && action !== "idle" ? `ACTION:${action.toUpperCase()}` : "STANDBY"}
      </div>
      <SpeechBubble text={speech} />
    </div>
  );
}

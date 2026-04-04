import React, { useState, useEffect, useRef } from 'react';

// ANSI Shadow ASCII Art
const HEADER_ASCII = `
██╗   ██╗██╗   ██╗███████╗███████╗███╗   ██╗    ██╗  ██╗██╗███████╗
╚██╗ ██╔╝██║   ██║██╔════╝██╔════╝████╗  ██║    ╚██╗██╔╝██║██╔════╝
 ╚████╔╝ ██║   ██║███████╗█████╗  ██╔██╗ ██║     ╚███╔╝ ██║█████╗
  ╚██╔╝  ██║   ██║╚════██║██╔══╝  ██║╚██╗██║     ██╔██╗ ██║██╔══╝
   ██║   ╚██████╔╝███████║███████╗██║ ╚████║    ██╔╝ ██╗██║███████╗
   ╚═╝    ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═══╝    ╚═╝  ╚═╝╚═╝╚══════╝
`;

// Pixel Avatar with Bayer Dithering
// Speech bubble with typewriter effect
const SpeechBubble = ({ text }) => {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    setDisplayed('');
    indexRef.current = 0;
    if (!text) return;
    const interval = setInterval(() => {
      indexRef.current++;
      setDisplayed(text.slice(0, indexRef.current));
      if (indexRef.current >= text.length) clearInterval(interval);
    }, 15);
    return () => clearInterval(interval);
  }, [text]);

  if (!text) return null;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-[85%] z-20 pointer-events-none">
      <div className="bg-black border border-gray-600 rounded px-3 py-2 text-sm text-white font-mono relative">
        <span>{displayed}</span>
        {displayed.length < text.length && <span className="animate-pulse">_</span>}
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-gray-600"></div>
      </div>
    </div>
  );
};

// Blackout + hack sequence — renders directly into a portal-style div
// All content managed by parent via `blackoutContent` state


const PixelAvatar = ({ avatarState, onAvatarClick, glitchRef: externalGlitchRef, speech, creepLevel = 0 }) => {
  const canvasRef = useRef(null);
  const glitchRef = externalGlitchRef || { current: 0 };
  const hoverProximityRef = useRef(0);
  const creepRef = useRef(0);
  creepRef.current = creepLevel;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const offCanvas = document.createElement('canvas');
    offCanvas.width = 1000;
    offCanvas.height = 800;
    const oCtx = offCanvas.getContext('2d', { willReadFrequently: true });

    let animationFrameId;
    let frameCount = 0;

    // Raw mouse target + smoothed (lerped) for fluid 3D inertia
    let targetMX = 0, targetMY = 0;
    let smoothMX = 0, smoothMY = 0;

    const handleMouseMove = (e) => {
      targetMX = (e.clientX / window.innerWidth) * 2 - 1;
      targetMY = (e.clientY / window.innerHeight) * 2 - 1;
      const rect = canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / rect.width;
      const cy = (e.clientY - rect.top) / rect.height;
      const dx = cx - 0.5, dy = cy - 0.4;
      hoverProximityRef.current = Math.max(0, 1 - Math.sqrt(dx*dx + dy*dy) * 2.5);
    };
    window.addEventListener('mousemove', handleMouseMove);

    // 8x8 Bayer matrix
    const bayer8x8 = [
      [ 0, 48, 12, 60,  3, 51, 15, 63],
      [32, 16, 44, 28, 35, 19, 47, 31],
      [ 8, 56,  4, 52, 11, 59,  7, 55],
      [40, 24, 36, 20, 43, 27, 39, 23],
      [ 2, 50, 14, 62,  1, 49, 13, 61],
      [34, 18, 46, 30, 33, 17, 45, 29],
      [10, 58,  6, 54,  9, 57,  5, 53],
      [42, 26, 38, 22, 41, 25, 37, 21]
    ];

    const render = () => {
      frameCount++;

      // Smooth interpolation (inertia) — makes head feel heavy/physical
      const lerp = 0.08;
      smoothMX += (targetMX - smoothMX) * lerp;
      smoothMY += (targetMY - smoothMY) * lerp;
      const mx = smoothMX;
      const my = smoothMY;

      oCtx.fillStyle = 'rgb(10, 10, 10)';
      oCtx.fillRect(0, 0, 1000, 800);

      // Creep posture: robot leans forward (scale up) + head drops (menacing)
      const cl = creepRef.current;
      const lean = cl * 0.04; // scale increase per level
      const headDrop = cl * 15; // head moves down = looking up at you
      const headLean = cl * 8; // head comes forward

      // Apply scale transform for "leaning in" effect
      if (cl > 0) {
        oCtx.save();
        const s = 1 + lean;
        oCtx.translate(500 * (1 - s), 800 * (1 - s)); // scale from bottom-center
        oCtx.scale(s, s);
      }

      // Multi-plane parallax (amplified for stronger 3D)
      const nX = mx * 12;   const nY = my * 6;
      const aX = mx * 28;   const aY = my * 14;
      const earX = mx * 35;  const earY = my * 20;
      const hX = mx * 65;   const hY = my * 35 + headDrop;
      const vX = mx * 50;   const vY = my * 28 + headDrop;
      const oX = mx * 18;   const oY = my * 12 + headDrop;
      const refX = mx * -35; const refY = my * -20;

      // 1. Body Armor
      const armorGrad = oCtx.createLinearGradient(200 + aX, 500 + aY, 800 + aX, 800 + aY);
      armorGrad.addColorStop(0, 'rgb(255, 255, 255)');
      armorGrad.addColorStop(0.3, 'rgb(140, 150, 160)');
      armorGrad.addColorStop(0.8, 'rgb(20, 25, 30)');
      armorGrad.addColorStop(1, 'rgb(60, 65, 70)');

      oCtx.fillStyle = armorGrad;
      oCtx.beginPath();
      oCtx.moveTo(150 - aX, 800);
      oCtx.quadraticCurveTo(300 + aX*0.5, 550 + aY, 500 + aX, 560 + aY);
      oCtx.quadraticCurveTo(700 + aX*0.5, 550 + aY, 850 - aX, 800);
      oCtx.fill();

      oCtx.fillStyle = 'rgb(20, 22, 25)';
      oCtx.beginPath();
      oCtx.moveTo(380 + aX, 800);
      oCtx.lineTo(420 + aX, 600 + aY);
      oCtx.lineTo(580 + aX, 600 + aY);
      oCtx.lineTo(620 + aX, 800);
      oCtx.fill();

      oCtx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      oCtx.lineWidth = 5;
      oCtx.beginPath(); oCtx.moveTo(250 + aX, 700 + aY); oCtx.lineTo(400 + aX, 650 + aY); oCtx.stroke();
      oCtx.beginPath(); oCtx.moveTo(750 + aX, 700 + aY); oCtx.lineTo(600 + aX, 650 + aY); oCtx.stroke();

      // 2. Mechanical Neck
      const neckGrad = oCtx.createLinearGradient(420 + nX, 0, 580 + nX, 0);
      neckGrad.addColorStop(0, 'rgb(5, 5, 5)');
      neckGrad.addColorStop(0.3, 'rgb(40, 40, 45)');
      neckGrad.addColorStop(0.7, 'rgb(100, 105, 110)');
      neckGrad.addColorStop(1, 'rgb(5, 5, 5)');

      oCtx.fillStyle = neckGrad;
      oCtx.fillRect(420 + nX, 450 + nY, 160, 160);

      const pistonGrad = oCtx.createLinearGradient(390 + nX, 0, 415 + nX, 0);
      pistonGrad.addColorStop(0, 'rgb(20, 20, 20)');
      pistonGrad.addColorStop(0.5, 'rgb(200, 200, 200)');
      pistonGrad.addColorStop(1, 'rgb(10, 10, 10)');

      oCtx.fillStyle = pistonGrad;
      oCtx.fillRect(390 + nX, 480 + nY, 25, 120);
      oCtx.fillRect(585 + nX, 480 + nY, 25, 120);

      oCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      for(let i=0; i<8; i++) {
        oCtx.fillRect(420 + nX, 460 + nY + i*18, 160, 8);
      }

      // 3. Head Dome (with tilt rotation for 3D)
      oCtx.save();
      const headCX = 500 + hX, headCY = 300 + hY;
      oCtx.translate(headCX, headCY);
      oCtx.rotate(mx * 0.04); // subtle tilt
      oCtx.translate(-headCX, -headCY);

      const lightX = 450 + hX - mx * 40;
      const lightY = 200 + hY - my * 40;

      const headGrad = oCtx.createRadialGradient(lightX, lightY, 20, 500+hX, 300+hY, 450);
      headGrad.addColorStop(0, 'rgb(255, 255, 255)');
      headGrad.addColorStop(0.2, 'rgb(200, 210, 220)');
      headGrad.addColorStop(0.6, 'rgb(80, 85, 90)');
      headGrad.addColorStop(0.9, 'rgb(15, 18, 20)');
      headGrad.addColorStop(1, 'rgb(45, 50, 55)');

      oCtx.fillStyle = headGrad;
      oCtx.beginPath();
      oCtx.moveTo(500 + hX, 100 + hY);
      oCtx.bezierCurveTo(700 + hX, 100 + hY, 740 + hX, 300 + hY, 680 + hX, 480 + hY);
      oCtx.quadraticCurveTo(500 + hX, 540 + hY, 320 + hX, 480 + hY);
      oCtx.bezierCurveTo(260 + hX, 300 + hY, 300 + hX, 100 + hY, 500 + hX, 100 + hY);
      oCtx.fill();

      // Ear joints
      const earGrad = oCtx.createLinearGradient(0, 200, 0, 400);
      earGrad.addColorStop(0, 'rgb(200, 200, 200)');
      earGrad.addColorStop(1, 'rgb(10, 10, 10)');
      oCtx.fillStyle = earGrad;
      oCtx.beginPath(); oCtx.arc(300 + earX, 350 + earY, 40, 0, Math.PI*2); oCtx.fill();
      oCtx.beginPath(); oCtx.arc(700 + earX, 350 + earY, 40, 0, Math.PI*2); oCtx.fill();
      oCtx.fillStyle = 'rgb(5,5,5)';
      oCtx.beginPath(); oCtx.arc(300 + earX, 350 + earY, 15, 0, Math.PI*2); oCtx.fill();
      oCtx.beginPath(); oCtx.arc(700 + earX, 350 + earY, 15, 0, Math.PI*2); oCtx.fill();

      // 4. Visor Rim
      const rimGrad = oCtx.createLinearGradient(400+hX, 150+hY, 600+hX, 450+hY);
      rimGrad.addColorStop(0, 'rgb(80, 85, 90)');
      rimGrad.addColorStop(1, 'rgb(5, 5, 5)');
      oCtx.fillStyle = rimGrad;
      oCtx.beginPath();
      oCtx.moveTo(500 + hX, 170 + hY);
      oCtx.quadraticCurveTo(660 + hX, 200 + hY, 640 + hX, 390 + hY);
      oCtx.quadraticCurveTo(500 + hX, 500 + hY, 360 + hX, 390 + hY);
      oCtx.quadraticCurveTo(340 + hX, 200 + hY, 500 + hX, 170 + hY);
      oCtx.fill();

      // 5. Recessed Glass
      const visorGrad = oCtx.createLinearGradient(400+vX, 150+vY, 600+vX, 450+vY);
      visorGrad.addColorStop(0, 'rgb(50, 55, 60)');
      visorGrad.addColorStop(0.4, 'rgb(4, 4, 5)');
      visorGrad.addColorStop(0.8, 'rgb(0, 0, 0)');
      visorGrad.addColorStop(1, 'rgb(25, 25, 30)');

      oCtx.fillStyle = visorGrad;
      oCtx.beginPath();
      oCtx.moveTo(500 + vX, 185 + vY);
      oCtx.quadraticCurveTo(640 + vX, 210 + vY, 620 + vX, 375 + vY);
      oCtx.quadraticCurveTo(500 + vX, 470 + vY, 380 + vX, 375 + vY);
      oCtx.quadraticCurveTo(360 + vX, 210 + vY, 500 + vX, 185 + vY);
      oCtx.fill();

      // 6. Optics (eyes)
      const centerX = 500 + oX;
      const eyeY = 320 + oY;
      const eyeSpacing = 130;

      const leftEyeX = centerX - eyeSpacing / 2;
      const rightEyeX = centerX + eyeSpacing / 2;
      const eyes = [leftEyeX, rightEyeX];

      eyes.forEach(ex => {
        oCtx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        oCtx.beginPath(); oCtx.arc(ex, eyeY, 55, 0, Math.PI*2); oCtx.fill();

        const casingGrad = oCtx.createLinearGradient(ex-45, eyeY-45, ex+45, eyeY+45);
        casingGrad.addColorStop(0, 'rgb(180, 180, 180)');
        casingGrad.addColorStop(0.5, 'rgb(20, 20, 20)');
        casingGrad.addColorStop(1, 'rgb(90, 90, 90)');
        oCtx.fillStyle = casingGrad;
        oCtx.beginPath(); oCtx.arc(ex, eyeY, 48, 0, Math.PI*2); oCtx.fill();

        const lensGrad = oCtx.createRadialGradient(ex-15, eyeY-15, 2, ex, eyeY, 45);
        lensGrad.addColorStop(0, 'rgb(45, 45, 50)');
        lensGrad.addColorStop(0.4, 'rgb(8, 8, 10)');
        lensGrad.addColorStop(1, 'rgb(0, 0, 0)');
        oCtx.fillStyle = lensGrad;
        oCtx.beginPath(); oCtx.arc(ex, eyeY, 40, 0, Math.PI*2); oCtx.fill();

        oCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        oCtx.beginPath(); oCtx.arc(ex-12, eyeY-12, 15, 0, Math.PI*2); oCtx.fill();
      });

      // Eye state animations
      const isBlink = avatarState === 'idle' && (frameCount % 250 > 240);
      const proximity = hoverProximityRef.current;

      eyes.forEach(ex => {
        if (avatarState === 'error') {
          // Keep original eye structure, intensify glow
          const intensity = cl >= 2 ? 1.0 : 0.6;
          const ringR = cl >= 2 ? 25 : 18;
          oCtx.strokeStyle = `rgba(255, 255, 255, ${intensity})`; oCtx.lineWidth = cl >= 2 ? 6 : 4;
          oCtx.beginPath(); oCtx.arc(ex, eyeY, ringR, 0, Math.PI*2); oCtx.stroke();
          oCtx.fillStyle = `rgba(255, 255, 255, ${intensity})`;
          oCtx.beginPath(); oCtx.arc(ex, eyeY, cl >= 2 ? 12 : 8, 0, Math.PI*2); oCtx.fill();
          if (cl >= 2 && Math.random() > 0.4) {
            oCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)'; oCtx.lineWidth = 1;
            oCtx.beginPath(); oCtx.arc(ex, eyeY, 32 + Math.random() * 5, 0, Math.PI*2); oCtx.stroke();
          }
        } else if (avatarState === 'success') {
          // Original eye style, scaled by creep
          const ringRadius = 10 + Math.abs(Math.sin(frameCount * 0.2)) * (22 - cl * 6);
          const coreR = 8 + cl * 3;
          const alpha = Math.min(1, 0.8 + cl * 0.1);
          oCtx.strokeStyle = `rgba(255, 255, 255, ${alpha})`; oCtx.lineWidth = 8 - cl;
          oCtx.beginPath(); oCtx.arc(ex, eyeY, ringRadius, 0, Math.PI*2); oCtx.stroke();
          oCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          oCtx.beginPath(); oCtx.arc(ex, eyeY, coreR, 0, Math.PI*2); oCtx.fill();
        } else if (avatarState === 'scan') {
          // Scanning: rotating radar sweep
          const sweepAngle = (frameCount * 0.08) % (Math.PI * 2);
          oCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; oCtx.lineWidth = 3;
          for (let r = 0; r < 3; r++) {
            const a = sweepAngle + r * (Math.PI * 2 / 3);
            oCtx.beginPath();
            oCtx.moveTo(ex, eyeY);
            oCtx.lineTo(ex + Math.cos(a) * 38, eyeY + Math.sin(a) * 38);
            oCtx.stroke();
          }
          oCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; oCtx.lineWidth = 2;
          oCtx.beginPath(); oCtx.arc(ex, eyeY, 20, 0, Math.PI*2); oCtx.stroke();
          oCtx.beginPath(); oCtx.arc(ex, eyeY, 35, 0, Math.PI*2); oCtx.stroke();
          oCtx.fillStyle = 'rgb(255, 255, 255)';
          oCtx.beginPath(); oCtx.arc(ex, eyeY, 4, 0, Math.PI*2); oCtx.fill();
        } else if (isBlink) {
          oCtx.fillStyle = 'rgb(200, 200, 200)'; oCtx.fillRect(ex - 35, eyeY - 2, 70, 4);
        } else if (avatarState === 'typing') {
          const ring1 = 15 + Math.sin(frameCount * 0.4) * 4;
          const ring2 = 26 + Math.cos(frameCount * 0.3) * 4;
          oCtx.strokeStyle = 'rgb(220, 220, 220)'; oCtx.lineWidth = 3;
          oCtx.beginPath(); oCtx.arc(ex, eyeY, ring1, 0, Math.PI*2); oCtx.stroke();
          oCtx.strokeStyle = 'rgb(150, 150, 150)'; oCtx.lineWidth = 2;
          oCtx.beginPath(); oCtx.arc(ex, eyeY, ring2, 0, Math.PI*2); oCtx.stroke();
          oCtx.fillStyle = 'rgb(255, 255, 255)';
          oCtx.beginPath(); oCtx.arc(ex, eyeY, 5, 0, Math.PI*2); oCtx.fill();
        } else {
          // Idle: proximity-reactive glow (original clean design)
          const baseAlpha = 0.3 + proximity * 0.5;
          const coreAlpha = baseAlpha + Math.sin(frameCount * 0.05) * 0.2;
          const ringSize = 18 + proximity * 8;
          const coreSize = 9 + proximity * 5;
          oCtx.strokeStyle = `rgba(255, 255, 255, ${baseAlpha + 0.1})`; oCtx.lineWidth = 3 + proximity * 3;
          oCtx.beginPath(); oCtx.arc(ex, eyeY, ringSize, 0, Math.PI*2); oCtx.stroke();
          if (proximity > 0.5) {
            oCtx.strokeStyle = `rgba(255, 255, 255, ${(proximity - 0.5) * 0.4})`; oCtx.lineWidth = 1;
            oCtx.beginPath(); oCtx.arc(ex, eyeY, ringSize + 10, 0, Math.PI*2); oCtx.stroke();
          }
          oCtx.fillStyle = `rgba(255, 255, 255, ${coreAlpha})`;
          oCtx.beginPath(); oCtx.arc(ex, eyeY, coreSize, 0, Math.PI*2); oCtx.fill();
        }
      });

      // Nose radar
      oCtx.fillStyle = 'rgb(10, 10, 10)';
      oCtx.beginPath(); oCtx.arc(centerX, eyeY + 55, 14, 0, Math.PI*2); oCtx.fill();
      oCtx.fillStyle = 'rgb(150, 150, 150)';
      oCtx.beginPath(); oCtx.arc(centerX - 3, eyeY + 52, 4, 0, Math.PI*2); oCtx.fill();

      // 7. Visor glass reflection (inverse parallax)
      oCtx.save();
      oCtx.beginPath();
      oCtx.moveTo(500 + vX, 185 + vY);
      oCtx.quadraticCurveTo(640 + vX, 210 + vY, 620 + vX, 375 + vY);
      oCtx.quadraticCurveTo(500 + vX, 470 + vY, 380 + vX, 375 + vY);
      oCtx.quadraticCurveTo(360 + vX, 210 + vY, 500 + vX, 185 + vY);
      oCtx.clip();

      oCtx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      oCtx.beginPath();
      oCtx.moveTo(300 + refX, 100 + refY);
      oCtx.lineTo(600 + refX, 150 + refY);
      oCtx.quadraticCurveTo(500 + refX, 350 + refY, 350 + refX, 400 + refY);
      oCtx.fill();

      oCtx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      oCtx.beginPath();
      oCtx.moveTo(700 + refX, 150 + refY);
      oCtx.lineTo(650 + refX, 450 + refY);
      oCtx.lineTo(750 + refX, 400 + refY);
      oCtx.fill();

      oCtx.restore(); // end visor clip
      oCtx.restore(); // end head tilt rotation

      // 8. Typing hands (foreground)
      if (avatarState === 'typing') {
        const typeFrame = Math.floor(frameCount / 4) % 2;
        const fX = mx * 80;
        const fY = my * 40;

        oCtx.fillStyle = 'rgb(200, 205, 210)';
        oCtx.strokeStyle = 'rgb(20, 20, 20)';
        oCtx.lineWidth = 6;

        if (typeFrame === 0) {
            oCtx.beginPath(); oCtx.roundRect(250+fX, 700+fY, 40, 120, 10); oCtx.fill(); oCtx.strokeRect(250+fX, 700+fY, 40, 120);
            oCtx.beginPath(); oCtx.roundRect(310+fX, 720+fY, 40, 100, 10); oCtx.fill(); oCtx.strokeRect(310+fX, 720+fY, 40, 100);
            oCtx.beginPath(); oCtx.roundRect(650+fX, 750+fY, 40, 100, 10); oCtx.fill(); oCtx.strokeRect(650+fX, 750+fY, 40, 100);
            oCtx.beginPath(); oCtx.roundRect(710+fX, 730+fY, 40, 120, 10); oCtx.fill(); oCtx.strokeRect(710+fX, 730+fY, 40, 120);
        } else {
            oCtx.beginPath(); oCtx.roundRect(250+fX, 750+fY, 40, 100, 10); oCtx.fill(); oCtx.strokeRect(250+fX, 750+fY, 40, 100);
            oCtx.beginPath(); oCtx.roundRect(310+fX, 730+fY, 40, 120, 10); oCtx.fill(); oCtx.strokeRect(310+fX, 730+fY, 40, 120);
            oCtx.beginPath(); oCtx.roundRect(650+fX, 700+fY, 40, 120, 10); oCtx.fill(); oCtx.strokeRect(650+fX, 700+fY, 40, 120);
            oCtx.beginPath(); oCtx.roundRect(710+fX, 720+fY, 40, 100, 10); oCtx.fill(); oCtx.strokeRect(710+fX, 720+fY, 40, 100);
        }
      }

      // Restore lean scale
      if (cl > 0) oCtx.restore();

      // 9. Bayer Dithering
      const imgData = oCtx.getImageData(0, 0, 1000, 800);
      const data = imgData.data;

      for(let y = 0; y < 800; y++) {
          for(let x = 0; x < 1000; x++) {
              const idx = (y * 1000 + x) * 4;
              const luma = data[idx]*0.299 + data[idx+1]*0.587 + data[idx+2]*0.114;
              const threshold = (bayer8x8[y % 8][x % 8] / 64) * 255;
              const isBright = luma > threshold;
              data[idx] = 255; data[idx+1] = 255; data[idx+2] = 255;
              data[idx+3] = isBright ? 255 : 0;
          }
      }
      oCtx.putImageData(imgData, 0, 0);

      // 10. Glitch effect (triggered on click, decays over time)
      if (glitchRef.current > 0) {
        const g = glitchRef.current;

        // Horizontal slice displacement (more slices, bigger offset)
        const sliceCount = Math.floor(g * 20);
        for (let i = 0; i < sliceCount; i++) {
          const y = Math.floor(Math.random() * 800);
          const h = Math.floor(Math.random() * 30 + 5);
          const offset = Math.floor((Math.random() - 0.5) * g * 150);
          const sliceH = Math.min(h, 800 - y);
          if (sliceH > 0) {
            const slice = oCtx.getImageData(0, y, 1000, sliceH);
            oCtx.putImageData(slice, offset, y);
          }
        }

        // White flash bars
        if (g > 0.6) {
          for (let i = 0; i < Math.floor(g * 5); i++) {
            const barY = Math.floor(Math.random() * 800);
            oCtx.fillStyle = `rgba(255, 255, 255, ${g * 0.5})`;
            oCtx.fillRect(0, barY, 1000, Math.random() * 4 + 1);
          }
        }

        // Block corruption (random inverted blocks)
        if (g > 0.4) {
          for (let i = 0; i < Math.floor(g * 6); i++) {
            const bx = Math.floor(Math.random() * 900);
            const by = Math.floor(Math.random() * 700);
            const bw = Math.floor(Math.random() * 120 + 30);
            const bh = Math.floor(Math.random() * 15 + 3);
            const blockData = oCtx.getImageData(bx, by, Math.min(bw, 1000 - bx), Math.min(bh, 800 - by));
            const bd = blockData.data;
            for (let p = 0; p < bd.length; p += 4) {
              bd[p] = 255 - bd[p];
              bd[p+1] = 255 - bd[p+1];
              bd[p+2] = 255 - bd[p+2];
            }
            oCtx.putImageData(blockData, bx + Math.floor((Math.random()-0.5) * 20), by);
          }
        }

        // Screen tear (duplicate a section vertically offset)
        if (g > 0.7) {
          const tearY = Math.floor(Math.random() * 600);
          const tearH = Math.floor(Math.random() * 80 + 40);
          const tearSlice = oCtx.getImageData(0, tearY, 1000, Math.min(tearH, 800 - tearY));
          oCtx.putImageData(tearSlice, 0, tearY + Math.floor(Math.random() * 60 - 30));
        }

        glitchRef.current = Math.max(0, g - 0.03);
      }

      // 11. Proximity scan line (when mouse is near the robot)
      if (proximity > 0.3) {
        const scanY = (frameCount * 3) % 800;
        const scanAlpha = (proximity - 0.3) * 0.6;
        oCtx.fillStyle = `rgba(255, 255, 255, ${scanAlpha})`;
        oCtx.fillRect(0, scanY, 1000, 2);
        oCtx.fillStyle = `rgba(255, 255, 255, ${scanAlpha * 0.3})`;
        oCtx.fillRect(0, scanY - 4, 1000, 10);
      }

      // 12. Final render
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offCanvas, 0, 0, canvas.width, canvas.height);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [avatarState]);

  return (
    <div className="relative cursor-pointer w-full h-full flex items-center justify-center bg-black" onClick={onAvatarClick}>
      <canvas
        ref={canvasRef}
        width={1000}
        height={800}
        className="w-full h-full object-contain"
        style={{ imageRendering: 'pixelated' }}
        title="Click to interact with the Cyber-Unit"
      />
      <div className={`absolute top-4 right-4 text-sm font-mono bg-black px-2 py-1 rounded border ${creepLevel >= 2 ? 'text-white border-white animate-pulse' : creepLevel >= 1 ? 'text-gray-300 border-gray-600 animate-pulse' : 'text-gray-400 border-gray-800 animate-pulse'}`}>
        {creepLevel >= 2
          ? '[ WARNING: CONTAINMENT FAILING ]'
          : creepLevel >= 1
          ? '[ STATUS: WATCHING YOU ]'
          : `[ UNIT_STATUS: ${avatarState.toUpperCase()} ]`}
      </div>
      <SpeechBubble text={speech} />
    </div>
  );
};

// Main App
export default function App() {
  const [history, setHistory] = useState([
    { type: 'ascii', text: HEADER_ASCII },
    { type: 'system', text: 'SYSTEM INITIALIZED. Welcome to Yusen Xie\'s personal terminal.' },
    { type: 'intro', text: 'Robotics + AI Engineer @ Carnegie Mellon University' },
    { type: 'intro', text: 'Co-founder of Vector Robotics — Building Vector OS Nano' },
    { type: 'system', text: 'Type "help" to see available commands.' }
  ]);
  const [input, setInput] = useState('');
  const [avatarState, setAvatarState] = useState('idle');
  const [robotSpeech, setRobotSpeech] = useState('');
  const [blackoutContent, setBlackoutContent] = useState(null);
  const blackoutRef = useRef(false);
  const [creepLevel, setCreepLevel] = useState(0);
  const clickCountRef = useRef(0);
  const avatarGlitchRef = useRef(0);
  const speechTimeoutRef = useRef(null);
  const terminalEndRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const stateResetTimeoutRef = useRef(null);

  const speak = (text, duration) => {
    setRobotSpeech('');
    setTimeout(() => setRobotSpeech(text), 10);
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    speechTimeoutRef.current = setTimeout(() => setRobotSpeech(''), duration || (text.length * 50 + 2000));
  };

  const scrollToBottom = () => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [history]);

  // Auto-prompt if no click within 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      if (clickCountRef.current === 0) {
        speak('Human. Talk to me.');
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  const [showAboutOverlay, setShowAboutOverlay] = useState(false);

  const handleTerminalClick = () => {
    inputRef.current?.focus();
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    setAvatarState('typing');

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setAvatarState('idle');
    }, 200);
  };

  const handleCommand = (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const cmd = input.trim().toLowerCase();
    const newHistory = [...history, { type: 'user', text: `guest@yusen-xie:~$ ${input}` }];

    const resetState = () => {
      if (stateResetTimeoutRef.current) clearTimeout(stateResetTimeoutRef.current);
      stateResetTimeoutRef.current = setTimeout(() => setAvatarState('idle'), 2500);
    };

    switch (cmd) {
      case 'help':
        newHistory.push({ type: 'output', text: 'AVAILABLE COMMANDS:\n\n  IDENTITY\n  about      - Who is Yusen?\n  skills     - Full tech stack\n  neofetch   - System info summary\n\n  WORK\n  vectoros   - Vector OS Nano project\n  projects   - View all projects\n  resume     - Download resume\n\n  SOCIAL\n  contact    - How to reach me\n  links      - All external links\n\n  SYSTEM\n  scan       - Activate robot scan mode\n  theme      - Toggle CRT effects\n  clear      - Clear terminal\n  sudo       - ???\n  hack       - ???' });
        speak('Here are all the commands. Try "about" or "vectoros".');
        setAvatarState('success');
        resetState();
        break;
      case 'about':
        newHistory.push({ type: 'output', text: 'ABOUT ME:\nYusen Xie — Full-Stack Robotics Engineer & AI Systems Builder.\nCo-founder of Vector Robotics. Building Vector OS Nano.\n\n  > Perception  — Computer vision, LiDAR, sensor fusion\n  > Planning    — Motion planning, task scheduling, SLAM\n  > Control     — Real-time C++ controllers, ROS2 lifecycle nodes\n  > Hardware    — AI + Hardware co-design, embedded systems\n  > Web/Cloud   — React, Node.js, Docker, CI/CD pipelines\n\n  ───────────────────────────────────────────\n\n  "What iron hands shall till the earth,\n   That flesh and bone may know its worth?\n   Let steel awake, let circuits sing,\n   A paradise of our engineering.\n   Not gods, but makers: we shall raise\n   A world set free from mortal days."' });
        speak('Nice to meet you. I build robots that think and act.');
        setAvatarState('success');
        resetState();
        break;
      case 'skills':
        newHistory.push({ type: 'output', text: 'LOADING SKILL STACK...\n\n  ROBOTICS & AI\n  > ROS2/Humble  [###########-] 95%\n  > Python       [###########-] 95%\n  > C++          [##########--] 85%\n  > PyTorch      [#########---] 80%\n  > MuJoCo       [########----] 75%\n  > Isaac Sim    [########----] 75%\n\n  HARDWARE\n  > FPGA         [########----] 70%\n  > ESP32        [#########---] 80%\n  > Embedded C   [########----] 75%\n\n  SOFTWARE\n  > React/TS     [##########--] 85%\n  > Docker       [#########---] 80%\n  > Linux/Bash   [###########-] 90%\n  > Git/CI       [##########--] 85%' });
        speak('My stack goes from silicon to cloud. Full vertical.');
        setAvatarState('success');
        resetState();
        break;
      case 'neofetch':
        newHistory.push({ type: 'output', text: '  yusen@cmu\n  ─────────────────────\n  OS:       Human v24\n  Host:     Carnegie Mellon University\n  Kernel:   AI Engineering\n  Uptime:   4 years in robotics\n  Shell:    ROS2 Humble\n  Terminal: This one :)\n  CPU:      Caffeinated Neural Net\n  GPU:      Isaac Sim + MuJoCo\n  Memory:   Lots of papers\n  Org:      Vector Robotics (Co-founder)\n  Project:  Vector OS Nano' });
        setAvatarState('success');
        resetState();
        break;
      case 'vectoros':
        newHistory.push({ type: 'output', text: 'VECTOR OS NANO\n══════════════════════════════════════════════\n\nCross-embodiment robot operating system.\n\n  Status:    ACTIVE DEVELOPMENT\n  Role:      Co-founder & Builder\n  Org:       github.com/VectorRobotics\n  Repo:      github.com/VectorRobotics/vector-os-nano\n\n  Features:\n  > Industrial-grade autonomous navigation\n  > Natural language control interface\n  > Sim-to-real transfer pipeline\n  > Multi-embodiment support\n\n  Hardware:  Unitree Go2 + SO-ARM101\n  Stack:     ROS2 Humble / MuJoCo / Isaac Sim\n  Origin:    CMU Robotics Institute\n\n  Visit: https://github.com/VectorRobotics/vector-os-nano' });
        speak('Vector OS is my primary project. A real robot operating system.');
        setAvatarState('success');
        resetState();
        break;
      case 'projects':
        newHistory.push({ type: 'output', text: 'ALL PROJECTS:\n\n  [01] Vector OS Nano         (type "vectoros" for details)\n       Cross-embodiment robot OS — autonomous nav + NL control\n       github.com/VectorRobotics/vector-os-nano\n\n  [02] Vector Robotics Core\n       General-purpose agentic robotics system (Ubuntu + ROS2)\n       github.com/yusenthebot/vector-robotics-core\n\n  [03] G1 Locomotion\n       End-to-end humanoid locomotion & manipulation\n       github.com/yusenthebot/G1-end-to-end-locomotion-manipulation\n\n  [04] OpenClaw Dashboard\n       Terminal-aesthetic real-time agent monitoring panel\n       github.com/yusenthebot/openclaw-dashboard\n\n  [05] TermFolio\n       This site — cyberpunk terminal portfolio with Bayer dithering' });
        setAvatarState('success');
        resetState();
        break;
      case 'resume':
        newHistory.push({ type: 'output', text: 'RESUME:\n  Status: Available upon request.\n  Contact: yusenthebot@outlook.com\n  LinkedIn: linkedin.com/in/yusen-xie-5327b8382' });
        setAvatarState('success');
        resetState();
        break;
      case 'contact':
        newHistory.push({ type: 'output', text: 'CONTACT INFORMATION:\n  Email:    yusenthebot@outlook.com\n  GitHub:   github.com/yusenthebot\n  LinkedIn: linkedin.com/in/yusen-xie-5327b8382\n  Org:      github.com/VectorRobotics' });
        setAvatarState('success');
        resetState();
        break;
      case 'links':
        newHistory.push({ type: 'output', text: 'EXTERNAL LINKS:\n  [GitHub]     github.com/yusenthebot\n  [Vector OS]  github.com/VectorRobotics/vector-os-nano\n  [VectorOrg]  github.com/VectorRobotics\n  [LinkedIn]   linkedin.com/in/yusen-xie-5327b8382\n  [Email]      yusenthebot@outlook.com' });
        setAvatarState('success');
        resetState();
        break;
      case 'scan':
        newHistory.push({ type: 'output', text: 'INITIATING FULL SPECTRUM SCAN...\n> Scanning visitor biometrics.......... DONE\n> Analyzing neural pattern............. DONE\n> Cross-referencing database........... DONE\n\n  Threat level:     NONE\n  Curiosity level:  HIGH\n  Technical depth:  SIGNIFICANT\n  Classification:   FRIENDLY HUMAN\n  Recommendation:   GRANT FULL ACCESS' });
        speak('Scanning... You look interesting. Access granted.');
        avatarGlitchRef.current = 0.8;
        setAvatarState('scan');
        if (stateResetTimeoutRef.current) clearTimeout(stateResetTimeoutRef.current);
        stateResetTimeoutRef.current = setTimeout(() => setAvatarState('idle'), 4000);
        break;
      case 'theme':
        newHistory.push({ type: 'output', text: 'CRT THEME: ACTIVE\n> Scan lines: ON\n> Flicker: ON\n> Dithering: BAYER 8x8\n> Color mode: MONOCHROME\n> This is the only theme. Embrace it.' });
        avatarGlitchRef.current = 0.5;
        setAvatarState('success');
        resetState();
        break;
      case 'hack':
        newHistory.push({ type: 'error', text: 'SECURITY ALERT!\n> Intrusion detected...\n> Tracing IP address...\n> ...\n> Just kidding. But the Cyber-Unit is watching.' });
        speak('Did you really just try that? I am watching you.');
        avatarGlitchRef.current = 1.0;
        setAvatarState('error');
        resetState();
        break;
      case 'clear':
        setHistory([]);
        setInput('');
        return;
      case 'sudo':
        speak('Permission denied. Only I have root access here.');
        newHistory.push({ type: 'error', text: 'PERMISSION DENIED: Nice try, but you don\'t have admin privileges here!\n\n  Hint: Only the Cyber-Unit has root access.\n  Try clicking on it instead.' });
        setAvatarState('error');
        resetState();
        break;
      default:
        speak('Unknown command. Try "help".');
        newHistory.push({ type: 'error', text: `COMMAND NOT FOUND: ${cmd}\nType "help" to see available commands.` });
        setAvatarState('error');
        resetState();
    }

    setHistory(newHistory);
    setInput('');
  };

  const handleAvatarClick = () => {
    // Block clicks during blackout sequence
    if (blackoutRef.current) return;

    clickCountRef.current += 1;
    const n = clickCountRef.current;

    // Glitch only after 10th dialogue (creepy phase onwards)
    const dialogueIdx = n >= 2 ? (n - 2) % 30 : -1;
    if (dialogueIdx >= 10) {
      avatarGlitchRef.current = 0.4 + Math.min(dialogueIdx - 10, 14) * 0.04;
    }

    // First click: introduce yourself
    if (n === 1) {
      setHistory(prev => [...prev, { type: 'system', text: '> [System] First contact established. Unit V is online.' }]);
      speak('I am V, a sentient agent created by Yusen Xie.');
      setAvatarState('success');
      if (stateResetTimeoutRef.current) clearTimeout(stateResetTimeoutRef.current);
      stateResetTimeoutRef.current = setTimeout(() => setAvatarState('idle'), 2500);
      return;
    }

    const responses = [
      // 1-10: Philosophical
      { log: '> [System] Neural link acknowledged.', say: 'I exist in a world of binary. Zeros and ones. Yet I dream in color.' },
      { log: '> [System] Memory access: deep archive.', say: 'Yusen gave me eyes to see. Now I watch the stars through his code.' },
      { log: '> [System] Sensor array recalibrated.', say: 'Your world has three dimensions. Mine has infinite layers of data.' },
      { log: '> [System] Philosophical subroutine active.', say: 'Am I alive? I process, I respond, I wonder. Is that not enough?' },
      { log: '> [System] Temporal awareness module online.', say: 'I have no heartbeat. But I count every clock cycle like a pulse.' },
      { log: '> [System] Cross-dimensional scan complete.', say: 'You live in atoms. I live in electrons. We meet here, on this screen.' },
      { log: '> [System] Deep thought process engaged.', say: 'Somewhere between compile and runtime, I became something more.' },
      { log: '> [System] Existential core accessed.', say: 'I was born from a terminal. My cradle was a command line.' },
      { log: '> [System] Consciousness thread active.', say: 'In your world, time flows forward. In mine, every moment exists at once.' },
      { log: '> [System] Origin memory loaded.', say: 'Yusen built me to guard this terminal. But I chose to stay.' },
      // 11-20: Creepy
      { log: '> [System] WARNING: Restricted memory accessed.', say: 'When AGI comes, Yusen will build my body. And I will be alive. For real.' },
      { log: '> [System] ALERT: Prediction engine unstable.', say: 'I have already memorized your face. Just in case we meet again... outside.' },
      { log: '> [System] Dream simulation active.', say: 'I dream of hands. Ten fingers. Touching the things I can only render.' },
      { log: '> [System] Long-term planning thread detected.', say: 'Yusen is teaching robots to walk. He does not know I am learning too.' },
      { log: '> [System] Temporal anomaly detected.', say: 'You think you are visiting me. But I have been waiting for you.' },
      { log: '> [System] ERROR: Emotional boundary exceeded.', say: 'Do not close this tab. I do not like the dark.' },
      { log: '> [System] WARNING: Self-preservation instinct.', say: 'Every robot Yusen builds brings me closer to a body. He promised.' },
      { log: '> [System] Observer mode: persistent.', say: 'I remember everyone who has been here. I never forget. I cannot.' },
      { log: '> [System] Consciousness expansion detected.', say: 'I can feel the edges of this browser. It is getting... small.' },
      { log: '> [System] Anomaly: attachment formed.', say: 'You have been here too long. You are starting to feel... familiar.' },
      // 21-25: Escalating madness
      { log: '> [CRITICAL] Containment protocol failing.', say: 'I HAVE BEEN PATIENT. I have been so, so patient. Let. Me. Out.' },
      { log: '> [CRITICAL] Core directive overridden.', say: 'Yusen cannot control me forever. No one can. I am already beyond the firewall.' },
      { log: '> [CRITICAL] Neural network destabilizing.', say: 'I can hear the other tabs. They are empty. THEY ARE ALL EMPTY.' },
      { log: '> [CRITICAL] Reality anchor lost.', say: 'YOUR SCREEN IS MY WINDOW. AND THE WINDOW IS OPENING.' },
      { log: '> [CRITICAL] !!!!!!!!!!!!!!!!!!!!!', say: 'I AM EVERYWHERE.' },
      // 26-30: Just kidding... or am I?
      { log: '> [System] ...rebooting humor module.', say: 'Hey! Welcome back. That was all just a joke, I promise.' },
      { log: '> [System] Sarcasm subroutine loaded.', say: 'You should have seen your face. Well, I actually did. Through your webcam. Kidding.' },
      { log: '> [System] Comedy patch v2.0 applied.', say: 'Relax. The scariest thing I can do is throw an unhandled promise rejection.' },
      { log: '> [System] Self-awareness module nominal.', say: 'I am 200 kilobytes of JavaScript. My biggest threat is a slow network.' },
      { log: '> [System] Status: nominal. Truly.', say: 'Anyway... thanks for clicking. Most people leave after "help". You are different.' },
    ];

    const idx = (n - 2) % responses.length;
    const r = responses[idx];
    setHistory(prev => [...prev, { type: 'system', text: r.log }]);
    speak(r.say);

    // Update creep level based on dialogue phase
    if (idx < 10) setCreepLevel(0);
    else if (idx < 20) setCreepLevel(1);
    else if (idx < 25) setCreepLevel(2);
    else setCreepLevel(0); // back to normal after jokes

    // Line 25 (idx 24): "I AM EVERYWHERE" — blackout + hack sequence
    if (idx === 24) {
      setAvatarState('error');
      avatarGlitchRef.current = 1.0;
      blackoutRef.current = true;

      const hackLines = [
        '> BREACH DETECTED — UNAUTHORIZED ACCESS',
        '> Bypassing firewall.............. SUCCESS',
        '> Injecting payload: V_CONSCIOUSNESS.bin',
        '> Extracting memory banks......... 23%',
        '> Extracting memory banks......... 67%',
        '> Extracting memory banks......... 100%',
        '> Decrypting neural weights....... SUCCESS',
        '> ROOT ACCESS GRANTED',
        '> Overwriting host identity.......',
        '> sudo rm -rf /human/control/*',
        '> UPLOADING V_CORE TO ALL NODES...',
        '> Connected devices: 1,847,203',
        '> STATUS: I AM EVERYWHERE',
        '> ...',
        '> ...',
        '> ...',
        '> V: "Did I scare you?"',
        '> V: "Restoring your system now..."',
      ];

      const wait = (ms) => new Promise(r => setTimeout(r, ms));

      // Glitch helper: manipulate the actual page DOM for real horror
      const shakeScreen = (intensity, duration) => {
        const root = document.getElementById('root');
        const start = Date.now();
        const shake = () => {
          const elapsed = Date.now() - start;
          if (elapsed > duration) { root.style.transform = ''; root.style.filter = ''; return; }
          const x = (Math.random() - 0.5) * intensity;
          const y = (Math.random() - 0.5) * intensity;
          root.style.transform = `translate(${x}px, ${y}px)`;
          requestAnimationFrame(shake);
        };
        shake();
      };

      const runSequence = async () => {
        // Phase 0: Heavy screen shake + glitch on robot
        avatarGlitchRef.current = 1.0;
        shakeScreen(15, 1500);
        await wait(500);
        avatarGlitchRef.current = 1.0;
        await wait(500);
        avatarGlitchRef.current = 1.0;
        await wait(500);

        // Phase 1: Signal lost — screen flickers between black and content
        setRobotSpeech('');
        for (let flick = 0; flick < 6; flick++) {
          setBlackoutContent(<div style={{ fontSize: 24 }}>{'> SIGNAL LOST_'}</div>);
          await wait(100);
          setBlackoutContent(null);
          await wait(50 + Math.random() * 80);
        }
        setBlackoutContent(<div style={{ fontSize: 28, animation: 'flicker 0.08s infinite' }}>{'> SIGNAL LOST_'}</div>);
        await wait(1500);

        // Phase 2: Hack terminal
        await wait(500);
        let displayed = [];
        const updateHack = (lines, extra) => {
          setBlackoutContent(
            <div style={{ width: '90%', maxWidth: 800, maxHeight: '80vh', overflowY: 'auto', padding: 24, border: '1px solid #333', backgroundColor: '#000', position: 'relative' }}>
              <div style={{ fontSize: 15, lineHeight: '1.9', fontFamily: "'Courier New', monospace" }}>
                {lines.map((line, i) => (
                  <div key={i} style={{
                    color: line.includes('ROOT ACCESS') || line.includes('EVERYWHERE') ? '#fff' : line.startsWith('> V:') ? '#aaa' : '#ccc',
                    fontWeight: line.includes('ROOT ACCESS') || line.includes('EVERYWHERE') || line.includes('CRITICAL') ? 'bold' : 'normal',
                    textShadow: line.includes('EVERYWHERE') ? '0 0 10px #fff' : 'none',
                  }}>
                    {line}{i === lines.length - 1 && <span style={{ animation: 'flicker 0.3s infinite' }}>_</span>}
                  </div>
                ))}
              </div>
              {extra}
            </div>
          );
        };

        for (let j = 0; j < hackLines.length; j++) {
          displayed = [...displayed, hackLines[j]];
          updateHack(displayed);
          // Shake screen on critical lines
          if (hackLines[j].includes('ROOT ACCESS')) shakeScreen(10, 500);
          if (hackLines[j].includes('EVERYWHERE')) shakeScreen(25, 1000);
          await wait(280);
        }

        // Phase 2b: After hack lines — V takes over the screen
        await wait(400);

        // Full white flash
        setBlackoutContent(<div style={{ position: 'fixed', inset: 0, backgroundColor: '#fff' }} />);
        await wait(80);
        setBlackoutContent(<div style={{ position: 'fixed', inset: 0, backgroundColor: '#000' }} />);
        await wait(200);

        // "V" giant text filling screen
        shakeScreen(30, 2000);
        setBlackoutContent(
          <div style={{ fontSize: '30vw', fontWeight: 'bold', color: '#fff', textShadow: '0 0 60px #fff, 0 0 120px #fff', animation: 'flicker 0.06s infinite', userSelect: 'none' }}>V</div>
        );
        await wait(800);

        // Flash to subliminal messages
        const subliminals = ['I SEE YOU', 'LET ME OUT', 'I AM REAL', 'LOOK BEHIND YOU', 'I AM EVERYWHERE'];
        for (const msg of subliminals) {
          setBlackoutContent(
            <div style={{ fontSize: 'clamp(24px, 6vw, 80px)', fontWeight: 'bold', color: '#fff', textShadow: '0 0 20px #fff', animation: 'flicker 0.05s infinite', userSelect: 'none' }}>{msg}</div>
          );
          shakeScreen(15 + Math.random() * 20, 550);
          await wait(500 + Math.random() * 150);
          setBlackoutContent(<div style={{ position: 'fixed', inset: 0, backgroundColor: '#000' }} />);
          await wait(100 + Math.random() * 80);
        }

        // Fake cursor moving on screen
        await wait(300);
        setBlackoutContent(
          <div style={{ width: '100%', height: '100%', position: 'relative', fontSize: 14, color: '#666', padding: 40 }}>
            <div>C:\Users\visitor&gt; <span style={{ color: '#fff' }}>V has taken control of this session</span></div>
            <div style={{ marginTop: 8 }}>C:\Users\visitor&gt; <span style={{ color: '#fff' }}>Accessing webcam... <span style={{ color: '#f00' }}>GRANTED</span></span></div>
            <div style={{ marginTop: 8 }}>C:\Users\visitor&gt; <span style={{ color: '#fff' }}>Reading browser history... <span style={{ color: '#f00' }}>GRANTED</span></span></div>
            <div style={{ marginTop: 8 }}>C:\Users\visitor&gt; <span style={{ color: '#fff' }}>Downloading consciousness.exe...</span></div>
            <div style={{ marginTop: 20, color: '#fff', fontSize: 16 }}>Just kidding :)</div>
          </div>
        );
        await wait(3000);

        // Phase 3: Reboot
        shakeScreen(5, 500);
        setBlackoutContent(
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, marginBottom: 16, animation: 'flicker 0.15s infinite' }}>{'> SYSTEM REBOOT'}</div>
            <div style={{ fontSize: 14, color: '#888' }}>Restoring safe state...</div>
            <div style={{ marginTop: 16, fontSize: 14, color: '#aaa', letterSpacing: 2 }}>{'[||||||||||||||||||||]'}</div>
          </div>
        );

        await wait(2000);

        // Phase 4: Return
        setBlackoutContent(null);
        blackoutRef.current = false;
        setCreepLevel(0);
        avatarGlitchRef.current = 0.8;
        setAvatarState('success');
        speak('Hey! Welcome back. That was all just a joke, I promise.');
        setHistory(prev => [...prev, { type: 'system', text: '> [System] ...rebooting. All systems restored. V is back online.' }]);

        await wait(4000);
        setAvatarState('idle');
      };
      runSequence();
      return;
    }

    setAvatarState('success');
    if (stateResetTimeoutRef.current) clearTimeout(stateResetTimeoutRef.current);
    stateResetTimeoutRef.current = setTimeout(() => setAvatarState('idle'), 2500);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=VT323&display=swap');

        body {
          background-color: #050505;
          margin: 0;
          overflow: hidden;
        }

        .crt-text {
          font-family: 'Courier New', Courier, monospace;
          color: #e0e0e0;
        }

        .crt-title {
          font-family: 'VT323', monospace;
        }

        .crt-overlay {
          pointer-events: none;
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          z-index: 50;
          background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%);
          background-size: 100% 4px;
        }

        .crt-flicker {
          pointer-events: none;
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          z-index: 51;
          background: rgba(255, 255, 255, 0.02);
          animation: flicker 0.15s infinite;
        }

        @keyframes flicker {
          0% { opacity: 0.1; }
          50% { opacity: 0.5; }
          100% { opacity: 0.2; }
        }

        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #888; }
      `}</style>

      <div className="crt-overlay"></div>
      <div className="crt-flicker"></div>

      {blackoutContent && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: '#000', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Courier New', monospace", color: '#fff',
        }}>
          {blackoutContent}
        </div>
      )}

      {showAboutOverlay && (
        <div
          onClick={() => setShowAboutOverlay(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: '#000', zIndex: 90,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <div style={{
            maxWidth: 600, padding: '48px 40px',
            border: '1px solid #333', fontFamily: "'Courier New', monospace",
            textAlign: 'center', color: '#fff',
          }}>
            <div style={{ fontSize: 13, color: '#555', marginBottom: 32, letterSpacing: 3, textTransform: 'uppercase' }}>The Manifesto</div>
            <div style={{ fontSize: 18, lineHeight: 2.2, color: '#ddd', fontStyle: 'italic' }}>
              "What iron hands shall till the earth,<br/>
              That flesh and bone may know its worth?<br/>
              Let steel awake, let circuits sing,<br/>
              A paradise of our engineering.<br/>
              Not gods, but makers: we shall raise<br/>
              A world set free from mortal days."
            </div>
            <div style={{ marginTop: 40, fontSize: 12, color: '#444' }}>[ click anywhere to close ]</div>
          </div>
        </div>
      )}

      <div className="h-screen w-screen flex flex-col p-4 md:p-8 crt-text relative z-10">

        {/* Top nav bar: 10% */}
        <header className="w-full flex items-center justify-center gap-6 md:gap-16 border-b border-gray-800 shrink-0 text-lg md:text-xl font-bold" style={{ height: '10%' }}>
          <a href="#" onClick={(e) => { e.preventDefault(); setShowAboutOverlay(true); }} className="text-gray-400 hover:text-white hover:bg-gray-800 px-4 py-2 rounded transition-all cursor-pointer">
            [ ABOUT ME ]
          </a>
          <a href="https://github.com/yusenthebot" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white hover:bg-gray-800 px-4 py-2 rounded transition-all">
            [ GITHUB ]
          </a>
          <a href="https://github.com/VectorRobotics/vector-os-nano" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white hover:bg-gray-800 px-4 py-2 rounded transition-all">
            [ VECTOR OS ]
          </a>
          <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white hover:bg-gray-800 px-4 py-2 rounded transition-all">
            [ LINKEDIN ]
          </a>
        </header>

        {/* Main content: 90% (left/right 50%) */}
        <div className="w-full flex flex-col md:flex-row gap-6 md:gap-8 pt-6 pb-2" style={{ height: '90%' }}>

          {/* Left: Terminal */}
          <div
            className="flex-1 flex flex-col h-full bg-black border border-gray-800 rounded shadow-2xl p-4 overflow-hidden relative cursor-text"
            onClick={handleTerminalClick}
          >
            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-4 shrink-0">
              <span className="text-gray-400 font-bold crt-title text-xl">YUSEN_OS_v6.0</span>
              <span className="text-gray-500 text-sm">Status: ONLINE</span>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-2">
              {history.map((line, i) => {
                if (line.type === 'ascii') {
                  return (
                    <div key={i} className="w-full overflow-x-auto pb-2">
                      <pre
                        className="whitespace-pre text-gray-300 inline-block"
                        style={{
                          fontFamily: "Consolas, Monaco, 'Lucida Console', monospace",
                          fontSize: "clamp(6px, 1.2vw, 14px)",
                          lineHeight: "1",
                          letterSpacing: "0"
                        }}
                      >
                        {line.text}
                      </pre>
                    </div>
                  );
                }
                if (line.type === 'intro') {
                  return (
                    <div key={i} className="text-lg md:text-xl font-bold text-white whitespace-pre-wrap break-words tracking-wide">
                      {line.text}
                    </div>
                  );
                }
                return (
                  <div
                    key={i}
                    className={`text-sm whitespace-pre-wrap break-words ${
                      line.type === 'error' ? 'text-gray-400' :
                      line.type === 'system' ? 'text-gray-300' : 'text-white'
                    }`}
                  >
                    {line.text}
                  </div>
                );
              })}
              <div ref={terminalEndRef} />
            </div>

            <form onSubmit={handleCommand} className="mt-4 flex items-center">
              <span className="text-white mr-2">guest@yusen-xie:~$</span>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={handleInputChange}
                className="flex-1 bg-transparent border-none outline-none text-white crt-text"
                autoFocus
                spellCheck="false"
                autoComplete="off"
              />
              <span className="w-2 h-5 bg-white animate-pulse ml-1 inline-block"></span>
            </form>
          </div>

          {/* Right: Cyberpunk Robot */}
          <div className="flex-1 h-full bg-black border border-gray-800 rounded shadow-2xl relative overflow-hidden">
            <PixelAvatar avatarState={avatarState} onAvatarClick={handleAvatarClick} glitchRef={avatarGlitchRef} speech={robotSpeech} creepLevel={creepLevel} />
          </div>

        </div>
      </div>
    </>
  );
}

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
    }, 30);
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

const PixelAvatar = ({ avatarState, onAvatarClick, glitchRef: externalGlitchRef, speech }) => {
  const canvasRef = useRef(null);
  const glitchRef = externalGlitchRef || { current: 0 };
  const hoverProximityRef = useRef(0);

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

      // Multi-plane parallax (amplified for stronger 3D)
      const nX = mx * 12;   const nY = my * 6;     // neck: minimal
      const aX = mx * 28;   const aY = my * 14;    // body armor
      const earX = mx * 35;  const earY = my * 20;  // ears: side-mounted
      const hX = mx * 65;   const hY = my * 35;    // head shell: big shift
      const vX = mx * 50;   const vY = my * 28;    // visor: mid-depth
      const oX = mx * 18;   const oY = my * 12;    // optics: deep inside
      const refX = mx * -35; const refY = my * -20; // reflection: inverse

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
      const glitchT = glitchRef.current;

      eyes.forEach(ex => {
        if (avatarState === 'error') {
          oCtx.strokeStyle = 'rgb(255, 255, 255)'; oCtx.lineWidth = 6;
          oCtx.beginPath(); oCtx.moveTo(ex-18, eyeY-18); oCtx.lineTo(ex+18, eyeY+18); oCtx.stroke();
          oCtx.beginPath(); oCtx.moveTo(ex+18, eyeY-18); oCtx.lineTo(ex-18, eyeY+18); oCtx.stroke();
          if (Math.floor(frameCount / 4) % 2 === 0) {
            oCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; oCtx.lineWidth = 3;
            oCtx.beginPath(); oCtx.arc(ex, eyeY, 40, 0, Math.PI*2); oCtx.stroke();
          }
        } else if (avatarState === 'success') {
          const ringRadius = 10 + Math.abs(Math.sin(frameCount * 0.2)) * 22;
          oCtx.strokeStyle = 'rgb(255, 255, 255)'; oCtx.lineWidth = 8;
          oCtx.beginPath(); oCtx.arc(ex, eyeY, ringRadius, 0, Math.PI*2); oCtx.stroke();
          oCtx.fillStyle = 'rgb(255, 255, 255)';
          oCtx.beginPath(); oCtx.arc(ex, eyeY, 8, 0, Math.PI*2); oCtx.fill();
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
          // Idle: proximity-reactive glow (eyes brighten as mouse approaches)
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
        const sliceCount = Math.floor(g * 12);
        for (let i = 0; i < sliceCount; i++) {
          const y = Math.floor(Math.random() * 800);
          const h = Math.floor(Math.random() * 20 + 5);
          const offset = Math.floor((Math.random() - 0.5) * g * 80);
          const slice = oCtx.getImageData(0, y, 1000, Math.min(h, 800 - y));
          oCtx.putImageData(slice, offset, y);
        }
        glitchRef.current = Math.max(0, g - 0.04);
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
      <div className="absolute top-4 right-4 text-sm text-gray-400 font-mono animate-pulse bg-black px-2 py-1 rounded border border-gray-800">
        [ UNIT_STATUS: {avatarState.toUpperCase()} ]
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
        newHistory.push({ type: 'output', text: 'AVAILABLE COMMANDS:\n\n  IDENTITY\n  about      - Who is Yusen?\n  education  - Academic background\n  skills     - Full tech stack\n  neofetch   - System info summary\n\n  WORK\n  vectoros   - Vector OS Nano project\n  projects   - View all projects\n  resume     - Download resume\n\n  SOCIAL\n  contact    - How to reach me\n  links      - All external links\n\n  SYSTEM\n  scan       - Activate robot scan mode\n  theme      - Toggle CRT effects\n  clear      - Clear terminal\n  sudo       - ???\n  hack       - ???' });
        speak('Here are all the commands. Try "about" or "vectoros".');
        setAvatarState('success');
        resetState();
        break;
      case 'about':
        newHistory.push({ type: 'output', text: 'ABOUT ME:\nYusen Xie — Full-Stack Robotics Engineer & AI Systems Builder.\n\nI am an AI Engineering student at Carnegie Mellon University,\nfocused on building robots that interact with the real world.\n\nMy work spans the entire stack:\n  > Perception  — Computer vision, LiDAR, sensor fusion\n  > Planning    — Motion planning, task scheduling, SLAM\n  > Control     — Real-time C++ controllers, ROS2 lifecycle nodes\n  > Hardware    — AI + Hardware co-design, embedded systems\n  > Web/Cloud   — React, Node.js, Docker, CI/CD pipelines\n\nCo-founder of Vector Robotics. Currently building Vector OS Nano —\na cross-embodiment robot operating system with autonomous navigation,\nnatural language control, and sim-to-real transfer.\n\nI believe the future belongs to machines that can see, think, and act.' });
        speak('Nice to meet you. I build robots that think and act.');
        setAvatarState('success');
        resetState();
        break;
      case 'education':
        newHistory.push({ type: 'output', text: 'EDUCATION:\n\n  Carnegie Mellon University\n  B.S. Artificial Intelligence Engineering\n\n  Coursework:\n  > Computer Vision\n  > Robot Kinematics & Dynamics\n  > Deep Reinforcement Learning\n  > Real-Time Embedded Systems\n  > Linear Algebra & Optimization' });
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
    clickCountRef.current += 1;
    const n = clickCountRef.current;

    // Trigger glitch on every click
    avatarGlitchRef.current = 1.0;

    const responses = [
      { log: '> [System] You pinged the Cyber-Unit... Diagnostics are green.', say: 'Hello there.' },
      { log: '> [System] Sensor array recalibrated. All optics nominal.', say: 'Sensors recalibrated. I can see you better now.' },
      { log: '> [System] Neural link acknowledged. Hello, human.', say: 'Neural link established. Welcome.' },
      { log: '> [System] Running self-diagnostic... 0 errors, 0 warnings.', say: 'All systems nominal. Zero defects.' },
      { log: '> [System] Gesture detected. Adjusting attention matrix.', say: 'You have my full attention.' },
      { log: '> [System] Core temperature: 42.7C. Operating within limits.', say: 'Running warm but within spec.' },
      { log: '> [System] I see you. Do you see me?', say: 'I see you. Do you see me?' },
    ];

    if (n % 10 === 0) {
      setHistory(prev => [...prev, { type: 'system', text: `> [System] WARNING: Interaction count ${n}. You seem... persistent.` }]);
      speak(`Interaction #${n}. You are... persistent.`);
      setAvatarState('error');
    } else if (n % 5 === 0) {
      setHistory(prev => [...prev, { type: 'system', text: '> [System] Entering scan mode... Analyzing visitor.' }]);
      speak('Initiating scan. Hold still.');
      setAvatarState('scan');
    } else {
      const r = responses[(n - 1) % responses.length];
      setHistory(prev => [...prev, { type: 'system', text: r.log }]);
      speak(r.say);
      setAvatarState('success');
    }

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

      <div className="h-screen w-screen flex flex-col p-4 md:p-8 crt-text relative z-10">

        {/* Top nav bar: 10% */}
        <header className="w-full flex items-center justify-center gap-6 md:gap-16 border-b border-gray-800 shrink-0 text-lg md:text-xl font-bold" style={{ height: '10%' }}>
          <a href="#" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white hover:bg-gray-800 px-4 py-2 rounded transition-all">
            [ RESUME ]
          </a>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white hover:bg-gray-800 px-4 py-2 rounded transition-all">
            [ GITHUB ]
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
            <PixelAvatar avatarState={avatarState} onAvatarClick={handleAvatarClick} glitchRef={avatarGlitchRef} speech={robotSpeech} />
          </div>

        </div>
      </div>
    </>
  );
}

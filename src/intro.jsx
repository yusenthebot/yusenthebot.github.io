import { useEffect, useRef, useState } from "react";
import AudioEngine from "./audio.js";

// 6x8 bold font
const FONT = {
  Y: ["##..##", "##..##", "##..##", ".####.", "..##..", "..##..", "..##..", "..##.."],
  U: ["##..##", "##..##", "##..##", "##..##", "##..##", "##..##", "##..##", ".####."],
  S: [".#####", "##....", "##....", ".####.", "....##", "....##", "....##", "#####."],
  E: ["######", "##....", "##....", "#####.", "#####.", "##....", "##....", "######"],
  N: ["##..##", "###.##", "###.##", "####.#", "##.###", "##.###", "##..##", "##..##"],
  X: ["##..##", "##..##", ".####.", "..##..", "..##..", ".####.", "##..##", "##..##"],
  I: ["######", "######", "..##..", "..##..", "..##..", "..##..", "######", "######"],
  " ": ["......", "......", "......", "......", "......", "......", "......", "......"],
};

const TEXT = "YUSEN XIE";
const SCALE = 4;
const LETTER_W = 6, LETTER_H = 8, LETTER_GAP = 1, SPACE_W = 4;

function buildText() {
  const cells = [];
  let cursor = 0;
  const positions = [];
  for (const ch of TEXT) {
    if (ch === " ") { cursor += SPACE_W; continue; }
    positions.push({ ch, x: cursor });
    cursor += LETTER_W + LETTER_GAP;
  }
  const totalW = cursor - LETTER_GAP;
  for (let li = 0; li < positions.length; li++) {
    const { ch, x } = positions[li];
    const bitmap = FONT[ch];
    for (let fy = 0; fy < LETTER_H; fy++) {
      for (let fx = 0; fx < LETTER_W; fx++) {
        if (bitmap[fy][fx] !== "#") continue;
        for (let sy = 0; sy < SCALE; sy++) {
          for (let sx = 0; sx < SCALE; sx++) {
            cells.push({
              gx: (x + fx) * SCALE + sx,
              gy: fy * SCALE + sy,
              sx, sy, letterIdx: li,
            });
          }
        }
      }
    }
  }
  return { cells, widthVox: totalW * SCALE, heightVox: LETTER_H * SCALE, letterCount: positions.length };
}

export default function IntroSequence({ onComplete }) {
  const canvasRef = useRef(null);
  const skippedRef = useRef(false);
  const completedRef = useRef(false);
  const [phase, setPhase] = useState(0);

  const skip = () => {
    if (skippedRef.current) return;
    skippedRef.current = true;
    completedRef.current = true;
    setPhase(3);
    setTimeout(() => onComplete?.(), 50);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    // Render at reduced resolution; CSS stretches to full viewport.
    // Intro is transient + heavily post-processed (scanlines/vignette), so softness is invisible.
    const RENDER_SCALE = 0.6;

    const resize = () => {
      canvas.width = Math.max(1, Math.floor(window.innerWidth * RENDER_SCALE));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * RENDER_SCALE));
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
    };
    resize();
    window.addEventListener("resize", resize);

    const W = canvas.width;
    const H = canvas.height;

    const { cells, widthVox, heightVox, letterCount } = buildText();

    const maxCellW = (W * 0.88) / widthVox;
    const maxCellH = (H * 0.46) / heightVox;
    const cell = Math.min(maxCellW, maxCellH);

    const ROT_Y = 0.18;
    const ROT_X = -0.08;

    const LIGHT = (() => {
      const x = -0.4, y = -0.7, z = 0.65;
      const m = Math.sqrt(x * x + y * y + z * z);
      return { x: x / m, y: y / m, z: z / m };
    })();

    const depthForCell = (sx) => {
      const u = ((sx + 0.5) / SCALE) * 2 - 1;
      return Math.sqrt(Math.max(0, 1 - u * u)) * 7 + 1;
    };
    const normalForCell = (sx, sy) => {
      const u = ((sx + 0.5) / SCALE) * 2 - 1;
      const v = ((sy + 0.5) / SCALE) * 2 - 1;
      let nx = u, ny = v * 0.15;
      let nz = Math.sqrt(Math.max(0.01, 1 - u * u));
      const m = Math.sqrt(nx * nx + ny * ny + nz * nz);
      return { nx: nx / m, ny: ny / m, nz: nz / m };
    };

    const faceCx = widthVox / 2;
    const faceCy = heightVox / 2;

    const letterParallax = (li) => {
      const mid = (letterCount - 1) / 2;
      const t = 1 - Math.abs(li - mid) / mid;
      return t * 3;
    };

    const cY = Math.cos(ROT_Y), sY = Math.sin(ROT_Y);
    const cX = Math.cos(ROT_X), sX = Math.sin(ROT_X);
    const project = (gx, gy, gz) => {
      const x = (gx - faceCx) * cell;
      const y = (gy - faceCy) * cell;
      const z = gz * cell;
      const x2 = x * cY + z * sY;
      const z2 = -x * sY + z * cY;
      const y3 = y * cX - z2 * sX;
      const z3 = y * sX + z2 * cX;
      return { sx: W / 2 + x2, sy: H / 2 + y3, depth: z3 };
    };

    const bakeColor = (sx, sy, norm) => {
      const midS = (SCALE - 1) / 2;
      const dCenterX = Math.abs(sx - midS);
      const dCenterY = Math.abs(sy - midS);
      let base;
      let isAccent = false;
      if (dCenterX < 0.6 && dCenterY < 0.6) { base = [255, 255, 255]; isAccent = true; }
      else {
        const dEdge = Math.min(sx, sy, SCALE - 1 - sx, SCALE - 1 - sy);
        if (dEdge === 0) base = [55, 58, 62];
        else if (dCenterX < 2 && dCenterY < 2) base = [230, 230, 232];
        else base = [165, 168, 172];
      }
      const dot = Math.max(0, norm.nx * LIGHT.x + norm.ny * LIGHT.y + norm.nz * LIGHT.z);
      const ambient = isAccent ? 0.8 : 0.3;
      const diffuseMul = isAccent ? 0.4 : 1.05;
      const light = Math.min(1.6, ambient + dot * diffuseMul);
      const r = Math.min(255, base[0] * light) | 0;
      const g = Math.min(255, base[1] * light) | 0;
      const b = Math.min(255, base[2] * light) | 0;
      return {
        front: `rgb(${r},${g},${b})`,
        top: `rgb(${Math.min(255, r * 1.28) | 0},${Math.min(255, g * 1.28) | 0},${Math.min(255, b * 1.28) | 0})`,
        right: `rgb(${(r * 0.42) | 0},${(g * 0.42) | 0},${(b * 0.42) | 0})`,
        rRaw: r, gRaw: g, bRaw: b,
        isAccent,
      };
    };

    const d_factor = 0.4;
    const h_factor = 0.55;

    const drawCubeInto = (c, cx, cy, s, col) => {
      const h = s * h_factor;
      const d = s * d_factor;
      const fx = cx - h, fy = cy - h;
      const fw = h * 2;

      c.fillStyle = col.right;
      c.beginPath();
      c.moveTo(cx + h, cy - h);
      c.lineTo(cx + h + d, cy - h - d * 0.7);
      c.lineTo(cx + h + d, cy + h - d * 0.7);
      c.lineTo(cx + h, cy + h);
      c.closePath();
      c.fill();

      c.fillStyle = col.top;
      c.beginPath();
      c.moveTo(cx - h, cy - h);
      c.lineTo(cx + h, cy - h);
      c.lineTo(cx + h + d, cy - h - d * 0.7);
      c.lineTo(cx - h + d, cy - h - d * 0.7);
      c.closePath();
      c.fill();

      c.fillStyle = col.front;
      c.fillRect(fx, fy, fw, fw);
    };

    const SPRITE_PAD = 4;
    const spriteCache = new Map();
    const getSprite = (sx, sy) => {
      const key = sx * SCALE + sy;
      if (spriteCache.has(key)) return spriteCache.get(key);
      const norm = normalForCell(sx, sy);
      const col = bakeColor(sx, sy, norm);
      const spriteSize = Math.ceil(cell * (h_factor * 2 + d_factor) + SPRITE_PAD * 2);
      const sc = document.createElement("canvas");
      sc.width = spriteSize;
      sc.height = spriteSize;
      const sctx = sc.getContext("2d");
      const cx = spriteSize / 2 - cell * (d_factor / 2);
      const cy = spriteSize / 2 + cell * ((d_factor * 0.7) / 2);
      drawCubeInto(sctx, cx, cy, cell, col);
      if (col.isAccent) {
        sctx.globalCompositeOperation = "lighter";
        sctx.fillStyle = "rgba(255,255,255,0.22)";
        sctx.fillRect(0, 0, spriteSize, spriteSize);
        sctx.globalCompositeOperation = "source-over";
      }
      const s = { canvas: sc, size: spriteSize, col };
      spriteCache.set(key, s);
      return s;
    };

    const voxels = [];
    for (const c of cells) {
      const gz = depthForCell(c.sx) + letterParallax(c.letterIdx);
      const p = project(c.gx, c.gy, gz);

      const ox = W / 2 + (c.gx - faceCx) * cell + (Math.random() - 0.5) * W * 0.12;
      const oy = H + Math.random() * H * 0.5;

      const delay = c.letterIdx * 0.11 + (c.gy / heightVox) * 0.2 + Math.random() * 0.12;

      // bake the voxel's color now (used later when we call bake())
      const norm = normalForCell(c.sx, c.sy);
      const col = bakeColor(c.sx, c.sy, norm);

      voxels.push({
        tx: p.sx, ty: p.sy, depth: p.depth,
        ox, oy, delay,
        sx: c.sx, sy: c.sy,
        col,
        arrived: false,
      });
    }

    voxels.sort((a, b) => a.depth - b.depth);

    const bakeCanvas = document.createElement("canvas");
    bakeCanvas.width = W;
    bakeCanvas.height = H;
    const bakeCtx = bakeCanvas.getContext("2d");
    let baked = false;

    const reflectCanvas = document.createElement("canvas");
    reflectCanvas.width = W;
    reflectCanvas.height = H;
    const reflectCtx = reflectCanvas.getContext("2d");

    // Incremental bake of arrived voxels during assembly.
    // A voxel is drawn once when it arrives, then never redrawn per frame.
    const partialBakeCanvas = document.createElement("canvas");
    partialBakeCanvas.width = W;
    partialBakeCanvas.height = H;
    const partialBakeCtx = partialBakeCanvas.getContext("2d");

    // Static backdrop (bg + grid floor) — baked once, blitted per frame.
    const staticBgCanvas = document.createElement("canvas");
    staticBgCanvas.width = W;
    staticBgCanvas.height = H;
    {
      const bctx = staticBgCanvas.getContext("2d");
      bctx.fillStyle = "#04060a";
      bctx.fillRect(0, 0, W, H);
      const bgG = bctx.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, Math.max(W, H) * 0.7);
      bgG.addColorStop(0, "rgba(22, 28, 40, 0.75)");
      bgG.addColorStop(1, "rgba(0,0,0,1)");
      bctx.fillStyle = bgG;
      bctx.fillRect(0, 0, W, H);
      bctx.strokeStyle = "rgba(90,110,140,0.12)";
      bctx.lineWidth = 1;
      const horizonY = H * 0.68;
      bctx.beginPath();
      for (let i = 0; i < 18; i++) {
        const t = i / 18;
        const yLine = horizonY + Math.pow(t, 1.6) * (H - horizonY);
        bctx.moveTo(0, yLine);
        bctx.lineTo(W, yLine);
      }
      bctx.stroke();
      bctx.beginPath();
      for (let i = -12; i <= 12; i++) {
        bctx.moveTo(W / 2, horizonY);
        bctx.lineTo(W / 2 + i * W * 0.1, H);
      }
      bctx.stroke();
    }

    // Static overlay (scanlines + vignette + static HUD labels) — baked once.
    const staticOverlayCanvas = document.createElement("canvas");
    staticOverlayCanvas.width = W;
    staticOverlayCanvas.height = H;
    {
      const octx = staticOverlayCanvas.getContext("2d");
      // scanlines
      octx.globalAlpha = 0.1;
      octx.fillStyle = "#000";
      for (let y = 0; y < H; y += 4) octx.fillRect(0, y, W, 2);
      octx.globalAlpha = 1;
      // vignette
      const vg = octx.createRadialGradient(
        W / 2, H / 2, Math.min(W, H) * 0.28,
        W / 2, H / 2, Math.max(W, H) * 0.82,
      );
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.65)");
      octx.fillStyle = vg;
      octx.fillRect(0, 0, W, H);
      // static HUD lines
      octx.font = '11px "JetBrains Mono", monospace';
      octx.fillStyle = "rgba(115,120,130,0.72)";
      octx.fillText("YUSEN XIE · VOXEL_RENDER_ENGINE", 24, 30);
      octx.fillText(`MESH: ${voxels.length.toLocaleString()} UNITS · ${SCALE}×${SCALE} BEVEL`, 24, 46);
      octx.textAlign = "right";
      octx.fillText("yusen@cmu", W - 24, 30);
      octx.fillText(new Date().toISOString().slice(0, 19).replace("T", " "), W - 24, 46);
      octx.textAlign = "left";
      octx.fillStyle = "rgba(100,105,115,0.6)";
      octx.fillText("[ click to skip ]", W - 120, H - 24);
    }

    const ASSEMBLE = 2.2;
    const SETTLE = 0.6;
    const FADE = 0.8;
    const TOTAL = ASSEMBLE + SETTLE + FADE;

    const t0 = performance.now();
    let raf;
    let playedBoot = false, playedSnap = false;
    let lastClickTime = 0;
    let lastFrame = 0;
    const FRAME_MS = 1000 / 30; // cap at 30fps

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    const easeInCubic = (t) => t * t * t;

    const bake = () => {
      bakeCtx.clearRect(0, 0, W, H);
      for (let i = 0; i < voxels.length; i++) {
        const v = voxels[i];
        drawCubeInto(bakeCtx, v.tx, v.ty, cell, v.col);
      }
      bakeCtx.globalCompositeOperation = "lighter";
      for (let i = 0; i < voxels.length; i++) {
        const v = voxels[i];
        const sp = getSprite(v.sx, v.sy);
        if (!sp.col.isAccent) continue;
        bakeCtx.fillStyle = "rgba(255,255,255,0.18)";
        bakeCtx.fillRect(v.tx - cell * 1.2, v.ty - cell * 1.2, cell * 2.4, cell * 2.4);
      }
      bakeCtx.globalCompositeOperation = "source-over";

      reflectCtx.clearRect(0, 0, W, H);
      const baseY = H / 2 + (heightVox / 2) * cell + cell * 1.5;
      reflectCtx.save();
      reflectCtx.translate(0, baseY * 2);
      reflectCtx.scale(1, -1);
      reflectCtx.globalAlpha = 0.35;
      reflectCtx.drawImage(bakeCanvas, 0, 0);
      reflectCtx.restore();

      reflectCtx.globalCompositeOperation = "destination-in";
      const grad = reflectCtx.createLinearGradient(0, baseY, 0, baseY + H * 0.25);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      reflectCtx.fillStyle = grad;
      reflectCtx.fillRect(0, baseY, W, H);
      reflectCtx.globalCompositeOperation = "source-over";

      baked = true;
    };

    const drawBackdrop = () => {
      ctx.drawImage(staticBgCanvas, 0, 0);
    };

    const drawOverlays = (elapsed, phaseNow, arrivedFrac) => {
      ctx.drawImage(staticOverlayCanvas, 0, 0);

      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(185,190,200,0.78)";
      const prog = Math.floor(arrivedFrac * 100);
      let line = "";
      if (phaseNow === 0) line = `> COMPILING SIGNATURE · ${voxels.length.toLocaleString()} VOXELS · ${prog.toString().padStart(3, " ")}%`;
      else if (phaseNow === 1) line = "> SIGNATURE VERIFIED.  STABILIZING GEOMETRY ...";
      else if (phaseNow === 2) line = "> ENTERING TERMINAL ...";
      ctx.fillText(line, 24, H - 24);

      if (phaseNow === 0) {
        const barW = Math.min(W * 0.3, 360);
        const barH = 3;
        const bx = (W - barW) / 2;
        const by = H - 46;
        ctx.strokeStyle = "rgba(100,105,115,0.6)";
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, barW, barH);
        ctx.fillStyle = "rgba(230,235,240,0.9)";
        ctx.fillRect(bx, by, barW * arrivedFrac, barH);
      }
    };

    const render = () => {
      if (completedRef.current) return;
      const now = performance.now();
      if (now - lastFrame < FRAME_MS) {
        raf = requestAnimationFrame(render);
        return;
      }
      lastFrame = now;
      const elapsed = (now - t0) / 1000;

      if (!playedBoot) {
        try { AudioEngine?.init?.(); AudioEngine?.powerOn?.(); } catch (_) {}
        playedBoot = true;
      }

      const phaseNow =
        elapsed < ASSEMBLE ? 0
        : elapsed < ASSEMBLE + SETTLE ? 1
        : elapsed < TOTAL ? 2 : 3;

      let camScale = 1, camAlpha = 1;
      if (phaseNow === 1) {
        const pt = (elapsed - ASSEMBLE) / SETTLE;
        camScale = 1 - easeOutCubic(pt) * 0.02;
      } else if (phaseNow === 2) {
        const ft = (elapsed - ASSEMBLE - SETTLE) / FADE;
        camScale = 0.98 - easeInCubic(ft) * 0.85;
        camAlpha = 1 - ft;
      }

      drawBackdrop();

      ctx.save();
      ctx.globalAlpha = camAlpha;
      ctx.translate(W / 2, H / 2);
      ctx.scale(camScale, camScale);
      ctx.translate(-W / 2, -H / 2);

      let arrivedCount = 0;

      if (phaseNow === 0 || !baked) {
        // Blit already-arrived voxels (baked incrementally).
        ctx.drawImage(partialBakeCanvas, 0, 0);

        const assembleDur = ASSEMBLE - 0.3;
        for (let i = 0; i < voxels.length; i++) {
          const v = voxels[i];
          if (v.arrived) { arrivedCount++; continue; }
          if (elapsed < v.delay) continue;
          const t = (elapsed - v.delay) / assembleDur;
          if (t >= 1) {
            // Arrived this frame — paint once into partial bake, skip per-frame draw hereafter.
            v.arrived = true;
            arrivedCount++;
            const sp = getSprite(v.sx, v.sy);
            partialBakeCtx.drawImage(sp.canvas, v.tx - sp.size / 2, v.ty - sp.size / 2);
            if (now - lastClickTime > 80 && Math.random() < 0.006) {
              AudioEngine?.servoClick?.(0.6 + Math.random() * 0.5);
              lastClickTime = now;
            }
            continue;
          }
          const e = 1 - Math.pow(1 - t, 3);
          const cx = v.ox + (v.tx - v.ox) * e;
          const cy = v.oy + (v.ty - v.oy) * e;
          const sp = getSprite(v.sx, v.sy);
          ctx.drawImage(sp.canvas, cx - sp.size / 2, cy - sp.size / 2);
        }

        if (arrivedCount === voxels.length) {
          bake();
        }
      } else {
        ctx.drawImage(reflectCanvas, 0, 0);
        ctx.drawImage(bakeCanvas, 0, 0);
        arrivedCount = voxels.length;
      }

      const arrivedFrac = arrivedCount / voxels.length;

      if (arrivedFrac > 0.94 && !playedSnap) {
        AudioEngine?.success?.();
        playedSnap = true;
        setPhase(1);
      }

      if (phaseNow === 1) {
        const t = (elapsed - ASSEMBLE) / SETTLE;
        const sweepX = t * W * 1.3 - W * 0.15;
        ctx.globalCompositeOperation = "lighter";
        const sg = ctx.createLinearGradient(sweepX - 50, 0, sweepX + 50, 0);
        sg.addColorStop(0, "rgba(255,255,255,0)");
        sg.addColorStop(0.5, "rgba(255,255,255,0.25)");
        sg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = sg;
        ctx.fillRect(sweepX - 50, H * 0.22, 100, H * 0.56);
        ctx.globalCompositeOperation = "source-over";
      }

      ctx.restore();

      drawOverlays(elapsed, phaseNow, arrivedFrac);

      if (elapsed >= TOTAL) {
        completedRef.current = true;
        setPhase(3);
        onComplete?.();
        return;
      }
      raf = requestAnimationFrame(render);
    };

    render();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [onComplete]);

  if (phase === 3) return null;

  return (
    <div
      onClick={skip}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        backgroundColor: "#04060a", cursor: "pointer",
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

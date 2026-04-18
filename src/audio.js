// Synthesized audio — no asset files. WebAudio only. Gated behind first user interaction.

const AudioEngine = (() => {
  let ctx = null;
  let masterGain = null;
  let enabled = true;
  let initialized = false;

  const init = () => {
    if (initialized) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.35;
      masterGain.connect(ctx.destination);
      initialized = true;
    } catch (e) {
      console.warn("Audio init failed", e);
    }
  };

  const resume = () => {
    if (ctx && ctx.state === "suspended") ctx.resume();
  };

  const setEnabled = (v) => {
    enabled = v;
    if (masterGain) masterGain.gain.value = v ? 0.35 : 0;
  };

  const servoClick = (pitch = 1) => {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(1200 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(80 * pitch, t + 0.04);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g); g.connect(masterGain);
    osc.start(t); osc.stop(t + 0.06);

    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
    const noise = ctx.createBufferSource();
    const ng = ctx.createGain();
    ng.gain.value = 0.08;
    noise.buffer = buf; noise.connect(ng); ng.connect(masterGain);
    noise.start(t);
  };

  const keyPress = () => {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 4);
    const noise = ctx.createBufferSource();
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800 + Math.random() * 400;
    filter.Q.value = 2;
    g.gain.value = 0.15;
    noise.buffer = buf; noise.connect(filter); filter.connect(g); g.connect(masterGain);
    noise.start(t);
  };

  const beep = (freq = 880, dur = 0.08, type = "square") => {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.15, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(masterGain);
    osc.start(t); osc.stop(t + dur + 0.02);
  };

  const chirp = (startF, endF, dur = 0.15) => {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(startF, t);
    osc.frequency.exponentialRampToValueAtTime(endF, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(masterGain);
    osc.start(t); osc.stop(t + dur + 0.02);
  };

  const powerOn = () => {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(480, t + 0.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(g); g.connect(masterGain);
    osc.start(t); osc.stop(t + 0.5);
    setTimeout(() => beep(1200, 0.1), 450);
  };

  const powerDown = () => {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(480, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    osc.connect(g); g.connect(masterGain);
    osc.start(t); osc.stop(t + 0.9);
  };

  const error = () => {
    if (!ctx || !enabled) return;
    beep(220, 0.08, "square");
    setTimeout(() => beep(180, 0.12, "square"), 80);
  };

  const success = () => {
    if (!ctx || !enabled) return;
    beep(660, 0.05);
    setTimeout(() => beep(880, 0.08), 60);
  };

  const scan = () => {
    chirp(400, 1600, 0.3);
    setTimeout(() => chirp(1600, 400, 0.3), 320);
  };

  const glitch = () => {
    if (!ctx || !enabled) return;
    for (let i = 0; i < 5; i++) {
      setTimeout(
        () => beep(200 + Math.random() * 800, 0.03 + Math.random() * 0.04, "square"),
        i * 40
      );
    }
  };

  const yawn = () => {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(180, t + 0.6);
    osc.frequency.linearRampToValueAtTime(120, t + 1.0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.3);
    g.gain.linearRampToValueAtTime(0, t + 1.0);
    osc.connect(g); g.connect(masterGain);
    osc.start(t); osc.stop(t + 1.05);
  };

  return {
    init, resume, setEnabled,
    servoClick, keyPress, beep, chirp,
    powerOn, powerDown, error, success, scan, glitch, yawn,
    get enabled() { return enabled; },
    get initialized() { return initialized; },
  };
})();

export default AudioEngine;

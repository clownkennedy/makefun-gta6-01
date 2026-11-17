// Tiny WebAudio synth: no audio files, everything is oscillators and
// filtered noise. Created lazily on the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
  }

  function startEngine() {
    if (!ensure() || engineOsc) return;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    engineOsc.connect(filter).connect(engineGain).connect(master);
    engineOsc.start();
  }

  function setEngine(speedRatio, driving) {
    if (!engineOsc) return;
    const target = driving ? 0.05 + 0.06 * Math.min(1, Math.abs(speedRatio)) : 0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
    engineOsc.frequency.setTargetAtTime(50 + 130 * Math.min(1, Math.abs(speedRatio)), ctx.currentTime, 0.1);
  }

  function startSiren() {
    if (!ensure() || sirenOsc) return;
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 700;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0.045;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
    sirenTimer = 0;
  }

  function stopSiren() {
    if (!sirenOsc) return;
    try { sirenOsc.stop(); } catch { /* already stopped */ }
    sirenOsc = null;
    sirenGain = null;
  }

  function updateSiren(dt, wanted) {
    if (!sirenOsc) return;
    if (wanted <= 0) { stopSiren(); return; }
    sirenTimer += dt;
    const f = Math.sin(sirenTimer * 4.5) > 0 ? 720 : 540;
    sirenOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
  }

  return {
    unlock,
    shot() { noise(0.12, 0.35, 2600); blip(190, 0.08, 'square', 0.12, 60); },
    enemyShot() { noise(0.1, 0.16, 1800); },
    hit() { blip(120, 0.12, 'sawtooth', 0.2, 70); },
    punch() { noise(0.08, 0.3, 700); },
    pickup() { blip(660, 0.1, 'sine', 0.25, 990); blip(990, 0.14, 'sine', 0.2, 1320); },
    cash() { blip(880, 0.09, 'sine', 0.22); setTimeout(() => blip(1174, 0.12, 'sine', 0.22), 90); setTimeout(() => blip(1568, 0.18, 'sine', 0.22), 180); },
    alarm() { blip(520, 0.3, 'square', 0.18, 780); },
    splash() { noise(0.35, 0.25, 900); },
    busted() { blip(320, 0.5, 'sawtooth', 0.25, 90); },
    startEngine,
    setEngine,
    startSiren,
    stopSiren,
    updateSiren,
  };
}

// A short service-bell chime, synthesised so nothing has to load.

let ctx: AudioContext | null = null;

export function ding() {
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    for (const [freq, at, len] of [
      [1318.5, 0, 0.9],
      [1760, 0.12, 1.1],
    ]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.18, now + at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + len + 0.05);
    }
  } catch {
    // No audio here (autoplay rules, no device): the bell on screen still rings.
  }
}

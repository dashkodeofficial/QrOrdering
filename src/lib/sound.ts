"use client";

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function beep(
  ctx: AudioContext,
  freq: number,
  start: number,
  duration: number,
  gain: number,
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, ctx.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(
    0.001,
    ctx.currentTime + start + duration,
  );
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration);
}

/** Double-beep for new orders. */
export function playOrderSound() {
  const ctx = getCtx();
  if (!ctx) return;
  beep(ctx, 880, 0, 0.15, 0.3);
  beep(ctx, 880, 0.18, 0.15, 0.3);
}

/** Single lower beep for new customer requests. */
export function playRequestSound() {
  const ctx = getCtx();
  if (!ctx) return;
  beep(ctx, 587.33, 0, 0.25, 0.3);
}

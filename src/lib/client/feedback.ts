"use client";

/**
 * Sons e vibração do jogo, sintetizados na hora (Web Audio): nenhum arquivo para baixar.
 * O navegador só libera áudio depois de um toque na tela; até lá, os sons são ignorados.
 */

export type Sound = "tap" | "send" | "flip" | "badumtss" | "chime" | "tick" | "fanfare" | "pop";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Chamado no primeiro toque da pessoa, para destravar o áudio no iOS. */
export function unlockAudio() {
  audio();
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = "triangle", gain = 0.18, slideTo?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(c.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

function noise(c: AudioContext, start: number, dur: number, gain = 0.15, highpass = 5000) {
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = highpass;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(g).connect(c.destination);
  src.start(start);
}

export function play(sound: Sound) {
  const c = audio();
  if (!c || c.state !== "running") return;
  const t = c.currentTime + 0.01;
  switch (sound) {
    case "tap":
      tone(c, 660, t, 0.06, "square", 0.06);
      break;
    case "pop":
      tone(c, 420, t, 0.09, "sine", 0.14, 760);
      break;
    case "send":
      tone(c, 300, t, 0.18, "sawtooth", 0.08, 900);
      break;
    case "flip":
      noise(c, t, 0.08, 0.12, 2500);
      tone(c, 520, t + 0.02, 0.07, "triangle", 0.1);
      break;
    case "badumtss":
      // O "ba-dum-tss" da piada: duas batidas de tambor e o prato.
      tone(c, 180, t, 0.12, "sine", 0.35, 90);
      tone(c, 150, t + 0.16, 0.14, "sine", 0.35, 70);
      noise(c, t + 0.34, 0.6, 0.2, 6000);
      break;
    case "chime":
      tone(c, 880, t, 0.25, "sine", 0.14);
      tone(c, 1320, t + 0.12, 0.35, "sine", 0.1);
      break;
    case "tick":
      tone(c, 1000, t, 0.03, "square", 0.05);
      break;
    case "fanfare":
      [523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.12, 0.3, "triangle", 0.16));
      break;
  }
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* sem suporte */
  }
}

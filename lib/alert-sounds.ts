export interface AlertSoundPreset {
  id: string;
  name: string;
  frequencies: number[];
  stepMs: number;
  gain: number;
}

export const ALERT_SOUND_PRESETS: AlertSoundPreset[] = [
  { id: "crystal-mist", name: "Crystal Mist", frequencies: [659.25, 783.99], stepMs: 120, gain: 0.045 },
  { id: "soft-bell", name: "Soft Bell", frequencies: [523.25, 659.25, 783.99], stepMs: 110, gain: 0.04 },
  { id: "moon-drop", name: "Moon Drop", frequencies: [440, 523.25], stepMs: 170, gain: 0.042 },
  { id: "calm-harp", name: "Calm Harp", frequencies: [392, 493.88, 587.33], stepMs: 95, gain: 0.04 },
  { id: "velvet-pulse", name: "Velvet Pulse", frequencies: [349.23, 392, 466.16], stepMs: 120, gain: 0.043 },
  { id: "ocean-glint", name: "Ocean Glint", frequencies: [329.63, 415.3, 523.25], stepMs: 125, gain: 0.041 },
  { id: "linen-chime", name: "Linen Chime", frequencies: [293.66, 369.99], stepMs: 150, gain: 0.043 },
  { id: "gentle-orbit", name: "Gentle Orbit", frequencies: [261.63, 329.63, 392], stepMs: 130, gain: 0.041 },
  { id: "aura-glass", name: "Aura Glass", frequencies: [587.33, 698.46], stepMs: 115, gain: 0.042 },
  { id: "dawn-whisper", name: "Dawn Whisper", frequencies: [392, 466.16, 523.25], stepMs: 140, gain: 0.04 },
];

export const DEFAULT_ALERT_SOUND_ID = ALERT_SOUND_PRESETS[0].id;

function getPreset(soundId: string): AlertSoundPreset {
  return ALERT_SOUND_PRESETS.find((preset) => preset.id === soundId) ?? ALERT_SOUND_PRESETS[0];
}

export function playAlertSound(soundId: string): void {
  if (typeof window === "undefined") return;

  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  const context = new AudioCtx();
  const preset = getPreset(soundId);
  const start = context.currentTime;

  preset.frequencies.forEach((frequency, index) => {
    const osc = context.createOscillator();
    const gain = context.createGain();
    const noteStart = start + (index * preset.stepMs) / 1000;
    const noteEnd = noteStart + preset.stepMs / 1000;

    osc.type = "sine";
    osc.frequency.value = frequency;

    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(preset.gain, noteStart + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd + 0.08);

    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(noteStart);
    osc.stop(noteEnd + 0.08);
  });

  const releaseAt = start + (preset.frequencies.length * preset.stepMs + 150) / 1000;
  window.setTimeout(() => {
    void context.close();
  }, Math.ceil((releaseAt - context.currentTime) * 1000));
}

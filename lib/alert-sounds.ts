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

export type AlertSoundSettings = {
  muted: boolean;
  volume: number; // 0..1
};

const ALERT_SOUND_SETTINGS_KEY = "flux_alert_sound_settings_v1";

const DEFAULT_ALERT_SOUND_SETTINGS: AlertSoundSettings = {
  muted: false,
  volume: 0.9,
};

export function getAlertSoundSettings(): AlertSoundSettings {
  if (typeof window === "undefined") return DEFAULT_ALERT_SOUND_SETTINGS;
  try {
    const raw = window.localStorage.getItem(ALERT_SOUND_SETTINGS_KEY);
    if (!raw) return DEFAULT_ALERT_SOUND_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AlertSoundSettings>;
    const muted = typeof parsed.muted === "boolean" ? parsed.muted : DEFAULT_ALERT_SOUND_SETTINGS.muted;
    const volumeRaw = typeof parsed.volume === "number" ? parsed.volume : DEFAULT_ALERT_SOUND_SETTINGS.volume;
    const volume = Number.isFinite(volumeRaw) ? Math.max(0, Math.min(1, volumeRaw)) : DEFAULT_ALERT_SOUND_SETTINGS.volume;
    return { muted, volume };
  } catch {
    return DEFAULT_ALERT_SOUND_SETTINGS;
  }
}

export function setAlertSoundSettings(next: Partial<AlertSoundSettings>): void {
  if (typeof window === "undefined") return;
  try {
    const prev = getAlertSoundSettings();
    const muted = typeof next.muted === "boolean" ? next.muted : prev.muted;
    const volumeRaw = typeof next.volume === "number" ? next.volume : prev.volume;
    const volume = Number.isFinite(volumeRaw) ? Math.max(0, Math.min(1, volumeRaw)) : prev.volume;
    window.localStorage.setItem(ALERT_SOUND_SETTINGS_KEY, JSON.stringify({ muted, volume } satisfies AlertSoundSettings));
  } catch {
    // Ignore write errors (quota / privacy).
  }
}

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;

let lastPlayAtMs = 0;
const SOUND_COOLDOWN_MS = 900;

let userGestureReceived = false;
let userGestureListenerInstalled = false;

function ensureUserGestureListener(): void {
  if (typeof window === "undefined") return;
  if (userGestureListenerInstalled) return;
  userGestureListenerInstalled = true;

  const markGesture = () => {
    userGestureReceived = true;
    // Se o AudioContext já tiver sido criado, tente reativar agora.
    if (audioCtx && audioCtx.state === "suspended") {
      void audioCtx.resume().catch(() => {});
    }
  };

  window.addEventListener("pointerdown", markGesture, { once: true });
  window.addEventListener("keydown", markGesture, { once: true });
}

function getOrCreateAudioGraph(volume: number): AudioContext | null {
  ensureUserGestureListener();
  if (typeof window === "undefined") return null;

  const AudioCtxCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtxCtor) return null;

  if (!audioCtx) {
    audioCtx = new AudioCtxCtor();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = Math.max(0, Math.min(1, volume));
    masterGain.connect(audioCtx.destination);
  } else if (masterGain) {
    // Atualiza ganho ao vivo (evita recriar o grafo).
    masterGain.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), audioCtx.currentTime);
  }

  return audioCtx;
}

function canAttemptPlayback(ctx: AudioContext): boolean {
  // Quando estiver "suspended" (bloqueio de autoplay), a chamada pode falhar.
  // Mesmo assim, fazemos uma tentativa com resume. O browser pode negar; então não tocamos.
  if (ctx.state === "running") return true;
  if (!userGestureReceived) return false;
  return true;
}

export function playAlertSound(
  soundId: string,
  opts?: {
    muted?: boolean;
    volume?: number;
    cooldownMs?: number;
  }
): void {
  if (typeof window === "undefined") return;

  const settings = getAlertSoundSettings();
  const muted = typeof opts?.muted === "boolean" ? opts.muted : settings.muted;
  const volumeRaw = typeof opts?.volume === "number" ? opts.volume : settings.volume;
  const volume = Number.isFinite(volumeRaw) ? Math.max(0, Math.min(1, volumeRaw)) : 0.9;
  const cooldownMs = typeof opts?.cooldownMs === "number" ? Math.max(0, opts.cooldownMs) : SOUND_COOLDOWN_MS;

  if (muted || volume <= 0) return;

  const now = Date.now();
  if (now - lastPlayAtMs < cooldownMs) return;
  lastPlayAtMs = now;

  const ctx = getOrCreateAudioGraph(volume);
  const mg = masterGain;
  if (!ctx || !mg) return;

  if (!canAttemptPlayback(ctx)) return;

  if (ctx.state === "suspended") {
    // Não é await; caso o browser negue o resume, simplesmente não toca.
    void ctx.resume().catch(() => {});
  }

  const preset = getPreset(soundId);
  const start = ctx.currentTime;

  // Envelopes curtos para reduzir "irritação" e excesso de sobreposição.
  preset.frequencies.forEach((frequency, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const noteStart = start + (index * preset.stepMs) / 1000;
    const noteEnd = noteStart + preset.stepMs / 1000;

    osc.type = "sine";
    osc.frequency.value = frequency;

    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(preset.gain * volume, noteStart + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd + 0.06);

    osc.connect(gain);
    gain.connect(mg);
    osc.start(noteStart);
    osc.stop(noteEnd + 0.06);
  });
}

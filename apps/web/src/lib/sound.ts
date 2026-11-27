import { useSyncExternalStore } from "react";
import type { NotificationType } from "@commune/shared";
import singleSound from "../assets/sounds/single.mp3";
import doubleSound from "../assets/sounds/double.mp3";
import tripleSound from "../assets/sounds/triple.mp3";
import { sessionGeneration } from "./browserSession";

/**
 * Notification sounds share the same device-local volume and mute setting.
 *
 * Browsers only allow sound after the person has touched the page once, so the audio engine wakes up
 * on the first tap or key press. Until then a chime is skipped silently (never an error).
 */
export type SoundKind = "message" | NotificationType;

interface SoundPrefs {
  enabled: boolean;
  messageEnabled: boolean;
  /** 0 to 1 */
  volume: number;
}

const STORAGE_KEY = "commune.sound";
/** A burst of messages should sound like one chime, not a machine gun. */
const MIN_GAP_MS = 900;

// ---- Preferences (kept on this device only) ----
const DEFAULTS: SoundPrefs = { enabled: true, messageEnabled: true, volume: 0.7 };

function load(): SoundPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<SoundPrefs>;
    return {
      // The old master mute is represented by zero volume in the new interface.
      enabled: true,
      messageEnabled: typeof parsed.messageEnabled === "boolean" ? parsed.messageEnabled : true,
      volume:
        parsed.enabled === false ? 0 : typeof parsed.volume === "number" && Number.isFinite(parsed.volume)
          ? Math.min(1, Math.max(0, parsed.volume))
          : DEFAULTS.volume,
    };
  } catch {
    return DEFAULTS;
  }
}

let prefs: SoundPrefs = load();
const listeners = new Set<() => void>();
window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  prefs = load();
  listeners.forEach((listener) => listener());
});

export function setSoundPrefs(patch: Partial<SoundPrefs>) {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or blocked storage: the choice just lasts until the page closes.
  }
  listeners.forEach((l) => l());
}

export function useSoundPrefs(): SoundPrefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => prefs,
    () => prefs,
  );
}

// ---- Audio engine ----
type AudioContextCtor = typeof AudioContext;
const Ctor: AudioContextCtor | undefined =
  typeof window === "undefined"
    ? undefined
    : (window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext);

let ctx: AudioContext | null = null;
const soundUrls: Record<SoundKind, string> = {
  message: doubleSound,
  follow: tripleSound,
  like: singleSound,
  comment: singleSound,
  repost: singleSound,
};
const buffers = new Map<string, Promise<AudioBuffer>>();
let previewId = 0;

function loadBuffer(context: AudioContext, url: string): Promise<AudioBuffer> {
  let pending = buffers.get(url);
  if (!pending) {
    pending = fetch(url).then((response) => {
      if (!response.ok) throw new Error("Sound could not be loaded");
      return response.arrayBuffer();
    }).then((bytes) => context.decodeAudioData(bytes)).catch((error: unknown) => {
      buffers.delete(url);
      throw error;
    });
    buffers.set(url, pending);
  }
  return pending;
}

/** Wakes the audio engine. Must run from a tap, click or key press. Safe to call many times. */
export function unlockAudio() {
  if (!Ctor) return;
  try {
    if (!ctx) ctx = new Ctor();
    if (ctx.state !== "running") void ctx.resume().catch(() => undefined);
    for (const url of new Set(Object.values(soundUrls))) void loadBuffer(ctx, url).catch(() => undefined);
  } catch {
    // No audio device: stay silent.
  }
}

let armed = false;
/** Call once at start-up: the first interaction anywhere on the page unlocks sound. */
export function armSoundUnlock() {
  if (armed || typeof window === "undefined") return;
  armed = true;
  const events = ["pointerdown", "keydown", "touchend"] as const;
  const handler = () => {
    unlockAudio();
    if (ctx && ctx.state === "running")
      events.forEach((e) => window.removeEventListener(e, handler));
  };
  events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
}

type SoundRequest = { force: true } | { userId: string; eventId: string };

// Keep recent deliveries across tabs, including tabs that wake up after the chime.
function playOnce(userId: string, eventId: string, start: () => void) {
  const key = "bubble.sound.recent." + userId;
  const now = Date.now();
  let recent: { ids: string[]; lastPlayed: number };
  try {
    recent = JSON.parse(localStorage.getItem(key) ?? "null") ?? { ids: [], lastPlayed: 0 };
    if (recent.ids.includes(eventId)) return;
    const play = now - recent.lastPlayed >= MIN_GAP_MS;
    recent.ids = [...recent.ids.slice(-127), eventId];
    if (play) recent.lastPlayed = now;
    localStorage.setItem(key, JSON.stringify(recent));
    if (!play) return;
  } catch {
    if (!document.hasFocus()) return;
  }
  start();
}

export async function playSound(kind: SoundKind, opts: SoundRequest) {
  const preview = "force" in opts;
  const enabled = () => prefs.volume > 0 && (preview || (prefs.enabled && (kind !== "message" || prefs.messageEnabled)));
  if (!ctx || !enabled()) return;
  const context = ctx;
  const currentPreview = preview ? ++previewId : 0;
  const generation = sessionGeneration();
  try {
    const [buffer] = await Promise.all([loadBuffer(context, soundUrls[kind]), context.state === "running" ? undefined : context.resume()]);
    const start = () => {
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      gain.gain.value = prefs.volume * prefs.volume;
      source.connect(gain).connect(context.destination);
      source.start();
    };
    if (preview) {
      if (enabled() && currentPreview === previewId) start();
      return;
    }
    const claim = () => {
      if (enabled() && context.state === "running" && sessionGeneration() === generation) playOnce(opts.userId, opts.eventId, start);
    };
    if (navigator.locks) await navigator.locks.request("bubble.sound." + opts.userId, claim);
    else if (document.hasFocus()) claim();
  } catch {
    // Audio output may disappear or be suspended.
  }
}

/** True when the person is already looking at this conversation, so a chime would just be noise. */
export function isViewingConversation(conversationId: string): boolean {
  return (
    document.visibilityState === "visible" &&
    window.location.pathname === `/messages/${conversationId}`
  );
}

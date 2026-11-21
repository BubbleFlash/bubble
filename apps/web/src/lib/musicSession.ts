import type { MusicTrackDTO } from "@commune/shared";

const KEY = "bubble-music-session-v1";

export type RepeatMode = 0 | 1 | 2;

export interface MusicSession {
  accountId: string;
  trackId: string;
  queue: MusicTrackDTO[];
  originalQueue: MusicTrackDTO[];
  source: string | null;
  position: number;
  resume: boolean;
  shuffled: boolean;
  repeat: RepeatMode;
}

function isQueue(value: unknown): value is MusicTrackDTO[] {
  return Array.isArray(value) && value.every((track: Partial<MusicTrackDTO> | null) =>
    track && typeof track.id === "string" && typeof track.title === "string" && typeof track.artist === "string",
  );
}

export function readMusicSession(accountId: string): MusicSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const saved: Partial<MusicSession> | null = JSON.parse(raw);
    if (!saved || saved.accountId !== accountId || !isQueue(saved.queue) || !isQueue(saved.originalQueue)) return null;
    if (!saved.queue.some((track) => track.id === saved.trackId) ||
        !saved.originalQueue.some((track) => track.id === saved.trackId) ||
        typeof saved.position !== "number" || !Number.isFinite(saved.position) || saved.position < 0 ||
        typeof saved.resume !== "boolean" || typeof saved.shuffled !== "boolean" ||
        (saved.repeat !== 0 && saved.repeat !== 1 && saved.repeat !== 2) ||
        (saved.source !== null && typeof saved.source !== "string")) return null;
    return saved as MusicSession;
  } catch {
    return null;
  }
}

export function writeMusicSession(saved: MusicSession | null) {
  try {
    if (saved) sessionStorage.setItem(KEY, JSON.stringify(saved));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Playback still works when storage is blocked or full.
  }
}

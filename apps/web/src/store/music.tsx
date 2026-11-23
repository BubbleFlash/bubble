import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { MusicTrackDTO } from "@commune/shared";
import { api } from "../lib/api";
import { readMusicSession, writeMusicSession, type MusicSession, type RepeatMode } from "../lib/musicSession";
import { useAuth } from "./auth";

interface MusicState {
  track: MusicTrackDTO | null;
  queue: MusicTrackDTO[];
  queueSource: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  duration: number;
  volume: number;
  error: string | null;
  playTrack: (track: MusicTrackDTO, queue?: MusicTrackDTO[], source?: string) => Promise<void>;
  setCurrentQueue: (queue: MusicTrackDTO[], source?: string) => void;
  renameTrack: (id: string, title: string, artist: string) => void;
  togglePlayback: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  clear: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
  isShuffled: boolean;
  repeatMode: RepeatMode;
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;
}

const MusicContext = createContext<MusicState | null>(null);
// Playback ticks must not rerender every track attached to a feed post.
const MusicTimeContext = createContext(0);

export function MusicPlayerProvider({
                                      children,
                                    }: {
  children: ReactNode;
}) {
  const { user, confirmed, isCurrentAccount } = useAuth();
  const userId = user?.id;
  const accountId = confirmed ? userId : undefined;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeAccount = useRef<string>();
  const positionRef = useRef(0);
  const pendingSeek = useRef<number>();
  const resumeRef = useRef(false);
  const requestIdRef = useRef(0);
  const queueRef = useRef<MusicTrackDTO[]>([]);
  const queueIndexRef = useRef(-1);
  const nextTrackRef = useRef<() => void>(() => {});
  const previousTrackRef = useRef<() => void>(() => {});
  const playTrackRef = useRef<(track: MusicTrackDTO) => Promise<void>>(
    async () => {},
  );
  const originalQueueRef = useRef<MusicTrackDTO[]>([]);
  const endedTrackRef = useRef<() => void>(() => {});
  const broadcastMusic = useRef<(message: { kind: "play" | "request" } | { kind: "state"; session: MusicSession }) => void>(() => {});
  const sharedMusic = useRef<MusicSession | null>(null);

  const [track, setTrack] = useState<MusicTrackDTO | null>(null);
  const [queue, setQueue] = useState<MusicTrackDTO[]>([]);
  const [queueSource, setQueueSource] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(() => {
    try {
      const savedVolume = localStorage.getItem("music-volume");
      const parsedVolume = savedVolume?.trim() ? Number(savedVolume) : NaN;
      return Number.isFinite(parsedVolume) ? Math.min(1, Math.max(0, parsedVolume)) : 0.5;
    } catch {
      return 0.5;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [isShuffled, setIsShuffled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(0);

  const shuffleTracks = (tracks: MusicTrackDTO[]) => {
    const result = [...tracks];

    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));

      const current = result[i];
      const random = result[j];

      if (!current || !random) continue;

      result[i] = random;
      result[j] = current;
    }

    return result;
  };

  const clear = useCallback(() => {
    requestIdRef.current++;
    positionRef.current = 0;
    pendingSeek.current = undefined;
    resumeRef.current = false;
    writeMusicSession(null);
    queueRef.current = [];
    setQueue([]);
    queueIndexRef.current = -1;
    originalQueueRef.current = [];

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }

    setTrack(null);
    setQueueSource(null);
    setIsPlaying(false);
    setIsLoading(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
  }, []);

  // Create one audio element for the lifetime of the provider.
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;

    const onTimeUpdate = () => {
      if (pendingSeek.current !== undefined || !audio.getAttribute("src")) return;
      positionRef.current = audio.currentTime;
      setCurrentTime(audio.currentTime);
    };
    const onLoadedMetadata = () => {
      if (pendingSeek.current === undefined) return;
      const requested = pendingSeek.current;
      pendingSeek.current = undefined;
      audio.currentTime = Number.isFinite(audio.duration) ? Math.min(requested, audio.duration) : requested;
      onTimeUpdate();
    };
    const onDurationChange = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      resumeRef.current = false;
      setIsPlaying(false);
      endedTrackRef.current();
    };
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);
    const onError = () => {
      setIsLoading(false);
      setIsPlaying(false);
      setError("Не удалось воспроизвести аудиофайл.");
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("error", onError);

    return () => {
      activeAccount.current = undefined;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();

      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("error", onError);

      audioRef.current = null;
    };
  }, []);

  // Keep the actual audio volume synchronized with React state.
  useEffect(() => {
    const mobile = window.matchMedia("(hover: none) and (pointer: coarse)");
    const syncVolume = () => {
      if (audioRef.current) audioRef.current.volume = mobile.matches ? 1 : volume;
    };
    syncVolume();
    mobile.addEventListener("change", syncVolume);
    return () => mobile.removeEventListener("change", syncVolume);
  }, [volume]);

  const loadTrack = useCallback(async (nextTrack: MusicTrackDTO, position: number, autoplay: boolean, restoring = false) => {
    const audio = audioRef.current;
    const owner = activeAccount.current;
    if (!audio || !owner || !isCurrentAccount(owner)) return;

    const requestId = ++requestIdRef.current;
    positionRef.current = position;
    pendingSeek.current = position > 0 ? position : undefined;
    resumeRef.current = autoplay;
    setTrack(nextTrack);
    setIsLoading(true);
    setIsPlaying(false);
    setCurrentTime(position);
    setDuration(restoring ? nextTrack.duration ?? 0 : 0);
    setError(null);

    audio.pause();
    audio.removeAttribute("src");
    audio.load();

    try {
      const { url } = await api<{ url: string }>(`/music/${nextTrack.id}/play`);
      if (audio !== audioRef.current || requestId !== requestIdRef.current || !isCurrentAccount(owner)) return;
      audio.src = url;
      audio.load();
      if (autoplay) await audio.play();
      else setIsLoading(false);
    } catch (err) {
      if (audio !== audioRef.current || requestId !== requestIdRef.current || !isCurrentAccount(owner)) return;
      resumeRef.current = false;
      setIsLoading(false);
      setIsPlaying(false);
      if (restoring && err instanceof DOMException && err.name === "NotAllowedError") return;
      setError(err instanceof Error ? err.message : "Не удалось запустить воспроизведение.");
    }
  }, [isCurrentAccount]);

  // Only one tab plays audio; other tabs mirror its selected track and queue.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const key = "bubble-music-playback-v1";
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(key) : undefined;
    const receive = (message: { kind: "play" | "request" } | { kind: "state"; session: MusicSession }) => {
      if (message?.kind === "request") {
        if (sharedMusic.current && !audio.paused) broadcastMusic.current({ kind: "state", session: { ...sharedMusic.current, position: audio.currentTime } });
        return;
      }
      if (message?.kind !== "play" && message?.kind !== "state") return;
      if (message.kind === "state" && (!accountId || !isCurrentAccount(accountId) || message.session?.accountId !== accountId)) return;
      requestIdRef.current++;
      resumeRef.current = false;
      setIsLoading(false);
      audio.pause();
      if (message.kind !== "state") return;
      const saved = message.session;
      const selected = saved.queue.find((item) => item.id === saved.trackId);
      if (!selected) return;
      queueRef.current = saved.queue;
      originalQueueRef.current = saved.originalQueue;
      queueIndexRef.current = saved.queue.indexOf(selected);
      setQueue(saved.queue);
      setQueueSource(saved.source);
      setIsShuffled(saved.shuffled);
      setRepeatMode(saved.repeat);
      void loadTrack(selected, saved.position, false, true);
    };
    const onMessage = (event: MessageEvent) => receive(event.data);
    const onStorage = (event: StorageEvent) => {
      if (!channel && event.key === key && event.newValue) {
        try { receive(JSON.parse(event.newValue).message); } catch { /* Ignore malformed messages. */ }
      }
    };
    broadcastMusic.current = (message) => {
      if (channel) channel.postMessage(message);
      else {
        try { localStorage.setItem(key, JSON.stringify({ message, nonce: Math.random() })); localStorage.removeItem(key); } catch { /* Storage is optional. */ }
      }
    };
    const onPlay = () => broadcastMusic.current({ kind: "play" });
    channel?.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    audio.addEventListener("play", onPlay);
    broadcastMusic.current({ kind: "request" });
    return () => {
      broadcastMusic.current = () => {};
      audio.removeEventListener("play", onPlay);
      window.removeEventListener("storage", onStorage);
      channel?.close();
    };
  }, [accountId, isCurrentAccount, loadTrack]);

  useEffect(() => {
    if (!accountId || !track || !isPlaying || activeAccount.current !== accountId) { sharedMusic.current = null; return; }
    const session: MusicSession = {
      accountId, trackId: track.id, queue: queueRef.current, originalQueue: originalQueueRef.current,
      source: queueSource, position: positionRef.current, resume: false, shuffled: isShuffled, repeat: repeatMode,
    };
    sharedMusic.current = session;
    broadcastMusic.current({ kind: "state", session });
  }, [accountId, track, queue, queueSource, isPlaying, isShuffled, repeatMode]);

  useEffect(() => {
    if (!accountId) {
      // A cached profile may be displayed while its session is still being checked.
      if (activeAccount.current || !userId) {
        clear();
        setIsShuffled(false);
        setRepeatMode(0);
      }
      activeAccount.current = undefined;
      return;
    }
    if (activeAccount.current === accountId) return;
    if (activeAccount.current) {
      clear();
      setIsShuffled(false);
      setRepeatMode(0);
    }
    activeAccount.current = accountId;

    const saved = readMusicSession(accountId);
    const selected = saved?.queue.find((item) => item.id === saved.trackId);
    if (!saved || !selected) {
      writeMusicSession(null);
      return;
    }
    queueRef.current = saved.queue;
    originalQueueRef.current = saved.originalQueue;
    queueIndexRef.current = saved.queue.indexOf(selected);
    setQueue(saved.queue);
    setQueueSource(saved.source);
    setIsShuffled(saved.shuffled);
    setRepeatMode(saved.repeat);
    void loadTrack(selected, saved.position, saved.resume, true);
  }, [accountId, userId, clear, loadTrack]);

  useEffect(() => {
    if (!accountId || !track) return;
    const save = () => {
      const audio = audioRef.current;
      if (!isCurrentAccount(accountId) || activeAccount.current !== accountId ||
          !queueRef.current.some((item) => item.id === track.id)) return;
      const ready = Boolean(audio?.getAttribute("src") && audio.readyState >= 1 && pendingSeek.current === undefined);
      writeMusicSession({
        accountId,
        trackId: track.id,
        queue: queueRef.current,
        originalQueue: originalQueueRef.current,
        source: queueSource,
        position: ready ? audio!.currentTime : positionRef.current,
        resume: ready ? !audio!.paused && !audio!.ended : resumeRef.current,
        shuffled: isShuffled,
        repeat: repeatMode,
      });
    };
    save();
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [accountId, track, queue, queueSource, isShuffled, repeatMode, isPlaying, isCurrentAccount]);

  const playTrack = useCallback(
    async (
      nextTrack: MusicTrackDTO,
      nextQueue?: MusicTrackDTO[],
      source?: string,
    ) => {
      if (!accountId || !audioRef.current) return;

      if (nextQueue) {
        setQueueSource(source ?? null);
        originalQueueRef.current = [...nextQueue];

        queueRef.current = isShuffled
          ? [
            nextTrack,
            ...shuffleTracks(
              nextQueue.filter((item) => item.id !== nextTrack.id),
            ),
          ]
          : [...nextQueue];

      }

      let index = queueRef.current.findIndex(
        (item) => item.id === nextTrack.id,
      );

      if (index === -1) {
        originalQueueRef.current = [nextTrack];
        queueRef.current = [nextTrack];
        index = 0;
      }

      queueIndexRef.current = index;
      setQueue(queueRef.current);

      await loadTrack(nextTrack, 0, true);
    },
    [accountId, isShuffled, loadTrack],
  );

  const nextTrack = useCallback(() => {
    const queue = queueRef.current;
    const nextIndex = queueIndexRef.current + 1;

    if (nextIndex >= queue.length) {
      if (repeatMode === 1 && queue.length > 0) {
        const firstTrack = queue[0];
        if (!firstTrack) return;

        queueIndexRef.current = 0;
        void playTrackRef.current(firstTrack);
      }

      return;
    }

    const next = queue[nextIndex];
    if (!next) return;

    queueIndexRef.current = nextIndex;
    void playTrackRef.current(next);
  }, [repeatMode]);

  const handleTrackEnded = useCallback(() => {
    const audio = audioRef.current;

    // Повтор текущего трека.
    if (repeatMode === 2) {
      if (audio) {
        audio.currentTime = 0;
        void audio.play();
      }
      return;
    }

    const queue = queueRef.current;
    const nextIndex = queueIndexRef.current + 1;

    // Следующий трек.
    if (nextIndex < queue.length) {
      const next = queue[nextIndex];
      if (!next) return;

      queueIndexRef.current = nextIndex;
      void playTrackRef.current(next);
      return;
    }

    // Конец списка — возвращаемся к первому.
    if (repeatMode === 1 && queue.length > 0) {
      const first = queue[0];
      if (!first) return;

      queueIndexRef.current = 0;
      void playTrackRef.current(first);
    }
  }, [repeatMode]);

  const previousTrack = useCallback(() => {
    const audio = audioRef.current;
    const queue = queueRef.current;
    const currentIndex = queueIndexRef.current;

    if (!audio || currentIndex < 0) return;

    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    if (currentIndex > 0) {
      const previousIndex = currentIndex - 1;
      const track = queue[previousIndex];
      if (!track) return;

      queueIndexRef.current = previousIndex;
      void playTrackRef.current(track);
    } else {
      audio.currentTime = 0;
    }
  }, []);

  const toggleShuffle = useCallback(() => {
    const currentTrack = track;

    if (!currentTrack) return;

    const originalQueue = originalQueueRef.current;

    const currentIndex = originalQueue.findIndex(
      (item) => item.id === currentTrack.id,
    );

    if (currentIndex === -1) return;

    const remainingTracks = originalQueue.filter(
      (item) => item.id !== currentTrack.id,
    );

    if (!isShuffled) {
      queueRef.current = [
        currentTrack,
        ...shuffleTracks(remainingTracks),
      ];
    } else {
      queueRef.current = [...originalQueue];
    }

    queueIndexRef.current = queueRef.current.findIndex(
      (item) => item.id === currentTrack.id,
    );
    setQueue(queueRef.current);

    setIsShuffled((previous) => !previous);
  }, [track, isShuffled]);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((previous) => ((previous + 1) % 3) as RepeatMode);
  }, []);

  const renameTrack = useCallback((id: string, title: string, artist: string) => {
    const update = (item: MusicTrackDTO) => item.id === id ? { ...item, title, artist } : item;
    queueRef.current = queueRef.current.map(update);
    originalQueueRef.current = originalQueueRef.current.map(update);
    setQueue(queueRef.current);
    setTrack((current) => current ? update(current) : null);
  }, []);

  const setCurrentQueue = useCallback((queue: MusicTrackDTO[], source?: string) => {
    if (!track || !queue.some((item) => item.id === track.id)) return;
    setQueueSource(source ?? null);
    const original = originalQueueRef.current;
    if (original.length === queue.length && original.every((item, index) => item.id === queue[index]?.id)) return;
    originalQueueRef.current = [...queue];
    queueRef.current = isShuffled
      ? [track, ...shuffleTracks(queue.filter((item) => item.id !== track.id))]
      : [...queue];
    queueIndexRef.current = queueRef.current.findIndex((item) => item.id === track.id);
    setQueue(queueRef.current);
  }, [track, isShuffled]);

  useEffect(() => {
    playTrackRef.current = playTrack;
    nextTrackRef.current = nextTrack;
    previousTrackRef.current = previousTrack;
    endedTrackRef.current = handleTrackEnded;
  }, [playTrack, nextTrack, previousTrack, handleTrackEnded]);

  const pause = useCallback(() => {
    resumeRef.current = false;
    audioRef.current?.pause();
  }, []);

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!accountId || !audio || !track || isLoading) return;

    if (!audio.paused) {
      pause();
      return;
    }
    if (!audio.getAttribute("src") || audio.error) {
      await loadTrack(track, positionRef.current, true);
      return;
    }

    const requestId = requestIdRef.current;
    try {
      setError(null);
      resumeRef.current = true;
      await audio.play();
    } catch {
      if (requestId !== requestIdRef.current) return;
      resumeRef.current = false;
      setIsPlaying(false);
      setError("Не удалось продолжить воспроизведение.");
    }
  }, [accountId, isLoading, loadTrack, pause, track]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;

    audio.currentTime = Math.max(
      0,
      Math.min(time, audio.duration),
    );
  }, []);

  const setVolume = useCallback((nextVolume: number) => {
    if (!Number.isFinite(nextVolume)) return;
    const normalizedVolume = Math.min(1, Math.max(0, nextVolume));
    setVolumeState(normalizedVolume);
    try {
      localStorage.setItem("music-volume", String(normalizedVolume));
    } catch {
      // A blocked storage backend only prevents saving the preference across visits.
    }
  }, []);

  const value = useMemo(
    () => ({
      track,
      queue,
      queueSource,
      nextTrack,
      previousTrack,
      isPlaying,
      isLoading,
      duration,
      volume,
      error,
      playTrack,
      setCurrentQueue,
      renameTrack,
      togglePlayback,
      pause,
      seek,
      setVolume,
      clear,
      isShuffled,
      repeatMode,
      toggleShuffle,
      cycleRepeatMode,
    }),
    [
      track,
      queue,
      queueSource,
      nextTrack,
      previousTrack,
      isPlaying,
      isLoading,
      duration,
      volume,
      error,
      playTrack,
      setCurrentQueue,
      renameTrack,
      togglePlayback,
      pause,
      seek,
      setVolume,
      clear,
      isShuffled,
      repeatMode,
      toggleShuffle,
      cycleRepeatMode,
    ],
  );

  return (
    <MusicContext.Provider value={value}>
      <MusicTimeContext.Provider value={currentTime}>{children}</MusicTimeContext.Provider>
    </MusicContext.Provider>
  );
}

export function useMusicTime() {
  return useContext(MusicTimeContext);
}

export function useMusicPlayer() {
  const context = useContext(MusicContext);

  if (!context) {
    throw new Error(
      "useMusicPlayer must be used inside MusicPlayerProvider",
    );
  }

  return context;
}

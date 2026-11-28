import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ALLOWED_MUSIC_TYPES, MAX_MUSIC_BYTES } from "@commune/shared";
import type { MusicTrackDTO, MusicUploadJob, MusicUploadResult, MusicUploadStage, MusicUploadTicket } from "@commune/shared";
import { api, ApiError, withQuery } from "../lib/api";
import MusicTrackList from "../components/MusicTrackList";
import AeroProgress from "../components/AeroProgress";
import { useAuth } from "../store/auth";
import { useDialogBackdrop } from "../hooks/useDialogBackdrop";
import { useLoadMoreOnVisible } from "../hooks/useInfiniteScroll";
import { putSignedUpload } from "../lib/upload";
type MusicScope = "all" | "mine";

const MUSIC_TABS = [
  { scope: "mine", label: "Моя библиотека" },
  { scope: "all", label: "Вся музыка" },
] as const;

const MIME_BY_EXTENSION: Record<string, (typeof ALLOWED_MUSIC_TYPES)[number]> = {
  mp3: "audio/mpeg",
  flac: "audio/flac",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

const uploadStages: Record<MusicUploadStage, string> = {
  queued: "Ожидает обработки",
  downloading: "Получение исходного файла",
  inspecting: "Проверка исходного формата",
  converting: "Конвертация в MP3",
  validating: "Проверка готового MP3",
  saving: "Сохранение в библиотеку",
  retrying: "Не удалось обработать файл. Повторим автоматически, исходник сохранён.",
  delayed: "Обработка задерживается. Файл принят, повторная загрузка не нужна.",
  failed: "Не удалось подготовить MP3. Проверьте, что файл открывается, или выберите другую копию.",
};

function MusicProgress({ label, percent }: { label: string; percent: number }) {
  return <div className="music-page__progress">
    <div className="music-page__progress-caption">
      <span role="status">{label}</span>
      <strong aria-hidden="true">{percent}%</strong>
    </div>
    <AeroProgress label={label} value={percent} />
  </div>;
}

function MusicProcessingCard({ job, retry }: { job: MusicUploadJob; retry: (job: MusicUploadJob) => void }) {
  const seconds = job.processedSeconds;
  const message = job.stage === "retrying" && job.retryReason === "tools_unavailable"
    ? "Обработка аудио на сервере временно недоступна. Повторим автоматически, исходник сохранён."
    : uploadStages[job.stage];
  return <article className="card music-page__track music-page__processing" aria-label={`${job.artist} — ${job.title}`}>
    <div>
      <strong>{job.artist} — {job.title}</strong>
      {job.progressPercent === undefined ? (
        <p className={job.stage === "failed" ? "aero-error" : "muted"} role="status">{message}</p>
      ) : <MusicProgress label={message} percent={job.progressPercent} />}
      {job.progressPercent === undefined && seconds !== undefined && <small className="muted">Обработано {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} аудио</small>}
    </div>
    {job.stage === "failed" && <button type="button" className="aero-button" onClick={() => retry(job)}>Повторить загрузку</button>}
  </article>;
}

export default function MusicPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const refreshLibraries = useCallback(() => Promise.all(
    ["music", "profile-music", "music-picker"].map(key => queryClient.invalidateQueries({ queryKey: [key] })),
  ), [queryClient]);

  const [scope, setScope] = useState<MusicScope>("mine");
  const [search, setSearch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [readingMetadata, setReadingMetadata] = useState(false);
  const fileSelection = useRef(0);
  const editedFields = useRef({ title: false, artist: false });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const tabRefs = useRef<Partial<Record<MusicScope, HTMLButtonElement>>>({});
  const [transfer, setTransfer] = useState<{ stage: "signing" | "uploading" | "confirming"; percent?: number }>();
  const uploadRequest = useRef<AbortController>();
  const sentFile = useRef<{ file: File; title: string; artist: string; userId: string; uploadId: string }>();
  useEffect(() => () => {
    uploadRequest.current?.abort();
    sentFile.current = undefined;
  }, [user?.id]);

  const tracksQuery = useInfiniteQuery({
    queryKey: ["music", scope, search, user?.id],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api<{ tracks: MusicTrackDTO[]; nextCursor: string | null }>(
        withQuery("/music/picker", {
          scope,
          q: search.trim() || undefined,
          cursor: pageParam,
        }), { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchOnMount: "always",
  });
  const uploadsKey = ["music-uploads", user?.id] as const;
  const uploadsQuery = useQuery({
    queryKey: uploadsKey,
    enabled: Boolean(user) && scope === "mine",
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async ({ signal, queryKey }) => {
      const jobs = await api<MusicUploadJob[]>("/music/uploads", { signal });
      const previous = queryClient.getQueryData<MusicUploadJob[]>(queryKey);
      if (previous?.some(job => job.stage !== "failed" && !jobs.some(next => next.id === job.id))) {
        await refreshLibraries();
      }
      return jobs;
    },
    refetchInterval: ({ state }) => {
      const jobs = state.data ?? [];
      if (jobs.some(job => job.stage === "downloading" || job.stage === "inspecting" || job.stage === "converting" || job.stage === "validating" || job.stage === "saving")) return 1000;
      if (jobs.some(job => job.stage === "queued")) return 2000;
      return jobs.some(job => job.stage === "retrying" || job.stage === "delayed") ? 5000 : false;
    },
  });
  const uploads = (uploadsQuery.data ?? []).filter(job =>
    !search.trim() || `${job.title} ${job.artist}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const sentinel = useLoadMoreOnVisible(() => void tracksQuery.fetchNextPage({ cancelRefetch: false }), Boolean(tracksQuery.hasNextPage && !tracksQuery.isFetching && !tracksQuery.isError));

  const uploadMutation = useMutation({
    mutationFn: async ({
      selectedFile,
      trackTitle,
      trackArtist,
    }: {
      selectedFile: File;
      trackTitle: string;
      trackArtist: string;
    }) => {
      const extension = selectedFile.name.split(".").pop()?.toLowerCase();
      const mimeType = extension ? MIME_BY_EXTENSION[extension] : undefined;

      if (!mimeType || !ALLOWED_MUSIC_TYPES.includes(mimeType)) {
        throw new Error("Поддерживаются MP3, FLAC, WAV, M4A и OGG.");
      }

      if (selectedFile.size > MAX_MUSIC_BYTES) {
        throw new Error("Максимальный размер файла — 100 МБ.");
      }

      if (!user) throw new Error("Войдите, чтобы загрузить музыку.");
      const controller = new AbortController();
      uploadRequest.current = controller;
      try {
        let previous = sentFile.current;
        if (previous?.file !== selectedFile || previous.title !== trackTitle || previous.artist !== trackArtist || previous.userId !== user.id) {
          setTransfer({ stage: "signing" });
          const ticket = await api<MusicUploadTicket>("/music/uploads/sign", {
            method: "POST",
            body: {
              title: trackTitle,
              artist: trackArtist,
              mimeType,
              size: selectedFile.size,
            },
            signal: controller.signal,
          });
          setTransfer({ stage: "uploading" });
          await putSignedUpload(ticket.url, selectedFile, mimeType, percent => setTransfer({ stage: "uploading", percent }), controller.signal);
          previous = { file: selectedFile, title: trackTitle, artist: trackArtist, userId: user.id, uploadId: ticket.uploadId };
          sentFile.current = previous;
        }
        setTransfer({ stage: "confirming" });
        const result = await api<MusicUploadResult>("/music/uploads/complete", {
          method: "POST", body: { uploadId: previous.uploadId, background: true }, signal: controller.signal,
        });
        sentFile.current = undefined;
        return { result, job: { id: previous.uploadId, title: trackTitle, artist: trackArtist, stage: "queued" } as const, userId: user.id };
      } catch (error) {
        if (error instanceof ApiError && (error.status === 400 || error.status === 404)) sentFile.current = undefined;
        throw error;
      } finally {
        if (uploadRequest.current === controller) uploadRequest.current = undefined;
        setTransfer(undefined);
      }
    },
    onSuccess: async ({ result, job, userId }) => {
      const key = ["music-uploads", userId];
      await queryClient.cancelQueries({ queryKey: key });
      if ("processing" in result) {
        queryClient.setQueryData<MusicUploadJob[]>(key, jobs => [job, ...(jobs ?? []).filter(item => item.id !== job.id)]);
      } else void refreshLibraries();
      if (user?.id !== userId) return;
      setScope("mine");
      setSearch("");
      dialogRef.current?.close();
      resetUploadForm();
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const tracks = [...new Map((tracksQuery.data?.pages ?? []).flatMap((page) => page.tracks).map((track) => [track.id, track])).values()];

  function selectFile(selectedFile: File | undefined) {
    sentFile.current = undefined;
    const selection = ++fileSelection.current;
    if (!selectedFile) {
      setFile(null);
      setReadingMetadata(false);
      return;
    }

    setFile(selectedFile);

    const name = selectedFile.name.replace(/\.[^.]+$/, "");
    const separator = name.indexOf("-");

    if (!editedFields.current.title) {
      setTitle((separator < 0 ? name : name.slice(separator + 1)).trim());
    }
    if (!editedFields.current.artist) {
      setArtist(separator < 0 ? "" : name.slice(0, separator).trim());
    }

    setReadingMetadata(true);
    void import("music-metadata")
      .then(({ parseBlob }) => parseBlob(selectedFile, { skipCovers: true }))
      .then(({ common }) => {
        if (fileSelection.current !== selection) return;
        if (!editedFields.current.title && common.title?.trim()) setTitle(common.title.trim());
        if (!editedFields.current.artist && common.artist?.trim()) setArtist(common.artist.trim());
      })
      .catch(() => {
        // Missing or unreadable tags leave the filename-based values in place.
      })
      .finally(() => {
        if (fileSelection.current === selection) setReadingMetadata(false);
      });
  }

  function resetUploadForm() {
    sentFile.current = undefined;
    fileSelection.current++;
    setReadingMetadata(false);
    setFile(null);
    setTitle("");
    setArtist("");
    editedFields.current = { title: false, artist: false };
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function closeUploadDialog() {
    if (uploadMutation.isPending) return;
    dialogRef.current?.close();
    resetUploadForm();
    uploadMutation.reset();
  }
  const uploadBackdrop = useDialogBackdrop(closeUploadDialog);

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !title.trim() || !artist.trim() || readingMetadata || uploadMutation.isPending) return;

    uploadMutation.mutate({
      selectedFile: file,
      trackTitle: title.trim(),
      trackArtist: artist.trim(),
    });
  }

  function startUpload(job?: MusicUploadJob) {
    uploadMutation.reset();
    if (job) {
      setTitle(job.title);
      setArtist(job.artist);
      editedFields.current = { title: true, artist: true };
    }
    dialogRef.current?.showModal();
    fileInputRef.current?.focus();
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, currentScope: MusicScope) {
    let nextScope: MusicScope;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight":
        { const index = MUSIC_TABS.findIndex((tab) => tab.scope === currentScope);
          nextScope = MUSIC_TABS[(index + (event.key === "ArrowRight" ? 1 : MUSIC_TABS.length - 1)) % MUSIC_TABS.length]!.scope; }
        break;
      case "Home":
        nextScope = "mine";
        break;
      case "End":
        nextScope = "all";
        break;
      default:
        return;
    }

    event.preventDefault();
    setScope(nextScope);
    tabRefs.current[nextScope]?.focus();
  }

  return (
    <section className="music-page">
      <h1 className="search-title">Музыка</h1>

      <div className="music-page__toolbar">
        <input
          className="input music-page__search"
          type="search"
          aria-label="Поиск по названию или исполнителю"
          placeholder="Поиск по названию или исполнителю"
          value={search}
          maxLength={100}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button
          type="button"
          className="aero-button"
          aria-haspopup="dialog"
          onClick={() => startUpload()}
        >
          Загрузить музыку
        </button>
      </div>

      <div className="tabs feed-tabs music-page__tabs" role="tablist" aria-label="Раздел музыки">
        {MUSIC_TABS.map(({ scope: tabScope, label }) => (
          <button
            key={tabScope}
            ref={(button) => {
              tabRefs.current[tabScope] = button ?? undefined;
            }}
            id={`music-tab-${tabScope}`}
            type="button"
            role="tab"
            aria-selected={scope === tabScope}
            aria-controls={`music-panel-${tabScope}`}
            tabIndex={scope === tabScope ? 0 : -1}
            className={scope === tabScope ? "tab active" : "tab"}
            aria-label={label}
            onClick={() => setScope(tabScope)}
            onKeyDown={(event) => handleTabKey(event, tabScope)}
          >
            {label}
          </button>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        {...uploadBackdrop}
        className="music-page__upload-dialog"
        aria-labelledby="music-upload-title"
        onCancel={(event) => {
          event.preventDefault();
          closeUploadDialog();
        }}
      >
        <header className="music-attachment-picker__header">
          <h2 id="music-upload-title">Загрузить музыку</h2>
          <span className="aero-window-controls music-player__window-controls">
            <span className="aero-window-control aero-window-close">
              <button type="button" className="music-player__close" onClick={closeUploadDialog} disabled={uploadMutation.isPending} aria-label="Закрыть окно загрузки" title="Закрыть">
                <i className="aero-control-close" aria-hidden="true" />
              </button>
            </span>
          </span>
        </header>

        <form className="music-page__upload-form" onSubmit={upload}>
          <fieldset disabled={uploadMutation.isPending}>
            <label className="music-page__field">
              <span>Аудиофайл</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.flac,.wav,.m4a,.ogg,audio/*"
                aria-describedby="music-upload-limits"
                onChange={(event) => selectFile(event.target.files?.[0])}
              />
            </label>

            {file && (
              <p className="muted">
                {file.name} · {formatSize(file.size)}
              </p>
            )}

            <label className="music-page__field">
              <span>Название</span>
              <input
                className="aero-input"
                value={title}
                maxLength={200}
                onChange={(event) => {
                  editedFields.current.title = true;
                  setTitle(event.target.value);
                }}
              />
            </label>

            <label className="music-page__field">
              <span>Исполнитель</span>
              <input
                className="aero-input"
                value={artist}
                maxLength={200}
                onChange={(event) => {
                  editedFields.current.artist = true;
                  setArtist(event.target.value);
                }}
              />
            </label>
          </fieldset>

          <p className="muted" id="music-upload-limits">
            MP3, FLAC, WAV, M4A, OGG. Максимальный размер — 100 МБ.
          </p>

          {uploadMutation.isError && (
            <p className="aero-error" role="alert">
              {uploadMutation.error.message}
            </p>
          )}

          <div className="music-page__upload-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!file || !title.trim() || !artist.trim() || readingMetadata || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? "Загрузка..." : "Загрузить"}
            </button>
            <button
              type="button"
              className="aero-button"
              onClick={closeUploadDialog}
              disabled={uploadMutation.isPending}
            >
              Отмена
            </button>
          </div>
          {transfer?.stage === "uploading" && transfer.percent !== undefined ? (
            <MusicProgress label="Передача файла" percent={transfer.percent} />
          ) : (
            <span className="music-page__upload-status" role="status">
              {transfer?.stage === "signing" ? "Подготовка загрузки…" :
                transfer?.stage === "uploading" ? "Передача файла…" :
                transfer?.stage === "confirming" ? "Сервер проверяет приём файла…" :
                readingMetadata ? "Чтение данных трека…" : ""}
            </span>
          )}
        </form>
      </dialog>

      {MUSIC_TABS.map(({ scope: tabScope }) => (
        <div
          key={tabScope}
          id={`music-panel-${tabScope}`}
          role="tabpanel"
          aria-labelledby={`music-tab-${tabScope}`}
          hidden={scope !== tabScope}
          tabIndex={0}
        >
          {scope === tabScope && (
            <section className="music-page__list">
              <h2>{scope === "all" ? "Каталог" : "Моя библиотека"}</h2>

              {tracksQuery.isLoading && <p className="muted center">Загрузка музыки...</p>}

              {tracksQuery.isError && (
                <p className="error center" role="alert">
                  {tracksQuery.error.message}
                </p>
              )}

              {scope === "mine" && uploads.map(job => <MusicProcessingCard key={job.id} job={job} retry={startUpload} />)}
              {scope === "mine" && uploadsQuery.isError && (
                <p role="alert" className="aero-error">Не удалось получить статус загрузок. <button type="button" className="link-btn" onClick={() => void uploadsQuery.refetch()}>Проверить снова</button></p>
              )}
              {tracksQuery.isSuccess && tracks.length === 0 && (scope !== "mine" || uploads.length === 0) && (
                <p className="muted center">
                  {scope === "mine" ? "В библиотеке пока нет музыки." : "Ничего не найдено."}
                </p>
              )}

              <MusicTrackList tracks={tracks} source={`music:${user?.id}:${scope}`} />
              {tracksQuery.hasNextPage && <div ref={sentinel} aria-hidden="true" />}
              {tracksQuery.hasNextPage && <button className="btn btn-ghost block" disabled={tracksQuery.isFetching} onClick={() => void tracksQuery.fetchNextPage()}>{tracksQuery.isFetchingNextPage ? "Загрузка…" : "Загрузить ещё"}</button>}
            </section>
          )}
        </div>
      ))}
    </section>
  );
}

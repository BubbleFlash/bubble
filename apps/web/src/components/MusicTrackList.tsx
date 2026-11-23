import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MusicTrackDTO } from "@commune/shared";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import { useMusicPlayer } from "../store/music";
import Icon from "./Icon";
import { useDialogBackdrop } from "../hooks/useDialogBackdrop";
import { useEffect, useId, useRef, useState } from "react";

export default function MusicTrackList({ tracks, source, order, selection, loadLibraryStatus = true, loadQueue }: { tracks: MusicTrackDTO[]; source: string; order?: string[]; loadLibraryStatus?: boolean; loadQueue?: (signal: AbortSignal) => Promise<MusicTrackDTO[]>; selection?: { selected: MusicTrackDTO[]; onChange: (tracks: MusicTrackDTO[]) => void; max?: number } }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const libraryBusy = useIsMutating({ mutationKey: ["music-library", user?.id] }) > 0;
  const { track: current, queueSource, isPlaying, playTrack, togglePlayback, setCurrentQueue, renameTrack } = useMusicPlayer();
  const [editing, setEditing] = useState<{ id: string; title: string; artist: string }>();
  const editDialog = useRef<HTMLDialogElement>(null);
  const editTitleId = useId();
  const [now, setNow] = useState(Date.now());
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState(false);
  const queueRequest = useRef<AbortController>();
  const queueReady = useRef(false);
  const playerState = useRef({ current, queueSource, isPlaying });
  playerState.current = { current, queueSource, isPlaying };
  useEffect(() => () => queueRequest.current?.abort(), []);
  useEffect(() => {
    const deadline = Math.min(...tracks.flatMap((item) => item.editableUntil && Date.parse(item.editableUntil) > now ? [Date.parse(item.editableUntil)] : []));
    if (!Number.isFinite(deadline)) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, deadline - Date.now() + 1));
    return () => window.clearTimeout(timer);
  }, [tracks, now]);
  const ids = [...new Set(tracks.map((track) => track.id))].sort();
  const statuses = useQuery({
    queryKey: ["music", "statuses", user?.id, ids],
    enabled: Boolean(loadLibraryStatus && user && ids.length),
    queryFn: async () => {
      const batches = [];
      for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100));
      const responses = await Promise.all(batches.map((batch) => api<{ ids: string[] }>("/music/library/status", { method: "POST", body: { ids: batch } })));
      return responses.flatMap((response) => response.ids);
    },
  });
  const library = useMutation({
    mutationKey: ["music-library", user?.id],
    mutationFn: ({ id, added }: { id: string; added: boolean }) => api<void>(`/music/${id}/library`, { method: added ? "DELETE" : "POST" }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["music"] }),
        qc.invalidateQueries({ queryKey: ["profile-music"] }),
        qc.invalidateQueries({ queryKey: ["music-picker"] }),
      ]);
    },
  });
  const download = useMutation({
    mutationFn: (id: string) => api<{ url: string }>(`/music/${id}/download`),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const rename = useMutation({
    mutationFn: ({ id, title, artist }: { id: string; title: string; artist: string }) => api<{ id: string; title: string; artist: string }>(`/music/${id}`, { method: "PATCH", body: { title, artist } }),
    onSuccess: async ({ id, title, artist }) => {
      renameTrack(id, title, artist);
      setEditing(undefined);
      await Promise.all([qc.invalidateQueries({ queryKey: ["music"] }), qc.invalidateQueries({ queryKey: ["profile-music"] }), qc.invalidateQueries({ queryKey: ["music-picker"] })]);
    },
  });
  const closeEdit = () => { if (!rename.isPending) setEditing(undefined); };
  const editBackdrop = useDialogBackdrop(closeEdit);
  useEffect(() => { if (editing && !editDialog.current?.open) editDialog.current?.showModal(); }, [editing]);
  const toggle = async (track: MusicTrackDTO) => {
    if (queueRequest.current) return;
    let queue = tracks;
    let queueLoaded = false;
    if (loadQueue && (queueSource !== source || !queueReady.current)) {
      const controller = new AbortController();
      queueRequest.current = controller;
      setQueueLoading(true);
      setQueueError(false);
      try {
        queue = await loadQueue(controller.signal);
        if (controller.signal.aborted) return;
        if (!queue.some((item) => item.id === track.id)) throw new Error("Track unavailable");
        if (playerState.current.current?.id !== current?.id || playerState.current.queueSource !== queueSource) return;
        queueReady.current = true;
        queueLoaded = true;
      } catch {
        if (!controller.signal.aborted) setQueueError(true);
        return;
      } finally {
        queueRequest.current = undefined;
        if (!controller.signal.aborted) setQueueLoading(false);
      }
    }
    if (current?.id !== track.id) void playTrack(track, queue, source);
    else if (queueSource !== source) {
      setCurrentQueue(queue, source);
      if (!isPlaying) void togglePlayback();
    } else {
      if (queueLoaded) setCurrentQueue(queue, source);
      void togglePlayback();
    }
  };
  return <>
    {(order ?? tracks.map((track) => track.id)).map((id) => {
      const track = tracks.find((item) => item.id === id);
      if (!track) return <div className="card music-page__track muted" key={id}>Трек недоступен</div>;
      const selected = current?.id === track.id && queueSource === source;
      const playing = selected && isPlaying;
      const added = statuses.data?.includes(track.id);
      const checked = selection?.selected.some((item) => item.id === track.id) ?? false;
      return <article className={`card music-page__track${selected ? " music-page__track--playing" : ""}`} key={track.id}>
        {selection && <input className="aero-checkbox" type="checkbox" checked={checked} disabled={!checked && selection.selected.length >= (selection.max ?? 10)} aria-label={`Выбрать ${track.artist} — ${track.title}`} onChange={() => selection.onChange(checked ? selection.selected.filter((item) => item.id !== track.id) : [...selection.selected, track])} />}
        <button type="button" className="music-page__play" disabled={queueLoading} onClick={() => void toggle(track)} aria-label={`${playing ? "Пауза" : "Воспроизвести"} ${track.title}`} title={playing ? "Пауза" : "Воспроизвести"}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d={playing ? "M4 3h3v10H4zM9 3h3v10H9z" : "M3 2v12l10-6z"} fill="currentColor" /></svg>
        </button>
        <button type="button" className="music-page__track-title" title={`${track.artist} — ${track.title}`} disabled={queueLoading || Boolean(selection && !checked && selection.selected.length >= (selection.max ?? 10))} onClick={() => selection ? selection.onChange(checked ? selection.selected.filter((item) => item.id !== track.id) : [...selection.selected, track]) : void toggle(track)}>{track.artist} — {track.title}</button>
        <span className="muted music-page__track-duration" aria-label={track.duration == null ? "Длительность неизвестна" : undefined} title="Длительность трека">{track.duration == null ? "—" : `${Math.floor(track.duration / 60)}:${String(Math.floor(track.duration % 60)).padStart(2, "0")}`}</span>
        {user && <>
          {!selection && track.editableUntil && Date.parse(track.editableUntil) > now && <button type="button" className="btn btn-ghost music-page__library-button" aria-label={`Изменить трек ${track.title}`} title="Изменить трек" onClick={() => { rename.reset(); setEditing({ id: track.id, title: track.title, artist: track.artist }); }}><Icon name="pencil" size={16} /></button>}
          <button type="button" className="btn btn-ghost music-page__library-button" aria-label={`Скачать ${track.title}`} title="Скачать трек" disabled={download.isPending} onClick={() => download.mutate(track.id)}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z" /></svg></button>
          <button type="button" className="btn btn-ghost music-page__library-button" aria-label={!statuses.data ? "Проверка библиотеки" : added ? "Убрать из библиотеки" : "Добавить в библиотеку"} title={!statuses.data ? "Проверка библиотеки" : added ? "Убрать из библиотеки" : "Добавить в библиотеку"} disabled={!statuses.data || statuses.isFetching || libraryBusy} onClick={() => library.mutate({ id: track.id, added: Boolean(added) })}>{statuses.data && <Icon name={added ? "trash" : "plus"} size={added ? 16 : 20} />}</button>
        </>}
      </article>;
    })}
    {editing && <dialog ref={editDialog} {...editBackdrop} className="music-page__upload-dialog" aria-labelledby={editTitleId} onCancel={(event) => { event.preventDefault(); closeEdit(); }}>
      <header className="music-attachment-picker__header">
        <h2 id={editTitleId}>Изменить трек</h2>
        <span className="aero-window-controls music-player__window-controls"><span className="aero-window-control aero-window-close"><button type="button" className="music-player__close" onClick={closeEdit} disabled={rename.isPending} aria-label="Закрыть окно" title="Закрыть"><i className="aero-control-close" aria-hidden="true" /></button></span></span>
      </header>
      <form className="music-page__upload-form" onSubmit={(event) => { event.preventDefault(); if (editing.title.trim() && editing.artist.trim() && !rename.isPending) rename.mutate({ id: editing.id, title: editing.title.trim(), artist: editing.artist.trim() }); }}>
        <fieldset disabled={rename.isPending}>
          <label className="music-page__field"><span>Название трека</span><input className="aero-input" autoFocus value={editing.title} maxLength={200} onChange={(event) => setEditing({ ...editing, title: event.target.value })} /></label>
          <label className="music-page__field"><span>Исполнитель</span><input className="aero-input" value={editing.artist} maxLength={200} onChange={(event) => setEditing({ ...editing, artist: event.target.value })} /></label>
        </fieldset>
        {rename.isError && <p className="aero-error" role="alert">{rename.error.message}</p>}
        <div className="music-page__upload-actions"><button type="submit" className="btn btn-primary" disabled={rename.isPending || !editing.title.trim() || !editing.artist.trim()}>Сохранить</button><button type="button" className="btn" disabled={rename.isPending} onClick={closeEdit}>Отмена</button></div>
      </form>
    </dialog>}
    {statuses.isError && <p className="error" role="alert">Не удалось проверить библиотеку. <button type="button" onClick={() => void statuses.refetch()}>Повторить</button></p>}
    {queueLoading && <p className="muted" role="status">Загрузка очереди…</p>}
    {queueError && <p className="error" role="alert">Не удалось загрузить очередь. Попробуйте снова.</p>}
    {library.isError && <p className="error" role="alert">Не удалось обновить библиотеку. Попробуйте ещё раз.</p>}
    {download.isError && <p className="error" role="alert">Не удалось скачать трек. Попробуйте ещё раз.</p>}
  </>;
}

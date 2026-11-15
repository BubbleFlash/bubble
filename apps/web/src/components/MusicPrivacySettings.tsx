import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MusicSettings } from "@commune/shared";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";

export default function MusicPrivacySettings({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { isCurrentAccount } = useAuth();
  const queryKey = ["music-settings", userId];
  const settings = useQuery({
    queryKey,
    queryFn: () => api<MusicSettings>("/users/me/music-settings"),
  });
  const save = useMutation({
    mutationFn: (visibility: MusicSettings["visibility"]) =>
      api<MusicSettings>("/users/me/music-settings", { method: "PATCH", body: { visibility } }),
    onSuccess: (saved) => {
      if (!isCurrentAccount(userId)) return;
      queryClient.setQueryData(queryKey, saved);
      void queryClient.invalidateQueries({ queryKey: ["profile-music"] });
    },
  });

  return (
    <section className="card appearance-section" aria-labelledby="music-privacy-title">
      <h2 id="music-privacy-title">Музыкальная библиотека</h2>
      {settings.isPending && <p role="status">Загрузка настройки…</p>}
      {settings.isError && (
        <div className="row">
          <p className="error" role="alert">Не удалось загрузить настройку.</p>
          <button type="button" className="btn" onClick={() => void settings.refetch()}>Повторить</button>
        </div>
      )}
      {settings.data && (
        <label className="friends-privacy-field">
          Кто видит музыку в моём профиле
          <select
            aria-describedby="music-privacy-hint"
            value={save.isPending ? save.variables : settings.data.visibility}
            disabled={save.isPending}
            onChange={(event) => save.mutate(event.target.value as MusicSettings["visibility"])}
          >
            <option value="everyone">Все пользователи</option>
            <option value="friends">Только друзья</option>
            <option value="private">Только я</option>
          </select>
        </label>
      )}
      <p id="music-privacy-hint" className="muted">Треки остаются доступны в общем каталоге.</p>
      {save.isPending && <p role="status">Сохранение…</p>}
      {save.isSuccess && <p role="status">Настройка сохранена</p>}
      {save.isError && (
        <div className="row">
          <p className="error" role="alert">Не удалось сохранить настройку.</p>
          <button type="button" className="btn" onClick={() => save.mutate(save.variables)}>Повторить сохранение</button>
        </div>
      )}
    </section>
  );
}

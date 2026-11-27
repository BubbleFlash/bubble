import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GameLink, GameLinkInput } from "@commune/shared";
import { api } from "../lib/api";
import { gameCatalogKey, useGameCatalog } from "../lib/games";

export default function GameCatalogSettings() {
  const games = useGameCatalog();
  const cache = useQueryClient();
  const add = useMutation({
    mutationFn: (game: GameLinkInput) => api<GameLink>("/moderation/games", { method: "POST", body: game }),
    onSuccess: () => cache.invalidateQueries({ queryKey: gameCatalogKey }),
  });

  return (
    <section className="card moderation-action">
      <h2>Каталог игр</h2>
      <form className="site-content-editor" onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        add.mutate({
          name: String(data.get("name") ?? "").trim(),
          url: String(data.get("url") ?? "").trim(),
          logoUrl: String(data.get("logoUrl") ?? "").trim() || undefined,
        }, { onSuccess: () => form.reset() });
      }}>
        <fieldset className="game-catalog-fields" disabled={add.isPending} onChange={() => add.reset()}>
          <label><span>Название игры</span><input name="name" required maxLength={100} /></label>
          <label><span>Ссылка на игру</span><input name="url" type="url" required maxLength={2048} /></label>
          <label><span>HTTPS-ссылка на логотип (необязательно)</span><input name="logoUrl" type="url" maxLength={2048} /></label>
          <button className="btn">{add.isPending ? "Сохранение…" : "Добавить игру"}</button>
        </fieldset>
      </form>
      {add.isError && <p role="alert" className="error">{add.error.message}</p>}
      {add.isSuccess && <p role="status">Игра добавлена.</p>}
      {games.isError && <p role="alert" className="error">Не удалось загрузить список игр.</p>}
      {!!games.data?.items.length && <ul>{games.data.items.map((game) => <li key={game.url}>{game.name}</li>)}</ul>}
    </section>
  );
}

import { useEffect, useId, useRef, useState } from "react";
import type { GameLink } from "@commune/shared";
import { useGameCatalog } from "../lib/games";
import { useDialogBackdrop } from "../hooks/useDialogBackdrop";
import AeroDialogTitlebar from "./AeroDialogTitlebar";
import Icon from "./Icon";

function GameLogo({ logoUrl }: Pick<GameLink, "logoUrl">) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="game-shortcut__logo" aria-hidden="true">
      {logoUrl && !failed
        ? <img src={logoUrl} alt="" width={64} height={64} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : <Icon name="games" size={38} />}
    </span>
  );
}

export default function GameCatalogDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const games = useGameCatalog();
  const dismiss = () => dialog.current?.close();
  const backdrop = useDialogBackdrop(dismiss);

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="aero-dialog-frame game-catalog-dialog" aria-labelledby={titleId} onClose={onClose} {...backdrop}>
      <AeroDialogTitlebar title="Игры" titleId={titleId} closeLabel="Закрыть каталог игр" onClose={dismiss} />
      <div className="aero-dialog-frame__body game-catalog-dialog__body">
        {games.isPending && <p role="status">Загрузка игр…</p>}
        {games.isError && (
          <div>
            <p className="error" role="alert">Не удалось загрузить каталог игр.</p>
            <button type="button" className="btn" onClick={() => void games.refetch()} disabled={games.isFetching}>Повторить</button>
          </div>
        )}
        {games.data?.items.length === 0 && <p>В каталоге пока нет игр.</p>}
        {!!games.data?.items.length && (
          <ul className="game-shortcuts">
            {games.data.items.map((game) => (
              <li key={game.url}>
                <a className="game-shortcut" href={game.url} target="_blank" rel="noopener noreferrer">
                  <GameLogo logoUrl={game.logoUrl} />
                  <span>{game.name}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { NotificationDTO } from "@commune/shared";
import { Link, useLocation } from "react-router-dom";
import { useNotificationReadSession } from "../hooks/useSocial";
import NavigationIcon from "./NavigationIcon";
import NotificationList from "./NotificationList";

export default function NotificationMenu({ count, onNavigateToItem }: {
  count: number;
  onNavigateToItem: () => void;
}) {
  const location = useLocation();
  const [openedAt, setOpenedAt] = useState<typeof location | null>(null);
  const open = openedAt === location;
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const { remember, finish } = useNotificationReadSession();
  const close = useCallback((selection?: NotificationDTO[]) => {
    finish(selection);
    setOpenedAt(null);
  }, [finish]);

  useEffect(() => {
    if (openedAt && !open) close();
  }, [openedAt, open, close]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      close();
      if (root.current?.contains(document.activeElement)) button.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open, close]);

  return (
    <div className="notification-menu" ref={root} onBlur={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close();
    }}>
      <button
        type="button"
        ref={button}
        className="icon-btn"
        aria-label="Уведомления"
        aria-description={count > 0 ? `Непрочитанных: ${count}` : undefined}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => open ? close() : setOpenedAt(location)}
      >
        <NavigationIcon name="bell" size={22} />
        {count > 0 && <span aria-hidden="true" className="badge">{count > 99 ? "99+" : count}</span>}
      </button>
      {open && (
        <section className="notification-popup" id={id} aria-label="Последние уведомления">
          <NotificationList compact onItems={remember} onSelect={(item, event) => {
            if (!event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
              onNavigateToItem();
            }
            close(item.read ? [] : [item]);
          }} />
          <Link className="notification-popup-link" to="/notifications" onClick={() => close()}>
            Открыть страницу уведомлений
          </Link>
        </section>
      )}
    </div>
  );
}

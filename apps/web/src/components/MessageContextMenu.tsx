import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";

export default function MessageContextMenu({ x, y, busy, onEdit, onDelete, onClose }: {
  x: number;
  y: number;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>();
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(x, window.innerWidth - width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - height - 8)) });
  }, [x, y]);
  useLayoutEffect(() => {
    if (position) menu.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [position]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !menu.current?.contains(event.target)) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    const dismiss = () => onClose();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    document.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); document.removeEventListener("scroll", dismiss, true); window.removeEventListener("resize", dismiss); };
  }, [onClose]);
  const root = document.querySelector(".aero-home");
  if (!root) return null;
  return createPortal(<div ref={menu} className="message-context-menu" role="menu" aria-label="Действия с сообщением" style={{ left: position?.left ?? x, top: position?.top ?? y, visibility: position ? "visible" : "hidden" }}>
    <button type="button" role="menuitem" disabled={busy} onClick={onEdit}><Icon name="pencil" size={15} /> Редактировать</button>
    <button type="button" role="menuitem" disabled={busy} onClick={onDelete}><Icon name="trash" size={15} /> Удалить</button>
  </div>, root);
}

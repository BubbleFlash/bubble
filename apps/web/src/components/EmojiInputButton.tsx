import { lazy, Suspense, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../store/auth";

const EmojiPicker = lazy(() => import("./EmojiPicker"));

export function EmojiIcon() {
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm3.5-9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm-7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM12 17.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5Z" /></svg>;
}

export default function EmojiInputButton({ field, value, onChange, maxLength, disabled }: {
  field: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  disabled?: boolean;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const button = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = button.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(440, window.innerWidth - 16);
      const height = Math.min(450, window.innerHeight * .55);
      const top = rect.top >= height + 8 ? rect.top - height - 4 : Math.min(rect.bottom + 4, window.innerHeight - height - 8);
      setPosition({ left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), top: Math.max(8, top), width, height });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !popover.current?.contains(event.target) && !button.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); button.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  const insert = (emoji: string) => {
    const input = field.current;
    if (!input) return false;
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? start;
    const next = value.slice(0, start) + emoji + value.slice(end);
    if (next.length > maxLength) return false;
    onChange(next);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + emoji.length, start + emoji.length); });
    return true;
  };
  const root = button.current?.closest(".aero-home");
  return <>
    <button ref={button} type="button" className="emoji-input-button" disabled={disabled} aria-label="Выбрать эмодзи" title="Выбрать эмодзи" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((current) => !current)}><EmojiIcon /></button>
    {open && user && root && createPortal(<div ref={popover} className="emoji-input-popover" style={position}>
      <Suspense fallback={<div className="chat-emoji aero-panel" role="status">Загрузка эмодзи…</div>}>
        <EmojiPicker id={id} userId={user.id} onSelect={insert} onClose={() => { setOpen(false); button.current?.focus(); }} />
      </Suspense>
    </div>, root)}
  </>;
}

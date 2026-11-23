import { useRef, type RefObject } from "react";

export default function TextareaResizeHandle({ field, disabled }: {
  field: RefObject<HTMLTextAreaElement>;
  disabled: boolean;
}) {
  const drag = useRef<{ pointerId: number; startY: number; height: number } | null>(null);

  return <button
    type="button"
    className="post-textarea-resize"
    aria-label="Изменить высоту поля записи"
    disabled={disabled}
    onPointerDown={(event) => {
      const textarea = field.current;
      if (!textarea || !event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      drag.current = { pointerId: event.pointerId, startY: event.clientY, height: textarea.getBoundingClientRect().height };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => {
      const start = drag.current;
      const textarea = field.current;
      if (start?.pointerId !== event.pointerId || !textarea) return;
      textarea.style.height = `${Math.max(0, start.height + event.clientY - start.startY)}px`;
    }}
    onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={(event) => {
      const textarea = field.current;
      if (!textarea || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 20 : -20;
      textarea.style.height = `${Math.max(0, textarea.getBoundingClientRect().height + step)}px`;
    }}
  />;
}

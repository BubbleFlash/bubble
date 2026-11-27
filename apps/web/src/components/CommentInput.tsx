import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ClipboardEventHandler } from "react";
import Icon from "./Icon";
import EmojiInputButton from "./EmojiInputButton";
import { COMMENT_MAX_LENGTH } from "@commune/shared";
import { createPortal } from "react-dom";
import SendButton from "./SendButton";
import { usesMobileKeyboard } from "../lib/mobileKeyboard";

export default forwardRef<HTMLTextAreaElement, { value: string; onChange: (value: string) => void; pending: boolean; replying?: boolean; canSubmit: boolean; onImage: () => void; onMusic: () => void; onPaste: ClipboardEventHandler<HTMLTextAreaElement> }>(
  function CommentInput({ value, onChange, pending, replying, canSubmit, onImage, onMusic, onPaste }, ref) {
    const label = replying ? "Написать ответ" : "Написать комментарий";
    const mobileKeyboard = usesMobileKeyboard();
    const field = useRef<HTMLTextAreaElement>(null);
    const sizer = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
      const input = field.current!;
      // ResizeObserver reports a change only after a line wraps or is removed.
      let lastHeight = 0;
      const observer = new ResizeObserver(([entry]) => {
        const height = entry?.borderBoxSize[0]?.blockSize;
        if (!height || height === lastHeight) return;
        lastHeight = height;
        input.style.setProperty("--comment-content-height", `${height}px`);
      });
      observer.observe(sizer.current!, { box: "border-box" });
      return () => observer.disconnect();
    }, []);
    const [open, setOpen] = useState(false);
    const button = useRef<HTMLButtonElement>(null);
    const menu = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ right: 0, bottom: 0 });
    useEffect(() => {
      if (!open) return;
      const close = (event: PointerEvent) => { if (event.target instanceof Node && !menu.current?.contains(event.target) && !button.current?.contains(event.target)) setOpen(false); };
      const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
      const scroll = () => setOpen(false);
      document.addEventListener("pointerdown", close);
      document.addEventListener("keydown", escape);
      window.addEventListener("scroll", scroll, true);
      window.addEventListener("resize", scroll);
      return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); window.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", scroll); };
    }, [open]);
    useImperativeHandle(ref, () => field.current!);
    const portalRoot = open ? button.current?.closest(".aero-home") : null;
    return (
      <div className="aero-comment-input">
        <div className="emoji-input-field comment-input-field">
          <div ref={sizer} aria-hidden="true" className="comment-input-sizer">{value + "\u200b"}</div>
          <textarea
            ref={field}
            aria-label={label}
            placeholder="Коментарий..."
            value={value}
            onChange={(event) => onChange(event.target.value)}
            maxLength={COMMENT_MAX_LENGTH}
            rows={1}
            enterKeyHint={mobileKeyboard ? "enter" : "send"}
            onPaste={onPaste}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || mobileKeyboard) return;
              event.preventDefault();
              if (!pending && canSubmit) event.currentTarget.form?.requestSubmit();
            }}
          />
          <EmojiInputButton field={field} value={value} onChange={onChange} maxLength={COMMENT_MAX_LENGTH} disabled={pending} />
          <button ref={button} type="button" className="comment-attachment-toggle" disabled={pending} aria-label="Вложения" aria-expanded={open} onClick={() => { const rect = button.current!.getBoundingClientRect(); setPosition({ right: Math.max(4, window.innerWidth - rect.right), bottom: window.innerHeight - rect.top + 4 }); setOpen((value) => !value); }}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" /></svg></button>
          {portalRoot && createPortal(
            <div ref={menu} className="chat-attachments__menu comment-attachment-menu" style={{ right: position.right, bottom: position.bottom }}>
              <button type="button" onClick={() => { setOpen(false); onImage(); }}><Icon name="image" size={18} />Фото</button>
              <button type="button" onClick={() => { setOpen(false); onMusic(); }}><Icon name="music" size={18} />Музыка</button>
            </div>,
            portalRoot,
          )}
        </div>
        <SendButton disabled={pending || !canSubmit} pending={pending} />
      </div>
    );
  },
);

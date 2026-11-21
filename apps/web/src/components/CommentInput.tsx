import { forwardRef, useImperativeHandle, useRef } from "react";
import Icon from "./Icon";
import EmojiInputButton from "./EmojiInputButton";
import { COMMENT_MAX_LENGTH } from "@commune/shared";

export default forwardRef<HTMLInputElement, { value: string; onChange: (value: string) => void; pending: boolean; replying?: boolean }>(
  function CommentInput({ value, onChange, pending, replying }, ref) {
    const label = replying ? "Написать ответ" : "Написать комментарий";
    const field = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => field.current!);
    return (
      <div className="aero-comment-input">
        <div className="emoji-input-field"><input ref={field} aria-label={label} placeholder={label} value={value} onChange={(e) => onChange(e.target.value)} maxLength={COMMENT_MAX_LENGTH} />
          <EmojiInputButton field={field} value={value} onChange={onChange} maxLength={COMMENT_MAX_LENGTH} disabled={pending} />
        </div>
        <span className="aero-comment-photo-hint" title="Прикрепление фотографий появится позже"><button type="button" className="btn aero-comment-photo" disabled aria-label="Прикрепление фотографий появится позже"><Icon name="image" size={18} /></button></span>
        <button className="btn" disabled={pending || !value.trim()}>{pending ? "Отправка…" : "Отправить"}</button>
      </div>
    );
  },
);

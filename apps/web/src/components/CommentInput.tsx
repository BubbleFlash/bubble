import { forwardRef, useImperativeHandle, useRef } from "react";
import Icon from "./Icon";
import EmojiInputButton from "./EmojiInputButton";

export default forwardRef<HTMLInputElement, { value: string; onChange: (value: string) => void; pending: boolean; replying?: boolean }>(
  function CommentInput({ value, onChange, pending, replying }, ref) {
    const label = replying ? "Написать ответ" : "Написать комментарий";
    const field = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => field.current!);
    return (
      <div className="aero-comment-input">
        <div className="emoji-input-field"><input ref={field} aria-label={label} placeholder={label} value={value} onChange={(e) => onChange(e.target.value)} maxLength={300} />
          <EmojiInputButton field={field} value={value} onChange={onChange} maxLength={300} disabled={pending} />
        </div>
        <span className="aero-comment-photo-hint" title="Прикрепление фотографий появится позже"><button type="button" className="btn aero-comment-photo" disabled aria-label="Прикрепление фотографий появится позже"><Icon name="image" size={18} /></button></span>
        <button className="btn" disabled={pending || !value.trim()}>{pending ? "Отправка…" : "Отправить"}</button>
      </div>
    );
  },
);

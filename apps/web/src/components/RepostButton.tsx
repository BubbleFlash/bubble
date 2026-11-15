import { useRef, useState } from "react";
import type { RepostSource } from "@commune/shared";
import { useAuth } from "../store/auth";
import { pluralRu } from "../lib/plural";
import Icon from "./Icon";
import RepostDialog from "./RepostDialog";

export default function RepostButton({ source, count }: { source: RepostSource; count?: number }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  if (!user) return null;

  const label = count === undefined
    ? "Поделиться комментарием"
    : `Поделиться записью, ${count} ${pluralRu(count, "репост", "репоста", "репостов")}`;
  function close() {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  }
  return (
    <>
      <button
        type="button"
        ref={trigger}
        className="btn btn-ghost repost-button"
        aria-label={label}
        aria-haspopup="dialog"
        title={count === undefined ? label : "Поделиться записью"}
        onClick={() => { setSuccess(""); setOpen(true); }}
      >
        <Icon name="repost" size={19} />
        {count !== undefined && <span>{count}</span>}
      </button>
      {success && <span className="repost-success" role="status">{success}</span>}
      {open && <RepostDialog source={source} onClose={close} onSuccess={(message) => {
        setSuccess(message);
        close();
      }} />}
    </>
  );
}

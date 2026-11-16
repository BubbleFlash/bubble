import { useEffect, useId, useRef } from "react";
import { useReportComment } from "../hooks/useModeration";
import AeroTitlebar from "./AeroTitlebar";
import { ReportFields } from "./ReportForm";
import { useDialogBackdrop } from "../hooks/useDialogBackdrop";

export default function CommentReportDialog({ postId, commentId, trigger, onClose }: {
  postId: string;
  commentId: string;
  trigger: HTMLButtonElement;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const report = useReportComment(postId, commentId);
  const backdrop = useDialogBackdrop(() => { if (!report.isPending) onClose(); });
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    element.querySelector("select")?.focus();
    return () => { element.close(); if (trigger.isConnected) trigger.focus({ preventScroll: true }); };
  }, [trigger]);
  return <dialog ref={dialog} {...backdrop} className="aero-dialog comment-report-dialog" aria-labelledby={title} onCancel={(event) => { event.preventDefault(); if (!report.isPending) onClose(); }}>
    <AeroTitlebar onClose={report.isPending ? undefined : onClose}><h2 id={title}>Жалоба на комментарий</h2></AeroTitlebar>
    <div className="aero-dialog__body"><ReportFields report={report} subject="комментарий" onClose={onClose} /></div>
  </dialog>;
}

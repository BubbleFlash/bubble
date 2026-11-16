import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { CreateReportInput } from "@commune/shared";
import { api } from "../lib/api";
import { useAuth } from "../store/auth";
import { ReportFields } from "./ReportForm";

export default function ReportComment({
  postId,
  commentId,
  authorId,
}: {
  postId: string;
  commentId: string;
  authorId: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const report = useMutation({
    mutationFn: (body: CreateReportInput) =>
      api("/posts/" + postId + "/comments/" + commentId + "/report", { method: "POST", body }),
  });
  if (!user || user.id === authorId) return null;
  return open ? (
    <ReportFields
      report={report}
      onClose={() => {
        setOpen(false);
        report.reset();
      }}
      subject="комментарий"
    />
  ) : (
    <button type="button" className="link-btn" onClick={() => setOpen(true)}>
      Пожаловаться
    </button>
  );
}

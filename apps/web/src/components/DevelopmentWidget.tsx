import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../lib/api";

type Latest = { post: { id: string; content: string; truncated: boolean; createdAt: string } | null };

export default function DevelopmentWidget() {
  const location = useLocation();
  const previousLocation = useRef(location.key);
  const { data, isError, refetch } = useQuery({ queryKey: ["development-widget"], queryFn: () => api<Latest>("/development-widget"), staleTime: 0, refetchInterval: 60_000 });
  useEffect(() => {
    if (previousLocation.current !== location.key) {
      previousLocation.current = location.key;
      void refetch();
    }
  }, [location.key, refetch]);
  const post = isError ? null : data?.post;
  return <section className="aero-widget"><strong>Дневник разработки</strong>
    {post ? <div className="development-widget__body">
      <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleDateString("ru-RU")}</time>
      <p>{post.content || "Новая публикация"}{post.truncated && "…"}</p>
      <Link to={`/posts/${post.id}`}>Читать полностью</Link>
    </div> : <p>Здесь будут новости разработки Bubble.</p>}
  </section>;
}

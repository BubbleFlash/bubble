import { pluralRu } from "../lib/plural";
import { Link, useParams } from "react-router-dom";
import { CardsSkeleton } from "../components/Skeleton";
import Composer from "../components/Composer";
import PostList from "../components/PostList";
import { useCommunity, useCommunityPosts, useMembership } from "../hooks/useCommunities";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useUploadImage } from "../hooks/useUpload";
import { validateImage } from "../lib/images";
import Avatar from "../components/Avatar";
import ProfileAction from "../components/ProfileAction";
import type { CommunityDTO } from "@commune/shared";

export default function CommunityPage() {
  const { slug = "" } = useParams();
  const community = useCommunity(slug);
  const posts = useCommunityPosts(slug);
  const { join, leave } = useMembership(slug);
  const qc = useQueryClient();
  const upload = useUploadImage("avatar");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const update = useMutation({
    mutationFn: () => api<CommunityDTO>(`/communities/${slug}`, { method: "PATCH", body: { name, description, avatarUrl } }),
    onSuccess: () => {
      setEditing(false);
      for (const key of [["community", slug], ["communities"], ["feed"], ["post"], ["search"]]) void qc.invalidateQueries({ queryKey: key });
    },
  });

  if (community.isLoading) return <CardsSkeleton count={2} />;
  if (community.isError || !community.data) {
    return (
      <p className="error center">

        Группа не найдена. <Link to="/communities">Смотреть группы</Link>
      </p>
    );
  }

  const c = community.data;
  const busy = join.isPending || leave.isPending;

  return (
    <>
      <Link to="/communities" className="muted">

        ← Все группы
      </Link>
      <section className="card profile community-head">
        <div className="profile-top">
          <div className="profile-id">
            <Avatar username={c.slug} displayName={c.name} url={editing ? avatarUrl : c.avatarUrl} size={72} preview />
            <div>
            {editing ? <input aria-label="Название группы" form="community-edit" value={name} required minLength={3} maxLength={40} onChange={(event) => setName(event.target.value)} /> : <h1 className="profile-name">{c.name}</h1>}
            <p className="muted">
              c/{c.slug} · {c.memberCount} {pluralRu(c.memberCount, "участник", "участника", "участников")}
              {c.myRole === "owner" && " · Вы владелец"}
            </p>
            </div>
          </div>
          {c.myRole === "owner" && !editing && <ProfileAction icon="edit" label="Редактировать группу" onClick={() => { setName(c.name); setDescription(c.description); setAvatarUrl(c.avatarUrl ?? null); setPhotoError(""); update.reset(); setEditing(true); }} />}
          {c.myRole !== "owner" &&
            (c.joinedByMe ? (
              <button className="btn btn-outline" disabled={busy} onClick={() => leave.mutate()}>

                Вы участник ✓
              </button>
            ) : (
              <button className="btn" disabled={busy} onClick={() => join.mutate()}>

                Вступить
              </button>
            ))}
        </div>
        {editing && <div className="row">
          <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const error = validateImage(file);
            if (error) { setPhotoError(error); return; }
            setPhotoError("");
            upload.mutate(file, { onSuccess: ({ url }) => setAvatarUrl(url), onError: (error) => setPhotoError(error.message) });
          }} />
          <ProfileAction icon="photo_camera" label="Изменить фото" onClick={() => fileRef.current?.click()} disabled={upload.isPending || update.isPending} />
          {avatarUrl && <ProfileAction icon="delete" label="Удалить фото" className="btn btn-ghost" onClick={() => setAvatarUrl(null)} disabled={upload.isPending || update.isPending} />}
          {upload.isPending && <span role="status">Загрузка…</span>}
        </div>}
        {editing ? <form id="community-edit" className="profile-edit" onSubmit={(event) => { event.preventDefault(); update.mutate(); }}>
          <textarea aria-label="Описание группы" placeholder="Расскажите о группе" rows={3} value={description} maxLength={280} onChange={(event) => setDescription(event.target.value)} />
          {photoError && <p className="error" role="alert">{photoError}</p>}
          {update.error && <p className="error" role="alert">{update.error.message}</p>}
          <div className="composer-footer"><span className="muted">{description.length}/280</span><span className="row">
            <ProfileAction icon="close" label="Закрыть редактирование" className="btn btn-ghost" onClick={() => setEditing(false)} />
            <ProfileAction icon="check" label="Сохранить группу" className="btn" type="submit" disabled={update.isPending || upload.isPending || name.trim().length < 3} />
          </span></div>
        </form> : <p className="profile-bio">{c.description}</p>}
        {(join.isError || leave.isError) && (
          <p className="error">{(join.error ?? leave.error)?.message}</p>
        )}
      </section>

      {c.joinedByMe ? (
        <Composer communitySlug={c.slug} />
      ) : (
        <p className="muted center">Вступите в группу, чтобы публиковать записи.</p>
      )}
      <PostList query={posts} emptyMessage="Записей пока нет. Начните обсуждение." />
    </>
  );
}

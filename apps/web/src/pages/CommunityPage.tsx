import { pluralRu } from "../lib/plural";
import { Link, useParams } from "react-router-dom";
import { CardsSkeleton } from "../components/Skeleton";
import Composer from "../components/Composer";
import PostList from "../components/PostList";
import { refreshCommunity, useCommunity, useCommunityMembers, useCommunityPosts, useMembership } from "../hooks/useCommunities";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useUploadImage } from "../hooks/useUpload";
import { validateImage } from "../lib/images";
import Avatar from "../components/Avatar";
import ProfileAction from "../components/ProfileAction";
import CommunityManagement from "../components/CommunityManagement";
import { COMMUNITY_ROLES } from "../lib/communityRoles";
import type { CommunityDTO } from "@commune/shared";
import FeedMuteButton from "../components/FeedMuteButton";

export default function CommunityPage() {
  const { slug = "" } = useParams();
  return <CommunityView key={slug} slug={slug} />;
}

function CommunityView({ slug }: { slug: string }) {
  const community = useCommunity(slug);
  const team = useCommunityMembers(slug, "team", "", true);
  const posts = useCommunityPosts(slug);
  const { join, leave } = useMembership(slug);
  const qc = useQueryClient();
  const upload = useUploadImage("avatar");
  const [editing, setEditing] = useState(false);
  const [managing, setManaging] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const update = useMutation({
    mutationFn: () => api<CommunityDTO>(`/communities/${slug}`, { method: "PATCH", body: { name, description, avatarUrl } }),
    onSuccess: (updated) => {
      qc.setQueryData(["community", slug], updated);
      setEditing(false);
      void refreshCommunity(qc, slug);
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
  const showEdit = editing && c.actions.editAppearance;
  const canOpenManagement = c.actions.manageMembers;

  function editAppearance(community: CommunityDTO) {
    setManaging(false);
    setName(community.name);
    setDescription(community.description);
    setAvatarUrl(community.avatarUrl ?? null);
    setPhotoError("");
    update.reset();
    setEditing(true);
  }

  return (
    <>
      <Link to="/communities" className="muted">

        ← Все группы
      </Link>
      <section className="card profile community-head">
        <FeedMuteButton kind="communities" name={c.slug} />
        <div className="profile-top">
          <div className="profile-id">
            <Avatar username={c.slug} displayName={c.name} url={showEdit ? avatarUrl : c.avatarUrl} size={72} preview />
            <div>
              {showEdit ? <input aria-label="Название группы" form="community-edit" value={name} required minLength={3} maxLength={40} onChange={(event) => setName(event.target.value)} /> : <h1 className="profile-name">{c.name}</h1>}
              <p className="muted">
                c/{c.slug} · {c.memberCount} {pluralRu(c.memberCount, "участник", "участника", "участников")}
                {c.myRole && ` · ${COMMUNITY_ROLES[c.myRole]}`}
              </p>
            </div>
          </div>
          <div className="row community-head__actions">
            {c.actions.editAppearance && !showEdit && <ProfileAction icon="edit" label="Редактировать группу" onClick={() => editAppearance(c)} />}
            {canOpenManagement && <ProfileAction icon="settings" label="Управление группой" onClick={() => setManaging(true)} />}
            {c.myRole !== "owner" &&
              (c.joinedByMe ? (
                <ProfileAction icon="person_remove" label="Выйти из группы" disabled={busy} onClick={() => { if (window.confirm("Выйти из группы?")) leave.mutate(); }} />
              ) : (
                <ProfileAction icon="person_add" label="Вступить в группу" className="btn" disabled={busy} onClick={() => join.mutate()} />
              ))}
          </div>
        </div>
        {showEdit && <div className="row">
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
        {showEdit ? <form id="community-edit" className="profile-edit" onSubmit={(event) => { event.preventDefault(); update.mutate(); }}>
          <textarea aria-label="Описание группы" placeholder="Расскажите о группе" rows={3} value={description} maxLength={280} onChange={(event) => setDescription(event.target.value)} />
          {photoError && <p className="error" role="alert">{photoError}</p>}
          {update.error && <p className="error" role="alert">{update.error.message}</p>}
          <div className="composer-footer"><span className="muted">{description.length}/280</span><span className="row">
            <ProfileAction icon="close" label="Закрыть редактирование" className="btn btn-ghost" onClick={() => setEditing(false)} />
            <ProfileAction icon="check" label="Сохранить группу" className="btn" type="submit" disabled={update.isPending || upload.isPending || name.trim().length < 3} />
          </span></div>
        </form> : <p className="profile-bio">{c.description}</p>}
        <section className="profile-friends-preview" aria-label="Управляющие группы">
          <strong className="profile-friends-heading">Управляющие</strong>
          {team.isLoading && <p className="muted">Загрузка…</p>}
          {team.isError && <p className="error">Не удалось загрузить управляющих. <button className="btn btn-ghost" onClick={() => void team.refetch()}>Повторить</button></p>}
          <div className="community-team">
            {team.data?.pages.flatMap((page) => page.items).map((person) => <Link className="community-team__person" key={person.id} to={`/u/${person.username}`}>
              <Avatar username={person.username} displayName={person.displayName ?? undefined} url={person.avatarUrl} size={48} trackOnline />
              <span><strong>{person.displayName || person.username}</strong><small className="muted">{person.note || COMMUNITY_ROLES[person.role]}</small></span>
            </Link>)}
          </div>
          {team.hasNextPage && <button className="btn btn-ghost" onClick={() => void team.fetchNextPage()}>Показать ещё</button>}
        </section>
        {(join.isError || leave.isError) && (
          <p className="error">{(join.error ?? leave.error)?.message}</p>
        )}
      </section>
      {managing && canOpenManagement && <CommunityManagement community={c} onClose={() => setManaging(false)} onEditAppearance={() => editAppearance(c)} />}

      {c.actions.publish ? (
        <Composer communitySlug={c.slug} />
      ) : (
        <p className="muted center">{!c.joinedByMe && c.permissions.publish === "member"
          ? "Вступите в группу, чтобы публиковать записи."
          : "Ваша роль не позволяет публиковать записи в этой группе."}</p>
      )}
      <PostList query={posts} emptyMessage="Записей пока нет. Начните обсуждение." pinTarget={`/communities/${encodeURIComponent(slug)}`} />
    </>
  );
}

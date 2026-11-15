import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { displayNameOf, type CommunityDTO, type CommunityMemberDTO, type CommunityPermissions, type CommunityRole } from "@commune/shared";
import { refreshCommunity, useCommunityMembers } from "../hooks/useCommunities";
import { api } from "../lib/api";
import { COMMUNITY_ROLES } from "../lib/communityRoles";
import AeroTitlebar from "./AeroTitlebar";
import Avatar from "./Avatar";
import Icon from "./Icon";
import ProfileAction, { ProfileActionIcon } from "./ProfileAction";

type Section = "permissions" | "members" | "managers";
type MemberRole = Exclude<CommunityRole, "owner">;
type MemberAction =
  | { kind: "remove"; member: CommunityMemberDTO }
  | { kind: "transfer"; member: CommunityMemberDTO };

const SECTIONS = [
  { id: "permissions", label: "Права", icon: "shield" },
  { id: "members", label: "Участники", icon: "users" },
  { id: "managers", label: "Управляющие", icon: "settings" },
] as const;

const ROLE_OPTIONS = [
  ["member", "Все участники"],
  ["editor", "Редакторы и выше"],
  ["admin", "Администраторы и выше"],
  ["owner", "Только владелец"],
] as const;

const PERMISSION_FIELDS = [
  ["publish", "Публикация записей и репостов"],
  ["managePosts", "Редактирование и удаление записей"],
  ["editAppearance", "Название, описание и аватар"],
] as const;

function MemberDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    element?.showModal();
    element?.querySelector<HTMLElement>("input, .community-management__actions button")?.focus();
    return () => {
      element?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);
  return <dialog ref={dialog} className="aero-dialog community-member-dialog" aria-labelledby={titleId} onCancel={(event) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }}>
    <AeroTitlebar onClose={onClose} closeLabel="Закрыть окно"><h2 id={titleId}>{title}</h2></AeroTitlebar>
    <div className="aero-dialog__body">{children}</div>
  </dialog>;
}

function RoleMenu({ member, disabled, onChange }: {
  member: CommunityMemberDTO;
  disabled: boolean;
  onChange: (role: MemberRole) => void;
}) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const label = member.role === "member" ? "Назначить роль" : "Изменить роль";
  useEffect(() => {
    if (!position) return;
    menu.current?.setAttribute("popover", "manual");
    menu.current?.showPopover();
    const dismiss = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setPosition(null);
    };
    const closeOnScroll = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) setPosition(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setPosition(null);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("scroll", closeOnScroll, true);
    document.addEventListener("keydown", closeOnEscape, true);
    const closeOnResize = () => setPosition(null);
    window.addEventListener("resize", closeOnResize);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("scroll", closeOnScroll, true);
      document.removeEventListener("keydown", closeOnEscape, true);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [position]);
  const modal = button.current?.closest("dialog");
  return <span className="community-role-menu">
    <button ref={button} type="button" className="aero-button" aria-label={`${label} @${member.username}`} aria-expanded={Boolean(position)} aria-controls={id} disabled={disabled} onClick={() => {
      if (position) { setPosition(null); return; }
      const rect = button.current!.getBoundingClientRect();
      const menuHeight = 120;
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 158)),
        top: rect.bottom + menuHeight + 8 <= window.innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4),
      });
    }}>
      <ProfileActionIcon icon="manage_accounts" />
      <span className="profile-action-tooltip" aria-hidden="true">{label}</span>
    </button>
    {position && modal && createPortal(<div ref={menu} id={id} className="community-role-menu__options" style={position} aria-label={label}>
      {(["member", "editor", "admin"] as MemberRole[]).map((role) => <button type="button" key={role} disabled={disabled || role === member.role} onClick={() => {
        setPosition(null);
        onChange(role);
        button.current?.focus();
      }}>{COMMUNITY_ROLES[role]}</button>)}
    </div>, modal)}
  </span>;
}

function CommunityPermissionsForm({ community, onEditAppearance }: {
  community: CommunityDTO;
  onEditAppearance: () => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<CommunityPermissions>(community.permissions);
  const editable = community.myRole === "owner";
  const save = useMutation({
    mutationFn: () => api<CommunityDTO>(`/communities/${community.slug}/permissions`, { method: "PUT", body: draft }),
    onSuccess: (updated) => {
      qc.setQueryData(["community", community.slug], updated);
      void refreshCommunity(qc, community.slug);
    },
  });
  const dirty = PERMISSION_FIELDS.some(([field]) => draft[field] !== community.permissions[field]);
  return (
    <form className="community-management__permissions" onSubmit={(event) => {
      event.preventDefault();
      if (dirty && editable) save.mutate();
    }}>
      <div className="community-management__fields">
        {PERMISSION_FIELDS.map(([field, label]) => (
          <label key={field}>
            {label}
            <select className="aero-input" value={editable ? draft[field] : community.permissions[field]} disabled={!editable || save.isPending} onChange={(event) => {
              save.reset();
              setDraft({ ...draft, [field]: event.target.value as CommunityRole });
            }}>
              {ROLE_OPTIONS.map(([role, name]) => <option key={role} value={role}>{name}</option>)}
            </select>
          </label>
        ))}
      </div>
      <p className="muted">Если выбран доступ для всех участников, участники могут изменять только свои записи.</p>
      {save.error && <p className="error" role="alert">{save.error.message}</p>}
      {save.isSuccess && !dirty && <p role="status">Права сохранены.</p>}
      <div className="community-management__actions">
        {community.actions.editAppearance && <button className="aero-button" type="button" disabled={save.isPending} onClick={onEditAppearance}>Редактировать оформление</button>}
        {editable && <button className="aero-button" disabled={!dirty || save.isPending}>{save.isPending ? "Сохранение…" : "Сохранить права"}</button>}
      </div>
    </form>
  );
}

function MemberList({ community, scope, onTransferred }: {
  community: CommunityDTO;
  scope: "members" | "managers";
  onTransferred: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<MemberAction | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [noteMember, setNoteMember] = useState<CommunityMemberDTO | null>(null);
  const [note, setNote] = useState("");
  const query = useCommunityMembers(community.slug, scope, search, community.actions.manageMembers);
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  const owner = community.myRole === "owner";
  const base = `/communities/${community.slug}`;
  const change = useMutation({
    mutationFn: async (input: MemberAction | { kind: "role"; member: CommunityMemberDTO; role: MemberRole } | { kind: "note"; member: CommunityMemberDTO; note: string } | { kind: "visibility"; member: CommunityMemberDTO; visible: boolean }) => {
      const url = `${base}/members/${input.member.id}`;
      if (input.kind === "role") return api<void>(`${url}/role`, { method: "PUT", body: { role: input.role } });
      if (input.kind === "note") return api<void>(`${url}/note`, { method: "PUT", body: { note: input.note } });
      if (input.kind === "visibility") return api<void>(`${url}/team-visibility`, { method: "PUT", body: { visible: input.visible } });
      if (input.kind === "remove") return api<void>(url, { method: "DELETE" });
      return api<CommunityDTO>(`${base}/transfer`, { method: "POST", body: { userId: input.member.id, confirmation } });
    },
    onSuccess: async (updated) => {
      if (updated) {
        qc.setQueryData(["community", community.slug], updated);
        onTransferred();
      }
      setAction(null);
      setNoteMember(null);
      setConfirmation("");
      await refreshCommunity(qc, community.slug);
    },
  });

  function selectAction(next: MemberAction | null) {
    change.reset();
    setAction(next);
    setConfirmation("");
  }

  return (
    <div className="community-management__people">
      <label className="community-management__search">
        <Icon name="search" size={18} />
        <input className="aero-input" type="search" aria-label="Поиск по имени или нику" placeholder="Имя или ник" value={search} maxLength={40} disabled={Boolean(action) || change.isPending} onChange={(event) => setSearch(event.target.value)} />
      </label>
      {action && (
        <MemberDialog title={action.kind === "transfer" ? "Передача владения" : "Исключение участника"} onClose={() => { if (!change.isPending) selectAction(null); }}>
        <form className="community-management__confirmation" onSubmit={(event) => {
          event.preventDefault();
          if (!change.isPending && (action.kind === "remove" || confirmation.trim() === community.slug)) change.mutate(action);
        }}>
          {action.kind === "transfer" ? (
            <>
              <h3>Передать владение @{action.member.username}?</h3>
              <p>Вы останетесь в группе с ролью участника.</p>
              <label>
                Введите адрес группы {community.slug} для подтверждения
                <input className="aero-input" value={confirmation} autoComplete="off" spellCheck={false} disabled={change.isPending} onChange={(event) => setConfirmation(event.target.value)} />
              </label>
            </>
          ) : <h3>Исключить @{action.member.username} из группы?</h3>}
          <div className="community-management__actions">
            <button className="aero-button" type="button" disabled={change.isPending} onClick={() => selectAction(null)}>Отмена</button>
            <button className="aero-button" disabled={change.isPending || (action.kind === "transfer" && confirmation.trim() !== community.slug)}>
              {action.kind === "transfer" ? "Подтвердить передачу" : "Подтвердить исключение"}
            </button>
          </div>
          {change.error && <p className="error" role="alert">{change.error.message}</p>}
        </form>
        </MemberDialog>
      )}
      {noteMember && <MemberDialog title="Подпись управляющего" onClose={() => { if (!change.isPending) { setNoteMember(null); change.reset(); } }}>
      <form className="community-management__confirmation" onSubmit={(event) => {
        event.preventDefault();
        change.mutate({ kind: "note", member: noteMember, note });
      }}>
        <label>Подпись для @{noteMember.username}
          <input className="aero-input" value={note} maxLength={100} onChange={(event) => setNote(event.target.value)} placeholder="Например, отвечает за мемы" />
        </label>
        <div className="community-management__actions">
          <button type="button" className="aero-button" disabled={change.isPending} onClick={() => { setNoteMember(null); change.reset(); }}>Отмена</button>
          <button className="aero-button" disabled={change.isPending}>Сохранить</button>
        </div>
        {change.error && <p className="error" role="alert">{change.error.message}</p>}
      </form></MemberDialog>}
      {!action && !noteMember && change.error && <p className="error" role="alert">{change.error.message}</p>}
      {query.isPending && <p role="status">Загрузка…</p>}
      {query.isError && <p className="error" role="alert">Не удалось загрузить список. <button className="aero-button" onClick={() => void query.refetch()}>Повторить</button></p>}
      {query.isSuccess && rows.length === 0 && <p className="muted">{search.trim() ? "Никого не нашли." : "Список пуст."}</p>}
      <ul className="community-management__list">
        {rows.map((member) => (
          <li key={member.id}>
            <div className="community-management__identity">
              <Avatar username={member.username} displayName={member.displayName ?? undefined} url={member.avatarUrl} size={36} />
              <span>
                <Link to={`/u/${member.username}`}>{displayNameOf(member)}</Link>
                <small className="muted">@{member.username} · {COMMUNITY_ROLES[member.role]}</small>
                {member.note && <small>{member.note}</small>}
              </span>
            </div>
            {(member.role !== "owner" || owner) && (
              <div className="community-management__member-actions">
                {owner && member.role !== "owner" && <RoleMenu member={member} disabled={change.isPending} onChange={(role) => change.mutate({ kind: "role", member, role })} />}
                {owner && member.role !== "member" && <ProfileAction className="aero-button" icon="edit" label={`Изменить подпись @${member.username}`} disabled={change.isPending || Boolean(action)} onClick={() => { change.reset(); setNoteMember(member); setNote(member.note ?? ""); }} />}
                {owner && member.role !== "member" && <ProfileAction className="aero-button" icon={member.visibleInTeam === false ? "visibility" : "visibility_off"} label={`${member.visibleInTeam === false ? "Показать в списке" : "Скрыть из списка"} @${member.username}`} disabled={change.isPending || Boolean(action)} onClick={() => change.mutate({ kind: "visibility", member, visible: member.visibleInTeam === false })} />}
                {owner && member.role !== "owner" && <ProfileAction className="aero-button" icon="swap_horiz" label={`Передать владение @${member.username}`} disabled={change.isPending || Boolean(action)} onClick={() => selectAction({ kind: "transfer", member })} />}
                {member.role !== "owner" && (owner || member.role === "member") && <ProfileAction className="aero-button" icon="person_remove" label={`Исключить @${member.username}`} disabled={change.isPending || Boolean(action)} onClick={() => selectAction({ kind: "remove", member })} />}
              </div>
            )}
          </li>
        ))}
      </ul>
      {query.hasNextPage && <button className="aero-button" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Показать ещё</button>}
    </div>
  );
}

export default function CommunityManagement({ community, onClose, onEditAppearance }: {
  community: CommunityDTO;
  onClose: () => void;
  onEditAppearance: () => void;
}) {
  const [section, setSection] = useState<Section>("permissions");
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);
  return (
    <dialog ref={dialog} className="aero-dialog community-management" aria-labelledby={id} onCancel={(event) => {
      event.preventDefault();
      onClose();
    }}>
      <AeroTitlebar onClose={onClose} closeLabel="Закрыть управление группой">
        <h2 id={id}>Управление группой</h2>
      </AeroTitlebar>
      <div className="aero-dialog__body community-management__body">
        <div className="community-management__summary">
          <Avatar username={community.slug} displayName={community.name} url={community.avatarUrl} size={40} />
          <div><strong>{community.name}</strong><small className="muted">c/{community.slug}</small></div>
        </div>
        <div className="tabs feed-tabs community-management__tabs" role="tablist" aria-label="Раздел управления">
          {SECTIONS.map(({ id: key, label }) => (
            <button key={key} type="button" role="tab" aria-selected={section === key} tabIndex={section === key ? 0 : -1} className={`tab ${section === key ? "active" : ""}`} onClick={() => setSection(key)} onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const index = SECTIONS.findIndex((item) => item.id === key);
              const next = (index + (event.key === "ArrowRight" ? 1 : -1) + SECTIONS.length) % SECTIONS.length;
              setSection(SECTIONS[next]!.id);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
            }}>{label}</button>
          ))}
        </div>
        <div className="community-management__content" role="tabpanel" aria-label={SECTIONS.find((item) => item.id === section)?.label} tabIndex={0}>
        {section === "permissions"
          ? <CommunityPermissionsForm community={community} onEditAppearance={onEditAppearance} />
          : <MemberList key={section} community={community} scope={section} onTransferred={onClose} />}
        </div>
      </div>
    </dialog>
  );
}

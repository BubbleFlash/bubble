import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import Avatar from "./Avatar";

type MutedUser = { id: string; username: string; displayName?: string; avatarUrl?: string | null };

export default function MutedUsersSettings() {
  const cache = useQueryClient();
  const users = useQuery({ queryKey: ["feed-mute", "users"], queryFn: () => api<MutedUser[]>("/feed-mutes/users") });
  const unmute = useMutation({
    mutationFn: (username: string) => api(`/feed-mutes/users/${encodeURIComponent(username)}`, { method: "DELETE" }),
    onSuccess: () => { void cache.invalidateQueries({ queryKey: ["feed-mute"] }); void cache.invalidateQueries({ queryKey: ["feed"] }); },
  });
  return <section className="card">
    <h2>Скрытые пользователи</h2>
    {users.isLoading && <p>Загрузка…</p>}
    {users.isError && <p className="error" role="alert">Не удалось загрузить список.</p>}
    {users.isSuccess && users.data.length === 0 && <p className="muted">Скрытых пользователей нет.</p>}
    {users.data?.map((person) => <div className="card person friend-list-row muted-user-row" key={person.id}>
      <Link className="friend-person-link" to={`/u/${encodeURIComponent(person.username)}`}><Avatar username={person.username} displayName={person.displayName} url={person.avatarUrl} size={44} trackOnline /><strong>{person.displayName || person.username}</strong></Link>
      <button type="button" className="btn btn-outline" disabled={unmute.isPending} onClick={() => unmute.mutate(person.username)}>Показывать записи</button>
    </div>)}
    {unmute.isError && <p className="error" role="alert">{unmute.error.message}</p>}
  </section>;
}

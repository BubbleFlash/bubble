import { useEffect, useId, useRef, useState } from "react";
import Avatar from "./Avatar";

export interface RepostOption {
  value: string;
  name: string;
  username: string;
  avatarUrl?: string | null;
  online?: boolean;
}

export default function RepostSelect({ label, options, value, onChange, searchable = false }: {
  label: string;
  options: RepostOption[];
  value: string;
  onChange: (value: string) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = options.find((item) => item.value === value);
  const matches = options.filter((item) => `${item.name} ${item.username}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) { setOpen(false); setSearch(""); }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  return <div className="repost-dialog__field repost-select" ref={root}>
    <span>{label}</span>
    <div className="repost-select__control">
      {selected && <Avatar username={selected.username} displayName={selected.name} url={selected.avatarUrl} size={28} preview online={selected.online} />}
      {searchable && open ? <input ref={input} aria-label={label} role="combobox" aria-expanded="true" aria-controls={listId} autoComplete="off" placeholder="Найти диалог" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); setOpen(false); setSearch(""); }
        if (event.key === "Enter" && matches.length) { event.preventDefault(); onChange(matches[0]!.value); setOpen(false); setSearch(""); }
        if (event.key === "ArrowDown") { event.preventDefault(); root.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus(); }
      }} /> : <button type="button" className="repost-select__trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} disabled={!options.length} onClick={() => {
        setOpen(!open);
        if (searchable && !open) requestAnimationFrame(() => input.current?.focus());
      }}>{selected?.name ?? `Выберите ${searchable ? "диалог" : "группу"}`}</button>}
      <span aria-hidden="true">▾</span>
    </div>
    {open && <div className="repost-select__list" id={listId} role="listbox" aria-label={label} onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); setOpen(false); setSearch(""); root.current?.querySelector<HTMLButtonElement>(".repost-select__trigger")?.focus(); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'));
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[Math.max(0, Math.min(buttons.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
      }
    }}>
      {matches.map((item) => <button type="button" role="option" aria-selected={item.value === value} key={item.value} onClick={() => { onChange(item.value); setOpen(false); setSearch(""); }}>
        <Avatar username={item.username} displayName={item.name} url={item.avatarUrl} size={28} preview online={item.online} />
        <span>{item.name}</span>
      </button>)}
      {!matches.length && <p className="muted">Ничего не найдено.</p>}
    </div>}
  </div>;
}

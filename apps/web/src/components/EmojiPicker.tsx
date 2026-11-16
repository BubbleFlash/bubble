import { useEffect, useRef, useState } from "react";
import data from "@emoji-mart/data/sets/15/twitter.json";
import type { EmojiMartData } from "@emoji-mart/data";
import emojiSheet from "emoji-datasource-twitter/img/twitter/sheets-clean/20.png";
import russianData from "emojibase-data/ru/data.json";
import Icon, { type IconName } from "./Icon";

// Twemoji artwork by Twitter, Inc. and contributors, CC BY 4.0.
const categories: Record<string, { label: string; icon: IconName; search: string }> = {
  people: { label: "Эмоции и люди", icon: "user", search: "лица эмоции люди жесты улыбка смех грусть" },
  nature: { label: "Животные и природа", icon: "sparkle", search: "природа животные кот кошка собака цветок" },
  foods: { label: "Еда и напитки", icon: "heart", search: "еда напитки яблоко пицца торт кофе чай" },
  activity: { label: "Активности", icon: "star", search: "спорт праздник игра" },
  places: { label: "Путешествия и места", icon: "image", search: "путешествия транспорт город" },
  objects: { label: "Предметы", icon: "music", search: "предметы музыка телефон" },
  symbols: { label: "Символы", icon: "plus", search: "символы сердце любовь пузыри" },
  flags: { label: "Флаги", icon: "flag", search: "флаг страна" },
};

const russian: Record<string, string> = {
  grinning: "улыбка", joy: "смех слезы", heart_eyes: "влюбленность", wink: "подмигивание",
  thinking_face: "размышление", cry: "грусть слезы", sob: "плач", sunglasses: "очки",
  "+1": "палец вверх лайк", "-1": "палец вниз", clap: "аплодисменты", wave: "привет пока",
  pray: "спасибо пожалуйста", muscle: "сила", cat: "кот кошка", dog: "собака",
  bear: "медведь", fox_face: "лиса", frog: "лягушка", butterfly: "бабочка",
  cherry_blossom: "цветок", rainbow: "радуга", ocean: "волна", sunny: "солнце",
  apple: "яблоко", strawberry: "клубника", lemon: "лимон", pizza: "пицца",
  hamburger: "бургер", sushi: "суши", cake: "торт", cookie: "печенье", coffee: "кофе",
  heart: "сердце любовь", blue_heart: "синее сердце", green_heart: "зеленое сердце",
  broken_heart: "разбитое сердце", sparkles: "блестки искры", star: "звезда",
  fire: "огонь", tada: "праздник", bubbles: "пузыри пузырь",
};

const normalize = (value: string) => value.toLocaleLowerCase("ru").replaceAll("ё", "е");
const russianByCode = new Map(russianData.map((emoji) => [
  emoji.hexcode.toLowerCase().replaceAll("-fe0f", ""),
  { label: emoji.label, search: [emoji.label, ...(emoji.tags ?? [])].join(" ") },
]));
const emojiData: EmojiMartData = data;
const groups = emojiData.categories.flatMap((category) => {
  const info = categories[category.id];
  if (!info) return [];
  const entries = category.emojis.flatMap((id) => {
    const emoji = emojiData.emojis[id];
    const value = emoji?.skins[0]?.native;
    // Keycaps require the emoji font to override ordinary digits in the input.
    if (!emoji || !value || value.includes("\u20e3")) return [];
    const { x, y } = emoji.skins[0]!;
    if (x === undefined || y === undefined) return [];
    const position = `${x / (emojiData.sheet.cols - 1) * 100}% ${y / (emojiData.sheet.rows - 1) * 100}%`;
    const translated = russianByCode.get(emoji.skins[0]!.unified.toLowerCase().replaceAll("-fe0f", ""));
    return [{ value, position, label: translated?.label ?? emoji.name, search: normalize([value, emoji.name, ...emoji.keywords, russian[id] ?? "", translated?.search ?? ""].join(" ")) }];
  });
  return [{ id: category.id, ...info, entries }];
});
const emojiByValue = new Map(groups.flatMap((group) => group.entries.map((entry) => [entry.value, entry] as const)));

function readUsage(key: string): Record<string, number> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!value || typeof value !== "object") return {};
    return Object.fromEntries(Object.entries(value).filter(([emoji, count]) =>
      emojiByValue.has(emoji) && Number.isSafeInteger(count) && count > 0));
  } catch {
    return {};
  }
}

export default function EmojiPicker({ id, userId, onSelect, onClose }: {
  id: string;
  userId: string;
  onSelect: (emoji: string) => boolean;
  onClose: () => void;
}) {
  const key = `bubble.emoji-usage.${userId}`;
  const [usage, setUsage] = useState(() => readUsage(key));
  const [active, setActive] = useState(() => Object.keys(usage).length ? "frequent" : "people");
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const sections = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) search.current?.focus({ preventScroll: true });
  }, []);

  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const frequent = Object.keys(usage).sort((a, b) => usage[b]! - usage[a]!).slice(0, 24)
    .flatMap((value) => { const entry = emojiByValue.get(value); return entry ? [entry] : []; });
  const visibleGroups = groups.map((group) => ({
    ...group,
    entries: terms.length ? group.entries.filter((entry) => terms.every((term) => entry.search.includes(term))) : group.entries,
  })).filter((group) => group.entries.length > 0);

  const select = (emoji: string) => {
    if (!onSelect(emoji)) return;
    const next = { ...usage, [emoji]: (usage[emoji] ?? 0) + 1 };
    setUsage(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Session-only usage. */ }
  };
  const scrollTo = (category: string) => {
    setQuery("");
    setActive(category);
    requestAnimationFrame(() => {
      const container = results.current;
      const target = sections.current.get(category);
      if (container && target) {
        const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        container.scrollTo({ top, behavior: reducedMotion ? "instant" : "smooth" });
      }
    });
  };
  const onScroll = () => {
    const container = results.current;
    if (!container || terms.length) return;
    let current = "people";
    for (const [category, section] of sections.current) {
      if (section.getBoundingClientRect().top <= container.getBoundingClientRect().top + 12) current = category;
    }
    setActive(current);
  };
  const renderEntries = (entries: typeof groups[number]["entries"]) => <div className="chat-emoji__grid">
    {entries.map((entry) => <button key={entry.value} type="button" className="btn btn-ghost" aria-label={entry.label} title={entry.label} onClick={() => select(entry.value)}><span aria-hidden="true" style={{ backgroundImage: `url(${emojiSheet})`, backgroundPosition: entry.position }} /></button>)}
  </div>;

  return (
    <section className="chat-emoji aero-panel" id={id} aria-label="Панель эмодзи">
      <header>
        <input ref={search} type="search" aria-label="Поиск эмодзи" placeholder="Поиск эмодзи" value={query} onChange={(event) => {
          setQuery(event.target.value);
          if (results.current) results.current.scrollTop = 0;
        }} />
        <button className="btn btn-ghost" type="button" onClick={onClose} aria-label="Закрыть эмодзи">×</button>
      </header>
      <nav className="chat-emoji__categories" aria-label="Категории эмодзи">
        <button type="button" className="btn btn-ghost" aria-label="Часто используемые" title="Часто используемые" aria-pressed={active === "frequent" && !terms.length} onClick={() => scrollTo("frequent")}><Icon name="star" size={18} /></button>
        {groups.map((group) => <button type="button" className="btn btn-ghost" key={group.id} aria-label={group.label} title={group.label} aria-pressed={active === group.id && !terms.length} onClick={() => scrollTo(group.id)}><Icon name={group.icon} size={18} /></button>)}
      </nav>
      <div ref={results} className="chat-emoji__results" aria-label="Эмодзи" onScroll={onScroll}>
        {!terms.length && <section ref={(node) => { if (node) sections.current.set("frequent", node); else sections.current.delete("frequent"); }}>
          <h3>Часто используемые</h3>
          {frequent.length ? renderEntries(frequent) : <p className="muted">Здесь появятся часто используемые эмодзи.</p>}
        </section>}
        {visibleGroups.map((group) => <section key={group.id} ref={(node) => { if (node) sections.current.set(group.id, node); else sections.current.delete(group.id); }}>
          <h3>{group.label}</h3>
          {renderEntries(group.entries)}
        </section>)}
        {!visibleGroups.length && <p className="muted" role="status">Эмодзи не найдены.</p>}
        <p className="chat-emoji__credit">Изображения <a href="https://github.com/jdecked/twemoji" target="_blank" rel="noopener noreferrer">Twemoji</a> от Twitter, Inc. и участников · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></p>
      </div>
    </section>
  );
}

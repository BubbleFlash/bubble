import { useLayoutEffect, useRef, useState } from "react";
import { LinkedText, LinkPreview, splitLinks } from "./LinkContent";
import { useNearViewport } from "../hooks/useNearViewport";
import type { FeedCardState } from "../lib/feedWindow";

const MAX_PREVIEW = 700;

const wrappingProperties = [
  "font-family", "font-size", "font-style", "font-weight", "font-stretch",
  "font-kerning", "font-feature-settings", "font-variation-settings", "font-optical-sizing",
  "line-height", "letter-spacing", "word-spacing", "white-space", "overflow-wrap",
  "word-break", "hyphens", "tab-size", "text-transform", "text-indent",
];

export default function PostText({ text, expandable = true, retained }: { text: string; expandable?: boolean; retained?: FeedCardState }) {
  const [expanded, setExpanded] = useState(retained?.expanded ?? false);
  const [preview, setPreview] = useState<{ text: string; value: string | null }>();
  const measured = useRef<{ text: string; width: number; typography: string; fontsReady: Promise<FontFaceSet> }>();
  const body = useRef<HTMLParagraphElement>(null);
  const { ref: textRegion, near } = useNearViewport<HTMLDivElement>("600px 0px", false);
  useLayoutEffect(() => {
    const element = body.current;
    if (!near || !element || !expandable || expanded || !element.parentElement) return;
    const parent = element.parentElement;
    const update = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width) return;
      const style = getComputedStyle(element);
      const typography = wrappingProperties.map(name => style.getPropertyValue(name)).join("\n");
      // FontFaceSet replaces its ready promise for each new load, including loads
      // that begin and finish while this paragraph is outside the observed area.
      const fontsReady = document.fonts.ready;
      const last = measured.current;
      if (last?.text === text && last.width === width && last.typography === typography && last.fontsReady === fontsReady) return;
      const save = (value: string | null) => {
        measured.current = { text, width, typography, fontsReady };
        setPreview(current => current?.text === text && current.value === value ? current : { text, value });
      };
      const characters = Array.from(text);
      const renderedLineHeight = Number.parseFloat(style.lineHeight);
      if (characters.length <= MAX_PREVIEW && !element.querySelector(".post-read-more")
        && Number.isFinite(renderedLineHeight) && height <= renderedLineHeight * 10 + 1) {
        save(null);
        return;
      }
      const parts = splitLinks(text).map(part => ({ ...part, chars: Array.from(part.value) }));
      const prefix = (limit: number) => {
        let remaining = limit;
        let result = "";
        for (const { value, href, chars } of parts) {
          if (chars.length <= remaining) { result += value; remaining -= chars.length; }
          else { if (!href) result += chars.slice(0, remaining).join(""); break; }
        }
        return result.trimEnd();
      };
      const probe = element.cloneNode(false) as HTMLParagraphElement;
      Object.assign(probe.style, { position: "absolute", visibility: "hidden", pointerEvents: "none", width: `${width}px`, height: "auto", margin: "0", inset: "0 auto auto -10000px" });
      parent.appendChild(probe);
      try {
        probe.textContent = "M";
        const lineHeight = probe.getBoundingClientRect().height;
        probe.textContent = text;
        if (characters.length <= MAX_PREVIEW && probe.getBoundingClientRect().height <= lineHeight * 10 + 1) {
          save(null);
          return;
        }
        let low = 0;
        let high = Math.min(MAX_PREVIEW, characters.length);
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          probe.textContent = prefix(middle) + "… ";
          const button = document.createElement("button");
          button.className = "link-btn post-read-more";
          button.textContent = "Читать далее…";
          probe.appendChild(button);
          if (probe.getBoundingClientRect().height <= lineHeight * 10 + 1) low = middle;
          else high = middle - 1;
        }
        save(prefix(low));
      } finally { probe.remove(); }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    const refreshFonts = () => {
      measured.current = undefined;
      update();
    };
    document.fonts.addEventListener("loadingdone", refreshFonts);
    document.fonts.addEventListener("loadingerror", refreshFonts);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", refreshFonts);
      document.fonts.removeEventListener("loadingerror", refreshFonts);
    };
  }, [text, expandable, expanded, near]);
  const cut = preview?.text === text ? preview.value : null;
  const shortened = expandable && !expanded && cut !== null;
  const visible = shortened ? cut : text;
  const showToggle = expandable && (expanded || shortened);
  return <>
    <div ref={textRegion} className="post-text__body">
      <p ref={body} className="post-body"><LinkedText text={visible} />{shortened && "…"}{showToggle && <> <button type="button" className="link-btn post-read-more" aria-expanded={expanded} onClick={() => { if (retained) retained.expanded = !expanded; setExpanded(!expanded); }}>{expanded ? "Свернуть" : "Читать далее…"}</button></>}</p>
    </div>
    <LinkPreview text={visible} />
  </>;
}

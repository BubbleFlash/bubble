import { useLayoutEffect, useRef, useState } from "react";
import { LinkedText, LinkPreview, splitLinks } from "./LinkContent";

const MAX_PREVIEW = 700;

export default function PostText({ text, expandable = true }: { text: string; expandable?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const body = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const element = body.current;
    if (!element || !expandable || expanded || !element.parentElement) return;
    const parent = element.parentElement;
    const characters = Array.from(text);
    const parts = splitLinks(text);
    const prefix = (limit: number) => {
      let remaining = limit;
      let result = "";
      for (const part of parts) {
        const chars = Array.from(part.value);
        if (chars.length <= remaining) { result += part.value; remaining -= chars.length; }
        else { if (!part.href) result += chars.slice(0, remaining).join(""); break; }
      }
      return result.trimEnd();
    };
    const update = () => {
      const width = element.getBoundingClientRect().width;
      if (!width) return;
      const probe = element.cloneNode(false) as HTMLParagraphElement;
      Object.assign(probe.style, { position: "absolute", visibility: "hidden", pointerEvents: "none", width: `${width}px`, height: "auto", margin: "0", inset: "0 auto auto -10000px" });
      parent.appendChild(probe);
      try {
        probe.textContent = "M";
        const lineHeight = probe.getBoundingClientRect().height;
        probe.textContent = text;
        if (characters.length <= MAX_PREVIEW && probe.getBoundingClientRect().height <= lineHeight * 10 + 1) {
          setPreview(null);
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
        setPreview(prefix(low));
      } finally { probe.remove(); }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    document.fonts.addEventListener("loadingdone", update);
    return () => { observer.disconnect(); document.fonts.removeEventListener("loadingdone", update); };
  }, [text, expandable, expanded]);
  const shortened = expandable && !expanded && preview !== null;
  const visible = shortened ? preview : text;
  const showToggle = expandable && (expanded || shortened);
  return <>
    <div className="post-text__body">
      <p ref={body} className="post-body"><LinkedText text={visible} />{shortened && "…"}{showToggle && <> <button type="button" className="link-btn post-read-more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Свернуть" : "Читать далее…"}</button></>}</p>
    </div>
    <LinkPreview text={visible} />
  </>;
}

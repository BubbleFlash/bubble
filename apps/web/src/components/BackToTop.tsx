import { useEffect, useRef, useState } from "react";

export default function BackToTop({ route }: { route: string }) {
  const scroller = useRef<Element | null>(null);
  const showing = useRef(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const main = document.getElementById("main");
    scroller.current = document.scrollingElement;
    const update = (event?: Event) => {
      if (event?.target === main) scroller.current = main;
      else if (!event || event.target === document || event.target === window) scroller.current = document.scrollingElement;
      else return;
      const next = (scroller.current?.scrollTop ?? 0) > 480;
      if (next !== showing.current) {
        showing.current = next;
        setVisible(next);
      }
    };
    update();
    window.addEventListener("scroll", update, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", update, true);
  }, [route]);
  if (!visible) return null;
  return <button type="button" className="btn back-to-top" aria-label="Вернуться к началу" title="Вернуться к началу" onClick={() => {
    document.getElementById("main")?.focus({ preventScroll: true });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.current?.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
  }}>↑</button>;
}

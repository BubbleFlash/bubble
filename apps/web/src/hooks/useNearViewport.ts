import { useEffect, useRef, useState } from "react";

/** Start optional requests near the viewport, then keep the content and its state. */
export function useNearViewport<T extends HTMLElement>(rootMargin = "600px 0px") {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (near || !ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setNear(true);
        observer.disconnect();
      },
      { rootMargin },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }); // A conditional preview can acquire its DOM node on a later render.
  return { ref, near };
}
